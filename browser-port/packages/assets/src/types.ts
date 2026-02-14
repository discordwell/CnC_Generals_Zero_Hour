/**
 * Asset system types — runtime loading, caching, and integrity verification.
 */

/** Broad classification of asset types for typed loading. */
export enum AssetType {
  JSON = 'json',
  ArrayBuffer = 'arraybuffer',
  Texture = 'texture',
  Model = 'model',
  Audio = 'audio',
}

/** Handle returned by the asset manager after loading an asset. */
export interface AssetHandle<T = unknown> {
  /** The output path used to load this asset. */
  readonly path: string;
  /** The loaded data. */
  readonly data: T;
  /** SHA-256 hash of the raw bytes (if verified). */
  readonly hash: string | null;
  /** Whether this was served from IndexedDB cache. */
  readonly cached: boolean;
}

/** Progress callback signature. */
export type ProgressCallback = (loaded: number, total: number) => void;

/** Configuration for the AssetManager. */
export interface AssetManagerConfig {
  /** Base URL prepended to all asset paths. Default: '' (relative). */
  baseUrl: string;
  /** URL of the manifest file. Default: 'assets/manifest.json'. */
  manifestUrl: string;
  /** Whether to enable IndexedDB caching. Default: true. */
  cacheEnabled: boolean;
  /** Whether to verify SHA-256 hashes against manifest. Default: true. */
  integrityChecks: boolean;
  /** Maximum cache size in bytes. Default: 256 MB. */
  maxCacheSize: number;
  /** IndexedDB database name. Default: 'generals-assets'. */
  dbName: string;
}

/** Default asset manager configuration. */
export const DEFAULT_CONFIG: AssetManagerConfig = {
  baseUrl: '',
  manifestUrl: 'assets/manifest.json',
  cacheEnabled: true,
  integrityChecks: true,
  maxCacheSize: 256 * 1024 * 1024,
  dbName: 'generals-assets',
};

/** An entry stored in the IndexedDB cache. */
export interface CachedAssetEntry {
  /** The output path (key). */
  path: string;
  /** Raw asset data. */
  data: ArrayBuffer;
  /** SHA-256 hash of the data at write time. */
  hash: string;
  /** Timestamp of last access (for LRU eviction). */
  lastAccessed: number;
  /** Size in bytes. */
  size: number;
}
