/**
 * Database connection management for MCP MySQL Server
 */

import mysql from 'mysql2/promise';
import { logger } from '../utils/logger.js';

/**
 * Database connection class
 */
export class DatabaseConnection {
  constructor(config) {
    this.config = config;
    this.pool = null;
  }

  /**
   * Initialize the database connection pool
   */
  async initialize() {
    try {
      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        connectionLimit: this.config.connectionLimit || 10,
        multipleStatements: false,
        dateStrings: true,
        supportBigNumbers: true,
        bigNumberStrings: true,
        charset: 'utf8mb4',
      });

      await this.testConnection();
      logger.info('Database connection pool initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database connection', { error: error.message });
      throw new Error(`Failed to initialize database connection: ${error.message}`);
    }
  }

  /**
   * Test the database connection
   */
  async testConnection() {
    if (!this.pool) {
      throw new Error('Database connection pool not initialized');
    }

    try {
      const connection = await this.pool.getConnection();
      await connection.execute('SELECT 1');
      connection.release();
      logger.info('Database connection test successful');
    } catch (error) {
      logger.error('Database connection test failed', { error: error.message });
      throw new Error(`Database connection test failed: ${error.message}`);
    }
  }

  /**
   * Execute a query with parameters
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results
   */
  async execute(sql, params = []) {
    if (!this.pool) {
      throw new Error('Database connection pool not initialized');
    }

    const startTime = Date.now();
    let connection = null;

    try {
      connection = await this.pool.getConnection();
      const [rows, fields] = await connection.execute(sql, params);
      const executionTime = Date.now() - startTime;

      logger.debug('Query executed successfully', {
        sql,
        params,
        executionTime,
        affectedRows: Array.isArray(rows) ? rows.length : rows.affectedRows
      });

      return [rows, fields];
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('Query execution failed', {
        sql,
        params,
        executionTime,
        error: error.message
      });

      throw new Error(`Query execution failed: ${error.message}`);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Execute a query (alias for execute)
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results
   */
  async query(sql, params = []) {
    return this.execute(sql, params);
  }

  /**
   * Begin a transaction
   * @returns {Promise<object>} Database connection for transaction
   */
  async beginTransaction() {
    if (!this.pool) {
      throw new Error('Database connection pool not initialized');
    }

    try {
      const connection = await this.pool.getConnection();
      await connection.beginTransaction();
      logger.debug('Transaction started');
      return connection;
    } catch (error) {
      logger.error('Failed to begin transaction', { error: error.message });
      throw new Error(`Failed to begin transaction: ${error.message}`);
    }
  }

  /**
   * Commit a transaction
   * @param {object} connection - Database connection
   */
  async commitTransaction(connection) {
    try {
      await connection.commit();
      connection.release();
      logger.debug('Transaction committed');
    } catch (error) {
      logger.error('Failed to commit transaction', { error: error.message });
      await this.rollbackTransaction(connection);
      throw new Error(`Failed to commit transaction: ${error.message}`);
    }
  }

  /**
   * Rollback a transaction
   * @param {object} connection - Database connection
   */
  async rollbackTransaction(connection) {
    try {
      await connection.rollback();
      connection.release();
      logger.debug('Transaction rolled back');
    } catch (error) {
      logger.error('Failed to rollback transaction', { error: error.message });
      connection.release();
      throw new Error(`Failed to rollback transaction: ${error.message}`);
    }
  }

  /**
   * Get database version
   * @returns {Promise<string>} Database version
   */
  async getDatabaseVersion() {
    try {
      const [rows] = await this.query('SELECT VERSION() as version');
      return rows[0]?.version || 'Unknown';
    } catch (error) {
      logger.error('Failed to get database version', { error: error.message });
      throw new Error(`Failed to get database version: ${error.message}`);
    }
  }

  /**
   * Check if connected
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.pool !== null;
  }

  /**
   * Close the connection pool
   */
  async close() {
    if (this.pool) {
      try {
        await this.pool.end();
        this.pool = null;
        logger.info('Database connection pool closed');
      } catch (error) {
        logger.error('Error closing database connection pool', { error: error.message });
        throw new Error(`Error closing database connection pool: ${error.message}`);
      }
    }
  }

  /**
   * Get current configuration (without password)
   * @returns {object} Sanitized configuration
   */
  getConfig() {
    return {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user
    };
  }
}

// Singleton instance
let dbConnection = null;

/**
 * Create database connection instance
 * @param {object} config - Database configuration
 * @returns {DatabaseConnection} Database connection instance
 */
export function createDatabaseConnection(config) {
  if (!dbConnection) {
    dbConnection = new DatabaseConnection(config);
  }
  return dbConnection;
}

/**
 * Get existing database connection instance
 * @returns {DatabaseConnection} Database connection instance
 */
export function getDatabaseConnection() {
  if (!dbConnection) {
    throw new Error('Database connection not initialized. Call createDatabaseConnection first.');
  }
  return dbConnection;
}