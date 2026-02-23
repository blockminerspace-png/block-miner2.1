const fs = require("fs");
const path = require("path");

// Storage structure for organized logging
const storageRoot = path.join(__dirname, "..", "storage");
const logsBaseDir = path.join(storageRoot, "logs");

// Log categories with their directories
const LOG_CATEGORIES = {
  GENERAL: path.join(logsBaseDir, "general"),
  CRITICAL: path.join(logsBaseDir, "critical"),
  SECURITY: path.join(logsBaseDir, "security"),
  TRANSACTIONS: path.join(logsBaseDir, "transactions"),
  AUDIT: path.join(logsBaseDir, "audit")
};

// Legacy logs directory (kept for backward compatibility)
const logsDir = path.join(__dirname, "..", "logs");

// Ensure all log directories exist
Object.values(LOG_CATEGORIES).forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Keep legacy directory for backward compatibility
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log levels
const LOG_LEVELS = {
  ERROR: "ERROR",
  WARN: "WARN",
  INFO: "INFO",
  DEBUG: "DEBUG"
};

// Color codes for console output
const COLORS = {
  ERROR: "\x1b[31m", // Red
  WARN: "\x1b[33m", // Yellow
  INFO: "\x1b[36m", // Cyan
  DEBUG: "\x1b[35m", // Magenta
  RESET: "\x1b[0m"
};

const MAX_LOG_SIZE_BYTES = Number(process.env.LOG_MAX_BYTES || 5 * 1024 * 1024);
const MAX_LOG_FILES = Number(process.env.LOG_MAX_FILES || 5);

const streamState = new Map();
const rotateLocks = new Map();

/**
 * Get log file path based on level and category
 * @param {string} level - Log level (error, warn, info, debug)
 * @param {string} category - Log category (general, critical, security, transactions, audit)
 * @returns {string} Full path to log file
 */
function getLogFilePath(level, category = null) {
  const filename = `${String(level || "info").toLowerCase()}.log`;
  
  // If category is specified, use categorized structure
  if (category && LOG_CATEGORIES[category.toUpperCase()]) {
    return path.join(LOG_CATEGORIES[category.toUpperCase()], filename);
  }
  
  // Default categorization by level
  switch (String(level || "info").toLowerCase()) {
    case "error":
    case "warn":
      return path.join(LOG_CATEGORIES.CRITICAL, filename);
    case "debug":
    case "info":
      return path.join(LOG_CATEGORIES.GENERAL, filename);
    default:
      return path.join(logsDir, filename); // Fallback to legacy
  }
}

function getOrCreateStream(level, category = null) {
  const key = category 
    ? `${category}:${String(level || "info").toLowerCase()}`
    : String(level || "info").toLowerCase();
    
  const existing = streamState.get(key);
  if (existing?.stream) {
    return existing.stream;
  }

  const filePath = getLogFilePath(level, category);
  const stream = fs.createWriteStream(filePath, { flags: "a", encoding: "utf8" });
  streamState.set(key, { stream, filePath });
  return stream;
}

async function rotateLogIfNeeded(level, category = null) {
  const key = category 
    ? `${category}:${String(level || "info").toLowerCase()}`
    : String(level || "info").toLowerCase();
  const lockKey = `rotate:${key}`;

  if (rotateLocks.get(lockKey)) {
    return;
  }

  rotateLocks.set(lockKey, true);

  try {
    const filePath = getLogFilePath(level, category);
    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (!stat || stat.size < MAX_LOG_SIZE_BYTES) {
      return;
    }

    const state = streamState.get(key);
    if (state?.stream) {
      await new Promise((resolve) => state.stream.end(resolve));
      streamState.delete(key);
    }

    for (let i = MAX_LOG_FILES - 1; i >= 1; i -= 1) {
      const src = `${filePath}.${i}`;
      const dst = `${filePath}.${i + 1}`;
      if (fs.existsSync(src)) {
        await fs.promises.rename(src, dst).catch(() => undefined);
      }
    }

    await fs.promises.rename(filePath, `${filePath}.1`).catch(() => undefined);
    getOrCreateStream(level, category);
  } finally {
    rotateLocks.delete(lockKey);
  }
}

class Logger {
  constructor(module = "App") {
    this.module = module;
    this.logLevel = String(process.env.LOG_LEVEL || "INFO").trim().toUpperCase();
  }

  _levelValue(level) {
    const normalized = String(level || "INFO").trim().toUpperCase();
    switch (normalized) {
      case LOG_LEVELS.ERROR:
        return 40;
      case LOG_LEVELS.WARN:
        return 30;
      case LOG_LEVELS.INFO:
        return 20;
      case LOG_LEVELS.DEBUG:
        return 10;
      default:
        return 20;
    }
  }

  _shouldLog(level) {
    return this._levelValue(level) >= this._levelValue(this.logLevel);
  }

  /**
   * Format log message
   */
  _formatMessage(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const dataStr = Object.keys(data).length > 0 ? ` | ${JSON.stringify(data)}` : "";
    return `[${timestamp}] [${level}] [${this.module}] ${message}${dataStr}`;
  }

  /**
   * Write to file
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {object} data - Additional data
   * @param {string} category - Optional log category
   */
  _writeToFile(level, message, data, category = null) {
    const content = this._formatMessage(level, message, data);

    try {
      const stream = getOrCreateStream(level, category);
      stream.write(content + "\n");
      rotateLogIfNeeded(level, category).catch((error) => {
        console.error("Failed to rotate log file:", error);
      });
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }

  /**
   * Write to console
   */
  _writeToConsole(level, message, data) {
    if (!this._shouldLog(level)) {
      return;
    }

    const color = COLORS[level] || COLORS.INFO;
    const reset = COLORS.RESET;
    const content = this._formatMessage(level, message, data);
    
    if (process.env.NODE_ENV === "production") {
      if (level === LOG_LEVELS.ERROR) console.error(content);
      else if (level === LOG_LEVELS.WARN) console.warn(content);
      else console.log(content);
      return;
    }

    console.log(`${color}${content}${reset}`);
  }

  /**
   * Generic log method
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {object} data - Additional data
   * @param {string} category - Optional log category
   */
  _log(level, message, data = {}, category = null) {
    if (!this._shouldLog(level)) {
      return;
    }
    this._writeToConsole(level, message, data);
    this._writeToFile(level, message, data, category);
  }

  /**
   * Log error
   */
  error(message, data = {}) {
    this._log(LOG_LEVELS.ERROR, message, data);
  }

  /**
   * Log warning
   */
  warn(message, data = {}) {
    this._log(LOG_LEVELS.WARN, message, data);
  }

  /**
   * Log info
   */
  info(message, data = {}) {
    this._log(LOG_LEVELS.INFO, message, data);
  }

  /**
   * Log debug (only in development)
   */
  debug(message, data = {}) {
    this._log(LOG_LEVELS.DEBUG, message, data);
  }

  /**
   * ============================================
   * SPECIALIZED LOGGING METHODS
   * ============================================
   */

  /**
   * Log security events (authentication, authorization, suspicious activity)
   * @param {string} message - Security event description
   * @param {object} data - Event data (user, IP, action, etc.)
   */
  security(message, data = {}) {
    const enrichedData = {
      ...data,
      timestamp: new Date().toISOString(),
      category: "SECURITY"
    };
    this._log(LOG_LEVELS.WARN, `[SECURITY] ${message}`, enrichedData, "security");
  }

  /**
   * Log transaction events (deposits, withdrawals, swaps, purchases)
   * @param {string} type - Transaction type (deposit, withdrawal, swap, purchase)
   * @param {string} message - Transaction description
   * @param {object} data - Transaction data (userId, amount, currency, status, etc.)
   */
  transaction(type, message, data = {}) {
    const enrichedData = {
      ...data,
      transactionType: type,
      timestamp: new Date().toISOString(),
      category: "TRANSACTION"
    };
    this._log(LOG_LEVELS.INFO, `[TX:${type.toUpperCase()}] ${message}`, enrichedData, "transactions");
  }

  /**
   * Log audit events (admin actions, system changes, sensitive operations)
   * @param {string} action - Action performed
   * @param {string} actor - Who performed the action (userId, admin email, system)
   * @param {object} data - Additional context (affected resources, before/after states, etc.)
   */
  audit(action, actor, data = {}) {
    const enrichedData = {
      ...data,
      action,
      actor,
      timestamp: new Date().toISOString(),
      category: "AUDIT"
    };
    this._log(LOG_LEVELS.INFO, `[AUDIT] ${actor} performed ${action}`, enrichedData, "audit");
  }

  /**
   * Log critical system errors that require immediate attention
   * @param {string} message - Error description
   * @param {object} data - Error context (stack trace, affected systems, etc.)
   */
  critical(message, data = {}) {
    const enrichedData = {
      ...data,
      severity: "CRITICAL",
      timestamp: new Date().toISOString(),
      category: "CRITICAL"
    };
    this._log(LOG_LEVELS.ERROR, `[CRITICAL] ${message}`, enrichedData, "critical");
  }

  /**
   * Create a child logger for a specific module
   */
  child(module) {
    return new Logger(`${this.module}:${module}`);
  }
}

// Export singleton instance
module.exports = new Logger("BlockMiner");

// Export class for creating child loggers
module.exports.Logger = Logger;

// Export utility to create logger for specific modules
module.exports.getLogger = (module) => new Logger(module);
