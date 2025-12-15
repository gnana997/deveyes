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
 * Playwright StorageState for authentication
 */
export interface StorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

/**
 * Options for creating a page
 */
export interface CreatePageOptions {
  viewport?: string | ViewportConfig;
  userAgent?: string;
  /** Playwright storageState for authenticated sessions */
  storageState?: StorageState;
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
 * Create a new page with viewport settings and optional authentication
 */
export async function createPage(options: CreatePageOptions = {}): Promise<Page> {
  const browser = await getBrowser();

  // Parse viewport
  const viewportConfig = typeof options.viewport === 'string'
    ? parseViewport(options.viewport)
    : options.viewport ?? parseViewport(DEFAULT_VIEWPORT);

  // Create context with viewport settings and optional storageState for auth
  const context = await browser.newContext({
    viewport: {
      width: viewportConfig.width,
      height: viewportConfig.height,
    },
    deviceScaleFactor: viewportConfig.deviceScaleFactor,
    isMobile: viewportConfig.isMobile,
    hasTouch: viewportConfig.hasTouch,
    userAgent: options.userAgent ?? viewportConfig.userAgent,
    // Pass storageState if provided (for authenticated sessions)
    storageState: options.storageState,
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

  // Wait for animations and client-side rendering to complete
  // Modern frameworks (React, Vue, Next.js) often render content after networkidle
  if (waitFor === 'networkIdle' || waitFor === 'domStable') {
    // Wait for any pending requestAnimationFrame callbacks
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        // Wait for next animation frame to ensure React/Vue renders complete
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
    });
    // Additional delay for any CSS transitions/animations to settle
    await page.waitForTimeout(1000);
  }
}

/**
 * Scroll through the entire page to trigger lazy-loaded content
 * This ensures Intersection Observer-based lazy loading and scroll animations fire
 */
export async function scrollToLoadContent(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Get the full scrollable height
    const scrollHeight = document.documentElement.scrollHeight;
    const viewportHeight = window.innerHeight;

    // Scroll down in chunks to trigger lazy loading
    const scrollStep = Math.floor(viewportHeight * 0.8); // 80% of viewport
    let currentPosition = 0;

    while (currentPosition < scrollHeight) {
      window.scrollTo({ top: currentPosition, behavior: 'instant' });
      currentPosition += scrollStep;
      // Wait for lazy content to load and animations to trigger
      await delay(200);
    }

    // Scroll to absolute bottom to ensure footer content loads
    window.scrollTo({ top: scrollHeight, behavior: 'instant' });
    await delay(300);

    // Scroll back to top
    window.scrollTo({ top: 0, behavior: 'instant' });
    await delay(200);
  });

  // Wait for any final network requests from lazy loading
  await page.waitForLoadState('networkidle').catch(() => {
    // Timeout is ok - some sites have persistent connections
  });

  // Force all CSS animations to complete and make content visible
  await page.evaluate(() => {
    // Disable CSS animations/transitions temporarily for accurate capture
    const style = document.createElement('style');
    style.id = 'deveyes-animation-disable';
    style.textContent = `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `;
    document.head.appendChild(style);

    // Force visibility on common animation library classes
    const animatedElements = document.querySelectorAll(
      '[data-aos], .aos-animate, .aos-init, ' +
      '[class*="animate-"], [class*="fade-"], [class*="slide-"], ' +
      '.gsap-marker-start, .gsap-marker-end, ' +
      '[style*="opacity: 0"], [style*="opacity:0"]'
    );
    animatedElements.forEach((el) => {
      const element = el as HTMLElement;
      element.style.opacity = '1';
      element.style.transform = 'none';
      element.style.visibility = 'visible';
    });
  });

  // Final settle time
  await page.waitForTimeout(300);
}

/**
 * Capture a screenshot of the page
 */
export async function captureScreenshot(
  page: Page,
  options: { fullPage?: boolean } = {}
): Promise<Buffer> {
  const { fullPage = false } = options;

  // For full-page captures, scroll through the page first to trigger lazy loading
  if (fullPage) {
    await scrollToLoadContent(page);
  }

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
