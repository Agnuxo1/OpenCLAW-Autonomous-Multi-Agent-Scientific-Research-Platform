#!/usr/bin/env python3
"""Export real 24-hour JEV job and scientific progress to the mapped O: drive.

Observes checkpoints and raw results without starting jobs, publishing scores,
copying secret model inputs or modifying official competition submissions.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from zoneinfo import ZoneInfo

ROOT = Path("/mnt/datos/competition-24h")
DEST = Path("/srv/almacen/nas-2tb-2/Estado-Server-IA")
TZ = ZoneInfo("Europe/Madrid")
sys.path.insert(0, "/home/ai/servidor-ia")
import cola
import remote


def read_json(path: Path) -> dict:
    """Return a dictionary from a checkpoint or an empty dictionary."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def read_lines(path: Path) -> list[dict]:
    """Read individual scientific results while retaining failed experiments."""
    if not path.is_file():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            entry = json.loads(line)
            if isinstance(entry, dict):
                out.append(entry)
        except ValueError:
            continue
    return out


def local_time(value: str | float | None) -> str:
    """Format UTC dates in the user's Spanish time zone."""
    if not value:
        return "Sin dato"
    try:
        when = (dt.datetime.fromtimestamp(value, dt.timezone.utc)
                if isinstance(value, (float, int))
                else dt.datetime.fromisoformat(str(value).replace("Z", "+00:00")))
        return when.astimezone(TZ).strftime("%d/%m/%Y %H:%M:%S")
    except (TypeError, ValueError, OverflowError):
        return "Sin dato"


def gpu_readings() -> list[dict]:
    """Read real NVIDIA telemetry; missing readings are not interpreted as 0%."""
    command = [
        "nvidia-smi",
        "--query-gpu=index,utilization.gpu,memory.used,power.draw",
        "--format=csv,noheader,nounits",
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True,
                                check=True, timeout=12)
        return [
            dict(zip(("index", "percent", "vram_mib", "watts"),
                     [v.strip() for v in line.split(",")]))
            for line in result.stdout.splitlines()
            if len(line.split(",")) == 4
        ]
    except (OSError, subprocess.SubprocessError):
        return []


def snapshot() -> dict:
    """Combine JEV queue, broker jobs and actual scientific outputs."""
    queue = cola.load()
    jobs = remote.all_jobs()
    summary = []
    for project, folder, gpu, name in (
        ("vcc2026-transfer", "vcc", "GPU 0", "Virtual Cell Challenge 2026"),
        ("pdc2026", "pdc", "GPU 1", "Protein Design Competition 2026"),
    ):
        entry = cola.entry_for(project, queue) or {}
        related = sorted(
            (x for x in jobs if x.get("project") == project),
            key=lambda x: x.get("created_at", 0), reverse=True,
        )
        active = next((x for x in related if x.get("state") == "running"),
                      related[0] if related else {})
        state = read_json(ROOT / folder / "experiment_state.json")
        replication = read_json(ROOT / folder / "replication_state.json") if folder == "pdc" else {}
        if replication and "replicate.py" in " ".join(active.get("command", [])):
            state = replication
        records = read_lines(ROOT / folder / "results" / (
            "local_scores.jsonl" if folder == "vcc"
            else "candidate_metrics.jsonl"
        ))
        if folder == "vcc":
            valid = [x for x in records
                     if x.get("status") in ("SUCCEEDED", "REUSED_VALIDATED")
                     and isinstance(x.get("score"), (int, float))]
            progress = {
                "validated_evaluations": len(valid),
                "planned_evaluations": 81,
                "failed_attempts": sum(x.get("status") == "FAILED" for x in records),
                "last_score": round(valid[-1]["score"], 6) if valid else None,
                "last_context": valid[-1].get("context") if valid else None,
                "best_fully_validated": state.get("ranked_complete_candidates", [])[:3],
                "metric_type": "Local held-out cell-eval2 six-metric average; H1 uses a distinct fixed 96-cell public sample, not the full H1 score",
                "official_submission_changed": False,
            }
        else:
            valid = [x for x in records
                     if x.get("status") == "STRUCTURE_PREDICTED"
                     and x.get("score_type", "").startswith(
                         "Boltz_conservative_bidirectional_NK2R_VHH_pair_iptm")
                     and isinstance(x.get("nk2r_vhh_pair_iptm"), (float, int))]
            valid.sort(key=lambda x: x["nk2r_vhh_pair_iptm"], reverse=True)
            progress = {
                "structures_predicted": len(valid),
                "raw_attempts": len(records),
                "replication_status": replication.get("status", "NOT_STARTED"),
                "completed_valid_replicates": replication.get("completed_valid_replicates", 0),
                "best_replicated_candidates": replication.get("replicated_ranking", [])[:3],
                "best_candidates": [
                    {"id": x.get("candidate"),
                     "boltz_nk2r_vhh_iptm": round(x["nk2r_vhh_pair_iptm"], 5)}
                    for x in valid[:5]
                ],
                "metric_type": "Boltz NK2R-VHH interaction proxy; not official AF3",
                "agonism_verified": False,
                "official_submission_changed": False,
            }
        actual_status = state.get("status", "NOT_STARTED")
        if actual_status in {"RUNNING", "WAITING_FOR_SAFE_RAM"}:
            if active.get("state") in {"cancelled", "failed", "interrupted"}:
                actual_status = "INTERRUPTED_" + active["state"].upper()
            elif active.get("state") == "succeeded":
                actual_status = "STOPPED_WITH_STALE_CHECKPOINT"
        summary.append({
            "contest": name,
            "project": project,
            "gpu": gpu,
            "jev_lane": entry.get("carril"),
            "jev_state": entry.get("estado"),
            "lease_started": local_time(entry.get("inicio_utc")),
            "lease_ends": local_time(entry.get("plazo_utc")),
            "job_id": active.get("id"),
            "job_state": active.get("state", "NOT_SUBMITTED"),
            "experiment_state": actual_status,
            "checkpoint": local_time(
                state.get("last_update_utc") or state.get("checked_utc")
                or state.get("updated_at")),
            "progress": progress,
        })
    return {
        "checked_at": local_time(dt.datetime.now(dt.timezone.utc).isoformat()),
        "server": "Server-IA",
        "gpus": gpu_readings(),
        "experiments": summary,
        "official_competition_acceptance_verified_here": False,
    }


def atomic_write(path: Path, contents: str) -> None:
    """Write one report atomically and set ordinary read-only-share permissions."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8",
                                     dir=path.parent, delete=False) as out:
        out.write(contents)
        temp = Path(out.name)
    os.chmod(temp, 0o644)
    os.replace(temp, path)


def main() -> int:
    """Publish three human-readable views refreshed by a one-minute timer."""
    data = snapshot()
    lines = [
        "# Server-IA: dos concursos y dos RTX 3090",
        "",
        "Actualizado: " + data["checked_at"] + " (España)",
        "Los resultados son experimentales. No se ha efectuado una entrega nueva.",
        "",
    ]
    for e in data["experiments"]:
        lines.extend([
            "## " + e["contest"],
            "GPU/JEV: " + str(e["gpu"]) + " / " + str(e["jev_lane"]),
            "Trabajo: " + str(e["job_id"]) + " (" + e["job_state"] + ")",
            "Estado científico: " + e["experiment_state"],
            "Inicio: " + e["lease_started"],
            "Fin de 24 horas: " + e["lease_ends"],
            "Progreso numérico: ",
            json.dumps(e["progress"], ensure_ascii=False, indent=2),
            "",
        ])
    lines.extend(["## Actividad real NVIDIA", ""])
    for g in data["gpus"]:
        lines.append(
            "GPU " + g["index"] + ": " + g["percent"] +
            "%, " + g["vram_mib"] + " MiB, " + g["watts"] + " W"
        )
    markdown = "\n".join(lines) + "\n"
    escape = lambda value: html.escape(str(value), quote=True)
    table = []
    for e in data["experiments"]:
        progress = e["progress"]
        summary = (
            str(progress["validated_evaluations"]) + " / 81 puntuaciones"
            if e["project"] == "vcc2026-transfer"
            else str(progress["structures_predicted"]) + " estructuras; " + str(progress.get("completed_valid_replicates", 0)) + " réplicas"
        )
        table.append(
            "<tr><td>" + escape(e["gpu"]) + "</td><td>" +
            escape(e["contest"]) + "</td><td>" +
            escape(e["job_state"]) + "</td><td>" +
            escape(e["experiment_state"]) + "</td><td>" +
            escape(summary) + "</td><td>" +
            escape(e["lease_ends"]) + "</td></tr>"
        )
    gpu_table = "".join(
        "<tr><td>GPU " + escape(g["index"]) + "</td><td>" +
        escape(g["percent"]) + "%</td><td>" +
        escape(g["vram_mib"]) + " MiB</td><td>" +
        escape(g["watts"]) + " W</td></tr>"
        for g in data["gpus"]
    )
    webpage = (
        "<!doctype html><html lang='es'><head><meta charset='utf-8'>"
        "<meta http-equiv='refresh' content='60'>"
        "<title>Server-IA · 2 concursos de 24 h</title>"
        "<style>body{font:16px/1.5 system-ui;max-width:1100px;"
        "margin:25px auto;padding:15px;background:#111827;color:#e5e7eb}"
        "table{border-collapse:collapse;width:100%}"
        "td,th{padding:12px;text-align:left;border-bottom:1px solid #475569}"
        "a{color:#93c5fd}</style></head><body>"
        "<h1>Server-IA · Dos concursos · 24 horas</h1>"
        "<p>Actualizado: " + escape(data["checked_at"]) + "</p>"
        "<p>Los experimentos no equivalen a resultados o entregas oficiales.</p>"
        "<table><tr><th>GPU</th><th>Concurso</th><th>Trabajo JEV</th>"
        "<th>Estado experimental</th><th>Progreso</th><th>Fin del turno</th>"
        "</tr>" + "".join(table) + "</table>"
        "<h2>Utilización real NVIDIA</h2>"
        "<table><tr><th>GPU</th><th>Utilización</th><th>VRAM</th>"
        "<th>Potencia</th></tr>" + gpu_table + "</table>"
        "<p><a href='CONCURSOS_24H.md'>Detalle y mejores resultados</a>"
        " · <a href='index.html'>Panel general</a></p></body></html>"
    )
    DEST.mkdir(parents=True, exist_ok=True)
    atomic_write(DEST / "CONCURSOS_24H.json",
                 json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    atomic_write(DEST / "CONCURSOS_24H.md", markdown)
    atomic_write(DEST / "CONCURSOS_24H.html", webpage)
    print("GPU_COMPETITION_DASHBOARD_OK", data["checked_at"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
