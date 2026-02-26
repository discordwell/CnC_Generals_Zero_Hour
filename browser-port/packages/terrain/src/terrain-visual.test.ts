import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { generateProceduralTerrain } from './procedural-terrain.js';
import { TerrainVisual } from './terrain-visual.js';

function getTerrainMeshes(scene: THREE.Scene): THREE.Mesh[] {
  return scene.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
}

describe('TerrainVisual', () => {
  it('disables terrain frustum culling while script oversize is active', () => {
    const scene = new THREE.Scene();
    const terrainVisual = new TerrainVisual(scene);
    const mapData = generateProceduralTerrain({ width: 64, height: 64, seed: 7 });

    terrainVisual.loadMap(mapData);
    const meshes = getTerrainMeshes(scene);
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every((mesh) => mesh.frustumCulled)).toBe(true);

    terrainVisual.setScriptTerrainOversizeAmount(2);
    expect(meshes.every((mesh) => !mesh.frustumCulled)).toBe(true);

    terrainVisual.setScriptTerrainOversizeAmount(5);
    expect(meshes.every((mesh) => mesh.frustumCulled)).toBe(true);
  });

  it('applies active script oversize policy to meshes loaded after the script action', () => {
    const scene = new THREE.Scene();
    const terrainVisual = new TerrainVisual(scene);
    terrainVisual.setScriptTerrainOversizeAmount(3);

    const mapData = generateProceduralTerrain({ width: 64, height: 64, seed: 11 });
    terrainVisual.loadMap(mapData);
    const meshes = getTerrainMeshes(scene);
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every((mesh) => !mesh.frustumCulled)).toBe(true);
  });
});
