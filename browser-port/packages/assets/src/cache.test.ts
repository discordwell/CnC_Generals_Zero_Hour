import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { CacheStore } from './cache.js';

describe('CacheStore', () => {
  let cache: CacheStore;

  beforeEach(async () => {
    cache = new CacheStore('test-cache-' + Math.random(), 1024);
    await cache.open();
  });

  afterEach(() => {
    cache.close();
  });

  function makeBuffer(size: number, fill = 0): ArrayBuffer {
    const buf = new ArrayBuffer(size);
    new Uint8Array(buf).fill(fill);
    return buf;
  }

  it('stores and retrieves an entry', async () => {
    const data = makeBuffer(64, 0xab);
    await cache.put('test/file.bin', data, 'hash123');

    const entry = await cache.get('test/file.bin');
    expect(entry).not.toBeNull();
    expect(entry!.path).toBe('test/file.bin');
    expect(entry!.hash).toBe('hash123');
    expect(entry!.size).toBe(64);
    expect(new Uint8Array(entry!.data)[0]).toBe(0xab);
  });

  it('returns null for missing entries', async () => {
    const entry = await cache.get('nonexistent');
    expect(entry).toBeNull();
  });

  it('invalidates on hash mismatch', async () => {
    const data = makeBuffer(32);
    await cache.put('file.bin', data, 'old-hash');

    // Request with new hash → stale entry deleted, returns null
    const entry = await cache.get('file.bin', 'new-hash');
    expect(entry).toBeNull();

    // Verify the stale entry is gone
    const gone = await cache.get('file.bin');
    expect(gone).toBeNull();
  });

  it('returns entry when hash matches', async () => {
    const data = makeBuffer(32);
    await cache.put('file.bin', data, 'correct-hash');

    const entry = await cache.get('file.bin', 'correct-hash');
    expect(entry).not.toBeNull();
    expect(entry!.hash).toBe('correct-hash');
  });

  it('overwrites existing entry on put', async () => {
    await cache.put('file.bin', makeBuffer(32, 1), 'hash-v1');
    await cache.put('file.bin', makeBuffer(64, 2), 'hash-v2');

    const entry = await cache.get('file.bin');
    expect(entry!.hash).toBe('hash-v2');
    expect(entry!.size).toBe(64);
    expect(new Uint8Array(entry!.data)[0]).toBe(2);
  });

  it('deletes a specific entry', async () => {
    await cache.put('a.bin', makeBuffer(16), 'h1');
    await cache.put('b.bin', makeBuffer(16), 'h2');

    await cache.delete('a.bin');

    expect(await cache.get('a.bin')).toBeNull();
    expect(await cache.get('b.bin')).not.toBeNull();
  });

  it('clears all entries', async () => {
    await cache.put('a.bin', makeBuffer(16), 'h1');
    await cache.put('b.bin', makeBuffer(16), 'h2');

    await cache.clear();

    expect(await cache.get('a.bin')).toBeNull();
    expect(await cache.get('b.bin')).toBeNull();
  });

  it('evicts oldest entries when over max size', async () => {
    // Max size is 1024. Put entries that total > 1024
    const cache512 = new CacheStore('test-evict-' + Math.random(), 1024);
    await cache512.open();

    await cache512.put('old.bin', makeBuffer(400), 'h1');
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));
    await cache512.put('mid.bin', makeBuffer(400), 'h2');
    await new Promise((r) => setTimeout(r, 10));
    await cache512.put('new.bin', makeBuffer(400), 'h3');

    // Wait for fire-and-forget eviction
    await new Promise((r) => setTimeout(r, 50));

    // Oldest entry should be evicted (total was 1200, needed to get to 1024)
    const oldEntry = await cache512.get('old.bin');
    expect(oldEntry).toBeNull();

    // Newer entries should survive
    expect(await cache512.get('mid.bin')).not.toBeNull();
    expect(await cache512.get('new.bin')).not.toBeNull();

    cache512.close();
  });

  it('throws if not opened', async () => {
    const unopened = new CacheStore('nope', 1024);
    await expect(unopened.get('x')).rejects.toThrow('not open');
  });
});
