/**
 * Simple logging utility for MCP Screenshot Server
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
 * Simple operation logger for screenshot operations
 */
export class OperationLogger {
  constructor() {
    this.operations = [];
    this.maxOperations = 1000;
  }

  /**
   * Log a screenshot operation
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

    if (process.env.LOG_OPERATIONS === 'true') {
      logger.info('Screenshot operation', {
        operationId: logEntry.id,
        operation: logEntry.operation,
        success: logEntry.success,
        file: logEntry.file,
        executionTime: logEntry.executionTime
      });
    }

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
   * Get operation statistics
   * @returns {object} Operation statistics
   */
  getStats() {
    const total = this.operations.length;
    const successful = this.operations.filter(op => op.success).length;
    const failed = total - successful;

    const operationsByType = {};
    let totalExecutionTime = 0;

    this.operations.forEach(op => {
      operationsByType[op.operation] = (operationsByType[op.operation] || 0) + 1;
      if (op.executionTime) {
        totalExecutionTime += op.executionTime;
      }
    });

    return {
      totalOperations: total,
      successfulOperations: successful,
      failedOperations: failed,
      operationsByType,
      averageExecutionTime: total > 0 ? totalExecutionTime / total : 0
    };
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
export const operationLogger = new OperationLogger();