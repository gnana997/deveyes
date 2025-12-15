/**
 * Viewport Tests
 * Unit tests for viewport presets and parsing
 */

import { describe, it, expect } from 'vitest';
import {
  parseViewport,
  getAvailableViewports,
  getViewportPreset,
  VIEWPORT_PRESETS,
  DEFAULT_VIEWPORT,
} from '../src/lib/viewports.js';

describe('Viewports', () => {
  describe('VIEWPORT_PRESETS', () => {
    it('should have all expected presets', () => {
      const expectedPresets = [
        'mobile',
        'mobile-lg',
        'tablet',
        'tablet-landscape',
        'desktop',
        'desktop-lg',
        'desktop-hd',
      ];

      for (const preset of expectedPresets) {
        expect(VIEWPORT_PRESETS[preset]).toBeDefined();
      }
    });

    it('should have valid dimensions for all presets', () => {
      for (const [name, preset] of Object.entries(VIEWPORT_PRESETS)) {
        expect(preset.width).toBeGreaterThan(0);
        expect(preset.height).toBeGreaterThan(0);
        expect(preset.deviceScaleFactor).toBeGreaterThan(0);
        expect(typeof preset.isMobile).toBe('boolean');
        expect(typeof preset.hasTouch).toBe('boolean');
        expect(preset.name).toBe(name);
      }
    });

    it('should have mobile presets with touch support', () => {
      expect(VIEWPORT_PRESETS.mobile.isMobile).toBe(true);
      expect(VIEWPORT_PRESETS.mobile.hasTouch).toBe(true);
      expect(VIEWPORT_PRESETS['mobile-lg'].isMobile).toBe(true);
      expect(VIEWPORT_PRESETS['mobile-lg'].hasTouch).toBe(true);
    });

    it('should have desktop presets without touch support', () => {
      expect(VIEWPORT_PRESETS.desktop.isMobile).toBe(false);
      expect(VIEWPORT_PRESETS.desktop.hasTouch).toBe(false);
      expect(VIEWPORT_PRESETS['desktop-lg'].isMobile).toBe(false);
      expect(VIEWPORT_PRESETS['desktop-lg'].hasTouch).toBe(false);
    });
  });

  describe('getAvailableViewports', () => {
    it('should return array of viewport names', () => {
      const viewports = getAvailableViewports();
      expect(Array.isArray(viewports)).toBe(true);
      expect(viewports.length).toBeGreaterThan(0);
      expect(viewports).toContain('mobile');
      expect(viewports).toContain('desktop');
    });
  });

  describe('getViewportPreset', () => {
    it('should return preset by name', () => {
      const preset = getViewportPreset('mobile');
      expect(preset).toBeDefined();
      expect(preset?.width).toBe(375);
      expect(preset?.height).toBe(667);
    });

    it('should be case-insensitive', () => {
      const preset1 = getViewportPreset('MOBILE');
      const preset2 = getViewportPreset('Mobile');
      const preset3 = getViewportPreset('mobile');

      expect(preset1).toEqual(preset3);
      expect(preset2).toEqual(preset3);
    });

    it('should return undefined for unknown preset', () => {
      const preset = getViewportPreset('unknown-preset');
      expect(preset).toBeUndefined();
    });
  });

  describe('parseViewport', () => {
    it('should parse preset names', () => {
      const config = parseViewport('mobile');
      expect(config.width).toBe(375);
      expect(config.height).toBe(667);
      expect(config.deviceScaleFactor).toBe(2);
    });

    it('should be case-insensitive for presets', () => {
      const config1 = parseViewport('DESKTOP');
      const config2 = parseViewport('desktop');
      expect(config1.width).toBe(config2.width);
    });

    it('should parse WxH format', () => {
      const config = parseViewport('1280x720');
      expect(config.width).toBe(1280);
      expect(config.height).toBe(720);
      expect(config.deviceScaleFactor).toBe(1);
    });

    it('should parse WxH@Nx format (retina)', () => {
      const config = parseViewport('1280x720@2x');
      expect(config.width).toBe(1280);
      expect(config.height).toBe(720);
      expect(config.deviceScaleFactor).toBe(2);
    });

    it('should set isMobile for small widths', () => {
      const smallConfig = parseViewport('320x480');
      expect(smallConfig.isMobile).toBe(true);
      expect(smallConfig.hasTouch).toBe(true);

      const largeConfig = parseViewport('1920x1080');
      expect(largeConfig.isMobile).toBe(false);
      expect(largeConfig.hasTouch).toBe(false);
    });

    it('should fall back to default for invalid viewport', () => {
      const config = parseViewport('invalid-viewport');
      const defaultConfig = parseViewport(DEFAULT_VIEWPORT);
      expect(config.width).toBe(defaultConfig.width);
      expect(config.height).toBe(defaultConfig.height);
    });

    it('should handle edge cases', () => {
      // Very large dimensions
      const largeConfig = parseViewport('4000x3000');
      expect(largeConfig.width).toBe(4000);
      expect(largeConfig.height).toBe(3000);

      // Small dimensions
      const smallConfig = parseViewport('100x100');
      expect(smallConfig.width).toBe(100);
      expect(smallConfig.height).toBe(100);
    });
  });

  describe('DEFAULT_VIEWPORT', () => {
    it('should be a valid preset name', () => {
      expect(VIEWPORT_PRESETS[DEFAULT_VIEWPORT]).toBeDefined();
    });

    it('should be desktop', () => {
      expect(DEFAULT_VIEWPORT).toBe('desktop');
    });
  });
});
