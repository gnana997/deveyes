/**
 * Screenshot Tool
 * Main MCP tool for capturing screenshots from localhost
 */

import { z } from 'zod';
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
});

export type ScreenshotInput = z.infer<typeof screenshotInputSchema>;

/**
 * Screenshot tool output
 */
export interface ScreenshotOutput {
  /** Base64 encoded image */
  imageBase64: string;
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
}

/**
 * Execute screenshot capture
 */
export async function executeScreenshot(input: ScreenshotInput): Promise<ScreenshotOutput> {
  const { url, viewport, fullPage, waitFor, waitForSelector } = input;

  // Parse viewport configuration
  const viewportConfig = parseViewport(viewport);
  const viewportName = typeof viewport === 'string' ? viewport : 'custom';

  // Create page with viewport
  const page = await createPage({ viewport: viewportConfig });

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
    const processed = await processImage(rawScreenshot);

    // Get console capture
    const consoleCaptured = consoleCapture.getCapture();

    // Build response
    const output: ScreenshotOutput = {
      imageBase64: processed.base64,
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
    };

    return output;
  } finally {
    // Cleanup
    consoleCapture.detach(page);
    await closePage(page);
  }
}

/**
 * Content types for MCP responses
 */
interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

interface TextContent {
  type: 'text';
  text: string;
}

interface ContentResult {
  content: Array<ImageContent | TextContent>;
  isError?: boolean;
}

/**
 * Format screenshot output for MCP response
 * Returns ContentResult with image and metadata
 */
export function formatScreenshotResponse(output: ScreenshotOutput): ContentResult {
  // Metadata without the base64 image
  const metadata = {
    viewport: output.viewport,
    original: output.original,
    processed: output.processed,
    transforms: output.transforms,
    console: output.console,
    url: output.url,
  };

  return {
    content: [
      {
        type: 'image',
        data: output.imageBase64,
        mimeType: output.mimeType,
      },
      {
        type: 'text',
        text: JSON.stringify(metadata, null, 2),
      },
    ],
  };
}

/**
 * Screenshot tool definition for FastMCP
 */
export const screenshotTool = {
  name: 'screenshot',
  description:
    'Capture a screenshot from any URL (typically localhost) with automatic optimization for LLM consumption. Handles image resizing and compression to stay within Claude/LLM limits. Captures console errors and warnings.',
  parameters: screenshotInputSchema,
  execute: async (args: ScreenshotInput) => {
    const output = await executeScreenshot(args);
    return formatScreenshotResponse(output);
  },
};
