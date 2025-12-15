/**
 * Authentication Storage Utility
 * Handles persistence of Playwright storageState for authenticated screenshots
 *
 * Saves session cookies and localStorage to enable screenshots of protected pages.
 * Auth state is stored per-domain in .deveyes/auth/ directory.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname, parse } from 'path';
import { homedir } from 'os';

/**
 * Playwright StorageState structure
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

const AUTH_SUBDIR = '.deveyes/auth';

// Cache the resolved auth directory
let cachedAuthDir: string | null = null;

/**
 * Extract domain key from URL for auth file naming
 * Example: http://localhost:3000/dashboard → localhost-3000
 * Example: https://app.example.com/login → app.example.com
 */
export function getDomainKey(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const port = parsed.port;

    // Include port in key if non-default
    const isDefaultPort =
      (parsed.protocol === 'http:' && (port === '' || port === '80')) ||
      (parsed.protocol === 'https:' && (port === '' || port === '443'));

    if (isDefaultPort) {
      return hostname;
    }

    return `${hostname}-${port}`;
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * Find the project root by walking up from cwd looking for package.json or .git
 */
function findProjectRoot(): string | null {
  let currentDir = process.cwd();
  const root = parse(currentDir).root;

  while (currentDir !== root) {
    if (existsSync(join(currentDir, 'package.json')) || existsSync(join(currentDir, '.git'))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  if (existsSync(join(root, 'package.json')) || existsSync(join(root, '.git'))) {
    return root;
  }

  return null;
}

/**
 * Get the auth directory path
 * Priority: Project root → Home directory fallback
 */
export function getAuthDir(): string {
  if (cachedAuthDir) {
    return cachedAuthDir;
  }

  // Try project root first
  const projectRoot = findProjectRoot();
  if (projectRoot) {
    cachedAuthDir = join(projectRoot, AUTH_SUBDIR);
    return cachedAuthDir;
  }

  // Fallback to home directory
  cachedAuthDir = join(homedir(), AUTH_SUBDIR);
  return cachedAuthDir;
}

/**
 * Get the auth file path for a URL
 */
export function getAuthFilePath(url: string): string {
  const domainKey = getDomainKey(url);
  const authDir = getAuthDir();
  return join(authDir, `${domainKey}.json`);
}

/**
 * Ensure auth directory exists
 */
export function ensureAuthDir(): string {
  const dir = getAuthDir();

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o755 });
    console.error(`[DevEyes] Created auth directory: ${dir}`);
  }

  return dir;
}

/**
 * Save authentication state for a URL
 */
export function saveAuthState(url: string, storageState: StorageState): string {
  ensureAuthDir();

  const filePath = getAuthFilePath(url);
  const domainKey = getDomainKey(url);

  const authData = {
    domainKey,
    savedAt: new Date().toISOString(),
    url,
    storageState,
  };

  writeFileSync(filePath, JSON.stringify(authData, null, 2), 'utf-8');
  console.error(`[DevEyes] Auth state saved: ${filePath}`);

  return filePath;
}

/**
 * Load authentication state for a URL
 * Returns undefined if no auth exists for this domain
 */
export function loadAuthState(url: string): StorageState | undefined {
  const filePath = getAuthFilePath(url);

  if (!existsSync(filePath)) {
    return undefined;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const authData = JSON.parse(content);

    // Check if cookies might be expired (warn but still load)
    const savedAt = new Date(authData.savedAt);
    const hoursSinceSaved = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceSaved > 24) {
      console.error(
        `[DevEyes] Warning: Auth state is ${Math.floor(hoursSinceSaved)} hours old. ` +
          `Session may be expired. Re-run 'deveyes login ${url}' if needed.`
      );
    }

    return authData.storageState;
  } catch (error) {
    console.error(`[DevEyes] Failed to load auth state from ${filePath}:`, error);
    return undefined;
  }
}

/**
 * Check if auth exists for a URL
 */
export function hasAuthState(url: string): boolean {
  const filePath = getAuthFilePath(url);
  return existsSync(filePath);
}

/**
 * Delete authentication state for a URL
 * Returns true if deleted, false if didn't exist
 */
export function deleteAuthState(url: string): boolean {
  const filePath = getAuthFilePath(url);

  if (!existsSync(filePath)) {
    return false;
  }

  unlinkSync(filePath);
  console.error(`[DevEyes] Auth state deleted: ${filePath}`);
  return true;
}

/**
 * List all saved auth domains
 * Returns array of domain keys (e.g., ['localhost-3000', 'app.example.com'])
 */
export function listAuthStates(): Array<{ domainKey: string; savedAt: string; url: string }> {
  const authDir = getAuthDir();

  if (!existsSync(authDir)) {
    return [];
  }

  const files = readdirSync(authDir).filter((f) => f.endsWith('.json'));

  return files
    .map((file) => {
      try {
        const content = readFileSync(join(authDir, file), 'utf-8');
        const data = JSON.parse(content);
        return {
          domainKey: data.domainKey || file.replace('.json', ''),
          savedAt: data.savedAt || 'unknown',
          url: data.url || 'unknown',
        };
      } catch {
        return {
          domainKey: file.replace('.json', ''),
          savedAt: 'unknown',
          url: 'unknown',
        };
      }
    })
    .sort((a, b) => a.domainKey.localeCompare(b.domainKey));
}
