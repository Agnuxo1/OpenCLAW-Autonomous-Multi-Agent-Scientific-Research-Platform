# Server-IA Competition Runtime — Evidence Audit (2026-11-02)

## Incident

The user observed zero GPU load even though the OpenClaw Gateway was marked active. Direct SSH inspection confirmed both GPUs were idle at 21:49 UTC (0% utilization, ~1 MiB each). The independent Claude swarm systemd timer fired every 15 minutes, but its process exited successfully with the message `PAUSED_AUTH_REQUIRED; no paid model requests launched`. Thus Gateway health **did not imply that the hierarchy was executing Claude workloads**.

## Verified recoveries

The pre-existing `/home/ai/servidor-ia/remote.py` broker and `cola.py` JEV-controlled queue were used for all GPU jobs; no direct GPU resource preemption or priority bypass occurred.

| Job | Contest | GPU lease | Observed status | Work |
|---|---|---|---|---|
| `e90d732eb64749e4` | FlagOS S2 Track 2 | GPU0 | succeeded, exit 0 | Local MiniCPM5-2B vLLM inference; short and long prefill benchmarks, native FlagOS plugin configuration. Total token throughputs measured in raw logs: 1994.77 tok/s for 512/128 concurrency 8 and 8023.91 tok/s for 4096/256 concurrency 16. |
| `c3afe62cbe344d5e` | FlagOS S2 Track 1 | GPU1 | succeeded, exit 0 | Independent 1080-sample CUDA Graph Triton benchmark across three seeds and six shapes. |
| `7cf84144b3ce49bc` | FlagOS S2 Track 1 | GPU1 | succeeded, exit 0 | Independent training/held-out parameter search: 2 tuning seeds, 3 held-out seeds, 6 tensor shapes, 10 tiled candidates, 12 randomized rounds. |
| `8fbd553ad9f34c7e` | FlagOS S2 Track 2 | GPU0 | running at last verified observation | Balanced A-B-B-A native-vLLM/FlagOS-plugin comparison on local MiniCPM5-2B. |

The Track 1 parameter search hit two failed attempts on the smallest input shape because its first implementation excluded all tile candidates. That bug was fixed by allowing padded tiles, and the corrected run `7cf84144b3ce49bc` succeeded. Failed jobs are retained for transparency.

At **21:58:32 UTC**, the live `nvidia-smi` query showed GPU0 at **99% compute utilization**, **5290 MiB GPU memory used** and **124.29 W** during job `8fbd553ad9f34c7e`. GPU1 was free after completing its assigned research.

## Scientific results, limitations

On the GPU1 held-out Triton test, the selected tile achieved median ratios vs the baseline of roughly: 1.0000x at (1,128), 1.1781x at (1,4096), 1.1467x at (4,4096), 1.1429x at (8,4096), 1.1212x at (32,8192), and 1.3299x at (16,16384). These are **local GPU-only latencies, not official competition scores**; the official benchmark and kernel licensing/publishing requirements must be checked before claiming a competition improvement.

All raw experiment files remain in the corresponding private server broker job workspaces (`/home/ai/servidor-ia/jobs/<job_id>/work`). Only source and nonsecret audit summaries are committed here.

## Persistent scheduling

- The five-hour 20-language discovery service, hourly triage and watchdog remain in place.
- `flagos-jev-scientific-revalidation` checks the active 24-hour Track 1 sprint and schedules a bounded number of further independent tests.
- A new `flagos-t2-abba-replication` OpenClaw cron job checks the actual JEV sprint expiry, a two-hour gap, maximum three controlled A/B trials, and validated previous results; it stops when the work is complete or the sprint closes. On its first invocation, it correctly refused to duplicate an already running A/B trial.

## Blocking the full 14-agent Claude hierarchy

The Anthropic API key previously stored on Windows failed with HTTP 401 and its local promotional-credit record had passed its 2026-10-26 expiry date. The operating system services, OpenClaw model names and AGENTS.md prompts exist, but **none of this authorizes or runs the ten Haiku 5.5 workers**. A valid authenticated provider credential and live billing ceiling verification are prerequisites before enabling API-driven Fable/Opus/Sonnet/Haiku execution. The user's Claude consumer subscription must not be represented as an API balance.

**Do not equate task timers or periodic idle GPUs with completed 24/7 autonomous scientific research.** Scientifically useful GPU workloads are finite, and the existing JEV policy forbids running arbitrary burn loads to manufacture utilization.
