/**
 * Terrain data types and constants.
 *
 * These match the original engine's coordinate system and map format.
 * The original engine uses Z-up; Three.js uses Y-up, so the mapping is:
 *   Original X -> Three.js X
 *   Original Y -> Three.js Z
 *   Original Z -> Three.js Y
 */

// ============================================================================
// Map conversion constants (from HeightMapRenderObj / WorldHeightMap)
// ============================================================================

/** World units per heightmap grid cell (horizontal spacing). */
export const MAP_XY_FACTOR = 10.0;

/** Multiplier to convert raw 0–255 height values to world-space Y. */
export const MAP_HEIGHT_SCALE = MAP_XY_FACTOR / 16.0; // 0.625

/** Number of cells per terrain chunk edge (for frustum culling). */
export const CHUNK_SIZE = 32;

/** Minimum camera height above terrain surface. */
export const MIN_CAMERA_ALTITUDE = 20.0;

// ============================================================================
// Map JSON format (output of map-converter CLI)
// ============================================================================

/** Heightmap data as it appears in a converted map JSON file. */
export interface HeightmapDataJSON {
  /** Number of columns in the height grid. */
  width: number;
  /** Number of rows in the height grid. */
  height: number;
  /** Border/margin size in cells. */
  borderSize: number;
  /** Base64-encoded Uint8Array of raw height values (row-major, 0–255). */
  data: string;
}

/** A 3D point with x, y, z coordinates (in original engine space). */
export interface MapPoint {
  x: number;
  y: number;
  z: number;
}

/** A polygon trigger region from the map. */
export interface PolygonTriggerJSON {
  name: string;
  id: number;
  isWaterArea: boolean;
  isRiver: boolean;
  points: MapPoint[];
}

/** A placed object from the map. */
export interface MapObjectJSON {
  position: MapPoint;
  angle: number;
  templateName: string;
  flags: number;
  properties: Record<string, string>;
}

/** Complete converted map JSON structure (matches map-converter output). */
export interface MapDataJSON {
  heightmap: HeightmapDataJSON;
  objects: MapObjectJSON[];
  triggers: PolygonTriggerJSON[];
  textureClasses: string[];
  blendTileCount: number;
}

// ============================================================================
// Terrain configuration
// ============================================================================

/** Configuration for terrain rendering. */
export interface TerrainConfig {
  /** Enable wireframe overlay (toggled by F1). */
  wireframe: boolean;
  /** Enable vertex color height visualization. */
  vertexColors: boolean;
  /** Enable water surface rendering. */
  enableWater: boolean;
  /** Water surface opacity (0–1). */
  waterOpacity: number;
  /** Water surface color (hex). */
  waterColor: number;
}

/** Default terrain rendering configuration. */
export const DEFAULT_TERRAIN_CONFIG: Readonly<TerrainConfig> = {
  wireframe: false,
  vertexColors: true,
  enableWater: true,
  waterOpacity: 0.45,
  waterColor: 0x2266aa,
};
