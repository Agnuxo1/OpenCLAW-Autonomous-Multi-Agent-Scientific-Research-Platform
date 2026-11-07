#!/usr/bin/env python3
"""Independent, GPU-only CUDA Graph audit of the FlagOS sigmoid-gate kernels.

Benchmarks existing competition code without altering it; outputs raw GPU
latencies, source provenance, correctness checks and robust comparison.
Only run with a Server-IA GPU lease. All documentation is English.
"""
from __future__ import annotations
import csv
import datetime as dt
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import random
import statistics
import sys
import time

import torch
import triton

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "benchmarks"))
import bench_sigmoid_gate as kernels

SHAPES = list(kernels.SHAPES)
SEEDS = (19, 71, 2026)
ROUNDS = 15
REPEATS = 48
CFG = (("baseline", None, None), ("tile512", 512, 4),
       ("tile1024", 1024, 4), ("tile2048", 2048, 8))

def filename_sha256(path: Path) -> str:
    """Hash original code to ensure results track a fixed implementation."""
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run_one(cfg: tuple, x: torch.Tensor, gate: torch.Tensor) -> torch.Tensor:
    """Invoke the actual existing competition kernel without modification."""
    name, block, warps = cfg
    if name == "baseline":
        base_warps = max(4, min(triton.next_power_of_2(triton.cdiv(x.shape[1], 256)), 32))
        return kernels.run_baseline(x, gate, base_warps)
    return kernels.run_tiled(x, gate, block, warps)

def measure_cuda_graph(fn, loops: int = REPEATS) -> float:
    """Measure CUDA-graph replay latency, avoiding Python launch overhead."""
    fn()
    torch.cuda.synchronize()
    graph = torch.cuda.CUDAGraph()
    with torch.cuda.graph(graph):
        for _ in range(loops):
            fn()
    graph.replay()
    torch.cuda.synchronize()
    begin = torch.cuda.Event(enable_timing=True)
    end = torch.cuda.Event(enable_timing=True)
    begin.record()
    graph.replay()
    end.record()
    end.synchronize()
    return begin.elapsed_time(end) * 1000.0 / loops

def main() -> int:
    """Run seeded numerical validation and randomised graph-latency trials."""
    if not torch.cuda.is_available() or torch.cuda.device_count() != 1:
        raise RuntimeError("Job must have exactly one CUDA-visible JEV-assigned GPU.")
    output = ROOT / "analysis"
    output.mkdir(parents=True, exist_ok=True)
    start = dt.datetime.now(dt.timezone.utc).isoformat()
    raw_rows = []
    summary = []
    device_name = torch.cuda.get_device_name(0)
    rng = random.Random(502621)
    for n, d in SHAPES:
        for seed in SEEDS:
            torch.manual_seed(seed)
            x = torch.randn((n, d), dtype=kernels.DTYPE, device="cuda")
            gate = torch.randn((n, 1), dtype=kernels.DTYPE, device="cuda")
            expected = (x.float() * torch.sigmoid(gate.float())).to(kernels.DTYPE)
            candidates = list(CFG)
            times = {cfg[0]: [] for cfg in candidates}
            for cfg in candidates:
                result = run_one(cfg, x, gate)
                torch.testing.assert_close(result, expected, rtol=1e-2, atol=2e-2)
            for round_number in range(ROUNDS):
                rng.shuffle(candidates)
                for cfg in candidates:
                    us = measure_cuda_graph(lambda cfg=cfg: run_one(cfg, x, gate))
                    if not math.isfinite(us) or us <= 0:
                        raise RuntimeError("Nonpositive/nonfinite CUDA timing")
                    times[cfg[0]].append(us)
                    raw_rows.append([n, d, seed, round_number, cfg[0], f"{us:.6f}"])
            baseline = statistics.median(times["baseline"])
            for cfg in CFG:
                name = cfg[0]
                values = times[name]
                speedup = baseline / statistics.median(values)
                summary.append({
                    "shape": [n, d], "seed": seed, "kernel": name,
                    "median_gpu_us": round(statistics.median(values), 6),
                    "min_gpu_us": round(min(values), 6),
                    "max_gpu_us": round(max(values), 6),
                    "speedup_vs_baseline": round(speedup, 6),
                    "valid_correctness": True,
                    "rounds": ROUNDS,
                })
            print(f"Shape N={n}, D={d}, seed={seed}: baseline {baseline:.4f} GPU us", flush=True)
    csvpath = output / "cudagraph_measurements.csv"
    with csvpath.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(("N", "D", "seed", "round", "kernel", "gpu_us"))
        writer.writerows(raw_rows)
    info = {
        "start_utc": start,
        "finish_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "gpu": device_name,
        "torch_version": torch.__version__,
        "triton_version": triton.__version__,
        "dtype": str(kernels.DTYPE),
        "shapes": SHAPES,
        "seeds": SEEDS,
        "rounds": ROUNDS,
        "graph_replays_per_measurement": REPEATS,
        "measurement": "GPU CUDA Event elapsed time for CUDA Graph replay / kernel count",
        "baseline_file_sha256": filename_sha256(ROOT / "benchmarks" / "bench_sigmoid_gate.py"),
        "audit_file_sha256": filename_sha256(Path(__file__)),
        "cuda_visible_devices": os.environ.get("CUDA_VISIBLE_DEVICES", ""),
        "summary": summary,
        "important_limitations": [
            "Measured GPU graph latency is not end-to-end Python dispatch latency.",
            "Only local RTX 3090 timing; benchmark platform hardware may differ.",
            "Absolute speedups require independent hold-out repeats and organizer tests.",
        ]
    }
    (output / "cudagraph_report.json").write_text(json.dumps(info, indent=2)+"\n", encoding="utf-8")
    print("Independent audit finished:", len(raw_rows), "raw GPU measurements", flush=True)
    print("Saved:", csvpath, flush=True)
    return 0

if __name__ == "__main__":
    sys.exit(main())
