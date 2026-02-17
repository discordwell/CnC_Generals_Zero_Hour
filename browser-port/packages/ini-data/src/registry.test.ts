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

    it('indexes CommandButton/CommandSet/AudioEvent families and skips other known non-indexed types', () => {
      registry.loadBlocks([
        makeBlock('CommandButton', 'Btn1', {
          Command: 'ATTACK_MOVE',
          Options: 'NEED_TARGET_POS OK_FOR_MULTI_SELECT',
          UnitSpecificSound: 'UnitSound_AttackMove',
        }),
        makeBlock('CommandSet', 'Set1', {
          1: 'Btn1',
          2: 'BtnMissing',
        }),
        makeBlock('CommandButton', 'BtnNoSound', {
          Command: 'STOP',
          UnitSpecificSound: 'NoSound',
        }),
        makeBlock('FXList', 'FX1', {}),
        makeBlock('AudioEvent', 'Sound1', {
          Priority: 'HIGH',
          Type: 'WORLD PLAYER',
          Control: 'RANDOM',
          Volume: '75%',
          MinVolume: '10%',
          Limit: '2',
          MinRange: '10',
          MaxRange: '250',
        }),
        makeBlock('MusicTrack', 'Track1', {
          Filename: 'music/track1.mp3',
          Type: 'UI',
        }),
        makeBlock('DialogEvent', 'Dialog1', {
          Type: 'VOICE PLAYER',
        }),
        makeBlock('MiscAudio', '', {
          GUIClickSound: 'ClickFX',
          NoCanDoSound: 'ErrorFX',
          RadarNotifyOnlineSound: 'RadarOnline',
        }),
        makeBlock('AI', 'AI', { AttackUsesLineOfSight: '0' }),
      ]);

      expect(registry.objects.size).toBe(0);
      expect(registry.commandButtons.get('Btn1')?.commandTypeName).toBe('ATTACK_MOVE');
      expect(registry.commandButtons.get('Btn1')?.options).toEqual([
        'NEED_TARGET_POS',
        'OK_FOR_MULTI_SELECT',
      ]);
      expect(registry.commandButtons.get('Btn1')?.unitSpecificSoundName).toBe('UnitSound_AttackMove');
      expect(registry.commandButtons.get('BtnNoSound')?.unitSpecificSoundName).toBeUndefined();
      expect(registry.commandSets.get('Set1')?.buttons).toEqual(['Btn1', 'BtnMissing']);
      expect(registry.commandSets.get('Set1')?.slottedButtons).toEqual([
        { slot: 1, commandButtonName: 'Btn1' },
        { slot: 2, commandButtonName: 'BtnMissing' },
      ]);
      expect(registry.getAudioEvent('Sound1')?.soundType).toBe('sound');
      expect(registry.getAudioEvent('Sound1')?.priorityName).toBe('HIGH');
      expect(registry.getAudioEvent('Sound1')?.typeNames).toEqual(['WORLD', 'PLAYER']);
      expect(registry.getAudioEvent('Sound1')?.controlNames).toEqual(['RANDOM']);
      expect(registry.getAudioEvent('Sound1')?.volume).toBeCloseTo(0.75);
      expect(registry.getAudioEvent('Sound1')?.minVolume).toBeCloseTo(0.1);
      expect(registry.getAudioEvent('Sound1')?.limit).toBe(2);
      expect(registry.getAudioEvent('Sound1')?.minRange).toBe(10);
      expect(registry.getAudioEvent('Sound1')?.maxRange).toBe(250);
      expect(registry.getAudioEvent('Track1')?.soundType).toBe('music');
      expect(registry.getAudioEvent('Track1')?.filename).toBe('music/track1.mp3');
      expect(registry.getAudioEvent('Dialog1')?.soundType).toBe('streaming');
      expect(registry.getMiscAudio()?.guiClickSoundName).toBe('ClickFX');
      expect(registry.getMiscAudio()?.noCanDoSoundName).toBe('ErrorFX');
      expect(registry.getMiscAudio()?.entries['RadarNotifyOnlineSound']).toBe('RadarOnline');
      expect(registry.getUnsupportedBlockTypes()).toEqual([]);
    });

    it('keeps sparse CommandSet slots and ignores out-of-range slots', () => {
      registry.loadBlocks([
        makeBlock('CommandSet', 'SparseSet', {
          1: 'BtnA',
          3: 'BtnC',
          13: 'BtnOutOfRange',
        }),
      ]);

      expect(registry.commandSets.get('SparseSet')?.buttons).toEqual(['BtnA', 'BtnC']);
      expect(registry.commandSets.get('SparseSet')?.slottedButtons).toEqual([
        { slot: 1, commandButtonName: 'BtnA' },
        { slot: 3, commandButtonName: 'BtnC' },
      ]);
    });

    it('indexes AI block config values', () => {
      registry.loadBlocks([
        makeBlock('AI', 'AI', { AttackUsesLineOfSight: 'no' }),
      ]);

      expect(registry.getAiConfig()?.attackUsesLineOfSight).toBe(false);
    });

    it('indexes AudioSettings runtime fields', () => {
      registry.loadBlocks([
        makeBlock('AudioSettings', '', {
          SampleCount2D: '10',
          SampleCount3D: '28',
          StreamCount: '3',
          MinSampleVolume: '12%',
          GlobalMinRange: '35',
          GlobalMaxRange: '275',
          Relative2DVolume: '-25%',
          DefaultSoundVolume: '80%',
          Default3DSoundVolume: '70%',
          DefaultSpeechVolume: '60%',
          DefaultMusicVolume: '55%',
        }),
      ]);

      expect(registry.getAudioSettings()).toEqual({
        sampleCount2D: 10,
        sampleCount3D: 28,
        streamCount: 3,
        minSampleVolume: 0.12,
        globalMinRange: 35,
        globalMaxRange: 275,
        relative2DVolume: -0.25,
        defaultSoundVolume: 0.8,
        default3DSoundVolume: 0.7,
        defaultSpeechVolume: 0.6,
        defaultMusicVolume: 0.55,
      });
    });

    it('parses Locomotor Speed from INI data', () => {
      registry.loadBlocks([
        makeBlock('Locomotor', 'TestGroundLocomotor', { Surfaces: ['GROUND'], Speed: '42' }),
      ]);

      const locomotor = registry.getLocomotor('TestGroundLocomotor');

      expect(locomotor?.name).toBe('TestGroundLocomotor');
      expect(locomotor?.speed).toBe(42);
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

  describe('lookup helpers', () => {
    it('gets object by name', () => {
      registry.loadBlocks([
        makeBlock('Object', 'TankA', { Side: 'America' }),
      ]);

      expect(registry.getObject('TankA')?.name).toBe('TankA');
      expect(registry.getWeapon('Missing Weapon')).toBeUndefined();
    });

    it('tracks duplicate definitions as warnings', () => {
      registry.loadBlocks([makeBlock('Object', 'TankA', { Side: 'America' })]);
      registry.loadBlocks([makeBlock('Object', 'TankA', { Side: 'China' })]);

      expect(registry.errors).toHaveLength(1);
      expect(registry.errors[0]!.type).toBe('duplicate');
      expect(registry.objects.get('TankA')?.side).toBe('China');
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
      expect(stats.audioEvents).toBe(0);
      expect(stats.commandButtons).toBe(0);
      expect(stats.commandSets).toBe(0);
      expect(stats.totalBlocks).toBe(7);
    });
  });

  describe('toBundle', () => {
    it('returns deterministic sorted arrays', () => {
      registry.loadBlocks([
        makeBlock('Object', 'TankZ', { Side: 'America' }),
        makeBlock('Object', 'TankA', { Side: 'China' }),
        makeBlock('Weapon', 'GunC', {}),
        makeBlock('Weapon', 'GunA', {}),
      ]);

      const bundle = registry.toBundle();

      expect(bundle.objects[0]!.name).toBe('TankA');
      expect(bundle.objects[1]!.name).toBe('TankZ');
      expect(bundle.weapons[0]!.name).toBe('GunA');
      expect(bundle.weapons[1]!.name).toBe('GunC');
      expect(bundle.stats.objects).toBe(2);
      expect(bundle.stats.weapons).toBe(2);
    });
  });

  describe('loadBundle', () => {
    it('restores registry state from a deterministic bundle', () => {
      const bundle = {
        objects: [
          {
            name: 'TankA',
            side: 'America',
            fields: { Side: 'America', MaxHealth: 100 },
            blocks: [],
            resolved: true,
          },
        ],
        weapons: [
          { name: 'Gun', fields: { Damage: 50 }, blocks: [] },
        ],
        armors: [
          { name: 'HeavyArmor', fields: { MAX_DAMAGE: 10 } },
        ],
        upgrades: [
          { name: 'UpgradeA', fields: { BuildTime: 10 } },
        ],
        sciences: [
          { name: 'ScienceA', fields: { SciencePurchasePointCost: 1 } },
        ],
        factions: [
          { name: 'FactionUSA', side: 'America', fields: { Name: 'USA' } },
        ],
        stats: {
          objects: 1,
          weapons: 1,
          armors: 1,
          upgrades: 1,
          sciences: 1,
          factions: 1,
          audioEvents: 0,
          commandButtons: 0,
          commandSets: 0,
          unresolvedInheritance: 0,
          totalBlocks: 5,
        },
        errors: [
          {
            type: 'duplicate',
            blockType: 'Weapon',
            name: 'Gun',
            detail: 'existing weapon kept',
          },
        ],
        ai: {
          attackUsesLineOfSight: false,
        },
        audioSettings: {
          sampleCount2D: 12,
          sampleCount3D: 36,
          streamCount: 4,
          minSampleVolume: 0.1,
          globalMinRange: 40,
          globalMaxRange: 320,
          relative2DVolume: -0.2,
          defaultSoundVolume: 0.8,
          default3DSoundVolume: 0.7,
          defaultSpeechVolume: 0.6,
          defaultMusicVolume: 0.5,
        },
        unsupportedBlockTypes: ['CommandButton'],
      };

      registry.loadBundle(bundle);

      expect(registry.objects.get('TankA')?.side).toBe('America');
      expect(registry.weapons.get('Gun')?.fields['Damage']).toBe(50);
      expect(registry.getAiConfig()?.attackUsesLineOfSight).toBe(false);
      expect(registry.getAudioSettings()).toEqual({
        sampleCount2D: 12,
        sampleCount3D: 36,
        streamCount: 4,
        minSampleVolume: 0.1,
        globalMinRange: 40,
        globalMaxRange: 320,
        relative2DVolume: -0.2,
        defaultSoundVolume: 0.8,
        default3DSoundVolume: 0.7,
        defaultSpeechVolume: 0.6,
        defaultMusicVolume: 0.5,
      });
      expect(registry.getMiscAudio()).toBeUndefined();
      expect(registry.getUnsupportedBlockTypes()).toEqual(['CommandButton']);
      expect(registry.errors).toHaveLength(1);
      expect(registry.errors[0]!.type).toBe('duplicate');
    });

    it('normalizes legacy CommandSet bundles that do not include slot metadata', () => {
      registry.loadBundle({
        objects: [],
        weapons: [],
        armors: [],
        upgrades: [],
        sciences: [],
        factions: [],
        commandButtons: [],
        commandSets: [
          {
            name: 'LegacySet',
            fields: {},
            buttons: ['BtnOne', 'BtnTwo'],
          },
        ],
        stats: {
          objects: 0,
          weapons: 0,
          armors: 0,
          upgrades: 0,
          sciences: 0,
          factions: 0,
          audioEvents: 0,
          commandButtons: 0,
          commandSets: 1,
          unresolvedInheritance: 0,
          totalBlocks: 0,
        },
        errors: [],
        unsupportedBlockTypes: [],
      });

      expect(registry.commandSets.get('LegacySet')?.slottedButtons).toEqual([
        { slot: 1, commandButtonName: 'BtnOne' },
        { slot: 2, commandButtonName: 'BtnTwo' },
      ]);
    });
  });

  describe('MiscAudio merging', () => {
    it('merges repeated MiscAudio blocks with later overrides', () => {
      registry.loadBlocks([
        makeBlock('MiscAudio', '', {
          GUIClickSound: 'Click_A',
          NoCanDoSound: 'NoCanDo_A',
        }),
      ]);
      registry.loadBlocks([
        makeBlock('MiscAudio', '', {
          GUIClickSound: 'Click_B',
        }),
      ]);

      expect(registry.getMiscAudio()?.guiClickSoundName).toBe('Click_B');
      expect(registry.getMiscAudio()?.noCanDoSoundName).toBe('NoCanDo_A');
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
