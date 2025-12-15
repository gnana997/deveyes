/**
 * Screenshot Storage Utility
 * Handles local file saving for screenshots to support MCP clients
 * that don't render embedded ImageContent
 *
 * Cross-platform support: Windows, macOS, Linux
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, appendFileSync } from 'fs';
import { join, resolve, parse, dirname } from 'path';
import { homedir } from 'os';

/**
 * Storage configuration from environment variables
 */
export interface StorageConfig {
  /** Whether to save screenshots by default */
  saveByDefault: boolean;
  /** Maximum number of screenshots to keep (undefined = unlimited) */
  maxScreenshots: number | undefined;
  /** Screenshot directory path */
  screenshotDir: string;
}

/**
 * Result of saving a screenshot
 */
export interface SaveResult {
  /** Absolute path to the saved file */
  absolutePath: string;
  /** Relative path from cwd */
  relativePath: string;
  /** Filename */
  filename: string;
}

const SCREENSHOT_SUBDIR = '.deveyes/screenshots';
const GITIGNORE_ENTRY = '.deveyes/';

// Cache the resolved base directory to avoid repeated filesystem walks
let cachedBaseDir: string | null = null;

/**
 * Find the project root by walking up from cwd looking for package.json or .git
 * Uses cross-platform root detection with path.parse()
 */
function findProjectRoot(): string | null {
  let currentDir = process.cwd();
  const root = parse(currentDir).root; // Cross-platform: 'C:\' on Windows, '/' on Unix

  while (currentDir !== root) {
    // Check for project markers
    if (existsSync(join(currentDir, 'package.json')) ||
        existsSync(join(currentDir, '.git'))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break; // Safety: prevent infinite loop
    currentDir = parentDir;
  }

  // Check root directory itself
  if (existsSync(join(root, 'package.json')) || existsSync(join(root, '.git'))) {
    return root;
  }

  return null;
}

/**
 * Get the base directory for screenshot storage
 * Priority: 1) DEVEYES_SCREENSHOT_DIR env var, 2) project root, 3) home directory
 */
function getScreenshotBaseDir(): string {
  // Return cached value if available
  if (cachedBaseDir) {
    return cachedBaseDir;
  }

  // 1. Check for explicit override via environment variable
  const customDir = process.env.DEVEYES_SCREENSHOT_DIR;
  if (customDir) {
    cachedBaseDir = customDir;
    console.error(`[DevEyes] Screenshot dir (custom): ${customDir}`);
    return customDir;
  }

  // 2. Try to find project root (package.json or .git)
  const projectRoot = findProjectRoot();
  if (projectRoot) {
    cachedBaseDir = join(projectRoot, SCREENSHOT_SUBDIR);
    console.error(`[DevEyes] Screenshot dir (project): ${cachedBaseDir}`);
    return cachedBaseDir;
  }

  // 3. Fallback to home directory (always writable)
  cachedBaseDir = join(homedir(), SCREENSHOT_SUBDIR);
  console.error(`[DevEyes] Screenshot dir (home fallback): ${cachedBaseDir}`);
  return cachedBaseDir;
}

/**
 * Get storage configuration from environment variables
 */
export function getStorageConfig(): StorageConfig {
  const maxScreenshotsEnv = process.env.DEVEYES_MAX_SCREENSHOTS;

  return {
    saveByDefault: process.env.DEVEYES_SAVE_SCREENSHOTS === 'true',
    maxScreenshots: maxScreenshotsEnv ? parseInt(maxScreenshotsEnv, 10) : undefined,
    screenshotDir: getScreenshotBaseDir(),
  };
}

/**
 * Ensure the screenshot directory exists
 * Uses smart directory detection with fallback to home directory
 */
export function ensureScreenshotDir(): string {
  const dir = getScreenshotBaseDir();

  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o755 });
      console.error(`[DevEyes] Created screenshot directory: ${dir}`);
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    // If we can't create in project, fall back to home directory
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      const homeDir = join(homedir(), SCREENSHOT_SUBDIR);
      console.error(`[DevEyes] Permission denied for ${dir}, falling back to: ${homeDir}`);
      cachedBaseDir = homeDir; // Update cache
      if (!existsSync(homeDir)) {
        mkdirSync(homeDir, { recursive: true, mode: 0o755 });
        console.error(`[DevEyes] Created screenshot directory: ${homeDir}`);
      }
      return homeDir;
    }
    throw error; // Re-throw other errors
  }

  return dir;
}

/**
 * Check if a directory is inside a git repository
 * Uses cross-platform root detection with path.parse()
 */
function isGitRepo(startDir?: string): boolean {
  let currentDir = startDir || process.cwd();
  const root = parse(currentDir).root; // Cross-platform: 'C:\' on Windows, '/' on Unix

  while (currentDir !== root) {
    if (existsSync(join(currentDir, '.git'))) {
      return true;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // Check root directory itself
  return existsSync(join(root, '.git'));
}

/**
 * Find the root of the git repository
 * Uses cross-platform root detection with path.parse()
 */
function findGitRoot(startDir?: string): string | null {
  let currentDir = startDir || process.cwd();
  const root = parse(currentDir).root; // Cross-platform: 'C:\' on Windows, '/' on Unix

  while (currentDir !== root) {
    if (existsSync(join(currentDir, '.git'))) {
      return currentDir;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // Check root directory itself
  if (existsSync(join(root, '.git'))) {
    return root;
  }

  return null;
}

/**
 * Ensure .deveyes/ is in .gitignore if we're in a git repo
 * Checks from the screenshot base directory location
 */
export function ensureGitignore(): void {
  // Use the screenshot base dir as starting point for git detection
  const baseDir = getScreenshotBaseDir();
  const baseDirParent = dirname(dirname(baseDir)); // Go up from .deveyes/screenshots

  if (!isGitRepo(baseDirParent)) {
    return;
  }

  const gitRoot = findGitRoot(baseDirParent);
  if (!gitRoot) return;

  const gitignorePath = join(gitRoot, '.gitignore');

  // Check if .gitignore exists and already contains our entry
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n').map(line => line.trim());

    // Check for exact match or pattern that would cover .deveyes/
    if (lines.some(line => line === GITIGNORE_ENTRY || line === '.deveyes' || line === '.deveyes/*')) {
      return; // Already ignored
    }

    // Append to existing .gitignore
    const newContent = content.endsWith('\n') ? `${GITIGNORE_ENTRY}\n` : `\n${GITIGNORE_ENTRY}\n`;
    appendFileSync(gitignorePath, newContent);
    console.error(`[DevEyes] Added ${GITIGNORE_ENTRY} to .gitignore`);
  } else {
    // Create new .gitignore
    writeFileSync(gitignorePath, `# DevEyes screenshots\n${GITIGNORE_ENTRY}\n`);
    console.error(`[DevEyes] Created .gitignore with ${GITIGNORE_ENTRY}`);
  }
}

/**
 * Generate a filename from URL and timestamp
 * Format: {url-slug}-{YYYY-MM-DD-HHmmss}.jpg
 */
export function generateFilename(url: string): string {
  // Parse URL to get meaningful slug
  let slug: string;
  try {
    const parsed = new URL(url);
    // Create slug from host and pathname
    slug = `${parsed.host}${parsed.pathname}`
      .replace(/[^a-zA-Z0-9]/g, '-')  // Replace non-alphanumeric with dash
      .replace(/-+/g, '-')             // Collapse multiple dashes
      .replace(/^-|-$/g, '')           // Remove leading/trailing dashes
      .toLowerCase()
      .substring(0, 50);               // Limit length
  } catch {
    slug = 'screenshot';
  }

  // Generate timestamp: YYYY-MM-DD-HHmmss
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  return `${slug}-${timestamp}.jpg`;
}

/**
 * Save a screenshot buffer to disk
 * Returns save result with absolute and relative paths
 */
export function saveScreenshot(buffer: Buffer, url: string): SaveResult {
  // Ensure directory exists and gitignore is set up
  const dir = ensureScreenshotDir();
  ensureGitignore();

  // Generate filename and paths
  const filename = generateFilename(url);
  const absolutePath = join(dir, filename);
  const relativePath = join(SCREENSHOT_SUBDIR, filename);

  try {
    // Write the file
    writeFileSync(absolutePath, buffer);
    console.error(`[DevEyes] Screenshot saved: ${absolutePath}`);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error(`[DevEyes] Failed to save screenshot to ${absolutePath}: ${err.message}`);
    throw new Error(`Failed to save screenshot: ${err.message}. Path: ${absolutePath}`);
  }

  // Run cleanup if maxScreenshots is configured
  const config = getStorageConfig();
  if (config.maxScreenshots !== undefined) {
    cleanupOldScreenshots(config.maxScreenshots);
  }

  return {
    absolutePath,
    relativePath,
    filename,
  };
}

/**
 * Clean up old screenshots when over the limit
 * Deletes oldest files first (by modification time)
 */
export function cleanupOldScreenshots(maxFiles: number): void {
  const dir = getScreenshotBaseDir();

  if (!existsSync(dir)) {
    return;
  }

  try {
    // Get all jpg files with their stats
    const files = readdirSync(dir)
      .filter(file => file.endsWith('.jpg'))
      .map(file => {
        const filepath = join(dir, file);
        const stats = statSync(filepath);
        return {
          file,
          filepath,
          mtime: stats.mtime.getTime(),
        };
      })
      .sort((a, b) => a.mtime - b.mtime); // Sort oldest first

    // Delete oldest files until we're under the limit
    const filesToDelete = files.length - maxFiles;
    if (filesToDelete > 0) {
      for (let i = 0; i < filesToDelete; i++) {
        unlinkSync(files[i].filepath);
        console.error(`[DevEyes] Deleted old screenshot: ${files[i].file}`);
      }
    }
  } catch (error) {
    console.error(`[DevEyes] Error during cleanup: ${error}`);
  }
}
