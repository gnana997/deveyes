/**
 * Viewport presets for common device sizes
 * Used for responsive screenshot capture
 */

export interface ViewportConfig {
  /** Viewport width in pixels */
  width: number;
  /** Viewport height in pixels */
  height: number;
  /** Device scale factor (1x, 2x, 3x for retina) */
  deviceScaleFactor: number;
  /** Whether device is mobile (enables touch) */
  isMobile: boolean;
  /** Whether device has touch support */
  hasTouch: boolean;
  /** User agent string (optional) */
  userAgent?: string;
}

export interface ViewportPreset extends ViewportConfig {
  /** Human-readable name */
  name: string;
  /** Description of the device */
  description: string;
}

/**
 * Predefined viewport presets for common devices
 */
export const VIEWPORT_PRESETS: Record<string, ViewportPreset> = {
  mobile: {
    name: 'mobile',
    description: 'iPhone SE / Standard mobile',
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  'mobile-lg': {
    name: 'mobile-lg',
    description: 'iPhone 14 Pro Max / Large mobile',
    width: 428,
    height: 926,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  tablet: {
    name: 'tablet',
    description: 'iPad / Standard tablet',
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  'tablet-landscape': {
    name: 'tablet-landscape',
    description: 'iPad Landscape',
    width: 1024,
    height: 768,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  desktop: {
    name: 'desktop',
    description: 'Standard laptop (1440x900)',
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  'desktop-lg': {
    name: 'desktop-lg',
    description: 'Full HD monitor (1920x1080)',
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  'desktop-hd': {
    name: 'desktop-hd',
    description: '2K monitor (2560x1440)',
    width: 2560,
    height: 1440,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
} as const;

/**
 * Default viewport preset name
 */
export const DEFAULT_VIEWPORT = 'desktop';

/**
 * Parse viewport string to ViewportConfig
 * Accepts preset names (e.g., "mobile", "desktop") or custom dimensions (e.g., "1280x720")
 */
export function parseViewport(viewport: string): ViewportConfig {
  // Check if it's a preset name
  const preset = VIEWPORT_PRESETS[viewport.toLowerCase()];
  if (preset) {
    return preset;
  }

  // Try to parse as WxH format (e.g., "1280x720" or "1280x720@2x")
  const match = viewport.match(/^(\d+)x(\d+)(?:@(\d+)x)?$/i);
  if (match) {
    const width = parseInt(match[1], 10);
    const height = parseInt(match[2], 10);
    const scale = match[3] ? parseInt(match[3], 10) : 1;

    return {
      width,
      height,
      deviceScaleFactor: scale,
      isMobile: width < 768,
      hasTouch: width < 768,
    };
  }

  // Fall back to default
  console.warn(`Unknown viewport "${viewport}", using default: ${DEFAULT_VIEWPORT}`);
  return VIEWPORT_PRESETS[DEFAULT_VIEWPORT];
}

/**
 * Get list of available viewport preset names
 */
export function getAvailableViewports(): string[] {
  return Object.keys(VIEWPORT_PRESETS);
}

/**
 * Get viewport preset by name
 */
export function getViewportPreset(name: string): ViewportPreset | undefined {
  return VIEWPORT_PRESETS[name.toLowerCase()];
}
