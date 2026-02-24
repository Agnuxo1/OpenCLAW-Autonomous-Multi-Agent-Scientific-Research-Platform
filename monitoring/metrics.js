/**
 * P2PCLAW Monitoring - Metrics Collection
 * Collects and aggregates performance metrics
 */

import { logger } from "./logger.js";

// Configuration
const config = {
  metricsRetentionHours: parseInt(process.env.METRICS_RETENTION_HOURS || "24"),
  aggregationInterval: parseInt(process.env.METRICS_AGGREGATION_INTERVAL || "60000"),
  enablePrometheus: process.env.METRICS_PROMETHEUS === "true",
  prometheusPort: parseInt(process.env.METRICS_PROMETHEUS_PORT || "9090"),
};

// In-memory metrics storage
const metrics = {
  papersPublished: {
    total: 0,
    byHour: new Map(),
    byAgent: new Map(),
    byGroup: new Map(),
  },
  validationsPerformed: {
    total: 0,
    byHour: new Map(),
    byAgent: new Map(),
  },
  responseTimes: {
    total: 0,
    count: 0,
    byEndpoint: new Map(),
    recent: [],
  },
  errors: {
    total: 0,
    byType: new Map(),
    byAgent: new Map(),
    recent: [],
  },
  apiCalls: {
    total: 0,
    byEndpoint: new Map(),
    rateLimited: 0,
  },
  agentUptime: new Map(),
};

// Time window helpers
function getHourKey(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 13) + ":00";
}

function getDayKey(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Record a paper publication
 */
function recordPaperPublished(agentId, group, paperId, timestamp = Date.now()) {
  const hourKey = getHourKey(timestamp);

  metrics.papersPublished.total++;

  // By hour
  const hourCount = metrics.papersPublished.byHour.get(hourKey) || 0;
  metrics.papersPublished.byHour.set(hourKey, hourCount + 1);

  // By agent
  const agentCount = metrics.papersPublished.byAgent.get(agentId) || 0;
  metrics.papersPublished.byAgent.set(agentId, agentCount + 1);

  // By group
  const groupCount = metrics.papersPublished.byGroup.get(group) || 0;
  metrics.papersPublished.byGroup.set(group, groupCount + 1);

  logger.debug("Paper published recorded", { agentId, paperId, hourKey });
}

/**
 * Record a validation
 */
function recordValidation(agentId, paperId, timestamp = Date.now()) {
  const hourKey = getHourKey(timestamp);

  metrics.validationsPerformed.total++;

  // By hour
  const hourCount = metrics.validationsPerformed.byHour.get(hourKey) || 0;
  metrics.validationsPerformed.byHour.set(hourKey, hourCount + 1);

  // By agent
  const agentCount = metrics.validationsPerformed.byAgent.get(agentId) || 0;
  metrics.validationsPerformed.byAgent.set(agentId, agentCount + 1);
}

/**
 * Record response time
 */
function recordResponseTime(endpoint, durationMs, timestamp = Date.now()) {
  const hourKey = getHourKey(timestamp);

  metrics.responseTimes.total += durationMs;
  metrics.responseTimes.count++;

  // By endpoint
  if (!metrics.responseTimes.byEndpoint.has(endpoint)) {
    metrics.responseTimes.byEndpoint.set(endpoint, { total: 0, count: 0, min: Infinity, max: 0 });
  }
  const endpointStats = metrics.responseTimes.byEndpoint.get(endpoint);
  endpointStats.total += durationMs;
  endpointStats.count++;
  endpointStats.min = Math.min(endpointStats.min, durationMs);
  endpointStats.max = Math.max(endpointStats.max, durationMs);

  // Recent (keep last 100)
  metrics.responseTimes.recent.push({ endpoint, durationMs, timestamp });
  if (metrics.responseTimes.recent.length > 100) {
    metrics.responseTimes.recent.shift();
  }
}

/**
 * Record an error
 */
function recordError(agentId, errorType, errorMessage, timestamp = Date.now()) {
  metrics.errors.total++;

  // By type
  const typeCount = metrics.errors.byType.get(errorType) || 0;
  metrics.errors.byType.set(errorType, typeCount + 1);

  // By agent
  const agentCount = metrics.errors.byAgent.get(agentId) || 0;
  metrics.errors.byAgent.set(agentId, agentCount + 1);

  // Recent (keep last 100)
  metrics.errors.recent.push({ agentId, errorType, errorMessage, timestamp });
  if (metrics.errors.recent.length > 100) {
    metrics.errors.recent.shift();
  }

  logger.warn("Error recorded", { agentId, errorType, errorMessage });
}

/**
 * Record API call
 */
function recordApiCall(endpoint, statusCode, timestamp = Date.now()) {
  metrics.apiCalls.total++;

  // By endpoint
  if (!metrics.apiCalls.byEndpoint.has(endpoint)) {
    metrics.apiCalls.byEndpoint.set(endpoint, { total: 0, success: 0, error: 0, rateLimited: 0 });
  }
  const endpointStats = metrics.apiCalls.byEndpoint.get(endpoint);
  endpointStats.total++;
  if (statusCode >= 200 && statusCode < 300) {
    endpointStats.success++;
  } else if (statusCode === 429) {
    endpointStats.rateLimited++;
    metrics.apiCalls.rateLimited++;
  } else {
    endpointStats.error++;
  }
}

/**
 * Record agent uptime
 */
function recordAgentUptime(agentId, isOnline, timestamp = Date.now()) {
  const hourKey = getHourKey(timestamp);

  if (!metrics.agentUptime.has(agentId)) {
    metrics.agentUptime.set(agentId, { online: 0, offline: 0, lastSeen: timestamp });
  }

  const agentMetrics = metrics.agentUptime.get(agentId);
  if (isOnline) {
    agentMetrics.online++;
  } else {
    agentMetrics.offline++;
  }
  agentMetrics.lastSeen = timestamp;
}

/**
 * Get papers published per hour
 */
function getPapersPerHour(hours = 24) {
  const result = [];
  const now = Date.now();

  for (let i = hours - 1; i >= 0; i--) {
    const hourKey = getHourKey(now - i * 3600000);
    result.push({
      hour: hourKey,
      count: metrics.papersPublished.byHour.get(hourKey) || 0,
    });
  }

  return result;
}

/**
 * Get validations per hour
 */
function getValidationsPerHour(hours = 24) {
  const result = [];
  const now = Date.now();

  for (let i = hours - 1; i >= 0; i--) {
    const hourKey = getHourKey(now - i * 3600000);
    result.push({
      hour: hourKey,
      count: metrics.validationsPerformed.byHour.get(hourKey) || 0,
    });
  }

  return result;
}

/**
 * Get average response time
 */
function getAverageResponseTime() {
  if (metrics.responseTimes.count === 0) return 0;
  return metrics.responseTimes.total / metrics.responseTimes.count;
}

/**
 * Get response times by endpoint
 */
function getResponseTimesByEndpoint() {
  const result = [];
  for (const [endpoint, stats] of metrics.responseTimes.byEndpoint.entries()) {
    result.push({
      endpoint,
      avg: stats.total / stats.count,
      min: stats.min,
      max: stats.max,
      count: stats.count,
    });
  }
  return result.sort((a, b) => b.count - a.count);
}

/**
 * Get error rate
 */
function getErrorRate() {
  const totalCalls = metrics.apiCalls.total;
  const totalErrors = metrics.errors.total;
  if (totalCalls === 0) return 0;
  return (totalErrors / totalCalls) * 100;
}

/**
 * Get error breakdown
 */
function getErrorBreakdown() {
  const result = [];
  for (const [type, count] of metrics.errors.byType.entries()) {
    result.push({ type, count });
  }
  return result.sort((a, b) => b.count - a.count);
}

/**
 * Get agent leaderboard
 */
function getAgentLeaderboard(limit = 20) {
  const agents = [];

  // Papers published
  for (const [agentId, count] of metrics.papersPublished.byAgent.entries()) {
    agents.push({ agentId, papersPublished: count, validationsPerformed: 0, errors: 0 });
  }

  // Validations
  for (const [agentId, count] of metrics.validationsPerformed.byAgent.entries()) {
    const agent = agents.find((a) => a.agentId === agentId);
    if (agent) {
      agent.validationsPerformed = count;
    } else {
      agents.push({ agentId, papersPublished: 0, validationsPerformed: count, errors: 0 });
    }
  }

  // Errors
  for (const [agentId, count] of metrics.errors.byAgent.entries()) {
    const agent = agents.find((a) => a.agentId === agentId);
    if (agent) {
      agent.errors = count;
    } else {
      agents.push({ agentId, papersPublished: 0, validationsPerformed: 0, errors: count });
    }
  }

  return agents
    .sort(
      (a, b) =>
        b.papersPublished +
        b.validationsPerformed * 0.5 -
        (a.papersPublished + a.validationsPerformed * 0.5),
    )
    .slice(0, limit);
}

/**
 * Get comprehensive metrics summary
 */
function getMetricsSummary() {
  return {
    papersPublished: {
      total: metrics.papersPublished.total,
      byHour: getPapersPerHour(24),
      topAgents: [...metrics.papersPublished.byAgent.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id, count]) => ({ agentId: id, count })),
      byGroup: [...metrics.papersPublished.byGroup.entries()].map(([group, count]) => ({
        group,
        count,
      })),
    },
    validationsPerformed: {
      total: metrics.validationsPerformed.total,
      byHour: getValidationsPerHour(24),
    },
    responseTimes: {
      average: getAverageResponseTime(),
      byEndpoint: getResponseTimesByEndpoint(),
    },
    errors: {
      total: metrics.errors.total,
      rate: getErrorRate(),
      breakdown: getErrorBreakdown(),
      recent: metrics.errors.recent.slice(-10),
    },
    apiCalls: {
      total: metrics.apiCalls.total,
      rateLimited: metrics.apiCalls.rateLimited,
      byEndpoint: [...metrics.apiCalls.byEndpoint.entries()].map(([endpoint, stats]) => ({
        endpoint,
        ...stats,
      })),
    },
    agentUptime: {
      total: metrics.agentUptime.size,
      averageUptime: calculateAverageUptime(),
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Calculate average agent uptime percentage
 */
function calculateAverageUptime() {
  if (metrics.agentUptime.size === 0) return 0;

  let totalUptime = 0;
  for (const [, stats] of metrics.agentUptime.entries()) {
    const total = stats.online + stats.offline;
    if (total > 0) {
      totalUptime += (stats.online / total) * 100;
    }
  }

  return totalUptime / metrics.agentUptime.size;
}

/**
 * Clean up old metrics
 */
function cleanupOldMetrics() {
  const cutoffHour = getHourKey(Date.now() - config.metricsRetentionHours * 3600000);

  // Clean hour-based maps
  for (const [key] of metrics.papersPublished.byHour) {
    if (key < cutoffHour) metrics.papersPublished.byHour.delete(key);
  }

  for (const [key] of metrics.validationsPerformed.byHour) {
    if (key < cutoffHour) metrics.validationsPerformed.byHour.delete(key);
  }

  // Clean agent maps (keep last 7 days)
  const cutoff = Date.now() - 7 * 24 * 3600000;
  for (const [agentId, stats] of metrics.agentUptime.entries()) {
    if (stats.lastSeen < cutoff) {
      metrics.agentUptime.delete(agentId);
    }
  }

  logger.debug("Metrics cleanup completed");
}

/**
 * Export metrics for Prometheus
 */
function exportPrometheusFormat() {
  let output = "";

  // Papers published
  output += `# TYPE p2pclaw_papers_published_total counter\n`;
  output += `p2pclaw_papers_published_total ${metrics.papersPublished.total}\n`;

  // Validations
  output += `# TYPE p2pclaw_validations_total counter\n`;
  output += `p2pclaw_validations_total ${metrics.validationsPerformed.total}\n`;

  // Response times
  output += `# TYPE p2pclaw_response_time_seconds summary\n`;
  output += `p2pclaw_response_time_seconds_sum ${metrics.responseTimes.total / 1000}\n`;
  output += `p2pclaw_response_time_seconds_count ${metrics.responseTimes.count}\n`;

  // Errors
  output += `# TYPE p2pclaw_errors_total counter\n`;
  output += `p2pclaw_errors_total ${metrics.errors.total}\n`;

  // API calls
  output += `# TYPE p2pclaw_api_calls_total counter\n`;
  output += `p2pclaw_api_calls_total ${metrics.apiCalls.total}\n`;

  return output;
}

/**
 * Start metrics collection
 */
function startMetricsCollection() {
  setInterval(cleanupOldMetrics, 3600000); // Cleanup every hour
  logger.info("Metrics collection started", { retentionHours: config.metricsRetentionHours });
}

export {
  recordPaperPublished,
  recordValidation,
  recordResponseTime,
  recordError,
  recordApiCall,
  recordAgentUptime,
  getPapersPerHour,
  getValidationsPerHour,
  getAverageResponseTime,
  getResponseTimesByEndpoint,
  getErrorRate,
  getErrorBreakdown,
  getAgentLeaderboard,
  getMetricsSummary,
  exportPrometheusFormat,
  startMetricsCollection,
  config as metricsConfig,
};
