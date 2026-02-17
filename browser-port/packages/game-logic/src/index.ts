/**
 * Game Logic & Entity Bootstrap — phase-1 gameplay scaffolding.
 *
 * Consumes converted map objects, resolves INI metadata, creates simple entity
 * representations, and supports a minimal click-to-select + click-to-move loop.
 */

import * as THREE from 'three';
import type {
  DeterministicFrameSnapshot,
  DeterministicGameLogicCrcSectionWriters,
  Subsystem,
  XferCrcAccumulator,
} from '@generals/engine';
import { GameRandom, type IniBlock, type IniValue } from '@generals/core';
import {
  IniDataRegistry,
  type ArmorDef,
  type CommandButtonDef,
  type CommandSetDef,
  type SpecialPowerDef,
  type ObjectDef,
  type ScienceDef,
  type UpgradeDef,
  type WeaponDef,
} from '@generals/ini-data';
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

export interface AttackEntityCommand {
  type: 'attackEntity';
  entityId: number;
  targetEntityId: number;
  commandSource?: AttackCommandSource;
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

export interface CaptureEntityCommand {
  type: 'captureEntity';
  entityId: number;
  newSide: string;
}

export interface ApplyUpgradeCommand {
  type: 'applyUpgrade';
  entityId: number;
  upgradeName: string;
}

export interface QueueUnitProductionCommand {
  type: 'queueUnitProduction';
  entityId: number;
  unitTemplateName: string;
}

export interface CancelUnitProductionCommand {
  type: 'cancelUnitProduction';
  entityId: number;
  productionId: number;
}

export interface QueueUpgradeProductionCommand {
  type: 'queueUpgradeProduction';
  entityId: number;
  upgradeName: string;
}

export interface CancelUpgradeProductionCommand {
  type: 'cancelUpgradeProduction';
  entityId: number;
  upgradeName: string;
}

export interface SetSideCreditsCommand {
  type: 'setSideCredits';
  side: string;
  amount: number;
}

export interface AddSideCreditsCommand {
  type: 'addSideCredits';
  side: string;
  amount: number;
}

export interface SetSidePlayerTypeCommand {
  type: 'setSidePlayerType';
  side: string;
  playerType: 'HUMAN' | 'COMPUTER';
}

export interface GrantSideScienceCommand {
  type: 'grantSideScience';
  side: string;
  scienceName: string;
}

export interface ApplyPlayerUpgradeCommand {
  type: 'applyPlayerUpgrade';
  upgradeName: string;
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
  | AttackEntityCommand
  | StopCommand
  | BridgeDestroyedCommand
  | BridgeRepairedCommand
  | SetLocomotorSetCommand
  | SetLocomotorUpgradeCommand
  | CaptureEntityCommand
  | ApplyUpgradeCommand
  | QueueUnitProductionCommand
  | CancelUnitProductionCommand
  | QueueUpgradeProductionCommand
  | CancelUpgradeProductionCommand
  | SetSideCreditsCommand
  | AddSideCreditsCommand
  | SetSidePlayerTypeCommand
  | GrantSideScienceCommand
  | ApplyPlayerUpgradeCommand
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
const COMMAND_OPTION_NEED_TARGET_ENEMY_OBJECT = 0x00000001;
const COMMAND_OPTION_NEED_TARGET_NEUTRAL_OBJECT = 0x00000002;
const COMMAND_OPTION_NEED_TARGET_ALLY_OBJECT = 0x00000004;
const COMMAND_OPTION_NEED_TARGET_POS = 0x00000020;
const COMMAND_OPTION_NEED_OBJECT_TARGET = COMMAND_OPTION_NEED_TARGET_ENEMY_OBJECT
  | COMMAND_OPTION_NEED_TARGET_NEUTRAL_OBJECT
  | COMMAND_OPTION_NEED_TARGET_ALLY_OBJECT;
type RelationshipValue = typeof RELATIONSHIP_ENEMIES | typeof RELATIONSHIP_NEUTRAL | typeof RELATIONSHIP_ALLIES;
type SidePlayerType = 'HUMAN' | 'COMPUTER';
type AttackCommandSource = 'PLAYER' | 'AI';

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
const ATTACK_MIN_RANGE_DISTANCE_SQR_FUDGE = 0.5;
const ATTACK_LOS_TERRAIN_FUDGE = 0.5;
const LOGIC_FRAME_RATE = 30;
const LOGIC_FRAME_MS = 1000 / LOGIC_FRAME_RATE;

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
const WEAPON_SET_FLAG_VETERAN = 1 << 0;
const WEAPON_SET_FLAG_ELITE = 1 << 1;
const WEAPON_SET_FLAG_HERO = 1 << 2;
const WEAPON_SET_FLAG_PLAYER_UPGRADE = 1 << 3;
const WEAPON_SET_FLAG_CRATEUPGRADE_ONE = 1 << 4;
const WEAPON_SET_FLAG_CRATEUPGRADE_TWO = 1 << 5;
const WEAPON_SET_FLAG_VEHICLE_HIJACK = 1 << 6;
const WEAPON_SET_FLAG_CARBOMB = 1 << 7;
const WEAPON_SET_FLAG_MINE_CLEARING_DETAIL = 1 << 8;
const WEAPON_AFFECTS_SELF = 0x01;
const WEAPON_AFFECTS_ALLIES = 0x02;
const WEAPON_AFFECTS_ENEMIES = 0x04;
const WEAPON_AFFECTS_NEUTRALS = 0x08;
const WEAPON_KILLS_SELF = 0x10;
const WEAPON_DOESNT_AFFECT_SIMILAR = 0x20;
const WEAPON_DOESNT_AFFECT_AIRBORNE = 0x40;
const WEAPON_AFFECTS_DEFAULT_MASK = WEAPON_AFFECTS_ALLIES | WEAPON_AFFECTS_ENEMIES | WEAPON_AFFECTS_NEUTRALS;
const WEAPON_COLLIDE_ALLIES = 0x0001;
const WEAPON_COLLIDE_ENEMIES = 0x0002;
const WEAPON_COLLIDE_STRUCTURES = 0x0004;
const WEAPON_COLLIDE_SHRUBBERY = 0x0008;
const WEAPON_COLLIDE_PROJECTILE = 0x0010;
const WEAPON_COLLIDE_WALLS = 0x0020;
const WEAPON_COLLIDE_SMALL_MISSILES = 0x0040;
const WEAPON_COLLIDE_BALLISTIC_MISSILES = 0x0080;
const WEAPON_COLLIDE_CONTROLLED_STRUCTURES = 0x0100;
const WEAPON_COLLIDE_DEFAULT_MASK = WEAPON_COLLIDE_STRUCTURES;
const HUGE_DAMAGE_AMOUNT = 1_000_000_000;
const ARMOR_SET_FLAG_VETERAN = 1 << 0;
const ARMOR_SET_FLAG_ELITE = 1 << 1;
const ARMOR_SET_FLAG_HERO = 1 << 2;
const ARMOR_SET_FLAG_PLAYER_UPGRADE = 1 << 3;
const ARMOR_SET_FLAG_WEAK_VERSUS_BASEDEFENSES = 1 << 4;

const WEAPON_SET_FLAG_MASK_BY_NAME = new Map<string, number>([
  ['VETERAN', WEAPON_SET_FLAG_VETERAN],
  ['ELITE', WEAPON_SET_FLAG_ELITE],
  ['HERO', WEAPON_SET_FLAG_HERO],
  ['PLAYER_UPGRADE', WEAPON_SET_FLAG_PLAYER_UPGRADE],
  ['CRATEUPGRADE_ONE', WEAPON_SET_FLAG_CRATEUPGRADE_ONE],
  ['CRATEUPGRADE_TWO', WEAPON_SET_FLAG_CRATEUPGRADE_TWO],
  ['VEHICLE_HIJACK', WEAPON_SET_FLAG_VEHICLE_HIJACK],
  ['CARBOMB', WEAPON_SET_FLAG_CARBOMB],
  ['MINE_CLEARING_DETAIL', WEAPON_SET_FLAG_MINE_CLEARING_DETAIL],
]);

const WEAPON_AFFECTS_MASK_BY_NAME = new Map<string, number>([
  ['SELF', WEAPON_AFFECTS_SELF],
  ['ALLIES', WEAPON_AFFECTS_ALLIES],
  ['ENEMIES', WEAPON_AFFECTS_ENEMIES],
  ['NEUTRALS', WEAPON_AFFECTS_NEUTRALS],
  ['SUICIDE', WEAPON_KILLS_SELF],
  ['NOT_SIMILAR', WEAPON_DOESNT_AFFECT_SIMILAR],
  ['NOT_AIRBORNE', WEAPON_DOESNT_AFFECT_AIRBORNE],
]);
const WEAPON_COLLIDE_MASK_BY_NAME = new Map<string, number>([
  ['ALLIES', WEAPON_COLLIDE_ALLIES],
  ['ENEMIES', WEAPON_COLLIDE_ENEMIES],
  ['STRUCTURES', WEAPON_COLLIDE_STRUCTURES],
  ['SHRUBBERY', WEAPON_COLLIDE_SHRUBBERY],
  ['PROJECTILES', WEAPON_COLLIDE_PROJECTILE],
  ['WALLS', WEAPON_COLLIDE_WALLS],
  ['SMALL_MISSILES', WEAPON_COLLIDE_SMALL_MISSILES],
  ['BALLISTIC_MISSILES', WEAPON_COLLIDE_BALLISTIC_MISSILES],
  ['CONTROLLED_STRUCTURES', WEAPON_COLLIDE_CONTROLLED_STRUCTURES],
]);

const ARMOR_SET_FLAG_MASK_BY_NAME = new Map<string, number>([
  ['VETERAN', ARMOR_SET_FLAG_VETERAN],
  ['ELITE', ARMOR_SET_FLAG_ELITE],
  ['HERO', ARMOR_SET_FLAG_HERO],
  ['PLAYER_UPGRADE', ARMOR_SET_FLAG_PLAYER_UPGRADE],
  ['WEAK_VERSUS_BASEDEFENSES', ARMOR_SET_FLAG_WEAK_VERSUS_BASEDEFENSES],
]);

const SOURCE_DAMAGE_TYPE_NAMES: readonly string[] = [
  'EXPLOSION',
  'CRUSH',
  'ARMOR_PIERCING',
  'SMALL_ARMS',
  'GATTLING',
  'RADIATION',
  'FLAME',
  'LASER',
  'SNIPER',
  'POISON',
  'HEALING',
  'UNRESISTABLE',
  'WATER',
  'DEPLOY',
  'SURRENDER',
  'HACK',
  'KILL_PILOT',
  'PENALTY',
  'FALLING',
  'MELEE',
  'DISARM',
  'HAZARD_CLEANUP',
  'PARTICLE_BEAM',
  'TOPPLING',
  'INFANTRY_MISSILE',
  'AURORA_BOMB',
  'LAND_MINE',
  'JET_MISSILES',
  'STEALTHJET_MISSILES',
  'MOLOTOV_COCKTAIL',
  'COMANCHE_VULCAN',
  'FLESHY_SNIPER',
];
const SOURCE_DAMAGE_TYPE_NAME_SET = new Set<string>(SOURCE_DAMAGE_TYPE_NAMES);

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

type MaxHealthChangeTypeName = 'SAME_CURRENTHEALTH' | 'PRESERVE_RATIO' | 'ADD_CURRENT_HEALTH_TOO';
type WeaponPrefireTypeName = 'PER_SHOT' | 'PER_ATTACK' | 'PER_CLIP';

interface AttackWeaponProfile {
  name: string;
  primaryDamage: number;
  secondaryDamage: number;
  primaryDamageRadius: number;
  secondaryDamageRadius: number;
  scatterTargetScalar: number;
  scatterTargets: Array<{ x: number; z: number }>;
  scatterRadius: number;
  scatterRadiusVsInfantry: number;
  radiusDamageAngle: number;
  damageType: string;
  damageDealtAtSelfPosition: boolean;
  radiusDamageAffectsMask: number;
  projectileCollideMask: number;
  weaponSpeed: number;
  minWeaponSpeed: number;
  scaleWeaponSpeed: boolean;
  projectileObjectName: string | null;
  attackRange: number;
  unmodifiedAttackRange: number;
  minAttackRange: number;
  continueAttackRange: number;
  clipSize: number;
  clipReloadFrames: number;
  autoReloadWhenIdleFrames: number;
  preAttackDelayFrames: number;
  preAttackType: WeaponPrefireTypeName;
  minDelayFrames: number;
  maxDelayFrames: number;
}

interface WeaponTemplateSetProfile {
  conditionsMask: number;
  weaponNamesBySlot: [string | null, string | null, string | null];
}

interface ArmorTemplateSetProfile {
  conditionsMask: number;
  armorName: string | null;
}

interface UpgradeModuleProfile {
  id: string;
  moduleType:
    | 'LOCOMOTORSETUPGRADE'
    | 'MAXHEALTHUPGRADE'
    | 'ARMORUPGRADE'
    | 'WEAPONSETUPGRADE'
    | 'COMMANDSETUPGRADE'
    | 'STATUSBITSUPGRADE'
    | 'STEALTHUPGRADE'
    | 'WEAPONBONUSUPGRADE'
    | 'COSTMODIFIERUPGRADE'
    | 'GRANTSCIENCEUPGRADE'
    | 'POWERPLANTUPGRADE'
    | 'RADARUPGRADE'
    | 'PASSENGERSFIREUPGRADE'
    | 'UNPAUSESPECIALPOWERUPGRADE';
  triggeredBy: Set<string>;
  conflictsWith: Set<string>;
  removesUpgrades: Set<string>;
  requiresAllTriggers: boolean;
  addMaxHealth: number;
  maxHealthChangeType: MaxHealthChangeTypeName;
  sourceUpgradeName: string | null;
  statusToSet: Set<string>;
  statusToClear: Set<string>;
  commandSetName: string | null;
  commandSetAltName: string | null;
  commandSetAltTriggerUpgrade: string | null;
  effectKindOf: Set<string>;
  effectPercent: number;
  grantScienceName: string;
  radarIsDisableProof: boolean;
  specialPowerTemplateName: string;
}

interface KindOfProductionCostModifier {
  kindOf: Set<string>;
  multiplier: number;
  refCount: number;
}

interface SideRadarState {
  radarCount: number;
  disableProofRadarCount: number;
}

interface SidePowerState {
  powerBonus: number;
}

interface ProductionProfile {
  maxQueueEntries: number;
  quantityModifiers: Array<{
    templateName: string;
    quantity: number;
  }>;
}

interface ProductionPrerequisiteGroup {
  objectAlternatives: string[];
  scienceRequirements: string[];
}

interface QueueProductionExitProfile {
  moduleType: 'QUEUE' | 'SUPPLY_CENTER' | 'SPAWN_POINT';
  unitCreatePoint: { x: number; y: number; z: number };
  naturalRallyPoint: { x: number; y: number; z: number } | null;
  exitDelayFrames: number;
  allowAirborneCreation: boolean;
  initialBurst: number;
  spawnPointBoneName: string | null;
}

interface ParkingPlaceProfile {
  totalSpaces: number;
  occupiedSpaceEntityIds: Set<number>;
  reservedProductionIds: Set<number>;
}

type ContainModuleType = 'OPEN' | 'TRANSPORT' | 'OVERLORD' | 'HELIX' | 'GARRISON';

interface ContainProfile {
  moduleType: ContainModuleType;
  passengersAllowedToFire: boolean;
  passengersAllowedToFireDefault: boolean;
  portableStructureTemplateNames?: string[];
}

interface JetAISneakyProfile {
  sneakyOffsetWhenAttacking: number;
  attackersMissPersistFrames: number;
}

interface UnitProductionQueueEntry {
  type: 'UNIT';
  templateName: string;
  productionId: number;
  buildCost: number;
  totalProductionFrames: number;
  framesUnderConstruction: number;
  percentComplete: number;
  productionQuantityTotal: number;
  productionQuantityProduced: number;
}

interface UpgradeProductionQueueEntry {
  type: 'UPGRADE';
  upgradeName: string;
  productionId: number;
  buildCost: number;
  totalProductionFrames: number;
  framesUnderConstruction: number;
  percentComplete: number;
  upgradeType: 'PLAYER' | 'OBJECT';
}

type ProductionQueueEntry = UnitProductionQueueEntry | UpgradeProductionQueueEntry;

interface PendingWeaponDamageEvent {
  sourceEntityId: number;
  primaryVictimEntityId: number | null;
  impactX: number;
  impactZ: number;
  executeFrame: number;
  delivery: 'DIRECT' | 'PROJECTILE';
  weapon: AttackWeaponProfile;
}

interface MapEntity {
  id: number;
  templateName: string;
  category: ObjectCategory;
  side?: string;
  controllingPlayerToken: string | null;
  resolved: boolean;
  mesh: THREE.Mesh;
  baseHeight: number;
  nominalHeight: number;
  selected: boolean;
  canMove: boolean;
  energyBonus: number;
  crusherLevel: number;
  crushableLevel: number;
  canBeSquished: boolean;
  isUnmanned: boolean;
  attackNeedsLineOfSight: boolean;
  isImmobile: boolean;
  canTakeDamage: boolean;
  maxHealth: number;
  health: number;
  attackWeapon: AttackWeaponProfile | null;
  weaponTemplateSets: WeaponTemplateSetProfile[];
  weaponSetFlagsMask: number;
  armorTemplateSets: ArmorTemplateSetProfile[];
  armorSetFlagsMask: number;
  armorDamageCoefficients: Map<string, number> | null;
  attackTargetEntityId: number | null;
  attackOriginalVictimPosition: VectorXZ | null;
  attackCommandSource: AttackCommandSource;
  nextAttackFrame: number;
  attackAmmoInClip: number;
  attackReloadFinishFrame: number;
  attackForceReloadFrame: number;
  attackScatterTargetsUnused: number[];
  preAttackFinishFrame: number;
  consecutiveShotsTargetEntityId: number | null;
  consecutiveShotsAtTarget: number;
  sneakyOffsetWhenAttacking: number;
  attackersMissPersistFrames: number;
  attackersMissExpireFrame: number;
  productionProfile: ProductionProfile | null;
  productionQueue: ProductionQueueEntry[];
  productionNextId: number;
  queueProductionExitProfile: QueueProductionExitProfile | null;
  rallyPoint: VectorXZ | null;
  parkingPlaceProfile: ParkingPlaceProfile | null;
  containProfile: ContainProfile | null;
  queueProductionExitDelayFramesRemaining: number;
  queueProductionExitBurstRemaining: number;
  parkingSpaceProducerId: number | null;
  helixCarrierId: number | null;
  helixPortableRiderId: number | null;
  largestWeaponRange: number;
  locomotorSets: Map<string, LocomotorSetProfile>;
  completedUpgrades: Set<string>;
  locomotorUpgradeTriggers: Set<string>;
  executedUpgradeModules: Set<string>;
  upgradeModules: UpgradeModuleProfile[];
  objectStatusFlags: Set<string>;
  commandSetStringOverride: string | null;
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
  movePath: VectorXZ[];
  pathIndex: number;
  moving: boolean;
  speed: number;
  moveTarget: VectorXZ | null;
  pathfindGoalCell: { x: number; z: number } | null;
  pathfindPosCell: { x: number; z: number } | null;
  destroyed: boolean;
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
  private readonly gameRandom = new GameRandom(1);

  private nextId = 1;
  private animationTime = 0;
  private selectedEntityId: number | null = null;
  private mapHeightmap: HeightmapGrid | null = null;
  private navigationGrid: NavigationGrid | null = null;
  private iniDataRegistry: IniDataRegistry | null = null;
  private readonly commandQueue: GameLogicCommand[] = [];
  private frameCounter = 0;
  private readonly bridgeSegments = new Map<number, BridgeSegmentState>();
  private readonly bridgeSegmentByControlEntity = new Map<number, number>();
  private readonly teamRelationshipOverrides = new Map<string, number>();
  private readonly playerRelationshipOverrides = new Map<string, number>();
  private readonly crcFloatScratch = new DataView(new ArrayBuffer(4));
  private readonly sideCredits = new Map<string, number>();
  private readonly sidePlayerTypes = new Map<string, SidePlayerType>();
  private readonly sideUpgradesInProduction = new Map<string, Set<string>>();
  private readonly sideCompletedUpgrades = new Map<string, Set<string>>();
  private readonly sideKindOfProductionCostModifiers = new Map<string, KindOfProductionCostModifier[]>();
  private readonly sideSciences = new Map<string, Set<string>>();
  private readonly sidePowerBonus = new Map<string, SidePowerState>();
  private readonly sideRadarState = new Map<string, SideRadarState>();
  private readonly playerSideByIndex = new Map<number, string>();
  private readonly localPlayerScienceAvailability = new Map<string, LocalScienceAvailability>();
  private readonly shortcutSpecialPowerSourceByName = new Map<string, Map<number, number>>();
  private readonly shortcutSpecialPowerNamesByEntityId = new Map<number, Set<string>>();
  private readonly sharedShortcutSpecialPowerReadyFrames = new Map<string, number>();
  private readonly pendingWeaponDamageEvents: PendingWeaponDamageEvent[] = [];
  private localPlayerSciencePurchasePoints = 0;
  private localPlayerIndex = 0;

  private isAttackMoveToMode = false;
  private previousAttackMoveToggleDown = false;

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
    this.iniDataRegistry = iniDataRegistry;

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
   * Source parity references:
   * - Generals/Code/GameEngine/Source/GameLogic/System/GameLogic.cpp (GameLogic::getCRC)
   *
   * TODO(source parity): replace the section serializers below with direct
   * ownership from object/partition/player/AI runtime ports as those systems
   * are promoted from scaffolding to source-complete subsystems.
   */
  createDeterministicGameLogicCrcSectionWriters():
    DeterministicGameLogicCrcSectionWriters<unknown> {
    return {
      writeObjects: (crc, snapshot) => this.writeDeterministicObjectsCrc(crc, snapshot),
      writePartitionManager: (crc, snapshot) => this.writeDeterministicPartitionManagerCrc(crc, snapshot),
      writePlayerList: (crc, snapshot) => this.writeDeterministicPlayerListCrc(crc, snapshot),
      writeAi: (crc, snapshot) => this.writeDeterministicAiCrc(crc, snapshot),
    };
  }

  /**
   * Minimal RTS interaction:
   * - Left click: select a spawned entity.
   * - Right click: issue move/attack-move based on attack-move mode.
   * - Press A (edge-triggered) to toggle one-shot attack-move mode.
   */
  handlePointerInput(
    input: InputState,
    camera: THREE.Camera,
  ): void {
    const attackMoveToggleDown = input.keysDown.has('a');
    if (attackMoveToggleDown && !this.previousAttackMoveToggleDown) {
      this.isAttackMoveToMode = !this.isAttackMoveToMode;
    }
    this.previousAttackMoveToggleDown = attackMoveToggleDown;

    if (input.leftMouseClick) {
      const pickedEntityId = this.pickObjectByMouse(input, camera);
      if (pickedEntityId === null) {
        this.submitCommand({ type: 'clearSelection' });
      } else {
        this.submitCommand({ type: 'select', entityId: pickedEntityId });
      }
    }
    if (input.rightMouseClick && this.selectedEntityId !== null) {
      const selectedEntity = this.spawnedEntities.get(this.selectedEntityId);
      const pickedEntityId = this.pickObjectByMouse(input, camera);
      if (
        selectedEntity
        && selectedEntity.attackWeapon
        && pickedEntityId !== null
        && pickedEntityId !== this.selectedEntityId
      ) {
        const targetEntity = this.spawnedEntities.get(pickedEntityId);
        if (
          targetEntity
          && !targetEntity.destroyed
          && this.getTeamRelationship(selectedEntity, targetEntity) === RELATIONSHIP_ENEMIES
        ) {
          this.submitCommand({
            type: 'attackEntity',
            entityId: this.selectedEntityId,
            targetEntityId: pickedEntityId,
          });
          this.isAttackMoveToMode = false;
          return;
        }
      }

      const moveTarget = this.getMoveTargetFromMouse(input, camera);
      if (moveTarget !== null) {
        const attackDistance = this.resolveAttackMoveDistance(selectedEntity);
        if (this.isAttackMoveToMode) {
          this.submitCommand({
            type: 'attackMoveTo',
            entityId: this.selectedEntityId,
            targetX: moveTarget.x,
            targetZ: moveTarget.z,
            attackDistance,
          });
          this.isAttackMoveToMode = false;
        } else {
          this.submitCommand({
            type: 'moveTo',
            entityId: this.selectedEntityId,
            targetX: moveTarget.x,
            targetZ: moveTarget.z,
          });
        }
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
    this.updateProduction();
    this.updateCombat();
    this.updateEntityMovement(dt);
    this.updateWeaponIdleAutoReload();
    this.updatePendingWeaponDamage();
    this.finalizeDestroyedEntities();
  }

  submitCommand(command: GameLogicCommand): void {
    if (command.type === 'purchaseScience') {
      this.applyCommand(command);
      return;
    }

    this.commandQueue.push(command);
  }

  getSelectedEntityId(): number | null {
    return this.selectedEntityId;
  }

  getSelectedEntityInfo(): SelectedEntityInfo | null {
    if (this.selectedEntityId === null) {
      return null;
    }

    const selected = this.spawnedEntities.get(this.selectedEntityId);
    if (!selected) {
      return null;
    }

    const registry = this.iniDataRegistry;
    const objectDef = registry
      ? this.findObjectDefByName(registry, selected.templateName)
      : undefined;
    const normalizedKindOf = this.normalizeKindOf(objectDef?.kindOf);
    return {
      id: selected.id,
      templateName: selected.templateName,
      category: selected.category,
      side: selected.side,
      resolved: selected.resolved,
      canMove: selected.canMove,
      hasAutoRallyPoint: selected.queueProductionExitProfile !== null,
      isUnmanned: selected.isUnmanned,
      isDozer: normalizedKindOf.has('DOZER'),
      isMoving: selected.moving,
      appliedUpgradeNames: Array.from(selected.completedUpgrades.values()).sort(),
    };
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

  getEntityRelationship(sourceEntityId: number, targetEntityId: number): EntityRelationship | null {
    const source = this.spawnedEntities.get(sourceEntityId);
    const target = this.spawnedEntities.get(targetEntityId);
    if (!source || !target) {
      return null;
    }
    return this.relationshipValueToLabel(this.getTeamRelationship(source, target));
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
    const normalizedSource = this.normalizePlayerIndex(sourcePlayerIndex);
    const normalizedTarget = this.normalizePlayerIndex(targetPlayerIndex);
    if (normalizedSource === null || normalizedTarget === null) {
      return 'neutral';
    }
    if (normalizedSource === normalizedTarget) {
      return 'allies';
    }

    const sourceSide = this.playerSideByIndex.get(normalizedSource);
    const targetSide = this.playerSideByIndex.get(normalizedTarget);
    if (!sourceSide || !targetSide) {
      return 'neutral';
    }
    return this.relationshipValueToLabel(this.getTeamRelationshipBySides(sourceSide, targetSide));
  }

  getAttackMoveDistanceForEntity(entityId: number): number {
    return this.resolveAttackMoveDistance(this.spawnedEntities.get(entityId));
  }

  getLocalPlayerUpgradeNames(): string[] {
    const side = this.resolveLocalPlayerSide();
    if (!side) {
      return [];
    }
    return Array.from(this.getSideUpgradeSet(this.sideCompletedUpgrades, side)).sort();
  }

  getLocalPlayerScienceNames(): string[] {
    const side = this.resolveLocalPlayerSide();
    if (!side) {
      return [];
    }
    return Array.from(this.getSideScienceSet(side)).sort();
  }

  getLocalPlayerSciencePurchasePoints(): number {
    return this.localPlayerSciencePurchasePoints;
  }

  private resolveLocalPlayerSide(): string | null {
    const configuredLocalSide = this.playerSideByIndex.get(this.localPlayerIndex);
    if (configuredLocalSide) {
      return configuredLocalSide;
    }

    const observedSides = new Set<string>();
    for (const entity of this.spawnedEntities.values()) {
      const normalizedSide = this.normalizeSide(entity.side);
      if (!normalizedSide) {
        continue;
      }
      observedSides.add(normalizedSide);
      if (observedSides.size > 1) {
        return null;
      }
    }

    if (observedSides.size !== 1) {
      return null;
    }

    for (const observedSide of observedSides) {
      return observedSide;
    }
    return null;
  }

  getLocalPlayerDisabledScienceNames(): string[] {
    const disabled: string[] = [];
    for (const [scienceName, availability] of this.localPlayerScienceAvailability.entries()) {
      if (availability === 'disabled') {
        disabled.push(scienceName);
      }
    }
    return disabled.sort();
  }

  getLocalPlayerHiddenScienceNames(): string[] {
    const hidden: string[] = [];
    for (const [scienceName, availability] of this.localPlayerScienceAvailability.entries()) {
      if (availability === 'hidden') {
        hidden.push(scienceName);
      }
    }
    return hidden.sort();
  }

  trackShortcutSpecialPowerSourceEntity(
    specialPowerName: string,
    sourceEntityId: number,
    readyFrame: number,
  ): boolean {
    const normalizedSpecialPowerName = this.normalizeShortcutSpecialPowerName(specialPowerName);
    if (!normalizedSpecialPowerName || !Number.isFinite(sourceEntityId)) {
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

  resolveShortcutSpecialPowerSourceEntityId(specialPowerName: string): number | null {
    const normalizedSpecialPowerName = this.normalizeShortcutSpecialPowerName(specialPowerName);
    if (!normalizedSpecialPowerName) {
      return null;
    }
    const sourcesForPower = this.shortcutSpecialPowerSourceByName.get(normalizedSpecialPowerName);
    if (!sourcesForPower || sourcesForPower.size === 0) {
      return null;
    }

    const staleEntityIds: number[] = [];
    let bestEntityId: number | null = null;
    let bestReadyFrame = Number.POSITIVE_INFINITY;
    for (const [entityId, readyFrame] of sourcesForPower.entries()) {
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
    for (const [entityId, readyFrame] of sourcesForPower.entries()) {
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

  resolveMoveTargetFromInput(input: InputState, camera: THREE.Camera): { x: number; z: number } | null {
    return this.getMoveTargetFromMouse(input, camera);
  }

  resolveObjectTargetFromInput(input: InputState, camera: THREE.Camera): number | null {
    return this.pickObjectByMouse(input, camera);
  }

  getEntityState(entityId: number): {
    id: number;
    templateName: string;
    health: number;
    maxHealth: number;
    canTakeDamage: boolean;
    attackTargetEntityId: number | null;
    alive: boolean;
    activeLocomotorSet: string;
    speed: number;
    statusFlags: string[];
    x: number;
    z: number;
  } | null {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) {
      return null;
    }

    return {
      id: entity.id,
      templateName: entity.templateName,
      health: entity.health,
      maxHealth: entity.maxHealth,
      canTakeDamage: entity.canTakeDamage,
      attackTargetEntityId: entity.attackTargetEntityId,
      alive: !entity.destroyed,
      activeLocomotorSet: entity.activeLocomotorSet,
      speed: entity.speed,
      statusFlags: Array.from(entity.objectStatusFlags.values()).sort(),
      x: entity.mesh.position.x,
      z: entity.mesh.position.z,
    };
  }

  getEntityIdsByTemplate(templateName: string): number[] {
    const normalizedTemplateName = templateName.trim().toUpperCase();
    if (!normalizedTemplateName) {
      return [];
    }
    return Array.from(this.spawnedEntities.values())
      .filter((entity) => entity.templateName.toUpperCase() === normalizedTemplateName)
      .map((entity) => entity.id)
      .sort((left, right) => left - right);
  }

  getProductionState(entityId: number): {
    queueEntryCount: number;
    queue: Array<{
      type: 'UNIT';
      templateName: string;
      productionId: number;
      buildCost: number;
      totalProductionFrames: number;
      framesUnderConstruction: number;
      percentComplete: number;
      productionQuantityTotal: number;
      productionQuantityProduced: number;
    } | {
      type: 'UPGRADE';
      upgradeName: string;
      productionId: number;
      buildCost: number;
      totalProductionFrames: number;
      framesUnderConstruction: number;
      percentComplete: number;
      upgradeType: 'PLAYER' | 'OBJECT';
    }>;
  } | null {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) {
      return null;
    }

    return {
      queueEntryCount: entity.productionQueue.length,
      queue: entity.productionQueue.map((entry) => {
        if (entry.type === 'UPGRADE') {
          return {
            type: entry.type,
            upgradeName: entry.upgradeName,
            productionId: entry.productionId,
            buildCost: entry.buildCost,
            totalProductionFrames: entry.totalProductionFrames,
            framesUnderConstruction: entry.framesUnderConstruction,
            percentComplete: entry.percentComplete,
            upgradeType: entry.upgradeType,
          };
        }

        return {
          type: entry.type,
          templateName: entry.templateName,
          productionId: entry.productionId,
          buildCost: entry.buildCost,
          totalProductionFrames: entry.totalProductionFrames,
          framesUnderConstruction: entry.framesUnderConstruction,
          percentComplete: entry.percentComplete,
          productionQuantityTotal: entry.productionQuantityTotal,
          productionQuantityProduced: entry.productionQuantityProduced,
        };
      }),
    };
  }

  getSideCredits(side: string): number {
    return this.sideCredits.get(this.normalizeSide(side)) ?? 0;
  }

  setSideCredits(side: string, amount: number): void {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return;
    }
    const normalizedAmount = Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
    this.sideCredits.set(normalizedSide, normalizedAmount);
  }

  addSideCredits(side: string, amount: number): number {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return 0;
    }
    const delta = Number.isFinite(amount) ? Math.trunc(amount) : 0;
    const current = this.sideCredits.get(normalizedSide) ?? 0;
    const next = Math.max(0, current + delta);
    this.sideCredits.set(normalizedSide, next);
    return next;
  }

  getSidePlayerType(side: string): SidePlayerType {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return 'HUMAN';
    }
    return this.sidePlayerTypes.get(normalizedSide) ?? 'HUMAN';
  }

  setSidePlayerType(side: string, playerType: string): boolean {
    const normalizedSide = this.normalizeSide(side);
    const normalizedType = playerType.trim().toUpperCase();
    if (!normalizedSide) {
      return false;
    }
    if (normalizedType !== 'HUMAN' && normalizedType !== 'COMPUTER') {
      return false;
    }

    this.sidePlayerTypes.set(normalizedSide, normalizedType);
    return true;
  }

  getSideUpgradeState(side: string): {
    inProduction: string[];
    completed: string[];
  } {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return { inProduction: [], completed: [] };
    }

    const inProduction = Array.from(this.getSideUpgradeSet(this.sideUpgradesInProduction, normalizedSide));
    const completed = Array.from(this.getSideUpgradeSet(this.sideCompletedUpgrades, normalizedSide));
    inProduction.sort((left, right) => left.localeCompare(right));
    completed.sort((left, right) => left.localeCompare(right));

    return { inProduction, completed };
  }

  getSideScienceState(side: string): {
    acquired: string[];
  } {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return { acquired: [] };
    }

    const acquired = Array.from(this.getSideScienceSet(normalizedSide));
    acquired.sort((left, right) => left.localeCompare(right));
    return { acquired };
  }

  getSidePowerState(side: string): SidePowerState {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return { powerBonus: 0 };
    }
    const state = this.getSidePowerStateMap(normalizedSide);
    return { powerBonus: state.powerBonus };
  }

  getSideRadarState(side: string): SideRadarState {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return { radarCount: 0, disableProofRadarCount: 0 };
    }
    const state = this.getSideRadarStateMap(normalizedSide);
    return { radarCount: state.radarCount, disableProofRadarCount: state.disableProofRadarCount };
  }

  grantSideScience(side: string, scienceName: string): boolean {
    const normalizedSide = this.normalizeSide(side);
    const normalizedScienceName = scienceName.trim().toUpperCase();
    if (!normalizedSide || !normalizedScienceName || normalizedScienceName === 'NONE') {
      return false;
    }

    const registry = this.iniDataRegistry;
    if (!registry) {
      return false;
    }
    const scienceDef = this.findScienceDefByName(registry, normalizedScienceName);
    if (!scienceDef) {
      return false;
    }

    // Source parity: Player::grantScience() rejects non-grantable sciences.
    const isGrantable = readBooleanField(scienceDef.fields, ['IsGrantable']);
    if (isGrantable === false) {
      return false;
    }

    const normalizedScience = scienceDef.name.trim().toUpperCase();
    if (!normalizedScience || normalizedScience === 'NONE') {
      return false;
    }

    return this.addScienceToSide(normalizedSide, normalizedScience);
  }

  private addScienceToSide(normalizedSide: string, normalizedScience: string): boolean {
    const sideSciences = this.getSideScienceSet(normalizedSide);
    if (sideSciences.has(normalizedScience)) {
      return false;
    }

    sideSciences.add(normalizedScience);
    return true;
  }

  private getSciencePurchaseCost(scienceDef: ScienceDef): number {
    const costRaw = readNumericField(scienceDef.fields, ['SciencePurchasePointCost']);
    if (!Number.isFinite(costRaw)) {
      return 0;
    }
    return Math.max(0, Math.trunc(costRaw));
  }

  private getSciencePrerequisites(scienceDef: ScienceDef): string[] {
    const prerequisites = new Set<string>();
    for (const tokens of this.extractIniValueTokens(scienceDef.fields['PrerequisiteSciences'])) {
      for (const token of tokens) {
        const normalized = token.trim().toUpperCase();
        if (normalized && normalized !== 'NONE') {
          prerequisites.add(normalized);
        }
      }
    }
    return [...prerequisites];
  }

  private isScienceAvailableForLocalPlayer(scienceName: string): boolean {
    const availability = this.localPlayerScienceAvailability.get(scienceName);
    return availability !== 'disabled' && availability !== 'hidden';
  }

  private getPurchasableScienceCost(side: string, scienceName: string): number {
    const normalizedScienceName = scienceName.trim().toUpperCase();
    if (!normalizedScienceName || normalizedScienceName === 'NONE') {
      return 0;
    }

    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return 0;
    }

    const registry = this.iniDataRegistry;
    if (!registry) {
      return 0;
    }

    const scienceDef = this.findScienceDefByName(registry, normalizedScienceName);
    if (!scienceDef) {
      return 0;
    }

    const normalizedScience = scienceDef.name.trim().toUpperCase();
    if (!normalizedScience || normalizedScience === 'NONE') {
      return 0;
    }

    if (!this.isScienceAvailableForLocalPlayer(normalizedScience)) {
      return 0;
    }

    if (this.hasSideScience(normalizedSide, normalizedScience)) {
      return 0;
    }

    const scienceCost = this.getSciencePurchaseCost(scienceDef);
    if (scienceCost <= 0 || scienceCost > this.localPlayerSciencePurchasePoints) {
      return 0;
    }

    for (const prerequisite of this.getSciencePrerequisites(scienceDef)) {
      if (!this.hasSideScience(normalizedSide, prerequisite)) {
        return 0;
      }
    }

    return scienceCost;
  }

  private getSideUpgradeSet(map: Map<string, Set<string>>, normalizedSide: string): Set<string> {
    const existing = map.get(normalizedSide);
    if (existing) {
      return existing;
    }
    const created = new Set<string>();
    map.set(normalizedSide, created);
    return created;
  }

  private getSideScienceSet(normalizedSide: string): Set<string> {
    const existing = this.sideSciences.get(normalizedSide);
    if (existing) {
      return existing;
    }
    const created = new Set<string>();
    this.sideSciences.set(normalizedSide, created);
    return created;
  }

  private getSideKindOfProductionCostModifiers(normalizedSide: string): KindOfProductionCostModifier[] {
    const existing = this.sideKindOfProductionCostModifiers.get(normalizedSide);
    if (existing) {
      return existing;
    }

    const created: KindOfProductionCostModifier[] = [];
    this.sideKindOfProductionCostModifiers.set(normalizedSide, created);
    return created;
  }

  private getSidePowerStateMap(normalizedSide: string): SidePowerState {
    const existing = this.sidePowerBonus.get(normalizedSide);
    if (existing) {
      return existing;
    }

    const created: SidePowerState = { powerBonus: 0 };
    this.sidePowerBonus.set(normalizedSide, created);
    return created;
  }

  private getSideRadarStateMap(normalizedSide: string): SideRadarState {
    const existing = this.sideRadarState.get(normalizedSide);
    if (existing) {
      return existing;
    }

    const created: SideRadarState = {
      radarCount: 0,
      disableProofRadarCount: 0,
    };
    this.sideRadarState.set(normalizedSide, created);
    return created;
  }

  private hasSideScience(side: string, scienceName: string): boolean {
    const normalizedSide = this.normalizeSide(side);
    const normalizedScienceName = scienceName.trim().toUpperCase();
    if (!normalizedSide || !normalizedScienceName || normalizedScienceName === 'NONE') {
      return false;
    }

    const registry = this.iniDataRegistry;
    if (!registry) {
      return false;
    }
    const scienceDef = this.findScienceDefByName(registry, normalizedScienceName);
    if (!scienceDef) {
      return false;
    }

    const normalizedScience = scienceDef.name.trim().toUpperCase();
    if (!normalizedScience || normalizedScience === 'NONE') {
      return false;
    }

    return this.getSideScienceSet(normalizedSide).has(normalizedScience);
  }

  private setSideUpgradeInProduction(side: string, upgradeName: string, enabled: boolean): void {
    const normalizedSide = this.normalizeSide(side);
    const normalizedUpgradeName = upgradeName.trim().toUpperCase();
    if (!normalizedSide || !normalizedUpgradeName) {
      return;
    }

    const set = this.getSideUpgradeSet(this.sideUpgradesInProduction, normalizedSide);
    if (enabled) {
      set.add(normalizedUpgradeName);
      return;
    }
    set.delete(normalizedUpgradeName);
  }

  private setSideUpgradeCompleted(side: string, upgradeName: string, enabled: boolean): void {
    const normalizedSide = this.normalizeSide(side);
    const normalizedUpgradeName = upgradeName.trim().toUpperCase();
    if (!normalizedSide || !normalizedUpgradeName) {
      return;
    }

    const set = this.getSideUpgradeSet(this.sideCompletedUpgrades, normalizedSide);
    if (enabled) {
      set.add(normalizedUpgradeName);
      return;
    }
    set.delete(normalizedUpgradeName);
  }

  private hasSideUpgradeInProduction(side: string, upgradeName: string): boolean {
    const normalizedSide = this.normalizeSide(side);
    const normalizedUpgradeName = upgradeName.trim().toUpperCase();
    if (!normalizedSide || !normalizedUpgradeName) {
      return false;
    }
    return this.getSideUpgradeSet(this.sideUpgradesInProduction, normalizedSide).has(normalizedUpgradeName);
  }

  private hasSideUpgradeCompleted(side: string, upgradeName: string): boolean {
    const normalizedSide = this.normalizeSide(side);
    const normalizedUpgradeName = upgradeName.trim().toUpperCase();
    if (!normalizedSide || !normalizedUpgradeName) {
      return false;
    }
    return this.getSideUpgradeSet(this.sideCompletedUpgrades, normalizedSide).has(normalizedUpgradeName);
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

  applyUpgradeToEntity(entityId: number, upgradeName: string): boolean {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) {
      return false;
    }

    if (entity.destroyed) {
      return false;
    }

    const normalizedUpgrade = upgradeName.trim().toUpperCase();
    if (!normalizedUpgrade || normalizedUpgrade === 'NONE') {
      return false;
    }

    entity.completedUpgrades.add(normalizedUpgrade);

    if (this.iniDataRegistry) {
      const upgradeDef = this.findUpgradeDefByName(this.iniDataRegistry, normalizedUpgrade);
      if (upgradeDef) {
        const existingModuleIds = new Set(entity.upgradeModules.map((module) => module.id));
        const modulesFromUpgrade = this.extractUpgradeModulesFromBlocks(
          upgradeDef.blocks ?? [],
          normalizedUpgrade,
        );
        for (const module of modulesFromUpgrade) {
          if (!existingModuleIds.has(module.id)) {
            entity.upgradeModules.push(module);
            existingModuleIds.add(module.id);
          }
        }
      }
    }

    return this.executePendingUpgradeModules(entityId, entity);
  }

  private captureEntity(entityId: number, newSide: string): void {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity || entity.destroyed) {
      return;
    }

    const normalizedNewSide = this.normalizeSide(newSide);
    if (!normalizedNewSide) {
      return;
    }

    const normalizedOldSide = this.normalizeSide(entity.side ?? '');
    entity.side = normalizedNewSide;
    entity.controllingPlayerToken = this.normalizeControllingPlayerToken(normalizedNewSide);
    this.transferCostModifierUpgradesBetweenSides(entity, normalizedOldSide, normalizedNewSide);
    this.transferPowerPlantUpgradesBetweenSides(entity, normalizedOldSide, normalizedNewSide);
    this.transferRadarUpgradesBetweenSides(entity, normalizedOldSide, normalizedNewSide);
  }

  private executePendingUpgradeModules(
    entityId: number,
    entity: MapEntity,
    skipGlobalPlayerUpgradeModules = false,
  ): boolean {
    let appliedAny = false;
    const upgradeMaskToCheck = this.buildEntityUpgradeMask(entity);
    for (const module of entity.upgradeModules) {
      if (
        skipGlobalPlayerUpgradeModules
        && (module.moduleType === 'COSTMODIFIERUPGRADE' || module.moduleType === 'GRANTSCIENCEUPGRADE')
      ) {
        continue;
      }
      if (!this.canExecuteUpgradeModule(entity, module, upgradeMaskToCheck)) {
        continue;
      }

      // Source parity: UpgradeMux::giveSelfUpgrade() processes removals before module implementation.
      this.processUpgradeModuleRemovals(entity, module);

      let appliedThisModule = false;
      if (module.moduleType === 'LOCOMOTORSETUPGRADE') {
        appliedThisModule = this.setEntityLocomotorUpgrade(entityId, true);
      } else if (module.moduleType === 'MAXHEALTHUPGRADE') {
        appliedThisModule = this.applyMaxHealthUpgrade(entity, module.addMaxHealth, module.maxHealthChangeType);
      } else if (module.moduleType === 'ARMORUPGRADE') {
        appliedThisModule = this.applyArmorUpgrade(entity);
      } else if (module.moduleType === 'WEAPONSETUPGRADE') {
        appliedThisModule = this.applyWeaponSetUpgrade(entity);
      } else if (module.moduleType === 'COMMANDSETUPGRADE') {
        appliedThisModule = this.applyCommandSetUpgrade(entity, module);
      } else if (module.moduleType === 'STATUSBITSUPGRADE') {
        appliedThisModule = this.applyStatusBitsUpgrade(entity, module);
      } else if (module.moduleType === 'STEALTHUPGRADE') {
        appliedThisModule = this.applyStealthUpgrade(entity);
      } else if (module.moduleType === 'WEAPONBONUSUPGRADE') {
        appliedThisModule = this.applyWeaponBonusUpgrade(entity);
      } else if (module.moduleType === 'COSTMODIFIERUPGRADE') {
        appliedThisModule = this.applyCostModifierUpgradeModule(entity, module);
      } else if (module.moduleType === 'GRANTSCIENCEUPGRADE') {
        appliedThisModule = this.applyGrantScienceUpgradeModule(entity, module);
      } else if (module.moduleType === 'POWERPLANTUPGRADE') {
        appliedThisModule = this.applyPowerPlantUpgradeModule(entity, module);
      } else if (module.moduleType === 'RADARUPGRADE') {
        appliedThisModule = this.applyRadarUpgradeModule(entity, module);
      } else if (module.moduleType === 'PASSENGERSFIREUPGRADE') {
        // Source parity: PassengersFireUpgrade sets contain->setPassengerAllowedToFire(TRUE).
        if (entity.containProfile) {
          entity.containProfile.passengersAllowedToFire = true;
          appliedThisModule = true;
        }
      } else if (module.moduleType === 'UNPAUSESPECIALPOWERUPGRADE') {
        // Source parity: UnpauseSpecialPowerUpgrade clears the associated special power pause.
        appliedThisModule = this.applyUnpauseSpecialPowerUpgradeModule(entity, module);
      }

      if (!appliedThisModule) {
        continue;
      }

      entity.executedUpgradeModules.add(module.id);
      appliedAny = true;
    }

    return appliedAny;
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
    this.iniDataRegistry = null;
    this.sideCredits.clear();
    this.sidePlayerTypes.clear();
    this.sideUpgradesInProduction.clear();
    this.sideCompletedUpgrades.clear();
    this.sideKindOfProductionCostModifiers.clear();
    this.sideSciences.clear();
    this.localPlayerScienceAvailability.clear();
    this.localPlayerSciencePurchasePoints = 0;
    this.sidePowerBonus.clear();
    this.sideRadarState.clear();
    this.frameCounter = 0;
    this.gameRandom.setSeed(1);
    this.isAttackMoveToMode = false;
    this.previousAttackMoveToggleDown = false;
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
    const controllingPlayerToken = this.resolveMapObjectControllingPlayerToken(mapObject);

    const { geometry, nominalHeight } = this.getGeometry(category);
    const material = this.getMaterial({
      category,
      resolved: isResolved,
      side: objectDef?.side,
      selected: false,
    });

    const locomotorSetProfiles = this.resolveLocomotorProfiles(objectDef, iniDataRegistry);
    const upgradeModules = this.extractUpgradeModules(objectDef);
    const productionProfile = this.extractProductionProfile(objectDef);
    const queueProductionExitProfile = this.extractQueueProductionExitProfile(objectDef);
    const parkingPlaceProfile = this.extractParkingPlaceProfile(objectDef);
    const containProfile = this.extractContainProfile(objectDef);
    const jetAISneakyProfile = this.extractJetAISneakyProfile(objectDef);
    const weaponTemplateSets = this.extractWeaponTemplateSets(objectDef);
    const armorTemplateSets = this.extractArmorTemplateSets(objectDef);
    const attackWeapon = this.resolveAttackWeaponProfile(objectDef, iniDataRegistry);
    const bodyStats = this.resolveBodyStats(objectDef);
    const energyBonus = readNumericField(objectDef?.fields ?? {}, ['EnergyBonus']) ?? 0;
    const largestWeaponRange = this.resolveLargestWeaponRange(objectDef, iniDataRegistry);
    const armorDamageCoefficients = this.resolveArmorDamageCoefficientsForSetSelection(
      armorTemplateSets,
      0,
      iniDataRegistry,
    );
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
    const initialClipAmmo = attackWeapon && attackWeapon.clipSize > 0 ? attackWeapon.clipSize : 0;
    const initialScatterTargetsUnused = attackWeapon
      ? Array.from({ length: attackWeapon.scatterTargets.length }, (_entry, index) => index)
      : [];

    return {
      id: objectId,
      templateName: mapObject.templateName,
      category,
      side: objectDef?.side,
      controllingPlayerToken,
      resolved: isResolved,
      mesh,
      baseHeight,
      nominalHeight,
      selected: false,
      crusherLevel: combatProfile.crusherLevel,
      crushableLevel: combatProfile.crushableLevel,
      canBeSquished: combatProfile.canBeSquished,
      isUnmanned: combatProfile.isUnmanned,
      attackNeedsLineOfSight,
      isImmobile,
      canMove: category === 'infantry' || category === 'vehicle' || category === 'air',
      locomotorSets: locomotorSetProfiles,
      completedUpgrades: new Set<string>(),
      locomotorUpgradeTriggers: new Set<string>(),
      executedUpgradeModules: new Set<string>(),
      upgradeModules,
      objectStatusFlags: new Set<string>(),
      commandSetStringOverride: null,
      locomotorUpgradeEnabled: false,
      activeLocomotorSet: LOCOMOTORSET_NORMAL,
      locomotorSurfaceMask: locomotorProfile.surfaceMask,
      locomotorDownhillOnly: locomotorProfile.downhillOnly,
      canTakeDamage: bodyStats.maxHealth > 0,
      maxHealth: bodyStats.maxHealth,
      health: bodyStats.initialHealth,
      energyBonus,
      attackWeapon,
      weaponTemplateSets,
      weaponSetFlagsMask: 0,
      armorTemplateSets,
      armorSetFlagsMask: 0,
      armorDamageCoefficients,
      attackTargetEntityId: null,
      attackOriginalVictimPosition: null,
      attackCommandSource: 'AI',
      nextAttackFrame: 0,
      attackAmmoInClip: initialClipAmmo,
      attackReloadFinishFrame: 0,
      attackForceReloadFrame: 0,
      attackScatterTargetsUnused: initialScatterTargetsUnused,
      preAttackFinishFrame: 0,
      consecutiveShotsTargetEntityId: null,
      consecutiveShotsAtTarget: 0,
      sneakyOffsetWhenAttacking: jetAISneakyProfile?.sneakyOffsetWhenAttacking ?? 0,
      attackersMissPersistFrames: jetAISneakyProfile?.attackersMissPersistFrames ?? 0,
      attackersMissExpireFrame: 0,
      productionProfile,
      productionQueue: [],
      productionNextId: 1,
      queueProductionExitProfile,
      rallyPoint: null,
      parkingPlaceProfile,
      containProfile,
      queueProductionExitDelayFramesRemaining: 0,
      queueProductionExitBurstRemaining: queueProductionExitProfile?.initialBurst ?? 0,
      parkingSpaceProducerId: null,
      helixCarrierId: null,
      helixPortableRiderId: null,
      pathDiameter,
      pathfindCenterInCell,
      blocksPath,
      obstacleGeometry,
      obstacleFootprint,
      largestWeaponRange,
      ignoredMovementObstacleId: null,
      movePath: [],
      pathIndex: 0,
      moving: false,
      speed: locomotorProfile.movementSpeed > 0 ? locomotorProfile.movementSpeed : this.config.defaultMoveSpeed,
      moveTarget: null,
      pathfindGoalCell: null,
      pathfindPosCell: (posCellX !== null && posCellZ !== null) ? { x: posCellX, z: posCellZ } : null,
      destroyed: false,
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

    return this.resolveLargestWeaponRangeForSetSelection(
      this.extractWeaponTemplateSets(objectDef),
      0,
      iniDataRegistry,
    );
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

  private findArmorDefByName(iniDataRegistry: IniDataRegistry, armorName: string): ArmorDef | undefined {
    const direct = iniDataRegistry.getArmor(armorName);
    if (direct) {
      return direct;
    }

    const normalizedArmorName = armorName.toUpperCase();
    for (const [registryArmorName, armorDef] of iniDataRegistry.armors.entries()) {
      if (registryArmorName.toUpperCase() === normalizedArmorName) {
        return armorDef;
      }
    }

    return undefined;
  }

  private findObjectDefByName(iniDataRegistry: IniDataRegistry, objectName: string): ObjectDef | undefined {
    const direct = iniDataRegistry.getObject(objectName);
    if (direct) {
      return direct;
    }

    const normalizedObjectName = objectName.toUpperCase();
    for (const [registryObjectName, objectDef] of iniDataRegistry.objects.entries()) {
      if (registryObjectName.toUpperCase() === normalizedObjectName) {
        return objectDef;
      }
    }

    return undefined;
  }

  private findUpgradeDefByName(iniDataRegistry: IniDataRegistry, upgradeName: string): UpgradeDef | undefined {
    const direct = iniDataRegistry.getUpgrade(upgradeName);
    if (direct) {
      return direct;
    }

    const normalizedUpgradeName = upgradeName.toUpperCase();
    for (const [registryUpgradeName, upgradeDef] of iniDataRegistry.upgrades.entries()) {
      if (registryUpgradeName.toUpperCase() === normalizedUpgradeName) {
        return upgradeDef;
      }
    }

    return undefined;
  }

  private findCommandButtonDefByName(
    iniDataRegistry: IniDataRegistry,
    commandButtonName: string,
  ): CommandButtonDef | undefined {
    const direct = iniDataRegistry.getCommandButton(commandButtonName);
    if (direct) {
      return direct;
    }

    const normalizedCommandButtonName = commandButtonName.toUpperCase();
    for (const [registryCommandButtonName, commandButtonDef] of iniDataRegistry.commandButtons.entries()) {
      if (registryCommandButtonName.toUpperCase() === normalizedCommandButtonName) {
        return commandButtonDef;
      }
    }

    return undefined;
  }

  private findCommandSetDefByName(iniDataRegistry: IniDataRegistry, commandSetName: string): CommandSetDef | undefined {
    const direct = iniDataRegistry.getCommandSet(commandSetName);
    if (direct) {
      return direct;
    }

    const normalizedCommandSetName = commandSetName.toUpperCase();
    for (const [registryCommandSetName, commandSetDef] of iniDataRegistry.commandSets.entries()) {
      if (registryCommandSetName.toUpperCase() === normalizedCommandSetName) {
        return commandSetDef;
      }
    }

    return undefined;
  }

  private findScienceDefByName(iniDataRegistry: IniDataRegistry, scienceName: string): ScienceDef | undefined {
    const direct = iniDataRegistry.getScience(scienceName);
    if (direct) {
      return direct;
    }

    const normalizedScienceName = scienceName.toUpperCase();
    for (const [registryScienceName, scienceDef] of iniDataRegistry.sciences.entries()) {
      if (registryScienceName.toUpperCase() === normalizedScienceName) {
        return scienceDef;
      }
    }

    return undefined;
  }

  private resolveUpgradeType(upgradeDef: UpgradeDef): 'PLAYER' | 'OBJECT' {
    const type = readStringField(upgradeDef.fields, ['Type'])?.toUpperCase();
    if (type === 'OBJECT') {
      return 'OBJECT';
    }
    return 'PLAYER';
  }

  private resolveUpgradeBuildTimeFrames(upgradeDef: UpgradeDef): number {
    const buildTimeSeconds = readNumericField(upgradeDef.fields, ['BuildTime']) ?? 0;
    if (!Number.isFinite(buildTimeSeconds)) {
      return 0;
    }
    return Math.trunc(buildTimeSeconds * LOGIC_FRAME_RATE);
  }

  private resolveUpgradeBuildCost(upgradeDef: UpgradeDef): number {
    const buildCostRaw = readNumericField(upgradeDef.fields, ['BuildCost']) ?? 0;
    if (!Number.isFinite(buildCostRaw)) {
      return 0;
    }
    // Source parity note: C&C upgrade cost calc does not apply kind-of production
    // cost modifiers; only object build/production costs are affected in this path.
    return Math.max(0, Math.trunc(buildCostRaw));
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

  private readIniFieldValue(fields: Record<string, IniValue>, fieldName: string): IniValue | undefined {
    const normalizedFieldName = fieldName.toUpperCase();
    for (const [name, value] of Object.entries(fields)) {
      if (name.toUpperCase() === normalizedFieldName) {
        return value;
      }
    }
    return undefined;
  }

  private resolveIniFieldString(fields: Record<string, IniValue>, fieldName: string): string | null {
    const value = this.readIniFieldValue(fields, fieldName);
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
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

  private collectWeaponNamesInPriorityOrder(objectDef: ObjectDef): string[] {
    const slotPriority = new Map<string, number>([
      ['PRIMARY', 0],
      ['SECONDARY', 1],
      ['TERTIARY', 2],
    ]);
    const candidates: Array<{ name: string; priority: number; order: number }> = [];
    const seen = new Set<string>();
    let order = 0;

    const addCandidate = (name: string, priority: number): void => {
      const trimmed = name.trim();
      if (!trimmed || trimmed.toUpperCase() === 'NONE') {
        return;
      }
      const normalized = trimmed.toUpperCase();
      if (seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      candidates.push({ name: trimmed, priority, order });
      order += 1;
    };

    const collectFromFieldValue = (value: IniValue | undefined): void => {
      for (const tokens of this.extractIniValueTokens(value)) {
        if (tokens.length >= 2) {
          const slot = tokens[0]?.toUpperCase() ?? '';
          const slotPriorityValue = slotPriority.get(slot);
          if (slotPriorityValue !== undefined) {
            const weaponName = tokens[1];
            if (weaponName !== undefined) {
              addCandidate(weaponName, slotPriorityValue);
              continue;
            }
          }
        }
        for (const weaponName of this.extractWeaponNamesFromTokens(tokens)) {
          addCandidate(weaponName, 3);
        }
      }
    };

    const collectWeaponFields = (fields: Record<string, IniValue>): void => {
      for (const [fieldName, fieldValue] of Object.entries(fields)) {
        if (fieldName.toUpperCase() === 'WEAPON') {
          collectFromFieldValue(fieldValue);
        }
      }
    };

    const visitBlock = (block: IniBlock): void => {
      collectWeaponFields(block.fields);
      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    collectWeaponFields(objectDef.fields);
    for (const block of objectDef.blocks) {
      visitBlock(block);
    }

    return candidates
      .sort((left, right) => left.priority - right.priority || left.order - right.order)
      .map((candidate) => candidate.name);
  }

  private extractWeaponTemplateSets(objectDef: ObjectDef | undefined): WeaponTemplateSetProfile[] {
    if (!objectDef) {
      return [];
    }

    const sets: WeaponTemplateSetProfile[] = [];
    const visitBlock = (block: IniBlock): void => {
      if (block.type.toUpperCase() === 'WEAPONSET') {
        sets.push({
          conditionsMask: this.extractConditionsMask(
            this.readIniFieldValue(block.fields, 'Conditions'),
            WEAPON_SET_FLAG_MASK_BY_NAME,
          ),
          weaponNamesBySlot: this.extractWeaponNamesBySlot(block.fields),
        });
      }
      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const block of objectDef.blocks) {
      visitBlock(block);
    }

    if (sets.length > 0) {
      return sets;
    }

    const fallback = this.collectWeaponNamesInPriorityOrder(objectDef);
    if (fallback.length === 0) {
      return [];
    }

    const fallbackBySlot: [string | null, string | null, string | null] = [
      fallback[0] ?? null,
      fallback[1] ?? null,
      fallback[2] ?? null,
    ];
    return [{ conditionsMask: 0, weaponNamesBySlot: fallbackBySlot }];
  }

  private extractArmorTemplateSets(objectDef: ObjectDef | undefined): ArmorTemplateSetProfile[] {
    if (!objectDef) {
      return [];
    }

    const sets: ArmorTemplateSetProfile[] = [];
    const visitBlock = (block: IniBlock): void => {
      if (block.type.toUpperCase() === 'ARMORSET') {
        sets.push({
          conditionsMask: this.extractConditionsMask(
            this.readIniFieldValue(block.fields, 'Conditions'),
            ARMOR_SET_FLAG_MASK_BY_NAME,
          ),
          armorName: this.resolveIniFieldString(block.fields, 'Armor'),
        });
      }
      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const block of objectDef.blocks) {
      visitBlock(block);
    }

    if (sets.length > 0) {
      return sets;
    }

    const fallbackArmor = this.resolveIniFieldString(objectDef.fields, 'Armor');
    if (!fallbackArmor) {
      return [];
    }

    return [{ conditionsMask: 0, armorName: fallbackArmor }];
  }

  private extractConditionsMask(value: IniValue | undefined, flagMaskByName: Map<string, number>): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }

    let mask = 0;
    for (const tokens of this.extractIniValueTokens(value)) {
      for (const token of tokens) {
        const normalized = token.trim().toUpperCase();
        const bitMask = flagMaskByName.get(normalized);
        if (bitMask !== undefined) {
          mask |= bitMask;
        }
      }
    }

    return mask;
  }

  private resolveWeaponRadiusAffectsMask(weaponDef: WeaponDef): number {
    const affectsValue = this.readIniFieldValue(weaponDef.fields, 'RadiusDamageAffects');
    if (typeof affectsValue === 'undefined') {
      return WEAPON_AFFECTS_DEFAULT_MASK;
    }
    return this.extractConditionsMask(affectsValue, WEAPON_AFFECTS_MASK_BY_NAME);
  }

  private resolveWeaponProjectileCollideMask(weaponDef: WeaponDef): number {
    const collideValue = this.readIniFieldValue(weaponDef.fields, 'ProjectileCollidesWith');
    if (typeof collideValue === 'undefined') {
      return WEAPON_COLLIDE_DEFAULT_MASK;
    }
    return this.extractConditionsMask(collideValue, WEAPON_COLLIDE_MASK_BY_NAME);
  }

  private resolveWeaponScatterTargets(weaponDef: WeaponDef): Array<{ x: number; z: number }> {
    const scatterTargetValue = this.readIniFieldValue(weaponDef.fields, 'ScatterTarget');
    if (typeof scatterTargetValue === 'undefined') {
      return [];
    }

    const resolvedTargets: Array<{ x: number; z: number }> = [];
    for (const tokens of this.extractIniValueTokens(scatterTargetValue)) {
      const numericTokens = tokens
        .map((token) => Number(token))
        .filter((value) => Number.isFinite(value));
      if (numericTokens.length >= 2) {
        resolvedTargets.push({
          x: numericTokens[0] ?? 0,
          z: numericTokens[1] ?? 0,
        });
      }
    }

    if (resolvedTargets.length > 0) {
      return resolvedTargets;
    }

    const flattenedNumbers = readNumericList(scatterTargetValue);
    for (let index = 0; index + 1 < flattenedNumbers.length; index += 2) {
      resolvedTargets.push({
        x: flattenedNumbers[index] ?? 0,
        z: flattenedNumbers[index + 1] ?? 0,
      });
    }

    return resolvedTargets;
  }

  private extractWeaponNamesBySlot(fields: Record<string, IniValue>): [string | null, string | null, string | null] {
    const slots: [string | null, string | null, string | null] = [null, null, null];

    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      if (fieldName.toUpperCase() !== 'WEAPON') {
        continue;
      }

      const tokenGroups = this.extractIniValueTokens(fieldValue);
      if (
        Array.isArray(fieldValue)
        && fieldValue.every((entry) => typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean')
      ) {
        const inlineTokens = fieldValue
          .map((entry) => String(entry).trim())
          .filter((entry) => entry.length > 0);
        if (inlineTokens.length > 0) {
          tokenGroups.unshift(inlineTokens);
        }
      }

      for (const tokens of tokenGroups) {
        const slotName = tokens[0]?.trim().toUpperCase() ?? '';
        const weaponName = tokens[1]?.trim();
        if (!weaponName) {
          continue;
        }
        const normalizedWeaponName = weaponName.toUpperCase() === 'NONE' ? null : weaponName;
        if (slotName === 'PRIMARY') {
          slots[0] = normalizedWeaponName;
        } else if (slotName === 'SECONDARY') {
          slots[1] = normalizedWeaponName;
        } else if (slotName === 'TERTIARY') {
          slots[2] = normalizedWeaponName;
        }
      }
    }

    return slots;
  }

  private selectBestSetByConditions<T extends { conditionsMask: number }>(
    sets: readonly T[],
    currentMask: number,
  ): T | null {
    if (sets.length === 0) {
      return null;
    }

    let best: T | null = null;
    let bestYesMatch = 0;
    let bestYesExtraneousBits = Number.MAX_SAFE_INTEGER;
    for (const candidate of sets) {
      const yesFlags = candidate.conditionsMask >>> 0;
      const yesMatch = this.countSetBits((currentMask & yesFlags) >>> 0);
      const yesExtraneousBits = this.countSetBits((yesFlags & ~currentMask) >>> 0);
      if (yesMatch > bestYesMatch || (yesMatch >= bestYesMatch && yesExtraneousBits < bestYesExtraneousBits)) {
        best = candidate;
        bestYesMatch = yesMatch;
        bestYesExtraneousBits = yesExtraneousBits;
      }
    }

    return best;
  }

  private countSetBits(value: number): number {
    let v = value >>> 0;
    let count = 0;
    while (v !== 0) {
      count += v & 1;
      v >>>= 1;
    }
    return count;
  }

  private resolveWeaponDamageTypeName(weaponDef: WeaponDef): string {
    const explicitType = this.resolveIniFieldString(weaponDef.fields, 'DamageType')?.toUpperCase();
    if (explicitType && SOURCE_DAMAGE_TYPE_NAME_SET.has(explicitType)) {
      return explicitType;
    }

    const indexedType = readNumericField(weaponDef.fields, ['DamageType']);
    if (indexedType !== null) {
      const index = Math.trunc(indexedType);
      if (index >= 0 && index < SOURCE_DAMAGE_TYPE_NAMES.length) {
        return SOURCE_DAMAGE_TYPE_NAMES[index]!;
      }
    }

    return 'EXPLOSION';
  }

  private resolveWeaponProfileFromDef(weaponDef: WeaponDef): AttackWeaponProfile | null {
    const attackRangeRaw = readNumericField(weaponDef.fields, ['AttackRange', 'Range']) ?? NO_ATTACK_DISTANCE;
    const unmodifiedAttackRange = Math.max(0, attackRangeRaw);
    const attackRange = Math.max(0, attackRangeRaw - ATTACK_RANGE_CELL_EDGE_FUDGE);
    const minAttackRange = Math.max(0, readNumericField(weaponDef.fields, ['MinimumAttackRange']) ?? 0);
    const continueAttackRange = Math.max(0, readNumericField(weaponDef.fields, ['ContinueAttackRange']) ?? 0);
    const primaryDamage = readNumericField(weaponDef.fields, ['PrimaryDamage']) ?? 0;
    const secondaryDamage = readNumericField(weaponDef.fields, ['SecondaryDamage']) ?? 0;
    const primaryDamageRadius = Math.max(0, readNumericField(weaponDef.fields, ['PrimaryDamageRadius']) ?? 0);
    const secondaryDamageRadius = Math.max(0, readNumericField(weaponDef.fields, ['SecondaryDamageRadius']) ?? 0);
    const scatterTargetScalar = Math.max(0, readNumericField(weaponDef.fields, ['ScatterTargetScalar']) ?? 0);
    const scatterTargets = this.resolveWeaponScatterTargets(weaponDef);
    const scatterRadius = Math.max(0, readNumericField(weaponDef.fields, ['ScatterRadius']) ?? 0);
    const scatterRadiusVsInfantry = Math.max(0, readNumericField(weaponDef.fields, ['ScatterRadiusVsInfantry']) ?? 0);
    const radiusDamageAngleDegrees = readNumericField(weaponDef.fields, ['RadiusDamageAngle']);
    const radiusDamageAngle = radiusDamageAngleDegrees === null
      ? Math.PI
      : Math.max(0, radiusDamageAngleDegrees * (Math.PI / 180));
    const projectileObjectRaw = readStringField(weaponDef.fields, ['ProjectileObject'])?.trim() ?? '';
    const projectileObjectName = projectileObjectRaw && projectileObjectRaw.toUpperCase() !== 'NONE'
      ? projectileObjectRaw
      : null;
    const damageDealtAtSelfPosition = readBooleanField(weaponDef.fields, ['DamageDealtAtSelfPosition']) ?? false;
    const radiusDamageAffectsMask = this.resolveWeaponRadiusAffectsMask(weaponDef);
    const projectileCollideMask = this.resolveWeaponProjectileCollideMask(weaponDef);
    const weaponSpeedRaw = readNumericField(weaponDef.fields, ['WeaponSpeed']) ?? 999999;
    const weaponSpeed = Number.isFinite(weaponSpeedRaw) && weaponSpeedRaw > 0 ? weaponSpeedRaw : 999999;
    const minWeaponSpeedRaw = readNumericField(weaponDef.fields, ['MinWeaponSpeed']) ?? 999999;
    const minWeaponSpeed = Number.isFinite(minWeaponSpeedRaw) && minWeaponSpeedRaw > 0 ? minWeaponSpeedRaw : 999999;
    const scaleWeaponSpeed = readBooleanField(weaponDef.fields, ['ScaleWeaponSpeed']) ?? false;
    const clipSizeRaw = readNumericField(weaponDef.fields, ['ClipSize']) ?? 0;
    const clipSize = Math.max(0, Math.trunc(clipSizeRaw));
    const clipReloadFrames = this.msToLogicFrames(readNumericField(weaponDef.fields, ['ClipReloadTime']) ?? 0);
    const autoReloadWhenIdleFrames = this.msToLogicFrames(readNumericField(weaponDef.fields, ['AutoReloadWhenIdle']) ?? 0);
    const preAttackDelayFrames = this.msToLogicFrames(readNumericField(weaponDef.fields, ['PreAttackDelay']) ?? 0);
    const preAttackTypeToken = readStringField(weaponDef.fields, ['PreAttackType'])?.trim().toUpperCase();
    const preAttackType: WeaponPrefireTypeName =
      preAttackTypeToken === 'PER_ATTACK' || preAttackTypeToken === 'PER_CLIP'
        ? preAttackTypeToken
        : 'PER_SHOT';
    const delayValues = readNumericList(weaponDef.fields['DelayBetweenShots']);
    const minDelayMs = delayValues[0] ?? 0;
    const maxDelayMs = delayValues[1] ?? minDelayMs;
    const minDelayFrames = this.msToLogicFrames(minDelayMs);
    const maxDelayFrames = this.msToLogicFrames(maxDelayMs);

    if (attackRange <= 0 || primaryDamage <= 0) {
      return null;
    }

    return {
      name: weaponDef.name,
      primaryDamage,
      secondaryDamage,
      primaryDamageRadius,
      secondaryDamageRadius,
      scatterTargetScalar,
      scatterTargets,
      scatterRadius,
      scatterRadiusVsInfantry,
      radiusDamageAngle,
      damageType: this.resolveWeaponDamageTypeName(weaponDef),
      damageDealtAtSelfPosition,
      radiusDamageAffectsMask,
      projectileCollideMask,
      weaponSpeed,
      minWeaponSpeed,
      scaleWeaponSpeed,
      projectileObjectName,
      attackRange,
      unmodifiedAttackRange,
      minAttackRange,
      continueAttackRange,
      clipSize,
      clipReloadFrames,
      autoReloadWhenIdleFrames,
      preAttackDelayFrames,
      preAttackType,
      minDelayFrames: Math.max(0, Math.min(minDelayFrames, maxDelayFrames)),
      maxDelayFrames: Math.max(minDelayFrames, maxDelayFrames),
    };
  }

  private resolveAttackWeaponProfileForSetSelection(
    weaponTemplateSets: readonly WeaponTemplateSetProfile[],
    weaponSetFlagsMask: number,
    iniDataRegistry: IniDataRegistry,
  ): AttackWeaponProfile | null {
    const selectedSet = this.selectBestSetByConditions(weaponTemplateSets, weaponSetFlagsMask);
    if (!selectedSet) {
      return null;
    }

    for (const weaponName of selectedSet.weaponNamesBySlot) {
      if (!weaponName) {
        continue;
      }
      const weapon = this.findWeaponDefByName(iniDataRegistry, weaponName);
      if (!weapon) {
        continue;
      }
      const profile = this.resolveWeaponProfileFromDef(weapon);
      if (profile) {
        return profile;
      }
    }

    return null;
  }

  private resolveLargestWeaponRangeForSetSelection(
    weaponTemplateSets: readonly WeaponTemplateSetProfile[],
    weaponSetFlagsMask: number,
    iniDataRegistry: IniDataRegistry,
  ): number {
    const selectedSet = this.selectBestSetByConditions(weaponTemplateSets, weaponSetFlagsMask);
    if (!selectedSet) {
      return NO_ATTACK_DISTANCE;
    }

    let largestWeaponRange = NO_ATTACK_DISTANCE;
    for (const weaponName of selectedSet.weaponNamesBySlot) {
      if (!weaponName) {
        continue;
      }
      const weapon = this.findWeaponDefByName(iniDataRegistry, weaponName);
      if (!weapon) {
        continue;
      }
      const weaponProfile = this.resolveWeaponProfileFromDef(weapon);
      if (!weaponProfile) {
        continue;
      }
      if (weaponProfile.attackRange > largestWeaponRange) {
        largestWeaponRange = weaponProfile.attackRange;
      }
    }

    return largestWeaponRange;
  }

  private resolveArmorDamageCoefficientsForSetSelection(
    armorTemplateSets: readonly ArmorTemplateSetProfile[],
    armorSetFlagsMask: number,
    iniDataRegistry: IniDataRegistry,
  ): Map<string, number> | null {
    const selectedSet = this.selectBestSetByConditions(armorTemplateSets, armorSetFlagsMask);
    if (!selectedSet || !selectedSet.armorName) {
      return null;
    }

    const armorDef = this.findArmorDefByName(iniDataRegistry, selectedSet.armorName);
    if (!armorDef) {
      return null;
    }

    return this.resolveArmorDamageCoefficientsFromDef(armorDef);
  }

  private resolveArmorDamageCoefficientsFromDef(armorDef: ArmorDef): Map<string, number> {
    let defaultCoefficient = 1;
    for (const [fieldName, fieldValue] of Object.entries(armorDef.fields)) {
      if (fieldName.trim().toUpperCase() !== 'DEFAULT') {
        continue;
      }
      const parsedDefault = this.parseNumericIniValue(fieldValue);
      if (parsedDefault !== null) {
        defaultCoefficient = Math.max(0, parsedDefault);
      }
      break;
    }

    const coefficients = new Map<string, number>();
    for (const damageType of SOURCE_DAMAGE_TYPE_NAMES) {
      coefficients.set(damageType, defaultCoefficient);
    }

    for (const [fieldName, fieldValue] of Object.entries(armorDef.fields)) {
      const normalizedFieldName = fieldName.trim().toUpperCase();
      if (normalizedFieldName === 'DEFAULT' || !SOURCE_DAMAGE_TYPE_NAME_SET.has(normalizedFieldName)) {
        continue;
      }
      const coefficient = this.parseNumericIniValue(fieldValue);
      if (coefficient === null) {
        continue;
      }
      coefficients.set(normalizedFieldName, Math.max(0, coefficient));
    }

    return coefficients;
  }

  private parseNumericIniValue(value: IniValue | undefined): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const token = value.trim();
      if (token.endsWith('%')) {
        const parsedPercent = Number(token.slice(0, -1));
        if (Number.isFinite(parsedPercent)) {
          return parsedPercent / 100;
        }
      }
      const parsed = Number(token);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        const parsed = this.parseNumericIniValue(entry as IniValue);
        if (parsed !== null) {
          return parsed;
        }
      }
    }

    return null;
  }

  private resolveAttackWeaponProfile(
    objectDef: ObjectDef | undefined,
    iniDataRegistry: IniDataRegistry,
  ): AttackWeaponProfile | null {
    if (!objectDef) {
      return null;
    }
    return this.resolveAttackWeaponProfileForSetSelection(
      this.extractWeaponTemplateSets(objectDef),
      0,
      iniDataRegistry,
    );
  }

  private resolveBodyStats(objectDef: ObjectDef | undefined): {
    maxHealth: number;
    initialHealth: number;
  } {
    if (!objectDef) {
      return { maxHealth: 0, initialHealth: 0 };
    }

    let maxHealth: number | null = null;
    let initialHealth: number | null = null;

    const visitBlock = (block: IniBlock): void => {
      if (block.type.toUpperCase() === 'BODY') {
        const blockMaxHealth = readNumericField(block.fields, ['MaxHealth']);
        const blockInitialHealth = readNumericField(block.fields, ['InitialHealth']);
        if (blockMaxHealth !== null) {
          maxHealth = blockMaxHealth;
        }
        if (blockInitialHealth !== null) {
          initialHealth = blockInitialHealth;
        }
      }
      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const block of objectDef.blocks) {
      visitBlock(block);
    }

    const resolvedMax = maxHealth !== null && Number.isFinite(maxHealth) && maxHealth > 0
      ? maxHealth
      : 0;
    const resolvedInitial = initialHealth !== null && Number.isFinite(initialHealth)
      ? clamp(initialHealth, 0, resolvedMax > 0 ? resolvedMax : Math.max(initialHealth, 0))
      : resolvedMax;

    return {
      maxHealth: resolvedMax,
      initialHealth: resolvedInitial,
    };
  }

  private parseUpgradeNames(value: IniValue | undefined): string[] {
    if (value === undefined) {
      return [];
    }

    return this.extractIniValueTokens(value)
      .flatMap((tokens) => tokens)
      .map((token) => token.trim().toUpperCase())
      .filter((token) => token.length > 0 && token !== 'NONE');
  }

  private parseKindOf(value: IniValue | undefined): string[] {
    if (value === undefined) {
      return [];
    }

    return this.extractIniValueTokens(value)
      .flatMap((tokens) => tokens)
      .map((token) => token.trim().toUpperCase())
      .filter((token) => token.length > 0 && token !== 'NONE');
  }

  private parsePercent(value: IniValue | undefined): number | null {
    if (value === undefined) {
      return null;
    }

    const tokens = this.extractIniValueTokens(value).flatMap((entry) => entry);
    for (const token of tokens) {
      const trimmed = token.trim();
      if (!trimmed || trimmed.toUpperCase() === 'NONE') {
        continue;
      }

      const numericText = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed;
      const parsed = Number(numericText);
      if (Number.isFinite(parsed)) {
        return parsed / 100;
      }
    }

    return null;
  }

  private parseObjectStatusNames(value: IniValue | undefined): string[] {
    if (value === undefined) {
      return [];
    }

    return this.extractIniValueTokens(value)
      .flatMap((tokens) => tokens)
      .map((token) => this.normalizeObjectStatusName(token))
      .filter((token) => token !== null);
  }

  private normalizeObjectStatusName(statusName: string): string | null {
    const normalized = statusName.trim().toUpperCase();
    if (!normalized || normalized === 'NONE') {
      return null;
    }
    if (normalized.startsWith('OBJECT_STATUS_')) {
      const withoutPrefix = normalized.slice('OBJECT_STATUS_'.length);
      return withoutPrefix.length > 0 ? withoutPrefix : null;
    }
    return normalized;
  }

  private extractProductionProfile(objectDef: ObjectDef | undefined): ProductionProfile | null {
    if (!objectDef) {
      return null;
    }

    let foundModule = false;
    let maxQueueEntries = 9;
    const quantityModifiers: Array<{ templateName: string; quantity: number }> = [];

    const visitBlock = (block: IniBlock): void => {
      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (moduleType === 'PRODUCTIONUPDATE') {
          foundModule = true;

          const configuredMaxQueueEntries = readNumericField(block.fields, ['MaxQueueEntries']);
          if (configuredMaxQueueEntries !== null && Number.isFinite(configuredMaxQueueEntries)) {
            maxQueueEntries = Math.max(0, Math.trunc(configuredMaxQueueEntries));
          }

          for (const tokens of this.extractIniValueTokens(block.fields['QuantityModifier'])) {
            const templateName = tokens[0]?.trim();
            if (!templateName || templateName.toUpperCase() === 'NONE') {
              continue;
            }
            const quantityRaw = tokens[1] !== undefined ? Number(tokens[1]) : 1;
            const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.trunc(quantityRaw)) : 1;
            quantityModifiers.push({
              templateName: templateName.toUpperCase(),
              quantity,
            });
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

    if (!foundModule) {
      return null;
    }

    return {
      maxQueueEntries,
      quantityModifiers,
    };
  }

  private extractQueueProductionExitProfile(objectDef: ObjectDef | undefined): QueueProductionExitProfile | null {
    if (!objectDef) {
      return null;
    }

    let profile: QueueProductionExitProfile | null = null;

    const visitBlock = (block: IniBlock): void => {
      if (profile !== null) {
        return;
      }
      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (moduleType === 'QUEUEPRODUCTIONEXITUPDATE') {
          const unitCreatePoint = readCoord3DField(block.fields, ['UnitCreatePoint']) ?? { x: 0, y: 0, z: 0 };
          const naturalRallyPoint = readCoord3DField(block.fields, ['NaturalRallyPoint']);
          const exitDelayMs = readNumericField(block.fields, ['ExitDelay']) ?? 0;
          const initialBurstRaw = readNumericField(block.fields, ['InitialBurst']) ?? 0;
          profile = {
            moduleType: 'QUEUE',
            unitCreatePoint,
            naturalRallyPoint,
            exitDelayFrames: this.msToLogicFrames(exitDelayMs),
            allowAirborneCreation: readBooleanField(block.fields, ['AllowAirborneCreation']) === true,
            initialBurst: Math.max(0, Math.trunc(initialBurstRaw)),
            spawnPointBoneName: null,
          };
        } else if (moduleType === 'SUPPLYCENTERPRODUCTIONEXITUPDATE') {
          const unitCreatePoint = readCoord3DField(block.fields, ['UnitCreatePoint']) ?? { x: 0, y: 0, z: 0 };
          const naturalRallyPoint = readCoord3DField(block.fields, ['NaturalRallyPoint']);
          profile = {
            moduleType: 'SUPPLY_CENTER',
            unitCreatePoint,
            naturalRallyPoint,
            exitDelayFrames: 0,
            allowAirborneCreation: false,
            initialBurst: 0,
            spawnPointBoneName: null,
          };
        } else if (moduleType === 'SPAWNPOINTPRODUCTIONEXITUPDATE') {
          // Source parity: SpawnPointProductionExitUpdate.cpp drives exits from named bone positions.
          // This browser port currently lacks bone-space exit placement, so we deterministically
          // use producer-local origin and emit no rally/airborne overrides.
          const spawnPointBoneName = readStringField(block.fields, ['SpawnPointBoneName']);
          profile = {
            moduleType: 'SPAWN_POINT',
            unitCreatePoint: { x: 0, y: 0, z: 0 },
            naturalRallyPoint: null,
            exitDelayFrames: 0,
            allowAirborneCreation: false,
            initialBurst: 0,
            spawnPointBoneName: spawnPointBoneName ?? null,
          };
        }
      }

      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const block of objectDef.blocks) {
      visitBlock(block);
    }

    return profile;
  }

  private extractParkingPlaceProfile(objectDef: ObjectDef | undefined): ParkingPlaceProfile | null {
    if (!objectDef) {
      return null;
    }

    let foundModule = false;
    let numRows = 0;
    let numCols = 0;

    const visitBlock = (block: IniBlock): void => {
      if (block.type.toUpperCase() !== 'BEHAVIOR') {
        for (const child of block.blocks) {
          visitBlock(child);
        }
        return;
      }

      const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
      if (moduleType === 'PARKINGPLACEBEHAVIOR') {
        foundModule = true;
        const rowsRaw = readNumericField(block.fields, ['NumRows']);
        const colsRaw = readNumericField(block.fields, ['NumCols']);
        if (rowsRaw !== null && Number.isFinite(rowsRaw)) {
          numRows = Math.max(0, Math.trunc(rowsRaw));
        }
        if (colsRaw !== null && Number.isFinite(colsRaw)) {
          numCols = Math.max(0, Math.trunc(colsRaw));
        }
      }

      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const block of objectDef.blocks) {
      visitBlock(block);
    }

    if (!foundModule) {
      return null;
    }

    return {
      totalSpaces: numRows * numCols,
      occupiedSpaceEntityIds: new Set<number>(),
      reservedProductionIds: new Set<number>(),
    };
  }

  private extractContainProfile(objectDef: ObjectDef | undefined): ContainProfile | null {
    if (!objectDef) {
      return null;
    }

    let profile: ContainProfile | null = null;

    const visitBlock = (block: IniBlock): void => {
      if (profile !== null) {
        return;
      }
      if (block.type.toUpperCase() !== 'BEHAVIOR') {
        for (const child of block.blocks) {
          visitBlock(child);
        }
        return;
      }

      const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
      const passengersAllowedRaw = readBooleanField(block.fields, ['PassengersAllowedToFire']);
      const passengersAllowedToFire = passengersAllowedRaw === true;
      const payloadTemplateNames = readStringList(block.fields, ['PayloadTemplateName']).map((templateName) =>
        templateName.toUpperCase(),
      );

      if (moduleType === 'OPENCONTAIN') {
        profile = {
          moduleType: 'OPEN',
          passengersAllowedToFire,
          passengersAllowedToFireDefault: passengersAllowedToFire,
        };
      } else if (moduleType === 'TRANSPORTCONTAIN') {
        profile = {
          moduleType: 'TRANSPORT',
          passengersAllowedToFire,
          passengersAllowedToFireDefault: passengersAllowedToFire,
        };
      } else if (moduleType === 'OVERLORDCONTAIN') {
        profile = {
          moduleType: 'OVERLORD',
          passengersAllowedToFire,
          passengersAllowedToFireDefault: passengersAllowedToFire,
        };
      } else if (moduleType === 'HELIXCONTAIN') {
        // HELIXCONTAIN is a Zero Hour-specific container module name used by data INIs;
        // we map it to a dedicated internal container profile to preserve source behavior.
        profile = {
          moduleType: 'HELIX',
          passengersAllowedToFire,
          passengersAllowedToFireDefault: passengersAllowedToFire,
          portableStructureTemplateNames: payloadTemplateNames,
        };
      } else if (moduleType === 'GARRISONCONTAIN') {
        // GarrisonContain is OpenContain-derived in source but always returns TRUE from
        // isPassengerAllowedToFire(), so we track it explicitly for behavior parity.
        profile = {
          moduleType: 'GARRISON',
          passengersAllowedToFire,
          passengersAllowedToFireDefault: passengersAllowedToFire,
        };
      }

      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const block of objectDef.blocks) {
      visitBlock(block);
    }

    return profile;
  }

  private extractJetAISneakyProfile(objectDef: ObjectDef | undefined): JetAISneakyProfile | null {
    if (!objectDef) {
      return null;
    }

    let foundModule = false;
    let sneakyOffsetWhenAttacking = 0;
    let attackersMissPersistFrames = 0;

    const visitBlock = (block: IniBlock): void => {
      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (moduleType === 'JETAIUPDATE') {
          foundModule = true;
          const sneakyOffsetRaw = readNumericField(block.fields, ['SneakyOffsetWhenAttacking']) ?? 0;
          if (Number.isFinite(sneakyOffsetRaw)) {
            sneakyOffsetWhenAttacking = sneakyOffsetRaw;
          }
          const persistMsRaw = readNumericField(block.fields, ['AttackersMissPersistTime']) ?? 0;
          attackersMissPersistFrames = this.msToLogicFrames(persistMsRaw);
        }
      }

      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const block of objectDef.blocks) {
      visitBlock(block);
    }

    if (!foundModule) {
      return null;
    }

    return {
      sneakyOffsetWhenAttacking,
      attackersMissPersistFrames,
    };
  }

  private extractUpgradeModules(objectDef: ObjectDef | undefined): UpgradeModuleProfile[] {
    if (!objectDef) {
      return [];
    }

    return this.extractUpgradeModulesFromBlocks(objectDef.blocks);
  }

  private extractUpgradeModulesFromBlocks(
    blocks: IniBlock[] = [],
    sourceUpgradeName: string | null = null,
  ): UpgradeModuleProfile[] {
    const modules: UpgradeModuleProfile[] = [];
    let index = 0;

    const visitBlock = (block: IniBlock): void => {
      const blockType = block.type.toUpperCase();
      if (blockType === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (
          moduleType === 'LOCOMOTORSETUPGRADE'
          || moduleType === 'MAXHEALTHUPGRADE'
          || moduleType === 'ARMORUPGRADE'
          || moduleType === 'WEAPONSETUPGRADE'
          || moduleType === 'COMMANDSETUPGRADE'
          || moduleType === 'STATUSBITSUPGRADE'
          || moduleType === 'STEALTHUPGRADE'
          || moduleType === 'WEAPONBONUSUPGRADE'
          || moduleType === 'COSTMODIFIERUPGRADE'
          || moduleType === 'GRANTSCIENCEUPGRADE'
          || moduleType === 'POWERPLANTUPGRADE'
          || moduleType === 'RADARUPGRADE'
          || moduleType === 'PASSENGERSFIREUPGRADE'
          || moduleType === 'UNPAUSESPECIALPOWERUPGRADE'
        ) {
          const triggeredBy = new Set(this.parseUpgradeNames(block.fields['TriggeredBy']));
          const conflictsWith = new Set(this.parseUpgradeNames(block.fields['ConflictsWith']));
          const removesUpgrades = new Set(this.parseUpgradeNames(block.fields['RemovesUpgrades']));
          const requiresAllTriggers = readBooleanField(block.fields, ['RequiresAllTriggers']) === true;
          const addMaxHealth = moduleType === 'MAXHEALTHUPGRADE'
            ? (readNumericField(block.fields, ['AddMaxHealth']) ?? 0)
            : 0;
          const statusToSet = moduleType === 'STATUSBITSUPGRADE'
            ? new Set(this.parseObjectStatusNames(block.fields['StatusToSet']))
            : new Set<string>();
          const statusToClear = moduleType === 'STATUSBITSUPGRADE'
            ? new Set(this.parseObjectStatusNames(block.fields['StatusToClear']))
            : new Set<string>();
          const changeTypeRaw = readStringField(block.fields, ['ChangeType'])?.toUpperCase() ?? 'SAME_CURRENTHEALTH';
          const maxHealthChangeType: MaxHealthChangeTypeName =
            changeTypeRaw === 'PRESERVE_RATIO' || changeTypeRaw === 'ADD_CURRENT_HEALTH_TOO'
              ? changeTypeRaw
              : 'SAME_CURRENTHEALTH';
          const commandSetName = moduleType === 'COMMANDSETUPGRADE'
            ? (readStringField(block.fields, ['CommandSet'])?.trim().toUpperCase() ?? '')
            : '';
          const commandSetAltName = moduleType === 'COMMANDSETUPGRADE'
            ? (readStringField(block.fields, ['CommandSetAlt'])?.trim().toUpperCase() ?? '')
            : '';
          const commandSetAltTriggerUpgradeRaw = moduleType === 'COMMANDSETUPGRADE'
            ? (readStringField(block.fields, ['TriggerAlt'])?.trim().toUpperCase() ?? '')
            : '';
          const commandSetAltTriggerUpgrade = commandSetAltTriggerUpgradeRaw && commandSetAltTriggerUpgradeRaw !== 'NONE'
            ? commandSetAltTriggerUpgradeRaw
            : null;
          const effectKindOf = moduleType === 'COSTMODIFIERUPGRADE'
            ? new Set(this.parseKindOf(block.fields['EffectKindOf']))
            : new Set<string>();
          const effectPercent = moduleType === 'COSTMODIFIERUPGRADE'
            ? (this.parsePercent(block.fields['Percentage']) ?? 0)
            : 0;
          const grantScienceName = moduleType === 'GRANTSCIENCEUPGRADE'
            ? (readStringField(block.fields, ['GrantScience'])?.trim().toUpperCase() ?? '')
            : '';
          const radarIsDisableProof = moduleType === 'RADARUPGRADE'
            ? readBooleanField(block.fields, ['DisableProof']) ?? false
            : false;
          const specialPowerTemplateName = moduleType === 'UNPAUSESPECIALPOWERUPGRADE'
            ? (readStringField(block.fields, ['SpecialPowerTemplate'])?.trim().toUpperCase() ?? '')
            : '';
          const moduleId = sourceUpgradeName === null
            ? `${moduleType}:${block.name}:${index}`
            : `${moduleType}:${block.name}:${index}:${sourceUpgradeName}`;
          index += 1;
          modules.push({
            id: moduleId,
            moduleType,
            sourceUpgradeName,
            triggeredBy,
            conflictsWith,
            removesUpgrades,
            requiresAllTriggers,
            addMaxHealth,
            maxHealthChangeType,
            statusToSet,
            statusToClear,
            commandSetName: commandSetName && commandSetName !== 'NONE' ? commandSetName : null,
            commandSetAltName: commandSetAltName && commandSetAltName !== 'NONE' ? commandSetAltName : null,
            commandSetAltTriggerUpgrade,
            effectKindOf,
            effectPercent,
            grantScienceName,
            radarIsDisableProof,
            specialPowerTemplateName,
          });
        }
        // TODO(C&C source parity): port additional UpgradeModule types beyond
        // ArmorSet/WeaponSet/CommandSet/StatusBits/Locomotor/MaxHealth/CostModifier/
        // GrantScience/UnpauseSpecialPower upgrades.
        // PowerPlantUpgrade and RadarUpgrade are wired here, and
        // TODO(source parity): port additional modules (for example
        // Overcharge/WeaponOverride variants) when needed.
      }

      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const block of blocks) {
      visitBlock(block);
    }

    return modules;
  }

  private applyUnpauseSpecialPowerUpgradeModule(
    entity: MapEntity,
    module: UpgradeModuleProfile,
  ): boolean {
    const specialPowerTemplateName = module.specialPowerTemplateName.trim().toUpperCase();
    if (!specialPowerTemplateName) {
      return false;
    }

    let isSharedSynced = false;
    const registry = this.iniDataRegistry;
    if (registry !== null) {
      const specialPowerDef = registry.getSpecialPower(specialPowerTemplateName);
      if (specialPowerDef) {
        isSharedSynced = readBooleanField(specialPowerDef.fields, ['SharedSyncedTimer']) === true;
      }
    }

    // Source parity: UnpauseSpecialPowerUpgrade::upgradeImplementation() calls
    // pauseCountdown(FALSE) on the matching SpecialPowerModule.
    this.setSpecialPowerReadyFrame(specialPowerTemplateName, entity.id, isSharedSynced, this.frameCounter);
    return true;
  }

  private applyCostModifierUpgradeModule(entity: MapEntity, module: UpgradeModuleProfile): boolean {
    const side = this.normalizeSide(entity.side);
    if (!side) {
      return false;
    }

    // Source parity: CostModifierUpgrade.cpp calls Player::addKindOfProductionCostChange on upgrade completion.
    this.applyCostModifierUpgradeToSide(side, module);
    return true;
  }

  private applyCostModifierUpgradeToSide(side: string, module: UpgradeModuleProfile): void {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return;
    }

    // Source parity: Player::addKindOfProductionCostChange updates a refcounted side production list.
    const modifiers = this.getSideKindOfProductionCostModifiers(normalizedSide);
    const existingModifier = modifiers.find((modifier) => (
      modifier.multiplier === module.effectPercent
      && this.areKindOfTokenSetsEquivalent(modifier.kindOf, module.effectKindOf)
    ));
    if (existingModifier) {
      existingModifier.refCount += 1;
      return;
    }
    modifiers.push({
      kindOf: new Set(module.effectKindOf),
      multiplier: module.effectPercent,
      refCount: 1,
    });
  }

  private removeCostModifierUpgradeFromSide(side: string, module: UpgradeModuleProfile): void {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return;
    }

    const modifiers = this.getSideKindOfProductionCostModifiers(normalizedSide);
    const index = modifiers.findIndex((modifier) => (
      modifier.multiplier === module.effectPercent
      && this.areKindOfTokenSetsEquivalent(modifier.kindOf, module.effectKindOf)
    ));
    if (index < 0) {
      return;
    }

    // Source parity: Player::removeKindOfProductionCostChange decrements refcount and removes at zero.
    const modifier = modifiers[index];
    modifier.refCount -= 1;
    if (modifier.refCount <= 0) {
      modifiers.splice(index, 1);
    }
  }

  private removeCostModifierUpgradeFromEntity(entity: MapEntity, module: UpgradeModuleProfile): void {
    const side = this.normalizeSide(entity.side);
    if (!side) {
      return;
    }
    this.removeCostModifierUpgradeFromSide(side, module);
  }

  private transferCostModifierUpgradesBetweenSides(entity: MapEntity, oldSide: string, newSide: string): void {
    const normalizedOldSide = this.normalizeSide(oldSide);
    const normalizedNewSide = this.normalizeSide(newSide);
    if (!normalizedOldSide || !normalizedNewSide || normalizedOldSide === normalizedNewSide) {
      return;
    }
    this.transferCostModifierUpgradesBetweenSidesForCapture(entity, normalizedOldSide, normalizedNewSide);
  }

  private transferCostModifierUpgradesBetweenSidesForCapture(
    entity: MapEntity,
    oldSide: string,
    newSide: string,
  ): void {
    if (!oldSide || !newSide || oldSide === newSide) {
      return;
    }

    // Source parity: Object::onCapture invokes each upgrade module's onCapture. For
    // COSTMODIFIERUPGRADE, this means removing side effects from the old owner and
    // re-applying them to the new owner while the upgrade is active.
    for (const module of entity.upgradeModules) {
      if (module.moduleType !== 'COSTMODIFIERUPGRADE') {
        continue;
      }
      if (!entity.executedUpgradeModules.has(module.id)) {
        continue;
      }
      this.removeCostModifierUpgradeFromSide(oldSide, module);
      this.applyCostModifierUpgradeToSide(newSide, module);
    }
  }

  private transferPowerPlantUpgradesBetweenSides(entity: MapEntity, oldSide: string, newSide: string): void {
    const normalizedOldSide = this.normalizeSide(oldSide);
    const normalizedNewSide = this.normalizeSide(newSide);
    if (!normalizedOldSide || !normalizedNewSide || normalizedOldSide === normalizedNewSide) {
      return;
    }
    this.transferPowerPlantUpgradesBetweenSidesForCapture(entity, normalizedOldSide, normalizedNewSide);
  }

  private transferPowerPlantUpgradesBetweenSidesForCapture(
    entity: MapEntity,
    oldSide: string,
    newSide: string,
  ): void {
    if (!oldSide || !newSide || oldSide === newSide) {
      return;
    }

    // Source parity: Object::onCapture invokes power-plant upgrade modules to move
    // production bonus ownership from old owner to new owner while upgrade remains active.
    for (const module of entity.upgradeModules) {
      if (module.moduleType !== 'POWERPLANTUPGRADE') {
        continue;
      }
      if (!entity.executedUpgradeModules.has(module.id)) {
        continue;
      }
      this.removePowerPlantUpgradeFromSide(oldSide, entity);
      this.applyPowerPlantUpgradeToSide(newSide, module, entity);
    }
  }

  private transferRadarUpgradesBetweenSides(entity: MapEntity, oldSide: string, newSide: string): void {
    const normalizedOldSide = this.normalizeSide(oldSide);
    const normalizedNewSide = this.normalizeSide(newSide);
    if (!normalizedOldSide || !normalizedNewSide || normalizedOldSide === normalizedNewSide) {
      return;
    }
    this.transferRadarUpgradesBetweenSidesForCapture(entity, normalizedOldSide, normalizedNewSide);
  }

  private transferRadarUpgradesBetweenSidesForCapture(
    entity: MapEntity,
    oldSide: string,
    newSide: string,
  ): void {
    if (!oldSide || !newSide || oldSide === newSide) {
      return;
    }

    // Source parity: Object::onCapture invokes radar-upgrade modules to transfer
    // radar ownership while preserving disable-proof counts.
    for (const module of entity.upgradeModules) {
      if (module.moduleType !== 'RADARUPGRADE') {
        continue;
      }
      if (!entity.executedUpgradeModules.has(module.id)) {
        continue;
      }
      this.removeRadarUpgradeFromSide(oldSide, module);
      this.applyRadarUpgradeToSide(newSide, module);
    }
  }

  private applyGrantScienceUpgradeModule(entity: MapEntity, module: UpgradeModuleProfile): boolean {
    const side = this.normalizeSide(entity.side);
    if (!side || !module.grantScienceName || module.grantScienceName === 'NONE') {
      return false;
    }

    // Source parity: GrantScienceUpgrade.cpp translates the configured science name to
    // a science type and invokes Player::grantScience().
    return this.grantSideScience(side, module.grantScienceName);
  }

  private applyKindOfProductionCostModifiers(buildCost: number, side: string, kindOf: Set<string>): number {
    if (!Number.isFinite(buildCost) || buildCost < 0) {
      return 0;
    }
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide || kindOf.size === 0) {
      return buildCost;
    }

    let nextCost = buildCost;
    for (const modifier of this.getSideKindOfProductionCostModifiers(normalizedSide)) {
      if (modifier.kindOf.size === 0) {
        continue;
      }

      let matchesKindOf = false;
      for (const kindOfToken of modifier.kindOf) {
        if (kindOf.has(kindOfToken)) {
          matchesKindOf = true;
          break;
        }
      }

      if (!matchesKindOf) {
        continue;
      }

      nextCost *= 1 + modifier.multiplier;
    }

    return nextCost;
  }

  private areKindOfTokenSetsEquivalent(left: Set<string>, right: Set<string>): boolean {
    if (left.size !== right.size) {
      return false;
    }
    for (const token of left) {
      if (!right.has(token)) {
        return false;
      }
    }
    return true;
  }

  private applyPowerPlantUpgradeModule(entity: MapEntity, module: UpgradeModuleProfile): boolean {
    const side = this.normalizeSide(entity.side);
    if (!side) {
      return false;
    }
    // TODO(source parity): skip add/remove when object is disabled (Player::isDisabled checks).
    this.applyPowerPlantUpgradeToSide(side, module, entity);
    return true;
  }

  private applyPowerPlantUpgradeToSide(
    side: string,
    module: UpgradeModuleProfile,
    entity: MapEntity,
  ): void {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return;
    }

    // Source parity: PowerPlantUpgrade.cpp adds energy from the templated object.
    const bonus = Number.isFinite(entity.energyBonus) ? entity.energyBonus : 0;
    const sideState = this.getSidePowerStateMap(normalizedSide);
    sideState.powerBonus += bonus;
  }

  private removePowerPlantUpgradeFromEntity(entity: MapEntity, module: UpgradeModuleProfile): void {
    const side = this.normalizeSide(entity.side);
    if (!side) {
      return;
    }
    this.removePowerPlantUpgradeFromSide(side, entity);
  }

  private removePowerPlantUpgradeFromSide(
    side: string,
    entity: MapEntity,
  ): void {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return;
    }

    // Source parity: PowerPlantUpgrade.cpp mirrors removePowerBonus() on upgrade removal/capture.
    const bonus = Number.isFinite(entity.energyBonus) ? entity.energyBonus : 0;
    const sideState = this.getSidePowerStateMap(normalizedSide);
    sideState.powerBonus -= bonus;
    if (sideState.powerBonus <= 0) {
      this.sidePowerBonus.delete(normalizedSide);
    }
  }

  private applyRadarUpgradeModule(entity: MapEntity, module: UpgradeModuleProfile): boolean {
    const side = this.normalizeSide(entity.side);
    if (!side) {
      return false;
    }
    // TODO(source parity): skip add/remove when object is disabled (onDisabled checks).
    this.applyRadarUpgradeToSide(side, module);
    return true;
  }

  private applyRadarUpgradeToSide(side: string, module: UpgradeModuleProfile): void {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return;
    }

    const state = this.getSideRadarStateMap(normalizedSide);
    state.radarCount += 1;
    if (module.radarIsDisableProof) {
      state.disableProofRadarCount += 1;
    }
  }

  private removeRadarUpgradeFromEntity(entity: MapEntity, module: UpgradeModuleProfile): void {
    const side = this.normalizeSide(entity.side);
    if (!side) {
      return;
    }
    this.removeRadarUpgradeFromSide(side, module);
  }

  private removeRadarUpgradeFromSide(side: string, module: UpgradeModuleProfile): void {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return;
    }

    const state = this.getSideRadarStateMap(normalizedSide);
    state.radarCount = Math.max(0, state.radarCount - 1);
    if (module.radarIsDisableProof) {
      state.disableProofRadarCount = Math.max(0, state.disableProofRadarCount - 1);
    }
    if (state.radarCount <= 0 && state.disableProofRadarCount <= 0) {
      this.sideRadarState.delete(normalizedSide);
    }
  }

  private canExecuteUpgradeModule(
    entity: MapEntity,
    module: UpgradeModuleProfile,
    upgradeMask?: ReadonlySet<string>,
  ): boolean {
    const maskToCheck = upgradeMask ?? this.buildEntityUpgradeMask(entity);
    return this.wouldUpgradeModuleWithMask(entity, module, maskToCheck, true);
  }

  private canRemainActiveUpgradeModule(
    entity: MapEntity,
    module: UpgradeModuleProfile,
    upgradeMask: ReadonlySet<string>,
  ): boolean {
    // Source parity: upgrade removals and command-set refresh evaluate whether a module
    // stays active under current prerequisites without excluding modules already in the
    // executed set.
    return this.wouldUpgradeModuleWithMask(entity, module, upgradeMask, false);
  }

  private entityHasUpgrade(entity: MapEntity, upgradeName: string): boolean {
    const normalizedUpgrade = upgradeName.trim().toUpperCase();
    if (!normalizedUpgrade || normalizedUpgrade === 'NONE') {
      return false;
    }

    if (entity.completedUpgrades.has(normalizedUpgrade)) {
      return true;
    }

    const side = this.normalizeSide(entity.side);
    if (!side) {
      return false;
    }
    return this.getSideUpgradeSet(this.sideCompletedUpgrades, side).has(normalizedUpgrade);
  }

  private buildEntityUpgradeMask(entity: MapEntity, additionalUpgradeName?: string): Set<string> {
    const upgradeMask = new Set<string>();
    for (const upgradeName of entity.completedUpgrades) {
      upgradeMask.add(upgradeName);
    }

    const side = this.normalizeSide(entity.side);
    if (side) {
      for (const sideUpgrade of this.getSideUpgradeSet(this.sideCompletedUpgrades, side)) {
        upgradeMask.add(sideUpgrade);
      }
    }

    const normalizedAdditional = additionalUpgradeName?.trim().toUpperCase();
    if (normalizedAdditional && normalizedAdditional !== 'NONE') {
      upgradeMask.add(normalizedAdditional);
    }

    return upgradeMask;
  }

  private wouldUpgradeModuleWithMask(
    entity: MapEntity,
    module: UpgradeModuleProfile,
    upgradeMask: ReadonlySet<string>,
    skipExecutedGate: boolean,
  ): boolean {
    // Source parity: GeneralsMD's UpgradeMux::wouldUpgrade requires both activation and key masks
    // to be non-empty before considering triggers, and refuses re-running an already executed module.
    if (skipExecutedGate && entity.executedUpgradeModules.has(module.id)) {
      return false;
    }

    for (const conflictingUpgrade of module.conflictsWith) {
      if (upgradeMask.has(conflictingUpgrade)) {
        return false;
      }
    }

    if (module.requiresAllTriggers) {
      for (const activationUpgrade of module.triggeredBy) {
        if (!upgradeMask.has(activationUpgrade)) {
          return false;
        }
      }
      return true;
    }

    for (const activationUpgrade of module.triggeredBy) {
      if (upgradeMask.has(activationUpgrade)) {
        return true;
      }
    }

    return false;
  }


  private isEntityAffectedByUpgrade(entity: MapEntity, upgradeName: string): boolean {
    const normalizedUpgrade = upgradeName.trim().toUpperCase();
    if (!normalizedUpgrade || normalizedUpgrade === 'NONE') {
      return false;
    }

    const maskToCheck = this.buildEntityUpgradeMask(entity, normalizedUpgrade);
    for (const module of entity.upgradeModules) {
      if (this.wouldUpgradeModuleWithMask(entity, module, maskToCheck, false)) {
        return true;
      }
    }

    return false;
  }

  private applyMaxHealthUpgrade(
    entity: MapEntity,
    addMaxHealth: number,
    changeType: MaxHealthChangeTypeName,
  ): boolean {
    if (!Number.isFinite(addMaxHealth) || addMaxHealth === 0) {
      return false;
    }

    const previousMaxHealth = entity.maxHealth;
    const nextMaxHealth = Math.max(0, previousMaxHealth + addMaxHealth);
    entity.maxHealth = nextMaxHealth;

    switch (changeType) {
      case 'PRESERVE_RATIO': {
        if (previousMaxHealth > 0) {
          entity.health = nextMaxHealth * (entity.health / previousMaxHealth);
        }
        break;
      }
      case 'ADD_CURRENT_HEALTH_TOO':
        entity.health += nextMaxHealth - previousMaxHealth;
        break;
      case 'SAME_CURRENTHEALTH':
      default:
        break;
    }

    if (entity.health > entity.maxHealth) {
      entity.health = entity.maxHealth;
    }
    if (entity.health < 0) {
      entity.health = 0;
    }
    entity.canTakeDamage = entity.maxHealth > 0;
    return true;
  }

  private applyArmorUpgrade(entity: MapEntity): boolean {
    entity.armorSetFlagsMask |= ARMOR_SET_FLAG_PLAYER_UPGRADE;
    this.refreshEntityCombatProfiles(entity);
    return true;
  }

  private applyWeaponSetUpgrade(entity: MapEntity): boolean {
    entity.weaponSetFlagsMask |= WEAPON_SET_FLAG_PLAYER_UPGRADE;
    this.refreshEntityCombatProfiles(entity);
    return true;
  }

  // Source parity: WeaponBonusUpgrade.cpp sets WEAPONBONUSCONDITION_PLAYER_UPGRADE,
  // which maps to WEAPON_SET_FLAG_PLAYER_UPGRADE in this port's weapon-set selection.
  private applyWeaponBonusUpgrade(entity: MapEntity): boolean {
    entity.weaponSetFlagsMask |= WEAPON_SET_FLAG_PLAYER_UPGRADE;
    this.refreshEntityCombatProfiles(entity);
    return true;
  }

  // Source parity: StealthUpgrade.cpp sets OBJECT_STATUS_CAN_STEALTH.
  private applyStealthUpgrade(entity: MapEntity): boolean {
    entity.objectStatusFlags.add('CAN_STEALTH');
    return true;
  }

  private applyCommandSetUpgrade(entity: MapEntity, module: UpgradeModuleProfile): boolean {
    const targetCommandSetName = this.resolveCommandSetUpgradeTarget(entity, module);
    entity.commandSetStringOverride = targetCommandSetName;
    return true;
  }

  private resolveCommandSetUpgradeTarget(entity: MapEntity, module: UpgradeModuleProfile): string | null {
    let targetCommandSetName = module.commandSetName;
    if (
      module.commandSetAltTriggerUpgrade
      && this.entityHasUpgrade(entity, module.commandSetAltTriggerUpgrade)
    ) {
      targetCommandSetName = module.commandSetAltName;
    }

    if (!targetCommandSetName || targetCommandSetName === 'NONE') {
      return null;
    }
    return targetCommandSetName;
  }

  private refreshEntityCommandSetOverride(entity: MapEntity): void {
    let commandSetName: string | null = null;
    const upgradeMask = this.buildEntityUpgradeMask(entity);
    for (const module of entity.upgradeModules) {
      if (module.moduleType !== 'COMMANDSETUPGRADE' || !entity.executedUpgradeModules.has(module.id)) {
        continue;
      }

      if (!this.canRemainActiveUpgradeModule(entity, module, upgradeMask)) {
        continue;
      }

      commandSetName = this.resolveCommandSetUpgradeTarget(entity, module);
    }

    entity.commandSetStringOverride = commandSetName;
  }

  private applyStatusBitsUpgrade(entity: MapEntity, module: UpgradeModuleProfile): boolean {
    let changed = false;
    for (const statusName of module.statusToSet) {
      if (!entity.objectStatusFlags.has(statusName)) {
        entity.objectStatusFlags.add(statusName);
        changed = true;
      }
    }

    for (const statusName of module.statusToClear) {
      if (entity.objectStatusFlags.delete(statusName)) {
        changed = true;
      }
    }

    // TODO(C&C source parity): map ObjectStatus bits to their full simulation side-effects
    // (disabled/under-construction/targetability/pathing) instead of tracking names only.
    return changed || module.statusToSet.size > 0 || module.statusToClear.size > 0;
  }

  private removeWeaponBonusUpgradeFromEntity(entity: MapEntity): void {
    // Recompute weapon-set flags from all currently active modules so that removing
    // one WEAPONBONUSUPGRADE does not clear a remaining WEAPONSETUPGRADE source.
    entity.weaponSetFlagsMask &= ~WEAPON_SET_FLAG_PLAYER_UPGRADE;
    for (const module of entity.upgradeModules) {
      if (!entity.executedUpgradeModules.has(module.id)) {
        continue;
      }
      if (module.moduleType === 'WEAPONSETUPGRADE' || module.moduleType === 'WEAPONBONUSUPGRADE') {
        entity.weaponSetFlagsMask |= WEAPON_SET_FLAG_PLAYER_UPGRADE;
        break;
      }
    }
    this.refreshEntityCombatProfiles(entity);
  }

  private removeStealthUpgradeFromEntity(entity: MapEntity): void {
    // Keep CAN_STEALTH active if any other STEALTHUPGRADE module remains executed.
    entity.objectStatusFlags.delete('CAN_STEALTH');
    for (const module of entity.upgradeModules) {
      if (!entity.executedUpgradeModules.has(module.id)) {
        continue;
      }
      if (module.moduleType === 'STEALTHUPGRADE') {
        entity.objectStatusFlags.add('CAN_STEALTH');
        break;
      }
    }
  }

  private removeLocomotorUpgradeFromEntity(entity: MapEntity): void {
    // Source parity: LocomotorSetUpgrade removal should restore base locomotor state when
    // the source object-upgrade mask is no longer present.
    this.setEntityLocomotorUpgrade(entity.id, false);
  }

  private removeStatusBitsUpgradeFromEntity(entity: MapEntity): void {
    const controlledStatuses = new Set<string>();
    for (const module of entity.upgradeModules) {
      if (
        !entity.executedUpgradeModules.has(module.id)
        || module.moduleType !== 'STATUSBITSUPGRADE'
      ) {
        continue;
      }
      for (const statusName of module.statusToSet) {
        controlledStatuses.add(statusName);
      }
      for (const statusName of module.statusToClear) {
        controlledStatuses.add(statusName);
      }
    }

    for (const statusName of controlledStatuses) {
      entity.objectStatusFlags.delete(statusName);
    }

    for (const module of entity.upgradeModules) {
      if (!entity.executedUpgradeModules.has(module.id) || module.moduleType !== 'STATUSBITSUPGRADE') {
        continue;
      }
      this.applyStatusBitsUpgrade(entity, module);
    }
  }

  private processUpgradeModuleRemovals(entity: MapEntity, module: UpgradeModuleProfile): void {
    for (const upgradeName of module.removesUpgrades) {
      this.removeEntityUpgrade(entity, upgradeName);
    }
  }

  private removeEntityUpgrade(entity: MapEntity, upgradeName: string): void {
    const normalizedUpgrade = upgradeName.trim().toUpperCase();
    if (!normalizedUpgrade || normalizedUpgrade === 'NONE') {
      return;
    }

    entity.completedUpgrades.delete(normalizedUpgrade);
    const upgradeMask = this.buildEntityUpgradeMask(entity);
    for (const module of entity.upgradeModules) {
      if (!entity.executedUpgradeModules.has(module.id)) {
        continue;
      }

      if (this.canRemainActiveUpgradeModule(entity, module, upgradeMask)) {
        continue;
      }

      entity.executedUpgradeModules.delete(module.id);
      if (module.moduleType === 'COSTMODIFIERUPGRADE') {
        this.removeCostModifierUpgradeFromEntity(entity, module);
      } else if (module.moduleType === 'POWERPLANTUPGRADE') {
        this.removePowerPlantUpgradeFromEntity(entity, module);
      } else if (module.moduleType === 'RADARUPGRADE') {
        this.removeRadarUpgradeFromEntity(entity, module);
      } else if (module.moduleType === 'LOCOMOTORSETUPGRADE') {
        this.removeLocomotorUpgradeFromEntity(entity);
      } else if (module.moduleType === 'WEAPONBONUSUPGRADE') {
        this.removeWeaponBonusUpgradeFromEntity(entity);
      } else if (module.moduleType === 'STEALTHUPGRADE') {
        this.removeStealthUpgradeFromEntity(entity);
      } else if (module.moduleType === 'COMMANDSETUPGRADE') {
        // Side effect is recomputed from remaining executable command-set modules.
      } else if (module.moduleType === 'STATUSBITSUPGRADE') {
        this.removeStatusBitsUpgradeFromEntity(entity);
      } else if (module.moduleType === 'PASSENGERSFIREUPGRADE') {
        // Source parity for PassengersFireUpgrade: when the upgrade is removed, restore
        // container firing permission to its configured baseline unless another active
        // PassengersFireUpgrade still applies.
        const hasOtherPassengerFireUpgrade = entity.upgradeModules.some(
          (executedModule) => executedModule.moduleType === 'PASSENGERSFIREUPGRADE'
            && entity.executedUpgradeModules.has(executedModule.id),
        );
        if (!hasOtherPassengerFireUpgrade && entity.containProfile) {
          entity.containProfile.passengersAllowedToFire = entity.containProfile.passengersAllowedToFireDefault;
        }
      } else if (module.moduleType === 'UNPAUSESPECIALPOWERUPGRADE') {
        // Source parity: UnpauseSpecialPowerUpgrade is an instantaneous cooldown-release action,
        // so no persistent entity-side state needs removal here.
      }
    }

    this.refreshEntityCommandSetOverride(entity);

    // Source parity: Object::removeUpgrade calls UpgradeModule::resetUpgrade(removedUpgradeMask)
    // on all behavior modules; this loop mirrors that behavior by clearing modules whose
    // trigger mask no longer matches the current upgrade mask.
  }

  private entityHasObjectStatus(entity: MapEntity, statusName: string): boolean {
    const normalizedStatusName = this.normalizeObjectStatusName(statusName);
    if (!normalizedStatusName) {
      return false;
    }
    return entity.objectStatusFlags.has(normalizedStatusName);
  }

  private canEntityAttackFromStatus(entity: MapEntity): boolean {
    // Source parity: GeneralsMD Object::isAbleToAttack() early-outs on OBJECT_STATUS_NO_ATTACK,
    // OBJECT_STATUS_UNDER_CONSTRUCTION, and OBJECT_STATUS_SOLD.
    if (this.entityHasObjectStatus(entity, 'NO_ATTACK')) {
      return false;
    }
    if (this.entityHasObjectStatus(entity, 'UNDER_CONSTRUCTION')) {
      return false;
    }
    if (this.entityHasObjectStatus(entity, 'SOLD')) {
      return false;
    }

    // Source parity: GeneralsMD Object::isAbleToAttack() adds DISABLED_SUBDUED guard.
    // - Portable structures and spawned-weapon units are also blocked while
    //   DISABLED_HACKED or DISABLED_EMP (see Object.cpp).
    if (this.entityHasObjectStatus(entity, 'DISABLED_SUBDUED')) {
      return false;
    }
    const containingEntity = this.resolveEntityContainingObject(entity);
    const kindOf = this.resolveEntityKindOfSet(entity);
    const isPortableOrSpawnWeaponUnit = kindOf.has('PORTABLE_STRUCTURE') || kindOf.has('SPAWNS_ARE_THE_WEAPONS');
    if (isPortableOrSpawnWeaponUnit && (
      this.entityHasObjectStatus(entity, 'DISABLED_HACKED')
      || this.entityHasObjectStatus(entity, 'DISABLED_EMP')
    )) {
      return false;
    }
    if (containingEntity && !this.isPassengerAllowedToFireFromContainingObject(entity, containingEntity)) {
      // Source parity: GeneralsMD/Object.cpp checks contain modules via
      // getContainedBy()->getContain()->isPassengerAllowedToFire().
      return false;
    }
    if (isPortableOrSpawnWeaponUnit && kindOf.has('INFANTRY')) {
      // Source parity: GeneralsMD/Object.cpp checks SlavedUpdateInterface for spawned
      // infantry and blocks attacks when the linked slaver is DISABLED_SUBDUED.
      // TODO(C&C source parity): port generic slaver linkage outside of queue-produced
      // spawn relationship once SpawnBehavior/MobMemberSlavedUpdate state is represented.
      if (
        containingEntity
        && this.entityHasObjectStatus(containingEntity, 'DISABLED_SUBDUED')
      ) {
        return false;
      }
    }

    // TODO(C&C source parity): containment fire rules and
    // turret-availability/AI module checks are intentionally deferred because they
    // require fully modeling source AI + weapon module internals.
    return true;
  }

  private isEntityStealthedAndUndetected(entity: MapEntity): boolean {
    return (
      this.entityHasObjectStatus(entity, 'STEALTHED')
      && !this.entityHasObjectStatus(entity, 'DETECTED')
      && !this.entityHasObjectStatus(entity, 'DISGUISED')
    );
  }

  private isEntityOffMap(entity: MapEntity): boolean {
    const heightmap = this.mapHeightmap;
    if (!heightmap) {
      return false;
    }

    // Source parity subset: PartitionFilterSameMapStatus compares Object::isOffMap() between
    // attacker and candidate. This port infers off-map status from current world position.
    return (
      entity.mesh.position.x < 0
      || entity.mesh.position.z < 0
      || entity.mesh.position.x >= heightmap.worldWidth
      || entity.mesh.position.z >= heightmap.worldDepth
    );
  }

  private canAttackerTargetEntity(
    attacker: MapEntity,
    target: MapEntity,
    commandSource: AttackCommandSource,
  ): boolean {
    if (!target.canTakeDamage || target.destroyed) {
      return false;
    }
    if (this.entityHasObjectStatus(target, 'MASKED')) {
      return false;
    }
    if (commandSource === 'AI' && this.entityHasObjectStatus(target, 'NO_ATTACK_FROM_AI')) {
      return false;
    }
    const targetKindOf = this.resolveEntityKindOfSet(target);
    if (targetKindOf.has('UNATTACKABLE')) {
      return false;
    }
    if (this.getTeamRelationship(attacker, target) !== RELATIONSHIP_ENEMIES) {
      return false;
    }
    if (this.isEntityOffMap(attacker) !== this.isEntityOffMap(target)) {
      return false;
    }
    if (
      !this.entityHasObjectStatus(attacker, 'IGNORING_STEALTH')
      && this.isEntityStealthedAndUndetected(target)
    ) {
      return false;
    }

    // TODO(C&C source parity): mirror full WeaponSet::getAbleToAttackSpecificObject rules
    // (force-attack/same-owner exceptions, disguised disguiser handling,
    // full Object::isOffMap private-status parity, and fog/shroud constraints).
    return true;
  }

  private refreshEntityCombatProfiles(entity: MapEntity): void {
    const registry = this.iniDataRegistry;
    if (!registry) {
      return;
    }

    const previousWeapon = entity.attackWeapon;
    entity.attackWeapon = this.resolveAttackWeaponProfileForSetSelection(
      entity.weaponTemplateSets,
      entity.weaponSetFlagsMask,
      registry,
    );
    entity.largestWeaponRange = this.resolveLargestWeaponRangeForSetSelection(
      entity.weaponTemplateSets,
      entity.weaponSetFlagsMask,
      registry,
    );
    entity.armorDamageCoefficients = this.resolveArmorDamageCoefficientsForSetSelection(
      entity.armorTemplateSets,
      entity.armorSetFlagsMask,
      registry,
    );

    const nextWeapon = entity.attackWeapon;
    const scatterTargetPatternChanged = (() => {
      if (!previousWeapon || !nextWeapon) {
        return previousWeapon !== nextWeapon;
      }
      if (previousWeapon.scatterTargets.length !== nextWeapon.scatterTargets.length) {
        return true;
      }
      for (let index = 0; index < previousWeapon.scatterTargets.length; index += 1) {
        const previousTarget = previousWeapon.scatterTargets[index];
        const nextTarget = nextWeapon.scatterTargets[index];
        if (!previousTarget || !nextTarget) {
          return true;
        }
        if (previousTarget.x !== nextTarget.x || previousTarget.z !== nextTarget.z) {
          return true;
        }
      }
      return false;
    })();
    const weaponChanged = previousWeapon?.name !== nextWeapon?.name
      || previousWeapon?.clipSize !== nextWeapon?.clipSize
      || previousWeapon?.clipReloadFrames !== nextWeapon?.clipReloadFrames
      || previousWeapon?.autoReloadWhenIdleFrames !== nextWeapon?.autoReloadWhenIdleFrames
      || previousWeapon?.preAttackDelayFrames !== nextWeapon?.preAttackDelayFrames
      || previousWeapon?.preAttackType !== nextWeapon?.preAttackType
      || previousWeapon?.projectileObjectName !== nextWeapon?.projectileObjectName
      || previousWeapon?.scatterTargetScalar !== nextWeapon?.scatterTargetScalar
      || previousWeapon?.minWeaponSpeed !== nextWeapon?.minWeaponSpeed
      || previousWeapon?.scaleWeaponSpeed !== nextWeapon?.scaleWeaponSpeed
      || previousWeapon?.continueAttackRange !== nextWeapon?.continueAttackRange
      || previousWeapon?.unmodifiedAttackRange !== nextWeapon?.unmodifiedAttackRange
      || scatterTargetPatternChanged;
    if (weaponChanged) {
      this.resetEntityWeaponTimingState(entity);
      // TODO(C&C source parity): preserve per-slot runtime weapon state when sets change,
      // instead of resetting timing/clip state on profile refresh.
    }
  }

  private msToLogicFrames(milliseconds: number): number {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
      return 0;
    }
    return Math.max(1, Math.ceil(milliseconds / LOGIC_FRAME_MS));
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
    const normalized = Math.trunc(playerIndex);
    if (normalized < 0) {
      return null;
    }
    return normalized;
  }

  private relationshipValueToLabel(relationship: number): EntityRelationship {
    if (relationship === RELATIONSHIP_ENEMIES) {
      return 'enemies';
    }
    if (relationship === RELATIONSHIP_ALLIES) {
      return 'allies';
    }
    return 'neutral';
  }

  private normalizeShortcutSpecialPowerName(specialPowerName: string): string | null {
    const normalized = specialPowerName.trim().toUpperCase();
    return normalized || null;
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

  private normalizeControllingPlayerToken(token?: string): string | null {
    if (!token) {
      return null;
    }
    const normalized = token.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private resolveMapObjectControllingPlayerToken(mapObject: MapObjectJSON): string | null {
    for (const [key, value] of Object.entries(mapObject.properties)) {
      if (key.trim().toLowerCase() !== 'originalowner') {
        continue;
      }

      return this.normalizeControllingPlayerToken(value);
    }

    // TODO(C&C source parity): map-converter currently serializes map object property
    // keys as raw NameKey ids. Decode NameKey ids to well-known names and read
    // TheKey_originalOwner from numeric-key dictionary entries.
    return null;
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
        this.clearAttackTarget(command.entityId);
        this.issueMoveTo(command.entityId, command.targetX, command.targetZ);
        return;
      case 'attackMoveTo':
        this.clearAttackTarget(command.entityId);
        this.issueMoveTo(
          command.entityId,
          command.targetX,
          command.targetZ,
          command.attackDistance,
        );
        return;
      case 'guardPosition':
        this.clearAttackTarget(command.entityId);
        this.issueMoveTo(command.entityId, command.targetX, command.targetZ);
        return;
      case 'guardObject':
        this.issueAttackEntity(command.entityId, command.targetEntityId, 'PLAYER');
        return;
      case 'setRallyPoint':
        this.setEntityRallyPoint(command.entityId, command.targetX, command.targetZ);
        return;
      case 'attackEntity':
        this.issueAttackEntity(
          command.entityId,
          command.targetEntityId,
          command.commandSource ?? 'PLAYER',
        );
        return;
      case 'stop':
        this.clearAttackTarget(command.entityId);
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
      case 'captureEntity':
        this.captureEntity(command.entityId, command.newSide);
        return;
      case 'applyUpgrade':
        this.applyUpgradeToEntity(command.entityId, command.upgradeName);
        return;
      case 'queueUnitProduction':
        this.queueUnitProduction(command.entityId, command.unitTemplateName);
        return;
      case 'cancelUnitProduction':
        this.cancelUnitProduction(command.entityId, command.productionId);
        return;
      case 'queueUpgradeProduction':
        this.queueUpgradeProduction(command.entityId, command.upgradeName);
        return;
      case 'cancelUpgradeProduction':
        this.cancelUpgradeProduction(command.entityId, command.upgradeName);
        return;
      case 'setSideCredits':
        this.setSideCredits(command.side, command.amount);
        return;
      case 'addSideCredits':
        this.addSideCredits(command.side, command.amount);
        return;
      case 'setSidePlayerType':
        this.setSidePlayerType(command.side, command.playerType);
        return;
      case 'grantSideScience':
        this.grantSideScience(command.side, command.scienceName);
        return;
      case 'applyPlayerUpgrade': {
        const localSide = this.resolveLocalPlayerSide();
        if (!localSide) {
          return;
        }
        const normalizedUpgradeName = command.upgradeName.trim().toUpperCase();
        if (!normalizedUpgradeName) {
          return;
        }
        this.setSideUpgradeCompleted(localSide, normalizedUpgradeName, true);
        this.applyCompletedPlayerUpgrade(localSide, normalizedUpgradeName);
        return;
      }
      case 'purchaseScience': {
        const localSide = this.resolveLocalPlayerSide();
        if (!localSide) {
          return;
        }
        const normalizedScienceName = command.scienceName.trim().toUpperCase();
        if (!normalizedScienceName || normalizedScienceName === 'NONE') {
          return;
        }

        const registry = this.iniDataRegistry;
        if (!registry) {
          return;
        }

        const scienceDef = this.findScienceDefByName(registry, normalizedScienceName);
        if (!scienceDef) {
          return;
        }

        const normalizedScience = scienceDef.name.trim().toUpperCase();
        if (!normalizedScience || normalizedScience === 'NONE') {
          return;
        }

        const scienceCost = this.getPurchasableScienceCost(localSide, normalizedScience);
        if (scienceCost <= 0) {
          return;
        }
        if (!this.addScienceToSide(localSide, normalizedScience)) {
          return;
        }
        this.localPlayerSciencePurchasePoints = Math.max(
          0,
          this.localPlayerSciencePurchasePoints - scienceCost,
        );
        return;
      }
      case 'issueSpecialPower':
        this.routeIssueSpecialPowerCommand(command);
        return;
      default:
        return;
    }
  }

  private routeIssueSpecialPowerCommand(command: IssueSpecialPowerCommand): void {
    const registry = this.iniDataRegistry;
    if (!registry) {
      return;
    }

    const normalizedSpecialPowerName = command.specialPowerName.trim().toUpperCase();
    if (!normalizedSpecialPowerName) {
      return;
    }

    // Source parity: this only guards known/unknown special powers by INI definition lookup.
    // The actual execution path is intentionally TODO until module owners are fully wired.
    const specialPowerDef = registry.getSpecialPower(normalizedSpecialPowerName);
    if (!specialPowerDef) {
      return;
    }

    const reloadFrames = this.msToLogicFrames(readNumericField(specialPowerDef.fields, ['ReloadTime']) ?? 0);
    const isSharedSynced = readBooleanField(specialPowerDef.fields, ['SharedSyncedTimer']) === true;

    const sourceEntityId = this.resolveIssueSpecialPowerSourceEntityId(command, normalizedSpecialPowerName);
    if (sourceEntityId === null) {
      return;
    }

    const sourceEntity = this.spawnedEntities.get(sourceEntityId);
    if (!sourceEntity || sourceEntity.destroyed) {
      return;
    }

    // Source parity: shared special powers gate globally by power name; non-shared powers
    // gate per source entity via its tracked shortcut-ready frame.
    const canExecute = isSharedSynced
      ? this.frameCounter >= this.resolveSharedShortcutSpecialPowerReadyFrame(normalizedSpecialPowerName)
      : this.frameCounter >= this.resolveShortcutSpecialPowerSourceEntityReadyFrameBySource(
        normalizedSpecialPowerName,
        sourceEntityId,
      );
    if (!canExecute) {
      return;
    }

    const readyFrame = this.frameCounter + reloadFrames;

    const commandOption = Number.isFinite(command.commandOption) ? command.commandOption | 0 : 0;
    const needsObjectTarget = (commandOption & COMMAND_OPTION_NEED_OBJECT_TARGET) !== 0;
    const needsTargetPosition = (commandOption & COMMAND_OPTION_NEED_TARGET_POS) !== 0;

    if (needsObjectTarget) {
      if (!Number.isFinite(command.targetEntityId)) {
        return;
      }

      const targetEntity = this.spawnedEntities.get(Math.trunc(command.targetEntityId));
      if (!targetEntity || targetEntity.destroyed) {
        return;
      }

      if (!this.isSpecialPowerObjectRelationshipAllowed(commandOption, this.getTeamRelationship(sourceEntity, targetEntity))) {
        return;
      }

      this.onIssueSpecialPowerTargetObject(
        sourceEntity.id,
        normalizedSpecialPowerName,
        targetEntity.id,
        commandOption,
        command.commandButtonId,
        specialPowerDef,
      );

      this.setSpecialPowerReadyFrame(normalizedSpecialPowerName, sourceEntityId, isSharedSynced, readyFrame);
      return;
    }

    if (needsTargetPosition) {
      if (!Number.isFinite(command.targetX) || !Number.isFinite(command.targetZ)) {
        return;
      }

      const targetX = command.targetX as number;
      const targetZ = command.targetZ as number;
      this.onIssueSpecialPowerTargetPosition(
        sourceEntity.id,
        normalizedSpecialPowerName,
        targetX,
        targetZ,
        commandOption,
        command.commandButtonId,
        specialPowerDef,
      );

      this.setSpecialPowerReadyFrame(normalizedSpecialPowerName, sourceEntityId, isSharedSynced, readyFrame);
      return;
    }

      this.onIssueSpecialPowerNoTarget(
        sourceEntity.id,
        normalizedSpecialPowerName,
        commandOption,
        command.commandButtonId,
        specialPowerDef,
      );

      this.setSpecialPowerReadyFrame(normalizedSpecialPowerName, sourceEntityId, isSharedSynced, readyFrame);
  }

  private resolveSharedShortcutSpecialPowerReadyFrame(specialPowerName: string): number {
    const normalizedSpecialPowerName = this.normalizeShortcutSpecialPowerName(specialPowerName);
    if (!normalizedSpecialPowerName) {
      return this.frameCounter;
    }

    const sharedReadyFrame = this.sharedShortcutSpecialPowerReadyFrames.get(normalizedSpecialPowerName);
    if (!Number.isFinite(sharedReadyFrame)) {
      // Source parity: shared special powers are player-global and start at frame 0 (ready immediately)
      // unless explicitly started by prior usage.
      return this.frameCounter;
    }

    return Math.max(0, Math.trunc(sharedReadyFrame));
  }

  private resolveShortcutSpecialPowerSourceEntityReadyFrameBySource(
    specialPowerName: string,
    sourceEntityId: number,
  ): number {
    const normalizedSpecialPowerName = this.normalizeShortcutSpecialPowerName(specialPowerName);
    if (!normalizedSpecialPowerName || !Number.isFinite(sourceEntityId)) {
      return this.frameCounter;
    }

    const normalizedSourceEntityId = Math.trunc(sourceEntityId);
    const sourcesForPower = this.shortcutSpecialPowerSourceByName.get(normalizedSpecialPowerName);
    if (!sourcesForPower) {
      return this.frameCounter;
    }

    const readyFrame = sourcesForPower.get(normalizedSourceEntityId);
    if (!Number.isFinite(readyFrame)) {
      return this.frameCounter;
    }

    return Math.max(0, Math.trunc(readyFrame));
  }

  private setSpecialPowerReadyFrame(
    specialPowerName: string,
    sourceEntityId: number,
    isShared: boolean,
    readyFrame: number,
  ): void {
    const normalizedSpecialPowerName = this.normalizeShortcutSpecialPowerName(specialPowerName);
    if (!normalizedSpecialPowerName) {
      return;
    }

    if (!Number.isFinite(readyFrame)) {
      return;
    }

    const normalizedReadyFrame = Math.max(this.frameCounter, Math.trunc(readyFrame));
    if (isShared) {
      this.sharedShortcutSpecialPowerReadyFrames.set(normalizedSpecialPowerName, normalizedReadyFrame);
      return;
    }

    this.trackShortcutSpecialPowerSourceEntity(normalizedSpecialPowerName, sourceEntityId, normalizedReadyFrame);
  }

  private resolveIssueSpecialPowerSourceEntityId(
    command: IssueSpecialPowerCommand,
    normalizedSpecialPowerName: string,
  ): number | null {
    if (Number.isFinite(command.sourceEntityId)) {
      const explicitSourceEntityId = Math.trunc(command.sourceEntityId as number);
      const explicitSourceEntity = this.spawnedEntities.get(explicitSourceEntityId);
      if (explicitSourceEntity && !explicitSourceEntity.destroyed) {
        return explicitSourceEntityId;
      }
    }

    if (command.issuingEntityIds.length > 0) {
      for (const rawEntityId of command.issuingEntityIds) {
        if (!Number.isFinite(rawEntityId)) {
          continue;
        }
        const candidateId = Math.trunc(rawEntityId);
        const candidateEntity = this.spawnedEntities.get(candidateId);
        if (candidateEntity && !candidateEntity.destroyed) {
          return candidateId;
        }
      }
    }

    const shortcutSourceEntityId = this.resolveShortcutSpecialPowerSourceEntityId(normalizedSpecialPowerName);
    if (shortcutSourceEntityId !== null) {
      const shortcutSourceEntity = this.spawnedEntities.get(shortcutSourceEntityId);
      if (shortcutSourceEntity && !shortcutSourceEntity.destroyed) {
        return shortcutSourceEntityId;
      }
    }

    const selectedEntity = this.selectedEntityId !== null
      ? this.spawnedEntities.get(this.selectedEntityId)
      : null;
    if (selectedEntity && !selectedEntity.destroyed) {
      return selectedEntity.id;
    }

    return null;
  }

  private isSpecialPowerObjectRelationshipAllowed(
    commandOption: number,
    relationship: number,
  ): boolean {
    const requiresEnemy = (commandOption & COMMAND_OPTION_NEED_TARGET_ENEMY_OBJECT) !== 0;
    const requiresNeutral = (commandOption & COMMAND_OPTION_NEED_TARGET_NEUTRAL_OBJECT) !== 0;
    const requiresAlly = (commandOption & COMMAND_OPTION_NEED_TARGET_ALLY_OBJECT) !== 0;

    if (!requiresEnemy && !requiresNeutral && !requiresAlly) {
      return true;
    }

    if (requiresEnemy && relationship === RELATIONSHIP_ENEMIES) {
      return true;
    }
    if (requiresNeutral && relationship === RELATIONSHIP_NEUTRAL) {
      return true;
    }
    if (requiresAlly && relationship === RELATIONSHIP_ALLIES) {
      return true;
    }

    return false;
  }

  protected onIssueSpecialPowerNoTarget(
    sourceEntityId: number,
    specialPowerName: string,
    commandOption: number,
    commandButtonId: string,
    _specialPowerDef: SpecialPowerDef,
  ): void {
    void sourceEntityId;
    void specialPowerName;
    void commandOption;
    void commandButtonId;
    // Source parity: route to SpecialPower module/module owners (see:
    // GeneralsMD/Code/GameClient/GUI/ControlBar/ControlBarCommand.cpp around issueSpecialPowerCommand)
    // GeneralsMD/Code/GameClient/GUI/ControlBar/ControlBarCommandProcessing.cpp
    // For non-implemented execution paths, keep explicit TODO per source-compat policy.
  }

  protected onIssueSpecialPowerTargetPosition(
    sourceEntityId: number,
    specialPowerName: string,
    targetX: number,
    targetZ: number,
    commandOption: number,
    commandButtonId: string,
    _specialPowerDef: SpecialPowerDef,
  ): void {
    void sourceEntityId;
    void specialPowerName;
    void targetX;
    void targetZ;
    void commandOption;
    void commandButtonId;
    // Source parity: route to owner module update path.
    // Source candidates in GeneralsMD:
    // - SpecialPowerCommand with target-position path in ControlBarCommand::isValid/issue handling.
    // - SpecialPowerModule / SpecialPowerUpdate implementations (e.g. SpectreGunshipDeploymentUpdate.cpp).
  }

  protected onIssueSpecialPowerTargetObject(
    sourceEntityId: number,
    specialPowerName: string,
    targetEntityId: number,
    commandOption: number,
    commandButtonId: string,
    _specialPowerDef: SpecialPowerDef,
  ): void {
    void sourceEntityId;
    void specialPowerName;
    void targetEntityId;
    void commandOption;
    void commandButtonId;
    // Source parity: route to SpecialPower module owner for object-target execution.
    // TODO(source parity): replace this with full module dispatch from SpecialPowerTemplate lookup.
    // See GeneralsMD/Code/GameLogic/Object/SpecialPower/* for execution modules and
    // ControlBarCommand.cpp for object-target dispatch semantics.
  }

  private queueUnitProduction(entityId: number, unitTemplateName: string): boolean {
    const producer = this.spawnedEntities.get(entityId);
    if (!producer || producer.destroyed) {
      return false;
    }
    const productionProfile = producer.productionProfile;
    if (!productionProfile) {
      return false;
    }
    if (producer.productionQueue.length >= productionProfile.maxQueueEntries) {
      return false;
    }

    const registry = this.iniDataRegistry;
    if (!registry) {
      return false;
    }
    const unitDef = this.findObjectDefByName(registry, unitTemplateName);
    if (!unitDef) {
      return false;
    }

    const producerSide = this.normalizeSide(producer.side);
    if (!producerSide) {
      // TODO(C&C source parity): map producer ownership to full Player data instead of side-string buckets.
      return false;
    }

    if (!this.canSideBuildUnitTemplate(producerSide, unitDef)) {
      return false;
    }

    // Source parity: buildability/queue-limit checks must happen before spending money.
    const normalizedTemplateName = unitDef.name;
    const maxSimultaneousOfType = this.resolveMaxSimultaneousOfType(unitDef);
    if (maxSimultaneousOfType > 0) {
      const existingCount = this.countActiveEntitiesForMaxSimultaneousForSide(producerSide, unitDef);
      const queuedCount = this.isStructureObjectDef(unitDef)
        ? 0
        : this.countQueuedUnitsForMaxSimultaneousForSide(producerSide, unitDef);
      if (existingCount + queuedCount >= maxSimultaneousOfType) {
        return false;
      }
    }

    if (!this.hasAvailableParkingSpaceFor(producer, unitDef)) {
      return false;
    }

    // TODO(C&C source parity): add remaining BuildAssistant checks beyond parking capacity/door reservation.

    // TODO(C&C source parity): include ThingTemplate::calcCostToBuild modifiers (handicap, faction production cost changes).
    const buildCost = this.resolveObjectBuildCost(unitDef, producerSide);
    if (buildCost > this.getSideCredits(producerSide)) {
      return false;
    }
    const withdrawn = this.withdrawSideCredits(producerSide, buildCost);
    if (withdrawn < buildCost) {
      return false;
    }

    const totalProductionFrames = this.resolveObjectBuildTimeFrames(unitDef);
    const productionQuantityTotal = this.resolveProductionQuantity(producer, normalizedTemplateName);
    const productionId = producer.productionNextId++;

    producer.productionQueue.push({
      type: 'UNIT',
      templateName: normalizedTemplateName,
      productionId,
      buildCost,
      totalProductionFrames,
      framesUnderConstruction: 0,
      percentComplete: 0,
      productionQuantityTotal,
      productionQuantityProduced: 0,
    });

    if (!this.reserveParkingDoorForQueuedUnit(producer, unitDef, productionId)) {
      this.removeProductionEntry(producer, productionId);
      this.depositSideCredits(producer.side, buildCost);
      return false;
    }

    return true;
  }

  private hasAvailableParkingSpaceFor(producer: MapEntity, unitDef: ObjectDef): boolean {
    const parkingProfile = producer.parkingPlaceProfile;
    if (!parkingProfile) {
      return true;
    }

    if (!this.shouldReserveParkingDoorWhenQueued(unitDef)) {
      return true;
    }

    this.pruneParkingOccupancy(producer);
    this.pruneParkingReservations(producer);
    return (parkingProfile.occupiedSpaceEntityIds.size + parkingProfile.reservedProductionIds.size)
      < parkingProfile.totalSpaces;
  }

  private shouldReserveParkingDoorWhenQueued(unitDef: ObjectDef): boolean {
    // Source parity: ParkingPlaceBehavior::shouldReserveDoorWhenQueued() bypasses parking
    // reservation for KINDOF_PRODUCED_AT_HELIPAD units.
    return !this.normalizeKindOf(unitDef.kindOf).has('PRODUCED_AT_HELIPAD');
  }

  private reserveParkingDoorForQueuedUnit(
    producer: MapEntity,
    unitDef: ObjectDef,
    productionId: number,
  ): boolean {
    const parkingProfile = producer.parkingPlaceProfile;
    if (!parkingProfile) {
      return true;
    }

    if (!this.shouldReserveParkingDoorWhenQueued(unitDef)) {
      return true;
    }

    this.pruneParkingOccupancy(producer);
    this.pruneParkingReservations(producer);
    if ((parkingProfile.occupiedSpaceEntityIds.size + parkingProfile.reservedProductionIds.size) >= parkingProfile.totalSpaces) {
      return false;
    }

    // Source parity subset: ProductionUpdate::queueCreateUnit() reserves an exit door up front
    // via ParkingPlaceBehavior::reserveDoorForExit() for units that require hangar parking.
    parkingProfile.reservedProductionIds.add(productionId);
    return true;
  }

  private releaseParkingDoorReservationForProduction(producer: MapEntity, productionId: number): void {
    const parkingProfile = producer.parkingPlaceProfile;
    if (!parkingProfile) {
      return;
    }
    parkingProfile.reservedProductionIds.delete(productionId);
  }

  private pruneParkingReservations(producer: MapEntity): void {
    const parkingProfile = producer.parkingPlaceProfile;
    if (!parkingProfile || parkingProfile.reservedProductionIds.size === 0) {
      return;
    }

    const activeUnitProductionIds = new Set<number>();
    for (const entry of producer.productionQueue) {
      if (entry.type === 'UNIT') {
        activeUnitProductionIds.add(entry.productionId);
      }
    }

    for (const reservedProductionId of Array.from(parkingProfile.reservedProductionIds.values())) {
      if (!activeUnitProductionIds.has(reservedProductionId)) {
        parkingProfile.reservedProductionIds.delete(reservedProductionId);
      }
    }
  }

  private pruneParkingOccupancy(producer: MapEntity): void {
    const parkingProfile = producer.parkingPlaceProfile;
    if (!parkingProfile) {
      return;
    }

    for (const occupiedEntityId of Array.from(parkingProfile.occupiedSpaceEntityIds.values())) {
      const occupiedEntity = this.spawnedEntities.get(occupiedEntityId);
      if (!occupiedEntity || occupiedEntity.destroyed) {
        parkingProfile.occupiedSpaceEntityIds.delete(occupiedEntityId);
      }
    }
  }

  private canSideBuildUnitTemplate(side: string, unitDef: ObjectDef): boolean {
    const buildableStatus = this.resolveBuildableStatus(unitDef);
    if (buildableStatus === 'NO') {
      return false;
    }
    if (buildableStatus === 'ONLY_BY_AI' && this.getSidePlayerType(side) !== 'COMPUTER') {
      return false;
    }
    if (buildableStatus === 'IGNORE_PREREQUISITES') {
      return true;
    }

    for (const prereqGroup of this.extractProductionPrerequisiteGroups(unitDef)) {
      if (prereqGroup.objectAlternatives.length > 0) {
        let objectSatisfied = false;
        for (const alternativeName of prereqGroup.objectAlternatives) {
          if (this.countActiveEntitiesOfTemplateForSide(side, alternativeName) > 0) {
            objectSatisfied = true;
            break;
          }
        }
        if (!objectSatisfied) {
          return false;
        }
      }

      if (prereqGroup.scienceRequirements.length > 0) {
        for (const requiredScience of prereqGroup.scienceRequirements) {
          if (!this.hasSideScience(side, requiredScience)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  private resolveBuildableStatus(objectDef: ObjectDef): 'YES' | 'IGNORE_PREREQUISITES' | 'NO' | 'ONLY_BY_AI' {
    const tokens = this.extractIniValueTokens(objectDef.fields['Buildable']).flatMap((group) => group);
    const token = tokens[0]?.trim().toUpperCase() ?? '';
    if (token === 'IGNORE_PREREQUISITES') {
      return 'IGNORE_PREREQUISITES';
    }
    if (token === 'NO') {
      return 'NO';
    }
    if (token === 'ONLY_BY_AI') {
      return 'ONLY_BY_AI';
    }
    if (token === 'YES') {
      return 'YES';
    }

    const numericStatus = readNumericField(objectDef.fields, ['Buildable']);
    if (numericStatus !== null) {
      const normalized = Math.trunc(numericStatus);
      if (normalized === 1) {
        return 'IGNORE_PREREQUISITES';
      }
      if (normalized === 2) {
        return 'NO';
      }
      if (normalized === 3) {
        return 'ONLY_BY_AI';
      }
      return 'YES';
    }

    return 'YES';
  }

  private extractProductionPrerequisiteGroups(objectDef: ObjectDef): ProductionPrerequisiteGroup[] {
    const groups: ProductionPrerequisiteGroup[] = [];

    const addObjectGroup = (names: string[]): void => {
      const normalized = names
        .map((name) => name.trim().toUpperCase())
        .filter((name) => name.length > 0 && name !== 'NONE');
      if (normalized.length === 0) {
        return;
      }
      groups.push({ objectAlternatives: normalized, scienceRequirements: [] });
    };

    const addScienceGroup = (names: string[]): void => {
      const normalized = names
        .map((name) => name.trim().toUpperCase())
        .filter((name) => name.length > 0 && name !== 'NONE');
      if (normalized.length === 0) {
        return;
      }
      groups.push({ objectAlternatives: [], scienceRequirements: normalized });
    };

    const parseTokensAsPrereqGroup = (tokens: string[]): void => {
      if (tokens.length === 0) {
        return;
      }
      const head = tokens[0]?.trim().toUpperCase() ?? '';
      const tail = tokens.slice(1);
      if (head === 'OBJECT') {
        addObjectGroup(tail);
      } else if (head === 'SCIENCE') {
        addScienceGroup(tail);
      }
    };

    const parsePrereqValueWithPrefix = (prefix: 'OBJECT' | 'SCIENCE', value: IniValue | undefined): void => {
      for (const tokens of this.extractIniValueTokens(value)) {
        if (prefix === 'OBJECT') {
          addObjectGroup(tokens);
        } else {
          addScienceGroup(tokens);
        }
      }
    };

    for (const tokens of this.extractIniValueTokens(objectDef.fields['Prerequisites'])) {
      parseTokensAsPrereqGroup(tokens);
    }
    for (const tokens of this.extractIniValueTokens(objectDef.fields['Prerequisite'])) {
      parseTokensAsPrereqGroup(tokens);
    }

    const visitBlock = (block: IniBlock): void => {
      const blockType = block.type.toUpperCase();
      if (blockType === 'PREREQUISITE' || blockType === 'PREREQUISITES') {
        const headerTokens = block.name
          .split(/[\s,;|]+/)
          .map((token) => token.trim())
          .filter((token) => token.length > 0);
        parseTokensAsPrereqGroup(headerTokens);

        parsePrereqValueWithPrefix('OBJECT', block.fields['Object']);
        parsePrereqValueWithPrefix('SCIENCE', block.fields['Science']);
        parsePrereqValueWithPrefix('OBJECT', block.fields['OBJECT']);
        parsePrereqValueWithPrefix('SCIENCE', block.fields['SCIENCE']);
      }

      if (blockType === 'OBJECT') {
        const names = block.name
          .split(/[\s,;|]+/)
          .map((token) => token.trim())
          .filter((token) => token.length > 0);
        if (names.length > 0) {
          addObjectGroup(names);
        }
      } else if (blockType === 'SCIENCE') {
        const sciences = block.name
          .split(/[\s,;|]+/)
          .map((token) => token.trim())
          .filter((token) => token.length > 0);
        if (sciences.length > 0) {
          addScienceGroup(sciences);
        }
      }

      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const block of objectDef.blocks) {
      visitBlock(block);
    }

    return groups;
  }

  private cancelUnitProduction(entityId: number, productionId: number): boolean {
    const producer = this.spawnedEntities.get(entityId);
    if (!producer || producer.destroyed) {
      return false;
    }

    const index = producer.productionQueue.findIndex((entry) => entry.type === 'UNIT' && entry.productionId === productionId);
    if (index < 0) {
      return false;
    }

    const [removed] = producer.productionQueue.splice(index, 1);
    if (removed) {
      if (removed.type === 'UNIT') {
        this.releaseParkingDoorReservationForProduction(producer, removed.productionId);
      }
      if (removed.type === 'UPGRADE' && removed.upgradeType === 'PLAYER') {
        this.setSideUpgradeInProduction(producer.side ?? '', removed.upgradeName, false);
      }
      const refunded = removed.buildCost;
      this.depositSideCredits(producer.side, refunded);
    }
    return true;
  }

  private queueUpgradeProduction(entityId: number, upgradeName: string): boolean {
    const producer = this.spawnedEntities.get(entityId);
    if (!producer || producer.destroyed) {
      return false;
    }
    const productionProfile = producer.productionProfile;
    if (!productionProfile) {
      return false;
    }
    if (producer.productionQueue.length >= productionProfile.maxQueueEntries) {
      return false;
    }

    const registry = this.iniDataRegistry;
    if (!registry) {
      return false;
    }
    const upgradeDef = this.findUpgradeDefByName(registry, upgradeName);
    if (!upgradeDef) {
      return false;
    }

    const normalizedUpgradeName = upgradeDef.name.trim().toUpperCase();
    if (!normalizedUpgradeName || normalizedUpgradeName === 'NONE') {
      return false;
    }

    const producerSide = this.normalizeSide(producer.side);
    if (!producerSide) {
      // TODO(C&C source parity): map producer ownership to full Player data instead of side-string buckets.
      return false;
    }

    const upgradeType = this.resolveUpgradeType(upgradeDef);
    const producerObjectDef = this.findObjectDefByName(registry, producer.templateName);
    const commandSetName = producerObjectDef
      ? this.resolveEntityCommandSetName(producer, producerObjectDef)
      : null;
    const hasExplicitCommandSet = commandSetName !== null;

    if (producer.productionQueue.some((entry) => entry.type === 'UPGRADE' && entry.upgradeName === normalizedUpgradeName)) {
      return false;
    }

    if (upgradeType === 'PLAYER') {
      if (hasExplicitCommandSet && !this.canEntityProduceUpgrade(producer, upgradeDef)) {
        return false;
      }

      if (this.hasSideUpgradeCompleted(producerSide, normalizedUpgradeName)) {
        return false;
      }
      if (this.hasSideUpgradeInProduction(producerSide, normalizedUpgradeName)) {
        return false;
      }
    } else if (upgradeType === 'OBJECT') {
      // Source parity: OBJECT upgrades usually require a matching command-set button.
      // Some upgrades intentionally change command sets (for example strategy-center command unlocks),
      // so allow queueing when the upgrade explicitly drives a CommandSetUpgrade path for this unit.
      if (
        !this.canEntityProduceUpgrade(producer, upgradeDef)
        && !this.canUpgradeTriggerCommandSetForEntity(producer, normalizedUpgradeName)
      ) {
        return false;
      }

      if (!hasExplicitCommandSet && !this.isEntityAffectedByUpgrade(producer, normalizedUpgradeName)) {
        return false;
      }
      if (producer.completedUpgrades.has(normalizedUpgradeName)) {
        return false;
      }
    }

    const buildCost = this.resolveUpgradeBuildCost(upgradeDef);
    if (!this.canAffordUpgrade(producerSide, buildCost)) {
      return false;
    }
    const withdrawn = this.withdrawSideCredits(producerSide, buildCost);
    if (withdrawn < buildCost) {
      return false;
    }

    const totalProductionFrames = this.resolveUpgradeBuildTimeFrames(upgradeDef);
    producer.productionQueue.push({
      type: 'UPGRADE',
      upgradeName: normalizedUpgradeName,
      productionId: producer.productionNextId++,
      buildCost,
      totalProductionFrames,
      framesUnderConstruction: 0,
      percentComplete: 0,
      upgradeType,
    });
    if (upgradeType === 'PLAYER') {
      this.setSideUpgradeInProduction(producerSide, normalizedUpgradeName, true);
    }

    return true;
  }

  private canAffordUpgrade(side: string, buildCost: number): boolean {
    // Source parity: UpgradeCenter::canAffordUpgrade in
    // Generals/Code/GameEngine/Source/Common/System/Upgrade.cpp returns false if
    // money < upgradeTemplate->calcCostToBuild(player), and nothing else.
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return false;
    }
    return Math.max(0, this.getSideCredits(normalizedSide)) >= Math.max(0, Math.trunc(buildCost));
  }

  private canEntityProduceUpgrade(
    producer: MapEntity,
    upgradeDef: UpgradeDef,
  ): boolean {
    const registry = this.iniDataRegistry;
    if (!registry) {
      return false;
    }

    const producerObjectDef = this.findObjectDefByName(registry, producer.templateName);
    if (!producerObjectDef) {
      return false;
    }

    // Source parity: Object::canProduceUpgrade() checks the current command set for a
    // command button whose Upgrade field matches the requested upgrade.
    const commandSetName = this.resolveEntityCommandSetName(producer, producerObjectDef);
    if (!commandSetName) {
      // Source: Object::canProduceUpgrade returns false when a producer has no
      // discoverable command set; callers are expected to handle this explicitly.
      return false;
    }

    const commandSetDef = this.findCommandSetDefByName(registry, commandSetName);
    if (!commandSetDef) {
      return false;
    }

    const normalizedUpgradeName = upgradeDef.name.trim().toUpperCase();
    if (!normalizedUpgradeName || normalizedUpgradeName === 'NONE') {
      return false;
    }

    for (let buttonSlot = 1; buttonSlot <= 12; buttonSlot += 1) {
      const commandButtonName = readStringField(commandSetDef.fields, [String(buttonSlot)]);
      if (!commandButtonName) {
        continue;
      }

      const commandButtonDef = this.findCommandButtonDefByName(registry, commandButtonName);
      if (!commandButtonDef) {
        continue;
      }

      const commandUpgradeName = readStringField(commandButtonDef.fields, ['Upgrade'])?.trim().toUpperCase() ?? '';
      if (!commandUpgradeName || commandUpgradeName === 'NONE') {
        continue;
      }
      if (commandUpgradeName === normalizedUpgradeName) {
        return true;
      }
    }

    return false;
  }

  private canUpgradeTriggerCommandSetForEntity(entity: MapEntity, normalizedUpgradeName: string): boolean {
    const target = normalizedUpgradeName.trim().toUpperCase();
    if (!target || target === 'NONE') {
      return false;
    }

    for (const module of entity.upgradeModules) {
      if (module.moduleType !== 'COMMANDSETUPGRADE') {
        continue;
      }

      if (module.sourceUpgradeName === target) {
        return true;
      }
      if (module.triggeredBy.has(target)) {
        return true;
      }
    }

    return false;
  }

  private resolveEntityCommandSetName(entity: MapEntity, objectDef: ObjectDef): string | null {
    if (entity.commandSetStringOverride && entity.commandSetStringOverride !== 'NONE') {
      return entity.commandSetStringOverride;
    }

    const baseCommandSet = readStringField(objectDef.fields, ['CommandSet'])?.trim().toUpperCase() ?? '';
    if (!baseCommandSet || baseCommandSet === 'NONE') {
      return null;
    }
    return baseCommandSet;
  }

  private cancelUpgradeProduction(entityId: number, upgradeName: string): boolean {
    const producer = this.spawnedEntities.get(entityId);
    if (!producer || producer.destroyed) {
      return false;
    }

    const normalizedUpgradeName = upgradeName.trim().toUpperCase();
    if (!normalizedUpgradeName) {
      return false;
    }

    const index = producer.productionQueue.findIndex(
      (entry) => entry.type === 'UPGRADE' && entry.upgradeName === normalizedUpgradeName,
    );
    if (index < 0) {
      return false;
    }

    const [removed] = producer.productionQueue.splice(index, 1);
    if (!removed || removed.type !== 'UPGRADE') {
      return false;
    }

    if (removed.upgradeType === 'PLAYER') {
      this.setSideUpgradeInProduction(producer.side ?? '', removed.upgradeName, false);
    }
    this.depositSideCredits(producer.side, removed.buildCost);
    return true;
  }

  private resolveObjectBuildTimeFrames(objectDef: ObjectDef): number {
    const buildTimeSeconds = readNumericField(objectDef.fields, ['BuildTime']) ?? 1;
    if (!Number.isFinite(buildTimeSeconds)) {
      return 0;
    }
    return Math.trunc(buildTimeSeconds * LOGIC_FRAME_RATE);
  }

  private resolveObjectBuildCost(objectDef: ObjectDef, side: string = ''): number {
    const buildCostRaw = readNumericField(objectDef.fields, ['BuildCost']) ?? 0;
    if (!Number.isFinite(buildCostRaw)) {
      return 0;
    }
    const normalizedSide = this.normalizeSide(side);
    const nextCost = this.applyKindOfProductionCostModifiers(buildCostRaw, normalizedSide, this.normalizeKindOf(objectDef.kindOf));
    return Math.max(0, Math.trunc(nextCost));
  }

  private resolveMaxSimultaneousOfType(objectDef: ObjectDef): number {
    const maxKeyword = readStringField(objectDef.fields, ['MaxSimultaneousOfType'])?.trim().toUpperCase();
    if (maxKeyword === 'DETERMINEDBYSUPERWEAPONRESTRICTION') {
      // TODO(C&C source parity): wire GameInfo superweapon restrictions into max-simultaneous evaluation.
      return 0;
    }

    const maxRaw = readNumericField(objectDef.fields, ['MaxSimultaneousOfType']) ?? 0;
    if (!Number.isFinite(maxRaw)) {
      return 0;
    }
    return Math.max(0, Math.trunc(maxRaw));
  }

  private resolveMaxSimultaneousLinkKey(objectDef: ObjectDef): string | null {
    const rawLinkKey = readStringField(objectDef.fields, ['MaxSimultaneousLinkKey'])?.trim().toUpperCase() ?? '';
    if (!rawLinkKey || rawLinkKey === 'NONE') {
      return null;
    }
    return rawLinkKey;
  }

  private isStructureObjectDef(objectDef: ObjectDef): boolean {
    return this.normalizeKindOf(objectDef.kindOf).has('STRUCTURE');
  }

  private doesTemplateMatchMaxSimultaneousType(targetObjectDef: ObjectDef, candidateTemplateName: string): boolean {
    const normalizedTargetName = targetObjectDef.name.trim().toUpperCase();
    if (!normalizedTargetName) {
      return false;
    }

    if (this.areEquivalentTemplateNames(candidateTemplateName, normalizedTargetName)) {
      return true;
    }

    const targetLinkKey = this.resolveMaxSimultaneousLinkKey(targetObjectDef);
    if (!targetLinkKey) {
      return false;
    }

    const registry = this.iniDataRegistry;
    if (!registry) {
      return false;
    }

    const candidateDef = this.findObjectDefByName(registry, candidateTemplateName);
    if (!candidateDef) {
      return false;
    }

    const candidateLinkKey = this.resolveMaxSimultaneousLinkKey(candidateDef);
    return candidateLinkKey !== null && candidateLinkKey === targetLinkKey;
  }

  private countActiveEntitiesForMaxSimultaneousForSide(side: string, targetObjectDef: ObjectDef): number {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return 0;
    }

    let count = 0;
    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed) {
        continue;
      }
      if (this.normalizeSide(entity.side) !== normalizedSide) {
        continue;
      }
      if (!this.doesTemplateMatchMaxSimultaneousType(targetObjectDef, entity.templateName)) {
        continue;
      }
      count += 1;
    }

    return count;
  }

  private countQueuedUnitsForMaxSimultaneousForSide(side: string, targetObjectDef: ObjectDef): number {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return 0;
    }

    let count = 0;
    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed) {
        continue;
      }
      if (this.normalizeSide(entity.side) !== normalizedSide) {
        continue;
      }
      for (const queueEntry of entity.productionQueue) {
        if (queueEntry.type !== 'UNIT') {
          continue;
        }
        if (this.doesTemplateMatchMaxSimultaneousType(targetObjectDef, queueEntry.templateName)) {
          count += 1;
        }
      }
    }

    return count;
  }

  private extractBuildVariationNames(objectDef: ObjectDef | undefined): Set<string> {
    const names = new Set<string>();
    if (!objectDef) {
      return names;
    }

    for (const tokens of this.extractIniValueTokens(objectDef.fields['BuildVariations'])) {
      for (const token of tokens) {
        const normalized = token.trim().toUpperCase();
        if (!normalized || normalized === 'NONE') {
          continue;
        }
        names.add(normalized);
      }
    }

    return names;
  }

  private areEquivalentObjectTemplates(left: ObjectDef | undefined, right: ObjectDef | undefined): boolean {
    if (!left || !right) {
      return false;
    }

    const leftName = left.name.trim().toUpperCase();
    const rightName = right.name.trim().toUpperCase();
    if (!leftName || !rightName) {
      return false;
    }
    if (leftName === rightName) {
      return true;
    }

    // Source parity: ThingTemplate::isEquivalentTo() compares direct equality, final overrides,
    // reskin ancestry, and BuildVariations both directions. Registry data currently exposes
    // BuildVariations reliably, but not final-override/reskin links.
    const leftVariations = this.extractBuildVariationNames(left);
    if (leftVariations.has(rightName)) {
      return true;
    }
    const rightVariations = this.extractBuildVariationNames(right);
    if (rightVariations.has(leftName)) {
      return true;
    }

    // TODO(C&C source parity): include final-override and reskin ancestry equivalence checks once represented in ini-data registry.
    return false;
  }

  private areEquivalentTemplateNames(leftTemplateName: string, rightTemplateName: string): boolean {
    const normalizedLeft = leftTemplateName.trim().toUpperCase();
    const normalizedRight = rightTemplateName.trim().toUpperCase();
    if (!normalizedLeft || !normalizedRight) {
      return false;
    }
    if (normalizedLeft === normalizedRight) {
      return true;
    }

    const registry = this.iniDataRegistry;
    if (!registry) {
      return false;
    }

    const leftDef = this.findObjectDefByName(registry, normalizedLeft);
    const rightDef = this.findObjectDefByName(registry, normalizedRight);
    return this.areEquivalentObjectTemplates(leftDef, rightDef);
  }

  private countActiveEntitiesOfTemplateForSide(side: string, templateName: string): number {
    const normalizedSide = this.normalizeSide(side);
    const normalizedTemplateName = templateName.trim().toUpperCase();
    if (!normalizedSide || !normalizedTemplateName) {
      return 0;
    }

    let count = 0;
    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed) {
        continue;
      }
      if (this.normalizeSide(entity.side) !== normalizedSide) {
        continue;
      }
      if (!this.areEquivalentTemplateNames(entity.templateName, normalizedTemplateName)) {
        continue;
      }
      count += 1;
    }

    return count;
  }

  private resolveProductionQuantity(producer: MapEntity, templateName: string): number {
    const productionProfile = producer.productionProfile;
    if (!productionProfile) {
      return 1;
    }

    for (const modifier of productionProfile.quantityModifiers) {
      if (!this.areEquivalentTemplateNames(modifier.templateName, templateName)) {
        continue;
      }
      return Math.max(1, modifier.quantity);
    }

    return 1;
  }

  private updateProduction(): void {
    for (const producer of this.spawnedEntities.values()) {
      if (producer.destroyed || producer.productionProfile === null) {
        continue;
      }

      this.updateQueueExitGate(producer);

      const production = producer.productionQueue[0];
      if (!production) {
        continue;
      }

      production.framesUnderConstruction += 1;
      if (production.totalProductionFrames <= 0) {
        production.percentComplete = 100;
      } else {
        production.percentComplete = (production.framesUnderConstruction / production.totalProductionFrames) * 100;
      }

      if (production.percentComplete < 100) {
        continue;
      }

      if (production.type === 'UNIT') {
        this.completeUnitProduction(producer, production);
      } else if (production.type === 'UPGRADE') {
        this.completeUpgradeProduction(producer, production);
      }
    }
  }

  private updateQueueExitGate(producer: MapEntity): void {
    if (!producer.queueProductionExitProfile) {
      return;
    }

    const isFreeToExit = producer.queueProductionExitBurstRemaining > 0
      || producer.queueProductionExitDelayFramesRemaining === 0;
    if (isFreeToExit) {
      producer.queueProductionExitDelayFramesRemaining = 0;
      return;
    }

    producer.queueProductionExitDelayFramesRemaining = Math.max(
      0,
      producer.queueProductionExitDelayFramesRemaining - 1,
    );
  }

  private completeUnitProduction(producer: MapEntity, production: UnitProductionQueueEntry): void {
    if (!producer.queueProductionExitProfile) {
      this.removeProductionEntry(producer, production.productionId);
      return;
    }

    const registry = this.iniDataRegistry;
    if (!registry) {
      this.removeProductionEntry(producer, production.productionId);
      return;
    }

    const unitDef = this.findObjectDefByName(registry, production.templateName);
    if (!unitDef) {
      this.removeProductionEntry(producer, production.productionId);
      return;
    }

    let shouldRemoveEntry = false;
    while (production.productionQuantityProduced < production.productionQuantityTotal) {
      const canExit = producer.queueProductionExitBurstRemaining > 0
        || producer.queueProductionExitDelayFramesRemaining === 0;
      if (!canExit) {
        break;
      }

      if (!this.canExitProducedUnitViaParking(producer, unitDef, production.productionId)) {
        break;
      }

      const produced = this.spawnProducedUnit(producer, unitDef, production.productionId);
      if (!produced) {
        shouldRemoveEntry = true;
        break;
      }

      production.productionQuantityProduced += 1;
      producer.queueProductionExitDelayFramesRemaining = producer.queueProductionExitProfile.exitDelayFrames;
      if (producer.queueProductionExitBurstRemaining > 0) {
        producer.queueProductionExitBurstRemaining -= 1;
      }
    }

    if (shouldRemoveEntry || production.productionQuantityProduced >= production.productionQuantityTotal) {
      this.removeProductionEntry(producer, production.productionId);
    }
  }

  private completeUpgradeProduction(producer: MapEntity, production: UpgradeProductionQueueEntry): void {
    if (production.upgradeType === 'PLAYER') {
      this.setSideUpgradeInProduction(producer.side ?? '', production.upgradeName, false);
      this.setSideUpgradeCompleted(producer.side ?? '', production.upgradeName, true);
      this.applyCompletedPlayerUpgrade(producer.side ?? '', production.upgradeName);
    } else {
      this.applyUpgradeToEntity(producer.id, production.upgradeName);
    }

    this.removeProductionEntry(producer, production.productionId);
  }

  private applyCompletedPlayerUpgrade(side: string, upgradeName: string): void {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return;
    }

    const normalizedUpgradeName = upgradeName.trim().toUpperCase();
    if (!normalizedUpgradeName || normalizedUpgradeName === 'NONE') {
      return;
    }

    const registry = this.iniDataRegistry;
    if (registry) {
      const upgradeDef = this.findUpgradeDefByName(registry, normalizedUpgradeName);
      if (upgradeDef) {
        for (const module of this.extractUpgradeModulesFromBlocks(
          upgradeDef.blocks ?? [],
          normalizedUpgradeName,
        )) {
          if (module.moduleType === 'COSTMODIFIERUPGRADE') {
            // Source parity: COSTMODIFIERUPGRADE.cpp routes to
            // Player::addKindOfProductionCostChange on upgrade completion.
            this.applyCostModifierUpgradeToSide(normalizedSide, module);
          } else if (module.moduleType === 'GRANTSCIENCEUPGRADE') {
            // Source parity: GrantScienceUpgrade.cpp grants configured science at upgrade completion.
            this.grantSideScience(normalizedSide, module.grantScienceName);
          }
        }
      }
    }

    for (const entity of this.spawnedEntities.values()) {
      if (this.normalizeSide(entity.side) !== normalizedSide) {
        continue;
      }
      if (entity.destroyed) {
        continue;
      }
      // Skip side-global modules to avoid reapplying once per entity.
      this.executePendingUpgradeModules(entity.id, entity, true);
    }
  }

  private removeProductionEntry(producer: MapEntity, productionId: number): void {
    const index = producer.productionQueue.findIndex((entry) => entry.productionId === productionId);
    if (index >= 0) {
      const [removed] = producer.productionQueue.splice(index, 1);
      if (removed?.type === 'UNIT') {
        this.releaseParkingDoorReservationForProduction(producer, removed.productionId);
      }
    }
  }

  private canExitProducedUnitViaParking(
    producer: MapEntity,
    unitDef: ObjectDef,
    productionId: number,
  ): boolean {
    const parkingProfile = producer.parkingPlaceProfile;
    if (!parkingProfile) {
      return true;
    }

    if (!this.shouldReserveParkingDoorWhenQueued(unitDef)) {
      return true;
    }

    this.pruneParkingOccupancy(producer);
    this.pruneParkingReservations(producer);
    if (parkingProfile.reservedProductionIds.has(productionId)) {
      return true;
    }

    return (parkingProfile.occupiedSpaceEntityIds.size + parkingProfile.reservedProductionIds.size)
      < parkingProfile.totalSpaces;
  }

  private spawnProducedUnit(producer: MapEntity, unitDef: ObjectDef, productionId: number): MapEntity | null {
    const registry = this.iniDataRegistry;
    if (!registry) {
      return null;
    }

    const spawnLocation = this.resolveQueueSpawnLocation(producer);
    if (!spawnLocation) {
      return null;
    }

    const mapObject: MapObjectJSON = {
      templateName: unitDef.name,
      angle: THREE.MathUtils.radToDeg(producer.mesh.rotation.y),
      flags: 0,
      position: {
        x: spawnLocation.x,
        y: spawnLocation.z,
        z: spawnLocation.heightOffset,
      },
      properties: {},
    };
    const created = this.createMapEntity(mapObject, unitDef, registry, this.mapHeightmap);
    if (producer.side !== undefined) {
      created.side = producer.side;
      created.mesh.material = this.getMaterial({
        category: created.category,
        resolved: created.resolved,
        side: created.side,
        selected: created.selected,
      });
    }
    created.controllingPlayerToken = producer.controllingPlayerToken;

    if (!this.reserveParkingSpaceForProducedUnit(producer, created, unitDef, productionId)) {
      return null;
    }

    this.spawnedEntities.set(created.id, created);
    this.scene.add(created.mesh);
    this.applyQueueProductionNaturalRallyPoint(producer, created);

    return created;
  }

  private reserveParkingSpaceForProducedUnit(
    producer: MapEntity,
    producedUnit: MapEntity,
    producedUnitDef: ObjectDef,
    productionId: number,
  ): boolean {
    const parkingProfile = producer.parkingPlaceProfile;
    if (!parkingProfile) {
      return true;
    }

    if (!this.shouldReserveParkingDoorWhenQueued(producedUnitDef)) {
      return true;
    }

    this.pruneParkingOccupancy(producer);
    this.pruneParkingReservations(producer);
    if (parkingProfile.reservedProductionIds.has(productionId)) {
      parkingProfile.reservedProductionIds.delete(productionId);
    } else if ((parkingProfile.occupiedSpaceEntityIds.size + parkingProfile.reservedProductionIds.size) >= parkingProfile.totalSpaces) {
      return false;
    }

    parkingProfile.occupiedSpaceEntityIds.add(producedUnit.id);
    producedUnit.parkingSpaceProducerId = producer.id;
    if (producer.containProfile?.moduleType === 'HELIX') {
      const producedKindOf = this.resolveEntityKindOfSet(producedUnit);
      if (producedKindOf.has('PORTABLE_STRUCTURE')) {
        const allowedPortableTemplates = producer.containProfile.portableStructureTemplateNames;
        const producedTemplateName = producedUnit.templateName.toUpperCase();
        const isTemplateAllowed =
          !allowedPortableTemplates || allowedPortableTemplates.length === 0 || allowedPortableTemplates.includes(producedTemplateName);
        // Source parity: HelixContain::addToContain/addToContainList only set
        // m_portableStructureID when it is INVALID_ID (first portable only).
        // (GeneralsMD/Code/GameEngine/Source/GameLogic/Object/Contain/HelixContain.cpp:252,270)
        if (producer.helixPortableRiderId === null && isTemplateAllowed) {
          producer.helixPortableRiderId = producedUnit.id;
        }
        producedUnit.helixCarrierId = producer.id;
      }
    }
    return true;
  }

  private resolveQueueSpawnLocation(producer: MapEntity): {
    x: number;
    z: number;
    heightOffset: number;
  } | null {
    const exitProfile = producer.queueProductionExitProfile;
    if (!exitProfile) {
      return null;
    }

    const yaw = producer.mesh.rotation.y;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const local = exitProfile.unitCreatePoint;
    const x = producer.mesh.position.x + (local.x * cos - local.y * sin);
    const z = producer.mesh.position.z + (local.x * sin + local.y * cos);
    const terrainHeight = this.mapHeightmap ? this.mapHeightmap.getInterpolatedHeight(x, z) : 0;
    const producerBaseY = producer.mesh.position.y - producer.baseHeight;
    let worldY = producerBaseY + local.z;
    const creationInAir = Math.abs(worldY - terrainHeight) > 0.0001;
    if (creationInAir && !exitProfile.allowAirborneCreation) {
      worldY = terrainHeight;
    }

    return {
      x,
      z,
      heightOffset: worldY - terrainHeight,
    };
  }

  private applyQueueProductionNaturalRallyPoint(producer: MapEntity, producedUnit: MapEntity): void {
    if (producer.rallyPoint && producedUnit.canMove) {
      this.issueMoveTo(producedUnit.id, producer.rallyPoint.x, producer.rallyPoint.z);
      return;
    }

    const exitProfile = producer.queueProductionExitProfile;
    if (!exitProfile || !exitProfile.naturalRallyPoint || !producedUnit.canMove) {
      return;
    }

    const rallyPoint = { ...exitProfile.naturalRallyPoint };
    if (exitProfile.moduleType === 'QUEUE') {
      const magnitude = Math.hypot(rallyPoint.x, rallyPoint.y, rallyPoint.z);
      if (magnitude > 0) {
        const offsetScale = (2 * MAP_XY_FACTOR) / magnitude;
        rallyPoint.x += rallyPoint.x * offsetScale;
        rallyPoint.y += rallyPoint.y * offsetScale;
        rallyPoint.z += rallyPoint.z * offsetScale;
      }
    }

    const yaw = producer.mesh.rotation.y;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const rallyX = producer.mesh.position.x + (rallyPoint.x * cos - rallyPoint.y * sin);
    const rallyZ = producer.mesh.position.z + (rallyPoint.x * sin + rallyPoint.y * cos);
    this.issueMoveTo(producedUnit.id, rallyX, rallyZ);
  }

  private withdrawSideCredits(side: string | undefined, amount: number): number {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return 0;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return 0;
    }

    const current = this.sideCredits.get(normalizedSide) ?? 0;
    const requested = Math.max(0, Math.trunc(amount));
    const withdrawn = Math.min(requested, current);
    if (withdrawn === 0) {
      return 0;
    }
    this.sideCredits.set(normalizedSide, current - withdrawn);
    return withdrawn;
  }

  private depositSideCredits(side: string | undefined, amount: number): void {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const current = this.sideCredits.get(normalizedSide) ?? 0;
    const deposit = Math.max(0, Math.trunc(amount));
    this.sideCredits.set(normalizedSide, current + deposit);
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

  private setEntityRallyPoint(entityId: number, targetX: number, targetZ: number): void {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity || entity.destroyed) {
      return;
    }
    entity.rallyPoint = { x: targetX, z: targetZ };
  }

  private issueAttackEntity(
    entityId: number,
    targetEntityId: number,
    commandSource: AttackCommandSource,
  ): void {
    const attacker = this.spawnedEntities.get(entityId);
    const target = this.spawnedEntities.get(targetEntityId);
    if (!attacker || !target) {
      return;
    }
    if (attacker.destroyed || target.destroyed) {
      return;
    }
    const weapon = attacker.attackWeapon;
    if (!weapon || weapon.primaryDamage <= 0) {
      return;
    }
    this.setEntityIgnoringStealthStatus(attacker, weapon.continueAttackRange > 0);
    if (!this.canAttackerTargetEntity(attacker, target, commandSource)) {
      this.setEntityIgnoringStealthStatus(attacker, false);
      return;
    }

    attacker.attackTargetEntityId = targetEntityId;
    attacker.attackOriginalVictimPosition = {
      x: target.mesh.position.x,
      z: target.mesh.position.z,
    };
    attacker.attackCommandSource = commandSource;

    const attackRange = weapon.attackRange;
    if (!attacker.canMove || attackRange <= 0) {
      attacker.moving = false;
      attacker.moveTarget = null;
      attacker.movePath = [];
      attacker.pathIndex = 0;
      attacker.pathfindGoalCell = null;
      return;
    }

    this.issueMoveTo(attacker.id, target.mesh.position.x, target.mesh.position.z, attackRange);
  }

  private clearAttackTarget(entityId: number): void {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) {
      return;
    }
    entity.attackTargetEntityId = null;
    entity.attackOriginalVictimPosition = null;
    entity.attackCommandSource = 'AI';
    this.setEntityIgnoringStealthStatus(entity, false);
    entity.preAttackFinishFrame = 0;
  }

  private stopEntity(entityId: number): void {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) return;

    this.updatePathfindPosCell(entity);
    entity.moving = false;
    entity.moveTarget = null;
    entity.movePath = [];
    entity.pathIndex = 0;
    entity.pathfindGoalCell = null;
    entity.preAttackFinishFrame = 0;
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

  private updateCombat(): void {
    for (const attacker of this.spawnedEntities.values()) {
      if (attacker.destroyed) {
        continue;
      }
      this.setEntityFiringWeaponStatus(attacker, false);
      if (!this.canEntityAttackFromStatus(attacker)) {
        this.setEntityAttackStatus(attacker, false);
        this.setEntityAimingWeaponStatus(attacker, false);
        this.setEntityIgnoringStealthStatus(attacker, false);
        this.refreshEntitySneakyMissWindow(attacker);
        attacker.preAttackFinishFrame = 0;
        continue;
      }

      const targetId = attacker.attackTargetEntityId;
      const weapon = attacker.attackWeapon;
      if (targetId === null || !weapon) {
        this.setEntityAttackStatus(attacker, false);
        this.setEntityAimingWeaponStatus(attacker, false);
        this.setEntityIgnoringStealthStatus(attacker, false);
        this.refreshEntitySneakyMissWindow(attacker);
        attacker.preAttackFinishFrame = 0;
        continue;
      }

      const target = this.spawnedEntities.get(targetId);
      if (!target || !this.canAttackerTargetEntity(attacker, target, attacker.attackCommandSource)) {
        attacker.attackTargetEntityId = null;
        attacker.attackOriginalVictimPosition = null;
        attacker.attackCommandSource = 'AI';
        this.setEntityAttackStatus(attacker, false);
        this.setEntityAimingWeaponStatus(attacker, false);
        this.setEntityIgnoringStealthStatus(attacker, false);
        this.refreshEntitySneakyMissWindow(attacker);
        attacker.preAttackFinishFrame = 0;
        continue;
      }

      this.setEntityAttackStatus(attacker, true);
      this.refreshEntitySneakyMissWindow(attacker);

      const dx = target.mesh.position.x - attacker.mesh.position.x;
      const dz = target.mesh.position.z - attacker.mesh.position.z;
      const distanceSqr = dx * dx + dz * dz;
      const minAttackRange = Math.max(0, weapon.minAttackRange);
      const minAttackRangeSqr = minAttackRange * minAttackRange;
      const attackRange = Math.max(0, weapon.attackRange);
      const attackRangeSqr = attackRange * attackRange;
      if (distanceSqr < Math.max(0, minAttackRangeSqr - ATTACK_MIN_RANGE_DISTANCE_SQR_FUDGE)) {
        this.setEntityAimingWeaponStatus(attacker, false);
        if (attacker.canMove && minAttackRange > PATHFIND_CELL_SIZE) {
          const retreatTarget = this.computeAttackRetreatTarget(attacker, target, weapon);
          if (retreatTarget) {
            this.issueMoveTo(attacker.id, retreatTarget.x, retreatTarget.z);
          }
        }
        attacker.preAttackFinishFrame = 0;
        continue;
      }

      if (distanceSqr > attackRangeSqr) {
        this.setEntityAimingWeaponStatus(attacker, false);
        if (attacker.canMove) {
          this.issueMoveTo(attacker.id, target.mesh.position.x, target.mesh.position.z, attackRange);
        }
        attacker.preAttackFinishFrame = 0;
        continue;
      }

      if (attacker.moving) {
        attacker.moving = false;
        attacker.moveTarget = null;
        attacker.movePath = [];
        attacker.pathIndex = 0;
        attacker.pathfindGoalCell = null;
      }
      this.setEntityAimingWeaponStatus(attacker, true);

      if (this.frameCounter < attacker.nextAttackFrame) {
        continue;
      }

      // TODO(C&C source parity): replace this per-entity weapon timing model with full
      // WeaponStatus state handling (PRE_ATTACK/BETWEEN_FIRING_SHOTS/OUT_OF_AMMO), including
      // shared reload timing across weapon slots and firing-tracker integration.
      if (weapon.clipSize > 0 && attacker.attackAmmoInClip <= 0) {
        if (this.frameCounter < attacker.attackReloadFinishFrame) {
          continue;
        }
        attacker.attackAmmoInClip = weapon.clipSize;
        this.rebuildEntityScatterTargets(attacker);
      }

      if (attacker.preAttackFinishFrame > this.frameCounter) {
        continue;
      }

      if (attacker.preAttackFinishFrame === 0) {
        const preAttackDelay = this.resolveWeaponPreAttackDelayFrames(attacker, target, weapon);
        if (preAttackDelay > 0) {
          attacker.preAttackFinishFrame = this.frameCounter + preAttackDelay;
          if (attacker.preAttackFinishFrame > this.frameCounter) {
            continue;
          }
        }
      }

      this.setEntityAimingWeaponStatus(attacker, false);
      this.setEntityFiringWeaponStatus(attacker, true);
      this.queueWeaponDamageEvent(attacker, target, weapon);
      this.setEntityIgnoringStealthStatus(attacker, false);
      attacker.preAttackFinishFrame = 0;
      this.recordConsecutiveAttackShot(attacker, target.id);
      if (weapon.autoReloadWhenIdleFrames > 0) {
        attacker.attackForceReloadFrame = this.frameCounter + weapon.autoReloadWhenIdleFrames;
      } else {
        attacker.attackForceReloadFrame = 0;
      }

      if (weapon.clipSize > 0) {
        attacker.attackAmmoInClip = Math.max(0, attacker.attackAmmoInClip - 1);
        if (attacker.attackAmmoInClip <= 0) {
          attacker.attackReloadFinishFrame = this.frameCounter + weapon.clipReloadFrames;
          attacker.nextAttackFrame = attacker.attackReloadFinishFrame;
          continue;
        }
      }

      attacker.nextAttackFrame = this.frameCounter + this.resolveWeaponDelayFrames(weapon);
    }
  }

  private queueWeaponDamageEvent(attacker: MapEntity, target: MapEntity, weapon: AttackWeaponProfile): void {
    const sourceX = attacker.mesh.position.x;
    const sourceZ = attacker.mesh.position.z;
    const targetX = target.mesh.position.x;
    const targetZ = target.mesh.position.z;

    let aimX = targetX;
    let aimZ = targetZ;
    let primaryVictimEntityId = weapon.damageDealtAtSelfPosition ? null : target.id;

    const sneakyOffset = this.resolveEntitySneakyTargetingOffset(target);
    if (sneakyOffset && primaryVictimEntityId !== null) {
      aimX += sneakyOffset.x;
      aimZ += sneakyOffset.z;
      // Source parity subset: WeaponTemplate::fireWeaponTemplate() converts sneaky-targeted
      // victim shots into position-shots using AIUpdateInterface::getSneakyTargetingOffset().
      primaryVictimEntityId = null;
    }

    if (attacker.attackScatterTargetsUnused.length > 0) {
      const randomPick = this.gameRandom.nextRange(0, attacker.attackScatterTargetsUnused.length - 1);
      const targetIndex = attacker.attackScatterTargetsUnused[randomPick];
      const scatterOffset = targetIndex === undefined ? null : weapon.scatterTargets[targetIndex];
      if (scatterOffset) {
        aimX += scatterOffset.x * weapon.scatterTargetScalar;
        aimZ += scatterOffset.z * weapon.scatterTargetScalar;
        primaryVictimEntityId = null;
      }

      attacker.attackScatterTargetsUnused[randomPick] = attacker.attackScatterTargetsUnused[attacker.attackScatterTargetsUnused.length - 1]!;
      attacker.attackScatterTargetsUnused.pop();
      // Source parity subset: Weapon::privateFireWeapon() consumes one ScatterTarget
      // offset per shot from a randomized "unused" list until reload rebuilds it.
      // TODO(C&C source parity): project scatter-target coordinates onto terrain layer
      // height when vertical terrain data is represented in combat impact resolution.
    }

    let delivery: 'DIRECT' | 'PROJECTILE' = 'DIRECT';
    let travelSpeed = weapon.weaponSpeed;
    if (weapon.projectileObjectName) {
      delivery = 'PROJECTILE';
      // Source parity subset: projectile weapons in WeaponTemplate::fireWeaponTemplate()
      // spawn ProjectileObject and defer damage to projectile update/collision.
      // We represent this as a deterministic delayed impact without spawning a full
      // projectile object graph yet.

      const scatterRadius = this.resolveProjectileScatterRadiusForTarget(weapon, target);
      if (scatterRadius > 0) {
        const randomizedScatterRadius = scatterRadius * this.gameRandom.nextFloat();
        const scatterAngleRadians = this.gameRandom.nextFloat() * (2 * Math.PI);
        aimX += randomizedScatterRadius * Math.cos(scatterAngleRadians);
        aimZ += randomizedScatterRadius * Math.sin(scatterAngleRadians);
        primaryVictimEntityId = null;
        // Source parity subset: projectile scatter path launches at a position (not victim object),
        // so impact no longer homes to the moving target.
        // TODO(C&C source parity): include terrain layer-height projection and explicit
        // scatter-target list interaction nuances from WeaponTemplate::fireWeaponTemplate().
      }
      const sourceToAimDistance = Math.hypot(aimX - sourceX, aimZ - sourceZ);
      travelSpeed = this.resolveScaledProjectileTravelSpeed(weapon, sourceToAimDistance);
    } else {
      // Source parity subset: Weapon::fireWeaponTemplate delays direct-damage resolution by
      // distance / getWeaponSpeed().
      // TODO(C&C source parity): mirror laser-handling behavior for non-projectile weapons.
    }

    const sourceToAimDistance = Math.hypot(aimX - sourceX, aimZ - sourceZ);
    const travelFrames = sourceToAimDistance / travelSpeed;
    let delayFrames = Number.isFinite(travelFrames) && travelFrames >= 1
      ? Math.ceil(travelFrames)
      : 0;
    if (delivery === 'PROJECTILE') {
      delayFrames = Math.max(1, delayFrames);
    }

    const impactX = weapon.damageDealtAtSelfPosition ? sourceX : aimX;
    const impactZ = weapon.damageDealtAtSelfPosition ? sourceZ : aimZ;
    const event: PendingWeaponDamageEvent = {
      sourceEntityId: attacker.id,
      primaryVictimEntityId,
      impactX,
      impactZ,
      executeFrame: this.frameCounter + delayFrames,
      delivery,
      weapon,
    };

    if (delivery === 'DIRECT' && delayFrames <= 0) {
      // Source parity subset: WeaponTemplate::fireWeaponTemplate() applies non-projectile
      // damage immediately when delayInFrames < 1.0f instead of queuing delayed damage.
      this.applyWeaponDamageEvent(event);
      return;
    }

    this.pendingWeaponDamageEvents.push(event);

    // TODO(C&C source parity): port projectile-object launch/collision/countermeasure and
    // laser/scatter handling from Weapon::fireWeaponTemplate() instead of routing both
    // direct and projectile delivery through pending impact events.
  }

  private setEntityAttackStatus(entity: MapEntity, isAttacking: boolean): void {
    // TODO(C&C source parity): move IS_ATTACKING ownership from this combat-loop subset
    // to full AI state-machine enter/exit transitions (AIAttackState onEnter/onExit).
    if (isAttacking) {
      entity.objectStatusFlags.add('IS_ATTACKING');
    } else {
      entity.objectStatusFlags.delete('IS_ATTACKING');
    }
  }

  private setEntityAimingWeaponStatus(entity: MapEntity, isAiming: boolean): void {
    // Source parity subset: AIAttackAimAtTargetState::onEnter() sets
    // OBJECT_STATUS_IS_AIMING_WEAPON and onExit() clears it.
    // TODO(C&C source parity): move this from combat-loop range checks to full
    // attack state-machine transitions (pursue/approach/aim/fire).
    if (isAiming) {
      entity.objectStatusFlags.add('IS_AIMING_WEAPON');
    } else {
      entity.objectStatusFlags.delete('IS_AIMING_WEAPON');
    }
  }

  private setEntityFiringWeaponStatus(entity: MapEntity, isFiring: boolean): void {
    // Source parity subset: AIAttackFireWeaponState::onEnter() sets
    // OBJECT_STATUS_IS_FIRING_WEAPON and onExit() clears it.
    // TODO(C&C source parity): drive this from explicit fire-state enter/exit
    // instead of one-frame fire pulses in updateCombat().
    if (isFiring) {
      entity.objectStatusFlags.add('IS_FIRING_WEAPON');
    } else {
      entity.objectStatusFlags.delete('IS_FIRING_WEAPON');
    }
  }

  private setEntityIgnoringStealthStatus(entity: MapEntity, isIgnoringStealth: boolean): void {
    // Source parity subset: AIAttackState::onEnter() sets OBJECT_STATUS_IGNORING_STEALTH
    // when current weapon has ContinueAttackRange > 0, and AIAttackFireWeaponState::update()
    // clears it after each fired shot.
    // TODO(C&C source parity): drive this from full attack-state enter/exit and command-source
    // flow (including attack-position mine clearing and force-attack exceptions).
    if (isIgnoringStealth) {
      entity.objectStatusFlags.add('IGNORING_STEALTH');
    } else {
      entity.objectStatusFlags.delete('IGNORING_STEALTH');
    }
  }

  private refreshEntitySneakyMissWindow(entity: MapEntity): void {
    if (entity.attackersMissPersistFrames <= 0) {
      return;
    }

    // Source parity subset: JetAIUpdate::update() refreshes m_attackersMissExpireFrame while
    // OBJECT_STATUS_IS_ATTACKING is set on the object.
    if (entity.objectStatusFlags.has('IS_ATTACKING')) {
      entity.attackersMissExpireFrame = this.frameCounter + entity.attackersMissPersistFrames;
      return;
    }

    if (entity.attackersMissExpireFrame !== 0 && this.frameCounter >= entity.attackersMissExpireFrame) {
      entity.attackersMissExpireFrame = 0;
    }
  }

  private entityHasSneakyTargetingOffset(entity: MapEntity): boolean {
    return entity.attackersMissExpireFrame !== 0 && this.frameCounter < entity.attackersMissExpireFrame;
  }

  private resolveEntitySneakyTargetingOffset(entity: MapEntity): VectorXZ | null {
    if (!this.entityHasSneakyTargetingOffset(entity)) {
      return null;
    }

    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(entity.mesh.quaternion);
    const length = Math.hypot(forward.x, forward.z);
    if (!Number.isFinite(length) || length <= 0) {
      return { x: 0, z: 0 };
    }

    const scale = entity.sneakyOffsetWhenAttacking / length;
    return {
      x: forward.x * scale,
      z: forward.z * scale,
    };
  }

  private resolveScaledProjectileTravelSpeed(weapon: AttackWeaponProfile, sourceToAimDistance: number): number {
    if (!weapon.scaleWeaponSpeed) {
      return weapon.weaponSpeed;
    }

    const minRange = Math.max(0, weapon.minAttackRange - ATTACK_RANGE_CELL_EDGE_FUDGE);
    const maxRange = Math.max(minRange, weapon.unmodifiedAttackRange);
    const rangeRatio = (sourceToAimDistance - minRange) / (maxRange - minRange);
    const scaledSpeed = (rangeRatio * (weapon.weaponSpeed - weapon.minWeaponSpeed)) + weapon.minWeaponSpeed;

    // Source parity subset: DumbProjectileBehavior::projectileFireAtObjectOrPosition()
    // scales launch speed from minimum-range to unmodified-attack-range distance.
    // TODO(C&C source parity): mirror full dumb-projectile bezier-path distance (calcFlightPath)
    // and per-projectile update/collision timing instead of straight-line travel delay.
    return scaledSpeed;
  }

  private resolveProjectileScatterRadiusForTarget(weapon: AttackWeaponProfile, target: MapEntity): number {
    let scatter = Math.max(0, weapon.scatterRadius);
    if (target.category === 'infantry') {
      scatter += Math.max(0, weapon.scatterRadiusVsInfantry);
    }
    return scatter;
  }

  private updatePendingWeaponDamage(): void {
    if (this.pendingWeaponDamageEvents.length === 0) {
      return;
    }

    const remainingEvents: PendingWeaponDamageEvent[] = [];
    for (const event of this.pendingWeaponDamageEvents) {
      if (event.executeFrame > this.frameCounter) {
        remainingEvents.push(event);
        continue;
      }
      this.applyWeaponDamageEvent(event);
    }

    this.pendingWeaponDamageEvents.length = 0;
    this.pendingWeaponDamageEvents.push(...remainingEvents);
  }

  private applyWeaponDamageEvent(event: PendingWeaponDamageEvent): void {
    const weapon = event.weapon;
    if (event.delivery === 'PROJECTILE') {
      // Source parity subset: damage arrives via projectile detonation/collision timing.
      // TODO(C&C source parity): replace with spawned projectile entities and
      // shouldProjectileCollideWith()/ProjectileUpdateInterface behavior.
    }
    const source = this.spawnedEntities.get(event.sourceEntityId) ?? null;
    const primaryVictim = event.primaryVictimEntityId !== null
      ? (this.spawnedEntities.get(event.primaryVictimEntityId) ?? null)
      : null;
    const primaryVictimWasAlive = !!primaryVictim && !primaryVictim.destroyed && primaryVictim.canTakeDamage;

    let impactX = event.impactX;
    let impactZ = event.impactZ;
    if (event.delivery === 'DIRECT' && primaryVictim && !primaryVictim.destroyed) {
      impactX = primaryVictim.mesh.position.x;
      impactZ = primaryVictim.mesh.position.z;
    }

    const primaryRadius = Math.max(0, weapon.primaryDamageRadius);
    const secondaryRadius = Math.max(0, weapon.secondaryDamageRadius);
    const radiusDamageAngle = Math.max(0, weapon.radiusDamageAngle);
    const radiusDamageAngleCos = Math.cos(radiusDamageAngle);
    const primaryRadiusSqr = primaryRadius * primaryRadius;
    const effectRadius = Math.max(primaryRadius, secondaryRadius);
    const effectRadiusSqr = effectRadius * effectRadius;
    const sourceFacingVector = source
      ? new THREE.Vector3(1, 0, 0).applyQuaternion(source.mesh.quaternion).normalize()
      : null;

    const victims: Array<{ entity: MapEntity; distanceSqr: number }> = [];
    if (effectRadius > 0) {
      for (const entity of this.spawnedEntities.values()) {
        if (entity.destroyed || !entity.canTakeDamage) {
          continue;
        }
        const dx = entity.mesh.position.x - impactX;
        const dz = entity.mesh.position.z - impactZ;
        const distanceSqr = dx * dx + dz * dz;
        if (distanceSqr <= effectRadiusSqr) {
          victims.push({ entity, distanceSqr });
        }
      }
      victims.sort((left, right) => left.entity.id - right.entity.id);
    } else if (primaryVictim && !primaryVictim.destroyed && primaryVictim.canTakeDamage) {
      if (event.delivery === 'PROJECTILE') {
        const collisionRadius = this.resolveProjectilePointCollisionRadius(primaryVictim);
        const dx = primaryVictim.mesh.position.x - impactX;
        const dz = primaryVictim.mesh.position.z - impactZ;
        const distanceSqr = dx * dx + dz * dz;
        if (distanceSqr <= collisionRadius * collisionRadius) {
          victims.push({ entity: primaryVictim, distanceSqr: 0 });
        } else {
          const incidentalVictim = this.resolveProjectileIncidentalVictimForPointImpact(
            source,
            weapon,
            primaryVictim.id,
            impactX,
            impactZ,
          );
          if (incidentalVictim) {
            victims.push({ entity: incidentalVictim, distanceSqr: 0 });
          }
        }
      } else {
        victims.push({ entity: primaryVictim, distanceSqr: 0 });
      }
    } else if (event.delivery === 'PROJECTILE') {
      const incidentalVictim = this.resolveProjectileIncidentalVictimForPointImpact(
        source,
        weapon,
        primaryVictim?.id ?? null,
        impactX,
        impactZ,
      );
      if (incidentalVictim) {
        victims.push({ entity: incidentalVictim, distanceSqr: 0 });
      }
    }

    if (
      victims.length === 0
      && source
      && (weapon.radiusDamageAffectsMask & WEAPON_KILLS_SELF) !== 0
      && effectRadius <= 0
    ) {
      this.applyWeaponDamageAmount(source.id, source, HUGE_DAMAGE_AMOUNT, weapon.damageType);
      return;
    }

    for (const victim of victims) {
      const candidate = victim.entity;
      let killSelf = false;

      if (radiusDamageAngle < Math.PI) {
        if (!source || !sourceFacingVector) {
          continue;
        }
        const damageVector = new THREE.Vector3(
          candidate.mesh.position.x - source.mesh.position.x,
          0,
          candidate.mesh.position.z - source.mesh.position.z,
        ).normalize();
        // Source parity subset: WeaponTemplate::dealDamageInternal gates radius damage by
        // comparing source orientation to candidate direction against RadiusDamageAngle.
        // TODO(C&C source parity): include full 3D source/candidate vectors once altitude and
        // pitch-limited facing are represented in simulation data.
        if (sourceFacingVector.dot(damageVector) < radiusDamageAngleCos) {
          continue;
        }
      }

      if (source && candidate !== primaryVictim) {
        if (
          (weapon.radiusDamageAffectsMask & WEAPON_KILLS_SELF) !== 0
          && candidate.id === source.id
        ) {
          killSelf = true;
        } else {
          if (
            (weapon.radiusDamageAffectsMask & WEAPON_AFFECTS_SELF) === 0
            && candidate.id === source.id
          ) {
            continue;
          }
          if (
            (weapon.radiusDamageAffectsMask & WEAPON_DOESNT_AFFECT_SIMILAR) !== 0
            && this.getTeamRelationship(source, candidate) === RELATIONSHIP_ALLIES
            && source.templateName.trim().toUpperCase() === candidate.templateName.trim().toUpperCase()
          ) {
            continue;
          }

          // TODO(C&C source parity): implement WEAPON_DOESNT_AFFECT_AIRBORNE via
          // Object::isSignificantlyAboveTerrain once 3D movement altitude parity is represented.
          let requiredMask = WEAPON_AFFECTS_NEUTRALS;
          const relationship = this.getTeamRelationship(source, candidate);
          if (relationship === RELATIONSHIP_ALLIES) {
            requiredMask = WEAPON_AFFECTS_ALLIES;
          } else if (relationship === RELATIONSHIP_ENEMIES) {
            requiredMask = WEAPON_AFFECTS_ENEMIES;
          }
          if ((weapon.radiusDamageAffectsMask & requiredMask) === 0) {
            continue;
          }
        }
      }

      const rawAmount = killSelf
        ? HUGE_DAMAGE_AMOUNT
        : (victim.distanceSqr <= primaryRadiusSqr ? weapon.primaryDamage : weapon.secondaryDamage);
      this.applyWeaponDamageAmount(source?.id ?? null, candidate, rawAmount, weapon.damageType);
    }

    if (source && primaryVictimWasAlive && primaryVictim && primaryVictim.destroyed) {
      this.tryContinueAttackOnVictimDeath(source, primaryVictim, weapon);
    }

    // TODO(C&C source parity): use 3D/bounding-volume damage distance checks from
    // PartitionManager::iterateObjectsInRange(DAMAGE_RANGE_CALC_TYPE).
  }

  private tryContinueAttackOnVictimDeath(
    attacker: MapEntity,
    destroyedVictim: MapEntity,
    weapon: AttackWeaponProfile,
  ): void {
    const continueRange = Math.max(0, weapon.continueAttackRange);
    if (continueRange <= 0) {
      return;
    }
    if (attacker.destroyed || !this.canEntityAttackFromStatus(attacker)) {
      return;
    }
    if (attacker.attackTargetEntityId !== destroyedVictim.id) {
      return;
    }
    const originalVictimPosition = attacker.attackOriginalVictimPosition;
    if (!originalVictimPosition) {
      return;
    }

    const replacementVictim = this.findContinueAttackVictim(
      attacker,
      destroyedVictim,
      originalVictimPosition,
      continueRange,
    );
    if (!replacementVictim) {
      return;
    }

    attacker.attackTargetEntityId = replacementVictim.id;
    // Source parity subset: AIAttackState::notifyNewVictimChosen() does not update
    // m_originalVictimPos. Keep the initial victim position for chained reacquire.
    // TODO(C&C source parity): source PartitionFilterSamePlayer uses controlling-player
    // pointers from fully decoded map object ownership data. This port currently depends
    // on string-keyed originalOwner and does not decode NameKey-keyed properties yet.
    // Also mirror full Object::isOffMap/private-map-status semantics from
    // AIAttackFireWeaponState.
  }

  private findContinueAttackVictim(
    attacker: MapEntity,
    destroyedVictim: MapEntity,
    originalVictimPosition: VectorXZ,
    continueRange: number,
  ): MapEntity | null {
    const continueRangeSqr = continueRange * continueRange;
    const victimPlayerToken = destroyedVictim.controllingPlayerToken;
    if (!victimPlayerToken) {
      // TODO(C&C source parity): ContinueAttack uses PartitionFilterSamePlayer with
      // victim->getControllingPlayer(). Do not reacquire when map ownership data is not
      // available yet (e.g. unresolved NameKey-keyed originalOwner conversion).
      return null;
    }
    let bestCandidate: MapEntity | null = null;
    let bestDistanceSqr = Number.POSITIVE_INFINITY;

    for (const candidate of this.spawnedEntities.values()) {
      if (candidate.destroyed || !candidate.canTakeDamage) {
        continue;
      }
      if (candidate.id === attacker.id || candidate.id === destroyedVictim.id) {
        continue;
      }
      if (!this.canAttackerTargetEntity(attacker, candidate, attacker.attackCommandSource)) {
        continue;
      }
      if (candidate.controllingPlayerToken !== victimPlayerToken) {
        continue;
      }

      const dx = candidate.mesh.position.x - originalVictimPosition.x;
      const dz = candidate.mesh.position.z - originalVictimPosition.z;
      const distanceSqr = (dx * dx) + (dz * dz);
      if (distanceSqr > continueRangeSqr) {
        continue;
      }

      if (
        !bestCandidate
        || distanceSqr < bestDistanceSqr
        || (distanceSqr === bestDistanceSqr && candidate.id < bestCandidate.id)
      ) {
        bestCandidate = candidate;
        bestDistanceSqr = distanceSqr;
      }
    }

    return bestCandidate;
  }

  private resolveProjectilePointCollisionRadius(entity: MapEntity): number {
    if (entity.obstacleGeometry) {
      return Math.max(0, Math.max(entity.obstacleGeometry.majorRadius, entity.obstacleGeometry.minorRadius));
    }
    if (entity.obstacleFootprint > 0) {
      return entity.obstacleFootprint * (MAP_XY_FACTOR * 0.5);
    }
    if (entity.pathDiameter > 0) {
      return Math.max(MAP_XY_FACTOR * 0.5, entity.pathDiameter * (MAP_XY_FACTOR * 0.5));
    }

    // Source parity subset: without full per-projectile collision volumes, approximate point-hit
    // overlap by at least half a cell for small movers.
    // TODO(C&C source parity): replace with spawned projectile entities and precise
    // shouldProjectileCollideWith()/geometry intersection checks.
    return MAP_XY_FACTOR * 0.5;
  }

  private resolveProjectileIncidentalVictimForPointImpact(
    projectileLauncher: MapEntity | null,
    weapon: AttackWeaponProfile,
    intendedVictimId: number | null,
    impactX: number,
    impactZ: number,
  ): MapEntity | null {
    const candidates: MapEntity[] = [];
    for (const candidate of this.spawnedEntities.values()) {
      if (candidate.destroyed || !candidate.canTakeDamage) {
        continue;
      }
      if (intendedVictimId !== null && candidate.id === intendedVictimId) {
        continue;
      }
      candidates.push(candidate);
    }
    candidates.sort((left, right) => left.id - right.id);

    for (const candidate of candidates) {
      const collisionRadius = this.resolveProjectilePointCollisionRadius(candidate);
      const dx = candidate.mesh.position.x - impactX;
      const dz = candidate.mesh.position.z - impactZ;
      const distanceSqr = dx * dx + dz * dz;
      if (distanceSqr > collisionRadius * collisionRadius) {
        continue;
      }
      if (!this.shouldProjectileCollideWithEntity(projectileLauncher, weapon, candidate, intendedVictimId)) {
        continue;
      }
      return candidate;
    }

    return null;
  }

  private shouldProjectileCollideWithEntity(
    projectileLauncher: MapEntity | null,
    weapon: AttackWeaponProfile,
    candidate: MapEntity,
    intendedVictimId: number | null,
  ): boolean {
    if (intendedVictimId !== null && candidate.id === intendedVictimId) {
      return true;
    }

    if (projectileLauncher && projectileLauncher.id === candidate.id) {
      return false;
    }

    if (projectileLauncher) {
      const launcherContainer = this.resolveProjectileLauncherContainer(projectileLauncher);
      if (launcherContainer && launcherContainer.id === candidate.id) {
        return false;
      }
    }

    if (
      (weapon.damageType === 'FLAME' || weapon.damageType === 'PARTICLE_BEAM')
      && candidate.objectStatusFlags.has('BURNED')
    ) {
      return false;
    }

    const kindOf = this.resolveEntityKindOfSet(candidate);
    if (this.isAirfieldReservedForProjectileVictim(candidate, kindOf, intendedVictimId)) {
      return false;
    }

    if (this.entityHasSneakyTargetingOffset(candidate)) {
      return false;
    }

    let requiredMask = 0;
    if (projectileLauncher) {
      const relationship = this.getTeamRelationship(projectileLauncher, candidate);
      if (relationship === RELATIONSHIP_ALLIES) {
        requiredMask |= WEAPON_COLLIDE_ALLIES;
      } else if (relationship === RELATIONSHIP_ENEMIES) {
        requiredMask |= WEAPON_COLLIDE_ENEMIES;
      }
    }

    if (kindOf.has('STRUCTURE')) {
      const launcherSide = this.normalizeSide(projectileLauncher?.side);
      const candidateSide = this.normalizeSide(candidate.side);
      if (launcherSide && candidateSide && launcherSide === candidateSide) {
        requiredMask |= WEAPON_COLLIDE_CONTROLLED_STRUCTURES;
      } else {
        requiredMask |= WEAPON_COLLIDE_STRUCTURES;
      }
    }
    if (kindOf.has('SHRUBBERY')) {
      requiredMask |= WEAPON_COLLIDE_SHRUBBERY;
    }
    if (kindOf.has('PROJECTILE')) {
      requiredMask |= WEAPON_COLLIDE_PROJECTILE;
    }
    if (this.resolveEntityFenceWidth(candidate) > 0) {
      requiredMask |= WEAPON_COLLIDE_WALLS;
    }
    if (kindOf.has('SMALL_MISSILE')) {
      requiredMask |= WEAPON_COLLIDE_SMALL_MISSILES;
    }
    if (kindOf.has('BALLISTIC_MISSILE')) {
      requiredMask |= WEAPON_COLLIDE_BALLISTIC_MISSILES;
    }

    if (requiredMask === 0) {
      return false;
    }
    return (weapon.projectileCollideMask & requiredMask) !== 0;
  }

  private resolveProjectileLauncherContainer(projectileLauncher: MapEntity): MapEntity | null {
    const containerId = projectileLauncher.parkingSpaceProducerId;
    if (containerId === null) {
      return null;
    }

    const container = this.spawnedEntities.get(containerId);
    if (!container || container.destroyed) {
      return null;
    }

    // Source parity subset: map getContainedBy() to parking producer containment.
    // TODO(C&C source parity): extend to full transport/building containment once
    // generic contain/transport behavior state exists in the simulation.
    return container;
  }

  private isAirfieldReservedForProjectileVictim(
    candidate: MapEntity,
    candidateKindOf: Set<string>,
    intendedVictimId: number | null,
  ): boolean {
    if (intendedVictimId === null) {
      return false;
    }
    if (!candidateKindOf.has('FS_AIRFIELD')) {
      return false;
    }

    const parkingProfile = candidate.parkingPlaceProfile;
    if (!parkingProfile) {
      return false;
    }

    if (parkingProfile.occupiedSpaceEntityIds.has(intendedVictimId)) {
      return true;
    }

    const intendedVictim = this.spawnedEntities.get(intendedVictimId);
    if (intendedVictim?.parkingSpaceProducerId === candidate.id) {
      return true;
    }

    // TODO(C&C source parity): model full ParkingPlaceBehaviorInterface::hasReservedSpace()
    // checks for intended victim IDs that are reserved but not currently parked.
    return false;
  }

  private resolveEntityKindOfSet(entity: MapEntity): Set<string> {
    const kindOf = new Set<string>();
    switch (entity.category) {
      case 'building':
        kindOf.add('STRUCTURE');
        break;
      case 'infantry':
        kindOf.add('INFANTRY');
        break;
      case 'air':
        kindOf.add('AIRCRAFT');
        break;
      case 'vehicle':
      default:
        break;
    }

    const registry = this.iniDataRegistry;
    if (!registry) {
      return kindOf;
    }
    const objectDef = this.findObjectDefByName(registry, entity.templateName);
    if (!objectDef) {
      return kindOf;
    }
    for (const flag of this.normalizeKindOf(objectDef.kindOf)) {
      kindOf.add(flag);
    }
    return kindOf;
  }

  private resolveEntityContainingObject(entity: MapEntity): MapEntity | null {
    // Source parity subset: map getContainedBy()/contain module checks onto the
    // currently represented production/parking container relation.
    return this.resolveProjectileLauncherContainer(entity);
  }

  private isPassengerAllowedToFireFromContainingObject(
    entity: MapEntity,
    container: MapEntity,
  ): boolean {
    // Source parity:
    // - Object::isAbleToAttack() first gates attacks when container->isPassengerAllowedToFire() is false.
    //   (Generals/Code/GameEngine/Source/GameLogic/Object/Object.cpp:2865)
    // - WeaponSet::getAbleToUseWeaponAgainstTarget() checks container riders when allowed.
    //   (Generals/Code/GameEngine/Source/GameLogic/Object/WeaponSet.cpp:711)
    // - OpenContain recursively delegates to a parent container; OverlordContain redirect chains
    //   similarly in the engine.
    //   (OpenContain.cpp:1035, OverlordContain.cpp:99)
    const kindOf = this.resolveEntityKindOfSet(entity);
    const isInfantry = kindOf.has('INFANTRY');
    const isPortableStructure = kindOf.has('PORTABLE_STRUCTURE');
    const visited = new Set<number>();

    const isAllowed = (currentContainer: MapEntity): boolean => {
      if (visited.has(currentContainer.id)) {
        // Cycle-guard for malformed nesting in test data.
        return false;
      }
      visited.add(currentContainer.id);

      const containProfile = currentContainer.containProfile;
      if (!containProfile) {
        // Unknown container module shape: keep permissive behavior.
        return true;
      }

      const parent = this.resolveEntityContainingObject(currentContainer);
      const parentProfile = parent?.containProfile;
      const isParentOverlordStyle = parentProfile?.moduleType === 'OVERLORD' || parentProfile?.moduleType === 'HELIX';

      if (containProfile.moduleType === 'OPEN') {
        if (!containProfile.passengersAllowedToFire) {
          return false;
        }
        return parent ? isAllowed(parent) : true;
      }

      if (containProfile.moduleType === 'TRANSPORT') {
        if (!isInfantry) {
          return false;
        }

        if (parent && isParentOverlordStyle) {
          return isAllowed(parent);
        }

        return containProfile.passengersAllowedToFire;
      }

      if (containProfile.moduleType === 'OVERLORD') {
        if (!isInfantry && !isPortableStructure) {
          return false;
        }
        if (parent) {
          return false;
        }
        return containProfile.passengersAllowedToFire;
      }

      if (containProfile.moduleType === 'HELIX') {
        if (parent) {
          return false;
        }
        if (isPortableStructure) {
          const payloadTemplateNames = currentContainer.containProfile?.portableStructureTemplateNames;
          const templateName = entity.templateName.toUpperCase();
          if (payloadTemplateNames && payloadTemplateNames.length > 0 && !payloadTemplateNames.includes(templateName)) {
            return false;
          }
          // Source parity: HelixContain::isPassengerAllowedToFire returns true only for the
          // currently tracked portableStructureID; nested riders always fail.
          // (GeneralsMD/Code/GameEngine/Source/GameLogic/Object/Contain/HelixContain.cpp:364-373)
          return currentContainer.helixPortableRiderId === entity.id;
        }
        if (!isInfantry) {
          return false;
        }
        return containProfile.passengersAllowedToFire;
      }

      if (containProfile.moduleType === 'GARRISON') {
        // GarrisonContain.cpp returns TRUE only when container is not disabled.
        // See Generals/Code/GameEngine/Source/GameLogic/Object/Contain/GarrisonContain.cpp.
        if (this.entityHasObjectStatus(currentContainer, 'DISABLED_SUBDUED')) {
          return false;
        }
        return true;
      }

      return true;
    };

    return isAllowed(container);
  }

  private resolveEntityFenceWidth(entity: MapEntity): number {
    const registry = this.iniDataRegistry;
    if (!registry) {
      return 0;
    }
    const objectDef = this.findObjectDefByName(registry, entity.templateName);
    if (!objectDef) {
      return 0;
    }
    const fenceWidth = readNumericField(objectDef.fields, ['FenceWidth']) ?? 0;
    if (!Number.isFinite(fenceWidth) || fenceWidth <= 0) {
      return 0;
    }
    return fenceWidth;
  }

  private updateWeaponIdleAutoReload(): void {
    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed) {
        continue;
      }

      const weapon = entity.attackWeapon;
      if (!weapon) {
        continue;
      }
      if (weapon.autoReloadWhenIdleFrames <= 0) {
        continue;
      }

      const forceReloadFrame = entity.attackForceReloadFrame;
      if (forceReloadFrame <= 0 || this.frameCounter < forceReloadFrame) {
        continue;
      }

      entity.attackForceReloadFrame = 0;
      if (weapon.clipSize <= 0) {
        continue;
      }
      if (entity.attackAmmoInClip >= weapon.clipSize) {
        continue;
      }

      // Source parity subset: FiringTracker::update() calls Object::reloadAllAmmo(TRUE),
      // forcing an immediate reload after sustained idle time.
      entity.attackAmmoInClip = weapon.clipSize;
      this.rebuildEntityScatterTargets(entity);
      entity.attackReloadFinishFrame = 0;
      if (entity.nextAttackFrame > this.frameCounter) {
        entity.nextAttackFrame = this.frameCounter;
      }

      // TODO(C&C source parity): port full FiringTracker behavior
      // (continuous-fire speedup/cooldown states and looping fire-audio management).
    }
  }

  private computeAttackRetreatTarget(
    attacker: MapEntity,
    target: MapEntity,
    weapon: AttackWeaponProfile,
  ): VectorXZ | null {
    const targetX = target.mesh.position.x;
    const targetZ = target.mesh.position.z;
    let awayX = attacker.mesh.position.x - targetX;
    let awayZ = attacker.mesh.position.z - targetZ;
    const length = Math.hypot(awayX, awayZ);
    if (length <= 1e-6) {
      awayX = 1;
      awayZ = 0;
    } else {
      awayX /= length;
      awayZ /= length;
    }

    const minAttackRange = Math.max(0, weapon.minAttackRange);
    const attackRange = Math.max(minAttackRange, weapon.attackRange);
    const desiredDistance = (attackRange + minAttackRange) * 0.5;
    if (!Number.isFinite(desiredDistance) || desiredDistance <= 0) {
      return null;
    }

    // Source parity subset: Weapon::computeApproachTarget() retreats too-close attackers to a
    // point between minimum and maximum range.
    // TODO(C&C source parity): port angleOffset/aircraft-facing/terrain-clipping behavior.
    return {
      x: targetX + awayX * desiredDistance,
      z: targetZ + awayZ * desiredDistance,
    };
  }

  private resetEntityWeaponTimingState(entity: MapEntity): void {
    const clipSize = entity.attackWeapon?.clipSize ?? 0;
    entity.attackAmmoInClip = clipSize > 0 ? clipSize : 0;
    entity.attackReloadFinishFrame = 0;
    entity.attackForceReloadFrame = 0;
    this.rebuildEntityScatterTargets(entity);
    entity.preAttackFinishFrame = 0;
    entity.consecutiveShotsTargetEntityId = null;
    entity.consecutiveShotsAtTarget = 0;
  }

  private rebuildEntityScatterTargets(entity: MapEntity): void {
    const scatterTargetsCount = entity.attackWeapon?.scatterTargets.length ?? 0;
    entity.attackScatterTargetsUnused = Array.from({ length: scatterTargetsCount }, (_entry, index) => index);
  }

  private getConsecutiveShotsFiredAtTarget(entity: MapEntity, targetEntityId: number): number {
    if (entity.consecutiveShotsTargetEntityId !== targetEntityId) {
      return 0;
    }
    return entity.consecutiveShotsAtTarget;
  }

  private resolveWeaponPreAttackDelayFrames(
    attacker: MapEntity,
    target: MapEntity,
    weapon: AttackWeaponProfile,
  ): number {
    const delay = Math.max(0, Math.trunc(weapon.preAttackDelayFrames));
    if (delay <= 0) {
      return 0;
    }

    if (weapon.preAttackType === 'PER_ATTACK') {
      if (this.getConsecutiveShotsFiredAtTarget(attacker, target.id) > 0) {
        return 0;
      }
      return delay;
    }

    if (weapon.preAttackType === 'PER_CLIP') {
      if (weapon.clipSize > 0 && attacker.attackAmmoInClip < weapon.clipSize) {
        return 0;
      }
      return delay;
    }

    return delay;
  }

  private recordConsecutiveAttackShot(attacker: MapEntity, targetEntityId: number): void {
    if (attacker.consecutiveShotsTargetEntityId === targetEntityId) {
      attacker.consecutiveShotsAtTarget += 1;
      return;
    }
    attacker.consecutiveShotsTargetEntityId = targetEntityId;
    attacker.consecutiveShotsAtTarget = 1;
  }

  private resolveWeaponDelayFrames(weapon: AttackWeaponProfile): number {
    const minDelay = Math.max(0, Math.trunc(weapon.minDelayFrames));
    const maxDelay = Math.max(minDelay, Math.trunc(weapon.maxDelayFrames));
    if (minDelay === maxDelay) {
      return minDelay;
    }
    return this.gameRandom.nextRange(minDelay, maxDelay);
  }

  private applyWeaponDamageAmount(
    sourceEntityId: number | null,
    target: MapEntity,
    amount: number,
    damageType: string,
  ): void {
    if (!target.canTakeDamage || target.destroyed || !Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const adjustedDamage = this.adjustDamageByArmorSet(target, amount, damageType);
    if (adjustedDamage <= 0) {
      return;
    }

    target.health = Math.max(0, target.health - adjustedDamage);
    if (target.health <= 0) {
      this.markEntityDestroyed(target.id, sourceEntityId ?? -1);
    }
  }

  private adjustDamageByArmorSet(target: MapEntity, amount: number, damageType: string): number {
    const normalizedType = damageType.trim().toUpperCase();
    if (normalizedType === 'UNRESISTABLE') {
      return amount;
    }

    const coefficients = target.armorDamageCoefficients;
    if (!coefficients) {
      return amount;
    }

    const coefficient = coefficients.get(normalizedType);
    if (coefficient === undefined) {
      return amount;
    }

    return Math.max(0, amount * coefficient);
  }

  private markEntityDestroyed(entityId: number, _attackerId: number): void {
    void _attackerId;
    const entity = this.spawnedEntities.get(entityId);
    if (!entity || entity.destroyed) {
      return;
    }
    const completedUpgradeNames = Array.from(entity.completedUpgrades.values());
    for (const completedUpgradeName of completedUpgradeNames) {
      this.removeEntityUpgrade(entity, completedUpgradeName);
    }
    this.cancelAndRefundAllProductionOnDeath(entity);
    // Source parity: upgrade modules clean up side state via removeEntityUpgrade/onDelete parity.
    entity.destroyed = true;
    entity.moving = false;
    entity.moveTarget = null;
    entity.movePath = [];
    entity.pathIndex = 0;
    entity.pathfindGoalCell = null;
    entity.attackTargetEntityId = null;
    entity.attackOriginalVictimPosition = null;
    entity.attackCommandSource = 'AI';
    this.onObjectDestroyed(entityId);
  }

  private cancelAndRefundAllProductionOnDeath(producer: MapEntity): void {
    if (producer.productionQueue.length === 0) {
      return;
    }

    // Source parity: ProductionUpdate::onDie() calls cancelAndRefundAllProduction(),
    // which iterates queue entries through cancel paths to restore player money/state.
    const productionLimit = 100;
    for (let i = 0; i < productionLimit && producer.productionQueue.length > 0; i += 1) {
      const production = producer.productionQueue[0];
      if (!production) {
        break;
      }

      if (production.type === 'UPGRADE' && production.upgradeType === 'PLAYER') {
        this.setSideUpgradeInProduction(producer.side ?? '', production.upgradeName, false);
      }
      if (production.type === 'UNIT') {
        this.releaseParkingDoorReservationForProduction(producer, production.productionId);
      }

      this.depositSideCredits(producer.side, production.buildCost);
      producer.productionQueue.shift();
    }
  }

  private finalizeDestroyedEntities(): void {
    const destroyedEntityIds: number[] = [];
    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed) {
        destroyedEntityIds.push(entity.id);
      }
    }

    if (destroyedEntityIds.length === 0) {
      return;
    }

    for (const entity of this.spawnedEntities.values()) {
      if (entity.attackTargetEntityId !== null && destroyedEntityIds.includes(entity.attackTargetEntityId)) {
        entity.attackTargetEntityId = null;
        entity.attackOriginalVictimPosition = null;
        entity.attackCommandSource = 'AI';
      }
    }

    for (const entityId of destroyedEntityIds) {
      const entity = this.spawnedEntities.get(entityId);
      if (!entity) {
        continue;
      }
      if (entity.parkingSpaceProducerId !== null) {
        const producer = this.spawnedEntities.get(entity.parkingSpaceProducerId);
        if (producer?.parkingPlaceProfile) {
          producer.parkingPlaceProfile.occupiedSpaceEntityIds.delete(entity.id);
        }
        entity.parkingSpaceProducerId = null;
      }
      if (entity.helixCarrierId !== null) {
        const carrier = this.spawnedEntities.get(entity.helixCarrierId);
        if (carrier?.helixPortableRiderId === entity.id) {
          carrier.helixPortableRiderId = null;
        }
        entity.helixCarrierId = null;
      }
      if (entity.helixPortableRiderId !== null) {
        entity.helixPortableRiderId = null;
      }
      this.scene.remove(entity.mesh);
      this.spawnedEntities.delete(entityId);
      if (this.selectedEntityId === entityId) {
        this.selectedEntityId = null;
      }
    }
  }

  private updateEntityMovement(dt: number): void {
    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed) {
        continue;
      }
      if (entity.canMove) {
        this.updatePathfindPosCell(entity);
      }
    }

    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed) {
        continue;
      }
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

  private writeDeterministicObjectsCrc(
    crc: XferCrcAccumulator,
    _snapshot: DeterministicFrameSnapshot<unknown>,
  ): void {
    // Source parity:
    // - Generals/Code/GameEngine/Source/GameLogic/System/GameLogic.cpp (GameLogic::getCRC)
    //   iterates m_objList order via getNextObject().
    // We mirror runtime-owned insertion order instead of sorting by ID.
    // TODO(source parity): replace this with the true object-list owner order
    // once object lifecycle ownership is promoted from scaffolding.
    const entities = Array.from(this.spawnedEntities.values());
    crc.addUnsignedInt(entities.length >>> 0);

    for (const entity of entities) {
      this.addSignedIntCrc(crc, entity.id);
      crc.addAsciiString(entity.templateName);
      crc.addAsciiString(entity.category);
      crc.addAsciiString(entity.side ?? '');
      crc.addUnsignedByte(entity.resolved ? 1 : 0);
      crc.addUnsignedByte(entity.selected ? 1 : 0);
      crc.addUnsignedByte(entity.canMove ? 1 : 0);
      crc.addUnsignedByte(entity.moving ? 1 : 0);
      crc.addUnsignedByte(entity.blocksPath ? 1 : 0);
      crc.addUnsignedByte(entity.pathfindCenterInCell ? 1 : 0);
      crc.addUnsignedByte(entity.locomotorUpgradeEnabled ? 1 : 0);
      crc.addUnsignedByte(entity.locomotorDownhillOnly ? 1 : 0);
      crc.addUnsignedByte(entity.isUnmanned ? 1 : 0);
      crc.addUnsignedByte(entity.attackNeedsLineOfSight ? 1 : 0);
      crc.addUnsignedByte(entity.isImmobile ? 1 : 0);
      crc.addUnsignedInt(Math.trunc(entity.crusherLevel) >>> 0);
      crc.addUnsignedInt(Math.trunc(entity.crushableLevel) >>> 0);
      if (entity.helixCarrierId !== null) {
        crc.addUnsignedByte(1);
        // Deterministic state: include helix rider/carrier linkage used by HELIX contain rules.
        this.addSignedIntCrc(crc, entity.helixCarrierId);
      } else {
        crc.addUnsignedByte(0);
      }
      if (entity.helixPortableRiderId !== null) {
        crc.addUnsignedByte(1);
        // Deterministic state: include helix rider/carrier linkage used by HELIX contain rules.
        this.addSignedIntCrc(crc, entity.helixPortableRiderId);
      } else {
        crc.addUnsignedByte(0);
      }
      crc.addUnsignedInt(Math.trunc(entity.pathDiameter) >>> 0);
      crc.addUnsignedInt(Math.trunc(entity.obstacleFootprint) >>> 0);
      crc.addUnsignedInt(Math.trunc(entity.pathIndex) >>> 0);
      crc.addAsciiString(entity.activeLocomotorSet);
      crc.addUnsignedInt(entity.locomotorSurfaceMask >>> 0);
      this.addFloat32Crc(crc, entity.baseHeight);
      this.addFloat32Crc(crc, entity.nominalHeight);
      this.addFloat32Crc(crc, entity.speed);
      this.addFloat32Crc(crc, entity.largestWeaponRange);
      this.addFloat32Crc(crc, entity.mesh.position.x);
      this.addFloat32Crc(crc, entity.mesh.position.y);
      this.addFloat32Crc(crc, entity.mesh.position.z);
      this.addFloat32Crc(crc, entity.mesh.rotation.y);
      this.writeNullableVectorCrc(crc, entity.moveTarget);
      this.writeVectorArrayCrc(crc, entity.movePath);
      this.writeNullableGridCellCrc(crc, entity.pathfindGoalCell);
      this.writeNullableGridCellCrc(crc, entity.pathfindPosCell);

      if (entity.ignoredMovementObstacleId !== null) {
        crc.addUnsignedByte(1);
        this.addSignedIntCrc(crc, entity.ignoredMovementObstacleId);
      } else {
        crc.addUnsignedByte(0);
      }

      if (entity.obstacleGeometry) {
        crc.addUnsignedByte(1);
        crc.addAsciiString(entity.obstacleGeometry.shape);
        this.addFloat32Crc(crc, entity.obstacleGeometry.majorRadius);
        this.addFloat32Crc(crc, entity.obstacleGeometry.minorRadius);
      } else {
        crc.addUnsignedByte(0);
      }

      const locomotorSetNames = Array.from(entity.locomotorSets.keys()).sort();
      crc.addUnsignedInt(locomotorSetNames.length >>> 0);
      for (const setName of locomotorSetNames) {
        const profile = entity.locomotorSets.get(setName);
        if (!profile) {
          continue;
        }
        crc.addAsciiString(setName);
        crc.addUnsignedInt(profile.surfaceMask >>> 0);
        crc.addUnsignedByte(profile.downhillOnly ? 1 : 0);
        this.addFloat32Crc(crc, profile.movementSpeed);
      }

      const upgradeTriggers = Array.from(entity.locomotorUpgradeTriggers.values()).sort();
      crc.addUnsignedInt(upgradeTriggers.length >>> 0);
      for (const upgradeTrigger of upgradeTriggers) {
        crc.addAsciiString(upgradeTrigger);
      }
    }
  }

  private writeDeterministicPartitionManagerCrc(
    crc: XferCrcAccumulator,
    _snapshot: DeterministicFrameSnapshot<unknown>,
  ): void {
    // Source parity:
    // - Generals/Code/GameEngine/Source/GameLogic/System/GameLogic.cpp (GameLogic::getCRC)
    //   xfers ThePartitionManager snapshot directly.
    // TODO(source parity): swap these runtime-owned bridge/nav fields for
    // serialized partition-manager snapshot data from the ported owner.
    const grid = this.navigationGrid;
    crc.addUnsignedByte(grid ? 1 : 0);
    if (!grid) {
      return;
    }

    this.addSignedIntCrc(crc, grid.width);
    this.addSignedIntCrc(crc, grid.height);
    this.addSignedIntCrc(crc, grid.zoneBlockWidth);
    this.addSignedIntCrc(crc, grid.zoneBlockHeight);
    this.addFloat32Crc(crc, grid.logicalMinX);
    this.addFloat32Crc(crc, grid.logicalMinZ);
    this.addFloat32Crc(crc, grid.logicalMaxX);
    this.addFloat32Crc(crc, grid.logicalMaxZ);

    this.writeUint8ArrayCrc(crc, grid.terrainType);
    this.writeUint8ArrayCrc(crc, grid.blocked);
    this.writeUint8ArrayCrc(crc, grid.pinched);
    this.writeUint8ArrayCrc(crc, grid.bridge);
    this.writeUint8ArrayCrc(crc, grid.bridgePassable);
    this.writeUint8ArrayCrc(crc, grid.bridgeTransitions);
    this.writeInt32ArrayCrc(crc, grid.bridgeSegmentByCell);
    this.writeUint8ArrayCrc(crc, grid.zonePassable);

    const segmentEntries = Array.from(this.bridgeSegments.entries()).sort(([leftId], [rightId]) => leftId - rightId);
    crc.addUnsignedInt(segmentEntries.length >>> 0);
    for (const [segmentId, segment] of segmentEntries) {
      this.addSignedIntCrc(crc, segmentId);
      crc.addUnsignedByte(segment.passable ? 1 : 0);
      this.writeSignedNumberArrayCrc(crc, segment.cellIndices, true);
      this.writeSignedNumberArrayCrc(crc, segment.transitionIndices, true);
    }

    const controlEntries = Array.from(this.bridgeSegmentByControlEntity.entries())
      .sort(([leftId], [rightId]) => leftId - rightId);
    crc.addUnsignedInt(controlEntries.length >>> 0);
    for (const [entityId, segmentId] of controlEntries) {
      this.addSignedIntCrc(crc, entityId);
      this.addSignedIntCrc(crc, segmentId);
    }
  }

  private writeDeterministicPlayerListCrc(
    crc: XferCrcAccumulator,
    _snapshot: DeterministicFrameSnapshot<unknown>,
  ): void {
    // Source parity:
    // - Generals/Code/GameEngine/Source/GameLogic/System/GameLogic.cpp (GameLogic::getCRC)
    //   xfers ThePlayerList snapshot directly.
    // TODO(source parity): switch to ThePlayerList-equivalent snapshot data
    // once player-list ownership is promoted from scaffolding.
    this.addSignedIntCrc(crc, this.selectedEntityId ?? -1);
    this.writeRelationshipOverridesCrc(crc, this.teamRelationshipOverrides);
    this.writeRelationshipOverridesCrc(crc, this.playerRelationshipOverrides);
    crc.addUnsignedInt(this.placementSummary.totalObjects >>> 0);
    crc.addUnsignedInt(this.placementSummary.spawnedObjects >>> 0);
    crc.addUnsignedInt(this.placementSummary.skippedObjects >>> 0);
    crc.addUnsignedInt(this.placementSummary.resolvedObjects >>> 0);
    crc.addUnsignedInt(this.placementSummary.unresolvedObjects >>> 0);
    this.writeCostModifierUpgradeStatesCrc(crc, this.sideKindOfProductionCostModifiers);
    this.writeSidePowerStateCrc(crc, this.sidePowerBonus);
    this.writeSideRadarStateCrc(crc, this.sideRadarState);
  }

  private writeDeterministicAiCrc(
    crc: XferCrcAccumulator,
    _snapshot: DeterministicFrameSnapshot<unknown>,
  ): void {
    // Source parity:
    // - Generals/Code/GameEngine/Source/GameLogic/System/GameLogic.cpp (GameLogic::getCRC)
    //   xfers TheAI snapshot directly.
    // TODO(source parity): replace this transitional AI/runtime summary with
    // serialized AI owner snapshot fields once AI system ownership is ported.
    crc.addUnsignedInt(this.frameCounter >>> 0);
    crc.addUnsignedInt(this.nextId >>> 0);
    this.addFloat32Crc(crc, this.animationTime);
    crc.addUnsignedByte(this.isAttackMoveToMode ? 1 : 0);
    crc.addUnsignedByte(this.previousAttackMoveToggleDown ? 1 : 0);
    crc.addUnsignedByte(this.config.renderUnknownObjects ? 1 : 0);
    crc.addUnsignedByte(this.config.attackUsesLineOfSight ? 1 : 0);
    this.addFloat32Crc(crc, this.config.defaultMoveSpeed);
    this.addFloat32Crc(crc, this.config.terrainSnapSpeed);

    crc.addUnsignedInt(this.commandQueue.length >>> 0);
    for (const command of this.commandQueue) {
      this.writeGameLogicCommandCrc(crc, command);
    }
  }

  private writeGameLogicCommandCrc(crc: XferCrcAccumulator, command: GameLogicCommand): void {
    crc.addAsciiString(command.type);
    switch (command.type) {
      case 'select':
      case 'stop':
      case 'bridgeDestroyed':
      case 'bridgeRepaired':
        this.addSignedIntCrc(crc, command.entityId);
        return;
      case 'clearSelection':
        return;
      case 'moveTo':
        this.addSignedIntCrc(crc, command.entityId);
        this.addFloat32Crc(crc, command.targetX);
        this.addFloat32Crc(crc, command.targetZ);
        return;
      case 'attackMoveTo':
        this.addSignedIntCrc(crc, command.entityId);
        this.addFloat32Crc(crc, command.targetX);
        this.addFloat32Crc(crc, command.targetZ);
        this.addFloat32Crc(crc, command.attackDistance);
        return;
      case 'guardPosition':
        this.addSignedIntCrc(crc, command.entityId);
        this.addFloat32Crc(crc, command.targetX);
        this.addFloat32Crc(crc, command.targetZ);
        this.addSignedIntCrc(crc, command.guardMode);
        return;
      case 'guardObject':
        this.addSignedIntCrc(crc, command.entityId);
        this.addSignedIntCrc(crc, command.targetEntityId);
        this.addSignedIntCrc(crc, command.guardMode);
        return;
      case 'setRallyPoint':
        this.addSignedIntCrc(crc, command.entityId);
        this.addFloat32Crc(crc, command.targetX);
        this.addFloat32Crc(crc, command.targetZ);
        return;
      case 'attackEntity':
        this.addSignedIntCrc(crc, command.entityId);
        this.addSignedIntCrc(crc, command.targetEntityId);
        crc.addAsciiString(command.commandSource ?? 'PLAYER');
        return;
      case 'setLocomotorSet':
        this.addSignedIntCrc(crc, command.entityId);
        crc.addAsciiString(command.setName);
        return;
      case 'setLocomotorUpgrade':
        this.addSignedIntCrc(crc, command.entityId);
        crc.addUnsignedByte(command.enabled ? 1 : 0);
        return;
      case 'captureEntity':
        this.addSignedIntCrc(crc, command.entityId);
        crc.addAsciiString(command.newSide);
        return;
      case 'applyUpgrade':
        this.addSignedIntCrc(crc, command.entityId);
        crc.addAsciiString(command.upgradeName);
        return;
      case 'queueUnitProduction':
        this.addSignedIntCrc(crc, command.entityId);
        crc.addAsciiString(command.unitTemplateName);
        return;
      case 'cancelUnitProduction':
        this.addSignedIntCrc(crc, command.entityId);
        this.addSignedIntCrc(crc, command.productionId);
        return;
      case 'queueUpgradeProduction':
      case 'cancelUpgradeProduction':
        this.addSignedIntCrc(crc, command.entityId);
        crc.addAsciiString(command.upgradeName);
        return;
      case 'setSideCredits':
      case 'addSideCredits':
        crc.addAsciiString(command.side);
        this.addSignedIntCrc(crc, command.amount);
        return;
      case 'setSidePlayerType':
        crc.addAsciiString(command.side);
        crc.addAsciiString(command.playerType);
        return;
      case 'grantSideScience':
        crc.addAsciiString(command.side);
        crc.addAsciiString(command.scienceName);
        return;
      case 'applyPlayerUpgrade':
        crc.addAsciiString(command.upgradeName);
        return;
      case 'purchaseScience':
        crc.addAsciiString(command.scienceName);
        return;
      case 'issueSpecialPower':
        crc.addAsciiString(command.commandButtonId);
        crc.addAsciiString(command.specialPowerName);
        this.addSignedIntCrc(crc, command.commandOption);
        this.addSignedIntCrc(crc, command.sourceEntityId ?? -1);
        this.addSignedIntCrc(crc, command.targetEntityId ?? -1);
        this.addFloat32Crc(crc, command.targetX ?? 0);
        this.addFloat32Crc(crc, command.targetZ ?? 0);
        this.writeSignedNumberArrayCrc(crc, command.issuingEntityIds, true);
        return;
      default: {
        const unsupported: never = command;
        throw new Error(`Unsupported deterministic command type: ${(unsupported as { type: string }).type}`);
      }
    }
  }

  private writeRelationshipOverridesCrc(
    crc: XferCrcAccumulator,
    overrides: ReadonlyMap<string, number>,
  ): void {
    const entries = Array.from(overrides.entries()).sort(([left], [right]) => left.localeCompare(right));
    crc.addUnsignedInt(entries.length >>> 0);
    for (const [key, relationship] of entries) {
      crc.addAsciiString(key);
      this.addSignedIntCrc(crc, relationship);
    }
  }

  private writeCostModifierUpgradeStatesCrc(
    crc: XferCrcAccumulator,
    sideModifiers: ReadonlyMap<string, KindOfProductionCostModifier[]>,
  ): void {
    const sideEntries = Array.from(sideModifiers.entries()).sort(([left], [right]) => left.localeCompare(right));
    crc.addUnsignedInt(sideEntries.length >>> 0);
    for (const [side, modifiers] of sideEntries) {
      crc.addAsciiString(side);
      const sortedModifiers = [...modifiers].sort((left, right) => {
        const leftKindOf = Array.from(left.kindOf).sort().join('|');
        const rightKindOf = Array.from(right.kindOf).sort().join('|');
        if (leftKindOf < rightKindOf) {
          return -1;
        }
        if (leftKindOf > rightKindOf) {
          return 1;
        }
        if (left.multiplier !== right.multiplier) {
          return left.multiplier - right.multiplier;
        }
        return left.refCount - right.refCount;
      });
      crc.addUnsignedInt(sortedModifiers.length >>> 0);
      for (const modifier of sortedModifiers) {
        const kindOf = Array.from(modifier.kindOf).sort();
        crc.addUnsignedInt(kindOf.length >>> 0);
        for (const kindOfToken of kindOf) {
          crc.addAsciiString(kindOfToken);
        }
        this.addFloat32Crc(crc, modifier.multiplier);
        crc.addSignedIntCrc(crc, modifier.refCount);
      }
    }
  }

  private writeSidePowerStateCrc(
    crc: XferCrcAccumulator,
    sidePowerState: ReadonlyMap<string, SidePowerState>,
  ): void {
    const sideEntries = Array.from(sidePowerState.entries()).sort(([left], [right]) => left.localeCompare(right));
    crc.addUnsignedInt(sideEntries.length >>> 0);
    for (const [side, state] of sideEntries) {
      crc.addAsciiString(side);
      this.addFloat32Crc(crc, state.powerBonus);
    }
  }

  private writeSideRadarStateCrc(
    crc: XferCrcAccumulator,
    sideRadarState: ReadonlyMap<string, SideRadarState>,
  ): void {
    const sideEntries = Array.from(sideRadarState.entries()).sort(([left], [right]) => left.localeCompare(right));
    crc.addUnsignedInt(sideEntries.length >>> 0);
    for (const [side, state] of sideEntries) {
      crc.addAsciiString(side);
      crc.addUnsignedInt(state.radarCount >>> 0);
      crc.addUnsignedInt(state.disableProofRadarCount >>> 0);
    }
  }

  private writeVectorArrayCrc(crc: XferCrcAccumulator, points: ReadonlyArray<VectorXZ>): void {
    crc.addUnsignedInt(points.length >>> 0);
    for (const point of points) {
      this.addFloat32Crc(crc, point.x);
      this.addFloat32Crc(crc, point.z);
    }
  }

  private writeNullableVectorCrc(crc: XferCrcAccumulator, point: VectorXZ | null): void {
    if (!point) {
      crc.addUnsignedByte(0);
      return;
    }
    crc.addUnsignedByte(1);
    this.addFloat32Crc(crc, point.x);
    this.addFloat32Crc(crc, point.z);
  }

  private writeNullableGridCellCrc(
    crc: XferCrcAccumulator,
    point: { x: number; z: number } | null,
  ): void {
    if (!point) {
      crc.addUnsignedByte(0);
      return;
    }
    crc.addUnsignedByte(1);
    this.addSignedIntCrc(crc, point.x);
    this.addSignedIntCrc(crc, point.z);
  }

  private writeSignedNumberArrayCrc(
    crc: XferCrcAccumulator,
    values: ReadonlyArray<number>,
    sortValues: boolean,
  ): void {
    const normalized = sortValues ? [...values].sort((left, right) => left - right) : [...values];
    crc.addUnsignedInt(normalized.length >>> 0);
    for (const value of normalized) {
      this.addSignedIntCrc(crc, value);
    }
  }

  private writeUint8ArrayCrc(crc: XferCrcAccumulator, values: Uint8Array): void {
    crc.addUnsignedInt(values.length >>> 0);
    for (const value of values) {
      crc.addUnsignedByte(value & 0xff);
    }
  }

  private writeInt32ArrayCrc(crc: XferCrcAccumulator, values: Int32Array): void {
    crc.addUnsignedInt(values.length >>> 0);
    for (const value of values) {
      this.addSignedIntCrc(crc, value);
    }
  }

  private addSignedIntCrc(crc: XferCrcAccumulator, value: number): void {
    if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
      throw new Error(`deterministic CRC value must be a signed 32-bit integer, got ${value}`);
    }
    crc.addUnsignedInt(value >>> 0);
  }

  private addFloat32Crc(crc: XferCrcAccumulator, value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error(`deterministic CRC value must be finite, got ${value}`);
    }
    this.crcFloatScratch.setFloat32(0, Math.fround(value), true);
    crc.addUnsignedInt(this.crcFloatScratch.getUint32(0, true));
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
    this.pendingWeaponDamageEvents.length = 0;
    this.navigationGrid = null;
    this.bridgeSegments.clear();
    this.bridgeSegmentByControlEntity.clear();
    this.shortcutSpecialPowerSourceByName.clear();
    this.shortcutSpecialPowerNamesByEntityId.clear();
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

function readStringList(fields: Record<string, IniValue>, names: string[]): string[] {
  for (const name of names) {
    const values = readStringListValue(fields[name]);
    if (values.length > 0) {
      return values;
    }
  }

  return [];
}

function readStringListValue(value: IniValue | undefined): string[] {
  if (typeof value === 'string') {
    return value
      .split(/[\s,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => readStringListValue(entry as IniValue))
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
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

function readCoord3DField(
  fields: Record<string, IniValue>,
  names: string[],
): { x: number; y: number; z: number } | null {
  const values = readNumericListField(fields, names);
  if (!values || values.length < 2) {
    return null;
  }
  return {
    x: values[0] ?? 0,
    y: values[1] ?? 0,
    z: values[2] ?? 0,
  };
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
