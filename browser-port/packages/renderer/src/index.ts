/**
 * @generals/renderer
 *
 * This package currently re-exports the existing terrain rendering subsystems while
 * the dedicated renderer package is expanded.
 */
export { TerrainVisual, WaterVisual } from '@generals/terrain';
export type { MapDataJSON, TerrainConfig, PolygonTriggerJSON } from '@generals/terrain';
export type { TerrainChunk } from '@generals/terrain';
