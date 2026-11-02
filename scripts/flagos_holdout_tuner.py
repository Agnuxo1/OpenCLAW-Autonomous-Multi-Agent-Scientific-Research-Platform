#!/usr/bin/env python3
"""Controlled FlagOS Triton search with out-of-sample CUDA-graph validation.

The existing unmodified baseline and tiled kernels are benchmarked over a
finite, predeclared grid. Training seeds select each shape's candidate; held-
out seeds validate the selection. The job executes on one JEV-leased GPU.
"""
from __future__ import annotations
import csv
import datetime as dt
import hashlib
import itertools
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
import bench_sigmoid_gate as existing

TRAIN_SEEDS = (11, 37)
HOLDOUT_SEEDS = (142, 719, 2026)
GRID = ((256, 4), (512, 4), (1024, 4), (2048, 4),
        (256, 8), (512, 8), (1024, 8), (2048, 8),
        (4096, 4), (4096, 8))
ROUNDS = 12
GRAPH_REPS = 64
WALL_LIMIT_SECONDS = 1800

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

def bench(fn):
    """Use GPU events around CUDA Graph replay, excluding Python dispatch."""
    fn()
    torch.cuda.synchronize()
    graph = torch.cuda.CUDAGraph()
    with torch.cuda.graph(graph):
        for _ in range(GRAPH_REPS):
            fn()
    graph.replay()
    torch.cuda.synchronize()
    start, end = (torch.cuda.Event(enable_timing=True),
                  torch.cuda.Event(enable_timing=True))
    start.record()
    graph.replay()
    end.record()
    end.synchronize()
    return start.elapsed_time(end) * 1000.0 / GRAPH_REPS

def execute(cfg, x, gate):
    if cfg == "baseline":
        d = x.shape[1]
        warp = max(4, min(triton.next_power_of_2(triton.cdiv(d, 256)), 32))
        return existing.run_baseline(x, gate, warp)
    block, warps = cfg
    return existing.run_tiled(x, gate, block, warps)

def label(cfg):
    if cfg == "baseline":
        return cfg
    return f"tile{cfg[0]}_w{cfg[1]}"

def evaluate_shape(shape, train_writer, test_writer, rng, start):
    n, d = shape
    configs = ["baseline"] + [cfg for cfg in GRID if cfg[0] <= d]
    estimates = {}
    for seeds, split, writer in (
        (TRAIN_SEEDS, "train", train_writer),
        (HOLDOUT_SEEDS, "holdout", test_writer),
    ):
        for seed in seeds:
            if time.monotonic() - start > WALL_LIMIT_SECONDS:
                raise TimeoutError("Global resource/time limit exceeded")
            torch.manual_seed(seed)
            x = torch.randn((n, d), device="cuda", dtype=existing.DTYPE)
            gate = torch.randn((n, 1), device="cuda", dtype=existing.DTYPE)
            expected = (x.float() * torch.sigmoid(gate.float())).to(existing.DTYPE)
            for cfg in configs:
                torch.testing.assert_close(execute(cfg, x, gate), expected,
                                           rtol=1e-2, atol=2e-2)
            times = {label(cfg): [] for cfg in configs}
            for rnd in range(ROUNDS):
                order = list(configs)
                rng.shuffle(order)
                for cfg in order:
                    timing = bench(lambda cfg=cfg: execute(cfg, x, gate))
                    if not math.isfinite(timing) or timing <= 0:
                        raise ValueError("Invalid GPU timing result")
                    times[label(cfg)].append(timing)
                    writer.writerow([n, d, split, seed, rnd, label(cfg),
                                     f"{timing:.9f}"])
            base = statistics.median(times["baseline"])
            for key, vals in times.items():
                estimates.setdefault(split, {}).setdefault(key, []).append(
                    base / statistics.median(vals))
            print(f"{shape} {split} seed={seed}: baseline {base:.3f} GPU us", flush=True)
    training = estimates["train"]
    selected = max((cfg for cfg in configs if cfg != "baseline"),
                   key=lambda cfg: statistics.median(training[label(cfg)]))
    name = label(selected)
    return {
        "shape": [n, d], "selected": name,
        "tuning_speedup_median": statistics.median(training[name]),
        "holdout_speedup_median": statistics.median(estimates["holdout"][name]),
        "holdout_speedup_minimum": min(estimates["holdout"][name]),
        "holdout_seed_speedups": estimates["holdout"][name],
        "selected_by": "training seeds only; strict held-out validation",
        "candidate_count": len(configs)-1,
    }

def main():
    if not os.environ.get("CUDA_VISIBLE_DEVICES") or "," in os.environ["CUDA_VISIBLE_DEVICES"]:
        raise RuntimeError("A single JEV-assigned CUDA device is required")
    if not torch.cuda.is_available() or torch.cuda.device_count() != 1:
        raise RuntimeError("The lease does not expose exactly one active GPU")
    start = time.monotonic()
    out = ROOT / "analysis"
    out.mkdir(parents=True, exist_ok=True)
    summary = {
        "start_utc": now(), "device": torch.cuda.get_device_name(0),
        "visible_gpu": os.environ["CUDA_VISIBLE_DEVICES"],
        "train_seeds": TRAIN_SEEDS, "holdout_seeds": HOLDOUT_SEEDS,
        "grid": GRID, "rounds": ROUNDS, "graph_replays": GRAPH_REPS,
        "torch": torch.__version__, "triton": triton.__version__,
        "source_sha256": hashlib.sha256(
            (ROOT / "benchmarks" / "bench_sigmoid_gate.py").read_bytes()).hexdigest(),
        "selection": [],
        "limitations": [
            "CUDA Graph replay performance differs from end-to-end Python latency",
            "Official challenge hardware, shapes and scoring must be independently checked",
            "Using fastest measured training candidate is subject to selection bias",
        ],
    }
    rng = random.Random(50102)
    with (out / "tuning.csv").open("w", newline="", encoding="utf-8") as trainfile, (
        out / "holdout.csv").open("w", newline="", encoding="utf-8") as testfile:
        writer1, writer2 = csv.writer(trainfile), csv.writer(testfile)
        header = ["N", "D", "split", "seed", "round", "candidate", "gpu_us"]
        writer1.writerow(header)
        writer2.writerow(header)
        for shape in existing.SHAPES:
            result = evaluate_shape(shape, writer1, writer2, rng, start)
            summary["selection"].append(result)
            summary["last_updated_utc"] = now()
            (out / "summary.json").write_text(
                json.dumps(summary, indent=2, ensure_ascii=False)+"\n",
                encoding="utf-8")
            print("selected", shape, result["selected"],
                  "holdout", round(result["holdout_speedup_median"], 4), flush=True)
    summary["end_utc"] = now()
    summary["elapsed_seconds"] = round(time.monotonic()-start, 2)
    summary["status"] = "complete"
    (out / "summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False)+"\n",encoding="utf-8")
    return 0

if __name__ == "__main__":
    sys.exit(main())
