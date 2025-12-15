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
  /** Is this a full-page capture? Allows larger files and maintains readability */
  isFullPage?: boolean;
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
 * Calculate resize dimensions for full-page captures
 * Prioritizes maintaining readable width over strict dimension limits
 */
export function calculateFullPageDimensions(
  width: number,
  height: number,
  minWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const aspectRatio = width / height;

  // If height exceeds max, scale down but maintain minimum width
  if (height > maxHeight) {
    const scaledWidth = Math.round(maxHeight * aspectRatio);
    // If scaled width would be too small, prioritize width
    if (scaledWidth < minWidth) {
      const newHeight = Math.round(minWidth / aspectRatio);
      return { width: minWidth, height: Math.min(newHeight, maxHeight) };
    }
    return { width: scaledWidth, height: maxHeight };
  }

  // If width is already below minimum, scale up to minimum
  if (width < minWidth) {
    const newHeight = Math.round(minWidth / aspectRatio);
    return { width: minWidth, height: newHeight };
  }

  return { width, height };
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
    quality: initialQuality = IMAGE_DEFAULTS.jpegQuality,
    isFullPage = false,
  } = options;

  // Use larger target size for full-page captures
  const targetSize = isFullPage ? LLM_LIMITS.fullPageTargetSize : (options.targetSize ?? LLM_LIMITS.targetSize);

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

  const maxCurrentDim = Math.max(currentWidth, currentHeight);
  const isVeryTall = currentHeight > currentWidth * 3; // Aspect ratio > 3:1

  // Full-page handling: prioritize readability over dimension limits
  if (isFullPage && isVeryTall) {
    // For tall pages, maintain readable width and constrain height
    const newDims = calculateFullPageDimensions(
      currentWidth,
      currentHeight,
      LLM_LIMITS.minReadableWidth,
      LLM_LIMITS.maxDimension - 500 // Leave some headroom
    );

    if (newDims.width !== currentWidth || newDims.height !== currentHeight) {
      currentBuffer = await sharp(currentBuffer)
        .resize(newDims.width, newDims.height, {
          fit: 'fill', // Use fill to allow aspect ratio change for very tall images
          withoutEnlargement: false, // Allow upscaling width if needed
        })
        .toBuffer();
      currentWidth = newDims.width;
      currentHeight = newDims.height;
      resized = true;
      transforms.push(`fullpage_resize_${originalWidth}x${originalHeight}_to_${currentWidth}x${currentHeight}`);
    }
  }
  // Standard handling for non-full-page or normal aspect ratios
  else if (maxCurrentDim > LLM_LIMITS.maxDimension) {
    // Step 1: Check if dimensions exceed hard limit (8000px)
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
  else if (maxCurrentDim > maxDimension && !isFullPage) {
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

  // Step 5: If still too large, force additional resize (but respect min width for full-page)
  if (currentSize > targetSize) {
    const reductionRatio = Math.sqrt(targetSize / currentSize);
    let newWidth = Math.round(currentWidth * reductionRatio);
    let newHeight = Math.round(currentHeight * reductionRatio);

    // For full-page captures, don't go below minimum readable width
    if (isFullPage && newWidth < LLM_LIMITS.minReadableWidth) {
      newWidth = LLM_LIMITS.minReadableWidth;
      newHeight = Math.round(currentHeight * (newWidth / currentWidth));
    }

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
