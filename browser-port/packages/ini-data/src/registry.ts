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

export interface ScienceDef {
  name: string;
  fields: Record<string, IniValue>;
}

export interface FactionDef {
  name: string;
  side?: string;
  fields: Record<string, IniValue>;
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
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class IniDataRegistry {
  readonly objects = new Map<string, ObjectDef>();
  readonly weapons = new Map<string, WeaponDef>();
  readonly armors = new Map<string, ArmorDef>();
  readonly upgrades = new Map<string, UpgradeDef>();
  readonly sciences = new Map<string, ScienceDef>();
  readonly factions = new Map<string, FactionDef>();
  readonly errors: RegistryError[] = [];

  private unsupportedBlockTypes = new Set<string>();

  /** Load parsed INI blocks (from CLI JSON output or parseIni result). */
  loadBlocks(blocks: IniBlock[]): void {
    for (const block of blocks) {
      this.indexBlock(block);
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

  /** Get summary statistics. */
  getStats(): RegistryStats {
    let unresolvedInheritance = 0;
    for (const obj of this.objects.values()) {
      if (obj.parent && !obj.resolved) unresolvedInheritance++;
    }

    return {
      objects: this.objects.size,
      weapons: this.weapons.size,
      armors: this.armors.size,
      upgrades: this.upgrades.size,
      sciences: this.sciences.size,
      factions: this.factions.size,
      unresolvedInheritance,
      totalBlocks: this.objects.size + this.weapons.size + this.armors.size +
        this.upgrades.size + this.sciences.size + this.factions.size,
    };
  }

  /** Get unsupported block types encountered during loading. */
  getUnsupportedBlockTypes(): string[] {
    return [...this.unsupportedBlockTypes].sort();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private indexBlock(block: IniBlock): void {
    switch (block.type) {
      case 'Object':
      case 'ChildObject':
        this.objects.set(block.name, {
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
        this.weapons.set(block.name, {
          name: block.name,
          parent: block.parent,
          fields: block.fields,
          blocks: block.blocks,
        });
        break;

      case 'Armor':
        this.armors.set(block.name, {
          name: block.name,
          fields: block.fields,
        });
        break;

      case 'Upgrade':
        this.upgrades.set(block.name, {
          name: block.name,
          fields: block.fields,
        });
        break;

      case 'Science':
        this.sciences.set(block.name, {
          name: block.name,
          fields: block.fields,
        });
        break;

      case 'PlayerTemplate':
      case 'Faction':
        this.factions.set(block.name, {
          name: block.name,
          side: extractString(block.fields['Side']),
          fields: block.fields,
        });
        break;

      // Known but not indexed block types — skip silently
      case 'CommandButton':
      case 'CommandSet':
      case 'SpecialPower':
      case 'Locomotor':
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
        break;

      default:
        this.unsupportedBlockTypes.add(block.type);
        break;
    }
  }

  private resolveObjectChain(name: string, visited: Set<string>): ObjectDef | undefined {
    const obj = this.objects.get(name);
    if (!obj) return undefined;
    if (obj.resolved) return obj;
    if (visited.has(name)) {
      this.errors.push({
        type: 'unresolved_parent',
        blockType: 'Object',
        name,
        detail: `Circular inheritance detected`,
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
      this.errors.push({
        type: 'unresolved_parent',
        blockType: 'Object',
        name,
        detail: `Parent "${obj.parent}" not found`,
      });
      obj.resolved = true; // Mark as resolved to avoid re-processing
      return obj;
    }

    // Merge: parent fields are defaults, child fields override
    const mergedFields = { ...parent.fields, ...obj.fields };
    const mergedBlocks = [...parent.blocks, ...obj.blocks];

    // Inherit side and kindOf if not set
    if (!obj.side && parent.side) obj.side = parent.side;
    if (!obj.kindOf && parent.kindOf) obj.kindOf = parent.kindOf;

    obj.fields = mergedFields;
    obj.blocks = mergedBlocks;
    obj.resolved = true;
    return obj;
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
