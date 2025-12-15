# DevEyes Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2025-12-16

### Added

- **Authentication Support** - Screenshots of protected pages (dashboards, admin panels, etc.)
  - New `deveyes login <url>` command - Opens headed browser for manual login, saves session cookies/localStorage
  - New `deveyes logout <url>` command - Remove saved auth for a domain
  - New `deveyes auth-list` command - List all saved authentication states
  - Auto-detection: Screenshot tool automatically loads saved auth for matching domains
  - Auth state stored per-domain in `.deveyes/auth/` directory (already gitignored)
  - Session expiration warnings when auth is older than 24 hours

- **CLI Help** - `deveyes --help` shows all available commands and options

### How It Works

1. Run `npx deveyes login http://localhost:3000`
2. Browser opens, you log in manually
3. Press Enter - auth saved to `.deveyes/auth/localhost-3000.json`
4. All future screenshots for `localhost:3000/*` automatically use saved auth

### Technical Details

- Uses Playwright's `storageState` for cross-process session persistence
- Auth files contain cookies and localStorage (portable JSON format)
- Domain matching uses `hostname:port` (e.g., `localhost-3000`, `app.example.com`)
- Response metadata includes `authenticated: { domain, used: true }` when auth is applied

### Testing

- Tested on Windows with Claude Code
- Would appreciate feedback for testing on macOS and Ubuntu
- Would appreciate feedback for testing with other AI-assisted coding tools (Cursor, Cline, Augment Code, Windsurf, etc.)

Please report any issues or feedback at: https://github.com/gnana997/deveyes/issues

## [1.0.5] - 2025-12-15

### Added

- **MCP Roots Support** - Proper workspace detection via MCP protocol
  - Server now receives workspace directories from MCP clients (Augment, Cursor, etc.)
  - Screenshots save to the correct project directory even when cwd is npm cache
  - New detection priority: ENV var → MCP Roots → Project cwd → Home fallback
  - Added `setMcpRoots()` function and `parseFileUri()` for cross-platform URI handling

### Improved

- Tool execute function now receives and passes MCP context to storage module
- Better logging showing which detection method was used for screenshot directory

## [1.0.4] - 2025-12-15

### Fixed

- **Cross-Platform Path Handling** (macOS/Linux support)
  - Fixed root path detection using `path.parse()` instead of `resolve('/')` which failed on non-Windows systems
  - Smart project root detection (walks up looking for `package.json` or `.git`)
  - Home directory fallback (`~/.deveyes/screenshots/`) when project not found or not writable
  - Permission error handling with automatic fallback to home directory

### Added

- **`DEVEYES_SCREENSHOT_DIR` environment variable** - Full control over screenshot save location

### Improved

- Better logging of detected screenshot directory for debugging
- Caching of resolved directory to avoid repeated filesystem walks

## [1.0.3] - 2025-12-15

### Added

- **Full-Page Screenshot Improvements**
  - Auto-scroll through pages to trigger lazy-loaded content (Intersection Observer, scroll animations)
  - Force CSS animation completion for accurate captures
  - Maintain minimum 800px readable width for tall pages
  - Larger file size allowance (~1.5MB) for detailed full-page captures

- **Local Screenshot Storage** (`save` parameter)
  - Save screenshots locally to `.deveyes/screenshots/` folder
  - Automatic `.gitignore` handling for git repos
  - Configurable cleanup with `DEVEYES_MAX_SCREENSHOTS` env variable
  - Universal fallback for MCP clients that don't support embedded images (Augment Code, Cline)

- **Smart Hints in Responses**
  - When `save=false`: Suggests retrying with `save=true` if image not visible
  - When `save=true`: Suggests setting `DEVEYES_SAVE_SCREENSHOTS=true` as default

- **New Environment Variables**
  - `DEVEYES_SAVE_SCREENSHOTS=true` - Enable local saving by default
  - `DEVEYES_MAX_SCREENSHOTS=N` - Auto-cleanup oldest files when limit reached

### Improved

- Better wait strategy for client-rendered content (React, Vue, Next.js)
- Double `requestAnimationFrame` + extended delay ensures content is fully rendered
- Improved image compression that maintains readability
- Used FastMCP's `imageContent` helper for proper MCP image format

## [1.0.2] - 2025-12-15

### Fixed

- FastMCP upgrade to v3.25.4 for better compatibility
- Fixed server completions error on startup

## [1.0.1] - 2025-12-14

### Added

- Multi-browser support (Chromium, Firefox, WebKit)
- Configurable browser via `--browser` flag or `DEVEYES_BROWSER` env variable
- Auto browser installation on first run

## [1.0.0] - 2025-12-14

### Initial Release

- Screenshot capture from localhost URLs
- Automatic image optimization for LLM consumption
- Viewport presets (mobile, tablet, desktop)
- Console error/warning capture
- Wait strategies (networkIdle, domStable, load, none)
- Custom selector waiting
