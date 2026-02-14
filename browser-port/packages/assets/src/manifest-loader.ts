/**
 * Runtime manifest loader — fetches and indexes the conversion manifest
 * for fast asset lookups at runtime.
 */

import type { ConversionManifest, ManifestEntry } from '@generals/core';
import { parseManifest } from '@generals/core';
import { ManifestLoadError } from './errors.js';

/**
 * Indexed wrapper around ConversionManifest for efficient runtime lookups.
 */
export class RuntimeManifest {
  private readonly byOutputPath = new Map<string, ManifestEntry>();
  private readonly bySourcePath = new Map<string, ManifestEntry>();

  constructor(public readonly raw: ConversionManifest) {
    for (const entry of raw.entries) {
      this.byOutputPath.set(entry.outputPath, entry);
      this.bySourcePath.set(entry.sourcePath, entry);
    }
  }

  /** Look up a manifest entry by its output path. */
  getByOutputPath(outputPath: string): ManifestEntry | undefined {
    return this.byOutputPath.get(outputPath);
  }

  /** Look up a manifest entry by its source path. */
  getBySourcePath(sourcePath: string): ManifestEntry | undefined {
    return this.bySourcePath.get(sourcePath);
  }

  /** Check if an output path exists in the manifest. */
  hasOutputPath(outputPath: string): boolean {
    return this.byOutputPath.has(outputPath);
  }

  /** Get all output paths. */
  getOutputPaths(): string[] {
    return [...this.byOutputPath.keys()];
  }

  /** Total number of entries. */
  get size(): number {
    return this.raw.entries.length;
  }
}

/**
 * Fetch and parse the conversion manifest.
 * Returns null on 404 (manifest-optional design).
 * Throws ManifestLoadError on other failures.
 */
export async function loadManifest(url: string): Promise<RuntimeManifest | null> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new ManifestLoadError(url, err instanceof Error ? err.message : String(err));
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new ManifestLoadError(url, `HTTP ${response.status}`);
  }

  const text = await response.text();
  const manifest = parseManifest(text);

  if (!manifest) {
    throw new ManifestLoadError(url, 'Invalid manifest JSON');
  }

  return new RuntimeManifest(manifest);
}
