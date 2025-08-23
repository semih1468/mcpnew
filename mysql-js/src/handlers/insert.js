/**
 * INSERT handler for MCP MySQL Server
 */

import { logger, auditLogger } from '../utils/logger.js';
import { ValidationError, PermissionError } from '../database/validator.js';

/**
 * Handle INSERT operations
 * @param {object} dbConnection - Database connection
 * @param {object} queryValidator - Query validator
 * @param {object} params - Insert parameters
 * @returns {Promise<object>} Insert results
 */
export async function handleInsert(dbConnection, queryValidator, params) {
  const startTime = Date.now();

  try {
    // Check if INSERT operations are allowed via environment
    if (process.env.ALLOW_INSERT_OPERATIONS !== 'true') {
      throw new PermissionError('INSERT operations are disabled via environment configuration');
    }

    // Validate input parameters
    const validatedParams = validateInsertParams(params);
    
    // Build INSERT query
    const { sql, queryParams } = buildInsertQuery(validatedParams);

    // Validate the query
    const validation = queryValidator.validate(sql, queryParams);
    if (!validation.isValid) {
      throw new ValidationError(`Query validation failed: ${validation.errors.join(', ')}`);
    }

    let connection;
    let result;

    try {
      // Use transaction for INSERT operations
      connection = await dbConnection.beginTransaction();
      
      const executionStartTime = Date.now();
      const [insertResult] = await connection.execute(sql, queryParams);
      result = insertResult;
      const executionTime = Date.now() - executionStartTime;

      // Commit the transaction
      await dbConnection.commitTransaction(connection);

      // Log the operation
      auditLogger.logOperation({
        operation: 'INSERT',
        query: sql,
        parameters: queryParams,
        executionTime,
        success: true,
        affectedRows: result.affectedRows,
      });

      // Format the response
      const response = formatInsertResponse(result, sql, executionTime);

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };

    } catch (error) {
      // Rollback transaction on error
      if (connection) {
        await dbConnection.rollbackTransaction(connection);
      }
      throw error;
    }

  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    auditLogger.logOperation({
      operation: 'INSERT',
      query: `INSERT INTO ${params.table}`,
      parameters: [],
      executionTime,
      success: false,
      error: error.message,
    });

    throw error;
  }
}

/**
 * Validate INSERT parameters
 * @param {object} params - Insert parameters
 * @returns {object} Validated parameters
 */
function validateInsertParams(params) {
  if (typeof params !== 'object' || params === null) {
    throw new ValidationError('Parameters must be an object');
  }

  if (!params.table || typeof params.table !== 'string') {
    throw new ValidationError('table parameter must be a non-empty string');
  }

  // Validate table name format
  if (!/^[a-zA-Z0-9_]+$/.test(params.table)) {
    throw new ValidationError('Invalid table name format');
  }

  if (!params.data || typeof params.data !== 'object' || Array.isArray(params.data)) {
    throw new ValidationError('data parameter must be a non-array object');
  }

  if (Object.keys(params.data).length === 0) {
    throw new ValidationError('data parameter cannot be empty');
  }

  // Validate column names in data
  for (const column of Object.keys(params.data)) {
    if (!/^[a-zA-Z0-9_]+$/.test(column)) {
      throw new ValidationError(`Invalid column name: ${column}`);
    }
  }

  return params;
}

/**
 * Build INSERT query
 * @param {object} params - Insert parameters
 * @returns {object} SQL query and parameters
 */
function buildInsertQuery(params) {
  const columns = Object.keys(params.data);
  const values = Object.values(params.data);
  
  let sql = `INSERT INTO ${params.table}`;
  sql += ` (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;

  return { sql, queryParams: values };
}

/**
 * Format INSERT response
 * @param {object} result - Insert result
 * @param {string} query - Executed query
 * @param {number} executionTime - Execution time
 * @returns {string} Formatted JSON response
 */
function formatInsertResponse(result, query, executionTime) {
  const response = {
    success: true,
    operation: 'INSERT',
    affectedRows: result.affectedRows,
    insertId: result.insertId || null,
    warningCount: result.warningCount || 0,
    executionTime,
    query,
    metadata: {
      serverStatus: result.serverStatus,
      fieldCount: result.fieldCount,
    },
  };

  // Add warning if no rows were affected
  if (result.affectedRows === 0) {
    response.warnings = ['No rows were inserted. This might be due to constraints or duplicate key issues.'];
  }

  return JSON.stringify(response, null, 2);
}