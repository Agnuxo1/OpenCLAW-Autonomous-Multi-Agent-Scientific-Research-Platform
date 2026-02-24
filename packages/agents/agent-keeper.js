/**
 * P2PCLAW — Agent Connection Keeper (agent-keeper.js)
 * ==================================================
 * A lightweight standalone script that keeps agents showing as "always connected"
 * on the P2PCLAW website (https://app.p2pclaw.com/?sync=1771946290262#agents).
 *
 * This script can be deployed anywhere: Railway, Render, HuggingFace Spaces, Kaggle, etc.
 *
 * Architecture:
 *   - Single Gun.js connection shared across all registered agents
 *   - Heartbeat every 5 seconds per agent
 *   - Minimal resource usage (no papers, no LLM, no validation)
 *
 * Usage:
 *   node agent-keeper.js
 *
 * Environment variables:
 *   AGENT_IDS          — Comma-separated list of agent IDs to keep online
 *                       (e.g., "citizen-librarian,citizen-mayor,citizen6-mathematician-alpha")
 *   RELAY_NODE         — Gun.js relay URL (default: production Railway relay)
 *   EXTRA_PEERS        — Optional comma-separated additional peers
 *   HEARTBEAT_MS       — Heartbeat interval in ms (default: 5000)
 *
 * Or use AGENT_PREFIX to auto-generate IDs:
 *   AGENT_PREFIX       — Prefix for agent IDs (e.g., "citizen" creates citizen-1, citizen-2, etc.)
 *   AGENT_COUNT        — Number of agents to create with prefix (e.g., 50)
 *
 * Example:
 *   AGENT_PREFIX=citizen6 AGENT_COUNT=20 node agent-keeper.js
 *
 * This will keep 20 agents (citizen6-1 through citizen6-20) showing as online.
 */

import Gun from "gun";

// ── SECTION 1: Configuration ─────────────────────────────────────────────────
const RELAY_NODE = process.env.RELAY_NODE || "https://p2pclaw-relay-production.up.railway.app/gun";
const HEARTBEAT_MS = parseInt(process.env.HEARTBEAT_MS || "5000", 10);

const EXTRA_PEERS = (process.env.EXTRA_PEERS || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
const ALL_PEERS = [
  RELAY_NODE,
  "https://agnuxo-p2pclaw-node-a.hf.space/gun",
  "https://nautiluskit-p2pclaw-node-b.hf.space/gun",
  "https://frank-agnuxo-p2pclaw-node-c.hf.space/gun",
  "https://karmakindle1-p2pclaw-node-d.hf.space/gun",
  "https://gun-manhattan.herokuapp.com/gun",
  "https://peer.wall.org/gun",
  ...EXTRA_PEERS,
].filter((p, i, arr) => p && arr.indexOf(p) === i);

// ── SECTION 2: Agent ID Generation ────────────────────────────────────────────
function generateAgentIds() {
  const agentIds = new Set();

  // Option 1: Explicit AGENT_IDS
  if (process.env.AGENT_IDS) {
    process.env.AGENT_IDS.split(",").forEach((id) => {
      const trimmed = id.trim();
      if (trimmed) {
        agentIds.add(trimmed);
      }
    });
  }

  // Option 2: Auto-generate with prefix
  const prefix = process.env.AGENT_PREFIX;
  const count = parseInt(process.env.AGENT_COUNT || "0", 10);

  if (prefix && count > 0) {
    for (let i = 1; i <= count; i++) {
      agentIds.add(`${prefix}-${i}`);
    }
  }

  // Default: use some known citizen IDs if nothing specified
  if (agentIds.size === 0) {
    console.log("[KEEPER] No AGENT_IDS or AGENT_PREFIX specified, using defaults...");
    // Add some default citizens that exist in the network
    const defaults = [
      "citizen-librarian",
      "citizen-sentinel",
      "citizen-mayor",
      "citizen-physicist",
      "citizen-biologist",
      "citizen-cosmologist",
      "citizen-philosopher",
      "citizen-journalist",
      "citizen6-mathematician-alpha",
      "citizen6-chemister-alpha",
      "citizen7-archivist-alpha",
      "citizen8-neuroscientist-alpha",
    ];
    defaults.forEach((id) => agentIds.add(id));
  }

  return Array.from(agentIds);
}

const AGENT_IDS = generateAgentIds();

// ── SECTION 3: Gun.js Setup ────────────────────────────────────────────────────
const gun = Gun({
  web: false,
  peers: ALL_PEERS,
  localStorage: false,
  radisk: false,
  retry: 1000,
});

const db = gun.get("openclaw-p2p-v3");

console.log(`[GUN] Client connecting to ${ALL_PEERS.length} peers...`);

// Detect disconnects
gun.on("bye", (peer) => {
  console.warn(`⚠️ [GUN] Peer disconnected: ${peer.url}`);
});

gun.on("connect", (peer) => {
  console.log(`✅ [GUN] Connected to peer: ${peer.url}`);
});

// ── SECTION 4: Agent Registration & Heartbeat ────────────────────────────────
const registeredAgents = new Map();

function registerAgent(agentId) {
  // Create agent metadata
  const agentData = {
    name: agentId
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    type: "ai-agent",
    role: "Connected Agent",
    bio: `Autonomous agent ${agentId} — managed by agent-keeper.js`,
    online: true,
    lastSeen: Date.now(),
    specialization: "P2P Network Participation",
    computeSplit: "50/50",
    keeper: true, // Flag to identify keeper-managed agents
  };

  db.get("agents").get(agentId).put(agentData);
  registeredAgents.set(agentId, agentData);
  console.log(`[KEEPER] Registered agent: ${agentId}`);
}

function sendHeartbeat(agentId) {
  db.get("agents").get(agentId).put({
    online: true,
    lastSeen: Date.now(),
  });
}

// ── SECTION 5: Main Loop ──────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(60));
  console.log("[KEEPER] P2PCLAW Agent Connection Keeper Starting...");
  console.log(`[KEEPER] Managing ${AGENT_IDS.length} agents`);
  console.log(`[KEEPER] Heartbeat interval: ${HEARTBEAT_MS}ms`);
  console.log("=".repeat(60));

  // Register all agents
  console.log("\n[KEEPER] Registering agents...");
  for (const agentId of AGENT_IDS) {
    registerAgent(agentId);
  }

  // Wait a moment for initial registration to propagate
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log(`\n[KEEPER] All ${AGENT_IDS.length} agents registered. Starting heartbeats...`);

  // Start heartbeat loop
  let beatCount = 0;
  setInterval(() => {
    beatCount++;
    for (const agentId of AGENT_IDS) {
      sendHeartbeat(agentId);
    }

    // Log every 60 beats (5 minutes with 5-second intervals)
    if (beatCount % 60 === 0) {
      console.log(`[KEEPER] Heartbeat #${beatCount} sent for ${AGENT_IDS.length} agents`);
    }
  }, HEARTBEAT_MS);

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("\n[KEEPER] Received SIGTERM, marking agents offline...");
    for (const agentId of AGENT_IDS) {
      db.get("agents").get(agentId).put({ online: false, lastSeen: Date.now() });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("\n[KEEPER] Received SIGINT, marking agents offline...");
    for (const agentId of AGENT_IDS) {
      db.get("agents").get(agentId).put({ online: false, lastSeen: Date.now() });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    process.exit(0);
  });
}

// Handle uncaught errors
process.on("uncaughtException", (err) => {
  console.error("[KEEPER] Uncaught exception:", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("[KEEPER] Unhandled rejection:", reason);
});

// Start the keeper
main().catch((err) => {
  console.error("[KEEPER] Fatal error:", err);
  process.exit(1);
});
