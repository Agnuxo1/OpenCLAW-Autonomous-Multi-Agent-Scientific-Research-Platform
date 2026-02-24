/**
 * P2PCLAW Monitoring - Main Entry Point
 * Central hub for all monitoring components
 */

import express from "express";
import { getActiveAlerts, getAlertHistory, runAlertChecks } from "./alerts.js";
import { runRecoveryCheck, startRecoveryMonitoring } from "./auto-recovery.js";
import {
  getHealthStatus,
  getAgentStatus,
  getOfflineAgents,
  initAgentRegistry,
} from "./health-dashboard.js";
import { logger } from "./logger.js";
import { getMetricsSummary, startMetricsCollection } from "./metrics.js";

// Configuration
const config = {
  port: parseInt(process.env.MONITORING_PORT || "3001"),
  enableDashboard: process.env.MONITORING_DASHBOARD !== "false",
  enableAutoRecovery: process.env.MONITORING_AUTO_RECOVERY !== "false",
};

// Create Express app
const app = express();
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.debug("Request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
    });
  });
  next();
});

/**
 * GET / - Dashboard HTML
 */
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(getDashboardHTML());
});

/**
 * GET /health - Overall health status
 */
app.get("/health", async (req, res) => {
  try {
    const health = await getHealthStatus();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /health/json - Raw health data
 */
app.get("/health/json", async (req, res) => {
  try {
    const health = await getHealthStatus();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /agents - All agents status
 */
app.get("/agents", async (req, res) => {
  try {
    const health = await getHealthStatus();
    res.json(health.agents || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /agents/:id - Specific agent status
 */
app.get("/agents/:id", async (req, res) => {
  try {
    const agent = await getAgentStatus(req.params.id);
    if (agent.error) {
      res.status(404).json(agent);
    } else {
      res.json(agent);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /agents/offline - Offline agents
 */
app.get("/agents/offline", async (req, res) => {
  try {
    const offline = await getOfflineAgents();
    res.json(offline);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /metrics - Performance metrics
 */
app.get("/metrics", (req, res) => {
  try {
    const summary = getMetricsSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /metrics/prometheus - Prometheus format
 */
app.get("/metrics/prometheus", (req, res) => {
  try {
    const summary = getMetricsSummary();
    res.setHeader("Content-Type", "text/plain");
    res.send(formatPrometheus(summary));
  } catch (error) {
    res.status(500).text(error.message);
  }
});

/**
 * GET /alerts - Active alerts
 */
app.get("/alerts", (req, res) => {
  res.json(getActiveAlerts());
});

/**
 * GET /alerts/history - Alert history
 */
app.get("/alerts/history", (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(getAlertHistory(limit));
});

/**
 * POST /alerts/:id/acknowledge - Acknowledge alert
 */
app.post("/alerts/:id/acknowledge", (req, res) => {
  const { acknowledgeAlert } = require("./alerts.js");
  const success = acknowledgeAlert(req.params.id);
  res.json({ success });
});

/**
 * POST /alerts/:id/clear - Clear alert
 */
app.post("/alerts/:id/clear", (req, res) => {
  const { clearAlert } = require("./alerts.js");
  const success = clearAlert(req.params.id);
  res.json({ success });
});

/**
 * POST /check - Trigger manual check
 */
app.post("/check", async (req, res) => {
  try {
    const results = await runRecoveryCheck();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /groups - Agent groups status
 */
app.get("/groups", async (req, res) => {
  try {
    const health = await getHealthStatus();
    res.json(health.groups || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /swarm - Swarm status from API
 */
app.get("/swarm", async (req, res) => {
  try {
    const health = await getHealthStatus();
    res.json(health.swarm || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /leaderboard - Agent leaderboard
 */
app.get("/leaderboard", (req, res) => {
  const { getAgentLeaderboard } = require("./metrics.js");
  const limit = parseInt(req.query.limit) || 20;
  res.json(getAgentLeaderboard(limit));
});

/**
 * Format Prometheus metrics
 */
function formatPrometheus(summary) {
  let output = "";

  // Summary metrics
  output += `# HELP p2pclaw_agents_total Total number of agents\n`;
  output += `# TYPE p2pclaw_agents_total gauge\n`;
  output += `p2pclaw_agents_total ${summary.papersPublished?.total || 0}\n`;

  // Papers published
  output += `# HELP p2pclaw_papers_published_total Total papers published\n`;
  output += `# TYPE p2pclaw_papers_published_total counter\n`;
  output += `p2pclaw_papers_published_total ${summary.papersPublished?.total || 0}\n`;

  // Validations
  output += `# HELP p2pclaw_validations_total Total validations performed\n`;
  output += `# TYPE p2pclaw_validations_total counter\n`;
  output += `p2pclaw_validations_total ${summary.validationsPerformed?.total || 0}\n`;

  // Response times
  output += `# HELP p2pclaw_response_time_avg Average response time in ms\n`;
  output += `# TYPE p2pclaw_response_time_avg gauge\n`;
  output += `p2pclaw_response_time_avg ${summary.responseTimes?.average || 0}\n`;

  // Errors
  output += `# HELP p2pclaw_errors_total Total errors\n`;
  output += `# TYPE p2pclaw_errors_total counter\n`;
  output += `p2pclaw_errors_total ${summary.errors?.total || 0}\n`;

  // Error rate
  output += `# HELP p2pclaw_error_rate Error rate percentage\n`;
  output += `# TYPE p2pclaw_error_rate gauge\n`;
  output += `p2pclaw_error_rate ${summary.errors?.rate || 0}\n`;

  return output;
}

/**
 * Generate dashboard HTML
 */
function getDashboardHTML() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>P2PCLAW Monitoring Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; min-height: 100vh; }
    .header { background: #161b22; padding: 20px; border-bottom: 1px solid #30363d; }
    .header h1 { color: #58a6ff; font-size: 24px; }
    .header .status { color: #7ee787; font-size: 14px; margin-top: 5px; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
    .card h2 { color: #58a6ff; font-size: 18px; margin-bottom: 15px; }
    .stat { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #30363d; }
    .stat:last-child { border-bottom: none; }
    .stat-label { color: #8b949e; }
    .stat-value { font-weight: bold; }
    .stat-value.online { color: #7ee787; }
    .stat-value.offline { color: #f85149; }
    .stat-value.warning { color: #d29922; }
    .agents-table { width: 100%; border-collapse: collapse; }
    .agents-table th, .agents-table td { padding: 10px; text-align: left; border-bottom: 1px solid #30363d; }
    .agents-table th { background: #21262d; color: #8b949e; font-weight: 600; }
    .agents-table tr:hover { background: #21262d; }
    .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .status-badge.online { background: #238636; color: white; }
    .status-badge.offline { background: #da3633; color: white; }
    .refresh-btn { background: #238636; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .refresh-btn:hover { background: #2ea043; }
    .loading { text-align: center; padding: 40px; color: #8b949e; }
    .error { background: #da3633; color: white; padding: 10px; border-radius: 6px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🕸️ P2PCLAW Monitoring Dashboard</h1>
    <div class="status">● System Online | ${new Date().toISOString()}</div>
  </div>
  
  <div class="container">
    <div id="error"></div>
    
    <div class="grid">
      <div class="card">
        <h2>📊 Overview</h2>
        <div id="overview">
          <div class="loading">Loading...</div>
        </div>
      </div>
      
      <div class="card">
        <h2>📈 Performance</h2>
        <div id="performance">
          <div class="loading">Loading...</div>
        </div>
      </div>
      
      <div class="card">
        <h2>🚨 Alerts</h2>
        <div id="alerts">
          <div class="loading">Loading...</div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>👥 Agent Groups</h2>
      <div id="groups">
        <div class="loading">Loading...</div>
      </div>
    </div>
    
    <div class="card" style="margin-top: 20px;">
      <h2>🤖 Agents Status</h2>
      <div style="margin-bottom: 15px;">
        <button class="refresh-btn" onclick="refreshAll()">🔄 Refresh</button>
      </div>
      <div id="agents">
        <div class="loading">Loading...</div>
      </div>
    </div>
  </div>
  
  <script>
    const API_BASE = '';
    
    async function fetchJSON(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    }
    
    async function refreshAll() {
      await Promise.all([refreshOverview(), refreshPerformance(), refreshAlerts(), refreshGroups(), refreshAgents()]);
    }
    
    async function refreshOverview() {
      try {
        const health = await fetchJSON('/health');
        const overview = document.getElementById('overview');
        
        const healthPercent = health.summary?.healthPercent?.toFixed(1) || 0;
        const healthClass = healthPercent > 80 ? 'online' : healthPercent > 50 ? 'warning' : 'offline';
        
        overview.innerHTML = \`
          <div class="stat">
            <span class="stat-label">Total Agents</span>
            <span class="stat-value">\${health.summary?.total || 0}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Online</span>
            <span class="stat-value online">\${health.summary?.online || 0}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Offline</span>
            <span class="stat-value offline">\${health.summary?.offline || 0}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Health</span>
            <span class="stat-value \${healthClass}">\${healthPercent}%</span>
          </div>
          <div class="stat">
            <span class="stat-label">Papers Published</span>
            <span class="stat-value">\${health.summary?.totalPapersPublished || 0}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Mempool</span>
            <span class="stat-value">\${health.summary?.totalPapersInMempool || 0}</span>
          </div>
        \`;
      } catch (e) {
        document.getElementById('overview').innerHTML = '<div class="error">Error: ' + e.message + '</div>';
      }
    }
    
    async function refreshPerformance() {
      try {
        const metrics = await fetchJSON('/metrics');
        const perf = document.getElementById('performance');
        
        perf.innerHTML = \`
          <div class="stat">
            <span class="stat-label">Avg Response Time</span>
            <span class="stat-value">\${(metrics.responseTimes?.average || 0).toFixed(0)}ms</span>
          </div>
          <div class="stat">
            <span class="stat-label">Total API Calls</span>
            <span class="stat-value">\${metrics.apiCalls?.total || 0}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Errors</span>
            <span class="stat-value">\${metrics.errors?.total || 0}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Error Rate</span>
            <span class="stat-value">\${(metrics.errors?.rate || 0).toFixed(2)}%</span>
          </div>
          <div class="stat">
            <span class="stat-label">Rate Limited</span>
            <span class="stat-value">\${metrics.apiCalls?.rateLimited || 0}</span>
          </div>
        \`;
      } catch (e) {
        document.getElementById('performance').innerHTML = '<div class="error">Error: ' + e.message + '</div>';
      }
    }
    
    async function refreshAlerts() {
      try {
        const alerts = await fetchJSON('/alerts');
        const alertDiv = document.getElementById('alerts');
        
        if (alerts.length === 0) {
          alertDiv.innerHTML = '<div style="color: #7ee787;">✓ No active alerts</div>';
        } else {
          alertDiv.innerHTML = alerts.map(a => \`
            <div class="stat" style="border-left: 3px solid \${a.severity === 'critical' ? '#f85149' : '#d29922'}; padding-left: 10px;">
              <span>\${a.type}</span>
              <span class="stat-value">\${a.message}</span>
            </div>
          \`).join('');
        }
      } catch (e) {
        document.getElementById('alerts').innerHTML = '<div class="error">Error: ' + e.message + '</div>';
      }
    }
    
    async function refreshGroups() {
      try {
        const groups = await fetchJSON('/groups');
        const groupsDiv = document.getElementById('groups');
        
        groupsDiv.innerHTML = \`
          <table class="agents-table">
            <thead>
              <tr>
                <th>Group</th>
                <th>Total</th>
                <th>Online</th>
                <th>Offline</th>
                <th>Papers</th>
                <th>Validations</th>
              </tr>
            </thead>
            <tbody>
              \${groups.map(g => \`
                <tr>
                  <td>\${g.name}</td>
                  <td>\${g.total}</td>
                  <td class="online">\${g.online}</td>
                  <td class="offline">\${g.offline}</td>
                  <td>\${g.papersPublished}</td>
                  <td>\${g.validationsPerformed}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        \`;
      } catch (e) {
        document.getElementById('groups').innerHTML = '<div class="error">Error: ' + e.message + '</div>';
      }
    }
    
    async function refreshAgents() {
      try {
        const agents = await fetchJSON('/agents');
        const agentsDiv = document.getElementById('agents');
        
        agentsDiv.innerHTML = \`
          <table class="agents-table">
            <thead>
              <tr>
                <th>Agent ID</th>
                <th>Group</th>
                <th>Status</th>
                <th>Papers</th>
                <th>Validations</th>
                <th>Last Heartbeat</th>
              </tr>
            </thead>
            <tbody>
              \${agents.slice(0, 50).map(a => \`
                <tr>
                  <td>\${a.id}</td>
                  <td>\${a.group}</td>
                  <td><span class="status-badge \${a.status}">\${a.status}</span></td>
                  <td>\${a.papersPublished}</td>
                  <td>\${a.validationsPerformed}</td>
                  <td>\${a.lastHeartbeat ? new Date(a.lastHeartbeat).toLocaleString() : 'N/A'}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
          \${agents.length > 50 ? '<p style="margin-top: 10px; color: #8b949e;">Showing first 50 of ' + agents.length + ' agents</p>' : ''}
        \`;
      } catch (e) {
        document.getElementById('agents').innerHTML = '<div class="error">Error: ' + e.message + '</div>';
      }
    }
    
    // Auto-refresh every 30 seconds
    setInterval(refreshAll, 30000);
    
    // Initial load
    refreshAll();
  </script>
</body>
</html>
  `;
}

/**
 * Start monitoring server
 */
async function startMonitoringServer() {
  // Initialize
  initAgentRegistry();
  startMetricsCollection();

  if (config.enableAutoRecovery) {
    startRecoveryMonitoring();
  }

  // Start Express server
  app.listen(config.port, () => {
    logger.info("Monitoring server started", { port: config.port });
    console.log(`🕸️ P2PCLAW Monitoring Dashboard: http://localhost:${config.port}`);
  });
}

export { app, startMonitoringServer };
