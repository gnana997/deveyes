# DevEyes Changelog

All notable changes to this project will be documented in this file.

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
