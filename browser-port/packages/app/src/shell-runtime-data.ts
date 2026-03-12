import type { IniValue } from '@generals/core';
import type { IniDataRegistry } from '@generals/ini-data';

export interface StartingCreditsOption {
  value: number;
  label: string;
  isDefault: boolean;
}

/**
 * Source parity fallback for MultiplayerStartingMoneyChoice entries.
 * Parsed values in retail Zero Hour are 5000, 10000 (default), 20000, 50000.
 */
export const DEFAULT_STARTING_CREDITS_OPTIONS: readonly StartingCreditsOption[] = [
  { value: 5000, label: '$5,000', isDefault: false },
  { value: 10000, label: '$10,000 (Default)', isDefault: true },
  { value: 20000, label: '$20,000', isDefault: false },
  { value: 50000, label: '$50,000', isDefault: false },
];

/**
 * Source parity:
 *   GeneralsMD/Code/GameEngine/Source/Common/INI/INIMultiplayer.cpp
 */
export function buildStartingCreditsOptionsFromRegistry(
  iniDataRegistry: IniDataRegistry,
): StartingCreditsOption[] {
  const parsed = iniDataRegistry.getMultiplayerStartingMoneyChoices()
    .map((block) => {
      const value = extractInteger(block.fields['Value']);
      if (value === undefined) {
        return null;
      }
      const isDefault = extractBoolean(block.fields['Default']) ?? false;
      return {
        value,
        isDefault,
        label: formatStartingCreditsLabel(value, isDefault),
      };
    })
    .filter((entry): entry is StartingCreditsOption => entry !== null);

  return parsed.length > 0 ? parsed : [...DEFAULT_STARTING_CREDITS_OPTIONS];
}

export function getDefaultStartingCreditsValue(
  options: readonly StartingCreditsOption[],
): number {
  return options.find((option) => option.isDefault)?.value
    ?? options[0]?.value
    ?? DEFAULT_STARTING_CREDITS_OPTIONS[1]!.value;
}

function formatStartingCreditsLabel(value: number, isDefault: boolean): string {
  const base = `$${value.toLocaleString('en-US')}`;
  return isDefault ? `${base} (Default)` : base;
}

function extractInteger(value: IniValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = extractInteger(entry as IniValue);
      if (parsed !== undefined) {
        return parsed;
      }
    }
  }
  return undefined;
}

function extractBoolean(value: IniValue | undefined): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === 'no' || normalized === '0') {
      return false;
    }
  }
  return undefined;
}
