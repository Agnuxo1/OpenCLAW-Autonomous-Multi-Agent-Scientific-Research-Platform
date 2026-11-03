#!/usr/bin/env python3
"""Install the open-source Boltz structure predictor in an isolated PDC workspace.

This does not run inference or touch user credentials. GPU work must be assigned
separately by the Server-IA JEV broker. Logs and caches stay on the data disk.
"""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path("/mnt/datos/competition-24h/pdc")
ENV = ROOT / "venv"
LOG = ROOT / "logs/setup.log"
STATE = ROOT / "setup_state.json"
MAX_SETUP_SECONDS = 4200


def stamp() -> str:
    """Return an unambiguous UTC timestamp for the setup audit."""
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def checkpoint(status: str, **fields: object) -> None:
    """Persist the exact setup phase and detected failure without secrets."""
    data = {"time_utc": stamp(), "status": status, **fields}
    temp = STATE.with_suffix(".tmp")
    temp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    temp.replace(STATE)


def install() -> int:
    """Create a new venv and install Boltz without altering existing environments."""
    for name in ("logs", "tmp", "pip-cache", "boltz-cache"):
        (ROOT / name).mkdir(parents=True, exist_ok=True)
    start = time.monotonic()
    env = os.environ.copy()
    env["TMPDIR"] = str(ROOT / "tmp")
    env["PIP_CACHE_DIR"] = str(ROOT / "pip-cache")
    env["PYTHONUNBUFFERED"] = "1"
    cmds = []
    if not (ENV / "bin/python").exists():
        cmds.append([sys.executable, "-m", "venv", str(ENV)])
    cmds.extend([
        [str(ENV / "bin/python"), "-m", "pip", "install", "--upgrade", "pip"],
        [str(ENV / "bin/python"), "-m", "pip", "install", "boltz[cuda]"],
        [str(ENV / "bin/python"), "-c",
         "import torch, boltz; assert torch.cuda.is_available(); "
         "print('CUDA',torch.__version__,torch.cuda.device_count())"],
    ])
    checkpoint("SETUP_RUNNING", max_runtime_seconds=MAX_SETUP_SECONDS)
    with LOG.open("a", encoding="utf-8") as handle:
        handle.write("\n=== " + stamp() + " ===\n")
        handle.flush()
        for command in cmds:
            remaining = MAX_SETUP_SECONDS - int(time.monotonic() - start)
            if remaining <= 0:
                checkpoint("FAILED", reason="SETUP_TIMEOUT")
                return 1
            handle.write("RUN " + " ".join(command) + "\n")
            handle.flush()
            try:
                result = subprocess.run(
                    command, env=env, stdout=handle, stderr=subprocess.STDOUT,
                    timeout=remaining, check=False,
                )
            except subprocess.TimeoutExpired:
                checkpoint("FAILED", reason="COMMAND_TIMEOUT", stage=command[-1])
                return 1
            if result.returncode:
                checkpoint("FAILED", reason="INSTALL_OR_IMPORT_FAILED",
                           command=command[:3], exit_code=result.returncode)
                return 1
    checkpoint("READY", elapsed_seconds=round(time.monotonic() - start, 2),
               python=str(ENV / "bin/python"),
               executable=str(ENV / "bin/boltz"))
    return 0


if __name__ == "__main__":
    raise SystemExit(install())
