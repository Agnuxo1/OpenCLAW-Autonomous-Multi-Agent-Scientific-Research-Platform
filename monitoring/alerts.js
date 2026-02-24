/**
 * P2PCLAW Monitoring - Alert System
 * Monitors for critical conditions and sends notifications
 */

import { logger } from './logger.js';
import { getOfflineAgents, getStaleAgents } from './health-dashboard.js';

// Alert types
export const AlertType = {
  AGENT_OFFLINE: 'agent_offline',
  PAPER_PUBLISH_FAILED: 'paper_publish_failed',
  API_RATE_LIMIT: 'api_rate_limit',
  NETWORK_ERROR: 'network_error',
  VALIDATION_FAILED: 'validation_failed',
  SYSTEM_ERROR: 'system_error'
};

// Alert severity
export const AlertSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

// Configuration
const config = {
  offlineThresholdMinutes: parseInt(process.env.ALERT_OFFLINE_THRESHOLD || '5'),
  rateLimitThreshold: parseInt(process.env.ALERT_RATE_LIMIT_THRESHOLD || '10'),
  checkInterval: parseInt(process.env.ALERT_CHECK_INTERVAL || '60000'),
  enableDiscord: process.env.ALERT_DISCORD_WEBHOOK !== undefined,
  enableEmail: process.env.ALERT_EMAIL_TO !== undefined,
  discordWebhook: process.env.ALERT_DISCORD_WEBHOOK,
  emailTo: process.env.ALERT_EMAIL_TO,
  emailFrom: process.env.ALERT_EMAIL_FROM || 'alerts@p2pclaw.com',
  // Suppression - don't re-alert within this window
  suppressionWindowMs: parseInt(process.env.ALERT_SUPPRESSION_MS || '300000') // 5 minutes
};

// Active alerts tracking
const activeAlerts = new Map();
const alertHistory = [];
const lastAlertTime = new Map();

/**
 * Create an alert object
 */
function createAlert(type, severity, message, data = {}) {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    severity,
    message,
    data,
    timestamp: new Date().toISOString(),
    acknowledged: false
  };
}

/**
 * Check if alert should be suppressed
 */
function shouldSuppressAlert(type, groupKey) {
  const key = `${type}:${groupKey}`;
  const lastTime = lastAlertTime.get(key);
  
  if (lastTime && (Date.now() - lastTime) < config.suppressionWindowMs) {
    return true;
  }
  
  lastAlertTime.set(key, Date.now());
  return false;
}

/**
 * Send Discord webhook notification
 */
async function sendDiscordWebhook(alert) {
  if (!config.enableDiscord) return;
  
  const color = {
    [AlertSeverity.INFO]: 3447003,
    [AlertSeverity.WARNING]: 16776960,
    [AlertSeverity.CRITICAL]: 15158332
  }[alert.severity];
  
  const payload = {
    embeds: [{
      title: `🚨 P2PCLAW Alert: ${alert.type}`,
      description: alert.message,
      color,
      fields: Object.entries(alert.data).map(([key, value]) => ({
        name: key,
        value: String(value),
        inline: true
      })),
      timestamp: alert.timestamp,
      footer: { text: 'P2PCLAW Monitoring' }
    }]
  };
  
  try {
    const response = await fetch(config.discordWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      logger.error('Discord webhook failed', { status: response.status });
    }
  } catch (error) {
    logger.error('Failed to send Discord alert', { error: error.message });
  }
}

/**
 * Send email notification
 */
async function sendEmailAlert(alert) {
  if (!config.enableEmail) return;
  
  // Simple email format - in production use a proper email service
  const subject = `[${alert.severity.toUpperCase()}] P2PCLAW: ${alert.type}`;
  const body = `
P2PCLAW Alert Notification
==========================

Type: ${alert.type}
Severity: ${alert.severity}
Time: ${alert.timestamp}

Message:
${alert.message}

Data:
${JSON.stringify(alert.data, null, 2)}
  `.trim();
  
  // In production, use nodemailer or similar
  logger.info('Email alert would be sent', {
    to: config.emailTo,
    subject,
    body
  });
}

/**
 * Broadcast alert to all channels
 */
async function broadcastAlert(alert) {
  // Store in active alerts
  activeAlerts.set(alert.id, alert);
  
  // Add to history
  alertHistory.push(alert);
  if (alertHistory.length > 1000) {
    alertHistory.shift();
  }
  
  // Send notifications
  await Promise.all([
    sendDiscordWebhook(alert),
    sendEmailAlert(alert)
  ]);
  
  logger.warn('Alert triggered', {
    type: alert.type,
    severity: alert.severity,
    message: alert.message
  });
}

/**
 * Check for offline agents
 */
async function checkOfflineAgents() {
  const offlineAgents = await getOfflineAgents();
  
  if (offlineAgents.length > 0) {
    const staleAgents = await getStaleAgents(config.offlineThresholdMinutes);
    const alertKey = 'offline';
    
    if (shouldSuppressAlert(AlertType.AGENT_OFFLINE, alertKey)) {
      return;
    }
    
    const severity = staleAgents.length > 10 
      ? AlertSeverity.CRITICAL 
      : staleAgents.length > 0 
        ? AlertSeverity.WARNING 
        : AlertSeverity.INFO;
    
    await broadcastAlert(createAlert(
      AlertType.AGENT_OFFLINE,
      severity,
      `${offlineAgents.length} agent(s) offline, ${staleAgents.length} stale (>${config.offlineThresholdMinutes}min)`,
      {
        offline_count: offlineAgents.length,
        stale_count: staleAgents.length,
        offline_agents: offlineAgents.slice(0, 10).map(a => a.id).join(', '),
        threshold_minutes: config.offlineThresholdMinutes
      }
    ));
  }
}

/**
 * Check for failed paper publications
 */
async function checkFailedPublications(recentFailures) {
  if (recentFailures.length === 0) return;
  
  const alertKey = 'publish_failed';
  
  if (shouldSuppressAlert(AlertType.PAPER_PUBLISH_FAILED, alertKey)) {
    return;
  }
  
  const severity = recentFailures.length > 5 
    ? AlertSeverity.CRITICAL 
    : AlertSeverity.WARNING;
  
  await broadcastAlert(createAlert(
    AlertType.PAPER_PUBLISH_FAILED,
    severity,
    `${recentFailures.length} paper publication(s) failed recently`,
    {
      failure_count: recentFailures.length,
      recent_failures: recentFailures.slice(0, 5).map(f => f.title || f.paper_id).join(', ')
    }
  ));
}

/**
 * Check for API rate limits
 */
async function checkRateLimits(rateLimitData) {
  if (!rateLimitData || rateLimitData.hitCount < config.rateLimitThreshold) {
    return;
  }
  
  const alertKey = `ratelimit-${rateLimitData.endpoint}`;
  
  if (shouldSuppressAlert(AlertType.API_RATE_LIMIT, alertKey)) {
    return;
  }
  
  await broadcastAlert(createAlert(
    AlertType.API_RATE_LIMIT,
    AlertSeverity.WARNING,
    `API rate limit threshold hit: ${rateLimitData.hitCount} requests`,
    {
      endpoint: rateLimitData.endpoint,
      hit_count: rateLimitData.hitCount,
      reset_time: rateLimitData.resetTime
    }
  ));
}

/**
 * Check for network issues
 */
async function checkNetworkConnectivity(connectivityData) {
  if (!connectivityData || connectivityData.isOnline) {
    return;
  }
  
  const alertKey = 'network';
  
  if (shouldSuppressAlert(AlertType.NETWORK_ERROR, alertKey)) {
    return;
  }
  
  await broadcastAlert(createAlert(
    AlertType.NETWORK_ERROR,
    AlertSeverity.CRITICAL,
    `Network connectivity issue detected`,
    {
      failed_endpoints: connectivityData.failedEndpoints?.join(', ') || 'unknown',
      last_success: connectivityData.lastSuccess
    }
  ));
}

/**
 * Run all alert checks
 */
async function runAlertChecks(failureData = { papers: [], rateLimits: [], network: null }) {
  await Promise.all([
    checkOfflineAgents(),
    checkFailedPublications(failureData.papers),
    checkRateLimits(failureData.rateLimits),
    checkNetworkConnectivity(failureData.network)
  ]);
}

/**
 * Get active alerts
 */
function getActiveAlerts() {
  return Array.from(activeAlerts.values());
}

/**
 * Get alert history
 */
function getAlertHistory(limit = 100) {
  return alertHistory.slice(-limit);
}

/**
 * Acknowledge an alert
 */
function acknowledgeAlert(alertId) {
  const alert = activeAlerts.get(alertId);
  if (alert) {
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    return true;
  }
  return false;
}

/**
 * Clear a resolved alert
 */
function clearAlert(alertId) {
  return activeAlerts.delete(alertId);
}

/**
 * Start continuous alert monitoring
 */
function startAlertMonitoring(checkFn, interval) {
  const check = async () => {
    try {
      const failureData = await (checkFn || getOfflineAgents)();
      await runAlertChecks(failureData);
    } catch (error) {
      logger.error('Alert check failed', { error: error.message });
    }
    
    setTimeout(check, interval || config.checkInterval);
  };
  
  check();
  logger.info('Alert monitoring started', { interval: interval || config.checkInterval });
}

export {
  runAlertChecks,
  getActiveAlerts,
  getAlertHistory,
  acknowledgeAlert,
  clearAlert,
  startAlertMonitoring,
  createAlert,
  AlertType,
  AlertSeverity,
  config as alertConfig
};
