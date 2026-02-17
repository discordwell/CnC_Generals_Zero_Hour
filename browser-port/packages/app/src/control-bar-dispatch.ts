import type { AudioManager } from '@generals/audio';
import {
  GuardMode,
  type GameLogicCommand,
  type GameLogicSubsystem,
} from '@generals/game-logic';
import { type CommandButtonDef, type IniDataRegistry } from '@generals/ini-data';
import {
  COMMAND_OPTION_NEED_OBJECT_TARGET,
  CommandOption,
  GUICommandType,
  type IssuedControlBarCommand,
  type UiRuntime,
} from '@generals/ui';

import { playIssuedCommandAudio } from './control-bar-audio.js';

type ControlBarDispatchGameLogic = Pick<
  GameLogicSubsystem,
  | 'getSelectedEntityId'
  | 'getEntityWorldPosition'
  | 'getAttackMoveDistanceForEntity'
  | 'getLocalPlayerSciencePurchasePoints'
  | 'getLocalPlayerDisabledScienceNames'
  | 'getLocalPlayerHiddenScienceNames'
  | 'getLocalPlayerScienceNames'
  | 'resolveShortcutSpecialPowerSourceEntityId'
  | 'submitCommand'
>;

type ControlBarDispatchUiRuntime = Pick<UiRuntime, 'showMessage'>;

function flattenIniValueTokens(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(/[\s,;|]+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenIniValueTokens(entry));
  }
  return [];
}

function firstIniToken(value: unknown): string | null {
  const tokens = flattenIniValueTokens(value);
  return tokens[0] ?? null;
}

function resolveSourceCommandButton(
  iniDataRegistry: IniDataRegistry,
  command: IssuedControlBarCommand,
): CommandButtonDef | undefined {
  return iniDataRegistry.getCommandButton(command.sourceButtonId);
}

function resolveSelectedEntityIds(
  command: IssuedControlBarCommand,
  gameLogic: ControlBarDispatchGameLogic,
): number[] {
  if (command.selectedObjectIds.length > 0) {
    return [...command.selectedObjectIds];
  }
  const selectedEntityId = gameLogic.getSelectedEntityId();
  return selectedEntityId === null ? [] : [selectedEntityId];
}

function submitCommandForSelectedEntities(
  selectedEntityIds: readonly number[],
  commandFactory: (entityId: number) => GameLogicCommand,
  gameLogic: ControlBarDispatchGameLogic,
): void {
  for (const entityId of selectedEntityIds) {
    gameLogic.submitCommand(commandFactory(entityId));
  }
}

function resolveRequiredCommandButtonToken(
  commandButton: CommandButtonDef | undefined,
  fieldName: string,
): string | null {
  if (!commandButton) {
    return null;
  }
  return firstIniToken(commandButton.fields[fieldName]);
}

function guardModeForCommandType(commandType: GUICommandType): GuardMode {
  switch (commandType) {
    case GUICommandType.GUI_COMMAND_GUARD_WITHOUT_PURSUIT:
      return GuardMode.GUARDMODE_GUARD_WITHOUT_PURSUIT;
    case GUICommandType.GUI_COMMAND_GUARD_FLYING_UNITS_ONLY:
      return GuardMode.GUARDMODE_GUARD_FLYING_UNITS_ONLY;
    case GUICommandType.GUI_COMMAND_GUARD:
    default:
      return GuardMode.GUARDMODE_NORMAL;
  }
}

function normalizeTokenSet(tokens: readonly string[]): Set<string> {
  const normalized = new Set<string>();
  for (const token of tokens) {
    const normalizedToken = token.trim().toUpperCase();
    if (!normalizedToken) {
      continue;
    }
    normalized.add(normalizedToken);
  }
  return normalized;
}

function resolvePurchasableScienceName(
  iniDataRegistry: IniDataRegistry,
  commandButton: CommandButtonDef | undefined,
  ownedScienceNames: readonly string[],
  availablePurchasePoints: number,
  disabledScienceNames: readonly string[],
  hiddenScienceNames: readonly string[],
): string | null {
  if (!commandButton) {
    return null;
  }

  const scienceNames = flattenIniValueTokens(commandButton.fields['Science'])
    .map((scienceName) => scienceName.trim().toUpperCase())
    .filter(Boolean);
  if (scienceNames.length === 0) {
    return null;
  }

  const ownedSciences = normalizeTokenSet(ownedScienceNames);
  const disabledSciences = normalizeTokenSet(disabledScienceNames);
  const hiddenSciences = normalizeTokenSet(hiddenScienceNames);
  for (const scienceName of scienceNames) {
    if (ownedSciences.has(scienceName)) {
      continue;
    }
    if (disabledSciences.has(scienceName) || hiddenSciences.has(scienceName)) {
      continue;
    }

    const scienceDef = iniDataRegistry.getScience(scienceName);
    if (!scienceDef) {
      continue;
    }
    const sciencePurchasePointCost = Number.parseInt(
      firstIniToken(scienceDef.fields['SciencePurchasePointCost']) ?? '',
      10,
    );
    if (!Number.isFinite(sciencePurchasePointCost) || sciencePurchasePointCost <= 0) {
      continue;
    }
    if (sciencePurchasePointCost > availablePurchasePoints) {
      continue;
    }

    const requiredSciences = normalizeTokenSet(
      flattenIniValueTokens(scienceDef.fields['PrerequisiteSciences']),
    );

    let hasAllPrereqs = true;
    for (const requiredScience of requiredSciences) {
      if (!ownedSciences.has(requiredScience)) {
        hasAllPrereqs = false;
        break;
      }
    }

    if (hasAllPrereqs) {
      return scienceName;
    }
  }

  return null;
}

interface ContextCommandPayload {
  targetObjectId: number | null;
  targetPosition: readonly [number, number, number] | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseTargetPosition(value: unknown): readonly [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const [x, y, z] = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    return null;
  }
  return [x, y, z];
}

function parseTargetObjectId(value: unknown): number | null {
  if (!isFiniteNumber(value)) {
    return null;
  }
  return Math.trunc(value);
}

function resolveContextCommandPayload(payload: unknown): ContextCommandPayload {
  if (!payload || typeof payload !== 'object') {
    return {
      targetObjectId: null,
      targetPosition: null,
    };
  }
  const candidate = payload as {
    targetObjectId?: unknown;
    targetPosition?: unknown;
    objectId?: unknown;
    position?: unknown;
  };
  const targetObjectId = parseTargetObjectId(candidate.targetObjectId ?? candidate.objectId);
  const targetPosition = parseTargetPosition(candidate.targetPosition ?? candidate.position);
  return {
    targetObjectId,
    targetPosition,
  };
}

export function dispatchIssuedControlBarCommands(
  commands: readonly IssuedControlBarCommand[],
  iniDataRegistry: IniDataRegistry,
  gameLogic: ControlBarDispatchGameLogic,
  uiRuntime: ControlBarDispatchUiRuntime,
  audioManager: AudioManager,
  localPlayerIndex?: number | null,
): void {
  for (const command of commands) {
    const commandButton = resolveSourceCommandButton(iniDataRegistry, command);
    const selectedEntityIds = resolveSelectedEntityIds(command, gameLogic);
    const playCommandAudio = (): void => {
      playIssuedCommandAudio(
        iniDataRegistry,
        audioManager,
        command,
        localPlayerIndex,
      );
    };

    switch (command.commandType) {
      case GUICommandType.GUI_COMMAND_STOP: {
        if (selectedEntityIds.length === 0) {
          continue;
        }
        submitCommandForSelectedEntities(
          selectedEntityIds,
          (entityId) => ({
            type: 'stop',
            entityId,
          }),
          gameLogic,
        );
        playCommandAudio();
        break;
      }

      case GUICommandType.GUI_COMMAND_ATTACK_MOVE: {
        if (selectedEntityIds.length === 0) {
          continue;
        }
        if (!command.targetPosition) {
          uiRuntime.showMessage('Attack Move requires a world target.');
          break;
        }
        const [targetX, , targetZ] = command.targetPosition;
        submitCommandForSelectedEntities(
          selectedEntityIds,
          (entityId) => ({
            type: 'attackMoveTo',
            entityId,
            targetX,
            targetZ,
            attackDistance: gameLogic.getAttackMoveDistanceForEntity(entityId),
          }),
          gameLogic,
        );
        playCommandAudio();
        break;
      }

      case GUICommandType.GUI_COMMAND_WAYPOINTS: {
        if (selectedEntityIds.length === 0) {
          continue;
        }
        if (!command.targetPosition) {
          uiRuntime.showMessage('Move requires a world target.');
          break;
        }
        const [targetX, , targetZ] = command.targetPosition;
        submitCommandForSelectedEntities(
          selectedEntityIds,
          (entityId) => ({
            type: 'moveTo',
            entityId,
            targetX,
            targetZ,
          }),
          gameLogic,
        );
        playCommandAudio();
        break;
      }

      case GUICommandType.GUI_COMMAND_SET_RALLY_POINT: {
        // Source behavior from GUICommandTranslator::doSetRallyPointCommand:
        // rally point commands operate on exactly one selected structure.
        if (selectedEntityIds.length !== 1) {
          uiRuntime.showMessage('Set Rally Point requires a single selected structure.');
          break;
        }
        if (!command.targetPosition) {
          uiRuntime.showMessage('Set Rally Point requires a world target.');
          break;
        }
        const [targetX, , targetZ] = command.targetPosition;
        gameLogic.submitCommand({
          type: 'setRallyPoint',
          entityId: selectedEntityIds[0]!,
          targetX,
          targetZ,
        });
        playCommandAudio();
        break;
      }

      case GUICommandType.GUI_COMMAND_GUARD:
      case GUICommandType.GUI_COMMAND_GUARD_WITHOUT_PURSUIT:
      case GUICommandType.GUI_COMMAND_GUARD_FLYING_UNITS_ONLY: {
        if (selectedEntityIds.length === 0) {
          continue;
        }

        const guardMode = guardModeForCommandType(command.commandType);
        if (command.targetObjectId !== undefined) {
          submitCommandForSelectedEntities(
            selectedEntityIds,
            (entityId) => ({
              type: 'guardObject',
              entityId,
              targetEntityId: command.targetObjectId!,
              guardMode,
            }),
            gameLogic,
          );
          playCommandAudio();
          break;
        }

        if (command.targetPosition) {
          const [targetX, , targetZ] = command.targetPosition;
          submitCommandForSelectedEntities(
            selectedEntityIds,
            (entityId) => ({
              type: 'guardPosition',
              entityId,
              targetX,
              targetZ,
              guardMode,
            }),
            gameLogic,
          );
          playCommandAudio();
          break;
        }

        // Source behavior from GUICommandTranslator::doGuardCommand:
        // guard commands with no explicit target guard the unit's current location.
        for (const entityId of selectedEntityIds) {
          const entityPosition = gameLogic.getEntityWorldPosition(entityId);
          if (!entityPosition) {
            continue;
          }
          gameLogic.submitCommand({
            type: 'guardPosition',
            entityId,
            targetX: entityPosition[0],
            targetZ: entityPosition[2],
            guardMode,
          });
        }
        playCommandAudio();
        break;
      }

      case GUICommandType.GUI_COMMAND_SPECIAL_POWER:
      case GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT:
      case GUICommandType.GUI_COMMAND_SPECIAL_POWER_CONSTRUCT:
      case GUICommandType.GUI_COMMAND_SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT: {
        const specialPowerName = resolveRequiredCommandButtonToken(commandButton, 'SpecialPower');
        if (!specialPowerName) {
          uiRuntime.showMessage(`TODO: ${command.sourceButtonId} special power template is not mapped yet.`);
          break;
        }

        const isShortcutSpecialPower =
          command.commandType === GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT
          || command.commandType === GUICommandType.GUI_COMMAND_SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT;
        const isConstructSpecialPower =
          command.commandType === GUICommandType.GUI_COMMAND_SPECIAL_POWER_CONSTRUCT
          || command.commandType === GUICommandType.GUI_COMMAND_SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT;

        if (command.commandType === GUICommandType.GUI_COMMAND_SPECIAL_POWER && selectedEntityIds.length === 0) {
          uiRuntime.showMessage('Special Power requires a selected source unit.');
          break;
        }

        if (isConstructSpecialPower && !isShortcutSpecialPower && selectedEntityIds.length !== 1) {
          uiRuntime.showMessage('Construct Special Power requires a single selected source unit.');
          break;
        }

        const contextPayload = resolveContextCommandPayload(command.contextPayload);
        let targetEntityId = command.targetObjectId ?? contextPayload.targetObjectId;
        let targetPosition = command.targetPosition ?? contextPayload.targetPosition;

        if (isConstructSpecialPower) {
          const constructObjectName = resolveRequiredCommandButtonToken(commandButton, 'Object');
          if (!constructObjectName) {
            uiRuntime.showMessage(`TODO: ${command.sourceButtonId} construct object template is not mapped yet.`);
            break;
          }

          // Source behavior from PlaceEventTranslator: construct special powers are
          // placement commands resolved to world locations.
          if (!targetPosition) {
            uiRuntime.showMessage('Construct Special Power requires a world target.');
            break;
          }
          targetEntityId = null;
        } else if ((command.commandOption & COMMAND_OPTION_NEED_OBJECT_TARGET) !== 0) {
          if (targetEntityId === null) {
            uiRuntime.showMessage('Special Power requires an object target.');
            break;
          }
          targetPosition = null;
        } else if ((command.commandOption & CommandOption.NEED_TARGET_POS) !== 0) {
          if (!targetPosition) {
            uiRuntime.showMessage('Special Power requires a world target.');
            break;
          }
        }

        let sourceEntityId: number | null = null;
        if (isShortcutSpecialPower) {
          sourceEntityId = gameLogic.resolveShortcutSpecialPowerSourceEntityId(
            specialPowerName,
          );
          if (sourceEntityId === null) {
            // Source behavior from ControlBar::processCommandUI:
            // shortcut special powers resolve source via local-player readiness.
            uiRuntime.showMessage(
              'TODO: shortcut special power source lookup has no tracked ready-frame source.',
            );
            break;
          }
        }
        if (isConstructSpecialPower && !isShortcutSpecialPower) {
          sourceEntityId = selectedEntityIds[0] ?? null;
        }

        gameLogic.submitCommand({
          type: 'issueSpecialPower',
          commandButtonId: command.sourceButtonId,
          specialPowerName,
          commandOption: command.commandOption,
          issuingEntityIds: isShortcutSpecialPower && sourceEntityId !== null
            ? [sourceEntityId]
            : isConstructSpecialPower && sourceEntityId !== null
            ? [sourceEntityId]
            : [...selectedEntityIds],
          sourceEntityId,
          targetEntityId,
          targetX: targetPosition ? targetPosition[0] : null,
          targetZ: targetPosition ? targetPosition[2] : null,
        });

        playCommandAudio();
        break;
      }

      case GUICommandType.GUI_COMMAND_OBJECT_UPGRADE: {
        if (selectedEntityIds.length === 0) {
          continue;
        }
        const upgradeName = resolveRequiredCommandButtonToken(commandButton, 'Upgrade');
        if (!upgradeName) {
          uiRuntime.showMessage(`TODO: ${command.sourceButtonId} object upgrade is not mapped yet.`);
          break;
        }
        submitCommandForSelectedEntities(
          selectedEntityIds,
          (entityId) => ({
            type: 'applyUpgrade',
            entityId,
            upgradeName,
          }),
          gameLogic,
        );
        playCommandAudio();
        break;
      }

      case GUICommandType.GUI_COMMAND_PLAYER_UPGRADE: {
        const upgradeName = resolveRequiredCommandButtonToken(commandButton, 'Upgrade');
        if (!upgradeName) {
          uiRuntime.showMessage(`TODO: ${command.sourceButtonId} player upgrade is not mapped yet.`);
          break;
        }
        gameLogic.submitCommand({
          type: 'applyPlayerUpgrade',
          upgradeName,
        });
        playCommandAudio();
        break;
      }

      case GUICommandType.GUI_COMMAND_PURCHASE_SCIENCE: {
        const localPlayerSciencePurchasePoints = gameLogic.getLocalPlayerSciencePurchasePoints();
        const scienceName = resolvePurchasableScienceName(
          iniDataRegistry,
          commandButton,
          gameLogic.getLocalPlayerScienceNames(),
          localPlayerSciencePurchasePoints,
          gameLogic.getLocalPlayerDisabledScienceNames(),
          gameLogic.getLocalPlayerHiddenScienceNames(),
        );
        if (!scienceName) {
          uiRuntime.showMessage(`TODO: ${command.sourceButtonId} has no purchasable science yet.`);
          break;
        }
        const sciencePurchasePointCost = Number.parseInt(
          firstIniToken(iniDataRegistry.getScience(scienceName)?.fields['SciencePurchasePointCost']) ?? '',
          10,
        );
        if (!Number.isFinite(sciencePurchasePointCost) || sciencePurchasePointCost <= 0) {
          uiRuntime.showMessage(`TODO: ${scienceName} has invalid purchase cost.`);
          break;
        }
        gameLogic.submitCommand({
          type: 'purchaseScience',
          scienceName,
          scienceCost: sciencePurchasePointCost,
        });
        playCommandAudio();
        break;
      }

      default: {
        const commandName = GUICommandType[command.commandType] ?? `#${command.commandType}`;
        uiRuntime.showMessage(`TODO: ${commandName} is not mapped to game logic yet.`);
        // TODO: Source parity gap: map remaining GUICommandType routes to
        // ActionManager / MessageStream equivalents.
        break;
      }
    }
  }
}
