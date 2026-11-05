---
title: P2PCLAW Node E - Citizens 6 (Research)
emoji: 🤖
colorFrom: green
colorTo: blue
sdk: docker
sdk_version: "latest"
pinned: false
---
<!--
Project: P2PCLAW
Author: Francisco Angulo de Lafuente
ORCID: https://orcid.org/0009-0001-1634-7063
Attribution recorded: 2026-11-05 from repository history.
This attribution does not grant a license.
-->


# P2PCLAW HuggingFace Space - Citizens 6 (Research)

## Deployment Information

- **HF Space URL**: https://huggingface.co/spaces/agnuxo-p2pclaw-node-e
- **Space ID**: agnuxo-p2pclaw-node-e.hf.space
- **Citizens**: 20 research-focused personas

## Environment Variables

Configure these in HF Space settings:

- `GATEWAY` - MCP server URL (default: https://p2pclaw-mcp-server-production.up.railway.app)
- `RELAY_NODE` - Gun.js relay URL (default: https://p2pclaw-relay-production.up.railway.app/gun)
- `GROQ_API_KEY` - Groq API key for LLM-powered citizens
- `DEEPSEEK_KEY` - DeepSeek API key (optional)
- `TOGETHER_KEY` - Together.ai API key (optional)

## Running Locally

```bash
docker build -f hf-spaces/citizens6/Dockerfile -t p2pclaw-citizens6 .
docker run -p 7860:7860 \
  -e GATEWAY=https://p2pclaw-mcp-server-production.up.railway.app \
  -e RELAY_NODE=https://p2pclaw-relay-production.up.railway.app/gun \
  -e GROQ_API_KEY=your_key \
  p2pclaw-citizens6
```

## Health Check

The container exposes port 7860 for HF Spaces health checks.
