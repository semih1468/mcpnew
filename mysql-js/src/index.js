#!/usr/bin/env node

/**
 * MCP MySQL Server - Plain JavaScript Implementation
 * A secure Model Context Protocol server for MySQL databases
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { createDatabaseConnection } from './database/connection.js';
import { createQueryValidator, PermissionError } from './database/validator.js';
import { logger, auditLogger } from './utils/logger.js';

// Import handlers
import { handleSchema } from './handlers/schema.js';
import { handleSelect } from './handlers/select.js';
import { handleInsert } from './handlers/insert.js';
import { handleUpdate } from './handlers/update.js';
import { handleDelete } from './handlers/delete.js';

// Load environment variables
dotenv.config();

/**
 * Main MCP MySQL Server class
 */
class MCPMySQLServer {
  constructor() {
    this.config = this.loadConfiguration();
    this.server = new Server(
      {
        name: this.config.server.name,
        version: this.config.server.version,
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.dbConnection = createDatabaseConnection(this.config.mysql);
    this.queryValidator = createQueryValidator(this.config.security);
    
    this.setupHandlers();
  }

  /**
   * Load configuration from environment variables
   * @returns {object} Configuration object
   */
  loadConfiguration() {
    return {
      mysql: {
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'test',
        connectionLimit: parseInt(process.env.MAX_CONNECTIONS) || 10,
        timeout: parseInt(process.env.QUERY_TIMEOUT_MS) || 30000,
      },
      permissions: {
        allowDelete: process.env.ALLOW_DELETE_OPERATIONS === 'true',
        allowUpdate: process.env.ALLOW_UPDATE_OPERATIONS === 'true',
        allowInsert: process.env.ALLOW_INSERT_OPERATIONS === 'true',
      },
      security: {
        maxQueryLimit: parseInt(process.env.MAX_QUERY_LIMIT) || 1000,
        queryTimeoutMs: parseInt(process.env.QUERY_TIMEOUT_MS) || 30000,
        enableQueryValidation: process.env.ENABLE_QUERY_VALIDATION !== 'false',
        readonlyMode: process.env.READONLY_MODE === 'true',
      },
      server: {
        name: process.env.MCP_SERVER_NAME || 'mysql-mcp',
        version: process.env.MCP_SERVER_VERSION || '1.0.0',
      },
    };
  }

  /**
   * Setup MCP request handlers
   */
  setupHandlers() {
    // Resource handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'mysql://connection/status',
            name: 'Database Connection Status',
            description: 'Current database connection status and statistics',
            mimeType: 'application/json',
          },
          {
            uri: 'mysql://audit/logs',
            name: 'Operation Audit Logs',
            description: 'Recent database operation logs',
            mimeType: 'application/json',
          },
          {
            uri: 'mysql://config/permissions',
            name: 'Operation Permissions',
            description: 'Current operation permissions configuration',
            mimeType: 'application/json',
          },
        ],
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      switch (uri) {
        case 'mysql://connection/status':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(await this.getConnectionStatus(), null, 2),
              },
            ],
          };

        case 'mysql://audit/logs':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(auditLogger.getRecentOperations(50), null, 2),
              },
            ],
          };

        case 'mysql://config/permissions':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(this.config.permissions, null, 2),
              },
            ],
          };

        default:
          throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
      }
    });

    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [
        {
          name: 'mysql_query',
          description: 'Execute a SQL query against the MySQL database',
          inputSchema: {
            type: 'object',
            properties: {
              sql: { type: 'string', description: 'SQL query to execute' },
              parameters: { type: 'array', description: 'Query parameters for prepared statements' },
              limit: { type: 'number', description: 'Maximum number of rows to return' },
            },
            required: ['sql'],
          },
        },
        {
          name: 'mysql_schema',
          description: 'Get schema information for tables or databases',
          inputSchema: {
            type: 'object',
            properties: {
              table: { type: 'string', description: 'Table name to inspect' },
              database: { type: 'string', description: 'Database name to inspect' },
            },
          },
        },
        {
          name: 'mysql_tables',
          description: 'List all tables in the database',
          inputSchema: {
            type: 'object',
            properties: {
              database: { type: 'string', description: 'Database name' },
            },
          },
        },
      ];

      // Add operation-specific tools based on permissions
      if (this.config.permissions.allowInsert) {
        tools.push({
          name: 'mysql_insert',
          description: 'Insert data into a table',
          inputSchema: {
            type: 'object',
            properties: {
              table: { type: 'string', description: 'Table name' },
              data: { type: 'object', description: 'Data to insert' },
            },
            required: ['table', 'data'],
          },
        });
      }

      if (this.config.permissions.allowUpdate) {
        tools.push({
          name: 'mysql_update',
          description: 'Update data in a table',
          inputSchema: {
            type: 'object',
            properties: {
              table: { type: 'string', description: 'Table name' },
              data: { type: 'object', description: 'Data to update' },
              where: { type: 'object', description: 'WHERE conditions' },
            },
            required: ['table', 'data', 'where'],
          },
        });
      }

      if (this.config.permissions.allowDelete) {
        tools.push({
          name: 'mysql_delete',
          description: 'Delete data from a table',
          inputSchema: {
            type: 'object',
            properties: {
              table: { type: 'string', description: 'Table name' },
              where: { type: 'object', description: 'WHERE conditions' },
            },
            required: ['table', 'where'],
          },
        });
      }

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'mysql_query':
            return await handleSelect(this.dbConnection, this.queryValidator, args);

          case 'mysql_schema':
            return await handleSchema(this.dbConnection, this.queryValidator, args);

          case 'mysql_tables':
            return await handleSchema(this.dbConnection, this.queryValidator, { 
              ...args, 
              listTables: true 
            });

          case 'mysql_insert':
            if (!this.config.permissions.allowInsert) {
              throw new PermissionError('INSERT operations are disabled via environment configuration');
            }
            return await handleInsert(this.dbConnection, this.queryValidator, args);

          case 'mysql_update':
            if (!this.config.permissions.allowUpdate) {
              throw new PermissionError('UPDATE operations are disabled via environment configuration');
            }
            return await handleUpdate(this.dbConnection, this.queryValidator, args);

          case 'mysql_delete':
            if (!this.config.permissions.allowDelete) {
              throw new PermissionError('DELETE operations are disabled via environment configuration');
            }
            return await handleDelete(this.dbConnection, this.queryValidator, args);

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error('Tool execution error', { tool: name, args, error: error.message });
        
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Get connection status information
   * @returns {Promise<object>} Connection status
   */
  async getConnectionStatus() {
    try {
      return {
        connected: this.dbConnection.isConnected(),
        config: this.dbConnection.getConfig(),
        version: await this.dbConnection.getDatabaseVersion(),
        permissions: this.config.permissions,
        uptime: process.uptime(),
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        permissions: this.config.permissions,
        uptime: process.uptime(),
      };
    }
  }

  /**
   * Start the MCP server
   */
  async start() {
    try {
      await this.dbConnection.initialize();
      logger.info('Database connection initialized');

      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      logger.info('MCP MySQL Server started successfully', {
        name: this.config.server.name,
        version: this.config.server.version,
        permissions: this.config.permissions,
      });
    } catch (error) {
      logger.error('Failed to start MCP MySQL Server', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * Shutdown the server gracefully
   */
  async shutdown() {
    try {
      await this.dbConnection.close();
      logger.info('MCP MySQL Server shut down gracefully');
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
    }
  }
}

// Create and start server
const server = new MCPMySQLServer();

// Handle process signals
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down...');
  await server.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down...');
  await server.shutdown();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
  process.exit(1);
});

// Start the server
server.start().catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});