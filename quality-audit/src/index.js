#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { AuditService } from './services/AuditService.js';

class QualityAuditServer {
  constructor() {
    this.auditService = new AuditService();
    this.server = new Server(
      { 
        name: 'quality-audit-mcp',
        version: '1.0.0' 
      },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'audit_repo',
            description: 'Audit entire repository or specific paths for code quality issues',
            inputSchema: {
              type: 'object',
              properties: {
                paths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of paths to audit'
                },
                exclude: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Patterns to exclude'
                }
              },
              required: ['paths']
            }
          },
          {
            name: 'audit_file',
            description: 'Audit a single file for code quality issues',
            inputSchema: {
              type: 'object',
              properties: {
                file: {
                  type: 'string',
                  description: 'Path to the file to audit'
                }
              },
              required: ['file']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'audit_repo': {
            const paths = args?.paths || ['.'];
            const exclude = args?.exclude;
            const report = await this.auditService.auditRepository(paths, exclude);
            return {
              content: [{
                type: 'text',
                text: report
              }]
            };
          }

          case 'audit_file': {
            const file = args?.file;
            if (!file) throw new Error('File path is required');
            const report = await this.auditService.auditFile(file);
            return {
              content: [{
                type: 'text',
                text: report
              }]
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message || String(error)}`
          }]
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Quality Audit MCP Server running');
  }
}

const server = new QualityAuditServer();
server.run().catch(console.error);