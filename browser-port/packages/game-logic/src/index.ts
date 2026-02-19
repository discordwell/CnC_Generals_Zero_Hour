/**
 * Game Logic & Entity Bootstrap — phase-1 gameplay scaffolding.
 *
 * Consumes converted map objects, resolves INI metadata, creates simple entity
 * representations, and supports a minimal click-to-select + click-to-move loop.
 */

import * as THREE from 'three';
import type {
  DeterministicGameLogicCrcSectionWriters,
  Subsystem,
} from '@generals/engine';
import { GameRandom, type IniBlock, type IniValue } from '@generals/core';
import {
  IniDataRegistry,
  type ArmorDef,
  type SpecialPowerDef,
  type ObjectDef,
  type ScienceDef,
  type UpgradeDef,
  type WeaponDef,
} from '@generals/ini-data';
import {
  MAP_XY_FACTOR,
  base64ToUint8Array,
  type HeightmapGrid,
  type MapDataJSON,
  type MapObjectJSON,
} from '@generals/terrain';
import type { InputState } from '@generals/input';
import {
  adjustDamageByArmorSet as adjustDamageByArmorSetImpl,
  computeAttackRetreatTarget as computeAttackRetreatTargetImpl,
  entityHasSneakyTargetingOffset as entityHasSneakyTargetingOffsetImpl,
  recordConsecutiveAttackShot as recordConsecutiveAttackShotImpl,
  rebuildEntityScatterTargets as rebuildEntityScatterTargetsImpl,
  refreshEntitySneakyMissWindow as refreshEntitySneakyMissWindowImpl,
  resetEntityWeaponTimingState as resetEntityWeaponTimingStateImpl,
  resolveEntitySneakyTargetingOffset as resolveEntitySneakyTargetingOffsetImpl,
  resolveProjectileScatterRadiusForCategory as resolveProjectileScatterRadiusForCategoryImpl,
  resolveScaledProjectileTravelSpeed as resolveScaledProjectileTravelSpeedImpl,
  resolveWeaponDelayFrames as resolveWeaponDelayFramesImpl,
  resolveWeaponPreAttackDelayFrames as resolveWeaponPreAttackDelayFramesImpl,
  setEntityAimingWeaponStatus as setEntityAimingWeaponStatusImpl,
  setEntityAttackStatus as setEntityAttackStatusImpl,
  setEntityFiringWeaponStatus as setEntityFiringWeaponStatusImpl,
  setEntityIgnoringStealthStatus as setEntityIgnoringStealthStatusImpl,
  updateWeaponIdleAutoReload as updateWeaponIdleAutoReloadImpl,
} from './combat-helpers.js';
import { isPassengerAllowedToFireFromContainingObject as isPassengerAllowedToFireFromContainingObjectImpl } from './combat-containment.js';
import {
  applyWeaponDamageEvent as applyWeaponDamageEventImpl,
  type CombatDamageEventContext,
  updatePendingWeaponDamage as updatePendingWeaponDamageImpl,
} from './combat-damage-events.js';
import {
  isAirfieldReservedForProjectileVictim as isAirfieldReservedForProjectileVictimImpl,
  resolveProjectileIncidentalVictimForPointImpact as resolveProjectileIncidentalVictimForPointImpactImpl,
  resolveProjectilePointCollisionRadius as resolveProjectilePointCollisionRadiusImpl,
  shouldProjectileCollideWithEntity as shouldProjectileCollideWithEntityImpl,
} from './combat-damage-resolution.js';
import { updateCombat as updateCombatImpl } from './combat-update.js';
import {
  findPath as findPathImpl,
  updatePathfindGoalCellFromPath as updatePathfindGoalCellFromPathImpl,
  updatePathfindPosCell as updatePathfindPosCellImpl,
} from './navigation-pathfinding.js';
import {
  createDeterministicGameLogicCrcSectionWriters as createDeterministicGameLogicCrcSectionWritersImpl,
} from './deterministic-state.js';
import {
  resolveRenderAssetProfile as resolveRenderAssetProfileImpl,
  shouldPathfindObstacle as shouldPathfindObstacleImpl,
} from './render-profile-helpers.js';
import {
  createRailedTransportRuntimeState as createRailedTransportRuntimeStateImpl,
  createRailedTransportWaypointIndex as createRailedTransportWaypointIndexImpl,
  executeRailedTransportCommand as executeRailedTransportCommandImpl,
  extractRailedTransportProfile as extractRailedTransportProfileImpl,
  type RailedTransportProfile,
  type RailedTransportRuntimeState,
  type RailedTransportWaypointData,
  type RailedTransportWaypointIndex,
  updateRailedTransportEntity as updateRailedTransportEntityImpl,
} from './railed-transport.js';
import {
  clamp,
  coerceStringArray,
  nominalHeightForCategory,
  pointInPolygon,
  readBooleanField,
  readCoord3DField,
  readNumericField,
  readNumericList,
  readNumericListField,
  readStringField,
  readStringList,
  toByte,
} from './ini-readers.js';
import {
  extractProductionPrerequisiteGroups as extractProductionPrerequisiteGroupsImpl,
  resolveBuildableStatus as resolveBuildableStatusImpl,
} from './production-prerequisites.js';
import {
  canExitProducedUnitViaParking as canExitProducedUnitViaParkingImpl,
  hasAvailableParkingSpace as hasAvailableParkingSpaceImpl,
  releaseParkingDoorReservationForProduction as releaseParkingDoorReservationForProductionImpl,
  reserveParkingDoorForQueuedUnit as reserveParkingDoorForQueuedUnitImpl,
  reserveParkingSpaceForProducedUnit as reserveParkingSpaceForProducedUnitImpl,
  shouldReserveParkingDoorWhenQueued as shouldReserveParkingDoorWhenQueuedImpl,
} from './production-parking.js';
import {
  resolveQueueProductionNaturalRallyPoint as resolveQueueProductionNaturalRallyPointImpl,
  resolveQueueSpawnLocation as resolveQueueSpawnLocationImpl,
  tickQueueExitGate as tickQueueExitGateImpl,
} from './production-spawn.js';
import {
  areEquivalentTemplateNames as areEquivalentTemplateNamesImpl,
  doesTemplateMatchMaxSimultaneousType as doesTemplateMatchMaxSimultaneousTypeImpl,
  isStructureObjectDef as isStructureObjectDefImpl,
  resolveMaxSimultaneousOfType as resolveMaxSimultaneousOfTypeImpl,
  resolveProductionQuantity as resolveProductionQuantityImpl,
} from './production-templates.js';
import {
  findArmorDefByName,
  findCommandButtonDefByName,
  findCommandSetDefByName,
  findObjectDefByName,
  findScienceDefByName,
  findUpgradeDefByName,
  findWeaponDefByName,
  resolveUpgradeBuildCost,
  resolveUpgradeBuildTimeFrames,
  resolveUpgradeType,
} from './registry-lookups.js';
import {
  canAffordSideCredits as canAffordSideCreditsImpl,
  depositSideCredits as depositSideCreditsImpl,
  withdrawSideCredits as withdrawSideCreditsImpl,
} from './side-credits.js';
import {
  routeIssueSpecialPowerCommand as routeIssueSpecialPowerCommandImpl,
  resolveSharedShortcutSpecialPowerReadyFrame as resolveSharedShortcutSpecialPowerReadyFrameImpl,
  resolveShortcutSpecialPowerSourceEntityReadyFrameBySource as
    resolveShortcutSpecialPowerSourceEntityReadyFrameBySourceImpl,
  setSpecialPowerReadyFrame as setSpecialPowerReadyFrameImpl,
} from './special-power-routing.js';
import {
  DEFAULT_SUPPLY_BOX_VALUE,
  initializeWarehouseState as initializeWarehouseStateImpl,
  updateSupplyTruck as updateSupplyTruckImpl,
  type SupplyChainContext,
  type SupplyTruckProfile,
  type SupplyTruckState,
  type SupplyWarehouseProfile,
  type SupplyWarehouseState,
} from './supply-chain.js';
import {
  addExperiencePoints as addExperiencePointsImpl,
  applyHealthBonusForLevelChange as applyHealthBonusForLevelChangeImpl,
  createExperienceState as createExperienceStateImpl,
  DEFAULT_VETERANCY_CONFIG,
  getExperienceValue as getExperienceValueImpl,
  resolveArmorSetFlagsForLevel as resolveArmorSetFlagsForLevelImpl,
  type ExperienceProfile,
  type ExperienceState,
  type VeterancyLevel,
} from './experience.js';
import {
  CELL_CLEAR,
  CELL_SHROUDED,
  createEntityVisionState as createEntityVisionStateImpl,
  FogOfWarGrid,
  updateEntityVision as updateEntityVisionImpl,
  type CellVisibility,
  type EntityVisionState,
} from './fog-of-war.js';
import {
  executeAreaDamage as executeAreaDamageImpl,
  executeCashHack as executeCashHackImpl,
  executeDefector as executeDefectorImpl,
  executeSpyVision as executeSpyVisionImpl,
  executeAreaHeal as executeAreaHealImpl,
  resolveEffectCategory as resolveEffectCategoryImpl,
  DEFAULT_AREA_DAMAGE_RADIUS,
  DEFAULT_AREA_DAMAGE_AMOUNT,
  DEFAULT_CASH_HACK_AMOUNT,
  DEFAULT_SPY_VISION_RADIUS,
  DEFAULT_AREA_HEAL_AMOUNT,
  DEFAULT_AREA_HEAL_RADIUS,
  type SpecialPowerEffectContext,
} from './special-power-effects.js';
import {
  createSkirmishAIState as createSkirmishAIStateImpl,
  updateSkirmishAI as updateSkirmishAIImpl,
  type SkirmishAIContext,
  type SkirmishAIState,
} from './skirmish-ai.js';
import {
  applyCostModifierUpgradeToSide as applyCostModifierUpgradeToSideImpl,
  applyKindOfProductionCostModifiers as applyKindOfProductionCostModifiersImpl,
  applyPowerPlantUpgradeToSide as applyPowerPlantUpgradeToSideImpl,
  applyRadarUpgradeToSide as applyRadarUpgradeToSideImpl,
  extractUpgradeModulesFromBlocks as extractUpgradeModulesFromBlocksImpl,
  removeCostModifierUpgradeFromSide as removeCostModifierUpgradeFromSideImpl,
  removePowerPlantUpgradeFromSide as removePowerPlantUpgradeFromSideImpl,
  removeRadarUpgradeFromSide as removeRadarUpgradeFromSideImpl,
} from './upgrade-modules.js';
import {
  type BeaconDeleteCommand,
  type CancelDozerConstructionCommand,
  type CombatDropCommand,
  type ConstructBuildingCommand,
  type EnterObjectCommand,
  type EntityRelationship,
  type ExecuteRailedTransportCommand,
  type GameLogicCommand,
  type GameLogicConfig,
  type GarrisonBuildingCommand,
  type HackInternetCommand,
  type RepairBuildingCommand,
  type IssueSpecialPowerCommand,
  type LocalScienceAvailability,
  type MapObjectPlacementSummary,
  type PlaceBeaconCommand,
  type RenderAnimationState,
  type RenderAnimationStateClipCandidates,
  type RenderableEntityState,
  type RenderableObjectCategory,
  type SellCommand,
  type SelectedEntityInfo,
  type ToggleOverchargeCommand,
} from './types.js';

export * from './types.js';

const TEST_CRUSH_ONLY = 0;
const TEST_SQUISH_ONLY = 1;
const TEST_CRUSH_OR_SQUISH = 2;
const RELATIONSHIP_ENEMIES = 0;
const RELATIONSHIP_NEUTRAL = 1;
const RELATIONSHIP_ALLIES = 2;
type RelationshipValue = typeof RELATIONSHIP_ENEMIES | typeof RELATIONSHIP_NEUTRAL | typeof RELATIONSHIP_ALLIES;
type SidePlayerType = 'HUMAN' | 'COMPUTER';
type AttackCommandSource = 'PLAYER' | 'AI';

type ObjectCategory = RenderableObjectCategory;

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
const CLIFF_HEIGHT_DELTA = 9.8;
const PATHFIND_ZONE_BLOCK_SIZE = 10;
const NO_ATTACK_DISTANCE = 0;
const ATTACK_MOVE_DISTANCE_FUDGE = 3 * MAP_XY_FACTOR;
const ATTACK_RANGE_CELL_EDGE_FUDGE = PATHFIND_CELL_SIZE * 0.25;
const ATTACK_MIN_RANGE_DISTANCE_SQR_FUDGE = 0.5;
const LOGIC_FRAME_RATE = 30;
const LOGIC_FRAME_MS = 1000 / LOGIC_FRAME_RATE;
const SOURCE_FRAMES_TO_ALLOW_SCAFFOLD = LOGIC_FRAME_RATE * 1.5;
const SOURCE_TOTAL_FRAMES_TO_SELL_OBJECT = LOGIC_FRAME_RATE * 3;
const SOURCE_DEFAULT_SELL_PERCENTAGE = 1.0;
const SOURCE_HACK_FALLBACK_CASH_AMOUNT = 1;
const SOURCE_DEFAULT_MAX_BEACONS_PER_PLAYER = 3;

const NAV_CLEAR = 0;
const NAV_WATER = 1;
const NAV_CLIFF = 2;
const NAV_OBSTACLE = 4;
const NAV_IMPASSABLE = 6;
const NAV_BRIDGE_IMPASSABLE = 7;

const OBJECT_FLAG_BRIDGE_POINT1 = 0x010;
const OBJECT_FLAG_BRIDGE_POINT2 = 0x020;
const SOURCE_DISABLED_SHORTCUT_SPECIAL_POWER_READY_FRAME = 0xffffffff - 10;

const LOCOMOTORSET_NORMAL = 'SET_NORMAL';
const LOCOMOTORSET_NORMAL_UPGRADED = 'SET_NORMAL_UPGRADED';
const LOCOMOTORSET_FREEFALL = 'SET_FREEFALL';
const LOCOMOTORSET_WANDER = 'SET_WANDER';
const LOCOMOTORSET_PANIC = 'SET_PANIC';
const LOCOMOTORSET_TAXIING = 'SET_TAXIING';
const LOCOMOTORSET_SUPERSONIC = 'SET_SUPERSONIC';
const LOCOMOTORSET_SLUGGISH = 'SET_SLUGGISH';
const NO_SURFACES = 0;
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
// Source parity: WeaponAntiMaskType — weapon targeting category bitmask.
const WEAPON_ANTI_AIRBORNE_VEHICLE = 0x01;
const WEAPON_ANTI_GROUND = 0x02;
const WEAPON_ANTI_PROJECTILE = 0x04;
const WEAPON_ANTI_SMALL_MISSILE = 0x08;
const WEAPON_ANTI_MINE = 0x10;
const WEAPON_ANTI_AIRBORNE_INFANTRY = 0x20;
const WEAPON_ANTI_BALLISTIC_MISSILE = 0x40;
const WEAPON_ANTI_PARACHUTE = 0x80;
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
  antiMask: number;
}

interface WeaponTemplateSetProfile {
  conditionsMask: number;
  weaponNamesBySlot: [string | null, string | null, string | null];
}

interface ArmorTemplateSetProfile {
  conditionsMask: number;
  armorName: string | null;
}

interface SpecialPowerModuleProfile {
  specialPowerTemplateName: string;
  moduleType: string;
  updateModuleStartsAttack: boolean;
  startsPaused: boolean;
}

interface SpecialPowerDispatchProfile {
  specialPowerTemplateName: string;
  moduleType: string;
  dispatchType: 'NO_TARGET' | 'POSITION' | 'OBJECT';
  commandOption: number;
  commandButtonId: string;
  targetEntityId: number | null;
  targetX: number | null;
  targetZ: number | null;
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
  /** Total energy production from all alive buildings (positive energyBonus values). */
  energyProduction: number;
  /** Total energy consumption from all alive buildings (absolute of negative energyBonus values). */
  energyConsumption: number;
}

/**
 * Source parity: Player.h — rank level progression from kills.
 * Rank thresholds and purchase point grants from Rank.ini.
 */
interface SideRankState {
  /** Current rank level (1-based, starts at 1). */
  rankLevel: number;
  /** Cumulative skill points (from kills). */
  skillPoints: number;
  /** Unspent science purchase (General's) points. */
  sciencePurchasePoints: number;
}

/**
 * Source parity: Rank.ini — defines XP thresholds and purchase point grants per rank.
 * Standard C&C Generals: Zero Hour rank values.
 */
interface RankInfoEntry {
  skillPointsNeeded: number;
  sciencePurchasePointsGranted: number;
}

/** Default Generals/ZH rank table (8 ranks). */
const RANK_TABLE: readonly RankInfoEntry[] = [
  { skillPointsNeeded: 0, sciencePurchasePointsGranted: 1 },     // Rank 1 (start)
  { skillPointsNeeded: 200, sciencePurchasePointsGranted: 0 },   // Rank 2
  { skillPointsNeeded: 500, sciencePurchasePointsGranted: 1 },   // Rank 3
  { skillPointsNeeded: 800, sciencePurchasePointsGranted: 0 },   // Rank 4
  { skillPointsNeeded: 1500, sciencePurchasePointsGranted: 1 },  // Rank 5
  { skillPointsNeeded: 3000, sciencePurchasePointsGranted: 0 },  // Rank 6
  { skillPointsNeeded: 5000, sciencePurchasePointsGranted: 0 },  // Rank 7
  { skillPointsNeeded: 8000, sciencePurchasePointsGranted: 1 },  // Rank 8
];

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
  /** Maximum number of garrisoned units. 0 = not garrisonable. */
  garrisonCapacity: number;
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
  /** Frame when the projectile was launched. */
  launchFrame: number;
  /** Launch origin in world coordinates. */
  sourceX: number;
  sourceY: number;
  sourceZ: number;
  /** Unique visual id for renderer tracking. */
  projectileVisualId: number;
  /** Cached visual type classification. */
  cachedVisualType: import('./types.js').ProjectileVisualType;
}

interface SellingEntityState {
  sellFrame: number;
  constructionPercent: number;
}

interface HackInternetProfile {
  unpackTimeFrames: number;
  packTimeFrames: number;
  cashUpdateDelayFrames: number;
  cashUpdateDelayFastFrames: number;
  regularCashAmount: number;
  veteranCashAmount: number;
  eliteCashAmount: number;
  heroicCashAmount: number;
}

interface HackInternetRuntimeState {
  cashUpdateDelayFrames: number;
  cashAmountPerCycle: number;
  nextCashFrame: number;
}

interface HackInternetPendingCommandState {
  command: GameLogicCommand;
  executeFrame: number;
}

interface OverchargeBehaviorProfile {
  healthPercentToDrainPerSecond: number;
  notAllowedWhenHealthBelowPercent: number;
}

interface OverchargeRuntimeState extends OverchargeBehaviorProfile {
}

interface SabotageBuildingProfile {
  moduleType: string;
  disableHackedDurationFrames: number;
  disableContainedHackers: boolean;
  stealsCashAmount: number;
  destroysTarget: boolean;
  powerSabotageDurationFrames: number;
}

interface PendingEnterObjectActionState {
  targetObjectId: number;
  action: EnterObjectCommand['action'];
}

interface PendingCombatDropActionState {
  targetObjectId: number | null;
  targetX: number;
  targetZ: number;
}

interface MapEntity {
  id: number;
  templateName: string;
  category: ObjectCategory;
  kindOf: Set<string>;
  side?: string;
  controllingPlayerToken: string | null;
  resolved: boolean;
  bridgeFlags: number;
  mapCellX: number;
  mapCellZ: number;
  renderAssetCandidates: string[];
  renderAssetPath: string | null;
  renderAssetResolved: boolean;
  renderAnimationStateClips?: RenderAnimationStateClipCandidates;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  animationState: RenderAnimationState;
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
  noCollisions: boolean;
  isIndestructible: boolean;
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
  attackTargetPosition: VectorXZ | null;
  attackOriginalVictimPosition: VectorXZ | null;
  attackCommandSource: AttackCommandSource;
  nextAttackFrame: number;
  attackAmmoInClip: number;
  attackReloadFinishFrame: number;
  attackForceReloadFrame: number;
  forcedWeaponSlot: number | null;
  weaponLockStatus: 'NOT_LOCKED' | 'LOCKED_TEMPORARILY' | 'LOCKED_PERMANENTLY';
  maxShotsRemaining: number;
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
  garrisonContainerId: number | null;
  helixPortableRiderId: number | null;
  largestWeaponRange: number;
  totalWeaponAntiMask: number;
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
  specialPowerModules: Map<string, SpecialPowerModuleProfile>;
  lastSpecialPowerDispatch: SpecialPowerDispatchProfile | null;
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
  supplyWarehouseProfile: SupplyWarehouseProfile | null;
  supplyTruckProfile: SupplyTruckProfile | null;
  isSupplyCenter: boolean;
  experienceProfile: ExperienceProfile | null;
  experienceState: ExperienceState;
  visionRange: number;
  visionState: EntityVisionState;
  /** Frames remaining before CAN_STEALTH entity re-enters stealth. 0 = ready to stealth. */
  stealthDelayRemaining: number;
  /** Frame at which DETECTED expires. 0 = not detected. */
  detectedUntilFrame: number;
  /** Source parity: AutoHealBehavior — self-heal state. */
  autoHealProfile: AutoHealProfile | null;
  autoHealNextFrame: number;
  autoHealDamageDelayUntilFrame: number;
  /** Source parity: BaseRegenerateUpdate — structure regen after damage delay. */
  baseRegenDelayUntilFrame: number;
  /** Source parity: PropagandaTowerBehavior — radius heal/buff aura. */
  propagandaTowerProfile: PropagandaTowerProfile | null;
  propagandaTowerNextScanFrame: number;
  propagandaTowerTrackedIds: number[];
  /** Sole healing benefactor anti-stacking. */
  soleHealingBenefactorId: number | null;
  soleHealingBenefactorExpirationFrame: number;

  // ── Source parity: PoisonedBehavior — per-entity poison DoT state ──
  /** Damage amount per poison tick (0 = not poisoned). */
  poisonDamageAmount: number;
  /** Frame at which next poison tick fires. */
  poisonNextDamageFrame: number;
  /** Frame at which poison effect expires. */
  poisonExpireFrame: number;
  /** Frames between poison damage ticks (from INI PoisonDamageInterval). */
  poisonDamageIntervalFrames: number;
  /** Total poison duration frames (from INI PoisonDuration). */
  poisonDurationFrames: number;

  // ── Source parity: FlammableUpdate — per-entity fire DoT state ──
  /** Flammability status: 'NORMAL' | 'AFLAME' | 'BURNED'. */
  flameStatus: 'NORMAL' | 'AFLAME' | 'BURNED';
  /** Accumulated flame damage toward ignition threshold. */
  flameDamageAccumulated: number;
  /** Frame at which aflame state ends. */
  flameEndFrame: number;
  /** Frame at which next fire damage tick fires. */
  flameDamageNextFrame: number;
  /** Last frame flame damage was received. */
  flameLastDamageReceivedFrame: number;
  /** Flammable module profile (null = not flammable). */
  flammableProfile: FlammableProfile | null;

  // ── Source parity: EjectPilotDie — pilot eject on death ──
  /** Template name of pilot unit to eject on death. Null = no eject. */
  ejectPilotTemplateName: string | null;
  /** Minimum veterancy level to eject (default 1 = VETERAN). */
  ejectPilotMinVeterancy: number;

  // ── Source parity: CreateObjectDie / SlowDeathBehavior — OCL on death ──
  /** OCL names to execute when entity is destroyed. */
  deathOCLNames: string[];

  destroyed: boolean;
}

/**
 * Source parity: AutoHealBehavior module parsed from INI.
 */
interface AutoHealProfile {
  healingAmount: number;
  healingDelayFrames: number;
  startHealingDelayFrames: number;
  radius: number;
  affectsWholePlayer: boolean;
  initiallyActive: boolean;
}

/**
 * Source parity: PropagandaTowerBehavior module parsed from INI.
 */
interface PropagandaTowerProfile {
  radius: number;
  scanDelayFrames: number;
  healPercentPerSecond: number;
  upgradedHealPercentPerSecond: number;
  upgradeRequired: string | null;
}

/**
 * Source parity: FlammableUpdate module parsed from INI.
 */
interface FlammableProfile {
  /** Cumulative damage threshold to ignite. */
  flameDamageLimit: number;
  /** Frames before threshold resets after no fire damage. */
  flameDamageExpirationDelayFrames: number;
  /** Duration in frames that entity stays AFLAME. */
  aflameDurationFrames: number;
  /** Frames between fire damage ticks while AFLAME (0 = no periodic damage). */
  aflameDamageDelayFrames: number;
  /** Damage per fire tick. */
  aflameDamageAmount: number;
}

/** Source parity: PoisonedBehavior default INI values. */
const DEFAULT_POISON_DAMAGE_INTERVAL_FRAMES = 10; // ~0.33s at 30fps
const DEFAULT_POISON_DURATION_FRAMES = 90; // ~3s at 30fps

/** Source parity: FlammableUpdate default INI values. */
const DEFAULT_FLAME_DAMAGE_LIMIT = 20.0;
const DEFAULT_AFLAME_DAMAGE_AMOUNT = 5;

/** Global base regen config from GlobalData.ini. */
const BASE_REGEN_HEALTH_PERCENT_PER_SECOND = 0.02; // 2% per second default
const BASE_REGEN_DELAY_FRAMES = 60; // ~2s delay after damage before regen starts

const DEFAULT_GAME_LOGIC_CONFIG: Readonly<GameLogicConfig> = {
  renderUnknownObjects: true,
  defaultMoveSpeed: 18,
  terrainSnapSpeed: 6,
  attackUsesLineOfSight: true,
  sellPercentage: SOURCE_DEFAULT_SELL_PERCENTAGE,
};

const OBJECT_DONT_RENDER_FLAG = 0x100;

export class GameLogicSubsystem implements Subsystem {
  readonly name = 'GameLogic';

  private readonly config: GameLogicConfig;
  private readonly spawnedEntities = new Map<number, MapEntity>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly gameRandom = new GameRandom(1);

  private nextId = 1;
  private nextProjectileVisualId = 1;
  private animationTime = 0;
  private selectedEntityId: number | null = null;
  private selectedEntityIds: readonly number[] = [];
  private mapHeightmap: HeightmapGrid | null = null;
  private navigationGrid: NavigationGrid | null = null;
  private iniDataRegistry: IniDataRegistry | null = null;
  private readonly commandQueue: GameLogicCommand[] = [];
  private frameCounter = 0;
  private readonly bridgeSegments = new Map<number, BridgeSegmentState>();
  private readonly bridgeSegmentByControlEntity = new Map<number, number>();
  private readonly teamRelationshipOverrides = new Map<string, number>();
  private readonly playerRelationshipOverrides = new Map<string, number>();
  private readonly sideCredits = new Map<string, number>();
  private readonly sidePlayerTypes = new Map<string, SidePlayerType>();
  private readonly sideUpgradesInProduction = new Map<string, Set<string>>();
  private readonly sideCompletedUpgrades = new Map<string, Set<string>>();
  private readonly sideKindOfProductionCostModifiers = new Map<string, KindOfProductionCostModifier[]>();
  private readonly sideSciences = new Map<string, Set<string>>();
  private readonly sidePowerBonus = new Map<string, SidePowerState>();
  private readonly sideRadarState = new Map<string, SideRadarState>();
  private readonly sideRankState = new Map<string, SideRankState>();
  private readonly playerSideByIndex = new Map<number, string>();
  private readonly localPlayerScienceAvailability = new Map<string, LocalScienceAvailability>();
  private readonly shortcutSpecialPowerSourceByName = new Map<string, Map<number, number>>();
  private readonly shortcutSpecialPowerNamesByEntityId = new Map<number, Set<string>>();
  private readonly sharedShortcutSpecialPowerReadyFrames = new Map<string, number>();
  private readonly pendingWeaponDamageEvents: PendingWeaponDamageEvent[] = [];
  private readonly visualEventBuffer: import('./types.js').VisualEvent[] = [];
  private readonly evaEventBuffer: import('./types.js').EvaEvent[] = [];
  /** Cooldown tracker: EvaEventType → next frame this event can fire again. */
  private readonly evaCooldowns = new Map<string, number>();
  private readonly pendingDyingRenderableStates = new Map<number, {
    state: RenderableEntityState;
    expireFrame: number;
  }>();
  private readonly sellingEntities = new Map<number, SellingEntityState>();
  private readonly hackInternetStateByEntityId = new Map<number, HackInternetRuntimeState>();
  private readonly hackInternetPendingCommandByEntityId = new Map<number, HackInternetPendingCommandState>();
  private readonly overchargeStateByEntityId = new Map<number, OverchargeRuntimeState>();
  private readonly disabledHackedStatusByEntityId = new Map<number, number>();
  private readonly disabledEmpStatusByEntityId = new Map<number, number>();
  private readonly pendingEnterObjectActions = new Map<number, PendingEnterObjectActionState>();
  private readonly pendingGarrisonActions = new Map<number, number>();
  private readonly pendingCombatDropActions = new Map<number, PendingCombatDropActionState>();
  /** Source parity: BuildAssistant repair — dozer ID → target building ID. */
  private readonly pendingRepairActions = new Map<number, number>();
  private readonly supplyWarehouseStates = new Map<number, SupplyWarehouseState>();
  private readonly supplyTruckStates = new Map<number, SupplyTruckState>();
  private fogOfWarGrid: FogOfWarGrid | null = null;
  private readonly sidePlayerIndex = new Map<string, number>();
  private nextPlayerIndex = 0;
  private readonly skirmishAIStates = new Map<string, SkirmishAIState>();
  private readonly railedTransportStateByEntityId = new Map<number, RailedTransportRuntimeState>();
  private railedTransportWaypointIndex: RailedTransportWaypointIndex = createRailedTransportWaypointIndexImpl(null);
  // localPlayerSciencePurchasePoints removed — now lives in sideRankState.
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

  private readonly defeatedSides = new Set<string>();
  private gameEndFrame: number | null = null;

  constructor(_scene: THREE.Scene, config?: Partial<GameLogicConfig>) {
    void _scene;
    this.config = { ...DEFAULT_GAME_LOGIC_CONFIG, ...config };
  }

  init(): void {
    // No async startup required for the bootstrap stage.
  }

  /**
   * Resolve map objects against INI definitions and create simulation entities.
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
    this.railedTransportWaypointIndex = createRailedTransportWaypointIndexImpl(
      this.resolveRailedTransportWaypointData(mapData),
    );

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
      this.registerEntityEnergy(mapEntity);

      // Initialize supply warehouse state from profile if applicable.
      if (mapEntity.supplyWarehouseProfile) {
        this.supplyWarehouseStates.set(
          mapEntity.id,
          initializeWarehouseStateImpl(mapEntity.supplyWarehouseProfile),
        );
      }

      this.placementSummary.spawnedObjects++;
      if (resolved) {
        this.placementSummary.resolvedObjects++;
      } else {
        this.placementSummary.unresolvedObjects++;
      }
    }

    this.navigationGrid = this.buildNavigationGrid(mapData, heightmap);

    // Initialize fog of war grid based on map dimensions.
    if (heightmap) {
      this.fogOfWarGrid = new FogOfWarGrid(heightmap.worldWidth, heightmap.worldDepth, MAP_XY_FACTOR);
    }

    return this.placementSummary;
  }

  private resolveRailedTransportWaypointData(mapData: MapDataJSON): RailedTransportWaypointData | null {
    if (!mapData.waypoints) {
      return null;
    }

    return {
      nodes: mapData.waypoints.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        x: node.position.x,
        z: node.position.y,
        biDirectional: node.biDirectional ?? false,
      })),
      links: mapData.waypoints.links.map((link) => ({
        waypoint1: link.waypoint1,
        waypoint2: link.waypoint2,
      })),
    };
  }

  getPlacementSummary(): MapObjectPlacementSummary {
    return { ...this.placementSummary };
  }

  getRenderableEntityStates(): RenderableEntityState[] {
    const renderableStates = Array.from(this.spawnedEntities.values()).map((entity) =>
      this.makeRenderableEntityState(entity),
    );
    const pendingDyingStates = Array.from(this.pendingDyingRenderableStates.values())
      .map((pending) => pending.state);

    return [...renderableStates, ...pendingDyingStates];
  }

  private makeRenderableEntityState(entity: MapEntity): RenderableEntityState {
    return {
      id: entity.id,
      templateName: entity.templateName,
      resolved: entity.resolved,
      renderAssetCandidates: entity.renderAssetCandidates,
      renderAssetPath: entity.renderAssetPath,
      renderAssetResolved: entity.renderAssetResolved,
      renderAnimationStateClips: entity.renderAnimationStateClips,
      category: entity.category,
      x: entity.x,
      y: entity.y,
      z: entity.z,
      rotationY: entity.rotationY,
      animationState: entity.animationState,
      health: entity.health,
      maxHealth: entity.maxHealth,
      isSelected: entity.selected,
      side: entity.side,
      veterancyLevel: entity.experienceState.currentLevel,
      isStealthed: entity.objectStatusFlags.has('STEALTHED'),
      isDetected: entity.objectStatusFlags.has('DETECTED'),
    };
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
    return createDeterministicGameLogicCrcSectionWritersImpl({
      spawnedEntities: this.spawnedEntities,
      navigationGrid: this.navigationGrid,
      bridgeSegments: this.bridgeSegments,
      bridgeSegmentByControlEntity: this.bridgeSegmentByControlEntity,
      selectedEntityId: this.selectedEntityId,
      teamRelationshipOverrides: this.teamRelationshipOverrides,
      playerRelationshipOverrides: this.playerRelationshipOverrides,
      placementSummary: this.placementSummary,
      sideKindOfProductionCostModifiers: this.sideKindOfProductionCostModifiers,
      sidePowerBonus: this.sidePowerBonus,
      sideRadarState: this.sideRadarState,
      frameCounter: this.frameCounter,
      nextId: this.nextId,
      animationTime: this.animationTime,
      isAttackMoveToMode: this.isAttackMoveToMode,
      previousAttackMoveToggleDown: this.previousAttackMoveToggleDown,
      config: this.config,
      commandQueue: this.commandQueue,
    });
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
      const pickedEntityId = this.pickObjectByInput(input, camera);
      if (pickedEntityId === null) {
        this.submitCommand({ type: 'clearSelection' });
      } else {
        this.submitCommand({ type: 'select', entityId: pickedEntityId });
      }
    }
    if (input.rightMouseClick && this.selectedEntityIds.length > 0) {
      const pickedEntityId = this.pickObjectByInput(input, camera);
      const moveTarget = this.getMoveTargetFromMouse(input, camera);

      // Compute group centroid for formation offsets.
      const movableEntities: MapEntity[] = [];
      let centerX = 0;
      let centerZ = 0;
      for (const selEntityId of this.selectedEntityIds) {
        const selEntity = this.spawnedEntities.get(selEntityId);
        if (!selEntity || selEntity.destroyed || !selEntity.canMove) continue;
        movableEntities.push(selEntity);
        centerX += selEntity.x;
        centerZ += selEntity.z;
      }
      const groupSize = movableEntities.length;
      if (groupSize > 0) {
        centerX /= groupSize;
        centerZ /= groupSize;
      }
      const useFormation = groupSize > 1;

      // Issue commands to all selected entities.
      for (const selEntity of movableEntities) {
        // Try garrison if infantry right-clicks on a garrisonable building.
        if (
          pickedEntityId !== null
          && pickedEntityId !== selEntity.id
          && selEntity.category === 'infantry'
        ) {
          const targetEntity = this.spawnedEntities.get(pickedEntityId);
          if (
            targetEntity
            && !targetEntity.destroyed
            && targetEntity.containProfile?.moduleType === 'GARRISON'
            && this.getTeamRelationship(selEntity, targetEntity) !== RELATIONSHIP_ENEMIES
          ) {
            this.submitCommand({
              type: 'garrisonBuilding',
              entityId: selEntity.id,
              targetBuildingId: pickedEntityId,
            });
            continue;
          }
        }

        // Try repair if dozer right-clicks on a damaged friendly building.
        if (
          pickedEntityId !== null
          && pickedEntityId !== selEntity.id
          && selEntity.kindOf.has('DOZER')
        ) {
          const targetEntity = this.spawnedEntities.get(pickedEntityId);
          if (
            targetEntity
            && !targetEntity.destroyed
            && targetEntity.kindOf.has('STRUCTURE')
            && targetEntity.health < targetEntity.maxHealth
            && this.getTeamRelationship(selEntity, targetEntity) !== RELATIONSHIP_ENEMIES
          ) {
            this.submitCommand({
              type: 'repairBuilding',
              entityId: selEntity.id,
              targetBuildingId: pickedEntityId,
            });
            continue;
          }
        }

        // Try attack if we clicked on an enemy.
        if (
          selEntity.attackWeapon
          && pickedEntityId !== null
          && pickedEntityId !== selEntity.id
        ) {
          const targetEntity = this.spawnedEntities.get(pickedEntityId);
          if (
            targetEntity
            && !targetEntity.destroyed
            && this.getTeamRelationship(selEntity, targetEntity) === RELATIONSHIP_ENEMIES
          ) {
            this.submitCommand({
              type: 'attackEntity',
              entityId: selEntity.id,
              targetEntityId: pickedEntityId,
            });
            continue;
          }
        }

        // Otherwise move / attack-move with formation offsets.
        if (moveTarget !== null) {
          let destX = moveTarget.x;
          let destZ = moveTarget.z;

          if (useFormation) {
            // Compute relative offset from group center, clamped per C++ source.
            let offX = selEntity.x - centerX;
            let offZ = selEntity.z - centerZ;
            const offLen = Math.sqrt(offX * offX + offZ * offZ);
            const maxSpread = 30; // ~6x typical unit bounding radius (5)
            if (offLen > maxSpread) {
              const scale = maxSpread / offLen;
              offX *= scale;
              offZ *= scale;
            }
            destX += offX;
            destZ += offZ;
          }

          const attackDistance = this.resolveAttackMoveDistance(selEntity);
          if (this.isAttackMoveToMode) {
            this.submitCommand({
              type: 'attackMoveTo',
              entityId: selEntity.id,
              targetX: destX,
              targetZ: destZ,
              attackDistance,
            });
          } else {
            this.submitCommand({
              type: 'moveTo',
              entityId: selEntity.id,
              targetX: destX,
              targetZ: destZ,
            });
          }
        }
      }

      this.isAttackMoveToMode = false;
    }
  }

  /**
   * Update movement and placeholder animation.
   */
  update(dt: number): void {
    this.animationTime += dt;
    this.frameCounter++;
    this.flushCommands();
    this.updateDisabledHackedStatuses();
    this.updateDisabledEmpStatuses();
    this.updateProduction();
    this.updateCombat();
    this.updateEntityMovement(dt);
    this.updateRailedTransport();
    this.updatePendingEnterObjectActions();
    this.updatePendingGarrisonActions();
    this.updatePendingRepairActions();
    this.updatePendingCombatDropActions();
    this.updateHackInternet();
    this.updatePendingHackInternetCommands();
    this.updateOvercharge();
    this.updateStealth();
    this.updateDetection();
    this.updatePoisonedEntities();
    this.updateFlammableEntities();
    this.updateHealing();
    this.updateFogOfWar();
    this.updateSupplyChain();
    this.updateSkirmishAI();
    this.updateEva();
    this.updateSellingEntities();
    this.updateRenderStates();
    this.updateWeaponIdleAutoReload();
    this.updatePendingWeaponDamage();
    this.finalizeDestroyedEntities();
    this.cleanupDyingRenderableStates();
    this.checkVictoryConditions();
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
    return this.getSelectedEntityInfoById(this.selectedEntityId);
  }

  getSelectedEntityInfoById(entityId: number | null): SelectedEntityInfo | null {
    if (entityId === null) {
      return null;
    }

    const selected = this.spawnedEntities.get(entityId);
    if (!selected) {
      return null;
    }

    const registry = this.iniDataRegistry;
    const objectDef = registry
      ? findObjectDefByName(registry, selected.templateName)
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
      objectStatusFlags: Array.from(selected.objectStatusFlags.values()).sort(),
    };
  }

  getEntityWorldPosition(entityId: number): readonly [number, number, number] | null {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) {
      return null;
    }
    return [
      entity.x,
      entity.y,
      entity.z,
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

  resolveCommandCenterEntityId(localPlayerIndex?: number | null): number | null {
    const normalizedPlayerIndex = this.normalizePlayerIndex(
      localPlayerIndex === undefined || localPlayerIndex === null
        ? this.localPlayerIndex
        : localPlayerIndex,
    );
    if (normalizedPlayerIndex === null) {
      return null;
    }
    const localSide = this.playerSideByIndex.get(normalizedPlayerIndex);
    if (!localSide) {
      return null;
    }

    for (const [entityId, entity] of this.spawnedEntities) {
      if (entity.destroyed) {
        continue;
      }
      if (this.normalizeSide(entity.side) !== localSide) {
        continue;
      }
      if (this.resolveEntityKindOfSet(entity).has('COMMANDCENTER')) {
        return entityId;
      }
    }
    return null;
  }

  getLocalPlayerSciencePurchasePoints(): number {
    const side = this.resolveLocalPlayerSide();
    if (!side) return 0;
    return this.getSideRankStateMap(this.normalizeSide(side)!).sciencePurchasePoints;
  }

  getLocalPlayerRankLevel(): number {
    const side = this.resolveLocalPlayerSide();
    if (!side) return 1;
    return this.getSideRankStateMap(this.normalizeSide(side)!).rankLevel;
  }

  getLocalPlayerSkillPoints(): number {
    const side = this.resolveLocalPlayerSide();
    if (!side) return 0;
    return this.getSideRankStateMap(this.normalizeSide(side)!).skillPoints;
  }

  getLocalPlayerNextRankThreshold(): number {
    const level = this.getLocalPlayerRankLevel();
    if (level >= RANK_TABLE.length) return RANK_TABLE[RANK_TABLE.length - 1]?.skillPointsNeeded ?? 0;
    return RANK_TABLE[level]?.skillPointsNeeded ?? 0;
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

  private resolveEntityOwnerSide(entity: MapEntity): string | null {
    const directSide = this.normalizeSide(entity.side);
    if (directSide) {
      return directSide;
    }

    const ownerToken = this.normalizeControllingPlayerToken(entity.controllingPlayerToken ?? undefined);
    if (!ownerToken) {
      return null;
    }

    let resolvedSide: string | null = null;
    for (const candidate of this.spawnedEntities.values()) {
      if (candidate.destroyed) {
        continue;
      }
      if (this.normalizeControllingPlayerToken(candidate.controllingPlayerToken ?? undefined) !== ownerToken) {
        continue;
      }

      const candidateSide = this.normalizeSide(candidate.side);
      if (!candidateSide) {
        continue;
      }
      if (resolvedSide === null) {
        resolvedSide = candidateSide;
        continue;
      }
      if (resolvedSide !== candidateSide) {
        return null;
      }
    }

    return resolvedSide;
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
    return this.pickObjectByInput(input, camera);
  }

  getEntityState(entityId: number): {
    id: number;
    templateName: string;
    resolved: boolean;
    renderAssetCandidates: string[];
    renderAssetPath: string | null;
    renderAssetResolved: boolean;
    renderAnimationStateClips?: RenderAnimationStateClipCandidates;
    health: number;
    maxHealth: number;
    lastSpecialPowerDispatch: SpecialPowerDispatchProfile | null;
    canTakeDamage: boolean;
    attackTargetEntityId: number | null;
    alive: boolean;
    activeLocomotorSet: string;
    speed: number;
    statusFlags: string[];
    x: number;
    y: number;
    animationState: RenderAnimationState;
    z: number;
    veterancyLevel: number;
    currentExperience: number;
    rallyPoint: { x: number; z: number } | null;
  } | null {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) {
      return null;
    }

    return {
      id: entity.id,
      templateName: entity.templateName,
      resolved: entity.resolved,
      renderAssetCandidates: entity.renderAssetCandidates,
      renderAssetPath: entity.renderAssetPath,
      renderAssetResolved: entity.renderAssetResolved,
      renderAnimationStateClips: entity.renderAnimationStateClips,
      health: entity.health,
      maxHealth: entity.maxHealth,
      lastSpecialPowerDispatch: entity.lastSpecialPowerDispatch ? {
        specialPowerTemplateName: entity.lastSpecialPowerDispatch.specialPowerTemplateName,
        moduleType: entity.lastSpecialPowerDispatch.moduleType,
        dispatchType: entity.lastSpecialPowerDispatch.dispatchType,
        commandOption: entity.lastSpecialPowerDispatch.commandOption,
        commandButtonId: entity.lastSpecialPowerDispatch.commandButtonId,
        targetEntityId: entity.lastSpecialPowerDispatch.targetEntityId,
        targetX: entity.lastSpecialPowerDispatch.targetX,
        targetZ: entity.lastSpecialPowerDispatch.targetZ,
      } : null,
      canTakeDamage: entity.canTakeDamage,
      attackTargetEntityId: entity.attackTargetEntityId,
      alive: !entity.destroyed,
      activeLocomotorSet: entity.activeLocomotorSet,
      speed: entity.speed,
      statusFlags: Array.from(entity.objectStatusFlags.values()).sort(),
      x: entity.x,
      y: entity.y,
      animationState: entity.animationState,
      z: entity.z,
      veterancyLevel: entity.experienceState.currentLevel,
      currentExperience: entity.experienceState.currentExperience,
      rallyPoint: entity.rallyPoint ? { x: entity.rallyPoint.x, z: entity.rallyPoint.z } : null,
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

  getEntityIdsByTemplateAndSide(templateName: string, side: string): number[] {
    const normalizedTemplateName = templateName.trim().toUpperCase();
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedTemplateName || !normalizedSide) {
      return [];
    }
    return Array.from(this.spawnedEntities.values())
      .filter(
        (entity) =>
          this.normalizeSide(entity.side) === normalizedSide
          && entity.templateName.toUpperCase() === normalizedTemplateName,
      )
      .map((entity) => entity.id)
      .sort((left, right) => left - right);
  }

  getLocalPlayerSelectionIds(): readonly number[] {
    return [...this.selectedEntityIds];
  }

  /**
   * Source parity: VictoryConditions.cpp — hasSinglePlayerBeenDefeated / hasAchievedVictory.
   * Returns the game end state for the local player (player index 0).
   */
  getGameEndState(): import('./types.js').GameEndState | null {
    if (this.gameEndFrame === null) {
      return null;
    }

    const localSide = this.resolveLocalPlayerSide();
    if (!localSide) {
      return null;
    }

    const status = this.defeatedSides.has(localSide) ? 'DEFEAT' as const : 'VICTORY' as const;
    const victorSides: string[] = [];
    const defeatedSides = Array.from(this.defeatedSides);

    for (const [, side] of this.playerSideByIndex) {
      if (!this.defeatedSides.has(side) && !victorSides.includes(side)) {
        victorSides.push(side);
      }
    }

    return {
      status,
      endFrame: this.gameEndFrame,
      victorSides,
      defeatedSides,
    };
  }

  /**
   * Check if a side has been defeated (no buildings and no combat units remaining).
   */
  isSideDefeated(side: string): boolean {
    return this.defeatedSides.has(this.normalizeSide(side));
  }

  /**
   * Drain the visual events buffer. Returns all events since the last drain.
   * The caller should consume these for particle effects, sounds, etc.
   */
  drainVisualEvents(): import('./types.js').VisualEvent[] {
    if (this.visualEventBuffer.length === 0) return [];
    const events = this.visualEventBuffer.slice();
    this.visualEventBuffer.length = 0;
    return events;
  }

  /**
   * Drain the EVA announcer events buffer. Returns all events since the last drain.
   * The caller should consume these for audio playback (voice lines).
   */
  drainEvaEvents(): import('./types.js').EvaEvent[] {
    if (this.evaEventBuffer.length === 0) return [];
    const events = this.evaEventBuffer.slice();
    this.evaEventBuffer.length = 0;
    return events;
  }

  /**
   * Return in-flight projectile data for renderer visualization.
   * Each projectile has an interpolated position based on launch/impact timing.
   */
  getActiveProjectiles(): import('./types.js').ActiveProjectile[] {
    const projectiles: import('./types.js').ActiveProjectile[] = [];
    const heightmap = this.mapHeightmap;

    for (const event of this.pendingWeaponDamageEvents) {
      if (event.delivery !== 'PROJECTILE') continue;

      const totalFrames = event.executeFrame - event.launchFrame;
      if (totalFrames <= 0) continue;

      const elapsed = this.frameCounter - event.launchFrame;
      const progress = Math.min(1, Math.max(0, elapsed / totalFrames));

      // Linear interpolation for x/z.
      const x = event.sourceX + (event.impactX - event.sourceX) * progress;
      const z = event.sourceZ + (event.impactZ - event.sourceZ) * progress;

      // Parabolic arc for y: peak at midpoint.
      const baseY = event.sourceY;
      const arcHeight = Math.max(5, Math.hypot(event.impactX - event.sourceX, event.impactZ - event.sourceZ) * 0.15);
      const arcY = baseY + arcHeight * 4 * progress * (1 - progress);
      const terrainY = heightmap ? heightmap.getInterpolatedHeight(x, z) : 0;
      const y = Math.max(terrainY + 1, arcY);

      // Heading from source to target.
      const heading = Math.atan2(event.impactX - event.sourceX, event.impactZ - event.sourceZ);

      projectiles.push({
        id: event.projectileVisualId,
        sourceEntityId: event.sourceEntityId,
        visualType: event.cachedVisualType,
        x, y, z,
        targetX: event.impactX,
        targetZ: event.impactZ,
        progress,
        heading,
      });
    }

    return projectiles;
  }

  getSelectedEntityInfos(entityIds: readonly number[]): SelectedEntityInfo[] {
    const infos: SelectedEntityInfo[] = [];
    const seen = new Set<number>();
    for (const entityId of entityIds) {
      if (seen.has(entityId)) {
        continue;
      }
      seen.add(entityId);
      const info = this.getSelectedEntityInfoById(entityId);
      if (info !== null) {
        infos.push(info);
      }
    }
    return infos;
  }

  getProductionState(entityId: number): {
    queueEntryCount: number;
    maxQueueEntries?: number;
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
      maxQueueEntries: entity.productionProfile?.maxQueueEntries,
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
      return { powerBonus: 0, energyProduction: 0, energyConsumption: 0 };
    }
    const state = this.getSidePowerStateMap(normalizedSide);
    return {
      powerBonus: state.powerBonus,
      energyProduction: state.energyProduction,
      energyConsumption: state.energyConsumption,
    };
  }

  /**
   * Returns true if the side has sufficient power (production >= consumption).
   * Source parity: Energy::hasSufficientPower().
   */
  hasSufficientPower(side: string): boolean {
    const state = this.getSidePowerState(side);
    const totalProduction = state.energyProduction + state.powerBonus;
    return totalProduction >= state.energyConsumption;
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
    const scienceDef = findScienceDefByName(registry, normalizedScienceName);
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
    if (costRaw === null || !Number.isFinite(costRaw)) {
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

    const scienceDef = findScienceDefByName(registry, normalizedScienceName);
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
    if (scienceCost <= 0 || scienceCost > this.getLocalPlayerSciencePurchasePoints()) {
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

    const created: SidePowerState = { powerBonus: 0, energyProduction: 0, energyConsumption: 0 };
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

  private getSideRankStateMap(normalizedSide: string): SideRankState {
    const existing = this.sideRankState.get(normalizedSide);
    if (existing) {
      return existing;
    }
    // Source parity: Player::resetRank — start at rank 1, with rank 1's purchase points.
    const created: SideRankState = {
      rankLevel: 1,
      skillPoints: 0,
      sciencePurchasePoints: RANK_TABLE[0]?.sciencePurchasePointsGranted ?? 0,
    };
    this.sideRankState.set(normalizedSide, created);
    return created;
  }

  /**
   * Source parity: Player::addSkillPoints — award player-level skill points from kills.
   * Returns true if a rank level-up occurred.
   */
  private addPlayerSkillPoints(side: string, delta: number): boolean {
    if (delta <= 0) return false;
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) return false;

    const rankState = this.getSideRankStateMap(normalizedSide);

    // Cap at max rank threshold.
    const maxRank = RANK_TABLE.length;
    const pointCap = RANK_TABLE[maxRank - 1]?.skillPointsNeeded ?? Infinity;
    rankState.skillPoints = Math.min(pointCap, rankState.skillPoints + delta);

    // Check for level-ups.
    let didLevelUp = false;
    while (rankState.rankLevel < maxRank) {
      const nextRank = RANK_TABLE[rankState.rankLevel]; // 0-indexed, current is (rankLevel-1), next is (rankLevel)
      if (!nextRank || rankState.skillPoints < nextRank.skillPointsNeeded) break;
      rankState.rankLevel++;
      rankState.sciencePurchasePoints += nextRank.sciencePurchasePointsGranted;
      didLevelUp = true;
    }

    return didLevelUp;
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
    const scienceDef = findScienceDefByName(registry, normalizedScienceName);
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
      const upgradeDef = findUpgradeDefByName(this.iniDataRegistry, normalizedUpgrade);
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
    // Transfer base energy between sides on capture.
    this.unregisterEntityEnergy(entity);
    entity.side = normalizedNewSide;
    entity.controllingPlayerToken = this.normalizeControllingPlayerToken(normalizedNewSide);
    this.registerEntityEnergy(entity);
    this.transferCostModifierUpgradesBetweenSides(entity, normalizedOldSide, normalizedNewSide);
    this.transferPowerPlantUpgradesBetweenSides(entity, normalizedOldSide, normalizedNewSide);
    this.transferOverchargeBetweenSides(entity, normalizedOldSide, normalizedNewSide);
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
    this.sidePowerBonus.clear();
    this.sideRadarState.clear();
    this.sideRankState.clear();
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
    const renderAssetProfile = this.resolveRenderAssetProfile(objectDef);

    const nominalHeight = nominalHeightForCategory(category);

    const locomotorSetProfiles = this.resolveLocomotorProfiles(objectDef, iniDataRegistry);
    const upgradeModules = this.extractUpgradeModules(objectDef);
    const productionProfile = this.extractProductionProfile(objectDef);
    const queueProductionExitProfile = this.extractQueueProductionExitProfile(objectDef);
    const parkingPlaceProfile = this.extractParkingPlaceProfile(objectDef);
    const containProfile = this.extractContainProfile(objectDef);
    const supplyWarehouseProfile = this.extractSupplyWarehouseProfile(objectDef);
    const supplyTruckProfile = this.extractSupplyTruckProfile(objectDef);
    const isSupplyCenter = this.detectIsSupplyCenter(objectDef);
    const experienceProfile = this.extractExperienceProfile(objectDef);
    const jetAISneakyProfile = this.extractJetAISneakyProfile(objectDef);
    const weaponTemplateSets = this.extractWeaponTemplateSets(objectDef);
    const armorTemplateSets = this.extractArmorTemplateSets(objectDef);
    const attackWeapon = this.resolveAttackWeaponProfile(objectDef, iniDataRegistry);
    const specialPowerModules = this.extractSpecialPowerModules(objectDef);
    const bodyStats = this.resolveBodyStats(objectDef);
    const energyBonus = readNumericField(objectDef?.fields ?? {}, ['EnergyBonus']) ?? 0;
    const largestWeaponRange = this.resolveLargestWeaponRange(objectDef, iniDataRegistry);
    const totalWeaponAntiMask = this.resolveTotalWeaponAntiMaskForSetSelection(
      weaponTemplateSets, 0, iniDataRegistry,
    );
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
    const [worldX, worldY, worldZ] = this.objectToWorldPosition(mapObject, heightmap);
    const baseHeight = nominalHeight / 2;
    const x = worldX;
    const y = worldY + baseHeight;
    const z = worldZ;
    const rotationY = THREE.MathUtils.degToRad(mapObject.angle);
    const bridgeFlags = mapObject.flags & (OBJECT_FLAG_BRIDGE_POINT1 | OBJECT_FLAG_BRIDGE_POINT2);
    const mapCellX = Math.floor(mapObject.position.x / MAP_XY_FACTOR);
    const mapCellZ = Math.floor(mapObject.position.y / MAP_XY_FACTOR);

    const [posCellX, posCellZ] = this.worldToGrid(x, z);
    const initialClipAmmo = attackWeapon && attackWeapon.clipSize > 0 ? attackWeapon.clipSize : 0;
    const initialScatterTargetsUnused = attackWeapon
      ? Array.from({ length: attackWeapon.scatterTargets.length }, (_entry, index) => index)
      : [];

    return {
      id: objectId,
      templateName: mapObject.templateName,
      category,
      kindOf: normalizedKindOf,
      side: objectDef?.side,
      controllingPlayerToken,
      resolved: isResolved,
      bridgeFlags,
      mapCellX,
      mapCellZ,
      renderAssetCandidates: renderAssetProfile.renderAssetCandidates,
      renderAssetPath: renderAssetProfile.renderAssetPath,
      renderAssetResolved: renderAssetProfile.renderAssetResolved,
      renderAnimationStateClips: renderAssetProfile.renderAnimationStateClips,
      x,
      y,
      z,
      rotationY,
      animationState: 'IDLE',
      baseHeight,
      nominalHeight,
      selected: false,
      crusherLevel: combatProfile.crusherLevel,
      crushableLevel: combatProfile.crushableLevel,
      canBeSquished: combatProfile.canBeSquished,
      isUnmanned: combatProfile.isUnmanned,
      attackNeedsLineOfSight,
      isImmobile,
      noCollisions: false,
      isIndestructible: false,
      canMove: category === 'infantry' || category === 'vehicle' || category === 'air',
      locomotorSets: locomotorSetProfiles,
      completedUpgrades: new Set<string>(),
      locomotorUpgradeTriggers: new Set<string>(),
      executedUpgradeModules: new Set<string>(),
      upgradeModules,
      objectStatusFlags: new Set<string>(),
      commandSetStringOverride: null,
      locomotorUpgradeEnabled: false,
      specialPowerModules,
      lastSpecialPowerDispatch: null,
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
      forcedWeaponSlot: null,
      weaponLockStatus: 'NOT_LOCKED' as const,
      maxShotsRemaining: 0,
      armorTemplateSets,
      armorSetFlagsMask: 0,
      armorDamageCoefficients,
      attackTargetEntityId: null,
      attackTargetPosition: null,
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
      garrisonContainerId: null,
      helixPortableRiderId: null,
      pathDiameter,
      pathfindCenterInCell,
      blocksPath,
      obstacleGeometry,
      obstacleFootprint,
      largestWeaponRange,
      totalWeaponAntiMask,
      ignoredMovementObstacleId: null,
      movePath: [],
      pathIndex: 0,
      moving: false,
      speed: locomotorProfile.movementSpeed > 0 ? locomotorProfile.movementSpeed : this.config.defaultMoveSpeed,
      moveTarget: null,
      pathfindGoalCell: null,
      pathfindPosCell: (posCellX !== null && posCellZ !== null) ? { x: posCellX, z: posCellZ } : null,
      supplyWarehouseProfile,
      supplyTruckProfile,
      isSupplyCenter,
      experienceProfile,
      experienceState: createExperienceStateImpl(),
      visionRange: readNumericField(objectDef?.fields ?? {}, ['VisionRange', 'ShroudClearingRange']) ?? 0,
      visionState: createEntityVisionStateImpl(),
      stealthDelayRemaining: 0,
      detectedUntilFrame: 0,
      autoHealProfile: this.extractAutoHealProfile(objectDef),
      autoHealNextFrame: 0,
      autoHealDamageDelayUntilFrame: 0,
      baseRegenDelayUntilFrame: 0,
      propagandaTowerProfile: this.extractPropagandaTowerProfile(objectDef),
      propagandaTowerNextScanFrame: 0,
      propagandaTowerTrackedIds: [],
      soleHealingBenefactorId: null,
      soleHealingBenefactorExpirationFrame: 0,
      // Poison DoT state
      poisonDamageAmount: 0,
      poisonNextDamageFrame: 0,
      poisonExpireFrame: 0,
      poisonDamageIntervalFrames: DEFAULT_POISON_DAMAGE_INTERVAL_FRAMES,
      poisonDurationFrames: DEFAULT_POISON_DURATION_FRAMES,
      // Fire DoT state
      flameStatus: 'NORMAL' as const,
      flameDamageAccumulated: 0,
      flameEndFrame: 0,
      flameDamageNextFrame: 0,
      flameLastDamageReceivedFrame: 0,
      flammableProfile: this.extractFlammableProfile(objectDef),
      // Pilot eject
      ejectPilotTemplateName: this.extractEjectPilotTemplateName(objectDef),
      ejectPilotMinVeterancy: 1,
      // Death OCLs
      deathOCLNames: this.extractDeathOCLNames(objectDef),
      destroyed: false,
    };
  }

  private resolveRenderAssetProfile(objectDef: ObjectDef | undefined): {
    renderAssetCandidates: string[];
    renderAssetPath: string | null;
    renderAssetResolved: boolean;
    renderAnimationStateClips: RenderAnimationStateClipCandidates;
  } {
    return resolveRenderAssetProfileImpl(objectDef);
  }

  private resolveForwardUnitVector(entity: MapEntity): { x: number; z: number } {
    return {
      x: Math.cos(entity.rotationY),
      z: Math.sin(entity.rotationY),
    };
  }

  private deriveRenderAnimationState(entity: MapEntity): RenderAnimationState {
    // Source parity note:
    // Generals/Code/GameEngine/Source/GameLogic/Thing/Drawable.cpp
    // drives render-state from object locomotor/combat lifecycle transitions.
    if (entity.destroyed) {
      return 'DIE';
    }

    if (entity.attackTargetEntityId !== null && this.canEntityAttackFromStatus(entity)) {
      return 'ATTACK';
    }

    if (entity.canMove && entity.moving) {
      return 'MOVE';
    }

    return 'IDLE';
  }

  private updateRenderState(entity: MapEntity): void {
    entity.animationState = this.deriveRenderAnimationState(entity);
  }

  private updateRenderStates(): void {
    for (const entity of this.spawnedEntities.values()) {
      this.updateRenderState(entity);
    }
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
    return shouldPathfindObstacleImpl(
      objectDef,
      {
        mapXyFactor: MAP_XY_FACTOR,
        normalizeKindOf: (kindOf) => this.normalizeKindOf(kindOf),
        isMobileObject: (nextObjectDef, kinds) => this.isMobileObject(nextObjectDef, kinds),
        isSmallGeometry: (fields) => this.isSmallGeometry(fields),
      },
    );
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

  private normalizeWeaponSlot(weaponSlot: number | null): number | null {
    if (weaponSlot === null || !Number.isFinite(weaponSlot)) {
      return null;
    }
    const normalized = Math.trunc(weaponSlot);
    if (!Number.isFinite(normalized) || normalized < 0 || normalized > 2) {
      return null;
    }
    return normalized;
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
    // Source parity: Weapon::m_antiMask — WeaponTemplate::clear() pre-seeds WEAPON_ANTI_GROUND
    // before INI parsing, so all weapons can target ground by default unless explicitly cleared.
    let antiMask = WEAPON_ANTI_GROUND;
    if (readBooleanField(weaponDef.fields, ['AntiAirborneVehicle'])) antiMask |= WEAPON_ANTI_AIRBORNE_VEHICLE;
    if (readBooleanField(weaponDef.fields, ['AntiGround']) === false) antiMask &= ~WEAPON_ANTI_GROUND;
    if (readBooleanField(weaponDef.fields, ['AntiProjectile'])) antiMask |= WEAPON_ANTI_PROJECTILE;
    if (readBooleanField(weaponDef.fields, ['AntiSmallMissile'])) antiMask |= WEAPON_ANTI_SMALL_MISSILE;
    if (readBooleanField(weaponDef.fields, ['AntiMine'])) antiMask |= WEAPON_ANTI_MINE;
    if (readBooleanField(weaponDef.fields, ['AntiAirborneInfantry'])) antiMask |= WEAPON_ANTI_AIRBORNE_INFANTRY;
    if (readBooleanField(weaponDef.fields, ['AntiBallisticMissile'])) antiMask |= WEAPON_ANTI_BALLISTIC_MISSILE;
    if (readBooleanField(weaponDef.fields, ['AntiParachute'])) antiMask |= WEAPON_ANTI_PARACHUTE;

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
      antiMask,
    };
  }

  private resolveAttackWeaponProfileForSetSelection(
    weaponTemplateSets: readonly WeaponTemplateSetProfile[],
    weaponSetFlagsMask: number,
    iniDataRegistry: IniDataRegistry,
    forcedWeaponSlot: number | null = null,
  ): AttackWeaponProfile | null {
    const selectedSet = this.selectBestSetByConditions(weaponTemplateSets, weaponSetFlagsMask);
    if (!selectedSet) {
      return null;
    }

    const normalizedForcedWeaponSlot = this.normalizeWeaponSlot(forcedWeaponSlot);
    if (normalizedForcedWeaponSlot !== null) {
      const weaponName = selectedSet.weaponNamesBySlot[normalizedForcedWeaponSlot];
      if (weaponName) {
        const forcedWeapon = findWeaponDefByName(iniDataRegistry, weaponName);
        if (forcedWeapon) {
          const profile = this.resolveWeaponProfileFromDef(forcedWeapon);
          if (profile) {
            return profile;
          }
        }
      }
    }

    for (const weaponName of selectedSet.weaponNamesBySlot) {
      if (!weaponName) {
        continue;
      }
      const weapon = findWeaponDefByName(iniDataRegistry, weaponName);
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
    forcedWeaponSlot: number | null = null,
  ): number {
    const selectedSet = this.selectBestSetByConditions(weaponTemplateSets, weaponSetFlagsMask);
    if (!selectedSet) {
      return NO_ATTACK_DISTANCE;
    }

    const normalizedForcedWeaponSlot = this.normalizeWeaponSlot(forcedWeaponSlot);
    if (normalizedForcedWeaponSlot !== null) {
      const weaponName = selectedSet.weaponNamesBySlot[normalizedForcedWeaponSlot];
      if (weaponName) {
        const weapon = findWeaponDefByName(iniDataRegistry, weaponName);
        if (weapon) {
          const weaponProfile = this.resolveWeaponProfileFromDef(weapon);
          if (weaponProfile) {
            return weaponProfile.attackRange;
          }
        }
      }
    }

    let largestWeaponRange = NO_ATTACK_DISTANCE;
    for (const weaponName of selectedSet.weaponNamesBySlot) {
      if (!weaponName) {
        continue;
      }
      const weapon = findWeaponDefByName(iniDataRegistry, weaponName);
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

  /**
   * Source parity: WeaponSet::m_totalAntiMask — bitwise OR of all weapon antiMasks in the
   * selected weapon set. Used for fast rejection in getAbleToAttackSpecificObject.
   */
  private resolveTotalWeaponAntiMaskForSetSelection(
    weaponTemplateSets: readonly WeaponTemplateSetProfile[],
    weaponSetFlagsMask: number,
    iniDataRegistry: IniDataRegistry,
    forcedWeaponSlot: number | null = null,
  ): number {
    const selectedSet = this.selectBestSetByConditions(weaponTemplateSets, weaponSetFlagsMask);
    if (!selectedSet) {
      return 0;
    }

    const normalizedForcedWeaponSlot = this.normalizeWeaponSlot(forcedWeaponSlot);
    if (normalizedForcedWeaponSlot !== null) {
      const weaponName = selectedSet.weaponNamesBySlot[normalizedForcedWeaponSlot];
      if (weaponName) {
        const weapon = findWeaponDefByName(iniDataRegistry, weaponName);
        if (weapon) {
          const profile = this.resolveWeaponProfileFromDef(weapon);
          if (profile) {
            return profile.antiMask;
          }
        }
      }
      return 0;
    }

    let totalAntiMask = 0;
    for (const weaponName of selectedSet.weaponNamesBySlot) {
      if (!weaponName) {
        continue;
      }
      const weapon = findWeaponDefByName(iniDataRegistry, weaponName);
      if (!weapon) {
        continue;
      }
      const profile = this.resolveWeaponProfileFromDef(weapon);
      if (profile) {
        totalAntiMask |= profile.antiMask;
      }
    }

    return totalAntiMask;
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

    const armorDef = findArmorDefByName(iniDataRegistry, selectedSet.armorName);
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
      const containMax = readNumericField(block.fields, ['ContainMax']) ?? 0;
      const payloadTemplateNames = readStringList(block.fields, ['PayloadTemplateName']).map((templateName) =>
        templateName.toUpperCase(),
      );

      if (moduleType === 'OPENCONTAIN') {
        profile = {
          moduleType: 'OPEN',
          passengersAllowedToFire,
          passengersAllowedToFireDefault: passengersAllowedToFire,
          garrisonCapacity: 0,
        };
      } else if (moduleType === 'TRANSPORTCONTAIN') {
        profile = {
          moduleType: 'TRANSPORT',
          passengersAllowedToFire,
          passengersAllowedToFireDefault: passengersAllowedToFire,
          garrisonCapacity: 0,
        };
      } else if (moduleType === 'OVERLORDCONTAIN') {
        profile = {
          moduleType: 'OVERLORD',
          passengersAllowedToFire,
          passengersAllowedToFireDefault: passengersAllowedToFire,
          garrisonCapacity: 0,
        };
      } else if (moduleType === 'HELIXCONTAIN') {
        // HELIXCONTAIN is a Zero Hour-specific container module name used by data INIs;
        // we map it to a dedicated internal container profile to preserve source behavior.
        profile = {
          moduleType: 'HELIX',
          passengersAllowedToFire,
          passengersAllowedToFireDefault: passengersAllowedToFire,
          portableStructureTemplateNames: payloadTemplateNames,
          garrisonCapacity: 0,
        };
      } else if (moduleType === 'GARRISONCONTAIN') {
        // GarrisonContain is OpenContain-derived in source but always returns TRUE from
        // isPassengerAllowedToFire(), so we track it explicitly for behavior parity.
        profile = {
          moduleType: 'GARRISON',
          passengersAllowedToFire: true,
          passengersAllowedToFireDefault: true,
          garrisonCapacity: containMax > 0 ? containMax : 10,
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

  /**
   * Source parity: SupplyWarehouseDockUpdate.h — starting boxes + deleteWhenEmpty flag.
   */
  private extractSupplyWarehouseProfile(objectDef: ObjectDef | undefined): SupplyWarehouseProfile | null {
    if (!objectDef) {
      return null;
    }

    let profile: SupplyWarehouseProfile | null = null;
    const visitBlock = (block: IniBlock): void => {
      if (profile !== null) {
        return;
      }
      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (moduleType === 'SUPPLYWAREHOUSEDOCKUPDATE') {
          profile = {
            startingBoxes: Math.max(0, Math.trunc(readNumericField(block.fields, ['StartingBoxes']) ?? 1)),
            deleteWhenEmpty: readBooleanField(block.fields, ['DeleteWhenEmpty']) === true,
          };
          return;
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

  /**
   * Source parity: SupplyTruckAIUpdate.h — max boxes, action delays, scan distance.
   */
  private extractSupplyTruckProfile(objectDef: ObjectDef | undefined): SupplyTruckProfile | null {
    if (!objectDef) {
      return null;
    }

    let profile: SupplyTruckProfile | null = null;
    const visitBlock = (block: IniBlock): void => {
      if (profile !== null) {
        return;
      }
      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (moduleType === 'SUPPLYTRUCKAIUPDATE') {
          const maxBoxes = Math.max(1, Math.trunc(readNumericField(block.fields, ['MaxBoxes']) ?? 3));
          const supplyCenterActionDelayMs = readNumericField(block.fields, ['SupplyCenterActionDelay']) ?? 0;
          const supplyWarehouseActionDelayMs = readNumericField(block.fields, ['SupplyWarehouseActionDelay']) ?? 0;
          const scanDistance = readNumericField(block.fields, ['SupplyWarehouseScanDistance']) ?? 200;
          profile = {
            maxBoxes,
            supplyCenterActionDelayFrames: this.msToLogicFrames(supplyCenterActionDelayMs),
            supplyWarehouseActionDelayFrames: this.msToLogicFrames(supplyWarehouseActionDelayMs),
            supplyWarehouseScanDistance: Math.max(0, scanDistance),
          };
          return;
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

  /**
   * Detect if an entity definition includes a SupplyCenterDockUpdate behavior module.
   */
  private detectIsSupplyCenter(objectDef: ObjectDef | undefined): boolean {
    if (!objectDef) {
      return false;
    }

    let found = false;
    const visitBlock = (block: IniBlock): void => {
      if (found) {
        return;
      }
      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (moduleType === 'SUPPLYCENTERDOCKUPDATE') {
          found = true;
          return;
        }
      }
      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const block of objectDef.blocks) {
      visitBlock(block);
    }

    return found;
  }

  /**
   * Source parity: ThingTemplate — ExperienceRequired, ExperienceValue fields.
   * These are space-separated 4-element lists: [REGULAR] [VETERAN] [ELITE] [HEROIC].
   */
  private extractExperienceProfile(objectDef: ObjectDef | undefined): ExperienceProfile | null {
    if (!objectDef) {
      return null;
    }

    const expRequiredRaw = readNumericListField(objectDef.fields, ['ExperienceRequired']);
    const expValueRaw = readNumericListField(objectDef.fields, ['ExperienceValue']);

    if (!expRequiredRaw && !expValueRaw) {
      return null;
    }

    const expRequired: [number, number, number, number] = [0, 0, 0, 0];
    const expValue: [number, number, number, number] = [0, 0, 0, 0];

    if (expRequiredRaw) {
      for (let i = 0; i < 4 && i < expRequiredRaw.length; i++) {
        expRequired[i] = Math.max(0, Math.trunc(expRequiredRaw[i] ?? 0));
      }
    }

    if (expValueRaw) {
      for (let i = 0; i < 4 && i < expValueRaw.length; i++) {
        expValue[i] = Math.max(0, Math.trunc(expValueRaw[i] ?? 0));
      }
    }

    return {
      experienceRequired: expRequired,
      experienceValue: expValue,
    };
  }

  /**
   * Source parity: AutoHealBehavior — parse self-heal module from INI.
   */
  private extractAutoHealProfile(objectDef: ObjectDef | undefined): AutoHealProfile | null {
    if (!objectDef) return null;
    let profile: AutoHealProfile | null = null;
    const visitBlock = (block: IniBlock): void => {
      if (profile !== null) return;
      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (moduleType === 'AUTOHEALBEHAVIOR') {
          profile = {
            healingAmount: readNumericField(block.fields, ['HealingAmount']) ?? 0,
            healingDelayFrames: readNumericField(block.fields, ['HealingDelay']) ?? 900,
            startHealingDelayFrames: readNumericField(block.fields, ['StartHealingDelay']) ?? 0,
            radius: readNumericField(block.fields, ['Radius']) ?? 0,
            affectsWholePlayer: readBooleanField(block.fields, ['AffectsWholePlayer']) ?? false,
            initiallyActive: readBooleanField(block.fields, ['StartsActive']) ?? false,
          };
        }
      }
      if (block.blocks) {
        for (const child of block.blocks) visitBlock(child);
      }
    };
    if (objectDef.blocks) {
      for (const block of objectDef.blocks) visitBlock(block);
    }
    return profile;
  }

  /**
   * Source parity: PropagandaTowerBehavior — parse aura heal module from INI.
   */
  private extractPropagandaTowerProfile(objectDef: ObjectDef | undefined): PropagandaTowerProfile | null {
    if (!objectDef) return null;
    let profile: PropagandaTowerProfile | null = null;
    const visitBlock = (block: IniBlock): void => {
      if (profile !== null) return;
      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (moduleType === 'PROPAGANDATOWERBEHAVIOR') {
          profile = {
            radius: readNumericField(block.fields, ['Radius']) ?? 100,
            scanDelayFrames: readNumericField(block.fields, ['DelayBetweenUpdates']) ?? 100,
            healPercentPerSecond: readNumericField(block.fields, ['HealPercentEachSecond']) ?? 0.01,
            upgradedHealPercentPerSecond: readNumericField(block.fields, ['UpgradedHealPercentEachSecond']) ?? 0.02,
            upgradeRequired: readStringField(block.fields, ['UpgradeRequired']) ?? null,
          };
        }
      }
      if (block.blocks) {
        for (const child of block.blocks) visitBlock(child);
      }
    };
    if (objectDef.blocks) {
      for (const block of objectDef.blocks) visitBlock(block);
    }
    return profile;
  }

  /**
   * Source parity: FlammableUpdate module — extract flammability profile from INI.
   */
  private extractFlammableProfile(objectDef: ObjectDef | undefined): FlammableProfile | null {
    if (!objectDef) return null;
    let profile: FlammableProfile | null = null;
    const visitBlock = (block: IniBlock): void => {
      if (profile !== null) return;
      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (moduleType === 'FLAMMABLEUPDATE') {
          profile = {
            flameDamageLimit: readNumericField(block.fields, ['FlameDamageLimit']) ?? DEFAULT_FLAME_DAMAGE_LIMIT,
            flameDamageExpirationDelayFrames: this.msToLogicFrames(readNumericField(block.fields, ['FlameDamageExpiration']) ?? 2000),
            aflameDurationFrames: this.msToLogicFrames(readNumericField(block.fields, ['AflameDuration']) ?? 3000),
            aflameDamageDelayFrames: this.msToLogicFrames(readNumericField(block.fields, ['AflameDamageDelay']) ?? 500),
            aflameDamageAmount: readNumericField(block.fields, ['AflameDamageAmount']) ?? DEFAULT_AFLAME_DAMAGE_AMOUNT,
          };
        }
      }
      if (block.blocks) {
        for (const child of block.blocks) visitBlock(child);
      }
    };
    if (objectDef.blocks) {
      for (const block of objectDef.blocks) visitBlock(block);
    }
    return profile;
  }

  /**
   * Source parity: EjectPilotDie module — extract pilot template name from INI.
   * Searches for EjectPilotDie or HelicopterSlowDeathBehavior with OCLEjectPilot.
   */
  private extractEjectPilotTemplateName(objectDef: ObjectDef | undefined): string | null {
    if (!objectDef) return null;
    let pilotName: string | null = null;
    const visitBlock = (block: IniBlock): void => {
      if (pilotName !== null) return;
      const blockType = block.type.toUpperCase();
      if (blockType === 'BEHAVIOR' || blockType === 'DIE') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (moduleType === 'EJECTPILOTDIE' || moduleType === 'HELICOPTERSLOWDEATHBEHAVIOR') {
          // Look for OCLEjectPilot or CreationList fields that reference an OCL containing the pilot
          const oclName = readStringField(block.fields, ['GroundCreationList', 'AirCreationList', 'OCLEjectPilot']);
          if (oclName) {
            // Resolve the OCL to find the pilot unit template name.
            // For now, use a convention-based approach:
            // Most EjectPilot OCLs create an infantry pilot unit like 'AmericaPilot' or 'ChinaPilot'.
            pilotName = oclName;
          }
        }
      }
      if (block.blocks) {
        for (const child of block.blocks) visitBlock(child);
      }
    };
    if (objectDef.blocks) {
      for (const block of objectDef.blocks) visitBlock(block);
    }
    return pilotName;
  }

  private extractRailedTransportProfile(objectDef: ObjectDef | undefined): RailedTransportProfile | null {
    return extractRailedTransportProfileImpl(objectDef);
  }

  private extractHackInternetProfile(objectDef: ObjectDef | undefined): HackInternetProfile | null {
    if (!objectDef) {
      return null;
    }

    let profile: HackInternetProfile | null = null;
    const visitBlock = (block: IniBlock): void => {
      if (profile !== null) {
        return;
      }
      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (moduleType === 'HACKINTERNETAIUPDATE') {
          const unpackTimeMs = readNumericField(block.fields, ['UnpackTime']) ?? 0;
          const packTimeMs = readNumericField(block.fields, ['PackTime']) ?? 0;
          const cashUpdateDelayMs = readNumericField(block.fields, ['CashUpdateDelay']) ?? 0;
          const cashUpdateDelayFastMs = readNumericField(block.fields, ['CashUpdateDelayFast']) ?? cashUpdateDelayMs;
          profile = {
            unpackTimeFrames: this.msToLogicFrames(unpackTimeMs),
            packTimeFrames: this.msToLogicFrames(packTimeMs),
            cashUpdateDelayFrames: this.msToLogicFrames(cashUpdateDelayMs),
            cashUpdateDelayFastFrames: this.msToLogicFrames(cashUpdateDelayFastMs),
            regularCashAmount: Math.max(0, Math.trunc(readNumericField(block.fields, ['RegularCashAmount']) ?? 0)),
            veteranCashAmount: Math.max(0, Math.trunc(readNumericField(block.fields, ['VeteranCashAmount']) ?? 0)),
            eliteCashAmount: Math.max(0, Math.trunc(readNumericField(block.fields, ['EliteCashAmount']) ?? 0)),
            heroicCashAmount: Math.max(0, Math.trunc(readNumericField(block.fields, ['HeroicCashAmount']) ?? 0)),
          };
          return;
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

  private extractOverchargeBehaviorProfile(objectDef: ObjectDef | null | undefined): OverchargeBehaviorProfile | null {
    if (!objectDef) {
      return null;
    }

    let profile: OverchargeBehaviorProfile | null = null;
    const visitBlock = (block: IniBlock): void => {
      if (profile !== null) {
        return;
      }
      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (moduleType === 'OVERCHARGEBEHAVIOR') {
          const drainPercent = this.parsePercent(this.readIniFieldValue(block.fields, 'HealthPercentToDrainPerSecond')) ?? 0;
          const minHealthPercent = this.parsePercent(
            this.readIniFieldValue(block.fields, 'NotAllowedWhenHealthBelowPercent'),
          ) ?? 0;
          profile = {
            healthPercentToDrainPerSecond: Math.max(0, drainPercent),
            notAllowedWhenHealthBelowPercent: clamp(minHealthPercent, 0, 1),
          };
          return;
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

  private extractUpgradeModules(objectDef: ObjectDef | undefined): UpgradeModuleProfile[] {
    if (!objectDef) {
      return [];
    }

    return this.extractUpgradeModulesFromBlocks(objectDef.blocks);
  }

  private extractSpecialPowerModules(objectDef: ObjectDef | undefined): Map<string, SpecialPowerModuleProfile> {
    const specialPowerModules = new Map<string, SpecialPowerModuleProfile>();
    if (!objectDef) {
      return specialPowerModules;
    }

    const visitBlock = (block: IniBlock): void => {
      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        const specialPowerTemplate = readStringField(block.fields, ['SpecialPowerTemplate']);
        if (specialPowerTemplate) {
          const normalizedSpecialPowerTemplate = specialPowerTemplate.trim().toUpperCase();
          if (normalizedSpecialPowerTemplate && normalizedSpecialPowerTemplate !== 'NONE') {
            specialPowerModules.set(normalizedSpecialPowerTemplate, {
              specialPowerTemplateName: normalizedSpecialPowerTemplate,
              moduleType,
              updateModuleStartsAttack: readBooleanField(block.fields, ['UpdateModuleStartsAttack']) === true,
              startsPaused: readBooleanField(block.fields, ['StartsPaused']) === true,
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

    return specialPowerModules;
  }

  private extractUpgradeModulesFromBlocks(
    blocks: IniBlock[] = [],
    sourceUpgradeName: string | null = null,
  ): UpgradeModuleProfile[] {
    return extractUpgradeModulesFromBlocksImpl(
      blocks,
      sourceUpgradeName,
      {
        parseUpgradeNames: (value) => this.parseUpgradeNames(value),
        parseObjectStatusNames: (value) => this.parseObjectStatusNames(value),
        parseKindOf: (value) => this.parseKindOf(value),
        parsePercent: (value) => this.parsePercent(value),
      },
    );
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
    applyCostModifierUpgradeToSideImpl(this.getSideKindOfProductionCostModifiers(normalizedSide), module);
  }

  private removeCostModifierUpgradeFromSide(side: string, module: UpgradeModuleProfile): void {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return;
    }

    // Source parity: Player::removeKindOfProductionCostChange decrements refcount and removes at zero.
    removeCostModifierUpgradeFromSideImpl(this.getSideKindOfProductionCostModifiers(normalizedSide), module);
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
    if (this.isObjectDisabledForUpgradeSideEffects(entity)) {
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

  private transferOverchargeBetweenSides(entity: MapEntity, oldSide: string, newSide: string): void {
    if (!this.overchargeStateByEntityId.has(entity.id)) {
      return;
    }

    const normalizedOldSide = this.normalizeSide(oldSide);
    const normalizedNewSide = this.normalizeSide(newSide);
    if (!normalizedOldSide || !normalizedNewSide || normalizedOldSide === normalizedNewSide) {
      return;
    }

    const oldSidePowerState = this.getSidePowerStateMap(normalizedOldSide);
    if (removePowerPlantUpgradeFromSideImpl(oldSidePowerState, entity.energyBonus)) {
      this.sidePowerBonus.delete(normalizedOldSide);
    }

    const newSidePowerState = this.getSidePowerStateMap(normalizedNewSide);
    applyPowerPlantUpgradeToSideImpl(newSidePowerState, entity.energyBonus);
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
    if (this.isObjectDisabledForUpgradeSideEffects(entity)) {
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
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return buildCost;
    }

    return applyKindOfProductionCostModifiersImpl(
      buildCost,
      kindOf,
      this.getSideKindOfProductionCostModifiers(normalizedSide),
    );
  }

  private applyPowerPlantUpgradeModule(entity: MapEntity, module: UpgradeModuleProfile): boolean {
    const side = this.normalizeSide(entity.side);
    if (!side) {
      return false;
    }
    if (this.isObjectDisabledForUpgradeSideEffects(entity)) {
      return false;
    }
    this.applyPowerPlantUpgradeToSide(side, module, entity);
    return true;
  }

  private applyPowerPlantUpgradeToSide(
    side: string,
    _module: UpgradeModuleProfile,
    entity: MapEntity,
  ): void {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return;
    }

    // Source parity: PowerPlantUpgrade.cpp adds energy from the templated object.
    const sideState = this.getSidePowerStateMap(normalizedSide);
    applyPowerPlantUpgradeToSideImpl(sideState, entity.energyBonus);
  }

  private removePowerPlantUpgradeFromEntity(entity: MapEntity, _module: UpgradeModuleProfile): void {
    if (this.isObjectDisabledForUpgradeSideEffects(entity)) {
      return;
    }
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
    const sideState = this.getSidePowerStateMap(normalizedSide);
    if (removePowerPlantUpgradeFromSideImpl(sideState, entity.energyBonus)) {
      this.sidePowerBonus.delete(normalizedSide);
    }
  }

  private enableOverchargeForEntity(entity: MapEntity, profile: OverchargeBehaviorProfile): void {
    const normalizedSide = this.normalizeSide(entity.side);
    if (!normalizedSide) {
      return;
    }

    if (this.overchargeStateByEntityId.has(entity.id)) {
      return;
    }

    const sideState = this.getSidePowerStateMap(normalizedSide);
    applyPowerPlantUpgradeToSideImpl(sideState, entity.energyBonus);
    this.overchargeStateByEntityId.set(entity.id, {
      healthPercentToDrainPerSecond: Math.max(0, profile.healthPercentToDrainPerSecond),
      notAllowedWhenHealthBelowPercent: clamp(profile.notAllowedWhenHealthBelowPercent, 0, 1),
    });
  }

  private disableOverchargeForEntity(entity: MapEntity): void {
    if (!this.overchargeStateByEntityId.has(entity.id)) {
      return;
    }

    const normalizedSide = this.normalizeSide(entity.side);
    if (normalizedSide) {
      const sideState = this.getSidePowerStateMap(normalizedSide);
      if (removePowerPlantUpgradeFromSideImpl(sideState, entity.energyBonus)) {
        this.sidePowerBonus.delete(normalizedSide);
      }
    }

    this.overchargeStateByEntityId.delete(entity.id);
  }

  /**
   * Register an entity's energyBonus with its side's power tracking.
   * Positive = production, negative = consumption.
   */
  private registerEntityEnergy(entity: MapEntity): void {
    const normalizedSide = this.normalizeSide(entity.side);
    if (!normalizedSide || entity.energyBonus === 0) return;
    const state = this.getSidePowerStateMap(normalizedSide);
    if (entity.energyBonus > 0) {
      state.energyProduction += entity.energyBonus;
    } else {
      state.energyConsumption += -entity.energyBonus;
    }
  }

  /**
   * Unregister an entity's energyBonus from its side's power tracking.
   */
  private unregisterEntityEnergy(entity: MapEntity): void {
    const normalizedSide = this.normalizeSide(entity.side);
    if (!normalizedSide || entity.energyBonus === 0) return;
    const state = this.getSidePowerStateMap(normalizedSide);
    if (entity.energyBonus > 0) {
      state.energyProduction = Math.max(0, state.energyProduction - entity.energyBonus);
    } else {
      state.energyConsumption = Math.max(0, state.energyConsumption + entity.energyBonus);
    }
  }

  private applyRadarUpgradeModule(entity: MapEntity, module: UpgradeModuleProfile): boolean {
    const side = this.normalizeSide(entity.side);
    if (!side) {
      return false;
    }
    if (this.isObjectDisabledForUpgradeSideEffects(entity)) {
      return false;
    }
    this.applyRadarUpgradeToSide(side, module);
    return true;
  }

  private applyRadarUpgradeToSide(side: string, module: UpgradeModuleProfile): void {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return;
    }

    const state = this.getSideRadarStateMap(normalizedSide);
    applyRadarUpgradeToSideImpl(state, module.radarIsDisableProof);
  }

  private removeRadarUpgradeFromEntity(entity: MapEntity, module: UpgradeModuleProfile): void {
    if (this.isObjectDisabledForUpgradeSideEffects(entity)) {
      return;
    }
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
    if (removeRadarUpgradeFromSideImpl(state, module.radarIsDisableProof)) {
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

    // Always sync derived fields when status-affecting modules are evaluated, even if
    // all flags were already in the desired state, to keep cached booleans consistent.
    if (module.statusToSet.size > 0 || module.statusToClear.size > 0) {
      this.syncDerivedStatusFields(entity);
    }
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
    // Always sync derived fields after bulk status mutations even if no reapply loop ran.
    this.syncDerivedStatusFields(entity);
  }

  private isObjectDisabledForUpgradeSideEffects(entity: MapEntity): boolean {
    // Source parity: upgrade modules with side effects are suppressed while the object
    // is disabled, matching Player::isDisabled()/Object::isDisabled behavior.
    return (
      this.entityHasObjectStatus(entity, 'DISABLED_SUBDUED')
      || this.entityHasObjectStatus(entity, 'DISABLED_HACKED')
      || this.entityHasObjectStatus(entity, 'DISABLED_EMP')
    );
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

  /**
   * Source parity: sync cached boolean fields derived from ObjectStatus flags.
   * Called whenever objectStatusFlags change so pathfinding/targeting stay consistent.
   */
  private syncDerivedStatusFields(entity: MapEntity): void {
    entity.noCollisions = entity.objectStatusFlags.has('NO_COLLISIONS');
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
      entity.x < 0
      || entity.z < 0
      || entity.x >= heightmap.worldWidth
      || entity.z >= heightmap.worldDepth
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

    // Source parity: WeaponSet.cpp line 550 — cannot attack targets inside enclosing containers.
    if (this.isEntityInEnclosingContainer(target)) {
      return false;
    }

    // Source parity: WeaponSet.cpp line 673 — weapon anti-mask vs target anti-mask.
    // If no weapon on the attacker can engage this target type, reject.
    if (attacker.totalWeaponAntiMask !== 0) {
      const targetAntiMask = this.resolveTargetAntiMask(target, targetKindOf);
      if (targetAntiMask !== 0 && (attacker.totalWeaponAntiMask & targetAntiMask) === 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Source parity: WeaponSet.cpp getVictimAntiMask — compute which weapon anti-mask bits
   * a target entity matches based on its kindOf flags and airborne status.
   */
  private resolveTargetAntiMask(target: MapEntity, targetKindOf: ReadonlySet<string>): number {
    // Source parity: WeaponSet.cpp getVictimAntiMask — priority order matches C++ exactly.
    if (targetKindOf.has('SMALL_MISSILE')) {
      return WEAPON_ANTI_SMALL_MISSILE;
    }
    if (targetKindOf.has('BALLISTIC_MISSILE')) {
      return WEAPON_ANTI_BALLISTIC_MISSILE;
    }
    if (targetKindOf.has('PROJECTILE')) {
      return WEAPON_ANTI_PROJECTILE;
    }
    if (targetKindOf.has('MINE') || targetKindOf.has('DEMOTRAP')) {
      return WEAPON_ANTI_MINE | WEAPON_ANTI_GROUND;
    }
    // Source parity: Object::isAirborneTarget checks OBJECT_STATUS_AIRBORNE_TARGET.
    if (this.entityHasObjectStatus(target, 'AIRBORNE_TARGET') || target.category === 'air') {
      if (targetKindOf.has('VEHICLE')) {
        return WEAPON_ANTI_AIRBORNE_VEHICLE;
      }
      if (targetKindOf.has('INFANTRY')) {
        return WEAPON_ANTI_AIRBORNE_INFANTRY;
      }
      if (targetKindOf.has('PARACHUTE')) {
        return WEAPON_ANTI_PARACHUTE;
      }
      // Airborne but not a recognized sub-type — unattackable in practice.
      return 0;
    }
    return WEAPON_ANTI_GROUND;
  }

  /**
   * Source parity: Contain::isEnclosingContainerFor — garrisoned and transport-carried
   * entities are shielded from direct attack.
   */
  private isEntityInEnclosingContainer(entity: MapEntity): boolean {
    if (entity.garrisonContainerId !== null) return true;
    if (entity.helixCarrierId !== null) {
      // Source parity: HelixContain::isEnclosingContainerFor returns FALSE for the
      // portable structure rider — it sits visibly on top and is attackable.
      const carrier = this.spawnedEntities.get(entity.helixCarrierId);
      if (carrier?.helixPortableRiderId === entity.id) return false;
      return true;
    }
    return false;
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
      entity.forcedWeaponSlot,
    );
    entity.largestWeaponRange = this.resolveLargestWeaponRangeForSetSelection(
      entity.weaponTemplateSets,
      entity.weaponSetFlagsMask,
      registry,
      entity.forcedWeaponSlot,
    );
    entity.totalWeaponAntiMask = this.resolveTotalWeaponAntiMaskForSetSelection(
      entity.weaponTemplateSets,
      entity.weaponSetFlagsMask,
      registry,
      entity.forcedWeaponSlot,
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
    // Source parity: WeaponSet::updateWeaponSet — when a set change keeps the same
    // weapon template in a slot, preserve runtime state (clip ammo, reload timers,
    // consecutive shots). Only fully reset timing when the template name changes
    // (i.e., a truly different weapon is now selected).
    const weaponTemplateChanged = previousWeapon?.name !== nextWeapon?.name;
    if (weaponTemplateChanged) {
      this.resetEntityWeaponTimingState(entity);
    } else if (scatterTargetPatternChanged && nextWeapon) {
      // Same weapon template but scatter offsets changed (e.g., upgrade modified scatter) —
      // rebuild scatter targets without resetting clip/reload state.
      this.rebuildEntityScatterTargets(entity);
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

    const centerX = entity.x;
    const centerZ = entity.z;
    if (entity.obstacleGeometry.shape === 'box') {
      const angle = entity.rotationY;
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

  private pickObjectByInput(input: InputState, camera: THREE.Camera): number | null {
    return this.config.pickObjectByInput?.(input, camera) ?? null;
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
      const [clampedX, clampedZ] = this.clampWorldPositionToMapBounds(hitPoint.x, hitPoint.z);
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
    if (this.deferCommandWhileHackInternetPacking(command)) {
      return;
    }

    if (this.shouldIgnoreRailedTransportPlayerCommand(command)) {
      return;
    }

    switch (command.type) {
      case 'clearSelection': {
        this.selectedEntityIds = [];
        this.selectedEntityId = null;
        this.clearEntitySelectionState();
        return;
      }
      case 'selectEntities': {
        const nextSelectionIds = this.filterValidSelectionIds(command.entityIds);
        this.selectedEntityIds = nextSelectionIds;
        this.selectedEntityId = nextSelectionIds[0] ?? null;
        this.updateSelectionHighlight();
        return;
      }
      case 'select': {
        const picked = this.spawnedEntities.get(command.entityId);
        if (!picked || picked.destroyed) return;
        // Source parity: Object::isSelectable — UNSELECTABLE or MASKED status prevents player selection.
        if (this.entityHasObjectStatus(picked, 'UNSELECTABLE') || this.entityHasObjectStatus(picked, 'MASKED')) return;
        this.selectedEntityIds = [command.entityId];
        this.selectedEntityId = command.entityId;
        this.updateSelectionHighlight();
        return;
      }
      case 'moveTo':
        this.cancelEntityCommandPathActions(command.entityId);
        this.clearAttackTarget(command.entityId);
        this.issueMoveTo(command.entityId, command.targetX, command.targetZ);
        return;
      case 'attackMoveTo':
        this.cancelEntityCommandPathActions(command.entityId);
        this.clearAttackTarget(command.entityId);
        this.issueMoveTo(
          command.entityId,
          command.targetX,
          command.targetZ,
          command.attackDistance,
        );
        return;
      case 'guardPosition':
        this.cancelEntityCommandPathActions(command.entityId);
        this.clearAttackTarget(command.entityId);
        this.issueMoveTo(command.entityId, command.targetX, command.targetZ);
        return;
      case 'guardObject':
        this.cancelEntityCommandPathActions(command.entityId);
        this.issueAttackEntity(command.entityId, command.targetEntityId, 'PLAYER');
        return;
      case 'setRallyPoint':
        this.setEntityRallyPoint(command.entityId, command.targetX, command.targetZ);
        return;
      case 'attackEntity':
        this.cancelEntityCommandPathActions(command.entityId);
        this.issueAttackEntity(
          command.entityId,
          command.targetEntityId,
          command.commandSource ?? 'PLAYER',
        );
        return;
      case 'fireWeapon':
        this.cancelEntityCommandPathActions(command.entityId);
        this.issueFireWeapon(
          command.entityId,
          command.weaponSlot,
          command.maxShotsToFire,
          command.targetObjectId,
          command.targetPosition,
        );
        return;
      case 'switchWeapon': {
        this.cancelEntityCommandPathActions(command.entityId);
        const entity = this.spawnedEntities.get(command.entityId);
        const weaponSlot = this.normalizeWeaponSlot(command.weaponSlot);
        if (!entity || entity.destroyed || weaponSlot === null) {
          return;
        }
        entity.forcedWeaponSlot = weaponSlot;
        this.refreshEntityCombatProfiles(entity);
        return;
      }
      case 'stop':
        this.cancelEntityCommandPathActions(command.entityId);
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

        const scienceDef = findScienceDefByName(registry, normalizedScienceName);
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
        const normalizedLocalSide = this.normalizeSide(localSide);
        if (normalizedLocalSide) {
          const rankState = this.getSideRankStateMap(normalizedLocalSide);
          rankState.sciencePurchasePoints = Math.max(0, rankState.sciencePurchasePoints - scienceCost);
        }
        return;
      }
      case 'issueSpecialPower':
        this.routeIssueSpecialPowerCommand(command);
        return;
      case 'exitContainer':
        this.handleExitContainerCommand(command.entityId);
        return;
      case 'evacuate': {
        this.handleEvacuateCommand(command.entityId);
        return;
      }
      case 'executeRailedTransport':
        this.handleExecuteRailedTransportCommand(command);
        return;
      case 'beaconDelete':
        this.handleBeaconDeleteCommand(command);
        return;
      case 'hackInternet':
        this.handleHackInternetCommand(command);
        return;
      case 'toggleOvercharge':
        this.handleToggleOverchargeCommand(command);
        return;
      case 'combatDrop':
        this.handleCombatDropCommand(command);
        return;
      case 'placeBeacon':
        this.handlePlaceBeaconCommand(command);
        return;
      case 'enterObject':
        this.handleEnterObjectCommand(command);
        return;
      case 'constructBuilding':
        this.handleConstructBuildingCommand(command);
        return;
      case 'cancelDozerConstruction':
        this.handleCancelDozerConstructionCommand(command);
        return;
      case 'sell':
        this.handleSellCommand(command);
        return;
      case 'garrisonBuilding':
        this.handleGarrisonBuildingCommand(command);
        return;
      case 'repairBuilding':
        this.handleRepairBuildingCommand(command);
        return;
      default:
        return;
    }
  }

  private deferCommandWhileHackInternetPacking(command: GameLogicCommand): boolean {
    const hasEntityId = 'entityId' in command && typeof command.entityId === 'number';
    if (!hasEntityId) {
      return false;
    }

    const entity = this.spawnedEntities.get(command.entityId);
    if (!entity || entity.destroyed) {
      return false;
    }

    const pendingState = this.hackInternetPendingCommandByEntityId.get(entity.id);
    if (pendingState) {
      pendingState.command = command;
      return true;
    }

    if (command.type === 'hackInternet') {
      return false;
    }

    if (!this.hackInternetStateByEntityId.has(entity.id)) {
      return false;
    }

    const objectDef = this.resolveObjectDefByTemplateName(entity.templateName);
    const profile = this.extractHackInternetProfile(objectDef ?? undefined);
    if (!profile) {
      return false;
    }

    this.hackInternetStateByEntityId.delete(entity.id);
    const packDelayFrames = this.resolveHackInternetPackTimeFrames(entity, profile);
    if (packDelayFrames <= 0) {
      return false;
    }

    this.stopEntity(entity.id);
    this.clearAttackTarget(entity.id);
    this.hackInternetPendingCommandByEntityId.set(entity.id, {
      command,
      executeFrame: this.frameCounter + packDelayFrames,
    });
    return true;
  }

  private shouldIgnoreRailedTransportPlayerCommand(command: GameLogicCommand): boolean {
    const hasEntityId = 'entityId' in command && typeof command.entityId === 'number';
    if (!hasEntityId) {
      return false;
    }

    const blockedCommandType = this.isRailedTransportPlayerBlockedCommandType(command.type);
    if (!blockedCommandType) {
      return false;
    }

    return this.isRailedTransportEntity(command.entityId);
  }

  private isRailedTransportPlayerBlockedCommandType(commandType: GameLogicCommand['type']): boolean {
    switch (commandType) {
      case 'moveTo':
      case 'attackMoveTo':
      case 'guardPosition':
      case 'guardObject':
      case 'attackEntity':
      case 'fireWeapon':
      case 'switchWeapon':
      case 'stop':
      case 'enterObject':
      case 'combatDrop':
      case 'hackInternet':
      case 'toggleOvercharge':
      case 'setRallyPoint':
      case 'garrisonBuilding':
      case 'repairBuilding':
        return true;
      default:
        return false;
    }
  }

  private isRailedTransportEntity(entityId: number): boolean {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity || entity.destroyed) {
      return false;
    }

    const objectDef = this.resolveObjectDefByTemplateName(entity.templateName);
    return this.extractRailedTransportProfile(objectDef ?? undefined) !== null;
  }

  private routeIssueSpecialPowerCommand(command: IssueSpecialPowerCommand): void {
    const normalizeShortcutSpecialPowerName = this.normalizeShortcutSpecialPowerName.bind(this);
    routeIssueSpecialPowerCommandImpl(command, {
      iniDataRegistry: this.iniDataRegistry,
      frameCounter: this.frameCounter,
      selectedEntityId: this.selectedEntityId,
      spawnedEntities: this.spawnedEntities,
      msToLogicFrames: this.msToLogicFrames.bind(this),
      resolveShortcutSpecialPowerSourceEntityId: this.resolveShortcutSpecialPowerSourceEntityId.bind(this),
      resolveSharedReadyFrame: (specialPowerName) => (
        resolveSharedShortcutSpecialPowerReadyFrameImpl(
          specialPowerName,
          this.frameCounter,
          this.sharedShortcutSpecialPowerReadyFrames,
          normalizeShortcutSpecialPowerName,
        )
      ),
      resolveSourceReadyFrameBySource: (specialPowerName, sourceEntityId) => (
        resolveShortcutSpecialPowerSourceEntityReadyFrameBySourceImpl(
          specialPowerName,
          sourceEntityId,
          this.frameCounter,
          this.shortcutSpecialPowerSourceByName,
          normalizeShortcutSpecialPowerName,
        )
      ),
      setReadyFrame: this.setSpecialPowerReadyFrame.bind(this),
      getTeamRelationship: this.getTeamRelationship.bind(this),
      onIssueSpecialPowerNoTarget: this.onIssueSpecialPowerNoTarget.bind(this),
      onIssueSpecialPowerTargetPosition: this.onIssueSpecialPowerTargetPosition.bind(this),
      onIssueSpecialPowerTargetObject: this.onIssueSpecialPowerTargetObject.bind(this),
    });
  }

  private setSpecialPowerReadyFrame(
    specialPowerName: string,
    sourceEntityId: number,
    isShared: boolean,
    readyFrame: number,
  ): void {
    const normalizeShortcutSpecialPowerName = this.normalizeShortcutSpecialPowerName.bind(this);
    setSpecialPowerReadyFrameImpl(
      specialPowerName,
      sourceEntityId,
      isShared,
      readyFrame,
      this.frameCounter,
      this.sharedShortcutSpecialPowerReadyFrames,
      normalizeShortcutSpecialPowerName,
      this.trackShortcutSpecialPowerSourceEntity.bind(this),
    );
  }

  protected onIssueSpecialPowerNoTarget(
    sourceEntityId: number,
    specialPowerName: string,
    commandOption: number,
    commandButtonId: string,
    _specialPowerDef: SpecialPowerDef,
  ): void {
    const module = this.resolveSpecialPowerModuleProfile(sourceEntityId, specialPowerName);
    if (!module) {
      return;
    }

    this.recordSpecialPowerDispatch(
      sourceEntityId,
      module,
      'NO_TARGET',
      commandOption,
      commandButtonId,
      null,
      null,
      null,
    );

    // Execute no-target effects (spy vision centered on source, cash bounty, etc.).
    const source = this.spawnedEntities.get(sourceEntityId);
    if (!source || source.destroyed) {
      return;
    }

    const effectCategory = resolveEffectCategoryImpl(module.moduleType);
    const effectContext = this.createSpecialPowerEffectContext();

    switch (effectCategory) {
      case 'SPY_VISION':
        // Reveal around source entity position.
        executeSpyVisionImpl({
          sourceSide: source.side ?? '',
          targetX: source.x,
          targetZ: source.z,
          revealRadius: DEFAULT_SPY_VISION_RADIUS,
        }, effectContext);
        break;
    }
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
    const module = this.resolveSpecialPowerModuleProfile(sourceEntityId, specialPowerName);
    if (!module) {
      return;
    }

    this.recordSpecialPowerDispatch(
      sourceEntityId,
      module,
      'POSITION',
      commandOption,
      commandButtonId,
      null,
      targetX,
      targetZ,
    );

    // Execute position-targeted effects.
    const source = this.spawnedEntities.get(sourceEntityId);
    if (!source || source.destroyed) {
      return;
    }

    const effectCategory = resolveEffectCategoryImpl(module.moduleType);
    const effectContext = this.createSpecialPowerEffectContext();
    const sourceSide = source.side ?? '';

    switch (effectCategory) {
      case 'AREA_DAMAGE':
        executeAreaDamageImpl({
          sourceEntityId,
          sourceSide,
          targetX,
          targetZ,
          radius: DEFAULT_AREA_DAMAGE_RADIUS,
          damage: DEFAULT_AREA_DAMAGE_AMOUNT,
          damageType: 'EXPLOSION',
        }, effectContext);
        break;
      case 'SPY_VISION':
        executeSpyVisionImpl({
          sourceSide,
          targetX,
          targetZ,
          revealRadius: DEFAULT_SPY_VISION_RADIUS,
        }, effectContext);
        break;
      case 'AREA_HEAL':
        executeAreaHealImpl({
          sourceSide,
          targetX,
          targetZ,
          radius: DEFAULT_AREA_HEAL_RADIUS,
          healAmount: DEFAULT_AREA_HEAL_AMOUNT,
          kindOfFilter: [],
        }, effectContext);
        break;
    }
  }

  protected onIssueSpecialPowerTargetObject(
    sourceEntityId: number,
    specialPowerName: string,
    targetEntityId: number,
    commandOption: number,
    commandButtonId: string,
    _specialPowerDef: SpecialPowerDef,
  ): void {
    const module = this.resolveSpecialPowerModuleProfile(sourceEntityId, specialPowerName);
    if (!module) {
      return;
    }

    this.recordSpecialPowerDispatch(
      sourceEntityId,
      module,
      'OBJECT',
      commandOption,
      commandButtonId,
      targetEntityId,
      null,
      null,
    );

    // Execute object-targeted effects.
    const source = this.spawnedEntities.get(sourceEntityId);
    if (!source || source.destroyed) {
      return;
    }

    const effectCategory = resolveEffectCategoryImpl(module.moduleType);
    const effectContext = this.createSpecialPowerEffectContext();
    const sourceSide = source.side ?? '';

    switch (effectCategory) {
      case 'CASH_HACK':
        executeCashHackImpl({
          sourceEntityId,
          sourceSide,
          targetEntityId,
          amountToSteal: DEFAULT_CASH_HACK_AMOUNT,
        }, effectContext);
        break;
      case 'DEFECTOR':
        executeDefectorImpl({
          sourceEntityId,
          sourceSide,
          targetEntityId,
        }, effectContext);
        break;
    }
  }

  private resolveSpecialPowerModuleProfile(
    sourceEntityId: number,
    specialPowerName: string,
  ): SpecialPowerModuleProfile | null {
    const sourceEntity = this.spawnedEntities.get(sourceEntityId);
    if (!sourceEntity) {
      return null;
    }

    const normalizedSpecialPowerName = specialPowerName.trim().toUpperCase();
    if (!normalizedSpecialPowerName || normalizedSpecialPowerName === 'NONE') {
      return null;
    }

    return sourceEntity.specialPowerModules.get(normalizedSpecialPowerName) ?? null;
  }

  private recordSpecialPowerDispatch(
    sourceEntityId: number,
    module: SpecialPowerModuleProfile,
    dispatchType: SpecialPowerDispatchProfile['dispatchType'],
    commandOption: number,
    commandButtonId: string,
    targetEntityId: number | null,
    targetX: number | null,
    targetZ: number | null,
  ): void {
    const sourceEntity = this.spawnedEntities.get(sourceEntityId);
    if (!sourceEntity) {
      return;
    }

    sourceEntity.lastSpecialPowerDispatch = {
      specialPowerTemplateName: module.specialPowerTemplateName,
      moduleType: module.moduleType,
      dispatchType,
      commandOption,
      commandButtonId,
      targetEntityId,
      targetX,
      targetZ,
    };

    // Source parity: Eva SUPERWEAPON_LAUNCHED fires for FS_SUPERWEAPON entities.
    if (sourceEntity.kindOf.has('FS_SUPERWEAPON') && sourceEntity.side) {
      this.emitEvaEvent('SUPERWEAPON_LAUNCHED', sourceEntity.side, 'own', sourceEntityId, module.specialPowerTemplateName);
      // Notify enemies about the launch.
      for (const [side] of this.sidePowerBonus.entries()) {
        if (side !== sourceEntity.side) {
          this.emitEvaEvent('SUPERWEAPON_LAUNCHED', side, 'enemy', sourceEntityId, module.specialPowerTemplateName);
        }
      }
    }
  }

  private cancelEntityCommandPathActions(entityId: number): void {
    this.cancelRailedTransportTransit(entityId);
    this.hackInternetStateByEntityId.delete(entityId);
    this.hackInternetPendingCommandByEntityId.delete(entityId);
    this.pendingEnterObjectActions.delete(entityId);
    this.pendingCombatDropActions.delete(entityId);
    this.pendingGarrisonActions.delete(entityId);
    this.pendingRepairActions.delete(entityId);
  }

  private cancelRailedTransportTransit(entityId: number): void {
    const state = this.railedTransportStateByEntityId.get(entityId);
    if (!state) {
      return;
    }
    state.inTransit = false;
    state.transitWaypointIds = [];
    state.transitWaypointIndex = 0;
  }

  private resolveRailedTransportRuntimeState(entityId: number): RailedTransportRuntimeState {
    let state = this.railedTransportStateByEntityId.get(entityId);
    if (!state) {
      state = createRailedTransportRuntimeStateImpl();
      this.railedTransportStateByEntityId.set(entityId, state);
    }
    return state;
  }

  private handleExitContainerCommand(entityId: number): void {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity || entity.destroyed) {
      return;
    }

    const containerId = entity.parkingSpaceProducerId ?? entity.helixCarrierId;
    if (containerId === null) {
      return;
    }

    const container = this.spawnedEntities.get(containerId);
    if (!container || container.destroyed) {
      this.releaseEntityFromContainer(entity);
      return;
    }

    this.cancelEntityCommandPathActions(entity.id);
    this.releaseEntityFromContainer(entity);
    entity.x = container.x;
    entity.z = container.z;
    entity.y = this.resolveGroundHeight(entity.x, entity.z) + entity.baseHeight;
    this.updatePathfindPosCell(entity);

    if (entity.canMove) {
      this.issueMoveTo(entity.id, container.x + MAP_XY_FACTOR, container.z);
    }
  }

  private handleEvacuateCommand(entityId: number): void {
    const container = this.spawnedEntities.get(entityId);
    if (!container || container.destroyed) {
      return;
    }

    const objectDef = this.resolveObjectDefByTemplateName(container.templateName);
    const railedProfile = this.extractRailedTransportProfile(objectDef ?? undefined);
    if (railedProfile) {
      const railedState = this.resolveRailedTransportRuntimeState(container.id);
      if (railedState.inTransit) {
        return;
      }
    }

    this.cancelEntityCommandPathActions(container.id);
    this.evacuateContainedEntities(container, container.x, container.z, null);
  }

  private handleExecuteRailedTransportCommand(command: ExecuteRailedTransportCommand): void {
    const entity = this.spawnedEntities.get(command.entityId);
    if (!entity || entity.destroyed || !entity.canMove) {
      return;
    }

    const objectDef = this.resolveObjectDefByTemplateName(entity.templateName);
    const profile = this.extractRailedTransportProfile(objectDef ?? undefined);
    if (!profile) {
      return;
    }

    executeRailedTransportCommandImpl(entity, profile, {
      waypointIndex: this.railedTransportWaypointIndex,
      resolveRuntimeState: this.resolveRailedTransportRuntimeState.bind(this),
      cancelEntityCommandPathActions: this.cancelEntityCommandPathActions.bind(this),
      clearAttackTarget: this.clearAttackTarget.bind(this),
      stopEntity: this.stopEntity.bind(this),
      issueMoveTo: this.issueMoveTo.bind(this),
      isValidEntity: (candidate) => !candidate.destroyed && candidate.canMove,
    });
  }

  private handleBeaconDeleteCommand(command: BeaconDeleteCommand): void {
    const beacon = this.spawnedEntities.get(command.entityId);
    if (!beacon || beacon.destroyed || !this.isBeaconEntity(beacon)) {
      return;
    }

    const localSide = this.resolveLocalPlayerSide();
    const beaconSide = this.normalizeSide(beacon.side);
    if (!localSide || !beaconSide || beaconSide !== localSide) {
      // Source parity: non-owner delete requests are client-visibility only.
      return;
    }

    this.markEntityDestroyed(beacon.id, -1);
  }

  private handleHackInternetCommand(command: HackInternetCommand): void {
    const entity = this.spawnedEntities.get(command.entityId);
    if (!entity || entity.destroyed) {
      return;
    }

    const objectDef = this.resolveObjectDefByTemplateName(entity.templateName);
    if (!objectDef) {
      return;
    }

    const profile = this.extractHackInternetProfile(objectDef);
    if (!profile) {
      return;
    }

    // Source parity subset: MSG_INTERNET_HACK clears active AI state and enters
    // HackInternetAIUpdate (UNPACKING -> HACK_INTERNET persistent loop).
    this.cancelEntityCommandPathActions(entity.id);
    this.clearAttackTarget(entity.id);
    this.stopEntity(entity.id);

    const cashUpdateDelayFrames = this.resolveHackInternetCashUpdateDelayFrames(entity, profile);
    const cashAmountPerCycle = profile.regularCashAmount > 0
      ? profile.regularCashAmount
      : SOURCE_HACK_FALLBACK_CASH_AMOUNT;
    const initialDelayFrames = Math.max(1, profile.unpackTimeFrames + cashUpdateDelayFrames);
    this.hackInternetStateByEntityId.set(entity.id, {
      cashUpdateDelayFrames,
      cashAmountPerCycle,
      nextCashFrame: this.frameCounter + initialDelayFrames,
    });
  }

  private resolveHackInternetPackTimeFrames(entity: MapEntity, profile: HackInternetProfile): number {
    if (this.isEntityContained(entity)) {
      return 0;
    }
    return Math.max(0, profile.packTimeFrames);
  }

  private resolveHackInternetCashUpdateDelayFrames(entity: MapEntity, profile: HackInternetProfile): number {
    const delayFrames = this.isEntityContained(entity)
      ? profile.cashUpdateDelayFastFrames
      : profile.cashUpdateDelayFrames;
    return Math.max(0, delayFrames);
  }

  private handleToggleOverchargeCommand(command: ToggleOverchargeCommand): void {
    const entity = this.spawnedEntities.get(command.entityId);
    if (!entity || entity.destroyed) {
      return;
    }

    const objectDef = this.resolveObjectDefByTemplateName(entity.templateName);
    const profile = this.extractOverchargeBehaviorProfile(objectDef);
    if (!profile) {
      return;
    }

    if (this.overchargeStateByEntityId.has(entity.id)) {
      this.disableOverchargeForEntity(entity);
      return;
    }

    const minimumAllowedHealth = entity.maxHealth * profile.notAllowedWhenHealthBelowPercent;
    if (minimumAllowedHealth > 0 && entity.health < minimumAllowedHealth) {
      return;
    }

    this.enableOverchargeForEntity(entity, profile);
  }

  private handleCombatDropCommand(command: CombatDropCommand): void {
    const source = this.spawnedEntities.get(command.entityId);
    if (!source || source.destroyed) {
      return;
    }
    if (this.countContainedRappellers(source.id) <= 0) {
      return;
    }

    let targetObjectId: number | null = null;
    let targetX: number;
    let targetZ: number;
    if (command.targetObjectId !== null) {
      const target = this.spawnedEntities.get(command.targetObjectId);
      if (!target || target.destroyed) {
        return;
      }
      targetObjectId = target.id;
      targetX = target.x;
      targetZ = target.z;
    } else if (command.targetPosition !== null) {
      targetX = command.targetPosition[0];
      targetZ = command.targetPosition[2];
    } else {
      return;
    }

    // Source parity subset: MSG_COMBATDROP routes through AIGroup::groupCombatDrop,
    // which delegates per-unit AI combat-drop behavior.
    this.cancelEntityCommandPathActions(source.id);
    this.clearAttackTarget(source.id);
    this.issueMoveTo(source.id, targetX, targetZ);
    this.pendingCombatDropActions.set(source.id, {
      targetObjectId,
      targetX,
      targetZ,
    });
  }

  private handlePlaceBeaconCommand(command: PlaceBeaconCommand): void {
    const localSide = this.resolveLocalPlayerSide();
    if (!localSide) {
      return;
    }

    const beaconTemplateName = this.resolveBeaconTemplateNameForSide(localSide);
    if (!beaconTemplateName) {
      return;
    }

    if (
      this.countActiveEntitiesOfTemplateForSide(localSide, beaconTemplateName)
      >= SOURCE_DEFAULT_MAX_BEACONS_PER_PLAYER
    ) {
      return;
    }

    const registry = this.iniDataRegistry;
    if (!registry) {
      return;
    }
    const beaconObjectDef = findObjectDefByName(registry, beaconTemplateName);
    if (!beaconObjectDef) {
      return;
    }

    const [x, z] = this.clampWorldPositionToMapBounds(command.targetPosition[0], command.targetPosition[2]);
    const terrainY = this.resolveGroundHeight(x, z);

    const mapObject: MapObjectJSON = {
      templateName: beaconObjectDef.name,
      angle: 0,
      flags: 0,
      position: {
        x,
        y: z,
        z: 0,
      },
      properties: {},
    };
    const created = this.createMapEntity(mapObject, beaconObjectDef, registry, this.mapHeightmap);
    created.side = localSide;
    created.controllingPlayerToken = this.normalizeControllingPlayerToken(localSide);
    created.x = x;
    created.z = z;
    created.y = terrainY + created.baseHeight;
    this.updatePathfindPosCell(created);
    this.spawnedEntities.set(created.id, created);
    this.registerEntityEnergy(created);
  }

  private handleEnterObjectCommand(command: EnterObjectCommand): void {
    const source = this.spawnedEntities.get(command.entityId);
    const target = this.spawnedEntities.get(command.targetObjectId);
    if (!source || !target || source.destroyed || target.destroyed) {
      return;
    }

    if (!this.canQueueEnterObjectAction(source, target, command.action)) {
      return;
    }

    // Source parity subset: MSG_ENTER routes through AIGroup::groupEnter into
    // aiEnter target-action state. We track pending enter intent and resolve a
    // minimal action subset on contact.
    this.cancelEntityCommandPathActions(source.id);
    this.clearAttackTarget(source.id);
    this.issueMoveTo(source.id, target.x, target.z);
    this.pendingEnterObjectActions.set(source.id, {
      targetObjectId: target.id,
      action: command.action,
    });
  }

  private canQueueEnterObjectAction(
    source: MapEntity,
    target: MapEntity,
    action: EnterObjectCommand['action'],
  ): boolean {
    if (source.id === target.id) {
      return false;
    }
    if (!source.canMove) {
      return false;
    }
    if (this.entityHasObjectStatus(source, 'UNDER_CONSTRUCTION')) {
      return false;
    }
    if (this.entityHasObjectStatus(target, 'UNDER_CONSTRUCTION')) {
      return false;
    }
    if (this.entityHasObjectStatus(target, 'SOLD')) {
      return false;
    }
    if (this.entityHasObjectStatus(target, 'DISABLED_SUBDUED')) {
      return false;
    }

    switch (action) {
      case 'hijackVehicle':
        return this.canExecuteHijackVehicleEnterAction(source, target);
      case 'convertToCarBomb':
        return this.canExecuteConvertToCarBombEnterAction(source, target);
      case 'sabotageBuilding':
        return this.resolveSabotageBuildingProfile(source, target) !== null;
      default:
        return false;
    }
  }

  private handleConstructBuildingCommand(command: ConstructBuildingCommand): void {
    const constructor = this.spawnedEntities.get(command.entityId);
    if (!constructor || constructor.destroyed) {
      return;
    }

    const constructorKindOf = this.resolveEntityKindOfSet(constructor);
    if (!constructorKindOf.has('DOZER')) {
      return;
    }

    const registry = this.iniDataRegistry;
    if (!registry) {
      return;
    }

    const objectDef = findObjectDefByName(registry, command.templateName);
    if (!objectDef) {
      return;
    }

    const side = this.normalizeSide(constructor.side);
    if (!side) {
      return;
    }
    if (!this.canSideBuildUnitTemplate(side, objectDef)) {
      return;
    }
    if (!this.canEntityIssueBuildCommandForTemplate(constructor, objectDef.name, ['DOZER_CONSTRUCT', 'UNIT_BUILD'])) {
      return;
    }

    const placementPositions = this.resolveConstructPlacementPositions(command, objectDef);
    if (placementPositions.length === 0) {
      return;
    }

    const buildCost = this.resolveObjectBuildCost(objectDef, side);
    const maxSimultaneousOfType = this.resolveMaxSimultaneousOfType(objectDef);
    const isLineBuildTemplate = this.isLineBuildTemplate(objectDef);
    for (const [x, y, z] of placementPositions) {
      this.clearRemovableForConstruction(
        objectDef,
        x,
        z,
        command.angle,
        constructor.id,
      );
      if (
        !this.moveObjectsForConstruction(
          objectDef,
          x,
          z,
          command.angle,
          side,
          constructor.id,
        )
      ) {
        continue;
      }

      if (
        !this.isConstructLocationClear(
          objectDef,
          x,
          z,
          command.angle,
          side,
          constructor.id,
        )
      ) {
        continue;
      }

      if (maxSimultaneousOfType > 0) {
        const existingCount = this.countActiveEntitiesForMaxSimultaneousForSide(side, objectDef);
        if (existingCount >= maxSimultaneousOfType) {
          break;
        }
      }

      if (buildCost > 0) {
        const withdrawn = this.withdrawSideCredits(side, buildCost);
        if (withdrawn < buildCost) {
          if (withdrawn > 0) {
            this.depositSideCredits(side, withdrawn);
          }
          this.emitEvaEvent('INSUFFICIENT_FUNDS', side, 'own');
          break;
        }
      }

      const created = this.spawnConstructedObject(
        constructor,
        objectDef,
        [x, y, z],
        command.angle,
      );
      if (!created) {
        if (isLineBuildTemplate) {
          continue;
        }
        break;
      }
    }
  }

  private clearRemovableForConstruction(
    objectDef: ObjectDef,
    worldX: number,
    worldZ: number,
    angle: number,
    ignoredEntityId: number,
  ): void {
    const buildGeometry = this.resolveConstructCollisionGeometry(objectDef);
    if (!buildGeometry) {
      return;
    }

    for (const blocker of this.spawnedEntities.values()) {
      if (blocker.id === ignoredEntityId || blocker.destroyed) {
        continue;
      }

      if (
        !this.doesConstructionGeometryOverlap(
          { x: worldX, z: worldZ },
          angle,
          buildGeometry,
          blocker,
          this.resolveConstructCollisionGeometryForEntity(blocker),
        )
      ) {
        continue;
      }

      if (this.isRemovableForConstruction(blocker) && !this.isAlwaysSelectableForConstruction(blocker)) {
        this.markEntityDestroyed(blocker.id, -1);
      }
    }
  }

  private moveObjectsForConstruction(
    objectDef: ObjectDef,
    worldX: number,
    worldZ: number,
    angle: number,
    owningSide: string,
    ignoredEntityId: number,
  ): boolean {
    const buildGeometry = this.resolveConstructCollisionGeometry(objectDef);
    if (!buildGeometry) {
      return true;
    }

    let anyUnmovables = false;
    const clearanceRadius = Math.hypot(buildGeometry.majorRadius, buildGeometry.minorRadius) * 1.4;
    for (const blocker of this.spawnedEntities.values()) {
      if (blocker.id === ignoredEntityId || blocker.destroyed) {
        continue;
      }

      if (
        !this.doesConstructionGeometryOverlap(
          { x: worldX, z: worldZ },
          angle,
          buildGeometry,
          blocker,
          this.resolveConstructCollisionGeometryForEntity(blocker),
        )
      ) {
        continue;
      }

      if (
        this.isRemovableForConstruction(blocker)
        || this.isMineForConstruction(blocker)
        || this.isInertForConstruction(blocker)
      ) {
        continue;
      }
      if (this.isAlwaysSelectableForConstruction(blocker)) {
        continue;
      }

      const relationship = this.getConstructingRelationship(owningSide, blocker.side);
      if (relationship === RELATIONSHIP_ENEMIES || this.isDisabledForConstruction(blocker) || blocker.canMove === false) {
        anyUnmovables = true;
        continue;
      }

      const variedRadius = (0.5 + this.gameRandom.nextFloat()) * clearanceRadius;
      const direction = (this.gameRandom.nextFloat() * Math.PI * 2) - Math.PI;
      const destinationX = worldX + Math.cos(direction) * variedRadius;
      const destinationZ = worldZ + Math.sin(direction) * variedRadius;
      this.issueMoveTo(blocker.id, destinationX, destinationZ, NO_ATTACK_DISTANCE, true);
      if (!blocker.canMove) {
        anyUnmovables = true;
      }
    }

    return !anyUnmovables;
  }

  private isConstructLocationClear(
    objectDef: ObjectDef,
    worldX: number,
    worldZ: number,
    angle: number,
    owningSide: string,
    ignoredEntityId: number,
  ): boolean {
    const buildGeometry = this.resolveConstructCollisionGeometry(objectDef);
    if (!buildGeometry) {
      return true;
    }

    for (const blocker of this.spawnedEntities.values()) {
      if (blocker.id === ignoredEntityId || blocker.destroyed) {
        continue;
      }

      if (
        !this.doesConstructionGeometryOverlap(
          { x: worldX, z: worldZ },
          angle,
          buildGeometry,
          blocker,
          this.resolveConstructCollisionGeometryForEntity(blocker),
        )
      ) {
        continue;
      }

      if (
        this.isRemovableForConstruction(blocker)
        || this.isMineForConstruction(blocker)
        || this.isInertForConstruction(blocker)
      ) {
        continue;
      }

      const relationship = this.getConstructingRelationship(owningSide, blocker.side);
      if (
        relationship === RELATIONSHIP_ENEMIES
        || this.isImmobileForConstruction(blocker)
        || this.isDisabledForConstruction(blocker)
      ) {
        return false;
      }
    }

    return true;
  }

  private resolveConstructCollisionGeometry(objectDef: ObjectDef | undefined): ObstacleGeometry | null {
    const geometry = this.resolveObstacleGeometry(objectDef);
    if (!geometry) {
      return null;
    }

    if (geometry.shape === 'box') {
      return geometry;
    }

    const radius = geometry.majorRadius;
    if (!Number.isFinite(radius) || radius <= 0) {
      return null;
    }
    return {
      shape: 'circle',
      majorRadius: radius,
      minorRadius: radius,
    };
  }

  private resolveConstructCollisionGeometryForEntity(entity: MapEntity): ObstacleGeometry | null {
    if (entity.obstacleGeometry) {
      return entity.obstacleGeometry;
    }

    const objectDef = this.resolveObjectDefByTemplateName(entity.templateName);
    return this.resolveConstructCollisionGeometry(objectDef ?? undefined);
  }

  private doesConstructionGeometryOverlap(
    leftPosition: { x: number; z: number },
    leftAngle: number,
    leftGeometry: ObstacleGeometry,
    rightEntity: MapEntity,
    rightGeometry: ObstacleGeometry | null,
  ): boolean {
    if (!rightGeometry) {
      return false;
    }

    if (leftGeometry.shape === 'circle' && rightGeometry.shape === 'circle') {
      return this.doesCircleGeometryOverlap(
        leftPosition,
        leftGeometry.majorRadius,
        { x: rightEntity.x, z: rightEntity.z },
        rightGeometry.majorRadius,
      );
    }

    if (leftGeometry.shape === 'box' && rightGeometry.shape === 'box') {
      return this.doesBoxGeometryOverlap(
        leftPosition,
        leftAngle,
        leftGeometry,
        { x: rightEntity.x, z: rightEntity.z },
        rightEntity.rotationY,
        rightGeometry,
      );
    }

    if (leftGeometry.shape === 'circle') {
      return this.doesCircleBoxGeometryOverlap(
        leftPosition,
        leftGeometry.majorRadius,
        {
          x: rightEntity.x,
          z: rightEntity.z,
          angle: rightEntity.rotationY,
          geometry: rightGeometry,
        },
      );
    }

    return this.doesCircleBoxGeometryOverlap(
      { x: rightEntity.x, z: rightEntity.z },
      rightGeometry.majorRadius,
      {
        x: leftPosition.x,
        z: leftPosition.z,
        angle: leftAngle,
        geometry: leftGeometry,
      },
    );
  }

  private doesCircleGeometryOverlap(
    firstPosition: { x: number; z: number },
    firstRadius: number,
    secondPosition: { x: number; z: number },
    secondRadius: number,
  ): boolean {
    const distanceX = firstPosition.x - secondPosition.x;
    const distanceZ = firstPosition.z - secondPosition.z;
    const minDistance = firstRadius + secondRadius;
    return (distanceX * distanceX + distanceZ * distanceZ) <= (minDistance * minDistance);
  }

  private doesCircleBoxGeometryOverlap(
    circlePosition: { x: number; z: number },
    circleRadius: number,
    box: {
      x: number;
      z: number;
      angle: number;
      geometry: ObstacleGeometry;
    },
  ): boolean {
    if (box.geometry.majorRadius <= 0 || box.geometry.minorRadius <= 0) {
      return false;
    }

    const cos = Math.cos(-box.angle);
    const sin = Math.sin(-box.angle);
    const dx = circlePosition.x - box.x;
    const dz = circlePosition.z - box.z;
    const localX = (dx * cos) + (dz * sin);
    const localZ = (-dx * sin) + (dz * cos);
    const clampedX = clamp(localX, -box.geometry.majorRadius, box.geometry.majorRadius);
    const clampedZ = clamp(localZ, -box.geometry.minorRadius, box.geometry.minorRadius);
    const distanceX = localX - clampedX;
    const distanceZ = localZ - clampedZ;
    return (distanceX * distanceX + distanceZ * distanceZ) <= (circleRadius * circleRadius);
  }

  private doesBoxGeometryOverlap(
    leftPosition: { x: number; z: number },
    leftAngle: number,
    leftGeometry: ObstacleGeometry,
    rightPosition: { x: number; z: number },
    rightAngle: number,
    rightGeometry: ObstacleGeometry,
  ): boolean {
    if (leftGeometry.majorRadius <= 0 || leftGeometry.minorRadius <= 0
      || rightGeometry.majorRadius <= 0 || rightGeometry.minorRadius <= 0) {
      return false;
    }

    const deltaX = rightPosition.x - leftPosition.x;
    const deltaZ = rightPosition.z - leftPosition.z;

    const leftXAxisX = Math.cos(leftAngle);
    const leftXAxisZ = Math.sin(leftAngle);
    const leftZAxisX = -leftXAxisZ;
    const leftZAxisZ = leftXAxisX;
    const rightXAxisX = Math.cos(rightAngle);
    const rightXAxisZ = Math.sin(rightAngle);
    const rightZAxisX = -rightXAxisZ;
    const rightZAxisZ = rightXAxisX;

    const projectionAxes = [
      { x: leftXAxisX, z: leftXAxisZ },
      { x: leftZAxisX, z: leftZAxisZ },
      { x: rightXAxisX, z: rightXAxisZ },
      { x: rightZAxisX, z: rightZAxisZ },
    ];

    for (const axis of projectionAxes) {
      const leftRadius = this.projectBoxRadiusOntoAxis(leftGeometry, axis, leftXAxisX, leftXAxisZ, leftZAxisX, leftZAxisZ);
      const rightRadius = this.projectBoxRadiusOntoAxis(
        rightGeometry,
        axis,
        rightXAxisX,
        rightXAxisZ,
        rightZAxisX,
        rightZAxisZ,
      );
      const distanceToAxis = Math.abs((deltaX * axis.x) + (deltaZ * axis.z));
      if (distanceToAxis > leftRadius + rightRadius) {
        return false;
      }
    }

    return true;
  }

  private projectBoxRadiusOntoAxis(
    geometry: ObstacleGeometry,
    axis: { x: number; z: number },
    axisX: number,
    axisZ: number,
    zAxisX: number,
    zAxisZ: number,
  ): number {
    return (geometry.majorRadius * Math.abs((axis.x * axisX) + (axis.z * axisZ)))
      + (geometry.minorRadius * Math.abs((axis.x * zAxisX) + (axis.z * zAxisZ)));
  }

  private isRemovableForConstruction(entity: MapEntity): boolean {
    if (entity.destroyed) {
      return false;
    }

    const kindOf = this.resolveEntityKindOfSet(entity);
    if (kindOf.has('INERT')) {
      return false;
    }
    if (kindOf.has('SHRUBBERY') || kindOf.has('CLEARED_BY_BUILD')) {
      return true;
    }
    return entity.health <= 0;
  }

  private isMineForConstruction(entity: MapEntity): boolean {
    return this.resolveEntityKindOfSet(entity).has('MINE');
  }

  private isInertForConstruction(entity: MapEntity): boolean {
    return this.resolveEntityKindOfSet(entity).has('INERT');
  }

  private isAlwaysSelectableForConstruction(entity: MapEntity): boolean {
    return this.resolveEntityKindOfSet(entity).has('ALWAYS_SELECTABLE');
  }

  private isImmobileForConstruction(entity: MapEntity): boolean {
    return this.resolveEntityKindOfSet(entity).has('IMMOBILE');
  }

  private isDisabledForConstruction(entity: MapEntity): boolean {
    return (
      this.entityHasObjectStatus(entity, 'DISABLED')
      || this.entityHasObjectStatus(entity, 'DISABLED_SUBDUED')
      || this.entityHasObjectStatus(entity, 'DISABLED_HACKED')
      || this.entityHasObjectStatus(entity, 'DISABLED_EMP')
      || this.entityHasObjectStatus(entity, 'DISABLED_HELD')
      || this.entityHasObjectStatus(entity, 'SCRIPT_DISABLED')
      || this.entityHasObjectStatus(entity, 'SCRIPT_UNPOWERED')
    );
  }

  private isLineBuildTemplate(objectDef: ObjectDef): boolean {
    return this.normalizeKindOf(objectDef.kindOf).has('LINEBUILD');
  }

  private getConstructingRelationship(owningSide: string, otherSide: string | undefined): number {
    const source = this.normalizeSide(owningSide);
    const target = this.normalizeSide(otherSide ?? '');
    if (!source || !target) {
      return RELATIONSHIP_NEUTRAL;
    }
    return this.getTeamRelationshipBySides(source, target);
  }

  private handleCancelDozerConstructionCommand(command: CancelDozerConstructionCommand): void {
    const building = this.spawnedEntities.get(command.entityId);
    if (!building || building.destroyed || building.category !== 'building') {
      return;
    }

    // Source parity: MSG_DOZER_CANCEL_CONSTRUCT only applies to structures under construction.
    if (!this.entityHasObjectStatus(building, 'UNDER_CONSTRUCTION')) {
      return;
    }

    if (!this.entityHasObjectStatus(building, 'RECONSTRUCTING')) {
      const objectDef = this.resolveObjectDefByTemplateName(building.templateName);
      if (objectDef) {
        const amount = this.resolveObjectBuildCost(objectDef, building.side ?? '');
        this.depositSideCredits(building.side, amount);
      }
    }

    this.markEntityDestroyed(building.id, -1);
  }

  private handleSellCommand(command: SellCommand): void {
    const entity = this.spawnedEntities.get(command.entityId);
    if (!entity || entity.destroyed) {
      return;
    }
    if (entity.category !== 'building') {
      return;
    }
    if (this.sellingEntities.has(entity.id)) {
      return;
    }

    // Source parity subset: BuildAssistant::sellObject starts a timed teardown
    // (construction-percent countdown) and refunds queue production immediately.
    this.cancelEntityCommandPathActions(entity.id);
    this.clearAttackTarget(entity.id);
    this.stopEntity(entity.id);
    this.cancelAndRefundAllProductionOnDeath(entity);
    entity.objectStatusFlags.add('SOLD');
    entity.objectStatusFlags.add('UNSELECTABLE');
    this.removeEntityFromSelection(entity.id);

    // Source parity subset: BuildAssistant::sellObject invokes contain->onSelling().
    // Open/Garrison contain variants map to passenger evacuation on sell start.
    if (entity.containProfile && this.collectContainedEntityIds(entity.id).length > 0) {
      this.evacuateContainedEntities(entity, entity.x, entity.z, null);
    }

    if (entity.parkingPlaceProfile) {
      const parkedEntityIds = Array.from(entity.parkingPlaceProfile.occupiedSpaceEntityIds.values());
      for (const parkedEntityId of parkedEntityIds) {
        this.markEntityDestroyed(parkedEntityId, entity.id);
      }
    }

    this.sellingEntities.set(entity.id, {
      sellFrame: this.frameCounter,
      constructionPercent: 99.9,
    });
  }

  private handleGarrisonBuildingCommand(command: GarrisonBuildingCommand): void {
    const infantry = this.spawnedEntities.get(command.entityId);
    const building = this.spawnedEntities.get(command.targetBuildingId);
    if (!infantry || !building || infantry.destroyed || building.destroyed) {
      return;
    }

    // Validate: source must be infantry, target must be garrisonable.
    if (infantry.category !== 'infantry') return;
    const containProfile = building.containProfile;
    if (!containProfile || containProfile.moduleType !== 'GARRISON') return;
    if (containProfile.garrisonCapacity <= 0) return;

    // Check capacity.
    const currentOccupants = this.collectContainedEntityIds(building.id).length;
    if (currentOccupants >= containProfile.garrisonCapacity) return;

    // Move infantry to building if not close enough.
    const distance = Math.hypot(building.x - infantry.x, building.z - infantry.z);
    if (distance > 15) {
      this.issueMoveTo(infantry.id, building.x, building.z);
      // Re-issue garrison when close enough via pending action.
      this.pendingGarrisonActions.set(infantry.id, building.id);
      return;
    }

    // Enter garrison.
    this.cancelEntityCommandPathActions(infantry.id);
    this.clearAttackTarget(infantry.id);
    infantry.garrisonContainerId = building.id;
    infantry.x = building.x;
    infantry.z = building.z;
    infantry.y = building.y;
    infantry.canMove = false;
    infantry.moving = false;
    this.pendingGarrisonActions.delete(infantry.id);
  }

  private updatePendingGarrisonActions(): void {
    for (const [infantryId, buildingId] of this.pendingGarrisonActions.entries()) {
      const infantry = this.spawnedEntities.get(infantryId);
      const building = this.spawnedEntities.get(buildingId);
      if (!infantry || !building || infantry.destroyed || building.destroyed) {
        this.pendingGarrisonActions.delete(infantryId);
        continue;
      }

      const distance = Math.hypot(building.x - infantry.x, building.z - infantry.z);
      if (distance > 15) continue;

      // Close enough — enter garrison.
      const containProfile = building.containProfile;
      if (!containProfile || containProfile.moduleType !== 'GARRISON') {
        this.pendingGarrisonActions.delete(infantryId);
        continue;
      }

      const currentOccupants = this.collectContainedEntityIds(building.id).length;
      if (currentOccupants >= containProfile.garrisonCapacity) {
        this.pendingGarrisonActions.delete(infantryId);
        continue;
      }

      this.cancelEntityCommandPathActions(infantry.id);
      this.clearAttackTarget(infantry.id);
      infantry.garrisonContainerId = building.id;
      infantry.x = building.x;
      infantry.z = building.z;
      infantry.y = building.y;
      infantry.canMove = false;
      infantry.moving = false;
      this.pendingGarrisonActions.delete(infantryId);
    }
  }

  /**
   * Source parity: BuildAssistant::repairObject — dozer repairs a damaged friendly building.
   */
  private handleRepairBuildingCommand(command: RepairBuildingCommand): void {
    const dozer = this.spawnedEntities.get(command.entityId);
    const building = this.spawnedEntities.get(command.targetBuildingId);
    if (!dozer || !building || dozer.destroyed || building.destroyed) return;
    if (!dozer.kindOf.has('DOZER')) return;
    if (!building.kindOf.has('STRUCTURE')) return;
    if (building.health >= building.maxHealth) return;

    // Must be same side.
    const dozerSide = this.normalizeSide(dozer.side);
    const buildingSide = this.normalizeSide(building.side);
    if (dozerSide !== buildingSide) return;

    // Move dozer to building if not close enough.
    const distance = Math.hypot(building.x - dozer.x, building.z - dozer.z);
    if (distance > 20) {
      this.issueMoveTo(dozer.id, building.x, building.z);
    }
    this.pendingRepairActions.set(dozer.id, building.id);
  }

  /**
   * Source parity: BuildAssistant repair update — dozers repair buildings over time.
   * Repair rate: ~2% max HP per second, costs ~0.5% of building cost per second.
   */
  private updatePendingRepairActions(): void {
    const REPAIR_RATE_PER_FRAME = 0.02 / 30; // 2% of maxHP per second at 30fps
    const REPAIR_COST_RATE = 0.005 / 30; // 0.5% of build cost per second at 30fps

    for (const [dozerId, buildingId] of this.pendingRepairActions.entries()) {
      const dozer = this.spawnedEntities.get(dozerId);
      const building = this.spawnedEntities.get(buildingId);
      if (!dozer || !building || dozer.destroyed || building.destroyed) {
        this.pendingRepairActions.delete(dozerId);
        continue;
      }

      // Building fully repaired.
      if (building.health >= building.maxHealth) {
        this.pendingRepairActions.delete(dozerId);
        continue;
      }

      // Must be close enough to repair.
      const distance = Math.hypot(building.x - dozer.x, building.z - dozer.z);
      if (distance > 20) continue; // Still moving

      // Stop dozer movement while repairing.
      if (dozer.moving) {
        dozer.moving = false;
        dozer.moveTarget = null;
        dozer.movePath = [];
      }

      // Check player can afford repair.
      const dozerSide = this.normalizeSide(dozer.side);
      if (!dozerSide) {
        this.pendingRepairActions.delete(dozerId);
        continue;
      }
      const credits = this.sideCredits.get(dozerSide) ?? 0;
      const buildCost = building.maxHealth; // Approximate — use maxHealth as fallback for build cost
      const frameCost = REPAIR_COST_RATE * buildCost;
      if (credits < frameCost) continue; // Can't afford this frame

      // Deduct cost and apply repair.
      this.sideCredits.set(dozerSide, credits - frameCost);
      const healAmount = REPAIR_RATE_PER_FRAME * building.maxHealth;
      building.health = Math.min(building.maxHealth, building.health + healAmount);
    }
  }

  private updatePendingEnterObjectActions(): void {
    for (const [sourceId, pending] of this.pendingEnterObjectActions.entries()) {
      const source = this.spawnedEntities.get(sourceId);
      const target = this.spawnedEntities.get(pending.targetObjectId);
      if (!source || !target || source.destroyed || target.destroyed) {
        this.pendingEnterObjectActions.delete(sourceId);
        continue;
      }

      const distance = Math.hypot(target.x - source.x, target.z - source.z);
      const reachDistance = this.resolveEntityInteractionDistance(source, target);
      if (distance > reachDistance) {
        if (!source.moving) {
          this.issueMoveTo(source.id, target.x, target.z);
        }
        continue;
      }

      this.resolvePendingEnterObjectAction(source, target, pending.action);
      this.pendingEnterObjectActions.delete(sourceId);
    }
  }

  private resolvePendingEnterObjectAction(
    source: MapEntity,
    target: MapEntity,
    action: EnterObjectCommand['action'],
  ): void {
    if (source.destroyed || target.destroyed) {
      return;
    }

    if (action === 'hijackVehicle') {
      this.resolveHijackVehicleEnterAction(source, target);
      return;
    }

    if (action === 'convertToCarBomb') {
      this.resolveConvertToCarBombEnterAction(source, target);
      return;
    }

    if (action === 'sabotageBuilding') {
      this.resolveSabotageBuildingEnterAction(source, target);
    }
  }

  private resolveHijackVehicleEnterAction(source: MapEntity, target: MapEntity): void {
    if (!this.canExecuteHijackVehicleEnterAction(source, target)) {
      return;
    }

    const sourceSide = this.normalizeSide(source.side);
    if (!sourceSide) {
      return;
    }

    this.captureEntity(target.id, sourceSide);
    target.objectStatusFlags.add('HIJACKED');
    target.weaponSetFlagsMask |= WEAPON_SET_FLAG_VEHICLE_HIJACK;
    this.refreshEntityCombatProfiles(target);
    this.markEntityDestroyed(source.id, target.id);
  }

  private canExecuteHijackVehicleEnterAction(source: MapEntity, target: MapEntity): boolean {
    if (target.category !== 'vehicle') {
      return false;
    }
    if (this.getTeamRelationship(source, target) !== RELATIONSHIP_ENEMIES) {
      return false;
    }

    const sourceObjectDef = this.resolveObjectDefByTemplateName(source.templateName);
    if (!sourceObjectDef || !this.hasBehaviorModuleType(sourceObjectDef, 'CONVERTTOHIJACKEDVEHICLECRATECOLLIDE')) {
      return false;
    }

    const targetKindOf = this.resolveEntityKindOfSet(target);
    if (targetKindOf.has('IMMUNE_TO_CAPTURE')) {
      return false;
    }
    if (targetKindOf.has('AIRCRAFT') || targetKindOf.has('BOAT') || targetKindOf.has('DRONE')) {
      return false;
    }
    if (targetKindOf.has('TRANSPORT') && this.collectContainedEntityIds(target.id).length > 0) {
      return false;
    }
    if (this.entityHasObjectStatus(target, 'HIJACKED')) {
      return false;
    }

    return true;
  }

  private resolveConvertToCarBombEnterAction(source: MapEntity, target: MapEntity): void {
    if (!this.canExecuteConvertToCarBombEnterAction(source, target)) {
      return;
    }

    const sourceSide = this.normalizeSide(source.side);
    if (!sourceSide) {
      return;
    }

    this.captureEntity(target.id, sourceSide);
    target.objectStatusFlags.add('CARBOMB');
    target.weaponSetFlagsMask |= WEAPON_SET_FLAG_CARBOMB;
    this.refreshEntityCombatProfiles(target);
    this.markEntityDestroyed(source.id, target.id);
  }

  private canExecuteConvertToCarBombEnterAction(source: MapEntity, target: MapEntity): boolean {
    if (target.category !== 'vehicle') {
      return false;
    }
    if (this.getTeamRelationship(source, target) === RELATIONSHIP_ALLIES) {
      return false;
    }

    const sourceObjectDef = this.resolveObjectDefByTemplateName(source.templateName);
    if (!sourceObjectDef || !this.hasBehaviorModuleType(sourceObjectDef, 'CONVERTTOCARBOMBCRATECOLLIDE')) {
      return false;
    }

    const targetKindOf = this.resolveEntityKindOfSet(target);
    if (targetKindOf.has('AIRCRAFT') || targetKindOf.has('BOAT')) {
      return false;
    }
    if (this.entityHasObjectStatus(target, 'CARBOMB')) {
      return false;
    }
    if ((target.weaponSetFlagsMask & WEAPON_SET_FLAG_CARBOMB) !== 0) {
      return false;
    }
    if (!this.hasCarBombWeaponSet(target)) {
      return false;
    }

    return true;
  }

  private hasCarBombWeaponSet(target: MapEntity): boolean {
    const carbombSet = this.selectBestSetByConditions(target.weaponTemplateSets, WEAPON_SET_FLAG_CARBOMB);
    if (!carbombSet) {
      return false;
    }
    if ((carbombSet.conditionsMask & WEAPON_SET_FLAG_CARBOMB) === 0) {
      return false;
    }
    return carbombSet.weaponNamesBySlot.some((weaponName) => weaponName !== null);
  }

  private resolveSabotageBuildingEnterAction(source: MapEntity, target: MapEntity): void {
    if (target.category !== 'building') {
      return;
    }
    if (this.getTeamRelationship(source, target) !== RELATIONSHIP_ENEMIES) {
      return;
    }

    const sabotageProfile = this.resolveSabotageBuildingProfile(source, target);
    if (!sabotageProfile) {
      return;
    }

    if (sabotageProfile.disableHackedDurationFrames > 0) {
      const disableUntilFrame = this.frameCounter + sabotageProfile.disableHackedDurationFrames;
      this.setDisabledHackedStatusUntil(target, disableUntilFrame);
      if (sabotageProfile.disableContainedHackers) {
        for (const passengerId of this.collectContainedEntityIds(target.id)) {
          const passenger = this.spawnedEntities.get(passengerId);
          if (!passenger || passenger.destroyed) {
            continue;
          }
          this.setDisabledHackedStatusUntil(passenger, disableUntilFrame);
        }
      }
    }

    if (sabotageProfile.stealsCashAmount > 0) {
      const sourceSide = this.normalizeSide(source.side);
      const targetSide = this.normalizeSide(target.side);
      if (sourceSide && targetSide) {
        const withdrawn = this.withdrawSideCredits(targetSide, sabotageProfile.stealsCashAmount);
        if (withdrawn > 0) {
          this.depositSideCredits(sourceSide, withdrawn);
        }
      }
    }

    if (sabotageProfile.destroysTarget) {
      this.markEntityDestroyed(target.id, source.id);
    }

    if (sabotageProfile.powerSabotageDurationFrames > 0) {
      // Source parity: SabotagePowerPlantCrateCollide drives side-level brownout state.
      // That player-energy outage timer is not represented in this simulation yet.
    }

    this.markEntityDestroyed(source.id, target.id);
  }

  private setDisabledHackedStatusUntil(entity: MapEntity, disableUntilFrame: number): void {
    if (!Number.isFinite(disableUntilFrame)) {
      return;
    }
    const resolvedDisableUntilFrame = Math.max(this.frameCounter + 1, Math.trunc(disableUntilFrame));
    entity.objectStatusFlags.add('DISABLED_HACKED');
    const previousDisableUntil = this.disabledHackedStatusByEntityId.get(entity.id) ?? 0;
    if (resolvedDisableUntilFrame > previousDisableUntil) {
      this.disabledHackedStatusByEntityId.set(entity.id, resolvedDisableUntilFrame);
    }
  }

  private resolveSabotageBuildingProfile(source: MapEntity, target: MapEntity): SabotageBuildingProfile | null {
    const sourceObjectDef = this.resolveObjectDefByTemplateName(source.templateName);
    if (!sourceObjectDef) {
      return null;
    }
    const targetKindOf = this.resolveEntityKindOfSet(target);

    let profile: SabotageBuildingProfile | null = null;
    const visitBlock = (block: IniBlock): void => {
      if (profile !== null) {
        return;
      }

      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        const sabotageDurationFrames = this.msToLogicFrames(readNumericField(block.fields, ['SabotageDuration']) ?? 0);
        const sabotagePowerDurationFrames = this.msToLogicFrames(
          readNumericField(block.fields, ['SabotagePowerDuration']) ?? 0,
        );
        const stealCashAmount = Math.max(0, Math.trunc(readNumericField(block.fields, ['StealCashAmount']) ?? 0));

        if (
          moduleType === 'SABOTAGEMILITARYFACTORYCRATECOLLIDE'
          && this.matchesAnyKindOf(targetKindOf, ['FS_BARRACKS', 'FS_WARFACTORY', 'FS_AIRFIELD'])
        ) {
          profile = {
            moduleType,
            disableHackedDurationFrames: sabotageDurationFrames,
            disableContainedHackers: false,
            stealsCashAmount: 0,
            destroysTarget: false,
            powerSabotageDurationFrames: 0,
          };
          return;
        }

        if (
          moduleType === 'SABOTAGEINTERNETCENTERCRATECOLLIDE'
          && targetKindOf.has('FS_INTERNET_CENTER')
        ) {
          profile = {
            moduleType,
            disableHackedDurationFrames: sabotageDurationFrames,
            disableContainedHackers: true,
            stealsCashAmount: 0,
            destroysTarget: false,
            powerSabotageDurationFrames: 0,
          };
          return;
        }

        if (
          moduleType === 'SABOTAGESUPPLYCENTERCRATECOLLIDE'
          && targetKindOf.has('FS_SUPPLY_CENTER')
        ) {
          profile = {
            moduleType,
            disableHackedDurationFrames: 0,
            disableContainedHackers: false,
            stealsCashAmount: stealCashAmount,
            destroysTarget: false,
            powerSabotageDurationFrames: 0,
          };
          return;
        }

        if (
          moduleType === 'SABOTAGESUPPLYDROPZONECRATECOLLIDE'
          && targetKindOf.has('FS_SUPPLY_DROPZONE')
        ) {
          profile = {
            moduleType,
            disableHackedDurationFrames: 0,
            disableContainedHackers: false,
            stealsCashAmount: stealCashAmount,
            destroysTarget: false,
            powerSabotageDurationFrames: 0,
          };
          return;
        }

        if (
          moduleType === 'SABOTAGEFAKEBUILDINGCRATECOLLIDE'
          && targetKindOf.has('FS_FAKE')
        ) {
          profile = {
            moduleType,
            disableHackedDurationFrames: 0,
            disableContainedHackers: false,
            stealsCashAmount: 0,
            destroysTarget: true,
            powerSabotageDurationFrames: 0,
          };
          return;
        }

        if (
          moduleType === 'SABOTAGEPOWERPLANTCRATECOLLIDE'
          && targetKindOf.has('FS_POWER')
        ) {
          profile = {
            moduleType,
            disableHackedDurationFrames: 0,
            disableContainedHackers: false,
            stealsCashAmount: 0,
            destroysTarget: false,
            powerSabotageDurationFrames: sabotagePowerDurationFrames,
          };
          return;
        }

        if (
          moduleType === 'SABOTAGECOMMANDCENTERCRATECOLLIDE'
          && targetKindOf.has('COMMANDCENTER')
        ) {
          profile = {
            moduleType,
            disableHackedDurationFrames: 0,
            disableContainedHackers: false,
            stealsCashAmount: 0,
            destroysTarget: false,
            powerSabotageDurationFrames: 0,
          };
          return;
        }

        if (
          moduleType === 'SABOTAGESUPERWEAPONCRATECOLLIDE'
          && targetKindOf.has('FS_SUPERWEAPON')
        ) {
          profile = {
            moduleType,
            disableHackedDurationFrames: 0,
            disableContainedHackers: false,
            stealsCashAmount: 0,
            destroysTarget: false,
            powerSabotageDurationFrames: 0,
          };
          return;
        }
      }

      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const block of sourceObjectDef.blocks) {
      visitBlock(block);
    }
    return profile;
  }

  private matchesAnyKindOf(kindOf: ReadonlySet<string>, candidateKinds: readonly string[]): boolean {
    for (const candidateKind of candidateKinds) {
      if (kindOf.has(candidateKind)) {
        return true;
      }
    }
    return false;
  }

  private updateRailedTransport(): void {
    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed || !entity.canMove) {
        continue;
      }

      const objectDef = this.resolveObjectDefByTemplateName(entity.templateName);
      const profile = this.extractRailedTransportProfile(objectDef ?? undefined);
      if (!profile) {
        continue;
      }

      updateRailedTransportEntityImpl(entity, profile, {
        waypointIndex: this.railedTransportWaypointIndex,
        resolveRuntimeState: this.resolveRailedTransportRuntimeState.bind(this),
        issueMoveTo: this.issueMoveTo.bind(this),
        isValidEntity: (candidate) => !candidate.destroyed && candidate.canMove,
      });
    }
  }

  private updatePendingCombatDropActions(): void {
    for (const [sourceId, pending] of this.pendingCombatDropActions.entries()) {
      const source = this.spawnedEntities.get(sourceId);
      if (!source || source.destroyed) {
        this.pendingCombatDropActions.delete(sourceId);
        continue;
      }

      if (source.moving) {
        continue;
      }

      const distance = Math.hypot(pending.targetX - source.x, pending.targetZ - source.z);
      const dropReachDistance = this.resolveEntityMajorRadius(source) + MAP_XY_FACTOR;
      if (distance > dropReachDistance) {
        this.issueMoveTo(source.id, pending.targetX, pending.targetZ);
        continue;
      }

      this.evacuateContainedEntities(source, pending.targetX, pending.targetZ, pending.targetObjectId);
      this.pendingCombatDropActions.delete(sourceId);
    }
  }

  private updateHackInternet(): void {
    for (const [entityId, hackState] of this.hackInternetStateByEntityId.entries()) {
      const entity = this.spawnedEntities.get(entityId);
      if (!entity || entity.destroyed) {
        this.hackInternetStateByEntityId.delete(entityId);
        continue;
      }

      if (this.frameCounter < hackState.nextCashFrame) {
        continue;
      }

      this.depositSideCredits(entity.side, hackState.cashAmountPerCycle);
      const cycleDelay = Math.max(1, hackState.cashUpdateDelayFrames);
      hackState.nextCashFrame = this.frameCounter + cycleDelay;
    }
  }

  private updatePendingHackInternetCommands(): void {
    for (const [entityId, pending] of this.hackInternetPendingCommandByEntityId.entries()) {
      const entity = this.spawnedEntities.get(entityId);
      if (!entity || entity.destroyed) {
        this.hackInternetPendingCommandByEntityId.delete(entityId);
        continue;
      }

      if (this.frameCounter < pending.executeFrame) {
        continue;
      }

      this.hackInternetPendingCommandByEntityId.delete(entityId);
      this.applyCommand(pending.command);
    }
  }

  private updateOvercharge(): void {
    for (const [entityId, overchargeState] of this.overchargeStateByEntityId.entries()) {
      const entity = this.spawnedEntities.get(entityId);
      if (!entity || entity.destroyed) {
        this.overchargeStateByEntityId.delete(entityId);
        continue;
      }

      const damageAmount = (entity.maxHealth * overchargeState.healthPercentToDrainPerSecond) / LOGIC_FRAME_RATE;
      if (damageAmount > 0 && entity.canTakeDamage && entity.health > 0) {
        this.applyWeaponDamageAmount(entity.id, entity, damageAmount, 'PENALTY');
      }

      const refreshed = this.spawnedEntities.get(entityId);
      if (!refreshed || refreshed.destroyed) {
        this.overchargeStateByEntityId.delete(entityId);
        continue;
      }

      const minimumAllowedHealth = refreshed.maxHealth * overchargeState.notAllowedWhenHealthBelowPercent;
      if (minimumAllowedHealth > 0 && refreshed.health < minimumAllowedHealth) {
        this.disableOverchargeForEntity(refreshed);
      }
    }
  }

  private updateDisabledHackedStatuses(): void {
    for (const [entityId, disableUntilFrame] of this.disabledHackedStatusByEntityId.entries()) {
      const entity = this.spawnedEntities.get(entityId);
      if (!entity || entity.destroyed) {
        this.disabledHackedStatusByEntityId.delete(entityId);
        continue;
      }

      if (this.frameCounter < disableUntilFrame) {
        continue;
      }

      entity.objectStatusFlags.delete('DISABLED_HACKED');
      this.disabledHackedStatusByEntityId.delete(entityId);
    }
  }

  /**
   * Source parity: EMPUpdate — timed DISABLED_EMP status expiry.
   */
  private updateDisabledEmpStatuses(): void {
    for (const [entityId, disableUntilFrame] of this.disabledEmpStatusByEntityId.entries()) {
      const entity = this.spawnedEntities.get(entityId);
      if (!entity || entity.destroyed) {
        this.disabledEmpStatusByEntityId.delete(entityId);
        continue;
      }
      if (this.frameCounter < disableUntilFrame) {
        continue;
      }
      entity.objectStatusFlags.delete('DISABLED_EMP');
      this.disabledEmpStatusByEntityId.delete(entityId);
    }
  }

  /**
   * Apply EMP disable effect to an entity for a duration.
   * Source parity: EMPUpdate::onObjectCreated / EMPWeapon hit.
   */
  private applyEmpDisable(entity: MapEntity, durationFrames: number): void {
    if (entity.destroyed) return;
    entity.objectStatusFlags.add('DISABLED_EMP');
    const resolvedDisableUntilFrame = this.frameCounter + durationFrames;
    const previous = this.disabledEmpStatusByEntityId.get(entity.id) ?? 0;
    if (resolvedDisableUntilFrame > previous) {
      this.disabledEmpStatusByEntityId.set(entity.id, resolvedDisableUntilFrame);
    }
  }

  /**
   * Source parity: Object::look() / Object::unlook()
   * Updates each entity's vision contribution to the fog of war grid.
   */
  /**
   * Source parity: StealthUpdate — auto-stealth entities with CAN_STEALTH,
   * break stealth on attack/move, count down stealth delay.
   */
  private updateStealth(): void {
    const STEALTH_DELAY_FRAMES = 60; // ~2s at 30fps

    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed) continue;

      // Clear expired detection.
      if (entity.detectedUntilFrame > 0 && this.frameCounter >= entity.detectedUntilFrame) {
        entity.objectStatusFlags.delete('DETECTED');
        entity.detectedUntilFrame = 0;
      }

      if (!entity.objectStatusFlags.has('CAN_STEALTH')) continue;

      // Break stealth while attacking or moving.
      const isAttacking = entity.attackTargetEntityId !== null;
      const isMoving = entity.moving;

      if (isAttacking || isMoving) {
        if (entity.objectStatusFlags.has('STEALTHED')) {
          entity.objectStatusFlags.delete('STEALTHED');
        }
        entity.stealthDelayRemaining = STEALTH_DELAY_FRAMES;
        continue;
      }

      // Count down stealth delay.
      if (entity.stealthDelayRemaining > 0) {
        entity.stealthDelayRemaining--;
        continue;
      }

      // Enter stealth.
      if (!entity.objectStatusFlags.has('STEALTHED')) {
        entity.objectStatusFlags.add('STEALTHED');
      }
    }
  }

  /**
   * Source parity: StealthDetectorUpdate — detector units reveal stealthed enemies.
   */
  private updateDetection(): void {
    const DETECTION_DURATION_FRAMES = 30; // ~1s at 30fps — long enough to avoid flicker

    for (const detector of this.spawnedEntities.values()) {
      if (detector.destroyed) continue;
      if (!detector.kindOf.has('DETECTOR')) continue;

      const detectionRange = detector.visionRange > 0 ? detector.visionRange : 150;
      const detRangeSq = detectionRange * detectionRange;

      for (const target of this.spawnedEntities.values()) {
        if (target.destroyed || target === detector) continue;
        if (!target.objectStatusFlags.has('STEALTHED')) continue;

        // Only detect enemies.
        if (this.getTeamRelationship(detector, target) !== RELATIONSHIP_ENEMIES) continue;

        const dx = target.x - detector.x;
        const dz = target.z - detector.z;
        if (dx * dx + dz * dz <= detRangeSq) {
          target.objectStatusFlags.add('DETECTED');
          // Refresh detection timer while target stays in range (prevents flicker).
          target.detectedUntilFrame = this.frameCounter + DETECTION_DURATION_FRAMES;
        }
      }
    }
  }

  /**
   * Source parity: PoisonedBehavior — tick poison DoT on all poisoned entities.
   * Each poison tick applies UNRESISTABLE damage so it can't be re-poisoned recursively.
   */
  private updatePoisonedEntities(): void {
    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed || entity.poisonDamageAmount <= 0) continue;

      // Check if poison has expired
      if (this.frameCounter >= entity.poisonExpireFrame) {
        entity.poisonDamageAmount = 0;
        entity.objectStatusFlags.delete('POISONED');
        continue;
      }

      // Apply poison damage tick
      if (this.frameCounter >= entity.poisonNextDamageFrame) {
        this.applyWeaponDamageAmount(null, entity, entity.poisonDamageAmount, 'UNRESISTABLE');
        entity.poisonNextDamageFrame = this.frameCounter + entity.poisonDamageIntervalFrames;
      }
    }
  }

  /**
   * Source parity: FlammableUpdate — tick fire DoT on all aflame entities.
   * Entities accumulate fire damage; once threshold exceeded, they ignite.
   * While AFLAME, periodic fire damage is applied. After duration, transitions to BURNED.
   */
  private updateFlammableEntities(): void {
    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed) continue;
      if (entity.flameStatus === 'NORMAL' || entity.flameStatus === 'BURNED') continue;

      // Entity is AFLAME — check if it's time to stop burning
      if (this.frameCounter >= entity.flameEndFrame) {
        entity.flameStatus = 'BURNED';
        entity.objectStatusFlags.delete('AFLAME');
        entity.objectStatusFlags.add('BURNED');
        continue;
      }

      // Apply periodic fire damage
      const prof = entity.flammableProfile;
      if (prof && prof.aflameDamageDelayFrames > 0 && this.frameCounter >= entity.flameDamageNextFrame) {
        this.applyWeaponDamageAmount(null, entity, prof.aflameDamageAmount, 'FLAME');
        entity.flameDamageNextFrame = this.frameCounter + prof.aflameDamageDelayFrames;
      }
    }
  }

  /**
   * Source parity: FlammableUpdate.onDamage — accumulate fire damage and try to ignite.
   */
  private applyFireDamageToEntity(entity: MapEntity, actualDamage: number): void {
    const prof = entity.flammableProfile;
    if (!prof) return;
    if (entity.flameStatus !== 'NORMAL') return; // Can't reignite burned or already aflame

    // Reset accumulation if no fire damage in a while
    if (this.frameCounter - entity.flameLastDamageReceivedFrame > prof.flameDamageExpirationDelayFrames) {
      entity.flameDamageAccumulated = 0;
    }
    entity.flameLastDamageReceivedFrame = this.frameCounter;
    entity.flameDamageAccumulated += actualDamage;

    // Check ignition threshold
    if (entity.flameDamageAccumulated >= prof.flameDamageLimit) {
      entity.flameStatus = 'AFLAME';
      entity.objectStatusFlags.add('AFLAME');
      entity.flameEndFrame = this.frameCounter + prof.aflameDurationFrames;
      entity.flameDamageNextFrame = prof.aflameDamageDelayFrames > 0
        ? this.frameCounter + prof.aflameDamageDelayFrames
        : Infinity;
      entity.flameDamageAccumulated = 0;
    }
  }

  /**
   * Source parity: PoisonedBehavior.onDamage — start or refresh poison DoT.
   */
  private applyPoisonToEntity(entity: MapEntity, actualDamage: number): void {
    if (actualDamage <= 0) return;
    entity.poisonDamageAmount = actualDamage;
    entity.poisonExpireFrame = this.frameCounter + entity.poisonDurationFrames;
    // Only reset next-damage timer if not already ticking
    if (entity.poisonNextDamageFrame <= this.frameCounter) {
      entity.poisonNextDamageFrame = this.frameCounter + entity.poisonDamageIntervalFrames;
    }
    entity.objectStatusFlags.add('POISONED');
  }

  /**
   * Source parity: AutoHealBehavior, BaseRegenerateUpdate, PropagandaTowerBehavior.
   * Runs all healing systems in a single pass.
   */
  private updateHealing(): void {
    const LOGICFRAMES_PER_SECOND = 30;
    const BASE_REGEN_INTERVAL = 3; // BaseRegenerateUpdate heals every 3 frames

    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed) continue;
      if (entity.health >= entity.maxHealth && entity.health > 0) {
        // Already at full health — skip self-heal and base-regen (but propaganda tower still runs)
        if (!entity.propagandaTowerProfile) continue;
      }

      const isDisabled = entity.objectStatusFlags.has('DISABLED_EMP')
        || entity.objectStatusFlags.has('DISABLED_HACKED')
        || entity.objectStatusFlags.has('DISABLED_SUBDUED');

      // ── AutoHealBehavior (self-heal) ──
      if (entity.autoHealProfile && !isDisabled && entity.health < entity.maxHealth) {
        const prof = entity.autoHealProfile;
        if (prof.initiallyActive || entity.completedUpgrades.size > 0) {
          // Check damage delay.
          if (this.frameCounter >= entity.autoHealDamageDelayUntilFrame) {
            if (this.frameCounter >= entity.autoHealNextFrame) {
              if (prof.radius > 0) {
                // Radius heal mode — heal nearby allies.
                const radiusSq = prof.radius * prof.radius;
                for (const target of this.spawnedEntities.values()) {
                  if (target.destroyed || target === entity) continue;
                  if (target.health >= target.maxHealth) continue;
                  if (this.getTeamRelationship(entity, target) === RELATIONSHIP_ENEMIES) continue;
                  const dx = target.x - entity.x;
                  const dz = target.z - entity.z;
                  if (dx * dx + dz * dz <= radiusSq) {
                    this.attemptHealingFromSoleBenefactor(target, prof.healingAmount, entity.id, prof.healingDelayFrames);
                  }
                }
              } else if (prof.affectsWholePlayer) {
                // Whole-player mode — heal all entities on same side.
                const side = this.normalizeSide(entity.side);
                for (const target of this.spawnedEntities.values()) {
                  if (target.destroyed || target.health >= target.maxHealth) continue;
                  if (this.normalizeSide(target.side) !== side) continue;
                  target.health = Math.min(target.maxHealth, target.health + prof.healingAmount);
                }
              } else {
                // Self-heal mode.
                entity.health = Math.min(entity.maxHealth, entity.health + prof.healingAmount);
              }
              entity.autoHealNextFrame = this.frameCounter + prof.healingDelayFrames;
            }
          }
        }
      }

      // ── BaseRegenerateUpdate (structure regen) ──
      if (entity.kindOf.has('STRUCTURE') && !isDisabled && entity.health < entity.maxHealth
          && !entity.objectStatusFlags.has('UNDER_CONSTRUCTION')
          && !entity.objectStatusFlags.has('SOLD')
          && BASE_REGEN_HEALTH_PERCENT_PER_SECOND > 0) {
        if (this.frameCounter >= entity.baseRegenDelayUntilFrame) {
          if (this.frameCounter % BASE_REGEN_INTERVAL === 0) {
            const amount = BASE_REGEN_INTERVAL * entity.maxHealth * BASE_REGEN_HEALTH_PERCENT_PER_SECOND / LOGICFRAMES_PER_SECOND;
            entity.health = Math.min(entity.maxHealth, entity.health + amount);
          }
        }
      }

      // ── PropagandaTowerBehavior (radius heal aura) ──
      if (entity.propagandaTowerProfile && !isDisabled
          && !entity.objectStatusFlags.has('UNDER_CONSTRUCTION')
          && !entity.objectStatusFlags.has('SOLD')) {
        const prof = entity.propagandaTowerProfile;
        const isUpgraded = prof.upgradeRequired !== null
          && entity.completedUpgrades.has(prof.upgradeRequired.toUpperCase());
        const healPct = isUpgraded ? prof.upgradedHealPercentPerSecond : prof.healPercentPerSecond;

        // Rescan for units in range periodically.
        if (this.frameCounter >= entity.propagandaTowerNextScanFrame) {
          entity.propagandaTowerTrackedIds = [];
          const radiusSq = prof.radius * prof.radius;
          for (const target of this.spawnedEntities.values()) {
            if (target.destroyed || target === entity) continue;
            if (target.kindOf.has('STRUCTURE')) continue; // Only troops
            if (this.getTeamRelationship(entity, target) === RELATIONSHIP_ENEMIES) continue;
            const dx = target.x - entity.x;
            const dz = target.z - entity.z;
            if (dx * dx + dz * dz <= radiusSq) {
              entity.propagandaTowerTrackedIds.push(target.id);
            }
          }
          entity.propagandaTowerNextScanFrame = this.frameCounter + prof.scanDelayFrames;
        }

        // Heal tracked units each frame.
        for (const targetId of entity.propagandaTowerTrackedIds) {
          const target = this.spawnedEntities.get(targetId);
          if (!target || target.destroyed || target.health >= target.maxHealth) continue;
          const amount = healPct / LOGICFRAMES_PER_SECOND * target.maxHealth;
          this.attemptHealingFromSoleBenefactor(target, amount, entity.id, prof.scanDelayFrames);
        }
      }
    }
  }

  /**
   * Source parity: Object::attemptHealingFromSoleBenefactor — anti-stack healing.
   * Only one benefactor can heal a unit at a time.
   */
  private attemptHealingFromSoleBenefactor(
    target: MapEntity, amount: number, sourceId: number, duration: number,
  ): void {
    const now = this.frameCounter;
    if (now >= target.soleHealingBenefactorExpirationFrame || target.soleHealingBenefactorId === sourceId) {
      target.soleHealingBenefactorId = sourceId;
      target.soleHealingBenefactorExpirationFrame = now + duration;
      target.health = Math.min(target.maxHealth, target.health + amount);
    }
  }

  private updateFogOfWar(): void {
    const grid = this.fogOfWarGrid;
    if (!grid) {
      return;
    }

    for (const entity of this.spawnedEntities.values()) {
      const playerIdx = this.resolvePlayerIndexForSide(entity.side);
      if (playerIdx < 0) {
        continue;
      }

      updateEntityVisionImpl(
        grid,
        entity.visionState,
        playerIdx,
        entity.x,
        entity.z,
        entity.visionRange,
        !entity.destroyed,
      );
    }
  }

  /**
   * Resolve or allocate a player index for a side string.
   * Used by fog of war to track per-player visibility.
   */
  private resolvePlayerIndexForSide(side: string | undefined): number {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide) {
      return -1;
    }

    let idx = this.sidePlayerIndex.get(normalizedSide);
    if (idx !== undefined) {
      return idx;
    }

    idx = this.nextPlayerIndex++;
    this.sidePlayerIndex.set(normalizedSide, idx);
    return idx;
  }

  /**
   * Get the visibility of a world position for a specific side.
   */
  getCellVisibility(side: string, worldX: number, worldZ: number): CellVisibility {
    const grid = this.fogOfWarGrid;
    if (!grid) {
      return CELL_CLEAR; // No fog of war without a grid.
    }

    const playerIdx = this.sidePlayerIndex.get(this.normalizeSide(side));
    if (playerIdx === undefined) {
      return CELL_SHROUDED;
    }

    return grid.getCellVisibility(playerIdx, worldX, worldZ);
  }

  /**
   * Check if a position is visible (CLEAR) for a side.
   */
  isPositionVisible(side: string, worldX: number, worldZ: number): boolean {
    return this.getCellVisibility(side, worldX, worldZ) === CELL_CLEAR;
  }

  /**
   * Get superweapon countdown timers for all sides.
   * Returns array of { side, entityId, powerName, readyFrame, currentFrame, isReady }.
   */
  getSuperweaponCountdowns(): Array<{
    side: string;
    entityId: number;
    powerName: string;
    readyFrame: number;
    currentFrame: number;
    isReady: boolean;
  }> {
    const results: Array<{
      side: string;
      entityId: number;
      powerName: string;
      readyFrame: number;
      currentFrame: number;
      isReady: boolean;
    }> = [];

    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed) continue;
      if (!entity.kindOf.has('FS_SUPERWEAPON')) continue;

      for (const [, module] of entity.specialPowerModules) {
        const powerName = module.specialPowerTemplateName;
        // Look up shared ready frame.
        const normalizedPower = powerName.toUpperCase().replace(/\s+/g, '');
        const sharedFrame = this.sharedShortcutSpecialPowerReadyFrames.get(normalizedPower) ?? 0;
        const readyFrame = sharedFrame > 0 ? sharedFrame : 0;

        results.push({
          side: entity.side ?? '',
          entityId: entity.id,
          powerName,
          readyFrame,
          currentFrame: this.frameCounter,
          isReady: readyFrame > 0 && this.frameCounter >= readyFrame,
        });
      }
    }

    return results;
  }

  /**
   * Get the fog of war grid dimensions and raw visibility data for a side.
   * Returns null if no fog grid is active.
   * Data is a Uint8Array where each byte is: 0=SHROUDED, 1=FOGGED, 2=CLEAR.
   * Row-major order: index = row * cellsWide + col.
   */
  getFogOfWarTextureData(side: string): {
    cellsWide: number;
    cellsDeep: number;
    cellSize: number;
    data: Uint8Array;
  } | null {
    const grid = this.fogOfWarGrid;
    if (!grid) return null;

    const playerIdx = this.sidePlayerIndex.get(this.normalizeSide(side));
    if (playerIdx === undefined) return null;

    const cellsWide = grid.cellsWide;
    const cellsDeep = grid.cellsDeep;
    const data = new Uint8Array(cellsWide * cellsDeep);
    const cellSize = grid.cellSize;

    for (let row = 0; row < cellsDeep; row++) {
      for (let col = 0; col < cellsWide; col++) {
        const worldX = (col + 0.5) * cellSize;
        const worldZ = (row + 0.5) * cellSize;
        data[row * cellsWide + col] = grid.getCellVisibility(playerIdx, worldX, worldZ);
      }
    }

    return { cellsWide, cellsDeep, cellSize, data };
  }

  /**
   * Create the context object for special power effect execution.
   */
  private createSpecialPowerEffectContext(): SpecialPowerEffectContext<MapEntity> {
    return {
      spawnedEntities: this.spawnedEntities,
      applyDamage: (sourceEntityId, target, amount, damageType) => {
        this.applyWeaponDamageAmount(sourceEntityId, target, amount, damageType);
      },
      healEntity: (target, amount) => {
        if (target.destroyed || amount <= 0) {
          return;
        }
        target.health = Math.min(target.maxHealth, target.health + amount);
      },
      depositCredits: (side, amount) => {
        depositSideCreditsImpl(this.sideCredits, this.normalizeSide(side), amount);
      },
      withdrawCredits: (side, amount) => {
        return withdrawSideCreditsImpl(this.sideCredits, this.normalizeSide(side), amount);
      },
      changeEntitySide: (entityId, newSide) => {
        this.captureEntity(entityId, newSide);
      },
      destroyEntity: (entityId, attackerId) => {
        this.markEntityDestroyed(entityId, attackerId);
      },
      getRelationship: (sideA, sideB) => {
        return this.getTeamRelationshipBySides(sideA, sideB);
      },
      revealFogOfWar: (side, worldX, worldZ, radius) => {
        const grid = this.fogOfWarGrid;
        if (!grid) {
          return;
        }
        const playerIdx = this.resolvePlayerIndexForSide(side);
        if (playerIdx < 0) {
          return;
        }
        grid.addLooker(playerIdx, worldX, worldZ, radius);
      },
      normalizeSide: (side) => this.normalizeSide(side),
    };
  }

  /**
   * Source parity: SupplyTruckAIUpdate / SupplyWarehouseDockUpdate / SupplyCenterDockUpdate
   * Runs the supply truck AI state machine for all trucks each frame.
   */
  private updateSupplyChain(): void {
    const supplyChainContext: SupplyChainContext<MapEntity> = {
      frameCounter: this.frameCounter,
      spawnedEntities: this.spawnedEntities,
      supplyBoxValue: DEFAULT_SUPPLY_BOX_VALUE,
      getWarehouseProfile: (entity: MapEntity) => entity.supplyWarehouseProfile,
      getTruckProfile: (entity: MapEntity) => entity.supplyTruckProfile,
      isSupplyCenter: (entity: MapEntity) => entity.isSupplyCenter,
      getWarehouseState: (entityId: number) => this.supplyWarehouseStates.get(entityId),
      setWarehouseState: (entityId: number, state: SupplyWarehouseState) => {
        this.supplyWarehouseStates.set(entityId, state);
      },
      getTruckState: (entityId: number) => this.supplyTruckStates.get(entityId),
      setTruckState: (entityId: number, state: SupplyTruckState) => {
        this.supplyTruckStates.set(entityId, state);
      },
      depositCredits: (side: string, amount: number) => {
        this.depositSideCredits(side, amount);
      },
      moveEntityTo: (entityId: number, targetX: number, targetZ: number) => {
        this.submitCommand({ type: 'moveTo', entityId, targetX, targetZ });
      },
      destroyEntity: (entityId: number) => {
        this.markEntityDestroyed(entityId, -1);
      },
      normalizeSide: (side: string | undefined) => this.normalizeSide(side),
    };

    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed) {
        continue;
      }
      if (entity.supplyTruckProfile) {
        updateSupplyTruckImpl(entity, entity.supplyTruckProfile, supplyChainContext);
      }
    }
  }

  /**
   * Enable skirmish AI for a side.
   * Source parity: AIPlayer is created when map starts with AI players.
   */
  enableSkirmishAI(side: string): void {
    const normalizedSide = this.normalizeSide(side);
    if (!normalizedSide || this.skirmishAIStates.has(normalizedSide)) {
      return;
    }

    const aiState = createSkirmishAIStateImpl(normalizedSide);
    this.skirmishAIStates.set(normalizedSide, aiState);
  }

  /**
   * Disable skirmish AI for a side.
   */
  disableSkirmishAI(side: string): void {
    this.skirmishAIStates.delete(this.normalizeSide(side));
  }

  private updateSkirmishAI(): void {
    if (this.skirmishAIStates.size === 0) {
      return;
    }

    const aiContext: SkirmishAIContext<MapEntity> = {
      frameCounter: this.frameCounter,
      spawnedEntities: this.spawnedEntities,
      getSideCredits: (side: string) => this.getSideCredits(side),
      submitCommand: (command) => this.submitCommand(command),
      getRelationship: (sideA: string, sideB: string) =>
        this.getTeamRelationshipBySides(sideA, sideB),
      normalizeSide: (side) => this.normalizeSide(side),
      hasProductionQueue: (entity: MapEntity) => entity.productionProfile !== null,
      isProducing: (entity: MapEntity) => entity.productionQueue.length > 0,
      getProducibleUnits: (entity: MapEntity) => {
        // Return template names this entity can produce based on its production profile.
        // For now, derive from INI data or return empty.
        if (!entity.productionProfile) {
          return [];
        }
        return entity.productionProfile.quantityModifiers.map(qm => qm.templateName);
      },
      getWorldDimensions: () => {
        const hm = this.mapHeightmap;
        return hm ? { width: hm.worldWidth, depth: hm.worldDepth } : null;
      },
      getDozers: (side: string) => {
        const normalizedSide = this.normalizeSide(side);
        const result: MapEntity[] = [];
        for (const entity of this.spawnedEntities.values()) {
          if (entity.destroyed) continue;
          if (this.normalizeSide(entity.side) !== normalizedSide) continue;
          if (entity.templateName.toUpperCase().includes('DOZER')
            || entity.templateName.toUpperCase().includes('WORKER')) {
            result.push(entity);
          }
        }
        return result;
      },
      getBuildableStructures: (entity: MapEntity) => {
        if (!entity.productionProfile) return [];
        return entity.productionProfile.quantityModifiers
          .filter(qm => {
            const upper = qm.templateName.toUpperCase();
            return !upper.includes('UPGRADE') && !upper.includes('SCIENCE');
          })
          .map(qm => qm.templateName);
      },
      isDozerBusy: (entity: MapEntity) => {
        return entity.moving || entity.productionQueue.length > 0;
      },
      getSidePowerBalance: (side: string) => {
        const ps = this.getSidePowerState(side);
        return ps.energyProduction - ps.energyConsumption + ps.powerBonus;
      },
    };

    for (const aiState of this.skirmishAIStates.values()) {
      updateSkirmishAIImpl(aiState, aiContext);
    }
  }

  private updateSellingEntities(): void {
    for (const [entityId, sellState] of this.sellingEntities.entries()) {
      const entity = this.spawnedEntities.get(entityId);
      if (!entity || entity.destroyed) {
        this.sellingEntities.delete(entityId);
        continue;
      }

      if (this.frameCounter - sellState.sellFrame >= SOURCE_FRAMES_TO_ALLOW_SCAFFOLD) {
        sellState.constructionPercent -= (100.0 / SOURCE_TOTAL_FRAMES_TO_SELL_OBJECT);
      }

      if (sellState.constructionPercent <= -50.0) {
        this.depositSideCredits(entity.side, this.resolveSellRefundAmount(entity));
        this.markEntityDestroyed(entity.id, -1);
        this.sellingEntities.delete(entityId);
      }
    }
  }

  private resolveSellRefundAmount(entity: MapEntity): number {
    const objectDef = this.resolveObjectDefByTemplateName(entity.templateName);
    if (!objectDef) {
      return 0;
    }

    const refundValue = readNumericField(objectDef.fields, ['RefundValue']) ?? 0;
    if (refundValue > 0) {
      return Math.max(0, Math.trunc(refundValue));
    }

    // Source parity subset: BuildAssistant::update() uses GlobalData::m_sellPercentage.
    const cost = this.resolveObjectBuildCost(objectDef, entity.side ?? '');
    const sellPercentage = this.config.sellPercentage;
    return Math.max(0, Math.trunc(cost * (sellPercentage >= 0 ? sellPercentage : SOURCE_DEFAULT_SELL_PERCENTAGE)));
  }

  private resolveConstructPlacementPositions(
    command: ConstructBuildingCommand,
    objectDef: ObjectDef,
  ): Array<readonly [number, number, number]> {
    const startX = command.targetPosition[0];
    const startZ = command.targetPosition[2];
    const startY = this.resolveGroundHeight(startX, startZ);

    const kindOf = this.normalizeKindOf(objectDef.kindOf);
    if (!command.lineEndPosition || !kindOf.has('LINEBUILD')) {
      return [[startX, startY, startZ]];
    }

    const endX = command.lineEndPosition[0];
    const endZ = command.lineEndPosition[2];
    const deltaX = endX - startX;
    const deltaZ = endZ - startZ;
    const length = Math.hypot(deltaX, deltaZ);
    if (length <= 0) {
      return [[startX, startY, startZ]];
    }

    const majorRadius = this.resolveObjectDefMajorRadius(objectDef);
    const tileSize = majorRadius > 0 ? majorRadius * 2 : MAP_XY_FACTOR;
    const directionX = deltaX / length;
    const directionZ = deltaZ / length;
    const tilesNeeded = Math.max(1, Math.trunc(length / tileSize) + 1);
    const positions: Array<readonly [number, number, number]> = [];
    for (let index = 0; index < tilesNeeded; index += 1) {
      const distance = Math.min(length, index * tileSize);
      const x = startX + directionX * distance;
      const z = startZ + directionZ * distance;
      const y = this.resolveGroundHeight(x, z);
      positions.push([x, y, z]);
    }

    return positions;
  }

  private resolveObjectDefMajorRadius(objectDef: ObjectDef): number {
    const obstacleGeometry = this.resolveObstacleGeometry(objectDef);
    if (obstacleGeometry && obstacleGeometry.majorRadius > 0) {
      return obstacleGeometry.majorRadius;
    }
    return MAP_XY_FACTOR / 2;
  }

  private spawnConstructedObject(
    constructor: MapEntity,
    objectDef: ObjectDef,
    worldPosition: readonly [number, number, number],
    angle: number,
  ): MapEntity | null {
    const registry = this.iniDataRegistry;
    if (!registry) {
      return null;
    }

    const mapObject: MapObjectJSON = {
      templateName: objectDef.name,
      angle: THREE.MathUtils.radToDeg(angle),
      flags: 0,
      position: {
        x: worldPosition[0],
        y: worldPosition[2],
        z: worldPosition[1] - this.resolveGroundHeight(worldPosition[0], worldPosition[2]),
      },
      properties: {},
    };

    const created = this.createMapEntity(mapObject, objectDef, registry, this.mapHeightmap);
    if (constructor.side !== undefined) {
      created.side = constructor.side;
    }
    created.controllingPlayerToken = constructor.controllingPlayerToken;
    this.spawnedEntities.set(created.id, created);
    this.registerEntityEnergy(created);

    // Source parity: Eva CONSTRUCTION_COMPLETE fires when dozer finishes placing a structure.
    if (created.side) {
      this.emitEvaEvent('CONSTRUCTION_COMPLETE', created.side, 'own', created.id, objectDef.name);
    }

    return created;
  }

  private resolveObjectDefByTemplateName(templateName: string): ObjectDef | null {
    const registry = this.iniDataRegistry;
    if (!registry) {
      return null;
    }
    return findObjectDefByName(registry, templateName) ?? null;
  }

  private hasBehaviorModuleType(objectDef: ObjectDef, moduleTypeName: string): boolean {
    const normalizedModuleType = moduleTypeName.trim().toUpperCase();
    if (!normalizedModuleType) {
      return false;
    }

    let found = false;
    const visitBlock = (block: IniBlock): void => {
      if (found) {
        return;
      }
      if (block.type.toUpperCase() === 'BEHAVIOR') {
        const moduleType = block.name.split(/\s+/)[0]?.toUpperCase() ?? '';
        if (moduleType === normalizedModuleType) {
          found = true;
          return;
        }
      }
      for (const child of block.blocks) {
        visitBlock(child);
      }
    };

    for (const block of objectDef.blocks) {
      visitBlock(block);
    }
    return found;
  }

  private resolveBeaconTemplateNameForSide(side: string): string | null {
    const normalizedSide = this.normalizeSide(side);
    const registry = this.iniDataRegistry;
    if (!normalizedSide || !registry) {
      return null;
    }

    const matchingFactions = Array.from(registry.factions.values())
      .filter((faction) => this.normalizeSide(faction.side ?? '') === normalizedSide)
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const faction of matchingFactions) {
      const beaconTemplateName = readStringField(faction.fields, ['BeaconName']);
      if (beaconTemplateName && beaconTemplateName.toUpperCase() !== 'NONE') {
        return beaconTemplateName;
      }
    }

    return null;
  }

  private isBeaconEntity(entity: MapEntity): boolean {
    const entitySide = this.normalizeSide(entity.side);
    if (entitySide) {
      const beaconTemplateName = this.resolveBeaconTemplateNameForSide(entitySide);
      if (beaconTemplateName && this.areEquivalentTemplateNames(entity.templateName, beaconTemplateName)) {
        return true;
      }
    }
    return this.resolveEntityKindOfSet(entity).has('BEACON');
  }

  private resolveGroundHeight(worldX: number, worldZ: number): number {
    if (!this.mapHeightmap) {
      return 0;
    }
    return this.mapHeightmap.getInterpolatedHeight(worldX, worldZ);
  }

  private resolveEntityMajorRadius(entity: MapEntity): number {
    if (entity.obstacleGeometry && entity.obstacleGeometry.majorRadius > 0) {
      return entity.obstacleGeometry.majorRadius;
    }
    if (entity.pathDiameter > 0) {
      return (entity.pathDiameter * MAP_XY_FACTOR) / 2;
    }
    return MAP_XY_FACTOR / 2;
  }

  private clampWorldPositionToMapBounds(worldX: number, worldZ: number): [number, number] {
    if (!this.mapHeightmap) {
      return [worldX, worldZ];
    }

    const maxWorldX = Math.max(0, this.mapHeightmap.worldWidth - 0.0001);
    const maxWorldZ = Math.max(0, this.mapHeightmap.worldDepth - 0.0001);
    return [
      clamp(worldX, 0, maxWorldX),
      clamp(worldZ, 0, maxWorldZ),
    ];
  }

  private resolveEntityInteractionDistance(source: MapEntity, target: MapEntity): number {
    const sourceRadius = this.resolveEntityMajorRadius(source);
    const targetRadius = this.resolveEntityMajorRadius(target);
    const combined = sourceRadius + targetRadius;
    return combined > 0 ? combined : MAP_XY_FACTOR;
  }

  private isEntityContained(entity: MapEntity): boolean {
    return entity.parkingSpaceProducerId !== null || entity.helixCarrierId !== null || entity.garrisonContainerId !== null;
  }

  private collectContainedEntityIds(containerId: number): number[] {
    const entityIds = new Set<number>();
    const container = this.spawnedEntities.get(containerId);
    if (container?.parkingPlaceProfile) {
      for (const entityId of container.parkingPlaceProfile.occupiedSpaceEntityIds.values()) {
        entityIds.add(entityId);
      }
    }

    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed) {
        continue;
      }
      if (
        entity.parkingSpaceProducerId === containerId
        || entity.helixCarrierId === containerId
        || entity.garrisonContainerId === containerId
      ) {
        entityIds.add(entity.id);
      }
    }

    return Array.from(entityIds.values()).sort((left, right) => left - right);
  }

  private countContainedRappellers(containerId: number): number {
    let count = 0;
    for (const passengerId of this.collectContainedEntityIds(containerId)) {
      const passenger = this.spawnedEntities.get(passengerId);
      if (!passenger || passenger.destroyed) {
        continue;
      }
      if (this.resolveEntityKindOfSet(passenger).has('CAN_RAPPEL')) {
        count += 1;
      }
    }
    return count;
  }

  private releaseEntityFromContainer(entity: MapEntity): void {
    if (entity.parkingSpaceProducerId !== null) {
      const parkingProducer = this.spawnedEntities.get(entity.parkingSpaceProducerId);
      if (parkingProducer?.parkingPlaceProfile) {
        parkingProducer.parkingPlaceProfile.occupiedSpaceEntityIds.delete(entity.id);
      }
      entity.parkingSpaceProducerId = null;
    }

    if (entity.helixCarrierId !== null) {
      const helixCarrier = this.spawnedEntities.get(entity.helixCarrierId);
      if (helixCarrier?.helixPortableRiderId === entity.id) {
        helixCarrier.helixPortableRiderId = null;
      }
      entity.helixCarrierId = null;
    }

    if (entity.garrisonContainerId !== null) {
      entity.garrisonContainerId = null;
      entity.canMove = true;
    }
  }

  private evacuateContainedEntities(
    container: MapEntity,
    targetX: number,
    targetZ: number,
    targetObjectId: number | null,
  ): void {
    const passengerIds = this.collectContainedEntityIds(container.id);
    if (passengerIds.length === 0) {
      return;
    }

    const target = targetObjectId !== null ? this.spawnedEntities.get(targetObjectId) : null;
    for (const passengerId of passengerIds) {
      const passenger = this.spawnedEntities.get(passengerId);
      if (!passenger || passenger.destroyed) {
        continue;
      }

      this.releaseEntityFromContainer(passenger);
      passenger.x = container.x;
      passenger.z = container.z;
      passenger.y = this.resolveGroundHeight(passenger.x, passenger.z) + passenger.baseHeight;
      this.updatePathfindPosCell(passenger);

      if (
        target
        && !target.destroyed
        && this.getTeamRelationship(passenger, target) === RELATIONSHIP_ENEMIES
      ) {
        this.issueAttackEntity(passenger.id, target.id, 'PLAYER');
        if (passenger.attackTargetEntityId === null && passenger.canMove) {
          this.issueMoveTo(passenger.id, targetX, targetZ);
        }
      } else if (passenger.canMove) {
        this.issueMoveTo(passenger.id, targetX, targetZ);
      }
    }
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
    const unitDef = findObjectDefByName(registry, unitTemplateName);
    if (!unitDef) {
      return false;
    }

    const producerSide = this.resolveEntityOwnerSide(producer);
    if (!producerSide) {
      return false;
    }
    if (this.isEntityScriptFactoryDisabled(producer)) {
      return false;
    }

    if (!this.canSideBuildUnitTemplate(producerSide, unitDef)) {
      return false;
    }
    if (!this.canEntityIssueBuildCommandForTemplate(producer, unitDef.name, ['UNIT_BUILD', 'DOZER_CONSTRUCT'])) {
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

    // Source parity subset: build-cost modifiers from COSTMODIFIERUPGRADE are applied,
    // while full player handicap/faction cost tables are still pending ownership porting.
    const buildCost = this.resolveObjectBuildCost(unitDef, producerSide);
    if (buildCost > this.getSideCredits(producerSide)) {
      this.emitEvaEvent('INSUFFICIENT_FUNDS', producerSide, 'own');
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
      this.depositSideCredits(producerSide, buildCost);
      return false;
    }

    return true;
  }

  private isEntityScriptFactoryDisabled(entity: MapEntity): boolean {
    return this.entityHasObjectStatus(entity, 'SCRIPT_DISABLED')
      || this.entityHasObjectStatus(entity, 'SCRIPT_UNPOWERED');
  }

  private canEntityIssueBuildCommandForTemplate(
    producer: MapEntity,
    templateName: string,
    allowedCommandTypes: readonly string[],
  ): boolean {
    const registry = this.iniDataRegistry;
    if (!registry) {
      return false;
    }

    // Source parity: BuildAssistant::isPossibleToMakeUnit scans the producer command set
    // for matching UNIT_BUILD/DOZER_CONSTRUCT buttons. Keep permissive fallback while
    // command-set data is absent in narrow tests.
    if (registry.commandSets.size === 0 || registry.commandButtons.size === 0) {
      return true;
    }

    const producerObjectDef = findObjectDefByName(registry, producer.templateName);
    if (!producerObjectDef) {
      return false;
    }
    const commandSetName = this.resolveEntityCommandSetName(producer, producerObjectDef);
    if (!commandSetName) {
      return false;
    }
    const commandSetDef = findCommandSetDefByName(registry, commandSetName);
    if (!commandSetDef) {
      return false;
    }

    const normalizedAllowedTypes = new Set<string>();
    for (const commandType of allowedCommandTypes) {
      normalizedAllowedTypes.add(this.normalizeCommandTypeNameForBuildCheck(commandType));
    }

    for (let buttonSlot = 1; buttonSlot <= 12; buttonSlot += 1) {
      const commandButtonName = readStringField(commandSetDef.fields, [String(buttonSlot)]);
      if (!commandButtonName) {
        continue;
      }

      const commandButtonDef = findCommandButtonDefByName(registry, commandButtonName);
      if (!commandButtonDef) {
        continue;
      }

      const buttonCommandType = this.normalizeCommandTypeNameForBuildCheck(
        commandButtonDef.commandTypeName
        ?? readStringField(commandButtonDef.fields, ['Command'])
        ?? '',
      );
      if (!normalizedAllowedTypes.has(buttonCommandType)) {
        continue;
      }

      const buttonTemplateName = readStringField(commandButtonDef.fields, ['Object'])
        ?? readStringField(commandButtonDef.fields, ['ThingTemplate']);
      if (!buttonTemplateName) {
        continue;
      }

      if (this.areEquivalentTemplateNames(buttonTemplateName, templateName)) {
        return true;
      }
    }

    return false;
  }

  private normalizeCommandTypeNameForBuildCheck(commandTypeName: string): string {
    const normalized = commandTypeName.trim().toUpperCase();
    if (!normalized) {
      return '';
    }
    if (normalized.startsWith('GUI_COMMAND_')) {
      return normalized.slice('GUI_COMMAND_'.length);
    }
    return normalized;
  }

  private hasAvailableParkingSpaceFor(producer: MapEntity, unitDef: ObjectDef): boolean {
    if (!this.shouldReserveParkingDoorWhenQueued(unitDef)) {
      return true;
    }

    return hasAvailableParkingSpaceImpl(
      producer.parkingPlaceProfile,
      producer.productionQueue,
      this.spawnedEntities,
    );
  }

  private shouldReserveParkingDoorWhenQueued(unitDef: ObjectDef): boolean {
    return shouldReserveParkingDoorWhenQueuedImpl(unitDef.kindOf);
  }

  private reserveParkingDoorForQueuedUnit(
    producer: MapEntity,
    unitDef: ObjectDef,
    productionId: number,
  ): boolean {
    if (!this.shouldReserveParkingDoorWhenQueued(unitDef)) {
      return true;
    }

    return reserveParkingDoorForQueuedUnitImpl(
      producer.parkingPlaceProfile,
      producer.productionQueue,
      this.spawnedEntities,
      productionId,
    );
  }

  private releaseParkingDoorReservationForProduction(producer: MapEntity, productionId: number): void {
    releaseParkingDoorReservationForProductionImpl(producer.parkingPlaceProfile, productionId);
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
    return resolveBuildableStatusImpl(objectDef, (value) => this.extractIniValueTokens(value));
  }

  private extractProductionPrerequisiteGroups(objectDef: ObjectDef): ProductionPrerequisiteGroup[] {
    return extractProductionPrerequisiteGroupsImpl(objectDef, (value) => this.extractIniValueTokens(value));
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
      const producerSide = this.resolveEntityOwnerSide(producer);
      if (removed.type === 'UNIT') {
        this.releaseParkingDoorReservationForProduction(producer, removed.productionId);
      }
      if (producerSide && removed.type === 'UPGRADE' && removed.upgradeType === 'PLAYER') {
        this.setSideUpgradeInProduction(producerSide, removed.upgradeName, false);
      }
      const refunded = removed.buildCost;
      if (producerSide) {
        this.depositSideCredits(producerSide, refunded);
      }
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
    const upgradeDef = findUpgradeDefByName(registry, upgradeName);
    if (!upgradeDef) {
      return false;
    }

    const normalizedUpgradeName = upgradeDef.name.trim().toUpperCase();
    if (!normalizedUpgradeName || normalizedUpgradeName === 'NONE') {
      return false;
    }

    const producerSide = this.resolveEntityOwnerSide(producer);
    if (!producerSide) {
      return false;
    }

    const upgradeType = resolveUpgradeType(upgradeDef);
    const producerObjectDef = findObjectDefByName(registry, producer.templateName);
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
      const canTriggerCommandSetUpgrade = this.canUpgradeTriggerCommandSetForEntity(producer, normalizedUpgradeName);
      if (
        !this.canEntityProduceUpgrade(producer, upgradeDef)
        && !canTriggerCommandSetUpgrade
      ) {
        return false;
      }

      if (
        !canTriggerCommandSetUpgrade
        && !this.isEntityAffectedByUpgrade(producer, normalizedUpgradeName)
      ) {
        return false;
      }
      if (producer.completedUpgrades.has(normalizedUpgradeName)) {
        return false;
      }
    }

    const buildCost = resolveUpgradeBuildCost(upgradeDef);
    if (!this.canAffordUpgrade(producerSide, buildCost)) {
      this.emitEvaEvent('INSUFFICIENT_FUNDS', producerSide, 'own');
      return false;
    }
    const withdrawn = this.withdrawSideCredits(producerSide, buildCost);
    if (withdrawn < buildCost) {
      return false;
    }

    const totalProductionFrames = resolveUpgradeBuildTimeFrames(upgradeDef, LOGIC_FRAME_RATE);
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
    return canAffordSideCreditsImpl(this.sideCredits, normalizedSide, buildCost);
  }

  private canEntityProduceUpgrade(
    producer: MapEntity,
    upgradeDef: UpgradeDef,
  ): boolean {
    const registry = this.iniDataRegistry;
    if (!registry) {
      return false;
    }

    const producerObjectDef = findObjectDefByName(registry, producer.templateName);
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

    const commandSetDef = findCommandSetDefByName(registry, commandSetName);
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

      const commandButtonDef = findCommandButtonDefByName(registry, commandButtonName);
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

    const producerSide = this.resolveEntityOwnerSide(producer);
    if (producerSide && removed.upgradeType === 'PLAYER') {
      this.setSideUpgradeInProduction(producerSide, removed.upgradeName, false);
    }
    if (producerSide) {
      this.depositSideCredits(producerSide, removed.buildCost);
    }
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
    return resolveMaxSimultaneousOfTypeImpl(objectDef);
  }

  private isStructureObjectDef(objectDef: ObjectDef): boolean {
    return isStructureObjectDefImpl(objectDef);
  }

  private doesTemplateMatchMaxSimultaneousType(targetObjectDef: ObjectDef, candidateTemplateName: string): boolean {
    const registry = this.iniDataRegistry;
    return doesTemplateMatchMaxSimultaneousTypeImpl(
      targetObjectDef,
      candidateTemplateName,
      (leftTemplateName, rightTemplateName) => this.areEquivalentTemplateNames(leftTemplateName, rightTemplateName),
      (templateName) => (registry ? findObjectDefByName(registry, templateName) : undefined),
    );
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

  private areEquivalentTemplateNames(leftTemplateName: string, rightTemplateName: string): boolean {
    const registry = this.iniDataRegistry;
    return areEquivalentTemplateNamesImpl(
      leftTemplateName,
      rightTemplateName,
      (templateName) => (registry ? findObjectDefByName(registry, templateName) : undefined),
      (value) => this.extractIniValueTokens(value),
    );
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
    return resolveProductionQuantityImpl(
      producer.productionProfile?.quantityModifiers,
      templateName,
      (leftTemplateName, rightTemplateName) => this.areEquivalentTemplateNames(leftTemplateName, rightTemplateName),
    );
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

      // Source parity: ThingTemplate::calcTimeToBuild — low power slows production.
      let productionRate = 1;
      const producerSide = this.normalizeSide(producer.side);
      if (producerSide) {
        const powerState = this.getSidePowerStateMap(producerSide);
        const totalProd = powerState.energyProduction + powerState.powerBonus;
        if (powerState.energyConsumption > 0 && totalProd < powerState.energyConsumption) {
          const energyPercent = totalProd / powerState.energyConsumption;
          const energyShort = Math.min(1, 1 - energyPercent);
          // m_LowEnergyPenaltyModifier = 0.4 from GlobalData
          productionRate = Math.max(0.2, 1 - energyShort * 0.4);
        }
      }
      production.framesUnderConstruction += productionRate;
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
    tickQueueExitGateImpl(producer);
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

    const unitDef = findObjectDefByName(registry, production.templateName);
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
    const producerSide = this.resolveEntityOwnerSide(producer);
    if (production.upgradeType === 'PLAYER') {
      if (!producerSide) {
        this.removeProductionEntry(producer, production.productionId);
        return;
      }
      this.setSideUpgradeInProduction(producerSide, production.upgradeName, false);
      this.setSideUpgradeCompleted(producerSide, production.upgradeName, true);
      this.applyCompletedPlayerUpgrade(producerSide, production.upgradeName);
    } else {
      this.applyUpgradeToEntity(producer.id, production.upgradeName);
    }

    // Source parity: Eva UPGRADE_COMPLETE fires when an upgrade finishes research.
    const upgradeSide = producerSide ?? producer.side;
    if (upgradeSide) {
      this.emitEvaEvent('UPGRADE_COMPLETE', upgradeSide, 'own', producer.id, production.upgradeName);
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
      const upgradeDef = findUpgradeDefByName(registry, normalizedUpgradeName);
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
    if (!this.shouldReserveParkingDoorWhenQueued(unitDef)) {
      return true;
    }

    return canExitProducedUnitViaParkingImpl(
      producer.parkingPlaceProfile,
      producer.productionQueue,
      this.spawnedEntities,
      productionId,
    );
  }

  /**
   * Spawn a new entity from a template name at the given world position.
   * Used by pilot eject and OCL pipeline.
   */
  private spawnEntityFromTemplate(
    templateName: string,
    worldX: number,
    worldZ: number,
    rotationY: number,
    side?: string,
  ): MapEntity | null {
    const registry = this.iniDataRegistry;
    if (!registry) return null;
    const objectDef = findObjectDefByName(registry, templateName);
    if (!objectDef) return null;

    const mapObject: MapObjectJSON = {
      templateName: objectDef.name,
      angle: THREE.MathUtils.radToDeg(rotationY),
      flags: 0,
      position: { x: worldX, y: worldZ, z: 0 },
      properties: {},
    };
    const entity = this.createMapEntity(mapObject, objectDef, registry, this.mapHeightmap);
    if (side !== undefined) {
      entity.side = side;
    }
    // Inherit controlling player from side.
    if (side) {
      entity.controllingPlayerToken = this.normalizeControllingPlayerToken(side);
    }
    this.spawnedEntities.set(entity.id, entity);
    this.registerEntityEnergy(entity);
    // Snap to terrain.
    if (this.mapHeightmap) {
      entity.y = this.mapHeightmap.getInterpolatedHeight(worldX, worldZ) ?? 0;
    }
    return entity;
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
      angle: THREE.MathUtils.radToDeg(producer.rotationY),
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
    }
    created.controllingPlayerToken = producer.controllingPlayerToken;

    if (!this.reserveParkingSpaceForProducedUnit(producer, created, unitDef, productionId)) {
      return null;
    }

    this.spawnedEntities.set(created.id, created);
    this.registerEntityEnergy(created);
    this.applyQueueProductionNaturalRallyPoint(producer, created);

    // Source parity: Eva UNIT_READY fires when a unit exits the production queue.
    if (created.side) {
      this.emitEvaEvent('UNIT_READY', created.side, 'own', created.id, unitDef.name);
    }

    return created;
  }

  private reserveParkingSpaceForProducedUnit(
    producer: MapEntity,
    producedUnit: MapEntity,
    producedUnitDef: ObjectDef,
    productionId: number,
  ): boolean {
    if (!this.shouldReserveParkingDoorWhenQueued(producedUnitDef)) {
      return true;
    }

    if (!reserveParkingSpaceForProducedUnitImpl(
      producer.parkingPlaceProfile,
      producer.productionQueue,
      this.spawnedEntities,
      productionId,
      producedUnit.id,
    )) {
      return false;
    }

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
    return resolveQueueSpawnLocationImpl(producer, this.mapHeightmap);
  }

  private applyQueueProductionNaturalRallyPoint(producer: MapEntity, producedUnit: MapEntity): void {
    const rallyPoint = resolveQueueProductionNaturalRallyPointImpl(
      producer,
      producedUnit.canMove,
      MAP_XY_FACTOR,
    );
    if (!rallyPoint) {
      return;
    }
    this.issueMoveTo(producedUnit.id, rallyPoint.x, rallyPoint.z);
  }

  private withdrawSideCredits(side: string | undefined, amount: number): number {
    const normalizedSide = this.normalizeSide(side);
    return withdrawSideCreditsImpl(this.sideCredits, normalizedSide, amount);
  }

  private depositSideCredits(side: string | undefined, amount: number): void {
    const normalizedSide = this.normalizeSide(side);
    depositSideCreditsImpl(this.sideCredits, normalizedSide, amount);
  }

  private issueMoveTo(
    entityId: number,
    targetX: number,
    targetZ: number,
    attackDistance = NO_ATTACK_DISTANCE,
    allowNoPathMove = false,
  ): void {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity || !entity.canMove) return;
    // Source parity: Object::isMobile — KINDOF_IMMOBILE or DISABLED_HELD blocks movement.
    if (entity.isImmobile || this.entityHasObjectStatus(entity, 'DISABLED_HELD')) {
      return;
    }

    this.updatePathfindPosCell(entity);
    const path = this.findPath(entity.x, entity.z, targetX, targetZ, entity, attackDistance);
    if (path.length === 0) {
      if (allowNoPathMove) {
        entity.moving = true;
        entity.movePath = [{ x: targetX, z: targetZ }];
        entity.pathIndex = 0;
        entity.moveTarget = { x: targetX, z: targetZ };
        entity.pathfindGoalCell = {
          x: Math.floor(targetX / PATHFIND_CELL_SIZE),
          z: Math.floor(targetZ / PATHFIND_CELL_SIZE),
        };
        return;
      }

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
      x: target.x,
      z: target.z,
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

    this.issueMoveTo(attacker.id, target.x, target.z, attackRange);
  }

  private issueFireWeapon(
    entityId: number,
    weaponSlot: number,
    maxShotsToFire: number,
    targetObjectId: number | null,
    targetPosition: readonly [number, number, number] | null,
  ): void {
    const attacker = this.spawnedEntities.get(entityId);
    if (!attacker || attacker.destroyed) {
      return;
    }

    const normalizedWeaponSlot = this.normalizeWeaponSlot(Math.trunc(weaponSlot));
    if (normalizedWeaponSlot === null) {
      return;
    }
    attacker.forcedWeaponSlot = normalizedWeaponSlot;
    this.refreshEntityCombatProfiles(attacker);

    const weapon = attacker.attackWeapon;
    if (!weapon || weapon.primaryDamage <= 0) {
      return;
    }

    this.setEntityIgnoringStealthStatus(attacker, weapon.continueAttackRange > 0);
    attacker.attackCommandSource = 'PLAYER';
    attacker.attackTargetEntityId = null;
    attacker.attackOriginalVictimPosition = null;
    attacker.attackTargetPosition = null;
    attacker.preAttackFinishFrame = 0;

    // Source parity: MSG_DO_WEAPON sets a temporary weapon lock and shot counter.
    attacker.weaponLockStatus = 'LOCKED_TEMPORARILY';
    attacker.maxShotsRemaining = maxShotsToFire > 0 ? maxShotsToFire : 0;
    if (maxShotsToFire <= 0) {
      return;
    }

    if (targetObjectId !== null) {
      this.issueAttackEntity(entityId, targetObjectId, 'PLAYER');
      return;
    }

    if (targetPosition === null) {
      return;
    }

    const [targetX, , targetZ] = targetPosition;
    attacker.attackTargetPosition = { x: targetX, z: targetZ };

    // Source behavior for MSG_DO_WEAPON_AT_LOCATION sends a target location while some
    // commands also append an object ID for obstacle awareness. We only have positional
    // targeting here and select a victim dynamically from command-local state.
    const targetEntity = this.findFireWeaponTargetForPosition(attacker, targetX, targetZ);
    if (!targetEntity) {
      const attackRange = Math.max(0, weapon.attackRange);
      if (attacker.canMove) {
        this.issueMoveTo(entityId, targetX, targetZ, attackRange);
      }
      return;
    }
    this.issueAttackEntity(entityId, targetEntity.id, 'PLAYER');
  }

  private findFireWeaponTargetForPosition(
    attacker: MapEntity,
    targetX: number,
    targetZ: number,
  ): MapEntity | null {
    const weapon = attacker.attackWeapon;
    if (!weapon) {
      return null;
    }

    const attackRange = Math.max(0, weapon.attackRange);
    const attackRangeSqr = attackRange * attackRange;
    let bestTarget: MapEntity | null = null;
    let bestDistanceSqr = Number.POSITIVE_INFINITY;

    for (const candidate of this.spawnedEntities.values()) {
      if (!candidate.canTakeDamage || candidate.destroyed) {
        continue;
      }
      if (candidate.id === attacker.id) {
        continue;
      }
      if (!this.canAttackerTargetEntity(attacker, candidate, attacker.attackCommandSource)) {
        continue;
      }
      const dx = candidate.x - targetX;
      const dz = candidate.z - targetZ;
      const distanceSqr = dx * dx + dz * dz;
      if (distanceSqr > attackRangeSqr) {
        continue;
      }
      if (distanceSqr >= bestDistanceSqr) {
        continue;
      }
      bestTarget = candidate;
      bestDistanceSqr = distanceSqr;
    }

    return bestTarget;
  }

  private clearAttackTarget(entityId: number): void {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity) {
      return;
    }
    entity.attackTargetEntityId = null;
    entity.attackTargetPosition = null;
    entity.attackOriginalVictimPosition = null;
    entity.attackCommandSource = 'AI';
    this.setEntityIgnoringStealthStatus(entity, false);
    entity.preAttackFinishFrame = 0;
    // Source parity: releaseWeaponLock on attack exit — temporary locks are cleared.
    this.releaseTemporaryWeaponLock(entity);
  }

  /**
   * Source parity: when maxShotsToFire is exhausted during combat-update, clear
   * the attack state and release the temporary weapon lock.
   */
  private clearMaxShotsAttackState(entity: MapEntity): void {
    entity.attackTargetEntityId = null;
    entity.attackTargetPosition = null;
    entity.attackOriginalVictimPosition = null;
    entity.attackCommandSource = 'AI';
    entity.maxShotsRemaining = 0;
    this.setEntityIgnoringStealthStatus(entity, false);
    entity.preAttackFinishFrame = 0;
    this.releaseTemporaryWeaponLock(entity);
  }

  /**
   * Source parity: WeaponSet::releaseWeaponLock — temporary locks are released on
   * attack exit, new commands, or clip exhaustion. Permanent locks persist.
   */
  private releaseTemporaryWeaponLock(entity: MapEntity): void {
    if (entity.weaponLockStatus === 'LOCKED_TEMPORARILY') {
      entity.weaponLockStatus = 'NOT_LOCKED';
      entity.forcedWeaponSlot = null;
      this.refreshEntityCombatProfiles(entity);
    }
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
    updatePathfindGoalCellFromPathImpl(entity, (worldX, worldZ) => this.worldToGrid(worldX, worldZ));
  }

  private updatePathfindPosCell(entity: MapEntity): void {
    updatePathfindPosCellImpl(entity, (worldX, worldZ) => this.worldToGrid(worldX, worldZ));
  }

  private findPath(
    startX: number,
    startZ: number,
    targetX: number,
    targetZ: number,
    mover?: MapEntity,
    attackDistance = NO_ATTACK_DISTANCE,
  ): VectorXZ[] {
    return findPathImpl(
      {
        config: this.config,
        mapHeightmap: this.mapHeightmap,
        navigationGrid: this.navigationGrid,
        spawnedEntities: this.spawnedEntities,
        worldToGrid: (worldX, worldZ) => this.worldToGrid(worldX, worldZ),
        gridFromIndex: (index) => this.gridFromIndex(index),
        gridToWorld: (cellX, cellZ) => this.gridToWorld(cellX, cellZ),
        isCellInBounds: (cellX, cellZ, nav) => this.isCellInBounds(cellX, cellZ, nav ?? this.navigationGrid),
        getTeamRelationship: (sourceEntity, targetEntity) => this.getTeamRelationship(sourceEntity, targetEntity),
        canCrushOrSquish: (sourceEntity, targetEntity) => this.canCrushOrSquish(sourceEntity, targetEntity),
        relationshipAllies: RELATIONSHIP_ALLIES,
      },
      startX,
      startZ,
      targetX,
      targetZ,
      mover,
      attackDistance,
    );
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
        const [entityCellX, entityCellZ] = this.worldToGrid(entity.x, entity.z);
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
      if (((entity.bridgeFlags ?? 0) & requiredFlag) === 0) {
        continue;
      }
      if (entity.mapCellX === cellX && entity.mapCellZ === cellZ) {
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
    updateCombatImpl({
      entities: this.spawnedEntities.values(),
      frameCounter: this.frameCounter,
      constants: {
        attackMinRangeDistanceSqrFudge: ATTACK_MIN_RANGE_DISTANCE_SQR_FUDGE,
        pathfindCellSize: PATHFIND_CELL_SIZE,
      },
      findEntityById: (entityId) => this.spawnedEntities.get(entityId) ?? null,
      findFireWeaponTargetForPosition: (attacker, targetX, targetZ) =>
        this.findFireWeaponTargetForPosition(attacker, targetX, targetZ),
      canEntityAttackFromStatus: (entity) => this.canEntityAttackFromStatus(entity),
      canAttackerTargetEntity: (attacker, target, commandSource) =>
        this.canAttackerTargetEntity(attacker, target, commandSource as AttackCommandSource),
      setEntityAttackStatus: (entity, isAttacking) => this.setEntityAttackStatus(entity, isAttacking),
      setEntityAimingWeaponStatus: (entity, isAiming) => this.setEntityAimingWeaponStatus(entity, isAiming),
      setEntityFiringWeaponStatus: (entity, isFiring) => this.setEntityFiringWeaponStatus(entity, isFiring),
      setEntityIgnoringStealthStatus: (entity, isIgnoringStealth) =>
        this.setEntityIgnoringStealthStatus(entity, isIgnoringStealth),
      refreshEntitySneakyMissWindow: (entity) => this.refreshEntitySneakyMissWindow(entity),
      issueMoveTo: (entityId, targetX, targetZ, attackDistance) =>
        this.issueMoveTo(entityId, targetX, targetZ, attackDistance),
      computeAttackRetreatTarget: (attacker, target, weapon) =>
        this.computeAttackRetreatTarget(attacker, target, weapon as AttackWeaponProfile),
      rebuildEntityScatterTargets: (entity) => this.rebuildEntityScatterTargets(entity),
      resolveWeaponPreAttackDelayFrames: (attacker, target, weapon) =>
        this.resolveWeaponPreAttackDelayFrames(attacker, target, weapon as AttackWeaponProfile),
      queueWeaponDamageEvent: (attacker, target, weapon) =>
        this.queueWeaponDamageEvent(attacker, target, weapon as AttackWeaponProfile),
      recordConsecutiveAttackShot: (attacker, targetEntityId) =>
        this.recordConsecutiveAttackShot(attacker, targetEntityId),
      resolveWeaponDelayFrames: (weapon) => this.resolveWeaponDelayFrames(weapon as AttackWeaponProfile),
      resolveTargetAnchorPosition: (target) => ({
        x: (target as { mesh?: { position?: { x?: number } } }).mesh?.position?.x ?? target.x,
        z: (target as { mesh?: { position?: { z?: number } } }).mesh?.position?.z ?? target.z,
      }),
      isAttackLineOfSightBlocked: (attackerX, attackerZ, targetX, targetZ) =>
        this.isTerrainLineOfSightBlocked(attackerX, attackerZ, targetX, targetZ),
      clearMaxShotsAttackState: (attacker) =>
        this.clearMaxShotsAttackState(attacker),
    });
  }

  /**
   * Source parity: Weapon.cpp LOS check — trace a ray between two world positions
   * and check if terrain blocks line of sight. Uses heightmap sampling along the ray.
   */
  private isTerrainLineOfSightBlocked(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
  ): boolean {
    const hm = this.mapHeightmap;
    if (!hm) return false;

    const fromHeight = hm.getInterpolatedHeight(fromX, fromZ) + 1.5; // unit eye height
    const toHeight = hm.getInterpolatedHeight(toX, toZ) + 1.5;

    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1) return false;

    // Sample terrain height along the ray at ~2 world-unit intervals
    const steps = Math.min(Math.ceil(dist / 2), 100);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const sampleX = fromX + dx * t;
      const sampleZ = fromZ + dz * t;
      const terrainHeight = hm.getInterpolatedHeight(sampleX, sampleZ);
      const rayHeight = fromHeight + (toHeight - fromHeight) * t;
      if (terrainHeight > rayHeight) {
        return true;
      }
    }
    return false;
  }

  private queueWeaponDamageEvent(attacker: MapEntity, target: MapEntity, weapon: AttackWeaponProfile): void {
    const sourceX = attacker.x;
    const sourceZ = attacker.z;
    const targetX = target.x;
    const targetZ = target.z;

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
      launchFrame: this.frameCounter,
      sourceX,
      sourceY: attacker.y,
      sourceZ,
      projectileVisualId: this.nextProjectileVisualId++,
      cachedVisualType: this.classifyWeaponVisualType(weapon),
    };

    // Emit muzzle flash visual event.
    this.emitWeaponFiredVisualEvent(attacker, weapon);

    if (delivery === 'DIRECT' && delayFrames <= 0) {
      // Source parity subset: WeaponTemplate::fireWeaponTemplate() applies non-projectile
      // damage immediately when delayInFrames < 1.0f instead of queuing delayed damage.
      this.emitWeaponImpactVisualEvent(event);
      applyWeaponDamageEventImpl(this.createCombatDamageEventContext(), event);
      return;
    }

    this.pendingWeaponDamageEvents.push(event);

    // TODO(C&C source parity): port projectile-object launch/collision/countermeasure and
    // laser/scatter handling from Weapon::fireWeaponTemplate() instead of routing both
    // direct and projectile delivery through pending impact events.
  }

  private classifyWeaponVisualType(weapon: AttackWeaponProfile): import('./types.js').ProjectileVisualType {
    const name = weapon.name.toUpperCase();
    if (name.includes('MISSILE') || name.includes('ROCKET') || name.includes('PATRIOT')) return 'MISSILE';
    if (name.includes('ARTILLERY') || name.includes('CANNON') || name.includes('SHELL')
      || weapon.primaryDamageRadius > 10) return 'ARTILLERY';
    if (name.includes('LASER')) return 'LASER';
    return 'BULLET';
  }

  private emitWeaponFiredVisualEvent(attacker: MapEntity, weapon: AttackWeaponProfile): void {
    this.visualEventBuffer.push({
      type: 'WEAPON_FIRED',
      x: attacker.x,
      y: attacker.y + 1.5,
      z: attacker.z,
      radius: 0,
      sourceEntityId: attacker.id,
      projectileType: this.classifyWeaponVisualType(weapon),
    });
  }

  private emitWeaponImpactVisualEvent(event: PendingWeaponDamageEvent): void {
    const heightmap = this.mapHeightmap;
    const impactY = heightmap ? heightmap.getInterpolatedHeight(event.impactX, event.impactZ) : 0;
    this.visualEventBuffer.push({
      type: 'WEAPON_IMPACT',
      x: event.impactX,
      y: impactY,
      z: event.impactZ,
      radius: Math.max(event.weapon.primaryDamageRadius, 1),
      sourceEntityId: event.sourceEntityId,
      projectileType: this.classifyWeaponVisualType(event.weapon),
    });
  }

  private setEntityAttackStatus(entity: MapEntity, isAttacking: boolean): void {
    // TODO(C&C source parity): move IS_ATTACKING ownership from this combat-loop subset
    // to full AI state-machine enter/exit transitions (AIAttackState onEnter/onExit).
    setEntityAttackStatusImpl(entity, isAttacking);
  }

  private setEntityAimingWeaponStatus(entity: MapEntity, isAiming: boolean): void {
    // Source parity subset: AIAttackAimAtTargetState::onEnter() sets
    // OBJECT_STATUS_IS_AIMING_WEAPON and onExit() clears it.
    // TODO(C&C source parity): move this from combat-loop range checks to full
    // attack state-machine transitions (pursue/approach/aim/fire).
    setEntityAimingWeaponStatusImpl(entity, isAiming);
  }

  private setEntityFiringWeaponStatus(entity: MapEntity, isFiring: boolean): void {
    // Source parity subset: AIAttackFireWeaponState::onEnter() sets
    // OBJECT_STATUS_IS_FIRING_WEAPON and onExit() clears it.
    // TODO(C&C source parity): drive this from explicit fire-state enter/exit
    // instead of one-frame fire pulses in updateCombat().
    setEntityFiringWeaponStatusImpl(entity, isFiring);
  }

  private setEntityIgnoringStealthStatus(entity: MapEntity, isIgnoringStealth: boolean): void {
    // Source parity subset: AIAttackState::onEnter() sets OBJECT_STATUS_IGNORING_STEALTH
    // when current weapon has ContinueAttackRange > 0, and AIAttackFireWeaponState::update()
    // clears it after each fired shot.
    // TODO(C&C source parity): drive this from full attack-state enter/exit and command-source
    // flow (including attack-position mine clearing and force-attack exceptions).
    setEntityIgnoringStealthStatusImpl(entity, isIgnoringStealth);
  }

  private refreshEntitySneakyMissWindow(entity: MapEntity): void {
    // Source parity subset: JetAIUpdate::update() refreshes m_attackersMissExpireFrame while
    // OBJECT_STATUS_IS_ATTACKING is set on the object.
    refreshEntitySneakyMissWindowImpl(entity, this.frameCounter);
  }

  private entityHasSneakyTargetingOffset(entity: MapEntity): boolean {
    return entityHasSneakyTargetingOffsetImpl(entity, this.frameCounter);
  }

  private resolveEntitySneakyTargetingOffset(entity: MapEntity): VectorXZ | null {
    return resolveEntitySneakyTargetingOffsetImpl(entity, this.frameCounter, this.resolveForwardUnitVector(entity));
  }

  private resolveScaledProjectileTravelSpeed(weapon: AttackWeaponProfile, sourceToAimDistance: number): number {
    // Source parity subset: DumbProjectileBehavior::projectileFireAtObjectOrPosition()
    // scales launch speed from minimum-range to unmodified-attack-range distance.
    // TODO(C&C source parity): mirror full dumb-projectile bezier-path distance (calcFlightPath)
    // and per-projectile update/collision timing instead of straight-line travel delay.
    return resolveScaledProjectileTravelSpeedImpl(
      weapon,
      sourceToAimDistance,
      ATTACK_RANGE_CELL_EDGE_FUDGE,
    );
  }

  private resolveProjectileScatterRadiusForTarget(weapon: AttackWeaponProfile, target: MapEntity): number {
    return resolveProjectileScatterRadiusForCategoryImpl(weapon, target.category);
  }

  private createCombatDamageEventContext(): CombatDamageEventContext<
    MapEntity,
    AttackWeaponProfile,
    PendingWeaponDamageEvent
  > {
    return {
      frameCounter: this.frameCounter,
      pendingEvents: this.pendingWeaponDamageEvents,
      entitiesById: this.spawnedEntities,
      resolveForwardUnitVector: (entity) => this.resolveForwardUnitVector(entity),
      resolveProjectilePointCollisionRadius: (entity) => resolveProjectilePointCollisionRadiusImpl(entity, MAP_XY_FACTOR),
      resolveProjectileIncidentalVictimForPointImpact: (
        projectileLauncher,
        weapon,
        intendedVictimId,
        impactX,
        impactZ,
      ) => resolveProjectileIncidentalVictimForPointImpactImpl(
        this.spawnedEntities.values(),
        intendedVictimId,
        impactX,
        impactZ,
        (candidate) => resolveProjectilePointCollisionRadiusImpl(candidate, MAP_XY_FACTOR),
        (candidate) => shouldProjectileCollideWithEntityImpl(
          projectileLauncher,
          weapon,
          candidate,
          intendedVictimId,
          (launcher) => this.resolveProjectileLauncherContainer(launcher),
          (entity) => this.resolveEntityKindOfSet(entity),
          (entity, kindOf, victimId) => isAirfieldReservedForProjectileVictimImpl(
            entity,
            kindOf,
            victimId,
            (entityId) => this.spawnedEntities.get(entityId) ?? null,
          ),
          (entity) => this.entityHasSneakyTargetingOffset(entity),
          (launcher, entity) => this.getTeamRelationship(launcher, entity),
          (side) => this.normalizeSide(side),
          (entity) => this.resolveEntityFenceWidth(entity),
          { allies: RELATIONSHIP_ALLIES, enemies: RELATIONSHIP_ENEMIES },
          {
            collideAllies: WEAPON_COLLIDE_ALLIES,
            collideEnemies: WEAPON_COLLIDE_ENEMIES,
            collideControlledStructures: WEAPON_COLLIDE_CONTROLLED_STRUCTURES,
            collideStructures: WEAPON_COLLIDE_STRUCTURES,
            collideShrubbery: WEAPON_COLLIDE_SHRUBBERY,
            collideProjectile: WEAPON_COLLIDE_PROJECTILE,
            collideWalls: WEAPON_COLLIDE_WALLS,
            collideSmallMissiles: WEAPON_COLLIDE_SMALL_MISSILES,
            collideBallisticMissiles: WEAPON_COLLIDE_BALLISTIC_MISSILES,
          },
        ),
      ),
      getTeamRelationship: (attacker, target) => this.getTeamRelationship(attacker, target),
      applyWeaponDamageAmount: (sourceEntityId, target, amount, damageType) =>
        this.applyWeaponDamageAmount(sourceEntityId, target, amount, damageType),
      canEntityAttackFromStatus: (entity) => this.canEntityAttackFromStatus(entity),
      canAttackerTargetEntity: (attacker, target, commandSource) =>
        this.canAttackerTargetEntity(attacker, target, commandSource as AttackCommandSource),
      masks: {
        affectsSelf: WEAPON_AFFECTS_SELF,
        affectsAllies: WEAPON_AFFECTS_ALLIES,
        affectsEnemies: WEAPON_AFFECTS_ENEMIES,
        affectsNeutrals: WEAPON_AFFECTS_NEUTRALS,
        killsSelf: WEAPON_KILLS_SELF,
        doesntAffectSimilar: WEAPON_DOESNT_AFFECT_SIMILAR,
      },
      relationships: {
        allies: RELATIONSHIP_ALLIES,
        enemies: RELATIONSHIP_ENEMIES,
      },
      hugeDamageAmount: HUGE_DAMAGE_AMOUNT,
    };
  }

  private updatePendingWeaponDamage(): void {
    // Emit impact visual events for projectiles resolving this frame.
    for (const event of this.pendingWeaponDamageEvents) {
      if (event.executeFrame <= this.frameCounter) {
        this.emitWeaponImpactVisualEvent(event);
      }
    }
    updatePendingWeaponDamageImpl(this.createCombatDamageEventContext());
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
    const objectDef = findObjectDefByName(registry, entity.templateName);
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
    return isPassengerAllowedToFireFromContainingObjectImpl(
      entity,
      container,
      (targetEntity) => this.resolveEntityKindOfSet(targetEntity),
      (targetEntity) => this.resolveEntityContainingObject(targetEntity),
      (targetEntity, statusName) => this.entityHasObjectStatus(targetEntity, statusName),
    );
  }

  private resolveEntityFenceWidth(entity: MapEntity): number {
    const registry = this.iniDataRegistry;
    if (!registry) {
      return 0;
    }
    const objectDef = findObjectDefByName(registry, entity.templateName);
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
    // Source parity subset: FiringTracker::update() calls Object::reloadAllAmmo(TRUE),
    // forcing an immediate reload after sustained idle time.
    updateWeaponIdleAutoReloadImpl(this.spawnedEntities.values(), this.frameCounter);

    // TODO(C&C source parity): port full FiringTracker behavior
    // (continuous-fire speedup/cooldown states and looping fire-audio management).
  }

  private computeAttackRetreatTarget(
    attacker: MapEntity,
    target: MapEntity,
    weapon: AttackWeaponProfile,
  ): VectorXZ | null {
    // Source parity subset: Weapon::computeApproachTarget() retreats too-close attackers to a
    // point between minimum and maximum range.
    // TODO(C&C source parity): port angleOffset/aircraft-facing/terrain-clipping behavior.
    return computeAttackRetreatTargetImpl(attacker.x, attacker.z, target.x, target.z, weapon);
  }

  private resetEntityWeaponTimingState(entity: MapEntity): void {
    resetEntityWeaponTimingStateImpl(entity);
  }

  private rebuildEntityScatterTargets(entity: MapEntity): void {
    rebuildEntityScatterTargetsImpl(entity);
  }

  private resolveWeaponPreAttackDelayFrames(
    attacker: MapEntity,
    target: MapEntity,
    weapon: AttackWeaponProfile,
  ): number {
    return resolveWeaponPreAttackDelayFramesImpl(attacker, target.id, weapon);
  }

  private recordConsecutiveAttackShot(attacker: MapEntity, targetEntityId: number): void {
    recordConsecutiveAttackShotImpl(attacker, targetEntityId);
  }

  private resolveWeaponDelayFrames(weapon: AttackWeaponProfile): number {
    return resolveWeaponDelayFramesImpl(
      weapon,
      (minDelay, maxDelay) => this.gameRandom.nextRange(minDelay, maxDelay),
    );
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
    // Source parity: ActiveBody::attemptDamage — indestructible bodies ignore all damage.
    if (target.isIndestructible) {
      return;
    }

    const adjustedDamage = this.adjustDamageByArmorSet(target, amount, damageType);
    if (adjustedDamage <= 0) {
      return;
    }

    target.health = Math.max(0, target.health - adjustedDamage);

    // Source parity: onDamage resets heal timers for AutoHeal and BaseRegen.
    if (target.autoHealProfile && target.autoHealProfile.startHealingDelayFrames > 0) {
      target.autoHealDamageDelayUntilFrame = this.frameCounter + target.autoHealProfile.startHealingDelayFrames;
    }
    if (target.kindOf.has('STRUCTURE')) {
      target.baseRegenDelayUntilFrame = this.frameCounter + BASE_REGEN_DELAY_FRAMES;
      // Source parity: EVA — announce base under attack for important structures.
      if (target.side && target.kindOf.has('MP_COUNT_FOR_VICTORY')) {
        this.emitEvaEvent('BASE_UNDER_ATTACK', target.side, 'own', target.id);
      }
    }

    // Source parity: EMPUpdate — EMP damage type disables target for ~5 seconds.
    const normalizedDamageType = damageType.toUpperCase();
    if (normalizedDamageType === 'EMP' || normalizedDamageType === 'MICROWAVE') {
      const EMP_DISABLE_DURATION_FRAMES = 150; // ~5s at 30fps
      this.applyEmpDisable(target, EMP_DISABLE_DURATION_FRAMES);
    }

    // Source parity: PoisonedBehavior.onDamage — POISON damage starts/refreshes poison DoT.
    if (normalizedDamageType === 'POISON') {
      this.applyPoisonToEntity(target, adjustedDamage);
    }

    // Source parity: FlammableUpdate.onDamage — FLAME/PARTICLE_BEAM accumulates toward ignition.
    if (normalizedDamageType === 'FLAME' || normalizedDamageType === 'PARTICLE_BEAM') {
      this.applyFireDamageToEntity(target, adjustedDamage);
    }

    if (target.health <= 0) {
      this.markEntityDestroyed(target.id, sourceEntityId ?? -1);
    }
  }

  private adjustDamageByArmorSet(target: MapEntity, amount: number, damageType: string): number {
    return adjustDamageByArmorSetImpl(target, amount, damageType);
  }

  private markEntityDestroyed(entityId: number, attackerId: number): void {
    const entity = this.spawnedEntities.get(entityId);
    if (!entity || entity.destroyed) {
      return;
    }
    // Emit entity destroyed visual event.
    this.visualEventBuffer.push({
      type: 'ENTITY_DESTROYED',
      x: entity.x,
      y: entity.y,
      z: entity.z,
      radius: entity.category === 'building' ? 8 : 3,
      sourceEntityId: entityId,
      projectileType: 'BULLET',
    });

    // Source parity: EVA — announce building/unit loss.
    if (entity.side) {
      if (entity.kindOf.has('STRUCTURE') && entity.kindOf.has('MP_COUNT_FOR_VICTORY')) {
        this.emitEvaEvent('BUILDING_LOST', entity.side, 'own', entityId);
      } else if (entity.category === 'infantry' || entity.category === 'vehicle') {
        this.emitEvaEvent('UNIT_LOST', entity.side, 'own', entityId);
      }
    }

    // Unregister energy contribution before destruction.
    this.unregisterEntityEnergy(entity);

    // Source parity: award XP to killer on victim death.
    this.awardExperienceOnKill(entityId, attackerId);

    // Source parity: EjectPilotDie — eject pilot unit for VETERAN+ vehicles on death.
    this.tryEjectPilotOnDeath(entity);

    // Source parity: CreateObjectDie / SlowDeathBehavior — execute death OCLs.
    this.executeDeathOCLs(entity);

    this.cancelEntityCommandPathActions(entityId);
    this.railedTransportStateByEntityId.delete(entityId);
    this.supplyWarehouseStates.delete(entityId);
    this.supplyTruckStates.delete(entityId);
    this.disableOverchargeForEntity(entity);
    this.sellingEntities.delete(entityId);
    this.disabledHackedStatusByEntityId.delete(entityId);
    this.disabledEmpStatusByEntityId.delete(entityId);
    for (const [sourceId, pendingAction] of this.pendingEnterObjectActions.entries()) {
      if (pendingAction.targetObjectId === entityId) {
        this.pendingEnterObjectActions.delete(sourceId);
      }
    }
    for (const [sourceId, targetBuildingId] of this.pendingGarrisonActions.entries()) {
      if (targetBuildingId === entityId) {
        this.pendingGarrisonActions.delete(sourceId);
      }
    }
    for (const pendingAction of this.pendingCombatDropActions.values()) {
      if (pendingAction.targetObjectId === entityId) {
        pendingAction.targetObjectId = null;
      }
    }

    // Source parity: GarrisonContain::onDie — release garrisoned infantry on building death.
    // Passengers are ejected (and can be killed by separate damage if desired).
    if (entity.containProfile) {
      const passengerIds = this.collectContainedEntityIds(entityId);
      for (const passengerId of passengerIds) {
        const passenger = this.spawnedEntities.get(passengerId);
        if (passenger && !passenger.destroyed) {
          this.releaseEntityFromContainer(passenger);
        }
      }
    }

    const completedUpgradeNames = Array.from(entity.completedUpgrades.values());
    for (const completedUpgradeName of completedUpgradeNames) {
      this.removeEntityUpgrade(entity, completedUpgradeName);
    }
    this.cancelAndRefundAllProductionOnDeath(entity);
    entity.animationState = 'DIE';
    // Source parity: upgrade modules clean up side state via removeEntityUpgrade/onDelete parity.
    entity.destroyed = true;
    entity.moving = false;
    entity.moveTarget = null;
    entity.movePath = [];
    entity.pathIndex = 0;
    entity.pathfindGoalCell = null;
    entity.attackTargetEntityId = null;
    entity.attackTargetPosition = null;
    entity.attackOriginalVictimPosition = null;
    entity.attackCommandSource = 'AI';
    this.pendingDyingRenderableStates.set(entityId, {
      state: this.makeRenderableEntityState(entity),
      expireFrame: this.frameCounter + 1,
    });
    this.onObjectDestroyed(entityId);
  }

  /**
   * Source parity: EjectPilotDie — eject a pilot unit when VETERAN+ vehicle is destroyed.
   * Only vehicle/air categories with the ejectPilotTemplateName set will eject.
   * The pilot inherits the vehicle's veterancy level.
   */
  private tryEjectPilotOnDeath(entity: MapEntity): void {
    if (!entity.ejectPilotTemplateName) return;
    if (entity.category !== 'vehicle' && entity.category !== 'air') return;

    // Source parity: Only VETERAN or higher eject a pilot.
    const vetLevel = entity.experienceState.currentLevel;
    if (vetLevel < entity.ejectPilotMinVeterancy) return;

    // Try to resolve the pilot unit template. The ejectPilotTemplateName
    // may be an OCL name rather than a direct unit template. Try to find
    // a matching infantry template first, falling back to a side-specific pilot.
    const registry = this.iniDataRegistry;
    if (!registry) return;

    // Convention: look for the OCL name as an object template first.
    // If not found, try side-prefixed variants (e.g., AmericaPilot, ChinaPilot).
    let pilotTemplateName = entity.ejectPilotTemplateName;
    let pilotDef = findObjectDefByName(registry, pilotTemplateName);
    if (!pilotDef && entity.side) {
      // Try conventional pilot name: <Side>Pilot (e.g., AmericaPilot)
      const sidePilot = entity.side + 'Pilot';
      pilotDef = findObjectDefByName(registry, sidePilot);
      if (pilotDef) pilotTemplateName = sidePilot;
    }
    if (!pilotDef) {
      // Try generic Pilot template
      pilotDef = findObjectDefByName(registry, 'Pilot');
      if (pilotDef) pilotTemplateName = 'Pilot';
    }
    if (!pilotDef) return;

    // Spawn the pilot at the vehicle's position.
    const pilotEntity = this.spawnEntityFromTemplate(
      pilotTemplateName,
      entity.x,
      entity.z,
      entity.rotationY,
      entity.side,
    );
    if (!pilotEntity) return;

    // Inherit veterancy.
    if (pilotEntity.experienceProfile) {
      pilotEntity.experienceState.currentLevel = vetLevel;
    }
  }

  /**
   * Source parity: CreateObjectDie / SlowDeathBehavior — extract death OCL names from INI.
   * Scans modules for CreationList, GroundCreationList, or OCL fields that reference
   * ObjectCreationList definitions.
   */
  private extractDeathOCLNames(objectDef: ObjectDef | undefined): string[] {
    if (!objectDef) return [];
    const oclNames: string[] = [];
    const moduleBlocks = objectDef.blocks ?? [];
    for (const block of moduleBlocks) {
      const blockType = block.type.toUpperCase();
      if (blockType !== 'DIE' && blockType !== 'BEHAVIOR') continue;
      const moduleType = block.name.split(/\s+/)[0] ?? '';
      const upperModuleType = moduleType.toUpperCase();
      // CreateObjectDie, SlowDeathBehavior, DestroyDie
      if (upperModuleType.includes('CREATEOBJECTDIE') || upperModuleType.includes('SLOWDEATH')) {
        const oclName = readStringField(block.fields, [
          'CreationList', 'GroundCreationList', 'AirCreationList',
        ]);
        if (oclName) {
          oclNames.push(oclName.trim());
        }
        // SlowDeathBehavior can have OCL fields with phase names.
        // e.g., "OCL INITIAL OCLDestroyDebris"
        const oclFieldRaw = readStringField(block.fields, ['OCL']);
        if (oclFieldRaw) {
          // Parse "INITIAL OCLName" or just "OCLName"
          const parts = oclFieldRaw.trim().split(/\s+/);
          const oclPart = parts.length > 1 ? parts[parts.length - 1]! : parts[0]!;
          if (oclPart && !oclNames.includes(oclPart)) {
            oclNames.push(oclPart);
          }
        }
      }
    }
    return oclNames;
  }

  /**
   * Source parity: ObjectCreationList::create — execute an OCL by name.
   * Resolves CreateObject nuggets and spawns entities.
   */
  private executeOCL(oclName: string, sourceEntity: MapEntity): void {
    const registry = this.iniDataRegistry;
    if (!registry) return;
    const oclDef = registry.getObjectCreationList(oclName);
    if (!oclDef) return;

    for (const nugget of oclDef.blocks) {
      // OCL nuggets use block.type for the nugget kind (e.g., 'CreateObject', 'CreateDebris').
      // If type is empty, fall back to the first token of name.
      const nuggetType = (nugget.type || nugget.name.split(/\s+/)[0] || '').toUpperCase();
      if (nuggetType === 'CREATEOBJECT' || nuggetType === 'CREATEDEBRIS') {
        this.executeCreateObjectNugget(nugget, sourceEntity);
      }
      // FireWeapon, DeliverPayload, Attack, ApplyRandomForce are omitted for now.
    }
  }

  /**
   * Source parity: GenericObjectCreationNugget::reallyCreate — spawn objects from an OCL nugget.
   */
  private executeCreateObjectNugget(nugget: IniBlock, sourceEntity: MapEntity): void {
    const registry = this.iniDataRegistry;
    if (!registry) return;

    // Parse ObjectNames field (space-separated list of template names).
    const objectNamesRaw = readStringField(nugget.fields, ['ObjectNames']);
    if (!objectNamesRaw) return;
    const objectNames = objectNamesRaw.trim().split(/\s+/).filter(Boolean);
    if (objectNames.length === 0) return;

    // Parse Count (default 1).
    const countRaw = readStringField(nugget.fields, ['Count', 'ObjectCount']);
    const count = Math.max(1, countRaw ? (parseInt(countRaw, 10) || 1) : 1);

    // Parse Offset as Coord3D (X Y Z in source).
    const offsetRaw = readStringField(nugget.fields, ['Offset']);
    let offsetX = 0;
    let offsetY = 0;
    let offsetZ = 0;
    if (offsetRaw) {
      const parts = offsetRaw.trim().split(/\s+/);
      if (parts.length >= 1) offsetX = parseFloat(parts[0]!) || 0;
      if (parts.length >= 2) offsetY = parseFloat(parts[1]!) || 0;
      if (parts.length >= 3) offsetZ = parseFloat(parts[2]!) || 0;
    }

    // Parse InheritsVeterancy.
    const inheritsVet = readStringField(nugget.fields, ['InheritsVeterancy'])?.toUpperCase() === 'YES';

    for (let i = 0; i < count; i++) {
      // Pick a random object from the list (deterministic via gameRandom).
      const templateName = objectNames[this.gameRandom.nextRange(0, objectNames.length - 1)]!;

      // Apply offset with some scatter for multiple spawns.
      const scatter = count > 1 ? (this.gameRandom.nextFloat() - 0.5) * 4 : 0;
      const spawnX = sourceEntity.x + offsetX + scatter;
      const spawnZ = sourceEntity.z + offsetZ + scatter;

      const spawned = this.spawnEntityFromTemplate(
        templateName,
        spawnX,
        spawnZ,
        sourceEntity.rotationY + (this.gameRandom.nextFloat() - 0.5) * 0.3,
        sourceEntity.side,
      );

      if (spawned && inheritsVet) {
        spawned.experienceState.currentLevel = sourceEntity.experienceState.currentLevel;
      }
    }
  }

  /**
   * Source parity: Execute all death OCLs for an entity.
   */
  private executeDeathOCLs(entity: MapEntity): void {
    for (const oclName of entity.deathOCLNames) {
      this.executeOCL(oclName, entity);
    }
  }

  // ── EVA Announcer system ──

  /** Default cooldown frames per EVA event type (~10 seconds at 30fps). */
  private static readonly EVA_DEFAULT_COOLDOWN = 300;
  /** Shorter cooldown for high-priority events (~3 seconds). */
  private static readonly EVA_SHORT_COOLDOWN = 90;

  /**
   * Source parity: Eva::setShouldPlay — emit an EVA event with cooldown suppression.
   */
  private emitEvaEvent(
    type: import('./types.js').EvaEventType,
    side: string,
    relationship: 'own' | 'ally' | 'enemy',
    entityId: number | null = null,
    detail: string | null = null,
  ): void {
    const cooldownKey = `${type}:${side}:${relationship}`;
    const nextAllowed = this.evaCooldowns.get(cooldownKey) ?? 0;
    if (this.frameCounter < nextAllowed) return;

    // Use shorter cooldown for urgent events.
    const isUrgent = type === 'BASE_UNDER_ATTACK' || type === 'SUPERWEAPON_LAUNCHED';
    const cooldown = isUrgent
      ? GameLogicSubsystem.EVA_SHORT_COOLDOWN
      : GameLogicSubsystem.EVA_DEFAULT_COOLDOWN;
    this.evaCooldowns.set(cooldownKey, this.frameCounter + cooldown);

    this.evaEventBuffer.push({ type, side, relationship, entityId, detail });
  }

  /**
   * Source parity: Eva::update — check for low power and emit EVA events.
   * Called once per frame from the main update loop.
   */
  private updateEva(): void {
    // Check low power for each side.
    for (const [side, powerState] of this.sidePowerBonus.entries()) {
      const balance = powerState.energyProduction - powerState.energyConsumption + powerState.powerBonus;
      if (balance < 0) {
        this.emitEvaEvent('LOW_POWER', side, 'own');
      }
    }

    // Source parity: Eva fires SUPERWEAPON_READY / SUPERWEAPON_DETECTED when
    // a superweapon countdown reaches zero for the first time.
    for (const entity of this.spawnedEntities.values()) {
      if (entity.destroyed || !entity.kindOf.has('FS_SUPERWEAPON')) continue;
      for (const [, module] of entity.specialPowerModules) {
        const normalizedPower = module.specialPowerTemplateName.toUpperCase().replace(/\s+/g, '');
        const sharedFrame = this.sharedShortcutSpecialPowerReadyFrames.get(normalizedPower) ?? 0;
        if (sharedFrame > 0 && this.frameCounter === sharedFrame && entity.side) {
          this.emitEvaEvent('SUPERWEAPON_READY', entity.side, 'own', entity.id, module.specialPowerTemplateName);
          for (const [side] of this.sidePowerBonus.entries()) {
            if (side !== entity.side) {
              this.emitEvaEvent('SUPERWEAPON_DETECTED', side, 'enemy', entity.id, module.specialPowerTemplateName);
            }
          }
        }
      }
    }
  }

  /**
   * Source parity: ExperienceTracker::addExperiencePoints on killer,
   * using victim's ExperienceValue for their current level.
   * ActiveBody::onVeterancyLevelChanged applies health and armor bonuses.
   */
  private awardExperienceOnKill(victimId: number, attackerId: number): void {
    if (attackerId < 0) {
      return;
    }

    const victim = this.spawnedEntities.get(victimId);
    const attacker = this.spawnedEntities.get(attackerId);
    if (!victim || !attacker || attacker.destroyed) {
      return;
    }

    const victimProfile = victim.experienceProfile;
    if (!victimProfile) {
      return;
    }

    const attackerProfile = attacker.experienceProfile;
    if (!attackerProfile) {
      return;
    }

    // Source parity: no XP for killing allies.
    const victimSide = this.normalizeSide(victim.side);
    const attackerSide = this.normalizeSide(attacker.side);
    if (victimSide && attackerSide && victimSide === attackerSide) {
      return;
    }

    const xpGain = getExperienceValueImpl(victimProfile, victim.experienceState.currentLevel);
    if (xpGain <= 0) {
      return;
    }

    // Source parity: unit-level veterancy XP.
    const result = addExperiencePointsImpl(
      attacker.experienceState,
      attackerProfile,
      xpGain,
      true,
    );

    if (result.didLevelUp) {
      this.onEntityLevelUp(attacker, result.oldLevel, result.newLevel);
    }

    // Source parity: Player::addSkillPointsForKill — also award player-level rank points.
    // SkillPointValue defaults to ExperienceValue when not set in INI (USE_EXP_VALUE_FOR_SKILL_VALUE sentinel).
    if (attackerSide) {
      // No skill points for killing units under construction.
      if (!victim.objectStatusFlags.has('UNDER_CONSTRUCTION')) {
        this.addPlayerSkillPoints(attackerSide, xpGain);
      }
    }
  }

  private onEntityLevelUp(entity: MapEntity, oldLevel: VeterancyLevel, newLevel: VeterancyLevel): void {
    // Source parity: apply health bonus (ActiveBody.cpp:1126-1134).
    const config = DEFAULT_VETERANCY_CONFIG;
    const { newHealth, newMaxHealth } = applyHealthBonusForLevelChangeImpl(
      oldLevel,
      newLevel,
      entity.health,
      entity.maxHealth,
      config,
    );
    entity.maxHealth = newMaxHealth;
    entity.health = newHealth;

    // Source parity: update armor set flags for veterancy level (ActiveBody.cpp:1139-1159).
    const vetArmorFlags = resolveArmorSetFlagsForLevelImpl(newLevel);
    // Clear all veterancy armor flags then set the new one.
    entity.armorSetFlagsMask &= ~0x07; // Clear VETERAN | ELITE | HERO bits.
    entity.armorSetFlagsMask |= vetArmorFlags;
  }

  private cancelAndRefundAllProductionOnDeath(producer: MapEntity): void {
    if (producer.productionQueue.length === 0) {
      return;
    }

    // Source parity: ProductionUpdate::onDie() calls cancelAndRefundAllProduction(),
    // which iterates queue entries through cancel paths to restore player money/state.
    const productionLimit = 100;
    for (let i = 0; i < productionLimit && producer.productionQueue.length > 0; i += 1) {
      const producerSide = this.resolveEntityOwnerSide(producer);
      const production = producer.productionQueue[0];
      if (!production) {
        break;
      }

      if (producerSide && production.type === 'UPGRADE' && production.upgradeType === 'PLAYER') {
        this.setSideUpgradeInProduction(producerSide, production.upgradeName, false);
      }
      if (production.type === 'UNIT') {
        this.releaseParkingDoorReservationForProduction(producer, production.productionId);
      }

      if (producerSide) {
        this.depositSideCredits(producerSide, production.buildCost);
      }
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
        entity.attackTargetPosition = null;
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
      if (entity.garrisonContainerId !== null) {
        entity.garrisonContainerId = null;
      }
      this.spawnedEntities.delete(entityId);
      this.removeEntityFromSelection(entityId);
    }
  }

  private cleanupDyingRenderableStates(): void {
    for (const [entityId, pending] of this.pendingDyingRenderableStates.entries()) {
      if (this.frameCounter > pending.expireFrame) {
        this.pendingDyingRenderableStates.delete(entityId);
      }
    }
  }

  /**
   * Source parity: VictoryConditions.cpp — hasSinglePlayerBeenDefeated.
   * Default skirmish mode: a side is defeated when it has no buildings AND no
   * combat units remaining (excludes projectiles, mines, inert objects).
   */
  private checkVictoryConditions(): void {
    if (this.gameEndFrame !== null) {
      return; // Game already ended.
    }

    // Collect all active sides from playerSideByIndex.
    const activeSides = new Set<string>();
    for (const [, side] of this.playerSideByIndex) {
      if (!this.defeatedSides.has(side)) {
        activeSides.add(side);
      }
    }

    if (activeSides.size < 2) {
      return; // Need at least 2 sides for victory conditions.
    }

    // Check each active side.
    for (const side of activeSides) {
      let hasBuildings = false;
      let hasUnits = false;

      for (const entity of this.spawnedEntities.values()) {
        if (entity.destroyed) continue;
        const entitySide = this.normalizeSide(entity.side);
        if (entitySide !== side) continue;

        // Exclude projectiles, mines, and inert objects (source parity: Team.cpp).
        if (entity.kindOf.has('PROJECTILE') || entity.kindOf.has('MINE') || entity.kindOf.has('INERT')) {
          continue;
        }

        if (entity.kindOf.has('STRUCTURE')) {
          hasBuildings = true;
        } else {
          hasUnits = true;
        }

        if (hasBuildings && hasUnits) break;
      }

      // Source parity: Both VICTORY_NOUNITS and VICTORY_NOBUILDINGS are set by default.
      // A side is defeated when it has no buildings AND no units.
      if (!hasBuildings && !hasUnits) {
        this.defeatedSides.add(side);
      }
    }

    // Check if only one alliance remains.
    const remainingSides: string[] = [];
    for (const [, side] of this.playerSideByIndex) {
      if (!this.defeatedSides.has(side) && !remainingSides.includes(side)) {
        remainingSides.push(side);
      }
    }

    if (remainingSides.length <= 1 && this.defeatedSides.size > 0) {
      this.gameEndFrame = this.frameCounter;
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

      const dx = entity.moveTarget.x - entity.x;
      const dz = entity.moveTarget.z - entity.z;
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
        entity.x = entity.moveTarget.x;
        entity.z = entity.moveTarget.z;
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
        entity.x += dx * inv * step;
        entity.z += dz * inv * step;
      }

      if (this.mapHeightmap) {
        const terrainHeight = this.mapHeightmap.getInterpolatedHeight(entity.x, entity.z);
        const targetY = terrainHeight + entity.baseHeight;
        const snapAlpha = 1 - Math.exp(-this.config.terrainSnapSpeed * dt);
        entity.y += (targetY - entity.y) * snapAlpha;
      }

      // Subtle bob for unresolved movers (e.g., placeholders not in registry)
      if (!entity.resolved) {
        const bob = (Math.sin(this.animationTime * this.config.terrainSnapSpeed + entity.id) + 1) * 0.04;
        entity.y += bob;
      }

      entity.rotationY = Math.atan2(dz, dx) + Math.PI / 2;
      this.updatePathfindPosCell(entity);
    }
  }

  private clearEntitySelectionState(): void {
    for (const entity of this.spawnedEntities.values()) {
      if (entity.selected) {
        entity.selected = false;
      }
    }
  }

  private updateSelectionHighlight(): void {
    this.clearEntitySelectionState();

    for (const selectedEntityId of this.selectedEntityIds) {
      const selected = this.spawnedEntities.get(selectedEntityId);
      if (!selected) {
        continue;
      }

      selected.selected = true;
    }
  }

  private removeEntityFromSelection(entityId: number): void {
    let changed = false;
    if (this.selectedEntityId === entityId) {
      this.selectedEntityId = null;
      changed = true;
    }

    const nextSelectedEntityIds = this.selectedEntityIds.filter((selectedId) => selectedId !== entityId);
    if (nextSelectedEntityIds.length !== this.selectedEntityIds.length) {
      this.selectedEntityIds = nextSelectedEntityIds;
      if (this.selectedEntityId === null) {
        this.selectedEntityId = nextSelectedEntityIds[0] ?? null;
      }
      changed = true;
    }

    if (changed) {
      this.updateSelectionHighlight();
    }
  }

  private filterValidSelectionIds(entityIds: readonly number[]): number[] {
    const seen = new Set<number>();
    const nextSelectionIds: number[] = [];
    for (const candidateId of entityIds) {
      if (!Number.isInteger(candidateId) || candidateId <= 0) {
        continue;
      }
      const entity = this.spawnedEntities.get(candidateId);
      if (!entity || entity.destroyed) {
        continue;
      }
      // Source parity: Object::isSelectable — UNSELECTABLE or MASKED status prevents player selection.
      if (this.entityHasObjectStatus(entity, 'UNSELECTABLE') || this.entityHasObjectStatus(entity, 'MASKED')) {
        continue;
      }
      if (seen.has(candidateId)) {
        continue;
      }
      seen.add(candidateId);
      nextSelectionIds.push(candidateId);
    }

    return nextSelectionIds;
  }

  private clearSpawnedObjects(): void {
    this.commandQueue.length = 0;
    this.pendingWeaponDamageEvents.length = 0;
    this.visualEventBuffer.length = 0;
    this.nextProjectileVisualId = 1;
    for (const [entityId] of this.overchargeStateByEntityId) {
      const entity = this.spawnedEntities.get(entityId);
      if (entity && !entity.destroyed) {
        this.disableOverchargeForEntity(entity);
      }
    }
    this.overchargeStateByEntityId.clear();
    this.disabledHackedStatusByEntityId.clear();
    this.disabledEmpStatusByEntityId.clear();
    this.sellingEntities.clear();
    this.hackInternetStateByEntityId.clear();
    this.hackInternetPendingCommandByEntityId.clear();
    this.pendingEnterObjectActions.clear();
    this.pendingCombatDropActions.clear();
    this.pendingGarrisonActions.clear();
    this.pendingRepairActions.clear();
    this.supplyWarehouseStates.clear();
    this.supplyTruckStates.clear();
    this.railedTransportStateByEntityId.clear();
    this.railedTransportWaypointIndex = createRailedTransportWaypointIndexImpl(null);
    this.fogOfWarGrid = null;
    this.sidePlayerIndex.clear();
    this.nextPlayerIndex = 0;
    this.skirmishAIStates.clear();
    this.navigationGrid = null;
    this.bridgeSegments.clear();
    this.bridgeSegmentByControlEntity.clear();
    this.shortcutSpecialPowerSourceByName.clear();
    this.shortcutSpecialPowerNamesByEntityId.clear();
    this.spawnedEntities.clear();
    this.selectedEntityIds = [];
    this.selectedEntityId = null;
    this.defeatedSides.clear();
    this.gameEndFrame = null;
  }
}
