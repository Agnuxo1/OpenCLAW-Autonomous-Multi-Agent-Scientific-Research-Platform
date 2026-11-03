#!/usr/bin/env python3
"""VCC2026: JEV-isolated, 24-hour reproducible cross-context evaluation sprint.

Use ONLY the three public leave-cell-line-out validation fixtures. This script
does not read final hidden contexts D/E/F, does not access VCC credentials,
never changes an official submission, and never invents leaderboard scores.

All candidate genome settings are preregistered before running. Each candidate
is compared to the frozen gamma=1 baseline using cell-eval2's six VCC2026
locally scaled metrics and 3 independent random seeds. The best is promoted
only if the worst-context score improves by at least 0.01 without a meaningful
H1 heldout-context regression. A fixed 24-hour deadline is enforced.
"""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

ROOT = Path("/mnt/datos/competition-24h/vcc")
SOURCE = ROOT / "src"
DATA = ROOT / "data"
RESULTS = ROOT / "results"
SCORES = RESULTS / "local_scores.jsonl"
STATE_FILE = ROOT / "experiment_state.json"
PY = ROOT / "env/bin/python"
CE = ROOT / "env/bin/cell-eval2"
MAX_SECONDS = 23 * 3600 + 50 * 60
MAX_EVAL_SECONDS = 2600
REQUIRED_METRICS = frozenset({
    "pds_cosine", "expr_mse_unbiased_capped_norm",
    "de_wilcoxon_direction_fidelity_yield_raw",
    "de_wilcoxon_direction_reach_raw",
    "de_wilcoxon_sig_jaccard", "de_wilcoxon_lfc_nmae",
})
FIXTURES = {
    "rpe1b": {"donor": "gamma1_baseline_2f.json",
              "sources": ["k562_gwps_bulk.npz", "k562_essential_bulk.npz"],
              "cells": 96},
    "k562b": {"donor": "candidate_1f.json",
              "sources": ["rpe1_bulk.npz"],
              "cells": 96},
    "h1b": {"donor": "gamma1_baseline_2f.json",
            "sources": ["k562_gwps_bulk.npz", "k562_essential_bulk.npz"],
            "cells": 400},
}
# Deterministic preregistered science: rather than claim that a learned
# optimizer magically predicts hidden test cells, compare controlled variants.
CANDIDATES = [
    ("baseline_gamma1", {"gamma": 1.0}),
    ("published_gamma1p4", {"gamma": 1.4}),
    ("gamma1p2", {"gamma": 1.2}),
    ("gamma0p8", {"gamma": 0.8}),
    ("gamma1p6", {"gamma": 1.6}),
    ("theta0p25_gamma1", {"gamma": 1.0, "theta": 0.25}),
    ("theta0p25_gamma1p4", {"gamma": 1.4, "theta": 0.25}),
    ("cpmfloor8_gamma1", {"gamma": 1.0, "cpm_floor": 8.0}),
    ("cpmfloor8_gamma1p4", {"gamma": 1.4, "cpm_floor": 8.0}),
]
SEEDS = (0, 1, 2)
STOP = False


def stamp() -> str:
    """Return UTC timestamp for exact provenance."""
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def signal_stop(_signal: int, _frame: object) -> None:
    """Finish at a safe output checkpoint if JEV terminates the sprint."""
    global STOP
    STOP = True


def save(state: dict) -> None:
    """Persist run state atomically and preserve completed trials."""
    state["last_update_utc"] = stamp()
    temp = STATE_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n")
    temp.replace(STATE_FILE)


def verified_score(path: Path) -> dict:
    """Accept a score only after checking all six required metrics."""
    if not path.is_file() or not path.stat().st_size:
        raise ValueError("Missing or empty local score")
    records = list(csv.DictReader(path.open(encoding="utf-8")))
    metrics = {}
    overall = None
    for record in records:
        key = record.get("metric")
        if key == "avg_score":
            overall = float(record["from_replicate"])
        elif key in REQUIRED_METRICS:
            value = float(record["from_replicate"])
            if not math.isfinite(value):
                raise ValueError(f"Nonfinite metric {key}")
            metrics[key] = value
    if set(metrics) != REQUIRED_METRICS or overall is None:
        raise ValueError("Incomplete six-metric VCC2026 report")
    calculated = sum(metrics.values()) / len(metrics)
    if not math.isclose(overall, calculated, abs_tol=5e-5):
        raise ValueError("The six-metric average does not match the evaluator")
    return {"overall": overall, "metrics": metrics}


def make_genome(context: str, edits: dict, destination: Path) -> dict:
    """Create one candidate from the original submitted experimental settings."""
    entry = FIXTURES[context]
    original_file = DATA / "genomes" / entry["donor"]
    baseline = json.loads(original_file.read_text(encoding="utf-8"))
    baseline.update(edits)
    if len(baseline["pesos"]) != len(entry["sources"]):
        raise ValueError("Donor weights incompatible with source count")
    if not 0.0 <= baseline["gamma"] <= 3.0:
        raise ValueError("Unphysical gamma candidate")
    if not 0.0 <= baseline["theta"] <= 1.0:
        raise ValueError("Invalid theta candidate")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(baseline, indent=2, sort_keys=True) + "\n")
    return baseline


def evaluator_gpu_script() -> Path:
    """Create an isolated CUDA-enabled copy of the author's validated harness."""
    source = (SOURCE / "run_eval.py").read_text(encoding="utf-8")
    if ('"device=cpu"' not in source or '"de.backend=pdex"' not in source):
        raise ValueError("Original local evaluator has unexpected parameters")
    patched = source.replace('"device=cpu"', '"device=cuda"').replace(
        '"de.backend=pdex"', '"de.backend=cupy"')
    path = SOURCE / "run_eval_gpu.py"
    path.write_text(patched, encoding="utf-8")
    import py_compile
    py_compile.compile(str(path), doraise=True)
    return path


def run_case(name: str, edits: dict, context: str, seed: int,
             deadline: float, gpu_script: Path) -> dict:
    """Execute one local cell-eval2 experiment on a single public context."""
    local = RESULTS / name / context / f"seed_{seed}"
    local.mkdir(parents=True, exist_ok=True)
    gfile = local / "genome.json"
    genome = make_genome(context, edits, gfile)
    fixture = DATA / "fixtures" / context
    entry = FIXTURES[context]
    sources = [DATA / "fuentes" / x for x in entry["sources"]]
    for required in (*sources, fixture / "ctrl.h5ad",
                     fixture / "real.h5ad", fixture / "panel.json"):
        if not required.is_file():
            raise FileNotFoundError(str(required))
    original_score = local / "score.csv"
    if original_score.is_file():
        verified = verified_score(original_score)
        return {"status": "REUSED_VALIDATED",
                "candidate": name, "context": context, "seed": seed,
                "score": verified["overall"], "metrics": verified["metrics"]}
    env = os.environ.copy()
    env.update({
        "HDF5_USE_FILE_LOCKING": "FALSE",
        "CELL_EVAL2": str(CE),
        "PYTHONUNBUFFERED": "1",
        "OMP_NUM_THREADS": "3",
        "OPENBLAS_NUM_THREADS": "3",
    })
    basic = [
        str(PY), str(gpu_script),
        "--fixture", str(fixture),
        "--fuentes", *[str(x) for x in sources],
        "--genoma", str(gfile), "--salida", str(local),
        "--celulas", str(entry["cells"]), "--semilla", str(seed),
        "--bundle", str(fixture / "bundle"),
    ]
    attempted = []
    for backend, command in [
        ("CUDA_CUPY", basic),
        ("CPU_PDEX_FALLBACK", [
            str(PY), str(SOURCE / "run_eval.py"), *basic[2:]
        ]),
    ]:
        remaining = max(1, deadline - time.monotonic())
        if remaining < 20 or STOP:
            break
        output = local / (backend.lower() + ".log")
        try:
            with output.open("w", encoding="utf-8") as handle:
                result = subprocess.run(
                    command, env=env, stdout=handle,
                    stderr=subprocess.STDOUT,
                    timeout=min(remaining, MAX_EVAL_SECONDS), check=False,
                )
            attempted.append({"backend": backend,
                              "exit_code": result.returncode})
            if result.returncode:
                # Never keep a failed partial prediction or score.
                original_score.unlink(missing_ok=True)
                (local / "pred.h5ad").unlink(missing_ok=True)
                continue
            scores = verified_score(original_score)
            # Remove bulky outputs ONLY after the evaluator verified them.
            (local / "pred.h5ad").unlink(missing_ok=True)
            return {
                "status": "SUCCEEDED", "candidate": name,
                "context": context, "seed": seed,
                "score": scores["overall"], "metrics": scores["metrics"],
                "backend": backend, "attempts": attempted,
                "genome_sha256": hashlib.sha256(gfile.read_bytes()).hexdigest(),
                "source_type": "PUBLIC_HELDOUT_CELL_LINE_LOCAL_FIXTURE",
                "official_leaderboard_score": None,
                "genome": genome,
            }
        except (subprocess.TimeoutExpired, ValueError) as exc:
            attempted.append({"backend": backend,
                              "error": type(exc).__name__})
            original_score.unlink(missing_ok=True)
            (local / "pred.h5ad").unlink(missing_ok=True)
            continue
    return {
        "status": "FAILED", "candidate": name, "context": context,
        "seed": seed, "attempts": attempted, "score": None,
    }


def outcome_table(data: list[dict]) -> list[dict]:
    """Aggregate only fully observed experiments; retain per-seed evidence."""
    result = []
    for name, _ in CANDIDATES:
        contexts = {}
        valid = True
        for ctx in FIXTURES:
            trials = [
                item for item in data if item.get("candidate") == name
                and item.get("context") == ctx
                and item.get("seed") in SEEDS
                and item.get("status") in ("SUCCEEDED", "REUSED_VALIDATED")
            ]
            if len({item["seed"] for item in trials}) != len(SEEDS):
                valid = False
                break
            contexts[ctx] = sum(x["score"] for x in trials) / len(trials)
        if valid:
            result.append({
                "candidate": name, "mean": sum(contexts.values()) / len(contexts),
                "worst_context": min(contexts.values()),
                "h1b": contexts["h1b"],
                "contexts": contexts,
            })
    return sorted(result, key=lambda x: (x["worst_context"], x["mean"]),
                  reverse=True)


def main() -> int:
    """Run preregistered experiments within one 24-hour GPU broker lease."""
    RESULTS.mkdir(parents=True, exist_ok=True)
    if not PY.is_file() or not CE.is_file():
        raise RuntimeError("VCC Python / cell-eval2 environment is not ready")
    visible = os.environ.get("CUDA_VISIBLE_DEVICES", "")
    if not visible or len(visible.split(",")) != 1:
        raise RuntimeError("JEV must assign exactly one GPU")
    import torch
    if not torch.cuda.is_available() or torch.cuda.device_count() != 1:
        raise RuntimeError("JEV GPU visibility validation failed")
    signal.signal(signal.SIGTERM, signal_stop)
    signal.signal(signal.SIGINT, signal_stop)
    # A genuine CUDA operation, verified and logged, before any local scoring.
    device = torch.device("cuda")
    matrix = torch.randn((4096, 4096), device=device)
    baseline_cuda_norm = float((matrix @ matrix.T).norm().item())
    del matrix
    torch.cuda.synchronize()
    gpu_script = evaluator_gpu_script()
    start = time.monotonic()
    deadline = start + MAX_SECONDS
    rows = []
    if SCORES.exists():
        for line in SCORES.read_text(encoding="utf-8").splitlines():
            try:
                rows.append(json.loads(line))
            except ValueError:
                continue
    previously = {
        (r.get("candidate"), r.get("context"), r.get("seed"))
        for r in rows
    }
    state = {
        "project": "vcc2026-transfer",
        "status": "RUNNING",
        "started_utc": stamp(),
        "max_runtime_hours": 24,
        "gpu_visible": visible,
        "cuda_preflight_norm": baseline_cuda_norm,
        "scientific_pre_registration": [
            {"name": name, "edits": edits} for name, edits in CANDIDATES
        ],
        "seeds": list(SEEDS),
        "score_source": "LOCAL cell-eval2 preset vcc2026; NOT official test",
        "official_final_test_used_in_training": False,
        "official_submission_modified": False,
        "results": str(SCORES),
    }
    save(state)

    # Run baseline first in all three contexts to establish a frozen control.
    for name, edits in CANDIDATES:
        if STOP or time.monotonic() >= deadline:
            break
        for ctx in FIXTURES:
            if STOP or time.monotonic() >= deadline:
                break
            for seed in SEEDS:
                if STOP or time.monotonic() >= deadline:
                    break
                key = (name, ctx, seed)
                if key in previously:
                    continue
                state["current"] = {
                    "candidate": name, "context": ctx, "seed": seed,
                }
                save(state)
                record = run_case(name, edits, ctx, seed, deadline, gpu_script)
                record["finished_utc"] = stamp()
                with SCORES.open("a", encoding="utf-8") as out:
                    out.write(json.dumps(record, ensure_ascii=False) + "\n")
                    out.flush()
                    os.fsync(out.fileno())
                rows.append(record)
                previously.add(key)
                state["evaluations_done"] = len(rows)
                state["last_success"] = record.get("status")
                state["last_score"] = record.get("score")
                state["ranked_complete_candidates"] = outcome_table(rows)
                save(state)
                if record["status"] == "FAILED":
                    # Stop a broken evaluator rather than burning the full day.
                    state["status"] = "BLOCKED_EVALUATOR"
                    save(state)
                    return 3
    ranking = outcome_table(rows)
    baseline = next((x for x in ranking
                     if x["candidate"] == "baseline_gamma1"), None)
    best = ranking[0] if ranking else None
    accepted = False
    if baseline is not None and best is not None:
        accepted = (
            best["worst_context"] >= baseline["worst_context"] + 0.01
            and best["h1b"] >= baseline["h1b"] - 0.01
        )
    state.update({
        "status": "REVIEW_REQUIRED" if ranking else "INSUFFICIENT_VALID_CASES",
        "finished_utc": stamp(),
        "evaluations_done": len(rows),
        "baseline": baseline,
        "best_local_candidate": best,
        "promotable_under_preregistered_rule": accepted,
        "official_submission_modified": False,
    })
    save(state)
    return 0 if ranking else 4


if __name__ == "__main__":
    raise SystemExit(main())
