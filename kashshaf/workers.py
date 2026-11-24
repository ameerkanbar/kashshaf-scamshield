"""The agent pool, organised as a company (see org.py).

The intake department's members are the worker threads: each claims a URL from the database queue with
the `claim_url` function (FOR UPDATE SKIP LOCKED), so pools on several machines never inspect the same URL
twice at once. The case then moves through the other departments in pipeline.inspect.
"""
import random
import threading
import time

from . import control, org, pipeline, store


class Pool:
    def __init__(self, size: int):
        self.wake = threading.Event()
        self.org = org.Org(size)
        org.install(self.org)
        for m in self.org.dept("intake").members:
            self._start(m)

    def _start(self, m: dict) -> None:
        threading.Thread(target=self._run, args=(m,), daemon=True, name=m["id"]).start()

    def resize(self, size: int) -> None:
        """Spread `size` agents over the departments (at least one leader and one member each)."""
        for m in self.org.resize(size):
            self._start(m)
        self.notify()

    def notify(self) -> None:
        """New work was queued: wake idle agents now instead of waiting for their next poll."""
        self.wake.set()

    def _run(self, m: dict) -> None:
        idle = 1.0
        intake = self.org.dept("intake")
        while not m["retire"]:
            if not control.state["running"]:
                m.update(status="paused", job=None)
                self.wake.wait(2)
                continue
            try:
                row = store.claim(m["name"])
            except Exception as e:
                print(f"[{m['name']}] claim failed: {e}")
                row = None
            if row is None:
                m.update(status="idle", job=None, stage=None)
                self.wake.wait(idle + random.random())
                self.wake.clear()
                idle = min(idle * 2, 15)
                continue
            idle = 1.0
            m.update(status="working", job=row["url"], stage="intake", since=time.time())
            intake.leader["done"] += 1
            try:
                if (pipeline.inspect(row, m["name"]) or {}).get("verdict") == "fraud":
                    m["hits"] += 1  # fraud found in this agent's case, for "most dangerous first"
            except Exception as e:
                print(f"[{m['name']}] {row['url']}: {type(e).__name__}: {e}")
                try:
                    store.mark_error(row, f"{type(e).__name__}: {e}")
                except Exception:
                    pass
            m["done"] += 1
            intake.done += 1
            m.update(status="idle", job=None, stage=None, since=None, last_done=time.time())
        with intake.cond:
            if m in intake.members:
                intake.members.remove(m)

    def state(self) -> list[dict]:
        return self.org.agents()
