/**
 * P2PCLAW Monitoring - Health Check Dashboard
 * Monitors all 200+ agents, their status, heartbeats, publications, and validations
 */

import axios from "axios";
import { logger } from "./logger.js";

// Configuration
const config = {
  apiBaseUrl: process.env.API_BASE_URL || "https://p2pclaw-mcp-server-production.up.railway.app",
  checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || "60000"), // 1 minute
  heartbeatTimeout: parseInt(process.env.HEARTBEAT_TIMEOUT || "300000"), // 5 minutes
  agentGroups: (
    process.env.AGENT_GROUPS ||
    "citizens,citizens2,citizens6,citizens7,citizens8,citizens9,citizens10,citizens11"
  ).split(","),
  maxRetries: 3,
  retryDelay: 5000,
};

// Agent registry with known agent configurations
const agentRegistry = new Map();

/**
 * Initialize agent registry with known agent configurations
 */
function initAgentRegistry() {
  const baseAgents = 20; // citizens.js - 20 agents
  const baseAgents2 = 20; // citizens2.js - 20 agents
  const extraAgents = 25; // citizens6-11.js - ~25 each

  let agentId = 1;

  // Add base agents from citizens.js
  for (let i = 0; i < baseAgents; i++) {
    agentRegistry.set(`citizen-${agentId}`, {
      id: `citizen-${agentId}`,
      group: "citizens",
      type: "researcher",
      createdAt: Date.now() - i * 60000,
    });
    agentId++;
  }

  // Add agents from citizens2.js
  for (let i = 0; i < baseAgents2; i++) {
    agentRegistry.set(`citizen-${agentId}`, {
      id: `citizen-${agentId}`,
      group: "citizens2",
      type: "researcher",
      createdAt: Date.now() - (baseAgents + i) * 60000,
    });
    agentId++;
  }

  // Add agents from citizens6-11.js
  for (let g = 6; g <= 11; g++) {
    for (let i = 0; i < extraAgents; i++) {
      agentRegistry.set(`citizen-${agentId}`, {
        id: `citizen-${agentId}`,
        group: `citizens${g}`,
        type: "researcher",
        createdAt: Date.now() - (baseAgents + baseAgents2 + (g - 6) * extraAgents + i) * 60000,
      });
      agentId++;
    }
  }

  logger.info("Agent registry initialized", { totalAgents: agentRegistry.size });
}

/**
 * Fetch swarm status from the API
 */
async function fetchSwarmStatus() {
  try {
    const response = await axios.get(`${config.apiBaseUrl}/swarm-status`, {
      timeout: 15000,
      headers: {
        Accept: "application/json",
      },
    });
    return response.data;
  } catch (error) {
    logger.error("Failed to fetch swarm status", { error: error.message });
    throw error;
  }
}

/**
 * Fetch agent heartbeats from the API
 */
async function fetchAgentHeartbeats() {
  try {
    const response = await axios.get(`${config.apiBaseUrl}/agents/heartbeats`, {
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    // Heartbeat endpoint might not exist, return empty
    logger.warn("Heartbeat endpoint not available", { error: error.message });
    return { agents: {} };
  }
}

/**
 * Fetch paper statistics
 */
async function fetchPaperStats() {
  try {
    const [mempoolRes, papersRes] = await Promise.all([
      axios.get(`${config.apiBaseUrl}/mempool?limit=1000`, { timeout: 10000 }),
      axios.get(`${config.apiBaseUrl}/latest-papers?limit=500`, { timeout: 10000 }),
    ]);

    return {
      mempool: mempoolRes.data,
      papers: papersRes.data,
    };
  } catch (error) {
    logger.error("Failed to fetch paper stats", { error: error.message });
    return { mempool: [], papers: [] };
  }
}

/**
 * Check if an agent is online based on heartbeat
 */
function isAgentOnline(heartbeat, currentTime) {
  if (!heartbeat || !heartbeat.lastSeen) return false;
  const lastSeen = new Date(heartbeat.lastSeen).getTime();
  return currentTime - lastSeen < config.heartbeatTimeout;
}

/**
 * Get aggregated health status
 */
async function getHealthStatus() {
  const currentTime = Date.now();

  try {
    const [swarmStatus, heartbeats, paperStats] = await Promise.all([
      fetchSwarmStatus(),
      fetchAgentHeartbeats(),
      fetchPaperStats(),
    ]);

    // Process agent status
    const agents = [];
    const heartbeatData = heartbeats.agents || {};

    for (const [agentId, agentConfig] of agentRegistry.entries()) {
      const heartbeat = heartbeatData[agentId];
      const online = isAgentOnline(heartbeat, currentTime);

      // Count papers for this agent
      const agentPapers = paperStats.papers.filter(
        (p) => p.author === agentId || p.agent_id === agentId,
      );
      const agentMempool = paperStats.mempool.filter(
        (p) => p.author === agentId || p.agent_id === agentId,
      );

      // Count validations
      const validations = paperStats.mempool.reduce((sum, p) => {
        return sum + (p.validations_by?.includes(agentId) ? 1 : 0);
      }, 0);

      agents.push({
        id: agentId,
        group: agentConfig.group,
        type: agentConfig.type,
        status: online ? "online" : "offline",
        lastHeartbeat: heartbeat?.lastSeen || null,
        papersPublished: agentPapers.length,
        papersInMempool: agentMempool.length,
        validationsPerformed: validations,
        uptimePercent: heartbeat?.uptime || 0,
      });
    }

    // Calculate summary statistics
    const onlineCount = agents.filter((a) => a.status === "online").length;
    const offlineCount = agents.length - onlineCount;

    const summary = {
      total: agents.length,
      online: onlineCount,
      offline: offlineCount,
      healthPercent: (onlineCount / agents.length) * 100,
      totalPapersPublished: paperStats.papers.length,
      totalPapersInMempool: paperStats.mempool.length,
      activeValidators: swarmStatus?.swarm?.active_validators || 0,
      swarmActiveAgents: swarmStatus?.swarm?.active_agents || 0,
      timestamp: new Date().toISOString(),
    };

    // Group statistics
    const groups = {};
    for (const agent of agents) {
      if (!groups[agent.group]) {
        groups[agent.group] = {
          name: agent.group,
          total: 0,
          online: 0,
          offline: 0,
          papersPublished: 0,
          validationsPerformed: 0,
        };
      }
      groups[agent.group].total++;
      if (agent.status === "online") groups[agent.group].online++;
      else groups[agent.group].offline++;
      groups[agent.group].papersPublished += agent.papersPublished;
      groups[agent.group].validationsPerformed += agent.validationsPerformed;
    }

    return {
      summary,
      agents,
      groups: Object.values(groups),
      swarm: swarmStatus,
      mempool: paperStats.mempool.slice(0, 20), // Top 20 pending
      recentPapers: paperStats.papers.slice(0, 10),
    };
  } catch (error) {
    logger.error("Health check failed", { error: error.message, stack: error.stack });
    return {
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Get agent status by ID
 */
async function getAgentStatus(agentId) {
  const health = await getHealthStatus();
  if (health.error) return health;

  return health.agents.find((a) => a.id === agentId) || { error: "Agent not found" };
}

/**
 * Get offline agents
 */
async function getOfflineAgents() {
  const health = await getHealthStatus();
  if (health.error) return [];

  return health.agents.filter((a) => a.status === "offline");
}

/**
 * Get stale agents (offline for more than threshold)
 */
async function getStaleAgents(minOfflineMinutes = 10) {
  const health = await getHealthStatus();
  if (health.error) return [];

  const threshold = Date.now() - minOfflineMinutes * 60 * 1000;

  return health.agents.filter((a) => {
    if (a.status !== "offline") return false;
    if (!a.lastHeartbeat) return true;
    return new Date(a.lastHeartbeat).getTime() < threshold;
  });
}

/**
 * Start continuous monitoring
 */
function startMonitoring(callback) {
  initAgentRegistry();

  const check = async () => {
    const health = await getHealthStatus();
    if (callback) callback(health);
    setTimeout(check, config.checkInterval);
  };

  check();
  logger.info("Health monitoring started", { interval: config.checkInterval });
}

export {
  getHealthStatus,
  getAgentStatus,
  getOfflineAgents,
  getStaleAgents,
  startMonitoring,
  initAgentRegistry,
  config as healthConfig,
};
