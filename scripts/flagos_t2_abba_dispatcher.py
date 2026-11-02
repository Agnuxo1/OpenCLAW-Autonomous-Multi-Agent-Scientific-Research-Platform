#!/usr/bin/env python3
"""Schedule at most three independent, time-separated FlagOS plugin A/B trials.

Uses only the existing Server-IA contest queue and GPU broker. Automatically
stops at the existing 24-hour sprint boundary; stops on a failed benchmark.
No cloud model calls, no artificial GPU work and no terms acceptance.
"""
from __future__ import annotations
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import time

sys.path.insert(0, "/home/ai/servidor-ia")
import cola
import remote

ROOT = Path("/srv/openclaw/competition-state")
PROJECT = "flagos-s2"
MARKER = "scripts/flagos_plugin_abba.py"
SOURCE = Path("/home/ai/servidor-ia/jobs/8fbd553ad9f34c7e/work") / MARKER
PYTHON = "/home/ai/proyectos/flagos-t2/.venv/bin/python"
MIN_GAP_SECONDS = 2 * 3600
MAX_RUNS = 3
EXPERIMENT_LIMIT_SECONDS = 1700
SAFETY_MARGIN_SECONDS = 3600

def main() -> int:
    """Acquire a process lock, inspect JEV state and conditionally commit work."""
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (ROOT / "flagos-t2-abba.lock").open("a+") as lock:
        os.chmod(ROOT / "flagos-t2-abba.lock", 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        now = dt.datetime.now(dt.timezone.utc)
        status = {"time": now.isoformat(), "project": PROJECT}
        entry = cola.entry_for(PROJECT, cola.load())
        reason = None
        if not entry or entry.get("estado") not in ("EN CURSO", "AUDITORIA"):
            reason = "not_in_active_jev_research_phase"
        elif entry.get("vencido") or not entry.get("plazo_utc"):
            reason = "sprint_not_authorized"
        elif (cola.parse(entry["plazo_utc"]) - now).total_seconds() < (
            EXPERIMENT_LIMIT_SECONDS + SAFETY_MARGIN_SECONDS
        ):
            reason = "sprint_close_to_expiry"
        elif not SOURCE.is_file():
            reason = "verified_experiment_source_missing"
        jobs = sorted((job for job in remote.all_jobs() if
                       job.get("project") == PROJECT and
                       MARKER in job.get("command", [])),
                      key=lambda item: item.get("submitted_at", 0))
        status["known_trials"] = len(jobs)
        if not reason and len(jobs) >= MAX_RUNS:
            reason = "replication_count_reached"
        if not reason and any(j["state"] in ("staging", "queued", "running") for j in jobs):
            reason = "active_trial_exists"
        if not reason and any(j["state"] != "succeeded" for j in jobs):
            reason = "previous_trial_failed_independent_review_needed"
        if not reason and jobs:
            previous = jobs[-1]
            if now.timestamp() - previous.get("submitted_at", 0) < MIN_GAP_SECONDS:
                reason = "minimum_time_separation"
            previous_report = remote.jobdir(previous["id"]) / "work/results/report.json"
            try:
                outcome = json.loads(previous_report.read_text())
                if outcome["state"] != "complete":
                    reason = "previous_report_incomplete"
            except (OSError, ValueError, KeyError):
                reason = "previous_report_not_verified"
        if reason:
            status.update({"action": "skip", "reason": reason})
        else:
            job = remote.prepare({
                "project": PROJECT,
                "command": [PYTHON, MARKER],
                "gpus": 1, "vram_gib": 19, "ram_gib": 4,
            })
            destination = remote.jobdir(job["id"]) / "work" / MARKER
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(SOURCE, destination)
            job = remote.commit(job["id"])
            status.update({
                "action": "submitted_to_jev_broker",
                "job_id": job["id"], "ticket": job["ticket"],
                "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                "sprint_deadline_utc": entry["plazo_utc"],
            })
        temp = ROOT / "flagos-t2-abba-status.tmp"
        temp.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n")
        temp.chmod(0o600)
        temp.replace(ROOT / "flagos-t2-abba-status.json")
        print(json.dumps(status, ensure_ascii=False), flush=True)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
