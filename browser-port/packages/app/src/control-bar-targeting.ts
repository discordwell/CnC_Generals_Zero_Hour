import { CommandOption } from '@generals/ui';
import type { EntityRelationship } from '@generals/game-logic';

function relationshipMask(relationship: EntityRelationship): number {
  switch (relationship) {
    case 'enemies':
      return CommandOption.NEED_TARGET_ENEMY_OBJECT;
    case 'allies':
      return CommandOption.NEED_TARGET_ALLY_OBJECT;
    case 'neutral':
    default:
      return CommandOption.NEED_TARGET_NEUTRAL_OBJECT;
  }
}

export function isObjectTargetRelationshipAllowed(
  commandOption: number,
  relationship: EntityRelationship | null,
): boolean {
  if (relationship === null) {
    return false;
  }

  // Source behavior from CommandButton::isValidRelationshipTarget:
  // validity is determined by the matching NEED_TARGET_* relationship bit.
  return (commandOption & relationshipMask(relationship)) !== 0;
}

export function isObjectTargetAllowedForSelection(
  commandOption: number,
  selectedObjectIds: readonly number[],
  targetObjectId: number,
  resolveRelationship: (
    sourceObjectId: number,
    targetObjectId: number,
  ) => EntityRelationship | null,
): boolean {
  if (selectedObjectIds.length === 0) {
    return false;
  }

  // Source behavior from InGameUI::canSelectedObjectsDoSpecialPower with
  // SELECTION_ANY: object-target validity for command mode is considered valid
  // when at least one selected object qualifies against the target.
  for (const sourceObjectId of selectedObjectIds) {
    const relationship = resolveRelationship(sourceObjectId, targetObjectId);
    if (isObjectTargetRelationshipAllowed(commandOption, relationship)) {
      return true;
    }
  }

  return false;
}
