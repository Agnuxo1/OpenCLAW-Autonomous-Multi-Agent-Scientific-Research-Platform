#!/usr/bin/env python3
"""PDC2026 NK2R nanobody structural screening, capped at 24 hours on one JEV GPU.

This is an exploratory computational experiment, not an experimentally proven
agonist and not an official AlphaFold3 ipTM evaluation. Candidates must not be
submitted automatically. All Boltz predictions, negative controls, seeds,
confidence JSON and failures are retained for independent scientific review.
"""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import random
import re
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = Path("/mnt/datos/competition-24h/pdc")
INPUTS = ROOT / "inputs"
OUTPUTS = ROOT / "results"
LOGS = ROOT / "logs"
BOLTZ = ROOT / "venv/bin/boltz"
CHECKPOINT = ROOT / "experiment_state.json"
RESULTS = OUTPUTS / "candidate_metrics.jsonl"
MAX_SECONDS = 23 * 3600 + 50 * 60
MAX_CANDIDATES = 72
SEED = 20261103

# These are generic VHH-framework, non-agonist reference hypotheses. Their
# functional NK2R agonism is unknown until independent wet-lab experiments.
FR1_CDR1_FR2_CDR2_FR3 = (
    "QVQLVESGGGLVQPGGSLRLSCAASGFTFSSYAMGWFRQAPGKEREFVAAISWSDGSTYY"
    "ADSVKGRFTISRDNAKNTLYLQMNSLRAEDTAVYYC"
)
FR4 = "WGQGTQVTVSS"
SEED_CDR3 = [
    "ARGPYWNTYFDR", "ARRSTYYGWFDS", "ARDGWSYTYQDY", "ARHVYPGWYTDS",
    "ARRGYVSSWQDY", "ARDYYGPTYWGS", "ARNYQGWTYFDY", "ARSHWYGDYQGS",
    "ARGDGWYYRTDY", "ARSTYSWGPFDY", "ARVYDPGWTYYS", "ARRNYSWDGFDR",
    "ARHHYGDWTYTS", "ARGLYDYWSTGS", "ARNPYGWTSVDY", "ARSTYHGWFDNY",
]
AA = set("ACDEFGHIKLMNPQRSTVWY")
CDR_ALPHABET = "YSGWNTDAHRQPF"
STOP = False


def utc() -> str:
    """Return a UTC timestamp for checkpoints and provenance."""
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def on_stop(_sig: int, _frame: object) -> None:
    """Stop at the next safe checkpoint when JEV terminates the sprint."""
    global STOP
    STOP = True


def save(state: dict) -> None:
    """Atomically persist scientific state and avoid partial JSON output."""
    state["checked_utc"] = utc()
    temp = CHECKPOINT.with_suffix(".tmp")
    temp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")
    temp.replace(CHECKPOINT)


def fetch_uniprot(accession: str, expected_gene: str) -> dict:
    """Retrieve and hash an authoritative public reference protein sequence."""
    destination = INPUTS / f"{accession}.fasta"
    if destination.is_file():
        text = destination.read_text(encoding="utf-8")
    else:
        req = urllib.request.Request(
            f"https://rest.uniprot.org/uniprotkb/{accession}.fasta",
            headers={"User-Agent": "Server-IA-PDC2026-scientific-research/1.0"},
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            text = response.read(20_000).decode("utf-8")
        destination.write_text(text, encoding="utf-8")
    header, *body = text.strip().splitlines()
    sequence = "".join(body).upper()
    if (expected_gene not in header or not sequence
            or any(aa not in AA for aa in sequence)):
        raise ValueError(f"Uniprot reference check failed: {accession}")
    return {
        "accession": accession, "gene": expected_gene,
        "length": len(sequence), "sequence": sequence,
        "sha256": hashlib.sha256(sequence.encode("ascii")).hexdigest(),
        "downloaded_file": str(destination),
    }


def candidate_sequence(cdr: str) -> str:
    """Construct a conventional VHH-length test sequence from variable CDR3."""
    result = FR1_CDR1_FR2_CDR2_FR3 + cdr + FR4
    if not 100 <= len(result) <= 150:
        raise ValueError(f"Invalid VHH length {len(result)}")
    if any(aa not in AA for aa in result):
        raise ValueError("Noncanonical amino acid in candidate")
    if len(set(cdr)) < 6 or len(cdr) < 10:
        raise ValueError("CDR3 diversity requirement failed")
    return result


def candidate_id(sequence: str) -> str:
    """Provide reproducible, content-addressed candidate identifiers."""
    return "vhh_" + hashlib.sha256(sequence.encode()).hexdigest()[:12]


def create_yaml(identifier: str, vhh: str, nk2r: str, gnaq: str) -> Path:
    """Write a defined NK2R/GNAQ/VHH complex for Boltz, without ligands."""
    source = INPUTS / (identifier + ".yaml")
    yaml = (
        "version: 1\nsequences:\n"
        f"  - protein:\n      id: A\n      sequence: {nk2r}\n      msa: empty\n"
        f"  - protein:\n      id: B\n      sequence: {gnaq}\n      msa: empty\n"
        f"  - protein:\n      id: C\n      sequence: {vhh}\n      msa: empty\n"
    )
    source.write_text(yaml, encoding="utf-8")
    return source


def structure_confidence(result_dir: Path) -> dict:
    """Read a genuine model confidence file, never a fabricated score."""
    files = sorted(result_dir.rglob("confidence*.json"))
    if not files:
        return {"status": "FAILED_NO_CONFIDENCE", "score": None}
    data = json.loads(files[0].read_text(encoding="utf-8"))
    inter = data.get("pair_chains_iptm")
    pair = None
    if isinstance(inter, dict):
        try:
            forward = float(inter["0"]["2"])
            reverse = float(inter["2"]["0"])
            pair = min(forward, reverse)
        except (KeyError, TypeError, ValueError):
            pair = None
    elif isinstance(inter, list) and len(inter) >= 3:
        try:
            pair = min(float(inter[0][2]), float(inter[2][0]))
        except (TypeError, ValueError, IndexError):
            pair = None
    global_iptm = data.get("iptm")
    return {
        "status": "STRUCTURE_PREDICTED",
        "score": pair,
        "score_type": "Boltz_conservative_bidirectional_NK2R_VHH_pair_iptm_NOT_official",
        "boltz_iptm": global_iptm,
        "nk2r_vhh_pair_iptm": pair,
        "ptm": data.get("ptm"),
        "complex_plddt": data.get("complex_plddt"),
        "confidence_file": str(files[0]),
        "confidence_sha256": hashlib.sha256(files[0].read_bytes()).hexdigest(),
    }


def run_one(identifier: str, sequence: str, reference: dict, seed: int,
            deadline: float) -> dict:
    """Execute one genuine CUDA Boltz prediction with bounded time and logs."""
    yaml = create_yaml(
        identifier, sequence,
        reference["TACR2"]["sequence"], reference["GNAQ"]["sequence"],
    )
    run_dir = OUTPUTS / identifier
    log = LOGS / f"{identifier}.log"
    command = [
        str(BOLTZ), "predict", str(yaml), "--model", "boltz2",
        "--cache", str(ROOT / "boltz-cache"),
        "--out_dir", str(run_dir),
        "--accelerator", "gpu", "--devices", "1",
        "--num_workers", "0", "--preprocessing-threads", "1",
        "--recycling_steps", "3", "--sampling_steps", "100",
        "--diffusion_samples", "1", "--seed", str(seed),
        "--max_parallel_samples", "1",
    ]
    remain = max(1, deadline - time.monotonic())
    timeout = min(remain, 4200)
    started = utc()
    try:
        with log.open("w", encoding="utf-8") as handle:
            handle.write("COMMAND: " + " ".join(command) + "\n")
            handle.flush()
            result = subprocess.run(
                command, stdout=handle, stderr=subprocess.STDOUT,
                timeout=timeout, check=False, env=os.environ.copy(),
            )
        info = structure_confidence(run_dir) if not result.returncode else {
            "status": "BOLTZ_EXIT_NONZERO", "score": None,
        }
        info["exit_code"] = result.returncode
    except subprocess.TimeoutExpired:
        info = {"status": "BOLTZ_TIMEOUT", "score": None, "exit_code": -9}
    info.update({
        "candidate": identifier, "sequence": sequence, "cdr3": sequence[
            len(FR1_CDR1_FR2_CDR2_FR3):-len(FR4)],
        "seed": seed, "started_utc": started, "finished_utc": utc(),
        "model": "Boltz-2", "predicted_agonist": False,
        "official_af3_iptm": None,
        "attempted": True,
    })
    with RESULTS.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(info, ensure_ascii=False) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    return info


def propose_variants(best: list[dict], rng: random.Random, seen: set[str]
                     ) -> list[str]:
    """Generate diverse adjacent CDR3 hypotheses, retaining a control population."""
    proposals = []
    for item in best[:4]:
        cdr = item["cdr3"]
        for _ in range(5):
            x = list(cdr)
            for _ in range(rng.choice((1, 2, 3))):
                pos = rng.randrange(2, len(x))
                x[pos] = rng.choice(CDR_ALPHABET)
            changed = "".join(x)
            seq = candidate_sequence(changed)
            if seq not in seen:
                proposals.append(seq)
                seen.add(seq)
    rng.shuffle(proposals)
    return proposals


def main() -> int:
    """Run one reproducible 24-hour-limited design-and-structure screening sprint."""
    for path in (INPUTS, OUTPUTS, LOGS):
        path.mkdir(parents=True, exist_ok=True)
    if not BOLTZ.is_file():
        raise RuntimeError("Boltz environment missing; no GPU work launched")
    cuda = os.environ.get("CUDA_VISIBLE_DEVICES", "")
    if len(cuda.split(",")) != 1 or not cuda:
        raise RuntimeError("JEV must expose exactly one NVIDIA GPU")
    import torch
    if not torch.cuda.is_available() or torch.cuda.device_count() != 1:
        raise RuntimeError("CUDA not correctly confined to one GPU")
    signal.signal(signal.SIGTERM, on_stop)
    signal.signal(signal.SIGINT, on_stop)
    started = time.monotonic()
    deadline = started + MAX_SECONDS
    reference = {
        "TACR2": fetch_uniprot("P21452", "TACR2"),
        "GNAQ": fetch_uniprot("P50148", "GNAQ"),
    }
    provenance = {
        k: {x: y for x, y in v.items() if x != "sequence"}
        for k, v in reference.items()
    }
    (ROOT / "target_provenance.json").write_text(
        json.dumps(provenance, indent=2) + "\n", encoding="utf-8"
    )
    state = {
        "project": "pdc2026", "status": "RUNNING",
        "started_utc": utc(), "limit_hours": 24,
        "gpu_visible": cuda, "current_round": 0,
        "reference": provenance, "results": str(RESULTS),
        "scientific_limitations": (
            "Boltz is NOT official AlphaFold3; structural binding is NOT "
            "experimental agonism. No competition submission is made."
        ),
    }
    save(state)
    recorded = {}
    if RESULTS.exists():
        for line in RESULTS.read_text(encoding="utf-8").splitlines():
            try:
                item = json.loads(line)
                recorded[item["candidate"]] = item
            except (ValueError, KeyError):
                continue
    rng = random.Random(SEED)
    pending = [candidate_sequence(s) for s in SEED_CDR3]
    seen = set(pending)
    best = []
    failures = 0
    no_gain = 0
    previous_best = float("-inf")

    while not STOP and time.monotonic() < deadline:
        if len(recorded) >= MAX_CANDIDATES:
            break
        if not pending:
            if not best or no_gain >= 2:
                break
            pending = propose_variants(best, rng, seen)
            state["current_round"] += 1
            if not pending:
                break
        sequence = pending.pop(0)
        identifier = candidate_id(sequence)
        if identifier in recorded:
            continue
        state["current_candidate"] = identifier
        state["evaluated"] = len(recorded)
        save(state)
        record = run_one(
            identifier, sequence, reference,
            seed=SEED + len(recorded), deadline=deadline,
        )
        recorded[identifier] = record
        if record.get("score") is not None and math.isfinite(record["score"]):
            best = sorted(
                (x for x in recorded.values() if x.get("score") is not None),
                key=lambda x: x["score"], reverse=True,
            )
            current = best[0]["score"]
            if current > previous_best + 0.015:
                previous_best, no_gain = current, 0
            elif len(recorded) % 12 == 0:
                no_gain += 1
        else:
            failures += 1
        state.update({
            "evaluated": len(recorded), "best_score": (
                best[0]["score"] if best else None),
            "best_candidate": (best[0]["candidate"] if best else None),
            "failed": failures, "last_run_utc": utc(),
        })
        save(state)
        if failures >= 3 and not best:
            break

    state.update({
        "status": "REVIEW_REQUIRED" if best else "BLOCKED_NO_VALID_STRUCTURES",
        "finished_utc": utc(), "evaluated": len(recorded),
        "top_candidates": [{
            "candidate": item["candidate"],
            "sequence": item["sequence"],
            "boltz_score": item["score"],
            "score_type": item.get("score_type"),
        } for item in best[:3]],
        "official_submission": False,
        "wetlab_activity_measured": False,
    })
    save(state)
    return 0 if best else 2


if __name__ == "__main__":
    raise SystemExit(main())
