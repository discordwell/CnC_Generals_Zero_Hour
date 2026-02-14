/**
 * Typed error classes for the asset system.
 */

/** Base class for all asset-system errors. */
export class AssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetError';
  }
}

/** The requested asset path was not found in the manifest. */
export class AssetNotFoundError extends AssetError {
  constructor(public readonly path: string) {
    super(`Asset not found in manifest: ${path}`);
    this.name = 'AssetNotFoundError';
  }
}

/** Network fetch failed. */
export class AssetFetchError extends AssetError {
  constructor(
    public readonly path: string,
    public readonly status: number,
  ) {
    super(`Failed to fetch asset "${path}": HTTP ${status}`);
    this.name = 'AssetFetchError';
  }
}

/** SHA-256 hash mismatch between fetched data and manifest. */
export class AssetIntegrityError extends AssetError {
  constructor(
    public readonly path: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`Integrity check failed for "${path}": expected ${expected}, got ${actual}`);
    this.name = 'AssetIntegrityError';
  }
}

/** Failed to load or parse the conversion manifest. */
export class ManifestLoadError extends AssetError {
  constructor(
    public readonly url: string,
    public readonly reason: string,
  ) {
    super(`Failed to load manifest from "${url}": ${reason}`);
    this.name = 'ManifestLoadError';
  }
}
