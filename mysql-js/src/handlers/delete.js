/**
 * DELETE handler for MCP MySQL Server
 */

import { logger, auditLogger } from '../utils/logger.js';
import { ValidationError, PermissionError } from '../database/validator.js';

/**
 * Handle DELETE operations
 * @param {object} dbConnection - Database connection
 * @param {object} queryValidator - Query validator
 * @param {object} params - Delete parameters
 * @returns {Promise<object>} Delete results
 */
export async function handleDelete(dbConnection, queryValidator, params) {
  const startTime = Date.now();

  try {
    // Check if DELETE operations are allowed via environment
    if (process.env.ALLOW_DELETE_OPERATIONS !== 'true') {
      throw new PermissionError('DELETE operations are disabled via environment configuration');
    }

    // Validate input parameters
    const validatedParams = validateDeleteParams(params);
    
    // Build DELETE query
    const { sql, queryParams } = buildDeleteQuery(validatedParams);

    // Validate the query
    const validation = queryValidator.validate(sql, queryParams);
    if (!validation.isValid) {
      throw new ValidationError(`Query validation failed: ${validation.errors.join(', ')}`);
    }

    let connection;
    let result;
    let deletedRows = [];

    try {
      // Use transaction for DELETE operations with rollback capability
      connection = await dbConnection.beginTransaction();
      
      // First, get the data that will be deleted for audit logging
      const selectSql = buildSelectForDelete(validatedParams);
      const [rowsToDelete] = await connection.execute(selectSql.sql, selectSql.params);
      deletedRows = rowsToDelete;
      
      // Confirm deletion if there are rows to delete
      if (deletedRows.length === 0) {
        await dbConnection.rollbackTransaction(connection);
        
        const response = {
          success: true,
          operation: 'DELETE',
          affectedRows: 0,
          deletedRows: [],
          executionTime: Date.now() - startTime,
          query: sql,
          message: 'No rows matched the deletion criteria',
        };

        auditLogger.logOperation({
          operation: 'DELETE',
          query: sql,
          parameters: queryParams,
          executionTime: Date.now() - startTime,
          success: true,
          affectedRows: 0,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      // Safety check: if too many rows would be deleted, require confirmation
      if (deletedRows.length > 100 && !validatedParams.limit) {
        await dbConnection.rollbackTransaction(connection);
        throw new ValidationError(
          `Deletion would affect ${deletedRows.length} rows. Please add a LIMIT clause for safety.`
        );
      }
      
      const executionStartTime = Date.now();
      const [deleteResult] = await connection.execute(sql, queryParams);
      result = deleteResult;
      const executionTime = Date.now() - executionStartTime;

      // Commit the transaction
      await dbConnection.commitTransaction(connection);

      // Log the operation
      auditLogger.logOperation({
        operation: 'DELETE',
        query: sql,
        parameters: queryParams,
        executionTime,
        success: true,
        affectedRows: result.affectedRows,
      });

      // Format the response
      const response = formatDeleteResponse(result, sql, executionTime, deletedRows);

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
      operation: 'DELETE',
      query: `DELETE FROM ${params.table}`,
      parameters: [],
      executionTime,
      success: false,
      error: error.message,
    });

    throw error;
  }
}

/**
 * Validate DELETE parameters
 * @param {object} params - Delete parameters
 * @returns {object} Validated parameters
 */
function validateDeleteParams(params) {
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

  if (!params.where || typeof params.where !== 'object' || Array.isArray(params.where)) {
    throw new ValidationError('where parameter must be a non-array object');
  }

  if (Object.keys(params.where).length === 0) {
    throw new ValidationError('where parameter cannot be empty - this prevents accidental bulk deletions');
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
 * Build DELETE query
 * @param {object} params - Delete parameters
 * @returns {object} SQL query and parameters
 */
function buildDeleteQuery(params) {
  let sql = `DELETE FROM ${params.table}`;
  const queryParams = [];
  
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
 * Build SELECT query to get data that will be deleted
 * @param {object} params - Delete parameters
 * @returns {object} SELECT query and parameters
 */
function buildSelectForDelete(params) {
  let sql = `SELECT * FROM ${params.table}`;
  const queryParams = [];
  
  // Build WHERE clause (same as delete)
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
 * Format DELETE response
 * @param {object} result - Delete result
 * @param {string} query - Executed query
 * @param {number} executionTime - Execution time
 * @param {Array} deletedRows - Deleted rows data
 * @returns {string} Formatted JSON response
 */
function formatDeleteResponse(result, query, executionTime, deletedRows) {
  const response = {
    success: true,
    operation: 'DELETE',
    affectedRows: result.affectedRows,
    warningCount: result.warningCount || 0,
    executionTime,
    query,
    metadata: {
      serverStatus: result.serverStatus,
      fieldCount: result.fieldCount,
    },
    audit: {
      deletedRowCount: deletedRows.length,
      sampleDeletedRows: deletedRows.slice(0, 5), // Show first 5 rows for audit
    },
  };

  // Add warnings for various scenarios
  const warnings = [];
  
  if (result.affectedRows === 0) {
    warnings.push('No rows were deleted. Check your WHERE conditions.');
  }
  
  if (result.affectedRows !== deletedRows.length) {
    warnings.push(`Expected to delete ${deletedRows.length} rows but actually deleted ${result.affectedRows} rows.`);
  }

  if (result.warningCount && result.warningCount > 0) {
    warnings.push(`MySQL reported ${result.warningCount} warnings during deletion.`);
  }

  if (warnings.length > 0) {
    response.warnings = warnings;
  }

  return JSON.stringify(response, null, 2);
}