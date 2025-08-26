#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import crypto from 'crypto';

// Configuration
const config = {
  supportedExtensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs'],
  ignorePaths: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'],
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880'), // 5MB
  dbPath: process.env.DB_PATH || './db',
};

// Graph structure to store code relationships
class CodeGraph {
  constructor() {
    this.nodes = new Map(); // id -> node data
    this.edges = new Map(); // id -> Set of connected ids
    this.reverseEdges = new Map(); // for finding who uses what
    this.fileIndex = new Map(); // filepath -> node ids
    this.projectHash = null; // hash to identify the project
    this.metadata = {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectPath: null,
    };
  }

  addNode(id, data) {
    this.nodes.set(id, data);
    if (!this.edges.has(id)) {
      this.edges.set(id, new Set());
    }
    if (!this.reverseEdges.has(id)) {
      this.reverseEdges.set(id, new Set());
    }
    
    // Add to file index
    const fileNodes = this.fileIndex.get(data.file) || new Set();
    fileNodes.add(id);
    this.fileIndex.set(data.file, fileNodes);
  }

  addEdge(from, to, type) {
    if (!this.edges.has(from)) {
      this.edges.set(from, new Set());
    }
    if (!this.reverseEdges.has(to)) {
      this.reverseEdges.set(to, new Set());
    }
    
    this.edges.get(from).add({ to, type });
    this.reverseEdges.get(to).add({ from, type });
  }

  getConnections(id, direction = 'both', depth = 1) {
    const visited = new Set();
    const result = [];
    
    const traverse = (nodeId, currentDepth) => {
      if (currentDepth > depth || visited.has(nodeId)) return;
      visited.add(nodeId);
      
      if (direction === 'outgoing' || direction === 'both') {
        const edges = this.edges.get(nodeId) || new Set();
        for (const edge of edges) {
          result.push({
            from: nodeId,
            to: edge.to,
            type: edge.type,
            fromData: this.nodes.get(nodeId),
            toData: this.nodes.get(edge.to),
          });
          traverse(edge.to, currentDepth + 1);
        }
      }
      
      if (direction === 'incoming' || direction === 'both') {
        const reverseEdges = this.reverseEdges.get(nodeId) || new Set();
        for (const edge of reverseEdges) {
          result.push({
            from: edge.from,
            to: nodeId,
            type: edge.type,
            fromData: this.nodes.get(edge.from),
            toData: this.nodes.get(nodeId),
          });
          traverse(edge.from, currentDepth + 1);
        }
      }
    };
    
    traverse(id, 0);
    return result;
  }

  searchNodes(query, type = null) {
    const results = [];
    const lowerQuery = query.toLowerCase();
    
    for (const [id, node] of this.nodes) {
      if (type && node.type !== type) continue;
      
      const nameMatch = node.name.toLowerCase().includes(lowerQuery);
      const fileMatch = node.file.toLowerCase().includes(lowerQuery);
      
      if (nameMatch || fileMatch) {
        results.push({ id, ...node, score: nameMatch ? 2 : 1 });
      }
    }
    
    return results.sort((a, b) => b.score - a.score);
  }

  // Serialize graph to JSON
  toJSON() {
    const edgesArray = [];
    for (const [from, edges] of this.edges) {
      for (const edge of edges) {
        edgesArray.push({ from, ...edge });
      }
    }

    return {
      metadata: this.metadata,
      projectHash: this.projectHash,
      nodes: Array.from(this.nodes.entries()).map(([id, data]) => ({ id, ...data })),
      edges: edgesArray,
      fileIndex: Array.from(this.fileIndex.entries()).map(([file, ids]) => ({
        file,
        nodeIds: Array.from(ids),
      })),
    };
  }

  // Load graph from JSON
  static fromJSON(data) {
    const graph = new CodeGraph();
    graph.metadata = data.metadata || {};
    graph.projectHash = data.projectHash;

    // Load nodes
    for (const node of data.nodes || []) {
      const { id, ...nodeData } = node;
      graph.nodes.set(id, nodeData);
      if (!graph.edges.has(id)) {
        graph.edges.set(id, new Set());
      }
      if (!graph.reverseEdges.has(id)) {
        graph.reverseEdges.set(id, new Set());
      }
    }

    // Load edges
    for (const edge of data.edges || []) {
      const { from, ...edgeData } = edge;
      if (!graph.edges.has(from)) {
        graph.edges.set(from, new Set());
      }
      graph.edges.get(from).add(edgeData);
      
      if (!graph.reverseEdges.has(edgeData.to)) {
        graph.reverseEdges.set(edgeData.to, new Set());
      }
      graph.reverseEdges.get(edgeData.to).add({ from, type: edgeData.type });
    }

    // Load file index
    for (const entry of data.fileIndex || []) {
      graph.fileIndex.set(entry.file, new Set(entry.nodeIds));
    }

    return graph;
  }
}

// Global graph instance
let codeGraph = new CodeGraph();

// Generate hash for project identification
function generateProjectHash(projectPath) {
  return crypto.createHash('md5').update(projectPath).digest('hex');
}

// Ensure db directory exists
async function ensureDbDirectory() {
  try {
    await fs.access(config.dbPath);
  } catch {
    await fs.mkdir(config.dbPath, { recursive: true });
  }
}

// Save graph to disk
async function saveGraph(projectPath) {
  await ensureDbDirectory();
  
  const hash = generateProjectHash(projectPath);
  const filename = `graph_${hash}.json`;
  const filepath = path.join(config.dbPath, filename);
  
  codeGraph.projectHash = hash;
  codeGraph.metadata.updatedAt = new Date().toISOString();
  codeGraph.metadata.projectPath = projectPath;
  
  const data = JSON.stringify(codeGraph.toJSON(), null, 2);
  await fs.writeFile(filepath, data, 'utf-8');
  
  console.error(`Graph saved to ${filepath}`);
  return filepath;
}

// Load graph from disk
async function loadGraph(projectPath) {
  await ensureDbDirectory();
  
  const hash = generateProjectHash(projectPath);
  const filename = `graph_${hash}.json`;
  const filepath = path.join(config.dbPath, filename);
  
  try {
    const data = await fs.readFile(filepath, 'utf-8');
    codeGraph = CodeGraph.fromJSON(JSON.parse(data));
    console.error(`Graph loaded from ${filepath}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`No cached graph found for ${projectPath}`);
      return false;
    }
    console.error(`Error loading graph: ${error.message}`);
    return false;
  }
}

// Delete cached graph
async function deleteGraph(projectPath) {
  await ensureDbDirectory();
  
  const hash = generateProjectHash(projectPath);
  const filename = `graph_${hash}.json`;
  const filepath = path.join(config.dbPath, filename);
  
  try {
    await fs.unlink(filepath);
    console.error(`Graph deleted: ${filepath}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

// List all cached graphs
async function listCachedGraphs() {
  await ensureDbDirectory();
  
  const files = await fs.readdir(config.dbPath);
  const graphs = [];
  
  for (const file of files) {
    if (file.startsWith('graph_') && file.endsWith('.json')) {
      try {
        const filepath = path.join(config.dbPath, file);
        const data = await fs.readFile(filepath, 'utf-8');
        const graph = JSON.parse(data);
        
        graphs.push({
          file,
          projectPath: graph.metadata?.projectPath,
          createdAt: graph.metadata?.createdAt,
          updatedAt: graph.metadata?.updatedAt,
          nodeCount: graph.nodes?.length || 0,
          edgeCount: graph.edges?.length || 0,
        });
      } catch (error) {
        console.error(`Error reading ${file}: ${error.message}`);
      }
    }
  }
  
  return graphs;
}

// Parse JavaScript/TypeScript file and extract symbols
async function parseJavaScriptFile(filepath, content) {
  const symbols = [];
  
  try {
    const ast = parser.parse(content, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'decorators-legacy',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'dynamicImport',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
      errorRecovery: true,
    });
    
    const imports = [];
    const exports = [];
    
    traverse.default(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        path.node.specifiers.forEach(spec => {
          let importedName = '';
          let localName = '';
          
          if (spec.type === 'ImportDefaultSpecifier') {
            importedName = 'default';
            localName = spec.local.name;
          } else if (spec.type === 'ImportSpecifier') {
            importedName = spec.imported.name;
            localName = spec.local.name;
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            importedName = '*';
            localName = spec.local.name;
          }
          
          imports.push({
            source,
            imported: importedName,
            local: localName,
            line: path.node.loc?.start.line,
          });
        });
      },
      
      FunctionDeclaration(path) {
        if (path.node.id) {
          symbols.push({
            type: 'function',
            name: path.node.id.name,
            file: filepath,
            line: path.node.loc?.start.line,
            params: path.node.params.map(p => p.type),
            async: path.node.async,
            generator: path.node.generator,
          });
        }
      },
      
      ClassDeclaration(path) {
        if (path.node.id) {
          const methods = [];
          const properties = [];
          
          path.node.body.body.forEach(member => {
            if (member.type === 'ClassMethod') {
              methods.push({
                name: member.key.name,
                kind: member.kind,
                static: member.static,
              });
            } else if (member.type === 'ClassProperty') {
              properties.push({
                name: member.key.name,
                static: member.static,
              });
            }
          });
          
          symbols.push({
            type: 'class',
            name: path.node.id.name,
            file: filepath,
            line: path.node.loc?.start.line,
            extends: path.node.superClass?.name,
            methods,
            properties,
          });
        }
      },
      
      VariableDeclaration(path) {
        path.node.declarations.forEach(decl => {
          if (decl.id.type === 'Identifier') {
            symbols.push({
              type: 'variable',
              name: decl.id.name,
              file: filepath,
              line: path.node.loc?.start.line,
              kind: path.node.kind,
            });
          }
        });
      },
      
      ExportNamedDeclaration(path) {
        if (path.node.declaration) {
          // Handled by other visitors
        } else if (path.node.specifiers) {
          path.node.specifiers.forEach(spec => {
            exports.push({
              exported: spec.exported.name,
              local: spec.local?.name,
              line: path.node.loc?.start.line,
            });
          });
        }
      },
      
      ExportDefaultDeclaration(path) {
        exports.push({
          exported: 'default',
          line: path.node.loc?.start.line,
        });
      },
      
      CallExpression(path) {
        if (path.node.callee.type === 'Identifier') {
          symbols.push({
            type: 'call',
            name: path.node.callee.name,
            file: filepath,
            line: path.node.loc?.start.line,
            arguments: path.node.arguments.length,
          });
        } else if (path.node.callee.type === 'MemberExpression') {
          const object = path.node.callee.object.name;
          const property = path.node.callee.property.name;
          if (object && property) {
            symbols.push({
              type: 'call',
              name: `${object}.${property}`,
              file: filepath,
              line: path.node.loc?.start.line,
              arguments: path.node.arguments.length,
            });
          }
        }
      },
    });
    
    return { symbols, imports, exports };
  } catch (error) {
    console.error(`Error parsing ${filepath}: ${error.message}`);
    return { symbols: [], imports: [], exports: [] };
  }
}

// Build code graph from directory
async function buildCodeGraph(rootPath) {
  codeGraph = new CodeGraph();
  
  // Find all supported files
  const patterns = config.supportedExtensions.map(ext => `**/*${ext}`);
  const ignorePatterns = config.ignorePaths.map(p => `**/${p}/**`);
  
  const files = await glob(patterns, {
    cwd: rootPath,
    ignore: ignorePatterns,
    absolute: false,
  });
  
  const fileData = new Map();
  
  // Parse all files
  for (const file of files) {
    const fullPath = path.join(rootPath, file);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const stats = await fs.stat(fullPath);
      
      if (stats.size > config.maxFileSize) {
        console.error(`Skipping ${file}: exceeds maximum file size`);
        continue;
      }
      
      const parsed = await parseJavaScriptFile(file, content);
      fileData.set(file, parsed);
      
      // Add symbols to graph
      for (const symbol of parsed.symbols) {
        if (symbol.type !== 'call') {
          const nodeId = `${file}:${symbol.name}:${symbol.line}`;
          codeGraph.addNode(nodeId, symbol);
        }
      }
    } catch (error) {
      console.error(`Error processing ${file}: ${error.message}`);
    }
  }
  
  // Build relationships
  for (const [file, data] of fileData) {
    // Connect imports to exports
    for (const imp of data.imports) {
      let resolvedPath = imp.source;
      
      // Resolve relative imports
      if (imp.source.startsWith('.')) {
        const dir = path.dirname(file);
        resolvedPath = path.join(dir, imp.source);
        resolvedPath = resolvedPath.replace(/\\/g, '/');
        
        // Try to find the actual file
        const possibleFiles = [
          resolvedPath + '.js',
          resolvedPath + '.ts',
          resolvedPath + '.jsx',
          resolvedPath + '.tsx',
          resolvedPath + '/index.js',
          resolvedPath + '/index.ts',
        ];
        
        for (const possibleFile of possibleFiles) {
          const normalizedPath = possibleFile.replace(/^\.\//, '');
          if (fileData.has(normalizedPath)) {
            // Find exported symbol
            const targetData = fileData.get(normalizedPath);
            for (const symbol of targetData.symbols) {
              if (symbol.name === imp.local || 
                  (imp.imported === 'default' && targetData.exports.some(e => e.exported === 'default'))) {
                const fromId = `${file}:import:${imp.line}`;
                const toId = `${normalizedPath}:${symbol.name}:${symbol.line}`;
                
                if (codeGraph.nodes.has(toId)) {
                  codeGraph.addEdge(fromId, toId, 'imports');
                }
              }
            }
            break;
          }
        }
      }
    }
    
    // Connect function calls
    for (const symbol of data.symbols) {
      if (symbol.type === 'call') {
        const callerId = `${file}:${symbol.line}`;
        
        // Find function definition
        for (const [otherFile, otherData] of fileData) {
          for (const otherSymbol of otherData.symbols) {
            if (otherSymbol.type === 'function' && otherSymbol.name === symbol.name) {
              const targetId = `${otherFile}:${otherSymbol.name}:${otherSymbol.line}`;
              if (codeGraph.nodes.has(targetId)) {
                codeGraph.addEdge(callerId, targetId, 'calls');
              }
            }
          }
        }
      }
    }
    
    // Connect class inheritance
    for (const symbol of data.symbols) {
      if (symbol.type === 'class' && symbol.extends) {
        const classId = `${file}:${symbol.name}:${symbol.line}`;
        
        // Find parent class
        for (const [otherFile, otherData] of fileData) {
          for (const otherSymbol of otherData.symbols) {
            if (otherSymbol.type === 'class' && otherSymbol.name === symbol.extends) {
              const parentId = `${otherFile}:${otherSymbol.name}:${otherSymbol.line}`;
              if (codeGraph.nodes.has(parentId)) {
                codeGraph.addEdge(classId, parentId, 'extends');
              }
            }
          }
        }
      }
    }
  }
  
  // Save graph to disk
  await saveGraph(rootPath);
  
  return {
    nodeCount: codeGraph.nodes.size,
    edgeCount: Array.from(codeGraph.edges.values()).reduce((sum, set) => sum + set.size, 0),
    fileCount: files.length,
    cached: true,
  };
}

// Create MCP server
const server = new Server(
  {
    name: 'code-graph',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'analyze_project',
        description: 'Analyze a project and build code graph (saves to cache)',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Root path of the project to analyze',
            },
            force: {
              type: 'boolean',
              description: 'Force re-analysis even if cache exists (default: false)',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'load_cached_graph',
        description: 'Load a previously analyzed project from cache',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Root path of the project',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'clear_cache',
        description: 'Clear cached graph for a project',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Root path of the project (optional, clears all if not provided)',
            },
          },
        },
      },
      {
        name: 'list_cached_projects',
        description: 'List all cached project graphs',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'find_symbol',
        description: 'Find symbols (functions, classes, variables) by name',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Symbol name or partial name to search',
            },
            type: {
              type: 'string',
              description: 'Symbol type filter (function, class, variable)',
              enum: ['function', 'class', 'variable'],
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_dependencies',
        description: 'Get dependencies of a symbol (what it uses)',
        inputSchema: {
          type: 'object',
          properties: {
            symbolId: {
              type: 'string',
              description: 'Symbol ID from find_symbol result',
            },
            depth: {
              type: 'number',
              description: 'Depth of dependency traversal (default: 1)',
            },
          },
          required: ['symbolId'],
        },
      },
      {
        name: 'get_dependents',
        description: 'Get dependents of a symbol (what uses it)',
        inputSchema: {
          type: 'object',
          properties: {
            symbolId: {
              type: 'string',
              description: 'Symbol ID from find_symbol result',
            },
            depth: {
              type: 'number',
              description: 'Depth of dependent traversal (default: 1)',
            },
          },
          required: ['symbolId'],
        },
      },
      {
        name: 'get_call_graph',
        description: 'Get call graph for a function',
        inputSchema: {
          type: 'object',
          properties: {
            functionName: {
              type: 'string',
              description: 'Function name to analyze',
            },
            depth: {
              type: 'number',
              description: 'Call graph depth (default: 2)',
            },
          },
          required: ['functionName'],
        },
      },
      {
        name: 'get_file_symbols',
        description: 'Get all symbols defined in a file',
        inputSchema: {
          type: 'object',
          properties: {
            filepath: {
              type: 'string',
              description: 'File path relative to project root',
            },
          },
          required: ['filepath'],
        },
      },
      {
        name: 'get_graph_stats',
        description: 'Get statistics about the code graph',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'analyze_project': {
        const { path: projectPath, force = false } = args;
        
        // Try to load from cache if not forced
        if (!force) {
          const loaded = await loadGraph(projectPath);
          if (loaded) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: 'Project loaded from cache',
                    stats: {
                      nodeCount: codeGraph.nodes.size,
                      edgeCount: Array.from(codeGraph.edges.values()).reduce((sum, set) => sum + set.size, 0),
                      cached: true,
                      metadata: codeGraph.metadata,
                    },
                  }, null, 2),
                },
              ],
            };
          }
        }
        
        const stats = await buildCodeGraph(projectPath);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Project analyzed and cached successfully',
                stats,
              }, null, 2),
            },
          ],
        };
      }
      
      case 'load_cached_graph': {
        const { path: projectPath } = args;
        const loaded = await loadGraph(projectPath);
        
        if (!loaded) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  message: 'No cached graph found for this project',
                }, null, 2),
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Graph loaded from cache',
                stats: {
                  nodeCount: codeGraph.nodes.size,
                  edgeCount: Array.from(codeGraph.edges.values()).reduce((sum, set) => sum + set.size, 0),
                  metadata: codeGraph.metadata,
                },
              }, null, 2),
            },
          ],
        };
      }
      
      case 'clear_cache': {
        const { path: projectPath } = args;
        
        if (projectPath) {
          const deleted = await deleteGraph(projectPath);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: deleted,
                  message: deleted ? 'Cache cleared for project' : 'No cache found for project',
                }, null, 2),
              },
            ],
          };
        } else {
          // Clear all caches
          const graphs = await listCachedGraphs();
          let deletedCount = 0;
          
          for (const graph of graphs) {
            if (graph.projectPath) {
              const deleted = await deleteGraph(graph.projectPath);
              if (deleted) deletedCount++;
            }
          }
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Cleared ${deletedCount} cached graphs`,
                }, null, 2),
              },
            ],
          };
        }
      }
      
      case 'list_cached_projects': {
        const graphs = await listCachedGraphs();
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                count: graphs.length,
                cachedGraphs: graphs,
              }, null, 2),
            },
          ],
        };
      }
      
      case 'find_symbol': {
        const { query, type } = args;
        const results = codeGraph.searchNodes(query, type);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query,
                type: type || 'all',
                count: results.length,
                symbols: results.slice(0, 50), // Limit to 50 results
              }, null, 2),
            },
          ],
        };
      }
      
      case 'get_dependencies': {
        const { symbolId, depth = 1 } = args;
        const connections = codeGraph.getConnections(symbolId, 'outgoing', depth);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                symbolId,
                depth,
                dependencies: connections,
              }, null, 2),
            },
          ],
        };
      }
      
      case 'get_dependents': {
        const { symbolId, depth = 1 } = args;
        const connections = codeGraph.getConnections(symbolId, 'incoming', depth);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                symbolId,
                depth,
                dependents: connections,
              }, null, 2),
            },
          ],
        };
      }
      
      case 'get_call_graph': {
        const { functionName, depth = 2 } = args;
        const functions = codeGraph.searchNodes(functionName, 'function');
        
        if (functions.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Function not found',
                }, null, 2),
              },
            ],
          };
        }
        
        const callGraph = {};
        for (const func of functions.slice(0, 5)) {
          const connections = codeGraph.getConnections(func.id, 'both', depth);
          callGraph[func.id] = {
            function: func,
            connections: connections.filter(c => c.type === 'calls'),
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                functionName,
                depth,
                callGraph,
              }, null, 2),
            },
          ],
        };
      }
      
      case 'get_file_symbols': {
        const { filepath } = args;
        const nodeIds = codeGraph.fileIndex.get(filepath) || new Set();
        const symbols = [];
        
        for (const id of nodeIds) {
          const node = codeGraph.nodes.get(id);
          if (node) {
            symbols.push({ id, ...node });
          }
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                filepath,
                symbolCount: symbols.length,
                symbols: symbols.sort((a, b) => (a.line || 0) - (b.line || 0)),
              }, null, 2),
            },
          ],
        };
      }
      
      case 'get_graph_stats': {
        const typeCount = {};
        const fileCount = codeGraph.fileIndex.size;
        
        for (const node of codeGraph.nodes.values()) {
          typeCount[node.type] = (typeCount[node.type] || 0) + 1;
        }
        
        const edgeTypeCount = {};
        for (const edges of codeGraph.edges.values()) {
          for (const edge of edges) {
            edgeTypeCount[edge.type] = (edgeTypeCount[edge.type] || 0) + 1;
          }
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                totalNodes: codeGraph.nodes.size,
                totalEdges: Array.from(codeGraph.edges.values()).reduce((sum, set) => sum + set.size, 0),
                fileCount,
                nodeTypes: typeCount,
                edgeTypes: edgeTypeCount,
              }, null, 2),
            },
          ],
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
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

// Start the server
async function main() {
  try {
    console.error('Starting Code Graph MCP Server...');
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('Code Graph MCP Server running on stdio');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch(console.error);