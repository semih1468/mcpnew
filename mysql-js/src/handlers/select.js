/**
 * SELECT query handler for MCP MySQL Server
 */

import { logger, auditLogger } from '../utils/logger.js';
import { ValidationError } from '../database/validator.js';

/**
 * Handle SELECT queries and table queries
 * @param {object} dbConnection - Database connection
 * @param {object} queryValidator - Query validator
 * @param {object} params - Query parameters
 * @returns {Promise<object>} Query results
 */
export async function handleSelect(dbConnection, queryValidator, params) {
  const startTime = Date.now();

  try {
    // Validate input parameters
    if (!params.sql && !params.table) {
      throw new ValidationError('Either sql or table parameter must be provided');
    }

    let query;
    let queryParams = [];

    if (params.sql) {
      // Direct SQL query
      query = params.sql;
      queryParams = params.parameters || [];
    } else {
      // Build SELECT query from parameters
      const result = buildSelectQuery(params);
      query = result.sql;
      queryParams = result.params;
    }

    // Validate the query
    const validation = queryValidator.validate(query, queryParams);
    if (!validation.isValid) {
      throw new ValidationError(`Query validation failed: ${validation.errors.join(', ')}`);
    }

    // Apply limit validation
    const limit = queryValidator.validateLimit(params.limit);
    if (limit && !query.toLowerCase().includes('limit')) {
      query += ` LIMIT ${limit}`;
    }

    // Apply timeout validation
    const timeout = queryValidator.validateTimeout();

    // Execute the query
    const executionStartTime = Date.now();
    const [rows, fields] = await dbConnection.query(query, queryParams);
    const executionTime = Date.now() - executionStartTime;

    // Log the operation
    auditLogger.logOperation({
      operation: 'SELECT',
      query: validation.sanitizedQuery || query,
      parameters: queryParams,
      executionTime,
      success: true,
      affectedRows: Array.isArray(rows) ? rows.length : 0,
    });

    // Format the response
    const response = formatSelectResponse(rows, fields, executionTime, validation.sanitizedQuery || query);

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    auditLogger.logOperation({
      operation: 'SELECT',
      query: params.sql || 'BUILT_SELECT_QUERY',
      parameters: params.parameters || [],
      executionTime,
      success: false,
      error: error.message,
    });

    throw error;
  }
}

/**
 * Build SELECT query from parameters
 * @param {object} params - Query parameters
 * @returns {object} SQL query and parameters
 */
function buildSelectQuery(params) {
  if (!params.table) {
    throw new ValidationError('Table name is required for query building');
  }

  let sql = 'SELECT ';
  const queryParams = [];

  // Columns
  if (params.columns && params.columns.length > 0) {
    // Validate column names to prevent injection
    const validColumns = params.columns.filter(col => /^[a-zA-Z0-9_]+$/.test(col));
    if (validColumns.length !== params.columns.length) {
      throw new ValidationError('Invalid column names detected');
    }
    sql += validColumns.join(', ');
  } else {
    sql += '*';
  }

  sql += ` FROM ${params.table}`;

  // WHERE clause
  if (params.where && Object.keys(params.where).length > 0) {
    const whereConditions = [];
    for (const [column, value] of Object.entries(params.where)) {
      // Validate column name
      if (!/^[a-zA-Z0-9_]+$/.test(column)) {
        throw new ValidationError(`Invalid column name: ${column}`);
      }

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

    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(' AND ')}`;
    }
  }

  // ORDER BY clause
  if (params.orderBy && Object.keys(params.orderBy).length > 0) {
    const orderConditions = [];
    for (const [column, direction] of Object.entries(params.orderBy)) {
      // Validate column name
      if (!/^[a-zA-Z0-9_]+$/.test(column)) {
        throw new ValidationError(`Invalid column name in ORDER BY: ${column}`);
      }

      // Validate direction
      if (!['ASC', 'DESC'].includes(direction)) {
        throw new ValidationError(`Invalid sort direction: ${direction}`);
      }

      orderConditions.push(`${column} ${direction}`);
    }

    if (orderConditions.length > 0) {
      sql += ` ORDER BY ${orderConditions.join(', ')}`;
    }
  }

  // LIMIT clause
  if (params.limit && params.limit > 0) {
    sql += ` LIMIT ${params.limit}`;
  }

  // OFFSET clause
  if (params.offset && params.offset > 0) {
    sql += ` OFFSET ${params.offset}`;
  }

  return { sql, params: queryParams };
}

/**
 * Format SELECT response
 * @param {Array} rows - Query result rows
 * @param {Array} fields - Query result fields
 * @param {number} executionTime - Execution time in ms
 * @param {string} query - Executed query
 * @returns {string} Formatted JSON response
 */
function formatSelectResponse(rows, fields, executionTime, query) {
  if (!Array.isArray(rows)) {
    return JSON.stringify({
      error: 'Unexpected result format',
      executionTime,
      query,
    }, null, 2);
  }

  const response = {
    success: true,
    rowCount: rows.length,
    executionTime,
    query,
    columns: fields?.map(field => ({
      name: field.name,
      type: field.type,
      length: field.length,
      flags: field.flags,
    })) || [],
    data: rows,
    metadata: {
      hasMore: false,
      totalRows: rows.length,
    },
  };

  // If there are too many rows, truncate the display
  if (rows.length > 1000) {
    response.data = rows.slice(0, 1000);
    response.metadata.hasMore = true;
    response.metadata.totalRows = rows.length;
    response.metadata.displayedRows = 1000;
  }

  return JSON.stringify(response, null, 2);
}