#!/usr/bin/env python3
"""Independent cross-seed structural robustness replication for PDC2026.

Select a frozen, CDR3-diverse shortlist from earlier completed Boltz2 models.
Repeat with three unseen seeds under the same model and sampling settings.
Rank by conservative NK2R-VHH pair confidence mean and minimum across seeds.

This is neither an AlphaFold3 official evaluation nor evidence of agonism.
The experiment is strictly JEV GPU1-bound and checks host RAM before each
Boltz process so that concurrent VCC2026 evaluation is not killed by OOM.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import statistics
import subprocess
import sys
import time

ROOT = Path("/mnt/datos/competition-24h/pdc")
LOGS = ROOT / "logs"
RESULTS = ROOT / "results"
SOURCE = RESULTS / "candidate_metrics.jsonl"
RAW = RESULTS / "replication_metrics.jsonl"
STATE = ROOT / "replication_state.json"
MANIFEST = ROOT / "replication_manifest.json"
BOLTZ = ROOT / "venv/bin/boltz"
SEEDS = (20261901, 20261902, 20261903)
SELECT_N = 6
MIN_CDR3_DISTANCE = 3
MIN_AVAILABLE_RAM_GIB = 7.5
STOP = False


def timestamp() -> str:
    """Produce a UTC timestamp with timezone information."""
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def on_stop(_sig: int, _frame: object) -> None:
    """Ask for a safe stop after the current model run."""
    global STOP
    STOP = True


def save(path: Path, document: dict) -> None:
    """Write a complete JSON checkpoint atomically."""
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n")
    temp.replace(path)


def records(path: Path) -> list[dict]:
    """Load existing append-only measurements without changing them."""
    if not path.is_file():
        return []
    answer = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            item = json.loads(line)
            if isinstance(item, dict):
                answer.append(item)
        except ValueError:
            continue
    return answer


def distance(a: str, b: str) -> int:
    """Measure exact Levenshtein edits between two amino-acid strings."""
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            curr.append(min(
                prev[j] + 1, curr[j - 1] + 1,
                prev[j - 1] + (ca != cb),
            ))
        prev = curr
    return prev[-1]


def shortlist() -> list[dict]:
    """Freeze top six CDR3-distinct sequences, not cherry-picked new results."""
    source = [
        x for x in records(SOURCE)
        if x.get("status") == "STRUCTURE_PREDICTED"
        and x.get("score_type", "").startswith(
            "Boltz_conservative_bidirectional_NK2R_VHH_pair_iptm"
        )
        and isinstance(x.get("nk2r_vhh_pair_iptm"), (int, float))
        and x.get("sequence") and x.get("cdr3")
    ]
    source.sort(key=lambda x: x["nk2r_vhh_pair_iptm"], reverse=True)
    chosen = []
    for item in source:
        if all(distance(item["cdr3"], other["cdr3"]) >= MIN_CDR3_DISTANCE
               for other in chosen):
            chosen.append({
                "candidate": item["candidate"], "cdr3": item["cdr3"],
                "sequence": item["sequence"],
                "original_pair_iptm": item["nk2r_vhh_pair_iptm"],
            })
        if len(chosen) >= SELECT_N:
            break
    if len(chosen) < SELECT_N:
        raise RuntimeError("Not enough diverse VHH candidates to replicate")
    if MANIFEST.is_file():
        previous = json.loads(MANIFEST.read_text(encoding="utf-8"))
        if previous["selected"] != chosen or previous["seeds"] != list(SEEDS):
            raise RuntimeError("Frozen replication manifest changed")
    else:
        save(MANIFEST, {
            "frozen_at_utc": timestamp(),
            "selected": chosen, "seeds": list(SEEDS),
            "model": "Boltz 2.0.3, recycling 3, sampling 100, one diffusion",
            "diversity_levenshtein_min": MIN_CDR3_DISTANCE,
            "scientific_limitation": "No official AF3 score; no agonism assay.",
        })
    return chosen


def mem_available() -> float:
    """Read the physical available RAM in GiB before launching expensive jobs."""
    fields = dict(line.split(":", 1) for line in
                  Path("/proc/meminfo").read_text().splitlines()
                  if ":" in line)
    return int(fields["MemAvailable"].split()[0]) / 1024**2


def current_deadline() -> dt.datetime:
    """Use the ORIGINAL JEV deadline, not a 24-hour period restarted now."""
    sys.path.insert(0, "/home/ai/servidor-ia")
    import cola
    entry = cola.entry_for("pdc2026", cola.load())
    if not entry or entry.get("carril") != "gpu1":
        raise RuntimeError("PDC2026 does not hold its JEV lane")
    if entry.get("estado") != "EN CURSO" or entry.get("vencido"):
        raise RuntimeError("PDC2026 lease is not valid")
    return dt.datetime.fromisoformat(entry["plazo_utc"].replace(
        "Z", "+00:00"))


def predict(item: dict, seed: int, deadline: dt.datetime) -> dict:
    """Execute one CUDA Boltz2 structural seed and preserve raw evidence."""
    candidate = item["candidate"]
    run_id = f"replica_{candidate}_seed_{seed}"
    yaml = ROOT / "inputs" / (run_id + ".yaml")
    source_yaml = ROOT / "inputs" / (candidate + ".yaml")
    # Keep the target/sequence constant across original and replicates.
    content = source_yaml.read_text(encoding="utf-8")
    yaml.write_text(content, encoding="utf-8")
    out_dir = RESULTS / "replications" / run_id
    log = LOGS / (run_id + ".log")
    command = [
        str(BOLTZ), "predict", str(yaml),
        "--model", "boltz2", "--cache", str(ROOT / "boltz-cache"),
        "--out_dir", str(out_dir), "--accelerator", "gpu",
        "--devices", "1", "--num_workers", "0",
        "--preprocessing-threads", "1", "--recycling_steps", "3",
        "--sampling_steps", "100", "--diffusion_samples", "1",
        "--max_parallel_samples", "1", "--seed", str(seed),
    ]
    timeout = min(3600, max(1, int((deadline - dt.datetime.now(
        dt.timezone.utc)).total_seconds()) - 150))
    started = timestamp()
    try:
        with log.open("w", encoding="utf-8") as stream:
            stream.write("COMMAND " + " ".join(command) + "\n")
            stream.flush()
            result = subprocess.run(
                command, stdout=stream, stderr=subprocess.STDOUT,
                check=False, timeout=timeout,
            )
        confidences = sorted(out_dir.rglob("confidence*.json"))
        if result.returncode or not confidences:
            return {"candidate": candidate, "seed": seed, "status": "FAILED",
                    "exit_code": result.returncode, "started_utc": started}
        confidence = confidences[0]
        evidence = json.loads(confidence.read_text(encoding="utf-8"))
        pairs = evidence.get("pair_chains_iptm", {})
        values = (float(pairs["0"]["2"]), float(pairs["2"]["0"]))
        score = min(values)
        if not math.isfinite(score):
            raise ValueError("Non-finite ipTM")
        return {
            "candidate": candidate, "seed": seed, "status": "SUCCEEDED",
            "pair_iptm": score, "directional_pair_iptm": list(values),
            "global_iptm": evidence.get("iptm"),
            "confidence_sha256": hashlib.sha256(confidence.read_bytes()).hexdigest(),
            "confidence_path": str(confidence),
            "started_utc": started, "finished_utc": timestamp(),
            "official_af3_score": None,
            "agonism_measured": False,
        }
    except (subprocess.TimeoutExpired, ValueError, OSError, KeyError) as error:
        return {
            "candidate": candidate, "seed": seed,
            "status": "FAILED", "error_type": type(error).__name__,
            "started_utc": started, "finished_utc": timestamp(),
        }


def analyze(entries: list[dict], selected: list[dict]) -> list[dict]:
    """Rank independently replicated candidates with variance and worst seed."""
    stats = []
    for c in selected:
        valid = [row["pair_iptm"] for row in entries
                 if row.get("candidate") == c["candidate"]
                 and row.get("seed") in SEEDS
                 and row.get("status") == "SUCCEEDED"]
        if len(valid) < len(SEEDS):
            continue
        stats.append({
            "candidate": c["candidate"], "cdr3": c["cdr3"],
            "initial_score": c["original_pair_iptm"],
            "mean_pair_iptm": statistics.mean(valid),
            "minimum_pair_iptm": min(valid),
            "std_pair_iptm": statistics.stdev(valid),
            "replicate_seeds": list(SEEDS),
            "official_af3_iptm": None,
            "agonism_verified": False,
        })
    return sorted(stats, key=lambda row: (row["minimum_pair_iptm"],
                                           row["mean_pair_iptm"]), reverse=True)


def main() -> int:
    """Complete at most 18 seed models within JEV lease with RAM safety gates."""
    if os.environ.get("CUDA_VISIBLE_DEVICES") != "1":
        raise RuntimeError("One exclusive JEV-assigned GPU1 is required")
    import torch
    if not torch.cuda.is_available() or torch.cuda.device_count() != 1:
        raise RuntimeError("JEV/CUDA device isolation did not pass")
    import time as timer
    signal.signal(signal.SIGTERM, on_stop)
    signal.signal(signal.SIGINT, on_stop)
    deadline = current_deadline()
    choices = shortlist()
    observed = records(RAW)
    completed = {
        (x["candidate"], x["seed"]) for x in observed
        if x.get("status") == "SUCCEEDED"
    }
    state = {
        "project": "pdc2026", "phase": "INDEPENDENT_SEED_REPLICATION",
        "status": "RUNNING", "start_utc": timestamp(),
        "jev_deadline": deadline.isoformat(),
        "candidates": len(choices),
        "seeds_per_candidate": len(SEEDS),
        "score_type": "Boltz conservative NK2R-VHH pair ipTM, NOT official",
        "raw_file": str(RAW),
    }
    save(STATE, state)
    for item in choices:
        for seed in SEEDS:
            if STOP or dt.datetime.now(dt.timezone.utc) >= (
                    deadline - dt.timedelta(minutes=3)):
                break
            if (item["candidate"], seed) in completed:
                continue
            while (mem_available() < MIN_AVAILABLE_RAM_GIB
                   and not STOP and dt.datetime.now(dt.timezone.utc) <
                   deadline - dt.timedelta(minutes=3)):
                state.update({
                    "status": "WAITING_FOR_SAFE_RAM",
                    "available_ram_gib": round(mem_available(), 2),
                    "updated_at": timestamp(),
                    "current_candidate": item["candidate"],
                })
                save(STATE, state)
                timer.sleep(35)
            if STOP or dt.datetime.now(dt.timezone.utc) >= (
                    deadline - dt.timedelta(minutes=3)):
                break
            state.update({
                "status": "RUNNING", "current_candidate": item["candidate"],
                "current_seed": seed, "updated_at": timestamp(),
                "available_ram_gib": round(mem_available(), 2),
            })
            save(STATE, state)
            result = predict(item, seed, deadline)
            with RAW.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(result) + "\n")
                stream.flush()
                os.fsync(stream.fileno())
            observed.append(result)
            if result.get("status") == "SUCCEEDED":
                completed.add((item["candidate"], seed))
            state["completed_valid_replicates"] = len(completed)
            state["replicated_ranking"] = analyze(observed, choices)
            save(STATE, state)
        if STOP:
            break
    state.update({
        "status": "REVIEW_REQUIRED" if analyze(observed, choices)
        else "INCOMPLETE_REPLICATION",
        "finished_at": timestamp(),
        "best_replicated_candidates": analyze(observed, choices)[:3],
        "official_submission": False,
    })
    save(STATE, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
