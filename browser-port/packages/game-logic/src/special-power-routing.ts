import type { IniDataRegistry, SpecialPowerDef } from '@generals/ini-data';

import { readBooleanField, readNumericField } from './ini-readers.js';
import type { IssueSpecialPowerCommand } from './types.js';

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

interface SpecialPowerCommandEntity {
  id: number;
  destroyed: boolean;
}

interface SpecialPowerCommandContext<TEntity extends SpecialPowerCommandEntity> {
  readonly iniDataRegistry: IniDataRegistry | null;
  readonly frameCounter: number;
  readonly selectedEntityId: number | null;
  readonly spawnedEntities: ReadonlyMap<number, TEntity>;
  msToLogicFrames(milliseconds: number): number;
  resolveShortcutSpecialPowerSourceEntityId(specialPowerName: string): number | null;
  resolveSharedReadyFrame(specialPowerName: string): number;
  resolveSourceReadyFrameBySource(specialPowerName: string, sourceEntityId: number): number;
  setReadyFrame(
    specialPowerName: string,
    sourceEntityId: number,
    isShared: boolean,
    readyFrame: number,
  ): void;
  getTeamRelationship(sourceEntity: TEntity, targetEntity: TEntity): number;
  onIssueSpecialPowerNoTarget(
    sourceEntityId: number,
    specialPowerName: string,
    commandOption: number,
    commandButtonId: string,
    specialPowerDef: SpecialPowerDef,
  ): void;
  onIssueSpecialPowerTargetPosition(
    sourceEntityId: number,
    specialPowerName: string,
    targetX: number,
    targetZ: number,
    commandOption: number,
    commandButtonId: string,
    specialPowerDef: SpecialPowerDef,
  ): void;
  onIssueSpecialPowerTargetObject(
    sourceEntityId: number,
    specialPowerName: string,
    targetEntityId: number,
    commandOption: number,
    commandButtonId: string,
    specialPowerDef: SpecialPowerDef,
  ): void;
}

type NormalizeShortcutSpecialPowerName = (specialPowerName: string) => string | null;

type TrackShortcutSpecialPowerSourceEntity = (
  specialPowerName: string,
  sourceEntityId: number,
  readyFrame: number,
) => boolean;

function resolveIssueSpecialPowerSourceEntityId<TEntity extends SpecialPowerCommandEntity>(
  command: IssueSpecialPowerCommand,
  normalizedSpecialPowerName: string,
  context: SpecialPowerCommandContext<TEntity>,
): number | null {
  if (Number.isFinite(command.sourceEntityId)) {
    const explicitSourceEntityId = Math.trunc(command.sourceEntityId as number);
    const explicitSourceEntity = context.spawnedEntities.get(explicitSourceEntityId);
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
      const candidateEntity = context.spawnedEntities.get(candidateId);
      if (candidateEntity && !candidateEntity.destroyed) {
        return candidateId;
      }
    }
  }

  const shortcutSourceEntityId = context.resolveShortcutSpecialPowerSourceEntityId(normalizedSpecialPowerName);
  if (shortcutSourceEntityId !== null) {
    const shortcutSourceEntity = context.spawnedEntities.get(shortcutSourceEntityId);
    if (shortcutSourceEntity && !shortcutSourceEntity.destroyed) {
      return shortcutSourceEntityId;
    }
  }

  const selectedEntity = context.selectedEntityId !== null
    ? context.spawnedEntities.get(context.selectedEntityId)
    : null;
  if (selectedEntity && !selectedEntity.destroyed) {
    return selectedEntity.id;
  }

  return null;
}

export function isSpecialPowerObjectRelationshipAllowed(
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

export function resolveSharedShortcutSpecialPowerReadyFrame(
  specialPowerName: string,
  frameCounter: number,
  sharedShortcutSpecialPowerReadyFrames: ReadonlyMap<string, number>,
  normalizeShortcutSpecialPowerName: NormalizeShortcutSpecialPowerName,
): number {
  const normalizedSpecialPowerName = normalizeShortcutSpecialPowerName(specialPowerName);
  if (!normalizedSpecialPowerName) {
    return frameCounter;
  }

  const sharedReadyFrame = sharedShortcutSpecialPowerReadyFrames.get(normalizedSpecialPowerName);
  if (!Number.isFinite(sharedReadyFrame)) {
    // Source parity: shared special powers are player-global and start at frame 0 (ready immediately)
    // unless explicitly started by prior usage.
    return frameCounter;
  }

  return Math.max(0, Math.trunc(sharedReadyFrame));
}

export function resolveShortcutSpecialPowerSourceEntityReadyFrameBySource(
  specialPowerName: string,
  sourceEntityId: number,
  frameCounter: number,
  shortcutSpecialPowerSourceByName: ReadonlyMap<string, ReadonlyMap<number, number>>,
  normalizeShortcutSpecialPowerName: NormalizeShortcutSpecialPowerName,
): number {
  const normalizedSpecialPowerName = normalizeShortcutSpecialPowerName(specialPowerName);
  if (!normalizedSpecialPowerName || !Number.isFinite(sourceEntityId)) {
    return frameCounter;
  }

  const normalizedSourceEntityId = Math.trunc(sourceEntityId);
  const sourcesForPower = shortcutSpecialPowerSourceByName.get(normalizedSpecialPowerName);
  if (!sourcesForPower) {
    return frameCounter;
  }

  const readyFrame = sourcesForPower.get(normalizedSourceEntityId);
  if (!Number.isFinite(readyFrame)) {
    return frameCounter;
  }

  return Math.max(0, Math.trunc(readyFrame));
}

export function setSpecialPowerReadyFrame(
  specialPowerName: string,
  sourceEntityId: number,
  isShared: boolean,
  readyFrame: number,
  frameCounter: number,
  sharedShortcutSpecialPowerReadyFrames: Map<string, number>,
  normalizeShortcutSpecialPowerName: NormalizeShortcutSpecialPowerName,
  trackShortcutSpecialPowerSourceEntity: TrackShortcutSpecialPowerSourceEntity,
): void {
  const normalizedSpecialPowerName = normalizeShortcutSpecialPowerName(specialPowerName);
  if (!normalizedSpecialPowerName) {
    return;
  }

  if (!Number.isFinite(readyFrame)) {
    return;
  }

  const normalizedReadyFrame = Math.max(frameCounter, Math.trunc(readyFrame));
  if (isShared) {
    sharedShortcutSpecialPowerReadyFrames.set(normalizedSpecialPowerName, normalizedReadyFrame);
    return;
  }

  trackShortcutSpecialPowerSourceEntity(normalizedSpecialPowerName, sourceEntityId, normalizedReadyFrame);
}

export function routeIssueSpecialPowerCommand<TEntity extends SpecialPowerCommandEntity>(
  command: IssueSpecialPowerCommand,
  context: SpecialPowerCommandContext<TEntity>,
): void {
  const registry = context.iniDataRegistry;
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

  const reloadFrames = context.msToLogicFrames(readNumericField(specialPowerDef.fields, ['ReloadTime']) ?? 0);
  const isSharedSynced = readBooleanField(specialPowerDef.fields, ['SharedSyncedTimer']) === true;

  const sourceEntityId = resolveIssueSpecialPowerSourceEntityId(command, normalizedSpecialPowerName, context);
  if (sourceEntityId === null) {
    return;
  }

  const sourceEntity = context.spawnedEntities.get(sourceEntityId);
  if (!sourceEntity || sourceEntity.destroyed) {
    return;
  }

  // Source parity: shared special powers gate globally by power name; non-shared powers
  // gate per source entity via its tracked shortcut-ready frame.
  const canExecute = isSharedSynced
    ? context.frameCounter >= context.resolveSharedReadyFrame(normalizedSpecialPowerName)
    : context.frameCounter >= context.resolveSourceReadyFrameBySource(
      normalizedSpecialPowerName,
      sourceEntityId,
    );
  if (!canExecute) {
    return;
  }

  const readyFrame = context.frameCounter + reloadFrames;

  const commandOption = Number.isFinite(command.commandOption) ? command.commandOption | 0 : 0;
  const needsObjectTarget = (commandOption & COMMAND_OPTION_NEED_OBJECT_TARGET) !== 0;
  const needsTargetPosition = (commandOption & COMMAND_OPTION_NEED_TARGET_POS) !== 0;

  if (needsObjectTarget) {
    if (!Number.isFinite(command.targetEntityId)) {
      return;
    }

    const targetEntity = context.spawnedEntities.get(Math.trunc(command.targetEntityId));
    if (!targetEntity || targetEntity.destroyed) {
      return;
    }

    if (!isSpecialPowerObjectRelationshipAllowed(commandOption, context.getTeamRelationship(sourceEntity, targetEntity))) {
      return;
    }

    context.onIssueSpecialPowerTargetObject(
      sourceEntity.id,
      normalizedSpecialPowerName,
      targetEntity.id,
      commandOption,
      command.commandButtonId,
      specialPowerDef,
    );

    context.setReadyFrame(normalizedSpecialPowerName, sourceEntityId, isSharedSynced, readyFrame);
    return;
  }

  if (needsTargetPosition) {
    if (!Number.isFinite(command.targetX) || !Number.isFinite(command.targetZ)) {
      return;
    }

    const targetX = command.targetX as number;
    const targetZ = command.targetZ as number;
    context.onIssueSpecialPowerTargetPosition(
      sourceEntity.id,
      normalizedSpecialPowerName,
      targetX,
      targetZ,
      commandOption,
      command.commandButtonId,
      specialPowerDef,
    );

    context.setReadyFrame(normalizedSpecialPowerName, sourceEntityId, isSharedSynced, readyFrame);
    return;
  }

  context.onIssueSpecialPowerNoTarget(
    sourceEntity.id,
    normalizedSpecialPowerName,
    commandOption,
    command.commandButtonId,
    specialPowerDef,
  );

  context.setReadyFrame(normalizedSpecialPowerName, sourceEntityId, isSharedSynced, readyFrame);
}
