import { describe, it, expect, beforeEach } from 'vitest';
import { IniDataRegistry } from './registry.js';
import type { IniBlock } from '@generals/core';

function makeBlock(type: string, name: string, fields: Record<string, unknown> = {}, extra: Partial<IniBlock> = {}): IniBlock {
  return {
    type,
    name,
    fields: fields as Record<string, import('@generals/core').IniValue>,
    blocks: [],
    ...extra,
  };
}

describe('IniDataRegistry', () => {
  let registry: IniDataRegistry;

  beforeEach(() => {
    registry = new IniDataRegistry();
  });

  describe('loadBlocks', () => {
    it('indexes objects by name', () => {
      registry.loadBlocks([
        makeBlock('Object', 'TankA', { Side: 'America', MaxHealth: 300 }),
        makeBlock('Object', 'TankB', { Side: 'China', MaxHealth: 200 }),
      ]);

      expect(registry.objects.size).toBe(2);
      expect(registry.objects.get('TankA')!.side).toBe('America');
      expect(registry.objects.get('TankB')!.side).toBe('China');
    });

    it('indexes weapons', () => {
      registry.loadBlocks([
        makeBlock('Weapon', 'TankGun', { Damage: 50, Range: 200 }),
      ]);

      expect(registry.weapons.size).toBe(1);
      expect(registry.weapons.get('TankGun')!.fields['Damage']).toBe(50);
    });

    it('indexes armors', () => {
      registry.loadBlocks([
        makeBlock('Armor', 'TankArmor', { Default: 1, SMALL_ARMS: 0.1 }),
      ]);

      expect(registry.armors.size).toBe(1);
    });

    it('indexes upgrades', () => {
      registry.loadBlocks([
        makeBlock('Upgrade', 'ArmorUpgrade', { BuildCost: 500 }),
      ]);

      expect(registry.upgrades.size).toBe(1);
    });

    it('indexes sciences', () => {
      registry.loadBlocks([
        makeBlock('Science', 'SCIENCE_Pathfinder', { SciencePurchasePointCost: 1 }),
      ]);

      expect(registry.sciences.size).toBe(1);
    });

    it('indexes PlayerTemplate as factions', () => {
      registry.loadBlocks([
        makeBlock('PlayerTemplate', 'FactionAmerica', { Side: 'America' }),
        makeBlock('PlayerTemplate', 'FactionChina', { Side: 'China' }),
      ]);

      expect(registry.factions.size).toBe(2);
      expect(registry.factions.get('FactionAmerica')!.side).toBe('America');
    });

    it('tracks KindOf arrays', () => {
      registry.loadBlocks([
        makeBlock('Object', 'Tank', { KindOf: ['VEHICLE', 'SELECTABLE', 'CAN_ATTACK'] }),
      ]);

      expect(registry.objects.get('Tank')!.kindOf).toEqual(['VEHICLE', 'SELECTABLE', 'CAN_ATTACK']);
    });

    it('handles ChildObject type', () => {
      registry.loadBlocks([
        makeBlock('ChildObject', 'AdvTank', { MaxHealth: 500 }, { parent: 'BaseTank' }),
      ]);

      expect(registry.objects.size).toBe(1);
      expect(registry.objects.get('AdvTank')!.parent).toBe('BaseTank');
    });

    it('tracks unsupported block types', () => {
      registry.loadBlocks([
        makeBlock('CustomThing', 'Foo', {}),
      ]);

      expect(registry.getUnsupportedBlockTypes()).toEqual(['CustomThing']);
    });

    it('silently skips known non-indexed types', () => {
      registry.loadBlocks([
        makeBlock('CommandButton', 'Btn1', {}),
        makeBlock('FXList', 'FX1', {}),
        makeBlock('AudioEvent', 'Sound1', {}),
      ]);

      expect(registry.objects.size).toBe(0);
      expect(registry.getUnsupportedBlockTypes()).toEqual([]);
    });
  });

  describe('getObjectsByKind', () => {
    it('filters by KindOf flag', () => {
      registry.loadBlocks([
        makeBlock('Object', 'Tank', { KindOf: ['VEHICLE', 'CAN_ATTACK'] }),
        makeBlock('Object', 'Infantry', { KindOf: ['INFANTRY', 'CAN_ATTACK'] }),
        makeBlock('Object', 'Building', { KindOf: ['STRUCTURE'] }),
      ]);

      expect(registry.getObjectsByKind('CAN_ATTACK')).toHaveLength(2);
      expect(registry.getObjectsByKind('STRUCTURE')).toHaveLength(1);
      expect(registry.getObjectsByKind('AIRCRAFT')).toHaveLength(0);
    });
  });

  describe('getObjectsBySide', () => {
    it('filters by side', () => {
      registry.loadBlocks([
        makeBlock('Object', 'USATank', { Side: 'America' }),
        makeBlock('Object', 'ChinaTank', { Side: 'China' }),
        makeBlock('Object', 'GLATank', { Side: 'GLA' }),
      ]);

      expect(registry.getObjectsBySide('America')).toHaveLength(1);
      expect(registry.getObjectsBySide('China')).toHaveLength(1);
    });
  });

  describe('resolveInheritance', () => {
    it('merges parent fields into child', () => {
      registry.loadBlocks([
        makeBlock('Object', 'BaseTank', { Side: 'America', MaxHealth: 100, Armor: 'Light' }),
        makeBlock('Object', 'AdvTank', { MaxHealth: 500 }, { parent: 'BaseTank' }),
      ]);

      registry.resolveInheritance();

      const adv = registry.objects.get('AdvTank')!;
      expect(adv.resolved).toBe(true);
      expect(adv.fields['MaxHealth']).toBe(500); // overridden
      expect(adv.fields['Armor']).toBe('Light'); // inherited
      expect(adv.side).toBe('America'); // inherited
    });

    it('handles multi-level inheritance', () => {
      registry.loadBlocks([
        makeBlock('Object', 'Base', { Level: 1, A: 'a' }),
        makeBlock('Object', 'Mid', { Level: 2, B: 'b' }, { parent: 'Base' }),
        makeBlock('Object', 'Top', { Level: 3, C: 'c' }, { parent: 'Mid' }),
      ]);

      registry.resolveInheritance();

      const top = registry.objects.get('Top')!;
      expect(top.fields['Level']).toBe(3);
      expect(top.fields['A']).toBe('a');
      expect(top.fields['B']).toBe('b');
      expect(top.fields['C']).toBe('c');
    });

    it('reports unresolved parent', () => {
      registry.loadBlocks([
        makeBlock('Object', 'Orphan', { MaxHealth: 100 }, { parent: 'NonExistent' }),
      ]);

      registry.resolveInheritance();

      expect(registry.errors).toHaveLength(1);
      expect(registry.errors[0]!.type).toBe('unresolved_parent');
      expect(registry.errors[0]!.detail).toContain('NonExistent');
    });

    it('handles circular inheritance', () => {
      registry.loadBlocks([
        makeBlock('Object', 'A', {}, { parent: 'B' }),
        makeBlock('Object', 'B', {}, { parent: 'A' }),
      ]);

      registry.resolveInheritance();

      expect(registry.errors.some((e) => e.detail.includes('Circular'))).toBe(true);
    });

    it('inherits KindOf from parent', () => {
      registry.loadBlocks([
        makeBlock('Object', 'BaseVehicle', { KindOf: ['VEHICLE', 'SELECTABLE'] }),
        makeBlock('Object', 'Tank', { MaxHealth: 300 }, { parent: 'BaseVehicle' }),
      ]);

      registry.resolveInheritance();

      expect(registry.objects.get('Tank')!.kindOf).toEqual(['VEHICLE', 'SELECTABLE']);
    });
  });

  describe('getStats', () => {
    it('returns correct counts', () => {
      registry.loadBlocks([
        makeBlock('Object', 'Tank1', {}),
        makeBlock('Object', 'Tank2', {}),
        makeBlock('Weapon', 'Gun1', {}),
        makeBlock('Armor', 'Armor1', {}),
        makeBlock('Upgrade', 'Upgrade1', {}),
        makeBlock('Science', 'Science1', {}),
        makeBlock('PlayerTemplate', 'Faction1', {}),
      ]);

      const stats = registry.getStats();
      expect(stats.objects).toBe(2);
      expect(stats.weapons).toBe(1);
      expect(stats.armors).toBe(1);
      expect(stats.upgrades).toBe(1);
      expect(stats.sciences).toBe(1);
      expect(stats.factions).toBe(1);
      expect(stats.totalBlocks).toBe(7);
    });
  });

  describe('multiple loadBlocks calls', () => {
    it('accumulates across multiple loads', () => {
      registry.loadBlocks([makeBlock('Object', 'A', {})]);
      registry.loadBlocks([makeBlock('Object', 'B', {})]);
      registry.loadBlocks([makeBlock('Weapon', 'Gun', {})]);

      expect(registry.objects.size).toBe(2);
      expect(registry.weapons.size).toBe(1);
    });
  });
});
