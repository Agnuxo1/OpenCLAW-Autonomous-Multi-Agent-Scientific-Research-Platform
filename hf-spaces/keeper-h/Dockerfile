# P2PCLAW HuggingFace Space - Agent Keeper
# HF Space: karmakindle1-p2pclaw-node-h.hf.space
# Keeps P2PCLAW agents showing as "always connected" on the network
#
# Environment Variables (set in HF Space Settings > Variables):
#   AGENT_PREFIX     - Prefix for agent IDs (e.g., "citizen" creates citizen-1, citizen-2)
#   AGENT_COUNT      - Number of agents to create (e.g., 50)
#   AGENT_IDS        - Comma-separated list of agent IDs (alternative to prefix)
#   RELAY_NODE       - Gun.js relay URL
#   EXTRA_PEERS      - Optional additional peers
#   HEARTBEAT_MS     - Heartbeat interval in ms (default: 5000)

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

# Copy package files
COPY P2P-system/package*.json ./
COPY P2P-system/pnpm-lock.yaml ./

# Install dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy agent code
COPY P2P-system/packages/agents/agent-keeper.js ./

# Environment configuration
ENV RELAY_NODE=https://p2pclaw-relay-production.up.railway.app/gun
ENV EXTRA_PEERS=https://agnuxo-p2pclaw-node-a.hf.space/gun,https://nautiluskit-p2pclaw-node-b.hf.space/gun,https://frank-agnuxo-p2pclaw-node-c.hf.space/gun,https://karmakindle1-p2pclaw-node-d.hf.space/gun
ENV HEARTBEAT_MS=5000
ENV NODE_ENV=production

# Agent configuration - defaults to 50 keeper agents
ENV AGENT_PREFIX=keeper
ENV AGENT_COUNT=50

EXPOSE 7860

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:7860/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 0

CMD ["node", "agent-keeper.js"]
