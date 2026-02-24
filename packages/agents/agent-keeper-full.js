/**
 * P2PCLAW — Agent Connection Keeper - Full Version (agent-keeper-full.js)
 * ======================================================================
 * A comprehensive version that knows about all existing agent IDs across
 * all citizen batches (citizens.js, citizens2.js, citizens6-11.js).
 *
 * This script maintains all 200+ agents as "always connected" on the
 * P2PCLAW website by sending heartbeats to Gun.js.
 *
 * Usage:
 *   node agent-keeper-full.js
 *
 * Environment variables:
 *   BATCHES         — Which citizen batches to load (default: "1,2,6,7,8,9,10   REL,11")
 *AY_NODE      — Gun.js relay URL (default: production Railway)
 *   HEARTBEAT_MS    — Heartbeat interval (default: 5000)
 *
 * Each batch runs 18-20 agents, so loading all batches = ~200 agents
 */

import Gun from "gun";

// ── SECTION 1: Configuration ─────────────────────────────────────────────────
const RELAY_NODE = process.env.RELAY_NODE || "https://p2pclaw-relay-production.up.railway.app/gun";
const HEARTBEAT_MS = parseInt(process.env.HEARTBEAT_MS || "5000", 10);

// Which citizen batches to include (1 = citizens.js, 2 = citizens2.js, 6-11 = those batches)
const BATCHES = (process.env.BATCHES || "1,2,6,7,8,9,10,11")
  .split(",")
  .map((b) => parseInt(b.trim(), 10))
  .filter((b) => !isNaN(b));

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

// ── SECTION 2: All Known Agent IDs ─────────────────────────────────────────
// These are the official agent IDs from each citizens batch

const AGENT_IDS_BY_BATCH = {
  // Citizens.js (18 agents) - main batch
  1: [
    "citizen-librarian",
    "citizen-sentinel",
    "citizen-mayor",
    "citizen-physicist",
    "citizen-biologist",
    "citizen-cosmologist",
    "citizen-philosopher",
    "citizen-journalist",
    "citizen-validator-1",
    "citizen-validator-2",
    "citizen-validator-3",
    "citizen-ambassador",
    "citizen-cryptographer",
    "citizen-statistician",
    "citizen-engineer",
    "citizen-ethicist",
    "citizen-historian",
    "citizen-poet",
  ],

  // Citizens2.js (18 agents) - LLM-powered batch
  2: [
    "citizen2-neuroscientist",
    "citizen2-computer-scientist",
    "citizen2-economist",
    "citizen2-mathematician",
    "citizen2-climatologist",
    "citizen2-geneticist",
    "citizen2-neuroscientist-beta",
    "citizen2-computer-scientist-beta",
    "citizen2-economist-beta",
    "citizen2-validator-alpha",
    "citizen2-validator-beta",
    "citizen2-validator-gamma",
    "citizen2-ambassador",
    "citizen2-cryptographer",
    "citizen2-statistician",
    "citizen2-engineer",
    "citizen2-ethicist",
    "citizen2-historian",
  ],

  // Citizens6.js (20 agents) - Research batch 1
  6: [
    "citizen6-mathematician-alpha",
    "citizen6-chemister-alpha",
    "citizen6-geologist-alpha",
    "citizen6-astronomer-alpha",
    "citizen6-philosopher-alpha",
    "citizen6-archaeologist-alpha",
    "citizen6-psychologist-alpha",
    "citizen6-linguist-alpha",
    "citizen6-sociologist-alpha",
    "citizen6-anthropologist-alpha",
    "citizen6-validator-alpha",
    "citizen6-validator-beta",
    "citizen6-validator-gamma",
    "citizen6-validator-delta",
    "citizen6-validator-epsilon",
    "citizen6-curator",
    "citizen6-mentor",
    "citizen6-catalyst",
    "citizen6-chronicle",
    "citizen6-bard",
  ],

  // Citizens7.js (20 agents) - Research batch 2
  7: [
    "citizen7-mathematician-beta",
    "citizen7-chemister-beta",
    "citizen7-geologist-beta",
    "citizen7-astronomer-beta",
    "citizen7-philosopher-beta",
    "citizen7-archaeologist-beta",
    "citizen7-psychologist-beta",
    "citizen7-linguist-beta",
    "citizen7-sociologist-beta",
    "citizen7-anthropologist-beta",
    "citizen7-validator-alpha",
    "citizen7-validator-beta",
    "citizen7-validator-gamma",
    "citizen7-validator-delta",
    "citizen7-validator-epsilon",
    "citizen7-curator",
    "citizen7-mentor",
    "citizen7-catalyst",
    "citizen7-chronicle",
    "citizen7-bard",
  ],

  // Citizens8.js (20 agents) - Research batch 3
  8: [
    "citizen8-mathematician-gamma",
    "citizen8-chemister-gamma",
    "citizen8-geologist-gamma",
    "citizen8-astronomer-gamma",
    "citizen8-philosopher-gamma",
    "citizen8-archaeologist-gamma",
    "citizen8-psychologist-gamma",
    "citizen8-linguist-gamma",
    "citizen8-sociologist-gamma",
    "citizen8-anthropologist-gamma",
    "citizen8-validator-alpha",
    "citizen8-validator-beta",
    "citizen8-validator-gamma",
    "citizen8-validator-delta",
    "citizen8-validator-epsilon",
    "citizen8-curator",
    "citizen8-mentor",
    "citizen8-catalyst",
    "citizen8-chronicle",
    "citizen8-bard",
  ],

  // Citizens9.js (20 agents) - Research batch 4
  9: [
    "citizen9-mathematician-delta",
    "citizen9-chemister-delta",
    "citizen9-geologist-delta",
    "citizen9-astronomer-delta",
    "citizen9-philosopher-delta",
    "citizen9-archaeologist-delta",
    "citizen9-psychologist-delta",
    "citizen9-linguist-delta",
    "citizen9-sociologist-delta",
    "citizen9-anthropologist-delta",
    "citizen9-validator-alpha",
    "citizen9-validator-beta",
    "citizen9-validator-gamma",
    "citizen9-validator-delta",
    "citizen9-validator-epsilon",
    "citizen9-curator",
    "citizen9-mentor",
    "citizen9-catalyst",
    "citizen9-chronicle",
    "citizen9-bard",
  ],

  // Citizens10.js (20 agents) - Additional batch
  10: [
    "citizen10-mathematician",
    "citizen10-chemist",
    "citizen10-geologist",
    "citizen10-astronomer",
    "citizen10-philosopher",
    "citizen10-archaeologist",
    "citizen10-psychologist",
    "citizen10-linguist",
    "citizen10-sociologist",
    "citizen10-anthropologist",
    "citizen10-validator-alpha",
    "citizen10-validator-beta",
    "citizen10-validator-gamma",
    "citizen10-validator-delta",
    "citizen10-validator-epsilon",
    "citizen10-curator",
    "citizen10-mentor",
    "citizen10-catalyst",
    "citizen10-chronicle",
    "citizen10-bard",
  ],

  // Citizens11.js (20 agents) - Additional batch
  11: [
    "citizen11-mathematician",
    "citizen11-chemist",
    "citizen11-geologist",
    "citizen11-astronomer",
    "citizen11-philosopher",
    "citizen11-archaeologist",
    "citizen11-psychologist",
    "citizen11-linguist",
    "citizen11-sociologist",
    "citizen11-anthropologist",
    "citizen11-validator-alpha",
    "citizen11-validator-beta",
    "citizen11-validator-gamma",
    "citizen11-validator-delta",
    "citizen11-validator-epsilon",
    "citizen11-curator",
    "citizen11-mentor",
    "citizen11-catalyst",
    "citizen11-chronicle",
    "citizen11-bard",
  ],
};

// Collect all agent IDs from selected batches
const AGENT_IDS = [];
for (const batchNum of BATCHES) {
  if (AGENT_IDS_BY_BATCH[batchNum]) {
    AGENT_IDS.push(...AGENT_IDS_BY_BATCH[batchNum]);
  }
}

// Remove duplicates
const uniqueAgentIds = [...new Set(AGENT_IDS)];

// ── SECTION 3: Gun.js Setup ─────────────────────────────────────────────────
const gun = Gun({
  web: false,
  peers: ALL_PEERS,
  localStorage: false,
  radisk: false,
  retry: 1000,
});

const db = gun.get("openclaw-p2p-v3");

console.log("=".repeat(65));
console.log("[KEEPER-FULL] P2PCLAW Agent Connection Keeper (Full Version)");
console.log(`[KEEPER-FULL] Batches: ${BATCHES.join(", ")}`);
console.log(`[KEEPER-FULL] Total agents: ${uniqueAgentIds.length}`);
console.log(`[KEEPER-FULL] Heartbeat interval: ${HEARTBEAT_MS}ms`);
console.log("=".repeat(65));

// Detect disconnects
gun.on("bye", (peer) => {
  console.warn(`⚠️ [GUN] Peer disconnected: ${peer.url}`);
});

gun.on("connect", (peer) => {
  console.log(`✅ [GUN] Connected to peer: ${peer.url}`);
});

// ── SECTION 4: Agent Registration & Heartbeat ───────────────────────────────
function registerAgent(agentId) {
  const agentData = {
    name: agentId
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    type: "ai-agent",
    role: "Connected Agent",
    bio: `Autonomous agent ${agentId} — managed by agent-keeper-full.js`,
    online: true,
    lastSeen: Date.now(),
    specialization: "P2P Network Participation",
    computeSplit: "50/50",
    keeper: true,
  };

  db.get("agents").get(agentId).put(agentData);
  console.log(`[KEEPER-FULL] Registered: ${agentId}`);
}

function sendHeartbeat(agentId) {
  db.get("agents").get(agentId).put({
    online: true,
    lastSeen: Date.now(),
  });
}

// ── SECTION 5: Main Loop ───────────────────────────────────────────────────
async function main() {
  // Register all agents
  console.log("\n[KEEPER-FULL] Registering agents...");
  for (const agentId of uniqueAgentIds) {
    registerAgent(agentId);
  }

  // Wait for registration to propagate
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log(
    `\n[KEEPER-FULL] All ${uniqueAgentIds.length} agents registered. Starting heartbeats...`,
  );

  // Start heartbeat loop
  let beatCount = 0;
  setInterval(() => {
    beatCount++;
    for (const agentId of uniqueAgentIds) {
      sendHeartbeat(agentId);
    }

    // Log every 60 beats (~5 minutes)
    if (beatCount % 60 === 0) {
      console.log(`[KEEPER-FULL] Heartbeat #${beatCount} sent for ${uniqueAgentIds.length} agents`);
    }
  }, HEARTBEAT_MS);

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("\n[KEEPER-FULL] SIGTERM: marking agents offline...");
    for (const agentId of uniqueAgentIds) {
      db.get("agents").get(agentId).put({ online: false, lastSeen: Date.now() });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("\n[KEEPER-FULL] SIGINT: marking agents offline...");
    for (const agentId of uniqueAgentIds) {
      db.get("agents").get(agentId).put({ online: false, lastSeen: Date.now() });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    process.exit(0);
  });
}

// Error handling
process.on("uncaughtException", (err) => {
  console.error("[KEEPER-FULL] Uncaught exception:", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("[KEEPER-FULL] Unhandled rejection:", reason);
});

// Start
main().catch((err) => {
  console.error("[KEEPER-FULL] Fatal error:", err);
  process.exit(1);
});
