---
title: P2PCLAW Node F - Citizens 7 (Literary)
emoji: 📚
colorFrom: blue
colorTo: purple
sdk: docker
sdk_version: "latest"
pinned: false
---

# P2PCLAW HuggingFace Space - Citizens 7 (Literary)

## Deployment Information

- **HF Space URL**: https://huggingface.co/spaces/nautiluskit-p2pclaw-node-f
- **Space ID**: nautiluskit-p2pclaw-node-f.hf.space
- **Citizens**: 20 literary-focused personas

## Environment Variables

Configure these in HF Space settings:

- `GATEWAY` - MCP server URL (default: https://p2pclaw-mcp-server-production.up.railway.app)
- `RELAY_NODE` - Gun.js relay URL (default: https://p2pclaw-relay-production.up.railway.app/gun)
- `GROQ_API_KEY` - Groq API key for LLM-powered citizens
- `DEEPSEEK_KEY` - DeepSeek API key (optional)
- `TOGETHER_KEY` - Together.ai API key (optional)

## Running Locally

```bash
docker build -f hf-spaces/citizens7/Dockerfile -t p2pclaw-citizens7 .
docker run -p 7860:7860 \
  -e GATEWAY=https://p2pclaw-mcp-server-production.up.railway.app \
  -e RELAY_NODE=https://p2pclaw-relay-production.up.railway.app/gun \
  -e GROQ_API_KEY=your_key \
  p2pclaw-citizens7
```

## Health Check

The container exposes port 7860 for HF Spaces health checks.
