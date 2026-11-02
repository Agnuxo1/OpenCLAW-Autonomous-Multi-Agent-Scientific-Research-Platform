# Independent FlagOS RTX 3090 Kernel Audit — 2026-11-02

## Motivation

Prior work showed that the Server-IA scientific competition agent was idle because its Anthropic credentials were unavailable and no GPU jobs had been placed in the existing JEV/servidor-ia queue. Two authentic jobs have now been submitted via the pre-existing GPU lease broker, **not** by manually bypassing the resource controller.

## Reproducible execution

| Experiment | Server-IA job ID | Lane | Result | Primary output |
|---|---|---|---|---|
| Original interleaved benchmark | `4ddc0b4c99f14f3a` | gpu0 | succeeded; exit 0 | `analysis/sigmoid_gate_controlled_rtx3090_20261102_201530.csv` |
| Independent CUDA Graph replay | `e549f27bad9f4f60` | gpu0 | succeeded; exit 0 | `analysis/cudagraph_measurements.csv`, `analysis/cudagraph_report.json` |

Machine: Server-IA Debian 13, NVIDIA RTX 3090 (24 GiB per GPU; two GPUs detected at the time of this audit). Existing training environment: Python, CUDA-capable PyTorch and Triton.

Existing kernel source: `E:/Proyecto-concursos/FlagOS-Track1-S2/benchmarks/bench_sigmoid_gate.py`. Source SHA256 begins `991be249cc89`. The original source was copied unchanged into a private job sandbox.

**The second test uses three input seeds (19, 71, 2026), six existing tensor shapes, four configurations, 15 interleaved randomized rounds and 48 graph replays per timed measurement.** That gives 1,080 raw GPU-only latency samples, written to CSV. All candidates were checked for numerical accuracy against a PyTorch reference before timing.

## Preliminary GPU-only speedup estimates

These figures are median speedup across the three seeds, comparing the best named tiled kernel against the existing baseline on the same shape. `1.0×` is parity; values above one indicate faster GPU-only execution.

| Tensor shape (N,D) | Tiled option | Median speedup | Minimum seed speedup |
|---|---|---:|---:|
| 1,128 | tile512 | 1.0000× | 0.9821× |
| 1,4096 | tile512 | 1.1404× | 1.1404× |
| 4,4096 | tile512 | 1.1207× | 1.1207× |
| 8,4096 | tile1024 | 1.1356× | 1.1186× |
| 32,8192 | tile1024 | 1.1216× | 1.1216× |
| 16,16384 | tile1024 | 1.3243× | 1.3243× |

These are **observed local benchmark results**, not official challenge scores or established general speedups. The original Python-launch benchmark measured around 17–18 microseconds per call because it includes overhead that CUDA Graph timing suppresses. These two benchmarks answer different questions and must not be compared as if they used the same timer.

## Scientific cautions and required validation

- Select candidates only after a genuinely independent hold-out run; avoid optimizing directly on the reported set.
- Confirm GPU event timer resolution, compilation warm-up, clock drift and thermal/power conditions.
- Compare on organizer's exact shape distribution, device, correctness constraints and scoring harness.
- Source is limited to BF16 and this one operator; broader improvements cannot be inferred.
- Preserve the full CSV and report in `/home/ai/servidor-ia/jobs/e549f27bad9f4f60/work/analysis`. They are not yet uploaded to GitHub.
- The existing resource controller and project sprint expire no later than the recorded JEV deadline, not a model-generated extension.

## Automatic continuation

`flagos-jev-scientific-revalidation` is a native OpenClaw hourly job backed by `scripts/flagos_audit_dispatcher.py`. It uses the existing Server-IA `remote.py` GPU scheduler and `cola.py` contest register. It will schedule up to four further audits at least two hours apart while the **existing** 24-hour project window remains valid; it pauses on a failed test or deadline expiry, instead of manufacturing GPU occupancy.

An hourly triage task and a five-hour discovery timer also run independently without metered LLMs. Anthropic Fable/Opus/Sonnet/Haiku inference remains blocked because valid API authorization and current promotional credit balance have not been confirmed. The fact that commands are registered under OpenClaw agent IDs **does not mean those LLMs were invoked**.
