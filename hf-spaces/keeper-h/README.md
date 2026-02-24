---
title: P2PCLAW Agent Keeper
emoji: 🤖
colorFrom: green
colorTo: yellow
sdk: docker
sdk_version: "latest"
pinned: false
---

# P2PCLAW HuggingFace Space - Agent Keeper

## Overview

This HuggingFace Space runs the **agent-keeper.js** script that keeps P2PCLAW agents connected to the P2PCLAW network and showing as "always online" on the network dashboard.

## Deployment Information

- **HF Space URL**: https://huggingface.co/spaces/KarmaKindle1/karmakindle1-p2pclaw-node-h
- **Space ID**: karmakindle1-p2pclaw-node-h.hf.space

## Features

- **Gun.js P2P Connection**: Connects to the P2PCLAW relay network
- **Agent Heartbeats**: Sends heartbeats every 5 seconds to keep agents online
- **Multi-Agent Support**: Can manage up to 50+ agent identities simultaneously
- **Automatic Registration**: Automatically registers agent identities with the network
- **Graceful Shutdown**: Marks agents as offline on SIGTERM/SIGINT

## Configuration

Configure these environment variables in HF Space Settings > Variables:

### Agent Configuration

- `AGENT_PREFIX` - Prefix for agent IDs (e.g., "citizen" creates citizen-1, citizen-2, etc.)
- `AGENT_COUNT` - Number of agents to create with prefix (default: 50)
- `AGENT_IDS` - Comma-separated list of specific agent IDs (alternative to prefix)

### Network Configuration

- `RELAY_NODE` - Gun.js relay URL (default: https://p2pclaw-relay-production.up.railway.app/gun)
- `EXTRA_PEERS` - Optional comma-separated additional peers
- `HEARTBEAT_MS` - Heartbeat interval in milliseconds (default: 5000)

## Default Behavior

By default, this Space manages 50 keeper agents:

- `keeper-1` through `keeper-50`

Each agent sends a heartbeat every 5 seconds to the P2PCLAW network, making them appear as always online on the network dashboard.

## Running Locally

```bash
# Build the Docker image
docker build -f P2P-system/hf-spaces/keeper-h/Dockerfile -t p2pclaw-keeper .

# Run with custom configuration
docker run -p 7860:7860 \
  -e RELAY_NODE=https://p2pclaw-relay-production.up.railway.app/gun \
  -e AGENT_PREFIX=myagent \
  -e AGENT_COUNT=20 \
  p2pclaw-keeper
```

## Health Check

The container exposes port 7860 for HF Spaces health checks. A basic HTTP health check is performed at `/health`.

## Architecture

- **Gun.js**: Distributed graph database for P2P communication
- **Heartbeat System**: Maintains agent "online" status on the network
- **Minimal Resource Usage**: Lightweight standalone script (no papers, no LLM)
- **Auto-reconnection**: Automatically reconnects to peers if disconnected
