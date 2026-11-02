# Server-IA Competition Hierarchy (November 2026)

## Purpose

A dedicated OpenClaw hierarchy on the owner's Debian Server-IA, designed for professional scientific competition discovery, evaluation, training and verified submission. This addition is intentionally isolated from the existing P2PCLAW gateway, citizen agents and their publication services.

## Model mapping

| Agent identity | Claude model | Parent |
|---|---|---|
| boss | `anthropic/claude-fable-5-1` | Owner; consults JEV |
| director | `anthropic/claude-opus-5-5` | boss |
| research-lead | `anthropic/claude-sonnet-5-5` | director |
| engineering-lead | `anthropic/claude-sonnet-5-5` | director |
| worker-01 to worker-05 | **`anthropic/claude-haiku-5-5`** | research-lead |
| worker-06 to worker-10 | **`anthropic/claude-haiku-5-5`** | engineering-lead |

**There are ten Haiku 5.5 workers, not a mixture of local or other models.**

## Included materials

- `openclaw-hierarchy.overlay.json` — schema-validated OpenClaw multi-agent config fragment. It is an **overlay**, not a complete substitute for the existing `~/.openclaw/openclaw.json`. Apply with `openclaw config patch --file deployment/openclaw-hierarchy.overlay.json`.
- `../skills/cognitiva-hierarchical-competitions/SKILL.md` — shared cognitive and scientific competition protocol.
- `roles/*.md` — per-role `AGENTS.md` instructions.
- No secrets, account passwords, PII attachment contents, cost assumptions, or invented endpoints.

## Current verified deployment, 2026-11-02

- Server reachable as `ai@server-ia`, Debian 13.
- OpenClaw 2026.10.9 installed using the **official rootless runtime-only installer**, with its own Node 24.22.1.
- Overlay successfully applied using `openclaw config patch`; `openclaw config validate` reported valid; `openclaw agents list --json` showed all fourteen configured agents with the requested model assignments.
- Cognitiva skill installed to shared managed skills and confirmed `ready`.
- Fourteen workspaces and role-specific `AGENTS.md` files created under `/srv/openclaw/competition-agents`, a symlink to the secondary SSD `/mnt/datos/openclaw`, which had approximately 606 GB free before deployment.
- Only **one NVIDIA RTX 3090** currently appeared in `nvidia-smi`. Do not promise two simultaneous GPU slots until hardware is independently diagnosed.
- Gateway service installed as a systemd user service and confirmed running, listening **only on 127.0.0.1:18789** with a generated local auth token; deep status reported connectivity OK and OpenClaw 2026.10.9. No external/remote dashboard exposure was enabled.
- No Anthropic authenticated profile confirmed; no verified free-credit balance; no confirmed JEV API endpoint or GPU resource lease; no verified Gmail OAuth; no production scheduler or submission flow. **Configured does not mean running experiments or submitting competitions.**

## Required deployment checks before unattended execution

1. Recover the real JEV IPC/API path and existing ownership/lease rules from the installed Windows JEV service. Do not invent a connector.
2. Rotate or replace any API keys exposed in the supplied credential listing. Store secrets on Server-IA using a 0700 directory and 0600 files or a managed secret store. Apply least privilege. No passwords in Git, skill instructions, or logs.
3. Confirm Anthropic promotional credits through the provider's billing dashboard/API, then apply a strict free-credit ceiling and stop on uncertainty. Worker API calls must use Haiku 5.5.
4. Diagnose the missing second GPU. Reserve one GPU at a time, check `nvidia-smi` before training, and use a global 10-worker semaphore in the task scheduler (OpenClaw's `maxConcurrent` is scoped per parent session and is **not** itself a global quota).
5. Integrate organizer-approved login via official OAuth/API, Gmail with explicit limited OAuth scopes, and GitHub with project-scoped access. CAPTCHA, identity verification and signature requirements must not be bypassed.
6. Reconcile the current competition queue before scheduling the 5-hour multilingual discovery. Do not create duplicate submissions or research sprints.
7. Start the Gateway via its supported service manager only after the above gates have been tested. Confirm recovery after restart, scheduler health, credit monitoring, and a harmless single-worker smoke test.

## Scientific acceptance policy

Every sprint must start from official rules, establish baselines, use open-source numerical or physical solvers where appropriate, run controlled measurements with seeds and preserved raw logs, and submit evidence-backed artifacts. `SUBMITTED_VERIFIED` requires an official confirmation. GitHub repositories must be professional, but may need to remain private until competition rules and dataset licences allow publication. Avoid large checkpoints in ordinary Git.

See the shared Cognitiva skill for full methodological requirements.

## 24/7 scout deployment and validation (2026-11-02)

- Installed `scripts/competition_scout.py` on Server-IA under `/srv/openclaw/competition-code`, paired with a persistent **systemd user timer** set to `OnUnitInactiveSec=5h` and isolated `competition-state` storage.
- First actual run: 20/20 language feeds succeeded, **57 discovery candidates**, eight related public Agnuxo1 repositories, ten preexisting competition references seeded for re-verification; the systemd job exited with code 0. Discovery candidates are explicitly unverified.
- Confirmed the next timer was queued for 2026-11-02 19:35 UTC; timer status active.
- Installed `scripts/competition_watchdog.py` and registered native OpenClaw cron job `competition-watchdog-hourly` (job id `ce023214-f814-4a1c-be54-a9e47e79cfd2`). A manual `openclaw cron run ... --wait` returned **completionStatus=succeeded**, reporting the gateway, timer and scout as healthy.
- Anthropic model auth and free credit are **not activated**. An older local Windows Anthropic credit configuration expired 2026-10-26, and its existing stored key failed the non-metered credential check with HTTP 401. Any replacement/new promotional balance must be verified before enabling cloud model calls.
- The Fable/Opus/Sonnet/Haiku agent roles remain installed and correctly configured but will not execute until valid, spending-limited credentials and the real JEV oracle/GPU scheduler are integrated. No paid experiments, official registrations, or submissions have been performed by this deployment.
