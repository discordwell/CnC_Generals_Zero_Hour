import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { AssetManager } from './asset-manager.js';
import { AssetFetchError, AssetIntegrityError } from './errors.js';
import { sha256Hex } from './hash.js';
import type { ConversionManifest } from '@generals/core';

// Helper: create a Response-like mock
function mockFetchResponse(body: string | ArrayBuffer, status = 200): Response {
  const data = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-length': String(data.byteLength) }),
    text: () => Promise.resolve(typeof body === 'string' ? body : new TextDecoder().decode(data)),
    arrayBuffer: () => Promise.resolve(data.buffer as ArrayBuffer),
    json: () => Promise.resolve(JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(data))),
    body: null, // Disable streaming in tests for simplicity
  } as unknown as Response;
}

function makeManifest(entries: ConversionManifest['entries']): ConversionManifest {
  return {
    version: 1,
    generatedAt: '2025-01-01T00:00:00.000Z',
    entryCount: entries.length,
    entries,
  };
}

describe('AssetManager', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  const mapJSON = JSON.stringify({ heightmap: { width: 64, height: 64 } });
  let mapHash: string;

  beforeEach(async () => {
    mapHash = await sha256Hex(new TextEncoder().encode(mapJSON).buffer as ArrayBuffer);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function createManager(opts: {
    manifestEntries?: ConversionManifest['entries'];
    manifest404?: boolean;
    cacheEnabled?: boolean;
  } = {}) {
    const { manifestEntries = [], manifest404 = false, cacheEnabled = false } = opts;

    const manifest = makeManifest(manifestEntries);

    fetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('manifest.json')) {
        if (manifest404) {
          return Promise.resolve(mockFetchResponse('', 404));
        }
        return Promise.resolve(mockFetchResponse(JSON.stringify(manifest)));
      }
      if (typeof url === 'string' && url.includes('maps/Alpine.json')) {
        return Promise.resolve(mockFetchResponse(mapJSON));
      }
      return Promise.resolve(mockFetchResponse('', 404));
    });

    return new AssetManager({
      cacheEnabled,
      integrityChecks: true,
      dbName: 'test-am-' + Math.random(),
    });
  }

  describe('init', () => {
    it('loads manifest on init', async () => {
      const am = createManager({ manifestEntries: [] });
      await am.init();
      expect(am.hasManifest).toBe(true);
      am.dispose();
    });

    it('sets hasManifest=false on 404', async () => {
      const am = createManager({ manifest404: true });
      await am.init();
      expect(am.hasManifest).toBe(false);
      am.dispose();
    });
  });

  describe('loadJSON', () => {
    it('loads and parses JSON', async () => {
      const am = createManager();
      await am.init();

      const handle = await am.loadJSON<{ heightmap: { width: number } }>('maps/Alpine.json');
      expect(handle.data.heightmap.width).toBe(64);
      expect(handle.path).toBe('maps/Alpine.json');
      expect(handle.cached).toBe(false);

      am.dispose();
    });
  });

  describe('loadArrayBuffer', () => {
    it('loads raw ArrayBuffer', async () => {
      const am = createManager();
      await am.init();

      const handle = await am.loadArrayBuffer('maps/Alpine.json');
      const text = new TextDecoder().decode(handle.data);
      expect(text).toBe(mapJSON);

      am.dispose();
    });
  });

  describe('integrity checks', () => {
    it('passes when hash matches', async () => {
      const am = createManager({
        manifestEntries: [{
          sourcePath: 'maps/Alpine.map',
          sourceHash: 'src-hash',
          outputPath: 'maps/Alpine.json',
          outputHash: mapHash,
          converter: 'map-converter',
          converterVersion: '1.0.0',
          timestamp: '2025-01-01T00:00:00.000Z',
        }],
      });
      await am.init();

      const handle = await am.loadJSON('maps/Alpine.json');
      expect(handle.hash).toBe(mapHash);

      am.dispose();
    });

    it('throws AssetIntegrityError on hash mismatch', async () => {
      const am = createManager({
        manifestEntries: [{
          sourcePath: 'maps/Alpine.map',
          sourceHash: 'src-hash',
          outputPath: 'maps/Alpine.json',
          outputHash: 'wrong-hash',
          converter: 'map-converter',
          converterVersion: '1.0.0',
          timestamp: '2025-01-01T00:00:00.000Z',
        }],
      });
      await am.init();

      await expect(am.loadJSON('maps/Alpine.json')).rejects.toThrow(AssetIntegrityError);

      am.dispose();
    });
  });

  describe('fetch errors', () => {
    it('throws AssetFetchError on HTTP error', async () => {
      const am = createManager();
      await am.init();

      fetchMock.mockImplementation((_url: string) => {
        return Promise.resolve(mockFetchResponse('', 500));
      });

      await expect(am.loadArrayBuffer('bad/path')).rejects.toThrow(AssetFetchError);

      am.dispose();
    });

    it('throws AssetFetchError on network failure', async () => {
      const am = createManager();
      await am.init();

      fetchMock.mockImplementation(() => Promise.reject(new TypeError('Network error')));

      await expect(am.loadArrayBuffer('bad/path')).rejects.toThrow(AssetFetchError);

      am.dispose();
    });
  });

  describe('in-flight deduplication', () => {
    it('deduplicates simultaneous requests for same path', async () => {
      const am = createManager();
      await am.init();

      // Track how many fetch calls hit the asset URL
      let assetFetchCount = 0;
      fetchMock.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('maps/Alpine.json')) {
          assetFetchCount++;
          return Promise.resolve(mockFetchResponse(mapJSON));
        }
        return Promise.resolve(mockFetchResponse('', 404));
      });

      // Fire two loads simultaneously
      const [h1, h2] = await Promise.all([
        am.loadArrayBuffer('maps/Alpine.json'),
        am.loadArrayBuffer('maps/Alpine.json'),
      ]);

      expect(assetFetchCount).toBe(1);
      expect(h1.data).toBe(h2.data); // Same ArrayBuffer instance

      am.dispose();
    });
  });

  describe('IndexedDB caching', () => {
    it('serves from cache on second load', async () => {
      const am = createManager({
        cacheEnabled: true,
        manifestEntries: [{
          sourcePath: 'maps/Alpine.map',
          sourceHash: 'src-hash',
          outputPath: 'maps/Alpine.json',
          outputHash: mapHash,
          converter: 'map-converter',
          converterVersion: '1.0.0',
          timestamp: '2025-01-01T00:00:00.000Z',
        }],
      });
      await am.init();

      // First load — from network
      const h1 = await am.loadJSON('maps/Alpine.json');
      expect(h1.cached).toBe(false);

      // Wait for fire-and-forget cache write
      await new Promise((r) => setTimeout(r, 50));

      // Second load — should come from cache
      const h2 = await am.loadJSON<{ heightmap: { width: number } }>('maps/Alpine.json');
      expect(h2.cached).toBe(true);
      expect(h2.data.heightmap.width).toBe(64);

      am.dispose();
    });
  });

  describe('loadBatch', () => {
    it('loads multiple assets in parallel', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('manifest.json')) {
          return Promise.resolve(mockFetchResponse(JSON.stringify(makeManifest([]))));
        }
        return Promise.resolve(mockFetchResponse(mapJSON));
      });

      const am = new AssetManager({
        cacheEnabled: false,
        integrityChecks: false,
      });
      await am.init();

      const progress = vi.fn();
      const handles = await am.loadBatch(['a.json', 'b.json', 'c.json'], progress);

      expect(handles).toHaveLength(3);
      expect(progress).toHaveBeenCalledTimes(3);

      am.dispose();
    });
  });

  describe('baseUrl resolution', () => {
    it('prepends baseUrl to paths', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('manifest.json')) {
          return Promise.resolve(mockFetchResponse(JSON.stringify(makeManifest([]))));
        }
        return Promise.resolve(mockFetchResponse(mapJSON));
      });

      const am = new AssetManager({
        baseUrl: 'https://cdn.example.com/assets',
        cacheEnabled: false,
        integrityChecks: false,
      });
      await am.init();

      await am.loadArrayBuffer('maps/Alpine.json');

      // Check that fetch was called with the full URL
      const calls = fetchMock.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('https://cdn.example.com/assets/maps/Alpine.json');

      am.dispose();
    });
  });

  describe('dispose', () => {
    it('cleans up state', async () => {
      const am = createManager();
      await am.init();
      expect(am.hasManifest).toBe(true);

      am.dispose();
      expect(am.hasManifest).toBe(false);
    });
  });
});
