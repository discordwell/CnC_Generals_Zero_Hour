import { describe, it, expect } from 'vitest';
import type { IniBlock, IniValue } from '@generals/core';
import type { ObjectDef } from '@generals/ini-data';

import { collectModelConditionInfos, resolveRenderAssetProfile } from './render-profile-helpers.js';

/**
 * Helper to build a minimal ObjectDef with the given ModelConditionState blocks.
 */
function makeObjectDef(blocks: IniBlock[]): ObjectDef {
  return {
    type: 'Object',
    name: 'TestObject',
    fields: {} as Record<string, IniValue>,
    blocks,
    kindOf: undefined,
  } as unknown as ObjectDef;
}

function makeModelConditionStateBlock(
  name: string,
  fields: Record<string, IniValue>,
): IniBlock {
  return {
    type: 'ModelConditionState',
    name,
    fields,
    blocks: [],
  };
}

describe('collectModelConditionInfos', () => {
  it('returns empty array for undefined objectDef', () => {
    expect(collectModelConditionInfos(undefined)).toEqual([]);
  });

  it('returns empty conditionFlags for default (empty name) condition state', () => {
    const block = makeModelConditionStateBlock('', {});
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos).toHaveLength(1);
    expect(infos[0].conditionFlags).toEqual([]);
  });

  it('produces conditionFlags: ["MOVING"] from "MOVING" condition state', () => {
    const block = makeModelConditionStateBlock('MOVING', {});
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos).toHaveLength(1);
    expect(infos[0].conditionFlags).toEqual(['MOVING']);
  });

  it('produces conditionFlags: ["MOVING", "DAMAGED"] from "MOVING DAMAGED"', () => {
    const block = makeModelConditionStateBlock('MOVING DAMAGED', {});
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos).toHaveLength(1);
    expect(infos[0].conditionFlags).toEqual(['MOVING', 'DAMAGED']);
  });

  it('extracts modelName from Model field', () => {
    const block = makeModelConditionStateBlock('', { Model: 'SomeModel' });
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos[0].modelName).toBe('SomeModel');
  });

  it('extracts modelName from ModelName field when Model is absent', () => {
    const block = makeModelConditionStateBlock('', { ModelName: 'AltModel' });
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos[0].modelName).toBe('AltModel');
  });

  it('prefers Model field over ModelName field', () => {
    const block = makeModelConditionStateBlock('', {
      Model: 'Primary',
      ModelName: 'Secondary',
    });
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos[0].modelName).toBe('Primary');
  });

  it('extracts animationName from Animation field', () => {
    const block = makeModelConditionStateBlock('', {
      Animation: 'WalkAnim',
    });
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos[0].animationName).toBe('WalkAnim');
  });

  it('extracts idleAnimationName from IdleAnimation field', () => {
    const block = makeModelConditionStateBlock('', {
      IdleAnimation: 'IdleLoop',
    });
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos[0].idleAnimationName).toBe('IdleLoop');
  });

  it('accumulates multiple HideSubObject entries', () => {
    const block = makeModelConditionStateBlock('', {
      HideSubObject: ['GUN', 'BARREL'],
    });
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos[0].hideSubObjects).toEqual(['GUN', 'BARREL']);
  });

  it('accumulates multiple ShowSubObject entries', () => {
    const block = makeModelConditionStateBlock('', {
      ShowSubObject: ['DAMAGED_HULL', 'SMOKE'],
    });
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos[0].showSubObjects).toEqual(['DAMAGED_HULL', 'SMOKE']);
  });

  it('returns empty arrays when no hide/show sub-objects', () => {
    const block = makeModelConditionStateBlock('', {});
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos[0].hideSubObjects).toEqual([]);
    expect(infos[0].showSubObjects).toEqual([]);
  });

  it('parses AnimationMode = LOOP (default)', () => {
    const block = makeModelConditionStateBlock('', {});
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos[0].animationMode).toBe('LOOP');
  });

  it('parses AnimationMode = ONCE', () => {
    const block = makeModelConditionStateBlock('', {
      AnimationMode: 'ONCE',
    });
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos[0].animationMode).toBe('ONCE');
  });

  it('parses AnimationMode = MANUAL', () => {
    const block = makeModelConditionStateBlock('', {
      AnimationMode: 'MANUAL',
    });
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos[0].animationMode).toBe('MANUAL');
  });

  it('handles case-insensitive AnimationMode', () => {
    const block = makeModelConditionStateBlock('', {
      AnimationMode: 'once',
    });
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos[0].animationMode).toBe('ONCE');
  });

  it('defaults animationMode to LOOP for unknown values', () => {
    const block = makeModelConditionStateBlock('', {
      AnimationMode: 'UNKNOWN_MODE',
    });
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos[0].animationMode).toBe('LOOP');
  });

  it('visits nested ModelConditionState blocks inside draw modules', () => {
    const drawModule: IniBlock = {
      type: 'Draw',
      name: 'W3DModelDraw',
      fields: {},
      blocks: [
        makeModelConditionStateBlock('MOVING', { Animation: 'MoveAnim' }),
        makeModelConditionStateBlock('', { IdleAnimation: 'IdleAnim' }),
      ],
    };
    const infos = collectModelConditionInfos(makeObjectDef([drawModule]));
    expect(infos).toHaveLength(2);
    expect(infos[0].conditionFlags).toEqual(['MOVING']);
    expect(infos[0].animationName).toBe('MoveAnim');
    expect(infos[1].conditionFlags).toEqual([]);
    expect(infos[1].idleAnimationName).toBe('IdleAnim');
  });

  it('produces a complete info from a fully populated block', () => {
    const block = makeModelConditionStateBlock('MOVING DAMAGED', {
      Model: 'DamagedModel',
      Animation: 'MoveDamagedAnim',
      IdleAnimation: 'IdleDamagedAnim',
      AnimationMode: 'ONCE',
      HideSubObject: ['GUN', 'BARREL'],
      ShowSubObject: ['DAMAGED_HULL'],
    });
    const infos = collectModelConditionInfos(makeObjectDef([block]));
    expect(infos).toHaveLength(1);
    expect(infos[0]).toEqual({
      conditionFlags: ['MOVING', 'DAMAGED'],
      modelName: 'DamagedModel',
      animationName: 'MoveDamagedAnim',
      idleAnimationName: 'IdleDamagedAnim',
      hideSubObjects: ['GUN', 'BARREL'],
      showSubObjects: ['DAMAGED_HULL'],
      animationMode: 'ONCE',
    });
  });
});

describe('resolveRenderAssetProfile backward compatibility', () => {
  it('still populates renderAnimationStateClips', () => {
    const block = makeModelConditionStateBlock('MOVING', {
      Animation: 'MoveAnim',
    });
    const objectDef = makeObjectDef([block]);
    const profile = resolveRenderAssetProfile(objectDef);
    expect(profile.renderAnimationStateClips).toBeDefined();
    expect(profile.renderAnimationStateClips['MOVE']).toContain('MoveAnim');
  });

  it('also populates modelConditionInfos alongside renderAnimationStateClips', () => {
    const block = makeModelConditionStateBlock('MOVING', {
      Animation: 'MoveAnim',
      Model: 'SomeModel',
    });
    const objectDef = makeObjectDef([block]);
    const profile = resolveRenderAssetProfile(objectDef);

    // Backward compat check
    expect(profile.renderAnimationStateClips['MOVE']).toContain('MoveAnim');

    // New structured data
    expect(profile.modelConditionInfos).toHaveLength(1);
    expect(profile.modelConditionInfos[0].conditionFlags).toEqual(['MOVING']);
    expect(profile.modelConditionInfos[0].modelName).toBe('SomeModel');
    expect(profile.modelConditionInfos[0].animationName).toBe('MoveAnim');
  });

  it('returns empty modelConditionInfos for undefined objectDef', () => {
    const profile = resolveRenderAssetProfile(undefined);
    expect(profile.modelConditionInfos).toEqual([]);
    expect(profile.renderAnimationStateClips).toEqual({});
  });
});
