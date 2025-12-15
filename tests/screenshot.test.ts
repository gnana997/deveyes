/**
 * Screenshot Tool Tests
 * Integration tests for the screenshot capture functionality
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import type { Server } from 'http';
import {
  executeScreenshot,
  screenshotInputSchema,
} from '../src/tools/screenshot.js';
import { closeBrowser } from '../src/lib/browser.js';
import { LLM_LIMITS } from '../src/config.js';

describe('Screenshot Tool', () => {
  let testServer: Server;
  let testServerPort: number;

  beforeAll(async () => {
    // Create a simple HTTP server for testing
    testServer = createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Test Page</title></head>
            <body style="margin: 0; padding: 20px; font-family: Arial;">
              <h1 id="title">DevEyes Test Page</h1>
              <p>This is a test page for screenshot capture.</p>
              <div id="content" style="background: #f0f0f0; padding: 20px;">
                Content area
              </div>
            </body>
          </html>
        `);
      } else if (url === '/error-page') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Error Page</title></head>
            <body>
              <h1>Page with console errors</h1>
              <script>
                console.error('Test error message');
                console.warn('Test warning message');
              </script>
            </body>
          </html>
        `);
      } else if (url === '/large-page') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Large Page</title></head>
            <body style="margin: 0; width: 3000px; height: 2000px; background: linear-gradient(45deg, red, blue);">
              <h1>Large content page</h1>
            </body>
          </html>
        `);
      } else if (url === '/api/data') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    // Start server on a random available port
    await new Promise<void>((resolve) => {
      testServer.listen(0, '127.0.0.1', () => {
        const addr = testServer.address();
        if (addr && typeof addr === 'object') {
          testServerPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Close browser and test server
    await closeBrowser();
    await new Promise<void>((resolve) => {
      testServer.close(() => resolve());
    });
  });

  describe('Input Schema', () => {
    it('should validate valid URL', () => {
      const result = screenshotInputSchema.safeParse({
        url: 'http://localhost:3000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      const result = screenshotInputSchema.safeParse({
        url: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should accept viewport presets', () => {
      const result = screenshotInputSchema.safeParse({
        url: 'http://localhost:3000',
        viewport: 'mobile',
      });
      expect(result.success).toBe(true);
    });

    it('should accept custom viewport dimensions', () => {
      const result = screenshotInputSchema.safeParse({
        url: 'http://localhost:3000',
        viewport: '1280x720',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all optional parameters', () => {
      const result = screenshotInputSchema.safeParse({
        url: 'http://localhost:3000',
        viewport: 'tablet',
        fullPage: true,
        waitFor: 'domStable',
        waitForSelector: '#content',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('executeScreenshot', () => {
    it('should capture a basic screenshot', async () => {
      const result = await executeScreenshot({
        url: `http://127.0.0.1:${testServerPort}/`,
        viewport: 'desktop',
      });

      expect(result.imageBase64).toBeTruthy();
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.url).toBe(`http://127.0.0.1:${testServerPort}/`);
      expect(result.viewport.name).toBe('desktop');
    });

    it('should capture with mobile viewport', async () => {
      const result = await executeScreenshot({
        url: `http://127.0.0.1:${testServerPort}/`,
        viewport: 'mobile',
      });

      expect(result.viewport.name).toBe('mobile');
      expect(result.viewport.width).toBe(375);
      expect(result.viewport.height).toBe(667);
    });

    it('should capture with custom viewport', async () => {
      const result = await executeScreenshot({
        url: `http://127.0.0.1:${testServerPort}/`,
        viewport: '800x600',
      });

      expect(result.viewport.name).toBe('800x600');
      expect(result.viewport.width).toBe(800);
      expect(result.viewport.height).toBe(600);
    });

    it('should capture full page screenshot', async () => {
      const result = await executeScreenshot({
        url: `http://127.0.0.1:${testServerPort}/large-page`,
        viewport: 'desktop',
        fullPage: true,
      });

      expect(result.imageBase64).toBeTruthy();
      // Full page should be larger than viewport
      expect(result.original.height).toBeGreaterThanOrEqual(
        result.viewport.height
      );
    });

    it('should capture console errors', async () => {
      const result = await executeScreenshot({
        url: `http://127.0.0.1:${testServerPort}/error-page`,
        viewport: 'desktop',
        waitFor: 'load',
      });

      expect(result.console.errors).toContain('Test error message');
      expect(result.console.warnings).toContain('Test warning message');
    });

    it('should optimize image within LLM limits', async () => {
      const result = await executeScreenshot({
        url: `http://127.0.0.1:${testServerPort}/`,
        viewport: 'desktop',
      });

      // Final dimensions should be within optimal
      const maxDim = Math.max(result.processed.width, result.processed.height);
      expect(maxDim).toBeLessThanOrEqual(LLM_LIMITS.optimalDimension);

      // File size should be within target
      expect(result.processed.size).toBeLessThanOrEqual(LLM_LIMITS.targetSize);
    });

    it('should include transform information', async () => {
      const result = await executeScreenshot({
        url: `http://127.0.0.1:${testServerPort}/`,
        viewport: 'desktop',
      });

      expect(result.original).toBeDefined();
      expect(result.processed).toBeDefined();
      expect(result.transforms).toBeInstanceOf(Array);
      expect(result.processed.estimatedTokens).toBeGreaterThan(0);
    });

    it('should handle different wait strategies', async () => {
      // Test networkIdle
      const result1 = await executeScreenshot({
        url: `http://127.0.0.1:${testServerPort}/`,
        viewport: 'desktop',
        waitFor: 'networkIdle',
      });
      expect(result1.imageBase64).toBeTruthy();

      // Test domStable
      const result2 = await executeScreenshot({
        url: `http://127.0.0.1:${testServerPort}/`,
        viewport: 'desktop',
        waitFor: 'domStable',
      });
      expect(result2.imageBase64).toBeTruthy();

      // Test load
      const result3 = await executeScreenshot({
        url: `http://127.0.0.1:${testServerPort}/`,
        viewport: 'desktop',
        waitFor: 'load',
      });
      expect(result3.imageBase64).toBeTruthy();
    });

    it('should wait for selector when specified', async () => {
      const result = await executeScreenshot({
        url: `http://127.0.0.1:${testServerPort}/`,
        viewport: 'desktop',
        waitForSelector: '#title',
      });

      expect(result.imageBase64).toBeTruthy();
    });

    it('should produce valid base64 image', async () => {
      const result = await executeScreenshot({
        url: `http://127.0.0.1:${testServerPort}/`,
        viewport: 'desktop',
      });

      // Verify base64 is valid
      const decoded = Buffer.from(result.imageBase64, 'base64');
      expect(decoded.length).toBeGreaterThan(0);

      // Check JPEG magic bytes
      expect(decoded[0]).toBe(0xff);
      expect(decoded[1]).toBe(0xd8);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid URLs gracefully', async () => {
      await expect(
        executeScreenshot({
          url: 'http://127.0.0.1:99999/',
          viewport: 'desktop',
        })
      ).rejects.toThrow();
    });

    it('should handle 404 pages', async () => {
      // 404 pages should still capture (they render HTML)
      const result = await executeScreenshot({
        url: `http://127.0.0.1:${testServerPort}/not-found`,
        viewport: 'desktop',
      });

      expect(result.imageBase64).toBeTruthy();
    });
  });
});
