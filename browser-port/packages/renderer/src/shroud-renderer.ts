/**
 * ShroudRenderer — renders fog of war overlay on terrain.
 *
 * Source parity: W3DShroud.cpp uses a projected texture to darken
 * terrain in unexplored/fogged areas. This implementation uses a
 * DataTexture on a plane mesh positioned above the terrain.
 *
 * Visibility states (matching game-logic FogOfWarGrid):
 *   0 = SHROUDED (never explored) → near-opaque black
 *   1 = FOGGED   (explored, not currently visible) → semi-transparent black
 *   2 = CLEAR    (currently visible) → fully transparent
 */

import * as THREE from 'three';

/** Fog cell visibility values from game-logic FogOfWarGrid. */
export const CELL_SHROUDED = 0;
export const CELL_FOGGED = 1;
export const CELL_CLEAR = 2;

/** Alpha values for each shroud state (0–255). */
const SHROUDED_ALPHA = 230;
const FOGGED_ALPHA = 140;
const CLEAR_ALPHA = 0;

/** Default frame interval between texture updates (performance throttle). */
const DEFAULT_UPDATE_INTERVAL = 5;

export interface ShroudRendererConfig {
  /** World-space width of the terrain. */
  worldWidth: number;
  /** World-space depth of the terrain. */
  worldDepth: number;
  /** Height offset above terrain surface for the overlay plane. */
  heightOffset?: number;
  /** How many frames to skip between texture updates. */
  updateInterval?: number;
  /** Render order for the overlay mesh. */
  renderOrder?: number;
}

export interface FogOfWarData {
  cellsWide: number;
  cellsDeep: number;
  cellSize: number;
  data: Uint8Array;
}

export class ShroudRenderer {
  private readonly scene: THREE.Scene;
  private readonly config: Required<ShroudRendererConfig>;

  private mesh: THREE.Mesh | null = null;
  private texture: THREE.DataTexture | null = null;
  private frameCounter = 0;

  constructor(scene: THREE.Scene, config: ShroudRendererConfig) {
    this.scene = scene;
    this.config = {
      heightOffset: 0.5,
      updateInterval: DEFAULT_UPDATE_INTERVAL,
      renderOrder: 500,
      ...config,
    };
  }

  /**
   * Update the shroud overlay texture from fog-of-war data.
   * Call this every frame; internal throttling skips updates
   * based on the configured interval.
   *
   * Returns true if the texture was actually updated this frame.
   */
  update(fogData: FogOfWarData | null): boolean {
    if (!fogData) return false;

    this.frameCounter++;
    if (this.frameCounter < this.config.updateInterval) {
      return false;
    }
    this.frameCounter = 0;

    if (!this.mesh) {
      this.createOverlay(fogData.cellsWide, fogData.cellsDeep);
    }

    if (!this.texture) return false;

    const texData = this.texture.image.data as Uint8Array;
    const src = fogData.data;
    const len = src.length;

    for (let i = 0; i < len; i++) {
      const vis = src[i]!;
      const base = i * 4;
      // RGB always 0 (black); only alpha varies.
      texData[base] = 0;
      texData[base + 1] = 0;
      texData[base + 2] = 0;
      texData[base + 3] =
        vis === CELL_CLEAR
          ? CLEAR_ALPHA
          : vis === CELL_FOGGED
            ? FOGGED_ALPHA
            : SHROUDED_ALPHA;
    }

    this.texture.needsUpdate = true;
    return true;
  }

  /** Force an immediate update (bypasses frame throttle). */
  forceUpdate(fogData: FogOfWarData | null): boolean {
    this.frameCounter = this.config.updateInterval;
    return this.update(fogData);
  }

  /** Whether the overlay mesh has been created. */
  isInitialized(): boolean {
    return this.mesh !== null;
  }

  /** Get the overlay mesh (for testing or external access). */
  getMesh(): THREE.Mesh | null {
    return this.mesh;
  }

  dispose(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
  }

  private createOverlay(cellsWide: number, cellsDeep: number): void {
    const texData = new Uint8Array(cellsWide * cellsDeep * 4);
    // Initialize fully shrouded (black opaque).
    for (let i = 0; i < cellsWide * cellsDeep; i++) {
      texData[i * 4] = 0;
      texData[i * 4 + 1] = 0;
      texData[i * 4 + 2] = 0;
      texData[i * 4 + 3] = SHROUDED_ALPHA;
    }

    this.texture = new THREE.DataTexture(texData, cellsWide, cellsDeep);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;

    const { worldWidth, worldDepth, heightOffset, renderOrder } = this.config;

    const geometry = new THREE.PlaneGeometry(worldWidth, worldDepth);
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(worldWidth / 2, heightOffset, worldDepth / 2);
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fog-of-war-overlay';
    this.scene.add(this.mesh);
  }
}
