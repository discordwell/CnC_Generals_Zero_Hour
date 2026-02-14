import { describe, it, expect } from 'vitest';
import {
  createManifest,
  addManifestEntry,
  needsConversion,
  serializeManifest,
  parseManifest,
} from './conversion-manifest.js';
import type { ManifestEntry } from './conversion-manifest.js';

function makeEntry(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    sourcePath: 'textures/grass.tga',
    sourceHash: 'abc123',
    outputPath: 'textures/grass.rgba',
    outputHash: 'def456',
    converter: 'texture-converter',
    converterVersion: '1.0.0',
    timestamp: '2026-02-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('ConversionManifest', () => {
  it('creates an empty manifest', () => {
    const m = createManifest();
    expect(m.version).toBe(1);
    expect(m.entryCount).toBe(0);
    expect(m.entries).toHaveLength(0);
    expect(m.generatedAt).toBeDefined();
  });

  it('adds entries and updates count', () => {
    const m = createManifest();
    addManifestEntry(m, makeEntry());
    addManifestEntry(m, makeEntry({ sourcePath: 'models/tank.w3d' }));

    expect(m.entryCount).toBe(2);
    expect(m.entries).toHaveLength(2);
    expect(m.entries[0]!.sourcePath).toBe('textures/grass.tga');
    expect(m.entries[1]!.sourcePath).toBe('models/tank.w3d');
  });

  it('detects when conversion is needed', () => {
    const m = createManifest();
    addManifestEntry(m, makeEntry({ sourcePath: 'a.tga', sourceHash: 'hash1', converterVersion: '1.0.0' }));

    expect(needsConversion(m, 'a.tga', 'hash1')).toBe(false);
    expect(needsConversion(m, 'a.tga', 'hash2')).toBe(true);
    expect(needsConversion(m, 'b.tga', 'hash1')).toBe(true);
  });

  it('detects when converter version changes', () => {
    const m = createManifest();
    addManifestEntry(m, makeEntry({ sourcePath: 'a.tga', sourceHash: 'hash1', converterVersion: '1.0.0' }));

    expect(needsConversion(m, 'a.tga', 'hash1', '1.0.0')).toBe(false);
    expect(needsConversion(m, 'a.tga', 'hash1', '2.0.0')).toBe(true);
  });

  it('replaces duplicate source paths on add', () => {
    const m = createManifest();
    addManifestEntry(m, makeEntry({ sourcePath: 'a.tga', sourceHash: 'old' }));
    addManifestEntry(m, makeEntry({ sourcePath: 'a.tga', sourceHash: 'new' }));

    expect(m.entries).toHaveLength(1);
    expect(m.entries[0]!.sourceHash).toBe('new');
    expect(m.entryCount).toBe(1);
  });

  it('serializes to deterministic JSON', () => {
    const m = createManifest();
    addManifestEntry(m, makeEntry({ sourcePath: 'z.tga' }));
    addManifestEntry(m, makeEntry({ sourcePath: 'a.tga' }));

    const json = serializeManifest(m);
    const parsed = JSON.parse(json);

    // Entries should be sorted by sourcePath
    expect(parsed.entries[0].sourcePath).toBe('a.tga');
    expect(parsed.entries[1].sourcePath).toBe('z.tga');
  });

  it('round-trips through serialize/parse', () => {
    const m = createManifest();
    addManifestEntry(m, makeEntry());

    const json = serializeManifest(m);
    const restored = parseManifest(json);

    expect(restored).not.toBeNull();
    expect(restored!.version).toBe(1);
    expect(restored!.entries).toHaveLength(1);
    expect(restored!.entries[0]!.sourcePath).toBe('textures/grass.tga');
  });

  it('returns null for invalid JSON', () => {
    expect(parseManifest('not json')).toBeNull();
    expect(parseManifest('{"version": 2}')).toBeNull();
    expect(parseManifest('{"version": 1}')).toBeNull(); // missing entries
    expect(parseManifest('{"version": 1, "entries": "not-an-array"}')).toBeNull();
    expect(parseManifest('{"version": 1, "entries": [{}]}')).toBeNull(); // malformed entry
  });
});
