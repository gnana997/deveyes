/**
 * Playwright Browser Manager
 * Singleton pattern for browser lifecycle management
 * Supports multiple browser types (chromium, firefox, webkit)
 */

import { chromium, firefox, webkit, Browser, Page, BrowserContext } from 'playwright';
import { ViewportConfig, parseViewport, DEFAULT_VIEWPORT } from './viewports.js';
import { BROWSER_DEFAULTS } from '../config.js';
import { BrowserType, DEFAULT_BROWSER, ensureBrowserInstalled, getBrowserFromConfig } from './browser-installer.js';

let browserInstance: Browser | null = null;
let browserContext: BrowserContext | null = null;
let currentBrowserType: BrowserType = DEFAULT_BROWSER;

/**
 * Get the browser launcher based on type
 */
function getBrowserLauncher(browserType: BrowserType) {
  switch (browserType) {
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
    case 'chromium':
    default:
      return chromium;
  }
}

/**
 * Set the browser type to use
 */
export function setBrowserType(browserType: BrowserType): void {
  if (browserInstance) {
    console.error(`[DevEyes] Warning: Browser already running. Close it first to change browser type.`);
    return;
  }
  currentBrowserType = browserType;
}

/**
 * Get the current browser type
 */
export function getCurrentBrowserType(): BrowserType {
  return currentBrowserType;
}

/**
 * Get or create a browser instance (singleton)
 * Automatically installs the browser if not found
 */
export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    // Ensure browser is installed before launching
    const installed = await ensureBrowserInstalled(currentBrowserType);
    if (!installed) {
      throw new Error(
        `Failed to install ${currentBrowserType} browser. ` +
        `Please run: npx playwright install ${currentBrowserType}`
      );
    }

    const launcher = getBrowserLauncher(currentBrowserType);

    // Browser-specific launch args
    const launchArgs: string[] = [];
    if (currentBrowserType === 'chromium') {
      launchArgs.push(
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      );
    }

    browserInstance = await launcher.launch({
      headless: true,
      args: launchArgs.length > 0 ? launchArgs : undefined,
    });

    console.error(`[DevEyes] ${currentBrowserType} browser launched`);

    // Setup cleanup on process exit
    const cleanup = async () => {
      await closeBrowser();
    };

    process.on('exit', () => {
      if (browserInstance?.isConnected()) {
        browserInstance.close().catch(() => {});
      }
    });
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', cleanup);
  }

  return browserInstance;
}

/**
 * Get or create a browser context
 */
export async function getBrowserContext(): Promise<BrowserContext> {
  if (!browserContext) {
    const browser = await getBrowser();
    browserContext = await browser.newContext();
  }
  return browserContext;
}

/**
 * Close the browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browserContext) {
    await browserContext.close().catch(() => {});
    browserContext = null;
  }
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

/**
 * Wait strategy options
 */
export type WaitStrategy = 'networkIdle' | 'domStable' | 'load' | 'none';

/**
 * Options for creating a page
 */
export interface CreatePageOptions {
  viewport?: string | ViewportConfig;
  userAgent?: string;
}

/**
 * Options for navigating to a URL
 */
export interface NavigateOptions {
  waitFor?: WaitStrategy;
  timeout?: number;
  waitForSelector?: string;
}

/**
 * Create a new page with viewport settings
 */
export async function createPage(options: CreatePageOptions = {}): Promise<Page> {
  const browser = await getBrowser();

  // Parse viewport
  const viewportConfig = typeof options.viewport === 'string'
    ? parseViewport(options.viewport)
    : options.viewport ?? parseViewport(DEFAULT_VIEWPORT);

  // Create context with viewport settings
  const context = await browser.newContext({
    viewport: {
      width: viewportConfig.width,
      height: viewportConfig.height,
    },
    deviceScaleFactor: viewportConfig.deviceScaleFactor,
    isMobile: viewportConfig.isMobile,
    hasTouch: viewportConfig.hasTouch,
    userAgent: options.userAgent ?? viewportConfig.userAgent,
  });

  const page = await context.newPage();
  return page;
}

/**
 * Navigate to a URL with configurable wait strategy
 */
export async function navigateToUrl(
  page: Page,
  url: string,
  options: NavigateOptions = {}
): Promise<void> {
  const {
    waitFor = 'networkIdle',
    timeout = BROWSER_DEFAULTS.navigationTimeout,
    waitForSelector,
  } = options;

  // Map wait strategy to Playwright's waitUntil
  const waitUntilMap: Record<WaitStrategy, 'load' | 'domcontentloaded' | 'networkidle' | 'commit'> = {
    networkIdle: 'networkidle',
    domStable: 'domcontentloaded',
    load: 'load',
    none: 'commit',
  };

  await page.goto(url, {
    waitUntil: waitUntilMap[waitFor],
    timeout,
  });

  // Additional wait for specific selector if provided
  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, {
      timeout: BROWSER_DEFAULTS.waitTimeout,
    });
  }

  // Small delay to ensure any final renders complete
  if (waitFor === 'networkIdle' || waitFor === 'domStable') {
    await page.waitForTimeout(500);
  }
}

/**
 * Capture a screenshot of the page
 */
export async function captureScreenshot(
  page: Page,
  options: { fullPage?: boolean } = {}
): Promise<Buffer> {
  const { fullPage = false } = options;

  const screenshot = await page.screenshot({
    type: 'png',
    fullPage,
    timeout: BROWSER_DEFAULTS.screenshotTimeout,
  });

  return screenshot;
}

/**
 * Close a page and its context
 */
export async function closePage(page: Page): Promise<void> {
  const context = page.context();
  await page.close().catch(() => {});
  await context.close().catch(() => {});
}

/**
 * Initialize browser configuration from CLI/env
 * Call this early in server startup
 */
export function initializeBrowserConfig(): void {
  const browserType = getBrowserFromConfig();
  setBrowserType(browserType);
  console.error(`[DevEyes] Browser configured: ${browserType}`);
}
