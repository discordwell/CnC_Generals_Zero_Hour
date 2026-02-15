/**
 * Game Logic & Entity Bootstrap — phase-1 gameplay scaffolding.
 *
 * Consumes converted map objects, resolves INI metadata, creates simple entity
 * representations, and supports a minimal click-to-select + click-to-move loop.
 */

import * as THREE from 'three';
import type { Subsystem } from '@generals/core';
import { IniDataRegistry, type ObjectDef } from '@generals/ini-data';
import type { IniBlock, IniValue } from '@generals/core';
import {
  MAP_XY_FACTOR,
  base64ToUint8Array,
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

export interface BridgeDestroyedCommand {
  type: 'bridgeDestroyed';
  entityId: number;
}

export interface BridgeRepairedCommand {
  type: 'bridgeRepaired';
  entityId: number;
}

export type GameLogicCommand =
  | SelectByIdCommand
  | ClearSelectionCommand
  | MoveToCommand
  | StopCommand
  | BridgeDestroyedCommand
  | BridgeRepairedCommand;

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
  bridge: Uint8Array;
  bridgePassable: Uint8Array;
  bridgeTransitions: Uint8Array;
  bridgeSegmentByCell: Int32Array;
}

const PATHFIND_CELL_SIZE = MAP_XY_FACTOR;
const COST_ORTHOGONAL = 10;
const COST_DIAGONAL = 14;
const CLIFF_HEIGHT_DELTA = 9.8;
const MAX_PATH_COST = 1e9;
const MAX_SEARCH_NODES = 500_000;
const MAX_RECONSTRUCT_STEPS = 2_000;

const NAV_CLEAR = 0;
const NAV_WATER = 1;
const NAV_CLIFF = 2;
const NAV_RUBBLE = 3;
const NAV_OBSTACLE = 4;
const NAV_BRIDGE = 5;

const OBJECT_FLAG_BRIDGE_POINT1 = 0x010;
const OBJECT_FLAG_BRIDGE_POINT2 = 0x020;

const LOCOMOTORSURFACE_GROUND = 1 << 0;
const LOCOMOTORSURFACE_WATER = 1 << 1;
const LOCOMOTORSURFACE_CLIFF = 1 << 2;
const LOCOMOTORSURFACE_AIR = 1 << 3;
const LOCOMOTORSURFACE_RUBBLE = 1 << 4;
const LOCOMOTORSET_NORMAL = 'SET_NORMAL';
const NO_SURFACES = 0;
const SOURCE_DEFAULT_PASSABLE_SURFACES = NO_SURFACES;

interface PathfindingProfile {
  acceptableSurfaces: number;
  downhillOnly: boolean;
  canPassObstacle: boolean;
  canUseBridge: boolean;
  avoidPinched: boolean;
}

interface BridgeSegmentState {
  passable: boolean;
  cellIndices: number[];
  transitionIndices: number[];
}

type ObstacleGeometryShape = 'box' | 'circle';

interface ObstacleGeometry {
  shape: ObstacleGeometryShape;
  majorRadius: number;
  minorRadius: number;
}

interface CliffStateBits {
  data: Uint8Array;
  stride: number;
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
  locomotorSurfaceMask: number;
  locomotorDownhillOnly: boolean;
  blocksPath: boolean;
  obstacleGeometry: ObstacleGeometry | null;
  obstacleFootprint: number;
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
  private readonly bridgeSegments = new Map<number, BridgeSegmentState>();
  private readonly bridgeSegmentByControlEntity = new Map<number, number>();

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

      const mapEntity = this.createMapEntity(mapObject, objectDef, iniDataRegistry, heightmap);
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

  setBridgeSegmentPassable(segmentId: number, passable: boolean): boolean {
    const grid = this.navigationGrid;
    if (!grid) {
      return false;
    }

    const segment = this.bridgeSegments.get(segmentId);
    if (!segment) {
      return false;
    }
    if (segment.passable === passable) {
      return true;
    }

    segment.passable = passable;
    const passableByte = passable ? 1 : 0;
    for (const index of segment.cellIndices) {
      grid.bridgePassable[index] = passableByte;
    }
    for (const index of segment.transitionIndices) {
      grid.bridgeTransitions[index] = passableByte;
    }

    return true;
  }

  setBridgePassableAt(worldX: number, worldZ: number, passable: boolean): boolean {
    const grid = this.navigationGrid;
    if (!grid) {
      return false;
    }

    const [cellX, cellZ] = this.worldToGrid(worldX, worldZ);
    if (cellX === null || cellZ === null) {
      return false;
    }

    const index = cellZ * grid.width + cellX;
    const segmentId = grid.bridgeSegmentByCell[index];
    if (segmentId < 0) {
      return false;
    }

    return this.setBridgeSegmentPassable(segmentId, passable);
  }

  getBridgeSegmentStates(): Array<{ segmentId: number; passable: boolean }> {
    return Array.from(this.bridgeSegments.entries())
      .map(([segmentId, segment]) => ({ segmentId, passable: segment.passable }))
      .sort((a, b) => a.segmentId - b.segmentId);
  }

  onObjectDestroyed(entityId: number): boolean {
    const segmentId = this.bridgeSegmentByControlEntity.get(entityId);
    if (segmentId === undefined) {
      return false;
    }
    return this.setBridgeSegmentPassable(segmentId, false);
  }

  onObjectRepaired(entityId: number): boolean {
    const segmentId = this.bridgeSegmentByControlEntity.get(entityId);
    if (segmentId === undefined) {
      return false;
    }
    return this.setBridgeSegmentPassable(segmentId, true);
  }

  reset(): void {
    this.clearSpawnedObjects();
    this.bridgeSegments.clear();
    this.bridgeSegmentByControlEntity.clear();
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
    iniDataRegistry: IniDataRegistry,
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

    const locomotorProfile = this.resolveLocomotorProfile(objectDef, iniDataRegistry);
    const blocksPath = this.shouldPathfindObstacle(objectDef);
    const obstacleGeometry = blocksPath ? this.resolveObstacleGeometry(objectDef) : null;
    const obstacleFootprint = blocksPath ? this.footprintInCells(category, objectDef, obstacleGeometry) : 0;
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
      bridgeFlags: mapObject.flags & (OBJECT_FLAG_BRIDGE_POINT1 | OBJECT_FLAG_BRIDGE_POINT2),
      mapCellX: Math.floor(mapObject.position.x / MAP_XY_FACTOR),
      mapCellZ: Math.floor(mapObject.position.y / MAP_XY_FACTOR),
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
      locomotorSurfaceMask: locomotorProfile.surfaceMask,
      locomotorDownhillOnly: locomotorProfile.downhillOnly,
      blocksPath,
      obstacleGeometry,
      obstacleFootprint,
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

  private shouldPathfindObstacle(objectDef: ObjectDef | undefined): boolean {
    if (!objectDef) {
      return false;
    }

    const kinds = this.normalizeKindOf(objectDef.kindOf);
    const hasKindOf = (kind: string): boolean => kinds.has(kind);

    if (hasKindOf('MINE') || hasKindOf('PROJECTILE') || hasKindOf('BRIDGE_TOWER')) {
      return false;
    }

    if (!hasKindOf('STRUCTURE')) {
      return false;
    }

    if (this.isMobileObject(objectDef, kinds)) {
      return false;
    }

    if (this.isSmallGeometry(objectDef.fields)) {
      return false;
    }

    const heightAboveTerrain = readNumericField(objectDef.fields, ['HeightAboveTerrain', 'Height']);
    if (heightAboveTerrain !== null && heightAboveTerrain > MAP_XY_FACTOR && !hasKindOf('BLAST_CRATER')) {
      return false;
    }

    return true;
  }

  private isMobileObject(objectDef: ObjectDef, kinds: Set<string>): boolean {
    const explicit = readBooleanField(objectDef.fields, ['IsMobile', 'CanMove', 'Mobile']);
    if (explicit !== null) {
      return explicit;
    }

    if (this.hasLocomotorSetDefinition(objectDef)) {
      return true;
    }

    return this.isMobileByKindOf(kinds);
  }

  private hasLocomotorSetDefinition(objectDef: ObjectDef): boolean {
    for (const block of objectDef.blocks) {
      const type = block.type.toUpperCase();
      if (type === 'LOCOMOTOR' || type === 'LOCOMOTORSET') {
        return true;
      }
    }

    return false;
  }

  private isMobileByKindOf(kinds: Set<string>): boolean {
    return (
      kinds.has('INFANTRY')
      || kinds.has('VEHICLE')
      || kinds.has('HUGE_VEHICLE')
      || kinds.has('AIRCRAFT')
      || kinds.has('DOZER')
      || kinds.has('HARVESTER')
      || kinds.has('TRANSPORT')
      || kinds.has('DRONE')
      || kinds.has('MOBILE')
    );
  }

  private isSmallGeometry(fields: Record<string, IniValue>): boolean {
    const explicitSmall = readBooleanField(fields, ['GeometryIsSmall', 'IsSmall', 'Small']);
    if (explicitSmall !== null) {
      return explicitSmall;
    }

    const major = readNumericField(fields, ['GeometryMajorRadius', 'MajorRadius']);
    const minor = readNumericField(fields, ['GeometryMinorRadius', 'MinorRadius', 'GeometryMajorRadius', 'MajorRadius']);
    if (major !== null && minor !== null) {
      const maxRadius = Math.max(Math.abs(major), Math.abs(minor));
      return maxRadius > 0 && maxRadius <= MAP_XY_FACTOR * 0.35;
    }

    return false;
  }

  private normalizeKindOf(kindOf: string[] | undefined): Set<string> {
    const normalized = new Set<string>();
    if (!kindOf) {
      return normalized;
    }

    for (const kind of kindOf) {
      normalized.add(kind.toUpperCase());
    }

    return normalized;
  }

  private resolveLocomotorProfile(
    objectDef: ObjectDef | undefined,
    iniDataRegistry: IniDataRegistry,
  ): { surfaceMask: number; downhillOnly: boolean } {
    if (!objectDef) {
      return { surfaceMask: NO_SURFACES, downhillOnly: false };
    }

    const locomotorSets = this.extractLocomotorSetEntries(objectDef);
    const normalSet = locomotorSets.get(LOCOMOTORSET_NORMAL);
    if (!normalSet || normalSet.length === 0) {
      return { surfaceMask: NO_SURFACES, downhillOnly: false };
    }

    let surfaceMask = 0;
    let downhillOnly = false;
    for (const locomotorName of normalSet) {
      const locomotor = iniDataRegistry.getLocomotor(locomotorName);
      if (!locomotor) {
        continue;
      }
      surfaceMask |= locomotor.surfaceMask;
      downhillOnly = downhillOnly || locomotor.downhillOnly;
    }

    return { surfaceMask, downhillOnly };
  }

  private extractLocomotorSetEntries(objectDef: ObjectDef): Map<string, string[]> {
    const sets = new Map<string, string[]>();

    const addEntry = (setName: string, locomotors: string[]): void => {
      const normalizedSet = setName.trim().toUpperCase();
      if (!normalizedSet || locomotors.length === 0) {
        return;
      }
      sets.set(normalizedSet, locomotors);
    };

    const parseTokens = (tokens: string[]): { setName: string; locomotors: string[] } | null => {
      if (tokens.length < 2) {
        return null;
      }
      const setName = tokens[0]!.trim();
      const locomotors = tokens
        .slice(1)
        .map((token) => token.trim())
        .filter((token) => token.length > 0 && token.toUpperCase() !== 'NONE');
      if (locomotors.length === 0) {
        return null;
      }
      return { setName, locomotors };
    };

    const parseIniScalarTokens = (value: IniValue): string[] => {
      if (typeof value === 'string') {
        return value.split(/[\s,;|]+/).filter(Boolean);
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return [String(value)];
      }
      return [];
    };

    const parseLocomotorEntries = (value: IniValue | undefined): Array<{ setName: string; locomotors: string[] }> => {
      if (value === undefined) {
        return [];
      }
      if (Array.isArray(value)) {
        return value.flatMap((entry) => parseLocomotorEntries(entry as IniValue));
      }
      const parsed = parseTokens(parseIniScalarTokens(value));
      return parsed ? [parsed] : [];
    };

    const isLocomotorSetField = (fieldName: string): boolean => {
      const normalized = fieldName.toUpperCase();
      return normalized === 'LOCOMOTOR' || normalized === 'LOCOMOTORSET';
    };

    const visitBlock = (block: IniBlock): void => {
      const blockType = block.type.toUpperCase();
      if (blockType === 'LOCOMOTORSET' || blockType === 'LOCOMOTOR') {
        const tokens = block.name.split(/\s+/).filter(Boolean);
        const parsed = parseTokens(tokens);
        if (parsed) {
          addEntry(parsed.setName, parsed.locomotors);
        }
      }

      for (const [fieldName, fieldValue] of Object.entries(block.fields)) {
        if (!isLocomotorSetField(fieldName)) {
          continue;
        }
        const parsedEntries = parseLocomotorEntries(fieldValue);
        for (const parsed of parsedEntries) {
          addEntry(parsed.setName, parsed.locomotors);
        }
      }

      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const [fieldName, fieldValue] of Object.entries(objectDef.fields)) {
      if (!isLocomotorSetField(fieldName)) {
        continue;
      }
      const parsedEntries = parseLocomotorEntries(fieldValue);
      for (const parsed of parsedEntries) {
        addEntry(parsed.setName, parsed.locomotors);
      }
    }

    for (const block of objectDef.blocks) {
      visitBlock(block);
    }

    return sets;
  }

  private resolveObstacleGeometry(objectDef: ObjectDef | undefined): ObstacleGeometry | null {
    if (!objectDef) {
      return null;
    }

    const geometryType = readStringField(objectDef.fields, ['Geometry', 'GeometryType'])?.toUpperCase() ?? '';
    const majorRaw = readNumericField(objectDef.fields, ['GeometryMajorRadius', 'MajorRadius', 'GeometryRadius', 'Radius']);
    const minorRaw = readNumericField(objectDef.fields, ['GeometryMinorRadius', 'MinorRadius']);
    const majorRadius = majorRaw !== null ? Math.abs(majorRaw) : (minorRaw !== null ? Math.abs(minorRaw) : 0);
    const minorRadius = minorRaw !== null ? Math.abs(minorRaw) : majorRadius;

    if (!Number.isFinite(majorRadius) || majorRadius <= 0) {
      return null;
    }
    if (!Number.isFinite(minorRadius) || minorRadius <= 0) {
      return null;
    }

    const shape: ObstacleGeometryShape = geometryType.includes('BOX') ? 'box' : 'circle';
    return { shape, majorRadius, minorRadius };
  }

  private rasterizeObstacleGeometry(entity: MapEntity, grid: NavigationGrid): void {
    if (!entity.obstacleGeometry) {
      return;
    }

    const centerX = entity.mesh.position.x;
    const centerZ = entity.mesh.position.z;
    if (entity.obstacleGeometry.shape === 'box') {
      const angle = entity.mesh.rotation.y;
      const major = entity.obstacleGeometry.majorRadius;
      const minor = entity.obstacleGeometry.minorRadius;
      const stepSize = MAP_XY_FACTOR * 0.5;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const ydx = s * stepSize;
      const ydz = -c * stepSize;
      const xdx = c * stepSize;
      const xdz = s * stepSize;
      const numStepsX = Math.max(1, Math.ceil((2 * major) / stepSize));
      const numStepsZ = Math.max(1, Math.ceil((2 * minor) / stepSize));
      let topLeftX = centerX - major * c - minor * s;
      let topLeftZ = centerZ + minor * c - major * s;

      for (let iz = 0; iz < numStepsZ; iz++, topLeftX += ydx, topLeftZ += ydz) {
        let worldX = topLeftX;
        let worldZ = topLeftZ;
        for (let ix = 0; ix < numStepsX; ix++, worldX += xdx, worldZ += xdz) {
          const cellX = Math.floor((worldX + 0.5) / MAP_XY_FACTOR);
          const cellZ = Math.floor((worldZ + 0.5) / MAP_XY_FACTOR);
          this.markObstacleCell(cellX, cellZ, grid);
        }
      }
      return;
    }

    const radius = entity.obstacleGeometry.majorRadius;
    const topLeftX = Math.floor(0.5 + (centerX - radius) / MAP_XY_FACTOR) - 1;
    const topLeftZ = Math.floor(0.5 + (centerZ - radius) / MAP_XY_FACTOR) - 1;
    const size = radius / MAP_XY_FACTOR + 0.4;
    const r2 = size * size;
    const centerCellX = centerX / MAP_XY_FACTOR;
    const centerCellZ = centerZ / MAP_XY_FACTOR;
    const bottomRightX = topLeftX + Math.floor(2 * size + 2);
    const bottomRightZ = topLeftZ + Math.floor(2 * size + 2);

    for (let z = topLeftZ; z < bottomRightZ; z++) {
      for (let x = topLeftX; x < bottomRightX; x++) {
        const dx = x + 0.5 - centerCellX;
        const dz = z + 0.5 - centerCellZ;
        if (dx * dx + dz * dz <= r2) {
          this.markObstacleCell(x, z, grid);
        }
      }
    }
  }

  private markObstacleCell(cellX: number, cellZ: number, grid: NavigationGrid): void {
    if (!this.isCellInBounds(cellX, cellZ, grid)) {
      return;
    }
    const index = cellZ * grid.width + cellX;
    grid.blocked[index] = 1;
    grid.terrainType[index] = NAV_OBSTACLE;
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
      const maxWorldX = Math.max(0, this.mapHeightmap.worldWidth - 0.0001);
      const maxWorldZ = Math.max(0, this.mapHeightmap.worldDepth - 0.0001);
      const clampedX = clamp(hitPoint.x, 0, maxWorldX);
      const clampedZ = clamp(hitPoint.z, 0, maxWorldZ);
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
      case 'bridgeDestroyed':
        this.onObjectDestroyed(command.entityId);
        return;
      case 'bridgeRepaired':
        this.onObjectRepaired(command.entityId);
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

    const startCandidate = this.canOccupyCell(startCellX, startCellZ, movementProfile)
      ? { x: startCellX, z: startCellZ }
      : this.findNearestPassableCell(startCellX, startCellZ, grid, movementProfile);
    if (!startCandidate) {
      return [];
    }

    const effectiveStart = startCandidate;

    const effectiveGoal = this.findNearestPassableCell(goalCellX, goalCellZ, grid, movementProfile);
    if (!effectiveGoal) {
      return [];
    }

    const startIndex = effectiveStart.z * grid.width + effectiveStart.x;
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
    fCost[startIndex] = this.pathHeuristic(effectiveStart.x, effectiveStart.z, effectiveGoal.x, effectiveGoal.z);
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
        if (grid.pinched[goalIndex] === 1) {
          const goalParentIndex = parent[goalIndex];
          if (goalParentIndex >= 0 && grid.pinched[goalParentIndex] === 0) {
            pathCells.pop();
          }
        }
        const smoothed = this.smoothCellPath(pathCells, movementProfile);
        const pathWorld = smoothed.map((cell) => this.gridToWorld(cell.x, cell.z));
        if (pathWorld.length === 0) {
          return [{ x: startX, z: startZ }];
        }

        const first = pathWorld[0]!;
        if (Math.abs(first.x - startX) > 0.0001 || Math.abs(first.z - startZ) > 0.0001) {
          pathWorld.unshift({ x: startX, z: startZ });
        }
        return pathWorld;
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
        if (!this.canTraverseBridgeTransition(currentCellX, currentCellZ, neighborX, neighborZ, movementProfile, grid)) {
          continue;
        }

        const isDiagonal = deltaX[i] !== 0 && deltaZ[i] !== 0;
        if (isDiagonal) {
          const side1X = currentCellX + deltaX[i];
          const side1Z = currentCellZ;
          const side2X = currentCellX;
          const side2Z = currentCellZ + deltaZ[i];
          const sidePassable1 = this.canOccupyCell(side1X, side1Z, movementProfile, grid)
            && this.canTraverseBridgeTransition(currentCellX, currentCellZ, side1X, side1Z, movementProfile, grid);
          const sidePassable2 = this.canOccupyCell(side2X, side2Z, movementProfile, grid)
            && this.canTraverseBridgeTransition(currentCellX, currentCellZ, side2X, side2Z, movementProfile, grid);
          if (!sidePassable1 && !sidePassable2) {
            continue;
          }
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
          const grandParentIndex = parent[parentCellIndex];
          if (grandParentIndex >= 0) {
            const [grandCellX, grandCellZ] = this.gridFromIndex(grandParentIndex);
            const prevDirX = parentCellX! - currentCellX;
            const prevDirZ = parentCellZ! - currentCellZ;
            const nextDirX = grandCellX - parentCellX!;
            const nextDirY = grandCellZ - parentCellZ!;

            if (prevDirX !== nextDirX || prevDirZ !== nextDirY) {
              const dot = prevDirX * nextDirX + prevDirZ * nextDirY;
              if (dot > 0) {
                stepCost += 4;
              } else if (dot === 0) {
                stepCost += 8;
              } else {
                stepCost += 16;
              }
            }
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
    const rawMask = (entity as { locomotorSurfaceMask?: number } | undefined)?.locomotorSurfaceMask;
    const rawDownhillOnly = (entity as { locomotorDownhillOnly?: boolean } | undefined)?.locomotorDownhillOnly;
    const mask = typeof rawMask === 'number' ? rawMask : SOURCE_DEFAULT_PASSABLE_SURFACES;
    const downhillOnly = rawDownhillOnly === true;

    return {
      acceptableSurfaces: mask,
      downhillOnly,
      canPassObstacle: (mask & LOCOMOTORSURFACE_AIR) !== 0,
      canUseBridge: true,
      avoidPinched: false,
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

    const toSurfaces = this.validLocomotorSurfacesForCellType(type, grid, index);
    if ((profile.acceptableSurfaces & toSurfaces) === 0) {
      return MAX_PATH_COST;
    }
    if (profile.downhillOnly && this.mapHeightmap) {
      const fromHeight = this.mapHeightmap.getWorldHeight(fromX * MAP_XY_FACTOR, fromZ * MAP_XY_FACTOR);
      const toHeight = this.mapHeightmap.getWorldHeight(toX * MAP_XY_FACTOR, toZ * MAP_XY_FACTOR);
      if (toHeight > fromHeight + 0.01) {
        return MAX_PATH_COST;
      }
    }

    if (grid.blocked[index] === 1 && !profile.canPassObstacle) {
      return MAX_PATH_COST;
    }

    if (type === NAV_CLIFF && grid.pinched[index] === 0) {
      const fromWorldX = fromX * MAP_XY_FACTOR;
      const fromWorldZ = fromZ * MAP_XY_FACTOR;
      const toWorldX = toX * MAP_XY_FACTOR;
      const toWorldZ = toZ * MAP_XY_FACTOR;
      if (this.mapHeightmap && Math.abs(
        this.mapHeightmap.getWorldHeight(fromWorldX, fromWorldZ)
        - this.mapHeightmap.getWorldHeight(toWorldX, toWorldZ),
      ) < MAP_XY_FACTOR) {
        cost += 7 * COST_DIAGONAL;
      }
    }
    if (grid.pinched[index] === 1 && grid.bridgePassable[index] === 0) {
      cost += COST_ORTHOGONAL;
    }

    return cost;
  }

  private pathHeuristic(cellX: number, cellZ: number, targetX: number, targetZ: number): number {
    const dx = Math.abs(cellX - targetX);
    const dz = Math.abs(cellZ - targetZ);
    if (dx > dz) {
      return COST_ORTHOGONAL * dx + (COST_ORTHOGONAL * dz) / 2;
    }
    return COST_ORTHOGONAL * dz + (COST_ORTHOGONAL * dx) / 2;
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
    const [startX, startZ] = this.gridFromIndex(startIndex);
    cells.unshift({ x: startX, z: startZ });
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
    const optimizeProfile: PathfindingProfile = { ...profile };

    while (anchor < cells.length - 1) {
      if (candidate >= cells.length) {
        const last = smoothed[smoothed.length - 1];
        const goal = cells[cells.length - 1];
        if (!last || last.x !== goal.x || last.z !== goal.z) {
          smoothed.push(cells[cells.length - 1]!);
        }
        break;
      }

      if (this.gridLineClear(cells[anchor]!, cells[candidate]!, this.navigationGrid, optimizeProfile)) {
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
      if (!this.canTraverseBridgeTransition(x, z, nextX, nextZ, profile, grid)) {
        return false;
      }
      if (nextX !== x && nextZ !== z) {
        const sidePassable1 = this.canOccupyCell(nextX, z, profile, grid)
          && this.canTraverseBridgeTransition(x, z, nextX, z, profile, grid);
        const sidePassable2 = this.canOccupyCell(x, nextZ, profile, grid)
          && this.canTraverseBridgeTransition(x, z, x, nextZ, profile, grid);
        if (!sidePassable1 && !sidePassable2) {
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
    if (nav.bridgePassable[index] === 1) {
      const bridgeSurfaces = LOCOMOTORSURFACE_GROUND | LOCOMOTORSURFACE_AIR;
      return !!profile.canUseBridge && (profile.acceptableSurfaces & bridgeSurfaces) !== 0;
    }
    if (nav.blocked[index] === 1 && !profile.canPassObstacle) {
      return false;
    }
    const cellSurfaces = this.validLocomotorSurfacesForCellType(terrain, nav, index);
    if ((profile.acceptableSurfaces & cellSurfaces) === 0) {
      return false;
    }
    if (profile.avoidPinched && nav.pinched[index] === 1) {
      return false;
    }
    return true;
  }

  private validLocomotorSurfacesForCellType(
    terrainType: number,
    nav: NavigationGrid,
    cellIndex: number,
  ): number {
    if (nav.bridgePassable[cellIndex] === 1) {
      return LOCOMOTORSURFACE_GROUND | LOCOMOTORSURFACE_AIR;
    }
    switch (terrainType) {
      case NAV_OBSTACLE:
        return LOCOMOTORSURFACE_AIR;
      case NAV_CLEAR:
        return LOCOMOTORSURFACE_GROUND | LOCOMOTORSURFACE_AIR;
      case NAV_WATER:
        return LOCOMOTORSURFACE_WATER | LOCOMOTORSURFACE_AIR;
      case NAV_RUBBLE:
        return LOCOMOTORSURFACE_RUBBLE | LOCOMOTORSURFACE_AIR;
      case NAV_CLIFF:
        return LOCOMOTORSURFACE_CLIFF | LOCOMOTORSURFACE_AIR;
      case NAV_BRIDGE:
        return nav.bridgePassable[cellIndex] === 1
          ? LOCOMOTORSURFACE_GROUND | LOCOMOTORSURFACE_AIR
          : LOCOMOTORSURFACE_AIR;
      default:
        return NO_SURFACES;
    }
  }

  private canTraverseBridgeTransition(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    profile: PathfindingProfile,
    nav: NavigationGrid | null = this.navigationGrid,
  ): boolean {
    if (!nav) {
      return false;
    }
    if (!this.isCellInBounds(fromX, fromZ, nav) || !this.isCellInBounds(toX, toZ, nav)) {
      return false;
    }
    const fromIndex = fromZ * nav.width + fromX;
    const toIndex = toZ * nav.width + toX;
    const fromBridge = nav.bridgePassable[fromIndex] === 1;
    const toBridge = nav.bridgePassable[toIndex] === 1;

    if (!fromBridge && !toBridge) {
      return true;
    }
    if (fromBridge && toBridge) {
      return true;
    }
    if (!profile.canUseBridge) {
      return false;
    }
    return nav.bridgeTransitions[fromIndex] === 1 || nav.bridgeTransitions[toIndex] === 1;
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

    const cellWidth = Math.max(1, heightmap.width - 1);
    const cellHeight = Math.max(1, heightmap.height - 1);
    const total = cellWidth * cellHeight;
    const terrainType = new Uint8Array(total);
    const blocked = new Uint8Array(total);
    const pinched = new Uint8Array(total);
    const bridge = new Uint8Array(total);
    const bridgePassable = new Uint8Array(total);
    const bridgeTransitions = new Uint8Array(total);
    const bridgeSegmentByCell = new Int32Array(total);
    bridgeSegmentByCell.fill(-1);
    this.bridgeSegments.clear();

    const waterCells = this.buildWaterCellsFromTriggers(mapData, heightmap, cellWidth, cellHeight);
    const cliffBits = this.tryDecodeMapCliffState(mapData, heightmap);

    for (let z = 0; z < cellHeight; z++) {
      for (let x = 0; x < cellWidth; x++) {
        const index = z * cellWidth + x;
        if (waterCells[index]) {
          terrainType[index] = NAV_WATER;
          continue;
        }

        if (this.isCliffBitSet(cliffBits, x, z)) {
          terrainType[index] = NAV_CLIFF;
        } else {
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
    }

    // Expand cliff zones one cell to mark adjacent passable cells as pinched, then
    // convert those pinched clear cells to cliff and add a second pinched border around
    // every cliff cell, matching the source pathfinder's classifyMap sequence.
    const expand1 = new Uint8Array(total);
    for (let z = 0; z < cellHeight; z++) {
      for (let x = 0; x < cellWidth; x++) {
        const index = z * cellWidth + x;
        if (terrainType[index] !== NAV_CLIFF) {
          continue;
        }
        for (let kx = x - 1; kx <= x + 1; kx++) {
          for (let kz = z - 1; kz <= z + 1; kz++) {
            if (!this.isMapCellInBounds(kx, kz)) {
              continue;
            }
            const nIndex = kz * cellWidth + kx;
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
    for (let i = 0; i < total; i++) {
      if (pinched[i] === 1 && terrainType[i] === NAV_CLEAR) {
        terrainType[i] = NAV_CLIFF;
      }
    }
    for (let z = 0; z < cellHeight; z++) {
      for (let x = 0; x < cellWidth; x++) {
        const index = z * cellWidth + x;
        if (!pinched[index]) {
          continue;
        }
        terrainType[index] = NAV_CLIFF;
        for (let kx = x - 1; kx <= x + 1; kx++) {
          for (let kz = z - 1; kz <= z + 1; kz++) {
            if (!this.isMapCellInBounds(kx, kz)) {
              continue;
            }
            const nIndex = kz * cellWidth + kx;
            if (terrainType[nIndex] === NAV_CLEAR) {
              pinched[nIndex] = 1;
            }
          }
        }
      }
    }

    const grid: NavigationGrid = {
      width: cellWidth,
      height: cellHeight,
      terrainType,
      blocked,
      pinched,
      bridge,
      bridgePassable,
      bridgeTransitions,
      bridgeSegmentByCell,
    };

    this.applyBridgeOverlay(mapData, grid);

    for (const entity of this.spawnedEntities.values()) {
      if (!entity.blocksPath || entity.obstacleFootprint <= 0) {
        continue;
      }
      if (entity.obstacleGeometry) {
        this.rasterizeObstacleGeometry(entity, grid);
      } else {
        const footprint = entity.obstacleFootprint;
        const [entityCellX, entityCellZ] = this.worldToGrid(entity.mesh.position.x, entity.mesh.position.z);
        if (entityCellX === null || entityCellZ === null) {
          continue;
        }
        for (let x = entityCellX - footprint; x <= entityCellX + footprint; x++) {
          for (let z = entityCellZ - footprint; z <= entityCellZ + footprint; z++) {
            this.markObstacleCell(x, z, grid);
          }
        }
      }
    }

    for (let z = 0; z < grid.height; z++) {
      for (let x = 0; x < grid.width; x++) {
        const index = z * grid.width + x;
        if (terrainType[index] !== NAV_CLEAR || blocked[index] === 1) {
          continue;
        }

        let totalOpenCount = 0;
        let orthogonalOpenCount = 0;
        for (let kx = x - 1; kx <= x + 1; kx++) {
          for (let kz = z - 1; kz <= z + 1; kz++) {
            if (!this.isMapCellInBounds(kx, kz)) {
              continue;
            }
            if (kx === x && kz === z) {
              continue;
            }
            const adjacentIndex = kz * grid.width + kx;
            if (terrainType[adjacentIndex] === NAV_CLEAR && blocked[adjacentIndex] === 0) {
              totalOpenCount++;
              if (kx === x || kz === z) {
                orthogonalOpenCount++;
              }
            }
          }
        }
        if (orthogonalOpenCount < 2 || totalOpenCount < 4) {
          blocked[index] = 1;
        }
      }
    }

    // Match source behavior: clear cells orthogonally touching obstacles are pinched but not blocked.
    for (let z = 0; z < grid.height; z++) {
      for (let x = 0; x < grid.width; x++) {
        const index = z * grid.width + x;
        if (terrainType[index] !== NAV_CLEAR || blocked[index] === 1) {
          continue;
        }
        let touchesObstacle = false;
        for (let kx = x - 1; kx <= x + 1; kx++) {
          for (let kz = z - 1; kz <= z + 1; kz++) {
            if (!this.isMapCellInBounds(kx, kz)) {
              continue;
            }
            if (kx === x || kz === z) {
              const obstacleIndex = kz * grid.width + kx;
              if (blocked[obstacleIndex] === 1) {
                touchesObstacle = true;
                break;
              }
            }
          }
          if (touchesObstacle) {
            break;
          }
        }
        if (touchesObstacle) {
          pinched[index] = 1;
        }
      }
    }

    return grid;
  }

  private tryDecodeMapCliffState(mapData: MapDataJSON, heightmap: HeightmapGrid): CliffStateBits | null {
    if (!mapData.cliffStateData) {
      return null;
    }

    const stride = mapData.cliffStateStride ?? Math.floor((heightmap.width + 7) / 8);
    if (!Number.isFinite(stride) || stride <= 0) {
      return null;
    }

    const bytes = base64ToUint8Array(mapData.cliffStateData);
    const requiredLength = heightmap.height * stride;
    if (bytes.length < requiredLength) {
      return null;
    }

    return { data: bytes, stride };
  }

  private isCliffBitSet(cliffBits: CliffStateBits | null, cellX: number, cellZ: number): boolean {
    if (!cliffBits) {
      return false;
    }
    const byteIndex = cellZ * cliffBits.stride + (cellX >> 3);
    if (byteIndex < 0 || byteIndex >= cliffBits.data.length) {
      return false;
    }
    const bitMask = 1 << (cellX & 0x7);
    return (cliffBits.data[byteIndex]! & bitMask) !== 0;
  }

  private applyBridgeOverlay(mapData: MapDataJSON, grid: NavigationGrid): void {
    const starts: Array<{ x: number; z: number; properties: Record<string, string>; entityId: number | null }> = [];
    const ends: Array<{ x: number; z: number; properties: Record<string, string>; entityId: number | null }> = [];

    for (const mapObject of mapData.objects) {
      const flags = mapObject.flags;
      if ((flags & (OBJECT_FLAG_BRIDGE_POINT1 | OBJECT_FLAG_BRIDGE_POINT2)) === 0) {
        continue;
      }

      const cellX = Math.floor(mapObject.position.x / MAP_XY_FACTOR);
      const cellZ = Math.floor(mapObject.position.y / MAP_XY_FACTOR);
      if (!this.isCellInBounds(cellX, cellZ, grid)) {
        continue;
      }

      if ((flags & OBJECT_FLAG_BRIDGE_POINT1) !== 0) {
        starts.push({
          x: cellX,
          z: cellZ,
          properties: mapObject.properties,
          entityId: this.findBridgeControlEntityId(cellX, cellZ, OBJECT_FLAG_BRIDGE_POINT1),
        });
      }
      if ((flags & OBJECT_FLAG_BRIDGE_POINT2) !== 0) {
        ends.push({
          x: cellX,
          z: cellZ,
          properties: mapObject.properties,
          entityId: this.findBridgeControlEntityId(cellX, cellZ, OBJECT_FLAG_BRIDGE_POINT2),
        });
      }
    }

    if (starts.length === 0 || ends.length === 0) {
      return;
    }

    const usedEnds = new Uint8Array(ends.length);
    for (const start of starts) {
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < ends.length; i++) {
        if (usedEnds[i] === 1) {
          continue;
        }
        const end = ends[i]!;
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const dist2 = dx * dx + dz * dz;
        if (dist2 < bestDistance) {
          bestDistance = dist2;
          bestIndex = i;
        }
      }

      if (bestIndex < 0) {
        continue;
      }
      const end = ends[bestIndex]!;
      usedEnds[bestIndex] = 1;
      const segmentId = this.bridgeSegments.size;
      const passable = this.resolveInitialBridgePassable(start.properties, end.properties);
      this.markBridgeSegment(start, end, segmentId, passable, grid);
    }
  }

  private findBridgeControlEntityId(cellX: number, cellZ: number, requiredFlag: number): number | null {
    for (const entity of this.spawnedEntities.values()) {
      const userData = entity.mesh.userData as {
        bridgeFlags?: number;
        mapCellX?: number;
        mapCellZ?: number;
      };
      if (((userData.bridgeFlags ?? 0) & requiredFlag) === 0) {
        continue;
      }
      if (userData.mapCellX === cellX && userData.mapCellZ === cellZ) {
        return entity.id;
      }
    }
    return null;
  }

  private resolveInitialBridgePassable(...propertySets: Array<Record<string, string>>): boolean {
    for (const properties of propertySets) {
      for (const [rawKey, rawValue] of Object.entries(properties)) {
        const key = rawKey.trim().toLowerCase();
        const value = rawValue.trim().toLowerCase();
        if (key.length === 0 || value.length === 0) {
          continue;
        }
        if (!/(bridge|destroy|broken|pass|state|repair|open|close|down|up)/.test(key)) {
          continue;
        }

        if (
          value.includes('down')
          || value.includes('destroyed')
          || value.includes('broken')
          || value.includes('closed')
          || value.includes('disabled')
          || value === '0'
          || value === 'false'
          || value === 'no'
        ) {
          return false;
        }
      }
    }

    return true;
  }

  private markBridgeSegment(
    start: { x: number; z: number; properties: Record<string, string>; entityId: number | null },
    end: { x: number; z: number; properties: Record<string, string>; entityId: number | null },
    segmentId: number,
    passable: boolean,
    grid: NavigationGrid,
  ): void {
    const cellIndices = new Set<number>();
    const transitionIndices = new Set<number>();
    let x = start.x;
    let z = start.z;
    const dx = Math.abs(end.x - start.x);
    const dz = Math.abs(end.z - start.z);
    const stepX = start.x < end.x ? 1 : -1;
    const stepZ = start.z < end.z ? 1 : -1;
    let err = dx - dz;

    while (true) {
      this.markBridgeCellRadius(x, z, 0, segmentId, passable, grid, cellIndices);
      if (x === end.x && z === end.z) {
        break;
      }
      const twoErr = 2 * err;
      if (twoErr > -dz) {
        err -= dz;
        x += stepX;
      }
      if (twoErr < dx) {
        err += dx;
        z += stepZ;
      }
    }

    this.markBridgeTransitionRadius(start.x, start.z, 0, segmentId, passable, grid, transitionIndices);
    this.markBridgeTransitionRadius(end.x, end.z, 0, segmentId, passable, grid, transitionIndices);

    this.bridgeSegments.set(segmentId, {
      passable,
      cellIndices: Array.from(cellIndices),
      transitionIndices: Array.from(transitionIndices),
    });
    if (start.entityId !== null) {
      this.bridgeSegmentByControlEntity.set(start.entityId, segmentId);
    }
    if (end.entityId !== null) {
      this.bridgeSegmentByControlEntity.set(end.entityId, segmentId);
    }
  }

  private markBridgeCellRadius(
    cellX: number,
    cellZ: number,
    radius: number,
    segmentId: number,
    passable: boolean,
    grid: NavigationGrid,
    cellIndices: Set<number>,
  ): void {
    for (let x = cellX - radius; x <= cellX + radius; x++) {
      for (let z = cellZ - radius; z <= cellZ + radius; z++) {
        if (!this.isCellInBounds(x, z, grid)) {
          continue;
        }
        const index = z * grid.width + x;
        if (grid.bridgeSegmentByCell[index] < 0) {
          grid.bridgeSegmentByCell[index] = segmentId;
        }
        grid.bridge[index] = 1;
        if (passable) {
          grid.bridgePassable[index] = 1;
        }
        cellIndices.add(index);
      }
    }
  }

  private markBridgeTransitionRadius(
    cellX: number,
    cellZ: number,
    radius: number,
    segmentId: number,
    passable: boolean,
    grid: NavigationGrid,
    transitionIndices: Set<number>,
  ): void {
    for (let x = cellX - radius; x <= cellX + radius; x++) {
      for (let z = cellZ - radius; z <= cellZ + radius; z++) {
        if (!this.isCellInBounds(x, z, grid)) {
          continue;
        }
        const index = z * grid.width + x;
        if (grid.bridge[index] === 1 && grid.bridgeSegmentByCell[index] === segmentId) {
          if (passable) {
            grid.bridgeTransitions[index] = 1;
          }
          transitionIndices.add(index);
        }
      }
    }
  }

  private buildWaterCellsFromTriggers(
    mapData: MapDataJSON,
    heightmap: HeightmapGrid,
    cellWidth = heightmap.width - 1,
    cellHeight = heightmap.height - 1,
  ): Uint8Array {
    const waterCells = new Uint8Array(cellWidth * cellHeight);
    const waterPolygons = mapData.triggers.filter((trigger) => trigger.isWaterArea || trigger.isRiver)
      .map((trigger) => ({
        points: trigger.points,
        minX: Math.min(...trigger.points.map((point) => point.x)),
        maxX: Math.max(...trigger.points.map((point) => point.x)),
        minZ: Math.min(...trigger.points.map((point) => point.y)),
        maxZ: Math.max(...trigger.points.map((point) => point.y)),
      }));

    for (let z = 0; z < cellHeight; z++) {
      for (let x = 0; x < cellWidth; x++) {
        const index = z * cellWidth + x;
        const worldX0 = x * PATHFIND_CELL_SIZE;
        const worldZ0 = z * PATHFIND_CELL_SIZE;
        const worldX1 = worldX0 + PATHFIND_CELL_SIZE;
        const worldZ1 = worldZ0 + PATHFIND_CELL_SIZE;
        if (
          this.isWaterAt(worldX0, worldZ0, waterPolygons)
          || this.isWaterAt(worldX1, worldZ0, waterPolygons)
          || this.isWaterAt(worldX1, worldZ1, waterPolygons)
          || this.isWaterAt(worldX0, worldZ1, waterPolygons)
        ) {
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

  private footprintInCells(
    category: ObjectCategory,
    objectDef?: ObjectDef,
    obstacleGeometry?: ObstacleGeometry | null,
  ): number {
    if (obstacleGeometry) {
      const maxRadius = Math.max(obstacleGeometry.majorRadius, obstacleGeometry.minorRadius);
      return Math.max(1, Math.ceil(maxRadius / MAP_XY_FACTOR));
    }

    const explicitFootprint = readNumericListField(
      objectDef?.fields ?? {},
      ['Footprint', 'FootPrint', 'Foundation', 'Size'],
    );
    if (explicitFootprint !== null) {
      const filtered = explicitFootprint.filter((value) => Number.isFinite(value));
      if (filtered.length === 0) {
        return 0;
      }
      const footprint = Math.max(...filtered);
      return Math.max(1, Math.round(Math.abs(footprint)));
    }

    switch (category) {
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

    const maxWorldX = Math.max(0, this.mapHeightmap.worldWidth - 0.0001);
    const maxWorldZ = Math.max(0, this.mapHeightmap.worldDepth - 0.0001);
    const clampedX = clamp(worldX, 0, maxWorldX);
    const clampedZ = clamp(worldZ, 0, maxWorldZ);
    const gridX = Math.floor(clampedX / MAP_XY_FACTOR);
    const gridZ = Math.floor(clampedZ / MAP_XY_FACTOR);
    if (!this.isMapCellInBounds(gridX, gridZ)) return [null, null];
    return [gridX, gridZ];
  }

  private isMapCellInBounds(cellX: number, cellZ: number): boolean {
    if (!this.mapHeightmap) return false;
    return (
      cellX >= 0 &&
      cellX < this.mapHeightmap.width - 1 &&
      cellZ >= 0 &&
      cellZ < this.mapHeightmap.height - 1
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
    const halfCell = MAP_XY_FACTOR / 2;
    return {
      x: cellX * MAP_XY_FACTOR + halfCell,
      z: cellZ * MAP_XY_FACTOR + halfCell,
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
    this.bridgeSegments.clear();
    this.bridgeSegmentByControlEntity.clear();
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

function readBooleanField(fields: Record<string, IniValue>, names: string[]): boolean | null {
  for (const name of names) {
    const value = fields[name];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'yes' || normalized === 'true' || normalized === '1') {
        return true;
      }
      if (normalized === 'no' || normalized === 'false' || normalized === '0') {
        return false;
      }
    }
  }

  return null;
}

function readStringField(fields: Record<string, IniValue>, names: string[]): string | null {
  for (const name of names) {
    const value = fields[name];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

function readNumericList(values: IniValue | undefined): number[] {
  if (typeof values === 'undefined') return [];
  if (typeof values === 'number') return [values];
  if (typeof values === 'string') {
    const parts = values
      .split(/[\s,;]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => Number(part));
    return parts.filter((value) => Number.isFinite(value));
  }
  if (Array.isArray(values)) {
    return values.flatMap((value) => readNumericList(value as IniValue)).filter((value) => Number.isFinite(value));
  }
  return [];
}

function readNumericField(fields: Record<string, IniValue>, names: string[]): number | null {
  for (const name of names) {
    const values = readNumericList(fields[name]);
    if (values.length > 0 && Number.isFinite(values[0])) {
      return values[0];
    }
  }

  return null;
}

function readNumericListField(fields: Record<string, IniValue>, names: string[]): number[] | null {
  for (const name of names) {
    const values = readNumericList(fields[name]);
    if (values.length > 0) {
      return values;
    }
  }

  return null;
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
