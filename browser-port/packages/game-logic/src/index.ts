/**
 * Game Logic & Entity Bootstrap — phase-1 gameplay scaffolding.
 *
 * Consumes converted map objects, resolves INI metadata, creates simple entity
 * representations, and supports a minimal click-to-select + click-to-move loop.
 */

import * as THREE from 'three';
import type { Subsystem } from '@generals/core';
import { IniDataRegistry, type ObjectDef } from '@generals/ini-data';
import {
  MAP_XY_FACTOR,
  type HeightmapGrid,
  type MapDataJSON,
  type MapObjectJSON,
} from '@generals/terrain';
import type { InputState } from '@generals/input';

export interface MapObjectPlacementSummary {
  totalObjects: number;
  spawnedObjects: number;
  skippedObjects: number;
  resolvedObjects: number;
  unresolvedObjects: number;
}

export interface SelectByIdCommand {
  type: 'select';
  entityId: number;
}

export interface ClearSelectionCommand {
  type: 'clearSelection';
}

export interface MoveToCommand {
  type: 'moveTo';
  entityId: number;
  targetX: number;
  targetZ: number;
}

export interface StopCommand {
  type: 'stop';
  entityId: number;
}

export type GameLogicCommand = SelectByIdCommand | ClearSelectionCommand | MoveToCommand | StopCommand;

export interface GameLogicConfig {
  /**
   * Include unresolved objects as magenta placeholders.
   * If false, unresolved templates are skipped entirely.
   */
  renderUnknownObjects: boolean;
  /** Units default speed, in world units per second. */
  defaultMoveSpeed: number;
  /** Terrain snap speed while moving. */
  terrainSnapSpeed: number;
}

type ObjectCategory = 'air' | 'building' | 'infantry' | 'vehicle' | 'unknown';

interface VectorXZ {
  x: number;
  z: number;
}

interface NavigationGrid {
  width: number;
  height: number;
  terrainType: Uint8Array;
  blocked: Uint8Array;
  pinched: Uint8Array;
}

const PATHFIND_CELL_SIZE = MAP_XY_FACTOR;
const COST_ORTHOGONAL = 10;
const COST_DIAGONAL = 14;
const COST_CLIFF = COST_DIAGONAL * 7;
const COST_RUBBLE = COST_DIAGONAL;
const CLIFF_HEIGHT_DELTA = MAP_XY_FACTOR * 0.9;
const MAX_PATH_COST = 1e9;
const MAX_SEARCH_NODES = 500_000;
const MAX_RECONSTRUCT_STEPS = 2_000;

const NAV_CLEAR = 0;
const NAV_WATER = 1;
const NAV_CLIFF = 2;
const NAV_RUBBLE = 3;
const NAV_OBSTACLE = 4;

interface PathfindingProfile {
  canCrossWater: boolean;
  canCrossCliff: boolean;
  canCrossRubble: boolean;
  canPassObstacle: boolean;
  avoidPinched: boolean;
}

interface MapEntity {
  id: number;
  templateName: string;
  category: ObjectCategory;
  side?: string;
  resolved: boolean;
  mesh: THREE.Mesh;
  baseHeight: number;
  nominalHeight: number;
  selected: boolean;
  canMove: boolean;
  movePath: VectorXZ[];
  pathIndex: number;
  moving: boolean;
  speed: number;
  moveTarget: VectorXZ | null;
}

const DEFAULT_GAME_LOGIC_CONFIG: Readonly<GameLogicConfig> = {
  renderUnknownObjects: true,
  defaultMoveSpeed: 18,
  terrainSnapSpeed: 6,
};

const OBJECT_DONT_RENDER_FLAG = 0x100;

export class GameLogicSubsystem implements Subsystem {
  readonly name = 'GameLogic';

  private readonly scene: THREE.Scene;
  private readonly config: GameLogicConfig;
  private readonly spawnedEntities = new Map<number, MapEntity>();
  private readonly materialCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly geometryCache = new Map<ObjectCategory, THREE.BufferGeometry>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private nextId = 1;
  private animationTime = 0;
  private selectedEntityId: number | null = null;
  private mapHeightmap: HeightmapGrid | null = null;
  private navigationGrid: NavigationGrid | null = null;
  private readonly commandQueue: GameLogicCommand[] = [];
  private frameCounter = 0;

  private placementSummary: MapObjectPlacementSummary = {
    totalObjects: 0,
    spawnedObjects: 0,
    skippedObjects: 0,
    resolvedObjects: 0,
    unresolvedObjects: 0,
  };

  constructor(scene: THREE.Scene, config?: Partial<GameLogicConfig>) {
    this.scene = scene;
    this.config = { ...DEFAULT_GAME_LOGIC_CONFIG, ...config };
  }

  init(): void {
    // No async startup required for the bootstrap stage.
  }

  /**
   * Resolve map objects against INI definitions and create placeholder meshes.
   *
   * Returns a compact summary for debug overlays and future HUD wiring.
   */
  loadMapObjects(
    mapData: MapDataJSON,
    iniDataRegistry: IniDataRegistry,
    heightmap: HeightmapGrid | null,
  ): MapObjectPlacementSummary {
    this.clearSpawnedObjects();
    this.mapHeightmap = heightmap;

    this.placementSummary = {
      totalObjects: mapData.objects.length,
      spawnedObjects: 0,
      skippedObjects: 0,
      resolvedObjects: 0,
      unresolvedObjects: 0,
    };

    for (const mapObject of mapData.objects) {
      if ((mapObject.flags & OBJECT_DONT_RENDER_FLAG) !== 0) {
        this.placementSummary.skippedObjects++;
        continue;
      }

      const objectDef = iniDataRegistry.getObject(mapObject.templateName);
      const resolved = objectDef !== undefined;

      if (!resolved && !this.config.renderUnknownObjects) {
        this.placementSummary.skippedObjects++;
        continue;
      }

      const mapEntity = this.createMapEntity(mapObject, objectDef, heightmap);
      this.spawnedEntities.set(mapEntity.id, mapEntity);
      this.scene.add(mapEntity.mesh);

      this.placementSummary.spawnedObjects++;
      if (resolved) {
        this.placementSummary.resolvedObjects++;
      } else {
        this.placementSummary.unresolvedObjects++;
      }
    }

    this.navigationGrid = this.buildNavigationGrid(mapData, heightmap);

    return this.placementSummary;
  }

  getPlacementSummary(): MapObjectPlacementSummary {
    return { ...this.placementSummary };
  }

  /**
   * Minimal RTS interaction:
   * - Left click: select a spawned entity.
   * - Right click: issue a move command to selected entity.
   */
  handlePointerInput(
    input: InputState,
    camera: THREE.Camera,
  ): void {
    if (input.leftMouseClick) {
      const pickedEntityId = this.pickObjectByMouse(input, camera);
      if (pickedEntityId === null) {
        this.submitCommand({ type: 'clearSelection' });
      } else {
        this.submitCommand({ type: 'select', entityId: pickedEntityId });
      }
    }
    if (input.rightMouseClick && this.selectedEntityId !== null) {
      const moveTarget = this.getMoveTargetFromMouse(input, camera);
      if (moveTarget !== null) {
        this.submitCommand({
          type: 'moveTo',
          entityId: this.selectedEntityId,
          targetX: moveTarget.x,
          targetZ: moveTarget.z,
        });
      }
    }
  }

  /**
   * Update movement and placeholder animation.
   */
  update(dt: number): void {
    this.animationTime += dt;
    this.frameCounter++;
    this.flushCommands();
    this.updateEntityMovement(dt);
  }

  submitCommand(command: GameLogicCommand): void {
    this.commandQueue.push(command);
  }

  getSelectedEntityId(): number | null {
    return this.selectedEntityId;
  }

  reset(): void {
    this.clearSpawnedObjects();
    this.selectedEntityId = null;
    this.nextId = 1;
    this.animationTime = 0;
    this.mapHeightmap = null;
    this.navigationGrid = null;
    this.placementSummary = {
      totalObjects: 0,
      spawnedObjects: 0,
      skippedObjects: 0,
      resolvedObjects: 0,
      unresolvedObjects: 0,
    };
  }

  dispose(): void {
    this.clearSpawnedObjects();

    for (const material of this.materialCache.values()) {
      material.dispose();
    }
    this.materialCache.clear();

    for (const geometry of this.geometryCache.values()) {
      geometry.dispose();
    }
    this.geometryCache.clear();
  }

  private createMapEntity(
    mapObject: MapObjectJSON,
    objectDef: ObjectDef | undefined,
    heightmap: HeightmapGrid | null,
  ): MapEntity {
    const kindOf = objectDef?.kindOf;
    const category = this.inferCategory(kindOf, objectDef?.fields.KindOf);
    const isResolved = objectDef !== undefined;
    const objectId = this.nextId++;

    const { geometry, nominalHeight } = this.getGeometry(category);
    const material = this.getMaterial({
      category,
      resolved: isResolved,
      side: objectDef?.side,
      selected: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    const [worldX, worldY, worldZ] = this.objectToWorldPosition(mapObject, heightmap);
    const baseHeight = nominalHeight / 2;

    mesh.position.set(worldX, worldY + baseHeight, worldZ);
    mesh.rotation.y = THREE.MathUtils.degToRad(mapObject.angle);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      mapObjectIndex: objectId,
      templateName: mapObject.templateName,
      unresolved: !isResolved,
      category,
    };

    return {
      id: objectId,
      templateName: mapObject.templateName,
      category,
      side: objectDef?.side,
      resolved: isResolved,
      mesh,
      baseHeight,
      nominalHeight,
      selected: false,
      canMove: category === 'infantry' || category === 'vehicle' || category === 'air',
      movePath: [],
      pathIndex: 0,
      moving: false,
      speed: this.config.defaultMoveSpeed,
      moveTarget: null,
    };
  }

  private inferCategory(kindOf: string[] | undefined, fallbackKindOf?: unknown): ObjectCategory {
    const kinds = kindOf ?? coerceStringArray(fallbackKindOf);
    if (kinds.length === 0) {
      return 'unknown';
    }

    const uppercaseKinds = kinds.map((value) => value.toUpperCase());
    if (uppercaseKinds.includes('AIRCRAFT')) return 'air';
    if (uppercaseKinds.includes('STRUCTURE')) return 'building';
    if (uppercaseKinds.includes('INFANTRY')) return 'infantry';
    if (uppercaseKinds.includes('VEHICLE') || uppercaseKinds.includes('HUGE_VEHICLE')) return 'vehicle';

    return 'unknown';
  }

  private getGeometry(category: ObjectCategory): { geometry: THREE.BufferGeometry; nominalHeight: number } {
    const cached = this.geometryCache.get(category);
    if (cached) {
      return { geometry: cached, nominalHeight: nominalHeightForCategory(category) };
    }

    const created = buildGeometry(category);
    this.geometryCache.set(category, created.geometry);
    return created;
  }

  private getMaterial(options: {
    category: ObjectCategory;
    resolved: boolean;
    side?: string;
    selected: boolean;
  }): THREE.MeshStandardMaterial {
    const key = `${options.category}|${options.resolved ? 'resolved' : 'unresolved'}|${options.side ?? 'none'}|${options.selected ? 'selected' : 'normal'}`;
    const cached = this.materialCache.get(key);
    if (cached) return cached;

    const baseColor = options.resolved
      ? colorBySide(options.side)
      : 0xff33ff;
    const emissive = options.selected ? 0x3344aa : (options.resolved ? 0x101010 : 0x551155);

    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive,
      roughness: 0.6,
      metalness: 0.15,
      transparent: true,
      opacity: 0.95,
    });

    this.materialCache.set(key, material);
    return material;
  }

  private objectToWorldPosition(
    mapObject: MapObjectJSON,
    heightmap: HeightmapGrid | null,
  ): [number, number, number] {
    const worldX = mapObject.position.x;
    // Original C&C coordinates: x->ThreeX, y->ThreeZ, z->ThreeY.
    const worldZ = mapObject.position.y;
    const terrainHeight = heightmap ? heightmap.getInterpolatedHeight(worldX, worldZ) : 0;
    const worldY = terrainHeight + mapObject.position.z;

    return [worldX, worldY, worldZ];
  }

  private pickObjectByMouse(input: InputState, camera: THREE.Camera): number | null {
    const ndc = this.pixelToNDC(input.mouseX, input.mouseY, input.viewportWidth, input.viewportHeight);
    if (ndc === null) return null;

    this.raycaster.setFromCamera(ndc, camera);
    const hit = this.raycaster.intersectObjects(this.getRaycastTargets(), true).at(0);
    if (!hit) return null;

    const candidate = (hit.object as THREE.Mesh & { userData: { mapObjectIndex?: number } }).userData?.mapObjectIndex;
    if (typeof candidate === 'number') {
      return candidate;
    }

    if (hit.object.parent) {
      const parentId = (hit.object.parent as THREE.Mesh & { userData?: { mapObjectIndex?: number } })?.userData?.mapObjectIndex;
      if (typeof parentId === 'number') {
        return parentId;
      }
    }

    return null;
  }

  private getMoveTargetFromMouse(input: InputState, camera: THREE.Camera): VectorXZ | null {
    const ndc = this.pixelToNDC(input.mouseX, input.mouseY, input.viewportWidth, input.viewportHeight);
    if (ndc === null) return null;

    this.raycaster.setFromCamera(ndc, camera);
    const hitPoint = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hitPoint)) {
      return null;
    }

    if (this.mapHeightmap) {
      const clampedX = clamp(hitPoint.x, 0, this.mapHeightmap.worldWidth);
      const clampedZ = clamp(hitPoint.z, 0, this.mapHeightmap.worldDepth);
      return {
        x: clampedX,
        z: clampedZ,
      };
    }

    return {
      x: hitPoint.x,
      z: hitPoint.z,
    };
  }

  private flushCommands(): void {
    while (this.commandQueue.length > 0) {
      const command = this.commandQueue.shift();
      if (!command) return;
      this.applyCommand(command);
    }
  }

  private applyCommand(command: GameLogicCommand): void {
    switch (command.type) {
      case 'clearSelection': {
        this.selectedEntityId = null;
        this.clearEntitySelectionState();
        return;
      }
      case 'select': {
        const picked = this.spawnedEntities.get(command.entityId);
        if (!picked) return;
        this.selectedEntityId = command.entityId;
        this.updateSelectionHighlight();
        return;
      }
      case 'moveTo':
        this.issueMoveTo(command.entityId, command.targetX, command.targetZ);
        return;
      case 'stop':
        this.stopEntity(command.entityId);
        return;
      default:
        return;
    }
  }

  private issueMoveTo(entityId: number, targetX: number, targetZ: number): void {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity || !entity.canMove) return;

    const path = this.findPath(entity.mesh.position.x, entity.mesh.position.z, targetX, targetZ, entity);
    if (path.length === 0) {
      entity.moving = false;
      entity.moveTarget = null;
      entity.movePath = [];
      entity.pathIndex = 0;
      return;
    }

    entity.moving = true;
    entity.movePath = path;
    entity.pathIndex = 0;
    entity.moveTarget = entity.movePath[0]!;
  }

  private stopEntity(entityId: number): void {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) return;

    entity.moving = false;
    entity.moveTarget = null;
    entity.movePath = [];
    entity.pathIndex = 0;
  }

  private findPath(startX: number, startZ: number, targetX: number, targetZ: number, mover?: MapEntity): VectorXZ[] {
    if (!this.navigationGrid) {
      return [{ x: targetX, z: targetZ }];
    }

    const grid = this.navigationGrid;
    const movementProfile = this.getMovementProfile(mover);
    const start = this.worldToGrid(startX, startZ);
    const goal = this.worldToGrid(targetX, targetZ);

    const startCellX = start[0];
    const startCellZ = start[1];
    const goalCellX = goal[0];
    const goalCellZ = goal[1];

    if (startCellX === null || startCellZ === null || goalCellX === null || goalCellZ === null) {
      return [];
    }

    if (!this.canOccupyCell(startCellX, startCellZ, movementProfile)) {
      return [];
    }

    if (startCellX === goalCellX && startCellZ === goalCellZ) {
      return [];
    }

    const effectiveGoal = this.findNearestPassableCell(goalCellX, goalCellZ, grid, movementProfile);
    if (!effectiveGoal) {
      return [];
    }

    const startIndex = startCellZ * grid.width + startCellX;
    const goalIndex = effectiveGoal.z * grid.width + effectiveGoal.x;
    const total = grid.width * grid.height;

    const open: number[] = [];
    const parent = new Int32Array(total);
    const gCost = new Float64Array(total);
    const fCost = new Float64Array(total);
    const inOpen = new Uint8Array(total);
    const inClosed = new Uint8Array(total);
    parent.fill(-1);

    for (let i = 0; i < total; i++) {
      gCost[i] = Number.POSITIVE_INFINITY;
      fCost[i] = Number.POSITIVE_INFINITY;
    }

    gCost[startIndex] = 0;
    fCost[startIndex] = this.pathHeuristic(startCellX, startCellZ, effectiveGoal.x, effectiveGoal.z);
    open.push(startIndex);
    inOpen[startIndex] = 1;

    const deltaX = [1, 0, -1, 0, 1, -1, -1, 1];
    const deltaZ = [0, 1, 0, -1, 1, 1, -1, -1];
    let searched = 0;

    while (open.length > 0) {
      searched += 1;
      if (searched > MAX_SEARCH_NODES) {
        break;
      }

      let bestOpenIndex = 0;
      let bestF = fCost[open[0]!] ?? MAX_PATH_COST;
      for (let i = 1; i < open.length; i++) {
        const candidateIndex = open[i];
        const candidateF = fCost[candidateIndex];
        if (candidateF < bestF) {
          bestF = candidateF;
          bestOpenIndex = i;
        }
      }

      const currentIndex = open[bestOpenIndex]!;
      open.splice(bestOpenIndex, 1);
      inOpen[currentIndex] = 0;
      inClosed[currentIndex] = 1;

      if (currentIndex === goalIndex) {
        const pathCells = this.reconstructPath(parent, startIndex, goalIndex);
        const smoothed = this.smoothCellPath(pathCells, movementProfile);
        return smoothed.map((cell) => this.gridToWorld(cell.x, cell.z));
      }

      const [currentCellX, currentCellZ] = this.gridFromIndex(currentIndex);
      const parentCellIndex = parent[currentIndex];
      const [parentCellX, parentCellZ] = parentCellIndex >= 0
        ? this.gridFromIndex(parentCellIndex)
        : [undefined, undefined];

      for (let i = 0; i < deltaX.length; i++) {
        const neighborX = currentCellX + deltaX[i];
        const neighborZ = currentCellZ + deltaZ[i];
        if (!this.isCellInBounds(neighborX, neighborZ, grid)) {
          continue;
        }

        const isDiagonal = deltaX[i] !== 0 && deltaZ[i] !== 0;
        if (
          isDiagonal
          && !(
            this.canOccupyCell(currentCellX + deltaX[i], currentCellZ, movementProfile, grid)
            && this.canOccupyCell(currentCellX, currentCellZ + deltaZ[i], movementProfile, grid)
          )
        ) {
          continue;
        }

        const neighborIndex = neighborZ * grid.width + neighborX;
        if (inClosed[neighborIndex] === 1) {
          continue;
        }

        if (!this.canOccupyCell(neighborX, neighborZ, movementProfile, grid)) {
          continue;
        }

        const moveCost = this.pathCost(currentCellX, currentCellZ, neighborX, neighborZ, grid, movementProfile);
        let stepCost = moveCost;
        if (parentCellIndex >= 0) {
          const deltaPrevX = parentCellX! - currentCellX;
          const deltaPrevZ = parentCellZ! - currentCellZ;
          const deltaNowX = currentCellX - neighborX;
          const deltaNowZ = currentCellZ - neighborZ;

          if (deltaPrevX !== deltaNowX || deltaPrevZ !== deltaNowZ) {
            stepCost += 8;
          }
        }

        const tentativeG = gCost[currentIndex] + stepCost;
        if (tentativeG >= gCost[neighborIndex]) {
          continue;
        }

        parent[neighborIndex] = currentIndex;
        gCost[neighborIndex] = tentativeG;
        fCost[neighborIndex] = tentativeG + this.pathHeuristic(neighborX, neighborZ, effectiveGoal.x, effectiveGoal.z);
        if (inOpen[neighborIndex] === 0) {
          open.push(neighborIndex);
          inOpen[neighborIndex] = 1;
        }
      }
    }

    return [];
  }

  private getMovementProfile(entity?: MapEntity): PathfindingProfile {
    if (!entity || entity.category === 'air') {
      return {
        canCrossWater: true,
        canCrossCliff: true,
        canCrossRubble: true,
        canPassObstacle: true,
        avoidPinched: false,
      };
    }

    return {
      canCrossWater: false,
      canCrossCliff: false,
      canCrossRubble: false,
      canPassObstacle: false,
      avoidPinched: true,
    };
  }

  private pathCost(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    grid: NavigationGrid,
    profile: PathfindingProfile,
  ): number {
    const index = toZ * grid.width + toX;
    const type = grid.terrainType[index];
    const isDiagonal = Math.abs(toX - fromX) === 1 && Math.abs(toZ - fromZ) === 1;
    let cost = isDiagonal ? COST_DIAGONAL : COST_ORTHOGONAL;

    if (type === NAV_CLIFF && !profile.canCrossCliff) {
      return MAX_PATH_COST;
    }
    if (type === NAV_RUBBLE && !profile.canCrossRubble) {
      return MAX_PATH_COST;
    }
    if (type === NAV_OBSTACLE && !profile.canPassObstacle) {
      return MAX_PATH_COST;
    }

    if (type === NAV_CLIFF) {
      cost += COST_CLIFF;
    } else if (type === NAV_RUBBLE) {
      cost += COST_RUBBLE;
    }
    if (grid.pinched[index] === 1) {
      cost += COST_ORTHOGONAL;
    }
    return cost;
  }

  private pathHeuristic(cellX: number, cellZ: number, targetX: number, targetZ: number): number {
    const dx = Math.abs(cellX - targetX);
    const dz = Math.abs(cellZ - targetZ);
    const diagonal = Math.min(dx, dz);
    return COST_DIAGONAL * diagonal + COST_ORTHOGONAL * (dx + dz - 2 * diagonal);
  }

  private reconstructPath(parent: Int32Array, startIndex: number, goalIndex: number): { x: number; z: number }[] {
    const cells: { x: number; z: number }[] = [];
    let current = goalIndex;
    let steps = 0;
    while (current !== startIndex && current >= 0 && steps < MAX_RECONSTRUCT_STEPS) {
      const [x, z] = this.gridFromIndex(current);
      cells.push({ x, z });
      const next = parent[current];
      if (next < 0) {
        break;
      }
      current = next;
      steps += 1;
    }

    cells.reverse();
    return cells;
  }

  private smoothCellPath(
    cells: { x: number; z: number }[],
    profile: PathfindingProfile,
  ): { x: number; z: number }[] {
    if (cells.length <= 2) {
      return cells;
    }

    const smoothed: { x: number; z: number }[] = [];
    let anchor = 0;
    let candidate = 2;
    smoothed.push(cells[0]!);

    while (anchor < cells.length - 1) {
      if (candidate >= cells.length) {
        const last = smoothed[smoothed.length - 1];
        const goal = cells[cells.length - 1];
        if (!last || last.x !== goal.x || last.z !== goal.z) {
          smoothed.push(cells[cells.length - 1]!);
        }
        break;
      }

      if (this.gridLineClear(cells[anchor]!, cells[candidate]!, this.navigationGrid, profile)) {
        candidate += 1;
      } else {
        smoothed.push(cells[candidate - 1]!);
        anchor = candidate - 1;
        candidate = anchor + 2;
      }
    }

    return smoothed;
  }

  private gridLineClear(
    start: { x: number; z: number },
    end: { x: number; z: number },
    grid: NavigationGrid | null,
    profile: PathfindingProfile,
  ): boolean {
    if (!grid) return false;
    let x = start.x;
    let z = start.z;
    const dx = Math.abs(end.x - start.x);
    const dz = Math.abs(end.z - start.z);
    const stepX = start.x < end.x ? 1 : -1;
    const stepZ = start.z < end.z ? 1 : -1;
    let err = dx - dz;

    while (!(x === end.x && z === end.z)) {
      const twoErr = 2 * err;
      let nextX = x;
      let nextZ = z;
      if (twoErr > -dz) {
        err -= dz;
        nextX += stepX;
      }
      if (twoErr < dx) {
        err += dx;
        nextZ += stepZ;
      }

      if (!this.canOccupyCell(nextX, nextZ, profile, grid)) {
        return false;
      }
      if (nextX !== x && nextZ !== z) {
        if (
          !this.canOccupyCell(nextX, z, profile, grid)
          || !this.canOccupyCell(x, nextZ, profile, grid)
        ) {
          return false;
        }
      }
      x = nextX;
      z = nextZ;
    }
    return true;
  }

  private canOccupyCell(cellX: number, cellZ: number, profile: PathfindingProfile, nav: NavigationGrid | null = this.navigationGrid): boolean {
    if (!nav || !this.isCellInBounds(cellX, cellZ, nav)) {
      return false;
    }

    const index = cellZ * nav.width + cellX;
    const terrain = nav.terrainType[index];

    if (terrain === NAV_OBSTACLE) {
      return !!profile.canPassObstacle;
    }
    if (terrain === NAV_WATER && !profile.canCrossWater) {
      return false;
    }
    if (terrain === NAV_CLIFF && profile.avoidPinched && nav.pinched[index] === 1) {
      return false;
    }
    if (terrain === NAV_CLIFF && !profile.canCrossCliff) {
      return false;
    }
    if (terrain === NAV_RUBBLE && !profile.canCrossRubble) {
      return false;
    }
    if (profile.avoidPinched && nav.pinched[index] === 1) {
      return false;
    }
    return true;
  }

  private findNearestPassableCell(
    cellX: number,
    cellZ: number,
    grid: NavigationGrid,
    profile: PathfindingProfile,
  ): { x: number; z: number } | null {
    if (this.canOccupyCell(cellX, cellZ, profile, grid)) {
      return { x: cellX, z: cellZ };
    }

    const maxRadius = Math.max(grid.width, grid.height);
    for (let radius = 1; radius < maxRadius; radius++) {
      for (let offset = -radius; offset <= radius; offset++) {
        const candidates: [number, number][] = [
          [cellX + offset, cellZ + radius],
          [cellX + offset, cellZ - radius],
          [cellX + radius, cellZ + offset],
          [cellX - radius, cellZ + offset],
        ];
        for (const [x, z] of candidates) {
          if (!this.isCellInBounds(x, z, grid)) {
            continue;
          }
          if (this.canOccupyCell(x, z, profile, grid)) {
            return { x, z };
          }
        }
      }
    }

    return null;
  }

  private buildNavigationGrid(mapData: MapDataJSON | null, heightmap: HeightmapGrid | null): NavigationGrid | null {
    if (!mapData || !heightmap) return null;

    const total = heightmap.width * heightmap.height;
    const terrainType = new Uint8Array(total);
    const blocked = new Uint8Array(total);
    const pinched = new Uint8Array(total);

    const waterCells = this.buildWaterCellsFromTriggers(mapData, heightmap);

    for (let z = 0; z < heightmap.height; z++) {
      for (let x = 0; x < heightmap.width; x++) {
        const index = z * heightmap.width + x;
        if (waterCells[index]) {
          terrainType[index] = NAV_WATER;
          continue;
        }

        const zX1 = Math.min(x + 1, heightmap.width - 1);
        const zZ1 = Math.min(z + 1, heightmap.height - 1);
        const h00 = heightmap.getWorldHeight(x, z);
        const h10 = heightmap.getWorldHeight(zX1, z);
        const h01 = heightmap.getWorldHeight(x, zZ1);
        const h11 = heightmap.getWorldHeight(zX1, zZ1);
        const minHeight = Math.min(h00, h10, h01, h11);
        const maxHeight = Math.max(h00, h10, h01, h11);
        if (maxHeight - minHeight > CLIFF_HEIGHT_DELTA) {
          terrainType[index] = NAV_CLIFF;
        } else {
          terrainType[index] = NAV_CLEAR;
        }
      }
    }

    // Expand cliff zones once to neighboring cells and mark those as pinched, similar in spirit to
    // the source implementation's "pinched -> cliff" treatment.
    const expand1 = new Uint8Array(total);
    for (let z = 0; z < heightmap.height; z++) {
      for (let x = 0; x < heightmap.width; x++) {
        const index = z * heightmap.width + x;
        if (terrainType[index] !== NAV_CLIFF) {
          continue;
        }
        for (let kx = x - 1; kx <= x + 1; kx++) {
          for (let kz = z - 1; kz <= z + 1; kz++) {
            if (!this.isMapCellInBounds(kx, kz)) {
              continue;
            }
            const nIndex = kz * heightmap.width + kx;
            if (terrainType[nIndex] === NAV_CLEAR) {
              expand1[nIndex] = 1;
            }
          }
        }
      }
    }
    for (let i = 0; i < total; i++) {
      if (terrainType[i] === NAV_CLEAR && expand1[i] === 1) {
        pinched[i] = 1;
      }
    }
    for (let z = 0; z < heightmap.height; z++) {
      for (let x = 0; x < heightmap.width; x++) {
        const index = z * heightmap.width + x;
        if (!pinched[index]) {
          continue;
        }
        if (terrainType[index] === NAV_CLIFF) {
          continue;
        }
        for (let kx = x - 1; kx <= x + 1; kx++) {
          for (let kz = z - 1; kz <= z + 1; kz++) {
            if (!this.isMapCellInBounds(kx, kz)) {
              continue;
            }
            const nIndex = kz * heightmap.width + kx;
            if (terrainType[nIndex] === NAV_CLEAR) {
              pinched[nIndex] = 1;
            }
          }
        }
      }
    }

    const grid: NavigationGrid = {
      width: heightmap.width,
      height: heightmap.height,
      terrainType,
      blocked,
      pinched,
    };

    for (const entity of this.spawnedEntities.values()) {
      if (entity.canMove) continue;
      const footprint = this.footprintInCells(entity);
      const [entityCellX, entityCellZ] = this.worldToGrid(entity.mesh.position.x, entity.mesh.position.z);
      if (entityCellX === null || entityCellZ === null) {
        continue;
      }
      for (let x = entityCellX - footprint; x <= entityCellX + footprint; x++) {
        for (let z = entityCellZ - footprint; z <= entityCellZ + footprint; z++) {
          if (!this.isMapCellInBounds(x, z)) {
            continue;
          }
          const obstacleIndex = z * heightmap.width + x;
          blocked[obstacleIndex] = 1;
          terrainType[obstacleIndex] = NAV_OBSTACLE;
        }
      }
    }

    return grid;
  }

  private buildWaterCellsFromTriggers(mapData: MapDataJSON, heightmap: HeightmapGrid): Uint8Array {
    const waterCells = new Uint8Array(heightmap.width * heightmap.height);
    const waterPolygons = mapData.triggers.filter((trigger) => trigger.isWaterArea || trigger.isRiver)
      .map((trigger) => ({
        points: trigger.points,
        minX: Math.min(...trigger.points.map((point) => point.x)),
        maxX: Math.max(...trigger.points.map((point) => point.x)),
        minZ: Math.min(...trigger.points.map((point) => point.y)),
        maxZ: Math.max(...trigger.points.map((point) => point.y)),
      }));

    for (let z = 0; z < heightmap.height; z++) {
      for (let x = 0; x < heightmap.width; x++) {
        const worldX = x * PATHFIND_CELL_SIZE;
        const worldZ = z * PATHFIND_CELL_SIZE;
        const index = z * heightmap.width + x;
        if (this.isWaterAt(worldX, worldZ, waterPolygons)) {
          waterCells[index] = 1;
        }
      }
    }

    return waterCells;
  }

  private isWaterAt(worldX: number, worldZ: number, polygons: Array<{ points: MapDataJSON['triggers'][number]['points']; minX: number; maxX: number; minZ: number; maxZ: number }>): boolean {
    for (const polygon of polygons) {
      if (worldX < polygon.minX || worldX > polygon.maxX || worldZ < polygon.minZ || worldZ > polygon.maxZ) {
        continue;
      }
      if (pointInPolygon(worldX, worldZ, polygon.points)) {
        return true;
      }
    }

    return false;
  }

  private footprintInCells(entity: MapEntity): number {
    switch (entity.category) {
      case 'building':
        return 1;
      case 'air':
      case 'vehicle':
      case 'unknown':
      default:
        return 0;
    }
  }

  private worldToGrid(worldX: number, worldZ: number): [number | null, number | null] {
    if (!this.mapHeightmap) return [null, null];

    const gridX = Math.floor(worldX / MAP_XY_FACTOR);
    const gridZ = Math.floor(worldZ / MAP_XY_FACTOR);
    if (!this.isMapCellInBounds(gridX, gridZ)) return [null, null];
    return [gridX, gridZ];
  }

  private isMapCellInBounds(cellX: number, cellZ: number): boolean {
    if (!this.mapHeightmap) return false;
    return (
      cellX >= 0 &&
      cellX < this.mapHeightmap.width &&
      cellZ >= 0 &&
      cellZ < this.mapHeightmap.height
    );
  }

  private isCellInBounds(cellX: number, cellZ: number, nav: NavigationGrid | null = this.navigationGrid): boolean {
    if (!nav) {
      return false;
    }
    return (
      cellX >= 0 &&
      cellX < nav.width &&
      cellZ >= 0 &&
      cellZ < nav.height
    );
  }

  private gridFromIndex(index: number): [number, number] {
    if (!this.navigationGrid) return [0, 0];
    return [index % this.navigationGrid.width, Math.floor(index / this.navigationGrid.width)];
  }

  private gridToWorld(cellX: number, cellZ: number): VectorXZ {
    return {
      x: cellX * MAP_XY_FACTOR,
      z: cellZ * MAP_XY_FACTOR,
    };
  }

  private pixelToNDC(mouseX: number, mouseY: number, viewportWidth: number, viewportHeight: number): THREE.Vector2 | null {
    if (viewportWidth <= 0 || viewportHeight <= 0) return null;

    const x = (mouseX / viewportWidth) * 2 - 1;
    const y = -(mouseY / viewportHeight) * 2 + 1;
    return new THREE.Vector2(x, y);
  }

  private updateEntityMovement(dt: number): void {
    for (const entity of this.spawnedEntities.values()) {
      if (!entity.canMove || !entity.moving || entity.moveTarget === null) {
        continue;
      }

      if (entity.pathIndex >= entity.movePath.length) {
        entity.moving = false;
        entity.moveTarget = null;
        entity.movePath = [];
        continue;
      }

      if (entity.pathIndex < entity.movePath.length && entity.moveTarget !== entity.movePath[entity.pathIndex]!) {
        entity.moveTarget = entity.movePath[entity.pathIndex]!;
      }

      const dx = entity.moveTarget.x - entity.mesh.position.x;
      const dz = entity.moveTarget.z - entity.mesh.position.z;
      const distance = Math.hypot(dx, dz);

      if (distance < 0.001) {
        entity.pathIndex += 1;
        if (entity.pathIndex >= entity.movePath.length) {
          entity.moving = false;
          entity.moveTarget = null;
          entity.movePath = [];
          continue;
        }
        entity.moveTarget = entity.movePath[entity.pathIndex]!;
        continue;
      }

      const step = entity.speed * dt;
      if (distance <= step) {
        entity.mesh.position.x = entity.moveTarget.x;
        entity.mesh.position.z = entity.moveTarget.z;
        entity.pathIndex += 1;
        if (entity.pathIndex >= entity.movePath.length) {
          entity.moving = false;
          entity.moveTarget = null;
          entity.movePath = [];
          continue;
        }
        entity.moveTarget = entity.movePath[entity.pathIndex]!;
      } else {
        const inv = 1 / distance;
        entity.mesh.position.x += dx * inv * step;
        entity.mesh.position.z += dz * inv * step;
      }

      if (this.mapHeightmap) {
        const terrainHeight = this.mapHeightmap.getInterpolatedHeight(entity.mesh.position.x, entity.mesh.position.z);
        const targetY = terrainHeight + entity.baseHeight;
        const snapAlpha = 1 - Math.exp(-this.config.terrainSnapSpeed * dt);
        entity.mesh.position.y += (targetY - entity.mesh.position.y) * snapAlpha;
      }

      // Subtle bob for unresolved movers (e.g., placeholders not in registry)
      if (!entity.resolved) {
        const bob = (Math.sin(this.animationTime * this.config.terrainSnapSpeed + entity.id) + 1) * 0.04;
        entity.mesh.position.y += bob;
      }

      entity.mesh.rotation.y = Math.atan2(dz, dx) + Math.PI / 2;
    }
  }

  private getRaycastTargets(): THREE.Object3D[] {
    return Array.from(this.spawnedEntities.values()).map((entity) => entity.mesh);
  }

  private clearEntitySelectionState(): void {
    for (const entity of this.spawnedEntities.values()) {
      if (entity.selected) {
        entity.selected = false;
        entity.mesh.material = this.getMaterial({
          category: entity.category,
          resolved: entity.resolved,
          side: entity.side,
          selected: false,
        });
      }
    }
  }

  private updateSelectionHighlight(): void {
    this.clearEntitySelectionState();

    if (this.selectedEntityId === null) return;
    const selected = this.spawnedEntities.get(this.selectedEntityId);
    if (!selected) return;

    selected.selected = true;
    selected.mesh.material = this.getMaterial({
      category: selected.category,
      resolved: selected.resolved,
      side: selected.side,
      selected: true,
    });
  }

  private clearSpawnedObjects(): void {
    this.commandQueue.length = 0;
    this.navigationGrid = null;
    for (const entity of this.spawnedEntities.values()) {
      this.scene.remove(entity.mesh);
    }
    this.spawnedEntities.clear();
    this.selectedEntityId = null;
  }
}

// ============================================================================
// Geometry and material helpers
// ============================================================================

function nominalHeightForCategory(category: ObjectCategory): number {
  switch (category) {
    case 'air':
      return 2.4;
    case 'building':
      return 8;
    case 'infantry':
      return 2;
    case 'vehicle':
      return 3;
    case 'unknown':
    default:
      return 2;
  }
}

function buildGeometry(category: ObjectCategory): {
  geometry: THREE.BufferGeometry;
  nominalHeight: number;
} {
  switch (category) {
    case 'air':
      return {
        geometry: new THREE.ConeGeometry(1.4, 2.4, 12),
        nominalHeight: 2.4,
      };
    case 'building':
      return {
        geometry: new THREE.BoxGeometry(8, 8, 8),
        nominalHeight: 8,
      };
    case 'infantry':
      return {
        geometry: new THREE.CylinderGeometry(0.6, 0.8, 2, 10),
        nominalHeight: 2,
      };
    case 'vehicle':
      return {
        geometry: new THREE.BoxGeometry(3.5, 3, 5),
        nominalHeight: 3,
      };
    case 'unknown':
    default:
      return {
        geometry: new THREE.TetrahedronGeometry(1.2),
        nominalHeight: 2,
      };
  }
}

function colorBySide(side?: string): number {
  if (!side) return 0x7f7f7f;

  switch (side.toLowerCase()) {
    case 'america':
      return 0x4f90ff;
    case 'china':
      return 0xff5a3c;
    case 'gla':
      return 0x7bcf4e;
    case 'civilian':
      return 0xbababa;
    default:
      return 0xcdbf89;
  }
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pointInPolygon(
  x: number,
  y: number,
  points: Array<{ x: number; y: number; z: number }>,
): boolean {
  if (points.length < 3) return false;

  let inside = false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const aY = a.y;
    const bY = b.y;
    if ((aY > y) !== (bY > y)) {
      const ratio = (y - aY) / (bY - aY);
      const intersectX = a.x + ratio * (b.x - a.x);
      if (intersectX > x) {
        inside = !inside;
      }
    }
  }

  return inside;
}
