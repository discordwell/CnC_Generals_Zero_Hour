/**
 * Game Logic & Entity Bootstrap — phase-1 gameplay scaffolding.
 *
 * Consumes converted map objects, resolves INI metadata, creates simple entity
 * representations, and supports a minimal click-to-select + click-to-move loop.
 */

import * as THREE from 'three';
import type { Subsystem } from '@generals/core';
import { IniDataRegistry, type ObjectDef, type WeaponDef } from '@generals/ini-data';
import type { IniBlock, IniValue } from '@generals/core';
import {
  MAP_XY_FACTOR,
  MAP_HEIGHT_SCALE,
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

export interface AttackMoveToCommand {
  type: 'attackMoveTo';
  entityId: number;
  targetX: number;
  targetZ: number;
  attackDistance: number;
}

export enum GuardMode {
  GUARDMODE_NORMAL = 0,
  GUARDMODE_GUARD_WITHOUT_PURSUIT = 1,
  GUARDMODE_GUARD_FLYING_UNITS_ONLY = 2,
}

export interface GuardPositionCommand {
  type: 'guardPosition';
  entityId: number;
  targetX: number;
  targetZ: number;
  guardMode: GuardMode;
}

export interface GuardObjectCommand {
  type: 'guardObject';
  entityId: number;
  targetEntityId: number;
  guardMode: GuardMode;
}

export interface SetRallyPointCommand {
  type: 'setRallyPoint';
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

export interface SetLocomotorSetCommand {
  type: 'setLocomotorSet';
  entityId: number;
  setName: string;
}

export interface SetLocomotorUpgradeCommand {
  type: 'setLocomotorUpgrade';
  entityId: number;
  enabled: boolean;
}

export interface ApplyUpgradeCommand {
  type: 'applyUpgrade';
  entityId: number;
  upgradeName: string;
}

export interface ApplyPlayerUpgradeCommand {
  type: 'applyPlayerUpgrade';
  upgradeName: string;
}

export interface GrantScienceCommand {
  type: 'grantScience';
  scienceName: string;
}

export interface PurchaseScienceCommand {
  type: 'purchaseScience';
  scienceName: string;
  scienceCost: number;
}

export interface IssueSpecialPowerCommand {
  type: 'issueSpecialPower';
  commandButtonId: string;
  specialPowerName: string;
  commandOption: number;
  issuingEntityIds: number[];
  sourceEntityId: number | null;
  targetEntityId: number | null;
  targetX: number | null;
  targetZ: number | null;
}

export type GameLogicCommand =
  | SelectByIdCommand
  | ClearSelectionCommand
  | MoveToCommand
  | AttackMoveToCommand
  | GuardPositionCommand
  | GuardObjectCommand
  | SetRallyPointCommand
  | StopCommand
  | BridgeDestroyedCommand
  | BridgeRepairedCommand
  | SetLocomotorSetCommand
  | SetLocomotorUpgradeCommand
  | ApplyUpgradeCommand
  | ApplyPlayerUpgradeCommand
  | GrantScienceCommand
  | PurchaseScienceCommand
  | IssueSpecialPowerCommand;

export interface SelectedEntityInfo {
  id: number;
  templateName: string;
  category: ObjectCategory;
  side?: string;
  resolved: boolean;
  canMove: boolean;
  hasAutoRallyPoint: boolean;
  isUnmanned: boolean;
  isDozer: boolean;
  isMoving: boolean;
  appliedUpgradeNames: string[];
}

export type EntityRelationship = 'enemies' | 'neutral' | 'allies';
export type LocalScienceAvailability = 'enabled' | 'disabled' | 'hidden';

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
  /**
   * If true, attack-move LOS checks are active for movers with
   * ATTACK_NEEDS_LINE_OF_SIGHT.
   */
  attackUsesLineOfSight: boolean;
}

const TEST_CRUSH_ONLY = 0;
const TEST_SQUISH_ONLY = 1;
const TEST_CRUSH_OR_SQUISH = 2;
const RELATIONSHIP_ENEMIES = 0;
const RELATIONSHIP_NEUTRAL = 1;
const RELATIONSHIP_ALLIES = 2;
type RelationshipValue = typeof RELATIONSHIP_ENEMIES | typeof RELATIONSHIP_NEUTRAL | typeof RELATIONSHIP_ALLIES;

export type ObjectCategory = 'air' | 'building' | 'infantry' | 'vehicle' | 'unknown';

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
  zonePassable: Uint8Array;
  zoneBlockWidth: number;
  zoneBlockHeight: number;
  logicalMinX: number;
  logicalMinZ: number;
  logicalMaxX: number;
  logicalMaxZ: number;
}

const PATHFIND_CELL_SIZE = MAP_XY_FACTOR;
const COST_ORTHOGONAL = 10;
const COST_DIAGONAL = 14;
const CLIFF_HEIGHT_DELTA = 9.8;
const PATHFIND_ZONE_BLOCK_SIZE = 10;
const MAX_PATH_COST = 1e9;
const MAX_SEARCH_NODES = 500_000;
const MAX_RECONSTRUCT_STEPS = 2_000;
const NO_ATTACK_DISTANCE = 0;
const ATTACK_MOVE_DISTANCE_FUDGE = 3 * MAP_XY_FACTOR;
const ATTACK_RANGE_CELL_EDGE_FUDGE = PATHFIND_CELL_SIZE * 0.25;
const ATTACK_LOS_TERRAIN_FUDGE = 0.5;

const NAV_CLEAR = 0;
const NAV_WATER = 1;
const NAV_CLIFF = 2;
const NAV_RUBBLE = 3;
const NAV_OBSTACLE = 4;
const NAV_BRIDGE = 5;
const NAV_IMPASSABLE = 6;
const NAV_BRIDGE_IMPASSABLE = 7;

const OBJECT_FLAG_BRIDGE_POINT1 = 0x010;
const OBJECT_FLAG_BRIDGE_POINT2 = 0x020;
const SOURCE_DISABLED_SHORTCUT_SPECIAL_POWER_READY_FRAME = 0xffffffff - 10;

const LOCOMOTORSURFACE_GROUND = 1 << 0;
const LOCOMOTORSURFACE_WATER = 1 << 1;
const LOCOMOTORSURFACE_CLIFF = 1 << 2;
const LOCOMOTORSURFACE_AIR = 1 << 3;
const LOCOMOTORSURFACE_RUBBLE = 1 << 4;
const LOCOMOTORSET_NORMAL = 'SET_NORMAL';
const LOCOMOTORSET_NORMAL_UPGRADED = 'SET_NORMAL_UPGRADED';
const LOCOMOTORSET_FREEFALL = 'SET_FREEFALL';
const LOCOMOTORSET_WANDER = 'SET_WANDER';
const LOCOMOTORSET_PANIC = 'SET_PANIC';
const LOCOMOTORSET_TAXIING = 'SET_TAXIING';
const LOCOMOTORSET_SUPERSONIC = 'SET_SUPERSONIC';
const LOCOMOTORSET_SLUGGISH = 'SET_SLUGGISH';
const NO_SURFACES = 0;
const SOURCE_DEFAULT_PASSABLE_SURFACES = NO_SURFACES;
const SOURCE_LOCOMOTOR_SET_NAMES = new Set<string>([
  LOCOMOTORSET_NORMAL,
  LOCOMOTORSET_NORMAL_UPGRADED,
  LOCOMOTORSET_FREEFALL,
  LOCOMOTORSET_WANDER,
  LOCOMOTORSET_PANIC,
  LOCOMOTORSET_TAXIING,
  LOCOMOTORSET_SUPERSONIC,
  LOCOMOTORSET_SLUGGISH,
]);

interface LocomotorSetProfile {
  surfaceMask: number;
  downhillOnly: boolean;
  movementSpeed: number;
}

interface PathfindingProfile {
  acceptableSurfaces: number;
  downhillOnly: boolean;
  canPassObstacle: boolean;
  canUseBridge: boolean;
  avoidPinched: boolean;
  pathDiameter: number;
}

interface PathingOccupationResult {
  enemyFixed: boolean;
  allyMoving: boolean;
  allyFixedCount: number;
  allyGoal: boolean;
}

// PathfindCell::CellFlags values mirrored from GeneralsMD AIPathfind.h.
const UNIT_NO_UNITS = 0x00;
const UNIT_GOAL = 0x01;
const UNIT_PRESENT_MOVING = 0x02;
const UNIT_PRESENT_FIXED = 0x03;
const UNIT_GOAL_OTHER_MOVING = 0x05;

interface MovementOccupancyGrid {
  width: number;
  height: number;
  flags: Uint8Array;
  unitIds: Int32Array;
  goalUnitIds: Int32Array;
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
  hasAutoRallyPoint: boolean;
  rallyPoint: VectorXZ | null;
  selected: boolean;
  canMove: boolean;
  isDozer: boolean;
  crusherLevel: number;
  crushableLevel: number;
  canBeSquished: boolean;
  isUnmanned: boolean;
  attackNeedsLineOfSight: boolean;
  isImmobile: boolean;
  largestWeaponRange: number;
  locomotorSets: Map<string, LocomotorSetProfile>;
  locomotorUpgradeTriggers: Set<string>;
  appliedUpgrades: Set<string>;
  locomotorUpgradeEnabled: boolean;
  activeLocomotorSet: string;
  locomotorSurfaceMask: number;
  locomotorDownhillOnly: boolean;
  pathDiameter: number;
  pathfindCenterInCell: boolean;
  blocksPath: boolean;
  obstacleGeometry: ObstacleGeometry | null;
  obstacleFootprint: number;
  ignoredMovementObstacleId: number | null;
  guardMode: GuardMode;
  guardTargetEntityId: number | null;
  guardTargetPosition: VectorXZ | null;
  movePath: VectorXZ[];
  pathIndex: number;
  moving: boolean;
  speed: number;
  moveTarget: VectorXZ | null;
  pathfindGoalCell: { x: number; z: number } | null;
  pathfindPosCell: { x: number; z: number } | null;
}

const DEFAULT_GAME_LOGIC_CONFIG: Readonly<GameLogicConfig> = {
  renderUnknownObjects: true,
  defaultMoveSpeed: 18,
  terrainSnapSpeed: 6,
  attackUsesLineOfSight: true,
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
  private readonly teamRelationshipOverrides = new Map<string, number>();
  private readonly playerRelationshipOverrides = new Map<string, number>();
  private readonly playerSideByIndex = new Map<number, string>();
  private readonly localPlayerUpgrades = new Set<string>();
  private readonly localPlayerSciences = new Set<string>();
  private localPlayerSciencePurchasePoints = 0;
  private readonly localPlayerScienceAvailability = new Map<string, LocalScienceAvailability>();
  private readonly shortcutSpecialPowerSourceByName = new Map<string, Map<number, number>>();
  private readonly shortcutSpecialPowerNamesByEntityId = new Map<number, Set<string>>();
  private lastIssuedSpecialPowerCommand: IssueSpecialPowerCommand | null = null;

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
   * - Right click: issue move command.
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

  getSelectedEntityInfo(): SelectedEntityInfo | null {
    if (this.selectedEntityId === null) {
      return null;
    }

    const selectedEntity = this.spawnedEntities.get(this.selectedEntityId);
    if (!selectedEntity) {
      return null;
    }

    return {
      id: selectedEntity.id,
      templateName: selectedEntity.templateName,
      category: selectedEntity.category,
      side: selectedEntity.side,
      resolved: selectedEntity.resolved,
      canMove: selectedEntity.canMove,
      hasAutoRallyPoint: selectedEntity.hasAutoRallyPoint,
      isUnmanned: selectedEntity.isUnmanned,
      isDozer: selectedEntity.isDozer,
      isMoving: selectedEntity.moving,
      appliedUpgradeNames: [...selectedEntity.appliedUpgrades],
    };
  }

  getSelectedEntityId(): number | null {
    return this.selectedEntityId;
  }

  getEntityWorldPosition(entityId: number): readonly [number, number, number] | null {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) {
      return null;
    }
    return [
      entity.mesh.position.x,
      entity.mesh.position.y,
      entity.mesh.position.z,
    ];
  }

  getEntityRallyPoint(entityId: number): readonly [number, number, number] | null {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity || !entity.rallyPoint) {
      return null;
    }

    const y = this.mapHeightmap
      ? this.mapHeightmap.getInterpolatedHeight(entity.rallyPoint.x, entity.rallyPoint.z)
      : 0;
    return [entity.rallyPoint.x, y, entity.rallyPoint.z];
  }

  getEntityRelationship(sourceEntityId: number, targetEntityId: number): EntityRelationship | null {
    const sourceEntity = this.spawnedEntities.get(sourceEntityId);
    const targetEntity = this.spawnedEntities.get(targetEntityId);
    if (!sourceEntity || !targetEntity) {
      return null;
    }

    return this.relationshipValueToLabel(this.getTeamRelationship(sourceEntity, targetEntity));
  }

  setPlayerSide(playerIndex: number, side: string | null | undefined): void {
    const normalizedPlayerIndex = this.normalizePlayerIndex(playerIndex);
    if (normalizedPlayerIndex === null) {
      return;
    }

    const normalizedSide = this.normalizeSide(side ?? '');
    if (!normalizedSide) {
      this.playerSideByIndex.delete(normalizedPlayerIndex);
      return;
    }
    this.playerSideByIndex.set(normalizedPlayerIndex, normalizedSide);
  }

  getPlayerSide(playerIndex: number): string | null {
    const normalizedPlayerIndex = this.normalizePlayerIndex(playerIndex);
    if (normalizedPlayerIndex === null) {
      return null;
    }
    return this.playerSideByIndex.get(normalizedPlayerIndex) ?? null;
  }

  getPlayerRelationshipByIndex(
    sourcePlayerIndex: number,
    targetPlayerIndex: number,
  ): EntityRelationship {
    const normalizedSourcePlayerIndex = this.normalizePlayerIndex(sourcePlayerIndex);
    const normalizedTargetPlayerIndex = this.normalizePlayerIndex(targetPlayerIndex);
    if (normalizedSourcePlayerIndex === null || normalizedTargetPlayerIndex === null) {
      return 'neutral';
    }

    if (normalizedSourcePlayerIndex === normalizedTargetPlayerIndex) {
      return 'allies';
    }

    const sourceSide = this.playerSideByIndex.get(normalizedSourcePlayerIndex);
    const targetSide = this.playerSideByIndex.get(normalizedTargetPlayerIndex);
    if (!sourceSide || !targetSide) {
      // TODO: Source parity gap: player index -> side assignment should come
      // from the Player subsystem/session data.
      return 'neutral';
    }

    return this.relationshipValueToLabel(
      this.getTeamRelationshipBySides(sourceSide, targetSide),
    );
  }

  getAttackMoveDistanceForEntity(entityId: number): number {
    const selectedEntity = this.spawnedEntities.get(entityId);
    return this.resolveAttackMoveDistance(selectedEntity);
  }

  getLocalPlayerUpgradeNames(): string[] {
    return [...this.localPlayerUpgrades];
  }

  getLocalPlayerScienceNames(): string[] {
    return [...this.localPlayerSciences];
  }

  getLocalPlayerSciencePurchasePoints(): number {
    return this.localPlayerSciencePurchasePoints;
  }

  setLocalPlayerSciencePurchasePoints(points: number): void {
    if (!Number.isFinite(points)) {
      this.localPlayerSciencePurchasePoints = 0;
      return;
    }

    this.localPlayerSciencePurchasePoints = Math.max(0, Math.trunc(points));
  }

  setLocalPlayerScienceAvailability(
    scienceName: string,
    availability: LocalScienceAvailability,
  ): boolean {
    const normalizedScience = scienceName.trim().toUpperCase();
    if (!normalizedScience) {
      return false;
    }

    if (availability === 'enabled') {
      this.localPlayerScienceAvailability.delete(normalizedScience);
      return true;
    }

    this.localPlayerScienceAvailability.set(normalizedScience, availability);
    return true;
  }

  getLocalPlayerDisabledScienceNames(): string[] {
    const disabled: string[] = [];
    for (const [scienceName, availability] of this.localPlayerScienceAvailability) {
      if (availability === 'disabled') {
        disabled.push(scienceName);
      }
    }
    return disabled;
  }

  getLocalPlayerHiddenScienceNames(): string[] {
    const hidden: string[] = [];
    for (const [scienceName, availability] of this.localPlayerScienceAvailability) {
      if (availability === 'hidden') {
        hidden.push(scienceName);
      }
    }
    return hidden;
  }

  getLastIssuedSpecialPowerCommand(): IssueSpecialPowerCommand | null {
    if (!this.lastIssuedSpecialPowerCommand) {
      return null;
    }
    return {
      ...this.lastIssuedSpecialPowerCommand,
      issuingEntityIds: [...this.lastIssuedSpecialPowerCommand.issuingEntityIds],
    };
  }

  setShortcutSpecialPowerSourceEntity(
    specialPowerName: string,
    sourceEntityId: number | null,
  ): boolean {
    const normalizedSpecialPowerName = this.normalizeShortcutSpecialPowerName(specialPowerName);
    if (!normalizedSpecialPowerName) {
      return false;
    }

    if (sourceEntityId === null) {
      this.clearTrackedShortcutSpecialPowerName(normalizedSpecialPowerName);
      return true;
    }

    if (!Number.isFinite(sourceEntityId)) {
      return false;
    }

    this.clearTrackedShortcutSpecialPowerName(normalizedSpecialPowerName);
    return this.trackShortcutSpecialPowerSourceEntity(
      normalizedSpecialPowerName,
      Math.trunc(sourceEntityId),
      0,
    );
  }

  trackShortcutSpecialPowerSourceEntity(
    specialPowerName: string,
    sourceEntityId: number,
    readyFrame: number,
  ): boolean {
    const normalizedSpecialPowerName = this.normalizeShortcutSpecialPowerName(specialPowerName);
    if (!normalizedSpecialPowerName) {
      return false;
    }
    if (!Number.isFinite(sourceEntityId)) {
      return false;
    }

    const normalizedSourceEntityId = Math.trunc(sourceEntityId);
    const normalizedReadyFrame = Number.isFinite(readyFrame)
      ? Math.max(0, Math.trunc(readyFrame))
      : SOURCE_DISABLED_SHORTCUT_SPECIAL_POWER_READY_FRAME;

    let sourcesForPower = this.shortcutSpecialPowerSourceByName.get(normalizedSpecialPowerName);
    if (!sourcesForPower) {
      sourcesForPower = new Map<number, number>();
      this.shortcutSpecialPowerSourceByName.set(normalizedSpecialPowerName, sourcesForPower);
    }
    sourcesForPower.set(normalizedSourceEntityId, normalizedReadyFrame);

    let powersForEntity = this.shortcutSpecialPowerNamesByEntityId.get(normalizedSourceEntityId);
    if (!powersForEntity) {
      powersForEntity = new Set<string>();
      this.shortcutSpecialPowerNamesByEntityId.set(normalizedSourceEntityId, powersForEntity);
    }
    powersForEntity.add(normalizedSpecialPowerName);
    return true;
  }

  clearTrackedShortcutSpecialPowerSourceEntity(sourceEntityId: number): void {
    if (!Number.isFinite(sourceEntityId)) {
      return;
    }
    const normalizedSourceEntityId = Math.trunc(sourceEntityId);
    const powersForEntity = this.shortcutSpecialPowerNamesByEntityId.get(normalizedSourceEntityId);
    if (!powersForEntity) {
      return;
    }

    for (const specialPowerName of powersForEntity) {
      const sourcesForPower = this.shortcutSpecialPowerSourceByName.get(specialPowerName);
      if (!sourcesForPower) {
        continue;
      }
      sourcesForPower.delete(normalizedSourceEntityId);
      if (sourcesForPower.size === 0) {
        this.shortcutSpecialPowerSourceByName.delete(specialPowerName);
      }
    }

    this.shortcutSpecialPowerNamesByEntityId.delete(normalizedSourceEntityId);
  }

  resolveShortcutSpecialPowerSourceEntityReadyFrame(specialPowerName: string): number | null {
    const normalizedSpecialPowerName = this.normalizeShortcutSpecialPowerName(specialPowerName);
    if (!normalizedSpecialPowerName) {
      return null;
    }
    const sourcesForPower = this.shortcutSpecialPowerSourceByName.get(normalizedSpecialPowerName);
    if (!sourcesForPower || sourcesForPower.size === 0) {
      return null;
    }

    const staleEntityIds: number[] = [];
    let bestReadyFrame: number | null = null;
    for (const [entityId, readyFrame] of sourcesForPower) {
      if (!this.spawnedEntities.has(entityId)) {
        staleEntityIds.push(entityId);
        continue;
      }
      if (bestReadyFrame === null || readyFrame < bestReadyFrame) {
        bestReadyFrame = readyFrame;
      }
    }

    for (const staleEntityId of staleEntityIds) {
      this.clearTrackedShortcutSpecialPowerSourceEntity(staleEntityId);
    }

    return bestReadyFrame;
  }

  resolveShortcutSpecialPowerSourceEntityId(specialPowerName: string): number | null {
    const normalizedSpecialPowerName = this.normalizeShortcutSpecialPowerName(specialPowerName);
    if (!normalizedSpecialPowerName) {
      return null;
    }

    const sourcesForPower = this.shortcutSpecialPowerSourceByName.get(normalizedSpecialPowerName);
    if (!sourcesForPower || sourcesForPower.size === 0) {
      return null;
    }

    // Source behavior from Player::findMostReadyShortcutSpecialPowerOfType:
    // choose the source object with the lowest ready frame for this power.
    // TODO: Source parity gap: ready-frame values currently come from command
    // card availability state, not live SpecialPowerModule cooldown frames.
    const staleEntityIds: number[] = [];
    let bestEntityId: number | null = null;
    let bestReadyFrame = Number.POSITIVE_INFINITY;
    for (const [entityId, readyFrame] of sourcesForPower) {
      if (!this.spawnedEntities.has(entityId)) {
        staleEntityIds.push(entityId);
        continue;
      }

      if (readyFrame < bestReadyFrame) {
        bestEntityId = entityId;
        bestReadyFrame = readyFrame;
      }
    }

    for (const staleEntityId of staleEntityIds) {
      this.clearTrackedShortcutSpecialPowerSourceEntity(staleEntityId);
    }

    return bestEntityId;
  }

  private normalizeShortcutSpecialPowerName(specialPowerName: string): string | null {
    const normalizedSpecialPowerName = specialPowerName.trim().toUpperCase();
    return normalizedSpecialPowerName || null;
  }

  private clearTrackedShortcutSpecialPowerName(normalizedSpecialPowerName: string): void {
    const sourcesForPower = this.shortcutSpecialPowerSourceByName.get(normalizedSpecialPowerName);
    if (!sourcesForPower) {
      return;
    }

    for (const sourceEntityId of sourcesForPower.keys()) {
      const powersForEntity = this.shortcutSpecialPowerNamesByEntityId.get(sourceEntityId);
      if (!powersForEntity) {
        continue;
      }
      powersForEntity.delete(normalizedSpecialPowerName);
      if (powersForEntity.size === 0) {
        this.shortcutSpecialPowerNamesByEntityId.delete(sourceEntityId);
      }
    }

    this.shortcutSpecialPowerSourceByName.delete(normalizedSpecialPowerName);
  }

  grantLocalPlayerUpgrade(upgradeName: string): boolean {
    const normalizedUpgrade = upgradeName.trim().toUpperCase();
    if (!normalizedUpgrade) {
      return false;
    }
    this.localPlayerUpgrades.add(normalizedUpgrade);
    return true;
  }

  grantLocalPlayerScience(scienceName: string): boolean {
    const normalizedScience = scienceName.trim().toUpperCase();
    if (!normalizedScience) {
      return false;
    }
    this.localPlayerSciences.add(normalizedScience);
    return true;
  }

  purchaseLocalPlayerScience(scienceName: string, scienceCost: number): boolean {
    const normalizedScience = scienceName.trim().toUpperCase();
    if (!normalizedScience) {
      return false;
    }

    const normalizedCost = Number.isFinite(scienceCost) ? Math.trunc(scienceCost) : 0;
    if (normalizedCost <= 0) {
      return false;
    }
    if (this.localPlayerSciences.has(normalizedScience)) {
      return false;
    }
    if (!this.isLocalSciencePurchasable(normalizedScience)) {
      return false;
    }
    if (this.localPlayerSciencePurchasePoints < normalizedCost) {
      return false;
    }

    this.localPlayerSciencePurchasePoints -= normalizedCost;
    this.localPlayerSciences.add(normalizedScience);
    return true;
  }

  resolveMoveTargetFromInput(input: InputState, camera: THREE.Camera): { x: number; z: number } | null {
    return this.getMoveTargetFromMouse(input, camera);
  }

  resolveObjectTargetFromInput(input: InputState, camera: THREE.Camera): number | null {
    return this.pickObjectByMouse(input, camera);
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
    if (index < 0 || index >= grid.bridgeSegmentByCell.length) {
      return false;
    }
    const segmentId = grid.bridgeSegmentByCell[index];
    if (segmentId === undefined || segmentId < 0) {
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

  setEntityLocomotorSet(entityId: number, setName: string): boolean {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) {
      return false;
    }
    const normalizedSet = setName.trim().toUpperCase();
    if (!SOURCE_LOCOMOTOR_SET_NAMES.has(normalizedSet)) {
      return false;
    }
    if (normalizedSet === LOCOMOTORSET_NORMAL_UPGRADED) {
      return false;
    }
    let resolvedSet = normalizedSet;
    if (
      normalizedSet === LOCOMOTORSET_NORMAL
      && entity.locomotorUpgradeEnabled
      && entity.locomotorSets.has(LOCOMOTORSET_NORMAL_UPGRADED)
    ) {
      resolvedSet = LOCOMOTORSET_NORMAL_UPGRADED;
    }
    const profile = entity.locomotorSets.get(resolvedSet);
    if (!profile) {
      return false;
    }
    entity.activeLocomotorSet = resolvedSet;
    entity.locomotorSurfaceMask = profile.surfaceMask;
    entity.locomotorDownhillOnly = profile.downhillOnly;
    entity.speed = profile.movementSpeed > 0 ? profile.movementSpeed : this.config.defaultMoveSpeed;
    return true;
  }

  setEntityLocomotorUpgrade(entityId: number, enabled: boolean): boolean {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) {
      return false;
    }
    entity.locomotorUpgradeEnabled = enabled;
    if (
      entity.activeLocomotorSet === LOCOMOTORSET_NORMAL
      || entity.activeLocomotorSet === LOCOMOTORSET_NORMAL_UPGRADED
    ) {
      this.setEntityLocomotorSet(entityId, LOCOMOTORSET_NORMAL);
    }
    return true;
  }

  setEntityRallyPoint(entityId: number, targetX: number, targetZ: number): boolean {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity || !entity.hasAutoRallyPoint) {
      return false;
    }

    entity.rallyPoint = this.clampToWorldBounds(targetX, targetZ);
    return true;
  }

  applyUpgradeToEntity(entityId: number, upgradeName: string): boolean {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) {
      return false;
    }
    const normalizedUpgrade = upgradeName.trim().toUpperCase();
    if (!normalizedUpgrade) {
      return false;
    }

    entity.appliedUpgrades.add(normalizedUpgrade);

    if (entity.locomotorUpgradeTriggers.has(normalizedUpgrade)) {
      this.setEntityLocomotorUpgrade(entityId, true);
    }
    return true;
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
    this.localPlayerUpgrades.clear();
    this.localPlayerSciences.clear();
    this.localPlayerSciencePurchasePoints = 0;
    this.localPlayerScienceAvailability.clear();
    this.shortcutSpecialPowerSourceByName.clear();
    this.shortcutSpecialPowerNamesByEntityId.clear();
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
    const normalizedKindOf = this.normalizeKindOf(kindOf);
    const isResolved = objectDef !== undefined;
    const objectId = this.nextId++;

    const { geometry, nominalHeight } = this.getGeometry(category);
    const material = this.getMaterial({
      category,
      resolved: isResolved,
      side: objectDef?.side,
      selected: false,
    });

    const locomotorSetProfiles = this.resolveLocomotorProfiles(objectDef, iniDataRegistry);
    const locomotorUpgradeTriggers = this.extractLocomotorUpgradeTriggers(objectDef);
    const largestWeaponRange = this.resolveLargestWeaponRange(objectDef, iniDataRegistry);
    const hasAutoRallyPoint = normalizedKindOf.has('AUTO_RALLYPOINT');
    const locomotorProfile = locomotorSetProfiles.get(LOCOMOTORSET_NORMAL) ?? {
      surfaceMask: NO_SURFACES,
      downhillOnly: false,
      movementSpeed: 0,
    };
    const combatProfile = this.resolveCombatCollisionProfile(objectDef);
    const attackNeedsLineOfSight = normalizedKindOf.has('ATTACK_NEEDS_LINE_OF_SIGHT');
    const isImmobile = normalizedKindOf.has('IMMOBILE');
    const blocksPath = this.shouldPathfindObstacle(objectDef);
    const obstacleGeometry = blocksPath ? this.resolveObstacleGeometry(objectDef) : null;
    const obstacleFootprint = blocksPath ? this.footprintInCells(category, objectDef, obstacleGeometry) : 0;
    const { pathDiameter, pathfindCenterInCell } = this.resolvePathRadiusAndCenter(category, objectDef, obstacleGeometry);
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

    const [posCellX, posCellZ] = this.worldToGrid(mesh.position.x, mesh.position.z);

    return {
      id: objectId,
      templateName: mapObject.templateName,
      category,
      side: objectDef?.side,
      resolved: isResolved,
      mesh,
      baseHeight,
      nominalHeight,
      hasAutoRallyPoint,
      rallyPoint: null,
      selected: false,
      crusherLevel: combatProfile.crusherLevel,
      crushableLevel: combatProfile.crushableLevel,
      canBeSquished: combatProfile.canBeSquished,
      isUnmanned: combatProfile.isUnmanned,
      attackNeedsLineOfSight,
      isImmobile,
      canMove: category === 'infantry' || category === 'vehicle' || category === 'air',
      isDozer: normalizedKindOf.has('DOZER'),
      locomotorSets: locomotorSetProfiles,
      locomotorUpgradeTriggers,
      appliedUpgrades: new Set<string>(),
      locomotorUpgradeEnabled: false,
      activeLocomotorSet: LOCOMOTORSET_NORMAL,
      locomotorSurfaceMask: locomotorProfile.surfaceMask,
      locomotorDownhillOnly: locomotorProfile.downhillOnly,
      pathDiameter,
      pathfindCenterInCell,
      blocksPath,
      obstacleGeometry,
      obstacleFootprint,
      largestWeaponRange,
      ignoredMovementObstacleId: null,
      guardMode: GuardMode.GUARDMODE_NORMAL,
      guardTargetEntityId: null,
      guardTargetPosition: null,
      movePath: [],
      pathIndex: 0,
      moving: false,
      speed: locomotorProfile.movementSpeed > 0 ? locomotorProfile.movementSpeed : this.config.defaultMoveSpeed,
      moveTarget: null,
      pathfindGoalCell: null,
      pathfindPosCell: (posCellX !== null && posCellZ !== null) ? { x: posCellX, z: posCellZ } : null,
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

  private resolveAttackMoveDistance(entity: MapEntity | undefined): number {
    if (!entity || entity.largestWeaponRange === NO_ATTACK_DISTANCE) {
      return NO_ATTACK_DISTANCE;
    }

    return entity.largestWeaponRange + ATTACK_MOVE_DISTANCE_FUDGE;
  }

  private resolveLargestWeaponRange(objectDef: ObjectDef | undefined, iniDataRegistry: IniDataRegistry): number {
    if (!objectDef) {
      return NO_ATTACK_DISTANCE;
    }

    const weaponNames = new Set<string>();
    const collectWeaponNamesFromFieldValue = (value: IniValue | undefined): void => {
      for (const tokens of this.extractIniValueTokens(value)) {
        for (const weaponName of this.extractWeaponNamesFromTokens(tokens)) {
          weaponNames.add(weaponName);
        }
      }
    };

    const collectWeaponFields = (fields: Record<string, IniValue>): void => {
      for (const [fieldName, fieldValue] of Object.entries(fields)) {
        if (fieldName.toUpperCase() !== 'WEAPON') {
          continue;
        }
        collectWeaponNamesFromFieldValue(fieldValue);
      }
    };

    collectWeaponFields(objectDef.fields);

    const visitBlock = (block: IniBlock): void => {
      collectWeaponFields(block.fields);

      if (block.type.toUpperCase() === 'WEAPONSET') {
        collectWeaponFields(block.fields);
      }

      for (const childBlock of block.blocks) {
        visitBlock(childBlock);
      }
    };

    for (const block of objectDef.blocks) {
      visitBlock(block);
    }

    let largestWeaponRange = NO_ATTACK_DISTANCE;
    for (const weaponName of weaponNames) {
      const weapon = this.findWeaponDefByName(iniDataRegistry, weaponName);
      if (!weapon) {
        continue;
      }
      const weaponRange = readNumericField(weapon.fields, ['Range', 'AttackRange']);
      if (weaponRange === null) {
        continue;
      }
      const effectiveRange = weaponRange;
      if (effectiveRange > largestWeaponRange) {
        largestWeaponRange = effectiveRange;
      }
    }

    return largestWeaponRange;
  }

  private findWeaponDefByName(iniDataRegistry: IniDataRegistry, weaponName: string): WeaponDef | undefined {
    const direct = iniDataRegistry.getWeapon(weaponName);
    if (direct) {
      return direct;
    }

    const normalizedWeaponName = weaponName.toUpperCase();
    for (const [registryWeaponName, weaponDef] of iniDataRegistry.weapons.entries()) {
      if (registryWeaponName.toUpperCase() === normalizedWeaponName) {
        return weaponDef;
      }
    }

    return undefined;
  }

  private extractIniValueTokens(value: IniValue | undefined): string[][] {
    if (typeof value === 'undefined') {
      return [];
    }
    if (value === null) {
      return [];
    }
    if (typeof value === 'string') {
      return [value.split(/[\s,;|]+/).map((token) => token.trim()).filter(Boolean)];
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return [[String(value)]];
    }
    if (Array.isArray(value)) {
      return value.flatMap((entry) => this.extractIniValueTokens(entry as IniValue));
    }
    return [];
  }

  private extractWeaponNamesFromTokens(tokens: string[]): string[] {
    const filteredTokens = tokens.filter((token) => token.trim().length > 0).map((token) => token.trim());
    if (filteredTokens.length === 0) {
      return [];
    }

    const slotNames = new Set(['PRIMARY', 'SECONDARY', 'TERTIARY']);
    const weapons: string[] = [];

    let tokenIndex = 0;
    while (tokenIndex < filteredTokens.length) {
      const token = filteredTokens[tokenIndex]!;
      const upperToken = token.toUpperCase();

      if (slotNames.has(upperToken)) {
        const weaponName = filteredTokens[tokenIndex + 1];
        tokenIndex += 2;
        if (weaponName === undefined) {
          continue;
        }
        if (weaponName.toUpperCase() === 'NONE') {
          continue;
        }
        weapons.push(weaponName);
        continue;
      }

      if (upperToken === 'NONE') {
        tokenIndex++;
        continue;
      }

      weapons.push(token);
      tokenIndex++;
    }
    return weapons;
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

  private resolveCombatCollisionProfile(objectDef: ObjectDef | undefined): {
    crusherLevel: number;
    crushableLevel: number;
    canBeSquished: boolean;
    isUnmanned: boolean;
  } {
    if (!objectDef) {
      return {
        crusherLevel: 0,
        crushableLevel: 0,
        canBeSquished: false,
        isUnmanned: false,
      };
    }

    return {
      crusherLevel: toByte(readNumericField(objectDef.fields, ['CrusherLevel', 'Crusherlevel'])),
      crushableLevel: toByte(readNumericField(objectDef.fields, ['CrushableLevel', 'Crushablelevel'])),
      canBeSquished: this.hasSquishCollideModule(objectDef),
      isUnmanned: readBooleanField(objectDef.fields, ['Unmanned', 'IsUnmanned']) === true,
    };
  }

  private hasSquishCollideModule(objectDef: ObjectDef): boolean {
    const hasSquish = (blocks: IniBlock[]): boolean => {
      for (const block of blocks) {
        const blockType = block.type.toUpperCase();
        const blockName = block.name.toUpperCase();
        if (blockType.includes('SQUISHCOLLIDE') || blockName.includes('SQUISHCOLLIDE')) {
          return true;
        }
        if (hasSquish(block.blocks)) {
          return true;
        }
      }
      return false;
    };
    return hasSquish(objectDef.blocks);
  }

  private normalizeSide(side?: string): string {
    return side ? side.trim().toLowerCase() : '';
  }

  private normalizePlayerIndex(playerIndex: number): number | null {
    if (!Number.isFinite(playerIndex)) {
      return null;
    }
    const normalizedPlayerIndex = Math.trunc(playerIndex);
    return normalizedPlayerIndex >= 0 ? normalizedPlayerIndex : null;
  }

  private relationshipValueToLabel(relationship: number): EntityRelationship {
    switch (relationship) {
      case RELATIONSHIP_ENEMIES:
        return 'enemies';
      case RELATIONSHIP_ALLIES:
        return 'allies';
      case RELATIONSHIP_NEUTRAL:
      default:
        return 'neutral';
    }
  }

  private relationshipKey(sourceSide: string, targetSide: string): string {
    return `${sourceSide}\u0000${targetSide}`;
  }

  private getTeamRelationshipBySides(sourceSide: string, targetSide: string): number {
    const source = this.normalizeSide(sourceSide);
    const target = this.normalizeSide(targetSide);
    if (!source || !target) {
      return RELATIONSHIP_NEUTRAL;
    }

    const teamOverride = this.teamRelationshipOverrides.get(this.relationshipKey(source, target));
    if (teamOverride !== undefined) {
      return teamOverride;
    }

    const playerOverride = this.playerRelationshipOverrides.get(this.relationshipKey(source, target));
    if (playerOverride !== undefined) {
      return playerOverride;
    }

    return source === target ? RELATIONSHIP_ALLIES : RELATIONSHIP_NEUTRAL;
  }

  private isValidRelationship(relationship: number): relationship is RelationshipValue {
    return (
      relationship === RELATIONSHIP_ENEMIES
      || relationship === RELATIONSHIP_NEUTRAL
      || relationship === RELATIONSHIP_ALLIES
    );
  }

  private getTeamRelationship(sourceEntity: MapEntity, targetEntity: MapEntity): number {
    if (!sourceEntity || !targetEntity) {
      return RELATIONSHIP_NEUTRAL;
    }
    return this.getTeamRelationshipBySides(sourceEntity.side ?? '', targetEntity.side ?? '');
  }

  setTeamRelationship(sourceSide: string, targetSide: string, relationship: number): void {
    const source = this.normalizeSide(sourceSide);
    const target = this.normalizeSide(targetSide);
    if (!source || !target) {
      return;
    }
    if (!this.isValidRelationship(relationship)) {
      return;
    }
    this.teamRelationshipOverrides.set(this.relationshipKey(source, target), relationship);
  }

  setPlayerRelationship(sourceSide: string, targetSide: string, relationship: number): void {
    const source = this.normalizeSide(sourceSide);
    const target = this.normalizeSide(targetSide);
    if (!source || !target) {
      return;
    }
    if (!this.isValidRelationship(relationship)) {
      return;
    }
    this.playerRelationshipOverrides.set(this.relationshipKey(source, target), relationship);
  }

  clearTeamRelationshipOverrides(): void {
    this.teamRelationshipOverrides.clear();
    this.playerRelationshipOverrides.clear();
  }

  private isLocalSciencePurchasable(scienceName: string): boolean {
    const availability = this.localPlayerScienceAvailability.get(scienceName) ?? 'enabled';
    return availability === 'enabled';
  }

  private canCrushOrSquish(
    mover: MapEntity,
    target: MapEntity,
    testType: number = TEST_CRUSH_OR_SQUISH,
  ): boolean {
    if (!mover || !target) {
      return false;
    }
    if (mover.isUnmanned) {
      return false;
    }

    if (this.getTeamRelationship(mover, target) === RELATIONSHIP_ALLIES) {
      return false;
    }

    if (mover.crusherLevel <= 0) {
      return false;
    }

    if (testType === TEST_SQUISH_ONLY || testType === TEST_CRUSH_OR_SQUISH) {
      if (target.canBeSquished) {
        return true;
      }
    }

    if (testType === TEST_CRUSH_ONLY || testType === TEST_CRUSH_OR_SQUISH) {
      return mover.crusherLevel > target.crushableLevel;
    }

    return false;
  }

  private resolveLocomotorProfiles(
    objectDef: ObjectDef | undefined,
    iniDataRegistry: IniDataRegistry,
  ): Map<string, LocomotorSetProfile> {
    const profiles = new Map<string, LocomotorSetProfile>();
    if (!objectDef) {
      return profiles;
    }

    const locomotorSets = this.extractLocomotorSetEntries(objectDef);
    for (const [setName, locomotorNames] of locomotorSets) {
      let surfaceMask = 0;
      let downhillOnly = false;
      let movementSpeed = 0;
      for (const locomotorName of locomotorNames) {
        const locomotor = iniDataRegistry.getLocomotor(locomotorName);
        if (!locomotor) {
          continue;
        }
        surfaceMask |= locomotor.surfaceMask;
        downhillOnly = downhillOnly || locomotor.downhillOnly;
        if ((locomotor.speed ?? 0) > movementSpeed) {
          movementSpeed = locomotor.speed ?? 0;
        }
      }
      profiles.set(setName, {
        surfaceMask,
        downhillOnly,
        movementSpeed,
      });
    }

    return profiles;
  }

  private extractLocomotorSetEntries(objectDef: ObjectDef): Map<string, string[]> {
    const sets = new Map<string, string[]>();

    const addEntry = (setName: string, locomotors: string[]): void => {
      const normalizedSet = setName.trim().toUpperCase();
      if (!normalizedSet) {
        return;
      }
      sets.set(normalizedSet, locomotors);
    };

    const parseTokens = (tokens: string[]): { setName: string; locomotors: string[] } | null => {
      if (tokens.length < 1) {
        return null;
      }
      const setName = tokens[0]!.trim();
      const locomotors = tokens
        .slice(1)
        .map((token) => token.trim())
        .filter((token) => token.length > 0 && token.toUpperCase() !== 'NONE');
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

  private extractLocomotorUpgradeTriggers(objectDef: ObjectDef | undefined): Set<string> {
    const upgrades = new Set<string>();
    if (!objectDef) {
      return upgrades;
    }

    const parseScalarTokens = (value: IniValue): string[] => {
      if (typeof value === 'string') {
        return value.split(/[\s,;|]+/).filter(Boolean);
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return [String(value)];
      }
      return [];
    };

    const parseUpgradeNames = (value: IniValue | undefined): string[] => {
      if (value === undefined) {
        return [];
      }
      if (Array.isArray(value)) {
        return value.flatMap((entry) => parseUpgradeNames(entry as IniValue));
      }
      return parseScalarTokens(value)
        .map((token) => token.trim().toUpperCase())
        .filter((token) => token.length > 0 && token !== 'NONE');
    };

    const visitBlock = (block: IniBlock): void => {
      const moduleToken = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
      if (moduleToken === 'LOCOMOTORSETUPGRADE' || block.type.toUpperCase() === 'LOCOMOTORSETUPGRADE') {
        for (const [fieldName, fieldValue] of Object.entries(block.fields)) {
          if (fieldName.toUpperCase() !== 'TRIGGEREDBY') {
            continue;
          }
          const names = parseUpgradeNames(fieldValue);
          for (const name of names) {
            upgrades.add(name);
          }
        }
      }
      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const block of objectDef.blocks) {
      visitBlock(block);
    }

    return upgrades;
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

    return this.clampToWorldBounds(hitPoint.x, hitPoint.z);
  }

  private clampToWorldBounds(worldX: number, worldZ: number): VectorXZ {
    if (!this.mapHeightmap) {
      return {
        x: worldX,
        z: worldZ,
      };
    }

    const maxWorldX = Math.max(0, this.mapHeightmap.worldWidth - 0.0001);
    const maxWorldZ = Math.max(0, this.mapHeightmap.worldDepth - 0.0001);
    return {
      x: clamp(worldX, 0, maxWorldX),
      z: clamp(worldZ, 0, maxWorldZ),
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
      case 'attackMoveTo':
        this.issueMoveTo(
          command.entityId,
          command.targetX,
          command.targetZ,
          command.attackDistance,
        );
        return;
      case 'guardPosition':
        this.issueGuardPosition(
          command.entityId,
          command.targetX,
          command.targetZ,
          command.guardMode,
        );
        return;
      case 'guardObject':
        this.issueGuardObject(
          command.entityId,
          command.targetEntityId,
          command.guardMode,
        );
        return;
      case 'setRallyPoint':
        this.setEntityRallyPoint(command.entityId, command.targetX, command.targetZ);
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
      case 'setLocomotorSet':
        this.setEntityLocomotorSet(command.entityId, command.setName);
        return;
      case 'setLocomotorUpgrade':
        this.setEntityLocomotorUpgrade(command.entityId, command.enabled);
        return;
      case 'applyUpgrade':
        this.applyUpgradeToEntity(command.entityId, command.upgradeName);
        return;
      case 'applyPlayerUpgrade':
        this.grantLocalPlayerUpgrade(command.upgradeName);
        return;
      case 'grantScience':
        this.grantLocalPlayerScience(command.scienceName);
        return;
      case 'purchaseScience':
        this.purchaseLocalPlayerScience(command.scienceName, command.scienceCost);
        return;
      case 'issueSpecialPower':
        this.issueSpecialPower(command);
        return;
      default:
        return;
    }
  }

  private issueMoveTo(
    entityId: number,
    targetX: number,
    targetZ: number,
    attackDistance = NO_ATTACK_DISTANCE,
  ): void {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity || !entity.canMove) return;

    this.updatePathfindPosCell(entity);
    const path = this.findPath(entity.mesh.position.x, entity.mesh.position.z, targetX, targetZ, entity, attackDistance);
    if (path.length === 0) {
      entity.moving = false;
      entity.moveTarget = null;
      entity.movePath = [];
      entity.pathIndex = 0;
      entity.pathfindGoalCell = null;
      return;
    }

    entity.moving = true;
    entity.movePath = path;
    entity.pathIndex = 0;
    entity.moveTarget = entity.movePath[0]!;
    this.updatePathfindGoalCellFromPath(entity);
  }

  private issueGuardPosition(
    entityId: number,
    targetX: number,
    targetZ: number,
    guardMode: GuardMode,
  ): void {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) {
      return;
    }

    entity.guardMode = guardMode;
    entity.guardTargetEntityId = null;
    entity.guardTargetPosition = this.clampToWorldBounds(targetX, targetZ);

    // Source behavior from GUICommandTranslator::doGuardCommand:
    // guard commands resolve to guard-position actions, which can move units to
    // the guard location when needed.
    this.issueMoveTo(entityId, entity.guardTargetPosition.x, entity.guardTargetPosition.z);

    // TODO: Source parity gap: full AIGuard state machine behavior (outer/inner
    // guard radii, retaliation, and no-pursuit constraints) is not ported yet.
  }

  private issueGuardObject(
    entityId: number,
    targetEntityId: number,
    guardMode: GuardMode,
  ): void {
    const entity = this.spawnedEntities.get(entityId);
    const target = this.spawnedEntities.get(targetEntityId);
    if (!entity || !target) {
      return;
    }

    entity.guardMode = guardMode;
    entity.guardTargetEntityId = targetEntityId;
    entity.guardTargetPosition = null;

    // Source behavior from GUICommandTranslator::doGuardCommand:
    // object-target guard orders are distinct from position guards.
    this.issueMoveTo(entityId, target.mesh.position.x, target.mesh.position.z);

    // TODO: Source parity gap: follow/retarget updates for moving guarded objects
    // are not ported yet.
  }

  private issueSpecialPower(command: IssueSpecialPowerCommand): void {
    const validIssuingEntityIds = command.issuingEntityIds.filter((entityId) =>
      this.spawnedEntities.has(entityId),
    );

    const sourceEntityId = command.sourceEntityId;
    if (sourceEntityId !== null && !this.spawnedEntities.has(sourceEntityId)) {
      return;
    }

    const targetEntityId = command.targetEntityId;
    if (targetEntityId !== null && !this.spawnedEntities.has(targetEntityId)) {
      return;
    }

    let targetX: number | null = null;
    let targetZ: number | null = null;
    if (command.targetX !== null && command.targetZ !== null) {
      const clampedTarget = this.clampToWorldBounds(command.targetX, command.targetZ);
      targetX = clampedTarget.x;
      targetZ = clampedTarget.z;
    }

    this.lastIssuedSpecialPowerCommand = {
      ...command,
      issuingEntityIds: validIssuingEntityIds,
      sourceEntityId,
      targetEntityId,
      targetX,
      targetZ,
    };

    // TODO: Source parity gap: wire special-power execution into ActionManager /
    // MessageStream equivalents (cooldown, readiness, and per-power behaviors).
  }

  private stopEntity(entityId: number): void {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) return;

    this.updatePathfindPosCell(entity);
    entity.moving = false;
    entity.guardMode = GuardMode.GUARDMODE_NORMAL;
    entity.guardTargetEntityId = null;
    entity.guardTargetPosition = null;
    entity.moveTarget = null;
    entity.movePath = [];
    entity.pathIndex = 0;
    entity.pathfindGoalCell = null;
  }

  private updatePathfindGoalCellFromPath(entity: MapEntity): void {
    const destination = entity.movePath[entity.movePath.length - 1];
    if (!destination) {
      entity.pathfindGoalCell = null;
      return;
    }
    const [goalCellX, goalCellZ] = this.worldToGrid(destination.x, destination.z);
    if (goalCellX === null || goalCellZ === null) {
      entity.pathfindGoalCell = null;
      return;
    }
    entity.pathfindGoalCell = { x: goalCellX, z: goalCellZ };
  }

  private updatePathfindPosCell(entity: MapEntity): void {
    const [cellX, cellZ] = this.worldToGrid(entity.mesh.position.x, entity.mesh.position.z);
    if (cellX === null || cellZ === null) {
      entity.pathfindPosCell = null;
      return;
    }
    entity.pathfindPosCell = { x: cellX, z: cellZ };
  }

  private findPath(
    startX: number,
    startZ: number,
    targetX: number,
    targetZ: number,
    mover?: MapEntity,
    attackDistance = NO_ATTACK_DISTANCE,
  ): VectorXZ[] {
    if (!this.navigationGrid) {
      return [{ x: targetX, z: targetZ }];
    }

    const grid = this.navigationGrid;
    const movementProfile = this.getMovementProfile(mover);
    if (movementProfile.acceptableSurfaces === NO_SURFACES) {
      return [];
    }
    const start = this.worldToGrid(startX, startZ);
    const goal = this.worldToGrid(targetX, targetZ);

    const startCellX = start[0];
    const startCellZ = start[1];
    const goalCellX = goal[0];
    const goalCellZ = goal[1];

    if (startCellX === null || startCellZ === null || goalCellX === null || goalCellZ === null) {
      return [];
    }

    const startCandidate = this.canOccupyCell(startCellX, startCellZ, movementProfile, this.navigationGrid, true)
      ? { x: startCellX, z: startCellZ }
      : this.findNearestPassableCell(startCellX, startCellZ, grid, movementProfile, true);
    if (!startCandidate) {
      return [];
    }

    const effectiveStart = startCandidate;

    const effectiveGoal = this.findNearestPassableCell(goalCellX, goalCellZ, grid, movementProfile, true);
    if (!effectiveGoal) {
      return [];
    }

    const startIndex = effectiveStart.z * grid.width + effectiveStart.x;
    const goalIndex = effectiveGoal.z * grid.width + effectiveGoal.x;
    const total = grid.width * grid.height;
    const isHuman = true;

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

    const estimateToGoal = (cellX: number, cellZ: number): number => {
      if (attackDistance === NO_ATTACK_DISTANCE) {
        return this.pathHeuristic(cellX, cellZ, effectiveGoal.x, effectiveGoal.z);
      }

      const heuristic = COST_ORTHOGONAL * Math.hypot(cellX - effectiveGoal.x, cellZ - effectiveGoal.z);
      return Math.max(0, heuristic - attackDistance / 2);
    };

    const isWithinAttackDistance = (cellX: number, cellZ: number): boolean => {
      if (attackDistance === NO_ATTACK_DISTANCE) {
        return false;
      }
      const deltaX = (cellX - effectiveGoal.x) * PATHFIND_CELL_SIZE;
      const deltaZ = (cellZ - effectiveGoal.z) * PATHFIND_CELL_SIZE;
      const effectiveRange = Math.max(0, attackDistance - ATTACK_RANGE_CELL_EDGE_FUDGE);
      return deltaX * deltaX + deltaZ * deltaZ <= effectiveRange * effectiveRange;
    };

    const needsAttackLineOfSight = this.config.attackUsesLineOfSight && !!mover?.attackNeedsLineOfSight;
    const shouldCheckAttackTerrain = needsAttackLineOfSight && !mover?.isImmobile;

    const isAttackLineBlockedByObstacle = (fromX: number, fromZ: number, toX: number, toZ: number): boolean => {
      if (!grid) {
        return false;
      }
      const skipObstacleChecks = mover?.category === 'air' ? 3 : 0;

      const fromCell = this.worldToGrid(fromX, fromZ);
      const toCell = this.worldToGrid(toX, toZ);
      if (fromCell[0] === null || fromCell[1] === null || toCell[0] === null || toCell[1] === null) {
        return true;
      }

      const startCellX = fromCell[0];
      const startCellZ = fromCell[1];
      const endCellX = toCell[0];
      const endCellZ = toCell[1];

      if (startCellX === endCellX && startCellZ === endCellZ) {
        return false;
      }

      const deltaX = Math.abs(endCellX - startCellX);
      const deltaZ = Math.abs(endCellZ - startCellZ);

      let xinc1 = 1;
      let xinc2 = 1;
      if (endCellX < startCellX) {
        xinc1 = -1;
        xinc2 = -1;
      }

      let zinc1 = 1;
      let zinc2 = 1;
      if (endCellZ < startCellZ) {
        zinc1 = -1;
        zinc2 = -1;
      }

      let den: number;
      let num: number;
      let numadd: number;
      const numpixels = deltaX >= deltaZ ? deltaX : deltaZ;
      if (deltaX >= deltaZ) {
        xinc1 = 0;
        zinc2 = 0;
        den = deltaX;
        num = Math.floor(deltaX / 2);
        numadd = deltaZ;
      } else {
        xinc2 = 0;
        zinc1 = 0;
        den = deltaZ;
        num = Math.floor(deltaZ / 2);
        numadd = deltaX;
      }

      const skipObstacleChecksRef = { current: skipObstacleChecks };
      const checkCell = (cellX: number, cellZ: number): boolean => {
        if (skipObstacleChecksRef.current > 0) {
          skipObstacleChecksRef.current -= 1;
          return false;
        }
        if (!this.isCellInBounds(cellX, cellZ, grid)) {
          return true;
        }
        const cellIndex = cellZ * grid.width + cellX;
        if (grid.terrainType[cellIndex] === NAV_OBSTACLE) {
          return true;
        }
        return false;
      };

      let x = startCellX;
      let z = startCellZ;

      for (let curpixel = 0; curpixel <= numpixels; curpixel++) {
        if (checkCell(x, z)) {
          return true;
        }

        num += numadd;
        if (num >= den) {
          num -= den;
          x += xinc1;
          z += zinc1;
          if (checkCell(x, z)) {
            return true;
          }
        }
        x += xinc2;
        z += zinc2;
      }

      return false;
    };

    const isAttackLineBlockedByTerrain = (fromX: number, fromZ: number, toX: number, toZ: number): boolean => {
      const heightmap = this.mapHeightmap;
      if (!heightmap || !shouldCheckAttackTerrain) {
        return false;
      }

      const [fromCellX, fromCellZ] = this.worldToGrid(fromX, fromZ);
      const [toCellX, toCellZ] = this.worldToGrid(toX, toZ);
      if (fromCellX === null || fromCellZ === null || toCellX === null || toCellZ === null) {
        return false;
      }

      const maxWorldX = Math.max(0, heightmap.worldWidth - 0.0001);
      const maxWorldZ = Math.max(0, heightmap.worldDepth - 0.0001);
      const fromHeight = heightmap.getInterpolatedHeight(clamp(fromX, 0, maxWorldX), clamp(fromZ, 0, maxWorldZ));
      const toHeight = heightmap.getInterpolatedHeight(clamp(toX, 0, maxWorldX), clamp(toZ, 0, maxWorldZ));
      const rayDeltaHeight = toHeight - fromHeight;

      const getCellTopHeight = (cellX: number, cellZ: number): number => {
        const x0 = clamp(cellX, 0, heightmap.width - 2);
        const z0 = clamp(cellZ, 0, heightmap.height - 2);
        const x1 = x0 + 1;
        const z1 = z0 + 1;
        return Math.max(
          heightmap.getRawHeight(x0, z0),
          heightmap.getRawHeight(x1, z0),
          heightmap.getRawHeight(x0, z1),
          heightmap.getRawHeight(x1, z1),
        ) * MAP_HEIGHT_SCALE;
      };

      const deltaX = Math.abs(toCellX - fromCellX);
      const deltaZ = Math.abs(toCellZ - fromCellZ);
      if (deltaX === 0 && deltaZ === 0) {
        return false;
      }

      let xinc1 = 1;
      let xinc2 = 1;
      if (toCellX < fromCellX) {
        xinc1 = -1;
        xinc2 = -1;
      }

      let zinc1 = 1;
      let zinc2 = 1;
      if (toCellZ < fromCellZ) {
        zinc1 = -1;
        zinc2 = -1;
      }

      let den: number;
      let num: number;
      let numadd: number;
      const numpixels = deltaX >= deltaZ ? deltaX : deltaZ;
      if (deltaX >= deltaZ) {
        xinc1 = 0;
        zinc2 = 0;
        den = deltaX;
        num = Math.floor(deltaX / 2);
        numadd = deltaZ;
      } else {
        xinc2 = 0;
        zinc1 = 0;
        den = deltaZ;
        num = Math.floor(deltaZ / 2);
        numadd = deltaX;
      }

      const isCellBlockedByTerrain = (cellX: number, cellZ: number, step: number): boolean => {
        const terrainHeight = getCellTopHeight(cellX, cellZ);
        const t = numpixels <= 0 ? 0 : step / numpixels;
        const rayHeight = fromHeight + rayDeltaHeight * t;
        return terrainHeight > rayHeight + ATTACK_LOS_TERRAIN_FUDGE;
      };

      let x = fromCellX;
      let z = fromCellZ;
      for (let curpixel = 0; curpixel <= numpixels; curpixel++) {
        if (isCellBlockedByTerrain(x, z, curpixel)) {
          return true;
        }

        num += numadd;
        if (num >= den) {
          num -= den;
          x += xinc1;
          z += zinc1;
          if (isCellBlockedByTerrain(x, z, curpixel)) {
            return true;
          }
        }
        x += xinc2;
        z += zinc2;
      }

      return false;
    };

    const isNearSelfForAttackMove = (cellX: number, cellZ: number): boolean => {
      const threshold = PATHFIND_CELL_SIZE * 0.5;
      const selfToCellX = this.gridToWorld(cellX, cellZ).x - startX;
      const selfToCellZ = this.gridToWorld(cellX, cellZ).z - startZ;
      return selfToCellX * selfToCellX + selfToCellZ * selfToCellZ < threshold * threshold;
    };

    const isAttackLineBlocked = (fromX: number, fromZ: number, toX: number, toZ: number): boolean => {
      if (!needsAttackLineOfSight) {
        return false;
      }
      if (isAttackLineBlockedByTerrain(fromX, fromZ, toX, toZ)) {
        return true;
      }
      if (isAttackLineBlockedByObstacle(fromX, fromZ, toX, toZ)) {
        return true;
      }
      return false;
    };

    if (attackDistance !== NO_ATTACK_DISTANCE) {
      const toTargetDeltaX = targetX - startX;
      const toTargetDeltaZ = targetZ - startZ;
      const targetDistance = Math.hypot(toTargetDeltaX, toTargetDeltaZ);
      if (targetDistance > 0) {
        const stepX = (toTargetDeltaX / targetDistance) * PATHFIND_CELL_SIZE;
        const stepZ = (toTargetDeltaZ / targetDistance) * PATHFIND_CELL_SIZE;
        for (let i = 1; i < 10; i++) {
          const testX = startX + stepX * i * 0.5;
          const testZ = startZ + stepZ * i * 0.5;
          const [testCellX, testCellZ] = this.worldToGrid(testX, testZ);
          if (testCellX === null || testCellZ === null) {
            break;
          }
          if (!this.canOccupyCell(testCellX, testCellZ, movementProfile, grid)) {
            break;
          }
          const dx = testX - targetX;
          const dz = testZ - targetZ;
          const testDistSqr = dx * dx + dz * dz;
          if (testDistSqr > attackDistance * attackDistance) {
            continue;
          }
          if (isNearSelfForAttackMove(testCellX, testCellZ)) {
            continue;
          }
          if (isAttackLineBlocked(startX, startZ, testX, testZ)) {
            continue;
          }
          return [{ x: startX, z: startZ }, { x: testX, z: testZ }];
        }
      }
    }

    const buildPathFromGoal = (resolvedGoalIndex: number): VectorXZ[] => {
      const pathCells = this.reconstructPath(parent, startIndex, resolvedGoalIndex);
      if (grid.pinched[resolvedGoalIndex] === 1) {
        const resolvedGoalParentIndex = parent[resolvedGoalIndex];
        if (
          resolvedGoalParentIndex !== undefined
          && resolvedGoalParentIndex >= 0
          && grid.pinched[resolvedGoalParentIndex] === 0
        ) {
          pathCells.pop();
        }
      }
    const smoothed = this.smoothCellPath(
      pathCells,
      movementProfile,
      mover,
      movementOccupancy,
      attackDistance === NO_ATTACK_DISTANCE,
    );
      const pathWorld = smoothed.map((cell) => this.gridToWorld(cell.x, cell.z));
      if (pathWorld.length === 0) {
        return [{ x: startX, z: startZ }];
      }

      const first = pathWorld[0];
      if (first && (Math.abs(first.x - startX) > 0.0001 || Math.abs(first.z - startZ) > 0.0001)) {
        pathWorld.unshift({ x: startX, z: startZ });
      }
      return pathWorld;
    };

    gCost[startIndex] = 0;
    fCost[startIndex] = estimateToGoal(effectiveStart.x, effectiveStart.z);
    open.push(startIndex);
    inOpen[startIndex] = 1;

    const deltaX = [1, 0, -1, 0, 1, -1, -1, 1];
    const deltaZ = [0, 1, 0, -1, 1, 1, -1, -1];
    const adjacent = [0, 1, 2, 3, 0];
    const neighborFlags = [false, false, false, false, false, false, false, false];
    const movementOccupancy = this.buildMovementOccupancyGrid(grid);
    let searched = 0;

    while (open.length > 0) {
      searched += 1;
      if (searched > MAX_SEARCH_NODES) {
        break;
      }

      let bestOpenIndex = 0;
      const startOpenIndex = open[0];
      if (startOpenIndex === undefined) {
        break;
      }
      let bestF = fCost[startOpenIndex] ?? MAX_PATH_COST;
      for (let i = 1; i < open.length; i++) {
        const candidateIndex = open[i];
        if (candidateIndex === undefined) continue;
        const candidateF = fCost[candidateIndex];
        if (candidateF === undefined) continue;
        if (candidateF < bestF) {
          bestF = candidateF;
          bestOpenIndex = i;
        }
      }

      const currentIndex = open[bestOpenIndex];
      if (currentIndex === undefined) {
        break;
      }
      open.splice(bestOpenIndex, 1);
      inOpen[currentIndex] = 0;
      inClosed[currentIndex] = 1;

      const [currentCellX, currentCellZ] = this.gridFromIndex(currentIndex);
      if (
        attackDistance !== NO_ATTACK_DISTANCE
        && currentIndex !== startIndex
        && isWithinAttackDistance(currentCellX, currentCellZ)
        && !isNearSelfForAttackMove(currentCellX, currentCellZ)
      ) {
        const currentWorld = this.gridToWorld(currentCellX, currentCellZ);
        if (!isAttackLineBlocked(startX, startZ, currentWorld.x, currentWorld.z)) {
          return buildPathFromGoal(currentIndex);
        }
      }

      if (currentIndex === goalIndex && attackDistance === NO_ATTACK_DISTANCE) {
        return buildPathFromGoal(goalIndex);
      }

      const parentCellIndex = parent[currentIndex];
      let parentCellX: number | undefined;
      let parentCellZ: number | undefined;
      if (parentCellIndex !== undefined && parentCellIndex >= 0) {
        [parentCellX, parentCellZ] = this.gridFromIndex(parentCellIndex);
      }

      for (let i = 0; i < deltaX.length; i++) {
        neighborFlags[i] = false;
        const dirX = deltaX[i];
        const dirZ = deltaZ[i];
        if (dirX === undefined || dirZ === undefined) {
          continue;
        }
        const neighborX = currentCellX + dirX;
        const neighborZ = currentCellZ + dirZ;
        if (!this.isCellInBounds(neighborX, neighborZ, grid)) {
          continue;
        }
        if (isHuman && !this.isInsideLogicalBounds(neighborX, neighborZ, grid)) {
          continue;
        }
        const neighborIndex = neighborZ * grid.width + neighborX;
        const alreadyOnList = inOpen[neighborIndex] === 1 || inClosed[neighborIndex] === 1;
        const notZonePassable = ((movementProfile.acceptableSurfaces & LOCOMOTORSURFACE_GROUND) !== 0)
          && !this.isZonePassable(neighborX, neighborZ, grid);

        if (!this.canTraverseBridgeTransition(currentCellX, currentCellZ, neighborX, neighborZ, movementProfile, grid)) {
          continue;
        }
        if (!this.canMoveToCell(currentCellX, currentCellZ, neighborX, neighborZ, movementProfile)) {
          continue;
        }
        if (i >= 4) {
          const side1Index = adjacent[i - 4];
          const side2Index = adjacent[i - 3];
          const side1Passable = side1Index === undefined ? false : neighborFlags[side1Index];
          const side2Passable = side2Index === undefined ? false : neighborFlags[side2Index];
          if (!side1Passable && !side2Passable) {
            continue;
          }
        }

        const clearDiameter = this.clearCellForDiameter(neighborX, neighborZ, movementProfile.pathDiameter, movementProfile, grid);
        if (clearDiameter === 0) {
          continue;
        }
        if (!this.canOccupyCell(neighborX, neighborZ, movementProfile, grid)) {
          continue;
        }

        neighborFlags[i] = true;

        let stepCost = this.pathCost(currentCellX, currentCellZ, neighborX, neighborZ, grid, movementProfile);
        const occupation = this.checkForMovement(
          neighborX,
          neighborZ,
          mover,
          grid,
          effectiveStart,
          i,
          false,
          movementOccupancy,
        );
        if (occupation.enemyFixed) {
          continue;
        }
        if (notZonePassable) {
          stepCost += 100 * COST_ORTHOGONAL;
        }
        if (grid.blocked[neighborIndex] === 1) {
          stepCost += 100 * COST_ORTHOGONAL;
        }
        if (occupation.allyMoving && Math.abs(neighborX - effectiveStart.x) < 10 && Math.abs(neighborZ - effectiveStart.z) < 10) {
          stepCost += 3 * COST_DIAGONAL;
        }
        if (occupation.allyFixedCount > 0) {
          stepCost += 3 * COST_DIAGONAL;
        }

        const costRemaining = estimateToGoal(neighborX, neighborZ);
        if (attackDistance !== NO_ATTACK_DISTANCE && occupation.allyGoal) {
          if (mover?.category === 'vehicle') {
            stepCost += 3 * COST_ORTHOGONAL;
          } else {
            stepCost += COST_ORTHOGONAL;
          }
        }

        if (neighborIndex !== goalIndex && movementProfile.pathDiameter > 0 && clearDiameter < movementProfile.pathDiameter) {
          const delta = movementProfile.pathDiameter - clearDiameter;
          stepCost += 0.6 * (delta * COST_ORTHOGONAL);
        }

        if (
          parentCellIndex !== undefined
          && parentCellIndex >= 0
          && parentCellX !== undefined
          && parentCellZ !== undefined
        ) {
          const grandParentIndex = parent[parentCellIndex];
          if (grandParentIndex !== undefined && grandParentIndex >= 0) {
            const [grandCellX, grandCellZ] = this.gridFromIndex(grandParentIndex);
            const prevDirX = parentCellX - currentCellX;
            const prevDirZ = parentCellZ - currentCellZ;
            const nextDirX = grandCellX - parentCellX;
            const nextDirZ = grandCellZ - parentCellZ;

            if (prevDirX !== nextDirX || prevDirZ !== nextDirZ) {
              const dot = prevDirX * nextDirX + prevDirZ * nextDirZ;
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

        const currentG = gCost[currentIndex];
        const neighborG = gCost[neighborIndex];
        if (currentG === undefined || neighborG === undefined) {
          continue;
        }
        const tentativeG = currentG + stepCost;
        if (tentativeG >= neighborG) {
          continue;
        }

        parent[neighborIndex] = currentIndex;
        gCost[neighborIndex] = tentativeG;
        fCost[neighborIndex] = tentativeG + costRemaining;
        if (alreadyOnList) {
          if (inClosed[neighborIndex] === 1) {
            inClosed[neighborIndex] = 0;
            open.push(neighborIndex);
            inOpen[neighborIndex] = 1;
          }
        } else {
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
    const rawDiameter = (entity as { pathDiameter?: number } | undefined)?.pathDiameter;
    const mask = typeof rawMask === 'number' ? rawMask : SOURCE_DEFAULT_PASSABLE_SURFACES;
    const downhillOnly = rawDownhillOnly === true;
    const pathDiameter = typeof rawDiameter === 'number' && rawDiameter >= 0 && Number.isFinite(rawDiameter)
      ? Math.max(0, Math.trunc(rawDiameter))
      : 0;

    return {
      acceptableSurfaces: mask,
      downhillOnly,
      canPassObstacle: (mask & LOCOMOTORSURFACE_AIR) !== 0,
      canUseBridge: true,
      avoidPinched: false,
      pathDiameter,
    };
  }

  private getPathfindRadiusAndCenter(entity?: MapEntity): { pathRadius: number; centerInCell: boolean } {
    const pathRadius = Math.max(0, Math.trunc((entity as { pathDiameter?: number } | undefined)?.pathDiameter ?? 0));
    const centerInCell = entity?.pathfindCenterInCell ?? ((pathRadius & 1) === 1);
    return { pathRadius, centerInCell };
  }

  private canMoveToCell(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    movementProfile: PathfindingProfile,
  ): boolean {
    if (movementProfile.downhillOnly && this.mapHeightmap) {
      const fromHeight = this.mapHeightmap.getWorldHeight(fromX * MAP_XY_FACTOR, fromZ * MAP_XY_FACTOR);
      const toHeight = this.mapHeightmap.getWorldHeight(toX * MAP_XY_FACTOR, toZ * MAP_XY_FACTOR);
      return toHeight <= fromHeight;
    }

    return true;
  }

  private isInsideLogicalBounds(cellX: number, cellZ: number, grid: NavigationGrid): boolean {
    const hasLogicalBounds = (
      Number.isFinite(grid.logicalMinX)
      && Number.isFinite(grid.logicalMaxX)
      && Number.isFinite(grid.logicalMinZ)
      && Number.isFinite(grid.logicalMaxZ)
    );
    if (!hasLogicalBounds || grid.logicalMinX > grid.logicalMaxX || grid.logicalMinZ > grid.logicalMaxZ) {
      return true;
    }

    return (
      cellX >= grid.logicalMinX
      && cellX <= grid.logicalMaxX
      && cellZ >= grid.logicalMinZ
      && cellZ <= grid.logicalMaxZ
    );
  }

  private checkForMovement(
    cellX: number,
    cellZ: number,
    mover: MapEntity | undefined,
    grid: NavigationGrid | null,
    effectiveStart: { x: number; z: number },
    directionIndex: number,
    considerTransient = false,
    movementOccupancy?: MovementOccupancyGrid,
  ): PathingOccupationResult {
    void effectiveStart;
    void directionIndex;
    const result: PathingOccupationResult = {
      enemyFixed: false,
      allyMoving: false,
      allyFixedCount: 0,
      allyGoal: false,
    };

    if (!mover || !grid) {
      return result;
    }
    const occupancy = movementOccupancy ?? this.buildMovementOccupancyGrid(grid);

    const { pathRadius: movementRadius, centerInCell } = this.getPathfindRadiusAndCenter(mover);
    const numCellsAbove = movementRadius === 0
      ? 1
      : movementRadius + (centerInCell ? 1 : 0);
    const maxAlly = 5;
    const maxCellX = cellX + numCellsAbove;
    const maxCellZ = cellZ + numCellsAbove;
    const ignoredObstacleId = mover.ignoredMovementObstacleId;

    const allies: number[] = [];
    for (let i = cellX - movementRadius; i < maxCellX; i++) {
      for (let j = cellZ - movementRadius; j < maxCellZ; j++) {
        if (!this.isCellInBounds(i, j, grid)) {
          result.enemyFixed = true;
          return result;
        }

        const cellIndex = j * occupancy.width + i;
        if (cellIndex < 0 || cellIndex >= occupancy.flags.length) {
          result.enemyFixed = true;
          return result;
        }

        const flags = occupancy.flags[cellIndex] ?? UNIT_NO_UNITS;
        const posUnit = occupancy.unitIds[cellIndex] ?? -1;
        if (flags === UNIT_GOAL || flags === UNIT_GOAL_OTHER_MOVING) {
          result.allyGoal = true;
        }
        if (flags === UNIT_NO_UNITS) {
          continue;
        }
        if (posUnit === mover.id) {
          continue;
        }
        if (ignoredObstacleId !== null && posUnit === ignoredObstacleId) {
          continue;
        }

        const unit = this.spawnedEntities.get(posUnit);
        if (!unit) {
          continue;
        }

        let check = false;
        if (flags === UNIT_PRESENT_MOVING || flags === UNIT_GOAL_OTHER_MOVING) {
          const isAlly = this.getTeamRelationship(mover, unit) === RELATIONSHIP_ALLIES;
          if (isAlly) {
            result.allyMoving = true;
          }
          if (considerTransient) {
            check = true;
          }
        }

        if (flags === UNIT_PRESENT_FIXED) {
          check = true;
        }

        if (check && mover.ignoredMovementObstacleId !== null && mover.ignoredMovementObstacleId === unit.id) {
          check = false;
        }

        if (!check) {
          continue;
        }

        if (mover.category === 'infantry' && unit.category === 'infantry') {
          continue;
        }

        if (this.getTeamRelationship(mover, unit) === RELATIONSHIP_ALLIES) {
          if (!unit.canMove || (considerTransient && unit.moving)) {
            result.enemyFixed = true;
            return result;
          }
          if (!allies.includes(unit.id)) {
            result.allyFixedCount += 1;
            if (allies.length < maxAlly) {
              allies.push(unit.id);
            }
          }
          continue;
        }

        if (!this.canCrushOrSquish(mover, unit)) {
          result.enemyFixed = true;
        }
      }
    }

    return result;
  }

  private buildMovementOccupancyGrid(grid: NavigationGrid): MovementOccupancyGrid {
    const total = grid.width * grid.height;
    const flags = new Uint8Array(total);
    const unitIds = new Int32Array(total);
    const goalUnitIds = new Int32Array(total);
    unitIds.fill(-1);
    goalUnitIds.fill(-1);

    for (const entity of this.spawnedEntities.values()) {
      if (!entity.blocksPath && entity.pathDiameter <= 0 && entity.obstacleFootprint <= 0) {
        continue;
      }

      const entityPosCell = entity.pathfindPosCell;
      if (!entityPosCell) {
        continue;
      }

      const { pathRadius: entityRadius, centerInCell } = this.getPathfindRadiusAndCenter(entity);
      const numCellsAbove = entityRadius === 0 ? 1 : entityRadius + (centerInCell ? 1 : 0);

      const flag = entity.moving ? UNIT_PRESENT_MOVING : UNIT_PRESENT_FIXED;
      for (let i = entityPosCell.x - entityRadius; i < entityPosCell.x + numCellsAbove; i++) {
        for (let j = entityPosCell.z - entityRadius; j < entityPosCell.z + numCellsAbove; j++) {
          if (!this.isCellInBounds(i, j, grid)) {
            continue;
          }
          const index = j * grid.width + i;
          const posUnit = unitIds[index] ?? -1;
          if (posUnit === entity.id) {
            continue;
          }

          const goalUnit = goalUnitIds[index] ?? -1;
          if (goalUnit === entity.id) {
            flags[index] = UNIT_PRESENT_FIXED;
          } else if (goalUnit === -1) {
            flags[index] = flag;
          } else {
            flags[index] = UNIT_GOAL_OTHER_MOVING;
          }

          unitIds[index] = entity.id;
        }
      }
    }

    for (const entity of this.spawnedEntities.values()) {
      const goal = this.getEntityGoalCell(entity);
      if (!goal) {
        continue;
      }
      const { pathRadius: movementRadius, centerInCell } = this.getPathfindRadiusAndCenter(entity);
      const numCellsAbove = movementRadius === 0
        ? 1
        : movementRadius + (centerInCell ? 1 : 0);
      const maxCellX = goal.x + numCellsAbove;
      const maxCellZ = goal.z + numCellsAbove;

      for (let i = goal.x - movementRadius; i < maxCellX; i++) {
        for (let j = goal.z - movementRadius; j < maxCellZ; j++) {
          if (!this.isCellInBounds(i, j, grid)) {
            continue;
          }
          const index = j * grid.width + i;
          goalUnitIds[index] = entity.id;

          const posUnit = unitIds[index] ?? -1;
          if (posUnit === entity.id) {
            if (entity.pathfindGoalCell) {
              flags[index] = UNIT_GOAL_OTHER_MOVING;
            } else {
              flags[index] = UNIT_PRESENT_FIXED;
            }
            goalUnitIds[index] = entity.id;
            continue;
          }

          flags[index] = posUnit === -1 ? UNIT_GOAL : UNIT_GOAL_OTHER_MOVING;
          goalUnitIds[index] = entity.id;
        }
      }
    }

    return {
      width: grid.width,
      height: grid.height,
      flags,
      unitIds,
      goalUnitIds,
    };
  }

  private getEntityGoalCell(entity: MapEntity): { x: number; z: number } | null {
    return entity.pathfindGoalCell;
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
    if (index < 0 || index >= grid.terrainType.length) {
      return MAX_PATH_COST;
    }
    const type = grid.terrainType[index];
    if (type === undefined) {
      return MAX_PATH_COST;
    }
    const isDiagonal = Math.abs(toX - fromX) === 1 && Math.abs(toZ - fromZ) === 1;
    let cost = isDiagonal ? COST_DIAGONAL : COST_ORTHOGONAL;

    const toSurfaces = this.validLocomotorSurfacesForCellType(type, grid, index);
    if ((profile.acceptableSurfaces & toSurfaces) === 0) {
      return MAX_PATH_COST;
    }
    if (!this.canMoveToCell(fromX, fromZ, toX, toZ, profile)) {
      return MAX_PATH_COST;
    }

    const blocked = grid.blocked[index];
    if (blocked === undefined || (blocked === 1 && !profile.canPassObstacle)) {
      return MAX_PATH_COST;
    }

    const pinched = grid.pinched[index] ?? 0;
    if (type === NAV_CLIFF && pinched === 0) {
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
    if (pinched === 1) {
      cost += COST_DIAGONAL;
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
      if (next === undefined || next < 0) {
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
    mover?: MapEntity,
    movementOccupancy?: MovementOccupancyGrid,
    preserveAllyGoalCells = false,
  ): { x: number; z: number }[] {
    if (cells.length <= 2) {
      return cells;
    }

    const smoothed: { x: number; z: number }[] = [];
    let anchor = 0;
    let candidate = 2;
    smoothed.push(cells[0]!);
    const optimizeProfile: PathfindingProfile = {
      ...profile,
      // Match source Path::optimize() behavior for LOS: allow pinched cells while
      // line-of-sight evaluating and defer pinched handling to movement checks.
      avoidPinched: false,
    };

    while (anchor < cells.length - 1) {
      if (candidate >= cells.length) {
        const last = smoothed[smoothed.length - 1];
        const goal = cells[cells.length - 1];
        if (!last || !goal || last.x !== goal.x || last.z !== goal.z) {
          if (goal) {
            smoothed.push(goal);
          }
        }
        break;
      }

      if (this.gridLineClear(
        cells[anchor]!,
        cells[candidate]!,
        this.navigationGrid,
        optimizeProfile,
        mover,
        movementOccupancy,
      )) {
        if (
          preserveAllyGoalCells
          && this.pathSegmentContainsAllyGoal(cells, anchor, candidate, movementOccupancy, this.navigationGrid)
        ) {
          if (candidate - anchor > 1) {
            smoothed.push(cells[candidate - 1]!);
            anchor = candidate - 1;
            candidate = anchor + 2;
          } else {
            candidate += 1;
          }
          continue;
        }
        candidate += 1;
      } else if (this.canBypassClearanceFailureAsMonotonicSegment(cells, anchor, candidate)) {
        candidate += 1;
      } else {
        smoothed.push(cells[candidate - 1]!);
        anchor = candidate - 1;
        candidate = anchor + 2;
      }
    }

    return smoothed;
  }

  private pathSegmentContainsAllyGoal(
    cells: { x: number; z: number }[],
    startIndex: number,
    endIndex: number,
    movementOccupancy?: MovementOccupancyGrid,
    grid?: NavigationGrid | null,
  ): boolean {
    if (!movementOccupancy || endIndex - startIndex <= 1) {
      return false;
    }

    for (let i = startIndex + 1; i < endIndex; i++) {
      const cell = cells[i];
      if (!cell) {
        continue;
      }
      if (!this.isCellInBounds(cell.x, cell.z, grid ?? this.navigationGrid)) {
        return true;
      }
      const index = cell.z * movementOccupancy.width + cell.x;
      if (index < 0 || index >= movementOccupancy.flags.length) {
        return true;
      }
      const flags = movementOccupancy.flags[index];
      if (flags === UNIT_GOAL || flags === UNIT_GOAL_OTHER_MOVING) {
        return true;
      }
    }

    return false;
  }

  private canBypassClearanceFailureAsMonotonicSegment(
    cells: { x: number; z: number }[],
    anchorIndex: number,
    candidateIndex: number,
  ): boolean {
    if (anchorIndex < 0 || candidateIndex <= anchorIndex || candidateIndex >= cells.length) {
      return false;
    }

    const anchor = cells[anchorIndex];
    const candidate = cells[candidateIndex];
    if (!anchor || !candidate) {
      return false;
    }

    const deltaX = candidate.x - anchor.x;
    const deltaZ = candidate.z - anchor.z;
    if (deltaX === 0) {
      for (let i = anchorIndex + 1; i <= candidateIndex; i++) {
        const prev = cells[i - 1];
        const cur = cells[i];
        if (!prev || !cur || cur.x - prev.x !== 0) {
          return false;
        }
      }
      return true;
    }

    if (deltaZ === 0) {
      for (let i = anchorIndex + 1; i <= candidateIndex; i++) {
        const prev = cells[i - 1];
        const cur = cells[i];
        if (!prev || !cur || cur.z - prev.z !== 0) {
          return false;
        }
      }
      return true;
    }

    if (deltaX === deltaZ) {
      for (let i = anchorIndex + 1; i <= candidateIndex; i++) {
        const prev = cells[i - 1];
        const cur = cells[i];
        if (!prev || !cur || cur.z - prev.z !== cur.x - prev.x) {
          return false;
        }
      }
      return true;
    }

    if (deltaX === -deltaZ) {
      for (let i = anchorIndex + 1; i <= candidateIndex; i++) {
        const prev = cells[i - 1];
        const cur = cells[i];
        if (!prev || !cur || cur.z - prev.z !== - (cur.x - prev.x)) {
          return false;
        }
      }
      return true;
    }

    return false;
  }

  private gridLineClear(
    start: { x: number; z: number },
    end: { x: number; z: number },
    grid: NavigationGrid | null,
    profile: PathfindingProfile,
    mover?: MapEntity,
    movementOccupancy?: MovementOccupancyGrid,
  ): boolean {
    if (!grid) return false;
    const effectiveStart = start;
    if (start.x === end.x && start.z === end.z) {
      if (mover) {
        const occupation = this.checkForMovement(
          start.x,
          start.z,
          mover,
          grid,
          effectiveStart,
          0,
          false,
          movementOccupancy,
        );
        if (occupation.enemyFixed || occupation.allyFixedCount > 0) {
          return false;
        }
      }
      if (profile.avoidPinched && grid.pinched[start.z * grid.width + start.x] === 1) {
        return false;
      }
      if (!this.canLineOfSightOccupyCell(start.x, start.z, profile, grid)) {
        return false;
      }
      return true;
    }

    const deltaX = Math.abs(end.x - start.x);
    const deltaZ = Math.abs(end.z - start.z);

    let xinc1: number;
    let xinc2: number;
    if (end.x >= start.x) {
      xinc1 = 1;
      xinc2 = 1;
    } else {
      xinc1 = -1;
      xinc2 = -1;
    }

    let zinc1: number;
    let zinc2: number;
    if (end.z >= start.z) {
      zinc1 = 1;
      zinc2 = 1;
    } else {
      zinc1 = -1;
      zinc2 = -1;
    }

    let den: number;
    let num: number;
    let numadd: number;
    const numpixels = deltaX >= deltaZ ? deltaX : deltaZ;
    if (deltaX >= deltaZ) {
      xinc1 = 0;
      zinc2 = 0;
      den = deltaX;
      num = Math.floor(deltaX / 2);
      numadd = deltaZ;
    } else {
      xinc2 = 0;
      zinc1 = 0;
      den = deltaZ;
      num = Math.floor(deltaZ / 2);
      numadd = deltaX;
    }

    const checkCell = (
      cellX: number,
      cellZ: number,
    ): boolean => {
      if (mover) {
        const occupation = this.checkForMovement(
          cellX,
          cellZ,
          mover,
          grid,
          effectiveStart,
          0,
          false,
          movementOccupancy,
        );
        if (occupation.enemyFixed || occupation.allyFixedCount > 0) {
          return false;
        }
      }
      if (profile.avoidPinched && grid.pinched[cellZ * grid.width + cellX] === 1) {
        return false;
      }
      if (!this.canLineOfSightOccupyCell(cellX, cellZ, profile, grid)) {
        return false;
      }
      return true;
    };

    let x = start.x;
    let z = start.z;

    for (let curpixel = 0; curpixel <= numpixels; curpixel++) {
      if (!checkCell(x, z)) {
        return false;
      }

      num += numadd;
      if (num >= den) {
        num -= den;
        x += xinc1;
        z += zinc1;
        if (!checkCell(x, z)) {
          return false;
        }
      }
      x += xinc2;
      z += zinc2;
    }

    return true;
  }

  private canOccupyCell(
    cellX: number,
    cellZ: number,
    profile: PathfindingProfile,
    nav: NavigationGrid | null = this.navigationGrid,
    exact = false,
  ): boolean {
    if (!nav || !this.isCellInBounds(cellX, cellZ, nav)) {
      return false;
    }
    const exactDiameter = profile.pathDiameter ?? 0;
    const clearDiameter = this.clearCellForDiameter(cellX, cellZ, exactDiameter, profile, nav);
    if (clearDiameter < 1) {
      return false;
    }

    if (exactDiameter > 0 && exact && clearDiameter !== exactDiameter) {
      return false;
    }
    return true;
  }

  private canLineOfSightOccupyCell(
    cellX: number,
    cellZ: number,
    profile: PathfindingProfile,
    nav: NavigationGrid | null = this.navigationGrid,
  ): boolean {
    // Mirrors source Pathfinder::validMovementPosition flow used by line-of-sight checks:
    // occupancy and bridge checks already happened in gridLineClear; this checks
    // terrain/surface compatibility only.
    if (!nav || !this.isCellInBounds(cellX, cellZ, nav)) {
      return false;
    }
    return this.canOccupyCellCenter(cellX, cellZ, profile, nav);
  }

  private clearCellForDiameter(
    cellX: number,
    cellZ: number,
    pathDiameter: number,
    profile: PathfindingProfile,
    nav: NavigationGrid,
  ): number {
    const normalizedPathDiameter = Number.isFinite(pathDiameter) ? Math.max(0, Math.trunc(pathDiameter)) : 0;
    const clearDiameter = this.clearCellForExactDiameter(cellX, cellZ, normalizedPathDiameter, profile, nav);
    if (clearDiameter === 0) {
      if (normalizedPathDiameter < 2) {
        return 0;
      }
      return this.clearCellForDiameter(cellX, cellZ, normalizedPathDiameter - 2, profile, nav);
    }
    return clearDiameter;
  }

  private clearCellForExactDiameter(
    cellX: number,
    cellZ: number,
    pathDiameter: number,
    profile: PathfindingProfile,
    nav: NavigationGrid,
  ): number {
    if (!this.canOccupyCellCenter(cellX, cellZ, profile, nav)) {
      return 0;
    }

    const radius = Math.max(0, Math.trunc(pathDiameter / 2));
    const numCellsAbove = radius + 1;
    const cutCorners = radius > 1;

    for (let i = cellX - radius; i < cellX + numCellsAbove; i++) {
      const isMinOrMaxX = i === cellX - radius;
      const isMaxX = i === cellX + numCellsAbove - 1;
      const xMinOrMax = isMinOrMaxX || isMaxX;
      for (let j = cellZ - radius; j < cellZ + numCellsAbove; j++) {
        const isMinOrMaxZ = j === cellZ - radius;
        const isMaxZ = j === cellZ + numCellsAbove - 1;
        const zMinOrMax = isMinOrMaxZ || isMaxZ;
        if (xMinOrMax && zMinOrMax && cutCorners) {
          continue;
        }
        if (!this.isCellInBounds(i, j, nav)) {
          return 0;
        }
        if (!this.canOccupyCellCenter(i, j, profile, nav)) {
          return 0;
        }
      }
    }

    if (Math.floor(radius) === 0) {
      return 1;
    }
    return radius * 2;
  }

  private canOccupyCellCenter(
    cellX: number,
    cellZ: number,
    profile: PathfindingProfile,
    nav: NavigationGrid,
  ): boolean {
    const index = cellZ * nav.width + cellX;
    const terrain = nav.terrainType[index];
    if (terrain === undefined) {
      return false;
    }
    if (nav.bridgePassable[index] === 1) {
      const bridgeSurfaces = LOCOMOTORSURFACE_GROUND | LOCOMOTORSURFACE_AIR;
      if (!profile.canUseBridge || (profile.acceptableSurfaces & bridgeSurfaces) === 0) {
        return false;
      }
      return true;
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

  private isZoneBlockIndex(cellX: number, cellZ: number, grid: NavigationGrid): number {
    const blockX = Math.floor(cellX / PATHFIND_ZONE_BLOCK_SIZE);
    const blockY = Math.floor(cellZ / PATHFIND_ZONE_BLOCK_SIZE);
    if (blockX < 0 || blockX >= grid.zoneBlockWidth) {
      return -1;
    }
    if (blockY < 0 || blockY >= grid.zoneBlockHeight) {
      return -1;
    }
    return blockY * grid.zoneBlockWidth + blockX;
  }

  private isZonePassable(cellX: number, cellZ: number, grid: NavigationGrid): boolean {
    const blockIndex = this.isZoneBlockIndex(cellX, cellZ, grid);
    if (blockIndex < 0) {
      return false;
    }
    if (!grid.zonePassable || blockIndex >= grid.zonePassable.length) {
      return true;
    }
    return grid.zonePassable[blockIndex] === 1;
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
      case NAV_IMPASSABLE:
      case NAV_BRIDGE_IMPASSABLE:
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
    exact = false,
    maxOffset = 400,
  ): { x: number; z: number } | null {
    if (this.canOccupyCell(cellX, cellZ, profile, grid, exact)) {
      return { x: cellX, z: cellZ };
    }

    let delta = 1;
    let i = cellX;
    let j = cellZ;
    let remaining = maxOffset;
    let count: number;

    while (remaining > 0) {
      for (count = delta; count > 0 && remaining > 0; count--) {
        i += 1;
        if (this.isCellInBounds(i, j, grid) && this.canOccupyCell(i, j, profile, grid, exact)) {
          return { x: i, z: j };
        }
        remaining--;
      }

      for (count = delta; count > 0 && remaining > 0; count--) {
        j += 1;
        if (this.isCellInBounds(i, j, grid) && this.canOccupyCell(i, j, profile, grid, exact)) {
          return { x: i, z: j };
        }
        remaining--;
      }

      delta += 1;

      for (count = delta; count > 0 && remaining > 0; count--) {
        i -= 1;
        if (this.isCellInBounds(i, j, grid) && this.canOccupyCell(i, j, profile, grid, exact)) {
          return { x: i, z: j };
        }
        remaining--;
      }

      for (count = delta; count > 0 && remaining > 0; count--) {
        j -= 1;
        if (this.isCellInBounds(i, j, grid) && this.canOccupyCell(i, j, profile, grid, exact)) {
          return { x: i, z: j };
        }
        remaining--;
      }

      delta += 1;
    }

    return null;
  }

  private buildNavigationGrid(mapData: MapDataJSON | null, heightmap: HeightmapGrid | null): NavigationGrid | null {
    if (!mapData || !heightmap) return null;

    const cellWidth = Math.max(1, heightmap.width - 1);
    const cellHeight = Math.max(1, heightmap.height - 1);
    const borderSize = Math.max(0, Math.floor(heightmap.borderSize));
    const logicalMinX = Math.min(borderSize, Math.max(0, cellWidth - 1));
    const logicalMinZ = Math.min(borderSize, Math.max(0, cellHeight - 1));
    let logicalMaxX = cellWidth - 1 - 2 * borderSize;
    let logicalMaxZ = cellHeight - 1 - 2 * borderSize;
    logicalMaxX = Math.max(logicalMinX, logicalMaxX);
    logicalMaxZ = Math.max(logicalMinZ, logicalMaxZ);

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
      zonePassable: new Uint8Array(
        Math.max(1, Math.ceil(cellWidth / PATHFIND_ZONE_BLOCK_SIZE))
        * Math.max(1, Math.ceil(cellHeight / PATHFIND_ZONE_BLOCK_SIZE)),
      ),
      zoneBlockWidth: Math.max(1, Math.ceil(cellWidth / PATHFIND_ZONE_BLOCK_SIZE)),
      zoneBlockHeight: Math.max(1, Math.ceil(cellHeight / PATHFIND_ZONE_BLOCK_SIZE)),
      logicalMinX,
      logicalMinZ,
      logicalMaxX,
      logicalMaxZ,
    };

    for (let i = 0; i < grid.zonePassable.length; i++) {
      grid.zonePassable[i] = 0;
    }

    this.applyBridgeOverlay(mapData, grid);

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
        const terrain = terrainType[index] === NAV_IMPASSABLE || terrainType[index] === NAV_BRIDGE_IMPASSABLE
          ? false
          : blocked[index] !== 1;
        if (!terrain) {
          continue;
        }

        const blockX = Math.floor(x / PATHFIND_ZONE_BLOCK_SIZE);
        const blockY = Math.floor(z / PATHFIND_ZONE_BLOCK_SIZE);
        if (blockX < 0 || blockX >= grid.zoneBlockWidth || blockY < 0 || blockY >= grid.zoneBlockHeight) {
          continue;
        }
        grid.zonePassable[blockY * grid.zoneBlockWidth + blockX] = 1;
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
        const currentSegmentId = grid.bridgeSegmentByCell[index];
        if (currentSegmentId === undefined || currentSegmentId < 0) {
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

  private resolvePathRadiusAndCenter(
    category: ObjectCategory,
    objectDef?: ObjectDef,
    obstacleGeometry?: ObstacleGeometry | null,
  ): { pathDiameter: number; pathfindCenterInCell: boolean } {
    if (!objectDef) {
      return { pathDiameter: 0, pathfindCenterInCell: true };
    }

    const geometryRadius = this.pathDiameterFromGeometryFields(objectDef);
    let maxRadius = geometryRadius;
    if (maxRadius === null && category === 'building') {
      const explicitFootprint = this.footprintInCells(category, objectDef, null);
      maxRadius = explicitFootprint * (MAP_XY_FACTOR * 0.5);
    }
    if (maxRadius === null) {
      if (obstacleGeometry) {
        maxRadius = Math.max(obstacleGeometry.majorRadius, obstacleGeometry.minorRadius);
      }
    }
    if (maxRadius === null || maxRadius <= 0) {
      return { pathDiameter: 0, pathfindCenterInCell: true };
    }

    let pathDiameter = 2 * maxRadius;
    if (pathDiameter > MAP_XY_FACTOR && pathDiameter < 2 * MAP_XY_FACTOR) {
      pathDiameter = 2 * MAP_XY_FACTOR;
    }

    let iRadius = Math.floor(pathDiameter / MAP_XY_FACTOR + 0.3);
    if (iRadius === 0) {
      iRadius = 1;
    }
    const center = (iRadius & 1) === 1;
    iRadius = Math.floor(iRadius / 2);
    const cappedCenter = iRadius > 2 ? true : center;
    iRadius = Math.min(iRadius, 2);
    if (iRadius <= 0) {
      return { pathDiameter: 0, pathfindCenterInCell: cappedCenter };
    }

    return { pathDiameter: iRadius, pathfindCenterInCell: cappedCenter };
  }

  private pathDiameterFromGeometryFields(objectDef: ObjectDef): number | null {
    const majorRadius = readNumericField(objectDef.fields, ['GeometryMajorRadius', 'MajorRadius']);
    const minorRadius = readNumericField(objectDef.fields, ['GeometryMinorRadius', 'MinorRadius', 'GeometryMajorRadius', 'MajorRadius']);
    if (majorRadius === null || minorRadius === null) {
      return null;
    }
    const resolvedMajor = Math.abs(majorRadius);
    const resolvedMinor = Math.abs(minorRadius);
    const maxRadius = Math.max(resolvedMajor, resolvedMinor);
    return Number.isFinite(maxRadius) ? maxRadius : null;
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
    const mapCellWidth = Math.max(1, this.mapHeightmap.width - 1);
    const mapCellHeight = Math.max(1, this.mapHeightmap.height - 1);
    return (
      cellX >= 0 &&
      cellX < mapCellWidth &&
      cellZ >= 0 &&
      cellZ < mapCellHeight
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
      if (entity.canMove) {
        this.updatePathfindPosCell(entity);
      }
    }

    for (const entity of this.spawnedEntities.values()) {
      if (!entity.canMove || !entity.moving || entity.moveTarget === null) {
        continue;
      }

      if (entity.pathIndex >= entity.movePath.length) {
        entity.moving = false;
        entity.moveTarget = null;
        entity.movePath = [];
        entity.pathfindGoalCell = null;
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
          entity.pathfindGoalCell = null;
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
          entity.pathfindGoalCell = null;
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
      this.updatePathfindPosCell(entity);
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
    this.shortcutSpecialPowerSourceByName.clear();
    this.shortcutSpecialPowerNamesByEntityId.clear();
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
      const [value] = values;
      if (value !== undefined) {
        return value;
      }
    }
  }

  return null;
}

function toByte(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  const normalized = Math.trunc(value);
  return Math.max(0, Math.min(255, normalized));
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
