/**
 * P2PCLAW Monitoring - Auto-Recovery Scripts
 * Detects stuck agents, auto-restarts failed citizens, rotates API keys
 */

import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";
import { getStaleAgents, getOfflineAgents } from "./health-dashboard.js";
import { logger } from "./logger.js";

const execAsync = promisify(exec);

// Configuration
const config = {
  staleThresholdMinutes: parseInt(process.env.RECOVERY_STALE_THRESHOLD || "10"),
  restartDelay: parseInt(process.env.RECOVERY_RESTART_DELAY || "30000"),
  maxRestartAttempts: parseInt(process.env.RECOVERY_MAX_ATTEMPTS || "3"),
  apiBaseUrl: process.env.API_BASE_URL || "https://p2pclaw-mcp-server-production.up.railway.app",
  apiKeys: (process.env.API_KEYS || "").split(",").filter(Boolean),
  currentApiKeyIndex: parseInt(process.env.API_KEY_INDEX || "0"),
  // Agent process mappings (agent group -> process name)
  agentProcesses: {
    citizens: "citizens.js",
    citizens2: "citizens2.js",
    citizens6: "citizens6.js",
    citizens7: "citizens7.js",
    citizens8: "citizens8.js",
    citizens9: "citizens9.js",
    citizens10: "citizens10.js",
    citizens11: "citizens11.js",
  },
};

// State tracking
const restartAttempts = new Map();
const rateLimitTracking = new Map();

/**
 * Check if a process is running
 */
async function isProcessRunning(processName) {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH`);
      return stdout.toLowerCase().includes(processName.toLowerCase());
    } else {
      const { stdout } = await execAsync(`pgrep -f "${processName}"`);
      return stdout.trim().length > 0;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Get process PID
 */
async function getProcessPid(processName) {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execAsync(
        `wmic process where "name='node.exe'" get processid,commandline /format:csv`,
      );
      const lines = stdout.split("\n").filter((l) => l.includes(processName));
      if (lines.length > 1) {
        const parts = lines[1].split(",");
        return parseInt(parts[0]);
      }
    } else {
      const { stdout } = await execAsync(`pgrep -f "${processName}" -o`);
      return parseInt(stdout.trim());
    }
  } catch (error) {
    return null;
  }
  return null;
}

/**
 * Kill a process
 */
async function killProcess(processName) {
  try {
    const pid = await getProcessPid(processName);
    if (!pid) {
      logger.warn("Process not found to kill", { processName });
      return false;
    }

    if (process.platform === "win32") {
      await execAsync(`taskkill /PID ${pid} /F`);
    } else {
      await execAsync(`kill -9 ${pid}`);
    }

    logger.info("Process killed", { processName, pid });
    return true;
  } catch (error) {
    logger.error("Failed to kill process", { processName, error: error.message });
    return false;
  }
}

/**
 * Start an agent process
 */
async function startAgentProcess(agentGroup, workingDir = null) {
  const scriptName = config.agentProcesses[agentGroup];
  if (!scriptName) {
    logger.error("Unknown agent group", { agentGroup });
    return false;
  }

  const baseDir = workingDir || process.cwd();
  const scriptPath = `${baseDir}/packages/agents/${scriptName}`;

  try {
    // Check if already running
    if (await isProcessRunning(scriptName)) {
      logger.info("Agent already running", { agentGroup });
      return true;
    }

    // Start the process
    const startCmd =
      process.platform === "win32"
        ? `start "citizen-${agentGroup}" node ${scriptPath}`
        : `nohup node ${scriptPath} > logs/${agentGroup}.log 2>&1 &`;

    await execAsync(startCmd, { cwd: baseDir });

    logger.info("Agent process started", { agentGroup, scriptPath });
    return true;
  } catch (error) {
    logger.error("Failed to start agent", { agentGroup, error: error.message });
    return false;
  }
}

/**
 * Restart a specific agent group
 */
async function restartAgentGroup(agentGroup, workingDir = null) {
  const key = agentGroup;
  const attempts = restartAttempts.get(key) || 0;

  if (attempts >= config.maxRestartAttempts) {
    logger.error("Max restart attempts reached", { agentGroup, attempts });
    return false;
  }

  logger.info("Restarting agent group", { agentGroup, attempt: attempts + 1 });

  // Kill existing process
  await killProcess(config.agentProcesses[agentGroup]);

  // Wait a bit
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Start new process
  const success = await startAgentGroup(agentGroup, workingDir);

  if (success) {
    restartAttempts.set(key, 0);
  } else {
    restartAttempts.set(key, attempts + 1);
  }

  return success;
}

/**
 * Detect stuck agents
 */
async function detectStuckAgents() {
  const staleAgents = await getStaleAgents(config.staleThresholdMinutes);

  if (staleAgents.length > 0) {
    logger.warn("Stale agents detected", {
      count: staleAgents.length,
      agents: staleAgents.map((a) => a.id),
    });
  }

  return staleAgents;
}

/**
 * Auto-restart failed citizens
 */
async function autoRestartFailedCitizens() {
  const offlineAgents = await getOfflineAgents();

  // Group offline agents by their group
  const offlineByGroup = {};
  for (const agent of offlineAgents) {
    if (!offlineByGroup[agent.group]) {
      offlineByGroup[agent.group] = [];
    }
    offlineByGroup[agent.group].push(agent.id);
  }

  // Restart each group with offline agents
  for (const [group, agents] of Object.entries(offlineByGroup)) {
    logger.info(`Auto-restarting ${group} due to ${agents.length} offline agents`);
    await restartAgentGroup(group);
  }

  return offlineByGroup;
}

/**
 * Check API rate limits
 */
async function checkApiRateLimits() {
  try {
    // Try to call the API
    const response = await axios.get(`${config.apiBaseUrl}/swarm-status`, {
      timeout: 5000,
    });

    // Reset rate limit tracking on success
    rateLimitTracking.set("lastSuccess", Date.now());
    return { hit: false, remaining: "unknown" };
  } catch (error) {
    if (error.response?.status === 429) {
      const current = rateLimitTracking.get("hitCount") || 0;
      rateLimitTracking.set("hitCount", current + 1);
      rateLimitTracking.set("lastHit", Date.now());

      logger.warn("API rate limit hit", {
        hitCount: current + 1,
        resetAfter: error.response.headers["retry-after"] || "unknown",
      });

      return {
        hit: true,
        hitCount: current + 1,
        retryAfter: error.response.headers["retry-after"],
      };
    }

    return { hit: false, error: error.message };
  }
}

/**
 * Rotate API key
 */
async function rotateApiKey() {
  if (config.apiKeys.length <= 1) {
    logger.warn("Only one API key available, cannot rotate");
    return false;
  }

  const nextIndex = (config.currentApiKeyIndex + 1) % config.apiKeys.length;
  const newKey = config.apiKeys[nextIndex];

  logger.info("Rotating API key", {
    oldIndex: config.currentApiKeyIndex,
    newIndex: nextIndex,
  });

  // In production, this would update environment or restart services
  process.env.API_KEY = newKey;
  config.currentApiKeyIndex = nextIndex;

  // Test the new key
  const testResult = await checkApiRateLimits();

  if (testResult.hit) {
    // Key still rate limited, try next
    return rotateApiKey();
  }

  return true;
}

/**
 * Handle rate limit situation
 */
async function handleRateLimit() {
  const hitCount = rateLimitTracking.get("hitCount") || 0;

  if (hitCount >= 3) {
    logger.warn("Multiple rate limits detected, rotating API key");
    return await rotateApiKey();
  }

  // Wait before retry
  const waitTime = Math.min(60000, hitCount * 10000);
  logger.info("Waiting before retry", { waitTime });
  await new Promise((resolve) => setTimeout(resolve, waitTime));

  return true;
}

/**
 * Network connectivity check
 */
async function checkNetworkConnectivity() {
  const endpoints = [
    config.apiBaseUrl,
    "https://p2pclaw-relay-production.up.railway.app",
    "https://api.arxiv.org",
  ];

  const results = [];

  for (const endpoint of endpoints) {
    try {
      const start = Date.now();
      await axios.get(endpoint, { timeout: 5000 });
      results.push({ endpoint, online: true, latency: Date.now() - start });
    } catch (error) {
      results.push({ endpoint, online: false, error: error.message });
    }
  }

  const allOnline = results.every((r) => r.online);

  if (!allOnline) {
    logger.error("Network connectivity issues detected", { results });
  }

  return { isOnline: allOnline, results };
}

/**
 * Full recovery check
 */
async function runRecoveryCheck() {
  logger.info("Running recovery check");

  const results = {
    staleAgents: [],
    offlineAgents: {},
    rateLimit: null,
    network: null,
    actions: [],
  };

  // Check for stale agents
  try {
    results.staleAgents = await detectStuckAgents();
  } catch (error) {
    logger.error("Failed to detect stuck agents", { error: error.message });
  }

  // Check network connectivity
  try {
    results.network = await checkNetworkConnectivity();
  } catch (error) {
    logger.error("Network check failed", { error: error.message });
  }

  // Check rate limits
  try {
    results.rateLimit = await checkApiRateLimits();
    if (results.rateLimit.hit) {
      await handleRateLimit();
      results.actions.push("rate_limit_handled");
    }
  } catch (error) {
    logger.error("Rate limit check failed", { error: error.message });
  }

  // Auto-restart if needed
  if (results.staleAgents.length > 5) {
    try {
      results.offlineAgents = await autoRestartFailedCitizens();
      results.actions.push("auto_restart_triggered");
    } catch (error) {
      logger.error("Auto-restart failed", { error: error.message });
    }
  }

  logger.info("Recovery check completed", {
    staleCount: results.staleAgents.length,
    actions: results.actions,
  });

  return results;
}

/**
 * Start continuous recovery monitoring
 */
function startRecoveryMonitoring(intervalMs = 120000) {
  const check = async () => {
    try {
      await runRecoveryCheck();
    } catch (error) {
      logger.error("Recovery monitoring error", { error: error.message });
    }

    setTimeout(check, intervalMs);
  };

  check();
  logger.info("Recovery monitoring started", { intervalMs });
}

export {
  detectStuckAgents,
  autoRestartFailedCitizens,
  checkApiRateLimits,
  rotateApiKey,
  handleRateLimit,
  checkNetworkConnectivity,
  runRecoveryCheck,
  startRecoveryMonitoring,
  restartAgentGroup,
  config as recoveryConfig,
};
