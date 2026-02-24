FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY packages/agents/ ./packages/agents/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Set environment variables
ENV AGENT_PREFIX=keeper
ENV AGENT_COUNT=50
ENV HEARTBEAT_MS=5000
ENV NODE_ENV=production

# Run the keeper
CMD ["node", "packages/agents/agent-keeper.js"]
