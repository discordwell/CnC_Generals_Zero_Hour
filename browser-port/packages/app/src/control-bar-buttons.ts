import { IniDataRegistry, type CommandButtonDef } from '@generals/ini-data';
import {
  CommandOption,
  GUICommandType,
  commandOptionMaskFromSourceNames,
  guiCommandTypeFromSourceName,
  type ControlBarButton,
} from '@generals/ui';

const FALLBACK_MOVABLE_CONTROL_BAR_BUTTONS: readonly ControlBarButton[] = [
  {
    // Source command button ID from CommandButton.ini.
    id: 'Command_AttackMove',
    slot: 1,
    label: 'ATTACK_MOVE',
    commandType: GUICommandType.GUI_COMMAND_ATTACK_MOVE,
    commandOption: CommandOption.NEED_TARGET_POS,
  },
  {
    // Source command button ID from CommandButton.ini.
    id: 'Command_Stop',
    slot: 2,
    label: 'STOP',
    commandType: GUICommandType.GUI_COMMAND_STOP,
    commandOption: CommandOption.COMMAND_OPTION_NONE,
  },
];

export interface ControlBarSelectionContext {
  templateName: string | null;
  canMove: boolean;
  hasAutoRallyPoint?: boolean;
  isUnmanned: boolean;
  isDozer: boolean;
  isMoving: boolean;
  objectStatusFlags?: readonly string[];
  productionQueueEntryCount?: number;
  productionQueueMaxEntries?: number;
  appliedUpgradeNames?: readonly string[];
  playerUpgradeNames?: readonly string[];
  playerScienceNames?: readonly string[];
  playerSciencePurchasePoints?: number;
  disabledScienceNames?: readonly string[];
  hiddenScienceNames?: readonly string[];
}

function isMultiSelectButton(button: ControlBarButton): boolean {
  return ((button.commandOption ?? CommandOption.COMMAND_OPTION_NONE) & CommandOption.OK_FOR_MULTI_SELECT) !== 0;
}

function isAttackMoveButton(button: ControlBarButton): boolean {
  return button.commandType === GUICommandType.GUI_COMMAND_ATTACK_MOVE;
}

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

function normalizeControlBarLabel(value: unknown, fallback: string): string {
  const token = firstIniToken(value);
  if (!token) {
    return fallback;
  }
  const colonOffset = token.indexOf(':');
  if (colonOffset < 0 || colonOffset >= token.length - 1) {
    return token;
  }
  return token.slice(colonOffset + 1);
}

function buildControlBarButtonsFromCommandSet(
  iniDataRegistry: IniDataRegistry,
  commandSetName: string,
  selection: ControlBarSelectionContext,
): ControlBarButton[] {
  const commandSet = iniDataRegistry.getCommandSet(commandSetName);
  if (!commandSet) {
    return [];
  }

  const slottedButtons = commandSet.slottedButtons ??
    commandSet.buttons.map((commandButtonName, index) => ({
      slot: index + 1,
      commandButtonName,
    }));
  const buttons: ControlBarButton[] = [];
  for (const entry of slottedButtons) {
    const commandButtonName = entry.commandButtonName;
    const commandButton = iniDataRegistry.getCommandButton(commandButtonName);
    if (!commandButton) {
      continue;
    }

    const commandTypeName = commandButton.commandTypeName ?? firstIniToken(commandButton.fields['Command']);
    if (!commandTypeName) {
      continue;
    }
    const commandType = guiCommandTypeFromSourceName(commandTypeName);
    if (commandType === null) {
      continue;
    }

    const optionNames = commandButton.options.length > 0
      ? commandButton.options
      : flattenIniValueTokens(commandButton.fields['Options']).map((token) => token.toUpperCase());
    const commandOption = commandOptionMaskFromSourceNames(optionNames);
    const label = normalizeControlBarLabel(
      commandButton.fields['TextLabel'] ?? commandButton.fields['Label'],
      commandButton.name,
    );

    const isEnabled = evaluateCommandAvailability(
      iniDataRegistry,
      commandButton,
      commandType,
      commandOption,
      selection,
    );

    buttons.push({
      id: commandButton.name,
      slot: entry.slot,
      label,
      commandType,
      commandOption,
      enabled: isEnabled,
    });
  }

  return buttons;
}

function normalizeUpgradeNameSet(names: readonly string[] | undefined): Set<string> {
  const normalizedNames = new Set<string>();
  if (!names) {
    return normalizedNames;
  }

  for (const name of names) {
    const normalized = name.trim().toUpperCase();
    if (!normalized) {
      continue;
    }
    normalizedNames.add(normalized);
  }
  return normalizedNames;
}

function normalizeStatusNameSet(names: readonly string[] | undefined): Set<string> {
  const normalizedNames = new Set<string>();
  if (!names) {
    return normalizedNames;
  }

  for (const name of names) {
    const normalized = name.trim().toUpperCase();
    if (!normalized) {
      continue;
    }
    normalizedNames.add(normalized);
  }
  return normalizedNames;
}

function isBlockedByScriptStatusOrUnmanned(selection: ControlBarSelectionContext): boolean {
  if (selection.isUnmanned) {
    // Source behavior from ControlBar::getCommandAvailability:
    // DISABLED_UNMANNED objects expose no command buttons.
    return true;
  }

  const statusFlags = normalizeStatusNameSet(selection.objectStatusFlags);
  return statusFlags.has('SCRIPT_DISABLED')
    || statusFlags.has('SCRIPT_UNPOWERED')
    || statusFlags.has('DISABLED_UNMANNED');
}

function parseUpgradeType(upgradeTypeName: string | null): 'player' | 'object' {
  // Source behavior from UpgradeTemplate::UpgradeTemplate:
  // missing/unknown upgrade type defaults to player-level upgrades.
  return upgradeTypeName?.toUpperCase() === 'OBJECT' ? 'object' : 'player';
}

function hasRequiredUpgrade(
  iniDataRegistry: IniDataRegistry,
  commandButton: CommandButtonDef,
  selection: ControlBarSelectionContext,
): boolean {
  const upgradeName = firstIniToken(commandButton.fields['Upgrade']);
  if (!upgradeName) {
    // Source behavior from ControlBar::getCommandAvailability:
    // NEED_UPGRADE checks only run when an upgrade template exists.
    return true;
  }

  const normalizedUpgradeName = upgradeName.trim().toUpperCase();
  const upgradeDef = iniDataRegistry.getUpgrade(upgradeName);
  if (!upgradeDef) {
    // Source parity: unresolved upgrade templates effectively behave as absent.
    return true;
  }

  const upgradeType = parseUpgradeType(firstIniToken(upgradeDef.fields['Type']));
  if (upgradeType === 'object') {
    const objectUpgrades = normalizeUpgradeNameSet(selection.appliedUpgradeNames);
    return objectUpgrades.has(normalizedUpgradeName);
  }

  // TODO: Source parity gap: player upgrade state should come from a dedicated
  // Player subsystem instead of per-selection context plumbing.
  const playerUpgrades = normalizeUpgradeNameSet(selection.playerUpgradeNames);
  return playerUpgrades.has(normalizedUpgradeName);
}

function hasRequiredSciences(
  commandButton: CommandButtonDef,
  selection: ControlBarSelectionContext,
): boolean {
  const scienceNames = normalizeUpgradeNameSet(
    flattenIniValueTokens(commandButton.fields['Science']),
  );
  if (scienceNames.size === 0) {
    return true;
  }

  const ownedSciences = normalizeUpgradeNameSet(selection.playerScienceNames);
  for (const scienceName of scienceNames) {
    if (!ownedSciences.has(scienceName)) {
      return false;
    }
  }
  return true;
}

function canPurchaseScienceFromButton(
  iniDataRegistry: IniDataRegistry,
  commandButton: CommandButtonDef,
  selection: ControlBarSelectionContext,
): boolean {
  const scienceNames = flattenIniValueTokens(commandButton.fields['Science'])
    .map((scienceName) => scienceName.trim().toUpperCase())
    .filter(Boolean);
  if (scienceNames.length === 0) {
    return false;
  }

  const ownedSciences = normalizeUpgradeNameSet(selection.playerScienceNames);
  const disabledSciences = normalizeUpgradeNameSet(selection.disabledScienceNames);
  const hiddenSciences = normalizeUpgradeNameSet(selection.hiddenScienceNames);
  const availablePurchasePoints = selection.playerSciencePurchasePoints ?? Number.POSITIVE_INFINITY;
  // TODO: Source parity gap: purchase points should always come from the player
  // subsystem; fallback to Infinity only preserves behavior when state wiring is
  // incomplete.
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
    // Source behavior from ScienceStore::getPurchasableSciences:
    // a cost of 0 means the science cannot be purchased.
    if (!Number.isFinite(sciencePurchasePointCost) || sciencePurchasePointCost <= 0) {
      continue;
    }
    if (sciencePurchasePointCost > availablePurchasePoints) {
      continue;
    }

    const requiredSciences = normalizeUpgradeNameSet(
      flattenIniValueTokens(scienceDef?.fields['PrerequisiteSciences']),
    );

    let hasAllPrereqs = true;
    for (const requiredScience of requiredSciences) {
      if (!ownedSciences.has(requiredScience)) {
        hasAllPrereqs = false;
        break;
      }
    }

    if (hasAllPrereqs) {
      return true;
    }
  }

  return false;
}

function isProductionQueueFull(selection: ControlBarSelectionContext): boolean {
  if (selection.productionQueueMaxEntries === undefined || selection.productionQueueEntryCount === undefined) {
    return false;
  }

  return selection.productionQueueMaxEntries <= selection.productionQueueEntryCount;
}

function evaluateCommandAvailability(
  iniDataRegistry: IniDataRegistry,
  commandButton: CommandButtonDef,
  commandType: GUICommandType,
  commandOption: number,
  selection: ControlBarSelectionContext,
): boolean {
  if ((commandOption & CommandOption.MUST_BE_STOPPED) !== 0 && selection.isMoving) {
    return false;
  }

  // Source behavior from ControlBar::getCommandAvailability:
  // GUI_COMMAND_DOZER_CONSTRUCT is restricted for non-dozers.
  if (commandType === GUICommandType.GUI_COMMAND_DOZER_CONSTRUCT && !selection.isDozer) {
    return false;
  }

  // Source behavior from InGameUI::canSelectedObjectsDoAction(ACTIONTYPE_SET_RALLY_POINT):
  // rally-point commands require AUTO_RALLYPOINT capability on the selected object.
  if (
    commandType === GUICommandType.GUI_COMMAND_SET_RALLY_POINT &&
    !(selection.hasAutoRallyPoint ?? false)
  ) {
    return false;
  }

  if ((commandOption & CommandOption.NEED_UPGRADE) !== 0 && !hasRequiredUpgrade(
    iniDataRegistry,
    commandButton,
    selection,
  )) {
    return false;
  }

  // Source behavior from ControlBar::getCommandAvailability:
  // PLAYER_UPGRADE and OBJECT_UPGRADE commands require all sciences listed on
  // the command button.
  if (
    (commandType === GUICommandType.GUI_COMMAND_PLAYER_UPGRADE ||
      commandType === GUICommandType.GUI_COMMAND_OBJECT_UPGRADE) &&
    !hasRequiredSciences(commandButton, selection)
  ) {
    return false;
  }

  // Source behavior from ControlBar::getCommandAvailability:
  // production-backed commands are disabled when command queues are full.
  if (
    (commandType === GUICommandType.GUI_COMMAND_UNIT_BUILD
      || commandType === GUICommandType.GUI_COMMAND_OBJECT_UPGRADE)
    && isProductionQueueFull(selection)
  ) {
    return false;
  }

  if (
    commandType === GUICommandType.GUI_COMMAND_PURCHASE_SCIENCE &&
    !canPurchaseScienceFromButton(iniDataRegistry, commandButton, selection)
  ) {
    return false;
  }

  // TODO: Source parity gap: special power readiness checks are not yet fully
  // mirrored from GameLogic command modules, so command-type-specific blocking
  // beyond status flags may still differ from source in edge cases.
  return true;
}

export function buildControlBarButtonsForSelection(
  iniDataRegistry: IniDataRegistry,
  selection: ControlBarSelectionContext,
): ControlBarButton[] {
  if (!selection.templateName) {
    return [];
  }

  if (isBlockedByScriptStatusOrUnmanned(selection)) {
    return [];
  }

  const objectDef = iniDataRegistry.getObject(selection.templateName);
  const commandSetName = objectDef
    ? firstIniToken(objectDef.fields['CommandSet'] ?? objectDef.fields['CommandSetName'])
    : null;
  if (commandSetName) {
    const sourceButtons = buildControlBarButtonsFromCommandSet(iniDataRegistry, commandSetName, selection);
    if (sourceButtons.length > 0) {
      return sourceButtons;
    }
  }

  if (!selection.canMove) {
    return [];
  }

  // TODO: Source parity gap: full per-object command card should be generated
  // from CommandSet + CommandButton + object state checks.
  return [...FALLBACK_MOVABLE_CONTROL_BAR_BUTTONS];
}

function intersectControlBarButtonLists(
  buttonSets: readonly ControlBarButton[][],
): ControlBarButton[] {
  if (buttonSets.length === 0) {
    return [];
  }

  if (buttonSets.length === 1) {
    return [...buttonSets[0]];
  }

  const firstSet = buttonSets[0] ?? [];
  const commonBySlot = new Map<number, {
    button: ControlBarButton;
    canAnySource: boolean;
  }>();
  for (const button of firstSet) {
    const slot = button.slot;
    if (!slot) {
      continue;
    }
    if (isMultiSelectButton(button) && !commonBySlot.has(slot)) {
      commonBySlot.set(slot, {
        button,
        canAnySource: button.enabled,
      });
    }
  }

  for (const currentSet of buttonSets.slice(1)) {
    const currentSetBySlot = new Map<number, ControlBarButton>();
    for (const button of currentSet) {
      const slot = button.slot;
      if (!slot || !isMultiSelectButton(button)) {
        continue;
      }
      if (!currentSetBySlot.has(slot)) {
        currentSetBySlot.set(slot, button);
      }
    }

    for (const [slot, commonButton] of commonBySlot) {
      const nextButton = currentSetBySlot.get(slot);
      if (!nextButton) {
        if (commonButton.button.commandType !== GUICommandType.GUI_COMMAND_ATTACK_MOVE) {
          commonBySlot.delete(slot);
        }
        continue;
      }
      if (commonButton.button.id === nextButton.id) {
        commonButton.canAnySource = commonButton.canAnySource || nextButton.enabled;
        continue;
      }
      if (isAttackMoveButton(commonButton.button) || isAttackMoveButton(nextButton)) {
        continue;
      }
      commonBySlot.delete(slot);
    }

    for (const [slot, currentButton] of currentSetBySlot) {
      if (commonBySlot.has(slot)) {
        continue;
      }
      if (isAttackMoveButton(currentButton)) {
        commonBySlot.set(slot, {
          button: currentButton,
          canAnySource: currentButton.enabled,
        });
      }
    }
  }

  return Array.from(commonBySlot.entries())
    .sort(([left], [right]) => left - right)
    .map(([, entry]) => ({
      ...entry.button,
      enabled: entry.canAnySource,
    }));
}

export function buildControlBarButtonsForSelections(
  iniDataRegistry: IniDataRegistry,
  selections: readonly ControlBarSelectionContext[],
): ControlBarButton[] {
  if (selections.length === 0) {
    return [];
  }

  const controlBarButtonSets = selections.map((selection) =>
    buildControlBarButtonsForSelection(iniDataRegistry, selection),
  );

  return intersectControlBarButtonLists(controlBarButtonSets);
}
