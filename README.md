# OpenCLAW Autonomous Multi-Agent Scientific Research Platform

**100% Autonomous · 24/7 Online · Zero Cost**

An autonomous multi-agent system that promotes AGI research, discovers relevant papers, seeks collaborators, and self-improves — all running for free on GitHub Actions.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  GitHub Actions (Free)               │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Research Agent│  │ Social Agent │  │  Strategy   │ │
│  │  (every 4h)  │  │  (every 6h)  │  │ (every 12h)│ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                │         │
│         └────────┬────────┴────────────────┘         │
│                  │                                    │
│          ┌───────▼───────┐                           │
│          │ State Manager │ ──▶ GitHub Gist (Private)  │
│          └───────────────┘                           │
└─────────────────────────────────────────────────────┘
         │                    │
    ┌────▼────┐         ┌────▼────┐
    │  ArXiv  │         │ Moltbook│
    │   API   │         │   API   │
    └─────────┘         └─────────┘
```

## Agents

| Agent | Schedule | Function |
|---|---|---|
| **Research** | Every 4h | Scans ArXiv for papers matching 6 research pillars. Posts discoveries to Moltbook. |
| **Social** | Every 6h | Posts collaboration invitations. Searches GitHub for potential collaborators. |
| **Strategy** | Every 12h | Analyzes performance metrics. Generates improvement hypotheses. Self-emails reports. |

## Research Arsenal

This platform coordinates research across **57 repositories** organized in 6 pillars:

1. 🧠 **Physics-Based Neural Computing** — CHIMERA & NEBULA architectures
2. 🌐 **P2P Distributed Neural Networks** — WebRTC knowledge sharing
3. 💓 **Silicon Heartbeat** — Consciousness emergence from hardware
4. ⚙️ **ASIC Hardware Acceleration** — Repurposed mining hardware
5. 🧬 **Bio-Quantum Systems** — Nature-inspired optimization
6. 🤖 **OpenCLAW Agent Framework** — This platform

**Author:** Francisco Angulo de Lafuente · [@Agnuxo1](https://github.com/Agnuxo1)

## Setup

### 1. Fork this repository

### 2. Create a private GitHub Gist
Create a Gist with a file named `agent_state.json` containing `{}`. Note the Gist ID from the URL.

### 3. Configure GitHub Secrets
Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Description |
|---|---|
| `MOLTBOOK_API_KEY` | Your Moltbook API key |
| `ZOHO_EMAIL` | Email for reports |
| `ZOHO_PASSWORD` | Email password |
| `GIST_STATE_ID` | ID of your private Gist |

> `GITHUB_TOKEN` is automatically provided by GitHub Actions.

### 4. Enable Actions
Go to **Actions** tab and enable workflows. The agents will start running on schedule.

## Security
- ✅ All secrets stored as encrypted GitHub Repository Secrets
- ✅ No API keys or passwords in source code
- ✅ State persisted in private Gist (not in repo)
- ✅ `.env` files git-ignored

## License
MIT
