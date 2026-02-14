/**
 * HeightmapGrid — pure-data heightmap representation.
 *
 * Decodes the base64-encoded height data from a converted map JSON,
 * provides height queries with bilinear interpolation, and computes
 * surface normals. No Three.js dependency — reusable by pathfinding
 * and game logic.
 */

import { MAP_XY_FACTOR, MAP_HEIGHT_SCALE } from './types.js';
import type { HeightmapDataJSON } from './types.js';

export class HeightmapGrid {
  /** Number of columns (vertices per row). */
  readonly width: number;
  /** Number of rows (vertices per column). */
  readonly height: number;
  /** Border/margin in cells. */
  readonly borderSize: number;
  /** Raw 0–255 height values, row-major [row * width + col]. */
  readonly rawData: Uint8Array;
  /** Pre-computed world-space heights (rawData[i] * MAP_HEIGHT_SCALE). */
  readonly worldHeights: Float32Array;

  /** World-space extent in X. */
  readonly worldWidth: number;
  /** World-space extent in Z. */
  readonly worldDepth: number;

  constructor(width: number, height: number, borderSize: number, rawData: Uint8Array) {
    this.width = width;
    this.height = height;
    this.borderSize = borderSize;
    this.rawData = rawData;
    this.worldWidth = (width - 1) * MAP_XY_FACTOR;
    this.worldDepth = (height - 1) * MAP_XY_FACTOR;

    // Pre-compute world heights
    this.worldHeights = new Float32Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      this.worldHeights[i] = rawData[i]! * MAP_HEIGHT_SCALE;
    }
  }

  /**
   * Create a HeightmapGrid from a converted map JSON heightmap section.
   * Decodes the base64-encoded data string.
   */
  static fromJSON(json: HeightmapDataJSON): HeightmapGrid {
    const bytes = base64ToUint8Array(json.data);
    if (bytes.length !== json.width * json.height) {
      throw new Error(
        `Heightmap data length mismatch: expected ${json.width * json.height}, got ${bytes.length}`,
      );
    }
    return new HeightmapGrid(json.width, json.height, json.borderSize, bytes);
  }

  /**
   * Get the raw 0–255 height value at grid coordinates.
   * Returns 0 if out of bounds.
   */
  getRawHeight(col: number, row: number): number {
    if (col < 0 || col >= this.width || row < 0 || row >= this.height) return 0;
    return this.rawData[row * this.width + col]!;
  }

  /**
   * Get the world-space Y height at grid coordinates.
   * Uses the pre-computed worldHeights array for in-bounds values.
   */
  getWorldHeight(col: number, row: number): number {
    if (col < 0 || col >= this.width || row < 0 || row >= this.height) return 0;
    return this.worldHeights[row * this.width + col]!;
  }

  /**
   * Get the world-space Y height at a world XZ position with bilinear interpolation.
   * Returns 0 if outside the heightmap.
   */
  getInterpolatedHeight(worldX: number, worldZ: number): number {
    // Convert world position to fractional grid coordinates
    const col = worldX / MAP_XY_FACTOR;
    const row = worldZ / MAP_XY_FACTOR;

    // Integer grid cell
    const col0 = Math.floor(col);
    const row0 = Math.floor(row);
    const col1 = col0 + 1;
    const row1 = row0 + 1;

    // Fractional part
    const fx = col - col0;
    const fz = row - row0;

    // Four corner heights
    const h00 = this.getWorldHeight(col0, row0);
    const h10 = this.getWorldHeight(col1, row0);
    const h01 = this.getWorldHeight(col0, row1);
    const h11 = this.getWorldHeight(col1, row1);

    // Bilinear interpolation
    const h0 = h00 + (h10 - h00) * fx;
    const h1 = h01 + (h11 - h01) * fx;
    return h0 + (h1 - h0) * fz;
  }

  /**
   * Compute surface normal at grid coordinates via cross-product of
   * neighboring height differences. Returns [nx, ny, nz] normalized.
   */
  getNormal(col: number, row: number): [number, number, number] {
    // Use central differences where possible
    const hL = this.getWorldHeight(Math.max(0, col - 1), row);
    const hR = this.getWorldHeight(Math.min(this.width - 1, col + 1), row);
    const hD = this.getWorldHeight(col, Math.max(0, row - 1));
    const hU = this.getWorldHeight(col, Math.min(this.height - 1, row + 1));

    // Tangent vectors in X and Z directions
    // dx direction: (2 * MAP_XY_FACTOR, hR - hL, 0)
    // dz direction: (0, hU - hD, 2 * MAP_XY_FACTOR)
    // Normal = dz × dx (cross product, Y-up convention)
    const dxStep = col > 0 && col < this.width - 1 ? 2 * MAP_XY_FACTOR : MAP_XY_FACTOR;
    const dzStep = row > 0 && row < this.height - 1 ? 2 * MAP_XY_FACTOR : MAP_XY_FACTOR;

    const nx = -(hR - hL) * dzStep;
    const ny = dxStep * dzStep;
    const nz = -(hU - hD) * dxStep;

    // Normalize
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-10) return [0, 1, 0];
    return [nx / len, ny / len, nz / len];
  }

  /**
   * Convert world-space position to grid coordinates (fractional).
   */
  worldToGrid(worldX: number, worldZ: number): [number, number] {
    return [worldX / MAP_XY_FACTOR, worldZ / MAP_XY_FACTOR];
  }

  /**
   * Convert grid coordinates to world-space position.
   */
  gridToWorld(col: number, row: number): [number, number, number] {
    return [
      col * MAP_XY_FACTOR,
      this.getWorldHeight(col, row),
      row * MAP_XY_FACTOR,
    ];
  }
}

// ============================================================================
// Base64 decoding (browser-compatible, no Node.js Buffer)
// ============================================================================

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;
}

function base64ToUint8Array(base64: string): Uint8Array {
  // Strip padding
  let len = base64.length;
  while (len > 0 && base64[len - 1] === '=') len--;

  const outputLen = (len * 3) >> 2;
  const bytes = new Uint8Array(outputLen);

  let j = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_LOOKUP[base64.charCodeAt(i)]!;
    const b = i + 1 < len ? B64_LOOKUP[base64.charCodeAt(i + 1)]! : 0;
    const c = i + 2 < len ? B64_LOOKUP[base64.charCodeAt(i + 2)]! : 0;
    const d = i + 3 < len ? B64_LOOKUP[base64.charCodeAt(i + 3)]! : 0;

    bytes[j++] = (a << 2) | (b >> 4);
    if (j < outputLen) bytes[j++] = ((b & 0x0f) << 4) | (c >> 2);
    if (j < outputLen) bytes[j++] = ((c & 0x03) << 6) | d;
  }

  return bytes;
}

export { base64ToUint8Array };
