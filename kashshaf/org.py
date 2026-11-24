"""The agents as a company.

One chief, and departments that each do one part of checking a link. Every department has a leader (who
hands cases to free members) and members. A case moves from department to department:

    intake -> web (two views) -> content -> fingerprints -> domain -> ai (Claude) -> chief (verdict, block)

A department has a fixed number of members. When all of them are busy, the next case waits for one to be
free, so the numbers on the dashboard are the real capacity of each part of the system.
Discovery (Google, certificate logs, phishing feeds) is a department too; it finds the links that intake picks up.
"""
import random
import socket
import threading
import time
from collections import OrderedDict
from contextlib import contextmanager

# id, code, share of the members (after every department gets a leader and one member)
DEPARTMENTS = [
    ("discovery", "dsc", 0.07),
    ("intake", "int", 0.30),
    ("web", "web", 0.25),
    ("content", "cnt", 0.12),
    ("fingerprints", "fpr", 0.08),
    ("domain", "dom", 0.10),
    ("ai", "ai", 0.08),
]
CASE_STAGES = ["intake", "web", "content", "fingerprints", "domain", "ai", "chief"]
MIN_TOTAL = 1 + 2 * len(DEPARTMENTS)  # the chief, plus a leader and one member per department
MAX_TOTAL = 500


def allocate(total: int) -> tuple[int, dict[str, int]]:
    """Members per department (leaders and the chief not counted) for `total` agents."""
    total = max(MIN_TOTAL, min(int(total), MAX_TOTAL))
    spare = total - 1 - 2 * len(DEPARTMENTS)
    raw = {d: spare * w for d, _, w in DEPARTMENTS}
    out = {d: 1 + int(v) for d, v in raw.items()}
    left = total - 1 - len(DEPARTMENTS) - sum(out.values())
    for d in sorted(raw, key=lambda d: raw[d] - int(raw[d]), reverse=True)[:left]:
        out[d] += 1
    return total, out


def _agent(aid: str, dept: str, role: str, host: str) -> dict:
    return {"id": aid, "name": f"{aid}@{host}", "dept": dept, "role": role, "status": "idle", "job": None, "stage": None,
            "done": 0, "hits": 0, "since": None, "last_done": None, "retire": False, "last": None}


class Department:
    def __init__(self, did: str, code: str, host: str):
        self.id, self.code, self.host = did, code, host
        self.cond = threading.Condition()
        self.leader = _agent(f"{code}-lead", did, "leader", host)
        self.members: list[dict] = []
        self.next = 1
        self.waiting = 0
        self.done = 0

    def resize(self, n: int) -> list[dict]:
        """Hire or retire members. Busy members finish their case first. Returns the new members."""
        hired = []
        with self.cond:
            active = [m for m in self.members if not m["retire"]]
            for m in active[n:]:
                m["retire"] = True
            for _ in range(n - len(active)):
                m = _agent(f"{self.code}-{self.next:02d}", self.id, "member", self.host)
                self.next += 1
                self.members.append(m)
                hired.append(m)
            self.members = [m for m in self.members if not (m["retire"] and m["status"] != "working")]
            self.cond.notify_all()
        return hired

    @contextmanager
    def work(self, job: str | None, stage: str | None = None):
        """The leader hands the job to a free member; waits while every member is busy."""
        with self.cond:
            self.waiting += 1
            self.leader.update(status="working", job=job)
            while True:
                free = [m for m in self.members if m["status"] == "idle" and not m["retire"]]
                if free:
                    m = random.choice(free)  # spread the work over the team, not always the first member
                    break
                self.cond.wait(1)
            self.waiting -= 1
            self.leader["done"] += 1  # cases assigned
            if not self.waiting:
                self.leader.update(status="idle", job=None)
            m.update(status="working", job=job, stage=stage, since=time.time())
        try:
            yield m
        finally:
            with self.cond:
                m.update(status="idle", job=None, stage=None, since=None, last_done=time.time())
                m["done"] += 1
                self.done += 1
                if m["retire"]:
                    self.members.remove(m)
                self.cond.notify()

    def snapshot(self) -> dict:
        with self.cond:
            members = [dict(m) for m in self.members if not m["retire"]]
            return {"id": self.id, "leader": dict(self.leader), "members": members, "size": len(members) + 1,
                    "busy": sum(m["status"] == "working" for m in members), "waiting": self.waiting, "done": self.done}


class Org:
    def __init__(self, total: int):
        self.host = socket.gethostname().split(".")[0].lower()
        self.lock = threading.Lock()
        self.chief = _agent("chief", "chief", "chief", self.host)
        self.chief_active = 0
        self.departments = {d: Department(d, code, self.host) for d, code, _ in DEPARTMENTS}
        self.cases: "OrderedDict[int, dict]" = OrderedDict()
        self.total = MIN_TOTAL
        self.resize(total)

    def resize(self, total: int) -> list[dict]:
        """Spread `total` agents over the company. Returns the new intake members (the pool starts a thread for each)."""
        self.total, alloc = allocate(total)
        hired_intake = []
        for d, n in alloc.items():
            hired = self.departments[d].resize(n)
            if d == "intake":
                hired_intake = hired
        return hired_intake

    def dept(self, did: str) -> Department:
        return self.departments[did]

    # ---- cases -------------------------------------------------------------------
    def case_start(self, url_row: dict, intake_agent: str) -> dict:
        case = {"url_id": url_row["id"], "url": url_row["url"], "domain": url_row["domain"], "stages": {"intake": intake_agent},
                "current": "intake", "started": time.time(), "finished": None, "verdict": None, "skipped": []}
        with self.lock:
            self.cases[url_row["id"]] = case
            self.cases.move_to_end(url_row["id"])
            while len(self.cases) > 40:
                self.cases.popitem(last=False)
        return case

    @contextmanager
    def stage(self, case: dict | None, did: str):
        """Run one part of a case inside its department."""
        job = case["url"] if case else None
        with self.departments[did].work(job, did) as m:
            if case:
                case["current"] = did
                case["stages"][did] = m["name"]
            yield m

    def credit(self, case: dict | None, did: str) -> None:
        """The member who did this part of the case found something."""
        if not case or did not in case["stages"]:
            return
        name = case["stages"][did]
        for m in self.departments[did].members:
            if m["name"] == name:
                m["hits"] += 1

    @contextmanager
    def decide(self, case: dict | None):
        """The chief takes the final decision (verdict, blocking). Decisions run side by side; the chief signs each."""
        with self.lock:
            self.chief_active += 1
            self.chief.update(status="working", job=case["url"] if case else None, since=time.time())
        if case:
            case["current"] = "chief"
            case["stages"]["chief"] = self.chief["name"]
        try:
            yield self.chief
        finally:
            with self.lock:
                self.chief_active -= 1
                self.chief["done"] += 1
                self.chief["last_done"] = time.time()
                if not self.chief_active:
                    self.chief.update(status="idle", job=None, since=None)

    def find(self, name: str) -> dict | None:
        if name == self.chief["name"]:
            return self.chief
        for d in self.departments.values():
            if d.leader["name"] == name:
                return d.leader
            for m in d.members:
                if m["name"] == name:
                    return m
        return None

    def report(self, who, level: str, ar: str, en: str, url: str | None = None) -> None:
        """What an agent found in its step, shown above its desk in the live view.
        level: ok (nothing wrong), info (passed on), warn (needs a look), bad (fraud signal).
        `who` is the agent dict or its name, or a (case, department) pair for the member who did that part."""
        if isinstance(who, tuple):
            case, did = who
            who = (case or {}).get("stages", {}).get(did)
        a = self.find(who) if isinstance(who, str) else who
        if a is not None:
            a["last"] = {"level": level, "ar": ar, "en": en, "url": url, "at": time.time()}

    def case_finish(self, case: dict | None, verdict: str) -> None:
        if not case:
            return
        case.update(finished=time.time(), verdict=verdict, current=None)
        if verdict == "fraud":
            self.chief["hits"] += 1
        case["skipped"] = [s for s in CASE_STAGES if s not in case["stages"]]

    # ---- reads -------------------------------------------------------------------
    def agents(self) -> list[dict]:
        """Every agent, flat (the chief, then each department's leader and members)."""
        out = [dict(self.chief)]
        for d in self.departments.values():
            snap = d.snapshot()
            out.append(snap["leader"])
            out.extend(snap["members"])
        return out

    def snapshot(self) -> dict:
        with self.lock:
            cases = [dict(c, stages=dict(c["stages"])) for c in reversed(self.cases.values())][:20]
            chief = dict(self.chief)
        return {"chief": chief, "departments": [d.snapshot() for d in self.departments.values()], "cases": cases,
                "total": self.total, "min_total": MIN_TOTAL, "stages": CASE_STAGES, "now": time.time()}


_current: Org | None = None


def current() -> Org | None:
    return _current


def install(org: Org) -> None:
    global _current
    _current = org
