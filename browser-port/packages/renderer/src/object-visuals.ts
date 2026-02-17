/**
 * ObjectVisualManager — loads and updates converted model assets for map entities.
 *
 * This manager receives render-ready snapshots from game-logic and renders
 * them as asset-backed visual nodes.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetManager } from '@generals/assets';

export type RenderableAnimationState = 'IDLE' | 'MOVE' | 'ATTACK' | 'DIE';

export interface RenderableEntityState {
  id: number;
  renderAssetPath: string | null;
  renderAssetResolved: boolean;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  animationState: RenderableAnimationState;
}

export interface LoadedModelAsset {
  readonly scene: THREE.Object3D;
  readonly animations: readonly THREE.AnimationClip[];
}

interface VisualAssetState {
  root: THREE.Group;
  assetPath: string | null;
  loadToken: number;
  currentModel: THREE.Object3D | null;
  mixer: THREE.AnimationMixer | null;
  actions: Map<RenderableAnimationState, THREE.AnimationAction>;
  activeState: RenderableAnimationState | null;
}

export interface ObjectVisualManagerConfig {
  /** Candidate suffixes when a model path has no extension. */
  modelExtensions?: readonly string[];
  /** Optional custom model loader (for tests or alternate formats). */
  modelLoader?: (assetPath: string) => Promise<LoadedModelAsset>;
}

const DEFAULT_MODEL_EXTENSIONS: readonly string[] = ['.gltf', '.glb'];

/**
 * Resolve animation states to clip name candidates from converted assets.
 */
const CLIP_HINTS_BY_STATE: Record<RenderableAnimationState, string[]> = {
  IDLE: ['Idle', 'IdleLoop', 'Idle2', 'Stand', 'Neutral'],
  MOVE: ['Move', 'MoveLoop', 'Run', 'Walk'],
  ATTACK: ['Attack', 'Firing', 'Fire', 'AttackLoop', 'GunAttack'],
  DIE: ['Die', 'Death', 'DeathLoop', 'Dead'],
};

export class ObjectVisualManager {
  private readonly scene: THREE.Scene;
  private readonly assetManager: AssetManager | null;
  private readonly config: Required<ObjectVisualManagerConfig>;
  private readonly modelLoader: (assetPath: string) => Promise<LoadedModelAsset>;
  private readonly gltfLoader = new GLTFLoader();
  private readonly visuals = new Map<number, VisualAssetState>();
  private readonly modelCache = new Map<string, LoadedModelAsset>();
  private readonly modelLoadPromises = new Map<string, Promise<LoadedModelAsset>>();
  private readonly unresolvedEntityIds = new Set<number>();

  constructor(
    scene: THREE.Scene,
    assetManager: AssetManager | null,
    config: ObjectVisualManagerConfig = {},
  ) {
    this.scene = scene;
    this.assetManager = assetManager;
    if (!assetManager && !config.modelLoader) {
      throw new Error('ObjectVisualManager requires either an AssetManager or a custom modelLoader.');
    }

    this.config = {
      modelExtensions: [...DEFAULT_MODEL_EXTENSIONS],
      modelLoader: config.modelLoader ?? this.createDefaultModelLoader.bind(this),
    };
    this.assetManager = assetManager;
    this.modelLoader = config.modelLoader ?? this.config.modelLoader;
  }

  /**
   * Sync rendered object visuals with latest render-state snapshots.
   */
  sync(states: readonly RenderableEntityState[], dt = 0): void {
    const activeIds = new Set<number>();
    for (const state of states) {
      activeIds.add(state.id);
      let visual = this.visuals.get(state.id);
      if (!visual) {
        visual = this.createVisual(state.id);
        this.visuals.set(state.id, visual);
      }

      this.syncVisualTransform(visual, state);
      this.syncVisualAsset(visual, state);
      this.applyAnimationState(visual, state.animationState);
      if (visual.mixer) {
        visual.mixer.update(dt);
      }
    }

    for (const [entityId, visual] of this.visuals) {
      if (!activeIds.has(entityId)) {
        this.removeVisual(entityId, visual);
      }
    }
  }

  /**
   * Return the live rendered root for debug/tests.
   */
  getVisualRoot(entityId: number): THREE.Object3D | null {
    return this.visuals.get(entityId)?.root ?? null;
  }

  getVisualState(entityId: number): {
    animationState: RenderableAnimationState | null;
    hasModel: boolean;
    assetPath: string | null;
  } | null {
    const visual = this.visuals.get(entityId);
    if (!visual) {
      return null;
    }
    return {
      animationState: visual.activeState,
      hasModel: visual.currentModel !== null,
      assetPath: visual.assetPath,
    };
  }

  /**
   * Return entity ids that are currently marked unresolved because model load failed.
   */
  getUnresolvedEntityIds(): number[] {
    return Array.from(this.unresolvedEntityIds.values());
  }

  dispose(): void {
    for (const [entityId, visual] of this.visuals) {
      this.removeVisual(entityId, visual);
    }
    this.visuals.clear();
    this.unresolvedEntityIds.clear();
    this.modelLoadPromises.clear();
    this.modelCache.clear();
  }

  // ==========================================================================
  // Visual lifecycle
  // ==========================================================================

  private createVisual(entityId: number): VisualAssetState {
    const root = new THREE.Group();
    root.name = `object-visual-${entityId}`;
    root.userData = { entityId };
    this.scene.add(root);

    return {
      root,
      assetPath: null,
      loadToken: 0,
      currentModel: null,
      mixer: null,
      actions: new Map(),
      activeState: null,
    };
  }

  private syncVisualTransform(visual: VisualAssetState, state: RenderableEntityState): void {
    visual.root.position.set(state.x, state.y, state.z);
    visual.root.rotation.y = state.rotationY;
  }

  private syncVisualAsset(visual: VisualAssetState, state: RenderableEntityState): void {
    const desiredPath = this.selectAssetPath(state.renderAssetPath, state.renderAssetResolved);
    const entityId = visual.root.userData.entityId as number;

    if (!desiredPath) {
      if (visual.currentModel !== null) {
        this.removeModel(visual);
      }
      if (visual.assetPath !== null) {
        visual.loadToken += 1;
      }
      visual.assetPath = null;
      this.unresolvedEntityIds.add(entityId);
      this.updatePlaceholderVisibility(entityId, true);
      return;
    }

    if (visual.assetPath === desiredPath && visual.currentModel !== null) {
      this.unresolvedEntityIds.delete(entityId);
      this.updatePlaceholderVisibility(entityId, false);
      return;
    }

    visual.assetPath = desiredPath;
    visual.loadToken += 1;
    const loadToken = visual.loadToken;
    const normalizedCandidates = this.resolveCandidateAssetPaths(desiredPath);
    this.updatePlaceholderVisibility(entityId, true);

    void (async () => {
      for (const candidate of normalizedCandidates) {
        try {
          const source = await this.loadModelAsset(candidate);
          const currentVisual = this.visuals.get(entityId);
          if (!currentVisual || currentVisual.loadToken !== loadToken || currentVisual !== visual) {
            return;
          }

          this.removeModel(currentVisual);
          const clone = source.scene.clone(true);
          const mixer = source.animations.length > 0
            ? new THREE.AnimationMixer(clone)
            : null;
          const actions = new Map<RenderableAnimationState, THREE.AnimationAction>();

          for (const stateKey of Object.keys(CLIP_HINTS_BY_STATE) as RenderableAnimationState[]) {
            const clip = this.findMatchingClip(source.animations, CLIP_HINTS_BY_STATE[stateKey]);
            if (clip) {
              const action = mixer?.clipAction(clip);
              if (action) {
                action.enabled = false;
                actions.set(stateKey, action);
              }
            }
          }

          currentVisual.currentModel = clone;
          currentVisual.mixer = mixer;
          currentVisual.actions = actions;
          currentVisual.root.add(clone);
          this.unresolvedEntityIds.delete(entityId);
          this.updatePlaceholderVisibility(entityId, false);
          return;
        } catch {
          // Keep explicit unresolved state and allow retries on subsequent state updates.
        }
      }

      const currentVisual = this.visuals.get(entityId);
      if (currentVisual && currentVisual === visual && currentVisual.loadToken === loadToken) {
        this.unresolvedEntityIds.add(entityId);
      }
    })();
  }

  private updatePlaceholderVisibility(entityId: number, visible: boolean): void {
    const placeholder = this.findPlaceholderMesh(entityId);
    if (!placeholder) {
      return;
    }

    const mesh = placeholder as THREE.Mesh;
    mesh.visible = visible;
  }

  private findPlaceholderMesh(entityId: number): THREE.Object3D | null {
    const targetId = entityId;
    let match: THREE.Object3D | null = null;

    this.scene.traverse((object) => {
      if (match) {
        return;
      }
      const userData = object.userData as { mapObjectIndex?: number };
      if (userData?.mapObjectIndex === targetId) {
        match = object;
      }
    });

    return match;
  }

  private removeVisual(entityId: number, visual: VisualAssetState): void {
    this.removeModel(visual);
    this.updatePlaceholderVisibility(entityId, true);
    this.scene.remove(visual.root);
    visual.root.clear();
    visual.activeState = null;
    visual.assetPath = null;
    visual.loadToken += 1;
    this.visuals.delete(entityId);
    this.unresolvedEntityIds.delete(entityId);
  }

  private removeModel(visual: VisualAssetState): void {
    if (visual.mixer) {
      visual.mixer.stopAllAction();
      visual.mixer.uncacheRoot(visual.currentModel);
      visual.mixer = null;
    }
    visual.actions.clear();
    visual.activeState = null;

    if (visual.currentModel !== null) {
      visual.root.remove(visual.currentModel);
      this.disposeObject3D(visual.currentModel);
      visual.currentModel = null;
    }
  }

  private applyAnimationState(visual: VisualAssetState, animationState: RenderableAnimationState): void {
    if (!visual.mixer || visual.actions.size === 0) {
      return;
    }

    if (visual.activeState === animationState) {
      return;
    }

    const nextAction = visual.actions.get(animationState);
    if (!nextAction) {
      return;
    }

    const previousAction = visual.activeState === null
      ? null
      : visual.actions.get(visual.activeState) ?? null;

    if (previousAction) {
      previousAction.fadeOut(0.1);
      previousAction.enabled = false;
    }

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.play();
    if (previousAction) {
      nextAction.crossFadeFrom(previousAction, 0.1, true);
    }
    visual.activeState = animationState;
  }

  // ==========================================================================
  // Asset loading and parsing
  // ==========================================================================

  private async loadModelAsset(assetPath: string): Promise<LoadedModelAsset> {
    const cached = this.modelCache.get(assetPath);
    if (cached) {
      return cached;
    }

    const existingPromise = this.modelLoadPromises.get(assetPath);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = this.modelLoader(assetPath).then((result) => {
      const loaded: LoadedModelAsset = {
        scene: result.scene,
        animations: result.animations,
      };
      this.modelCache.set(assetPath, loaded);
      this.modelLoadPromises.delete(assetPath);
      return loaded;
    }).catch((error) => {
      this.modelLoadPromises.delete(assetPath);
      throw error;
    });

    this.modelLoadPromises.set(assetPath, promise);
    return promise;
  }

  private createDefaultModelLoader(assetPath: string): Promise<LoadedModelAsset> {
    if (!this.assetManager) {
      throw new Error('ObjectVisualManager model loader requires an AssetManager.');
    }
    return this.assetManager.loadArrayBuffer(assetPath).then((handle) => {
      return this.parseGltfAsset(handle.data, assetPath);
    });
  }

  private parseGltfAsset(data: ArrayBuffer, path: string): Promise<LoadedModelAsset> {
    return new Promise<LoadedModelAsset>((resolve, reject) => {
      this.gltfLoader.parse(
        data,
        path,
        (gltf) => {
          resolve({
            scene: gltf.scene,
            animations: gltf.animations,
          });
        },
        reject,
      );
    });
  }

  private findMatchingClip(
    clips: readonly THREE.AnimationClip[],
    candidates: readonly string[],
  ): THREE.AnimationClip | null {
    for (const candidate of candidates) {
      const found = clips.find((clip) => clip.name.toLowerCase() === candidate.toLowerCase())
        || clips.find((clip) => clip.name.toLowerCase().includes(candidate.toLowerCase()));
      if (found) {
        return found;
      }
    }
    return null;
  }

  private resolveCandidateAssetPaths(rawPath: string): string[] {
    const normalized = rawPath
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/{2,}/g, '/');
    if (!normalized) {
      return [];
    }

    const segments = normalized.split('/');
    const filename = segments[segments.length - 1] ?? '';
    const extensionMatch = filename.match(/\.([A-Za-z0-9]+)$/);
    const extension = extensionMatch?.[1]?.toLowerCase();

    const candidates: string[] = [];
    const pushed = new Set<string>();
    const push = (candidate: string): void => {
      const cleaned = candidate.trim();
      if (!cleaned || pushed.has(cleaned)) return;
      pushed.add(cleaned);
      candidates.push(cleaned);
    };

    if (!extension) {
      for (const ext of this.config.modelExtensions) {
        push(`${normalized}${ext}`);
      }
      return candidates;
    }

    if (extension === 'w3d') {
      push(normalized.replace(/\.w3d$/i, '.gltf'));
    } else {
      push(normalized);
    }

    return candidates;
  }

  private selectAssetPath(renderAssetPath: string | null, renderAssetResolved: boolean): string | null {
    if (!renderAssetResolved) {
      return null;
    }
    const trimmed = renderAssetPath?.trim() ?? '';
    if (!trimmed || trimmed.toUpperCase() === 'NONE') {
      return null;
    }
    return trimmed;
  }

  private disposeObject3D(object3D: THREE.Object3D): void {
    object3D.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const entry of material) {
          entry.dispose?.();
        }
      } else {
        material?.dispose?.();
      }
    });
  }
}
