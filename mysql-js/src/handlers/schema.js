/**
 * Schema inspection handlers for MCP MySQL Server
 */

import { logger, auditLogger } from '../utils/logger.js';

/**
 * Handle schema-related requests
 * @param {object} dbConnection - Database connection
 * @param {object} queryValidator - Query validator
 * @param {object} params - Request parameters
 * @returns {Promise<object>} Schema information
 */
export async function handleSchema(dbConnection, queryValidator, params) {
  const startTime = Date.now();
  const operationId = auditLogger.logOperation({
    operation: params.listTables ? 'LIST_TABLES' : 'DESCRIBE_SCHEMA',
    query: params.listTables ? 'SHOW TABLES' : `DESCRIBE ${params.table || params.database}`,
    parameters: [],
    executionTime: 0,
    success: false,
  });

  try {
    let result;

    if (params.listTables) {
      result = await listTables(dbConnection, params.database);
    } else if (params.table) {
      result = await getTableSchema(dbConnection, params.table, params.database);
    } else if (params.database) {
      result = await getDatabaseInfo(dbConnection, params.database);
    } else {
      result = await getDatabaseInfo(dbConnection);
    }

    const executionTime = Date.now() - startTime;

    // Update audit log with success
    auditLogger.logOperation({
      operation: params.listTables ? 'LIST_TABLES' : 'DESCRIBE_SCHEMA',
      query: params.listTables ? 'SHOW TABLES' : `DESCRIBE ${params.table || params.database}`,
      parameters: [],
      executionTime,
      success: true,
      affectedRows: Array.isArray(result) ? result.length : 1,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    auditLogger.logOperation({
      operation: params.listTables ? 'LIST_TABLES' : 'DESCRIBE_SCHEMA',
      query: params.listTables ? 'SHOW TABLES' : `DESCRIBE ${params.table || params.database}`,
      parameters: [],
      executionTime,
      success: false,
      error: error.message,
    });

    throw error;
  }
}

/**
 * List all tables in a database
 * @param {object} dbConnection - Database connection
 * @param {string} database - Database name (optional)
 * @returns {Promise<Array>} List of table names
 */
async function listTables(dbConnection, database) {
  const query = database ? 'SHOW TABLES FROM ??' : 'SHOW TABLES';
  const params = database ? [database] : [];
  
  const [rows] = await dbConnection.query(query, params);
  
  return rows.map(row => Object.values(row)[0]);
}

/**
 * Get table schema information
 * @param {object} dbConnection - Database connection
 * @param {string} tableName - Table name
 * @param {string} database - Database name (optional)
 * @returns {Promise<object>} Table schema
 */
async function getTableSchema(dbConnection, tableName, database) {
  const dbName = database || await getCurrentDatabase(dbConnection);
  
  // Get column information
  const columnsQuery = `
    SELECT 
      COLUMN_NAME,
      DATA_TYPE,
      IS_NULLABLE,
      COLUMN_DEFAULT,
      COLUMN_KEY,
      EXTRA,
      CHARACTER_MAXIMUM_LENGTH,
      NUMERIC_PRECISION,
      NUMERIC_SCALE
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
  `;

  const [columnRows] = await dbConnection.query(columnsQuery, [dbName, tableName]);
  
  const columns = columnRows.map(row => ({
    columnName: row.COLUMN_NAME,
    dataType: row.DATA_TYPE,
    isNullable: row.IS_NULLABLE === 'YES',
    defaultValue: row.COLUMN_DEFAULT,
    isPrimaryKey: row.COLUMN_KEY === 'PRI',
    isAutoIncrement: row.EXTRA?.includes('auto_increment') || false,
    maxLength: row.CHARACTER_MAXIMUM_LENGTH || null,
    numericPrecision: row.NUMERIC_PRECISION || null,
    numericScale: row.NUMERIC_SCALE || null,
  }));

  // Get index information
  const indexQuery = `
    SELECT 
      INDEX_NAME,
      COLUMN_NAME,
      NON_UNIQUE,
      SEQ_IN_INDEX
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    ORDER BY INDEX_NAME, SEQ_IN_INDEX
  `;

  const [indexRows] = await dbConnection.query(indexQuery, [dbName, tableName]);

  const indexes = indexRows.map(row => ({
    indexName: row.INDEX_NAME,
    columnName: row.COLUMN_NAME,
    isUnique: row.NON_UNIQUE === 0,
    isPrimary: row.INDEX_NAME === 'PRIMARY',
    sequenceInIndex: row.SEQ_IN_INDEX,
  }));

  return {
    tableName,
    columns,
    indexes,
  };
}

/**
 * Get database information
 * @param {object} dbConnection - Database connection
 * @param {string} database - Database name (optional)
 * @returns {Promise<object>} Database information
 */
async function getDatabaseInfo(dbConnection, database) {
  const dbName = database || await getCurrentDatabase(dbConnection);
  
  // Get all tables and views
  const tablesQuery = `
    SELECT TABLE_NAME, TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME
  `;

  const [tableRows] = await dbConnection.query(tablesQuery, [dbName]);
  
  const tables = [];
  const views = [];

  tableRows.forEach(row => {
    if (row.TABLE_TYPE === 'VIEW') {
      views.push(row.TABLE_NAME);
    } else {
      tables.push(row.TABLE_NAME);
    }
  });

  return {
    databaseName: dbName,
    tables,
    views,
    totalTables: tables.length,
    totalViews: views.length,
  };
}

/**
 * Get current database name
 * @param {object} dbConnection - Database connection
 * @returns {Promise<string>} Current database name
 */
async function getCurrentDatabase(dbConnection) {
  const [rows] = await dbConnection.query('SELECT DATABASE() as current_db');
  return rows[0]?.current_db || 'unknown';
}