/**
 * Query validation and security for MCP MySQL Server
 */

import { logger } from '../utils/logger.js';

/**
 * Custom error classes
 */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class PermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermissionError';
  }
}

/**
 * Query validator class
 */
export class QueryValidator {
  constructor(config) {
    this.config = config;
    this.dangerousPatterns = [
      // SQL Injection patterns
      /(\b(union|select|insert|update|delete|drop|create|alter|grant|revoke|truncate)\b.*?;.*?\b(union|select|insert|update|delete|drop|create|alter|grant|revoke|truncate)\b)/i,
      // Comment injection
      /(\/\*.*?\*\/|--.*?$|#.*?$)/gm,
      // System functions
      /(system|exec|shell|cmd|load_file|into\s+outfile|into\s+dumpfile)/i,
      // Blind SQL injection
      /(sleep\s*\(|benchmark\s*\(|waitfor\s+delay)/i,
    ];

    this.operationPatterns = new Map([
      ['SELECT', /^\s*select\b/i],
      ['INSERT', /^\s*insert\b/i],
      ['UPDATE', /^\s*update\b/i],
      ['DELETE', /^\s*delete\b/i],
      ['CREATE', /^\s*create\b/i],
      ['DROP', /^\s*drop\b/i],
      ['ALTER', /^\s*alter\b/i],
      ['TRUNCATE', /^\s*truncate\b/i],
    ]);
  }

  /**
   * Validate a SQL query
   * @param {string} query - SQL query to validate
   * @param {Array} parameters - Query parameters
   * @returns {object} Validation result
   */
  validate(query, parameters = []) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitizedQuery: null
    };

    try {
      // Basic input validation
      if (!query || typeof query !== 'string') {
        result.errors.push('Query must be a non-empty string');
        result.isValid = false;
        return result;
      }

      query = query.trim();

      if (query.length === 0) {
        result.errors.push('Query cannot be empty');
        result.isValid = false;
        return result;
      }

      // Check for multiple statements
      if (query.includes(';') && query.split(';').filter(s => s.trim()).length > 1) {
        result.errors.push('Multiple statements are not allowed');
        result.isValid = false;
      }

      // Detect operation type
      const operationType = this.detectOperationType(query);
      if (!operationType) {
        result.errors.push('Unable to determine query operation type');
        result.isValid = false;
        return result;
      }

      // Check if operation is allowed
      if (!this.isOperationAllowed(operationType)) {
        result.errors.push(`${operationType} operations are not allowed`);
        result.isValid = false;
      }

      // Check readonly mode
      if (this.config.readonlyMode && operationType !== 'SELECT') {
        result.errors.push('Only SELECT operations are allowed in readonly mode');
        result.isValid = false;
      }

      // Check for dangerous patterns
      const dangerousPattern = this.checkDangerousPatterns(query);
      if (dangerousPattern) {
        result.errors.push(`Query contains potentially dangerous pattern`);
        result.isValid = false;
      }

      // Validate parameters
      if (parameters && parameters.length > 0) {
        const paramValidation = this.validateParameters(parameters);
        if (!paramValidation.isValid) {
          result.errors.push(...paramValidation.errors);
          result.isValid = false;
        }
      }

      // Check query length
      if (query.length > 10000) {
        result.errors.push('Query is too long (max 10000 characters)');
        result.isValid = false;
      }

      // Sanitize query if valid
      if (result.isValid) {
        result.sanitizedQuery = this.sanitizeQuery(query);
      }

    } catch (error) {
      logger.error('Error during query validation', { error: error.message, query });
      result.errors.push('Internal validation error');
      result.isValid = false;
    }

    return result;
  }

  /**
   * Detect the type of SQL operation
   * @param {string} query - SQL query
   * @returns {string|null} Operation type
   */
  detectOperationType(query) {
    const normalizedQuery = query.trim().toLowerCase();
    
    for (const [operation, pattern] of this.operationPatterns) {
      if (pattern.test(normalizedQuery)) {
        return operation;
      }
    }
    
    return null;
  }

  /**
   * Check if an operation is allowed based on environment config
   * @param {string} operationType - Type of operation
   * @returns {boolean} Whether operation is allowed
   */
  isOperationAllowed(operationType) {
    switch (operationType) {
      case 'SELECT':
        return true; // Always allow SELECT
      case 'INSERT':
        return process.env.ALLOW_INSERT_OPERATIONS === 'true';
      case 'UPDATE':
        return process.env.ALLOW_UPDATE_OPERATIONS === 'true';
      case 'DELETE':
        return process.env.ALLOW_DELETE_OPERATIONS === 'true';
      default:
        return false; // Deny all other operations by default
    }
  }

  /**
   * Check for dangerous patterns in query
   * @param {string} query - SQL query
   * @returns {boolean} Whether dangerous patterns found
   */
  checkDangerousPatterns(query) {
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(query)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Validate query parameters
   * @param {Array} parameters - Query parameters
   * @returns {object} Validation result
   */
  validateParameters(parameters) {
    const result = {
      isValid: true,
      errors: []
    };

    for (let i = 0; i < parameters.length; i++) {
      const param = parameters[i];
      
      // Check parameter type and value
      if (typeof param === 'string') {
        // Check string length
        if (param.length > 5000) {
          result.errors.push(`Parameter ${i + 1} is too long (max 5000 characters)`);
          result.isValid = false;
        }
      } else if (typeof param === 'number') {
        // Check for reasonable number ranges
        if (!Number.isFinite(param)) {
          result.errors.push(`Parameter ${i + 1} is not a finite number`);
          result.isValid = false;
        }
      }
    }

    return result;
  }

  /**
   * Sanitize query by removing comments and normalizing whitespace
   * @param {string} query - SQL query
   * @returns {string} Sanitized query
   */
  sanitizeQuery(query) {
    // Remove comments
    let sanitized = query
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--.*$/gm, ' ')
      .replace(/#.*$/gm, ' ');

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }

  /**
   * Validate and normalize limit parameter
   * @param {number} limit - Query limit
   * @returns {number} Validated limit
   */
  validateLimit(limit) {
    const maxLimit = parseInt(process.env.MAX_QUERY_LIMIT) || 1000;

    if (limit === undefined || limit === null) {
      return maxLimit;
    }

    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0) {
      throw new ValidationError('Limit must be a non-negative integer');
    }

    if (limit > maxLimit) {
      throw new ValidationError(`Limit ${limit} exceeds maximum allowed limit of ${maxLimit}`);
    }

    return limit;
  }

  /**
   * Validate timeout parameter
   * @param {number} timeout - Query timeout
   * @returns {number} Validated timeout
   */
  validateTimeout(timeout) {
    const maxTimeout = parseInt(process.env.QUERY_TIMEOUT_MS) || 30000;

    if (timeout === undefined || timeout === null) {
      return maxTimeout;
    }

    if (typeof timeout !== 'number' || timeout <= 0) {
      throw new ValidationError('Timeout must be a positive number');
    }

    if (timeout > maxTimeout) {
      throw new ValidationError(`Timeout ${timeout}ms exceeds maximum allowed timeout of ${maxTimeout}ms`);
    }

    return timeout;
  }
}

/**
 * Create a query validator instance
 * @param {object} config - Security configuration
 * @returns {QueryValidator} Validator instance
 */
export function createQueryValidator(config) {
  return new QueryValidator(config);
}