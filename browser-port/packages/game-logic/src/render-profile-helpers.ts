import type { IniBlock, IniValue } from '@generals/core';
import type { ObjectDef } from '@generals/ini-data';

import { readNumericField } from './ini-readers.js';
import type { RenderAnimationState, RenderAnimationStateClipCandidates } from './types.js';

export interface ModelConditionInfo {
  conditionFlags: string[];
  modelName: string | null;
  animationName: string | null;
  idleAnimationName: string | null;
  hideSubObjects: string[];
  showSubObjects: string[];
  animationMode: 'LOOP' | 'ONCE' | 'MANUAL';
}

export interface ResolvedRenderAssetProfile {
  renderAssetCandidates: string[];
  renderAssetPath: string | null;
  renderAssetResolved: boolean;
  renderAnimationStateClips: RenderAnimationStateClipCandidates;
  modelConditionInfos: ModelConditionInfo[];
}

export function resolveRenderAssetProfile(
  objectDef: ObjectDef | undefined,
): ResolvedRenderAssetProfile {
  const renderAssetCandidates = collectRenderAssetCandidates(objectDef);
  const renderAssetPath = resolveRenderAssetPathFromCandidates(renderAssetCandidates);
  return {
    renderAssetCandidates,
    renderAssetPath,
    renderAssetResolved: renderAssetPath !== null,
    renderAnimationStateClips: collectRenderAnimationStateClips(objectDef),
    modelConditionInfos: collectModelConditionInfos(objectDef),
  };
}

export function resolveRenderAssetPathFromCandidates(renderAssetCandidates: readonly string[]): string | null {
  for (const candidate of renderAssetCandidates) {
    if (candidate.length === 0) {
      continue;
    }
    if (candidate.toUpperCase() === 'NONE') {
      continue;
    }
    return candidate;
  }
  return null;
}

interface PathfindObstacleContext {
  mapXyFactor: number;
  normalizeKindOf(kindOf: string[] | undefined): Set<string>;
  isMobileObject(objectDef: ObjectDef, kinds: Set<string>): boolean;
  isSmallGeometry(fields: Record<string, IniValue>): boolean;
}

export function shouldPathfindObstacle(
  objectDef: ObjectDef | undefined,
  context: PathfindObstacleContext,
): boolean {
  if (!objectDef) {
    return false;
  }

  const kinds = context.normalizeKindOf(objectDef.kindOf);
  const hasKindOf = (kind: string): boolean => kinds.has(kind);

  if (hasKindOf('MINE') || hasKindOf('PROJECTILE') || hasKindOf('BRIDGE_TOWER')) {
    return false;
  }

  if (!hasKindOf('STRUCTURE')) {
    return false;
  }

  if (context.isMobileObject(objectDef, kinds)) {
    return false;
  }

  if (context.isSmallGeometry(objectDef.fields)) {
    return false;
  }

  const heightAboveTerrain = readNumericField(objectDef.fields, ['HeightAboveTerrain', 'Height']);
  if (heightAboveTerrain !== null && heightAboveTerrain > context.mapXyFactor && !hasKindOf('BLAST_CRATER')) {
    return false;
  }

  return true;
}

function collectRenderAssetCandidates(objectDef: ObjectDef | undefined): string[] {
  if (!objectDef) {
    return [];
  }

  const candidates: string[] = [];
  candidates.push(...collectRenderAssetCandidatesInFields(objectDef.fields));

  for (const block of objectDef.blocks) {
    candidates.push(...collectRenderAssetCandidatesInBlock(block));
  }

  return candidates.filter((candidate) => candidate !== null).map((candidate) => candidate.trim()).filter(Boolean);
}

function collectRenderAssetCandidatesInBlock(block: IniBlock): string[] {
  const candidates = collectRenderAssetCandidatesInFields(block.fields);
  for (const childBlock of block.blocks) {
    candidates.push(...collectRenderAssetCandidatesInBlock(childBlock));
  }
  return candidates;
}

function collectRenderAssetCandidatesInFields(fields: Record<string, IniValue>): string[] {
  const candidateFieldNames = ['Model', 'ModelName', 'FileName'];
  const candidates: string[] = [];
  for (const fieldName of candidateFieldNames) {
    const value = readIniFieldValue(fields, fieldName);
    for (const tokenGroup of extractIniValueTokens(value)) {
      for (const token of tokenGroup) {
        if (typeof token === 'string') {
          const trimmed = token.trim();
          if (trimmed.length > 0) {
            candidates.push(trimmed);
          }
        }
      }
    }
  }
  return candidates;
}

export function collectModelConditionInfos(objectDef: ObjectDef | undefined): ModelConditionInfo[] {
  if (!objectDef) {
    return [];
  }

  const infos: ModelConditionInfo[] = [];

  const visitBlock = (block: IniBlock): void => {
    if (block.type.toUpperCase() === 'MODELCONDITIONSTATE') {
      infos.push(parseModelConditionStateBlock(block));
    }

    for (const childBlock of block.blocks) {
      visitBlock(childBlock);
    }
  };

  for (const block of objectDef.blocks) {
    visitBlock(block);
  }

  return infos;
}

function parseModelConditionStateBlock(block: IniBlock): ModelConditionInfo {
  const conditionFlags = block.name.trim().length > 0
    ? block.name.trim().split(/\s+/)
    : [];

  const modelName = readFirstStringToken(block.fields, 'Model')
    ?? readFirstStringToken(block.fields, 'ModelName');
  const animationName = readFirstStringToken(block.fields, 'Animation');
  const idleAnimationName = readFirstStringToken(block.fields, 'IdleAnimation');

  const hideSubObjects = collectAllStringTokens(block.fields, 'HideSubObject');
  const showSubObjects = collectAllStringTokens(block.fields, 'ShowSubObject');

  const animationModeRaw = readFirstStringToken(block.fields, 'AnimationMode');
  let animationMode: 'LOOP' | 'ONCE' | 'MANUAL' = 'LOOP';
  if (animationModeRaw) {
    const normalized = animationModeRaw.toUpperCase();
    if (normalized === 'ONCE') {
      animationMode = 'ONCE';
    } else if (normalized === 'MANUAL') {
      animationMode = 'MANUAL';
    }
  }

  return {
    conditionFlags,
    modelName: modelName ?? null,
    animationName: animationName ?? null,
    idleAnimationName: idleAnimationName ?? null,
    hideSubObjects,
    showSubObjects,
    animationMode,
  };
}

function readFirstStringToken(fields: Record<string, IniValue>, fieldName: string): string | undefined {
  const value = readIniFieldValue(fields, fieldName);
  const groups = extractIniValueTokens(value);
  for (const group of groups) {
    for (const token of group) {
      if (typeof token === 'string' && token.trim().length > 0) {
        return token.trim();
      }
    }
  }
  return undefined;
}

function collectAllStringTokens(fields: Record<string, IniValue>, fieldName: string): string[] {
  const value = readIniFieldValue(fields, fieldName);
  const tokens: string[] = [];
  for (const group of extractIniValueTokens(value)) {
    for (const token of group) {
      if (typeof token === 'string') {
        const trimmed = token.trim();
        if (trimmed.length > 0) {
          tokens.push(trimmed);
        }
      }
    }
  }
  return tokens;
}

function collectRenderAnimationStateClips(objectDef: ObjectDef | undefined): RenderAnimationStateClipCandidates {
  if (!objectDef) {
    return {};
  }

  const renderAnimationStateClips: RenderAnimationStateClipCandidates = {};
  const used = new Map<RenderAnimationState, Set<string>>();

  const addClip = (state: RenderAnimationState, clipName: string): void => {
    const trimmed = clipName.trim();
    if (!trimmed || trimmed.toUpperCase() === 'NONE') {
      return;
    }
    const seen = used.get(state) ?? new Set<string>();
    const canonical = trimmed.toUpperCase();
    if (seen.has(canonical)) {
      return;
    }
    seen.add(canonical);
    used.set(state, seen);
    renderAnimationStateClips[state] = renderAnimationStateClips[state] ?? [];
    renderAnimationStateClips[state]!.push(trimmed);
  };

  const visitBlock = (block: IniBlock): void => {
    if (block.type.toUpperCase() === 'MODELCONDITIONSTATE') {
      const inferredStateFromName = inferRenderAnimationStateFromConditionStateName(block.name);
      for (const [fieldName, fieldValue] of Object.entries(block.fields)) {
        const inferredState = inferRenderAnimationStateFromFieldName(
          fieldName,
          inferredStateFromName,
        );
        if (!inferredState) {
          continue;
        }

        for (const tokenGroup of extractIniValueTokens(fieldValue)) {
          for (const token of tokenGroup) {
            if (typeof token === 'string') {
              addClip(inferredState, token);
            }
          }
        }
      }
    }

    for (const childBlock of block.blocks) {
      visitBlock(childBlock);
    }
  };

  for (const block of objectDef.blocks) {
    visitBlock(block);
  }

  return renderAnimationStateClips;
}

function inferRenderAnimationStateFromFieldName(
  fieldName: string,
  fallback: RenderAnimationState | null,
): RenderAnimationState | null {
  const normalizedFieldName = fieldName.toUpperCase();
  // Source parser supports only `Animation` and `IdleAnimation` for condition-state
  // clips (see W3DModelDraw::parseConditionState).
  if (normalizedFieldName === 'ANIMATION') {
    return fallback;
  }
  if (normalizedFieldName === 'IDLEANIMATION') {
    return 'IDLE';
  }
  return null;
}

function inferRenderAnimationStateFromConditionStateName(conditionStateName: string): RenderAnimationState | null {
  const normalizedConditionStateName = conditionStateName.toUpperCase();
  if (
    normalizedConditionStateName.includes('ATTACK')
    || normalizedConditionStateName.includes('FIRING')
    || normalizedConditionStateName.includes('PREATTACK')
    || normalizedConditionStateName.includes('RELOADING')
    || normalizedConditionStateName.includes('BETWEEN_FIRING_SHOTS')
    || normalizedConditionStateName.includes('USING_WEAPON')
  ) {
    return 'ATTACK';
  }
  if (normalizedConditionStateName.includes('MOVE') || normalizedConditionStateName.includes('RUN')
    || normalizedConditionStateName.includes('WALK')
    || normalizedConditionStateName.includes('MOVING')) {
    return 'MOVE';
  }
  if (
    normalizedConditionStateName.includes('DEATH')
    || normalizedConditionStateName.includes('DIE')
    || normalizedConditionStateName.includes('DEAD')
    || normalizedConditionStateName.includes('DESTROY')
    || normalizedConditionStateName.includes('DYING')
  ) {
    return 'DIE';
  }
  if (
    normalizedConditionStateName.includes('IDLE')
    || normalizedConditionStateName.includes('STAND')
    || normalizedConditionStateName.includes('DEFAULT')
    || normalizedConditionStateName.includes('NORMAL')
  ) {
    return 'IDLE';
  }
  return null;
}

function extractIniValueTokens(value: IniValue | undefined): string[][] {
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
    return value.flatMap((entry) => extractIniValueTokens(entry as IniValue));
  }
  return [];
}

function readIniFieldValue(fields: Record<string, IniValue>, fieldName: string): IniValue | undefined {
  const normalizedFieldName = fieldName.toUpperCase();
  for (const [name, value] of Object.entries(fields)) {
    if (name.toUpperCase() === normalizedFieldName) {
      return value;
    }
  }
  return undefined;
}
