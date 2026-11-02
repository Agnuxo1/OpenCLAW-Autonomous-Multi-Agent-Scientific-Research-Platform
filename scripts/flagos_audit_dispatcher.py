#!/usr/bin/env python3
"""Bounded FlagOS independent validation through existing Server-IA GPU lanes.

Run hourly. Enqueue only once every two hours, at most four additional
validations, never beyond the existing 24-hour JEV sprint boundary.
"""
from __future__ import annotations
import datetime as dt
import fcntl
import json
from pathlib import Path
import shutil
import sys
import time

sys.path.insert(0, "/home/ai/servidor-ia")
import cola
import remote

PROJECT = "flagos-track1-s2"
BASE = Path("/home/ai/servidor-ia/jobs/4ddc0b4c99f14f3a/work/benchmarks/bench_sigmoid_gate.py")
AUDIT = Path("/srv/openclaw/competition-code/flagos_cudagraph_audit.py")
STATE = Path("/srv/openclaw/competition-state")
PYTHON = "/home/ai/venvs/training/bin/python"
MAX_RERUNS = 4
INTERVAL_SECONDS = 7200

def main() -> int:
    """Check JEV project state and enqueue a controlled scientific replay."""
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE / "flagos-dispatch.lock").open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        now = dt.datetime.now(dt.timezone.utc)
        entry = cola.entry_for(PROJECT, cola.load())
        reason = None
        if not entry or entry["estado"] not in ("EN CURSO", "AUDITORIA"):
            reason = "no_active_scientific_sprint"
        elif entry.get("vencido") or cola.parse(entry["plazo_utc"]) <= now:
            reason = "expired_24_hour_window"
        elif not BASE.is_file() or not AUDIT.is_file():
            reason = "source_files_missing"
        jobs = sorted(
            (j for j in remote.all_jobs() if
             j.get("project") == PROJECT and
             "analysis/flagos_cudagraph_audit.py" in j.get("command", [])),
            key=lambda j: j.get("submitted_at", 0)
        )
        if not reason and len(jobs) > MAX_RERUNS:
            reason = "maximum_reruns_reached"
        if not reason and any(j.get("state") in ("queued", "running", "staging")
                              for j in jobs):
            reason = "job_already_active"
        if not reason and any(j.get("state") == "failed" for j in jobs):
            reason = "failed_experiment_needs_review"
        if not reason and jobs and now.timestamp() - jobs[-1].get("submitted_at", 0) < INTERVAL_SECONDS:
            reason = "replay_cooldown"
        result = {"checked_utc": now.isoformat(), "project": PROJECT,
                  "previous_audits": len(jobs)}
        if reason:
            result.update(status="not_dispatched", reason=reason)
        else:
            job = remote.prepare({
                "project": PROJECT,
                "command": [PYTHON, "analysis/flagos_cudagraph_audit.py"],
                "gpus": 1, "vram_gib": 2, "ram_gib": 2
            })
            work = remote.jobdir(job["id"]) / "work"
            (work / "benchmarks").mkdir(parents=True, exist_ok=True)
            (work / "analysis").mkdir(parents=True, exist_ok=True)
            shutil.copy2(BASE, work / "benchmarks/bench_sigmoid_gate.py")
            shutil.copy2(AUDIT, work / "analysis/flagos_cudagraph_audit.py")
            job = remote.commit(job["id"])
            result.update(status="queued", job_id=job["id"],
                          ticket=job["ticket"], sprint_deadline=entry["plazo_utc"])
        tmp = STATE / "flagos-dispatch-status.tmp"
        tmp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        tmp.chmod(0o600)
        tmp.replace(STATE / "flagos-dispatch-status.json")
        print(json.dumps(result, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
