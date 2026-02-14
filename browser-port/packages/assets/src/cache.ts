/**
 * IndexedDB cache for converted asset data.
 *
 * Stores ArrayBuffers keyed by output path with hash-based invalidation
 * and LRU eviction when the cache exceeds its size budget.
 */

import type { CachedAssetEntry } from './types.js';

const STORE_NAME = 'assets';

export class CacheStore {
  private db: IDBDatabase | null = null;

  constructor(
    private readonly dbName: string,
    private readonly maxSize: number,
  ) {}

  /** Open (or create) the IndexedDB database. */
  async open(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'path' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Retrieve a cached entry by path.
   * If expectedHash is provided and doesn't match, the stale entry is deleted
   * and null is returned (hash-based invalidation).
   */
  async get(path: string, expectedHash?: string): Promise<CachedAssetEntry | null> {
    const db = this.ensureOpen();

    const entry = await this.txGet(db, path);
    if (!entry) return null;

    // Hash-based invalidation: if the expected hash changed, evict stale entry
    if (expectedHash && entry.hash !== expectedHash) {
      this.txDelete(db, path).catch(() => {});
      return null;
    }

    // Update last accessed timestamp (fire-and-forget)
    entry.lastAccessed = Date.now();
    this.txPut(db, entry).catch(() => {});

    return entry;
  }

  /** Store an asset in the cache. Evicts oldest entries if over budget. */
  async put(path: string, data: ArrayBuffer, hash: string): Promise<void> {
    const db = this.ensureOpen();

    const entry: CachedAssetEntry = {
      path,
      data,
      hash,
      lastAccessed: Date.now(),
      size: data.byteLength,
    };

    await this.txPut(db, entry);
    // Evict if over budget (fire-and-forget)
    this.evictIfNeeded(db).catch(() => {});
  }

  /** Delete a single entry. */
  async delete(path: string): Promise<void> {
    const db = this.ensureOpen();
    await this.txDelete(db, path);
  }

  /** Clear all cached entries. */
  async clear(): Promise<void> {
    const db = this.ensureOpen();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /** Close the database connection. */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ===========================================================================
  // Internal helpers
  // ===========================================================================

  private ensureOpen(): IDBDatabase {
    if (!this.db) {
      throw new Error('CacheStore not open. Call open() first.');
    }
    return this.db;
  }

  private txGet(db: IDBDatabase, path: string): Promise<CachedAssetEntry | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(path);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  private txPut(db: IDBDatabase, entry: CachedAssetEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private txDelete(db: IDBDatabase, path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(path);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async evictIfNeeded(db: IDBDatabase): Promise<void> {
    const entries = await this.getAllEntries(db);
    let totalSize = entries.reduce((sum, e) => sum + e.size, 0);

    if (totalSize <= this.maxSize) return;

    // Sort by lastAccessed ascending (oldest first)
    entries.sort((a, b) => a.lastAccessed - b.lastAccessed);

    for (const entry of entries) {
      if (totalSize <= this.maxSize) break;
      await this.txDelete(db, entry.path);
      totalSize -= entry.size;
    }
  }

  private getAllEntries(db: IDBDatabase): Promise<CachedAssetEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
