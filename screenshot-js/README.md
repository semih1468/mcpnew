# MCP Screenshot Server - Plain JavaScript

A powerful Model Context Protocol (MCP) server for automated screenshot capture that Claude Code can use to take screenshots automatically and continue working with them.

## ✅ Features

- **🚀 No Build Process** - Direct execution with Node.js  
- **📸 Automated Screenshots** - Take screenshots on demand or automatically
- **⏰ Auto-Capture Mode** - Schedule screenshots at regular intervals
- **🖥️ Multi-Monitor Support** - Capture from specific displays
- **🎯 Area Selection** - Capture specific regions
- **💾 Smart Storage** - Automatic file management with cleanup
- **🔍 Image Analysis** - Claude can analyze screenshots as base64
- **📊 Statistics** - Operation logs and storage stats

## Quick Start

### 1. Installation

```bash
cd C:/xampp/htdocs/mcp/screenshot-js
npm install
```

### 2. Configuration

Edit `.env` for your setup:

```env
# Auto Capture (Claude can start/stop this)
AUTO_CAPTURE_ENABLED=false
AUTO_CAPTURE_INTERVAL=30000    # 30 seconds

# Screenshot Settings
SCREENSHOT_FORMAT=png
SCREENSHOT_QUALITY=90
SCREENSHOT_PATH=./screenshots

# Permissions
ALLOW_DELETE=true
ALLOW_AUTO_CAPTURE=true
```

### 3. Run Server

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

## Claude Desktop Integration

Add to your Claude Desktop config:

**Windows**: `%APPDATA%\\Claude\\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "screenshot": {
      "command": "node",
      "args": ["C:/xampp/htdocs/mcp/screenshot-js/src/index.js"],
      "env": {
        "AUTO_CAPTURE_ENABLED": "true",
        "AUTO_CAPTURE_INTERVAL": "30000"
      }
    }
  }
}
```

## 🛠️ Available Tools

### Core Screenshot Operations

#### `screenshot_capture` - Take Screenshot
```javascript
// Basic screenshot
{
  "monitor": 0,
  "format": "png", 
  "quality": 90,
  "saveToFile": true
}

// Area screenshot
{
  "area": {
    "x": 100,
    "y": 100, 
    "width": 800,
    "height": 600
  }
}
```

#### `screenshot_auto` - Auto Capture Control
```javascript
// Start auto capture (Claude Code can use this)
{
  "action": "start",
  "interval": 30000  // 30 seconds
}

// Stop auto capture  
{
  "action": "stop"
}

// Check status
{
  "action": "status"
}
```

#### `screenshot_view` - View Screenshot
```javascript
// Get latest screenshot for analysis
{
  "latest": true
}

// Get specific screenshot
{
  "filename": "screenshot_2024_01_15_143022.png"
}
```

### Management Tools

#### `screenshot_list` - List Screenshots
```javascript
{
  "limit": 20,
  "sortBy": "created",  // created, modified, size, filename
  "order": "desc"       // asc, desc
}
```

#### `screenshot_delete` - Delete Screenshots
```javascript
// Delete specific file
{
  "filename": "screenshot_2024_01_15_143022.png"
}

// Delete multiple files
{
  "filenames": ["file1.png", "file2.png"]
}

// Delete old screenshots
{
  "olderThanDays": 7
}
```

#### `screenshot_displays` - Display Info
```javascript
// Get available monitors
{}
```

#### `screenshot_stats` - Server Statistics  
```javascript
// Get server stats and status
{}
```

## 🤖 Claude Code Automation

### Typical Workflow:

1. **Claude starts auto-capture**:
```javascript
await screenshot_auto({
  action: "start", 
  interval: 30000
})
```

2. **Claude continues working** while screenshots are taken automatically

3. **Claude analyzes latest screenshot**:
```javascript  
await screenshot_view({
  latest: true
})
```

4. **Claude can see what's happening** and adapt its work

5. **Claude stops auto-capture when done**:
```javascript
await screenshot_auto({
  action: "stop"
})
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SCREENSHOT_FORMAT` | Image format (png, jpeg) | `png` |
| `SCREENSHOT_QUALITY` | Image quality (1-100) | `90` |
| `SCREENSHOT_PATH` | Storage directory | `./screenshots` |
| `SCREENSHOT_PREFIX` | Filename prefix | `screenshot` |
| | | |
| `AUTO_CAPTURE_ENABLED` | Enable auto capture on startup | `false` |
| `AUTO_CAPTURE_INTERVAL` | Interval in milliseconds | `30000` |
| `AUTO_CAPTURE_MAX_FILES` | Max auto-captured files | `100` |
| `AUTO_CAPTURE_MONITOR` | Default monitor for auto | `0` |
| | | |
| `DEFAULT_MONITOR` | Default monitor to capture | `0` |
| `CAPTURE_CURSOR` | Include cursor in screenshot | `false` |
| | | |
| `MAX_STORAGE_SIZE_MB` | Max storage size | `500` |
| `CLEANUP_OLDER_THAN_DAYS` | Auto cleanup days | `7` |
| `ALLOW_DELETE` | Enable delete operations | `true` |
| | | |
| `ALLOW_AUTO_CAPTURE` | Allow auto capture control | `true` |
| `ALLOW_AREA_CAPTURE` | Allow area selection | `true` |
| `ALLOW_WINDOW_CAPTURE` | Allow window capture | `true` |
| | | |
| `LOG_LEVEL` | Logging level | `info` |
| `LOG_OPERATIONS` | Log all operations | `true` |

## 📊 Resources

The server provides MCP resources for monitoring:

- `screenshot://status` - Server status and statistics
- `screenshot://operations` - Recent operation logs  
- `screenshot://config` - Server configuration
- `screenshot://storage` - Storage usage statistics

## Project Structure

```
screenshot-js/
├── src/
│   ├── index.js              # Main server (direct execution)
│   ├── handlers/
│   │   ├── capture.js        # Screenshot capture
│   │   ├── list.js           # List screenshots
│   │   ├── view.js           # View screenshots  
│   │   └── delete.js         # Delete screenshots
│   └── utils/
│       ├── screenshotter.js  # Screenshot engine
│       ├── storage.js        # File management
│       └── logger.js         # Logging utilities
├── screenshots/              # Screenshot storage
├── package.json              # No build needed!
└── .env                      # Configuration
```

## 🎯 Usage Examples

### Manual Screenshots

```javascript
// Take a quick screenshot
await screenshot_capture({
  format: "png",
  saveToFile: true
})

// Capture specific area
await screenshot_capture({
  area: {
    x: 0, y: 0,
    width: 1920, height: 1080
  }
})

// Multi-monitor capture
await screenshot_capture({
  monitor: 1,
  format: "jpeg",
  quality: 80
})
```

### Automated Workflow

```javascript
// Start auto capture for monitoring
await screenshot_auto({
  action: "start",
  interval: 60000  // Every minute
})

// Later... check what's happening
const latest = await screenshot_view({
  latest: true
})

// Analyze the screenshot (Claude gets base64 automatically)
// Claude can see the current state and continue working

// Stop when done
await screenshot_auto({ action: "stop" })
```

### Management

```javascript  
// See recent screenshots
await screenshot_list({
  limit: 10,
  sortBy: "created"
})

// Clean up old files
await screenshot_delete({
  olderThanDays: 3
})

// Check storage usage
await screenshot_stats()
```

## 🔧 Troubleshooting

### Permission Issues
```bash
# Windows: Run as Administrator if needed
# Check screenshot permissions

# Test manual capture first
await screenshot_capture({ saveToFile: false })
```

### Storage Issues  
```bash
# Check storage stats
await screenshot_stats()

# Clean up space
await screenshot_delete({ olderThanDays: 1 })
```

### Auto Capture Not Working
```env
# Check environment
AUTO_CAPTURE_ENABLED=true
ALLOW_AUTO_CAPTURE=true

# Check logs
LOG_LEVEL=debug
```

## Dependencies

Only 4 runtime dependencies:
```json
{
  "@modelcontextprotocol/sdk": "^0.4.0",
  "screenshot-desktop": "^1.15.0", 
  "sharp": "^0.33.0",
  "dotenv": "^16.4.7"
}
```

## Performance

- **Fast Capture**: ~200-500ms per screenshot
- **Efficient Storage**: Automatic cleanup and compression
- **Low Memory**: Streams large images
- **Cross-Platform**: Windows, Mac, Linux

## Security

- **Path Validation**: Prevents directory traversal
- **File Type Validation**: Only image files
- **Size Limits**: Configurable storage limits
- **Permission Controls**: Environment-controlled operations

## Use Cases

1. **Development Monitoring**: Screenshot during builds/tests
2. **UI Testing**: Automated visual regression testing  
3. **Documentation**: Auto-capture for tutorials
4. **Debugging**: Visual debugging of applications
5. **Monitoring**: Watch applications over time

## Claude Code Benefits

- ✅ **Automatic Operation**: No user interaction needed
- ✅ **Visual Context**: Claude can see what's happening
- ✅ **Continuous Workflow**: Take screenshots while working
- ✅ **Smart Analysis**: Base64 images for immediate analysis
- ✅ **Background Operation**: Non-blocking auto capture

## License

MIT License

---

**Ready to use immediately - no build step required! 🚀**

Claude Code can now automatically take screenshots and continue working with visual context.