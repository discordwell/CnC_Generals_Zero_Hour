import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { LoadedModelAsset } from './object-visuals.js';
import { ObjectVisualManager, type RenderableEntityState } from './object-visuals.js';

function flushModelLoadQueue(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

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

function getPlaceholderMesh(manager: ObjectVisualManager, entityId: number): THREE.Mesh | null {
  const root = manager.getVisualRoot(entityId);
  if (!root) {
    return null;
  }
  const placeholder = root.children.find((entry) => {
    const userData = entry.userData as { entityId?: unknown };
    return entry.type === 'Mesh' && userData?.entityId === entityId;
  });
  return placeholder instanceof THREE.Mesh ? placeholder : null;
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
    manager.sync([state], 1 / 30);
    await flushModelLoadQueue();
    const placeholder = getPlaceholderMesh(manager, state.id);

    const root = manager.getVisualRoot(state.id);
    expect(root).toBeTruthy();
    expect(scene.children).toContain(root);
    expect(root?.position.x).toBe(state.x);
    expect(root?.rotation.y).toBe(state.rotationY);
    expect(modelsRequested).toContain('unit-model.gltf');
    expect(manager.getVisualState(state.id)?.hasModel).toBe(true);
    expect(placeholder).toBeTruthy();
    expect(placeholder?.visible).toBe(false);
  });

  it('updates animation state transitions and removes stale entities', async () => {
    const scene = new THREE.Scene();
    const manager = new ObjectVisualManager(scene, null, {
      modelLoader: async () => modelWithAnimationClips(['Idle', 'Move', 'Attack', 'Die']),
    });

    manager.sync([makeMeshState()], 1 / 30);
    await flushModelLoadQueue();
    manager.sync([makeMeshState({ animationState: 'MOVE' })], 1 / 30);
    expect(manager.getVisualState(1)?.animationState).toBe('MOVE');
    const placeholder1 = getPlaceholderMesh(manager, 1);
    expect(placeholder1?.visible).toBe(false);

    manager.sync([makeMeshState({ id: 2, renderAssetPath: 'building.glb' })], 1 / 30);
    await flushModelLoadQueue();
    const placeholder2 = getPlaceholderMesh(manager, 2);
    expect(scene.children.filter((entry) => entry.name.startsWith('object-visual-')).length).toBe(1);
    expect(manager.getVisualRoot(1)).toBeNull();
    expect(manager.getVisualRoot(2)).toBeTruthy();
    expect(manager.getVisualState(2)?.hasModel).toBe(true);
    expect(placeholder2).toBeTruthy();
    expect(placeholder2?.visible).toBe(false);
  });

  it('applies explicit IDLE/MOVE/ATTACK/DIE state transitions from render snapshots', async () => {
    const scene = new THREE.Scene();
    const modelLoaderCalls: string[] = [];
    const manager = new ObjectVisualManager(scene, null, {
      modelLoader: async (assetPath: string): Promise<LoadedModelAsset> => {
        modelLoaderCalls.push(assetPath);
        return modelWithAnimationClips(['Idle', 'Move', 'Attack', 'Die']);
      },
    });

    const baseState = makeMeshState({ id: 7, renderAssetPath: 'unit-model' });
    manager.sync([baseState], 1 / 30);
    await flushModelLoadQueue();

    expect(modelLoaderCalls).toEqual(['unit-model.gltf']);
    expect(manager.getVisualState(7)?.hasModel).toBe(true);
    expect(manager.getVisualState(7)?.animationState).toBe('IDLE');

    manager.sync([makeMeshState({ id: 7, animationState: 'MOVE', renderAssetPath: 'unit-model' })], 1 / 30);
    expect(manager.getVisualState(7)?.animationState).toBe('MOVE');

    manager.sync([makeMeshState({ id: 7, animationState: 'ATTACK', renderAssetPath: 'unit-model' })], 1 / 30);
    expect(manager.getVisualState(7)?.animationState).toBe('ATTACK');

    manager.sync([makeMeshState({ id: 7, animationState: 'DIE', renderAssetPath: 'unit-model' })], 1 / 30);
    expect(manager.getVisualState(7)?.animationState).toBe('DIE');
  });

  it('keeps missing assets explicit and non-throwing', async () => {
    const scene = new THREE.Scene();
    const manager = new ObjectVisualManager(scene, null, {
      modelLoader: async () => {
        throw new Error('missing asset');
      },
    });

    manager.sync([makeMeshState({ id: 3, renderAssetPath: 'missing' })], 1 / 30);
    await flushModelLoadQueue();
    const placeholder = getPlaceholderMesh(manager, 3);

    expect(manager.getUnresolvedEntityIds()).toEqual([3]);
    expect(manager.getVisualState(3)?.hasModel).toBe(false);
    expect(scene.children.filter((entry) => entry.name.startsWith('object-visual-')).length).toBe(1);
    expect(placeholder).toBeTruthy();
    expect(placeholder?.visible).toBe(true);
  });

  it('cancels stale model loads when an entity becomes unresolved', async () => {
    const scene = new THREE.Scene();
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
    await flushModelLoadQueue();
    const placeholder = getPlaceholderMesh(manager, 4);
    expect(manager.getVisualState(4)?.hasModel).toBe(false);
    expect(placeholder).toBeTruthy();
    expect(placeholder?.visible).toBe(true);

    resolvePending?.(modelWithAnimationClips());
    await flushModelLoadQueue();
    expect(manager.getVisualState(4)?.hasModel).toBe(false);
    expect(placeholder?.visible).toBe(true);
  });

  it('falls back through render-asset candidates when an early candidate fails to load', async () => {
    const scene = new THREE.Scene();
    const requested: string[] = [];
    const manager = new ObjectVisualManager(scene, null, {
      modelLoader: async (assetPath: string) => {
        requested.push(assetPath);
        if (assetPath === 'primary.gltf') {
          throw new Error('missing model');
        }
        return modelWithAnimationClips();
      },
    });

    manager.sync([
      makeMeshState({
        id: 5,
        renderAssetPath: 'primary',
        renderAssetResolved: true,
        renderAssetCandidates: ['primary', 'secondary'],
      }),
    ], 1 / 30);
    await flushModelLoadQueue();

    expect(requested).toEqual(['primary.gltf', 'secondary.gltf']);
    expect(manager.getUnresolvedEntityIds()).toEqual([]);
    expect(manager.getVisualState(5)?.hasModel).toBe(true);
    const placeholder = getPlaceholderMesh(manager, 5);
    expect(placeholder).toBeTruthy();
    expect(placeholder?.visible).toBe(false);
  });

  it('prioritizes extension conversions and explicit defaults for source asset hints', async () => {
    const scene = new THREE.Scene();
    const requestedPaths: string[] = [];
    const manager = new ObjectVisualManager(scene, null, {
      modelLoader: async (assetPath) => {
        requestedPaths.push(assetPath);
        return modelWithAnimationClips();
      },
    });

    manager.sync([
      makeMeshState({ id: 1, renderAssetPath: 'soldier.w3d' }),
      makeMeshState({ id: 2, renderAssetPath: 'tank' }),
    ], 1 / 30);
    await flushModelLoadQueue();
    const root1 = manager.getVisualRoot(1);
    const root2 = manager.getVisualRoot(2);
    const placeholder1 = getPlaceholderMesh(manager, 1);
    const placeholder2 = getPlaceholderMesh(manager, 2);

    expect(requestedPaths[0]).toBe('soldier.gltf');
    expect(requestedPaths[1]).toBe('tank.gltf');
    expect(root1).toBeTruthy();
    expect(root2).toBeTruthy();
    expect(manager.getVisualState(1)?.hasModel).toBe(true);
    expect(manager.getVisualState(2)?.hasModel).toBe(true);
    expect(placeholder1).toBeTruthy();
    expect(placeholder2).toBeTruthy();
    expect(placeholder1?.visible).toBe(false);
    expect(placeholder2?.visible).toBe(false);
  });
});
