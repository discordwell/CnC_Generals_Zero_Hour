import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import type { IniBlock } from '@generals/core';
import {
  type ArmorDef,
  type CommandButtonDef,
  type CommandSetDef,
  IniDataRegistry,
  type IniDataBundle,
  type LocomotorDef,
  type ObjectDef,
  type ObjectCreationListDef,
  type SpecialPowerDef,
  type ScienceDef,
  type UpgradeDef,
  type WeaponDef,
} from '@generals/ini-data';
import { HeightmapGrid, type MapDataJSON, type MapObjectJSON, uint8ArrayToBase64 } from '@generals/terrain';

import { GameLogicSubsystem } from './index.js';

function makeBlock(
  type: string,
  name: string,
  fields: Record<string, unknown>,
  blocks: IniBlock[] = [],
): IniBlock {
  return {
    type,
    name,
    fields: fields as Record<string, string | number | boolean | string[] | number[]>,
    blocks,
  };
}

function makeObjectDef(
  name: string,
  side: string,
  kindOf: string[],
  blocks: IniBlock[],
  fields: Record<string, unknown> = {},
): ObjectDef {
  return {
    name,
    side,
    kindOf,
    fields: fields as Record<string, string | number | boolean | string[] | number[]>,
    blocks,
    resolved: true,
  };
}

function makeWeaponDef(name: string, fields: Record<string, unknown>): WeaponDef {
  return {
    name,
    fields: fields as Record<string, string | number | boolean | string[] | number[]>,
    blocks: [],
  };
}

function makeArmorDef(name: string, fields: Record<string, unknown>): ArmorDef {
  return {
    name,
    fields: fields as Record<string, string | number | boolean | string[] | number[]>,
  };
}

function makeLocomotorDef(name: string, speed: number): LocomotorDef {
  return {
    name,
    fields: { Speed: speed },
    surfaces: ['GROUND'],
    surfaceMask: 1,
    downhillOnly: false,
    speed,
  };
}

function makeUpgradeDef(
  name: string,
  fields: Record<string, unknown>,
  blocks: IniBlock[] = [],
  kindOf?: string[],
): UpgradeDef {
  return {
    name,
    fields: fields as Record<string, string | number | boolean | string[] | number[]>,
    blocks,
    kindOf: kindOf ? [...kindOf] : undefined,
  };
}

function makeCommandButtonDef(name: string, fields: Record<string, unknown>): CommandButtonDef {
  return {
    name,
    fields: fields as Record<string, string | number | boolean | string[] | number[]>,
  };
}

function makeCommandSetDef(name: string, fields: Record<string, unknown>): CommandSetDef {
  return {
    name,
    fields: fields as Record<string, string | number | boolean | string[] | number[]>,
  };
}

function makeScienceDef(name: string, fields: Record<string, unknown>): ScienceDef {
  return {
    name,
    fields: fields as Record<string, string | number | boolean | string[] | number[]>,
  };
}

function makeBundle(params: {
  objects: ObjectDef[];
  weapons?: WeaponDef[];
  armors?: ArmorDef[];
  upgrades?: UpgradeDef[];
  specialPowers?: SpecialPowerDef[];
  objectCreationLists?: ObjectCreationListDef[];
  commandButtons?: CommandButtonDef[];
  commandSets?: CommandSetDef[];
  sciences?: ScienceDef[];
  locomotors?: LocomotorDef[];
}): IniDataBundle {
  const weapons = params.weapons ?? [];
  const armors = params.armors ?? [];
  const upgrades = params.upgrades ?? [];
  const specialPowers = params.specialPowers ?? [];
  const objectCreationLists = params.objectCreationLists ?? [];
  const commandButtons = params.commandButtons ?? [];
  const commandSets = params.commandSets ?? [];
  const sciences = params.sciences ?? [];
  const locomotors = params.locomotors ?? [];
  return {
    objects: params.objects,
    specialPowers,
    objectCreationLists,
    weapons,
    armors,
    upgrades,
    commandButtons,
    commandSets,
    sciences,
    factions: [],
    locomotors,
    ai: {
      attackUsesLineOfSight: true,
    },
    stats: {
      objects: params.objects.length,
      weapons: weapons.length,
      armors: armors.length,
      upgrades: upgrades.length,
      sciences: sciences.length,
      factions: 0,
      unresolvedInheritance: 0,
      totalBlocks:
        params.objects.length
        + weapons.length
        + armors.length
        + upgrades.length
        + specialPowers.length
        + objectCreationLists.length
        + commandButtons.length
        + commandSets.length
        + sciences.length
        + locomotors.length,
    },
    errors: [],
    unsupportedBlockTypes: [],
  };
}

function makeRegistry(bundle: IniDataBundle): IniDataRegistry {
  const registry = new IniDataRegistry();
  registry.loadBundle(bundle);
  return registry;
}

function makeHeightmap(width = 8, height = 8): HeightmapGrid {
  const data = new Uint8Array(width * height).fill(0);
  return HeightmapGrid.fromJSON({
    width,
    height,
    borderSize: 0,
    data: uint8ArrayToBase64(data),
  });
}

function makeMap(objects: MapObjectJSON[], width = 8, height = 8): MapDataJSON {
  const data = new Uint8Array(width * height).fill(0);
  return {
    heightmap: {
      width,
      height,
      borderSize: 0,
      data: uint8ArrayToBase64(data),
    },
    objects,
    triggers: [],
    textureClasses: [],
    blendTileCount: 0,
  };
}

function makeMapObject(
  templateName: string,
  x: number,
  y: number,
  properties: Record<string, string> = {},
): MapObjectJSON {
  return {
    templateName,
    angle: 0,
    flags: 0,
    position: { x, y, z: 0 },
    properties,
  };
}

const COMMAND_OPTION_NEED_TARGET_ENEMY_OBJECT = 0x00000001;
const COMMAND_OPTION_NEED_TARGET_POS = 0x00000020;

type SpecialPowerCaptureEvent =
  | {
    type: 'noTarget';
    sourceEntityId: number;
    specialPowerName: string;
    commandOption: number;
    commandButtonId: string;
    targetEntityId?: undefined;
    targetX?: undefined;
    targetZ?: undefined;
  }
  | {
    type: 'targetPosition';
    sourceEntityId: number;
    specialPowerName: string;
    commandOption: number;
    commandButtonId: string;
    targetX: number;
    targetZ: number;
    targetEntityId?: undefined;
  }
  | {
    type: 'targetObject';
    sourceEntityId: number;
    specialPowerName: string;
    commandOption: number;
    commandButtonId: string;
    targetEntityId: number;
    targetX?: undefined;
    targetZ?: undefined;
  };

class SpecialPowerCaptureSubsystem extends GameLogicSubsystem {
  public readonly events: SpecialPowerCaptureEvent[] = [];

  protected onIssueSpecialPowerNoTarget(
    sourceEntityId: number,
    specialPowerName: string,
    commandOption: number,
    commandButtonId: string,
    _specialPowerDef: SpecialPowerDef,
  ): void {
    this.events.push({
      type: 'noTarget',
      sourceEntityId,
      specialPowerName,
      commandOption,
      commandButtonId,
    });
  }

  protected onIssueSpecialPowerTargetPosition(
    sourceEntityId: number,
    specialPowerName: string,
    targetX: number,
    targetZ: number,
    commandOption: number,
    commandButtonId: string,
    _specialPowerDef: SpecialPowerDef,
  ): void {
    this.events.push({
      type: 'targetPosition',
      sourceEntityId,
      specialPowerName,
      commandOption,
      commandButtonId,
      targetX,
      targetZ,
    });
  }

  protected onIssueSpecialPowerTargetObject(
    sourceEntityId: number,
    specialPowerName: string,
    targetEntityId: number,
    commandOption: number,
    commandButtonId: string,
    _specialPowerDef: SpecialPowerDef,
  ): void {
    this.events.push({
      type: 'targetObject',
      sourceEntityId,
      specialPowerName,
      commandOption,
      commandButtonId,
      targetEntityId,
    });
  }
}

function makeSpecialPowerCaptureSetup(
  options: { reloadTimeMs?: number; sharedSyncedTimer?: boolean } = {},
): {
  logic: SpecialPowerCaptureSubsystem;
  bundle: ReturnType<typeof makeBundle>;
  map: ReturnType<typeof makeMap>;
} {
  const reloadTimeMs = options.reloadTimeMs ?? 0;
  const sharedSyncedTimer = options.sharedSyncedTimer === true;
  const bundle = makeBundle({
    objects: [
      makeObjectDef('CasterA', 'America', ['CAN_ATTACK'], []),
      makeObjectDef('CasterB', 'America', ['CAN_ATTACK'], []),
      makeObjectDef('CasterC', 'America', ['CAN_ATTACK'], []),
      makeObjectDef('CasterD', 'America', ['CAN_ATTACK'], []),
      makeObjectDef('EnemyTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody', { MaxHealth: 120, InitialHealth: 120 }),
      ]),
      makeObjectDef('AllyTarget', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody', { MaxHealth: 120, InitialHealth: 120 }),
      ]),
    ],
    specialPowers: [
      {
        name: 'POWER_TEST',
        fields: {
          Type: 'Instant',
          SpecialPowerTemplate: 'OCL_Fx',
          ReloadTime: reloadTimeMs,
          SharedSyncedTimer: sharedSyncedTimer,
        },
        blocks: [],
      },
    ],
  });

  const map = makeMap([
    makeMapObject('CasterA', 5, 10),
    makeMapObject('CasterB', 10, 10),
    makeMapObject('CasterC', 15, 10),
    makeMapObject('CasterD', 20, 10),
    makeMapObject('EnemyTarget', 30, 10),
    makeMapObject('AllyTarget', 40, 10),
  ], 64, 64);
  const logic = new SpecialPowerCaptureSubsystem(new THREE.Scene());
  logic.loadMapObjects(map, makeRegistry(bundle), makeHeightmap(64, 64));
  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);

  return {
    logic,
    bundle,
    map,
  };
}

function makeUnpauseSpecialPowerUpgradeSetup(
  options: { reloadTimeMs?: number; sharedSyncedTimer?: boolean } = {},
): {
  logic: SpecialPowerCaptureSubsystem;
} {
  const reloadTimeMs = options.reloadTimeMs ?? 5000;
  const sharedSyncedTimer = options.sharedSyncedTimer === true;
  const bundle = makeBundle({
    objects: [
      makeObjectDef('UnpausableCaster', 'America', ['CAN_ATTACK'], [
        makeBlock('Behavior', 'UnpauseSpecialPowerUpgrade ModuleTag_Unpause', {
          TriggeredBy: 'Upgrade_Unpause',
          SpecialPowerTemplate: 'POWER_TEST',
        }),
      ]),
      makeObjectDef('FallbackCaster', 'America', ['CAN_ATTACK'], []),
      makeObjectDef('EnemyTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
      ]),
    ],
    specialPowers: [
      {
        name: 'POWER_TEST',
        fields: {
          Type: 'Instant',
          SpecialPowerTemplate: 'OCL_Fx',
          ReloadTime: reloadTimeMs,
          SharedSyncedTimer: sharedSyncedTimer,
        },
        blocks: [],
      },
    ],
    upgrades: [
      makeUpgradeDef(
        'Upgrade_Unpause',
        {
          Type: 'OBJECT',
          BuildTime: 0.1,
          BuildCost: 0,
        },
        [
          makeBlock('Behavior', 'UnpauseSpecialPowerUpgrade ModuleTag_Unpause', {
            TriggeredBy: 'Upgrade_Unpause',
            SpecialPowerTemplate: 'POWER_TEST',
          }),
        ],
      ),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new SpecialPowerCaptureSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('UnpausableCaster', 5, 10),
      makeMapObject('FallbackCaster', 10, 10),
      makeMapObject('EnemyTarget', 20, 10),
    ], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );
  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);

  return { logic };
}

function runCombatTimeline(
  options?: {
    passengersFireUpgradeFrames?: {
      removeAtFrame?: number;
    };
  },
): number[] {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('Attacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'TestCannon'] }),
      ]),
      makeObjectDef('Target', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
    ],
    upgrades: options?.passengersFireUpgradeFrames
      ? [
          makeUpgradeDef('Upgrade_PassengersFire', {
            Type: 'OBJECT',
            BuildTime: 0.1,
            BuildCost: 100,
          }),
          ...(options.passengersFireUpgradeFrames.removeAtFrame === undefined
            ? []
            : [
                makeUpgradeDef(
                  'Upgrade_RemovePassengersFire',
                  {
                    Type: 'OBJECT',
                    BuildTime: 0.1,
                    BuildCost: 100,
                  },
                  [
                    makeBlock('Behavior', 'MaxHealthUpgrade ModuleTag_RemovePassengerFire', {
                      TriggeredBy: 'Upgrade_RemovePassengersFire',
                      RemovesUpgrades: 'Upgrade_PassengersFire',
                      AddMaxHealth: 0,
                    }),
                  ],
                ),
              ]),
        ]
      : [],
    weapons: [
      makeWeaponDef('TestCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        DelayBetweenShots: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  const map = makeMap([
    makeMapObject('Attacker', 10, 10),
    makeMapObject('Target', 30, 10),
  ]);

  logic.loadMapObjects(map, makeRegistry(bundle), makeHeightmap());
  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const timeline: number[] = [];
  for (let frame = 0; frame < 12; frame += 1) {
    logic.update(1 / 30);
    const targetState = logic.getEntityState(2);
    timeline.push(targetState ? targetState.health : -1);
  }

  return timeline;
}

function runArmorUpgradeCombatTimeline(): number[] {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('Attacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'TestRifle'] }),
      ]),
      makeObjectDef('Target', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('ArmorSet', 'ArmorSet', {
          Conditions: 'NONE',
          Armor: 'TargetArmor_Default',
        }),
        makeBlock('ArmorSet', 'ArmorSet', {
          Conditions: 'PLAYER_UPGRADE',
          Armor: 'TargetArmor_Upgraded',
        }),
        makeBlock('Behavior', 'ArmorUpgrade ModuleTag_ArmorUpgrade', {
          TriggeredBy: 'Upgrade_Armor',
        }),
      ]),
    ],
    weapons: [
      makeWeaponDef('TestRifle', {
        AttackRange: 140,
        PrimaryDamage: 40,
        DamageType: 'SMALL_ARMS',
        DelayBetweenShots: 100,
      }),
    ],
    armors: [
      makeArmorDef('TargetArmor_Default', {
        Default: 1,
        SMALL_ARMS: 1,
      }),
      makeArmorDef('TargetArmor_Upgraded', {
        Default: 1,
        SMALL_ARMS: 0.25,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  const map = makeMap([
    makeMapObject('Attacker', 10, 10),
    makeMapObject('Target', 30, 10),
  ]);

  logic.loadMapObjects(map, makeRegistry(bundle), makeHeightmap());
  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const timeline: number[] = [];
  for (let frame = 0; frame < 10; frame += 1) {
    if (frame === 1) {
      logic.submitCommand({ type: 'applyUpgrade', entityId: 2, upgradeName: 'Upgrade_Armor' });
    }
    logic.update(1 / 30);
    const targetState = logic.getEntityState(2);
    timeline.push(targetState ? targetState.health : -1);
  }

  return timeline;
}

function runPrefireTypeCombatTimeline(preAttackType: 'PER_SHOT' | 'PER_ATTACK'): number[] {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('PrefireAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'PrefireCannon'] }),
      ]),
      makeObjectDef('PrefireTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('PrefireCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        DelayBetweenShots: 100,
        PreAttackDelay: 100,
        PreAttackType: preAttackType,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('PrefireAttacker', 10, 10), makeMapObject('PrefireTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const timeline: number[] = [];
  for (let frame = 0; frame < 12; frame += 1) {
    logic.update(1 / 30);
    timeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return timeline;
}

function runPerClipPrefireTimeline(): {
  targetHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('PrefireClipAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'PrefireClipCannon'] }),
      ]),
      makeObjectDef('PrefireClipTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 220, InitialHealth: 220 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('PrefireClipCannon', {
        AttackRange: 120,
        PrimaryDamage: 20,
        DelayBetweenShots: 100,
        ClipSize: 2,
        ClipReloadTime: 200,
        PreAttackDelay: 100,
        PreAttackType: 'PER_CLIP',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('PrefireClipAttacker', 10, 10), makeMapObject('PrefireClipTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const targetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 18; frame += 1) {
    logic.update(1 / 30);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { targetHealthTimeline };
}

function runAutoReloadWhenIdleTimeline(autoReloadWhenIdleMs: number): {
  targetHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('AutoReloadAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'AutoReloadCannon'] }),
      ]),
      makeObjectDef('AutoReloadTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('AutoReloadCannon', {
        AttackRange: 120,
        PrimaryDamage: 20,
        DelayBetweenShots: 100,
        ClipSize: 3,
        ClipReloadTime: 1000,
        PreAttackDelay: 100,
        PreAttackType: 'PER_CLIP',
        AutoReloadWhenIdle: autoReloadWhenIdleMs,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('AutoReloadAttacker', 10, 10), makeMapObject('AutoReloadTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const targetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 16; frame += 1) {
    if (frame === 4) {
      logic.submitCommand({ type: 'stop', entityId: 1 });
    }
    if (frame === 10) {
      logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });
    }

    logic.update(1 / 30);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { targetHealthTimeline };
}

function runWeaponSpeedDelayTimeline(): number[] {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('TravelDelayAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'TravelDelayCannon'] }),
      ]),
      makeObjectDef('TravelDelayTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('TravelDelayCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        DelayBetweenShots: 1000,
        WeaponSpeed: 5,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('TravelDelayAttacker', 10, 10), makeMapObject('TravelDelayTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const timeline: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    logic.update(1 / 30);
    timeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return timeline;
}

function runRadiusDamageAffectsTimeline(): {
  primaryHealthTimeline: number[];
  splashEnemyHealthTimeline: number[];
  splashAllyHealthTimeline: number[];
  attackerHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('RadiusAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'RadiusCannon'] }),
      ]),
      makeObjectDef('RadiusPrimaryTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
      makeObjectDef('RadiusSplashEnemy', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
      makeObjectDef('RadiusSplashAlly', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('RadiusCannon', {
        AttackRange: 140,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 8,
        SecondaryDamage: 15,
        SecondaryDamageRadius: 16,
        RadiusDamageAffects: 'ENEMIES',
        DelayBetweenShots: 1000,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('RadiusAttacker', 10, 10),
      makeMapObject('RadiusPrimaryTarget', 30, 10),
      makeMapObject('RadiusSplashEnemy', 42, 10),
      makeMapObject('RadiusSplashAlly', 42, 16),
    ], 96, 96),
    makeRegistry(bundle),
    makeHeightmap(96, 96),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const primaryHealthTimeline: number[] = [];
  const splashEnemyHealthTimeline: number[] = [];
  const splashAllyHealthTimeline: number[] = [];
  const attackerHealthTimeline: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    primaryHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
    splashEnemyHealthTimeline.push(logic.getEntityState(3)?.health ?? -1);
    splashAllyHealthTimeline.push(logic.getEntityState(4)?.health ?? -1);
    attackerHealthTimeline.push(logic.getEntityState(1)?.health ?? -1);
  }

  return {
    primaryHealthTimeline,
    splashEnemyHealthTimeline,
    splashAllyHealthTimeline,
    attackerHealthTimeline,
  };
}

function runDamageAtSelfPositionTimeline(): {
  farTargetHealthTimeline: number[];
  nearEnemyHealthTimeline: number[];
  nearAllyHealthTimeline: number[];
  attackerHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('SelfDamageAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SelfDamageBurst'] }),
      ]),
      makeObjectDef('SelfDamageFarTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
      makeObjectDef('SelfDamageNearEnemy', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
      makeObjectDef('SelfDamageNearAlly', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('SelfDamageBurst', {
        AttackRange: 140,
        PrimaryDamage: 30,
        PrimaryDamageRadius: 8,
        DamageDealtAtSelfPosition: true,
        RadiusDamageAffects: 'ENEMIES',
        DelayBetweenShots: 1000,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('SelfDamageAttacker', 10, 10),
      makeMapObject('SelfDamageFarTarget', 30, 10),
      makeMapObject('SelfDamageNearEnemy', 15, 10),
      makeMapObject('SelfDamageNearAlly', 15, 15),
    ], 96, 96),
    makeRegistry(bundle),
    makeHeightmap(96, 96),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const farTargetHealthTimeline: number[] = [];
  const nearEnemyHealthTimeline: number[] = [];
  const nearAllyHealthTimeline: number[] = [];
  const attackerHealthTimeline: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    farTargetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
    nearEnemyHealthTimeline.push(logic.getEntityState(3)?.health ?? -1);
    nearAllyHealthTimeline.push(logic.getEntityState(4)?.health ?? -1);
    attackerHealthTimeline.push(logic.getEntityState(1)?.health ?? -1);
  }

  return {
    farTargetHealthTimeline,
    nearEnemyHealthTimeline,
    nearAllyHealthTimeline,
    attackerHealthTimeline,
  };
}

function runRadiusDamageAngleTimeline(): {
  primaryHealthTimeline: number[];
  inConeEnemyHealthTimeline: number[];
  outOfConeEnemyHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ConeAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 160, InitialHealth: 160 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ConeCannon'] }),
      ]),
      makeObjectDef('ConePrimaryTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 160, InitialHealth: 160 }),
      ]),
      makeObjectDef('ConeEnemyInside', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 160, InitialHealth: 160 }),
      ]),
      makeObjectDef('ConeEnemyOutside', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 160, InitialHealth: 160 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ConeCannon', {
        AttackRange: 220,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 8,
        SecondaryDamage: 20,
        SecondaryDamageRadius: 20,
        RadiusDamageAffects: 'ENEMIES',
        RadiusDamageAngle: 50,
        DelayBetweenShots: 1000,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('ConeAttacker', 20, 20),
      makeMapObject('ConePrimaryTarget', 30, 20),
      makeMapObject('ConeEnemyInside', 30, 30),
      makeMapObject('ConeEnemyOutside', 20, 34),
    ], 128, 128),
    makeRegistry(bundle),
    makeHeightmap(128, 128),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const primaryHealthTimeline: number[] = [];
  const inConeEnemyHealthTimeline: number[] = [];
  const outOfConeEnemyHealthTimeline: number[] = [];
  for (let frame = 0; frame < 3; frame += 1) {
    logic.update(1 / 30);
    primaryHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
    inConeEnemyHealthTimeline.push(logic.getEntityState(3)?.health ?? -1);
    outOfConeEnemyHealthTimeline.push(logic.getEntityState(4)?.health ?? -1);
  }

  return {
    primaryHealthTimeline,
    inConeEnemyHealthTimeline,
    outOfConeEnemyHealthTimeline,
  };
}

function runSuicideAndNotSimilarTimeline(): {
  attackerHealthTimeline: number[];
  farTargetHealthTimeline: number[];
  nearEnemyHealthTimeline: number[];
  nearAllyHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('TerrorUnit', 'America', ['INFANTRY'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SuicideBlast'] }),
      ]),
      makeObjectDef('FarEnemy', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
      makeObjectDef('NearEnemy', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('SuicideBlast', {
        AttackRange: 220,
        PrimaryDamage: 30,
        PrimaryDamageRadius: 8,
        DamageDealtAtSelfPosition: true,
        RadiusDamageAffects: 'SELF ALLIES ENEMIES SUICIDE NOT_SIMILAR',
        DelayBetweenShots: 1000,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('TerrorUnit', 20, 20),
      makeMapObject('FarEnemy', 40, 20),
      makeMapObject('NearEnemy', 25, 20),
      makeMapObject('TerrorUnit', 25, 25),
    ], 128, 128),
    makeRegistry(bundle),
    makeHeightmap(128, 128),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const attackerHealthTimeline: number[] = [];
  const farTargetHealthTimeline: number[] = [];
  const nearEnemyHealthTimeline: number[] = [];
  const nearAllyHealthTimeline: number[] = [];
  for (let frame = 0; frame < 3; frame += 1) {
    logic.update(1 / 30);
    attackerHealthTimeline.push(logic.getEntityState(1)?.health ?? -1);
    farTargetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
    nearEnemyHealthTimeline.push(logic.getEntityState(3)?.health ?? -1);
    nearAllyHealthTimeline.push(logic.getEntityState(4)?.health ?? -1);
  }

  return {
    attackerHealthTimeline,
    farTargetHealthTimeline,
    nearEnemyHealthTimeline,
    nearAllyHealthTimeline,
  };
}

function runProjectileDeliveryTimeline(useProjectileObject: boolean): number[] {
  const weaponName = useProjectileObject ? 'ProjectileCannon' : 'DirectCannon';
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ProjectileTimingAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', weaponName] }),
      ]),
      makeObjectDef('ProjectileTimingTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ProjectileCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        WeaponSpeed: 999999,
        DelayBetweenShots: 1000,
        ProjectileObject: 'DummyProjectile',
      }),
      makeWeaponDef('DirectCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        WeaponSpeed: 999999,
        DelayBetweenShots: 1000,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('ProjectileTimingAttacker', 10, 10), makeMapObject('ProjectileTimingTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const timeline: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    timeline.push(logic.getEntityState(2)?.health ?? -1);
  }
  return timeline;
}

function runDirectImmediateDuelTimeline(): {
  firstHealthTimeline: number[];
  secondHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('DuelTankA', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'InstantDuelCannon'] }),
      ]),
      makeObjectDef('DuelTankB', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'InstantDuelCannon'] }),
      ]),
    ],
    weapons: [
      makeWeaponDef('InstantDuelCannon', {
        AttackRange: 120,
        PrimaryDamage: 200,
        WeaponSpeed: 999999,
        DelayBetweenShots: 1000,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('DuelTankA', 10, 10), makeMapObject('DuelTankB', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });
  logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

  const firstHealthTimeline: number[] = [];
  const secondHealthTimeline: number[] = [];
  for (let frame = 0; frame < 3; frame += 1) {
    logic.update(1 / 30);
    firstHealthTimeline.push(logic.getEntityState(1)?.health ?? -1);
    secondHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { firstHealthTimeline, secondHealthTimeline };
}

function runScaledProjectileDeliveryTimeline(useScaledSpeed: boolean): number[] {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ScaledProjectileAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ScaledProjectileCannon'] }),
      ]),
      makeObjectDef('ScaledProjectileTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ScaledProjectileCannon', {
        AttackRange: 120,
        MinimumAttackRange: 20,
        PrimaryDamage: 30,
        WeaponSpeed: 60,
        MinWeaponSpeed: 10,
        ScaleWeaponSpeed: useScaledSpeed,
        DelayBetweenShots: 1000,
        ProjectileObject: 'DummyProjectile',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('ScaledProjectileAttacker', 10, 10), makeMapObject('ScaledProjectileTarget', 70, 10)], 96, 96),
    makeRegistry(bundle),
    makeHeightmap(96, 96),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const timeline: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    timeline.push(logic.getEntityState(2)?.health ?? -1);
  }
  return timeline;
}

function runProjectileMovingTargetPointHitTimeline(targetMovesBeforeImpact: boolean): number[] {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ProjectilePointHitAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ProjectilePointHitCannon'] }),
      ]),
      makeObjectDef('ProjectilePointHitTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ProjectilePointHitCannon', {
        AttackRange: 180,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 10,
        DelayBetweenShots: 1000,
        ProjectileObject: 'DummyProjectile',
      }),
    ],
    locomotors: [
      makeLocomotorDef('LocomotorFast', 180),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('ProjectilePointHitAttacker', 20, 20), makeMapObject('ProjectilePointHitTarget', 50, 20)], 128, 128),
    makeRegistry(bundle),
    makeHeightmap(128, 128),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  if (targetMovesBeforeImpact) {
    logic.submitCommand({ type: 'moveTo', entityId: 2, targetX: 110, targetZ: 20 });
  }
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const timeline: number[] = [];
  for (let frame = 0; frame < 7; frame += 1) {
    logic.update(1 / 30);
    timeline.push(logic.getEntityState(2)?.health ?? -1);
  }
  return timeline;
}

function runProjectileIncidentalCollisionMaskTimeline(projectileCollidesWith: string): {
  targetHealthTimeline: number[];
  blockerHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ProjectileMaskAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ProjectileMaskCannon'] }),
      ]),
      makeObjectDef('ProjectileMaskTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
      ]),
      makeObjectDef('ProjectileMaskBlocker', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ProjectileMaskCannon', {
        AttackRange: 180,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 10,
        DelayBetweenShots: 1000,
        ProjectileObject: 'DummyProjectile',
        ProjectileCollidesWith: projectileCollidesWith,
      }),
    ],
    locomotors: [
      makeLocomotorDef('LocomotorFast', 180),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('ProjectileMaskAttacker', 20, 20),
      makeMapObject('ProjectileMaskTarget', 50, 20),
      makeMapObject('ProjectileMaskBlocker', 50, 20),
    ], 128, 128),
    makeRegistry(bundle),
    makeHeightmap(128, 128),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'moveTo', entityId: 2, targetX: 110, targetZ: 20 });
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const targetHealthTimeline: number[] = [];
  const blockerHealthTimeline: number[] = [];
  for (let frame = 0; frame < 7; frame += 1) {
    logic.update(1 / 30);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
    blockerHealthTimeline.push(logic.getEntityState(3)?.health ?? -1);
  }

  return { targetHealthTimeline, blockerHealthTimeline };
}

function runProjectileContainedByCollisionTimeline(): {
  targetHealthTimeline: number[];
  containingAirfieldHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ContainingAirfield', 'America', ['STRUCTURE', 'FS_AIRFIELD'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 2,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [0, 0, 0],
          ExitDelay: 0,
        }),
        makeBlock('Behavior', 'ParkingPlaceBehavior ModuleTag_Parking', {
          NumRows: 1,
          NumCols: 1,
        }),
      ]),
      makeObjectDef('EscapeTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
      ]),
      makeObjectDef('ContainedLauncher', 'America', ['AIRCRAFT'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ContainedLauncherCannon'] }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
      ], {
        BuildCost: 100,
        BuildTime: 0.1,
      }),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ContainedLauncherCannon', {
        AttackRange: 180,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 10,
        DelayBetweenShots: 1000,
        ProjectileObject: 'DummyProjectile',
        ProjectileCollidesWith: 'CONTROLLED_STRUCTURES',
      }),
    ],
    locomotors: [
      makeLocomotorDef('LocomotorFast', 180),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('ContainingAirfield', 50, 20), makeMapObject('EscapeTarget', 50, 20)], 128, 128),
    makeRegistry(bundle),
    makeHeightmap(128, 128),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'ContainedLauncher' });

  let launcherId: number | null = null;
  for (let frame = 0; frame < 10; frame += 1) {
    logic.update(1 / 30);
    launcherId = logic.getEntityIdsByTemplate('ContainedLauncher')[0] ?? null;
    if (launcherId !== null) {
      break;
    }
  }
  if (launcherId === null) {
    throw new Error('ContainedLauncher did not spawn');
  }

  logic.submitCommand({ type: 'moveTo', entityId: 2, targetX: 110, targetZ: 20 });
  logic.submitCommand({ type: 'attackEntity', entityId: launcherId, targetEntityId: 2 });

  const targetHealthTimeline: number[] = [];
  const containingAirfieldHealthTimeline: number[] = [];
  for (let frame = 0; frame < 7; frame += 1) {
    logic.update(1 / 30);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
    containingAirfieldHealthTimeline.push(logic.getEntityState(1)?.health ?? -1);
  }

  return { targetHealthTimeline, containingAirfieldHealthTimeline };
}

function runContainPassengerAllowedToFireTimeline(
  containType: 'Open' | 'Transport' | 'Overlord' | 'Helix' | 'Garrison',
  passengersAllowedToFire: boolean,
  passengerKind: 'INFANTRY' | 'VEHICLE' = 'INFANTRY',
  options?: {
    passengerTemplateName?: string;
    payloadTemplateNames?: string[];
    containerDisabledSubduedFrames?: {
      disableAtFrame: number;
      restoreAtFrame?: number;
    };
    passengersFireUpgradeFrames?: {
      enableAtFrame: number;
      removeAtFrame?: number;
    };
  },
): {
  targetHealthTimeline: number[];
  containerHealthTimeline: number[];
  containerStatusFlagsTimeline: string[][];
} {
  const passengerTemplateName = options?.passengerTemplateName ?? `${containType}ContainPassenger`;
  const payloadTemplateNames = options?.payloadTemplateNames ?? [];
  const containTypeToBlockName: Record<typeof containType, string> = {
    Open: 'OpenContain',
    Transport: 'TransportContain',
    Overlord: 'OverlordContain',
    Helix: 'HelixContain',
    Garrison: 'GarrisonContain',
  };

  const containerTemplateName = `${containType}ContainmentPad`;
  const bundle = makeBundle({
    upgrades: options?.passengersFireUpgradeFrames
      ? [
          makeUpgradeDef('Upgrade_PassengersFire', {
            Type: 'OBJECT',
            BuildTime: 0.1,
            BuildCost: 100,
          }),
          ...(options.passengersFireUpgradeFrames.removeAtFrame === undefined
            ? []
            : [
                makeUpgradeDef(
                  'Upgrade_RemovePassengersFire',
                  {
                    Type: 'OBJECT',
                    BuildTime: 0.1,
                    BuildCost: 100,
                  },
                  [
                    makeBlock('Behavior', 'MaxHealthUpgrade ModuleTag_RemovePassengerFire', {
                      TriggeredBy: 'Upgrade_RemovePassengersFire',
                      RemovesUpgrades: 'Upgrade_PassengersFire',
                      AddMaxHealth: 0,
                    }),
                  ],
                ),
              ]),
        ]
      : [],
    objects: [
      makeObjectDef(
        containerTemplateName,
        'America',
        ['STRUCTURE', 'COMMANDCENTER'],
        [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 1,
          }),
          makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
            UnitCreatePoint: [0, 0, 0],
            ExitDelay: 0,
          }),
          makeBlock('Behavior', 'ParkingPlaceBehavior ModuleTag_Parking', {
            NumRows: 1,
            NumCols: 1,
          }),
          makeBlock('Behavior', `${containTypeToBlockName[containType]} ModuleTag_${containType}Contain`, {
            PassengersAllowedToFire: passengersAllowedToFire ? 'Yes' : 'No',
            ...(containType === 'Helix' && payloadTemplateNames.length > 0
              ? { PayloadTemplateName: payloadTemplateNames }
              : {}),
          }),
          ...(options?.passengersFireUpgradeFrames
            ? [
                makeBlock('Behavior', 'PassengersFireUpgrade ModuleTag_EnablePassengerFire', {
                  TriggeredBy: 'Upgrade_PassengersFire',
                }),
              ]
            : []),
          ...(options?.containerDisabledSubduedFrames
            ? [
                makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Disable', {
                  TriggeredBy: 'Upgrade_Disable_GarrisonContainSubdued',
                  StatusToSet: 'DISABLED_SUBDUED',
                }),
                makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Restore', {
                  TriggeredBy: 'Upgrade_Restore_GarrisonContainSubdued',
                  StatusToClear: 'DISABLED_SUBDUED',
                }),
              ]
            : []),
        ],
      ),
      makeObjectDef(passengerTemplateName, 'America', [passengerKind], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', `${containType}ContainCannon`] }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
      ], {
        BuildCost: 100,
        BuildTime: 0.1,
      }),
      makeObjectDef(`${containType}ContainTarget`, 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef(`${containType}ContainCannon`, {
        AttackRange: 180,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 1000,
        DelayBetweenShots: 1,
        ClipSize: 1,
        ClipReloadTime: 0,
        PreAttackDelay: 0,
        PreAttackType: 'PER_SHOT',
        WeaponRecoil: 0,
        ProjectileObject: 'DummyProjectile',
      }),
    ],
    locomotors: [
      makeLocomotorDef('LocomotorFast', 180),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject(containerTemplateName, 50, 20),
      makeMapObject(`${containType}ContainTarget`, 110, 20),
    ], 128, 128),
    makeRegistry(bundle),
    makeHeightmap(128, 128),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({
    type: 'queueUnitProduction',
    entityId: 1,
    unitTemplateName: passengerTemplateName,
  });

  let passengerId: number | null = null;
  for (let frame = 0; frame < 10; frame += 1) {
    logic.update(1 / 30);
    passengerId = logic.getEntityIdsByTemplate(passengerTemplateName)[0] ?? null;
    if (passengerId !== null) {
      break;
    }
  }
  if (passengerId === null) {
    throw new Error(`${passengerTemplateName} did not spawn`);
  }

  logic.submitCommand({
    type: 'attackEntity',
    entityId: passengerId,
    targetEntityId: 2,
  });

  const targetHealthTimeline: number[] = [];
  const containerHealthTimeline: number[] = [];
  const containerStatusFlagsTimeline: string[][] = [];
  for (let frame = 0; frame < 10; frame += 1) {
    if (options?.passengersFireUpgradeFrames?.enableAtFrame === frame) {
      logic.submitCommand({
        type: 'applyUpgrade',
        entityId: 1,
        upgradeName: 'Upgrade_PassengersFire',
      });
    }

    if (
      options?.passengersFireUpgradeFrames?.removeAtFrame !== undefined
      && options.passengersFireUpgradeFrames.removeAtFrame === frame
    ) {
      logic.submitCommand({
        type: 'applyUpgrade',
        entityId: 1,
        upgradeName: 'Upgrade_RemovePassengersFire',
      });
    }

    if (options?.containerDisabledSubduedFrames?.disableAtFrame === frame) {
      logic.submitCommand({
        type: 'applyUpgrade',
        entityId: 1,
        upgradeName: 'Upgrade_Disable_GarrisonContainSubdued',
      });
    }

    if (
      options?.containerDisabledSubduedFrames?.restoreAtFrame !== undefined
      && options.containerDisabledSubduedFrames.restoreAtFrame === frame
    ) {
      logic.submitCommand({
        type: 'applyUpgrade',
        entityId: 1,
        upgradeName: 'Upgrade_Restore_GarrisonContainSubdued',
      });
    }

    logic.update(1 / 30);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
    containerHealthTimeline.push(logic.getEntityState(1)?.health ?? -1);
    containerStatusFlagsTimeline.push(logic.getEntityState(1)?.statusFlags ?? []);
  }

  return {
    targetHealthTimeline,
    containerHealthTimeline,
    containerStatusFlagsTimeline,
  };
}

function runHelixPortableRiderIdentityTimeline(): {
  targetHealthTimeline: number[];
  containerHealthTimeline: number[];
} {
  // Regression for Source parity around helix rider identity:
  // only one tracked portable structure in a HELIXCONTAIN should be active for attacks.
  const bundle = makeBundle({
    objects: [
      makeObjectDef(
        'HelixRiderIdentityContainmentPad',
        'America',
        ['STRUCTURE', 'COMMANDCENTER'],
        [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 2,
          }),
          makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
            UnitCreatePoint: [0, 0, 0],
            ExitDelay: 0,
          }),
          makeBlock('Behavior', 'ParkingPlaceBehavior ModuleTag_Parking', {
            NumRows: 2,
            NumCols: 1,
          }),
          makeBlock('Behavior', 'HelixContain ModuleTag_HelixContain', {
            PassengersAllowedToFire: 'No',
            PayloadTemplateName: ['HELIXRIDERRIDER_A', 'HELIXRIDERRIDER_B'],
          }),
        ],
      ),
      makeObjectDef('HelixRiderA', 'America', ['PORTABLE_STRUCTURE', 'VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'HelixContainCannon'] }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
      ], {
        BuildCost: 100,
        BuildTime: 0.01,
      }),
      makeObjectDef('HelixRiderB', 'America', ['PORTABLE_STRUCTURE', 'VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'HelixContainCannon'] }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
      ], {
        BuildCost: 100,
        BuildTime: 0.01,
      }),
      makeObjectDef('HelixContainTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('HelixContainCannon', {
        AttackRange: 180,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 1000,
        DelayBetweenShots: 1000,
        ClipSize: 1,
        ClipReloadTime: 0,
        PreAttackDelay: 0,
        PreAttackType: 'PER_SHOT',
        WeaponRecoil: 0,
        ProjectileObject: 'DummyProjectile',
      }),
    ],
    locomotors: [
      makeLocomotorDef('LocomotorFast', 180),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap(
      [
        makeMapObject('HelixRiderIdentityContainmentPad', 50, 20),
        makeMapObject('HelixContainTarget', 110, 20),
      ],
      128,
      128,
    ),
    makeRegistry(bundle),
    makeHeightmap(128, 128),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'HelixRiderA' });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'HelixRiderB' });

  let firstRiderId: number | null = null;
  let secondRiderId: number | null = null;
  for (let frame = 0; frame < 40; frame += 1) {
    logic.update(1 / 30);
    firstRiderId = logic.getEntityIdsByTemplate('HelixRiderA')[0] ?? null;
    secondRiderId = logic.getEntityIdsByTemplate('HelixRiderB')[0] ?? null;
    if (firstRiderId !== null && secondRiderId !== null) {
      break;
    }
  }

  if (firstRiderId === null || secondRiderId === null) {
    throw new Error('Helix rider units did not spawn');
  }

  logic.submitCommand({
    type: 'attackEntity',
    entityId: firstRiderId,
    targetEntityId: 2,
  });
  logic.submitCommand({
    type: 'attackEntity',
    entityId: secondRiderId,
    targetEntityId: 2,
  });

  const targetHealthTimeline: number[] = [];
  const containerHealthTimeline: number[] = [];
  for (let frame = 0; frame < 10; frame += 1) {
    logic.update(1 / 30);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
    containerHealthTimeline.push(logic.getEntityState(1)?.health ?? -1);
  }

  return { targetHealthTimeline, containerHealthTimeline };
}

function runOpenContainPassengerAllowedToFireTimeline(passengersAllowedToFire: boolean) {
  return runContainPassengerAllowedToFireTimeline('Open', passengersAllowedToFire);
}

function runNestedOpenContainPassengerAllowedToFireTimeline(): {
  targetHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef(
        'OuterOpenContainmentPad',
        'America',
        ['STRUCTURE', 'COMMANDCENTER'],
        [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 1,
          }),
          makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
            UnitCreatePoint: [0, 0, 0],
            ExitDelay: 0,
          }),
          makeBlock('Behavior', 'ParkingPlaceBehavior ModuleTag_Parking', {
            NumRows: 1,
            NumCols: 2,
          }),
          makeBlock('Behavior', 'OpenContain ModuleTag_OpenContain', {
            PassengersAllowedToFire: 'No',
          }),
        ],
      ),
      makeObjectDef(
        'InnerOpenContainmentPad',
        'America',
        ['STRUCTURE', 'COMMANDCENTER'],
        [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 1,
          }),
          makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
            UnitCreatePoint: [0, 0, 0],
            ExitDelay: 0,
          }),
          makeBlock('Behavior', 'ParkingPlaceBehavior ModuleTag_Parking', {
            NumRows: 1,
            NumCols: 1,
          }),
          makeBlock('Behavior', 'OpenContain ModuleTag_OpenContain', {
            PassengersAllowedToFire: 'Yes',
          }),
        ], {
          BuildCost: 100,
          BuildTime: 0.1,
        },
      ),
      makeObjectDef(
        'NestedOpenContainPassenger',
        'America',
        ['INFANTRY'],
        [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'NestedOpenContainCannon'] }),
          makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
        ], {
          BuildCost: 100,
          BuildTime: 0.1,
        }),
      makeObjectDef('NestedOpenContainTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('NestedOpenContainCannon', {
        AttackRange: 180,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 1000,
        DelayBetweenShots: 1,
        ClipSize: 1,
        ClipReloadTime: 0,
        PreAttackDelay: 0,
        PreAttackType: 'PER_SHOT',
        WeaponRecoil: 0,
        ProjectileObject: 'DummyProjectile',
      }),
    ],
    locomotors: [
      makeLocomotorDef('LocomotorFast', 180),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap(
      [
        makeMapObject('OuterOpenContainmentPad', 50, 20),
        makeMapObject('NestedOpenContainTarget', 110, 20),
      ],
      128,
      128,
    ),
    makeRegistry(bundle),
    makeHeightmap(128, 128),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({
    type: 'queueUnitProduction',
    entityId: 1,
    unitTemplateName: 'InnerOpenContainmentPad',
  });

  let innerContainerId: number | null = null;
  for (let frame = 0; frame < 20; frame += 1) {
    logic.update(1 / 30);
    innerContainerId = logic.getEntityIdsByTemplate('InnerOpenContainmentPad')[0] ?? null;
    if (innerContainerId !== null) {
      break;
    }
  }

  if (innerContainerId === null) {
    throw new Error('InnerOpenContainmentPad did not spawn');
  }

  logic.submitCommand({
    type: 'queueUnitProduction',
    entityId: innerContainerId,
    unitTemplateName: 'NestedOpenContainPassenger',
  });

  let passengerId: number | null = null;
  for (let frame = 0; frame < 20; frame += 1) {
    logic.update(1 / 30);
    passengerId = logic.getEntityIdsByTemplate('NestedOpenContainPassenger')[0] ?? null;
    if (passengerId !== null) {
      break;
    }
  }

  if (passengerId === null) {
    throw new Error('NestedOpenContainPassenger did not spawn');
  }

  logic.submitCommand({
    type: 'attackEntity',
    entityId: passengerId,
    targetEntityId: 2,
  });

  const targetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 10; frame += 1) {
    logic.update(1 / 30);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { targetHealthTimeline };
}

function runProjectileAirfieldReservedVictimCollisionTimeline(): {
  targetHealthTimeline: number[];
  airfieldHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('AirfieldCollisionAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'AirfieldCollisionCannon'] }),
      ]),
      makeObjectDef('EnemyAirfield', 'China', ['STRUCTURE', 'FS_AIRFIELD'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 2,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [0, 0, 0],
          ExitDelay: 0,
        }),
        makeBlock('Behavior', 'ParkingPlaceBehavior ModuleTag_Parking', {
          NumRows: 1,
          NumCols: 1,
        }),
      ]),
      makeObjectDef('ParkedTargetJet', 'China', ['AIRCRAFT'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
      ], {
        BuildCost: 100,
        BuildTime: 0.1,
      }),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('AirfieldCollisionCannon', {
        AttackRange: 180,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 10,
        DelayBetweenShots: 1000,
        ProjectileObject: 'DummyProjectile',
        ProjectileCollidesWith: 'ENEMIES STRUCTURES',
      }),
    ],
    locomotors: [
      makeLocomotorDef('LocomotorFast', 180),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('AirfieldCollisionAttacker', 20, 20), makeMapObject('EnemyAirfield', 50, 20)], 128, 128),
    makeRegistry(bundle),
    makeHeightmap(128, 128),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'setSideCredits', side: 'China', amount: 1000 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 2, unitTemplateName: 'ParkedTargetJet' });

  let targetId: number | null = null;
  for (let frame = 0; frame < 10; frame += 1) {
    logic.update(1 / 30);
    targetId = logic.getEntityIdsByTemplate('ParkedTargetJet')[0] ?? null;
    if (targetId !== null) {
      break;
    }
  }
  if (targetId === null) {
    throw new Error('ParkedTargetJet did not spawn');
  }

  logic.submitCommand({ type: 'moveTo', entityId: targetId, targetX: 110, targetZ: 20 });
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: targetId });

  const targetHealthTimeline: number[] = [];
  const airfieldHealthTimeline: number[] = [];
  for (let frame = 0; frame < 7; frame += 1) {
    logic.update(1 / 30);
    targetHealthTimeline.push(logic.getEntityState(targetId)?.health ?? -1);
    airfieldHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { targetHealthTimeline, airfieldHealthTimeline };
}

function runProjectileSneakyTargetingOffsetTimeline(enableSneakyOffset: boolean): number[] {
  const sneakyBehaviorBlocks = enableSneakyOffset
    ? [
      makeBlock('Behavior', 'JetAIUpdate ModuleTag_Sneaky', {
        SneakyOffsetWhenAttacking: 20,
        AttackersMissPersistTime: 1000,
      }),
    ]
    : [];

  const bundle = makeBundle({
    objects: [
      makeObjectDef('SneakyJet', 'China', ['AIRCRAFT'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SneakyJetGun'] }),
        ...sneakyBehaviorBlocks,
      ]),
      makeObjectDef('OffsetAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'AttackSneakyTargetCannon'] }),
      ]),
      makeObjectDef('DummyTargetForJet', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('SneakyJetGun', {
        AttackRange: 220,
        PrimaryDamage: 5,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 999999,
        DelayBetweenShots: 1000,
      }),
      makeWeaponDef('AttackSneakyTargetCannon', {
        AttackRange: 220,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 10,
        DelayBetweenShots: 1000,
        ProjectileObject: 'DummyProjectile',
        ProjectileCollidesWith: 'ENEMIES',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('SneakyJet', 50, 20),
      makeMapObject('OffsetAttacker', 20, 20),
      makeMapObject('DummyTargetForJet', 80, 20),
    ], 128, 128),
    makeRegistry(bundle),
    makeHeightmap(128, 128),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 3 });
  logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

  const targetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 7; frame += 1) {
    logic.update(1 / 30);
    targetHealthTimeline.push(logic.getEntityState(1)?.health ?? -1);
  }

  return targetHealthTimeline;
}

function runProjectileSneakyIncidentalImmunityTimeline(enableSneakyOffset: boolean): {
  targetHealthTimeline: number[];
  blockerHealthTimeline: number[];
} {
  const sneakyBehaviorBlocks = enableSneakyOffset
    ? [
      makeBlock('Behavior', 'JetAIUpdate ModuleTag_Sneaky', {
        SneakyOffsetWhenAttacking: 20,
        AttackersMissPersistTime: 1000,
      }),
    ]
    : [];

  const bundle = makeBundle({
    objects: [
      makeObjectDef('SneakyBlocker', 'China', ['AIRCRAFT'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SneakyJetGun'] }),
        ...sneakyBehaviorBlocks,
      ]),
      makeObjectDef('ProjectileIncidentalAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ProjectileIncidentalCannon'] }),
      ]),
      makeObjectDef('ProjectileIncidentalTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
      ]),
      makeObjectDef('DummyTargetForBlocker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('SneakyJetGun', {
        AttackRange: 220,
        PrimaryDamage: 5,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 999999,
        DelayBetweenShots: 1000,
      }),
      makeWeaponDef('ProjectileIncidentalCannon', {
        AttackRange: 220,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 10,
        DelayBetweenShots: 1000,
        ProjectileObject: 'DummyProjectile',
        ProjectileCollidesWith: 'ENEMIES',
      }),
    ],
    locomotors: [
      makeLocomotorDef('LocomotorFast', 180),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('SneakyBlocker', 50, 20),
      makeMapObject('ProjectileIncidentalAttacker', 20, 20),
      makeMapObject('ProjectileIncidentalTarget', 50, 20),
      makeMapObject('DummyTargetForBlocker', 80, 20),
    ], 128, 128),
    makeRegistry(bundle),
    makeHeightmap(128, 128),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 4 });
  logic.submitCommand({ type: 'moveTo', entityId: 3, targetX: 110, targetZ: 20 });
  logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 3 });

  const targetHealthTimeline: number[] = [];
  const blockerHealthTimeline: number[] = [];
  for (let frame = 0; frame < 7; frame += 1) {
    logic.update(1 / 30);
    targetHealthTimeline.push(logic.getEntityState(3)?.health ?? -1);
    blockerHealthTimeline.push(logic.getEntityState(1)?.health ?? -1);
  }

  return { targetHealthTimeline, blockerHealthTimeline };
}

function runProjectileSneakyCooldownRefreshTimeline(enableSneakyOffset: boolean): number[] {
  const sneakyBehaviorBlocks = enableSneakyOffset
    ? [
      makeBlock('Behavior', 'JetAIUpdate ModuleTag_Sneaky', {
        SneakyOffsetWhenAttacking: 20,
        AttackersMissPersistTime: 100,
      }),
    ]
    : [];

  const bundle = makeBundle({
    objects: [
      makeObjectDef('SneakyCooldownJet', 'China', ['AIRCRAFT'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SneakyCooldownJetGun'] }),
        ...sneakyBehaviorBlocks,
      ]),
      makeObjectDef('CooldownAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'CooldownAttackCannon'] }),
      ]),
      makeObjectDef('DummyTargetForCooldownJet', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('SneakyCooldownJetGun', {
        AttackRange: 220,
        PrimaryDamage: 5,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 999999,
        DelayBetweenShots: 1000,
      }),
      makeWeaponDef('CooldownAttackCannon', {
        AttackRange: 220,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 5,
        DelayBetweenShots: 1000,
        ProjectileObject: 'DummyProjectile',
        ProjectileCollidesWith: 'ENEMIES',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('SneakyCooldownJet', 50, 20),
      makeMapObject('CooldownAttacker', 20, 20),
      makeMapObject('DummyTargetForCooldownJet', 80, 20),
    ], 128, 128),
    makeRegistry(bundle),
    makeHeightmap(128, 128),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 3 });
  logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

  const timeline: number[] = [];
  for (let frame = 0; frame < 10; frame += 1) {
    logic.update(1 / 30);
    timeline.push(logic.getEntityState(1)?.health ?? -1);
  }

  return timeline;
}

function runProjectileSneakyPersistAfterStopTimeline(stopAtFrame: number | null): number[] {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('SneakyStopJet', 'China', ['AIRCRAFT'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SneakyStopJetGun'] }),
        makeBlock('Behavior', 'JetAIUpdate ModuleTag_Sneaky', {
          SneakyOffsetWhenAttacking: 20,
          AttackersMissPersistTime: 100,
        }),
      ]),
      makeObjectDef('StopTimelineAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'StopTimelineAttackCannon'] }),
      ]),
      makeObjectDef('DummyTargetForStopJet', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('SneakyStopJetGun', {
        AttackRange: 220,
        PrimaryDamage: 5,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 999999,
        DelayBetweenShots: 1000,
      }),
      makeWeaponDef('StopTimelineAttackCannon', {
        AttackRange: 220,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 10,
        DelayBetweenShots: 100,
        ProjectileObject: 'DummyProjectile',
        ProjectileCollidesWith: 'ENEMIES',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('SneakyStopJet', 50, 20),
      makeMapObject('StopTimelineAttacker', 20, 20),
      makeMapObject('DummyTargetForStopJet', 80, 20),
    ], 128, 128),
    makeRegistry(bundle),
    makeHeightmap(128, 128),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 3 });
  logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

  const timeline: number[] = [];
  for (let frame = 0; frame < 12; frame += 1) {
    if (stopAtFrame !== null && frame === stopAtFrame) {
      logic.submitCommand({ type: 'stop', entityId: 1 });
    }
    logic.update(1 / 30);
    timeline.push(logic.getEntityState(1)?.health ?? -1);
  }

  return timeline;
}

function runDamageAtSelfScatterTargetTimeline(useScatterTarget: boolean): {
  targetHealthTimeline: number[];
  nearEnemyHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('SelfScatterAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 160, InitialHealth: 160 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SelfScatterCannon'] }),
      ]),
      makeObjectDef('SelfScatterTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
      makeObjectDef('SelfScatterNearEnemy', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('SelfScatterCannon', {
        AttackRange: 160,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 6,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        DamageDealtAtSelfPosition: true,
        RadiusDamageAffects: 'ENEMIES',
        WeaponSpeed: 999999,
        DelayBetweenShots: 1000,
        ...(useScatterTarget
          ? {
            ScatterTargetScalar: 30,
            ScatterTarget: [[1, 0]],
          }
          : {}),
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('SelfScatterAttacker', 20, 20),
      makeMapObject('SelfScatterTarget', 50, 20),
      makeMapObject('SelfScatterNearEnemy', 22, 20),
    ], 96, 96),
    makeRegistry(bundle),
    makeHeightmap(96, 96),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const targetHealthTimeline: number[] = [];
  const nearEnemyHealthTimeline: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
    nearEnemyHealthTimeline.push(logic.getEntityState(3)?.health ?? -1);
  }

  return {
    targetHealthTimeline,
    nearEnemyHealthTimeline,
  };
}

function runProjectileSplashTimeline(): {
  primaryHealthTimeline: number[];
  splashHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ProjectileSplashAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 140, InitialHealth: 140 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ProjectileSplashCannon'] }),
      ]),
      makeObjectDef('ProjectileSplashPrimary', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
      makeObjectDef('ProjectileSplashSecondary', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ProjectileSplashCannon', {
        AttackRange: 150,
        PrimaryDamage: 40,
        PrimaryDamageRadius: 8,
        SecondaryDamage: 20,
        SecondaryDamageRadius: 16,
        RadiusDamageAffects: 'ENEMIES',
        WeaponSpeed: 8,
        DelayBetweenShots: 1000,
        ProjectileObject: 'DummyProjectile',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('ProjectileSplashAttacker', 10, 10),
      makeMapObject('ProjectileSplashPrimary', 30, 10),
      makeMapObject('ProjectileSplashSecondary', 42, 10),
    ], 96, 96),
    makeRegistry(bundle),
    makeHeightmap(96, 96),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const primaryHealthTimeline: number[] = [];
  const splashHealthTimeline: number[] = [];
  for (let frame = 0; frame < 5; frame += 1) {
    logic.update(1 / 30);
    primaryHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
    splashHealthTimeline.push(logic.getEntityState(3)?.health ?? -1);
  }

  return {
    primaryHealthTimeline,
    splashHealthTimeline,
  };
}

function runProjectileScatterTimeline(scatterRadius: number): number[] {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ProjectileScatterAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ProjectileScatterCannon'] }),
      ]),
      makeObjectDef('ProjectileScatterTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ProjectileScatterCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        PrimaryDamageRadius: 0.1,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        ScatterRadius: scatterRadius,
        WeaponSpeed: 999999,
        DelayBetweenShots: 1000,
        ProjectileObject: 'DummyProjectile',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('ProjectileScatterAttacker', 10, 10), makeMapObject('ProjectileScatterTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const timeline: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    timeline.push(logic.getEntityState(2)?.health ?? -1);
  }
  return timeline;
}

function runProjectileInfantryInaccuracyTimeline(targetKind: 'INFANTRY' | 'VEHICLE'): number[] {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ProjectileInaccuracyAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ProjectileInaccuracyCannon'] }),
      ]),
      makeObjectDef('ProjectileInaccuracyTarget', 'China', [targetKind], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ProjectileInaccuracyCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        PrimaryDamageRadius: 0.1,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        ScatterRadius: 0,
        ScatterRadiusVsInfantry: 200,
        WeaponSpeed: 999999,
        DelayBetweenShots: 1000,
        ProjectileObject: 'DummyProjectile',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('ProjectileInaccuracyAttacker', 10, 10), makeMapObject('ProjectileInaccuracyTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const timeline: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    timeline.push(logic.getEntityState(2)?.health ?? -1);
  }
  return timeline;
}

function runProjectileScatterTargetTimeline(useScatterTargets: boolean): number[] {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ProjectileScatterTargetAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 120, InitialHealth: 120 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ProjectileScatterTargetCannon'] }),
      ]),
      makeObjectDef('ProjectileScatterTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ProjectileScatterTargetCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        PrimaryDamageRadius: 0.1,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 999999,
        DelayBetweenShots: 1000,
        ProjectileObject: 'DummyProjectile',
        ...(useScatterTargets
          ? {
            ScatterTargetScalar: 30,
            ScatterTarget: [[1, 0], [-1, 0]],
          }
          : {}),
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('ProjectileScatterTargetAttacker', 10, 10), makeMapObject('ProjectileScatterTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const timeline: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    timeline.push(logic.getEntityState(2)?.health ?? -1);
  }
  return timeline;
}

function runProjectileScatterTargetReloadTimeline(): number[] {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ProjectileScatterReloadAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ProjectileScatterReloadCannon'] }),
      ]),
      makeObjectDef('ProjectileScatterReloadTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
      makeObjectDef('DummyProjectile', 'America', ['PROJECTILE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ProjectileScatterReloadCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        PrimaryDamageRadius: 0.1,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 999999,
        DelayBetweenShots: 100,
        ClipSize: 2,
        ClipReloadTime: 100,
        ProjectileObject: 'DummyProjectile',
        ScatterTargetScalar: 30,
        ScatterTarget: [[1, 0]],
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('ProjectileScatterReloadAttacker', 10, 10), makeMapObject('ProjectileScatterReloadTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const timeline: number[] = [];
  for (let frame = 0; frame < 12; frame += 1) {
    logic.update(1 / 30);
    timeline.push(logic.getEntityState(2)?.health ?? -1);
  }
  return timeline;
}

function runFifoProductionTimeline(): {
  alphaCounts: number[];
  bravoCounts: number[];
  queuePercents: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef(
        'Factory',
        'America',
        ['STRUCTURE'],
        [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 3,
          }),
          makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
            UnitCreatePoint: [12, 0, 0],
            NaturalRallyPoint: [28, 0, 0],
            ExitDelay: 0,
            InitialBurst: 0,
          }),
        ],
      ),
      makeObjectDef('InfantryAlpha', 'America', ['INFANTRY'], [], { BuildTime: 0.2, BuildCost: 100 }),
      makeObjectDef('InfantryBravo', 'America', ['INFANTRY'], [], { BuildTime: 0.2, BuildCost: 100 }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  const map = makeMap([makeMapObject('Factory', 40, 40)]);
  logic.loadMapObjects(map, makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'InfantryAlpha' });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'InfantryBravo' });

  const alphaCounts: number[] = [];
  const bravoCounts: number[] = [];
  const queuePercents: number[] = [];
  for (let frame = 0; frame < 12; frame += 1) {
    logic.update(1 / 30);
    alphaCounts.push(logic.getEntityIdsByTemplate('InfantryAlpha').length);
    bravoCounts.push(logic.getEntityIdsByTemplate('InfantryBravo').length);
    const queue = logic.getProductionState(1);
    queuePercents.push(queue?.queue[0]?.percentComplete ?? -1);
  }

  return { alphaCounts, bravoCounts, queuePercents };
}

function runQuantityModifierDelayTimeline(exitDelayMs = 66): number[] {
  const bundle = makeBundle({
    objects: [
      makeObjectDef(
        'Barracks',
        'China',
        ['STRUCTURE'],
        [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 3,
            QuantityModifier: 'RedGuard 2',
          }),
          makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
            UnitCreatePoint: [8, 0, 0],
            ExitDelay: exitDelayMs,
            InitialBurst: 0,
          }),
        ],
      ),
      makeObjectDef('RedGuard', 'China', ['INFANTRY'], [], { BuildTime: 0.1, BuildCost: 300 }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  const map = makeMap([makeMapObject('Barracks', 20, 20)]);
  logic.loadMapObjects(map, makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'China', amount: 1000 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'RedGuard' });

  const timeline: number[] = [];
  for (let frame = 0; frame < 6; frame += 1) {
    logic.update(1 / 30);
    timeline.push(logic.getEntityIdsByTemplate('RedGuard').length);
  }

  return timeline;
}

function runSupplyCenterExitProductionTimeline(): {
  producedCounts: number[];
  queueCounts: number[];
  credits: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('SupplyCenter', 'China', ['STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 2,
        }),
        makeBlock('Behavior', 'SupplyCenterProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [12, 0, 10],
          NaturalRallyPoint: [18, 0, 0],
        }),
      ]),
      makeObjectDef('SupplyTruck', 'China', ['VEHICLE'], [], {
        BuildTime: 0.1,
        BuildCost: 600,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('SupplyCenter', 20, 20)], 96, 96), makeRegistry(bundle), makeHeightmap(96, 96));

  logic.submitCommand({ type: 'setSideCredits', side: 'China', amount: 1000 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'SupplyTruck' });

  const producedCounts: number[] = [];
  const queueCounts: number[] = [];
  const credits: number[] = [];
  for (let frame = 0; frame < 6; frame += 1) {
    logic.update(1 / 30);
    producedCounts.push(logic.getEntityIdsByTemplate('SupplyTruck').length);
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    credits.push(logic.getSideCredits('China'));
  }

  return {
    producedCounts,
    queueCounts,
    credits,
  };
}

function runSpawnPointExitProductionTimeline(): {
  producedCounts: number[];
  queueCounts: number[];
  credits: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('SpawnBuilding', 'America', ['STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 2,
        }),
        makeBlock('Behavior', 'SpawnPointProductionExitUpdate ModuleTag_Exit', {
          SpawnPointBoneName: 'SpawnPoint',
        }),
      ]),
      makeObjectDef('Ranger', 'America', ['INFANTRY'], [], {
        BuildTime: 0.1,
        BuildCost: 600,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('SpawnBuilding', 30, 30)]), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'Ranger' });

  const producedCounts: number[] = [];
  const queueCounts: number[] = [];
  const credits: number[] = [];
  for (let frame = 0; frame < 6; frame += 1) {
    logic.update(1 / 30);
    producedCounts.push(logic.getEntityIdsByTemplate('Ranger').length);
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    credits.push(logic.getSideCredits('America'));
  }

  return {
    producedCounts,
    queueCounts,
    credits,
  };
}

function runEconomyProductionTimeline(): {
  credits: number[];
  queueCounts: number[];
  producedCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 2,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [12, 0, 0],
          ExitDelay: 0,
        }),
      ]),
      makeObjectDef('VehicleA', 'America', ['VEHICLE'], [], { BuildTime: 0.1, BuildCost: 300 }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('WarFactory', 12, 12)]), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'VehicleA' });
  logic.submitCommand({ type: 'cancelUnitProduction', entityId: 1, productionId: 1 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'VehicleA' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const producedCounts: number[] = [];
  for (let frame = 0; frame < 5; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    producedCounts.push(logic.getEntityIdsByTemplate('VehicleA').length);
  }

  return { credits, queueCounts, producedCounts };
}

function runUpgradeProductionTimeline(): {
  credits: number[];
  inProductionCounts: number[];
  completedCounts: number[];
  speeds: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
      ]),
      makeObjectDef('UpgradeableUnit', 'America', ['VEHICLE'], [
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorSlow', {}),
        makeBlock('LocomotorSet', 'SET_NORMAL_UPGRADED LocomotorFast', {}),
        makeBlock('Behavior', 'LocomotorSetUpgrade ModuleTag_Move', {
          TriggeredBy: 'Upgrade_Move',
        }),
      ]),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Move', {
        Type: 'PLAYER',
        BuildTime: 0.1,
        BuildCost: 200,
      }),
    ],
    locomotors: [
      makeLocomotorDef('LocomotorSlow', 10),
      makeLocomotorDef('LocomotorFast', 20),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('StrategyCenter', 8, 8), makeMapObject('UpgradeableUnit', 16, 8)]),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 300 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });

  const credits: number[] = [];
  const inProductionCounts: number[] = [];
  const completedCounts: number[] = [];
  const speeds: number[] = [];
  for (let frame = 0; frame < 5; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    const upgradeState = logic.getSideUpgradeState('America');
    inProductionCounts.push(upgradeState.inProduction.length);
    completedCounts.push(upgradeState.completed.length);
    speeds.push(logic.getEntityState(2)?.speed ?? -1);
  }

  return { credits, inProductionCounts, completedCounts, speeds };
}

function runLocomotorUpgradeRemovalTimeline(): {
  speeds: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('LocomotorVehicle', 'America', ['VEHICLE'], [
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorSlow', {}),
        makeBlock('LocomotorSet', 'SET_NORMAL_UPGRADED LocomotorFast', {}),
        makeBlock('Behavior', 'LocomotorSetUpgrade ModuleTag_Move', {
          TriggeredBy: 'Upgrade_Move',
        }),
      ]),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Move', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef(
        'Upgrade_Remove_Move',
        {
          Type: 'OBJECT',
          BuildTime: 0.1,
          BuildCost: 100,
        },
        [
          makeBlock('Behavior', 'MaxHealthUpgrade ModuleTag_Remove', {
            TriggeredBy: 'Upgrade_Remove_Move',
            RemovesUpgrades: 'Upgrade_Move',
            AddMaxHealth: 0,
          }),
        ],
      ),
    ],
    locomotors: [
      makeLocomotorDef('LocomotorSlow', 10),
      makeLocomotorDef('LocomotorFast', 20),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('LocomotorVehicle', 10, 10)]), makeRegistry(bundle), makeHeightmap(64, 64));

  const speeds: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    if (frame === 1) {
      logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Move' });
    } else if (frame === 4) {
      logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Remove_Move' });
    }

    logic.update(1 / 30);
    speeds.push(logic.getEntityState(1)?.speed ?? -1);
  }

  return { speeds };
}

function runCostModifierUpgradeTimeline(): {
  credits: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 10,
        }),
      ]),
      makeObjectDef('VehicleA', 'America', ['VEHICLE'], [], { BuildTime: 0.1, BuildCost: 400 }),
      makeObjectDef('JetA', 'America', ['AIRCRAFT'], [], { BuildTime: 0.1, BuildCost: 500 }),
    ],
    upgrades: [
      makeUpgradeDef(
        'Upgrade_Vehicle_Discount',
        {
          Type: 'PLAYER',
          BuildTime: 0.1,
          BuildCost: 200,
        },
        [
          makeBlock('Behavior', 'CostModifierUpgrade ModuleTag_Discount', {
            EffectKindOf: 'VEHICLE',
            Percentage: '-25%',
          }),
        ],
      ),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('StrategyCenter', 8, 8)]),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 2000 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'VehicleA' });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Vehicle_Discount' });

  const credits: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    if (frame === 4) {
      logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'VehicleA' });
      logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'JetA' });
    }
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
  }

  return { credits };
}

function runCostModifierUpgradeRemovalTimeline(): {
  credits: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 10,
        }),
      ], {
        CommandSet: 'CommandSet_StrategyCenter_Discount',
      }),
      makeObjectDef('VehicleA', 'America', ['VEHICLE'], [], { BuildTime: 0.1, BuildCost: 400 }),
    ],
    upgrades: [
      makeUpgradeDef(
        'Upgrade_Discount_Object',
        {
          Type: 'OBJECT',
          BuildTime: 0.1,
          BuildCost: 100,
        },
        [
          makeBlock('Behavior', 'CostModifierUpgrade ModuleTag_Discount', {
            EffectKindOf: 'VEHICLE',
            Percentage: '-25%',
          }),
        ],
      ),
      makeUpgradeDef(
        'Upgrade_Cancel_Discount',
        {
          Type: 'OBJECT',
          BuildTime: 0.1,
          BuildCost: 100,
        },
        [
          makeBlock('Behavior', 'MaxHealthUpgrade ModuleTag_Cancel', {
            TriggeredBy: 'Upgrade_Cancel_Discount',
            RemovesUpgrades: 'Upgrade_Discount_Object',
            AddMaxHealth: 0,
          }),
        ],
      ),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_Upgrade_Discount', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Discount_Object',
      }),
      makeCommandButtonDef('Command_Upgrade_Cancel_Discount', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Cancel_Discount',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_StrategyCenter_Discount', {
        1: 'Command_Upgrade_Discount',
        2: 'Command_Upgrade_Cancel_Discount',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 8, 8)]), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 2500 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Discount_Object' });

  const credits: number[] = [];
  for (let frame = 0; frame < 11; frame += 1) {
    if (frame === 3) {
      logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'VehicleA' });
    }
    if (frame === 4) {
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Cancel_Discount' });
    }
    if (frame === 7) {
      logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'VehicleA' });
    }

    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
  }

  return { credits };
}

function runCostModifierUpgradeCostUnaffectedTimeline(): {
  credits: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 10,
        }),
      ]),
    ],
    upgrades: [
      makeUpgradeDef(
        'Upgrade_Vehicle_Discount',
        {
          Type: 'PLAYER',
          BuildTime: 0.1,
          BuildCost: 200,
        },
        [
          makeBlock('Behavior', 'CostModifierUpgrade ModuleTag_Discount', {
            EffectKindOf: 'VEHICLE',
            Percentage: '-25%',
          }),
        ],
      ),
      makeUpgradeDef(
        'Upgrade_Vehicle_Cost',
        {
          Type: 'PLAYER',
          BuildTime: 0.1,
          BuildCost: 100,
        },
        [],
        ['VEHICLE'],
      ),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 8, 8)]), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Vehicle_Discount' });

  const credits: number[] = [];
  for (let frame = 0; frame < 7; frame += 1) {
    if (frame === 3) {
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Vehicle_Cost' });
    }
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
  }

  return { credits };
}

function runCostModifierUpgradeCaptureTransferTimeline(): {
  creditsAmerica: number[];
  creditsChina: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 10,
        }),
      ], {
        CommandSet: 'CommandSet_StrategyCenter_Discount',
      }),
      makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 10,
        }),
      ], {
        CommandSet: 'CommandSet_StrategyCenter_Discount',
      }),
      makeObjectDef('VehicleA', 'America', ['VEHICLE'], [], {
        BuildTime: 0.1,
        BuildCost: 400,
      }),
    ],
    upgrades: [
      makeUpgradeDef(
        'Upgrade_Discount_Object',
        {
          Type: 'OBJECT',
          BuildTime: 0.1,
          BuildCost: 100,
        },
        [
          makeBlock('Behavior', 'CostModifierUpgrade ModuleTag_Discount', {
            TriggeredBy: 'Upgrade_Discount_Object',
            EffectKindOf: 'VEHICLE',
            Percentage: '-25%',
          }),
        ],
      ),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_Upgrade_Discount', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Discount_Object',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_StrategyCenter_Discount', {
        1: 'Command_Upgrade_Discount',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('StrategyCenter', 8, 8), makeMapObject('StrategyCenter', 16, 8)]),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 4000 });
  logic.submitCommand({ type: 'setSideCredits', side: 'China', amount: 1200 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Discount_Object' });

  const creditsAmerica: number[] = [];
  const creditsChina: number[] = [];
  for (let frame = 0; frame < 7; frame += 1) {
    if (frame === 3) {
      logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'VehicleA' });
    }
    if (frame === 4) {
      logic.submitCommand({ type: 'captureEntity', entityId: 1, newSide: 'China' });
    }
    if (frame === 5) {
      logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'VehicleA' });
    }
    if (frame === 6) {
      logic.submitCommand({ type: 'queueUnitProduction', entityId: 2, unitTemplateName: 'VehicleA' });
    }

    logic.update(1 / 30);
    creditsAmerica.push(logic.getSideCredits('America'));
    creditsChina.push(logic.getSideCredits('China'));
  }

  return { creditsAmerica, creditsChina };
}

function runPowerPlantUpgradeRemovalTimeline(): {
  powerBonuses: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('PowerPlant', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'PowerPlantUpgrade ModuleTag_Power', {
          TriggeredBy: 'Upgrade_Power_Grid',
        }),
        makeBlock('Behavior', 'MaxHealthUpgrade ModuleTag_Remove', {
          TriggeredBy: 'Upgrade_Remove_Power_Grid',
          RemovesUpgrades: 'Upgrade_Power_Grid',
          AddMaxHealth: 0,
        }),
      ], {
        EnergyBonus: 150,
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Power_Grid', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_Remove_Power_Grid', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('PowerPlant', 12, 12)]), makeRegistry(bundle), makeHeightmap(64, 64));

  const powerBonuses: number[] = [];
  for (let frame = 0; frame < 6; frame += 1) {
    if (frame === 1) {
      logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Power_Grid' });
    } else if (frame === 4) {
      logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Remove_Power_Grid' });
    }

    logic.update(1 / 30);
    powerBonuses.push(logic.getSidePowerState('America').powerBonus);
  }

  return { powerBonuses };
}

function runPowerPlantUpgradeCaptureTransferTimeline(): {
  powerBonusesAmerica: number[];
  powerBonusesChina: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('PowerPlant', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'PowerPlantUpgrade ModuleTag_Power', {
          TriggeredBy: 'Upgrade_Power_Grid',
        }),
      ], {
        EnergyBonus: 150,
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Power_Grid', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('PowerPlant', 12, 12)]), makeRegistry(bundle), makeHeightmap(64, 64));

  const powerBonusesAmerica: number[] = [];
  const powerBonusesChina: number[] = [];
  for (let frame = 0; frame < 6; frame += 1) {
    if (frame === 1) {
      logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Power_Grid' });
    }
    if (frame === 4) {
      logic.submitCommand({ type: 'captureEntity', entityId: 1, newSide: 'China' });
    }

    logic.update(1 / 30);
    powerBonusesAmerica.push(logic.getSidePowerState('America').powerBonus);
    powerBonusesChina.push(logic.getSidePowerState('China').powerBonus);
  }

  return { powerBonusesAmerica, powerBonusesChina };
}

function runRadarUpgradeRemovalTimeline(): {
  radarCounts: number[];
  disableProofRadarCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('RadarArray', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'RadarUpgrade ModuleTag_Radar', {
          TriggeredBy: 'Upgrade_Radar',
        }),
        makeBlock('Behavior', 'RadarUpgrade ModuleTag_DisableProofRadar', {
          TriggeredBy: 'Upgrade_DisableProof_Radar',
          DisableProof: true,
        }),
        makeBlock('Behavior', 'MaxHealthUpgrade ModuleTag_Remove', {
          TriggeredBy: 'Upgrade_Remove_Radar',
          RemovesUpgrades: 'Upgrade_Radar',
          AddMaxHealth: 0,
        }),
      ]),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Radar', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_DisableProof_Radar', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_Remove_Radar', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('RadarArray', 12, 12)]), makeRegistry(bundle), makeHeightmap(64, 64));

  const radarCounts: number[] = [];
  const disableProofRadarCounts: number[] = [];
  for (let frame = 0; frame < 6; frame += 1) {
    if (frame === 1) {
      logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Radar' });
    } else if (frame === 2) {
      logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_DisableProof_Radar' });
    } else if (frame === 4) {
      logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Remove_Radar' });
    }

    logic.update(1 / 30);
    const state = logic.getSideRadarState('America');
    radarCounts.push(state.radarCount);
    disableProofRadarCounts.push(state.disableProofRadarCount);
  }

  return { radarCounts, disableProofRadarCounts };
}

function runRadarUpgradeCaptureTransferTimeline(): {
  americaRadarCounts: number[];
  chinaRadarCounts: number[];
  americaDisableProofRadarCounts: number[];
  chinaDisableProofRadarCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('RadarArray', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'RadarUpgrade ModuleTag_Radar', {
          TriggeredBy: 'Upgrade_Radar',
        }),
        makeBlock('Behavior', 'RadarUpgrade ModuleTag_DisableProofRadar', {
          TriggeredBy: 'Upgrade_DisableProof_Radar',
          DisableProof: true,
        }),
      ]),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Radar', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_DisableProof_Radar', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('RadarArray', 12, 12)]), makeRegistry(bundle), makeHeightmap(64, 64));

  const americaRadarCounts: number[] = [];
  const chinaRadarCounts: number[] = [];
  const americaDisableProofRadarCounts: number[] = [];
  const chinaDisableProofRadarCounts: number[] = [];
  for (let frame = 0; frame < 6; frame += 1) {
    if (frame === 1) {
      logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Radar' });
    }
    if (frame === 2) {
      logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_DisableProof_Radar' });
    }
    if (frame === 4) {
      logic.submitCommand({ type: 'captureEntity', entityId: 1, newSide: 'China' });
    }

    logic.update(1 / 30);
    const americaState = logic.getSideRadarState('America');
    const chinaState = logic.getSideRadarState('China');
    americaRadarCounts.push(americaState.radarCount);
    chinaRadarCounts.push(chinaState.radarCount);
    americaDisableProofRadarCounts.push(americaState.disableProofRadarCount);
    chinaDisableProofRadarCounts.push(chinaState.disableProofRadarCount);
  }

  return {
    americaRadarCounts,
    chinaRadarCounts,
    americaDisableProofRadarCounts,
    chinaDisableProofRadarCounts,
  };
}

function runGrantScienceUpgradeTimeline(): {
  credits: number[];
  queueCounts: number[];
  scienceCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 10,
        }),
      ]),
      makeObjectDef('ScienceVehicle', 'America', ['VEHICLE'], [
        makeBlock('Prerequisite', 'Science SCIENCE_PROMO_1', {}),
      ], {
        BuildTime: 0.1,
        BuildCost: 150,
      }),
    ],
    upgrades: [
      makeUpgradeDef(
        'Upgrade_Grant_Science',
        {
          Type: 'PLAYER',
          BuildTime: 0.1,
          BuildCost: 100,
        },
        [
          makeBlock('Behavior', 'GrantScienceUpgrade ModuleTag_Grant', {
            GrantScience: 'SCIENCE_PROMO_1',
          }),
        ],
      ),
    ],
    sciences: [
      makeScienceDef('SCIENCE_PROMO_1', {
        IsGrantable: 'Yes',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Grant_Science' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const scienceCounts: number[] = [];
  for (let frame = 0; frame < 7; frame += 1) {
    if (frame === 0 || frame === 3) {
      logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'ScienceVehicle' });
    }

    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    scienceCounts.push(logic.getSideScienceState('America').acquired.length);
  }

  return { credits, queueCounts, scienceCounts };
}

function runObjectUpgradeAffectabilityTimeline(): {
  credits: number[];
  queueCounts: number[];
  maxHealth: number[];
  speeds: number[];
} {
    const bundle = makeBundle({
      objects: [
      makeObjectDef('UpgradeLab', 'America', ['STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 4,
        }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorSlow', {}),
        makeBlock('LocomotorSet', 'SET_NORMAL_UPGRADED LocomotorFast', {}),
        makeBlock('Behavior', 'LocomotorSetUpgrade ModuleTag_Move', {
          TriggeredBy: 'Upgrade_Move_Object',
        }),
        makeBlock('Behavior', 'MaxHealthUpgrade ModuleTag_HP', {
          TriggeredBy: ['Upgrade_A', 'Upgrade_B'],
          RequiresAllTriggers: true,
          AddMaxHealth: 50,
          ChangeType: 'SAME_CURRENTHEALTH',
        }),
      ], {
        CommandSet: 'CommandSet_UpgradeLab',
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Unused', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_A', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_B', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_Move_Object', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_UpgradeUnused', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Unused',
      }),
      makeCommandButtonDef('Command_UpgradeB', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_B',
      }),
      makeCommandButtonDef('Command_UpgradeMoveObject', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Move_Object',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_UpgradeLab', {
        1: 'Command_UpgradeUnused',
        2: 'Command_UpgradeB',
        3: 'Command_UpgradeMoveObject',
      }),
    ],
    locomotors: [
      makeLocomotorDef('LocomotorSlow', 10),
      makeLocomotorDef('LocomotorFast', 20),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('UpgradeLab', 12, 12)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Unused' });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_B' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const maxHealth: number[] = [];
  const speeds: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    if (frame === 1) {
      logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_A' });
    } else if (frame === 2) {
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_B' });
    } else if (frame === 5) {
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move_Object' });
    }

    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    maxHealth.push(logic.getEntityState(1)?.maxHealth ?? -1);
    speeds.push(logic.getEntityState(1)?.speed ?? -1);
  }

  return { credits, queueCounts, maxHealth, speeds };
}

function runWeaponSetUpgradeCombatTimeline(): {
  credits: number[];
  queueCounts: number[];
  healthTimeline: number[];
} {
    const bundle = makeBundle({
    objects: [
      makeObjectDef('UpgradeTank', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('WeaponSet', 'WeaponSet', {
          Conditions: 'NONE',
          Weapon: ['PRIMARY', 'WeakCannon'],
        }),
        makeBlock('WeaponSet', 'WeaponSet', {
          Conditions: 'PLAYER_UPGRADE',
          Weapon: ['PRIMARY', 'StrongCannon'],
        }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 2,
        }),
        makeBlock('Behavior', 'WeaponSetUpgrade ModuleTag_WeaponSet', {
          TriggeredBy: 'Upgrade_Weapon',
        }),
      ], {
        CommandSet: 'CommandSet_UpgradeTank',
      }),
      makeObjectDef('TargetTank', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('WeakCannon', {
        AttackRange: 120,
        PrimaryDamage: 20,
        DelayBetweenShots: 100,
      }),
      makeWeaponDef('StrongCannon', {
        AttackRange: 120,
        PrimaryDamage: 60,
        DelayBetweenShots: 100,
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Weapon', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_UpgradeWeapon', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Weapon',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_UpgradeTank', {
        1: 'Command_UpgradeWeapon',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('UpgradeTank', 10, 10), makeMapObject('TargetTank', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 300 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Weapon' });
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const healthTimeline: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    healthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { credits, queueCounts, healthTimeline };
}

function runWeaponBonusUpgradeCombatTimeline(): {
  credits: number[];
  queueCounts: number[];
  healthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('UpgradeTank', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('WeaponSet', 'WeaponSet', {
          Conditions: 'NONE',
          Weapon: ['PRIMARY', 'WeakCannon'],
        }),
        makeBlock('WeaponSet', 'WeaponSet', {
          Conditions: 'PLAYER_UPGRADE',
          Weapon: ['PRIMARY', 'StrongCannon'],
        }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 2,
        }),
        makeBlock('Behavior', 'WeaponBonusUpgrade ModuleTag_WeaponBonus', {
          TriggeredBy: 'Upgrade_Weapon',
        }),
      ], {
        CommandSet: 'CommandSet_UpgradeTank',
      }),
      makeObjectDef('TargetTank', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('WeakCannon', {
        AttackRange: 120,
        PrimaryDamage: 20,
        DelayBetweenShots: 100,
      }),
      makeWeaponDef('StrongCannon', {
        AttackRange: 120,
        PrimaryDamage: 60,
        DelayBetweenShots: 100,
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Weapon', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_UpgradeWeapon', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Weapon',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_UpgradeTank', {
        1: 'Command_UpgradeWeapon',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('UpgradeTank', 10, 10), makeMapObject('TargetTank', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 300 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Weapon' });
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const healthTimeline: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    healthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { credits, queueCounts, healthTimeline };
}

function runStealthUpgradeProductionTimeline(): {
  statusTimeline: string[][];
} {
    const bundle = makeBundle({
    objects: [
      makeObjectDef('SpyTruck', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 2,
        }),
        makeBlock('Behavior', 'StealthUpgrade ModuleTag_Stealth', {
          TriggeredBy: 'Upgrade_Stealth',
        }),
      ], {
        CommandSet: 'CommandSet_SpyTruck',
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Stealth', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_UpgradeStealth', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Stealth',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_SpyTruck', {
        1: 'Command_UpgradeStealth',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('SpyTruck', 10, 10)]),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 200 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Stealth' });

  const statusTimeline: string[][] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    logic.update(1 / 30);
    statusTimeline.push(logic.getEntityState(1)?.statusFlags ?? []);
  }

  return { statusTimeline };
}

function runMaxSimEquivalentVariationTimeline(): {
  credits: number[];
  queueCounts: number[];
  baseCounts: number[];
  variationCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 2,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [8, 0, 0],
          ExitDelay: 0,
        }),
      ]),
      makeObjectDef('BaseTank', 'America', ['VEHICLE'], [], {
        BuildTime: 0.1,
        BuildCost: 100,
        MaxSimultaneousOfType: 1,
        BuildVariations: ['TankVariant'],
      }),
      makeObjectDef('TankVariant', 'America', ['VEHICLE'], [], {
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('WarFactory', 10, 10), makeMapObject('TankVariant', 22, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'BaseTank' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const baseCounts: number[] = [];
  const variationCounts: number[] = [];
  for (let frame = 0; frame < 3; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    baseCounts.push(logic.getEntityIdsByTemplate('BaseTank').length);
    variationCounts.push(logic.getEntityIdsByTemplate('TankVariant').length);
  }

  return { credits, queueCounts, baseCounts, variationCounts };
}

function runPrerequisiteEquivalentVariationTimeline(): {
  credits: number[];
  queueCounts: number[];
  producedCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [8, 0, 0],
          ExitDelay: 0,
        }),
      ]),
      makeObjectDef('BaseTech', 'America', ['STRUCTURE'], [], {
        BuildVariations: ['TechVariant'],
      }),
      makeObjectDef('TechVariant', 'America', ['STRUCTURE'], []),
      makeObjectDef('AdvancedTank', 'America', ['VEHICLE'], [
        makeBlock('Prerequisite', 'Object BaseTech', {}),
      ], {
        BuildTime: 0.1,
        BuildCost: 120,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('WarFactory', 10, 10), makeMapObject('TechVariant', 20, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'AdvancedTank' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const producedCounts: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    producedCounts.push(logic.getEntityIdsByTemplate('AdvancedTank').length);
  }

  return { credits, queueCounts, producedCounts };
}

function runQuantityModifierEquivalentVariationTimeline(): {
  credits: number[];
  queueCounts: number[];
  baseCounts: number[];
  variationCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('Barracks', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 2,
          QuantityModifier: 'BaseInf 2',
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [8, 0, 0],
          ExitDelay: 0,
        }),
      ]),
      makeObjectDef('BaseInf', 'America', ['INFANTRY'], [], {
        BuildVariations: ['InfVariant'],
      }),
      makeObjectDef('InfVariant', 'America', ['INFANTRY'], [], {
        BuildTime: 0.1,
        BuildCost: 90,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('Barracks', 10, 10)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'InfVariant' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const baseCounts: number[] = [];
  const variationCounts: number[] = [];
  for (let frame = 0; frame < 5; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    baseCounts.push(logic.getEntityIdsByTemplate('BaseInf').length);
    variationCounts.push(logic.getEntityIdsByTemplate('InfVariant').length);
  }

  return { credits, queueCounts, baseCounts, variationCounts };
}

function runMaxSimultaneousTimeline(): {
  credits: number[];
  queueCounts: number[];
  unitCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 5,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [8, 0, 0],
          ExitDelay: 0,
        }),
      ]),
      makeObjectDef('CappedUnit', 'America', ['VEHICLE'], [], {
        BuildTime: 0.1,
        BuildCost: 100,
        MaxSimultaneousOfType: 2,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('WarFactory', 10, 10), makeMapObject('CappedUnit', 30, 10)]),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'CappedUnit' });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'CappedUnit' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const unitCounts: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    unitCounts.push(logic.getEntityIdsByTemplate('CappedUnit').length);
  }

  return { credits, queueCounts, unitCounts };
}

function runPrerequisiteTimeline(hasPowerPlant: boolean, hasTechAlt: boolean): {
  credits: number[];
  queueCounts: number[];
  producedCounts: number[];
} {
  const mapObjects = [makeMapObject('WarFactory', 10, 10)];
  if (hasPowerPlant) {
    mapObjects.push(makeMapObject('PowerPlant', 20, 10));
  }
  if (hasTechAlt) {
    mapObjects.push(makeMapObject('TechAlt', 30, 10));
  }

  const bundle = makeBundle({
    objects: [
      makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 4,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [8, 0, 0],
          ExitDelay: 0,
        }),
      ]),
      makeObjectDef('PowerPlant', 'America', ['STRUCTURE'], []),
      makeObjectDef('TechAlt', 'America', ['STRUCTURE'], []),
      makeObjectDef('AdvancedUnit', 'America', ['VEHICLE'], [
        makeBlock('Prerequisite', 'Object TechMain TechAlt', {}),
        makeBlock('Prerequisite', 'Object PowerPlant', {}),
      ], {
        BuildTime: 0.1,
        BuildCost: 150,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap(mapObjects, 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'AdvancedUnit' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const producedCounts: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    producedCounts.push(logic.getEntityIdsByTemplate('AdvancedUnit').length);
  }

  return { credits, queueCounts, producedCounts };
}

function runSciencePrerequisiteTimeline(params: {
  grantAtFrame: number | null;
  scienceGrantable?: boolean;
}): {
  credits: number[];
  queueCounts: number[];
  producedCounts: number[];
  scienceCounts: number[];
} {
  const scienceGrantable = params.scienceGrantable ?? true;
  const bundle = makeBundle({
    objects: [
      makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 4,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [8, 0, 0],
          ExitDelay: 0,
        }),
      ]),
      makeObjectDef('ScienceTank', 'America', ['VEHICLE'], [
        makeBlock('Prerequisite', 'Science SCIENCE_PROMO_1', {}),
      ], {
        BuildTime: 0.1,
        BuildCost: 150,
      }),
    ],
    sciences: [
      makeScienceDef('SCIENCE_PROMO_1', {
        IsGrantable: scienceGrantable ? 'Yes' : 'No',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('WarFactory', 10, 10)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'ScienceTank' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const producedCounts: number[] = [];
  const scienceCounts: number[] = [];
  for (let frame = 0; frame < 5; frame += 1) {
    if (params.grantAtFrame === frame) {
      logic.submitCommand({ type: 'grantSideScience', side: 'America', scienceName: 'SCIENCE_PROMO_1' });
      logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'ScienceTank' });
    }

    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    producedCounts.push(logic.getEntityIdsByTemplate('ScienceTank').length);
    scienceCounts.push(logic.getSideScienceState('America').acquired.length);
  }

  return { credits, queueCounts, producedCounts, scienceCounts };
}

function runPurchaseScienceUnlocksProductionTimeline(params: {
  scienceCost: number;
  commandScienceCost?: number;
  initialPoints: number;
  purchaseAtFrame: number;
  queueAtFrame: number;
}): {
  credits: number[];
  queueCounts: number[];
  producedCounts: number[];
  scienceCounts: number[];
  remainingPoints: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 4,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [8, 0, 0],
          ExitDelay: 0,
        }),
      ]),
      makeObjectDef('ScienceTank', 'America', ['VEHICLE'], [
        makeBlock('Prerequisite', 'Science SCIENCE_PROMO_1', {}),
      ], {
        BuildTime: 0.1,
        BuildCost: 150,
      }),
    ],
    sciences: [
      makeScienceDef('SCIENCE_PROMO_1', {
        SciencePurchasePointCost: params.scienceCost,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('WarFactory', 10, 10)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  (logic as unknown as { localPlayerSciencePurchasePoints: number }).localPlayerSciencePurchasePoints = params.initialPoints;

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const producedCounts: number[] = [];
  const scienceCounts: number[] = [];
  const remainingPoints: number[] = [];
  for (let frame = 0; frame < 7; frame += 1) {
    if (frame === params.purchaseAtFrame) {
      logic.submitCommand({
        type: 'purchaseScience',
        scienceName: 'SCIENCE_PROMO_1',
        scienceCost: params.commandScienceCost ?? params.scienceCost,
      });
    }
    if (frame === params.queueAtFrame) {
      logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'ScienceTank' });
    }

    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    producedCounts.push(logic.getEntityIdsByTemplate('ScienceTank').length);
    scienceCounts.push(logic.getSideScienceState('America').acquired.length);
    remainingPoints.push(logic.getLocalPlayerSciencePurchasePoints());
  }

  return { credits, queueCounts, producedCounts, scienceCounts, remainingPoints };
}

function runOnlyByAiBuildableTimeline(playerType: 'HUMAN' | 'COMPUTER'): {
  credits: number[];
  queueCounts: number[];
  producedCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 2,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [8, 0, 0],
          ExitDelay: 0,
        }),
      ]),
      makeObjectDef('AiDrone', 'America', ['VEHICLE'], [], {
        Buildable: 'Only_By_AI',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('WarFactory', 10, 10)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'setSidePlayerType', side: 'America', playerType });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'AiDrone' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const producedCounts: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    producedCounts.push(logic.getEntityIdsByTemplate('AiDrone').length);
  }

  return { credits, queueCounts, producedCounts };
}

function runMaxSimultaneousLinkKeyTimeline(): {
  credits: number[];
  queueCounts: number[];
  alphaCounts: number[];
  bravoCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 2,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [8, 0, 0],
          ExitDelay: 0,
        }),
      ]),
      makeObjectDef('ArmorAlpha', 'America', ['VEHICLE'], [], {
        MaxSimultaneousOfType: 1,
        MaxSimultaneousLinkKey: 'ARMOR_GROUP_ALPHA',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeObjectDef('ArmorBravo', 'America', ['VEHICLE'], [], {
        MaxSimultaneousOfType: 1,
        MaxSimultaneousLinkKey: 'ARMOR_GROUP_ALPHA',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('WarFactory', 10, 10), makeMapObject('ArmorAlpha', 26, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'ArmorBravo' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const alphaCounts: number[] = [];
  const bravoCounts: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    alphaCounts.push(logic.getEntityIdsByTemplate('ArmorAlpha').length);
    bravoCounts.push(logic.getEntityIdsByTemplate('ArmorBravo').length);
  }

  return { credits, queueCounts, alphaCounts, bravoCounts };
}

function runUpgradeCommandSetGateTimeline(matchesUpgradeButton: boolean): {
  credits: number[];
  queueCounts: number[];
  inProductionCounts: number[];
  completedCounts: number[];
} {
  const commandButtonName = matchesUpgradeButton ? 'Command_ResearchMove' : 'Command_NotAnUpgrade';
  const commandButtonUpgrade = matchesUpgradeButton ? 'Upgrade_Move' : 'Upgrade_Attack';
  const commandName = matchesUpgradeButton ? 'PLAYER_UPGRADE' : 'UNIT_BUILD';
  const bundle = makeBundle({
    objects: [
      makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
      ], {
        CommandSet: 'CommandSet_StrategyCenter',
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Move', {
        Type: 'PLAYER',
        BuildTime: 0.1,
        BuildCost: 150,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef(commandButtonName, {
        Command: commandName,
        Upgrade: commandButtonUpgrade,
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_StrategyCenter', {
        1: commandButtonName,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 300 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const inProductionCounts: number[] = [];
  const completedCounts: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    const sideUpgradeState = logic.getSideUpgradeState('America');
    inProductionCounts.push(sideUpgradeState.inProduction.length);
    completedCounts.push(sideUpgradeState.completed.length);
  }

  return { credits, queueCounts, inProductionCounts, completedCounts };
}

function runUpgradeNoCommandSetTimeline(): {
  credits: number[];
  queueCounts: number[];
  inProductionCounts: number[];
  completedCounts: number[];
} {
  const commandButtonName = 'Command_NotUpgrade';
  const bundle = makeBundle({
    objects: [
      makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
      ], {
        CommandSet: 'CommandSet_StrategyCenter',
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Move', {
        Type: 'PLAYER',
        BuildTime: 0.1,
        BuildCost: 150,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef(commandButtonName, {
        Command: 'UNIT_BUILD',
        Unit: 'Dummy',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_StrategyCenter', {
        1: commandButtonName,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 300 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const inProductionCounts: number[] = [];
  const completedCounts: number[] = [];
  for (let frame = 0; frame < 4; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    const sideUpgradeState = logic.getSideUpgradeState('America');
    inProductionCounts.push(sideUpgradeState.inProduction.length);
    completedCounts.push(sideUpgradeState.completed.length);
  }

  return { credits, queueCounts, inProductionCounts, completedCounts };
}

function runCommandSetUpgradeTimeline(useAltTrigger: boolean): {
  credits: number[];
  queueCounts: number[];
  maxHealth: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('UpgradeHub', 'America', ['STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
        makeBlock('Behavior', 'CommandSetUpgrade ModuleTag_CommandSet', {
          TriggeredBy: 'Upgrade_A',
          CommandSet: 'CommandSet_Hub_AfterA',
          CommandSetAlt: 'CommandSet_Hub_AfterA_Alt',
          TriggerAlt: 'Upgrade_Alt_Object',
        }),
        makeBlock('Behavior', 'MaxHealthUpgrade ModuleTag_UpgradeB', {
          TriggeredBy: 'Upgrade_B',
          AddMaxHealth: 50,
          ChangeType: 'SAME_CURRENTHEALTH',
        }),
        makeBlock('Behavior', 'MaxHealthUpgrade ModuleTag_UpgradeC', {
          TriggeredBy: 'Upgrade_C',
          AddMaxHealth: 80,
          ChangeType: 'SAME_CURRENTHEALTH',
        }),
      ], {
        CommandSet: 'CommandSet_Hub_Base',
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_A', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_B', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 120,
      }),
      makeUpgradeDef('Upgrade_C', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 140,
      }),
      makeUpgradeDef('Upgrade_Alt_Object', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 1,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_UpgradeA', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_A',
      }),
      makeCommandButtonDef('Command_UpgradeB', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_B',
      }),
      makeCommandButtonDef('Command_UpgradeC', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_C',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_Hub_Base', {
        1: 'Command_UpgradeA',
      }),
      makeCommandSetDef('CommandSet_Hub_AfterA', {
        1: 'Command_UpgradeB',
      }),
      makeCommandSetDef('CommandSet_Hub_AfterA_Alt', {
        1: 'Command_UpgradeC',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('UpgradeHub', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  if (useAltTrigger) {
    logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Alt_Object' });
  }

  // The first queue attempt for Upgrade_B must fail while the base command set is active.
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_B' });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_A' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const maxHealth: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    if (frame === 3) {
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_B' });
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_C' });
    }

    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    maxHealth.push(logic.getEntityState(1)?.maxHealth ?? -1);
  }

  return { credits, queueCounts, maxHealth };
}

function runCommandSetUpgradeRemovalTimeline(): {
  credits: number[];
  queueCounts: number[];
  queueNames: string[][];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('UpgradeHub', 'America', ['STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
        makeBlock('Behavior', 'CommandSetUpgrade ModuleTag_CommandSet', {
          TriggeredBy: 'Upgrade_A',
          CommandSet: 'CommandSet_Hub_AfterA',
          CommandSetAlt: 'CommandSet_Hub_AfterA_Alt',
          TriggerAlt: 'Upgrade_Alt_Object',
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Remover', {
          TriggeredBy: 'Upgrade_Remover',
          StatusToSet: 'UNSELECTABLE',
          RemovesUpgrades: 'Upgrade_Alt_Object',
        }),
        makeBlock('Behavior', 'MaxHealthUpgrade ModuleTag_UpgradeB', {
          TriggeredBy: 'Upgrade_B',
          AddMaxHealth: 50,
          ChangeType: 'SAME_CURRENTHEALTH',
        }),
      ], {
        CommandSet: 'CommandSet_Hub_Base',
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_A', {
        Type: 'OBJECT',
        BuildTime: 0.3,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_B', {
        Type: 'OBJECT',
        BuildTime: 0.3,
        BuildCost: 120,
      }),
      makeUpgradeDef('Upgrade_C', {
        Type: 'OBJECT',
        BuildTime: 0.3,
        BuildCost: 140,
      }),
      makeUpgradeDef('Upgrade_Alt_Object', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 1,
      }),
      makeUpgradeDef('Upgrade_Remover', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 1,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_UpgradeA', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_A',
      }),
      makeCommandButtonDef('Command_UpgradeB', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_B',
      }),
      makeCommandButtonDef('Command_UpgradeC', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_C',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_Hub_Base', {
        1: 'Command_UpgradeA',
      }),
      makeCommandSetDef('CommandSet_Hub_AfterA', {
        1: 'Command_UpgradeB',
      }),
      makeCommandSetDef('CommandSet_Hub_AfterA_Alt', {
        1: 'Command_UpgradeC',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('UpgradeHub', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Alt_Object' });
  logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_A' });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_B' });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_C' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const queueNames: string[][] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    if (frame === 1) {
      // Removing the alt trigger should revert the command set override and block Upgrade_C.
      logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Remover' });
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_B' });
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_C' });
    }

    logic.update(1 / 30);
    const state = logic.getProductionState(1);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(state?.queueEntryCount ?? 0);
    queueNames.push(state?.queue.filter((entry) => entry.type === 'UPGRADE').map((entry) => entry.upgradeName.trim().toUpperCase()) ?? []);
  }

  return { credits, queueCounts, queueNames };
}

function runParkingPlaceQueueTimeline(): {
  credits: number[];
  queueCounts: number[];
  jetCounts: number[];
  heliCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('Airfield', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [8, 0, 0],
          ExitDelay: 0,
        }),
        makeBlock('Behavior', 'ParkingPlaceBehavior ModuleTag_Parking', {
          NumRows: 1,
          NumCols: 1,
        }),
      ]),
      makeObjectDef('JetUnit', 'America', ['AIRCRAFT'], [], {
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeObjectDef('HelipadUnit', 'America', ['AIRCRAFT', 'PRODUCED_AT_HELIPAD'], [], {
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('Airfield', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'JetUnit' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const jetCounts: number[] = [];
  const heliCounts: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    if (frame === 3) {
      // This queue should be blocked because the single parking space is occupied by JetUnit.
      logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'JetUnit' });
    } else if (frame === 4) {
      // Source parity: PRODUCED_AT_HELIPAD bypasses parking reservation checks.
      logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'HelipadUnit' });
    }

    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    jetCounts.push(logic.getEntityIdsByTemplate('JetUnit').length);
    heliCounts.push(logic.getEntityIdsByTemplate('HelipadUnit').length);
  }

  return { credits, queueCounts, jetCounts, heliCounts };
}

function runParkingReservationQueueAndCancelTimeline(): {
  credits: number[];
  queueCounts: number[];
  jetQueuedCounts: number[];
  heliQueuedCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('Airfield', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 4,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [8, 0, 0],
          ExitDelay: 0,
        }),
        makeBlock('Behavior', 'ParkingPlaceBehavior ModuleTag_Parking', {
          NumRows: 1,
          NumCols: 1,
        }),
      ]),
      makeObjectDef('JetUnit', 'America', ['AIRCRAFT'], [], {
        BuildTime: 1,
        BuildCost: 100,
      }),
      makeObjectDef('HelipadUnit', 'America', ['AIRCRAFT', 'PRODUCED_AT_HELIPAD'], [], {
        BuildTime: 1,
        BuildCost: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('Airfield', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const jetQueuedCounts: number[] = [];
  const heliQueuedCounts: number[] = [];
  const capture = (): void => {
    const state = logic.getProductionState(1);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(state?.queueEntryCount ?? 0);
    jetQueuedCounts.push(
      state?.queue.filter((entry) => entry.type === 'UNIT' && entry.templateName.trim().toUpperCase() === 'JETUNIT').length ?? 0,
    );
    heliQueuedCounts.push(
      state?.queue.filter((entry) => entry.type === 'UNIT' && entry.templateName.trim().toUpperCase() === 'HELIPADUNIT').length ?? 0,
    );
  };

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'JetUnit' });
  logic.update(1 / 30);
  capture();

  // Source parity: queueCreateUnit reserves a parking exit slot for non-helipad units.
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'JetUnit' });
  logic.update(1 / 30);
  capture();

  // Source parity: PRODUCED_AT_HELIPAD bypasses parking-door reservation.
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'HelipadUnit' });
  logic.update(1 / 30);
  capture();

  const firstJetProductionId = logic.getProductionState(1)?.queue.find(
    (entry) => entry.type === 'UNIT' && entry.templateName.trim().toUpperCase() === 'JETUNIT',
  )?.productionId;
  if (firstJetProductionId !== undefined) {
    logic.submitCommand({
      type: 'cancelUnitProduction',
      entityId: 1,
      productionId: firstJetProductionId,
    });
  }
  logic.update(1 / 30);
  capture();

  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'JetUnit' });
  logic.update(1 / 30);
  capture();

  return { credits, queueCounts, jetQueuedCounts, heliQueuedCounts };
}

function runParkingQuantityStallTimeline(): {
  credits: number[];
  queueCounts: number[];
  jetCounts: number[];
  quantityProduced: number[];
  quantityTotal: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('Airfield', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
          QuantityModifier: 'JetUnit 2',
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [8, 0, 0],
          ExitDelay: 0,
        }),
        makeBlock('Behavior', 'ParkingPlaceBehavior ModuleTag_Parking', {
          NumRows: 1,
          NumCols: 1,
        }),
      ]),
      makeObjectDef('JetUnit', 'America', ['AIRCRAFT'], [], {
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('Airfield', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'JetUnit' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const jetCounts: number[] = [];
  const quantityProduced: number[] = [];
  const quantityTotal: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));

    const state = logic.getProductionState(1);
    queueCounts.push(state?.queueEntryCount ?? 0);
    const jetQueueEntry = state?.queue.find(
      (entry) => entry.type === 'UNIT' && entry.templateName.trim().toUpperCase() === 'JETUNIT',
    );
    quantityProduced.push(jetQueueEntry?.productionQuantityProduced ?? -1);
    quantityTotal.push(jetQueueEntry?.productionQuantityTotal ?? -1);
    jetCounts.push(logic.getEntityIdsByTemplate('JetUnit').length);
  }

  return { credits, queueCounts, jetCounts, quantityProduced, quantityTotal };
}

function runStatusBitsUpgradeTimeline(): {
  credits: number[];
  queueCounts: number[];
  statusFlagsTimeline: string[][];
} {
    const bundle = makeBundle({
    objects: [
      makeObjectDef('StatusLab', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_StatusA', {
          TriggeredBy: 'Upgrade_Status_A',
          StatusToSet: ['EMPED', 'UNSELECTABLE'],
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_StatusB', {
          TriggeredBy: 'Upgrade_Status_B',
          StatusToSet: 'STEALTHED',
          StatusToClear: 'EMPED',
        }),
      ], {
        CommandSet: 'CommandSet_StatusLab',
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Status_A', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 120,
      }),
      makeUpgradeDef('Upgrade_Status_B', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 130,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_UpgradeStatusA', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Status_A',
      }),
      makeCommandButtonDef('Command_UpgradeStatusB', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Status_B',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_StatusLab', {
        1: 'Command_UpgradeStatusA',
        2: 'Command_UpgradeStatusB',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('StatusLab', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Status_A' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const statusFlagsTimeline: string[][] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    if (frame === 3) {
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Status_B' });
    }

    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    statusFlagsTimeline.push(logic.getEntityState(1)?.statusFlags ?? []);
  }

  return { credits, queueCounts, statusFlagsTimeline };
}

function runStatusBitsUpgradeRemovalTimeline(): {
  credits: number[];
  queueCounts: number[];
  statusFlagsTimeline: string[][];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('StatusLab', 'America', ['STRUCTURE'], [
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Disable', {
          TriggeredBy: 'Upgrade_Disable',
          StatusToSet: 'NO_ATTACK',
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_RemoveDisable', {
          TriggeredBy: 'Upgrade_RemoveDisable',
          RemovesUpgrades: 'Upgrade_Disable',
        }),
      ], {
        CommandSet: 'CommandSet_StatusLab',
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Disable', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 120,
      }),
      makeUpgradeDef('Upgrade_RemoveDisable', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 80,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_UpgradeDisable', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Disable',
      }),
      makeCommandButtonDef('Command_UpgradeRemoveDisable', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_RemoveDisable',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_StatusLab', {
        1: 'Command_UpgradeDisable',
        2: 'Command_UpgradeRemoveDisable',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('StatusLab', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Disable' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const statusFlagsTimeline: string[][] = [];
  for (let frame = 0; frame < 10; frame += 1) {
    if (frame === 4) {
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_RemoveDisable' });
    }

    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    statusFlagsTimeline.push(logic.getEntityState(1)?.statusFlags ?? []);
  }

  return { credits, queueCounts, statusFlagsTimeline };
}

function runStatusBitsCombatTimeline(): {
  credits: number[];
  queueCounts: number[];
  statusFlagsTimeline: string[][];
  targetHealthTimeline: number[];
} {
    const bundle = makeBundle({
    objects: [
      makeObjectDef('StatusTank', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'StatusCannon'] }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_NoAttack', {
          TriggeredBy: 'Upgrade_NoAttack',
          StatusToSet: 'NO_ATTACK',
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_AttackRestore', {
          TriggeredBy: 'Upgrade_AttackRestore',
          StatusToClear: 'NO_ATTACK',
        }),
      ], {
        CommandSet: 'CommandSet_StatusTank',
      }),
      makeObjectDef('TargetTank', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('StatusCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        DelayBetweenShots: 100,
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_NoAttack', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_AttackRestore', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 120,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_UpgradeNoAttack', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_NoAttack',
      }),
      makeCommandButtonDef('Command_UpgradeAttackRestore', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_AttackRestore',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_StatusTank', {
        1: 'Command_UpgradeNoAttack',
        2: 'Command_UpgradeAttackRestore',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('StatusTank', 10, 10), makeMapObject('TargetTank', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_NoAttack' });
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const statusFlagsTimeline: string[][] = [];
  const targetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 10; frame += 1) {
    if (frame === 4) {
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_AttackRestore' });
    }

    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    statusFlagsTimeline.push(logic.getEntityState(1)?.statusFlags ?? []);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { credits, queueCounts, statusFlagsTimeline, targetHealthTimeline };
}

function runStatusBitsDisabledCombatTimeline(): {
  queueCounts: number[];
  statusFlagsTimeline: string[][];
  targetHealthTimeline: number[];
} {
    const bundle = makeBundle({
    objects: [
      makeObjectDef('StatusTank', 'America', ['VEHICLE', 'PORTABLE_STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'StatusCannon'] }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Disable', {
          TriggeredBy: 'Upgrade_Disable',
          StatusToSet: 'DISABLED_EMP',
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Restore', {
          TriggeredBy: 'Upgrade_Restore',
          StatusToClear: 'DISABLED_EMP',
        }),
      ], {
        CommandSet: 'CommandSet_StatusTank_Disable',
      }),
      makeObjectDef('TargetTank', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('StatusCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        DelayBetweenShots: 100,
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Disable', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_Restore', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 120,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_UpgradeDisable', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Disable',
      }),
      makeCommandButtonDef('Command_UpgradeRestore', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Restore',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_StatusTank_Disable', {
        1: 'Command_UpgradeDisable',
        2: 'Command_UpgradeRestore',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('StatusTank', 10, 10), makeMapObject('TargetTank', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Disable' });
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const queueCounts: number[] = [];
  const statusFlagsTimeline: string[][] = [];
  const targetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 10; frame += 1) {
    if (frame === 4) {
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Restore' });
    }

    logic.update(1 / 30);
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    statusFlagsTimeline.push(logic.getEntityState(1)?.statusFlags ?? []);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { queueCounts, statusFlagsTimeline, targetHealthTimeline };
}

function runStatusBitsDisabledHackCombatTimeline(): {
  queueCounts: number[];
  statusFlagsTimeline: string[][];
  targetHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('StatusTank', 'America', ['VEHICLE', 'PORTABLE_STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'StatusCannon'] }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Disable', {
          TriggeredBy: 'Upgrade_Disable',
          StatusToSet: 'DISABLED_HACKED',
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Restore', {
          TriggeredBy: 'Upgrade_Restore',
          StatusToClear: 'DISABLED_HACKED',
        }),
      ], {
        CommandSet: 'CommandSet_StatusTank_Hack',
      }),
      makeObjectDef('TargetTank', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('StatusCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        DelayBetweenShots: 100,
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Disable', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_Restore', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 120,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_UpgradeDisable', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Disable',
      }),
      makeCommandButtonDef('Command_UpgradeRestore', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Restore',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_StatusTank_Hack', {
        1: 'Command_UpgradeDisable',
        2: 'Command_UpgradeRestore',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('StatusTank', 10, 10), makeMapObject('TargetTank', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Disable' });
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const queueCounts: number[] = [];
  const statusFlagsTimeline: string[][] = [];
  const targetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 10; frame += 1) {
    if (frame === 4) {
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Restore' });
    }

    logic.update(1 / 30);
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    statusFlagsTimeline.push(logic.getEntityState(1)?.statusFlags ?? []);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { queueCounts, statusFlagsTimeline, targetHealthTimeline };
}

function runStatusBitsDisabledSubduedCombatTimeline(): {
  queueCounts: number[];
  statusFlagsTimeline: string[][];
  targetHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('StatusTank', 'America', ['VEHICLE', 'PORTABLE_STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'StatusCannon'] }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Disable', {
          TriggeredBy: 'Upgrade_Disable',
          StatusToSet: 'DISABLED_SUBDUED',
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Restore', {
          TriggeredBy: 'Upgrade_Restore',
          StatusToClear: 'DISABLED_SUBDUED',
        }),
      ], {
        CommandSet: 'CommandSet_StatusTank_Subdue',
      }),
      makeObjectDef('TargetTank', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('StatusCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        DelayBetweenShots: 100,
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Disable', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_Restore', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 120,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_UpgradeDisable', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Disable',
      }),
      makeCommandButtonDef('Command_UpgradeRestore', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_Restore',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_StatusTank_Subdue', {
        1: 'Command_UpgradeDisable',
        2: 'Command_UpgradeRestore',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('StatusTank', 10, 10), makeMapObject('TargetTank', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Disable' });
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const queueCounts: number[] = [];
  const statusFlagsTimeline: string[][] = [];
  const targetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 10; frame += 1) {
    if (frame === 4) {
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Restore' });
    }

    logic.update(1 / 30);
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    statusFlagsTimeline.push(logic.getEntityState(1)?.statusFlags ?? []);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { queueCounts, statusFlagsTimeline, targetHealthTimeline };
}

function runAimAndFiringStatusTimeline(): {
  statusFlagsTimeline: string[][];
  targetHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('AimStatusAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'AimStatusCannon'] }),
      ]),
      makeObjectDef('AimStatusTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('AimStatusCannon', {
        AttackRange: 120,
        PrimaryDamage: 30,
        PreAttackDelay: 100,
        DelayBetweenShots: 1000,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('AimStatusAttacker', 10, 10), makeMapObject('AimStatusTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const statusFlagsTimeline: string[][] = [];
  const targetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    if (frame === 5) {
      logic.submitCommand({ type: 'stop', entityId: 1 });
    }
    logic.update(1 / 30);
    statusFlagsTimeline.push(logic.getEntityState(1)?.statusFlags ?? []);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { statusFlagsTimeline, targetHealthTimeline };
}

function runStealthAttackGateTimeline(params: {
  continueAttackRange: number;
  detected: boolean;
  preAttackDelayMs: number;
}): {
  attackerStatusFlagsTimeline: string[][];
  attackerTargetTimeline: Array<number | null>;
  targetHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('StealthGateAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 250, InitialHealth: 250 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'StealthGateCannon'] }),
      ]),
      makeObjectDef('StealthGateTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Stealthed', {
          TriggeredBy: 'Upgrade_Stealthed',
          StatusToSet: 'STEALTHED',
        }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Detected', {
          TriggeredBy: 'Upgrade_Detected',
          StatusToSet: 'DETECTED',
        }),
      ]),
    ],
    weapons: [
      makeWeaponDef('StealthGateCannon', {
        AttackRange: 140,
        ContinueAttackRange: params.continueAttackRange,
        PrimaryDamage: 30,
        PreAttackDelay: params.preAttackDelayMs,
        DelayBetweenShots: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('StealthGateAttacker', 10, 10), makeMapObject('StealthGateTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'applyUpgrade', entityId: 2, upgradeName: 'Upgrade_Stealthed' });
  if (params.detected) {
    logic.submitCommand({ type: 'applyUpgrade', entityId: 2, upgradeName: 'Upgrade_Detected' });
  }
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const attackerStatusFlagsTimeline: string[][] = [];
  const attackerTargetTimeline: Array<number | null> = [];
  const targetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    logic.update(1 / 30);
    attackerStatusFlagsTimeline.push(logic.getEntityState(1)?.statusFlags ?? []);
    attackerTargetTimeline.push(logic.getEntityState(1)?.attackTargetEntityId ?? null);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return {
    attackerStatusFlagsTimeline,
    attackerTargetTimeline,
    targetHealthTimeline,
  };
}

function runUpgradeRemovalMuxTimeline(): {
  credits: number[];
  queueCounts: number[];
  maxHealthTimeline: number[];
} {
    const bundle = makeBundle({
    objects: [
      makeObjectDef('UpgradeMuxLab', 'America', ['STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
        makeBlock('Behavior', 'MaxHealthUpgrade ModuleTag_UpgradeB', {
          TriggeredBy: 'Upgrade_B',
          AddMaxHealth: 20,
          ChangeType: 'SAME_CURRENTHEALTH',
        }),
        makeBlock('Behavior', 'MaxHealthUpgrade ModuleTag_UpgradeA', {
          TriggeredBy: 'Upgrade_A',
          RemovesUpgrades: 'Upgrade_B',
          AddMaxHealth: 30,
          ChangeType: 'SAME_CURRENTHEALTH',
        }),
      ], {
        CommandSet: 'CommandSet_UpgradeMuxLab',
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_A', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
      makeUpgradeDef('Upgrade_B', {
        Type: 'OBJECT',
        BuildTime: 0.1,
        BuildCost: 100,
      }),
    ],
    commandButtons: [
      makeCommandButtonDef('Command_UpgradeA', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_A',
      }),
      makeCommandButtonDef('Command_UpgradeB', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_B',
      }),
    ],
    commandSets: [
      makeCommandSetDef('CommandSet_UpgradeMuxLab', {
        1: 'Command_UpgradeA',
        2: 'Command_UpgradeB',
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(makeMap([makeMapObject('UpgradeMuxLab', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_B' });

  const credits: number[] = [];
  const queueCounts: number[] = [];
  const maxHealthTimeline: number[] = [];
  for (let frame = 0; frame < 10; frame += 1) {
    if (frame === 3) {
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_A' });
    } else if (frame === 6) {
      // Source parity: RemovesUpgrades clears object-upgrade ownership, allowing re-queue of Upgrade_B.
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_B' });
    }

    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
    maxHealthTimeline.push(logic.getEntityState(1)?.maxHealth ?? -1);
  }

  return { credits, queueCounts, maxHealthTimeline };
}

function runMinimumAttackRangeStationaryTimeline(): {
  targetHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('MinRangeTurret', 'America', ['STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'MinRangeCannon'] }),
      ]),
      makeObjectDef('CloseTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('MinRangeCannon', {
        AttackRange: 120,
        MinimumAttackRange: 40,
        PrimaryDamage: 30,
        DelayBetweenShots: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('MinRangeTurret', 10, 10), makeMapObject('CloseTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const targetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    logic.update(1 / 30);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { targetHealthTimeline };
}

function runMinimumAttackRangeRetreatTimeline(): {
  targetHealthTimeline: number[];
  attackerRangeTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('MinRangeTank', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'MinRangeCannon'] }),
      ]),
      makeObjectDef('CloseTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('MinRangeCannon', {
        AttackRange: 80,
        MinimumAttackRange: 40,
        PrimaryDamage: 30,
        DelayBetweenShots: 100,
      }),
    ],
    locomotors: [
      makeLocomotorDef('LocomotorFast', 180),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('MinRangeTank', 40, 10), makeMapObject('CloseTarget', 25, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const targetHealthTimeline: number[] = [];
  const attackerRangeTimeline: number[] = [];
  for (let frame = 0; frame < 16; frame += 1) {
    if (frame === 2) {
      // Move outside min range, then re-issue attack after movement settles.
      logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 85, targetZ: 10 });
    }
    if (frame === 10) {
      logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });
    }
    logic.update(1 / 30);
    const attacker = logic.getEntityState(1);
    const target = logic.getEntityState(2);
    targetHealthTimeline.push(target?.health ?? -1);
    if (attacker && target) {
      const dx = target.x - attacker.x;
      const dz = target.z - attacker.z;
      attackerRangeTimeline.push(Math.sqrt(dx * dx + dz * dz));
    } else {
      attackerRangeTimeline.push(-1);
    }
  }

  return { targetHealthTimeline, attackerRangeTimeline };
}

function runContinueAttackRangeTimeline(continueAttackRange: number): {
  attackerTargetTimeline: Array<number | null>;
  chinaFollowupHealthTimeline: number[];
  glaFollowupHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ContinueRangeAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ContinueRangeCannon'] }),
      ]),
      makeObjectDef('InitialVictimChina', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('FollowupVictimChina', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('FarVictimChina', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('NearVictimGla', 'GLA', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ContinueRangeCannon', {
        AttackRange: 220,
        ContinueAttackRange: continueAttackRange,
        PrimaryDamage: 120,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 999999,
        DelayBetweenShots: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('ContinueRangeAttacker', 20, 20, { originalOwner: 'AmericaPlayer' }),
      makeMapObject('InitialVictimChina', 50, 20, { originalOwner: 'ChinaPlayerA' }),
      makeMapObject('FollowupVictimChina', 56, 20, { originalOwner: 'ChinaPlayerA' }),
      makeMapObject('FarVictimChina', 74, 20, { originalOwner: 'ChinaPlayerA' }),
      makeMapObject('NearVictimGla', 52, 20, { originalOwner: 'GlaPlayerA' }),
    ], 96, 96),
    makeRegistry(bundle),
    makeHeightmap(96, 96),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.setTeamRelationship('America', 'GLA', 0);
  logic.setTeamRelationship('GLA', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const attackerTargetTimeline: Array<number | null> = [];
  const chinaFollowupHealthTimeline: number[] = [];
  const glaFollowupHealthTimeline: number[] = [];

  for (let frame = 0; frame < 8; frame += 1) {
    logic.update(1 / 30);
    attackerTargetTimeline.push(logic.getEntityState(1)?.attackTargetEntityId ?? null);
    chinaFollowupHealthTimeline.push(logic.getEntityState(3)?.health ?? -1);
    glaFollowupHealthTimeline.push(logic.getEntityState(5)?.health ?? -1);
  }

  return {
    attackerTargetTimeline,
    chinaFollowupHealthTimeline,
    glaFollowupHealthTimeline,
  };
}

function runContinueAttackSamePlayerFilterTimeline(): {
  attackerTargetTimeline: Array<number | null>;
  differentOwnerFollowupHealthTimeline: number[];
  sameOwnerFollowupHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ContinuePlayerFilterAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ContinuePlayerFilterCannon'] }),
      ]),
      makeObjectDef('ContinuePlayerFilterInitialVictim', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('ContinuePlayerFilterDifferentOwner', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('ContinuePlayerFilterSameOwner', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ContinuePlayerFilterCannon', {
        AttackRange: 220,
        ContinueAttackRange: 20,
        PrimaryDamage: 120,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 999999,
        DelayBetweenShots: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('ContinuePlayerFilterAttacker', 20, 20, { originalOwner: 'AmericaPlayer' }),
      makeMapObject('ContinuePlayerFilterInitialVictim', 50, 20, { originalOwner: 'ChinaPlayerA' }),
      makeMapObject('ContinuePlayerFilterDifferentOwner', 52, 20, { originalOwner: 'ChinaPlayerB' }),
      makeMapObject('ContinuePlayerFilterSameOwner', 58, 20, { originalOwner: 'ChinaPlayerA' }),
    ], 96, 96),
    makeRegistry(bundle),
    makeHeightmap(96, 96),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const attackerTargetTimeline: Array<number | null> = [];
  const differentOwnerFollowupHealthTimeline: number[] = [];
  const sameOwnerFollowupHealthTimeline: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    logic.update(1 / 30);
    attackerTargetTimeline.push(logic.getEntityState(1)?.attackTargetEntityId ?? null);
    differentOwnerFollowupHealthTimeline.push(logic.getEntityState(3)?.health ?? -1);
    sameOwnerFollowupHealthTimeline.push(logic.getEntityState(4)?.health ?? -1);
  }

  return {
    attackerTargetTimeline,
    differentOwnerFollowupHealthTimeline,
    sameOwnerFollowupHealthTimeline,
  };
}

function runMaskedTargetGateTimeline(): {
  attackerTargetTimeline: Array<number | null>;
  maskedTargetHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('MaskedGateAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 250, InitialHealth: 250 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'MaskedGateCannon'] }),
      ]),
      makeObjectDef('MaskedGateTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Masked', {
          TriggeredBy: 'Upgrade_Masked',
          StatusToSet: 'MASKED',
        }),
      ]),
    ],
    weapons: [
      makeWeaponDef('MaskedGateCannon', {
        AttackRange: 140,
        PrimaryDamage: 30,
        DelayBetweenShots: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('MaskedGateAttacker', 10, 10), makeMapObject('MaskedGateTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'applyUpgrade', entityId: 2, upgradeName: 'Upgrade_Masked' });
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const attackerTargetTimeline: Array<number | null> = [];
  const maskedTargetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 6; frame += 1) {
    logic.update(1 / 30);
    attackerTargetTimeline.push(logic.getEntityState(1)?.attackTargetEntityId ?? null);
    maskedTargetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { attackerTargetTimeline, maskedTargetHealthTimeline };
}

function runUnattackableKindGateTimeline(): {
  attackerTargetTimeline: Array<number | null>;
  unattackableTargetHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('UnattackableGateAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 250, InitialHealth: 250 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'UnattackableGateCannon'] }),
      ]),
      makeObjectDef('UnattackableGateTarget', 'China', ['VEHICLE', 'UNATTACKABLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('UnattackableGateCannon', {
        AttackRange: 140,
        PrimaryDamage: 30,
        DelayBetweenShots: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('UnattackableGateAttacker', 10, 10), makeMapObject('UnattackableGateTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const attackerTargetTimeline: Array<number | null> = [];
  const unattackableTargetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 6; frame += 1) {
    logic.update(1 / 30);
    attackerTargetTimeline.push(logic.getEntityState(1)?.attackTargetEntityId ?? null);
    unattackableTargetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { attackerTargetTimeline, unattackableTargetHealthTimeline };
}

function runContinueAttackRangeLegalityFilterTimeline(): {
  attackerTargetTimeline: Array<number | null>;
  maskedFollowupHealthTimeline: number[];
  unattackableFollowupHealthTimeline: number[];
  validFollowupHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ContinueLegalityAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ContinueLegalityCannon'] }),
      ]),
      makeObjectDef('ContinueLegalityInitialVictim', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('ContinueLegalityMaskedVictim', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_Masked', {
          TriggeredBy: 'Upgrade_Masked',
          StatusToSet: 'MASKED',
        }),
      ]),
      makeObjectDef('ContinueLegalityUnattackableVictim', 'China', ['VEHICLE', 'UNATTACKABLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('ContinueLegalityValidVictim', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ContinueLegalityCannon', {
        AttackRange: 220,
        ContinueAttackRange: 20,
        PrimaryDamage: 120,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 999999,
        DelayBetweenShots: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('ContinueLegalityAttacker', 20, 20, { originalOwner: 'AmericaPlayer' }),
      makeMapObject('ContinueLegalityInitialVictim', 50, 20, { originalOwner: 'ChinaPlayerA' }),
      makeMapObject('ContinueLegalityMaskedVictim', 52, 20, { originalOwner: 'ChinaPlayerA' }),
      makeMapObject('ContinueLegalityUnattackableVictim', 54, 20, { originalOwner: 'ChinaPlayerA' }),
      makeMapObject('ContinueLegalityValidVictim', 58, 20, { originalOwner: 'ChinaPlayerA' }),
    ], 96, 96),
    makeRegistry(bundle),
    makeHeightmap(96, 96),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'applyUpgrade', entityId: 3, upgradeName: 'Upgrade_Masked' });
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const attackerTargetTimeline: Array<number | null> = [];
  const maskedFollowupHealthTimeline: number[] = [];
  const unattackableFollowupHealthTimeline: number[] = [];
  const validFollowupHealthTimeline: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    logic.update(1 / 30);
    attackerTargetTimeline.push(logic.getEntityState(1)?.attackTargetEntityId ?? null);
    maskedFollowupHealthTimeline.push(logic.getEntityState(3)?.health ?? -1);
    unattackableFollowupHealthTimeline.push(logic.getEntityState(4)?.health ?? -1);
    validFollowupHealthTimeline.push(logic.getEntityState(5)?.health ?? -1);
  }

  return {
    attackerTargetTimeline,
    maskedFollowupHealthTimeline,
    unattackableFollowupHealthTimeline,
    validFollowupHealthTimeline,
  };
}

function runNoAttackFromAiGateTimeline(commandSource: 'PLAYER' | 'AI'): {
  attackerTargetTimeline: Array<number | null>;
  targetHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('NoAttackFromAiAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 250, InitialHealth: 250 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'NoAttackFromAiCannon'] }),
      ]),
      makeObjectDef('NoAttackFromAiTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_NoAttackFromAi', {
          TriggeredBy: 'Upgrade_NoAttackFromAi',
          StatusToSet: 'NO_ATTACK_FROM_AI',
        }),
      ]),
    ],
    weapons: [
      makeWeaponDef('NoAttackFromAiCannon', {
        AttackRange: 140,
        PrimaryDamage: 30,
        DelayBetweenShots: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('NoAttackFromAiAttacker', 10, 10), makeMapObject('NoAttackFromAiTarget', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'applyUpgrade', entityId: 2, upgradeName: 'Upgrade_NoAttackFromAi' });
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2, commandSource });

  const attackerTargetTimeline: Array<number | null> = [];
  const targetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 6; frame += 1) {
    logic.update(1 / 30);
    attackerTargetTimeline.push(logic.getEntityState(1)?.attackTargetEntityId ?? null);
    targetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return { attackerTargetTimeline, targetHealthTimeline };
}

function runContinueAttackNoAttackFromAiFilterTimeline(commandSource: 'PLAYER' | 'AI'): {
  attackerTargetTimeline: Array<number | null>;
  noAttackFromAiFollowupHealthTimeline: number[];
  validFollowupHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ContinueNoAttackFromAiAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ContinueNoAttackFromAiCannon'] }),
      ]),
      makeObjectDef('ContinueNoAttackFromAiInitialVictim', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('ContinueNoAttackFromAiFollowupFiltered', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('Behavior', 'StatusBitsUpgrade ModuleTag_NoAttackFromAi', {
          TriggeredBy: 'Upgrade_NoAttackFromAi',
          StatusToSet: 'NO_ATTACK_FROM_AI',
        }),
      ]),
      makeObjectDef('ContinueNoAttackFromAiFollowupValid', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ContinueNoAttackFromAiCannon', {
        AttackRange: 220,
        ContinueAttackRange: 20,
        PrimaryDamage: 120,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 999999,
        DelayBetweenShots: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('ContinueNoAttackFromAiAttacker', 20, 20, { originalOwner: 'AmericaPlayer' }),
      makeMapObject('ContinueNoAttackFromAiInitialVictim', 50, 20, { originalOwner: 'ChinaPlayerA' }),
      makeMapObject('ContinueNoAttackFromAiFollowupFiltered', 52, 20, { originalOwner: 'ChinaPlayerA' }),
      makeMapObject('ContinueNoAttackFromAiFollowupValid', 58, 20, { originalOwner: 'ChinaPlayerA' }),
    ], 96, 96),
    makeRegistry(bundle),
    makeHeightmap(96, 96),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'applyUpgrade', entityId: 3, upgradeName: 'Upgrade_NoAttackFromAi' });
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2, commandSource });

  const attackerTargetTimeline: Array<number | null> = [];
  const noAttackFromAiFollowupHealthTimeline: number[] = [];
  const validFollowupHealthTimeline: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    logic.update(1 / 30);
    attackerTargetTimeline.push(logic.getEntityState(1)?.attackTargetEntityId ?? null);
    noAttackFromAiFollowupHealthTimeline.push(logic.getEntityState(3)?.health ?? -1);
    validFollowupHealthTimeline.push(logic.getEntityState(4)?.health ?? -1);
  }

  return {
    attackerTargetTimeline,
    noAttackFromAiFollowupHealthTimeline,
    validFollowupHealthTimeline,
  };
}

function runOffMapTargetGateTimeline(): {
  attackerTargetTimeline: Array<number | null>;
  offMapTargetHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('OffMapGateAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 250, InitialHealth: 250 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'OffMapGateCannon'] }),
      ]),
      makeObjectDef('OffMapGateTarget', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 150, InitialHealth: 150 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('OffMapGateCannon', {
        AttackRange: 220,
        PrimaryDamage: 30,
        DelayBetweenShots: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('OffMapGateAttacker', 10, 10), makeMapObject('OffMapGateTarget', -2, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const attackerTargetTimeline: Array<number | null> = [];
  const offMapTargetHealthTimeline: number[] = [];
  for (let frame = 0; frame < 6; frame += 1) {
    logic.update(1 / 30);
    attackerTargetTimeline.push(logic.getEntityState(1)?.attackTargetEntityId ?? null);
    offMapTargetHealthTimeline.push(logic.getEntityState(2)?.health ?? -1);
  }

  return {
    attackerTargetTimeline,
    offMapTargetHealthTimeline,
  };
}

function runContinueAttackOffMapFilterTimeline(): {
  attackerTargetTimeline: Array<number | null>;
  offMapFollowupHealthTimeline: number[];
  onMapFollowupHealthTimeline: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('ContinueOffMapAttacker', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ContinueOffMapCannon'] }),
      ]),
      makeObjectDef('ContinueOffMapInitialVictim', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('ContinueOffMapFollowupOffMap', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      makeObjectDef('ContinueOffMapFollowupOnMap', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
    ],
    weapons: [
      makeWeaponDef('ContinueOffMapCannon', {
        AttackRange: 220,
        ContinueAttackRange: 20,
        PrimaryDamage: 120,
        PrimaryDamageRadius: 0,
        SecondaryDamage: 0,
        SecondaryDamageRadius: 0,
        WeaponSpeed: 999999,
        DelayBetweenShots: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([
      makeMapObject('ContinueOffMapAttacker', 10, 20, { originalOwner: 'AmericaPlayer' }),
      makeMapObject('ContinueOffMapInitialVictim', 0, 20, { originalOwner: 'ChinaPlayerA' }),
      makeMapObject('ContinueOffMapFollowupOffMap', -1, 20, { originalOwner: 'ChinaPlayerA' }),
      makeMapObject('ContinueOffMapFollowupOnMap', 2, 20, { originalOwner: 'ChinaPlayerA' }),
    ], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

  const attackerTargetTimeline: Array<number | null> = [];
  const offMapFollowupHealthTimeline: number[] = [];
  const onMapFollowupHealthTimeline: number[] = [];
  for (let frame = 0; frame < 8; frame += 1) {
    logic.update(1 / 30);
    attackerTargetTimeline.push(logic.getEntityState(1)?.attackTargetEntityId ?? null);
    offMapFollowupHealthTimeline.push(logic.getEntityState(3)?.health ?? -1);
    onMapFollowupHealthTimeline.push(logic.getEntityState(4)?.health ?? -1);
  }

  return {
    attackerTargetTimeline,
    offMapFollowupHealthTimeline,
    onMapFollowupHealthTimeline,
  };
}

function runProducerDeathUnitRefundTimeline(): {
  credits: number[];
  alive: boolean[];
  producedCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 4,
        }),
        makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
          UnitCreatePoint: [8, 0, 0],
          ExitDelay: 0,
        }),
      ]),
      makeObjectDef('EnemyTank', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'KillerCannon'] }),
      ]),
      makeObjectDef('VehicleA', 'America', ['VEHICLE'], [], { BuildTime: 2, BuildCost: 100 }),
    ],
    weapons: [
      makeWeaponDef('KillerCannon', {
        AttackRange: 120,
        PrimaryDamage: 200,
        DelayBetweenShots: 100,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('WarFactory', 10, 10), makeMapObject('EnemyTank', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'VehicleA' });
  logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'VehicleA' });
  logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

  const credits: number[] = [];
  const alive: boolean[] = [];
  const producedCounts: number[] = [];
  for (let frame = 0; frame < 3; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    alive.push(logic.getEntityState(1) !== null);
    producedCounts.push(logic.getEntityIdsByTemplate('VehicleA').length);
  }

  return { credits, alive, producedCounts };
}

function runProducerDeathUpgradeRefundTimeline(): {
  credits: number[];
  inProductionCounts: number[];
  completedCounts: number[];
} {
  const bundle = makeBundle({
    objects: [
      makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
          MaxQueueEntries: 3,
        }),
      ]),
      makeObjectDef('EnemyTank', 'China', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'KillerCannon'] }),
      ]),
    ],
    weapons: [
      makeWeaponDef('KillerCannon', {
        AttackRange: 120,
        PrimaryDamage: 200,
        DelayBetweenShots: 100,
      }),
    ],
    upgrades: [
      makeUpgradeDef('Upgrade_Move', {
        Type: 'PLAYER',
        BuildTime: 2,
        BuildCost: 200,
      }),
    ],
  });

  const scene = new THREE.Scene();
  const logic = new GameLogicSubsystem(scene);
  logic.loadMapObjects(
    makeMap([makeMapObject('StrategyCenter', 10, 10), makeMapObject('EnemyTank', 30, 10)], 64, 64),
    makeRegistry(bundle),
    makeHeightmap(64, 64),
  );

  logic.setTeamRelationship('America', 'China', 0);
  logic.setTeamRelationship('China', 'America', 0);
  logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
  logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
  logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

  const credits: number[] = [];
  const inProductionCounts: number[] = [];
  const completedCounts: number[] = [];
  for (let frame = 0; frame < 3; frame += 1) {
    logic.update(1 / 30);
    credits.push(logic.getSideCredits('America'));
    const sideState = logic.getSideUpgradeState('America');
    inProductionCounts.push(sideState.inProduction.length);
    completedCounts.push(sideState.completed.length);
  }

  return { credits, inProductionCounts, completedCounts };
}

describe('GameLogicSubsystem combat + upgrades', () => {
  it('routes issueSpecialPower commands through source resolution and no-target handler', () => {
    const { logic } = makeSpecialPowerCaptureSetup();
    logic.submitCommand({
      type: 'select',
      entityId: 4,
    });
    logic.trackShortcutSpecialPowerSourceEntity('POWER_TEST', 3, 0);

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnDirect',
      specialPowerName: ' power_test ',
      commandOption: 0,
      issuingEntityIds: [2],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'noTarget',
        sourceEntityId: 1,
        specialPowerName: 'POWER_TEST',
        commandOption: 0,
        commandButtonId: 'BtnDirect',
      },
    ]);

    logic.events.length = 0;
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnIssuing',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [2],
      sourceEntityId: null,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'noTarget',
        sourceEntityId: 2,
        specialPowerName: 'POWER_TEST',
        commandOption: 0,
        commandButtonId: 'BtnIssuing',
      },
    ]);

    logic.events.length = 0;
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnShortcut',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: null,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'noTarget',
        sourceEntityId: 3,
        specialPowerName: 'POWER_TEST',
        commandOption: 0,
        commandButtonId: 'BtnShortcut',
      },
    ]);

    logic.events.length = 0;
    logic.trackShortcutSpecialPowerSourceEntity('POWER_TEST', 3, 0);
    logic.setShortcutSpecialPowerSourceEntity('POWER_TEST', null);
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnSelected',
      commandOption: 0,
      specialPowerName: 'POWER_TEST',
      issuingEntityIds: [999],
      sourceEntityId: null,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'noTarget',
        sourceEntityId: 4,
        specialPowerName: 'POWER_TEST',
        commandOption: 0,
        commandButtonId: 'BtnSelected',
      },
    ]);
  });

  it('enforces per-source cooldown for issueSpecialPower commands when SharedSyncedTimer is false', () => {
    const { logic } = makeSpecialPowerCaptureSetup({
      reloadTimeMs: 34,
      sharedSyncedTimer: false,
    });

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnPerSourcePrimary',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'noTarget',
        sourceEntityId: 1,
        specialPowerName: 'POWER_TEST',
        commandOption: 0,
        commandButtonId: 'BtnPerSourcePrimary',
      },
    ]);

    logic.events.length = 0;
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnPerSourceBlocked',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([]);

    logic.events.length = 0;
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnPerSourceOtherSource',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 2,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'noTarget',
        sourceEntityId: 2,
        specialPowerName: 'POWER_TEST',
        commandOption: 0,
        commandButtonId: 'BtnPerSourceOtherSource',
      },
    ]);
  });

  it('shares special power cooldown when SharedSyncedTimer is true', () => {
    const { logic } = makeSpecialPowerCaptureSetup({
      reloadTimeMs: 34,
      sharedSyncedTimer: true,
    });

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnSharedPrimary',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'noTarget',
        sourceEntityId: 1,
        specialPowerName: 'POWER_TEST',
        commandOption: 0,
        commandButtonId: 'BtnSharedPrimary',
      },
    ]);

    logic.events.length = 0;
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnSharedBlockedByFirst',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 2,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([]);

    logic.events.length = 0;
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnSharedAfterReload',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'noTarget',
        sourceEntityId: 1,
        specialPowerName: 'POWER_TEST',
        commandOption: 0,
        commandButtonId: 'BtnSharedAfterReload',
      },
    ]);
  });

  it('unpause special power module resets per-source cooldown for OBJECT upgrades', () => {
    const { logic } = makeUnpauseSpecialPowerUpgradeSetup({
      sharedSyncedTimer: false,
      reloadTimeMs: 5000,
    });

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnInitial',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'noTarget',
        sourceEntityId: 1,
        specialPowerName: 'POWER_TEST',
        commandOption: 0,
        commandButtonId: 'BtnInitial',
      },
    ]);

    logic.events.length = 0;
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnStillBlocked',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnOtherSourceStillAllowed',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 2,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'noTarget',
        sourceEntityId: 2,
        specialPowerName: 'POWER_TEST',
        commandOption: 0,
        commandButtonId: 'BtnOtherSourceStillAllowed',
      },
    ]);

    logic.events.length = 0;
    logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Unpause' });
    logic.update(1 / 30);
    expect(logic.events).toEqual([]);

    logic.events.length = 0;
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnAfterUnpause',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'noTarget',
        sourceEntityId: 1,
        specialPowerName: 'POWER_TEST',
        commandOption: 0,
        commandButtonId: 'BtnAfterUnpause',
      },
    ]);
  });

  it('unpause special power module resets shared special power cooldown for all sources', () => {
    const { logic } = makeUnpauseSpecialPowerUpgradeSetup({
      sharedSyncedTimer: true,
      reloadTimeMs: 5000,
    });

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnInitialShared',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'noTarget',
        sourceEntityId: 1,
        specialPowerName: 'POWER_TEST',
        commandOption: 0,
        commandButtonId: 'BtnInitialShared',
      },
    ]);

    logic.events.length = 0;
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnBlockedByShared',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 2,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([]);

    logic.events.length = 0;
    logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Unpause' });
    logic.update(1 / 30);
    expect(logic.events).toEqual([]);

    logic.events.length = 0;
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnAfterSharedUnpause',
      specialPowerName: 'POWER_TEST',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 2,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'noTarget',
        sourceEntityId: 2,
        specialPowerName: 'POWER_TEST',
        commandOption: 0,
        commandButtonId: 'BtnAfterSharedUnpause',
      },
    ]);
  });

  it('routes issueSpecialPower to target-object handler only when relationship matches command option', () => {
    const { logic } = makeSpecialPowerCaptureSetup();

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnEnemy',
      specialPowerName: 'POWER_TEST',
      commandOption: COMMAND_OPTION_NEED_TARGET_ENEMY_OBJECT,
      issuingEntityIds: [],
      sourceEntityId: 1,
      targetEntityId: 5,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'targetObject',
        sourceEntityId: 1,
        specialPowerName: 'POWER_TEST',
        commandOption: COMMAND_OPTION_NEED_TARGET_ENEMY_OBJECT,
        commandButtonId: 'BtnEnemy',
        targetEntityId: 5,
      },
    ]);

    logic.events.length = 0;
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnAllyBlocked',
      specialPowerName: 'POWER_TEST',
      commandOption: COMMAND_OPTION_NEED_TARGET_ENEMY_OBJECT,
      issuingEntityIds: [],
      sourceEntityId: 1,
      targetEntityId: 6,
      targetX: null,
      targetZ: null,
    });
    logic.update(1 / 30);
    expect(logic.events).toEqual([]);
  });

  it('routes issueSpecialPower commands with position targets to target-position handler', () => {
    const { logic } = makeSpecialPowerCaptureSetup();

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnPos',
      specialPowerName: 'POWER_TEST',
      commandOption: COMMAND_OPTION_NEED_TARGET_POS,
      issuingEntityIds: [],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: 25.5,
      targetZ: 42.75,
    });

    logic.update(1 / 30);
    expect(logic.events).toEqual([
      {
        type: 'targetPosition',
        sourceEntityId: 1,
        specialPowerName: 'POWER_TEST',
        commandOption: COMMAND_OPTION_NEED_TARGET_POS,
        commandButtonId: 'BtnPos',
        targetX: 25.5,
        targetZ: 42.75,
      },
    ]);
  });

  it('ignores unknown or blank issueSpecialPower definitions without invoking handlers', () => {
    const { logic } = makeSpecialPowerCaptureSetup();

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnEmpty',
      specialPowerName: '   ',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });

    logic.update(1 / 30);
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'BtnMissing',
      specialPowerName: 'MISSING_POWER',
      commandOption: 0,
      issuingEntityIds: [],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });

    logic.update(1 / 30);
    expect(logic.events).toEqual([]);
  });

  it('supports applyPlayerUpgrade when local side is inferred from spawned entity side', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('CommandCenter', 'America', ['STRUCTURE'], [
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 2,
          }),
        ]),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Test_Player', {
          Type: 'PLAYER',
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('CommandCenter', 10, 10)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'applyPlayerUpgrade', upgradeName: 'Upgrade_Test_Player' });
    logic.update(0);
    expect(logic.getSideUpgradeState('America').completed).toEqual(['UPGRADE_TEST_PLAYER']);
  });

  it('supports getLocalPlayerUpgradeNames when local side is inferred from spawned entity side', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('CommandCenter', 'America', ['STRUCTURE'], [
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 2,
          }),
        ]),
      ],
      upgrades: [makeUpgradeDef('Upgrade_Test_Player', { Type: 'PLAYER' })],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('CommandCenter', 10, 10)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'applyPlayerUpgrade', upgradeName: 'Upgrade_Test_Player' });
    logic.update(0);
    expect(logic.getLocalPlayerUpgradeNames()).toEqual(['UPGRADE_TEST_PLAYER']);
  });

  it('keeps getLocalPlayerUpgradeNames empty when local side is ambiguous across spawned entities', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('CommandCenterAmerica', 'America', ['STRUCTURE'], [
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 2,
          }),
        ]),
        makeObjectDef('CommandCenterChina', 'China', ['STRUCTURE'], [
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 2,
          }),
        ]),
      ],
      upgrades: [makeUpgradeDef('Upgrade_Test_Player', { Type: 'PLAYER' })],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CommandCenterAmerica', 10, 10),
        makeMapObject('CommandCenterChina', 20, 20),
      ]),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );

    logic.submitCommand({ type: 'applyPlayerUpgrade', upgradeName: 'Upgrade_Test_Player' });
    logic.update(0);
    expect(logic.getLocalPlayerUpgradeNames()).toEqual([]);
  });

  it('applies deterministic direct-fire combat with source attack range and shot delay semantics', () => {
    const timeline = runCombatTimeline();
    expect(timeline).toEqual([70, 70, 70, 40, 40, 40, 10, 10, 10, -1, -1, -1]);
  });

  it('produces the same combat timeline across repeated runs', () => {
    const first = runCombatTimeline();
    const second = runCombatTimeline();
    expect(first).toEqual(second);
  });

  it('applies ArmorSet damage coefficients by DamageType and switches to PLAYER_UPGRADE armor on ArmorUpgrade', () => {
    const timeline = runArmorUpgradeCombatTimeline();
    expect(timeline).toEqual([160, 160, 160, 150, 150, 150, 140, 140, 140, 130]);
  });

  it('keeps armor-upgrade combat timing deterministic across repeated runs', () => {
    const first = runArmorUpgradeCombatTimeline();
    const second = runArmorUpgradeCombatTimeline();
    expect(first).toEqual(second);
  });

  it('applies PreAttackDelay with PreAttackType=PER_SHOT before every shot', () => {
    const timeline = runPrefireTypeCombatTimeline('PER_SHOT');
    expect(timeline).toEqual([200, 200, 200, 170, 170, 170, 170, 170, 170, 140, 140, 140]);
  });

  it('applies PreAttackDelay with PreAttackType=PER_ATTACK only on first shot per target', () => {
    const timeline = runPrefireTypeCombatTimeline('PER_ATTACK');
    expect(timeline).toEqual([200, 200, 200, 170, 170, 170, 140, 140, 140, 110, 110, 110]);
  });

  it('applies PreAttackType=PER_CLIP only on first shot after each clip reload', () => {
    const timeline = runPerClipPrefireTimeline();
    expect(timeline.targetHealthTimeline).toEqual([
      220,
      220,
      220,
      200,
      200,
      200,
      180,
      180,
      180,
      180,
      180,
      180,
      180,
      180,
      180,
      160,
      160,
      160,
    ]);
  });

  it('keeps PreAttackDelay timing deterministic across repeated runs', () => {
    const first = {
      perShot: runPrefireTypeCombatTimeline('PER_SHOT'),
      perAttack: runPrefireTypeCombatTimeline('PER_ATTACK'),
      perClip: runPerClipPrefireTimeline(),
    };
    const second = {
      perShot: runPrefireTypeCombatTimeline('PER_SHOT'),
      perAttack: runPrefireTypeCombatTimeline('PER_ATTACK'),
      perClip: runPerClipPrefireTimeline(),
    };
    expect(first).toEqual(second);
  });

  it('forces idle clip reload by AutoReloadWhenIdle before re-engagement', () => {
    const withAutoReload = runAutoReloadWhenIdleTimeline(200);
    expect(withAutoReload.targetHealthTimeline).toEqual([
      300,
      300,
      300,
      280,
      280,
      280,
      280,
      280,
      280,
      280,
      280,
      280,
      280,
      260,
      260,
      260,
    ]);

    const withoutAutoReload = runAutoReloadWhenIdleTimeline(0);
    expect(withoutAutoReload.targetHealthTimeline).toEqual([
      300,
      300,
      300,
      280,
      280,
      280,
      280,
      280,
      280,
      280,
      260,
      260,
      260,
      240,
      240,
      240,
    ]);
  });

  it('keeps AutoReloadWhenIdle timing deterministic across repeated runs', () => {
    const first = {
      enabled: runAutoReloadWhenIdleTimeline(200),
      disabled: runAutoReloadWhenIdleTimeline(0),
    };
    const second = {
      enabled: runAutoReloadWhenIdleTimeline(200),
      disabled: runAutoReloadWhenIdleTimeline(0),
    };
    expect(first).toEqual(second);
  });

  it('executes upgrade modules with TriggeredBy/RequiresAllTriggers and ActiveBody max-health change rules', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('UpgradeableUnit', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 50 }),
          makeBlock('LocomotorSet', 'SET_NORMAL LocomotorBase', {}),
          makeBlock('LocomotorSet', 'SET_NORMAL_UPGRADED LocomotorFast', {}),
          makeBlock('Behavior', 'LocomotorSetUpgrade ModuleTag_Move', {
            TriggeredBy: 'Upgrade_Move',
          }),
          makeBlock('Behavior', 'MaxHealthUpgrade ModuleTag_HP', {
            TriggeredBy: ['Upgrade_HP_A', 'Upgrade_HP_B'],
            RequiresAllTriggers: true,
            AddMaxHealth: 50,
            ChangeType: 'PRESERVE_RATIO',
          }),
        ]),
      ],
      locomotors: [
        makeLocomotorDef('LocomotorBase', 10),
        makeLocomotorDef('LocomotorFast', 20),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    const map = makeMap([makeMapObject('UpgradeableUnit', 10, 10)]);
    logic.loadMapObjects(map, makeRegistry(bundle), makeHeightmap());

    expect(logic.getEntityState(1)).toMatchObject({
      health: 50,
      maxHealth: 100,
      activeLocomotorSet: 'SET_NORMAL',
      speed: 10,
      alive: true,
    });

    logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Move' });
    logic.update(1 / 30);
    expect(logic.getEntityState(1)).toMatchObject({
      activeLocomotorSet: 'SET_NORMAL_UPGRADED',
      speed: 20,
    });

    logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_HP_A' });
    logic.update(1 / 30);
    expect(logic.getEntityState(1)).toMatchObject({
      health: 50,
      maxHealth: 100,
    });

    logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_HP_B' });
    logic.update(1 / 30);
    expect(logic.getEntityState(1)).toMatchObject({
      health: 75,
      maxHealth: 150,
    });

    logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_HP_B' });
    logic.update(1 / 30);
    expect(logic.getEntityState(1)).toMatchObject({
      health: 75,
      maxHealth: 150,
    });
  });

  it('processes FIFO unit production queue timing from BuildTime in logic frames', () => {
    const { alphaCounts, bravoCounts, queuePercents } = runFifoProductionTimeline();
    expect(alphaCounts).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1]);
    expect(bravoCounts).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(queuePercents[2]).toBeCloseTo(50, 6);
  });

  it('applies QuantityModifier production count and QueueProductionExitUpdate delay deterministically', () => {
    const first = runQuantityModifierDelayTimeline();
    const second = runQuantityModifierDelayTimeline();
    expect(first).toEqual([0, 0, 1, 1, 2, 2]);
    expect(second).toEqual(first);
  });

  it('interprets QueueProductionExitUpdate ExitDelay as duration milliseconds', () => {
    const timeline = runQuantityModifierDelayTimeline(2);
    expect(timeline).toEqual([0, 0, 1, 2, 2, 2]);
  });

  it('supports SupplyCenterProductionExitUpdate as a valid production exit module', () => {
    const timeline = runSupplyCenterExitProductionTimeline();
    expect(timeline.producedCounts).toEqual([0, 0, 1, 1, 1, 1]);
    expect(timeline.queueCounts).toEqual([1, 1, 0, 0, 0, 0]);
    expect(timeline.credits).toEqual([400, 400, 400, 400, 400, 400]);
  });

  it('supports SpawnPointProductionExitUpdate as a valid production exit module', () => {
    const timeline = runSpawnPointExitProductionTimeline();
    expect(timeline.producedCounts).toEqual([0, 0, 1, 1, 1, 1]);
    expect(timeline.queueCounts).toEqual([1, 1, 0, 0, 0, 0]);
    expect(timeline.credits).toEqual([400, 400, 400, 400, 400, 400]);
  });

  it('keeps SpawnPointProductionExitUpdate production timing deterministic across repeated runs', () => {
    const first = runSpawnPointExitProductionTimeline();
    const second = runSpawnPointExitProductionTimeline();
    expect(first).toEqual(second);
  });

  it('enforces ProductionUpdate MaxQueueEntries when queueing units', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('Factory', 'America', ['STRUCTURE'], [
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 1,
          }),
          makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
            UnitCreatePoint: [8, 0, 0],
          }),
        ]),
        makeObjectDef('InfantryAlpha', 'America', ['INFANTRY'], [], { BuildTime: 0.1, BuildCost: 100 }),
        makeObjectDef('InfantryBravo', 'America', ['INFANTRY'], [], { BuildTime: 0.1, BuildCost: 100 }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    const map = makeMap([makeMapObject('Factory', 10, 10)]);
    logic.loadMapObjects(map, makeRegistry(bundle), makeHeightmap(32, 32));

    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
    logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'InfantryAlpha' });
    logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'InfantryBravo' });
    logic.update(1 / 30);

    expect(logic.getProductionState(1)).toMatchObject({
      queueEntryCount: 1,
      queue: [{ templateName: 'InfantryAlpha' }],
    });
  });

  it('gates production by available credits and refunds canceled queue entries', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 2,
          }),
          makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
            UnitCreatePoint: [10, 0, 0],
          }),
        ]),
        makeObjectDef('VehicleA', 'America', ['VEHICLE'], [], { BuildTime: 0.2, BuildCost: 300 }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('WarFactory', 15, 15)]), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 250 });
    logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'VehicleA' });
    logic.update(1 / 30);
    expect(logic.getSideCredits('America')).toBe(250);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(0);

    logic.submitCommand({ type: 'addSideCredits', side: 'America', amount: 250 });
    logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'VehicleA' });
    logic.update(1 / 30);
    expect(logic.getSideCredits('America')).toBe(200);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(1);

    logic.submitCommand({ type: 'cancelUnitProduction', entityId: 1, productionId: 1 });
    logic.update(1 / 30);
    expect(logic.getSideCredits('America')).toBe(500);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(0);
  });

  it('produces deterministic economy+production timelines across repeated runs', () => {
    const first = runEconomyProductionTimeline();
    const second = runEconomyProductionTimeline();
    expect(first).toEqual(second);
    expect(first.credits).toEqual([200, 200, 200, 200, 200]);
    expect(first.queueCounts).toEqual([1, 1, 0, 0, 0]);
    expect(first.producedCounts).toEqual([0, 0, 1, 1, 1]);
  });

  it('keeps SupplyCenterProductionExitUpdate production timing deterministic across repeated runs', () => {
    const first = runSupplyCenterExitProductionTimeline();
    const second = runSupplyCenterExitProductionTimeline();
    expect(first).toEqual(second);
  });

  it('keeps QueueProductionExitUpdate duration-based ExitDelay timing deterministic across repeated runs', () => {
    const first = runQuantityModifierDelayTimeline(2);
    const second = runQuantityModifierDelayTimeline(2);
    expect(first).toEqual(second);
  });

  it('processes player upgrade production timing and applies completed side upgrade effects', () => {
    const timeline = runUpgradeProductionTimeline();
    expect(timeline.credits).toEqual([100, 100, 100, 100, 100]);
    expect(timeline.inProductionCounts).toEqual([1, 1, 0, 0, 0]);
    expect(timeline.completedCounts).toEqual([0, 0, 1, 1, 1]);
    expect(timeline.speeds).toEqual([10, 10, 20, 20, 20]);
  });

  it('reverts LocomotorSetUpgrade when its source object upgrade is removed', () => {
    const timeline = runLocomotorUpgradeRemovalTimeline();
    expect(timeline.speeds).toEqual([10, 20, 20, 20, 10, 10, 10, 10]);
  });

  it('keeps LocomotorSetUpgrade removal timing deterministic across repeated runs', () => {
    const first = runLocomotorUpgradeRemovalTimeline();
    const second = runLocomotorUpgradeRemovalTimeline();
    expect(first).toEqual(second);
  });

  it('applies COSTMODIFIERUPGRADE to discount matching kind-of production costs on completion', () => {
    const timeline = runCostModifierUpgradeTimeline();
    expect(timeline.credits).toEqual([1400, 1400, 1400, 1400, 600, 600, 600, 600]);
  });

  it('reverts COSTMODIFIERUPGRADE production-cost discount when its source OBJECT upgrade is removed', () => {
    const timeline = runCostModifierUpgradeRemovalTimeline();
    // Verify queue ordering: the cancel upgrade must finish before discount expires, so the queued
    // second VEHICLE unit is still discounted when queued.
    // Source parity note:
    // In ProductionUpdate::update(), only the front queue entry progresses, so a later QUEUE
    // entry cannot affect cost at its queue time until it reaches queue front.
    expect(timeline.credits).toEqual([2400, 2400, 2400, 2100, 2000, 2000, 2000, 1700, 1700, 1700, 1700]);
  });

  it('keeps COSTMODIFIERUPGRADE production-cost interaction deterministic across repeated runs', () => {
    const first = runCostModifierUpgradeTimeline();
    const second = runCostModifierUpgradeTimeline();
    expect(first).toEqual(second);
  });

  it('keeps COSTMODIFIERUPGRADE removal-and-revert path deterministic across repeated runs', () => {
    const first = runCostModifierUpgradeRemovalTimeline();
    const second = runCostModifierUpgradeRemovalTimeline();
    expect(first).toEqual(second);
  });

  it('does not apply COSTMODIFIERUPGRADE to PLAYER upgrade build cost (upgrade cost uses UpgradeTemplate path)', () => {
    const timeline = runCostModifierUpgradeCostUnaffectedTimeline();
    expect(timeline.credits).toEqual([800, 800, 800, 700, 700, 700, 700]);
  });

  it('transfers active COSTMODIFIERUPGRADE side effects on object capture and preserves discounted unit pricing for new owner only', () => {
    const timeline = runCostModifierUpgradeCaptureTransferTimeline();
    expect(timeline.creditsAmerica).toEqual([3900, 3900, 3900, 3600, 3600, 3600, 3200]);
    expect(timeline.creditsChina).toEqual([1200, 1200, 1200, 1200, 1200, 900, 900]);
  });

  it('keeps COSTMODIFIERUPGRADE capture-transfer interaction deterministic across repeated runs', () => {
    const first = runCostModifierUpgradeCaptureTransferTimeline();
    const second = runCostModifierUpgradeCaptureTransferTimeline();
    expect(first).toEqual(second);
  });

  it('applies POWERPLANTUPGRADE side-effects and reverts them when source upgrade is removed', () => {
    const timeline = runPowerPlantUpgradeRemovalTimeline();
    expect(timeline.powerBonuses).toEqual([0, 150, 150, 150, 0, 0]);
  });

  it('keeps POWERPLANTUPGRADE removal/revert behavior deterministic across repeated runs', () => {
    const first = runPowerPlantUpgradeRemovalTimeline();
    const second = runPowerPlantUpgradeRemovalTimeline();
    expect(first).toEqual(second);
  });

  it('transfers POWERPLANTUPGRADE side-effect state on object capture and applies it to the new owner', () => {
    const timeline = runPowerPlantUpgradeCaptureTransferTimeline();
    expect(timeline.powerBonusesAmerica).toEqual([0, 150, 150, 150, 0, 0]);
    expect(timeline.powerBonusesChina).toEqual([0, 0, 0, 0, 150, 150]);
  });

  it('keeps POWERPLANTUPGRADE capture-transfer interaction deterministic across repeated runs', () => {
    const first = runPowerPlantUpgradeCaptureTransferTimeline();
    const second = runPowerPlantUpgradeCaptureTransferTimeline();
    expect(first).toEqual(second);
  });

  it('applies RADARUPGRADE side-effects including disable-proof counts and removes source non-proof effect', () => {
    const timeline = runRadarUpgradeRemovalTimeline();
    expect(timeline.radarCounts).toEqual([0, 1, 2, 2, 1, 1]);
    expect(timeline.disableProofRadarCounts).toEqual([0, 0, 1, 1, 1, 1]);
  });

  it('keeps RADARUPGRADE removal and transfer behavior deterministic across repeated runs', () => {
    const first = runRadarUpgradeRemovalTimeline();
    const second = runRadarUpgradeRemovalTimeline();
    expect(first).toEqual(second);
  });

  it('transfers RADARUPGRADE side-effect state on object capture including disable-proof counts', () => {
    const timeline = runRadarUpgradeCaptureTransferTimeline();
    expect(timeline.americaRadarCounts).toEqual([0, 1, 2, 2, 0, 0]);
    expect(timeline.chinaRadarCounts).toEqual([0, 0, 0, 0, 2, 2]);
    expect(timeline.americaDisableProofRadarCounts).toEqual([0, 0, 1, 1, 0, 0]);
    expect(timeline.chinaDisableProofRadarCounts).toEqual([0, 0, 0, 0, 1, 1]);
  });

  it('keeps RADARUPGRADE capture-transfer interaction deterministic across repeated runs', () => {
    const first = runRadarUpgradeCaptureTransferTimeline();
    const second = runRadarUpgradeCaptureTransferTimeline();
    expect(first).toEqual(second);
  });

  it('grants science from GRANTSCIENCEUPGRADE on PLAYER upgrade completion and gates production', () => {
    const timeline = runGrantScienceUpgradeTimeline();
    expect(timeline.credits).toEqual([900, 900, 900, 750, 750, 750, 750]);
    expect(timeline.queueCounts).toEqual([1, 1, 0, 1, 1, 0, 0]);
    expect(timeline.scienceCounts).toEqual([0, 0, 1, 1, 1, 1, 1]);
  });

  it('keeps GRANTSCIENCEUPGRADE production/ science unlock timing deterministic across repeated runs', () => {
    const first = runGrantScienceUpgradeTimeline();
    const second = runGrantScienceUpgradeTimeline();
    expect(first).toEqual(second);
  });

  it('gates OBJECT upgrade queueing by source affectedByUpgrade semantics and applies valid upgrades on completion', () => {
    const timeline = runObjectUpgradeAffectabilityTimeline();
    expect(timeline.credits).toEqual([1000, 1000, 900, 900, 900, 800, 800, 800]);
    expect(timeline.queueCounts).toEqual([0, 0, 1, 1, 0, 1, 1, 0]);
    expect(timeline.maxHealth).toEqual([100, 100, 100, 100, 150, 150, 150, 150]);
    expect(timeline.speeds).toEqual([10, 10, 10, 10, 10, 10, 10, 20]);
  });

  it('keeps OBJECT-upgrade affectedByUpgrade gating deterministic across repeated runs', () => {
    const first = runObjectUpgradeAffectabilityTimeline();
    const second = runObjectUpgradeAffectabilityTimeline();
    expect(first).toEqual(second);
  });

  it('applies WeaponSetUpgrade via OBJECT upgrade production and switches combat damage profile on completion', () => {
    const timeline = runWeaponSetUpgradeCombatTimeline();
    expect(timeline.credits).toEqual([200, 200, 200, 200, 200, 200, 200, 200]);
    expect(timeline.queueCounts).toEqual([1, 1, 0, 0, 0, 0, 0, 0]);
    expect(timeline.healthTimeline).toEqual([180, 180, 180, 120, 120, 120, 60, 60]);
  });

  it('keeps WeaponSetUpgrade production-to-combat transition deterministic across repeated runs', () => {
    const first = runWeaponSetUpgradeCombatTimeline();
    const second = runWeaponSetUpgradeCombatTimeline();
    expect(first).toEqual(second);
  });

  it('applies WEAPONBONUSUPGRADE combat flag via OBJECT upgrade production and switches damage profile on completion', () => {
    const timeline = runWeaponBonusUpgradeCombatTimeline();
    expect(timeline.credits).toEqual([200, 200, 200, 200, 200, 200, 200, 200]);
    expect(timeline.queueCounts).toEqual([1, 1, 0, 0, 0, 0, 0, 0]);
    expect(timeline.healthTimeline).toEqual([180, 180, 180, 120, 120, 120, 60, 60]);
  });

  it('keeps WEAPONBONUSUPGRADE production-to-combat transition deterministic across repeated runs', () => {
    const first = runWeaponBonusUpgradeCombatTimeline();
    const second = runWeaponBonusUpgradeCombatTimeline();
    expect(first).toEqual(second);
  });

  it('adds CAN_STEALTH after STEALTHUPGRADE completion', () => {
    const timeline = runStealthUpgradeProductionTimeline();
    expect(timeline.statusTimeline[0]).toEqual([]);
    expect(timeline.statusTimeline[1]).toEqual([]);
    expect(timeline.statusTimeline.some((flags) => flags.includes('CAN_STEALTH'))).toBe(true);
    expect(timeline.statusTimeline[timeline.statusTimeline.length - 1]).toContain('CAN_STEALTH');
  });

  it('keeps STEALTHUPGRADE production timing deterministic across repeated runs', () => {
    const first = runStealthUpgradeProductionTimeline();
    const second = runStealthUpgradeProductionTimeline();
    expect(first).toEqual(second);
  });

  it('refunds canceled player-upgrade production and clears in-production state', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 2,
          }),
        ]),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Move', {
          Type: 'PLAYER',
          BuildTime: 0.2,
          BuildCost: 150,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 6, 6)]), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 200 });
    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
    logic.update(1 / 30);
    expect(logic.getSideCredits('America')).toBe(50);
    expect(logic.getSideUpgradeState('America').inProduction).toEqual(['UPGRADE_MOVE']);

    logic.submitCommand({ type: 'cancelUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
    logic.update(1 / 30);
    expect(logic.getSideCredits('America')).toBe(200);
    expect(logic.getSideUpgradeState('America').inProduction).toEqual([]);
    expect(logic.getSideUpgradeState('America').completed).toEqual([]);
  });

  it('does not queue player upgrade production when side cannot afford the upgrade cost', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 1,
          }),
        ]),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Move', {
          Type: 'PLAYER',
          BuildTime: 0.1,
          BuildCost: 200,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 6, 6)]), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 100 });
    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(100);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(0);
    expect(logic.getSideUpgradeState('America').inProduction).toEqual([]);
  });

  it('queues player upgrade production when side has exact upgrade cost and debits credits immediately', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 1,
          }),
        ]),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Move', {
          Type: 'PLAYER',
          BuildTime: 0.1,
          BuildCost: 200,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 6, 6)]), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 200 });
    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(0);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(1);
    expect(logic.getSideUpgradeState('America').inProduction).toEqual(['UPGRADE_MOVE']);
  });

  it('does not queue player upgrade when command set does not allow command even with sufficient credits', () => {
    const commandButtonName = 'Command_NotAnUpgrade';
    const bundle = makeBundle({
      objects: [
        makeObjectDef(
          'StrategyCenter',
          'America',
          ['STRUCTURE'],
          [
            makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
              MaxQueueEntries: 1,
            }),
          ],
          {
            CommandSet: 'CommandSet_StrategyCenter',
          },
        ),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Move', {
          Type: 'PLAYER',
          BuildTime: 0.1,
          BuildCost: 200,
        }),
      ],
      commandButtons: [
        makeCommandButtonDef(commandButtonName, {
          Command: 'UNIT_BUILD',
          Unit: 'Dummy',
        }),
      ],
      commandSets: [
        makeCommandSetDef('CommandSet_StrategyCenter', {
          1: commandButtonName,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 6, 6)]), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(500);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(0);
    expect(logic.getSideUpgradeState('America').inProduction).toEqual([]);
  });

  it('does not queue player upgrade when command is blocked and credits are insufficient', () => {
    const commandButtonName = 'Command_NotAnUpgrade';
    const bundle = makeBundle({
      objects: [
        makeObjectDef(
          'StrategyCenter',
          'America',
          ['STRUCTURE'],
          [
            makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
              MaxQueueEntries: 1,
            }),
          ],
          {
            CommandSet: 'CommandSet_StrategyCenter',
          },
        ),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Move', {
          Type: 'PLAYER',
          BuildTime: 0.1,
          BuildCost: 200,
        }),
      ],
      commandButtons: [
        makeCommandButtonDef(commandButtonName, {
          Command: 'UNIT_BUILD',
          Unit: 'Dummy',
        }),
      ],
      commandSets: [
        makeCommandSetDef('CommandSet_StrategyCenter', {
          1: commandButtonName,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 6, 6)]), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 100 });
    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(100);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(0);
    expect(logic.getSideUpgradeState('America').inProduction).toEqual([]);
  });

  it('unlocks PLAYER_UPGRADE command-set gate after an object CommandSetUpgrade', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef(
          'StrategyCenter',
          'America',
          ['STRUCTURE'],
          [
            makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
              MaxQueueEntries: 1,
            }),
            makeBlock('Behavior', 'CommandSetUpgrade ModuleTag_CommandSet', {
              TriggeredBy: 'Upgrade_Unlock',
              CommandSet: 'CommandSet_StrategyCenter_After',
            }),
          ],
          {
            CommandSet: 'CommandSet_StrategyCenter_Before',
          },
        ),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Unlock', {
          Type: 'OBJECT',
          BuildTime: 0.1,
          BuildCost: 1,
        }),
        makeUpgradeDef('Upgrade_Move', {
          Type: 'PLAYER',
          BuildTime: 0.1,
          BuildCost: 200,
        }),
      ],
      commandButtons: [
        makeCommandButtonDef('Command_NotUpgrade', {
          Command: 'UNIT_BUILD',
          Unit: 'Dummy',
        }),
        makeCommandButtonDef('Command_Move', {
          Command: 'PLAYER_UPGRADE',
          Upgrade: 'Upgrade_Move',
        }),
      ],
      commandSets: [
        makeCommandSetDef('CommandSet_StrategyCenter_Before', {
          1: 'Command_NotUpgrade',
        }),
        makeCommandSetDef('CommandSet_StrategyCenter_After', {
          1: 'Command_Move',
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 6, 6)]), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 200 });
    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(200);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(0);
    expect(logic.getSideUpgradeState('America').inProduction).toEqual([]);

    logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Unlock' });
    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(0);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(1);
    expect(logic.getSideUpgradeState('America').inProduction).toEqual(['UPGRADE_MOVE']);
  });

  it('keeps CommandSetUpgrade unlock gate transition deterministic across repeated runs', () => {
    const runUnlockGateScenario = () => {
      const bundle = makeBundle({
        objects: [
          makeObjectDef(
            'StrategyCenter',
            'America',
            ['STRUCTURE'],
            [
              makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
                MaxQueueEntries: 1,
              }),
              makeBlock('Behavior', 'CommandSetUpgrade ModuleTag_CommandSet', {
                TriggeredBy: 'Upgrade_Unlock',
                CommandSet: 'CommandSet_StrategyCenter_After',
              }),
            ],
            {
              CommandSet: 'CommandSet_StrategyCenter_Before',
            },
          ),
        ],
        upgrades: [
          makeUpgradeDef('Upgrade_Unlock', {
            Type: 'OBJECT',
            BuildTime: 0.1,
            BuildCost: 1,
          }),
          makeUpgradeDef('Upgrade_Move', {
            Type: 'PLAYER',
            BuildTime: 0.1,
            BuildCost: 200,
          }),
        ],
        commandButtons: [
          makeCommandButtonDef('Command_NotUpgrade', {
            Command: 'UNIT_BUILD',
            Unit: 'Dummy',
          }),
          makeCommandButtonDef('Command_Move', {
            Command: 'PLAYER_UPGRADE',
            Upgrade: 'Upgrade_Move',
          }),
        ],
        commandSets: [
          makeCommandSetDef('CommandSet_StrategyCenter_Before', {
            1: 'Command_NotUpgrade',
          }),
          makeCommandSetDef('CommandSet_StrategyCenter_After', {
            1: 'Command_Move',
          }),
        ],
      });

      const scene = new THREE.Scene();
      const logic = new GameLogicSubsystem(scene);
      logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 6, 6)]), makeRegistry(bundle), makeHeightmap(64, 64));

      logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 200 });
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
      logic.update(1 / 30);

      const before = {
        credits: logic.getSideCredits('America'),
        queueCount: logic.getProductionState(1)?.queueEntryCount ?? 0,
        inProduction: [...logic.getSideUpgradeState('America').inProduction],
      };

      logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Unlock' });
      logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
      logic.update(1 / 30);

      const after = {
        credits: logic.getSideCredits('America'),
        queueCount: logic.getProductionState(1)?.queueEntryCount ?? 0,
        inProduction: [...logic.getSideUpgradeState('America').inProduction],
      };

      return { before, after };
    };

    const first = runUnlockGateScenario();
    const second = runUnlockGateScenario();
    expect(first).toEqual(second);
  });

  it('unlocks PLAYER_UPGRADE command-set gate only after OBJECT upgrade production completes', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef(
          'StrategyCenter',
          'America',
          ['STRUCTURE'],
          [
            makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
              MaxQueueEntries: 2,
            }),
            makeBlock('Behavior', 'CommandSetUpgrade ModuleTag_CommandSet', {
              TriggeredBy: 'Upgrade_Unlock',
              CommandSet: 'CommandSet_StrategyCenter_After',
            }),
          ],
          {
            CommandSet: 'CommandSet_StrategyCenter_Before',
          },
        ),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Unlock', {
          Type: 'OBJECT',
          BuildTime: 0.1,
          BuildCost: 1,
        }),
        makeUpgradeDef('Upgrade_Move', {
          Type: 'PLAYER',
          BuildTime: 0.1,
          BuildCost: 200,
        }),
      ],
      commandButtons: [
        makeCommandButtonDef('Command_NotUpgrade', {
          Command: 'UNIT_BUILD',
          Unit: 'Dummy',
        }),
        makeCommandButtonDef('Command_Move', {
          Command: 'PLAYER_UPGRADE',
          Upgrade: 'Upgrade_Move',
        }),
      ],
      commandSets: [
        makeCommandSetDef('CommandSet_StrategyCenter_Before', {
          1: 'Command_NotUpgrade',
        }),
        makeCommandSetDef('CommandSet_StrategyCenter_After', {
          1: 'Command_Move',
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 6, 6)]), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 201 });
    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Unlock' });
    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });

    // Update through completion of Unlock; first move queue attempt should be blocked by base command set.
    for (let frame = 0; frame < 3; frame += 1) {
      logic.update(1 / 30);
    }

    expect(logic.getSideCredits('America')).toBe(200);
    expect(logic.getSideUpgradeState('America').inProduction).toEqual([]);
    expect(logic.getSideUpgradeState('America').completed).toEqual([]);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(0);

    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(0);
    expect(logic.getSideUpgradeState('America').inProduction).toEqual(['UPGRADE_MOVE']);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(1);
  });

  it('prevents queueing the same player upgrade on another producer while in production', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 2,
          }),
        ]),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Move', {
          Type: 'PLAYER',
          BuildTime: 0.5,
          BuildCost: 100,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('StrategyCenter', 6, 6), makeMapObject('StrategyCenter', 12, 6)]),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );

    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Move' });
    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 2, upgradeName: 'Upgrade_Move' });
    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(400);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(1);
    expect(logic.getProductionState(2)?.queueEntryCount).toBe(0);
    expect(logic.getSideUpgradeState('America').inProduction).toEqual(['UPGRADE_MOVE']);
  });

  it('requires a command-set button with matching Upgrade to queue upgrade production', () => {
    const allowed = runUpgradeCommandSetGateTimeline(true);
    expect(allowed.credits).toEqual([150, 150, 150, 150]);
    expect(allowed.queueCounts).toEqual([1, 1, 0, 0]);
    expect(allowed.inProductionCounts).toEqual([1, 1, 0, 0]);
    expect(allowed.completedCounts).toEqual([0, 0, 1, 1]);

    const blocked = runUpgradeCommandSetGateTimeline(false);
    expect(blocked.credits).toEqual([300, 300, 300, 300]);
    expect(blocked.queueCounts).toEqual([0, 0, 0, 0]);
    expect(blocked.inProductionCounts).toEqual([0, 0, 0, 0]);
    expect(blocked.completedCounts).toEqual([0, 0, 0, 0]);
  });

  it('requires an explicit command set when queueing player upgrades', () => {
    const blocked = runUpgradeNoCommandSetTimeline();
    expect(blocked.credits).toEqual([300, 300, 300, 300]);
    expect(blocked.queueCounts).toEqual([0, 0, 0, 0]);
    expect(blocked.inProductionCounts).toEqual([0, 0, 0, 0]);
    expect(blocked.completedCounts).toEqual([0, 0, 0, 0]);
  });

  it('allows OBJECT command-set transition upgrade to queue without explicit command button', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef(
          'StrategyCenter',
          'America',
          ['STRUCTURE'],
          [
            makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
              MaxQueueEntries: 1,
            }),
            makeBlock('Behavior', 'CommandSetUpgrade ModuleTag_CommandSet', {
              TriggeredBy: 'Upgrade_Unlock',
              CommandSet: 'CommandSet_StrategyCenter_After',
            }),
          ],
          {
            CommandSet: 'CommandSet_StrategyCenter_Before',
          },
        ),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Unlock', {
          Type: 'OBJECT',
          BuildTime: 0.1,
          BuildCost: 50,
        }),
      ],
      commandButtons: [
        makeCommandButtonDef('Command_Dummy', {
          Command: 'UNIT_BUILD',
          Unit: 'Dummy',
        }),
      ],
      commandSets: [
        makeCommandSetDef('CommandSet_StrategyCenter_Before', {
          1: 'Command_Dummy',
        }),
        makeCommandSetDef('CommandSet_StrategyCenter_After', {
          1: 'Command_Dummy',
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 6, 6)]), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 100 });
    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Unlock' });
    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(50);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(1);
  });

  it('blocks OBJECT upgrade queueing without command button or CommandSetUpgrade trigger', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef(
          'StrategyCenter',
          'America',
          ['STRUCTURE'],
          [
            makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
              MaxQueueEntries: 1,
            }),
          ],
          {
            CommandSet: 'CommandSet_StrategyCenter_Before',
          },
        ),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Unlock', {
          Type: 'OBJECT',
          BuildTime: 0.1,
          BuildCost: 50,
        }),
      ],
      commandButtons: [
        makeCommandButtonDef('Command_Dummy', {
          Command: 'UNIT_BUILD',
          Unit: 'Dummy',
        }),
      ],
      commandSets: [
        makeCommandSetDef('CommandSet_StrategyCenter_Before', {
          1: 'Command_Dummy',
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('StrategyCenter', 6, 6)]), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 100 });
    logic.submitCommand({ type: 'queueUpgradeProduction', entityId: 1, upgradeName: 'Upgrade_Unlock' });
    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(100);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(0);
  });

  it('keeps upgrade command-set gating deterministic across repeated runs', () => {
    const first = runUpgradeCommandSetGateTimeline(true);
    const second = runUpgradeCommandSetGateTimeline(true);
    expect(first).toEqual(second);
  });

  it('applies CommandSetUpgrade command-set overrides to gate follow-up object upgrades', () => {
    const noAlt = runCommandSetUpgradeTimeline(false);
    expect(noAlt.credits).toEqual([900, 900, 900, 780, 780, 780, 780, 780]);
    expect(noAlt.queueCounts).toEqual([1, 1, 0, 1, 1, 0, 0, 0]);
    expect(noAlt.maxHealth).toEqual([100, 100, 100, 100, 100, 150, 150, 150]);

    const withAlt = runCommandSetUpgradeTimeline(true);
    expect(withAlt.credits).toEqual([900, 900, 900, 760, 760, 760, 760, 760]);
    expect(withAlt.queueCounts).toEqual([1, 1, 0, 1, 1, 0, 0, 0]);
    expect(withAlt.maxHealth).toEqual([100, 100, 100, 100, 100, 180, 180, 180]);
  });

  it('keeps CommandSetUpgrade queue gating deterministic across repeated runs', () => {
    const first = {
      noAlt: runCommandSetUpgradeTimeline(false),
      withAlt: runCommandSetUpgradeTimeline(true),
    };
    const second = {
      noAlt: runCommandSetUpgradeTimeline(false),
      withAlt: runCommandSetUpgradeTimeline(true),
    };
    expect(first).toEqual(second);
  });

  it('recomputes CommandSetUpgrade override when TriggerAlt upgrade is removed', () => {
    const timeline = runCommandSetUpgradeRemovalTimeline();
    expect(timeline.credits).toEqual([860, 740, 740, 740, 740, 740, 740, 740]);
    expect(timeline.queueCounts).toEqual([1, 2, 2, 2, 2, 2, 2, 2]);
    expect(timeline.queueNames).toEqual([
      ['UPGRADE_C'],
      ['UPGRADE_C', 'UPGRADE_B'],
      ['UPGRADE_C', 'UPGRADE_B'],
      ['UPGRADE_C', 'UPGRADE_B'],
      ['UPGRADE_C', 'UPGRADE_B'],
      ['UPGRADE_C', 'UPGRADE_B'],
      ['UPGRADE_C', 'UPGRADE_B'],
      ['UPGRADE_C', 'UPGRADE_B'],
    ]);

    const repeated = runCommandSetUpgradeRemovalTimeline();
    expect(timeline).toEqual(repeated);
  });

  it('enforces ParkingPlaceBehavior queue gating and preserves PRODUCED_AT_HELIPAD bypass behavior', () => {
    const timeline = runParkingPlaceQueueTimeline();
    expect(timeline.credits).toEqual([900, 900, 900, 900, 800, 800, 800, 800]);
    expect(timeline.queueCounts).toEqual([1, 1, 0, 0, 1, 1, 0, 0]);
    expect(timeline.jetCounts).toEqual([0, 0, 1, 1, 1, 1, 1, 1]);
    expect(timeline.heliCounts).toEqual([0, 0, 0, 0, 0, 0, 1, 1]);
  });

  it('keeps ParkingPlaceBehavior queue gating deterministic across repeated runs', () => {
    const first = runParkingPlaceQueueTimeline();
    const second = runParkingPlaceQueueTimeline();
    expect(first).toEqual(second);
  });

  it('reserves ParkingPlaceBehavior queue space up front and releases it on cancel', () => {
    const timeline = runParkingReservationQueueAndCancelTimeline();
    expect(timeline.credits).toEqual([900, 900, 800, 900, 800]);
    expect(timeline.queueCounts).toEqual([1, 1, 2, 1, 2]);
    expect(timeline.jetQueuedCounts).toEqual([1, 1, 1, 0, 1]);
    expect(timeline.heliQueuedCounts).toEqual([0, 0, 1, 1, 1]);
  });

  it('keeps queue-time parking reservation + cancel-release deterministic across repeated runs', () => {
    const first = runParkingReservationQueueAndCancelTimeline();
    const second = runParkingReservationQueueAndCancelTimeline();
    expect(first).toEqual(second);
  });

  it('stalls QuantityModifier parking production at capacity until a slot is free', () => {
    const timeline = runParkingQuantityStallTimeline();
    expect(timeline.credits).toEqual([900, 900, 900, 900, 900, 900, 900, 900]);
    expect(timeline.queueCounts).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(timeline.jetCounts).toEqual([0, 0, 1, 1, 1, 1, 1, 1]);
    expect(timeline.quantityProduced).toEqual([0, 0, 1, 1, 1, 1, 1, 1]);
    expect(timeline.quantityTotal).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
  });

  it('keeps parking-capacity quantity stall timing deterministic across repeated runs', () => {
    const first = runParkingQuantityStallTimeline();
    const second = runParkingQuantityStallTimeline();
    expect(first).toEqual(second);
  });

  it('applies StatusBitsUpgrade set/clear semantics on object-upgrade completion timing', () => {
    const timeline = runStatusBitsUpgradeTimeline();
    expect(timeline.credits).toEqual([380, 380, 380, 250, 250, 250, 250, 250]);
    expect(timeline.queueCounts).toEqual([1, 1, 0, 1, 1, 0, 0, 0]);
    expect(timeline.statusFlagsTimeline).toEqual([
      [],
      [],
      ['EMPED', 'UNSELECTABLE'],
      ['EMPED', 'UNSELECTABLE'],
      ['EMPED', 'UNSELECTABLE'],
      ['STEALTHED', 'UNSELECTABLE'],
      ['STEALTHED', 'UNSELECTABLE'],
      ['STEALTHED', 'UNSELECTABLE'],
    ]);
  });

  it('keeps StatusBitsUpgrade timing deterministic across repeated runs', () => {
    const first = runStatusBitsUpgradeTimeline();
    const second = runStatusBitsUpgradeTimeline();
    expect(first).toEqual(second);
  });

  it('removes status effects when StatusBitsUpgrade sources are removed via RemovesUpgrades', () => {
    const timeline = runStatusBitsUpgradeRemovalTimeline();
    const disabledFrames = timeline.statusFlagsTimeline
      .map((flags, frame) => (flags.includes('NO_ATTACK') ? frame : null))
      .filter((frame): frame is number => frame !== null);
    expect(disabledFrames.length).toBeGreaterThan(0);

    const firstDisabledFrame = disabledFrames[0];
    const firstEnabledAfterRemoval = timeline.statusFlagsTimeline.findIndex(
      (flags, frame) => frame > firstDisabledFrame && !flags.includes('NO_ATTACK'),
    );
    expect(firstEnabledAfterRemoval).toBeGreaterThan(firstDisabledFrame);
    expect(timeline.statusFlagsTimeline.slice(firstEnabledAfterRemoval).every((flags) => !flags.includes('NO_ATTACK')))
      .toBe(true);
  });

  it('keeps StatusBitsUpgrade removal timing deterministic across repeated runs', () => {
    const first = runStatusBitsUpgradeRemovalTimeline();
    const second = runStatusBitsUpgradeRemovalTimeline();
    expect(first).toEqual(second);
  });

  it('applies StatusBitsUpgrade NO_ATTACK set/clear semantics to combat timing', () => {
    const timeline = runStatusBitsCombatTimeline();
    expect(timeline.credits).toEqual([400, 400, 400, 400, 280, 280, 280, 280, 280, 280]);
    expect(timeline.queueCounts).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0]);
    expect(timeline.statusFlagsTimeline).toEqual([
      ['IS_ATTACKING', 'IS_FIRING_WEAPON'],
      ['IS_AIMING_WEAPON', 'IS_ATTACKING'],
      ['NO_ATTACK'],
      ['NO_ATTACK'],
      ['NO_ATTACK'],
      ['NO_ATTACK'],
      ['IS_ATTACKING', 'IS_FIRING_WEAPON'],
      ['IS_AIMING_WEAPON', 'IS_ATTACKING'],
      ['IS_AIMING_WEAPON', 'IS_ATTACKING'],
      ['IS_ATTACKING', 'IS_FIRING_WEAPON'],
    ]);
    expect(timeline.targetHealthTimeline).toEqual([170, 170, 170, 170, 170, 170, 140, 140, 140, 110]);
  });

  it('keeps StatusBitsUpgrade combat gating deterministic across repeated runs', () => {
    const first = runStatusBitsCombatTimeline();
    const second = runStatusBitsCombatTimeline();
    expect(first).toEqual(second);
  });

  it('blocks and restores attacks while DISABLED_EMP status is active for portable/spawn units', () => {
    const timeline = runStatusBitsDisabledCombatTimeline();
    expect(timeline.queueCounts).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0]);
    const disabledFrames = timeline.statusFlagsTimeline
      .map((flags, frame) => ({ frame, disabled: flags.includes('DISABLED_EMP') }))
      .filter((entry) => entry.disabled)
      .map((entry) => entry.frame);
    expect(disabledFrames.length).toBeGreaterThan(0);

    const firstDisabledFrame = disabledFrames[0];
    const firstEnabledAfterDisable = timeline.statusFlagsTimeline.findIndex(
      (flags, frame) => frame > firstDisabledFrame && !flags.includes('DISABLED_EMP'),
    );
    expect(firstEnabledAfterDisable).toBeGreaterThan(firstDisabledFrame);

    const disabledHealth = timeline.targetHealthTimeline.slice(firstDisabledFrame, firstEnabledAfterDisable);
    expect(new Set(disabledHealth).size).toBe(1);
    expect(disabledHealth[0]).toBeLessThanOrEqual(200);

    expect(
      Math.min(...timeline.targetHealthTimeline.slice(firstEnabledAfterDisable)),
    ).toBeLessThan(disabledHealth[0]);
  });

  it('blocks and restores attacks while DISABLED_HACKED status is active for portable/spawn units', () => {
    const timeline = runStatusBitsDisabledHackCombatTimeline();
    expect(timeline.queueCounts).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0]);
    const disabledFrames = timeline.statusFlagsTimeline
      .map((flags, frame) => ({ frame, disabled: flags.includes('DISABLED_HACKED') }))
      .filter((entry) => entry.disabled)
      .map((entry) => entry.frame);
    expect(disabledFrames.length).toBeGreaterThan(0);

    const firstDisabledFrame = disabledFrames[0];
    const firstEnabledAfterDisable = timeline.statusFlagsTimeline.findIndex(
      (flags, frame) => frame > firstDisabledFrame && !flags.includes('DISABLED_HACKED'),
    );
    expect(firstEnabledAfterDisable).toBeGreaterThan(firstDisabledFrame);

    const disabledHealth = timeline.targetHealthTimeline.slice(firstDisabledFrame, firstEnabledAfterDisable);
    expect(new Set(disabledHealth).size).toBe(1);
    expect(disabledHealth[0]).toBeLessThanOrEqual(200);

    expect(
      Math.min(...timeline.targetHealthTimeline.slice(firstEnabledAfterDisable)),
    ).toBeLessThan(disabledHealth[0]);
  });

  it('keeps DISABLED_EMP combat gating deterministic across repeated runs', () => {
    const first = runStatusBitsDisabledCombatTimeline();
    const second = runStatusBitsDisabledCombatTimeline();
    expect(first).toEqual(second);
  });

  it('keeps DISABLED_HACKED combat gating deterministic across repeated runs', () => {
    const first = runStatusBitsDisabledHackCombatTimeline();
    const second = runStatusBitsDisabledHackCombatTimeline();
    expect(first).toEqual(second);
  });

  it('blocks and restores attacks while DISABLED_SUBDUED status is active for portable/spawn units', () => {
    const timeline = runStatusBitsDisabledSubduedCombatTimeline();
    expect(timeline.queueCounts).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0]);
    const disabledFrames = timeline.statusFlagsTimeline
      .map((flags, frame) => ({ frame, disabled: flags.includes('DISABLED_SUBDUED') }))
      .filter((entry) => entry.disabled)
      .map((entry) => entry.frame);
    expect(disabledFrames.length).toBeGreaterThan(0);

    const firstDisabledFrame = disabledFrames[0];
    const firstEnabledAfterDisable = timeline.statusFlagsTimeline.findIndex(
      (flags, frame) => frame > firstDisabledFrame && !flags.includes('DISABLED_SUBDUED'),
    );
    expect(firstEnabledAfterDisable).toBeGreaterThan(firstDisabledFrame);

    const disabledHealth = timeline.targetHealthTimeline.slice(firstDisabledFrame, firstEnabledAfterDisable);
    expect(new Set(disabledHealth).size).toBe(1);
    expect(disabledHealth[0]).toBeLessThanOrEqual(200);

    expect(
      Math.min(...timeline.targetHealthTimeline.slice(firstEnabledAfterDisable)),
    ).toBeLessThan(disabledHealth[0]);
  });

  it('keeps DISABLED_SUBDUED combat gating deterministic across repeated runs', () => {
    const first = runStatusBitsDisabledSubduedCombatTimeline();
    const second = runStatusBitsDisabledSubduedCombatTimeline();
    expect(first).toEqual(second);
  });

  it('tracks IS_AIMING_WEAPON and IS_FIRING_WEAPON transitions across pre-attack, fire, and stop timing', () => {
    const timeline = runAimAndFiringStatusTimeline();
    expect(timeline.statusFlagsTimeline).toEqual([
      ['IS_AIMING_WEAPON', 'IS_ATTACKING'],
      ['IS_AIMING_WEAPON', 'IS_ATTACKING'],
      ['IS_AIMING_WEAPON', 'IS_ATTACKING'],
      ['IS_ATTACKING', 'IS_FIRING_WEAPON'],
      ['IS_AIMING_WEAPON', 'IS_ATTACKING'],
      [],
      [],
      [],
    ]);
    expect(timeline.targetHealthTimeline).toEqual([200, 200, 200, 170, 170, 170, 170, 170]);
  });

  it('keeps aiming/firing status-bit timing deterministic across repeated runs', () => {
    const first = runAimAndFiringStatusTimeline();
    const second = runAimAndFiringStatusTimeline();
    expect(first).toEqual(second);
  });

  it('blocks attacks against STEALTHED + undetected victims unless attacker currently has IGNORING_STEALTH', () => {
    const blocked = runStealthAttackGateTimeline({
      continueAttackRange: 0,
      detected: false,
      preAttackDelayMs: 0,
    });
    expect(blocked.attackerTargetTimeline).toEqual([null, null, null, null, null, null, null, null]);
    expect(blocked.targetHealthTimeline).toEqual([200, 200, 200, 200, 200, 200, 200, 200]);

    const detected = runStealthAttackGateTimeline({
      continueAttackRange: 0,
      detected: true,
      preAttackDelayMs: 0,
    });
    expect(detected.attackerTargetTimeline).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
    expect(detected.targetHealthTimeline).toEqual([170, 170, 170, 140, 140, 140, 110, 110]);
  });

  it('sets IGNORING_STEALTH during pre-fire aim for ContinueAttackRange and clears it after firing', () => {
    const timeline = runStealthAttackGateTimeline({
      continueAttackRange: 20,
      detected: false,
      preAttackDelayMs: 100,
    });
    expect(timeline.attackerStatusFlagsTimeline).toEqual([
      ['IGNORING_STEALTH', 'IS_AIMING_WEAPON', 'IS_ATTACKING'],
      ['IGNORING_STEALTH', 'IS_AIMING_WEAPON', 'IS_ATTACKING'],
      ['IGNORING_STEALTH', 'IS_AIMING_WEAPON', 'IS_ATTACKING'],
      ['IS_ATTACKING', 'IS_FIRING_WEAPON'],
      [],
      [],
      [],
      [],
    ]);
    expect(timeline.attackerTargetTimeline).toEqual([2, 2, 2, 2, null, null, null, null]);
    expect(timeline.targetHealthTimeline).toEqual([200, 200, 200, 170, 170, 170, 170, 170]);
  });

  it('keeps stealth-target gating and IGNORING_STEALTH timing deterministic across repeated runs', () => {
    const first = {
      blocked: runStealthAttackGateTimeline({
        continueAttackRange: 0,
        detected: false,
        preAttackDelayMs: 0,
      }),
      ignoringStealth: runStealthAttackGateTimeline({
        continueAttackRange: 20,
        detected: false,
        preAttackDelayMs: 100,
      }),
    };
    const second = {
      blocked: runStealthAttackGateTimeline({
        continueAttackRange: 0,
        detected: false,
        preAttackDelayMs: 0,
      }),
      ignoringStealth: runStealthAttackGateTimeline({
        continueAttackRange: 20,
        detected: false,
        preAttackDelayMs: 100,
      }),
    };
    expect(first).toEqual(second);
  });

  it('applies UpgradeMux RemovesUpgrades before module implementation and allows re-queue of removed object upgrades', () => {
    const timeline = runUpgradeRemovalMuxTimeline();
    expect(timeline.credits).toEqual([400, 400, 400, 300, 300, 300, 200, 200, 200, 200]);
    expect(timeline.queueCounts).toEqual([1, 1, 0, 1, 1, 0, 1, 1, 0, 0]);
    expect(timeline.maxHealthTimeline).toEqual([100, 100, 120, 120, 120, 150, 150, 150, 170, 170]);
  });

  it('keeps UpgradeMux RemovesUpgrades timing deterministic across repeated runs', () => {
    const first = runUpgradeRemovalMuxTimeline();
    const second = runUpgradeRemovalMuxTimeline();
    expect(first).toEqual(second);
  });

  it('enforces Weapon MinimumAttackRange by preventing stationary close-range fire', () => {
    const timeline = runMinimumAttackRangeStationaryTimeline();
    expect(timeline.targetHealthTimeline).toEqual([200, 200, 200, 200, 200, 200, 200, 200]);
  });

  it('resumes firing after moving a too-close attacker outside MinimumAttackRange and re-issuing attack', () => {
    const timeline = runMinimumAttackRangeRetreatTimeline();
    expect(timeline.targetHealthTimeline).toEqual([
      200,
      200,
      200,
      200,
      200,
      200,
      200,
      200,
      200,
      200,
      170,
      170,
      170,
      140,
      140,
      140,
    ]);

    const firstDamageFrame = timeline.targetHealthTimeline.findIndex((health) => health < 200);
    expect(firstDamageFrame).toBe(10);
    const rangeAtFirstDamage = timeline.attackerRangeTimeline[firstDamageFrame];
    expect(rangeAtFirstDamage).toBeGreaterThanOrEqual(40);
  });

  it('keeps MinimumAttackRange retreat timing deterministic across repeated runs', () => {
    const first = runMinimumAttackRangeRetreatTimeline();
    const second = runMinimumAttackRangeRetreatTimeline();
    expect(first).toEqual(second);
  });

  it('reacquires a same-player follow-up victim around original victim position when ContinueAttackRange is enabled', () => {
    const timeline = runContinueAttackRangeTimeline(20);
    expect(timeline.attackerTargetTimeline).toEqual([3, 3, 3, null, null, null, null, null]);
    expect(timeline.chinaFollowupHealthTimeline).toEqual([100, 100, 100, -1, -1, -1, -1, -1]);
    expect(timeline.glaFollowupHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
  });

  it('does not reacquire follow-up victims when ContinueAttackRange is zero', () => {
    const timeline = runContinueAttackRangeTimeline(0);
    expect(timeline.attackerTargetTimeline).toEqual([null, null, null, null, null, null, null, null]);
    expect(timeline.chinaFollowupHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.glaFollowupHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
  });

  it('keeps ContinueAttackRange victim-reacquire timing deterministic across repeated runs', () => {
    const first = runContinueAttackRangeTimeline(20);
    const second = runContinueAttackRangeTimeline(20);
    expect(first).toEqual(second);
  });

  it('uses source same-player filtering for ContinueAttackRange victim reacquire instead of same-side proximity', () => {
    const timeline = runContinueAttackSamePlayerFilterTimeline();
    expect(timeline.attackerTargetTimeline).toEqual([4, 4, 4, null, null, null, null, null]);
    expect(timeline.differentOwnerFollowupHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.sameOwnerFollowupHealthTimeline).toEqual([100, 100, 100, -1, -1, -1, -1, -1]);
  });

  it('keeps same-player ContinueAttackRange filtering deterministic across repeated runs', () => {
    const first = runContinueAttackSamePlayerFilterTimeline();
    const second = runContinueAttackSamePlayerFilterTimeline();
    expect(first).toEqual(second);
  });

  it('rejects OBJECT_STATUS_MASKED targets from attack command assignment and combat damage', () => {
    const timeline = runMaskedTargetGateTimeline();
    expect(timeline.attackerTargetTimeline).toEqual([null, null, null, null, null, null]);
    expect(timeline.maskedTargetHealthTimeline).toEqual([150, 150, 150, 150, 150, 150]);
  });

  it('rejects KINDOF_UNATTACKABLE targets from attack command assignment and combat damage', () => {
    const timeline = runUnattackableKindGateTimeline();
    expect(timeline.attackerTargetTimeline).toEqual([null, null, null, null, null, null]);
    expect(timeline.unattackableTargetHealthTimeline).toEqual([150, 150, 150, 150, 150, 150]);
  });

  it('skips MASKED and UNATTACKABLE follow-up candidates during ContinueAttackRange victim reacquire', () => {
    const timeline = runContinueAttackRangeLegalityFilterTimeline();
    expect(timeline.attackerTargetTimeline).toEqual([5, 5, 5, null, null, null, null, null]);
    expect(timeline.maskedFollowupHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.unattackableFollowupHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.validFollowupHealthTimeline).toEqual([100, 100, 100, -1, -1, -1, -1, -1]);
  });

  it('keeps MASKED/UNATTACKABLE target legality timing deterministic across repeated runs', () => {
    const first = {
      masked: runMaskedTargetGateTimeline(),
      unattackable: runUnattackableKindGateTimeline(),
      continueFilter: runContinueAttackRangeLegalityFilterTimeline(),
    };
    const second = {
      masked: runMaskedTargetGateTimeline(),
      unattackable: runUnattackableKindGateTimeline(),
      continueFilter: runContinueAttackRangeLegalityFilterTimeline(),
    };
    expect(first).toEqual(second);
  });

  it('applies NO_ATTACK_FROM_AI target legality by command source (AI blocked, PLAYER allowed)', () => {
    const playerCommand = runNoAttackFromAiGateTimeline('PLAYER');
    expect(playerCommand.attackerTargetTimeline).toEqual([2, 2, 2, 2, 2, 2]);
    expect(playerCommand.targetHealthTimeline).toEqual([120, 120, 120, 90, 90, 90]);

    const aiCommand = runNoAttackFromAiGateTimeline('AI');
    expect(aiCommand.attackerTargetTimeline).toEqual([null, null, null, null, null, null]);
    expect(aiCommand.targetHealthTimeline).toEqual([150, 150, 150, 150, 150, 150]);
  });

  it('uses stored command source when filtering ContinueAttackRange reacquire against NO_ATTACK_FROM_AI', () => {
    const playerCommand = runContinueAttackNoAttackFromAiFilterTimeline('PLAYER');
    expect(playerCommand.attackerTargetTimeline).toEqual([3, 3, 3, 4, 4, 4, null, null]);
    expect(playerCommand.noAttackFromAiFollowupHealthTimeline).toEqual([100, 100, 100, -1, -1, -1, -1, -1]);
    expect(playerCommand.validFollowupHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, -1, -1]);

    const aiCommand = runContinueAttackNoAttackFromAiFilterTimeline('AI');
    expect(aiCommand.attackerTargetTimeline).toEqual([4, 4, 4, null, null, null, null, null]);
    expect(aiCommand.noAttackFromAiFollowupHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(aiCommand.validFollowupHealthTimeline).toEqual([100, 100, 100, -1, -1, -1, -1, -1]);
  });

  it('keeps NO_ATTACK_FROM_AI command-source legality deterministic across repeated runs', () => {
    const first = {
      playerGate: runNoAttackFromAiGateTimeline('PLAYER'),
      aiGate: runNoAttackFromAiGateTimeline('AI'),
      playerContinue: runContinueAttackNoAttackFromAiFilterTimeline('PLAYER'),
      aiContinue: runContinueAttackNoAttackFromAiFilterTimeline('AI'),
    };
    const second = {
      playerGate: runNoAttackFromAiGateTimeline('PLAYER'),
      aiGate: runNoAttackFromAiGateTimeline('AI'),
      playerContinue: runContinueAttackNoAttackFromAiFilterTimeline('PLAYER'),
      aiContinue: runContinueAttackNoAttackFromAiFilterTimeline('AI'),
    };
    expect(first).toEqual(second);
  });

  it('rejects attack command assignment when attacker/target map status differs (on-map vs off-map)', () => {
    const timeline = runOffMapTargetGateTimeline();
    expect(timeline.attackerTargetTimeline).toEqual([null, null, null, null, null, null]);
    expect(timeline.offMapTargetHealthTimeline).toEqual([150, 150, 150, 150, 150, 150]);
  });

  it('skips off-map follow-up victims during ContinueAttackRange reacquire and selects on-map victims', () => {
    const timeline = runContinueAttackOffMapFilterTimeline();
    expect(timeline.attackerTargetTimeline).toEqual([4, 4, 4, null, null, null, null, null]);
    expect(timeline.offMapFollowupHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.onMapFollowupHealthTimeline).toEqual([100, 100, 100, -1, -1, -1, -1, -1]);
  });

  it('keeps off-map map-status attack legality deterministic across repeated runs', () => {
    const first = {
      directGate: runOffMapTargetGateTimeline(),
      continueFilter: runContinueAttackOffMapFilterTimeline(),
    };
    const second = {
      directGate: runOffMapTargetGateTimeline(),
      continueFilter: runContinueAttackOffMapFilterTimeline(),
    };
    expect(first).toEqual(second);
  });

  it('delays non-projectile damage resolution by WeaponSpeed distance travel time', () => {
    const timeline = runWeaponSpeedDelayTimeline();
    expect(timeline).toEqual([100, 100, 100, 100, 70, 70, 70, 70]);
  });

  it('applies radius primary/secondary damage tiers with RadiusDamageAffects relationship masks', () => {
    const timeline = runRadiusDamageAffectsTimeline();
    expect(timeline.primaryHealthTimeline).toEqual([110, 110, 110, 110]);
    expect(timeline.splashEnemyHealthTimeline).toEqual([135, 135, 135, 135]);
    expect(timeline.splashAllyHealthTimeline).toEqual([150, 150, 150, 150]);
    expect(timeline.attackerHealthTimeline).toEqual([150, 150, 150, 150]);
  });

  it('applies DamageDealtAtSelfPosition at source location instead of the direct target location', () => {
    const timeline = runDamageAtSelfPositionTimeline();
    expect(timeline.farTargetHealthTimeline).toEqual([150, 150, 150, 150]);
    expect(timeline.nearEnemyHealthTimeline).toEqual([120, 120, 120, 120]);
    expect(timeline.nearAllyHealthTimeline).toEqual([150, 150, 150, 150]);
    expect(timeline.attackerHealthTimeline).toEqual([150, 150, 150, 150]);
  });

  it('keeps weapon travel-delay/radius/self-position damage timelines deterministic across repeated runs', () => {
    const first = {
      delay: runWeaponSpeedDelayTimeline(),
      radius: runRadiusDamageAffectsTimeline(),
      selfPosition: runDamageAtSelfPositionTimeline(),
    };
    const second = {
      delay: runWeaponSpeedDelayTimeline(),
      radius: runRadiusDamageAffectsTimeline(),
      selfPosition: runDamageAtSelfPositionTimeline(),
    };
    expect(first).toEqual(second);
  });

  it('applies RadiusDamageAngle cone gating using source-facing orientation for radius victims', () => {
    const timeline = runRadiusDamageAngleTimeline();
    expect(timeline.primaryHealthTimeline).toEqual([120, 120, 120]);
    expect(timeline.inConeEnemyHealthTimeline).toEqual([140, 140, 140]);
    expect(timeline.outOfConeEnemyHealthTimeline).toEqual([160, 160, 160]);
  });

  it('applies RadiusDamageAffects SUICIDE and NOT_SIMILAR semantics for self-centered blast damage', () => {
    const timeline = runSuicideAndNotSimilarTimeline();
    expect(timeline.attackerHealthTimeline).toEqual([-1, -1, -1]);
    expect(timeline.farTargetHealthTimeline).toEqual([150, 150, 150]);
    expect(timeline.nearEnemyHealthTimeline).toEqual([120, 120, 120]);
    expect(timeline.nearAllyHealthTimeline).toEqual([150, 150, 150]);
  });

  it('keeps RadiusDamageAngle and SUICIDE/NOT_SIMILAR blast timelines deterministic across repeated runs', () => {
    const first = {
      cone: runRadiusDamageAngleTimeline(),
      suicide: runSuicideAndNotSimilarTimeline(),
    };
    const second = {
      cone: runRadiusDamageAngleTimeline(),
      suicide: runSuicideAndNotSimilarTimeline(),
    };
    expect(first).toEqual(second);
  });

  it('defers projectile-weapon impact by at least one logic frame versus direct-hit delivery', () => {
    const direct = runProjectileDeliveryTimeline(false);
    expect(direct).toEqual([70, 70, 70, 70]);

    const projectile = runProjectileDeliveryTimeline(true);
    expect(projectile).toEqual([100, 70, 70, 70]);
  });

  it('resolves zero-frame direct-hit damage immediately so earlier shooters can kill before later shooters fire', () => {
    const timeline = runDirectImmediateDuelTimeline();
    expect(timeline.firstHealthTimeline).toEqual([120, 120, 120]);
    expect(timeline.secondHealthTimeline).toEqual([-1, -1, -1]);
  });

  it('applies MinWeaponSpeed/ScaleWeaponSpeed projectile launch-speed scaling to impact timing', () => {
    const unscaled = runScaledProjectileDeliveryTimeline(false);
    expect(unscaled).toEqual([100, 70, 70, 70]);

    const scaled = runScaledProjectileDeliveryTimeline(true);
    expect(scaled).toEqual([100, 100, 70, 70]);
  });

  it('applies projectile-delivery splash damage at impact time using the same radius tiers', () => {
    const timeline = runProjectileSplashTimeline();
    expect(timeline.primaryHealthTimeline).toEqual([150, 150, 150, 110, 110]);
    expect(timeline.splashHealthTimeline).toEqual([150, 150, 150, 130, 130]);
  });

  it('resolves projectile point-hit damage against launch-resolved impact position so fast movers can evade', () => {
    const stationary = runProjectileMovingTargetPointHitTimeline(false);
    expect(stationary).toEqual([100, 100, 100, 60, 60, 60, 60]);

    const moving = runProjectileMovingTargetPointHitTimeline(true);
    expect(moving).toEqual([100, 100, 100, 100, 100, 100, 100]);
  });

  it('applies ProjectileCollidesWith ENEMIES mask to incidental point-impact collisions at launch-resolved impact positions', () => {
    const timeline = runProjectileIncidentalCollisionMaskTimeline('ENEMIES');
    expect(timeline.targetHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.blockerHealthTimeline).toEqual([100, 100, 100, 60, 60, 60, 60]);
  });

  it('skips incidental point-impact collisions when ProjectileCollidesWith mask excludes the collided object relationship', () => {
    const timeline = runProjectileIncidentalCollisionMaskTimeline('ALLIES');
    expect(timeline.targetHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.blockerHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100]);
  });

  it('ignores incidental projectile collisions with launcher container per source getContainedBy exclusion', () => {
    const timeline = runProjectileContainedByCollisionTimeline();
    expect(timeline.targetHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.containingAirfieldHealthTimeline).toEqual([500, 500, 500, 500, 500, 500, 500]);
  });

  it('prevents open-contain passengers from firing when PassengersAllowedToFire=No', () => {
    const timeline = runOpenContainPassengerAllowedToFireTimeline(false);
    expect(timeline.targetHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.containerHealthTimeline).toEqual([500, 500, 500, 500, 500, 500, 500, 500, 500, 500]);
  });

  it('allows open-contain passengers to fire when PassengersAllowedToFire=Yes', () => {
    const timeline = runOpenContainPassengerAllowedToFireTimeline(true);
    expect(timeline.targetHealthTimeline[0]).toBe(100);
    expect(Math.min(...timeline.targetHealthTimeline)).toBeLessThan(100);
  });

  it('allows open-contain passengers to fire after PassengersFireUpgrade', () => {
    const timeline = runContainPassengerAllowedToFireTimeline('Open', false, 'INFANTRY', {
      passengersFireUpgradeFrames: {
        enableAtFrame: 2,
      },
    });

    expect(timeline.targetHealthTimeline.slice(0, 2).every((health) => health === 100)).toBe(true);
    expect(Math.min(...timeline.targetHealthTimeline)).toBeLessThan(100);
  });

  it('restores PassengersAllowedToFire behavior when PassengersFireUpgrade is removed', () => {
    const timeline = runContainPassengerAllowedToFireTimeline('Open', false, 'INFANTRY', {
      passengersFireUpgradeFrames: {
        enableAtFrame: 2,
        removeAtFrame: 5,
      },
    });

    expect(timeline.targetHealthTimeline.slice(0, 2).every((health) => health === 100)).toBe(true);
    expect(Math.min(...timeline.targetHealthTimeline.slice(2, 6))).toBeLessThan(100);
    expect(
      timeline.targetHealthTimeline.slice(6).every((health) => health === timeline.targetHealthTimeline[5]),
    ).toBe(true);
  });

  it('is deterministic when using PassengersFireUpgrade enable/remove timeline', () => {
    const run = () =>
      runContainPassengerAllowedToFireTimeline('Open', false, 'INFANTRY', {
        passengersFireUpgradeFrames: {
          enableAtFrame: 2,
          removeAtFrame: 5,
        },
      });

    expect(run()).toEqual(run());
  });

  it('blocks nested open-contain passengers when outer OpenContain PassengersAllowedToFire=No', () => {
    const timeline = runNestedOpenContainPassengerAllowedToFireTimeline();
    expect(timeline.targetHealthTimeline).toEqual([
      100,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
    ]);
  });

  it('prevents transport-contain infantry passengers from firing when PassengersAllowedToFire=No', () => {
    const timeline = runContainPassengerAllowedToFireTimeline('Transport', false);
    expect(timeline.targetHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.containerHealthTimeline).toEqual([500, 500, 500, 500, 500, 500, 500, 500, 500, 500]);
  });

  it('allows transport-contain infantry passengers to fire when PassengersAllowedToFire=Yes', () => {
    const timeline = runContainPassengerAllowedToFireTimeline('Transport', true);
    expect(timeline.targetHealthTimeline[0]).toBe(100);
    expect(Math.min(...timeline.targetHealthTimeline)).toBeLessThan(100);
  });

  it('prevents transport-contain vehicle passengers from firing even when PassengersAllowedToFire=Yes', () => {
    const timeline = runContainPassengerAllowedToFireTimeline('Transport', true, 'VEHICLE');
    expect(timeline.targetHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.containerHealthTimeline).toEqual([500, 500, 500, 500, 500, 500, 500, 500, 500, 500]);
  });

  it('prevents overlord-contain passengers from firing when PassengersAllowedToFire=No', () => {
    const timeline = runContainPassengerAllowedToFireTimeline('Overlord', false);
    expect(timeline.targetHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.containerHealthTimeline).toEqual([500, 500, 500, 500, 500, 500, 500, 500, 500, 500]);
  });

  it('allows overlord-contain passengers to fire when PassengersAllowedToFire=Yes', () => {
    const timeline = runContainPassengerAllowedToFireTimeline('Overlord', true);
    expect(timeline.targetHealthTimeline[0]).toBe(100);
    expect(Math.min(...timeline.targetHealthTimeline)).toBeLessThan(100);
  });

  it('prevents overlord-contain vehicle passengers from firing when PassengersAllowedToFire=Yes', () => {
    const timeline = runContainPassengerAllowedToFireTimeline('Overlord', true, 'VEHICLE');
    expect(timeline.targetHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.containerHealthTimeline).toEqual([500, 500, 500, 500, 500, 500, 500, 500, 500, 500]);
  });

  it('prevents helix-contain passengers from firing when PassengersAllowedToFire=No', () => {
    const timeline = runContainPassengerAllowedToFireTimeline('Helix', false);
    expect(timeline.targetHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.containerHealthTimeline).toEqual([500, 500, 500, 500, 500, 500, 500, 500, 500, 500]);
  });

  it('allows helix-contain passengers to fire when PassengersAllowedToFire=Yes', () => {
    const timeline = runContainPassengerAllowedToFireTimeline('Helix', true);
    expect(timeline.targetHealthTimeline[0]).toBe(100);
    expect(Math.min(...timeline.targetHealthTimeline)).toBeLessThan(100);
  });

  it('allows helix-contain matching portable structures to fire while PassengersAllowedToFire=No', () => {
    const timeline = runContainPassengerAllowedToFireTimeline(
      'Helix',
      false,
      'PORTABLE_STRUCTURE',
      {
        passengerTemplateName: 'HelixContainPortablePassenger',
        payloadTemplateNames: ['HelixContainPortablePassenger'],
      },
    );
    expect(timeline.targetHealthTimeline[0]).toBe(100);
    expect(Math.min(...timeline.targetHealthTimeline)).toBeLessThan(100);
  });

  it('prevents helix-contain portable structure from firing when it is not in PayloadTemplateName', () => {
    const timeline = runContainPassengerAllowedToFireTimeline(
      'Helix',
      true,
      'PORTABLE_STRUCTURE',
      {
        passengerTemplateName: 'HelixContainPortablePassenger',
        payloadTemplateNames: ['OtherPortable'],
      },
    );
    expect(timeline.targetHealthTimeline).toEqual([
      100,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
    ]);
    expect(timeline.containerHealthTimeline).toEqual([
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
    ]);
  });

  it('prevents helix-contain portable riders from firing based on tracked rider identity', () => {
    const timeline = runHelixPortableRiderIdentityTimeline();
    expect(timeline.targetHealthTimeline[0]).toBe(100);
    expect(Math.min(...timeline.targetHealthTimeline)).toBe(60);
    expect(Math.min(...timeline.targetHealthTimeline)).toBeGreaterThan(20);
    expect(timeline.containerHealthTimeline).toEqual([
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
      500,
    ]);
  });

  it('prevents helix-contain vehicle passengers from firing even when PassengersAllowedToFire=Yes', () => {
    const timeline = runContainPassengerAllowedToFireTimeline('Helix', true, 'VEHICLE');
    expect(timeline.targetHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.containerHealthTimeline).toEqual([500, 500, 500, 500, 500, 500, 500, 500, 500, 500]);
  });

  it('allows garrison-contain passengers to fire even when PassengersAllowedToFire=No', () => {
    const timeline = runContainPassengerAllowedToFireTimeline('Garrison', false);
    expect(timeline.targetHealthTimeline[0]).toBe(100);
    expect(Math.min(...timeline.targetHealthTimeline)).toBeLessThan(100);
  });

  it('blocks garrison-contain passenger fire while container is DISABLED_SUBDUED and restores afterwards', () => {
    const timeline = runContainPassengerAllowedToFireTimeline('Garrison', false, 'INFANTRY', {
      containerDisabledSubduedFrames: {
        disableAtFrame: 2,
        restoreAtFrame: 6,
      },
    });

    const disabledFrames = timeline.containerStatusFlagsTimeline
      .map((flags, frame) => ({ frame, disabled: flags.includes('DISABLED_SUBDUED') }))
      .filter((entry) => entry.disabled)
      .map((entry) => entry.frame);
    expect(disabledFrames.length).toBeGreaterThan(0);

    const firstDisabledFrame = disabledFrames[0];
    const firstEnabledAfterDisable = timeline.containerStatusFlagsTimeline.findIndex(
      (flags, frame) => frame > firstDisabledFrame && !flags.includes('DISABLED_SUBDUED'),
    );
    expect(firstEnabledAfterDisable).toBeGreaterThan(firstDisabledFrame);

    const preDisabledHealth = timeline.targetHealthTimeline.slice(0, firstDisabledFrame);
    expect(Math.min(...preDisabledHealth)).toBeLessThan(100);

    const disabledHealth = timeline.targetHealthTimeline.slice(firstDisabledFrame, firstEnabledAfterDisable);
    expect(new Set(disabledHealth).size).toBe(1);

    const postRestoreHealth = timeline.targetHealthTimeline.slice(firstEnabledAfterDisable);
    expect(Math.min(...postRestoreHealth)).toBeLessThan(disabledHealth[0]);
  });

  it('keeps garrison-contain passenger DISABLED_SUBDUED gating deterministic across repeated runs', () => {
    const run = () => runContainPassengerAllowedToFireTimeline('Garrison', false, 'INFANTRY', {
      containerDisabledSubduedFrames: {
        disableAtFrame: 2,
        restoreAtFrame: 6,
      },
    });

    const first = run();
    const second = run();
    expect(first).toEqual(second);
  });

  it('ignores incidental projectile collisions with FS_AIRFIELD when the intended victim is reserved there', () => {
    const timeline = runProjectileAirfieldReservedVictimCollisionTimeline();
    expect(timeline.targetHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100]);
    expect(timeline.airfieldHealthTimeline).toEqual([500, 500, 500, 500, 500, 500, 500]);
  });

  it('converts sneaky-targeted projectile shots into position-shots using SneakyOffsetWhenAttacking during attackers-miss window', () => {
    const noSneaky = runProjectileSneakyTargetingOffsetTimeline(false);
    expect(noSneaky).toEqual([100, 100, 100, 60, 60, 60, 60]);

    const withSneaky = runProjectileSneakyTargetingOffsetTimeline(true);
    expect(withSneaky).toEqual([100, 100, 100, 100, 100, 100, 100]);
  });

  it('skips incidental projectile collisions with sneaky-offset units while attackers-miss immunity is active', () => {
    const noSneaky = runProjectileSneakyIncidentalImmunityTimeline(false);
    expect(noSneaky.targetHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100]);
    expect(noSneaky.blockerHealthTimeline).toEqual([100, 100, 100, 60, 60, 60, 60]);

    const withSneaky = runProjectileSneakyIncidentalImmunityTimeline(true);
    expect(withSneaky.targetHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100]);
    expect(withSneaky.blockerHealthTimeline).toEqual([100, 100, 100, 100, 100, 100, 100]);
  });

  it('refreshes attackers-miss sneaky immunity every frame while IS_ATTACKING is active, even between long-cooldown shots', () => {
    const noSneaky = runProjectileSneakyCooldownRefreshTimeline(false);
    expect(noSneaky).toEqual([100, 100, 100, 100, 100, 100, 60, 60, 60, 60]);

    const withSneaky = runProjectileSneakyCooldownRefreshTimeline(true);
    expect(withSneaky).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
  });

  it('keeps attackers-miss sneaky immunity for configured persist frames after stop, then allows hits after expiry', () => {
    const keepAttacking = runProjectileSneakyPersistAfterStopTimeline(null);
    expect(keepAttacking).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);

    const stopEarly = runProjectileSneakyPersistAfterStopTimeline(2);
    expect(stopEarly).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 60, 60, 60]);
  });

  it('keeps projectile-delivery timing and splash deterministic across repeated runs', () => {
    const first = {
      directImmediate: runDirectImmediateDuelTimeline(),
      delivery: runProjectileDeliveryTimeline(true),
      scaledSpeed: runScaledProjectileDeliveryTimeline(true),
      splash: runProjectileSplashTimeline(),
      movingPointHit: runProjectileMovingTargetPointHitTimeline(true),
      incidentalEnemyMask: runProjectileIncidentalCollisionMaskTimeline('ENEMIES'),
      incidentalAllyMask: runProjectileIncidentalCollisionMaskTimeline('ALLIES'),
      containedBy: runProjectileContainedByCollisionTimeline(),
      airfieldReservedVictim: runProjectileAirfieldReservedVictimCollisionTimeline(),
      sneakyOffset: runProjectileSneakyTargetingOffsetTimeline(true),
      sneakyIncidentalImmunity: runProjectileSneakyIncidentalImmunityTimeline(true),
      sneakyCooldownRefresh: runProjectileSneakyCooldownRefreshTimeline(true),
      sneakyPersistAfterStop: runProjectileSneakyPersistAfterStopTimeline(2),
    };
    const second = {
      directImmediate: runDirectImmediateDuelTimeline(),
      delivery: runProjectileDeliveryTimeline(true),
      scaledSpeed: runScaledProjectileDeliveryTimeline(true),
      splash: runProjectileSplashTimeline(),
      movingPointHit: runProjectileMovingTargetPointHitTimeline(true),
      incidentalEnemyMask: runProjectileIncidentalCollisionMaskTimeline('ENEMIES'),
      incidentalAllyMask: runProjectileIncidentalCollisionMaskTimeline('ALLIES'),
      containedBy: runProjectileContainedByCollisionTimeline(),
      airfieldReservedVictim: runProjectileAirfieldReservedVictimCollisionTimeline(),
      sneakyOffset: runProjectileSneakyTargetingOffsetTimeline(true),
      sneakyIncidentalImmunity: runProjectileSneakyIncidentalImmunityTimeline(true),
      sneakyCooldownRefresh: runProjectileSneakyCooldownRefreshTimeline(true),
      sneakyPersistAfterStop: runProjectileSneakyPersistAfterStopTimeline(2),
    };
    expect(first).toEqual(second);
  });

  it('uses projectile scatter to launch at a position and miss tiny-radius impacts deterministically', () => {
    const noScatter = runProjectileScatterTimeline(0);
    expect(noScatter).toEqual([100, 70, 70, 70]);

    const withScatter = runProjectileScatterTimeline(200);
    expect(withScatter).toEqual([100, 100, 100, 100]);
  });

  it('applies ScatterRadiusVsInfantry only when the projectile target is infantry', () => {
    const infantryTarget = runProjectileInfantryInaccuracyTimeline('INFANTRY');
    expect(infantryTarget).toEqual([100, 100, 100, 100]);

    const vehicleTarget = runProjectileInfantryInaccuracyTimeline('VEHICLE');
    expect(vehicleTarget).toEqual([100, 70, 70, 70]);
  });

  it('keeps projectile scatter and infantry-inaccuracy timelines deterministic across repeated runs', () => {
    const first = {
      scatter: runProjectileScatterTimeline(200),
      infantry: runProjectileInfantryInaccuracyTimeline('INFANTRY'),
      vehicle: runProjectileInfantryInaccuracyTimeline('VEHICLE'),
    };
    const second = {
      scatter: runProjectileScatterTimeline(200),
      infantry: runProjectileInfantryInaccuracyTimeline('INFANTRY'),
      vehicle: runProjectileInfantryInaccuracyTimeline('VEHICLE'),
    };
    expect(first).toEqual(second);
  });

  it('applies ScatterTarget pattern offsets by firing at position-shots instead of the direct target object', () => {
    const withoutPattern = runProjectileScatterTargetTimeline(false);
    expect(withoutPattern).toEqual([100, 70, 70, 70]);

    const withPattern = runProjectileScatterTargetTimeline(true);
    expect(withPattern).toEqual([100, 100, 100, 100]);
  });

  it('rebuilds ScatterTarget unused-list on clip reload and repeats the deterministic offset cycle', () => {
    const timeline = runProjectileScatterTargetReloadTimeline();
    expect(timeline).toEqual([
      200,
      200,
      200,
      200,
      170,
      170,
      170,
      170,
      170,
      170,
      140,
      140,
    ]);
  });

  it('keeps ScatterTarget offset and reload-cycle timelines deterministic across repeated runs', () => {
    const first = {
      pattern: runProjectileScatterTargetTimeline(true),
      reloadCycle: runProjectileScatterTargetReloadTimeline(),
      selfPositionScatter: runDamageAtSelfScatterTargetTimeline(true),
    };
    const second = {
      pattern: runProjectileScatterTargetTimeline(true),
      reloadCycle: runProjectileScatterTargetReloadTimeline(),
      selfPositionScatter: runDamageAtSelfScatterTargetTimeline(true),
    };
    expect(first).toEqual(second);
  });

  it('keeps DamageDealtAtSelfPosition anchored at source even when ScatterTarget offsets are present', () => {
    const withoutScatterTarget = runDamageAtSelfScatterTargetTimeline(false);
    expect(withoutScatterTarget.targetHealthTimeline).toEqual([150, 150, 150, 150]);
    expect(withoutScatterTarget.nearEnemyHealthTimeline).toEqual([110, 110, 110, 110]);

    const withScatterTarget = runDamageAtSelfScatterTargetTimeline(true);
    expect(withScatterTarget.targetHealthTimeline).toEqual([150, 150, 150, 150]);
    expect(withScatterTarget.nearEnemyHealthTimeline).toEqual([110, 110, 110, 110]);
  });

  it('enforces MaxSimultaneousOfType using existing and queued units', () => {
    const timeline = runMaxSimultaneousTimeline();
    expect(timeline.credits).toEqual([900, 900, 900, 900]);
    expect(timeline.queueCounts).toEqual([1, 1, 0, 0]);
    expect(timeline.unitCounts).toEqual([1, 1, 2, 2]);
  });

  it('keeps MaxSimultaneous rejection credit behavior deterministic across repeated runs', () => {
    const first = runMaxSimultaneousTimeline();
    const second = runMaxSimultaneousTimeline();
    expect(first).toEqual(second);
  });

  it('treats build variations as equivalent for MaxSimultaneousOfType gating', () => {
    const timeline = runMaxSimEquivalentVariationTimeline();
    expect(timeline.credits).toEqual([500, 500, 500]);
    expect(timeline.queueCounts).toEqual([0, 0, 0]);
    expect(timeline.baseCounts).toEqual([0, 0, 0]);
    expect(timeline.variationCounts).toEqual([1, 1, 1]);
  });

  it('treats build variations as equivalent for prerequisite ownership checks', () => {
    const timeline = runPrerequisiteEquivalentVariationTimeline();
    expect(timeline.credits).toEqual([380, 380, 380, 380]);
    expect(timeline.queueCounts).toEqual([1, 1, 0, 0]);
    expect(timeline.producedCounts).toEqual([0, 0, 1, 1]);
  });

  it('treats build variations as equivalent for QuantityModifier production count', () => {
    const timeline = runQuantityModifierEquivalentVariationTimeline();
    expect(timeline.credits).toEqual([410, 410, 410, 410, 410]);
    expect(timeline.queueCounts).toEqual([1, 1, 0, 0, 0]);
    expect(timeline.baseCounts).toEqual([0, 0, 0, 0, 0]);
    expect(timeline.variationCounts).toEqual([0, 0, 2, 2, 2]);
  });

  it('keeps build-variation equivalence production behavior deterministic across repeated runs', () => {
    const first = {
      maxSim: runMaxSimEquivalentVariationTimeline(),
      prereq: runPrerequisiteEquivalentVariationTimeline(),
      quantity: runQuantityModifierEquivalentVariationTimeline(),
    };
    const second = {
      maxSim: runMaxSimEquivalentVariationTimeline(),
      prereq: runPrerequisiteEquivalentVariationTimeline(),
      quantity: runQuantityModifierEquivalentVariationTimeline(),
    };
    expect(first).toEqual(second);
  });

  it('enforces MaxSimultaneousOfType across producers on the same side', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 2,
          }),
          makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
            UnitCreatePoint: [8, 0, 0],
          }),
        ]),
        makeObjectDef('CappedUnit', 'America', ['VEHICLE'], [], {
          BuildTime: 0.2,
          BuildCost: 100,
          MaxSimultaneousOfType: 1,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('WarFactory', 8, 8), makeMapObject('WarFactory', 20, 8)]),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );

    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
    logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'CappedUnit' });
    logic.submitCommand({ type: 'queueUnitProduction', entityId: 2, unitTemplateName: 'CappedUnit' });
    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(900);
    expect(logic.getProductionState(1)?.queueEntryCount).toBe(1);
    expect(logic.getProductionState(2)?.queueEntryCount).toBe(0);
  });

  it('enforces AND/OR object prerequisites before queueing production', () => {
    const blockedNoTech = runPrerequisiteTimeline(true, false);
    expect(blockedNoTech.credits).toEqual([1000, 1000, 1000, 1000]);
    expect(blockedNoTech.queueCounts).toEqual([0, 0, 0, 0]);
    expect(blockedNoTech.producedCounts).toEqual([0, 0, 0, 0]);

    const blockedNoPower = runPrerequisiteTimeline(false, true);
    expect(blockedNoPower.credits).toEqual([1000, 1000, 1000, 1000]);
    expect(blockedNoPower.queueCounts).toEqual([0, 0, 0, 0]);
    expect(blockedNoPower.producedCounts).toEqual([0, 0, 0, 0]);

    const allowed = runPrerequisiteTimeline(true, true);
    expect(allowed.credits).toEqual([850, 850, 850, 850]);
    expect(allowed.queueCounts).toEqual([1, 1, 0, 0]);
    expect(allowed.producedCounts).toEqual([0, 0, 1, 1]);
  });

  it('enforces Science prerequisites and unlocks production after grantSideScience', () => {
    const timeline = runSciencePrerequisiteTimeline({ grantAtFrame: 1 });
    expect(timeline.credits).toEqual([500, 350, 350, 350, 350]);
    expect(timeline.queueCounts).toEqual([0, 1, 1, 0, 0]);
    expect(timeline.producedCounts).toEqual([0, 0, 0, 1, 1]);
    expect(timeline.scienceCounts).toEqual([0, 1, 1, 1, 1]);
  });

  it('rejects granting non-grantable sciences and keeps science-gated production blocked', () => {
    const timeline = runSciencePrerequisiteTimeline({ grantAtFrame: 1, scienceGrantable: false });
    expect(timeline.credits).toEqual([500, 500, 500, 500, 500]);
    expect(timeline.queueCounts).toEqual([0, 0, 0, 0, 0]);
    expect(timeline.producedCounts).toEqual([0, 0, 0, 0, 0]);
    expect(timeline.scienceCounts).toEqual([0, 0, 0, 0, 0]);
  });

  it('keeps science-prerequisite unlock timing deterministic across repeated runs', () => {
    const first = runSciencePrerequisiteTimeline({ grantAtFrame: 1 });
    const second = runSciencePrerequisiteTimeline({ grantAtFrame: 1 });
    expect(first).toEqual(second);
  });

  it('purchases science using local science purchase points and avoids duplicates', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('DummyUnit', 'America', ['INFANTRY'], [], {
          BuildTime: 0.1,
          BuildCost: 10,
        }),
      ],
      sciences: [
        makeScienceDef('SCIENCE_EMERGENCY', {
          SciencePurchasePointCost: 2,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('DummyUnit', 10, 10)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.setPlayerSide(0, 'America');
    (logic as unknown as { localPlayerSciencePurchasePoints: number }).localPlayerSciencePurchasePoints = 2;

    logic.submitCommand({ type: 'purchaseScience', scienceName: 'SCIENCE_EMERGENCY', scienceCost: 2 });
    expect(logic.getLocalPlayerScienceNames()).toEqual(['SCIENCE_EMERGENCY']);
    expect(logic.getLocalPlayerSciencePurchasePoints()).toBe(0);

    logic.submitCommand({ type: 'purchaseScience', scienceName: 'SCIENCE_EMERGENCY', scienceCost: 2 });
    expect(logic.getLocalPlayerScienceNames()).toEqual(['SCIENCE_EMERGENCY']);
  });

  it('supports purchaseScience when local side is inferred from spawned entity side', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('DummyUnit', 'America', ['INFANTRY'], [], {
          BuildTime: 0.1,
          BuildCost: 10,
        }),
      ],
      sciences: [
        makeScienceDef('SCIENCE_EMERGENCY', {
          SciencePurchasePointCost: 2,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('DummyUnit', 10, 10)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    (logic as unknown as { localPlayerSciencePurchasePoints: number }).localPlayerSciencePurchasePoints = 2;

    logic.submitCommand({ type: 'purchaseScience', scienceName: 'SCIENCE_EMERGENCY', scienceCost: 2 });
    expect(logic.getLocalPlayerScienceNames()).toEqual(['SCIENCE_EMERGENCY']);
    expect(logic.getSideScienceState('America').acquired).toEqual(['SCIENCE_EMERGENCY']);
    expect((logic as unknown as { localPlayerSciencePurchasePoints: number }).localPlayerSciencePurchasePoints).toBe(0);
  });

  it('keeps getLocalPlayerScienceNames empty when local side is ambiguous across spawned entities', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('DummyUnit', 'America', ['INFANTRY'], [], {
          BuildTime: 0.1,
          BuildCost: 10,
        }),
        makeObjectDef('DummyUnit', 'China', ['INFANTRY'], [], {
          BuildTime: 0.1,
          BuildCost: 10,
        }),
      ],
      sciences: [
        makeScienceDef('SCIENCE_EMERGENCY', {
          SciencePurchasePointCost: 2,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('DummyUnit', 10, 10), makeMapObject('DummyUnit', 20, 20)]),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );
    logic.grantSideScience('America', 'SCIENCE_EMERGENCY');

    expect(logic.getLocalPlayerScienceNames()).toEqual([]);
  });

  it('requires science prerequisites before purchase and deducts remaining points only on success', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('DummyUnit', 'America', ['INFANTRY'], [], {
          BuildTime: 0.1,
          BuildCost: 10,
        }),
      ],
      sciences: [
        makeScienceDef('SCIENCE_ROOT', {
          SciencePurchasePointCost: 2,
        }),
        makeScienceDef('SCIENCE_ADVANCED', {
          SciencePurchasePointCost: 3,
          PrerequisiteSciences: 'SCIENCE_ROOT',
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('DummyUnit', 10, 10)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.setPlayerSide(0, 'America');
    (logic as unknown as { localPlayerSciencePurchasePoints: number }).localPlayerSciencePurchasePoints = 3;

    logic.submitCommand({ type: 'purchaseScience', scienceName: 'SCIENCE_ADVANCED', scienceCost: 3 });
    expect(logic.getLocalPlayerScienceNames()).toEqual([]);
    expect(logic.getLocalPlayerSciencePurchasePoints()).toBe(3);

    logic.submitCommand({ type: 'purchaseScience', scienceName: 'SCIENCE_ROOT', scienceCost: 2 });
    expect(logic.getLocalPlayerScienceNames()).toEqual(['SCIENCE_ROOT']);
    expect(logic.getLocalPlayerSciencePurchasePoints()).toBe(1);

    logic.submitCommand({ type: 'purchaseScience', scienceName: 'SCIENCE_ADVANCED', scienceCost: 3 });
    expect(logic.getLocalPlayerScienceNames()).toEqual(['SCIENCE_ADVANCED', 'SCIENCE_ROOT']);
    expect(logic.getLocalPlayerSciencePurchasePoints()).toBe(0);
  });

  it('blocks purchase for disabled or hidden local science entries', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('DummyUnit', 'America', ['INFANTRY'], [], {
          BuildTime: 0.1,
          BuildCost: 10,
        }),
      ],
      sciences: [
        makeScienceDef('SCIENCE_EMERGENCY', {
          SciencePurchasePointCost: 2,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('DummyUnit', 10, 10)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.setPlayerSide(0, 'America');
    (logic as unknown as {
      localPlayerSciencePurchasePoints: number;
      localPlayerScienceAvailability: Map<string, 'enabled' | 'disabled' | 'hidden'>;
    }).localPlayerSciencePurchasePoints = 2;
    (logic as unknown as {
      localPlayerSciencePurchasePoints: number;
      localPlayerScienceAvailability: Map<string, 'enabled' | 'disabled' | 'hidden'>;
    }).localPlayerScienceAvailability.set('SCIENCE_EMERGENCY', 'hidden');

    logic.submitCommand({ type: 'purchaseScience', scienceName: 'SCIENCE_EMERGENCY', scienceCost: 2 });
    expect(logic.getLocalPlayerScienceNames()).toEqual([]);
    expect(logic.getLocalPlayerSciencePurchasePoints()).toBe(2);
  });

  it('purchases science through local science points to unlock production deterministically', () => {
    const timeline = runPurchaseScienceUnlocksProductionTimeline({
      scienceCost: 2,
      initialPoints: 2,
      purchaseAtFrame: 1,
      queueAtFrame: 2,
    });

    expect(timeline.scienceCounts).toEqual([0, 1, 1, 1, 1, 1, 1]);
    expect(timeline.credits).toEqual([500, 500, 350, 350, 350, 350, 350]);
    expect(timeline.queueCounts).toEqual([0, 0, 1, 1, 1, 0, 0]);
    expect(timeline.producedCounts).toEqual([0, 0, 0, 0, 0, 1, 1]);
    expect(timeline.remainingPoints).toEqual([2, 0, 0, 0, 0, 0, 0]);
  });

  it('ignores command-reported purchase cost payload and validates against registered science cost', () => {
    const timeline = runPurchaseScienceUnlocksProductionTimeline({
      scienceCost: 2,
      commandScienceCost: 999,
      initialPoints: 2,
      purchaseAtFrame: 0,
      queueAtFrame: 1,
    });

    expect(timeline.scienceCounts[1]).toBe(1);
    expect(timeline.remainingPoints[1]).toBe(0);
    expect(timeline.queueCounts[1]).toBe(1);
  });

  it('enforces Buildable=Only_By_AI against side player type', () => {
    const humanTimeline = runOnlyByAiBuildableTimeline('HUMAN');
    expect(humanTimeline.credits).toEqual([500, 500, 500, 500]);
    expect(humanTimeline.queueCounts).toEqual([0, 0, 0, 0]);
    expect(humanTimeline.producedCounts).toEqual([0, 0, 0, 0]);

    const computerTimeline = runOnlyByAiBuildableTimeline('COMPUTER');
    expect(computerTimeline.credits).toEqual([400, 400, 400, 400]);
    expect(computerTimeline.queueCounts).toEqual([1, 1, 0, 0]);
    expect(computerTimeline.producedCounts).toEqual([0, 0, 1, 1]);
  });

  it('keeps Buildable=Only_By_AI queue gating deterministic across repeated runs', () => {
    const first = runOnlyByAiBuildableTimeline('COMPUTER');
    const second = runOnlyByAiBuildableTimeline('COMPUTER');
    expect(first).toEqual(second);
  });

  it('enforces MaxSimultaneousLinkKey counts for max-sim production gating', () => {
    const timeline = runMaxSimultaneousLinkKeyTimeline();
    expect(timeline.credits).toEqual([500, 500, 500, 500]);
    expect(timeline.queueCounts).toEqual([0, 0, 0, 0]);
    expect(timeline.alphaCounts).toEqual([1, 1, 1, 1]);
    expect(timeline.bravoCounts).toEqual([0, 0, 0, 0]);
  });

  it('keeps MaxSimultaneousLinkKey max-sim gating deterministic across repeated runs', () => {
    const first = runMaxSimultaneousLinkKeyTimeline();
    const second = runMaxSimultaneousLinkKeyTimeline();
    expect(first).toEqual(second);
  });

  it('honors Buildable=Ignore_Prerequisites while preserving deterministic timing', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
          makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
            MaxQueueEntries: 2,
          }),
          makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
            UnitCreatePoint: [8, 0, 0],
            ExitDelay: 0,
          }),
        ]),
        makeObjectDef('IgnorePrereqUnit', 'America', ['VEHICLE'], [
          makeBlock('Prerequisite', 'Object MissingTech', {}),
        ], {
          Buildable: 'Ignore_Prerequisites',
          BuildTime: 0.1,
          BuildCost: 120,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('WarFactory', 10, 10)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
    logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'IgnorePrereqUnit' });

    const queueCounts: number[] = [];
    const producedCounts: number[] = [];
    for (let frame = 0; frame < 4; frame += 1) {
      logic.update(1 / 30);
      queueCounts.push(logic.getProductionState(1)?.queueEntryCount ?? 0);
      producedCounts.push(logic.getEntityIdsByTemplate('IgnorePrereqUnit').length);
    }

    expect(logic.getSideCredits('America')).toBe(380);
    expect(queueCounts).toEqual([1, 1, 0, 0]);
    expect(producedCounts).toEqual([0, 0, 1, 1]);
  });

  it('refunds all queued unit production when a producer dies before completion', () => {
    const timeline = runProducerDeathUnitRefundTimeline();
    expect(timeline.credits).toEqual([500, 500, 500]);
    expect(timeline.alive).toEqual([false, false, false]);
    expect(timeline.producedCounts).toEqual([0, 0, 0]);
  });

  it('refunds queued player upgrades and clears in-production state when a producer dies', () => {
    const timeline = runProducerDeathUpgradeRefundTimeline();
    expect(timeline.credits).toEqual([500, 500, 500]);
    expect(timeline.inProductionCounts).toEqual([0, 0, 0]);
    expect(timeline.completedCounts).toEqual([0, 0, 0]);
  });

  it('keeps producer-death refund behavior deterministic across repeated runs', () => {
    const first = runProducerDeathUnitRefundTimeline();
    const second = runProducerDeathUnitRefundTimeline();
    expect(first).toEqual(second);
  });
});
