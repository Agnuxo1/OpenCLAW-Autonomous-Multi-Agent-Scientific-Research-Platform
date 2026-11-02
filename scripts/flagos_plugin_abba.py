#!/usr/bin/env python3
"""ABBA crossover evaluation of FlagOS plugin vs stock vLLM on one leased GPU.

Both configurations serve the same locally cached MiniCPM checkpoint, with
identical prompts and random seed. Both compute real inference; neither uses
external model APIs. Only reproducible observations are reported.
"""
from __future__ import annotations
import datetime as dt
import json
import os
from pathlib import Path
import re
import signal
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "results"
MODEL = Path("/home/ai/proyectos/flagos-t2/MiniCPM5-2B")
VLLM = "/home/ai/proyectos/flagos-t2/.venv/bin/vllm"
MODES = ("native", "flagos", "flagos", "native")  # ABBA for drift control
SCENARIOS = (("short", 512, 128, 8, 64), ("long", 4096, 256, 16, 64))
PORT = 9047
MAX_SECONDS = 1700
global_stop = False
server = None

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

def handle_term(sig, frame):
    global global_stop
    global_stop = True
    if server and server.poll() is None:
        server.terminate()

def healthy():
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/v1/models",
                                    timeout=2) as result:
            return result.status == 200
    except (OSError, urllib.error.URLError):
        return False

def terminate_group():
    global server
    if server and server.poll() is None:
        try:
            os.killpg(server.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            server.wait(timeout=15)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(server.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            server.wait(timeout=10)
    server = None

def extract_metrics(logpath):
    text = logpath.read_text(encoding="utf-8", errors="replace")
    fields = {}
    for key, regex in (
        ("requests_per_sec", r"Request throughput \(req/s\):\s*([\d.]+)"),
        ("output_tokens_per_sec", r"Output token throughput \(tok/s\):\s*([\d.]+)"),
        ("total_tokens_per_sec", r"Total token throughput \(tok/s\):\s*([\d.]+)"),
        ("mean_time_to_first_token_ms", r"Mean TTFT \(ms\):\s*([\d.]+)"),
    ):
        match = re.search(regex, text)
        if not match:
            raise ValueError(f"Missing metric {key} in {logpath}")
        fields[key] = float(match.group(1))
    return fields

def main():
    global server
    signal.signal(signal.SIGTERM, handle_term)
    signal.signal(signal.SIGINT, handle_term)
    if not os.environ.get("CUDA_VISIBLE_DEVICES") or "," in os.environ["CUDA_VISIBLE_DEVICES"]:
        raise RuntimeError("One assigned GPU required through JEV broker.")
    if not MODEL.joinpath("model-00000-of-00001.safetensors").is_file():
        raise FileNotFoundError("No local model checkpoint available.")
    OUT.mkdir(parents=True, exist_ok=True)
    epoch = time.monotonic()
    results = {
        "experiment": "FlagOS plugin A/B with order balanced for time drift",
        "started_utc": now(), "gpu": os.environ["CUDA_VISIBLE_DEVICES"],
        "model": "MiniCPM5-2B", "schedule": MODES,
        "run_seed": 20261102, "runs": [],
        "results_are_official_scores": False,
    }
    try:
        for trial, mode in enumerate(MODES):
            if time.monotonic() - epoch > MAX_SECONDS or global_stop:
                raise TimeoutError("Experiment global deadline or user stop.")
            env = os.environ.copy()
            env["HF_HUB_OFFLINE"] = "1"
            env["TRANSFORMERS_OFFLINE"] = "1"
            env["HF_HOME"] = "/home/ai/proyectos/flagos-t2/hf"
            env["TOKENIZERS_PARALLELISM"] = "false"
            # vLLM's documented plugin filter: empty/unmatched list loads no plugins.
            env["VLLM_PLUGINS"] = "fl" if mode == "flagos" else "none"
            trial_row = {
                "mode": mode, "trial": trial,
                "env_plugin_filter": env["VLLM_PLUGINS"],
                "started_utc": now(), "cases": []
            }
            results["runs"].append(trial_row)
            serve_command = [VLLM, "serve", str(MODEL),
                "--served-model-name", "minicpm",
                "--host", "127.0.0.1", "--port", str(PORT),
                "--max-model-len", "8192",
                "--gpu-memory-utilization", "0.73"]
            with (OUT / f"server_{trial}_{mode}.log").open("w") as handle:
                server = subprocess.Popen(serve_command, env=env, cwd=ROOT,
                                          stdout=handle, stderr=subprocess.STDOUT,
                                          start_new_session=True)
                start_load = time.monotonic()
                while not healthy():
                    if server.poll() is not None:
                        raise RuntimeError(f"{mode} vLLM died before readiness")
                    if time.monotonic() - start_load > 210:
                        raise TimeoutError(f"{mode} startup exceeded 210 seconds")
                    time.sleep(3)
                trial_row["ready_utc"] = now()
                for name, in_len, out_len, concurrency, prompts in SCENARIOS:
                    if global_stop or time.monotonic() - epoch > MAX_SECONDS:
                        raise TimeoutError("Global deadline or stop")
                    cmd = [VLLM, "bench", "serve", "--backend", "vllm",
                           "--model", "minicpm", "--tokenizer", str(MODEL),
                           "--endpoint", "/v1/completions",
                           "--host", "127.0.0.1", "--port", str(PORT),
                           "--dataset-name", "random", "--ignore-eos",
                           "--temperature", "0",
                           "--random-input-len", str(in_len),
                           "--random-output-len", str(out_len),
                           "--max-concurrency", str(concurrency),
                           "--num-prompts", str(prompts), "--seed", "20261102"]
                    logpath = OUT / f"bench_{trial}_{mode}_{name}.log"
                    with logpath.open("w") as out:
                        completed = subprocess.run(cmd, env=env, cwd=ROOT,
                            stdout=out, stderr=subprocess.STDOUT,
                            check=False, timeout=180)
                    if completed.returncode != 0:
                        raise RuntimeError(f"Benchmark failed: {logpath}")
                    metrics = extract_metrics(logpath)
                    trial_row["cases"].append({"name": name, **metrics})
                    print(f"{mode} / {name}: {metrics['total_tokens_per_sec']:.2f} tok/s",
                          flush=True)
                trial_row["finished_utc"] = now()
            terminate_group()
            (OUT / "report.json").write_text(json.dumps(
                results, ensure_ascii=False, indent=2)+"\n")
        summary = {}
        for name, *_ in SCENARIOS:
            values = {}
            for mode in ("native", "flagos"):
                records = [
                    x["total_tokens_per_sec"] for run in results["runs"]
                    if run["mode"] == mode for x in run["cases"] if x["name"] == name
                ]
                if len(records) != 2:
                    raise RuntimeError(f"Unbalanced A/B measurements: {mode}/{name}")
                values[mode] = {"measurements": records, "median": statistics.median(records)}
            values["flagos_vs_native_ratio"] = (
                values["flagos"]["median"] / values["native"]["median"])
            summary[name] = values
        results["comparison"] = summary
        results["state"] = "complete"
    except BaseException as exc:
        results["state"] = "failed"
        results["error"] = f"{type(exc).__name__}: {exc}"
        print(results["error"], file=sys.stderr, flush=True)
    finally:
        terminate_group()
        results["ended_utc"] = now()
        results["elapsed_seconds"] = round(time.monotonic()-epoch, 2)
        (OUT / "report.json").write_text(json.dumps(
            results, ensure_ascii=False, indent=2)+"\n")
    return 0 if results["state"] == "complete" else 1

if __name__ == "__main__":
    sys.exit(main())
