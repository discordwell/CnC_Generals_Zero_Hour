import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  ShroudRenderer,
  CELL_SHROUDED,
  CELL_FOGGED,
  CELL_CLEAR,
  type FogOfWarData,
} from './shroud-renderer.js';

function createScene(): THREE.Scene & { added: THREE.Object3D[]; removed: THREE.Object3D[] } {
  const added: THREE.Object3D[] = [];
  const removed: THREE.Object3D[] = [];
  const scene = new THREE.Scene();
  const origAdd = scene.add.bind(scene);
  const origRemove = scene.remove.bind(scene);
  scene.add = (...objs: THREE.Object3D[]) => {
    added.push(...objs);
    return origAdd(...objs);
  };
  scene.remove = (...objs: THREE.Object3D[]) => {
    removed.push(...objs);
    return origRemove(...objs);
  };
  return Object.assign(scene, { added, removed });
}

function makeFogData(cellsWide: number, cellsDeep: number, fill: number): FogOfWarData {
  const data = new Uint8Array(cellsWide * cellsDeep);
  data.fill(fill);
  return { cellsWide, cellsDeep, cellSize: 10, data };
}

describe('ShroudRenderer', () => {
  it('does not create mesh until first update with data', () => {
    const scene = createScene();
    const renderer = new ShroudRenderer(scene, { worldWidth: 100, worldDepth: 100 });

    expect(renderer.isInitialized()).toBe(false);
    expect(renderer.getMesh()).toBeNull();

    // Null data should not create mesh.
    renderer.forceUpdate(null);
    expect(renderer.isInitialized()).toBe(false);
  });

  it('creates overlay mesh on first update with valid data', () => {
    const scene = createScene();
    const renderer = new ShroudRenderer(scene, { worldWidth: 200, worldDepth: 160 });

    const fogData = makeFogData(20, 16, CELL_SHROUDED);
    renderer.forceUpdate(fogData);

    expect(renderer.isInitialized()).toBe(true);
    const mesh = renderer.getMesh()!;
    expect(mesh).toBeTruthy();
    expect(mesh.name).toBe('fog-of-war-overlay');
    expect(mesh.position.x).toBe(100); // worldWidth / 2
    expect(mesh.position.z).toBe(80); // worldDepth / 2
    expect(scene.added).toContain(mesh);
  });

  it('encodes SHROUDED cells as near-opaque black', () => {
    const scene = createScene();
    const renderer = new ShroudRenderer(scene, { worldWidth: 40, worldDepth: 40 });

    const fogData = makeFogData(4, 4, CELL_SHROUDED);
    renderer.forceUpdate(fogData);

    const mesh = renderer.getMesh()!;
    const material = mesh.material as THREE.MeshBasicMaterial;
    const texData = material.map!.image.data as Uint8Array;

    // Check first pixel: R=0, G=0, B=0, A=230.
    expect(texData[0]).toBe(0);
    expect(texData[1]).toBe(0);
    expect(texData[2]).toBe(0);
    expect(texData[3]).toBe(230);
  });

  it('encodes FOGGED cells as semi-transparent black', () => {
    const scene = createScene();
    const renderer = new ShroudRenderer(scene, { worldWidth: 40, worldDepth: 40 });

    const fogData = makeFogData(4, 4, CELL_FOGGED);
    renderer.forceUpdate(fogData);

    const mesh = renderer.getMesh()!;
    const material = mesh.material as THREE.MeshBasicMaterial;
    const texData = material.map!.image.data as Uint8Array;

    expect(texData[3]).toBe(140);
  });

  it('encodes CLEAR cells as fully transparent', () => {
    const scene = createScene();
    const renderer = new ShroudRenderer(scene, { worldWidth: 40, worldDepth: 40 });

    const fogData = makeFogData(4, 4, CELL_CLEAR);
    renderer.forceUpdate(fogData);

    const mesh = renderer.getMesh()!;
    const material = mesh.material as THREE.MeshBasicMaterial;
    const texData = material.map!.image.data as Uint8Array;

    expect(texData[3]).toBe(0);
  });

  it('handles mixed visibility states in a single update', () => {
    const scene = createScene();
    const renderer = new ShroudRenderer(scene, { worldWidth: 30, worldDepth: 10 });

    const fogData: FogOfWarData = {
      cellsWide: 3,
      cellsDeep: 1,
      cellSize: 10,
      data: new Uint8Array([CELL_SHROUDED, CELL_FOGGED, CELL_CLEAR]),
    };
    renderer.forceUpdate(fogData);

    const mesh = renderer.getMesh()!;
    const texData = (mesh.material as THREE.MeshBasicMaterial).map!.image.data as Uint8Array;

    expect(texData[0 * 4 + 3]).toBe(230); // SHROUDED
    expect(texData[1 * 4 + 3]).toBe(140); // FOGGED
    expect(texData[2 * 4 + 3]).toBe(0);   // CLEAR
  });

  it('throttles updates based on updateInterval', () => {
    const scene = createScene();
    const renderer = new ShroudRenderer(scene, {
      worldWidth: 40,
      worldDepth: 40,
      updateInterval: 3,
    });

    const fogData = makeFogData(4, 4, CELL_CLEAR);

    // First call should not update (counter=1 < 3).
    expect(renderer.update(fogData)).toBe(false);
    expect(renderer.isInitialized()).toBe(false);

    // Second call (counter=2 < 3).
    expect(renderer.update(fogData)).toBe(false);

    // Third call (counter=3 >= 3, resets and updates).
    expect(renderer.update(fogData)).toBe(true);
    expect(renderer.isInitialized()).toBe(true);
  });

  it('forceUpdate bypasses throttle', () => {
    const scene = createScene();
    const renderer = new ShroudRenderer(scene, {
      worldWidth: 40,
      worldDepth: 40,
      updateInterval: 100,
    });

    const fogData = makeFogData(4, 4, CELL_CLEAR);
    expect(renderer.forceUpdate(fogData)).toBe(true);
    expect(renderer.isInitialized()).toBe(true);
  });

  it('dispose removes mesh from scene and cleans up resources', () => {
    const scene = createScene();
    const renderer = new ShroudRenderer(scene, { worldWidth: 40, worldDepth: 40 });

    renderer.forceUpdate(makeFogData(4, 4, CELL_SHROUDED));
    expect(renderer.isInitialized()).toBe(true);

    renderer.dispose();
    expect(renderer.isInitialized()).toBe(false);
    expect(renderer.getMesh()).toBeNull();
    expect(scene.removed.length).toBeGreaterThan(0);
  });

  it('uses configured heightOffset and renderOrder', () => {
    const scene = createScene();
    const renderer = new ShroudRenderer(scene, {
      worldWidth: 100,
      worldDepth: 100,
      heightOffset: 2.5,
      renderOrder: 999,
    });

    renderer.forceUpdate(makeFogData(10, 10, CELL_CLEAR));

    const mesh = renderer.getMesh()!;
    expect(mesh.position.y).toBe(2.5);
    expect(mesh.renderOrder).toBe(999);
  });

  it('subsequent updates modify existing texture without recreating mesh', () => {
    const scene = createScene();
    const renderer = new ShroudRenderer(scene, { worldWidth: 20, worldDepth: 20 });

    renderer.forceUpdate(makeFogData(2, 2, CELL_SHROUDED));
    const meshAfterFirst = renderer.getMesh();

    // Update to clear.
    renderer.forceUpdate(makeFogData(2, 2, CELL_CLEAR));
    const meshAfterSecond = renderer.getMesh();

    // Should be the same mesh instance (not recreated).
    expect(meshAfterSecond).toBe(meshAfterFirst);

    // Texture should now show clear.
    const texData = (meshAfterSecond!.material as THREE.MeshBasicMaterial).map!.image
      .data as Uint8Array;
    expect(texData[3]).toBe(0);
  });
});
