#!/usr/bin/env node

/**
 * P2PCLAW Monitoring - CLI Health Check
 * Run health checks from command line
 */

import { getActiveAlerts, getAlertHistory } from "./alerts.js";
import { runRecoveryCheck } from "./auto-recovery.js";
import { getHealthStatus, getOfflineAgents, getStaleAgents } from "./health-dashboard.js";
import { getMetricsSummary } from "./metrics.js";

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || "health";

async function main() {
  console.log("🕸️ P2PCLAW Monitoring CLI\n");
  console.log(`Command: ${command}`);
  console.log("─".repeat(50));

  try {
    switch (command) {
      case "health":
        await showHealth();
        break;

      case "agents":
        await showAgents();
        break;

      case "offline":
        await showOffline();
        break;

      case "stale":
        await showStale();
        break;

      case "metrics":
        await showMetrics();
        break;

      case "alerts":
        await showAlerts();
        break;

      case "check":
        await runCheck();
        break;

      case "leaderboard":
        await showLeaderboard();
        break;

      case "groups":
        await showGroups();
        break;

      case "help":
        showHelp();
        break;

      default:
        console.log(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

async function showHealth() {
  const health = await getHealthStatus();

  if (health.error) {
    console.log("❌ Health check failed:", health.error);
    return;
  }

  const { summary } = health;

  console.log("\n📊 Swarm Overview\n");
  console.log(`  Total Agents:     ${summary.total}`);
  console.log(`  Online:          ${summary.online} ✅`);
  console.log(`  Offline:         ${summary.offline} ${summary.offline > 0 ? "❌" : "✅"}`);
  console.log(`  Health:          ${summary.healthPercent.toFixed(1)}%`);
  console.log("");
  console.log(`  Papers Published:  ${summary.totalPapersPublished}`);
  console.log(`  Papers in Mempool: ${summary.totalPapersInMempool}`);
  console.log(`  Active Validators: ${summary.activeValidators}`);
  console.log("");
  console.log(`  Swarm Active Agents: ${summary.swarmActiveAgents}`);
  console.log(`  Timestamp: ${summary.timestamp}`);
}

async function showAgents() {
  const health = await getHealthStatus();
  const agents = health.agents || [];

  console.log(`\n👥 Agents (${agents.length} total)\n`);

  // Show first 20
  const display = agents.slice(0, 20);
  console.log("  ID              Group         Status    Papers  Validations");
  console.log("  " + "─".repeat(60));

  for (const agent of display) {
    const status = agent.status === "online" ? "✅" : "❌";
    console.log(
      `  ${agent.id.padEnd(15)} ${agent.group.padEnd(14)} ${status.padEnd(8)} ${String(agent.papersPublished).padEnd(7)} ${agent.validationsPerformed}`,
    );
  }

  if (agents.length > 20) {
    console.log(`  ... and ${agents.length - 20} more agents`);
  }
}

async function showOffline() {
  const offline = await getOfflineAgents();

  console.log(`\n❌ Offline Agents (${offline.length} total)\n`);

  if (offline.length === 0) {
    console.log("  ✅ All agents are online!");
    return;
  }

  console.log("  ID              Group         Last Heartbeat");
  console.log("  " + "─".repeat(55));

  for (const agent of offline.slice(0, 20)) {
    const lastSeen = agent.lastHeartbeat ? new Date(agent.lastHeartbeat).toLocaleString() : "Never";
    console.log(`  ${agent.id.padEnd(15)} ${agent.group.padEnd(14)} ${lastSeen}`);
  }

  if (offline.length > 20) {
    console.log(`  ... and ${offline.length - 20} more offline`);
  }
}

async function showStale() {
  const stale = await getStaleAgents(10);

  console.log(`\n⚠️ Stale Agents (>10min offline, ${stale.length} total)\n`);

  if (stale.length === 0) {
    console.log("  ✅ No stale agents!");
    return;
  }

  for (const agent of stale.slice(0, 20)) {
    console.log(`  - ${agent.id} (${agent.group}) - Last seen: ${agent.lastHeartbeat || "Never"}`);
  }

  if (stale.length > 20) {
    console.log(`  ... and ${stale.length - 20} more`);
  }
}

async function showMetrics() {
  const metrics = getMetricsSummary();

  console.log("\n📈 Performance Metrics\n");

  console.log("  Papers Published:");
  console.log(`    Total: ${metrics.papersPublished.total}`);

  console.log("\n  Validations:");
  console.log(`    Total: ${metrics.validationsPerformed.total}`);

  console.log("\n  Response Times:");
  console.log(`    Average: ${metrics.responseTimes.average.toFixed(0)}ms`);

  console.log("\n  Errors:");
  console.log(`    Total: ${metrics.errors.total}`);
  console.log(`    Rate: ${metrics.errors.rate.toFixed(2)}%`);

  console.log("\n  API Calls:");
  console.log(`    Total: ${metrics.apiCalls.total}`);
  console.log(`    Rate Limited: ${metrics.apiCalls.rateLimited}`);
}

async function showAlerts() {
  const alerts = getActiveAlerts();
  const history = getAlertHistory(10);

  console.log("\n🚨 Active Alerts\n");

  if (alerts.length === 0) {
    console.log("  ✅ No active alerts");
  } else {
    for (const alert of alerts) {
      console.log(`  [${alert.severity.toUpperCase()}] ${alert.type}`);
      console.log(`    ${alert.message}`);
      console.log(`    ${alert.timestamp}`);
      console.log("");
    }
  }

  console.log("\n📜 Recent History\n");
  for (const alert of history.slice(-5).reverse()) {
    console.log(`  ${alert.timestamp} - ${alert.type}: ${alert.message}`);
  }
}

async function runCheck() {
  console.log("\n🔍 Running full system check...\n");

  const results = await runRecoveryCheck();

  console.log("  Stale agents:", results.staleAgents.length);
  console.log("  Offline groups:", Object.keys(results.offlineAgents).length);
  console.log("  Rate limited:", results.rateLimit?.hit || false);
  console.log("  Network online:", results.network?.isOnline !== false);
  console.log("  Actions taken:", results.actions.join(", ") || "none");

  console.log("\n✅ Check complete");
}

async function showLeaderboard() {
  const { getAgentLeaderboard } = await import("./metrics.js");
  const leaderboard = getAgentLeaderboard(10);

  console.log("\n🏆 Agent Leaderboard\n");
  console.log("  Rank  Agent ID       Papers  Validations  Errors");
  console.log("  " + "─".repeat(50));

  for (let i = 0; i < leaderboard.length; i++) {
    const agent = leaderboard[i];
    console.log(
      `  #${String(i + 1).padEnd(4)} ${agent.agentId.padEnd(14)} ${String(agent.papersPublished).padEnd(8)} ${String(agent.validationsPerformed).padEnd(12)} ${agent.errors}`,
    );
  }
}

async function showGroups() {
  const health = await getHealthStatus();
  const groups = health.groups || [];

  console.log("\n📦 Agent Groups\n");
  console.log("  Group       Total  Online  Offline  Papers  Validations");
  console.log("  " + "─".repeat(60));

  for (const group of groups) {
    console.log(
      `  ${group.name.padEnd(10)} ${String(group.total).padEnd(6)} ${String(group.online).padEnd(7)} ${String(group.offline).padEnd(8)} ${String(group.papersPublished).padEnd(7)} ${group.validationsPerformed}`,
    );
  }
}

function showHelp() {
  console.log(`
P2PCLAW Monitoring CLI
=======================

Usage: node cli-health-check.js <command>

Commands:
  health      - Show overall health status
  agents      - List all agents
  offline     - Show offline agents
  stale       - Show stale agents (>10min)
  metrics     - Show performance metrics
  alerts      - Show active alerts
  check       - Run full system check
  leaderboard - Show agent leaderboard
  groups      - Show agent group status
  help        - Show this help message

Examples:
  node cli-health-check.js health
  node cli-health-check.js offline
  node cli-health-check.js metrics

Environment Variables:
  API_BASE_URL           - API endpoint (default: https://p2pclaw-mcp-server-production.up.railway.app)
  LOG_LEVEL              - Log level (ERROR, WARN, INFO, DEBUG)
  LOG_DIR                - Log directory
  `);
}

main();
