/**
 * DevEyes MCP Server
 * Gives AI coding assistants "eyes" to see visual output from local development environments
 */

import { FastMCP } from 'fastmcp';
import { SERVER_CONFIG } from './config.js';
import { screenshotTool } from './tools/screenshot.js';
import { closeBrowser, initializeBrowserConfig, getCurrentBrowserType } from './lib/browser.js';
import { getAvailableViewports, VIEWPORT_PRESETS } from './lib/viewports.js';
import { LLM_LIMITS } from './config.js';

// Initialize browser configuration from CLI args / environment
// Supports: --browser chromium|firefox|webkit or DEVEYES_BROWSER env var
initializeBrowserConfig();

// Create the MCP server
const server = new FastMCP({
  name: SERVER_CONFIG.name,
  version: SERVER_CONFIG.version,
});

// Register the screenshot tool
server.addTool({
  name: 'screenshot',
  description: screenshotTool.description,
  parameters: screenshotTool.parameters,
  execute: async (args, context) => {
    try {
      // Pass context to tool execute for MCP roots access
      const result = await screenshotTool.execute(args, context);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `Screenshot capture failed: ${message}`,
              url: args.url,
              viewport: args.viewport,
            }),
          },
        ],
        isError: true,
      };
    }
  },
});

// Register a resource for viewport presets documentation
server.addResource({
  uri: 'deveyes://viewports',
  name: 'Viewport Presets',
  description: 'Available viewport presets for responsive screenshot capture',
  mimeType: 'application/json',
  async load() {
    const viewports = getAvailableViewports().map((presetName) => ({
      ...VIEWPORT_PRESETS[presetName],
      name: presetName,
    }));
    return {
      text: JSON.stringify(
        {
          description: 'Available viewport presets for the screenshot tool',
          presets: viewports,
          customFormat: 'You can also use custom dimensions like "1280x720" or "1280x720@2x" for retina',
        },
        null,
        2
      ),
    };
  },
});

// Register a resource for LLM limits documentation
server.addResource({
  uri: 'deveyes://limits',
  name: 'LLM Image Limits',
  description: 'Image constraints and limits for LLM compatibility',
  mimeType: 'application/json',
  async load() {
    return {
      text: JSON.stringify(
        {
          description: 'DevEyes automatically optimizes images to stay within these limits',
          limits: {
            maxDimension: {
              value: LLM_LIMITS.maxDimension,
              unit: 'pixels',
              description: 'Maximum dimension on any side (hard limit)',
            },
            optimalDimension: {
              value: LLM_LIMITS.optimalDimension,
              unit: 'pixels',
              description: 'Optimal dimension for best quality/token ratio',
            },
            maxFileSize: {
              value: LLM_LIMITS.maxFileSize,
              unit: 'bytes',
              description: 'Maximum file size (5MB)',
            },
            targetSize: {
              value: LLM_LIMITS.targetSize,
              unit: 'bytes',
              description: 'Target size accounting for base64 overhead (~750KB)',
            },
            tokenFormula: `(width × height) / ${LLM_LIMITS.tokenDivisor}`,
          },
        },
        null,
        2
      ),
    };
  },
});

// Cleanup on shutdown
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});

// Start the server
server.start({
  transportType: 'stdio',
});

// Log startup to stderr (not stdout, to avoid breaking stdio protocol)
console.error(`[DevEyes] MCP server started (v${SERVER_CONFIG.version})`);
console.error(`[DevEyes] Browser: ${getCurrentBrowserType()} (use --browser firefox|webkit to change)`);
console.error(`[DevEyes] Available tool: screenshot`);
console.error(`[DevEyes] Available viewports: ${getAvailableViewports().join(', ')}`);
