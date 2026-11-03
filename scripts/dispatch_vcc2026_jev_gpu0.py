#!/usr/bin/env python3
"""Queue the controlled VCC2026 benchmark on its JEV-owned GPU 0 lane once."""
import json
from pathlib import Path
import sys

sys.path.insert(0, "/home/ai/servidor-ia")
import cola
import remote

PROJECT = "vcc2026-transfer"
RUNNER = "/mnt/datos/competition-24h/vcc/run.py"
PYTHON = "/mnt/datos/competition-24h/vcc/env/bin/python"


def main() -> None:
    """Verify JEV ownership and create exactly one persistent GPU worker."""
    entry = cola.entry_for(PROJECT, cola.load())
    if not entry or entry["estado"] != "EN CURSO" or entry["carril"] != "gpu0":
        raise RuntimeError("VCC2026 does not currently own GPU 0")
    if entry["vencido"]:
        raise RuntimeError("The 24-hour JEV lane has already expired")
    if not Path(RUNNER).is_file() or not Path(PYTHON).is_file():
        raise RuntimeError("VCC runner / isolated environment missing")
    for job in remote.all_jobs():
        if job.get("project") == PROJECT and job.get("state") in {
            "queued", "running", "staging"
        }:
            raise RuntimeError("Duplicate VCC job would violate lane policy")
    prepared = remote.prepare({
        "project": PROJECT,
        "command": [PYTHON, RUNNER],
        "gpus": 1,
        "vram_gib": 19,
        "ram_gib": 9,
    })
    result = remote.commit(prepared["id"])
    print(json.dumps({
        key: result.get(key) for key in
        ("id", "project", "state", "ticket", "gpus", "vram_gib", "ram_gib")
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
