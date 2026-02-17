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

function makeUpgradeDef(name: string, fields: Record<string, unknown>): UpgradeDef {
  return {
    name,
    fields: fields as Record<string, string | number | boolean | string[] | number[]>,
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
  commandButtons?: CommandButtonDef[];
  commandSets?: CommandSetDef[];
  sciences?: ScienceDef[];
  locomotors?: LocomotorDef[];
}): IniDataBundle {
  const weapons = params.weapons ?? [];
  const armors = params.armors ?? [];
  const upgrades = params.upgrades ?? [];
  const commandButtons = params.commandButtons ?? [];
  const commandSets = params.commandSets ?? [];
  const sciences = params.sciences ?? [];
  const locomotors = params.locomotors ?? [];
  return {
    objects: params.objects,
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

function runCombatTimeline(): number[] {
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
      ]),
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
      ]),
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
        Upgrade: 'Upgrade_Move',
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
      ]),
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
      ]),
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
      ]),
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
  it('exposes renderable entity snapshots and keeps unresolved objects explicit', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('ResolvedVehicle', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Draw', 'W3DModelDraw ModuleTag_Draw', {}, [
            makeBlock('ModelConditionState', 'DefaultModelConditionState', { Model: 'USAPrivateTank' }),
          ]),
        ]),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    const summary = logic.loadMapObjects(
      makeMap([makeMapObject('ResolvedVehicle', 10, 10), makeMapObject('MissingVehicle', 20, 20)], 64, 64),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );
    const renderable = logic.getRenderableEntityStates();

    expect(summary.totalObjects).toBe(2);
    expect(summary.spawnedObjects).toBe(2);
    expect(summary.unresolvedObjects).toBe(1);
    expect(renderable).toHaveLength(2);
    expect(renderable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          templateName: 'ResolvedVehicle',
          resolved: true,
          renderAssetPath: 'USAPrivateTank',
          renderAssetResolved: true,
          animationState: 'IDLE',
        }),
        expect.objectContaining({
          templateName: 'MissingVehicle',
          resolved: false,
          renderAssetPath: null,
          renderAssetResolved: false,
          animationState: 'IDLE',
        }),
      ]),
    );
  });

  it('reports render asset metadata independently from placeholder geometry visibility', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('NoModelObject', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        ]),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('NoModelObject', 10, 10)]),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );

    const state = logic.getEntityState(1);
    expect(state).toEqual(expect.objectContaining({
      renderAssetPath: null,
      renderAssetResolved: false,
    }));
  });

  it('reads render assets from nested model condition blocks and supports FileName/ModelName', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('NestedDrawUnit', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Draw', 'W3DModelDraw ModuleTag_Draw', {}, [
            makeBlock('ModelConditionState', 'Default', { ModelName: 'USAPrivateTank' }),
            makeBlock('ModelConditionState', 'Damaged', { FileName: 'USAPrivateTank_Damaged' }),
          ]),
        ]),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('NestedDrawUnit', 20, 20)]),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );

    const state = logic.getEntityState(1);
    expect(state).toEqual(expect.objectContaining({
      renderAssetPath: 'USAPrivateTank',
      renderAssetResolved: true,
    }));
  });

  it('marks NONE model tokens as unresolved even when template data exists', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('NoRenderableToken', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Draw', 'W3DModelDraw ModuleTag_Draw', {}, [
            makeBlock('ModelConditionState', 'Default', { Model: 'NONE' }),
          ]),
        ]),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('NoRenderableToken', 30, 30)]),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );

    const state = logic.getEntityState(1);
    expect(state).toEqual(expect.objectContaining({
      renderAssetPath: null,
      renderAssetResolved: false,
    }));
  });

  it('transitions animation state from IDLE to MOVE and back when a move command is issued', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('MobileUnit', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('LocomotorSet', 'SET_NORMAL Crawler', {}),
        ]),
      ],
      locomotors: [makeLocomotorDef('Crawler', 120)],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('MobileUnit', 10, 10)], 64, 64),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );

    expect(logic.getEntityState(1)?.animationState).toBe('IDLE');
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 40, targetZ: 10 });
    logic.update(1 / 30);
    expect(logic.getEntityState(1)?.animationState).toBe('MOVE');

    for (let frame = 0; frame < 80; frame += 1) {
      logic.update(1 / 30);
    }
    expect(logic.getEntityState(1)?.animationState).toBe('IDLE');
  });

  it('transitions animation state to ATTACK while attacking and to IDLE on explicit stop', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('Attacker', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'AttackCannon'] }),
        ]),
        makeObjectDef('Target', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        ]),
      ],
      weapons: [
        makeWeaponDef('AttackCannon', {
          AttackRange: 140,
          PrimaryDamage: 10,
          DelayBetweenShots: 100,
        }),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('Attacker', 10, 10), makeMapObject('Target', 30, 10)]),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);

    expect(logic.getEntityState(1)?.animationState).toBe('IDLE');
    logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });
    logic.update(1 / 30);
    expect(logic.getEntityState(1)?.animationState).toBe('ATTACK');

    logic.submitCommand({ type: 'stop', entityId: 1 });
    logic.update(1 / 30);
    expect(logic.getEntityState(1)?.animationState).toBe('IDLE');
  });

  it('records DIE before entity cleanup when an entity is destroyed', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('DestroyMe', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        ]),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('DestroyMe', 10, 10)]),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );

    const logicWithPrivateAccess = logic as unknown as {
      markEntityDestroyed: (entityId: number, attackerId: number) => void;
    };
    logicWithPrivateAccess.markEntityDestroyed(1, 0);
    expect(logic.getEntityState(1)?.animationState).toBe('DIE');
    logic.update(1 / 30);
    expect(logic.getEntityState(1)).toBeNull();
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

  it('requires a matching PLAYER_UPGRADE/OBJECT_UPGRADE command button to queue upgrade production', () => {
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
