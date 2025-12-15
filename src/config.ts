/**
 * DevEyes Configuration
 * LLM image constraints and default settings
 */

/**
 * Claude/LLM image constraints
 * Based on Claude's documented limits:
 * - Max dimension: 8000px (hard limit, breaks sessions if exceeded)
 * - Optimal dimension: 1568px (recommended for best quality/token ratio)
 * - Max file size: 5MB
 * - Tool response limit: ~1MB
 * - Base64 overhead: +33%
 */
export const LLM_LIMITS = {
  /** Maximum dimension in pixels (hard limit) */
  maxDimension: 8000,
  /** Optimal dimension for Claude (best quality/token ratio) */
  optimalDimension: 1568,
  /** Minimum width for readability (don't compress below this) */
  minReadableWidth: 800,
  /** Maximum file size in bytes (5MB) */
  maxFileSize: 5 * 1024 * 1024,
  /** Target size for base64 encoding overhead (~750KB) */
  targetSize: 750 * 1024,
  /** Larger target size for full-page captures (~1.5MB, still within limits) */
  fullPageTargetSize: 1.5 * 1024 * 1024,
  /** Token cost formula: (width × height) / 750 */
  tokenDivisor: 750,
} as const;

/**
 * Image processing defaults
 */
export const IMAGE_DEFAULTS = {
  /** Default JPEG quality (0-100) */
  jpegQuality: 85,
  /** Minimum JPEG quality (won't go below this) */
  minJpegQuality: 60,
  /** Quality reduction step for iterative compression */
  qualityStep: 10,
  /** Default output format */
  format: 'jpeg' as const,
} as const;

/**
 * Browser/Playwright defaults
 */
export const BROWSER_DEFAULTS = {
  /** Default navigation timeout in ms */
  navigationTimeout: 30000,
  /** Default wait timeout in ms */
  waitTimeout: 10000,
  /** Default screenshot timeout in ms */
  screenshotTimeout: 30000,
} as const;

/**
 * Server configuration
 */
export const SERVER_CONFIG = {
  name: 'deveyes',
  version: '1.1.0',
  description: 'MCP server for capturing and optimizing screenshots from local development environments',
} as const;

/**
 * Screenshot storage defaults
 * Configurable via environment variables
 *
 * Directory detection priority:
 * 1. DEVEYES_SCREENSHOT_DIR env var (explicit override)
 * 2. Project root (detected via package.json or .git)
 * 3. Home directory fallback (~/.deveyes/screenshots)
 */
export const STORAGE_DEFAULTS = {
  /** Subdirectory for saved screenshots (relative to detected root) */
  screenshotSubdir: '.deveyes/screenshots',
  /** Whether to save screenshots by default (DEVEYES_SAVE_SCREENSHOTS=true) */
  saveByDefault: process.env.DEVEYES_SAVE_SCREENSHOTS === 'true',
  /** Maximum screenshots to keep before cleanup (DEVEYES_MAX_SCREENSHOTS) */
  maxScreenshots: process.env.DEVEYES_MAX_SCREENSHOTS
    ? parseInt(process.env.DEVEYES_MAX_SCREENSHOTS, 10)
    : undefined,
  /** Custom directory override (DEVEYES_SCREENSHOT_DIR) */
  customDir: process.env.DEVEYES_SCREENSHOT_DIR || undefined,
} as const;
