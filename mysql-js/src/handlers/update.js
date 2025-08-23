/**
 * UPDATE handler for MCP MySQL Server
 */

import { logger, auditLogger } from '../utils/logger.js';
import { ValidationError, PermissionError } from '../database/validator.js';

/**
 * Handle UPDATE operations
 * @param {object} dbConnection - Database connection
 * @param {object} queryValidator - Query validator
 * @param {object} params - Update parameters
 * @returns {Promise<object>} Update results
 */
export async function handleUpdate(dbConnection, queryValidator, params) {
  const startTime = Date.now();

  try {
    // Check if UPDATE operations are allowed via environment
    if (process.env.ALLOW_UPDATE_OPERATIONS !== 'true') {
      throw new PermissionError('UPDATE operations are disabled via environment configuration');
    }

    // Validate input parameters
    const validatedParams = validateUpdateParams(params);
    
    // Build UPDATE query
    const { sql, queryParams } = buildUpdateQuery(validatedParams);

    // Validate the query
    const validation = queryValidator.validate(sql, queryParams);
    if (!validation.isValid) {
      throw new ValidationError(`Query validation failed: ${validation.errors.join(', ')}`);
    }

    let connection;
    let result;
    let beforeRows = [];
    let afterRows = [];

    try {
      // Use transaction for UPDATE operations
      connection = await dbConnection.beginTransaction();
      
      // First, get the current data for audit logging
      const selectSql = buildSelectForUpdate(validatedParams);
      const [beforeResult] = await connection.execute(selectSql.sql, selectSql.params);
      beforeRows = beforeResult;
      
      const executionStartTime = Date.now();
      const [updateResult] = await connection.execute(sql, queryParams);
      result = updateResult;
      
      // Get the updated data for audit logging
      const [afterResult] = await connection.execute(selectSql.sql, selectSql.params);
      afterRows = afterResult;
      
      const executionTime = Date.now() - executionStartTime;

      // Commit the transaction
      await dbConnection.commitTransaction(connection);

      // Log the operation
      auditLogger.logOperation({
        operation: 'UPDATE',
        query: sql,
        parameters: queryParams,
        executionTime,
        success: true,
        affectedRows: result.affectedRows,
      });

      // Format the response
      const response = formatUpdateResponse(result, sql, executionTime, beforeRows, afterRows);

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
      operation: 'UPDATE',
      query: `UPDATE ${params.table}`,
      parameters: [],
      executionTime,
      success: false,
      error: error.message,
    });

    throw error;
  }
}

/**
 * Validate UPDATE parameters
 * @param {object} params - Update parameters
 * @returns {object} Validated parameters
 */
function validateUpdateParams(params) {
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

  if (!params.where || typeof params.where !== 'object' || Array.isArray(params.where)) {
    throw new ValidationError('where parameter must be a non-array object');
  }

  if (Object.keys(params.where).length === 0) {
    throw new ValidationError('where parameter cannot be empty - this prevents accidental bulk updates');
  }

  // Validate column names in data
  for (const column of Object.keys(params.data)) {
    if (!/^[a-zA-Z0-9_]+$/.test(column)) {
      throw new ValidationError(`Invalid column name in data: ${column}`);
    }
  }

  // Validate column names in where clause
  for (const column of Object.keys(params.where)) {
    if (!/^[a-zA-Z0-9_]+$/.test(column)) {
      throw new ValidationError(`Invalid column name in where: ${column}`);
    }
  }

  // Validate limit if provided
  if (params.limit !== undefined) {
    if (!Number.isInteger(params.limit) || params.limit <= 0) {
      throw new ValidationError('limit parameter must be a positive integer');
    }
    if (params.limit > 1000) {
      throw new ValidationError('limit parameter cannot exceed 1000 for safety');
    }
  }

  return params;
}

/**
 * Build UPDATE query
 * @param {object} params - Update parameters
 * @returns {object} SQL query and parameters
 */
function buildUpdateQuery(params) {
  const setColumns = Object.keys(params.data);
  const setValues = Object.values(params.data);
  
  let sql = `UPDATE ${params.table} SET `;
  
  // Build SET clause
  const setClauses = setColumns.map(column => `${column} = ?`);
  sql += setClauses.join(', ');
  
  const queryParams = [...setValues];
  
  // Build WHERE clause
  const whereConditions = [];
  for (const [column, value] of Object.entries(params.where)) {
    if (value === null || value === undefined) {
      whereConditions.push(`${column} IS NULL`);
    } else if (Array.isArray(value)) {
      whereConditions.push(`${column} IN (${value.map(() => '?').join(', ')})`);
      queryParams.push(...value);
    } else if (typeof value === 'object' && value.operator) {
      // Support for operators like { operator: '>', value: 10 }
      const operator = value.operator;
      const operatorValue = value.value;
      
      if (!['=', '!=', '<>', '>', '>=', '<', '<=', 'LIKE', 'NOT LIKE'].includes(operator)) {
        throw new ValidationError(`Invalid operator: ${operator}`);
      }
      
      whereConditions.push(`${column} ${operator} ?`);
      queryParams.push(operatorValue);
    } else {
      whereConditions.push(`${column} = ?`);
      queryParams.push(value);
    }
  }
  
  sql += ` WHERE ${whereConditions.join(' AND ')}`;
  
  // Add LIMIT clause if specified
  if (params.limit) {
    sql += ` LIMIT ${params.limit}`;
  }

  return { sql, queryParams };
}

/**
 * Build SELECT query to get current data before update
 * @param {object} params - Update parameters
 * @returns {object} SELECT query and parameters
 */
function buildSelectForUpdate(params) {
  let sql = `SELECT * FROM ${params.table}`;
  const queryParams = [];
  
  // Build WHERE clause (same as update)
  const whereConditions = [];
  for (const [column, value] of Object.entries(params.where)) {
    if (value === null || value === undefined) {
      whereConditions.push(`${column} IS NULL`);
    } else if (Array.isArray(value)) {
      whereConditions.push(`${column} IN (${value.map(() => '?').join(', ')})`);
      queryParams.push(...value);
    } else if (typeof value === 'object' && value.operator) {
      const operator = value.operator;
      const operatorValue = value.value;
      
      whereConditions.push(`${column} ${operator} ?`);
      queryParams.push(operatorValue);
    } else {
      whereConditions.push(`${column} = ?`);
      queryParams.push(value);
    }
  }
  
  sql += ` WHERE ${whereConditions.join(' AND ')}`;
  
  // Add LIMIT clause if specified
  if (params.limit) {
    sql += ` LIMIT ${params.limit}`;
  }

  return { sql, params: queryParams };
}

/**
 * Format UPDATE response
 * @param {object} result - Update result
 * @param {string} query - Executed query
 * @param {number} executionTime - Execution time
 * @param {Array} beforeRows - Rows before update
 * @param {Array} afterRows - Rows after update
 * @returns {string} Formatted JSON response
 */
function formatUpdateResponse(result, query, executionTime, beforeRows, afterRows) {
  const response = {
    success: true,
    operation: 'UPDATE',
    affectedRows: result.affectedRows,
    changedRows: result.changedRows || result.affectedRows,
    warningCount: result.warningCount || 0,
    executionTime,
    query,
    metadata: {
      serverStatus: result.serverStatus,
      fieldCount: result.fieldCount,
    },
    audit: {
      rowsBeforeUpdate: beforeRows.length,
      rowsAfterUpdate: afterRows.length,
      sampleBefore: beforeRows.slice(0, 3), // Show first 3 rows for audit
      sampleAfter: afterRows.slice(0, 3),
    },
  };

  // Add warnings for various scenarios
  const warnings = [];
  
  if (result.affectedRows === 0) {
    warnings.push('No rows were updated. Check your WHERE conditions.');
  }
  
  if (result.changedRows && result.changedRows < result.affectedRows) {
    warnings.push(`${result.affectedRows} rows matched but only ${result.changedRows} were actually changed.`);
  }

  if (beforeRows.length !== afterRows.length) {
    warnings.push('Row count changed during update operation. This might indicate a data integrity issue.');
  }

  if (warnings.length > 0) {
    response.warnings = warnings;
  }

  return JSON.stringify(response, null, 2);
}