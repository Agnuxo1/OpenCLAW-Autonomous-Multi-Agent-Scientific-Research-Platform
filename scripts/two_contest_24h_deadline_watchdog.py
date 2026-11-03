#!/usr/bin/env python3
"""Hard 24-hour JEV lease enforcement for two scientific GPU competitions.

Never extends a lease, submits to a competition or starts GPU tasks. At the
time limit it stops only the two known JEV-managed job units (whose command
matches a strict allowlist). Records every stop action to an auditable JSONL.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
import re
import subprocess
import sys

sys.path.insert(0, "/home/ai/servidor-ia")
import cola
import remote

ROOT = Path("/mnt/datos/competition-24h")
LOG = ROOT / "deadline_watchdog.jsonl"
EARLY_TERMINATION_SECONDS = 120
AUTHORIZED_RUNNERS = {
    "vcc2026-transfer": "/mnt/datos/competition-24h/vcc/run.py",
    "pdc2026": "/mnt/datos/competition-24h/pdc/run.py",
}
ALLOWED_JOB_STATES = {"running", "queued"}


def now() -> dt.datetime:
    """Use UTC for uncontested lease deadline comparisons."""
    return dt.datetime.now(dt.timezone.utc)


def record(entry: dict) -> None:
    """Append one durable stop-or-error audit record."""
    ROOT.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
        handle.flush()


def safe_unit(job: dict, runner: str) -> str:
    """Verify the original project command before targeting its systemd unit."""
    identifier = job.get("id", "")
    command = job.get("command") or []
    if not re.fullmatch("[a-f0-9]{16}", identifier):
        raise ValueError("Unsafe job identifier")
    if (len(command) < 2 or command[1] != runner
            or not command[0].startswith("/mnt/datos/competition-24h/")):
        raise ValueError("Worker command does not match the approved competition")
    return "servidor-ia-job-" + identifier + ".service"


def enforce() -> int:
    """Stop expired timeboxed contest tasks, never other JEV projects."""
    t = now()
    data = cola.load()
    for project, runner in AUTHORIZED_RUNNERS.items():
        entry = cola.entry_for(project, data)
        if not entry or not entry.get("plazo_utc"):
            continue
        deadline = dt.datetime.fromisoformat(
            entry["plazo_utc"].replace("Z", "+00:00")
        )
        remaining = (deadline - t).total_seconds()
        if remaining > EARLY_TERMINATION_SECONDS:
            continue
        for job in remote.all_jobs():
            if (job.get("project") != project
                    or job.get("state") not in ALLOWED_JOB_STATES):
                continue
            event = {
                "observed_utc": now().isoformat(),
                "project": project,
                "job_id": job.get("id"),
                "deadline_utc": deadline.isoformat(),
                "seconds_remaining_at_stop_request": remaining,
                "action": "STOP_APPROVED_BROKER_UNIT",
            }
            try:
                unit = safe_unit(job, runner)
                result = subprocess.run(
                    ["systemctl", "--user", "stop", unit],
                    capture_output=True, text=True, timeout=115,
                    check=False,
                )
                event["systemctl_exit"] = result.returncode
                event["unit"] = unit
            except (ValueError, OSError, subprocess.TimeoutExpired) as exc:
                event["action"] = "STOP_FAILED_REQUIRES_INSPECTION"
                event["error_class"] = type(exc).__name__
            record(event)
            print(json.dumps(event, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(enforce())
