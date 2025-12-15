/**
 * Browser Installer
 * Automatically installs Playwright browsers on first run
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Supported browser types
 */
export type BrowserType = 'chromium' | 'firefox' | 'webkit';

/**
 * Default browser to use
 */
export const DEFAULT_BROWSER: BrowserType = 'chromium';

/**
 * Get the Playwright browsers cache directory
 */
function getPlaywrightCacheDir(): string {
  // Playwright uses PLAYWRIGHT_BROWSERS_PATH env var or default location
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    return process.env.PLAYWRIGHT_BROWSERS_PATH;
  }

  // Default locations per platform
  if (process.platform === 'win32') {
    return join(homedir(), 'AppData', 'Local', 'ms-playwright');
  } else if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Caches', 'ms-playwright');
  } else {
    return join(homedir(), '.cache', 'ms-playwright');
  }
}

/**
 * Check if a browser is likely installed
 * This is a heuristic check - actual installation may still fail
 */
function isBrowserLikelyInstalled(browser: BrowserType): boolean {
  const cacheDir = getPlaywrightCacheDir();

  if (!existsSync(cacheDir)) {
    return false;
  }

  // Check for browser-specific directories
  // Playwright creates directories like chromium-1200, firefox-1234, etc.
  try {
    const { readdirSync } = require('fs');
    const dirs = readdirSync(cacheDir);
    return dirs.some((dir: string) => dir.startsWith(browser));
  } catch {
    return false;
  }
}

/**
 * Install a Playwright browser
 */
export async function installBrowser(browser: BrowserType): Promise<boolean> {
  console.error(`[DevEyes] Installing ${browser} browser...`);

  try {
    // Use npx to run playwright install
    const result = spawnSync('npx', ['playwright', 'install', browser], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      timeout: 300000, // 5 minute timeout
    });

    if (result.status === 0) {
      console.error(`[DevEyes] ${browser} browser installed successfully`);
      return true;
    } else {
      const stderr = result.stderr?.toString() || '';
      console.error(`[DevEyes] Failed to install ${browser}: ${stderr}`);
      return false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[DevEyes] Error installing ${browser}: ${message}`);
    return false;
  }
}

/**
 * Ensure browser is installed, install if needed
 */
export async function ensureBrowserInstalled(browser: BrowserType = DEFAULT_BROWSER): Promise<boolean> {
  // Quick check if browser might be installed
  if (isBrowserLikelyInstalled(browser)) {
    console.error(`[DevEyes] ${browser} browser appears to be installed`);
    return true;
  }

  console.error(`[DevEyes] ${browser} browser not found, attempting to install...`);
  return await installBrowser(browser);
}

/**
 * Validate browser type
 */
export function isValidBrowserType(value: string): value is BrowserType {
  return ['chromium', 'firefox', 'webkit'].includes(value);
}

/**
 * Parse browser from CLI args or environment
 */
export function getBrowserFromConfig(): BrowserType {
  // Check CLI args first (--browser chromium)
  const args = process.argv;
  const browserArgIndex = args.findIndex(arg => arg === '--browser' || arg === '-b');

  if (browserArgIndex !== -1 && args[browserArgIndex + 1]) {
    const browserArg = args[browserArgIndex + 1].toLowerCase();
    if (isValidBrowserType(browserArg)) {
      return browserArg;
    } else {
      console.error(`[DevEyes] Invalid browser "${browserArg}", using default: ${DEFAULT_BROWSER}`);
      console.error(`[DevEyes] Supported browsers: chromium, firefox, webkit`);
    }
  }

  // Check environment variable
  const envBrowser = process.env.DEVEYES_BROWSER?.toLowerCase();
  if (envBrowser && isValidBrowserType(envBrowser)) {
    return envBrowser;
  }

  return DEFAULT_BROWSER;
}
