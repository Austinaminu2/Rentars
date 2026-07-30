/**
 * Validates the PWA manifest.json contains required fields for installability.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const manifestPath = join(process.cwd(), 'public', 'manifest.json');

describe('PWA manifest.json', () => {
  let manifest: Record<string, unknown>;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    manifest = {};
  }

  it('exists and is valid JSON', () => {
    expect(manifest).not.toEqual({});
  });

  it('has required name field', () => {
    expect(typeof manifest.name).toBe('string');
    expect((manifest.name as string).length).toBeGreaterThan(0);
  });

  it('has required short_name field', () => {
    expect(typeof manifest.short_name).toBe('string');
    expect((manifest.short_name as string).length).toBeGreaterThan(0);
  });

  it('has start_url', () => {
    expect(manifest.start_url).toBeTruthy();
  });

  it('has display set to standalone or fullscreen', () => {
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest.display);
  });

  it('has theme_color', () => {
    expect(typeof manifest.theme_color).toBe('string');
  });

  it('has background_color', () => {
    expect(typeof manifest.background_color).toBe('string');
  });

  it('has icons array with at least one entry', () => {
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect((manifest.icons as unknown[]).length).toBeGreaterThan(0);
  });

  it('has a 192x192 icon', () => {
    const icons = manifest.icons as Array<{ sizes: string; src: string }>;
    const has192 = icons.some((icon) => icon.sizes === '192x192');
    expect(has192).toBe(true);
  });

  it('has a 512x512 icon', () => {
    const icons = manifest.icons as Array<{ sizes: string; src: string }>;
    const has512 = icons.some((icon) => icon.sizes === '512x512');
    expect(has512).toBe(true);
  });
});
