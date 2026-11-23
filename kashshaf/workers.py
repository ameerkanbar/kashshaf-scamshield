"""The agent pool: N workers that claim URLs from the database queue.

Claiming goes through the `claim_url` database function (FOR UPDATE SKIP
LOCKED), so you can run pools on several machines against one database and
no URL is inspected twice at the same time.
"""
import random
import socket
import threading
import time

from . import control, pipeline, store


class Pool:
    def __init__(self, size: int):
        self.lock = threading.Lock()
        self.wake = threading.Event()
        self.workers: dict[int, dict] = {}
        self.next_id = 1
        self.host = socket.gethostname().split(".")[0]
        self.resize(size)

    def resize(self, size: int) -> None:
        size = max(1, min(size, 500))
        with self.lock:
            active = [w for w in self.workers.values() if not w["stop"]]
            for w in active[size:]:
                w["stop"] = True
            for _ in range(size - len(active)):
                w = {"id": self.next_id, "name": f"agent-{self.next_id:03d}@{self.host}", "status": "idle",
                     "job": None, "done": 0, "hits": 0, "stop": False, "since": None, "last_done": None}
                self.workers[self.next_id] = w
                self.next_id += 1
                threading.Thread(target=self._run, args=(w,), daemon=True).start()

    def notify(self) -> None:
        """New work was queued: wake idle agents now instead of waiting for their next poll."""
        self.wake.set()

    def _run(self, w: dict) -> None:
        idle = 1.0
        while not w["stop"]:
            if not control.state["running"]:
                w.update(status="paused", job=None)
                self.wake.wait(2)
                continue
            try:
                row = store.claim(w["name"])
            except Exception as e:
                print(f"[{w['name']}] claim failed: {e}")
                row = None
            if row is None:
                w.update(status="idle", job=None)
                self.wake.wait(idle + random.random())
                self.wake.clear()
                idle = min(idle * 2, 15)
                continue
            idle = 1.0
            w.update(status="working", job=row["url"], since=time.time())
            try:
                if (pipeline.inspect(row, w["name"]) or {}).get("verdict") == "fraud":
                    w["hits"] += 1  # fraud this agent caught, for "most dangerous first"
            except Exception as e:
                print(f"[{w['name']}] {row['url']}: {type(e).__name__}: {e}")
                try:
                    store.mark_error(row, f"{type(e).__name__}: {e}")
                except Exception:
                    pass
            w["done"] += 1
            w.update(since=None, last_done=time.time())
        with self.lock:
            self.workers.pop(w["id"], None)

    def state(self) -> list[dict]:
        with self.lock:
            return [{k: w[k] for k in ("id", "name", "status", "job", "done", "hits", "since", "last_done")}
                    for w in self.workers.values() if not w["stop"]]
