import * as THREE from 'three';
import type { InputState } from '@generals/input';

export interface MapObjectPlacementSummary {
  totalObjects: number;
  spawnedObjects: number;
  skippedObjects: number;
  resolvedObjects: number;
  unresolvedObjects: number;
}

export type RenderAnimationState = 'IDLE' | 'MOVE' | 'ATTACK' | 'DIE';
export type RenderAnimationStateClipCandidates = Partial<Record<RenderAnimationState, string[]>>;

export type RenderableObjectCategory = 'air' | 'building' | 'infantry' | 'vehicle' | 'unknown';

export interface RenderableEntityState {
  id: number;
  templateName: string;
  resolved: boolean;
  renderAssetCandidates: string[];
  renderAssetPath: string | null;
  renderAssetResolved: boolean;
  renderAnimationStateClips?: RenderAnimationStateClipCandidates;
  category: RenderableObjectCategory;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  animationState: RenderAnimationState;
}

export interface SelectByIdCommand {
  type: 'select';
  entityId: number;
}

export interface ClearSelectionCommand {
  type: 'clearSelection';
}

export interface SelectEntitySetCommand {
  type: 'selectEntities';
  entityIds: number[];
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
  commandSource?: 'PLAYER' | 'AI';
}

export interface FireWeaponCommand {
  type: 'fireWeapon';
  entityId: number;
  weaponSlot: number;
  maxShotsToFire: number;
  targetObjectId: number | null;
  targetPosition: readonly [number, number, number] | null;
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

export interface SwitchWeaponCommand {
  type: 'switchWeapon';
  entityId: number;
  weaponSlot: number;
}

export interface SellCommand {
  type: 'sell';
  entityId: number;
}

export interface ExitContainerCommand {
  type: 'exitContainer';
  entityId: number;
}

export interface EvacuateCommand {
  type: 'evacuate';
  entityId: number;
}

export interface ExecuteRailedTransportCommand {
  type: 'executeRailedTransport';
  entityId: number;
}

export interface BeaconDeleteCommand {
  type: 'beaconDelete';
  entityId: number;
}

export interface HackInternetCommand {
  type: 'hackInternet';
  entityId: number;
}

export interface ToggleOverchargeCommand {
  type: 'toggleOvercharge';
  entityId: number;
}

export interface CombatDropCommand {
  type: 'combatDrop';
  entityId: number;
  targetObjectId: number | null;
  targetPosition: readonly [number, number, number] | null;
}

export interface PlaceBeaconCommand {
  type: 'placeBeacon';
  targetPosition: readonly [number, number, number];
}

export interface EnterObjectCommand {
  type: 'enterObject';
  entityId: number;
  targetObjectId: number;
  action: 'hijackVehicle' | 'convertToCarBomb' | 'sabotageBuilding';
}

export interface ConstructBuildingCommand {
  type: 'constructBuilding';
  entityId: number;
  templateName: string;
  targetPosition: readonly [number, number, number];
  angle: number;
  lineEndPosition: readonly [number, number, number] | null;
}

export interface CancelDozerConstructionCommand {
  type: 'cancelDozerConstruction';
  entityId: number;
}

export type GameLogicCommand =
  | SelectByIdCommand
  | SelectEntitySetCommand
  | ClearSelectionCommand
  | MoveToCommand
  | AttackMoveToCommand
  | GuardPositionCommand
  | GuardObjectCommand
  | SetRallyPointCommand
  | AttackEntityCommand
  | FireWeaponCommand
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
  | IssueSpecialPowerCommand
  | ExitContainerCommand
  | EvacuateCommand
  | ExecuteRailedTransportCommand
  | BeaconDeleteCommand
  | SellCommand
  | HackInternetCommand
  | ToggleOverchargeCommand
  | CombatDropCommand
  | PlaceBeaconCommand
  | EnterObjectCommand
  | ConstructBuildingCommand
  | CancelDozerConstructionCommand
  | SwitchWeaponCommand;

export interface SelectedEntityInfo {
  id: number;
  templateName: string;
  category: RenderableObjectCategory;
  side?: string;
  resolved: boolean;
  canMove: boolean;
  hasAutoRallyPoint: boolean;
  isUnmanned: boolean;
  isDozer: boolean;
  isMoving: boolean;
  appliedUpgradeNames: string[];
  objectStatusFlags: string[];
}

export type EntityRelationship = 'enemies' | 'neutral' | 'allies';
export type LocalScienceAvailability = 'enabled' | 'disabled' | 'hidden';

export interface GameLogicConfig {
  /**
   * Optional renderer-side object picker callback for pointer selection/hit-testing.
   */
  pickObjectByInput?: (input: InputState, camera: THREE.Camera) => number | null;
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
