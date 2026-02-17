import { type IniDataRegistry } from '@generals/ini-data';
import { GUICommandType, type ControlBarButton } from '@generals/ui';

export const SHORTCUT_SPECIAL_POWER_READY_FRAME_NOW = 0;
export const SHORTCUT_SPECIAL_POWER_READY_FRAME_DISABLED = 0xffffffff - 10;

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

export function collectShortcutSpecialPowerNames(
  buttons: readonly ControlBarButton[],
  iniDataRegistry: IniDataRegistry,
): Set<string> {
  return new Set(
    collectShortcutSpecialPowerReadyFrames(buttons, iniDataRegistry).keys(),
  );
}

export function collectShortcutSpecialPowerReadyFrames(
  buttons: readonly ControlBarButton[],
  iniDataRegistry: IniDataRegistry,
): Map<string, number> {
  const shortcutSpecialPowers = new Map<string, number>();

  for (const button of buttons) {
    if (
      button.commandType !== GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT
      && button.commandType !== GUICommandType.GUI_COMMAND_SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT
    ) {
      continue;
    }

    const commandButton = iniDataRegistry.getCommandButton(button.id);
    if (!commandButton) {
      continue;
    }

    const specialPowerName = firstIniToken(commandButton.fields['SpecialPower'])?.toUpperCase();
    if (!specialPowerName) {
      continue;
    }

    const sourceReadyFrame = button.enabled === false
      ? SHORTCUT_SPECIAL_POWER_READY_FRAME_DISABLED
      : SHORTCUT_SPECIAL_POWER_READY_FRAME_NOW;

    const existingReadyFrame = shortcutSpecialPowers.get(specialPowerName);
    if (existingReadyFrame === undefined || sourceReadyFrame < existingReadyFrame) {
      shortcutSpecialPowers.set(specialPowerName, sourceReadyFrame);
    }
  }

  return shortcutSpecialPowers;
}
