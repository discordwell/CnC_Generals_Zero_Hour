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
  renderAssetCandidates?: readonly string[];
  renderAnimationStateClips?: Partial<Record<RenderableAnimationState, string[]>>;
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
  placeholder: THREE.Mesh | null;
  assetPath: string | null;
  loadToken: number;
  currentModel: THREE.Object3D | null;
  mixer: THREE.AnimationMixer | null;
  actions: Map<RenderableAnimationState, THREE.AnimationAction>;
  activeState: RenderableAnimationState | null;
  requestedAnimationState: RenderableAnimationState;
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
  private readonly raycaster = new THREE.Raycaster();
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
      visual.requestedAnimationState = state.animationState;

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
    return Array.from(this.unresolvedEntityIds.values()).sort((left, right) => left - right);
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
      placeholder: null,
      assetPath: null,
      loadToken: 0,
      currentModel: null,
      mixer: null,
      actions: new Map(),
      activeState: null,
      requestedAnimationState: 'IDLE',
    };
  }

  private syncVisualTransform(visual: VisualAssetState, state: RenderableEntityState): void {
    visual.root.position.set(state.x, state.y, state.z);
    visual.root.rotation.y = state.rotationY;
  }

  pickObjectByInput(
    input: { mouseX: number; mouseY: number; viewportWidth: number; viewportHeight: number },
    camera: THREE.Camera,
  ): number | null {
    const ndc = this.pixelToNDC(
      input.mouseX,
      input.mouseY,
      input.viewportWidth,
      input.viewportHeight,
    );
    if (ndc === null) {
      return null;
    }

    this.raycaster.setFromCamera(ndc, camera);
    const hit = this.raycaster.intersectObjects(this.scene.children, true).at(0);
    if (!hit) {
      return null;
    }

    let current: THREE.Object3D | null = hit.object;
    while (current !== null) {
      const candidate = current.userData as { entityId?: unknown };
      const entityId = typeof candidate?.entityId === 'number'
        ? candidate.entityId
        : undefined;
      if (entityId !== undefined) {
        return entityId;
      }
      current = current.parent;
    }

    return null;
  }

  private syncVisualAsset(visual: VisualAssetState, state: RenderableEntityState): void {
    const candidateAssetPaths = this.collectCandidateAssetPaths(state);
    const entityId = visual.root.userData.entityId as number;

    if (candidateAssetPaths.length === 0) {
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

    if (visual.currentModel !== null && visual.assetPath !== null && candidateAssetPaths.includes(visual.assetPath)) {
      this.unresolvedEntityIds.delete(entityId);
      this.updatePlaceholderVisibility(entityId, false);
      return;
    }

    visual.loadToken += 1;
    const loadToken = visual.loadToken;
    visual.assetPath = candidateAssetPaths[0] ?? null;
    const normalizedCandidates = candidateAssetPaths;
    this.updatePlaceholderVisibility(entityId, true);
    this.removeModel(visual);

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
          const clipCandidatesByState = this.resolveAnimationClipCandidates(state.renderAnimationStateClips);

          for (const stateKey of Object.keys(CLIP_HINTS_BY_STATE) as RenderableAnimationState[]) {
            const clipCandidates = clipCandidatesByState[stateKey];
            const clip = this.findMatchingClip(source.animations, clipCandidates);
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
          this.applyAnimationState(currentVisual, currentVisual.requestedAnimationState);
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

  private collectCandidateAssetPaths(state: RenderableEntityState): string[] {
    const primaryPath = this.selectAssetPath(state.renderAssetPath, state.renderAssetResolved);
    if (!primaryPath) {
      return [];
    }

    const requested: string[] = [];
    const seen = new Set<string>();
    const pushCandidates = (rawCandidate: string): void => {
      for (const candidate of this.resolveCandidateAssetPaths(rawCandidate)) {
        if (!candidate || seen.has(candidate)) {
          continue;
        }
        seen.add(candidate);
        requested.push(candidate);
      }
    };

    pushCandidates(primaryPath);
    for (const candidate of state.renderAssetCandidates ?? []) {
      const token = candidate.trim();
      if (!token || token.toUpperCase() === 'NONE') {
        continue;
      }
      if (token.toUpperCase() === primaryPath.toUpperCase()) {
        continue;
      }
      pushCandidates(token);
    }

    return requested;
  }

  private resolveAnimationClipCandidates(
    renderAnimationStateClips?: Partial<Record<RenderableAnimationState, string[]>>,
  ): Record<RenderableAnimationState, string[]> {
    const next: Record<RenderableAnimationState, string[]> = {
      IDLE: [...CLIP_HINTS_BY_STATE.IDLE],
      MOVE: [...CLIP_HINTS_BY_STATE.MOVE],
      ATTACK: [...CLIP_HINTS_BY_STATE.ATTACK],
      DIE: [...CLIP_HINTS_BY_STATE.DIE],
    };

    if (!renderAnimationStateClips) {
      return next;
    }

    for (const stateKey of Object.keys(next) as RenderableAnimationState[]) {
      const sourceCandidates = renderAnimationStateClips[stateKey];
      if (!sourceCandidates || sourceCandidates.length === 0) {
        continue;
      }
      const dedupedCandidates: string[] = [];
      const seen = new Set<string>();
      for (const rawCandidate of sourceCandidates) {
        const trimmed = rawCandidate.trim();
        if (!trimmed || seen.has(trimmed.toUpperCase())) {
          continue;
        }
        seen.add(trimmed.toUpperCase());
        dedupedCandidates.push(trimmed);
      }
      if (dedupedCandidates.length > 0) {
        const fallback = CLIP_HINTS_BY_STATE[stateKey];
        const merged = [...dedupedCandidates];
        const seen = new Set(dedupedCandidates.map((candidate) => candidate.toUpperCase()));
        for (const fallbackCandidate of fallback) {
          if (!seen.has(fallbackCandidate.toUpperCase())) {
            merged.push(fallbackCandidate);
            seen.add(fallbackCandidate.toUpperCase());
          }
        }
        next[stateKey] = merged;
      }
    }

    return next;
  }

  private updatePlaceholderVisibility(entityId: number, visible: boolean): void {
    const visual = this.visuals.get(entityId);
    if (!visual) {
      return;
    }
    this.syncPlaceholder(visual, entityId, visible);
  }

  private removeVisual(entityId: number, visual: VisualAssetState): void {
    this.removeModel(visual);
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
      if (visual.currentModel) {
        visual.mixer.uncacheRoot(visual.currentModel);
      }
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

  private createPlaceholderMesh(entityId: number): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff33ff,
      transparent: true,
      opacity: 0.95,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `placeholder-${entityId}`;
    mesh.userData = { entityId };
    return mesh;
  }

  private ensurePlaceholderMesh(entityId: number): THREE.Mesh {
    const visual = this.visuals.get(entityId);
    if (!visual) {
      throw new Error(`Unknown visual state for entity ${entityId}`);
    }

    if (visual.placeholder) {
      return visual.placeholder;
    }

    const placeholder = this.createPlaceholderMesh(entityId);
    visual.placeholder = placeholder;
    visual.root.add(placeholder);
    return placeholder;
  }

  private pixelToNDC(
    mouseX: number,
    mouseY: number,
    viewportWidth: number,
    viewportHeight: number,
  ): THREE.Vector2 | null {
    if (viewportWidth <= 0 || viewportHeight <= 0 || !Number.isFinite(mouseX) || !Number.isFinite(mouseY)) {
      return null;
    }
    return new THREE.Vector2(
      (mouseX / viewportWidth) * 2 - 1,
      -(mouseY / viewportHeight) * 2 + 1,
    );
  }

  private syncPlaceholder(visual: VisualAssetState, entityId: number, visible: boolean): void {
    if (visible) {
      this.ensurePlaceholderMesh(entityId);
      visual.placeholder?.updateMatrixWorld();
    }
    if (visual.placeholder) {
      visual.placeholder.visible = visible;
    }
  }
}
