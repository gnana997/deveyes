# DevEyes

**Give AI coding assistants "eyes" to see your local development UI.**

DevEyes is a Model Context Protocol (MCP) server that captures screenshots from your local development environment and automatically optimizes them for LLM consumption. It bridges the gap between cloud-based AI tools (Bolt.new, Lovable, v0) and local development where AI assistants like Claude, Cursor, and Cline are effectively blind to UI output.

## Features

- **Smart Screenshot Capture** - Capture screenshots from any localhost URL with automatic LLM optimization
- **Auto-Compression** - Automatically resizes and compresses images to stay within Claude's limits (8000px max, 1568px optimal)
- **Viewport Presets** - Built-in presets for mobile, tablet, and desktop testing
- **Console Capture** - Captures browser console errors, warnings, and network failures
- **Multi-Browser Support** - Choose between Chromium (default), Firefox, or WebKit
- **Auto Browser Install** - Automatically installs the required browser on first run
- **Zero Configuration** - Works out of the box with sensible defaults

## Installation

```bash
npm install deveyes
```

Or run directly with npx:

```bash
npx deveyes
```

### Browser Installation

DevEyes **automatically installs** the required browser on first run. No manual setup needed!

If you prefer to pre-install or use a different browser:

```bash
# Pre-install (optional)
npx playwright install chromium

# Or install Firefox/WebKit
npx playwright install firefox
npx playwright install webkit
```

## Configuration

### Claude Desktop

Add to your Claude Desktop configuration (`~/.config/claude/claude_desktop_config.json` on macOS/Linux or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "deveyes": {
      "command": "npx",
      "args": ["deveyes"]
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "deveyes": {
      "command": "npx",
      "args": ["deveyes"]
    }
  }
}
```

### Cline

Add to your Cline MCP configuration:

```json
{
  "mcpServers": {
    "deveyes": {
      "command": "npx",
      "args": ["deveyes"]
    }
  }
}
```

### Using a Different Browser

By default, DevEyes uses Chromium. To use Firefox or WebKit:

**Via CLI argument:**
```json
{
  "mcpServers": {
    "deveyes": {
      "command": "npx",
      "args": ["deveyes", "--browser", "firefox"]
    }
  }
}
```

**Via environment variable:**
```json
{
  "mcpServers": {
    "deveyes": {
      "command": "npx",
      "args": ["deveyes"],
      "env": {
        "DEVEYES_BROWSER": "webkit"
      }
    }
  }
}
```

Supported browsers: `chromium` (default), `firefox`, `webkit`

## Usage

Once configured, your AI assistant can use the `screenshot` tool to capture your UI:

### Basic Screenshot

```
Take a screenshot of http://localhost:3000
```

### Mobile Viewport

```
Capture http://localhost:3000 with mobile viewport
```

### Full Page

```
Take a full page screenshot of http://localhost:3000/about
```

### Available Viewports

| Name | Dimensions | Device Scale | Description |
|------|------------|--------------|-------------|
| `mobile` | 375x667 | 2x | iPhone SE / Standard mobile |
| `mobile-lg` | 428x926 | 3x | iPhone 14 Pro Max |
| `tablet` | 768x1024 | 2x | iPad |
| `tablet-landscape` | 1024x768 | 2x | iPad Landscape |
| `desktop` | 1440x900 | 1x | Standard laptop |
| `desktop-lg` | 1920x1080 | 1x | Full HD monitor |
| `desktop-hd` | 2560x1440 | 1x | 2K monitor |

You can also use custom dimensions: `1280x720` or `1280x720@2x` for retina.

## Tool Reference

### `screenshot`

Capture a screenshot from any URL with automatic optimization for LLM consumption.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | Yes | - | Full URL to capture (e.g., `http://localhost:3000`) |
| `viewport` | string | No | `desktop` | Viewport preset or custom `WxH` dimensions |
| `fullPage` | boolean | No | `false` | Capture full scrollable page |
| `waitFor` | string | No | `networkIdle` | Wait condition: `networkIdle`, `domStable`, `load`, `none` |
| `waitForSelector` | string | No | - | CSS selector to wait for before capture |

**Returns:**

- Optimized JPEG image (base64)
- Metadata including:
  - Original and processed dimensions
  - Transforms applied
  - Estimated token cost
  - Console errors/warnings
  - Network errors

## Image Optimization

DevEyes automatically optimizes images to work within Claude's constraints:

| Constraint | Limit | What DevEyes Does |
|------------|-------|-------------------|
| Max dimension | 8,000 px | Resizes to 1,568 px (optimal) |
| Optimal dimension | 1,568 px | Targets this for best quality/token ratio |
| Max file size | 5 MB | Compresses to ~750 KB (for base64 overhead) |
| Token cost | (w×h)/750 | Reports estimated tokens in response |

## Development

### Setup

```bash
git clone https://github.com/gnana997/deveyes.git
cd deveyes
npm install
npx playwright install chromium
```

### Commands

```bash
# Development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run tests once
npm run test:run

# Debug with MCP Inspector
npm run inspect
```

### Testing with MCP Inspector

The MCP Inspector provides a visual interface for testing your server:

```bash
npm run inspect
```

This opens a browser UI at `http://localhost:6274` where you can:
- List available tools
- Execute the screenshot tool with different parameters
- View responses and debug issues

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP CLIENT                               │
│            (Claude Desktop / Cursor / Cline)                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ JSON-RPC over stdio
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DEVEYES MCP SERVER                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Tool      │  │   Image     │  │   Browser               │ │
│  │   Handler   │  │   Processor │  │   Manager               │ │
│  │             │  │   (Sharp)   │  │   (Playwright)          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   YOUR LOCAL DEV SERVER                         │
│                (localhost:3000, 5173, etc.)                     │
└─────────────────────────────────────────────────────────────────┘
```

## Troubleshooting

### "Browser not found" error

DevEyes automatically installs browsers, but if installation fails, manually install:

```bash
npx playwright install chromium
# or for other browsers:
npx playwright install firefox
npx playwright install webkit
```

### Screenshot times out

Increase the wait time or try a different wait strategy:

```
Take a screenshot of http://localhost:3000 with waitFor: load
```

### Image too large

DevEyes automatically optimizes images. If you're still seeing issues, the page content itself may be very large. Try:
- Using a smaller viewport
- Capturing a specific section instead of full page
- Ensuring your dev server is responding quickly

### Console not capturing errors

Make sure your page has finished loading. Use `waitFor: load` or `waitForSelector` to ensure the page is ready:

```
Screenshot http://localhost:3000 waitForSelector: #app
```

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit PRs to the main repository.

## License

MIT

## Links

- [GitHub Repository](https://github.com/gnana997/deveyes)
- [Report Issues](https://github.com/gnana997/deveyes/issues)
- [MCP Documentation](https://modelcontextprotocol.io)
