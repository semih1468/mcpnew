/**
 * Simple logging utility for MCP MySQL Server
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;

/**
 * Format timestamp for logging
 * @returns {string} Formatted timestamp
 */
function formatTimestamp() {
  return new Date().toISOString();
}

/**
 * Log a message with specified level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {object} meta - Additional metadata
 */
function log(level, message, meta = {}) {
  const levelValue = LOG_LEVELS[level];
  if (levelValue > currentLogLevel) {
    return;
  }

  const timestamp = formatTimestamp();
  const prefix = `${timestamp} [${level.toUpperCase()}]:`;
  
  if (Object.keys(meta).length > 0) {
    console.log(prefix, message, JSON.stringify(meta, null, 2));
  } else {
    console.log(prefix, message);
  }
}

/**
 * Logger object with different log levels
 */
export const logger = {
  error: (message, meta) => log('error', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  info: (message, meta) => log('info', message, meta),
  debug: (message, meta) => log('debug', message, meta)
};

/**
 * Simple audit logger for database operations
 */
export class AuditLogger {
  constructor() {
    this.operations = [];
    this.maxOperations = 1000;
  }

  /**
   * Log a database operation
   * @param {object} operation - Operation details
   * @returns {string} Operation ID
   */
  logOperation(operation) {
    const logEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      ...operation
    };

    this.operations.push(logEntry);

    // Keep only the last N operations
    if (this.operations.length > this.maxOperations) {
      this.operations = this.operations.slice(-this.maxOperations);
    }

    logger.info('Database operation', {
      operationId: logEntry.id,
      operation: logEntry.operation,
      executionTime: logEntry.executionTime,
      success: logEntry.success,
      affectedRows: logEntry.affectedRows
    });

    return logEntry.id;
  }

  /**
   * Get recent operations
   * @param {number} limit - Number of operations to return
   * @returns {Array} Recent operations
   */
  getRecentOperations(limit = 50) {
    return this.operations
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Generate unique operation ID
   * @returns {string} Unique ID
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();