import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RuntimeManifest, loadManifest } from './manifest-loader.js';
import { ManifestLoadError } from './errors.js';
import type { ConversionManifest } from '@generals/core';

const VALID_MANIFEST: ConversionManifest = {
  version: 1,
  generatedAt: '2025-01-01T00:00:00.000Z',
  entryCount: 2,
  entries: [
    {
      sourcePath: 'maps/Alpine.map',
      sourceHash: 'aaa111',
      outputPath: 'assets/maps/Alpine.json',
      outputHash: 'bbb222',
      converter: 'map-converter',
      converterVersion: '1.0.0',
      timestamp: '2025-01-01T00:00:00.000Z',
    },
    {
      sourcePath: 'textures/grass.tga',
      sourceHash: 'ccc333',
      outputPath: 'assets/textures/grass.png',
      outputHash: 'ddd444',
      converter: 'texture-converter',
      converterVersion: '1.0.0',
      timestamp: '2025-01-01T00:00:00.000Z',
    },
  ],
};

describe('RuntimeManifest', () => {
  const manifest = new RuntimeManifest(VALID_MANIFEST);

  it('indexes entries by output path', () => {
    const entry = manifest.getByOutputPath('assets/maps/Alpine.json');
    expect(entry).toBeDefined();
    expect(entry!.sourcePath).toBe('maps/Alpine.map');
  });

  it('indexes entries by source path', () => {
    const entry = manifest.getBySourcePath('textures/grass.tga');
    expect(entry).toBeDefined();
    expect(entry!.outputPath).toBe('assets/textures/grass.png');
  });

  it('returns undefined for missing output path', () => {
    expect(manifest.getByOutputPath('nonexistent')).toBeUndefined();
  });

  it('returns undefined for missing source path', () => {
    expect(manifest.getBySourcePath('nonexistent')).toBeUndefined();
  });

  it('checks existence with hasOutputPath', () => {
    expect(manifest.hasOutputPath('assets/maps/Alpine.json')).toBe(true);
    expect(manifest.hasOutputPath('missing')).toBe(false);
  });

  it('lists all output paths', () => {
    const paths = manifest.getOutputPaths();
    expect(paths).toHaveLength(2);
    expect(paths).toContain('assets/maps/Alpine.json');
    expect(paths).toContain('assets/textures/grass.png');
  });

  it('reports correct size', () => {
    expect(manifest.size).toBe(2);
  });

  it('exposes raw manifest', () => {
    expect(manifest.raw).toBe(VALID_MANIFEST);
  });
});

describe('loadManifest', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads and parses a valid manifest', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(VALID_MANIFEST)),
    });

    const result = await loadManifest('/assets/manifest.json');
    expect(result).toBeInstanceOf(RuntimeManifest);
    expect(result!.size).toBe(2);
  });

  it('returns null on 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve(''),
    });

    const result = await loadManifest('/assets/manifest.json');
    expect(result).toBeNull();
  });

  it('throws ManifestLoadError on non-404 HTTP errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(''),
    });

    await expect(loadManifest('/assets/manifest.json')).rejects.toThrow(ManifestLoadError);
    await expect(loadManifest('/assets/manifest.json')).rejects.toThrow('HTTP 500');
  });

  it('throws ManifestLoadError on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(loadManifest('/assets/manifest.json')).rejects.toThrow(ManifestLoadError);
    await expect(loadManifest('/assets/manifest.json')).rejects.toThrow('Failed to fetch');
  });

  it('throws ManifestLoadError on invalid JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('not json'),
    });

    await expect(loadManifest('/assets/manifest.json')).rejects.toThrow(ManifestLoadError);
    await expect(loadManifest('/assets/manifest.json')).rejects.toThrow('Invalid manifest JSON');
  });

  it('throws ManifestLoadError on valid JSON but wrong schema', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ version: 2, entries: [] })),
    });

    await expect(loadManifest('/assets/manifest.json')).rejects.toThrow(ManifestLoadError);
  });
});
