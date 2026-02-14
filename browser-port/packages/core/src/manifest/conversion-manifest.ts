/**
 * Conversion manifest — tracks source hashes, output hashes, and converter versions.
 *
 * Used by the asset pipeline to:
 *  - Detect unchanged sources and skip re-conversion
 *  - Verify output integrity on load
 *  - Audit which converter version produced each artifact
 */

export interface ManifestEntry {
  /** Relative path to the source file. */
  sourcePath: string;
  /** SHA-256 hex hash of the source file. */
  sourceHash: string;
  /** Relative path to the converted output file. */
  outputPath: string;
  /** SHA-256 hex hash of the converted output. */
  outputHash: string;
  /** Converter tool name (e.g., 'texture-converter', 'w3d-converter'). */
  converter: string;
  /** Converter version string. */
  converterVersion: string;
  /** ISO timestamp of conversion. */
  timestamp: string;
}

export interface ConversionManifest {
  /** Schema version for forward compatibility. */
  version: 1;
  /** When the manifest was last generated. */
  generatedAt: string;
  /** Total number of entries. */
  entryCount: number;
  /** All conversion entries. */
  entries: ManifestEntry[];
}

/**
 * Create a new empty manifest.
 */
export function createManifest(): ConversionManifest {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    entryCount: 0,
    entries: [],
  };
}

/**
 * Add an entry to the manifest. Replaces any existing entry with the same sourcePath.
 */
export function addManifestEntry(manifest: ConversionManifest, entry: ManifestEntry): void {
  const idx = manifest.entries.findIndex((e) => e.sourcePath === entry.sourcePath);
  if (idx !== -1) {
    manifest.entries[idx] = entry;
  } else {
    manifest.entries.push(entry);
  }
  manifest.entryCount = manifest.entries.length;
}

/**
 * Check if a source file needs re-conversion by comparing its hash
 * and converter version against the manifest. Returns true if conversion is needed.
 */
export function needsConversion(
  manifest: ConversionManifest,
  sourcePath: string,
  sourceHash: string,
  converterVersion?: string,
): boolean {
  const existing = manifest.entries.find((e) => e.sourcePath === sourcePath);
  if (!existing) return true;
  if (existing.sourceHash !== sourceHash) return true;
  if (converterVersion !== undefined && existing.converterVersion !== converterVersion) return true;
  return false;
}

/**
 * Serialize manifest to deterministic JSON (sorted keys, 2-space indent).
 */
export function serializeManifest(manifest: ConversionManifest): string {
  const sorted: ConversionManifest = {
    ...manifest,
    generatedAt: manifest.generatedAt,
    entries: [...manifest.entries].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)),
  };
  return JSON.stringify(sorted, null, 2) + '\n';
}

/**
 * Parse a manifest from JSON string. Returns null if invalid.
 */
export function parseManifest(json: string): ConversionManifest | null {
  try {
    const parsed = JSON.parse(json) as ConversionManifest;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;
    // Validate entry structure
    for (const entry of parsed.entries) {
      if (
        typeof entry.sourcePath !== 'string' ||
        typeof entry.sourceHash !== 'string' ||
        typeof entry.outputPath !== 'string' ||
        typeof entry.outputHash !== 'string' ||
        typeof entry.converter !== 'string' ||
        typeof entry.converterVersion !== 'string'
      ) {
        return null;
      }
    }
    parsed.entryCount = parsed.entries.length;
    return parsed;
  } catch {
    return null;
  }
}
