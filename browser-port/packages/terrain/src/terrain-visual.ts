/**
 * TerrainVisual — owns Three.js terrain meshes and manages map loading.
 *
 * Implements the Subsystem interface for integration with the engine.
 * Creates terrain chunks from a HeightmapGrid and adds them to the scene.
 */

import * as THREE from 'three';
import type { Subsystem } from '@generals/engine';
import { HeightmapGrid } from './heightmap.js';
import { TerrainMeshBuilder } from './terrain-mesh-builder.js';
import type { TerrainChunk } from './terrain-mesh-builder.js';
import type { MapDataJSON, TerrainConfig } from './types.js';
import { DEFAULT_TERRAIN_CONFIG } from './types.js';
import { generateProceduralTerrain } from './procedural-terrain.js';

export class TerrainVisual implements Subsystem {
  readonly name = 'TerrainVisual';

  private readonly scene: THREE.Scene;
  private readonly config: TerrainConfig;

  /** The active heightmap grid (null until a map is loaded). */
  private heightmap: HeightmapGrid | null = null;

  /** Active terrain chunk meshes. */
  private meshes: THREE.Mesh[] = [];

  /** Shared material for all terrain chunks. */
  private material: THREE.MeshLambertMaterial;

  /** Terrain chunks data (for reference). */
  private chunks: TerrainChunk[] = [];

  constructor(scene: THREE.Scene, config?: Partial<TerrainConfig>) {
    this.scene = scene;
    this.config = { ...DEFAULT_TERRAIN_CONFIG, ...config };

    this.material = new THREE.MeshLambertMaterial({
      vertexColors: this.config.vertexColors,
      wireframe: this.config.wireframe,
      side: THREE.FrontSide,
    });
  }

  init(): void {
    // Nothing async needed
  }

  /**
   * Load terrain from a converted map JSON.
   */
  loadMap(mapData: MapDataJSON): HeightmapGrid {
    this.clearTerrain();

    const heightmap = HeightmapGrid.fromJSON(mapData.heightmap);
    this.heightmap = heightmap;
    this.buildMeshes(heightmap);

    return heightmap;
  }

  /**
   * Load a procedural demo terrain.
   */
  loadDemoTerrain(width = 128, height = 128, seed = 42): { heightmap: HeightmapGrid; mapData: MapDataJSON } {
    const mapData = generateProceduralTerrain({ width, height, seed });
    const heightmap = this.loadMap(mapData);
    return { heightmap, mapData };
  }

  /**
   * Get the active heightmap (for camera terrain following, etc.).
   */
  getHeightmap(): HeightmapGrid | null {
    return this.heightmap;
  }

  /**
   * Toggle wireframe rendering (F1).
   */
  toggleWireframe(): void {
    this.config.wireframe = !this.config.wireframe;
    this.material.wireframe = this.config.wireframe;
    this.material.needsUpdate = true;
  }

  /**
   * Check if wireframe mode is active.
   */
  isWireframe(): boolean {
    return this.config.wireframe;
  }

  update(_dt: number): void {
    // Terrain is static — no per-frame updates needed
  }

  reset(): void {
    this.clearTerrain();
  }

  dispose(): void {
    this.clearTerrain();
    this.material.dispose();
  }

  // ========================================================================
  // Internal
  // ========================================================================

  private buildMeshes(heightmap: HeightmapGrid): void {
    this.chunks = TerrainMeshBuilder.build(heightmap);

    for (const chunk of this.chunks) {
      const mesh = new THREE.Mesh(chunk.geometry, this.material);
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  private clearTerrain(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.length = 0;
    this.chunks.length = 0;
    this.heightmap = null;
  }
}
