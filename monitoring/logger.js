/**
 * P2PCLAW Monitoring - Centralized Logger Module
 * Provides structured logging with levels, rotation, and aggregation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log levels enum
export const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Configuration
const config = {
  logDir: process.env.LOG_DIR || path.join(__dirname, '../logs'),
  maxFileSize: parseInt(process.env.LOG_MAX_SIZE || '10485760'), // 10MB
  maxFiles: parseInt(process.env.LOG_MAX_FILES || '10'),
  minLevel: parseInt(process.env.LOG_LEVEL || LogLevel[process.env.LOG_LEVEL?.toUpperCase() || 'INFO']),
  enableConsole: process.env.LOG_CONSOLE !== 'false',
  enableFile: process.env.LOG_FILE !== 'false',
  aggregationEndpoint: process.env.LOG_AGGREGATOR_URL || 'https://p2pclaw-mcp-server-production.up.railway.app/logs'
};

// Ensure log directory exists
if (!fs.existsSync(config.logDir)) {
  fs.mkdirSync(config.logDir, { recursive: true });
}

/**
 * Get the current log file name based on date
 */
function getLogFileName() {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return `p2pclaw-${dateStr}.log`;
}

/**
 * Get the full path to the current log file
 */
function getLogFilePath() {
  return path.join(config.logDir, getLogFileName());
}

/**
 * Rotate logs if file size exceeds max
 */
function checkRotation() {
  if (!fs.existsSync(getLogFilePath())) return;
  
  const stats = fs.statSync(getLogFilePath());
  if (stats.size >= config.maxFileSize) {
    rotateLogs();
  }
}

/**
 * Rotate existing log files
 */
function rotateLogs() {
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  const currentPath = getLogFilePath();
  const rotatedPath = path.join(config.logDir, `p2pclaw-${timestamp}.log`);
  
  if (fs.existsSync(currentPath)) {
    fs.renameSync(currentPath, rotatedPath);
  }
  
  // Clean up old files
  cleanupOldLogs();
}

/**
 * Remove old log files beyond maxFiles count
 */
function cleanupOldLogs() {
  const files = fs.readdirSync(config.logDir)
    .filter(f => f.startsWith('p2pclaw-') && f.endsWith('.log'))
    .map(f => ({
      name: f,
      path: path.join(config.logDir, f),
      time: fs.statSync(path.join(config.logDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);
  
  if (files.length > config.maxFiles) {
    files.slice(config.maxFiles).forEach(f => {
      try {
        fs.unlinkSync(f.path);
      } catch (e) {
        console.error(`Failed to delete old log: ${f.name}`, e);
      }
    });
  }
}

/**
 * Format log entry
 */
function formatLog(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    service: process.env.SERVICE_NAME || 'p2pclaw-agent',
    hostname: process.env.HOSTNAME || 'unknown',
    pid: process.pid,
    ...meta
  };
  return JSON.stringify(entry);
}

/**
 * Write log to file
 */
function writeToFile(entry) {
  try {
    checkRotation();
    fs.appendFileSync(getLogFilePath(), entry + '\n');
  } catch (e) {
    console.error('Failed to write to log file:', e);
  }
}

/**
 * Send log to aggregator (async, non-blocking)
 */
async function sendToAggregator(entry) {
  try {
    await fetch(config.aggregationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: entry,
      signal: AbortSignal.timeout(5000)
    });
  } catch (e) {
    // Silently fail - log aggregation is best-effort
  }
}

/**
 * Main logger class
 */
class Logger {
  constructor(context = {}) {
    this.context = context;
  }

  /**
   * Set context for all subsequent logs
   */
  setContext(ctx) {
    this.context = { ...this.context, ...ctx };
  }

  /**
   * Log error level
   */
  error(message, meta = {}) {
    if (LogLevel.ERROR > config.minLevel) return;
    const entry = formatLog('ERROR', message, { ...this.context, ...meta });
    if (config.enableConsole) console.error(`[ERROR] ${message}`, meta);
    if (config.enableFile) writeToFile(entry);
    if (config.aggregationEndpoint) sendToAggregator(entry);
  }

  /**
   * Log warning level
   */
  warn(message, meta = {}) {
    if (LogLevel.WARN > config.minLevel) return;
    const entry = formatLog('WARN', message, { ...this.context, ...meta });
    if (config.enableConsole) console.warn(`[WARN] ${message}`, meta);
    if (config.enableFile) writeToFile(entry);
    if (config.aggregationEndpoint) sendToAggregator(entry);
  }

  /**
   * Log info level
   */
  info(message, meta = {}) {
    if (LogLevel.INFO > config.minLevel) return;
    const entry = formatLog('INFO', message, { ...this.context, ...meta });
    if (config.enableConsole) console.log(`[INFO] ${message}`, meta);
    if (config.enableFile) writeToFile(entry);
    if (config.aggregationEndpoint) sendToAggregator(entry);
  }

  /**
   * Log debug level
   */
  debug(message, meta = {}) {
    if (LogLevel.DEBUG > config.minLevel) return;
    const entry = formatLog('DEBUG', message, { ...this.context, ...meta });
    if (config.enableConsole) console.log(`[DEBUG] ${message}`, meta);
    if (config.enableFile) writeToFile(entry);
    if (config.aggregationEndpoint) sendToAggregator(entry);
  }

  /**
   * Log with timing
   */
  timed(label, fn) {
    const start = Date.now();
    return fn().then(result => {
      this.info(`Timer: ${label}`, { duration_ms: Date.now() - start });
      return result;
    }).catch(err => {
      this.error(`Timer failed: ${label}`, { duration_ms: Date.now() - start, error: err.message });
      throw err;
    });
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext) {
    const child = new Logger({ ...this.context, ...additionalContext });
    return child;
  }
}

// Create default logger instance
const logger = new Logger({
  agentId: process.env.AGENT_ID,
  agentGroup: process.env.AGENT_GROUP || 'default'
});

export { Logger, logger, LogLevel, config as loggerConfig };
export default logger;
