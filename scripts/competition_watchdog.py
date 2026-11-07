#!/usr/bin/env python3
"""Unmetered OpenClaw competition watcher for Server-IA.

May run hourly without Anthropic credentials. It verifies persisted scout
freshness, supervisor gateway state and timer registration. Never submits jobs.
"""
from __future__ import annotations
import datetime as dt
import json
import pathlib
import subprocess
import sys
import tempfile
import os

ROOT = pathlib.Path("/srv/openclaw/competition-state")
def run(*args: str) -> str:
    try:
        p = subprocess.run(args, check=False, text=True, capture_output=True, timeout=8)
        return p.stdout.strip() if p.returncode == 0 else f"unavailable ({p.returncode})"
    except (OSError, subprocess.TimeoutExpired):
        return "unavailable"

def main() -> int:
    state = {"checked_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
             "gateway": run("systemctl", "--user", "is-active", "openclaw-gateway.service"),
             "scout_timer": run("systemctl", "--user", "is-active", "openclaw-competition-scout.timer"),
             "claude_calls_enabled": False,
             "gpu_training_enabled": False}
    try:
        old = json.loads((ROOT / "scout-status.json").read_text(encoding="utf-8"))
        completed = dt.datetime.fromisoformat(old["finished_utc"])
        age = (dt.datetime.now(dt.timezone.utc) - completed).total_seconds() / 3600
        state["latest_scout_age_hours"] = round(age, 2)
        state["candidate_count"] = old.get("discovery_total", 0)
        state["scout_is_fresh"] = age <= 11
    except (OSError, KeyError, ValueError, TypeError):
        state["scout_is_fresh"] = False
    state["healthy"] = (state["gateway"] == "active"
                        and state["scout_timer"] == "active"
                        and state.get("scout_is_fresh", False))
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".health-", dir=ROOT)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(state, file, indent=2, ensure_ascii=False)
            file.write("\n")
        os.replace(temp, ROOT / "health.json")
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    print(json.dumps(state, ensure_ascii=False))
    return 0 if state["healthy"] else 2

if __name__ == "__main__":
    sys.exit(main())
