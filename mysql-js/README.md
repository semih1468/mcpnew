# MCP MySQL Server - Plain JavaScript

A secure and lightweight Model Context Protocol (MCP) server for MySQL databases written in pure JavaScript (no TypeScript, no build process).

## ✅ Features

- **🚀 No Build Process** - Direct execution with Node.js
- **🔐 Environment-Controlled Operations** - Configure which SQL operations are allowed via .env
- **🛡️ Security First** - SQL injection protection, query validation, prepared statements
- **📊 Audit Logging** - Complete logging of all database operations 
- **⚡ Transaction Support** - Automatic rollback on errors
- **🔍 Schema Inspection** - Database and table schema information
- **🏊 Connection Pooling** - Efficient MySQL connection management

## Quick Start

### 1. Installation

```bash
cd C:/xampp/htdocs/mcp/mysql-js
npm install
```

### 2. Environment Configuration

Copy and configure the environment file:

```bash
cp .env.example .env
```

Edit `.env` for your MySQL setup:

```env
# MySQL Database
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=test

# Operation Permissions (Environment Controlled)
ALLOW_DELETE_OPERATIONS=false  # DELETE disabled by default
ALLOW_UPDATE_OPERATIONS=false  # UPDATE disabled by default  
ALLOW_INSERT_OPERATIONS=true   # INSERT enabled

# Limits
MAX_QUERY_LIMIT=1000
QUERY_TIMEOUT_MS=30000
```

### 3. Run Server

```bash
# Production
npm start

# Development (with auto-restart)
npm run dev
```

## Claude Desktop Integration

Add to your Claude Desktop config:

**Windows**: `%APPDATA%\\Claude\\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mysql-js": {
      "command": "node",
      "args": ["C:/xampp/htdocs/mcp/mysql-js/src/index.js"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "",
        "MYSQL_DATABASE": "test",
        "ALLOW_DELETE_OPERATIONS": "false",
        "ALLOW_UPDATE_OPERATIONS": "false",
        "ALLOW_INSERT_OPERATIONS": "true"
      }
    }
  }
}
```

## Available Tools

### Core Operations

#### `mysql_query` - Execute SQL
```javascript
{
  "sql": "SELECT * FROM users WHERE active = ?",
  "parameters": [true],
  "limit": 100
}
```

#### `mysql_schema` - Table Schema
```javascript
{
  "table": "users"
}
```

#### `mysql_tables` - List Tables
```javascript
{
  "database": "my_database"  // optional
}
```

### Write Operations (Environment Controlled)

#### `mysql_insert` *(requires `ALLOW_INSERT_OPERATIONS=true`)*
```javascript
{
  "table": "users",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "active": true
  }
}
```

#### `mysql_update` *(requires `ALLOW_UPDATE_OPERATIONS=true`)*
```javascript
{
  "table": "users",
  "data": {
    "last_login": "2024-01-01 12:00:00"
  },
  "where": {
    "id": 123
  }
}
```

#### `mysql_delete` *(requires `ALLOW_DELETE_OPERATIONS=true`)*
```javascript
{
  "table": "users",
  "where": {
    "active": false
  }
}
```

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MYSQL_HOST` | MySQL hostname | `localhost` | Yes |
| `MYSQL_PORT` | MySQL port | `3306` | No |
| `MYSQL_USER` | Database user | `root` | Yes |
| `MYSQL_PASSWORD` | Database password | *(empty)* | No |
| `MYSQL_DATABASE` | Target database | `test` | Yes |
| | | | |
| `ALLOW_DELETE_OPERATIONS` | Enable DELETE | `false` | No |
| `ALLOW_UPDATE_OPERATIONS` | Enable UPDATE | `false` | No |
| `ALLOW_INSERT_OPERATIONS` | Enable INSERT | `true` | No |
| | | | |
| `MAX_QUERY_LIMIT` | Max rows per query | `1000` | No |
| `QUERY_TIMEOUT_MS` | Query timeout | `30000` | No |
| `MAX_CONNECTIONS` | Connection pool size | `10` | No |
| | | | |
| `ENABLE_QUERY_VALIDATION` | Enable validation | `true` | No |
| `READONLY_MODE` | Only SELECT queries | `false` | No |
| `LOG_LEVEL` | Logging level | `info` | No |

## Security Features

### 🔒 Environment-Controlled Permissions
```env
ALLOW_DELETE_OPERATIONS=false  # DELETE completely disabled
ALLOW_UPDATE_OPERATIONS=false  # UPDATE completely disabled
```

### 🛡️ SQL Injection Protection
- All queries use prepared statements
- Input validation and sanitization
- Dangerous pattern detection
- Multiple statement prevention

### 📋 Audit Trail
- Complete operation logging
- Execution time tracking
- Before/after data snapshots
- Error tracking

## Project Structure (No Build Required)

```
mysql-js/
├── src/
│   ├── index.js              # Main server (run directly)
│   ├── database/
│   │   ├── connection.js     # MySQL connection pool
│   │   └── validator.js      # Query validation
│   ├── handlers/
│   │   ├── schema.js         # Schema operations
│   │   ├── select.js         # SELECT handler
│   │   ├── insert.js         # INSERT handler
│   │   ├── update.js         # UPDATE handler  
│   │   └── delete.js         # DELETE handler
│   └── utils/
│       └── logger.js         # Simple logging
├── package.json              # No build scripts needed
├── .env                      # Configuration
└── README.md
```

## Usage Examples

### Safe SELECT Operations
Always available, no environment restrictions:
```javascript
// Direct SQL
{
  "sql": "SELECT id, name, email FROM users WHERE created_at > ?",
  "parameters": ["2024-01-01"],
  "limit": 50
}

// Table query builder
{
  "table": "users",
  "columns": ["id", "name", "email"],
  "where": {
    "active": true,
    "age": {"operator": ">", "value": 18}
  },
  "orderBy": {"created_at": "DESC"},
  "limit": 25
}
```

### Environment-Controlled Operations

These operations require explicit environment permission:

```javascript
// INSERT (needs ALLOW_INSERT_OPERATIONS=true)
{
  "table": "users",
  "data": {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "active": true
  }
}

// UPDATE (needs ALLOW_UPDATE_OPERATIONS=true)
{
  "table": "users", 
  "data": {"last_login": "2024-01-15 10:30:00"},
  "where": {"email": "jane@example.com"}
}

// DELETE (needs ALLOW_DELETE_OPERATIONS=true)
{
  "table": "users",
  "where": {"active": false}
}
```

### Advanced WHERE Conditions
```javascript
{
  "where": {
    "status": "active",                           // Simple equality
    "age": {"operator": ">", "value": 18},        // Comparison
    "category": ["A", "B", "C"],                  // IN clause
    "deleted_at": null                            // IS NULL
  }
}
```

## Resources

The server provides MCP resources for monitoring:

- `mysql://connection/status` - Connection status and config
- `mysql://audit/logs` - Recent operation audit logs  
- `mysql://config/permissions` - Current permissions

## Error Handling

All errors include detailed information:

- **ValidationError**: Input validation failures
- **PermissionError**: Operation not allowed by environment
- **Database errors**: MySQL connection/query issues

## Troubleshooting

### Connection Issues
```bash
# Test MySQL connection
mysql -h localhost -u root -p

# Check server logs
npm start
# Look for connection status in console
```

### Permission Issues
```bash
# Enable operations in .env
ALLOW_INSERT_OPERATIONS=true
ALLOW_UPDATE_OPERATIONS=true  
ALLOW_DELETE_OPERATIONS=true

# Restart server
npm start
```

### Debug Mode
```env
LOG_LEVEL=debug
```

## Why Plain JavaScript?

- ✅ **No Build Process** - Direct `node src/index.js` execution
- ✅ **Simple Development** - Edit and run immediately  
- ✅ **Easy Debugging** - Standard Node.js debugging
- ✅ **Lightweight** - Minimal dependencies
- ✅ **Same Security** - All security features preserved
- ✅ **Fast Development** - No compilation waiting

## Dependencies

Only 3 runtime dependencies:
```json
{
  "@modelcontextprotocol/sdk": "^0.4.0",
  "mysql2": "^3.11.4", 
  "dotenv": "^16.4.7"
}
```

## Available Scripts

```bash
npm start    # Run server
npm run dev  # Run with auto-reload (Node.js --watch)
```

## License

MIT License

---

**Ready to use immediately - no build step required! 🚀**