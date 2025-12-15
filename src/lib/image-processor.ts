/**
 * Image Processor
 * Sharp-based image optimization for LLM compatibility
 */

import sharp from 'sharp';
import { LLM_LIMITS, IMAGE_DEFAULTS } from '../config.js';

/**
 * Metadata about the original image
 */
export interface ImageMetadata {
  width: number;
  height: number;
  size: number;
  format: string;
}

/**
 * Information about transforms applied
 */
export interface TransformInfo {
  resized: boolean;
  compressed: boolean;
  originalWidth: number;
  originalHeight: number;
  originalSize: number;
  finalWidth: number;
  finalHeight: number;
  finalSize: number;
  quality: number;
  transforms: string[];
}

/**
 * Result of image processing
 */
export interface ProcessedImage {
  /** Processed image as Buffer */
  buffer: Buffer;
  /** Base64 encoded image */
  base64: string;
  /** MIME type of the output image */
  mimeType: string;
  /** Information about transforms applied */
  transformInfo: TransformInfo;
}

/**
 * Options for image processing
 */
export interface ProcessImageOptions {
  /** Target maximum dimension (default: LLM optimal) */
  maxDimension?: number;
  /** Target file size in bytes */
  targetSize?: number;
  /** Initial JPEG quality */
  quality?: number;
  /** Force resize even if within limits */
  forceResize?: boolean;
}

/**
 * Check if image dimensions exceed LLM limits
 */
export function exceedsLimits(width: number, height: number, size: number): boolean {
  const maxDim = Math.max(width, height);
  return (
    maxDim > LLM_LIMITS.maxDimension ||
    size > LLM_LIMITS.targetSize
  );
}

/**
 * Calculate resize dimensions to fit within target
 */
export function calculateResizeDimensions(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  const maxDim = Math.max(width, height);

  if (maxDim <= maxDimension) {
    return { width, height };
  }

  const ratio = maxDimension / maxDim;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

/**
 * Process an image buffer for LLM compatibility
 * Applies resize and compression as needed
 */
export async function processImage(
  inputBuffer: Buffer,
  options: ProcessImageOptions = {}
): Promise<ProcessedImage> {
  const {
    maxDimension = LLM_LIMITS.optimalDimension,
    targetSize = LLM_LIMITS.targetSize,
    quality: initialQuality = IMAGE_DEFAULTS.jpegQuality,
  } = options;

  const transforms: string[] = [];

  // Get original image metadata
  const originalMeta = await sharp(inputBuffer).metadata();
  const originalWidth = originalMeta.width ?? 0;
  const originalHeight = originalMeta.height ?? 0;
  const originalSize = inputBuffer.length;
  const originalFormat = originalMeta.format ?? 'unknown';

  let currentBuffer = inputBuffer;
  let currentWidth = originalWidth;
  let currentHeight = originalHeight;
  let quality = initialQuality;
  let resized = false;
  let compressed = false;

  // Step 1: Check if dimensions exceed hard limit (8000px)
  const maxCurrentDim = Math.max(currentWidth, currentHeight);
  if (maxCurrentDim > LLM_LIMITS.maxDimension) {
    const newDims = calculateResizeDimensions(
      currentWidth,
      currentHeight,
      LLM_LIMITS.optimalDimension // Resize to optimal, not just below max
    );
    currentBuffer = await sharp(currentBuffer)
      .resize(newDims.width, newDims.height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer();
    currentWidth = newDims.width;
    currentHeight = newDims.height;
    resized = true;
    transforms.push(`resized_from_${originalWidth}x${originalHeight}_to_${currentWidth}x${currentHeight}`);
  }
  // Step 2: Check if dimensions exceed optimal (1568px)
  else if (maxCurrentDim > maxDimension) {
    const newDims = calculateResizeDimensions(currentWidth, currentHeight, maxDimension);
    currentBuffer = await sharp(currentBuffer)
      .resize(newDims.width, newDims.height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer();
    currentWidth = newDims.width;
    currentHeight = newDims.height;
    resized = true;
    transforms.push(`resized_to_optimal_${currentWidth}x${currentHeight}`);
  }

  // Step 3: Convert to JPEG and compress
  currentBuffer = await sharp(currentBuffer)
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  let currentSize = currentBuffer.length;

  if (originalFormat !== 'jpeg' || quality < initialQuality) {
    compressed = true;
    transforms.push(`jpeg_quality_${quality}`);
  }

  // Step 4: Iteratively reduce quality if still too large
  while (currentSize > targetSize && quality > IMAGE_DEFAULTS.minJpegQuality) {
    quality -= IMAGE_DEFAULTS.qualityStep;
    currentBuffer = await sharp(currentBuffer)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    currentSize = currentBuffer.length;
    compressed = true;

    // Update transforms
    const qualityTransformIndex = transforms.findIndex(t => t.startsWith('jpeg_quality_'));
    if (qualityTransformIndex >= 0) {
      transforms[qualityTransformIndex] = `jpeg_quality_${quality}`;
    } else {
      transforms.push(`jpeg_quality_${quality}`);
    }
  }

  // Step 5: If still too large, force additional resize
  if (currentSize > targetSize) {
    const reductionRatio = Math.sqrt(targetSize / currentSize);
    const newWidth = Math.round(currentWidth * reductionRatio);
    const newHeight = Math.round(currentHeight * reductionRatio);

    currentBuffer = await sharp(currentBuffer)
      .resize(newWidth, newHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    currentWidth = newWidth;
    currentHeight = newHeight;
    currentSize = currentBuffer.length;
    resized = true;
    transforms.push(`forced_resize_to_${currentWidth}x${currentHeight}`);
  }

  // Get final metadata
  const finalMeta = await sharp(currentBuffer).metadata();
  const finalWidth = finalMeta.width ?? currentWidth;
  const finalHeight = finalMeta.height ?? currentHeight;
  const finalSize = currentBuffer.length;

  // Create base64 encoding
  const base64 = currentBuffer.toString('base64');

  return {
    buffer: currentBuffer,
    base64,
    mimeType: 'image/jpeg',
    transformInfo: {
      resized,
      compressed,
      originalWidth,
      originalHeight,
      originalSize,
      finalWidth,
      finalHeight,
      finalSize,
      quality,
      transforms,
    },
  };
}

/**
 * Get image dimensions and size without processing
 */
export async function getImageInfo(buffer: Buffer): Promise<ImageMetadata> {
  const meta = await sharp(buffer).metadata();
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    size: buffer.length,
    format: meta.format ?? 'unknown',
  };
}

/**
 * Estimate token cost for an image based on Claude's formula
 * Tokens = (width × height) / 750
 */
export function estimateTokenCost(width: number, height: number): number {
  return Math.ceil((width * height) / LLM_LIMITS.tokenDivisor);
}
