import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { LoadedModelAsset } from './object-visuals.js';
import { ObjectVisualManager, type RenderableEntityState } from './object-visuals.js';

function makeMeshState(overrides: Partial<RenderableEntityState> = {}): RenderableEntityState {
  return {
    id: 1,
    renderAssetPath: 'unit-model.gltf',
    renderAssetResolved: true,
    x: 10,
    y: 0,
    z: 20,
    rotationY: 0.5,
    animationState: 'IDLE',
    ...overrides,
  };
}

function modelWithAnimationClips(clips: readonly string[] = []): LoadedModelAsset {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  scene.add(mesh);

  const createdClips = clips.map((clipName) => new THREE.AnimationClip(
    clipName,
    1,
    [
      new THREE.NumberKeyframeTrack(
        '.position[x]',
        [0, 1],
        [0, 0],
      ),
    ],
  ));

  return {
    scene,
    animations: createdClips,
  };
}

function createPlaceholderMesh(entityId: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xff33ff, transparent: true, opacity: 0.95 }),
  );
  mesh.userData = { mapObjectIndex: entityId };
  mesh.name = `placeholder-${entityId}`;
  return mesh;
}

describe('ObjectVisualManager', () => {
  it('creates and syncs visual nodes from render-state snapshots', async () => {
    const scene = new THREE.Scene();
    const modelsRequested: string[] = [];
    const modelLoader = async (assetPath: string): Promise<LoadedModelAsset> => {
      modelsRequested.push(assetPath);
      return modelWithAnimationClips(['Idle', 'Attack']);
    };
    const manager = new ObjectVisualManager(scene, null, { modelLoader });

    const state = makeMeshState();
    const placeholder = createPlaceholderMesh(state.id);
    scene.add(placeholder);
    manager.sync([state], 1 / 30);
    await Promise.resolve();

    const root = manager.getVisualRoot(state.id);
    expect(root).toBeTruthy();
    expect(scene.children).toContain(root);
    expect(root?.position.x).toBe(state.x);
    expect(root?.rotation.y).toBe(state.rotationY);
    expect(modelsRequested).toContain('unit-model.gltf');
    expect(manager.getVisualState(state.id)?.hasModel).toBe(true);
    expect(placeholder.visible).toBe(false);
  });

  it('updates animation state transitions and removes stale entities', async () => {
    const scene = new THREE.Scene();
    const placeholder1 = createPlaceholderMesh(1);
    const placeholder2 = createPlaceholderMesh(2);
    scene.add(placeholder1, placeholder2);
    const manager = new ObjectVisualManager(scene, null, {
      modelLoader: async () => modelWithAnimationClips(['Idle', 'Move', 'Attack', 'Die']),
    });

    manager.sync([makeMeshState()], 1 / 30);
    await Promise.resolve();
    manager.sync([makeMeshState({ animationState: 'MOVE' })], 1 / 30);
    expect(manager.getVisualState(1)?.animationState).toBe('MOVE');
    expect(placeholder1.visible).toBe(false);

    manager.sync([makeMeshState({ id: 2, renderAssetPath: 'building.glb' })], 1 / 30);
    await Promise.resolve();
    expect(scene.children.filter((entry) => entry.name.startsWith('object-visual-')).length).toBe(1);
    expect(manager.getVisualRoot(1)).toBeNull();
    expect(manager.getVisualRoot(2)).toBeTruthy();
    expect(manager.getVisualState(2)?.hasModel).toBe(true);
    expect(placeholder2.visible).toBe(false);
  });

  it('keeps missing assets explicit and non-throwing', async () => {
    const scene = new THREE.Scene();
    const placeholder = createPlaceholderMesh(3);
    scene.add(placeholder);
    const manager = new ObjectVisualManager(scene, null, {
      modelLoader: async () => {
        throw new Error('missing asset');
      },
    });

    manager.sync([makeMeshState({ id: 3, renderAssetPath: 'missing' })], 1 / 30);
    await Promise.resolve();

    expect(manager.getUnresolvedEntityIds()).toEqual([3]);
    expect(manager.getVisualState(3)?.hasModel).toBe(false);
    expect(scene.children.filter((entry) => entry.name.startsWith('object-visual-')).length).toBe(1);
    expect(placeholder.visible).toBe(true);
  });

  it('cancels stale model loads when an entity becomes unresolved', async () => {
    const scene = new THREE.Scene();
    const placeholder = createPlaceholderMesh(4);
    scene.add(placeholder);

    let resolvePending: ((asset: LoadedModelAsset) => void) | null = null;
    const delayedModelLoader = async () => new Promise<LoadedModelAsset>((resolve) => {
      resolvePending = resolve;
    });

    const manager = new ObjectVisualManager(scene, null, {
      modelLoader: delayedModelLoader,
    });

    manager.sync([makeMeshState({ id: 4 })], 1 / 30);
    expect(resolvePending).not.toBeNull();
    manager.sync([makeMeshState({ id: 4, renderAssetResolved: false })], 1 / 30);
    await Promise.resolve();
    expect(manager.getVisualState(4)?.hasModel).toBe(false);
    expect(placeholder.visible).toBe(true);

    resolvePending?.(modelWithAnimationClips());
    await Promise.resolve();
    expect(manager.getVisualState(4)?.hasModel).toBe(false);
    expect(placeholder.visible).toBe(true);
  });

  it('prioritizes extension conversions and explicit defaults for source asset hints', async () => {
    const scene = new THREE.Scene();
    const requestedPaths: string[] = [];
    const placeholder1 = createPlaceholderMesh(1);
    const placeholder2 = createPlaceholderMesh(2);
    scene.add(placeholder1, placeholder2);
    const manager = new ObjectVisualManager(scene, null, {
      modelLoader: async (assetPath) => {
        requestedPaths.push(assetPath);
        return modelWithAnimationClips();
      },
    });

    manager.sync([makeMeshState({ id: 1, renderAssetPath: 'soldier.w3d' })], 1 / 30);
    manager.sync([makeMeshState({ id: 2, renderAssetPath: 'tank' })], 1 / 30);
    await Promise.resolve();

    expect(requestedPaths[0]).toBe('soldier.gltf');
    expect(requestedPaths[1]).toBe('tank.gltf');
    expect(placeholder1.visible).toBe(false);
    expect(placeholder2.visible).toBe(false);
  });
});
