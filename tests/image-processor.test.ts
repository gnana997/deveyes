/**
 * Image Processor Tests
 * Unit tests for Sharp-based image processing
 */

import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import {
  processImage,
  getImageInfo,
  calculateResizeDimensions,
  exceedsLimits,
  estimateTokenCost,
} from '../src/lib/image-processor.js';
import { LLM_LIMITS } from '../src/config.js';

describe('Image Processor', () => {
  let testImageSmall: Buffer;
  let testImageLarge: Buffer;
  let testImageHuge: Buffer;

  beforeAll(async () => {
    // Create test images of different sizes
    // Small image (100x100) - should pass through with minimal processing
    testImageSmall = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    // Large image (2000x1500) - should be resized to optimal
    testImageLarge = await sharp({
      create: {
        width: 2000,
        height: 1500,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .png()
      .toBuffer();

    // Huge image (9000x6000) - exceeds hard limit, must be resized
    testImageHuge = await sharp({
      create: {
        width: 9000,
        height: 6000,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .png()
      .toBuffer();
  });

  describe('calculateResizeDimensions', () => {
    it('should return original dimensions if within limit', () => {
      const result = calculateResizeDimensions(800, 600, 1568);
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it('should resize landscape image to fit max dimension', () => {
      const result = calculateResizeDimensions(2000, 1500, 1568);
      expect(result.width).toBe(1568);
      expect(result.height).toBe(1176); // Maintain aspect ratio
    });

    it('should resize portrait image to fit max dimension', () => {
      const result = calculateResizeDimensions(1500, 2000, 1568);
      expect(result.width).toBe(1176);
      expect(result.height).toBe(1568);
    });

    it('should resize square image correctly', () => {
      const result = calculateResizeDimensions(3000, 3000, 1568);
      expect(result.width).toBe(1568);
      expect(result.height).toBe(1568);
    });
  });

  describe('exceedsLimits', () => {
    it('should return false for small images', () => {
      expect(exceedsLimits(800, 600, 100000)).toBe(false);
    });

    it('should return true if dimension exceeds max', () => {
      expect(exceedsLimits(9000, 600, 100000)).toBe(true);
    });

    it('should return true if file size exceeds target', () => {
      expect(exceedsLimits(800, 600, 1000000)).toBe(true);
    });
  });

  describe('estimateTokenCost', () => {
    it('should calculate token cost correctly', () => {
      // Formula: (width × height) / 750
      expect(estimateTokenCost(750, 750)).toBe(750);
      expect(estimateTokenCost(1500, 1500)).toBe(3000);
      expect(estimateTokenCost(1568, 1568)).toBe(3279); // ceil(2458624/750)
    });
  });

  describe('getImageInfo', () => {
    it('should return correct metadata for small image', async () => {
      const info = await getImageInfo(testImageSmall);
      expect(info.width).toBe(100);
      expect(info.height).toBe(100);
      expect(info.format).toBe('png');
      expect(info.size).toBeGreaterThan(0);
    });

    it('should return correct metadata for large image', async () => {
      const info = await getImageInfo(testImageLarge);
      expect(info.width).toBe(2000);
      expect(info.height).toBe(1500);
      expect(info.format).toBe('png');
    });
  });

  describe('processImage', () => {
    it('should process small image with minimal changes', async () => {
      const result = await processImage(testImageSmall);

      expect(result.mimeType).toBe('image/jpeg');
      expect(result.base64).toBeTruthy();
      expect(result.buffer).toBeInstanceOf(Buffer);

      // Small image should not be resized
      expect(result.transformInfo.resized).toBe(false);
      expect(result.transformInfo.finalWidth).toBe(100);
      expect(result.transformInfo.finalHeight).toBe(100);
    });

    it('should resize large image to optimal dimension', async () => {
      const result = await processImage(testImageLarge);

      expect(result.transformInfo.resized).toBe(true);
      expect(result.transformInfo.originalWidth).toBe(2000);
      expect(result.transformInfo.originalHeight).toBe(1500);

      // Should be resized to fit within optimal (1568px)
      const maxDim = Math.max(
        result.transformInfo.finalWidth,
        result.transformInfo.finalHeight
      );
      expect(maxDim).toBeLessThanOrEqual(LLM_LIMITS.optimalDimension);
    });

    it('should resize huge image below hard limit', async () => {
      const result = await processImage(testImageHuge);

      expect(result.transformInfo.resized).toBe(true);
      expect(result.transformInfo.originalWidth).toBe(9000);
      expect(result.transformInfo.originalHeight).toBe(6000);

      // Must be resized below hard limit
      const maxDim = Math.max(
        result.transformInfo.finalWidth,
        result.transformInfo.finalHeight
      );
      expect(maxDim).toBeLessThanOrEqual(LLM_LIMITS.maxDimension);
      // Should actually be resized to optimal, not just below max
      expect(maxDim).toBeLessThanOrEqual(LLM_LIMITS.optimalDimension);
    });

    it('should convert PNG to JPEG', async () => {
      const result = await processImage(testImageSmall);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.transformInfo.compressed).toBe(true);
    });

    it('should produce valid base64', async () => {
      const result = await processImage(testImageSmall);

      // Verify base64 is valid by decoding it
      const decoded = Buffer.from(result.base64, 'base64');
      expect(decoded.length).toBeGreaterThan(0);
      expect(decoded.length).toBe(result.buffer.length);
    });

    it('should track transforms applied', async () => {
      const result = await processImage(testImageLarge);

      expect(result.transformInfo.transforms).toBeInstanceOf(Array);
      expect(result.transformInfo.transforms.length).toBeGreaterThan(0);

      // Should have resize transform
      const hasResizeTransform = result.transformInfo.transforms.some(
        (t) => t.includes('resize')
      );
      expect(hasResizeTransform).toBe(true);
    });

    it('should respect custom maxDimension option', async () => {
      const result = await processImage(testImageLarge, {
        maxDimension: 800,
      });

      const maxDim = Math.max(
        result.transformInfo.finalWidth,
        result.transformInfo.finalHeight
      );
      expect(maxDim).toBeLessThanOrEqual(800);
    });

    it('should keep file size within target', async () => {
      const result = await processImage(testImageLarge);

      // File size should be within target (with some tolerance)
      expect(result.transformInfo.finalSize).toBeLessThanOrEqual(
        LLM_LIMITS.targetSize * 1.1 // 10% tolerance
      );
    });
  });
});
