import { describe, expect, it } from 'vitest';

import { CommandOption } from '@generals/ui';

import {
  isObjectTargetAllowedForSelection,
  isObjectTargetRelationshipAllowed,
} from './control-bar-targeting.js';

describe('isObjectTargetRelationshipAllowed', () => {
  it('accepts enemy targets only when NEED_TARGET_ENEMY_OBJECT is set', () => {
    expect(
      isObjectTargetRelationshipAllowed(
        CommandOption.NEED_TARGET_ENEMY_OBJECT,
        'enemies',
      ),
    ).toBe(true);
    expect(
      isObjectTargetRelationshipAllowed(
        CommandOption.NEED_TARGET_ENEMY_OBJECT,
        'allies',
      ),
    ).toBe(false);
    expect(
      isObjectTargetRelationshipAllowed(
        CommandOption.NEED_TARGET_ENEMY_OBJECT,
        'neutral',
      ),
    ).toBe(false);
  });

  it('accepts ally targets only when NEED_TARGET_ALLY_OBJECT is set', () => {
    expect(
      isObjectTargetRelationshipAllowed(
        CommandOption.NEED_TARGET_ALLY_OBJECT,
        'allies',
      ),
    ).toBe(true);
    expect(
      isObjectTargetRelationshipAllowed(
        CommandOption.NEED_TARGET_ALLY_OBJECT,
        'enemies',
      ),
    ).toBe(false);
  });

  it('accepts neutral targets only when NEED_TARGET_NEUTRAL_OBJECT is set', () => {
    expect(
      isObjectTargetRelationshipAllowed(
        CommandOption.NEED_TARGET_NEUTRAL_OBJECT,
        'neutral',
      ),
    ).toBe(true);
    expect(
      isObjectTargetRelationshipAllowed(
        CommandOption.NEED_TARGET_NEUTRAL_OBJECT,
        'enemies',
      ),
    ).toBe(false);
  });

  it('allows any matching relationship when multiple relationship bits are set', () => {
    const mask =
      CommandOption.NEED_TARGET_ENEMY_OBJECT |
      CommandOption.NEED_TARGET_ALLY_OBJECT;

    expect(isObjectTargetRelationshipAllowed(mask, 'enemies')).toBe(true);
    expect(isObjectTargetRelationshipAllowed(mask, 'allies')).toBe(true);
    expect(isObjectTargetRelationshipAllowed(mask, 'neutral')).toBe(false);
  });

  it('rejects unknown relationships from missing entities', () => {
    expect(
      isObjectTargetRelationshipAllowed(
        CommandOption.NEED_TARGET_ENEMY_OBJECT,
        null,
      ),
    ).toBe(false);
  });

  it('uses SELECTION_ANY semantics for multi-selection object-target validity', () => {
    const selectedObjectIds = [101, 202, 303];
    const relationshipBySource = new Map<number, 'allies' | 'neutral' | 'enemies'>([
      [101, 'allies'],
      [202, 'neutral'],
      [303, 'enemies'],
    ]);

    const resolveRelationship = (sourceObjectId: number): 'allies' | 'neutral' | 'enemies' | null =>
      relationshipBySource.get(sourceObjectId) ?? null;

    expect(
      isObjectTargetAllowedForSelection(
        CommandOption.NEED_TARGET_ENEMY_OBJECT,
        selectedObjectIds,
        999,
        resolveRelationship,
      ),
    ).toBe(true);

    expect(
      isObjectTargetAllowedForSelection(
        CommandOption.NEED_TARGET_ALLY_OBJECT,
        selectedObjectIds,
        999,
        resolveRelationship,
      ),
    ).toBe(true);
  });

  it('rejects object target when no selected source object satisfies relationship bits', () => {
    const selectedObjectIds = [11, 12];
    const resolveRelationship = (): 'allies' => 'allies';

    expect(
      isObjectTargetAllowedForSelection(
        CommandOption.NEED_TARGET_ENEMY_OBJECT,
        selectedObjectIds,
        88,
        resolveRelationship,
      ),
    ).toBe(false);
  });

  it('rejects object target when selection is empty', () => {
    expect(
      isObjectTargetAllowedForSelection(
        CommandOption.NEED_TARGET_ENEMY_OBJECT,
        [],
        42,
        () => 'enemies',
      ),
    ).toBe(false);
  });
});
