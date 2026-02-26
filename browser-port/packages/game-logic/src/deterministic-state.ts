import type {
  DeterministicFrameSnapshot,
  DeterministicGameLogicCrcSectionWriters,
  XferCrcAccumulator,
} from '@generals/engine';

import type { GameLogicCommand } from './types.js';

interface VectorXZLike {
  x: number;
  z: number;
}

interface GridCellLike {
  x: number;
  z: number;
}

interface LocomotorSetProfileLike {
  surfaceMask: number;
  downhillOnly: boolean;
  movementSpeed: number;
}

interface ObstacleGeometryLike {
  shape: string;
  majorRadius: number;
  minorRadius: number;
}

interface DeterministicMapEntityLike {
  id: number;
  templateName: string;
  category: string;
  side?: string;
  resolved: boolean;
  selected: boolean;
  canMove: boolean;
  moving: boolean;
  blocksPath: boolean;
  pathfindCenterInCell: boolean;
  locomotorUpgradeEnabled: boolean;
  locomotorDownhillOnly: boolean;
  isUnmanned: boolean;
  attackNeedsLineOfSight: boolean;
  isImmobile: boolean;
  crusherLevel: number;
  crushableLevel: number;
  helixCarrierId: number | null;
  helixPortableRiderId: number | null;
  pathDiameter: number;
  obstacleFootprint: number;
  pathIndex: number;
  activeLocomotorSet: string;
  locomotorSurfaceMask: number;
  forcedWeaponSlot: number | null;
  baseHeight: number;
  nominalHeight: number;
  speed: number;
  largestWeaponRange: number;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  moveTarget: VectorXZLike | null;
  movePath: VectorXZLike[];
  pathfindGoalCell: GridCellLike | null;
  pathfindPosCell: GridCellLike | null;
  ignoredMovementObstacleId: number | null;
  obstacleGeometry: ObstacleGeometryLike | null;
  locomotorSets: Map<string, LocomotorSetProfileLike>;
  locomotorUpgradeTriggers: Set<string>;
  deployState: string;
  deployFrameToWait: number;
}

interface NavigationGridLike {
  width: number;
  height: number;
  zoneBlockWidth: number;
  zoneBlockHeight: number;
  logicalMinX: number;
  logicalMinZ: number;
  logicalMaxX: number;
  logicalMaxZ: number;
  terrainType: Uint8Array;
  blocked: Uint8Array;
  pinched: Uint8Array;
  bridge: Uint8Array;
  bridgePassable: Uint8Array;
  bridgeTransitions: Uint8Array;
  bridgeSegmentByCell: Int32Array;
  zonePassable: Uint8Array;
}

interface BridgeSegmentStateLike {
  passable: boolean;
  cellIndices: number[];
  transitionIndices: number[];
}

interface MapObjectPlacementSummaryLike {
  totalObjects: number;
  spawnedObjects: number;
  skippedObjects: number;
  resolvedObjects: number;
  unresolvedObjects: number;
}

interface KindOfProductionCostModifierLike {
  kindOf: Set<string>;
  multiplier: number;
  refCount: number;
}

interface SidePowerStateLike {
  powerBonus: number;
}

interface SideRadarStateLike {
  radarCount: number;
  disableProofRadarCount: number;
  radarDisabled: boolean;
}

interface ScriptMusicCompletedEventLike {
  name: string;
  index: number;
}

interface ScriptCounterStateLike {
  value: number;
  isCountdownTimer: boolean;
}

interface GameLogicConfigLike {
  renderUnknownObjects: boolean;
  attackUsesLineOfSight: boolean;
  defaultMoveSpeed: number;
  terrainSnapSpeed: number;
  sellPercentage: number;
}

export interface DeterministicGameLogicCrcContext {
  spawnedEntities: ReadonlyMap<number, DeterministicMapEntityLike>;
  navigationGrid: NavigationGridLike | null;
  bridgeSegments: ReadonlyMap<number, BridgeSegmentStateLike>;
  bridgeSegmentByControlEntity: ReadonlyMap<number, number>;
  selectedEntityId: number | null;
  teamRelationshipOverrides: ReadonlyMap<string, number>;
  playerRelationshipOverrides: ReadonlyMap<string, number>;
  placementSummary: MapObjectPlacementSummaryLike;
  sideKindOfProductionCostModifiers: ReadonlyMap<string, KindOfProductionCostModifierLike[]>;
  sidePowerBonus: ReadonlyMap<string, SidePowerStateLike>;
  sideRadarState: ReadonlyMap<string, SideRadarStateLike>;
  scriptCompletedVideos: readonly string[];
  scriptCompletedSpeech: readonly string[];
  scriptCompletedAudio: readonly string[];
  scriptAudioLengthMsByName: ReadonlyMap<string, number>;
  scriptTestingSpeechCompletionFrameByName: ReadonlyMap<string, number>;
  scriptTestingAudioCompletionFrameByName: ReadonlyMap<string, number>;
  scriptCompletedMusic: readonly ScriptMusicCompletedEventLike[];
  scriptCountersByName: ReadonlyMap<string, ScriptCounterStateLike>;
  scriptFlagsByName: ReadonlyMap<string, boolean>;
  scriptUIInteractions: ReadonlySet<string>;
  scriptActiveByName: ReadonlyMap<string, boolean>;
  scriptSubroutineCalls: readonly string[];
  scriptCameraMovementFinished: boolean;
  scriptRadarForced: boolean;
  scriptRadarRefreshFrame: number;
  frameCounter: number;
  nextId: number;
  animationTime: number;
  isAttackMoveToMode: boolean;
  previousAttackMoveToggleDown: boolean;
  scriptInputDisabled: boolean;
  config: GameLogicConfigLike;
  commandQueue: readonly GameLogicCommand[];
}

interface DeterministicWriterContext {
  gameLogic: DeterministicGameLogicCrcContext;
  floatScratch: DataView;
}

export function createDeterministicGameLogicCrcSectionWriters(
  context: DeterministicGameLogicCrcContext,
): DeterministicGameLogicCrcSectionWriters<unknown> {
  const writerContext: DeterministicWriterContext = {
    gameLogic: context,
    floatScratch: new DataView(new ArrayBuffer(4)),
  };

  return {
    writeObjects: (crc, snapshot) => writeDeterministicObjectsCrc(writerContext, crc, snapshot),
    writePartitionManager: (crc, snapshot) => writeDeterministicPartitionManagerCrc(writerContext, crc, snapshot),
    writePlayerList: (crc, snapshot) => writeDeterministicPlayerListCrc(writerContext, crc, snapshot),
    writeAi: (crc, snapshot) => writeDeterministicAiCrc(writerContext, crc, snapshot),
  };
}

function writeDeterministicObjectsCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  _snapshot: DeterministicFrameSnapshot<unknown>,
): void {
  // Source parity:
  // - Generals/Code/GameEngine/Source/GameLogic/System/GameLogic.cpp (GameLogic::getCRC)
  //   iterates m_objList order via getNextObject().
  // We mirror runtime-owned insertion order instead of sorting by ID.
  // TODO(source parity): replace this with the true object-list owner order
  // once object lifecycle ownership is promoted from scaffolding.
  const entities = Array.from(context.gameLogic.spawnedEntities.values());
  crc.addUnsignedInt(entities.length >>> 0);

  for (const entity of entities) {
    addSignedIntCrc(context, crc, entity.id);
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
      addSignedIntCrc(context, crc, entity.helixCarrierId);
    } else {
      crc.addUnsignedByte(0);
    }
    if (entity.helixPortableRiderId !== null) {
      crc.addUnsignedByte(1);
      // Deterministic state: include helix rider/carrier linkage used by HELIX contain rules.
      addSignedIntCrc(context, crc, entity.helixPortableRiderId);
    } else {
      crc.addUnsignedByte(0);
    }
    crc.addUnsignedInt(Math.trunc(entity.pathDiameter) >>> 0);
    crc.addUnsignedInt(Math.trunc(entity.obstacleFootprint) >>> 0);
    crc.addUnsignedInt(Math.trunc(entity.pathIndex) >>> 0);
    crc.addAsciiString(entity.activeLocomotorSet);
    crc.addUnsignedInt(entity.locomotorSurfaceMask >>> 0);
    crc.addUnsignedByte(entity.forcedWeaponSlot === null ? 255 : entity.forcedWeaponSlot);
    addFloat32Crc(context, crc, entity.baseHeight);
    addFloat32Crc(context, crc, entity.nominalHeight);
    addFloat32Crc(context, crc, entity.speed);
    addFloat32Crc(context, crc, entity.largestWeaponRange);
    addFloat32Crc(context, crc, entity.x);
    addFloat32Crc(context, crc, entity.y);
    addFloat32Crc(context, crc, entity.z);
    addFloat32Crc(context, crc, entity.rotationY);
    writeNullableVectorCrc(context, crc, entity.moveTarget);
    writeVectorArrayCrc(context, crc, entity.movePath);
    writeNullableGridCellCrc(context, crc, entity.pathfindGoalCell);
    writeNullableGridCellCrc(context, crc, entity.pathfindPosCell);

    if (entity.ignoredMovementObstacleId !== null) {
      crc.addUnsignedByte(1);
      addSignedIntCrc(context, crc, entity.ignoredMovementObstacleId);
    } else {
      crc.addUnsignedByte(0);
    }

    if (entity.obstacleGeometry) {
      crc.addUnsignedByte(1);
      crc.addAsciiString(entity.obstacleGeometry.shape);
      addFloat32Crc(context, crc, entity.obstacleGeometry.majorRadius);
      addFloat32Crc(context, crc, entity.obstacleGeometry.minorRadius);
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
      addFloat32Crc(context, crc, profile.movementSpeed);
    }

    const upgradeTriggers = Array.from(entity.locomotorUpgradeTriggers.values()).sort();
    crc.addUnsignedInt(upgradeTriggers.length >>> 0);
    for (const upgradeTrigger of upgradeTriggers) {
      crc.addAsciiString(upgradeTrigger);
    }

    // Source parity: DeployStyleAIUpdate state affects combat/movement determinism.
    crc.addAsciiString(entity.deployState);
    crc.addUnsignedInt(entity.deployFrameToWait >>> 0);
  }
}

function writeDeterministicPartitionManagerCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  _snapshot: DeterministicFrameSnapshot<unknown>,
): void {
  // Source parity:
  // - Generals/Code/GameEngine/Source/GameLogic/System/GameLogic.cpp (GameLogic::getCRC)
  //   xfers ThePartitionManager snapshot directly.
  // TODO(source parity): swap these runtime-owned bridge/nav fields for
  // serialized partition-manager snapshot data from the ported owner.
  const grid = context.gameLogic.navigationGrid;
  crc.addUnsignedByte(grid ? 1 : 0);
  if (!grid) {
    return;
  }

  addSignedIntCrc(context, crc, grid.width);
  addSignedIntCrc(context, crc, grid.height);
  addSignedIntCrc(context, crc, grid.zoneBlockWidth);
  addSignedIntCrc(context, crc, grid.zoneBlockHeight);
  addFloat32Crc(context, crc, grid.logicalMinX);
  addFloat32Crc(context, crc, grid.logicalMinZ);
  addFloat32Crc(context, crc, grid.logicalMaxX);
  addFloat32Crc(context, crc, grid.logicalMaxZ);

  writeUint8ArrayCrc(crc, grid.terrainType);
  writeUint8ArrayCrc(crc, grid.blocked);
  writeUint8ArrayCrc(crc, grid.pinched);
  writeUint8ArrayCrc(crc, grid.bridge);
  writeUint8ArrayCrc(crc, grid.bridgePassable);
  writeUint8ArrayCrc(crc, grid.bridgeTransitions);
  writeInt32ArrayCrc(context, crc, grid.bridgeSegmentByCell);
  writeUint8ArrayCrc(crc, grid.zonePassable);

  const segmentEntries = Array.from(context.gameLogic.bridgeSegments.entries()).sort(([leftId], [rightId]) => leftId - rightId);
  crc.addUnsignedInt(segmentEntries.length >>> 0);
  for (const [segmentId, segment] of segmentEntries) {
    addSignedIntCrc(context, crc, segmentId);
    crc.addUnsignedByte(segment.passable ? 1 : 0);
    writeSignedNumberArrayCrc(context, crc, segment.cellIndices, true);
    writeSignedNumberArrayCrc(context, crc, segment.transitionIndices, true);
  }

  const controlEntries = Array.from(context.gameLogic.bridgeSegmentByControlEntity.entries())
    .sort(([leftId], [rightId]) => leftId - rightId);
  crc.addUnsignedInt(controlEntries.length >>> 0);
  for (const [entityId, segmentId] of controlEntries) {
    addSignedIntCrc(context, crc, entityId);
    addSignedIntCrc(context, crc, segmentId);
  }
}

function writeDeterministicPlayerListCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  _snapshot: DeterministicFrameSnapshot<unknown>,
): void {
  // Source parity:
  // - Generals/Code/GameEngine/Source/GameLogic/System/GameLogic.cpp (GameLogic::getCRC)
  //   xfers ThePlayerList snapshot directly.
  // TODO(source parity): switch to ThePlayerList-equivalent snapshot data
  // once player-list ownership is promoted from scaffolding.
  addSignedIntCrc(context, crc, context.gameLogic.selectedEntityId ?? -1);
  writeRelationshipOverridesCrc(context, crc, context.gameLogic.teamRelationshipOverrides);
  writeRelationshipOverridesCrc(context, crc, context.gameLogic.playerRelationshipOverrides);
  crc.addUnsignedInt(context.gameLogic.placementSummary.totalObjects >>> 0);
  crc.addUnsignedInt(context.gameLogic.placementSummary.spawnedObjects >>> 0);
  crc.addUnsignedInt(context.gameLogic.placementSummary.skippedObjects >>> 0);
  crc.addUnsignedInt(context.gameLogic.placementSummary.resolvedObjects >>> 0);
  crc.addUnsignedInt(context.gameLogic.placementSummary.unresolvedObjects >>> 0);
  writeCostModifierUpgradeStatesCrc(context, crc, context.gameLogic.sideKindOfProductionCostModifiers);
  writeSidePowerStateCrc(context, crc, context.gameLogic.sidePowerBonus);
  writeSideRadarStateCrc(crc, context.gameLogic.sideRadarState);
}

function writeDeterministicAiCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  _snapshot: DeterministicFrameSnapshot<unknown>,
): void {
  // Source parity:
  // - Generals/Code/GameEngine/Source/GameLogic/System/GameLogic.cpp (GameLogic::getCRC)
  //   xfers TheAI snapshot directly.
  // TODO(source parity): replace this transitional AI/runtime summary with
  // serialized AI owner snapshot fields once AI system ownership is ported.
  crc.addUnsignedInt(context.gameLogic.frameCounter >>> 0);
  crc.addUnsignedInt(context.gameLogic.nextId >>> 0);
  addFloat32Crc(context, crc, context.gameLogic.animationTime);
  crc.addUnsignedByte(context.gameLogic.isAttackMoveToMode ? 1 : 0);
  crc.addUnsignedByte(context.gameLogic.previousAttackMoveToggleDown ? 1 : 0);
  crc.addUnsignedByte(context.gameLogic.scriptInputDisabled ? 1 : 0);

  // Source parity bridge: ScriptEngine completion lists / lazy audio test state.
  // These values alter script-condition outcomes and must participate in CRC.
  writeOrderedStringListCrc(crc, context.gameLogic.scriptCompletedVideos);
  writeOrderedStringListCrc(crc, context.gameLogic.scriptCompletedSpeech);
  writeOrderedStringListCrc(crc, context.gameLogic.scriptCompletedAudio);
  writeNamedRealMapCrc(context, crc, context.gameLogic.scriptAudioLengthMsByName);
  writeNamedFrameMapCrc(context, crc, context.gameLogic.scriptTestingSpeechCompletionFrameByName);
  writeNamedFrameMapCrc(context, crc, context.gameLogic.scriptTestingAudioCompletionFrameByName);
  writeScriptCompletedMusicCrc(context, crc, context.gameLogic.scriptCompletedMusic);
  writeScriptCounterStateCrc(context, crc, context.gameLogic.scriptCountersByName);
  writeNamedBooleanMapCrc(crc, context.gameLogic.scriptFlagsByName);
  writeNamedBooleanSetCrc(crc, context.gameLogic.scriptUIInteractions);
  writeNamedBooleanMapCrc(crc, context.gameLogic.scriptActiveByName);
  writeOrderedStringListCrc(crc, context.gameLogic.scriptSubroutineCalls);
  crc.addUnsignedByte(context.gameLogic.scriptCameraMovementFinished ? 1 : 0);
  crc.addUnsignedByte(context.gameLogic.scriptRadarForced ? 1 : 0);
  addSignedIntCrc(context, crc, context.gameLogic.scriptRadarRefreshFrame);

  crc.addUnsignedByte(context.gameLogic.config.renderUnknownObjects ? 1 : 0);
  crc.addUnsignedByte(context.gameLogic.config.attackUsesLineOfSight ? 1 : 0);
  addFloat32Crc(context, crc, context.gameLogic.config.defaultMoveSpeed);
  addFloat32Crc(context, crc, context.gameLogic.config.terrainSnapSpeed);
  addFloat32Crc(context, crc, context.gameLogic.config.sellPercentage);

  crc.addUnsignedInt(context.gameLogic.commandQueue.length >>> 0);
  for (const command of context.gameLogic.commandQueue) {
    writeGameLogicCommandCrc(context, crc, command);
  }
}

function writeGameLogicCommandCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  command: GameLogicCommand,
): void {
  crc.addAsciiString(command.type);
  switch (command.type) {
    case 'select':
    case 'bridgeDestroyed':
    case 'bridgeRepaired':
      addSignedIntCrc(context, crc, command.entityId);
      return;
    case 'clearSelection':
      return;
    case 'stop':
      addSignedIntCrc(context, crc, command.entityId);
      crc.addAsciiString(command.commandSource ?? 'AI');
      return;
    case 'selectEntities':
      writeSignedNumberArrayCrc(context, crc, command.entityIds, true);
      return;
    case 'moveTo':
      addSignedIntCrc(context, crc, command.entityId);
      addFloat32Crc(context, crc, command.targetX);
      addFloat32Crc(context, crc, command.targetZ);
      crc.addAsciiString(command.commandSource ?? 'PLAYER');
      return;
    case 'attackMoveTo':
      addSignedIntCrc(context, crc, command.entityId);
      addFloat32Crc(context, crc, command.targetX);
      addFloat32Crc(context, crc, command.targetZ);
      addFloat32Crc(context, crc, command.attackDistance);
      crc.addAsciiString(command.commandSource ?? 'PLAYER');
      return;
    case 'guardPosition':
      addSignedIntCrc(context, crc, command.entityId);
      addFloat32Crc(context, crc, command.targetX);
      addFloat32Crc(context, crc, command.targetZ);
      addSignedIntCrc(context, crc, command.guardMode);
      crc.addAsciiString(command.commandSource ?? 'PLAYER');
      return;
    case 'guardObject':
      addSignedIntCrc(context, crc, command.entityId);
      addSignedIntCrc(context, crc, command.targetEntityId);
      addSignedIntCrc(context, crc, command.guardMode);
      crc.addAsciiString(command.commandSource ?? 'PLAYER');
      return;
    case 'setRallyPoint':
      addSignedIntCrc(context, crc, command.entityId);
      addFloat32Crc(context, crc, command.targetX);
      addFloat32Crc(context, crc, command.targetZ);
      return;
    case 'attackEntity':
      addSignedIntCrc(context, crc, command.entityId);
      addSignedIntCrc(context, crc, command.targetEntityId);
      crc.addAsciiString(command.commandSource ?? 'PLAYER');
      return;
    case 'fireWeapon':
      addSignedIntCrc(context, crc, command.entityId);
      addSignedIntCrc(context, crc, command.weaponSlot);
      addSignedIntCrc(context, crc, command.maxShotsToFire);
      addSignedIntCrc(context, crc, command.targetObjectId ?? -1);
      addFloat32Crc(context, crc, command.targetPosition?.[0] ?? 0);
      addFloat32Crc(context, crc, command.targetPosition?.[1] ?? 0);
      addFloat32Crc(context, crc, command.targetPosition?.[2] ?? 0);
      return;
    case 'setLocomotorSet':
      addSignedIntCrc(context, crc, command.entityId);
      crc.addAsciiString(command.setName);
      return;
    case 'setLocomotorUpgrade':
      addSignedIntCrc(context, crc, command.entityId);
      crc.addUnsignedByte(command.enabled ? 1 : 0);
      return;
    case 'captureEntity':
      addSignedIntCrc(context, crc, command.entityId);
      crc.addAsciiString(command.newSide);
      return;
    case 'applyUpgrade':
      addSignedIntCrc(context, crc, command.entityId);
      crc.addAsciiString(command.upgradeName);
      return;
    case 'queueUnitProduction':
      addSignedIntCrc(context, crc, command.entityId);
      crc.addAsciiString(command.unitTemplateName);
      return;
    case 'cancelUnitProduction':
      addSignedIntCrc(context, crc, command.entityId);
      addSignedIntCrc(context, crc, command.productionId);
      return;
    case 'queueUpgradeProduction':
    case 'cancelUpgradeProduction':
      addSignedIntCrc(context, crc, command.entityId);
      crc.addAsciiString(command.upgradeName);
      return;
    case 'setSideCredits':
    case 'addSideCredits':
      crc.addAsciiString(command.side);
      addSignedIntCrc(context, crc, command.amount);
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
      addSignedIntCrc(context, crc, command.commandOption);
      addSignedIntCrc(context, crc, command.sourceEntityId ?? -1);
      addSignedIntCrc(context, crc, command.targetEntityId ?? -1);
      addFloat32Crc(context, crc, command.targetX ?? 0);
      addFloat32Crc(context, crc, command.targetZ ?? 0);
      writeSignedNumberArrayCrc(context, crc, command.issuingEntityIds, true);
      return;
    case 'exitContainer':
    case 'evacuate':
    case 'executeRailedTransport':
    case 'beaconDelete':
    case 'hackInternet':
    case 'toggleOvercharge':
      addSignedIntCrc(context, crc, command.entityId);
      return;
    case 'combatDrop':
      addSignedIntCrc(context, crc, command.entityId);
      addSignedIntCrc(context, crc, command.targetObjectId ?? -1);
      addFloat32Crc(context, crc, command.targetPosition?.[0] ?? 0);
      addFloat32Crc(context, crc, command.targetPosition?.[1] ?? 0);
      addFloat32Crc(context, crc, command.targetPosition?.[2] ?? 0);
      return;
    case 'placeBeacon':
      addFloat32Crc(context, crc, command.targetPosition[0]);
      addFloat32Crc(context, crc, command.targetPosition[1]);
      addFloat32Crc(context, crc, command.targetPosition[2]);
      return;
    case 'enterObject':
      addSignedIntCrc(context, crc, command.entityId);
      addSignedIntCrc(context, crc, command.targetObjectId);
      crc.addAsciiString(command.action);
      return;
    case 'constructBuilding':
      addSignedIntCrc(context, crc, command.entityId);
      crc.addAsciiString(command.templateName);
      addFloat32Crc(context, crc, command.targetPosition[0]);
      addFloat32Crc(context, crc, command.targetPosition[1]);
      addFloat32Crc(context, crc, command.targetPosition[2]);
      addFloat32Crc(context, crc, command.angle);
      if (command.lineEndPosition === null) {
        crc.addUnsignedByte(0);
      } else {
        crc.addUnsignedByte(1);
        addFloat32Crc(context, crc, command.lineEndPosition[0]);
        addFloat32Crc(context, crc, command.lineEndPosition[1]);
        addFloat32Crc(context, crc, command.lineEndPosition[2]);
      }
      return;
    case 'cancelDozerConstruction':
      addSignedIntCrc(context, crc, command.entityId);
      return;
    case 'sell':
      addSignedIntCrc(context, crc, command.entityId);
      return;
    case 'switchWeapon':
      addSignedIntCrc(context, crc, command.entityId);
      addSignedIntCrc(context, crc, command.weaponSlot);
      return;
    default: {
      const unsupportedType = (command as { type?: string }).type ?? 'unknown';
      throw new Error(`Unsupported deterministic command type: ${unsupportedType}`);
    }
  }
}

function writeRelationshipOverridesCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  overrides: ReadonlyMap<string, number>,
): void {
  const entries = Array.from(overrides.entries()).sort(([left], [right]) => left.localeCompare(right));
  crc.addUnsignedInt(entries.length >>> 0);
  for (const [key, relationship] of entries) {
    crc.addAsciiString(key);
    addSignedIntCrc(context, crc, relationship);
  }
}

function writeCostModifierUpgradeStatesCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  sideModifiers: ReadonlyMap<string, KindOfProductionCostModifierLike[]>,
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
      addFloat32Crc(context, crc, modifier.multiplier);
      addSignedIntCrc(context, crc, modifier.refCount);
    }
  }
}

function writeSidePowerStateCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  sidePowerState: ReadonlyMap<string, SidePowerStateLike>,
): void {
  const sideEntries = Array.from(sidePowerState.entries()).sort(([left], [right]) => left.localeCompare(right));
  crc.addUnsignedInt(sideEntries.length >>> 0);
  for (const [side, state] of sideEntries) {
    crc.addAsciiString(side);
    addFloat32Crc(context, crc, state.powerBonus);
  }
}

function writeSideRadarStateCrc(
  crc: XferCrcAccumulator,
  sideRadarState: ReadonlyMap<string, SideRadarStateLike>,
): void {
  const sideEntries = Array.from(sideRadarState.entries()).sort(([left], [right]) => left.localeCompare(right));
  crc.addUnsignedInt(sideEntries.length >>> 0);
  for (const [side, state] of sideEntries) {
    crc.addAsciiString(side);
    crc.addUnsignedInt(state.radarCount >>> 0);
    crc.addUnsignedInt(state.disableProofRadarCount >>> 0);
    crc.addUnsignedInt(state.radarDisabled ? 1 : 0);
  }
}

function writeOrderedStringListCrc(
  crc: XferCrcAccumulator,
  values: readonly string[],
): void {
  crc.addUnsignedInt(values.length >>> 0);
  for (const value of values) {
    crc.addAsciiString(value);
  }
}

function writeNamedFrameMapCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  values: ReadonlyMap<string, number>,
): void {
  const entries = Array.from(values.entries()).sort(([left], [right]) => left.localeCompare(right));
  crc.addUnsignedInt(entries.length >>> 0);
  for (const [name, frame] of entries) {
    crc.addAsciiString(name);
    addSignedIntCrc(context, crc, frame);
  }
}

function writeNamedRealMapCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  values: ReadonlyMap<string, number>,
): void {
  const entries = Array.from(values.entries()).sort(([left], [right]) => left.localeCompare(right));
  crc.addUnsignedInt(entries.length >>> 0);
  for (const [name, value] of entries) {
    crc.addAsciiString(name);
    addFloat32Crc(context, crc, value);
  }
}

function writeScriptCompletedMusicCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  values: readonly ScriptMusicCompletedEventLike[],
): void {
  crc.addUnsignedInt(values.length >>> 0);
  for (const value of values) {
    crc.addAsciiString(value.name);
    addSignedIntCrc(context, crc, value.index);
  }
}

function writeScriptCounterStateCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  counters: ReadonlyMap<string, ScriptCounterStateLike>,
): void {
  const entries = Array.from(counters.entries()).sort(([left], [right]) => left.localeCompare(right));
  crc.addUnsignedInt(entries.length >>> 0);
  for (const [name, counter] of entries) {
    crc.addAsciiString(name);
    addSignedIntCrc(context, crc, counter.value);
    crc.addUnsignedByte(counter.isCountdownTimer ? 1 : 0);
  }
}

function writeNamedBooleanMapCrc(
  crc: XferCrcAccumulator,
  values: ReadonlyMap<string, boolean>,
): void {
  const entries = Array.from(values.entries()).sort(([left], [right]) => left.localeCompare(right));
  crc.addUnsignedInt(entries.length >>> 0);
  for (const [name, value] of entries) {
    crc.addAsciiString(name);
    crc.addUnsignedByte(value ? 1 : 0);
  }
}

function writeNamedBooleanSetCrc(
  crc: XferCrcAccumulator,
  values: ReadonlySet<string>,
): void {
  const entries = Array.from(values.values()).sort((left, right) => left.localeCompare(right));
  crc.addUnsignedInt(entries.length >>> 0);
  for (const name of entries) {
    crc.addAsciiString(name);
  }
}

function writeVectorArrayCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  points: ReadonlyArray<VectorXZLike>,
): void {
  crc.addUnsignedInt(points.length >>> 0);
  for (const point of points) {
    addFloat32Crc(context, crc, point.x);
    addFloat32Crc(context, crc, point.z);
  }
}

function writeNullableVectorCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  point: VectorXZLike | null,
): void {
  if (!point) {
    crc.addUnsignedByte(0);
    return;
  }
  crc.addUnsignedByte(1);
  addFloat32Crc(context, crc, point.x);
  addFloat32Crc(context, crc, point.z);
}

function writeNullableGridCellCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  point: GridCellLike | null,
): void {
  if (!point) {
    crc.addUnsignedByte(0);
    return;
  }
  crc.addUnsignedByte(1);
  addSignedIntCrc(context, crc, point.x);
  addSignedIntCrc(context, crc, point.z);
}

function writeSignedNumberArrayCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  values: ReadonlyArray<number>,
  sortValues: boolean,
): void {
  const normalized = sortValues ? [...values].sort((left, right) => left - right) : [...values];
  crc.addUnsignedInt(normalized.length >>> 0);
  for (const value of normalized) {
    addSignedIntCrc(context, crc, value);
  }
}

function writeUint8ArrayCrc(crc: XferCrcAccumulator, values: Uint8Array): void {
  crc.addUnsignedInt(values.length >>> 0);
  for (const value of values) {
    crc.addUnsignedByte(value & 0xff);
  }
}

function writeInt32ArrayCrc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  values: Int32Array,
): void {
  crc.addUnsignedInt(values.length >>> 0);
  for (const value of values) {
    addSignedIntCrc(context, crc, value);
  }
}

function addSignedIntCrc(
  _context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  value: number,
): void {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
    throw new Error(`deterministic CRC value must be a signed 32-bit integer, got ${value}`);
  }
  crc.addUnsignedInt(value >>> 0);
}

function addFloat32Crc(
  context: DeterministicWriterContext,
  crc: XferCrcAccumulator,
  value: number,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(`deterministic CRC value must be finite, got ${value}`);
  }
  context.floatScratch.setFloat32(0, Math.fround(value), true);
  crc.addUnsignedInt(context.floatScratch.getUint32(0, true));
}
