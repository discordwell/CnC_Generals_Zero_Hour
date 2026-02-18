import {
  IniDataRegistry,
  type ArmorDef,
  type CommandButtonDef,
  type CommandSetDef,
  type ObjectDef,
  type ScienceDef,
  type UpgradeDef,
  type WeaponDef,
} from '@generals/ini-data';
import { readNumericField, readStringField } from './ini-readers.js';

function findByNameCaseInsensitive<T>(
  direct: T | undefined,
  name: string,
  entries: Iterable<[string, T]>,
): T | undefined {
  if (direct) {
    return direct;
  }

  const normalizedName = name.toUpperCase();
  for (const [registryName, entry] of entries) {
    if (registryName.toUpperCase() === normalizedName) {
      return entry;
    }
  }

  return undefined;
}

export function findWeaponDefByName(iniDataRegistry: IniDataRegistry, weaponName: string): WeaponDef | undefined {
  return findByNameCaseInsensitive(
    iniDataRegistry.getWeapon(weaponName),
    weaponName,
    iniDataRegistry.weapons.entries(),
  );
}

export function findArmorDefByName(iniDataRegistry: IniDataRegistry, armorName: string): ArmorDef | undefined {
  return findByNameCaseInsensitive(
    iniDataRegistry.getArmor(armorName),
    armorName,
    iniDataRegistry.armors.entries(),
  );
}

export function findObjectDefByName(iniDataRegistry: IniDataRegistry, objectName: string): ObjectDef | undefined {
  return findByNameCaseInsensitive(
    iniDataRegistry.getObject(objectName),
    objectName,
    iniDataRegistry.objects.entries(),
  );
}

export function findUpgradeDefByName(iniDataRegistry: IniDataRegistry, upgradeName: string): UpgradeDef | undefined {
  return findByNameCaseInsensitive(
    iniDataRegistry.getUpgrade(upgradeName),
    upgradeName,
    iniDataRegistry.upgrades.entries(),
  );
}

export function findCommandButtonDefByName(
  iniDataRegistry: IniDataRegistry,
  commandButtonName: string,
): CommandButtonDef | undefined {
  return findByNameCaseInsensitive(
    iniDataRegistry.getCommandButton(commandButtonName),
    commandButtonName,
    iniDataRegistry.commandButtons.entries(),
  );
}

export function findCommandSetDefByName(iniDataRegistry: IniDataRegistry, commandSetName: string): CommandSetDef | undefined {
  return findByNameCaseInsensitive(
    iniDataRegistry.getCommandSet(commandSetName),
    commandSetName,
    iniDataRegistry.commandSets.entries(),
  );
}

export function findScienceDefByName(iniDataRegistry: IniDataRegistry, scienceName: string): ScienceDef | undefined {
  return findByNameCaseInsensitive(
    iniDataRegistry.getScience(scienceName),
    scienceName,
    iniDataRegistry.sciences.entries(),
  );
}

export function resolveUpgradeType(upgradeDef: UpgradeDef): 'PLAYER' | 'OBJECT' {
  const type = readStringField(upgradeDef.fields, ['Type'])?.toUpperCase();
  if (type === 'OBJECT') {
    return 'OBJECT';
  }
  return 'PLAYER';
}

export function resolveUpgradeBuildTimeFrames(upgradeDef: UpgradeDef, logicFrameRate: number): number {
  const buildTimeSeconds = readNumericField(upgradeDef.fields, ['BuildTime']) ?? 0;
  if (!Number.isFinite(buildTimeSeconds)) {
    return 0;
  }
  return Math.trunc(buildTimeSeconds * logicFrameRate);
}

export function resolveUpgradeBuildCost(upgradeDef: UpgradeDef): number {
  const buildCostRaw = readNumericField(upgradeDef.fields, ['BuildCost']) ?? 0;
  if (!Number.isFinite(buildCostRaw)) {
    return 0;
  }
  // Source parity note: C&C upgrade cost calc does not apply kind-of production
  // cost modifiers; only object build/production costs are affected in this path.
  return Math.max(0, Math.trunc(buildCostRaw));
}
