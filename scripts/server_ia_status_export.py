#!/usr/bin/env python3
"""Export an evidence-based Server-IA status dashboard to the mapped O: NAS.

This monitor never launches work and never reads, displays, or copies credentials.
It distinguishes an active scheduler from an active scientific agent and
distinguishes draft reports from official competition submissions.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from zoneinfo import ZoneInfo

ROOT = Path("/mnt/datos/proyectos/claude-fable-competition-swarm-20261101")
TARGET = Path("/srv/almacen/nas-2tb-2/Estado-Server-IA")
BROKER_JOBS = Path("/home/ai/servidor-ia/jobs")
MADRID = ZoneInfo("Europe/Madrid")
MAX_RECENT_JOBS = 12


def atomic_write(path: Path, content: str) -> None:
    """Atomically update a UTF-8 text file without exposing partial contents."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", dir=path.parent, encoding="utf-8", delete=False
    ) as stream:
        stream.write(content)
        temporary = Path(stream.name)
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)


def run_read_only(args: list[str], timeout: int = 7) -> str:
    """Read a local status command with a bounded deadline and no shell."""
    try:
        result = subprocess.run(
            args, capture_output=True, text=True, timeout=timeout, check=False
        )
        return result.stdout.strip() if result.stdout.strip() else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def read_json(path: Path) -> dict:
    """Return a JSON object or an empty object when the source is unavailable."""
    try:
        content = json.loads(path.read_text(encoding="utf-8"))
        return content if isinstance(content, dict) else {}
    except (OSError, ValueError):
        return {}


def madrid_time(value: str | float | int | None) -> str:
    """Convert a recorded ISO timestamp or Unix epoch to Europe/Madrid."""
    if value is None or value == "":
        return "—"
    try:
        if isinstance(value, (int, float)):
            timestamp = dt.datetime.fromtimestamp(value, tz=dt.timezone.utc)
        else:
            timestamp = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=dt.timezone.utc)
        return timestamp.astimezone(MADRID).strftime("%d/%m/%Y %H:%M:%S")
    except (ValueError, OverflowError):
        return "—"


def collect_gpu() -> list[dict]:
    """Read observed GPU telemetry; missing telemetry never implies idle GPUs."""
    output = run_read_only([
        "nvidia-smi",
        "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,power.draw",
        "--format=csv,noheader,nounits",
    ])
    devices = []
    for line in output.splitlines():
        fields = [part.strip() for part in line.split(",")]
        if len(fields) != 6:
            continue
        devices.append(dict(zip(
            ("index", "name", "gpu_percent", "used_mib", "total_mib", "watts"),
            fields,
        )))
    return devices


def collect_jobs() -> list[dict]:
    """Summarize actual broker jobs without launching jobs or changing JEV state."""
    jobs = []
    for path in BROKER_JOBS.glob("*/job.json"):
        record = read_json(path)
        if not record.get("id"):
            continue
        jobs.append({
            "id": record["id"],
            "project": record.get("project", "?"),
            "status": record.get("state", "unknown"),
            "lane": record.get("lane") or "—",
            "timestamp": record.get("started_at") or record.get("submitted_at")
            or record.get("created_at") or 0,
            "exit_code": record.get("exit_code"),
        })
    jobs.sort(key=lambda job: job["timestamp"], reverse=True)
    return jobs


def collect() -> dict:
    """Build one provenance-preserving status snapshot from actual files."""
    manifest = read_json(ROOT / "manifest.json")
    budget = read_json(ROOT / "state/budget.json")
    usage_path = ROOT / "state/usage.jsonl"
    usage_rows = []
    if usage_path.is_file():
        for line in usage_path.read_text(encoding="utf-8").splitlines():
            try:
                usage_rows.append(json.loads(line))
            except ValueError:
                continue
    agent_list = []
    for item in manifest.get("jobs", []):
        state = read_json(ROOT / "state" / (item["id"] + ".json"))
        agent_list.append({
            "id": item["id"],
            "name": item.get("name", item["id"]),
            "deadline": madrid_time(item.get("deadline_utc")),
            "status": state.get("status", "NOT_STARTED"),
            "updated": madrid_time(state.get("time")),
            "calls": state.get("api_calls", 0),
            "report": f"informes/{item['id']}.md"
            if (ROOT / "reports" / (item["id"] + ".md")).is_file() else "",
        })
    records = collect_jobs()
    states = [x["status"] for x in agent_list]
    return {
        "checked_at": madrid_time(dt.datetime.now(dt.timezone.utc).timestamp()),
        "server": "Server-IA",
        "gateway": run_read_only(
            ["systemctl", "--user", "is-active", "openclaw-gateway.service"]),
        "agent_timer": run_read_only(
            ["systemctl", "--user", "is-active", "claude-fable-competition-swarm.timer"]),
        "agent_process": run_read_only(
            ["systemctl", "--user", "is-active", "claude-fable-competition-swarm.service"]),
        "api_calls": len(usage_rows),
        "last_api_call": madrid_time(usage_rows[-1].get("time")) if usage_rows else "—",
        "api_model": manifest.get("model", "unknown"),
        "api_local_spend_usd": round(float(budget.get("total", 0)), 4),
        "api_local_cap_usd": manifest.get("global_max_spend_usd"),
        "api_credit_balance_verified": False,
        "reports_count": sum(bool(x["report"]) for x in agent_list),
        "review_needed": states.count("DRAFT_READY_FOR_INDEPENDENT_REVIEW"),
        "gpu": collect_gpu(),
        "agents": agent_list,
        "active_gpu_jobs": [x for x in records if x["status"] in ("queued", "running", "staging")],
        "recent_gpu_jobs": records[:MAX_RECENT_JOBS],
        "official_submissions_verified_by_this_monitor": 0,
    }


def export_reports() -> None:
    """Copy non-secret draft reports to the user's local mapped NAS drive."""
    destination = TARGET / "informes"
    destination.mkdir(parents=True, exist_ok=True)
    source_dir = ROOT / "reports"
    if not source_dir.is_dir():
        return
    for report in source_dir.glob("*.md"):
        if not report.is_file() or report.stat().st_size > 200_000:
            continue
        content = report.read_text(encoding="utf-8", errors="replace")
        content = (
            "**BORRADOR DE CLAUDE — PENDIENTE DE AUDITORÍA. "
            "NO ES UNA ENTREGA OFICIAL.**\n\n"
            + content
        )
        atomic_write(destination / report.name, content)


def render_html(data: dict) -> str:
    """Render a refreshable local dashboard using escaped untrusted content."""
    def e(value: object) -> str:
        return html.escape(str(value), quote=True)

    def row(values: list[object]) -> str:
        return "<tr>" + "".join(f"<td>{e(v)}</td>" for v in values) + "</tr>"

    gpu_rows = "".join(row([
        x["index"], x["gpu_percent"] + " %",
        x["used_mib"] + " / " + x["total_mib"] + " MiB", x["watts"] + " W",
    ]) for x in data["gpu"])
    if not gpu_rows:
        gpu_rows = "<tr><td colspan='4'>No se pudieron leer los datos de NVIDIA.</td></tr>"

    agent_rows = []
    for item in data["agents"]:
        link = (f"<a href='{e(item['report'])}'>Abrir borrador</a>"
                if item["report"] else "Sin informe")
        agent_rows.append(
            "<tr>"
            + f"<td>{e(item['name'])}</td>"
            + f"<td>{e(item['status'])}</td>"
            + f"<td>{e(item['updated'])}</td>"
            + f"<td>{e(item['deadline'])}</td>"
            + f"<td>{link}</td></tr>"
        )
    jobs = "".join(row([
        x["project"], x["status"], x["lane"],
        madrid_time(x["timestamp"]), x["id"],
    ]) for x in data["recent_gpu_jobs"])

    return """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="60">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Server-IA | Actividad verificada</title>
<style>
:root{color-scheme:dark}body{margin:auto;max-width:1150px;padding:28px;
font:16px/1.55 system-ui,sans-serif;background:#0f1520;color:#edf2f7}
header{border-bottom:1px solid #354152;padding-bottom:10px}h1{margin-bottom:0}
small,.muted{color:#aebdd0}.cards{display:grid;grid-template-columns:
repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:24px 0}
.card{padding:16px;border-radius:10px;background:#192336;border:1px solid #334258}
.metric{font-size:26px;font-weight:750}table{width:100%;border-collapse:
collapse;margin:10px 0 25px}th,td{text-align:left;border-bottom:1px solid
#354152;padding:9px;vertical-align:top}th{color:#c9d5e5}
a{color:#83bfff}section{overflow-x:auto}
.notice{padding:14px 17px;border-left:4px solid #d9aa5b;background:#242432}
footer{margin-top:25px;color:#aebdd0}
</style></head><body><header><h1>Server-IA — actividad verificada</h1>
<small>Última actualización: """ + e(data["checked_at"]) + """ (hora de España).
Actualización automática cada 60 segundos.</small></header>
<div class="cards">
<div class="card"><div>Programador Claude</div><div class="metric">""" + e(data["agent_timer"]) + """</div><small>Activo no implica trabajo en ejecución</small></div>
<div class="card"><div>Proceso Claude ahora</div><div class="metric">""" + e(data["agent_process"]) + """</div><small>Puede estar inactivo entre turnos</small></div>
<div class="card"><div>Informes de Claude</div><div class="metric">""" + e(data["reports_count"]) + """</div><small>Todos requieren auditoría independiente</small></div>
<div class="card"><div>Última llamada API</div><div class="metric" style="font-size:17px">""" + e(data["last_api_call"]) + """</div><small>""" + e(data["api_calls"]) + """ llamadas registradas</small></div>
<div class="card"><div>Consumo local de esta ejecución</div><div class="metric">""" + e(data["api_local_spend_usd"]) + """ USD</div><small>Tope local """ + e(data["api_local_cap_usd"]) + """ USD; saldo real no verificado</small></div>
</div>
<div class="notice"><strong>Importante:</strong> Los informes son borradores,
no entregas oficiales. Este panel no acredita registros ni envío a concursos.
Las GPU pueden estar inactivas cuando Claude ejecuta inferencia remota.</div>
<h2>GPU NVIDIA (lectura directa)</h2><section><table><thead><tr>
<th>GPU</th><th>Uso</th><th>Memoria</th><th>Consumo</th></tr></thead><tbody>""" + gpu_rows + """</tbody></table></section>
<h2>Concursos y borradores</h2><section><table><thead><tr>
<th>Concurso</th><th>Estado del agente</th><th>Última actualización</th>
<th>Plazo declarado</th><th>Resultado disponible</th></tr></thead><tbody>""" + "".join(agent_rows) + """</tbody></table></section>
<h2>Últimos trabajos gestionados por JEV</h2><section><table><thead><tr>
<th>Proyecto</th><th>Estado</th><th>Carril</th><th>Fecha</th><th>ID</th>
</tr></thead><tbody>""" + (jobs or "<tr><td colspan='5'>Sin trabajos</td></tr>") + """</tbody></table></section>
<footer>Fuente: registros locales de Claude, gestor de trabajos Server-IA y
nvidia-smi. Los datos no se inventan ni se actualizan mientras el servidor esté
desconectado. <a href="STATUS.md">Versión en texto</a>.</footer>
</body></html>"""


def render_markdown(data: dict) -> str:
    """Provide a compact status suitable for opening in a text editor."""
    lines = [
        "# Server-IA — Estado verificado",
        "",
        f"Actualizado: {data['checked_at']} (España)",
        f"Temporizador: {data['agent_timer']}; proceso de agente: {data['agent_process']}",
        f"Claude: {data['api_calls']} llamadas; última: {data['last_api_call']}",
        f"Coste local estimado: {data['api_local_spend_usd']} USD",
        "Créditos reales Anthropic: NO VERIFICADOS",
        "Entregas oficiales: NO VERIFICADAS POR ESTE MONITOR",
        "",
        "## Concursos",
    ]
    for x in data["agents"]:
        lines.append(f"- {x['name']}: {x['status']}; "
                     f"actualizado {x['updated']}; "
                     f"borrador {x['report'] or 'no'}")
    lines.extend(["", "## GPU"])
    for x in data["gpu"]:
        lines.append(f"- GPU {x['index']}: {x['gpu_percent']} %; "
                     f"{x['used_mib']} MiB; {x['watts']} W")
    lines.extend(["", "## Trabajos JEV recientes"])
    for x in data["recent_gpu_jobs"]:
        lines.append(f"- {x['id']}: {x['project']}, {x['status']} ({x['lane']})")
    return "\n".join(lines) + "\n"


def main() -> int:
    """Export the snapshot and return after one fully completed refresh."""
    TARGET.mkdir(parents=True, exist_ok=True)
    snapshot = collect()
    export_reports()
    atomic_write(TARGET / "STATUS.json", json.dumps(
        snapshot, ensure_ascii=False, indent=2) + "\n")
    atomic_write(TARGET / "STATUS.md", render_markdown(snapshot))
    atomic_write(TARGET / "index.html", render_html(snapshot))
    print("STATUS_EXPORT_OK " + snapshot["checked_at"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
