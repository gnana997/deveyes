/**
 * Vitest Setup
 * Configure test environment and custom matchers
 */

import { beforeAll, afterAll } from 'vitest';

// Note: mcp-dev-kit matchers will be installed when the package is available
// For now, we'll set up basic test configuration

// Increase timeout for browser-based tests
beforeAll(() => {
  // Set longer timeout for Playwright operations
});

afterAll(async () => {
  // Cleanup any remaining browser instances
  const { closeBrowser } = await import('../src/lib/browser.js');
  await closeBrowser();
});

// When mcp-dev-kit is installed, uncomment:
// import { installMCPMatchers } from 'mcp-dev-kit/matchers';
// import 'mcp-dev-kit/logger';
// installMCPMatchers();
