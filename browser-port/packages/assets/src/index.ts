/**
 * @generals/assets — Runtime asset loading, caching, and integrity verification.
 */

export { AssetType } from './types.js';
export type { AssetHandle, AssetManagerConfig, ProgressCallback, CachedAssetEntry } from './types.js';
export {
  DEFAULT_CONFIG,
  RUNTIME_ASSET_BASE_URL,
  RUNTIME_MANIFEST_FILE,
  RUNTIME_MANIFEST_PUBLIC_PATH,
} from './types.js';

export {
  AssetError,
  AssetNotFoundError,
  AssetFetchError,
  AssetIntegrityError,
  ManifestLoadError,
} from './errors.js';

export { sha256Hex } from './hash.js';
export { RuntimeManifest, loadManifest } from './manifest-loader.js';
export { CacheStore } from './cache.js';
export { AssetManager } from './asset-manager.js';
