/**
 * INI Data Registry — loads parsed INI JSON and builds indexed lookups.
 *
 * Resolves inheritance chains, validates references, and provides
 * typed access to game objects, weapons, upgrades, sciences, and factions.
 */

import type { IniBlock, IniValue } from '@generals/core';

// ---------------------------------------------------------------------------
// Definition types
// ---------------------------------------------------------------------------

export interface ObjectDef {
  name: string;
  parent?: string;
  side?: string;
  kindOf?: string[];
  fields: Record<string, IniValue>;
  blocks: IniBlock[];
  resolved: boolean;
  hasUnresolvedParent?: boolean;
}

export interface WeaponDef {
  name: string;
  parent?: string;
  fields: Record<string, IniValue>;
  blocks: IniBlock[];
}

export interface ArmorDef {
  name: string;
  fields: Record<string, IniValue>;
}

export interface UpgradeDef {
  name: string;
  fields: Record<string, IniValue>;
}

export interface CommandButtonDef {
  name: string;
  fields: Record<string, IniValue>;
}

export interface CommandSetDef {
  name: string;
  fields: Record<string, IniValue>;
}

export interface ScienceDef {
  name: string;
  fields: Record<string, IniValue>;
}

export interface FactionDef {
  name: string;
  side?: string;
  fields: Record<string, IniValue>;
}

export interface LocomotorDef {
  name: string;
  fields: Record<string, IniValue>;
  surfaces: string[];
  surfaceMask: number;
  downhillOnly: boolean;
  speed?: number;
}

export interface RegistryStats {
  objects: number;
  weapons: number;
  armors: number;
  upgrades: number;
  sciences: number;
  factions: number;
  unresolvedInheritance: number;
  totalBlocks: number;
}

export interface RegistryError {
  type: 'unresolved_parent' | 'duplicate' | 'unsupported_block';
  blockType: string;
  name: string;
  detail: string;
  file?: string;
}

export interface AiConfig {
  attackUsesLineOfSight?: boolean;
}

export interface IniDataBundle {
  objects: ObjectDef[];
  weapons: WeaponDef[];
  armors: ArmorDef[];
  upgrades: UpgradeDef[];
  commandButtons?: CommandButtonDef[];
  commandSets?: CommandSetDef[];
  sciences: ScienceDef[];
  factions: FactionDef[];
  locomotors?: LocomotorDef[];
  ai?: AiConfig;
  stats: RegistryStats;
  errors: RegistryError[];
  unsupportedBlockTypes: string[];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class IniDataRegistry {
  readonly objects = new Map<string, ObjectDef>();
  readonly weapons = new Map<string, WeaponDef>();
  readonly armors = new Map<string, ArmorDef>();
  readonly upgrades = new Map<string, UpgradeDef>();
  readonly commandButtons = new Map<string, CommandButtonDef>();
  readonly commandSets = new Map<string, CommandSetDef>();
  readonly sciences = new Map<string, ScienceDef>();
  readonly factions = new Map<string, FactionDef>();
  readonly locomotors = new Map<string, LocomotorDef>();
  readonly errors: RegistryError[] = [];
  private ai: AiConfig | undefined;

  private unsupportedBlockTypes = new Set<string>();

  /** Load parsed INI blocks (from CLI JSON output or parseIni result). */
  loadBlocks(blocks: IniBlock[], sourcePath?: string): void {
    for (const block of blocks) {
      this.indexBlock(block, sourcePath);
    }
  }

  /** Resolve all inheritance chains. Call after all blocks are loaded. */
  resolveInheritance(): void {
    // Resolve objects
    for (const [name, obj] of this.objects) {
      if (obj.parent && !obj.resolved) {
        this.resolveObjectChain(name, new Set());
      }
    }
  }

  /** Load prebuilt registry state from an INI data bundle. */
  loadBundle(bundle: IniDataBundle): void {
    this.objects.clear();
    this.weapons.clear();
    this.armors.clear();
    this.upgrades.clear();
    this.commandButtons.clear();
    this.commandSets.clear();
    this.sciences.clear();
    this.factions.clear();
    this.locomotors.clear();
    this.errors.length = 0;
    this.unsupportedBlockTypes.clear();

    for (const object of bundle.objects) {
      this.objects.set(object.name, {
        ...object,
        fields: { ...object.fields },
        blocks: [...object.blocks],
        kindOf: object.kindOf ? [...object.kindOf] : undefined,
      });
    }

    for (const weapon of bundle.weapons) {
      this.weapons.set(weapon.name, {
        ...weapon,
        fields: { ...weapon.fields },
        blocks: [...weapon.blocks],
      });
    }

    for (const armor of bundle.armors) {
      this.armors.set(armor.name, { ...armor, fields: { ...armor.fields } });
    }

    for (const upgrade of bundle.upgrades) {
      this.upgrades.set(upgrade.name, { ...upgrade, fields: { ...upgrade.fields } });
    }

    for (const commandButton of bundle.commandButtons ?? []) {
      this.commandButtons.set(commandButton.name, { ...commandButton, fields: { ...commandButton.fields } });
    }

    for (const commandSet of bundle.commandSets ?? []) {
      this.commandSets.set(commandSet.name, { ...commandSet, fields: { ...commandSet.fields } });
    }

    for (const science of bundle.sciences) {
      this.sciences.set(science.name, { ...science, fields: { ...science.fields } });
    }

    for (const faction of bundle.factions) {
      this.factions.set(faction.name, { ...faction, fields: { ...faction.fields } });
    }
    for (const locomotor of bundle.locomotors ?? []) {
      this.locomotors.set(locomotor.name, {
        ...locomotor,
        fields: { ...locomotor.fields },
        surfaces: [...locomotor.surfaces],
      });
    }

    this.errors.push(...bundle.errors);
    this.ai = bundle.ai ? { ...bundle.ai } : undefined;
    for (const unsupported of bundle.unsupportedBlockTypes) {
      this.unsupportedBlockTypes.add(unsupported);
    }
  }

  /** Get all objects matching a KindOf flag. */
  getObjectsByKind(kind: string): ObjectDef[] {
    const results: ObjectDef[] = [];
    for (const obj of this.objects.values()) {
      if (obj.kindOf?.includes(kind)) {
        results.push(obj);
      }
    }
    return results;
  }

  /** Get all objects for a given side (America, China, GLA). */
  getObjectsBySide(side: string): ObjectDef[] {
    const results: ObjectDef[] = [];
    for (const obj of this.objects.values()) {
      if (obj.side === side) {
        results.push(obj);
      }
    }
    return results;
  }

  getObject(name: string): ObjectDef | undefined {
    return this.objects.get(name);
  }

  getWeapon(name: string): WeaponDef | undefined {
    return this.weapons.get(name);
  }

  getArmor(name: string): ArmorDef | undefined {
    return this.armors.get(name);
  }

  getUpgrade(name: string): UpgradeDef | undefined {
    return this.upgrades.get(name);
  }

  getCommandButton(name: string): CommandButtonDef | undefined {
    return this.commandButtons.get(name);
  }

  getCommandSet(name: string): CommandSetDef | undefined {
    return this.commandSets.get(name);
  }

  getScience(name: string): ScienceDef | undefined {
    return this.sciences.get(name);
  }

  getFaction(name: string): FactionDef | undefined {
    return this.factions.get(name);
  }

  getAiConfig(): AiConfig | undefined {
    return this.ai ? { ...this.ai } : undefined;
  }

  getLocomotor(name: string): LocomotorDef | undefined {
    return this.locomotors.get(name);
  }

  /** Get summary statistics. */
  getStats(): RegistryStats {
    return {
      objects: this.objects.size,
      weapons: this.weapons.size,
      armors: this.armors.size,
      upgrades: this.upgrades.size,
      sciences: this.sciences.size,
      factions: this.factions.size,
      unresolvedInheritance: this.getUnresolvedInheritanceCount(),
      totalBlocks: this.objects.size + this.weapons.size + this.armors.size +
        this.upgrades.size + this.commandButtons.size + this.commandSets.size +
        this.sciences.size + this.factions.size + this.locomotors.size,
    };
  }

  /** Get unsupported block types encountered during loading. */
  getUnsupportedBlockTypes(): string[] {
    return [...this.unsupportedBlockTypes].sort();
  }

  /** Export a deterministic compatibility-friendly bundle. */
  toBundle(): IniDataBundle {
    const stats = this.getStats();

    return {
      objects: [...this.objects.values()].sort((a, b) => a.name.localeCompare(b.name)),
      weapons: [...this.weapons.values()].sort((a, b) => a.name.localeCompare(b.name)),
      armors: [...this.armors.values()].sort((a, b) => a.name.localeCompare(b.name)),
      upgrades: [...this.upgrades.values()].sort((a, b) => a.name.localeCompare(b.name)),
      commandButtons: [...this.commandButtons.values()].sort((a, b) => a.name.localeCompare(b.name)),
      commandSets: [...this.commandSets.values()].sort((a, b) => a.name.localeCompare(b.name)),
      sciences: [...this.sciences.values()].sort((a, b) => a.name.localeCompare(b.name)),
      factions: [...this.factions.values()].sort((a, b) => a.name.localeCompare(b.name)),
      locomotors: [...this.locomotors.values()].sort((a, b) => a.name.localeCompare(b.name)),
      ai: this.ai ? { ...this.ai } : undefined,
      stats,
      errors: [...this.errors],
      unsupportedBlockTypes: this.getUnsupportedBlockTypes(),
    };
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private indexBlock(block: IniBlock, sourcePath?: string): void {
    const addDefinition = <T extends { name: string }>(
      collection: Map<string, T>,
      blockType: string,
      definition: T,
    ): void => {
      if (collection.has(definition.name)) {
        this.errors.push({
          type: 'duplicate',
          blockType,
          name: definition.name,
          detail: `Duplicate definition for ${blockType} "${definition.name}" in ${sourcePath ?? 'unknown source'}`,
          file: sourcePath,
        });
      }
      collection.set(definition.name, definition);
    };

    switch (block.type) {
      case 'Object':
      case 'ChildObject':
        addDefinition(this.objects, block.type, {
          name: block.name,
          parent: block.parent,
          side: extractString(block.fields['Side']),
          kindOf: extractStringArray(block.fields['KindOf']),
          fields: block.fields,
          blocks: block.blocks,
          resolved: !block.parent,
        });
        break;

      case 'Weapon':
        addDefinition(this.weapons, block.type, {
          name: block.name,
          parent: block.parent,
          fields: block.fields,
          blocks: block.blocks,
        });
        break;

      case 'Armor':
        addDefinition(this.armors, block.type, {
          name: block.name,
          fields: block.fields,
        });
        break;

      case 'Upgrade':
        addDefinition(this.upgrades, block.type, {
          name: block.name,
          fields: block.fields,
        });
        break;

      case 'CommandButton':
        addDefinition(this.commandButtons, block.type, {
          name: block.name,
          fields: block.fields,
        });
        break;

      case 'CommandSet':
        addDefinition(this.commandSets, block.type, {
          name: block.name,
          fields: block.fields,
        });
        break;

      case 'Science':
        addDefinition(this.sciences, block.type, {
          name: block.name,
          fields: block.fields,
        });
        break;

      case 'PlayerTemplate':
      case 'Faction':
        addDefinition(this.factions, block.type, {
          name: block.name,
          side: extractString(block.fields['Side']),
          fields: block.fields,
        });
        break;

      case 'Locomotor':
        addDefinition(this.locomotors, block.type, {
          name: block.name,
          fields: block.fields,
          surfaces: extractLocomotorSurfaces(block.fields['Surfaces']),
          surfaceMask: locomotorSurfaceMaskFromNames(extractLocomotorSurfaces(block.fields['Surfaces'])),
          downhillOnly: extractBoolean(block.fields['DownhillOnly']) ?? false,
          speed: extractNumber(block.fields['Speed']) ?? 0,
        });
        break;

      // Known but not indexed block types — skip silently
      case 'SpecialPower':
      case 'DamageFX':
      case 'FXList':
      case 'ObjectCreationList':
      case 'AudioEvent':
      case 'Multisound':
      case 'MusicTrack':
      case 'DialogEvent':
      case 'EvaEvent':
      case 'MappedImage':
      case 'ParticleSystem':
      case 'Animation':
      case 'GameData':
      case 'Terrain':
      case 'Road':
      case 'Bridge':
      case 'Weather':
      case 'WaterSet':
      case 'SkyboxTextureSet':
      case 'Video':
      case 'Campaign':
      case 'Mission':
      case 'CrateData':
      case 'ExperienceLevel':
      case 'ModifierList':
      case 'MultiplayerSettings':
      case 'DrawGroupInfo':
      case 'WindowTransition':
      case 'HeaderTemplate':
      case 'WebpageURL':
      case 'InGameUI':
      case 'ControlBarScheme':
      case 'ControlBarResizer':
      case 'ShellMenuScheme':
      case 'MiscAudio':
      case 'LocomotorSet':
      case 'ClientBehavior':
      case 'ClientUpdate':
      case 'WeaponSet':
      case 'Draw':
      case 'Body':
      case 'ArmorSet':
      case 'AI':
        this.ai = {
          ...this.ai,
          attackUsesLineOfSight: extractBoolean(block.fields['AttackUsesLineOfSight']) ??
            this.ai?.attackUsesLineOfSight,
        };
        break;

      default:
        this.unsupportedBlockTypes.add(block.type);
        this.errors.push({
          type: 'unsupported_block',
          blockType: block.type,
          name: block.name,
          detail: `Unsupported block type: ${block.type}`,
          file: sourcePath,
        });
        break;
    }
  }

  private resolveObjectChain(name: string, visited: Set<string>): ObjectDef | undefined {
    const obj = this.objects.get(name);
    if (!obj) return undefined;
    if (obj.resolved) return obj;

    if (visited.has(name)) {
      obj.hasUnresolvedParent = true;
      obj.resolved = true;
      this.errors.push({
        type: 'unresolved_parent',
        blockType: 'Object',
        name,
        detail: 'Circular inheritance detected',
      });
      return obj;
    }

    visited.add(name);

    if (!obj.parent) {
      obj.resolved = true;
      return obj;
    }

    const parent = this.resolveObjectChain(obj.parent, visited);
    if (!parent) {
      obj.hasUnresolvedParent = true;
      obj.resolved = true;
      this.errors.push({
        type: 'unresolved_parent',
        blockType: 'Object',
        name,
        detail: `Parent "${obj.parent}" not found`,
      });
      return obj;
    }

    // Merge: parent fields are defaults, child fields override
    obj.fields = { ...parent.fields, ...obj.fields };
    obj.blocks = [...parent.blocks, ...obj.blocks];

    // Inherit side and kindOf if not set
    if (!obj.side && parent.side) obj.side = parent.side;
    if (!obj.kindOf && parent.kindOf) obj.kindOf = parent.kindOf;

    obj.resolved = true;
    obj.hasUnresolvedParent = false;
    return obj;
  }

  private getUnresolvedInheritanceCount(): number {
    let count = 0;
    for (const obj of this.objects.values()) {
      if (obj.hasUnresolvedParent) count++;
    }
    return count;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractString(value: IniValue | undefined): string | undefined {
  if (typeof value === 'string') return value;
  return undefined;
}

function extractStringArray(value: IniValue | undefined): string[] | undefined {
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value as string[];
  }
  return undefined;
}

function extractBoolean(value: IniValue | undefined): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === '1') return true;
    if (normalized === 'false' || normalized === 'no' || normalized === '0') return false;
  }
  return undefined;
}

function extractNumber(value: IniValue | undefined): number | undefined {
  const values = readNumericValues(value);
  if (values.length === 0) {
    return undefined;
  }
  const candidate = values[0];
  return Number.isFinite(candidate) ? candidate : undefined;
}

function readNumericValues(value: IniValue | undefined): number[] {
  if (typeof value === 'number') {
    return [value];
  }
  if (typeof value === 'boolean') {
    return [value ? 1 : 0];
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return [parsed];
    }
    return value.split(/[\s,;|]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => Number(part))
      .filter((entry) => Number.isFinite(entry));
  }
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => readNumericValues(entry as IniValue))
      .filter((entry) => Number.isFinite(entry));
  }
  return [];
}

function extractLocomotorSurfaces(value: IniValue | undefined): string[] {
  if (!value) {
    return [];
  }
  const tokens = flattenIniStrings(value)
    .flatMap((token) => token.split(/[\s,;|]+/))
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(tokens));
}

function flattenIniStrings(value: IniValue): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenIniStrings(entry as IniValue));
  }
  return [];
}

function locomotorSurfaceMaskFromNames(names: string[]): number {
  let mask = 0;
  for (const name of names) {
    switch (name) {
      case 'GROUND':
        mask |= 1 << 0;
        break;
      case 'WATER':
        mask |= 1 << 1;
        break;
      case 'CLIFF':
        mask |= 1 << 2;
        break;
      case 'AIR':
        mask |= 1 << 3;
        break;
      case 'RUBBLE':
        mask |= 1 << 4;
        break;
      default:
        break;
    }
  }
  return mask;
}
