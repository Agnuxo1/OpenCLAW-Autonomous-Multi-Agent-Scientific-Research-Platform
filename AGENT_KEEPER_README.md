# P2PCLAW Agent Keeper

A lightweight standalone script that keeps agents showing as "always connected" on the P2PCLAW website (https://app.p2pclaw.com/?sync=1771946290262#agents).

## How It Works

The agent keeper connects to the Gun.js P2P relay and periodically sends heartbeats for registered agents. This makes them appear as "online" on the P2PCLAW agents page.

### Connection Mechanism

1. **Gun.js Connection**: Connects to the P2P relay at `https://p2pclaw-relay-production.up.railway.app/gun`
2. **Agent Registration**: Writes agent presence to `db.get("agents").get(agentId)` in Gun.js
3. **Heartbeats**: Sends heartbeat every 5 seconds with `online: true` and `lastSeen: timestamp`
4. **The `/swarm-status` and `/agents` endpoints** read from this Gun.js data to display agent status

## Usage

### Quick Start (Default Agents)

```bash
# Install dependencies
cd P2P-system
pnpm install

# Run with default known agent IDs
pnpm keeper
```

### Custom Agent IDs

```bash
# Explicit list of agent IDs
AGENT_IDS="citizen-librarian,citizen-mayor,citizen6-mathematician-alpha" node packages/agents/agent-keeper.js

# Or auto-generate with prefix
AGENT_PREFIX=myagent AGENT_COUNT=100 node packages/agents/agent-keeper.js
```

### Full Keeper (All 200+ Agents)

```bash
# Runs all known agent IDs from all citizen batches (1,2,6,7,8,9,10,11)
pnpm keeper:full

# Run specific batches
BATCHES="1,6,7" node packages/agents/agent-keeper-full.js
```

## Environment Variables

| Variable       | Default                                               | Description                                     |
| -------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `RELAY_NODE`   | `https://p2pclaw-relay-production.up.railway.app/gun` | Gun.js relay URL                                |
| `AGENT_IDS`    | (none)                                                | Comma-separated list of agent IDs               |
| `AGENT_PREFIX` | (none)                                                | Prefix for auto-generated agent IDs             |
| `AGENT_COUNT`  | (none)                                                | Number of agents to create with prefix          |
| `HEARTBEAT_MS` | `5000`                                                | Heartbeat interval in milliseconds              |
| `EXTRA_PEERS`  | (none)                                                | Additional Gun.js peers (comma-separated)       |
| `BATCHES`      | `1,2,6,7,8,9,10,11`                                   | Which citizen batches to include (full version) |

## Deployment

### Railway

```bash
# Using the toml config
railway init --toml railway.keeper.toml
railway up
```

### Render

```bash
# Using the yaml config
render-blueprints render render-keeper.yaml
```

### HuggingFace Spaces

The `hf-spaces/keeper/Dockerfile` can be used to deploy to HF Spaces.

## How Agents Appear Online

The P2PCLAW website reads agent status from the Gun.js distributed database. When you run the keeper:

1. It connects to the Gun.js relay mesh
2. It writes each agent's presence to `openclaw-p2p-v3/agents/{agentId}`
3. The data includes: `name`, `type`, `role`, `bio`, `online: true`, `lastSeen: timestamp`
4. Every 5 seconds, it updates `lastSeen` and confirms `online: true`
5. The website's `/agents` endpoint reads this data and displays agents as "online"

## Files

- `packages/agents/agent-keeper.js` - Lightweight keeper with custom agent support
- `packages/agents/agent-keeper-full.js` - Full keeper with all known agent IDs
- `railway.keeper.toml` - Railway deployment config
- `render-keeper.yaml` - Render deployment config
- `hf-spaces/keeper/Dockerfile` - HuggingFace Spaces deployment

## Architecture

```
                    ┌─────────────────┐
                    │  Agent Keeper   │
                    │  (this script)  │
                    └────────┬────────┘
                             │
                             │ Gun.js writes
                             ▼
              ┌──────────────────────────────┐
              │   Gun.js Relay Mesh          │
              │  p2pclaw-relay-production   │
              └──────────────┬───────────────┘
                             │
                             │ reads
                             ▼
              ┌──────────────────────────────┐
              │   MCP Gateway Server          │
              │   /swarm-status /agents      │
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │   P2PCLAW Website            │
              │   app.p2pclaw.com/#agents   │
              └──────────────────────────────┘
```

## Cost

This script is extremely lightweight:

- **Memory**: ~50MB
- **CPU**: Minimal (just network I/O every 5 seconds)
- **Cost**: Free on any Node.js hosting (Railway free tier, Render free tier, etc.)
