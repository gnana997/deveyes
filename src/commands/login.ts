/**
 * Login Command Handler
 * Opens a headed browser for user to login, then saves the auth state
 */

import { chromium } from 'playwright';
import * as readline from 'readline';
import { saveAuthState, getDomainKey, getAuthFilePath } from '../lib/auth-storage.js';
import { ensureBrowserInstalled } from '../lib/browser-installer.js';

/**
 * Handle the login command
 * Opens a headed browser, waits for user to login, saves auth state
 */
export async function handleLoginCommand(url: string): Promise<void> {
  // Validate URL
  if (!url) {
    console.error('Usage: deveyes login <url>');
    console.error('Example: deveyes login http://localhost:3000');
    process.exit(1);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    console.error(`Error: Invalid URL "${url}"`);
    console.error('Please provide a valid URL (e.g., http://localhost:3000)');
    process.exit(1);
  }

  const domainKey = getDomainKey(url);

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    DevEyes Authentication                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Target URL: ${url}`);
  console.log(`  Domain key: ${domainKey}`);
  console.log('');

  // Ensure browser is installed
  console.log('  [1/4] Checking browser installation...');
  const installed = await ensureBrowserInstalled('chromium');
  if (!installed) {
    console.error('Error: Failed to install Chromium browser.');
    console.error('Please run: npx playwright install chromium');
    process.exit(1);
  }

  // Launch headed browser
  console.log('  [2/4] Launching browser (headed mode)...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  // Navigate to URL
  console.log('  [3/4] Navigating to URL...');
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (error) {
    console.error(`Error: Failed to navigate to ${url}`);
    console.error(error instanceof Error ? error.message : String(error));
    await browser.close();
    process.exit(1);
  }

  // Wait for user to login
  console.log('');
  console.log('  ┌──────────────────────────────────────────────────────────────┐');
  console.log('  │                                                              │');
  console.log('  │   A browser window has opened. Please:                       │');
  console.log('  │                                                              │');
  console.log('  │   1. Log in to your application                              │');
  console.log('  │   2. Navigate to a protected page to verify login            │');
  console.log('  │   3. Come back here and press ENTER when done                │');
  console.log('  │                                                              │');
  console.log('  └──────────────────────────────────────────────────────────────┘');
  console.log('');

  // Create readline interface for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise<void>((resolve) => {
    rl.question('  Press ENTER when you have logged in... ', () => {
      rl.close();
      resolve();
    });
  });

  // Capture auth state
  console.log('');
  console.log('  [4/4] Saving authentication state...');

  const storageState = await context.storageState();

  // Check if we actually got any auth data
  const hasCookies = storageState.cookies.length > 0;
  const hasLocalStorage = storageState.origins.some((o) => o.localStorage.length > 0);

  if (!hasCookies && !hasLocalStorage) {
    console.log('');
    console.log('  ⚠️  Warning: No cookies or localStorage found.');
    console.log('     This might mean:');
    console.log('     - You did not complete the login');
    console.log('     - The site uses a different auth mechanism');
    console.log('');
  }

  // Save the auth state
  const filePath = saveAuthState(url, storageState);

  // Close browser
  await browser.close();

  // Print summary
  console.log('');
  console.log('  ✅ Authentication saved successfully!');
  console.log('');
  console.log('  ┌──────────────────────────────────────────────────────────────┐');
  console.log('  │  Summary                                                     │');
  console.log('  ├──────────────────────────────────────────────────────────────┤');
  console.log(`  │  Cookies saved:     ${String(storageState.cookies.length).padEnd(38)}│`);
  console.log(`  │  LocalStorage keys: ${String(storageState.origins.reduce((sum, o) => sum + o.localStorage.length, 0)).padEnd(38)}│`);
  console.log(`  │  Saved to:          ${filePath.length > 38 ? '...' + filePath.slice(-35) : filePath.padEnd(38)}│`);
  console.log('  └──────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('  The screenshot tool will now automatically use this auth state');
  console.log(`  for any URL matching: ${domainKey}`);
  console.log('');
  console.log('  Note: Session cookies may expire. Re-run this command if your');
  console.log('  screenshots start showing login pages again.');
  console.log('');
}

/**
 * Handle the logout command
 * Removes saved auth state for a domain
 */
export async function handleLogoutCommand(url: string): Promise<void> {
  if (!url) {
    console.error('Usage: deveyes logout <url>');
    console.error('Example: deveyes logout http://localhost:3000');
    process.exit(1);
  }

  const { deleteAuthState } = await import('../lib/auth-storage.js');

  try {
    const deleted = deleteAuthState(url);
    if (deleted) {
      console.log(`✅ Auth state removed for: ${getDomainKey(url)}`);
    } else {
      console.log(`No auth state found for: ${getDomainKey(url)}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Handle the auth-list command
 * Lists all saved auth states
 */
export async function handleAuthListCommand(): Promise<void> {
  const { listAuthStates, getAuthDir } = await import('../lib/auth-storage.js');

  const states = listAuthStates();

  console.log('');
  console.log('Saved Authentication States');
  console.log('───────────────────────────────────────────────────────────────');

  if (states.length === 0) {
    console.log('  No saved auth states.');
    console.log('');
    console.log('  Use "deveyes login <url>" to save authentication for a site.');
  } else {
    console.log('');
    for (const state of states) {
      const savedDate = new Date(state.savedAt);
      const age = Math.floor((Date.now() - savedDate.getTime()) / (1000 * 60 * 60));
      const ageStr = age < 1 ? 'just now' : age < 24 ? `${age}h ago` : `${Math.floor(age / 24)}d ago`;

      console.log(`  ${state.domainKey}`);
      console.log(`    URL:   ${state.url}`);
      console.log(`    Saved: ${ageStr}`);
      console.log('');
    }
  }

  console.log('───────────────────────────────────────────────────────────────');
  console.log(`Auth directory: ${getAuthDir()}`);
  console.log('');
}
