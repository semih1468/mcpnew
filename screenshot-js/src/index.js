#!/usr/bin/env node

/**
 * MCP Screenshot Server - Plain JavaScript Implementation
 * Automated screenshot capture server for Claude Code integration
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

import { screenshotter } from './utils/screenshotter.js';
import { screenshotStorage } from './utils/storage.js';
import { logger, operationLogger } from './utils/logger.js';

// Import handlers
import { handleCapture } from './handlers/capture.js';
import { handleList } from './handlers/list.js';
import { handleView } from './handlers/view.js';
import { handleDelete } from './handlers/delete.js';

// Load environment variables
dotenv.config();

/**
 * Main MCP Screenshot Server class
 */
class MCPScreenshotServer {
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

    this.setupHandlers();
  }

  /**
   * Load configuration from environment variables
   * @returns {object} Configuration object
   */
  loadConfiguration() {
    return {
      screenshot: {
        format: process.env.SCREENSHOT_FORMAT || 'png',
        quality: parseInt(process.env.SCREENSHOT_QUALITY) || 90,
        path: process.env.SCREENSHOT_PATH || './screenshots',
        prefix: process.env.SCREENSHOT_PREFIX || 'screenshot'
      },
      autoCapture: {
        enabled: process.env.AUTO_CAPTURE_ENABLED === 'true',
        interval: parseInt(process.env.AUTO_CAPTURE_INTERVAL) || 30000,
        maxFiles: parseInt(process.env.AUTO_CAPTURE_MAX_FILES) || 100,
        monitor: parseInt(process.env.AUTO_CAPTURE_MONITOR) || 0
      },
      permissions: {
        allowDelete: process.env.ALLOW_DELETE === 'true',
        allowAutoCapture: process.env.ALLOW_AUTO_CAPTURE === 'true',
        allowAreaCapture: process.env.ALLOW_AREA_CAPTURE === 'true',
        allowWindowCapture: process.env.ALLOW_WINDOW_CAPTURE === 'true'
      },
      server: {
        name: process.env.MCP_SERVER_NAME || 'screenshot-mcp',
        version: process.env.MCP_SERVER_VERSION || '1.0.0'
      }
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
            uri: 'screenshot://status',
            name: 'Screenshot Server Status',
            description: 'Current server status and statistics',
            mimeType: 'application/json',
          },
          {
            uri: 'screenshot://operations',
            name: 'Operation Logs',
            description: 'Recent screenshot operation logs',
            mimeType: 'application/json',
          },
          {
            uri: 'screenshot://config',
            name: 'Server Configuration',
            description: 'Current server configuration and permissions',
            mimeType: 'application/json',
          },
          {
            uri: 'screenshot://storage',
            name: 'Storage Statistics',
            description: 'Screenshot storage usage statistics',
            mimeType: 'application/json',
          },
        ],
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      switch (uri) {
        case 'screenshot://status':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(await this.getServerStatus(), null, 2),
              },
            ],
          };

        case 'screenshot://operations':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(operationLogger.getRecentOperations(50), null, 2),
              },
            ],
          };

        case 'screenshot://config':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(this.config, null, 2),
              },
            ],
          };

        case 'screenshot://storage':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(await screenshotStorage.getStorageStats(), null, 2),
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
          name: 'screenshot_capture',
          description: 'Take a screenshot of the desktop or specific area',
          inputSchema: {
            type: 'object',
            properties: {
              monitor: { 
                type: 'number', 
                description: 'Monitor number to capture (0 = primary)',
                default: 0 
              },
              format: { 
                type: 'string', 
                enum: ['png', 'jpeg', 'jpg'],
                description: 'Image format',
                default: 'png'
              },
              quality: { 
                type: 'number', 
                minimum: 1,
                maximum: 100,
                description: 'Image quality (1-100)',
                default: 90
              },
              saveToFile: { 
                type: 'boolean', 
                description: 'Save screenshot to file',
                default: true
              },
              filename: { 
                type: 'string', 
                description: 'Custom filename (optional)'
              },
              area: {
                type: 'object',
                description: 'Capture specific area (optional)',
                properties: {
                  x: { type: 'number', description: 'X coordinate' },
                  y: { type: 'number', description: 'Y coordinate' },
                  width: { type: 'number', description: 'Width in pixels' },
                  height: { type: 'number', description: 'Height in pixels' }
                },
                required: ['x', 'y', 'width', 'height']
              }
            }
          },
        },
        {
          name: 'screenshot_list',
          description: 'List saved screenshots',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { 
                type: 'number', 
                description: 'Maximum number of screenshots to return',
                default: 20
              },
              sortBy: { 
                type: 'string', 
                enum: ['created', 'modified', 'size', 'filename'],
                description: 'Sort field',
                default: 'created'
              },
              order: { 
                type: 'string', 
                enum: ['asc', 'desc'],
                description: 'Sort order',
                default: 'desc'
              }
            }
          },
        },
        {
          name: 'screenshot_view',
          description: 'View a specific screenshot (returns base64 data)',
          inputSchema: {
            type: 'object',
            properties: {
              filename: { 
                type: 'string', 
                description: 'Screenshot filename'
              },
              latest: { 
                type: 'boolean', 
                description: 'Get latest screenshot if filename not provided',
                default: false
              }
            }
          },
        },
        {
          name: 'screenshot_auto',
          description: 'Control automatic screenshot capture',
          inputSchema: {
            type: 'object',
            properties: {
              action: { 
                type: 'string', 
                enum: ['start', 'stop', 'status'],
                description: 'Auto capture action',
                default: 'status'
              },
              interval: { 
                type: 'number', 
                description: 'Capture interval in milliseconds',
                minimum: 5000,
                default: 30000
              }
            }
          },
        },
        {
          name: 'screenshot_displays',
          description: 'Get information about available displays/monitors',
          inputSchema: {
            type: 'object',
            properties: {}
          },
        },
        {
          name: 'screenshot_stats',
          description: 'Get server statistics and status',
          inputSchema: {
            type: 'object',
            properties: {}
          },
        }
      ];

      // Add delete tool if allowed
      if (this.config.permissions.allowDelete) {
        tools.push({
          name: 'screenshot_delete',
          description: 'Delete screenshots',
          inputSchema: {
            type: 'object',
            properties: {
              filename: { 
                type: 'string', 
                description: 'Screenshot filename to delete'
              },
              filenames: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Multiple filenames to delete'
              },
              olderThanDays: { 
                type: 'number', 
                description: 'Delete screenshots older than X days'
              }
            }
          },
        });
      }

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'screenshot_capture':
            return await handleCapture(screenshotter, args);

          case 'screenshot_list':
            return await handleList(screenshotStorage, args);

          case 'screenshot_view':
            return await handleView(screenshotStorage, args);

          case 'screenshot_delete':
            if (!this.config.permissions.allowDelete) {
              throw new Error('Delete operations are disabled in configuration');
            }
            return await handleDelete(screenshotStorage, args);

          case 'screenshot_auto':
            if (!this.config.permissions.allowAutoCapture) {
              throw new Error('Auto capture is disabled in configuration');
            }
            return await this.handleAutoCapture(args);

          case 'screenshot_displays':
            return await this.handleDisplays();

          case 'screenshot_stats':
            return await this.handleStats();

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
   * Handle auto capture control
   * @param {object} args - Auto capture arguments
   * @returns {Promise<object>} Auto capture result
   */
  async handleAutoCapture(args) {
    const { action = 'status', interval = 30000 } = args;

    switch (action) {
      case 'start':
        await screenshotter.startAutoCapture(interval);
        const startStatus = screenshotter.getAutoCaptureStatus();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                action: 'started',
                status: startStatus,
                message: `Auto capture started with ${interval / 1000}s interval`
              }, null, 2),
            },
          ],
        };

      case 'stop':
        await screenshotter.stopAutoCapture();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                action: 'stopped',
                message: 'Auto capture stopped'
              }, null, 2),
            },
          ],
        };

      case 'status':
      default:
        const status = screenshotter.getAutoCaptureStatus();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                action: 'status',
                status
              }, null, 2),
            },
          ],
        };
    }
  }

  /**
   * Handle displays information
   * @returns {Promise<object>} Displays information
   */
  async handleDisplays() {
    const displays = await screenshotter.getDisplays();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            displays,
            count: displays.length
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Handle server statistics
   * @returns {Promise<object>} Server statistics
   */
  async handleStats() {
    const stats = await screenshotter.getStats();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            ...stats
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Get server status information
   * @returns {Promise<object>} Server status
   */
  async getServerStatus() {
    try {
      const stats = await screenshotter.getStats();
      return {
        server: {
          name: this.config.server.name,
          version: this.config.server.version,
          uptime: process.uptime(),
          uptimeFormatted: `${Math.floor(process.uptime() / 60)}m ${Math.floor(process.uptime() % 60)}s`
        },
        configuration: this.config,
        statistics: stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        server: {
          name: this.config.server.name,
          version: this.config.server.version,
          uptime: process.uptime()
        },
        configuration: this.config,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Start the MCP server
   */
  async start() {
    try {
      await screenshotter.initialize();
      logger.info('Screenshot utilities initialized');

      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      logger.info('MCP Screenshot Server started successfully', {
        name: this.config.server.name,
        version: this.config.server.version,
        autoCapture: this.config.autoCapture.enabled,
        permissions: this.config.permissions
      });

    } catch (error) {
      logger.error('Failed to start MCP Screenshot Server', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * Shutdown the server gracefully
   */
  async shutdown() {
    try {
      await screenshotter.shutdown();
      logger.info('MCP Screenshot Server shut down gracefully');
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
    }
  }
}

// Create and start server
const server = new MCPScreenshotServer();

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