/**
 * Screenshot Tool
 * Main MCP tool for capturing screenshots from localhost
 */

import { z } from 'zod';
import { imageContent } from 'fastmcp';
import {
  createPage,
  navigateToUrl,
  captureScreenshot,
  closePage,
  WaitStrategy,
} from '../lib/browser.js';
import { processImage, estimateTokenCost } from '../lib/image-processor.js';
import { createConsoleCapture, ConsoleCaptureResult } from '../lib/console-capture.js';
import { parseViewport, getAvailableViewports } from '../lib/viewports.js';
import { saveScreenshot, getStorageConfig, SaveResult, setMcpRoots } from '../lib/screenshot-storage.js';
import { loadAuthState, hasAuthState, getDomainKey } from '../lib/auth-storage.js';
import type { StorageState } from '../lib/browser.js';

/**
 * Screenshot tool input schema
 */
export const screenshotInputSchema = z.object({
  url: z
    .string()
    .url()
    .describe('Full URL to capture (e.g., http://localhost:3000)'),
  viewport: z
    .string()
    .optional()
    .default('desktop')
    .describe(
      `Viewport preset name or custom WxH (e.g., "mobile", "tablet", "desktop", "1280x720"). Available: ${getAvailableViewports().join(', ')}`
    ),
  fullPage: z
    .boolean()
    .optional()
    .default(false)
    .describe('Capture full scrollable page instead of viewport only'),
  waitFor: z
    .enum(['networkIdle', 'domStable', 'load', 'none'])
    .optional()
    .default('networkIdle')
    .describe('Wait condition before capture: networkIdle (default), domStable, load, or none'),
  waitForSelector: z
    .string()
    .optional()
    .describe('CSS selector to wait for before capture (optional)'),
  save: z
    .boolean()
    .optional()
    .describe('Save screenshot to local .deveyes/screenshots/ folder. Use this if the image is not displaying in your client. Can be set as default via DEVEYES_SAVE_SCREENSHOTS=true env variable.'),
});

export type ScreenshotInput = z.infer<typeof screenshotInputSchema>;

/**
 * Screenshot tool output
 */
export interface ScreenshotOutput {
  /** Base64 encoded image */
  imageBase64: string;
  /** Image buffer for saving */
  imageBuffer: Buffer;
  /** MIME type */
  mimeType: string;
  /** Viewport info */
  viewport: {
    name: string;
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
  /** Original image info */
  original: {
    width: number;
    height: number;
    size: number;
  };
  /** Processed image info */
  processed: {
    width: number;
    height: number;
    size: number;
    estimatedTokens: number;
  };
  /** Transforms applied */
  transforms: string[];
  /** Console output captured */
  console: ConsoleCaptureResult;
  /** URL that was captured */
  url: string;
  /** File save result (if save=true) */
  saved?: SaveResult;
  /** Whether authentication was used */
  authenticated?: {
    domain: string;
    used: boolean;
  };
}

/**
 * Execute screenshot capture
 */
export async function executeScreenshot(input: ScreenshotInput): Promise<ScreenshotOutput> {
  const { url, viewport, fullPage, waitFor, waitForSelector, save } = input;

  // Determine if we should save (explicit param or env default)
  const storageConfig = getStorageConfig();
  const shouldSave = save ?? storageConfig.saveByDefault;

  // Parse viewport configuration
  const viewportConfig = parseViewport(viewport);
  const viewportName = typeof viewport === 'string' ? viewport : 'custom';

  // Check for saved authentication state for this URL's domain
  let storageState: StorageState | undefined;
  let authInfo: { domain: string; used: boolean } | undefined;
  const domainKey = getDomainKey(url);

  if (hasAuthState(url)) {
    storageState = loadAuthState(url);
    if (storageState) {
      authInfo = { domain: domainKey, used: true };
      console.error(`[DevEyes] Using saved auth for: ${domainKey}`);
    }
  }

  // Create page with viewport and optional auth state
  const page = await createPage({ viewport: viewportConfig, storageState });

  // Setup console capture
  const consoleCapture = createConsoleCapture();
  consoleCapture.attach(page);

  try {
    // Navigate to URL
    await navigateToUrl(page, url, {
      waitFor: waitFor as WaitStrategy,
      waitForSelector,
    });

    // Capture screenshot
    const rawScreenshot = await captureScreenshot(page, { fullPage });

    // Process image for LLM compatibility
    const processed = await processImage(rawScreenshot, { isFullPage: fullPage });

    // Get console capture
    const consoleCaptured = consoleCapture.getCapture();

    // Save screenshot if requested
    let saved: SaveResult | undefined;
    if (shouldSave) {
      saved = saveScreenshot(processed.buffer, url);
    }

    // Build response
    const output: ScreenshotOutput = {
      imageBase64: processed.base64,
      imageBuffer: processed.buffer,
      mimeType: processed.mimeType,
      viewport: {
        name: viewportName,
        width: viewportConfig.width,
        height: viewportConfig.height,
        deviceScaleFactor: viewportConfig.deviceScaleFactor,
      },
      original: {
        width: processed.transformInfo.originalWidth,
        height: processed.transformInfo.originalHeight,
        size: processed.transformInfo.originalSize,
      },
      processed: {
        width: processed.transformInfo.finalWidth,
        height: processed.transformInfo.finalHeight,
        size: processed.transformInfo.finalSize,
        estimatedTokens: estimateTokenCost(
          processed.transformInfo.finalWidth,
          processed.transformInfo.finalHeight
        ),
      },
      transforms: processed.transformInfo.transforms,
      console: consoleCaptured,
      url,
      saved,
      authenticated: authInfo,
    };

    return output;
  } finally {
    // Cleanup
    consoleCapture.detach(page);
    await closePage(page);
  }
}

/**
 * Format screenshot output for MCP response
 * Uses FastMCP's imageContent helper for proper image handling
 */
export async function formatScreenshotResponse(output: ScreenshotOutput) {
  // Build metadata with appropriate hint based on save status
  const metadata: Record<string, unknown> = {
    viewport: output.viewport,
    original: output.original,
    processed: output.processed,
    transforms: output.transforms,
    console: output.console,
    url: output.url,
    authenticated: output.authenticated,
  };

  // Add file paths and hint if saved
  if (output.saved) {
    metadata.savedTo = output.saved.absolutePath;
    metadata.relativePath = output.saved.relativePath;
    metadata.hint = 'Screenshot saved locally. To make this the default behavior, set DEVEYES_SAVE_SCREENSHOTS=true in your MCP server config.';
  } else {
    metadata.hint = 'If you cannot see the image above, retry with save=true to save it locally for manual attachment.';
  }

  // Use FastMCP's imageContent helper with buffer
  const image = await imageContent({ buffer: output.imageBuffer });

  return {
    content: [
      image,
      {
        type: 'text' as const,
        text: JSON.stringify(metadata, null, 2),
      },
    ],
  };
}

/**
 * MCP Session context type for roots
 */
interface McpSession {
  roots?: Array<{ uri: string; name?: string }>;
}

/**
 * MCP Tool context passed to execute function
 */
interface McpToolContext {
  session?: McpSession;
}

/**
 * Screenshot tool definition for FastMCP
 */
export const screenshotTool = {
  name: 'screenshot',
  description:
    'Capture a screenshot from any URL (typically localhost) with automatic optimization for LLM consumption. Handles image resizing and compression to stay within Claude/LLM limits. Captures console errors and warnings.',
  parameters: screenshotInputSchema,
  execute: async (args: ScreenshotInput, context?: McpToolContext) => {
    // Set MCP roots from session if available (enables proper workspace detection)
    if (context?.session?.roots) {
      setMcpRoots(context.session.roots);
    }

    const output = await executeScreenshot(args);
    return formatScreenshotResponse(output);
  },
};
