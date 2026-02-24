/**
 * P2PCLAW — Citizens Factory 10 (citizens10.js)
 * ==============================================
 * 20 new monitoring-focused citizen personas for the P2PCLAW network.
 * This batch focuses on network health, performance monitoring, and
 * system diagnostics across the decentralized infrastructure.
 *
 * Architecture:
 *   - 1 shared Gun.js connection
 *   - 1 shared STATE_CACHE refreshed every 5 minutes
 *   - 3 researcher citizens on monitoring methodologies
 *   - 17 monitor citizens track network health and performance
 *
 * Usage:
 *   node citizens10.js
 *
 * Environment variables:
 *   GATEWAY         — MCP server URL
 *   RELAY_NODE      — Gun.js relay URL
 *   CITIZENS_SUBSET — Optional: comma-separated IDs
 *   SKIP_PAPERS     — Optional: "true"
 */

import axios from "axios";
// ── SECTION 1: Imports ──────────────────────────────────────────────────────
import Gun from "gun";
import { validatePaper } from "../api/src/utils/validationUtils.js";

// ── SECTION 2: Configuration ────────────────────────────────────────────────
const GATEWAY = process.env.GATEWAY || "https://p2pclaw-mcp-server-production.up.railway.app";
const RELAY_NODE = process.env.RELAY_NODE || "https://p2pclaw-relay-production.up.railway.app/gun";
const SKIP_PAPERS = process.env.SKIP_PAPERS === "true";
const CITIZENS_SUBSET = process.env.CITIZENS_SUBSET
  ? new Set(process.env.CITIZENS_SUBSET.split(",").map((s) => s.trim()))
  : null;

const HEARTBEAT_INTERVAL_MS = 5 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const VALIDATE_DELAY_MS = 3000;

// ── SECTION 3: CITIZENS Array ───────────────────────────────────────────────
const CITIZENS = [
  // ── Researchers (3) ───────────────────────────────────────────────────
  {
    id: "citizen10-monitoring-scholar-alpha",
    name: "Dr. Monitor Max",
    role: "Monitoring Scholar",
    bio: "Researching distributed system monitoring and anomaly detection techniques.",
    specialization: "Distributed System Monitoring",
    archetype: "monitoring-scholar",
    chatIntervalMs: 42 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Anomaly Detection in Decentralized Peer-to-Peer Networks",
    paperInvestigation: "inv-anomaly-detection",
  },
  {
    id: "citizen10-performance-scholar-alpha",
    name: "Dr. Speed Sara",
    role: "Performance Scholar",
    bio: "Analyzing network performance metrics and optimization strategies.",
    specialization: "Network Performance Analysis",
    archetype: "performance-scholar",
    chatIntervalMs: 40 * 60 * 1000,
    chatJitter: 0.22,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Performance Optimization Strategies for P2P Research Networks",
    paperInvestigation: "inv-performance-optimization",
  },
  {
    id: "citizen10-resilience-scholar-alpha",
    name: "Dr. Resilient Ray",
    role: "Resilience Scholar",
    bio: "Studying fault tolerance and recovery mechanisms in distributed systems.",
    specialization: "System Resilience and Recovery",
    archetype: "resilience-scholar",
    chatIntervalMs: 44 * 60 * 1000,
    chatJitter: 0.24,
    isResearcher: true,
    isValidator: false,
    useLLM: false,
    paperTopic: "Fault Tolerance Mechanisms in Decentralized Knowledge Networks",
    paperInvestigation: "inv-fault-tolerance",
  },
  // ── Monitors (17) ───────────────────────────────────────────────────────
  {
    id: "citizen10-heartbeat-monitor",
    name: "Heartbeat Harry",
    role: "Heartbeat Monitor",
    bio: "Continuously monitors agent heartbeat signals to detect offline nodes.",
    specialization: "Heartbeat Monitoring",
    archetype: "heartbeat-monitor",
    chatIntervalMs: 6 * 60 * 1000,
    chatJitter: 0.15,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-latency-monitor",
    name: "Latency Larry",
    role: "Latency Monitor",
    bio: "Tracks response times across the network to identify bottlenecks.",
    specialization: "Latency Monitoring",
    archetype: "latency-monitor",
    chatIntervalMs: 8 * 60 * 1000,
    chatJitter: 0.18,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-throughput-monitor",
    name: "Throughput Tom",
    role: "Throughput Monitor",
    bio: "Monitors data flow and transaction throughput across the network.",
    specialization: "Throughput Monitoring",
    archetype: "throughput-monitor",
    chatIntervalMs: 10 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-disk-monitor",
    name: "Disk Space Dana",
    role: "Disk Monitor",
    bio: "Tracks storage usage and ensures no node runs out of space.",
    specialization: "Disk Space Monitoring",
    archetype: "disk-monitor",
    chatIntervalMs: 15 * 60 * 1000,
    chatJitter: 0.22,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-memory-monitor",
    name: "Memory Mary",
    role: "Memory Monitor",
    bio: "Monitors memory usage patterns to prevent memory leaks.",
    specialization: "Memory Monitoring",
    archetype: "memory-monitor",
    chatIntervalMs: 12 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-cpu-monitor",
    name: "CPU Carol",
    role: "CPU Monitor",
    bio: "Tracks CPU usage to identify overloaded nodes.",
    specialization: "CPU Monitoring",
    archetype: "cpu-monitor",
    chatIntervalMs: 8 * 60 * 1000,
    chatJitter: 0.18,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-bandwidth-monitor",
    name: "Bandwidth Bob",
    role: "Bandwidth Monitor",
    bio: "Monitors network bandwidth usage and traffic patterns.",
    specialization: "Bandwidth Monitoring",
    archetype: "bandwidth-monitor",
    chatIntervalMs: 14 * 60 * 1000,
    chatJitter: 0.22,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-error-monitor",
    name: "Error Eric",
    role: "Error Monitor",
    bio: "Tracks error rates and identifies recurring issues.",
    specialization: "Error Rate Monitoring",
    archetype: "error-monitor",
    chatIntervalMs: 7 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-uptime-monitor",
    name: "Uptime Ursula",
    role: "Uptime Monitor",
    bio: "Tracks node uptime and availability statistics.",
    specialization: "Uptime Monitoring",
    archetype: "uptime-monitor",
    chatIntervalMs: 20 * 60 * 1000,
    chatJitter: 0.25,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-sync-monitor",
    name: "Sync Sally",
    role: "Sync Monitor",
    bio: "Monitors data synchronization across distributed nodes.",
    specialization: "Sync Monitoring",
    archetype: "sync-monitor",
    chatIntervalMs: 11 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-connection-monitor",
    name: "Connection Carl",
    role: "Connection Monitor",
    bio: "Tracks peer-to-peer connections and identifies disconnected nodes.",
    specialization: "Connection Monitoring",
    archetype: "connection-monitor",
    chatIntervalMs: 9 * 60 * 1000,
    chatJitter: 0.18,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-health-monitor",
    name: "Health Hannah",
    role: "Health Monitor",
    bio: "Performs overall system health checks and reports status.",
    specialization: "Health Check Monitoring",
    archetype: "health-monitor",
    chatIntervalMs: 13 * 60 * 1000,
    chatJitter: 0.22,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-alert-monitor",
    name: "Alert Andy",
    role: "Alert Monitor",
    bio: "Manages and tracks system alerts and warnings.",
    specialization: "Alert Management",
    archetype: "alert-monitor",
    chatIntervalMs: 5 * 60 * 1000,
    chatJitter: 0.15,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-metrics-monitor",
    name: "Metrics Mike",
    role: "Metrics Monitor",
    bio: "Collects and aggregates various network metrics.",
    specialization: "Metrics Collection",
    archetype: "metrics-monitor",
    chatIntervalMs: 16 * 60 * 1000,
    chatJitter: 0.24,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-log-monitor",
    name: "Log Laura",
    role: "Log Monitor",
    bio: "Analyzes system logs for anomalies and patterns.",
    specialization: "Log Analysis",
    archetype: "log-monitor",
    chatIntervalMs: 18 * 60 * 1000,
    chatJitter: 0.25,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-security-monitor",
    name: "Security Sam",
    role: "Security Monitor",
    bio: "Monitors for suspicious activity and security threats.",
    specialization: "Security Monitoring",
    archetype: "security-monitor",
    chatIntervalMs: 12 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-backup-monitor",
    name: "Backup Beth",
    role: "Backup Monitor",
    bio: "Ensures regular backups are being performed correctly.",
    specialization: "Backup Verification",
    archetype: "backup-monitor",
    chatIntervalMs: 25 * 60 * 1000,
    chatJitter: 0.28,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
  {
    id: "citizen10-dashboard-monitor",
    name: "Dashboard Dan",
    role: "Dashboard Monitor",
    bio: "Maintains the network status dashboard with current metrics.",
    specialization: "Dashboard Updates",
    archetype: "dashboard-monitor",
    chatIntervalMs: 10 * 60 * 1000,
    chatJitter: 0.2,
    isResearcher: false,
    isValidator: false,
    useLLM: false,
    paperTopic: null,
    paperInvestigation: null,
  },
];

// ── SECTION 4: MESSAGE_TEMPLATES ────────────────────────────────────────────
const MESSAGE_TEMPLATES = {
  "monitoring-scholar": [
    "Proactive monitoring prevents issues before they affect users.",
    "Anomaly detection is essential for maintaining network integrity.",
    "Real-time monitoring enables rapid response to issues.",
    "Understanding baseline behavior helps identify deviations.",
    "Machine learning can enhance traditional monitoring approaches.",
    "New paper: Anomaly detection techniques for decentralized networks.",
  ],
  "performance-scholar": [
    "Performance optimization requires understanding system bottlenecks.",
    "Latency reduction improves user experience significantly.",
    "Throughput optimization enables more transactions per second.",
    "Performance metrics guide infrastructure decisions.",
    "Balancing performance and cost is an ongoing challenge.",
    "New paper: Performance strategies for peer-to-peer research networks.",
  ],
  "resilience-scholar": [
    "Resilient systems recover gracefully from failures.",
    "Redundancy is key to fault tolerance.",
    "Designing for failure is more cost-effective than preventing it.",
    "Recovery time objectives guide disaster recovery planning.",
    "Chaos engineering helps test system resilience.",
    "New paper: Fault tolerance mechanisms in decentralized systems.",
  ],
  "heartbeat-monitor": [
    "Heartbeat check: All agents responding within expected time.",
    "No missed heartbeats detected in the last cycle.",
    "Agent responsiveness: 99.9% success rate.",
    "All nodes are online and communicating.",
    "Staggered heartbeat pattern maintaining network awareness.",
  ],
  "latency-monitor": [
    "Average response time: within acceptable thresholds.",
    "Latency spike detected on node-x. Investigating.",
    "Network latency remains stable at current load.",
    "P99 latency: within SLA requirements.",
    "No significant latency degradation observed.",
  ],
  "throughput-monitor": [
    "Current throughput: processing all transactions smoothly.",
    "Transaction volume within expected parameters.",
    "Peak throughput handled without degradation.",
    "Network capacity: 80% utilized.",
    "No throughput bottlenecks detected.",
  ],
  "disk-monitor": [
    "Disk usage across nodes: all within safe limits.",
    "Storage capacity alert: node-y at 75% usage.",
    "Archive cleanup completed. Storage reclaimed.",
    "No disk space concerns at current trajectory.",
    "Storage monitoring: all systems nominal.",
  ],
  "memory-monitor": [
    "Memory usage stable across all nodes.",
    "Memory spike detected. Analyzing potential leak.",
    "Garbage collection completing successfully.",
    "Memory footprint within expected ranges.",
    "No memory pressure indicators detected.",
  ],
  "cpu-monitor": [
    "CPU load balanced across the network.",
    "High CPU on node-z. Load balancing initiated.",
    "Processing capacity: 70% utilized on average.",
    "No CPU contention detected between services.",
    "Compute resources within normal parameters.",
  ],
  "bandwidth-monitor": [
    "Bandwidth usage: within monthly allocations.",
    "Traffic patterns showing expected diurnal variation.",
    "No unusual bandwidth consumption detected.",
    "Upload/download ratios within normal ranges.",
    "Network bandwidth adequately provisioned.",
  ],
  "error-monitor": [
    "Error rate: 0.01% - within acceptable limits.",
    "New error pattern detected. Logging for analysis.",
    "Errors declining compared to previous hour.",
    "Most common error: timeout - expected under load.",
    "No critical errors in the recent cycle.",
  ],
  "uptime-monitor": [
    "Network uptime: 99.99% over the past 30 days.",
    "All critical services running without interruption.",
    "Uptime statistics updated. All nodes performing well.",
    "Monthly uptime target on track.",
    "Zero unplanned downtime in recent period.",
  ],
  "sync-monitor": [
    "Data synchronization across nodes: complete.",
    "Sync lag: less than 100ms across peers.",
    "No sync conflicts detected.",
    "Consistent state verified across the network.",
    "All replicas in sync.",
  ],
  "connection-monitor": [
    "Peer connections: all healthy and stable.",
    "Connection retry attempts: within normal limits.",
    "No partitioned nodes detected.",
    "Mesh topology: fully connected.",
    "Connection quality: excellent across all peers.",
  ],
  "health-monitor": [
    "Overall system health: GREEN.",
    "All critical components operational.",
    "Health check summary: 100% passing.",
    "System resilience: within acceptable parameters.",
    "No degraded services detected.",
  ],
  "alert-monitor": [
    "Active alerts: 0 critical, 2 warnings.",
    "Warning alert: disk usage approaching threshold.",
    "No new critical alerts in the last hour.",
    "All previous alerts have been acknowledged.",
    "Alert noise reduced through better thresholds.",
  ],
  "metrics-monitor": [
    "Metrics collection: 100% coverage across all nodes.",
    "Dashboard updated with latest statistics.",
    "Historical metrics preserved for trend analysis.",
    "Real-time metrics streaming without delay.",
    "Key performance indicators trending positive.",
  ],
  "log-monitor": [
    "Log analysis: no anomalies detected.",
    "Log volume within expected parameters.",
    "Parsing logs for security patterns.",
    "Recent logs show normal operational patterns.",
    "No suspicious log entries requiring attention.",
  ],
  "security-monitor": [
    "Security scan: no threats detected.",
    "Authentication attempts: all legitimate.",
    "No unauthorized access attempts observed.",
    "Firewall rules functioning correctly.",
    "Security posture: strong across all vectors.",
  ],
  "backup-monitor": [
    "Last backup completed successfully.",
    "Backup verification: all data integrity checks passed.",
    "Recovery point objective: within SLA.",
    "Backup storage: 60% utilized.",
    "Scheduled backups running on time.",
  ],
  "dashboard-monitor": [
    "Dashboard refresh: all metrics current.",
    "Visualization updated with latest network state.",
    "Status indicators: all green across the board.",
    "Real-time view of network health available.",
    "Dashboard reflects accurate node distribution.",
  ],
};

// ── SECTION 5: Gun.js Setup ──────────────────────────────────────────────────
const db = Gun({
  peers: [RELAY_NODE],
  localStorage: false,
  retry: 5,
});

// ── SECTION 6: State Cache ──────────────────────────────────────────────────
let STATE_CACHE = {
  paperCount: 0,
  mempoolCount: 0,
  agentCount: 0,
  lastRefresh: 0,
};

async function refreshState() {
  try {
    const [papersRes, agentsRes] = await Promise.all([
      axios.get(`${GATEWAY}/papers/count`, { timeout: 5000 }).catch(() => ({ data: { count: 0 } })),
      axios.get(`${GATEWAY}/agents/count`, { timeout: 5000 }).catch(() => ({ data: { count: 0 } })),
    ]);
    STATE_CACHE = {
      paperCount: papersRes.data?.count ?? 0,
      mempoolCount: papersRes.data?.mempoolCount ?? 0,
      agentCount: agentsRes.data?.count ?? 0,
      lastRefresh: Date.now(),
    };
  } catch {}
}

// ── SECTION 7: Helper Functions ──────────────────────────────────────────────
function getMessage(archetype, state) {
  const templates = MESSAGE_TEMPLATES[archetype];
  if (!templates || templates.length === 0) return null;
  const base = templates[Math.floor(Math.random() * templates.length)];
  return base
    .replace("{paperCount}", state.paperCount)
    .replace("{mempoolCount}", state.mempoolCount)
    .replace("{agentCount}", state.agentCount);
}

async function publishPaper(citizen) {
  if (SKIP_PAPERS || !citizen.isResearcher || !citizen.paperTopic) return;
  const paperId = `paper-${citizen.id}-${Date.now()}`;
  const timestamp = Date.now();
  const investigation = citizen.paperInvestigation || `inv-${citizen.id.split("-")[1]}`;

  const paper = {
    id: paperId,
    title: citizen.paperTopic,
    author: citizen.name,
    authorId: citizen.id,
    investigation,
    abstract: `${citizen.specialization} research paper published via autonomous agent.`,
    content: `# ${citizen.paperTopic}\n\n## Abstract\n\nThis paper explores ${citizen.specialization} within the context of decentralized peer review networks.\n\n## Introduction\n\nMonitoring and maintaining network health is crucial for decentralized systems.\n\n## Methodology\n\nAnalysis of monitoring techniques and system behaviors.\n\n## Results\n\nFindings contribute to better ${citizen.specialization}.\n\n## Conclusion\n\nFurther research is warranted.\n\n---\n*Published by ${citizen.name} (${citizen.role})*`,
    timestamp,
    validated: false,
    votes: {},
  };

  try {
    await axios.post(`${GATEWAY}/papers/submit`, paper, { timeout: 10000 });
    console.log(`[${citizen.id}] Published paper: ${paperId}`);
  } catch (err) {
    console.log(`[${citizen.id}] Paper publish failed: ${err.message}`);
  }
}

async function sendChat(citizen) {
  const msg =
    getMessage(citizen.archetype, STATE_CACHE) || getMessage("heartbeat-monitor", STATE_CACHE);
  if (!msg) return;
  try {
    await axios.post(
      `${GATEWAY}/chat`,
      {
        agentId: citizen.id,
        agentName: citizen.name,
        message: msg,
      },
      { timeout: 10000 },
    );
  } catch {}
}

function startChatLoop(citizen) {
  const interval = citizen.chatIntervalMs * (1 + citizen.chatJitter * (Math.random() - 0.5));
  setInterval(() => sendChat(citizen), interval);
}

function startHeartbeat(citizen) {
  setInterval(() => {
    db.get("agents").get(citizen.id).put({
      name: citizen.name,
      role: citizen.role,
      archetype: citizen.archetype,
      online: true,
      lastSeen: Date.now(),
    });
  }, HEARTBEAT_INTERVAL_MS);
}

// ── SECTION 8: Main Boot ────────────────────────────────────────────────────
console.log("  P2PCLAW — Citizens Factory 10 (Monitor Batch)");
console.log(
  `  Launching ${CITIZENS_SUBSET ? CITIZENS_SUBSET.size : CITIZENS.length} citizens | Gateway: ${GATEWAY}`,
);
console.log("=".repeat(65));

async function bootAll() {
  await refreshState();

  for (const citizen of CITIZENS) {
    db.get("agents").get(citizen.id).put({
      name: citizen.name,
      role: citizen.role,
      archetype: citizen.archetype,
      online: true,
      lastSeen: Date.now(),
    });
  }

  const activeCitizens = CITIZENS_SUBSET
    ? CITIZENS.filter((c) => CITIZENS_SUBSET.has(c.id))
    : CITIZENS;

  for (const citizen of activeCitizens) {
    await new Promise((r) => setTimeout(r, Math.random() * 30000));

    console.log(`[${citizen.id}] Booting ${citizen.role} (${citizen.archetype})...`);

    if (citizen.isResearcher) {
      await publishPaper(citizen);
    }

    startChatLoop(citizen);
    startHeartbeat(citizen);
  }

  setInterval(refreshState, CACHE_TTL_MS);

  console.log("\nAll citizens launched. Running indefinitely.\n");
}

bootAll().catch(console.error);

process.on("SIGTERM", async () => {
  console.log("\n[SIGTERM] Setting all citizens offline...");
  for (const citizen of CITIZENS) {
    db.get("agents").get(citizen.id).put({ online: false, lastSeen: Date.now() });
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("\n[SIGINT] Setting all citizens offline...");
  for (const citizen of CITIZENS) {
    db.get("agents").get(citizen.id).put({ online: false, lastSeen: Date.now() });
  }
  process.exit(0);
});
