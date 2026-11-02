#!/usr/bin/env python3
"""Reproducible FlagOS Track 2 vLLM GPU benchmark, running via Server-IA leases.

The exact GPU is allocated by the existing Server-IA broker. This program
runs a locally available pretrained model and records latency/throughput for
two fixed workloads. It never contacts paid model APIs, downloads weights, or
opens a public TCP listener. Timeout/cleanup is mandatory.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import os
import pathlib
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "results"
MODEL = pathlib.Path("/home/ai/proyectos/flagos-t2/MiniCPM5-2B")
VLLM = pathlib.Path("/home/ai/proyectos/flagos-t2/.venv/bin/vllm")
PORT = 9041
MODEL_NAME = "minicpm"
RUN_LIMIT_SEC = 1800
BENCH_LIMIT_SEC = 620
LOAD_LIMIT_SEC = 300
CASES = (
    ("short_prefill", 512, 128, 8, 64),
    ("long_prefill", 4096, 256, 16, 64),
)
proc = None
should_stop = False

def utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

def on_stop(signum, frame) -> None:
    global should_stop
    should_stop = True
    if proc and proc.poll() is None:
        proc.terminate()

def collect_telemetry(stop_event: threading.Event, filepath: pathlib.Path) -> None:
    with filepath.open("w", encoding="utf-8") as out:
        out.write("timestamp_utc,utilization_percent,memory_used_mib,power_watts\n")
        while not stop_event.is_set():
            try:
                sample = subprocess.check_output([
                    "nvidia-smi",
                    "--query-gpu=utilization.gpu,memory.used,power.draw",
                    "--format=csv,noheader,nounits"], text=True, timeout=8).strip()
                out.write(f"{utc()},{sample}\n")
                out.flush()
            except (OSError, subprocess.TimeoutExpired, subprocess.CalledProcessError):
                pass
            stop_event.wait(5)

def ready() -> bool:
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{PORT}/v1/models", timeout=3) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False

def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4*1024*1024), b""):
            h.update(chunk)
    return h.hexdigest()

def main() -> int:
    global proc
    signal.signal(signal.SIGTERM, on_stop)
    signal.signal(signal.SIGINT, on_stop)
    if os.environ.get("CUDA_VISIBLE_DEVICES", "").count(",") or not os.environ.get("CUDA_VISIBLE_DEVICES"):
        raise RuntimeError("A single broker-assigned GPU is required")
    if not MODEL.joinpath("model-00000-of-00001.safetensors").is_file():
        raise FileNotFoundError("Pretrained MiniCPM weights are not present")
    if not VLLM.is_file():
        raise FileNotFoundError("Existing FlagOS vLLM virtualenv missing")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["HF_HUB_OFFLINE"] = "1"
    env["TRANSFORMERS_OFFLINE"] = "1"
    env["TOKENIZERS_PARALLELISM"] = "false"
    env["HF_HOME"] = "/home/ai/proyectos/flagos-t2/hf"
    start = time.monotonic()
    results = {
        "project": "flagos-s2", "start_utc": utc(),
        "runner": "local vLLM; no paid inference APIs",
        "model": MODEL.name,
        "model_config_sha256": sha256(MODEL / "config.json"),
        "visible_gpu": env["CUDA_VISIBLE_DEVICES"],
        "model_path": str(MODEL),
        "cases": [], "state": "starting",
    }
    stop_event = threading.Event()
    telemetry = threading.Thread(
        target=collect_telemetry,
        args=(stop_event, OUTPUT / "gpu_telemetry.csv"), daemon=True)
    telemetry.start()
    try:
        cmd = [
            str(VLLM), "serve", str(MODEL),
            "--served-model-name", MODEL_NAME,
            "--host", "127.0.0.1", "--port", str(PORT),
            "--max-model-len", "8192",
            "--gpu-memory-utilization", "0.75",
        ]
        results["server_command"] = cmd
        with (OUTPUT / "vllm_server.log").open("w", encoding="utf-8") as logfile:
            proc = subprocess.Popen(cmd, cwd=ROOT, env=env, stdout=logfile,
                                    stderr=subprocess.STDOUT, start_new_session=True)
            while not ready():
                if should_stop or proc.poll() is not None:
                    raise RuntimeError("vLLM startup aborted or process failed")
                if time.monotonic() - start > LOAD_LIMIT_SEC:
                    raise TimeoutError("vLLM failed readiness before deadline")
                time.sleep(3)
            results["server_ready_utc"] = utc()
            for name, input_tokens, output_tokens, concurrency, prompts in CASES:
                if should_stop or time.monotonic() - start > RUN_LIMIT_SEC:
                    raise TimeoutError("Global benchmark runtime exceeded")
                bench_cmd = [
                    str(VLLM), "bench", "serve",
                    "--backend", "vllm", "--model", MODEL_NAME,
                    "--tokenizer", str(MODEL),
                    "--endpoint", "/v1/completions",
                    "--host", "127.0.0.1", "--port", str(PORT),
                    "--dataset-name", "random", "--ignore-eos",
                    "--temperature", "0",
                    "--random-input-len", str(input_tokens),
                    "--random-output-len", str(output_tokens),
                    "--max-concurrency", str(concurrency),
                    "--num-prompts", str(prompts),
                    "--seed", "20261102",
                ]
                case = {
                    "name": name, "input_tokens": input_tokens,
                    "output_tokens": output_tokens, "max_concurrency": concurrency,
                    "prompts": prompts, "started_utc": utc(),
                    "command": bench_cmd,
                }
                results["cases"].append(case)
                with (OUTPUT / f"{name}.log").open("w", encoding="utf-8") as bench_log:
                    try:
                        run = subprocess.run(
                            bench_cmd, cwd=ROOT, env=env,
                            stdout=bench_log, stderr=subprocess.STDOUT,
                            timeout=BENCH_LIMIT_SEC, check=False)
                        case["exit_code"] = run.returncode
                        case["state"] = "passed" if run.returncode == 0 else "failed"
                    except subprocess.TimeoutExpired:
                        case["state"] = "timeout"
                case["finished_utc"] = utc()
                (OUTPUT / "report.json").write_text(json.dumps(results, indent=2) + "\n")
            results["state"] = "completed" if all(
                c.get("state") == "passed" for c in results["cases"]) else "incomplete"
    except BaseException as error:
        results["state"] = "failed"
        results["error"] = f"{type(error).__name__}: {error}"
        print(results["error"], file=sys.stderr, flush=True)
    finally:
        stop_event.set()
        telemetry.join(timeout=7)
        if proc and proc.poll() is None:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=12)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait(timeout=5)
        results["finished_utc"] = utc()
        results["elapsed_seconds"] = round(time.monotonic() - start, 1)
        (OUTPUT / "report.json").write_text(
            json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(json.dumps({
            "state": results["state"], "cases": [
                (x["name"], x.get("state")) for x in results["cases"]],
            "elapsed_seconds": results["elapsed_seconds"],
            "output": str(OUTPUT)
        }), flush=True)
    return 0 if results["state"] == "completed" else 1

if __name__ == "__main__":
    raise SystemExit(main())
