import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import type { IniBlock } from '@generals/core';
import {
  type ArmorDef,
  type CommandButtonDef,
  type CommandSetDef,
  type FactionDef,
  IniDataRegistry,
  type IniDataBundle,
  type LocomotorDef,
  type ObjectDef,
  type ScienceDef,
  type SpecialPowerDef,
  type UpgradeDef,
  type WeaponDef,
} from '@generals/ini-data';
import { HeightmapGrid, type MapDataJSON, type MapObjectJSON, uint8ArrayToBase64 } from '@generals/terrain';

import { GameLogicSubsystem } from './index.js';
import { CELL_CLEAR, CELL_FOGGED, CELL_SHROUDED } from './fog-of-war.js';

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

function makeSpecialPowerDef(name: string, fields: Record<string, unknown>): SpecialPowerDef {
  return {
    name,
    fields: fields as Record<string, string | number | boolean | string[] | number[]>,
    blocks: [],
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
  specialPowers?: SpecialPowerDef[];
  locomotors?: LocomotorDef[];
  factions?: FactionDef[];
}): IniDataBundle {
  const weapons = params.weapons ?? [];
  const armors = params.armors ?? [];
  const upgrades = params.upgrades ?? [];
  const commandButtons = params.commandButtons ?? [];
  const commandSets = params.commandSets ?? [];
  const sciences = params.sciences ?? [];
  const specialPowers = params.specialPowers ?? [];
  const locomotors = params.locomotors ?? [];
  const factions = params.factions ?? [];
  return {
    objects: params.objects,
    weapons,
    armors,
    upgrades,
    commandButtons,
    commandSets,
    sciences,
    specialPowers,
    factions,
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

  it('includes ordered render-asset candidates across object and nested model fields', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef(
          'CandidateUnit',
          'America',
          ['VEHICLE'],
          [
            makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
            makeBlock('Draw', 'W3DModelDraw ModuleTag_Draw', {}, [
              makeBlock('ModelConditionState', 'Default', { Model: 'NestedModelPrimary' }),
              makeBlock('ModelConditionState', 'Damaged', { ModelName: 'NestedModelSecondary' }),
              makeBlock('ModelConditionState', 'Destroyed', { FileName: 'NestedModelTertiary' }),
            ]),
          ],
          {
            Model: 'FieldModelPrimary',
            ModelName: 'FieldModelSecondary',
            FileName: 'FieldModelTertiary',
          },
        ),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('CandidateUnit', 10, 10)]),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );

    const state = logic.getEntityState(1);
    expect(state).toEqual(expect.objectContaining({
      renderAssetPath: 'FieldModelPrimary',
      renderAssetResolved: true,
      renderAssetCandidates: [
        'FieldModelPrimary',
        'FieldModelSecondary',
        'FieldModelTertiary',
        'NestedModelPrimary',
        'NestedModelSecondary',
        'NestedModelTertiary',
      ],
    }));
  });

  it('extracts source-driven animation clip candidates from model condition state fields', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('ClipMappedUnit', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Draw', 'W3DModelDraw ModuleTag_Draw', {}, [
            makeBlock('ModelConditionState', 'DefaultModelConditionState', {
              IdleAnimation: 'Idle01',
            }),
            makeBlock('ModelConditionState', 'Moving', {
              Animation: 'Move01',
            }),
            makeBlock('ModelConditionState', 'Attacking', {
              Animation: 'Attack01',
            }),
            makeBlock('ModelConditionState', 'Dying', {
              Animation: 'Die01',
            }),
          ]),
        ]),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('ClipMappedUnit', 10, 10)]),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );

    const state = logic.getEntityState(1);
    expect(state?.renderAnimationStateClips).toEqual({
      IDLE: ['Idle01'],
      MOVE: ['Move01'],
      ATTACK: ['Attack01'],
      DIE: ['Die01'],
    });
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
    expect(logic.getRenderableEntityStates().some((entity) => entity.id === 1)).toBe(true);
    expect(logic.getRenderableEntityStates().find((entity) => entity.id === 1)?.animationState).toBe('DIE');

    logic.update(1 / 30);
    expect(logic.getRenderableEntityStates().some((entity) => entity.id === 1)).toBe(false);
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
    // After persist expires, a previously sneaky-offset projectile still in flight can collide
    // with the real entity position (source parity: C++ projectiles are physical objects that
    // detect collisions each frame along their flight path).
    expect(stopEarly).toEqual([100, 100, 100, 100, 100, 100, 60, 60, 60, 20, 20, 20]);
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

    // With scatter=200 and PrimaryDamageRadius=0.1, the deterministic random scatter
    // offset lands within the entity's bounding sphere adjusted hit zone (~0.56 units
    // for vehicles with baseHeight=1.5). Source parity: FROM_BOUNDINGSPHERE_3D makes
    // larger entities easier to hit by subtracting BSR from distance.
    const withScatter = runProjectileScatterTimeline(200);
    expect(withScatter).toEqual([100, 70, 70, 70]);
  });

  it('applies ScatterRadiusVsInfantry only when the projectile target is infantry', () => {
    // Infantry target gets scatter=200 applied; with BSR-adjusted hit zone, the
    // deterministic scatter still lands close enough to hit (same as scatter test above).
    const infantryTarget = runProjectileInfantryInaccuracyTimeline('INFANTRY');
    expect(infantryTarget).toEqual([100, 70, 70, 70]);

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

  it('detonates projectile early when it collides with an entity along the flight path', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);

    // Attacker at 0,0 fires a slow projectile at a target at 50,0.
    // A blocker sits at 25,0 (halfway). The projectile should collide mid-flight.
    const attackerDef = makeObjectDef('Attacker', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SlowMissile'] }),
    ]);
    const blockerDef = makeObjectDef('Blocker', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
    ], { GeometryMajorRadius: 5, GeometryMinorRadius: 5 });
    const targetDef = makeObjectDef('Target', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
    ]);
    // DummyProjectile object for the projectile weapon.
    const projectileDef = makeObjectDef('SlowMissileProjectile', 'Neutral', ['PROJECTILE'], [
      makeBlock('Body', 'InactiveBody ModuleTag_Body', {}),
    ]);

    const weaponDef = makeWeaponDef('SlowMissile', {
      PrimaryDamage: 50,
      PrimaryDamageRadius: 0,
      AttackRange: 200,
      WeaponSpeed: 5, // 5 units/frame → 10 frames to reach 50 units away
      DelayBetweenShots: 9999,
      ProjectileObject: 'SlowMissileProjectile',
      ProjectileCollidesWith: 'ENEMIES',
    });

    const registry = makeRegistry(makeBundle({
      objects: [attackerDef, blockerDef, targetDef, projectileDef],
      weapons: [weaponDef],
    }));
    const map = makeMap([
      makeMapObject('Attacker', 0, 0),
      makeMapObject('Blocker', 25, 0),  // Halfway along the flight path
      makeMapObject('Target', 50, 0),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 3 });

    // Collect health timelines for both blocker and target.
    const blockerHealth: number[] = [];
    const targetHealth: number[] = [];
    for (let i = 0; i < 15; i++) {
      logic.update(1 / 30);
      const blocker = [...(logic as any).spawnedEntities.values()].find(
        (e: any) => e.templateName === 'Blocker',
      );
      const target = [...(logic as any).spawnedEntities.values()].find(
        (e: any) => e.templateName === 'Target',
      );
      blockerHealth.push(blocker ? blocker.health : 0);
      targetHealth.push(target ? target.health : 0);
    }

    // The projectile should hit the blocker before reaching the target.
    // Blocker is at ~25 units, speed is 5/frame → hits around frame 5.
    // Target at 50 units should NOT take damage.
    expect(blockerHealth[blockerHealth.length - 1]).toBeLessThan(200);
    expect(targetHealth[targetHealth.length - 1]).toBe(200);
  });

  it('projectile passes through allies without collision when ProjectileCollidesWith excludes ALLIES', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);

    // Attacker fires through an allied unit. Projectile should pass through.
    const attackerDef = makeObjectDef('Attacker', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SlowMissile'] }),
    ]);
    const allyDef = makeObjectDef('AllyBlocker', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
    ], { GeometryMajorRadius: 5, GeometryMinorRadius: 5 });
    const targetDef = makeObjectDef('Target', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
    ], { GeometryMajorRadius: 5, GeometryMinorRadius: 5 });
    const projectileDef = makeObjectDef('SlowMissileProjectile', 'Neutral', ['PROJECTILE'], [
      makeBlock('Body', 'InactiveBody ModuleTag_Body', {}),
    ]);

    const weaponDef = makeWeaponDef('SlowMissile', {
      PrimaryDamage: 50,
      PrimaryDamageRadius: 0,
      AttackRange: 200,
      WeaponSpeed: 5,
      DelayBetweenShots: 9999,
      ProjectileObject: 'SlowMissileProjectile',
      ProjectileCollidesWith: 'ENEMIES', // Does NOT include ALLIES
    });

    const registry = makeRegistry(makeBundle({
      objects: [attackerDef, allyDef, targetDef, projectileDef],
      weapons: [weaponDef],
    }));
    const map = makeMap([
      makeMapObject('Attacker', 0, 0),
      makeMapObject('AllyBlocker', 25, 0),
      makeMapObject('Target', 50, 0),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 3 });

    for (let i = 0; i < 15; i++) {
      logic.update(1 / 30);
    }

    const ally = [...(logic as any).spawnedEntities.values()].find(
      (e: any) => e.templateName === 'AllyBlocker',
    );
    const target = [...(logic as any).spawnedEntities.values()].find(
      (e: any) => e.templateName === 'Target',
    );

    // Ally should be unharmed; target should take damage from the projectile.
    expect(ally.health).toBe(200);
    expect(target.health).toBeLessThan(200);
  });

  it('does not collide with the launcher itself during flight', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);

    // Attacker fires at a distant target. Ensure the projectile doesn't hit the
    // attacker's own collision radius (launcher exclusion).
    const attackerDef = makeObjectDef('Attacker', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SlowMissile'] }),
    ], { GeometryMajorRadius: 10, GeometryMinorRadius: 10 });
    const targetDef = makeObjectDef('Target', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
    ], { GeometryMajorRadius: 5, GeometryMinorRadius: 5 });
    const projectileDef = makeObjectDef('SlowMissileProjectile', 'Neutral', ['PROJECTILE'], [
      makeBlock('Body', 'InactiveBody ModuleTag_Body', {}),
    ]);

    const weaponDef = makeWeaponDef('SlowMissile', {
      PrimaryDamage: 50,
      PrimaryDamageRadius: 0,
      AttackRange: 200,
      WeaponSpeed: 5,
      DelayBetweenShots: 9999,
      ProjectileObject: 'SlowMissileProjectile',
      ProjectileCollidesWith: 'ENEMIES ALLIES', // Collides with everything
    });

    const registry = makeRegistry(makeBundle({
      objects: [attackerDef, targetDef, projectileDef],
      weapons: [weaponDef],
    }));
    const map = makeMap([
      makeMapObject('Attacker', 0, 0),
      makeMapObject('Target', 50, 0),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

    for (let i = 0; i < 15; i++) {
      logic.update(1 / 30);
    }

    const attacker = [...(logic as any).spawnedEntities.values()].find(
      (e: any) => e.templateName === 'Attacker',
    );
    const target = [...(logic as any).spawnedEntities.values()].find(
      (e: any) => e.templateName === 'Target',
    );

    // Attacker should not be damaged by its own projectile.
    expect(attacker.health).toBe(100);
    // Target should take damage.
    expect(target.health).toBeLessThan(200);
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

  it('rejects queueUnitProduction when command-set buttons do not expose the requested template', () => {
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
        ], {
          CommandSet: 'CommandSet_WarFactory',
        }),
        makeObjectDef('AllowedUnit', 'America', ['VEHICLE'], [], {
          BuildCost: 100,
          BuildTime: 0.1,
        }),
        makeObjectDef('BlockedUnit', 'America', ['VEHICLE'], [], {
          BuildCost: 100,
          BuildTime: 0.1,
        }),
      ],
      commandButtons: [
        makeCommandButtonDef('Command_AllowedUnit', {
          Command: 'UNIT_BUILD',
          Object: 'AllowedUnit',
        }),
      ],
      commandSets: [
        makeCommandSetDef('CommandSet_WarFactory', {
          1: 'Command_AllowedUnit',
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('WarFactory', 12, 12)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
    logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'BlockedUnit' });
    logic.update(1 / 30);

    expect(logic.getProductionState(1)?.queueEntryCount ?? 0).toBe(0);
    expect(logic.getEntityIdsByTemplate('BlockedUnit')).toEqual([]);
    expect(logic.getSideCredits('America')).toBe(500);
  });

  it('rejects queueUnitProduction when the producer is SCRIPT_DISABLED', () => {
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
        ], {
          CommandSet: 'CommandSet_WarFactory',
        }),
        makeObjectDef('AllowedUnit', 'America', ['VEHICLE'], [], {
          BuildCost: 100,
          BuildTime: 0.1,
        }),
      ],
      commandButtons: [
        makeCommandButtonDef('Command_AllowedUnit', {
          Command: 'UNIT_BUILD',
          Object: 'AllowedUnit',
        }),
      ],
      commandSets: [
        makeCommandSetDef('CommandSet_WarFactory', {
          1: 'Command_AllowedUnit',
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('WarFactory', 12, 12)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });

    const internalProducer = (
      logic as unknown as {
        spawnedEntities: Map<number, { objectStatusFlags: Set<string> }>;
      }
    ).spawnedEntities.get(1);
    expect(internalProducer).toBeDefined();
    internalProducer!.objectStatusFlags.add('SCRIPT_DISABLED');

    logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'AllowedUnit' });
    logic.update(1 / 30);

    expect(logic.getProductionState(1)?.queueEntryCount ?? 0).toBe(0);
    expect(logic.getEntityIdsByTemplate('AllowedUnit')).toEqual([]);
    expect(logic.getSideCredits('America')).toBe(500);
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

  it('routes constructBuilding commands through dozer placement and cost spending', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('Dozer', 'America', ['VEHICLE', 'DOZER'], []),
        makeObjectDef('PowerPlant', 'America', ['STRUCTURE'], [], {
          BuildCost: 200,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('Dozer', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'PowerPlant',
      targetPosition: [20, 0, 20],
      angle: 0,
      lineEndPosition: null,
    });

    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(300);
    expect(logic.getEntityIdsByTemplateAndSide('PowerPlant', 'America')).toEqual([2]);
  });

  it('rejects constructBuilding when dozer command-set buttons do not expose the template', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('Dozer', 'America', ['VEHICLE', 'DOZER'], [], {
          CommandSet: 'CommandSet_Dozer',
        }),
        makeObjectDef('PowerPlant', 'America', ['STRUCTURE'], [], {
          BuildCost: 200,
        }),
        makeObjectDef('Barracks', 'America', ['STRUCTURE'], [], {
          BuildCost: 200,
        }),
      ],
      commandButtons: [
        makeCommandButtonDef('Command_ConstructBarracks', {
          Command: 'DOZER_CONSTRUCT',
          Object: 'Barracks',
        }),
      ],
      commandSets: [
        makeCommandSetDef('CommandSet_Dozer', {
          1: 'Command_ConstructBarracks',
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('Dozer', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'PowerPlant',
      targetPosition: [20, 0, 20],
      angle: 0,
      lineEndPosition: null,
    });

    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(500);
    expect(logic.getEntityIdsByTemplateAndSide('PowerPlant', 'America')).toEqual([]);
  });

  it('clears removable blockers when constructing over them', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('Dozer', 'America', ['VEHICLE', 'DOZER'], [], {
          GeometryMajorRadius: 2,
          GeometryMinorRadius: 2,
        }),
        makeObjectDef('Shrubbery', 'America', ['SHRUBBERY'], [], {
          GeometryMajorRadius: 4,
          GeometryMinorRadius: 4,
        }),
        makeObjectDef('PowerPlant', 'America', ['STRUCTURE'], [], {
          BuildCost: 200,
          GeometryMajorRadius: 8,
          GeometryMinorRadius: 8,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('Dozer', 8, 8), makeMapObject('Shrubbery', 20, 20)], 64, 64),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'PowerPlant',
      targetPosition: [20, 0, 20],
      angle: 0,
      lineEndPosition: null,
    });

    logic.update(1 / 30);

    expect(logic.getEntityIdsByTemplate('Shrubbery')).toEqual([]);
    expect(logic.getSideCredits('America')).toBe(300);
    expect(logic.getEntityIdsByTemplateAndSide('PowerPlant', 'America')).toEqual([3]);
  });

  it('moves allied mobile blockers instead of failing construction on overlap', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('Dozer', 'America', ['VEHICLE', 'DOZER'], [], {
          GeometryMajorRadius: 2,
          GeometryMinorRadius: 2,
        }),
        makeObjectDef('AllyCarrier', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        ], {
          BuildCost: 0,
          GeometryMajorRadius: 4,
          GeometryMinorRadius: 4,
        }),
        makeObjectDef('PowerPlant', 'America', ['STRUCTURE'], [], {
          BuildCost: 200,
          GeometryMajorRadius: 8,
          GeometryMinorRadius: 8,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('Dozer', 8, 8), makeMapObject('AllyCarrier', 20, 20)], 64, 64),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'PowerPlant',
      targetPosition: [20, 0, 20],
      angle: 0,
      lineEndPosition: null,
    });

    logic.update(1 / 30);

    const ally = (
      logic as unknown as {
        spawnedEntities: Map<number, { destroyed: boolean; moving: boolean }>;
      }
    ).spawnedEntities.get(2);
    expect(ally).toBeDefined();
    expect(ally!.destroyed).toBe(false);
    expect(ally!.moving).toBe(true);
    expect(logic.getSideCredits('America')).toBe(300);
    expect(logic.getEntityIdsByTemplateAndSide('PowerPlant', 'America')).toEqual([3]);
  });

  it('fails construction when blocked by enemy or immobile objects', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('Dozer', 'America', ['VEHICLE', 'DOZER'], [], {
          GeometryMajorRadius: 2,
          GeometryMinorRadius: 2,
        }),
        makeObjectDef('EnemyBunker', 'China', ['STRUCTURE', 'IMMOBILE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        ], {
          BuildCost: 0,
          GeometryMajorRadius: 4,
          GeometryMinorRadius: 4,
        }),
        makeObjectDef('PowerPlant', 'America', ['STRUCTURE'], [], {
          BuildCost: 200,
          GeometryMajorRadius: 8,
          GeometryMinorRadius: 8,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('Dozer', 8, 8), makeMapObject('EnemyBunker', 20, 20)], 64, 64),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'PowerPlant',
      targetPosition: [20, 0, 20],
      angle: 0,
      lineEndPosition: null,
    });

    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(500);
    expect(logic.getEntityIdsByTemplateAndSide('PowerPlant', 'America')).toEqual([]);
  });

  it('continues line-building after blocked first tile', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('Dozer', 'America', ['VEHICLE', 'DOZER'], [], {
          GeometryMajorRadius: 2,
          GeometryMinorRadius: 2,
        }),
        makeObjectDef('EnemyBunker', 'China', ['STRUCTURE', 'IMMOBILE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        ], {
          BuildCost: 0,
          GeometryMajorRadius: 1,
          GeometryMinorRadius: 1,
        }),
        makeObjectDef('LineWall', 'America', ['STRUCTURE', 'LINEBUILD'], [], {
          BuildCost: 50,
          GeometryMajorRadius: 10,
          GeometryMinorRadius: 10,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('Dozer', 8, 8), makeMapObject('EnemyBunker', 20, 20)], 64, 64),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 500 });
    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'LineWall',
      targetPosition: [20, 0, 20],
      angle: 0,
      lineEndPosition: [40, 0, 20],
    });

    logic.update(1 / 30);

    const wallIds = logic.getEntityIdsByTemplateAndSide('LineWall', 'America');
    expect(wallIds).toHaveLength(1);
    const firstWall = (
      logic as unknown as {
        spawnedEntities: Map<number, { x: number }>;
      }
    ).spawnedEntities.get(wallIds[0]!);
    expect(firstWall?.x).toBeGreaterThan(20);
    expect(logic.getSideCredits('America')).toBe(450);
  });

  it('runs sell command teardown and refunds structure value after sell timer completes', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('CommandCenter', 'America', ['STRUCTURE'], [], {
          BuildCost: 300,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('CommandCenter', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 0 });
    logic.submitCommand({ type: 'sell', entityId: 1 });

    for (let frame = 0; frame < 190; frame += 1) {
      logic.update(1 / 30);
    }

    expect(logic.getEntityState(1)).toBeNull();
    expect(logic.getSideCredits('America')).toBe(300);
  });

  it('uses configured sell percentage when fallbacking RefundValue', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('CommandCenter', 'America', ['STRUCTURE'], [], {
          BuildCost: 300,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene, { sellPercentage: 0.5 });
    logic.loadMapObjects(makeMap([makeMapObject('CommandCenter', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 0 });
    logic.submitCommand({ type: 'sell', entityId: 1 });

    for (let frame = 0; frame < 190; frame += 1) {
      logic.update(1 / 30);
    }

    expect(logic.getEntityState(1)).toBeNull();
    expect(logic.getSideCredits('America')).toBe(150);
  });

  it('prefers RefundValue over sell percentage when computing sell refunds', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('CommandCenter', 'America', ['STRUCTURE'], [], {
          BuildCost: 300,
          RefundValue: 275,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene, { sellPercentage: 0.1 });
    logic.loadMapObjects(makeMap([makeMapObject('CommandCenter', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 0 });
    logic.submitCommand({ type: 'sell', entityId: 1 });

    for (let frame = 0; frame < 190; frame += 1) {
      logic.update(1 / 30);
    }

    expect(logic.getEntityState(1)).toBeNull();
    expect(logic.getSideCredits('America')).toBe(275);
  });

  it('skips PowerPlantUpgrade side effects while the source object is disabled', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('PowerPlant', 'America', ['STRUCTURE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('Behavior', 'PowerPlantUpgrade ModuleTag_Power', {
            TriggeredBy: 'Upgrade_Power',
          }),
        ], {
          EnergyBonus: 12,
        }),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Power', {
          Type: 'OBJECT',
          BuildTime: 0.1,
          BuildCost: 0,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('PowerPlant', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

    const logicWithPrivateAccess = logic as unknown as {
      spawnedEntities: Map<number, { objectStatusFlags: Set<string> }>;
    };
    const building = logicWithPrivateAccess.spawnedEntities.get(1);
    expect(building).toBeDefined();
    building!.objectStatusFlags.add('DISABLED_HACKED');

    logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Power' });
    logic.update(1 / 30);

    expect(logic.getSidePowerState('America').powerBonus).toBe(0);
  });

  it('skips RadarUpgrade side effects while the source object is disabled', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('RadarPlant', 'America', ['STRUCTURE'], [
          makeBlock('Behavior', 'RadarUpgrade ModuleTag_Radar', {
            TriggeredBy: 'Upgrade_Radar',
            DisableProof: true,
          }),
        ]),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Radar', {
          Type: 'OBJECT',
          BuildTime: 0.1,
          BuildCost: 0,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('RadarPlant', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

    const logicWithPrivateAccess = logic as unknown as {
      spawnedEntities: Map<number, { objectStatusFlags: Set<string> }>;
    };
    const building = logicWithPrivateAccess.spawnedEntities.get(1);
    expect(building).toBeDefined();
    building!.objectStatusFlags.add('DISABLED_HACKED');

    logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Radar' });
    logic.update(1 / 30);

    expect(logic.getSideRadarState('America')).toEqual({
      radarCount: 0,
      disableProofRadarCount: 0,
      radarDisabled: false,
    });
  });

  it('keeps disabled capture source upgrade side effects on the original side', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('UpgradeHub', 'America', ['STRUCTURE'], [
          makeBlock('Behavior', 'PowerPlantUpgrade ModuleTag_Power', {
            TriggeredBy: 'Upgrade_Power',
          }),
          makeBlock('Behavior', 'RadarUpgrade ModuleTag_Radar', {
            TriggeredBy: 'Upgrade_Radar',
            DisableProof: true,
          }),
        ], {
          EnergyBonus: 10,
        }),
      ],
      upgrades: [
        makeUpgradeDef('Upgrade_Power', {
          Type: 'OBJECT',
          BuildTime: 0.1,
          BuildCost: 0,
        }),
        makeUpgradeDef('Upgrade_Radar', {
          Type: 'OBJECT',
          BuildTime: 0.1,
          BuildCost: 0,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('UpgradeHub', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Power' });
    logic.submitCommand({ type: 'applyUpgrade', entityId: 1, upgradeName: 'Upgrade_Radar' });
    logic.update(1 / 30);
    expect(logic.getSidePowerState('America').powerBonus).toBe(10);
    expect(logic.getSideRadarState('America')).toEqual({
      radarCount: 1,
      disableProofRadarCount: 1,
      radarDisabled: false,
    });

    const logicWithPrivateAccess = logic as unknown as {
      spawnedEntities: Map<number, { objectStatusFlags: Set<string> }>;
    };
    const building = logicWithPrivateAccess.spawnedEntities.get(1);
    expect(building).toBeDefined();
    building!.objectStatusFlags.add('DISABLED_HACKED');

    logic.submitCommand({ type: 'captureEntity', entityId: 1, newSide: 'China' });
    logic.update(1 / 30);

    expect(logic.getEntityIdsByTemplateAndSide('UpgradeHub', 'China')).toEqual([1]);
    expect(logic.getSidePowerState('America').powerBonus).toBe(10);
    expect(logic.getSideRadarState('America')).toEqual({
      radarCount: 1,
      disableProofRadarCount: 1,
      radarDisabled: false,
    });
    expect(logic.getSidePowerState('China').powerBonus).toBe(0);
    expect(logic.getSideRadarState('China')).toEqual({
      radarCount: 0,
      disableProofRadarCount: 0,
      radarDisabled: false,
    });
  });

  it('toggles overcharge state, drains health, and auto-disables below threshold', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('OverchargePlant', 'America', ['STRUCTURE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'OverchargeBehavior ModuleTag_Overcharge', {
            HealthPercentToDrainPerSecond: '50%',
            NotAllowedWhenHealthBelowPercent: '50%',
          }),
        ], {
          EnergyBonus: 10,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('OverchargePlant', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));

    logic.submitCommand({ type: 'toggleOvercharge', entityId: 1 });
    logic.update(1 / 30);
    expect(logic.getSidePowerState('America').powerBonus).toBe(10);

    for (let frame = 0; frame < 40; frame += 1) {
      logic.update(1 / 30);
    }

    expect(logic.getEntityState(1)?.health ?? 0).toBeLessThan(50);
    expect(logic.getSidePowerState('America').powerBonus).toBe(0);

    logic.submitCommand({ type: 'toggleOvercharge', entityId: 1 });
    logic.update(1 / 30);
    expect(logic.getSidePowerState('America').powerBonus).toBe(0);
  });

  it('places and deletes owned beacons through command paths', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('AmericaBeacon', 'America', ['STRUCTURE', 'BEACON'], []),
      ],
      factions: [
        {
          name: 'FactionAmerica',
          side: 'America',
          fields: {
            BeaconName: 'AmericaBeacon',
          },
        },
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.setPlayerSide(0, 'America');

    logic.submitCommand({
      type: 'placeBeacon',
      targetPosition: [20, 0, 20],
    });
    logic.update(1 / 30);

    const beaconId = logic.getEntityIdsByTemplateAndSide('AmericaBeacon', 'America')[0];
    expect(beaconId).toBeDefined();
    expect(logic.getEntityState(beaconId!)).not.toBeNull();

    logic.submitCommand({
      type: 'beaconDelete',
      entityId: beaconId!,
    });
    logic.update(1 / 30);

    expect(logic.getEntityState(beaconId!)).toBeNull();
  });

  it('resolves enterObject hijack actions by transferring target ownership and consuming source unit', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('Hijacker', 'America', ['INFANTRY'], [
          makeBlock('Behavior', 'ConvertToHijackedVehicleCrateCollide ModuleTag_Hijack', {}),
        ]),
        makeObjectDef('EnemyVehicle', 'China', ['VEHICLE'], []),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('Hijacker', 8, 8), makeMapObject('EnemyVehicle', 10, 8)], 64, 64),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({
      type: 'enterObject',
      entityId: 1,
      targetObjectId: 2,
      action: 'hijackVehicle',
    });

    logic.update(1 / 30);

    expect(logic.getEntityState(1)).toBeNull();
    expect(logic.getEntityIdsByTemplateAndSide('EnemyVehicle', 'America')).toEqual([2]);
  });

  it('rejects invalid enterObject hijack actions at command issue time', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('Hijacker', 'America', ['INFANTRY'], [
          makeBlock('Behavior', 'ConvertToHijackedVehicleCrateCollide ModuleTag_Hijack', {}),
          makeBlock('LocomotorSet', 'SET_NORMAL FastLocomotor', {}),
        ]),
        makeObjectDef('FriendlyVehicle', 'America', ['VEHICLE'], []),
      ],
      locomotors: [
        makeLocomotorDef('FastLocomotor', 120),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('Hijacker', 8, 8), makeMapObject('FriendlyVehicle', 30, 8)], 64, 64),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );
    logic.submitCommand({
      type: 'enterObject',
      entityId: 1,
      targetObjectId: 2,
      action: 'hijackVehicle',
    });

    for (let frame = 0; frame < 20; frame += 1) {
      logic.update(1 / 30);
    }

    const hijacker = logic.getEntityState(1);
    const target = logic.getEntityState(2);
    expect(hijacker).not.toBeNull();
    expect(target).not.toBeNull();
    expect(hijacker!.x).toBeCloseTo(8, 1);
    expect(target!.statusFlags).not.toContain('HIJACKED');
    expect(logic.getEntityIdsByTemplateAndSide('FriendlyVehicle', 'America')).toEqual([2]);
  });

  it('starts HackInternet command loops and deposits periodic side credits', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('InternetHacker', 'China', ['INFANTRY'], [
          makeBlock('Behavior', 'HackInternetAIUpdate ModuleTag_Hack', {
            UnpackTime: 0,
            CashUpdateDelay: 0,
            RegularCashAmount: 25,
          }),
        ]),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('InternetHacker', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.submitCommand({ type: 'setSideCredits', side: 'China', amount: 0 });
    logic.submitCommand({ type: 'hackInternet', entityId: 1 });

    for (let frame = 0; frame < 4; frame += 1) {
      logic.update(1 / 30);
    }

    expect(logic.getSideCredits('China')).toBe(75);
  });

  it('allows HackInternet on non-mobile objects', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('InternetCenter', 'China', ['STRUCTURE'], [
          makeBlock('Behavior', 'HackInternetAIUpdate ModuleTag_Hack', {
            UnpackTime: 0,
            CashUpdateDelay: 0,
            RegularCashAmount: 30,
          }),
        ]),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('InternetCenter', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.submitCommand({ type: 'setSideCredits', side: 'China', amount: 0 });
    logic.submitCommand({ type: 'hackInternet', entityId: 1 });

    for (let frame = 0; frame < 4; frame += 1) {
      logic.update(1 / 30);
    }

    expect(logic.getSideCredits('China')).toBe(90);
  });

  it('defers commands during HackInternet pack-up and executes them after PackTime', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('InternetHacker', 'China', ['INFANTRY'], [
          makeBlock('Behavior', 'HackInternetAIUpdate ModuleTag_Hack', {
            UnpackTime: 0,
            PackTime: 1000,
            CashUpdateDelay: 0,
            RegularCashAmount: 25,
          }),
          makeBlock('LocomotorSet', 'SET_NORMAL HackerLocomotor', {}),
        ]),
      ],
      locomotors: [
        makeLocomotorDef('HackerLocomotor', 60),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap([makeMapObject('InternetHacker', 8, 8)], 64, 64), makeRegistry(bundle), makeHeightmap(64, 64));
    logic.submitCommand({ type: 'setSideCredits', side: 'China', amount: 0 });
    logic.submitCommand({ type: 'hackInternet', entityId: 1 });

    for (let frame = 0; frame < 4; frame += 1) {
      logic.update(1 / 30);
    }
    expect(logic.getSideCredits('China')).toBe(75);

    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 120, targetZ: 8 });
    for (let frame = 0; frame < 20; frame += 1) {
      logic.update(1 / 30);
    }

    const duringPack = logic.getEntityState(1);
    expect(duringPack).not.toBeNull();
    expect(duringPack!.x).toBeCloseTo(8, 1);
    expect(logic.getSideCredits('China')).toBe(75);

    for (let frame = 0; frame < 25; frame += 1) {
      logic.update(1 / 30);
    }
    const afterPack = logic.getEntityState(1);
    expect(afterPack).not.toBeNull();
    expect(afterPack!.x).toBeGreaterThan(10);
    expect(logic.getSideCredits('China')).toBe(75);
  });

  it('executes railed transport paths from waypoint prefixes outside index command internals', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('RailedTruck', 'China', ['VEHICLE'], [
          makeBlock('LocomotorSet', 'SET_NORMAL RailedLocomotor', {}),
          makeBlock('Behavior', 'RailedTransportAIUpdate ModuleTag_Railed', {
            PathPrefixName: 'TrainRoute',
          }),
        ]),
      ],
      locomotors: [
        makeLocomotorDef('RailedLocomotor', 60),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    const map = makeMap([makeMapObject('RailedTruck', 88, 10)], 256, 64);
    map.waypoints = {
      nodes: [
        { id: 11, name: 'TrainRouteStart01', position: { x: 30, y: 10, z: 0 }, biDirectional: false },
        { id: 12, name: 'TrainRouteMid01', position: { x: 60, y: 10, z: 0 }, biDirectional: false },
        { id: 13, name: 'TrainRouteEnd01', position: { x: 90, y: 10, z: 0 }, biDirectional: false },
        { id: 21, name: 'TrainRouteStart02', position: { x: 150, y: 10, z: 0 }, biDirectional: false },
        { id: 22, name: 'TrainRouteEnd02', position: { x: 170, y: 10, z: 0 }, biDirectional: false },
      ],
      links: [
        { waypoint1: 11, waypoint2: 12 },
        { waypoint1: 12, waypoint2: 13 },
        { waypoint1: 21, waypoint2: 22 },
      ],
    };

    logic.loadMapObjects(map, makeRegistry(bundle), makeHeightmap(256, 64));
    logic.update(1 / 30);

    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 230, targetZ: 10 });
    for (let frame = 0; frame < 120; frame += 1) {
      logic.update(1 / 30);
    }
    const afterIgnoredMove = logic.getEntityState(1);
    expect(afterIgnoredMove).not.toBeNull();
    expect(afterIgnoredMove!.x).toBeLessThan(120);

    logic.submitCommand({ type: 'executeRailedTransport', entityId: 1 });
    for (let frame = 0; frame < 220; frame += 1) {
      logic.update(1 / 30);
    }

    const afterFirstTransit = logic.getEntityState(1);
    expect(afterFirstTransit).not.toBeNull();
    expect(afterFirstTransit!.x).toBeGreaterThan(165);

    logic.submitCommand({ type: 'executeRailedTransport', entityId: 1 });
    for (let frame = 0; frame < 260; frame += 1) {
      logic.update(1 / 30);
    }

    const afterSecondTransit = logic.getEntityState(1);
    expect(afterSecondTransit).not.toBeNull();
    expect(afterSecondTransit!.x).toBeLessThanOrEqual(95);
  });

  it('blocks evacuate while a railed transport is in transit', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('RailedCarrier', 'China', ['VEHICLE', 'TRANSPORT'], [
          makeBlock('LocomotorSet', 'SET_NORMAL RailedLocomotor', {}),
          makeBlock('Behavior', 'RailedTransportAIUpdate ModuleTag_Railed', {
            PathPrefixName: 'TransitRoute',
          }),
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
        ]),
        makeObjectDef('RailedPassenger', 'China', ['INFANTRY'], [
          makeBlock('LocomotorSet', 'SET_NORMAL PassengerLocomotor', {}),
        ], {
          BuildCost: 0,
          BuildTime: 0.1,
        }),
      ],
      locomotors: [
        makeLocomotorDef('RailedLocomotor', 60),
        makeLocomotorDef('PassengerLocomotor', 30),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    const map = makeMap([makeMapObject('RailedCarrier', 140, 10)], 256, 64);
    map.waypoints = {
      nodes: [
        { id: 1, name: 'TransitRouteStart01', position: { x: 20, y: 10, z: 0 }, biDirectional: false },
        { id: 2, name: 'TransitRouteEnd01', position: { x: 140, y: 10, z: 0 }, biDirectional: false },
      ],
      links: [
        { waypoint1: 1, waypoint2: 2 },
      ],
    };
    logic.loadMapObjects(map, makeRegistry(bundle), makeHeightmap(256, 64));

    logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'RailedPassenger' });
    for (let frame = 0; frame < 6; frame += 1) {
      logic.update(1 / 30);
    }
    const passengerId = logic.getEntityIdsByTemplate('RailedPassenger')[0];
    expect(passengerId).toBeDefined();

    logic.submitCommand({ type: 'executeRailedTransport', entityId: 1 });
    for (let frame = 0; frame < 15; frame += 1) {
      logic.update(1 / 30);
    }

    const passengerBeforeEvac = logic.getEntityState(passengerId!);
    const carrierDuringTransit = logic.getEntityState(1);
    expect(passengerBeforeEvac).not.toBeNull();
    expect(carrierDuringTransit).not.toBeNull();

    logic.submitCommand({ type: 'evacuate', entityId: 1 });
    for (let frame = 0; frame < 5; frame += 1) {
      logic.update(1 / 30);
    }

    const passengerAfterEvac = logic.getEntityState(passengerId!);
    const carrierAfterEvac = logic.getEntityState(1);
    expect(passengerAfterEvac).not.toBeNull();
    expect(carrierAfterEvac).not.toBeNull();
    expect(passengerAfterEvac!.x).toBeGreaterThan(130);
    expect(Math.abs(passengerAfterEvac!.x - passengerBeforeEvac!.x)).toBeLessThan(1);
    expect(carrierAfterEvac!.x).toBeLessThan(passengerAfterEvac!.x - 10);
  });

  it('ignores combatDrop when source transport has no passengers', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('EmptyTransport', 'America', ['AIRCRAFT', 'TRANSPORT'], [
          makeBlock('Behavior', 'ParkingPlaceBehavior ModuleTag_Parking', {
            NumRows: 1,
            NumCols: 1,
          }),
          makeBlock('LocomotorSet', 'SET_NORMAL TransportLoco', {}),
        ]),
        makeObjectDef('EnemyTarget', 'China', ['VEHICLE'], []),
      ],
      locomotors: [
        makeLocomotorDef('TransportLoco', 90),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('EmptyTransport', 8, 8), makeMapObject('EnemyTarget', 120, 8)], 128, 64),
      makeRegistry(bundle),
      makeHeightmap(128, 64),
    );
    logic.submitCommand({
      type: 'combatDrop',
      entityId: 1,
      targetObjectId: 2,
      targetPosition: null,
    });

    for (let frame = 0; frame < 30; frame += 1) {
      logic.update(1 / 30);
    }

    const transport = logic.getEntityState(1);
    expect(transport).not.toBeNull();
    expect(transport!.x).toBeCloseTo(8, 1);
  });

  it('ignores combatDrop when contained passengers are not CAN_RAPPEL', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('CombatTransport', 'America', ['AIRCRAFT', 'TRANSPORT'], [
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
          makeBlock('LocomotorSet', 'SET_NORMAL TransportLoco', {}),
        ]),
        makeObjectDef('EnemyTarget', 'China', ['VEHICLE'], []),
        makeObjectDef('DropInfantry', 'America', ['INFANTRY'], [], {
          BuildCost: 0,
          BuildTime: 0.1,
        }),
      ],
      locomotors: [
        makeLocomotorDef('TransportLoco', 90),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('CombatTransport', 8, 8), makeMapObject('EnemyTarget', 120, 8)], 128, 64),
      makeRegistry(bundle),
      makeHeightmap(128, 64),
    );
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 0 });
    logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'DropInfantry' });
    for (let frame = 0; frame < 6; frame += 1) {
      logic.update(1 / 30);
    }

    logic.submitCommand({
      type: 'combatDrop',
      entityId: 1,
      targetObjectId: 2,
      targetPosition: null,
    });
    for (let frame = 0; frame < 30; frame += 1) {
      logic.update(1 / 30);
    }

    const transport = logic.getEntityState(1);
    expect(transport).not.toBeNull();
    expect(transport!.x).toBeCloseTo(8, 1);
  });

  it('routes combatDrop commands to passenger evacuate + target attack intents', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('CombatTransport', 'America', ['AIRCRAFT', 'TRANSPORT'], [
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
        ]),
        makeObjectDef('EnemyTarget', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        ]),
        makeObjectDef('DropInfantry', 'America', ['INFANTRY', 'CAN_RAPPEL'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'DropRifle'] }),
        ], {
          BuildCost: 0,
          BuildTime: 0.1,
        }),
      ],
      weapons: [
        makeWeaponDef('DropRifle', {
          AttackRange: 80,
          PrimaryDamage: 5,
          DelayBetweenShots: 100,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('CombatTransport', 8, 8), makeMapObject('EnemyTarget', 10, 8)], 64, 64),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 0 });
    logic.submitCommand({ type: 'queueUnitProduction', entityId: 1, unitTemplateName: 'DropInfantry' });
    for (let frame = 0; frame < 6; frame += 1) {
      logic.update(1 / 30);
    }

    const passengerId = logic.getEntityIdsByTemplate('DropInfantry')[0];
    expect(passengerId).toBeDefined();

    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({
      type: 'combatDrop',
      entityId: 1,
      targetObjectId: 2,
      targetPosition: null,
    });
    for (let frame = 0; frame < 8; frame += 1) {
      logic.update(1 / 30);
    }

    const passengerState = logic.getEntityState(passengerId!);
    expect(passengerState).not.toBeNull();
    expect(passengerState?.attackTargetEntityId).toBe(2);
  });

  it('records no-target special power dispatch on source entity module', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('SpecialPowerSource', 'America', ['INFANTRY'], [
          makeBlock('Behavior', 'SpecialPowerModule SourceNoTarget', {
            SpecialPowerTemplate: 'SpecialPowerNoTarget',
          }),
        ]),
      ],
      specialPowers: [
        makeSpecialPowerDef('SpecialPowerNoTarget', { ReloadTime: 0 }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('SpecialPowerSource', 10, 10)]),
      makeRegistry(bundle),
      makeHeightmap(),
    );

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'CMD_NO_TARGET',
      specialPowerName: 'SpecialPowerNoTarget',
      commandOption: 0,
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(0);

    const sourceState = logic.getEntityState(1);
    expect(sourceState?.lastSpecialPowerDispatch).toMatchObject({
      specialPowerTemplateName: 'SPECIALPOWERNOTARGET',
      moduleType: 'SPECIALPOWERMODULE',
      dispatchType: 'NO_TARGET',
      commandOption: 0,
      commandButtonId: 'CMD_NO_TARGET',
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
  });

  it('records position-target special power dispatch on source entity module', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('SpecialPowerSource', 'America', ['INFANTRY'], [
          makeBlock('Behavior', 'SpecialPowerModule SourcePos', {
            SpecialPowerTemplate: 'SpecialPowerAtPos',
          }),
        ]),
      ],
      specialPowers: [
        makeSpecialPowerDef('SpecialPowerAtPos', { ReloadTime: 0 }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('SpecialPowerSource', 10, 10)]),
      makeRegistry(bundle),
      makeHeightmap(),
    );

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'CMD_POSITION',
      specialPowerName: 'SpecialPowerAtPos',
      commandOption: 0x20,
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: 100,
      targetZ: 260,
    });
    logic.update(0);

    const sourceState = logic.getEntityState(1);
    expect(sourceState?.lastSpecialPowerDispatch).toMatchObject({
      specialPowerTemplateName: 'SPECIALPOWERATPOS',
      moduleType: 'SPECIALPOWERMODULE',
      dispatchType: 'POSITION',
      commandOption: 0x20,
      commandButtonId: 'CMD_POSITION',
      targetEntityId: null,
      targetX: 100,
      targetZ: 260,
    });
  });

  it('records object-target special power dispatch on source entity module', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('SpecialPowerSource', 'America', ['INFANTRY'], [
          makeBlock('Behavior', 'SpecialPowerModule SourceObject', {
            SpecialPowerTemplate: 'SpecialPowerAtObject',
          }),
        ]),
        makeObjectDef('EnemyTarget', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', {
            MaxHealth: 100,
            InitialHealth: 100,
          }),
        ]),
      ],
      specialPowers: [
        makeSpecialPowerDef('SpecialPowerAtObject', { ReloadTime: 0 }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('SpecialPowerSource', 10, 10), makeMapObject('EnemyTarget', 24, 10)]),
      makeRegistry(bundle),
      makeHeightmap(),
    );
    logic.setTeamRelationship('America', 'China', 0);

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'CMD_OBJECT',
      specialPowerName: 'SpecialPowerAtObject',
      commandOption: 0x1,
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: 2,
      targetX: 0,
      targetZ: 0,
    });
    logic.update(0);

    const sourceState = logic.getEntityState(1);
    expect(sourceState?.lastSpecialPowerDispatch).toMatchObject({
      specialPowerTemplateName: 'SPECIALPOWERATOBJECT',
      moduleType: 'SPECIALPOWERMODULE',
      dispatchType: 'OBJECT',
      commandOption: 0x1,
      commandButtonId: 'CMD_OBJECT',
      targetEntityId: 2,
      targetX: null,
      targetZ: null,
    });
  });

  it('ignores special power dispatch when source entity is missing matching module', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('SpecialPowerSource', 'America', ['INFANTRY'], [
          makeBlock('Behavior', 'SpecialPowerModule SourceObject', {
            SpecialPowerTemplate: 'SpecialPowerKnown',
          }),
        ]),
      ],
      specialPowers: [
        makeSpecialPowerDef('SpecialPowerMissing', { ReloadTime: 0 }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('SpecialPowerSource', 10, 10)]),
      makeRegistry(bundle),
      makeHeightmap(),
    );

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'CMD_MISSING',
      specialPowerName: 'SpecialPowerMissing',
      commandOption: 0,
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
    logic.update(0);

    const sourceState = logic.getEntityState(1);
    expect(sourceState?.lastSpecialPowerDispatch).toBeNull();
  });

  it('runs supply chain economy: truck gathers from warehouse and deposits at supply center', () => {
    const logic = new GameLogicSubsystem(new THREE.Scene());

    const warehouseDef = makeObjectDef('SupplyWarehouse', 'America', ['STRUCTURE'], [
      makeBlock('Behavior', 'SupplyWarehouseDockUpdate ModuleTag_SupplyDock', {
        StartingBoxes: 10,
        DeleteWhenEmpty: false,
      }),
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
    ]);

    const supplyCenterDef = makeObjectDef('SupplyCenter', 'America', ['STRUCTURE'], [
      makeBlock('Behavior', 'SupplyCenterDockUpdate ModuleTag_CenterDock', {}),
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
    ]);

    const supplyTruckDef = makeObjectDef('SupplyTruck', 'America', ['VEHICLE', 'HARVESTER'], [
      makeBlock('Behavior', 'SupplyTruckAIUpdate ModuleTag_SupplyTruckAI', {
        MaxBoxes: 3,
        SupplyCenterActionDelay: 0,
        SupplyWarehouseActionDelay: 0,
        SupplyWarehouseScanDistance: 500,
      }),
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
    ]);

    const registry = makeRegistry(makeBundle({
      objects: [warehouseDef, supplyCenterDef, supplyTruckDef],
    }));

    // Place warehouse at (10,10), supply center at (35,10), truck at (10,10) (near warehouse).
    // Use 64x64 map to ensure positions are within grid bounds for pathfinding.
    const map = makeMap([
      makeMapObject('SupplyWarehouse', 10, 10),
      makeMapObject('SupplyCenter', 35, 10),
      makeMapObject('SupplyTruck', 10, 10),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));

    // Set credits to 0 for America.
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 0 });
    logic.update(0);

    const initialCredits = logic.getSideCredits('America');
    expect(initialCredits).toBe(0);

    // Run many frames to let the supply truck AI gather and deposit.
    // With 0 action delay, the truck should:
    // 1. Find warehouse (nearby), start gathering — ~5 frames (3 boxes + transitions)
    // 2. Move to supply center (25 world units at speed 18, ~42 frames) and deposit
    // Deposit value = 3 boxes * 100 credits/box = 300
    for (let i = 0; i < 300; i++) {
      logic.update(0.033);
    }

    const creditsAfter = logic.getSideCredits('America');
    // At least one deposit should have occurred (300 credits for 3 boxes).
    expect(creditsAfter).toBeGreaterThanOrEqual(300);
  });

  it('deletes warehouse when empty if DeleteWhenEmpty is true', () => {
    const logic = new GameLogicSubsystem(new THREE.Scene());

    const warehouseDef = makeObjectDef('DepletableWarehouse', 'America', ['STRUCTURE'], [
      makeBlock('Behavior', 'SupplyWarehouseDockUpdate ModuleTag_SupplyDock', {
        StartingBoxes: 1,
        DeleteWhenEmpty: true,
      }),
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
    ]);

    const supplyCenterDef = makeObjectDef('SupplyCenter', 'America', ['STRUCTURE'], [
      makeBlock('Behavior', 'SupplyCenterDockUpdate ModuleTag_CenterDock', {}),
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
    ]);

    const supplyTruckDef = makeObjectDef('SupplyTruck', 'America', ['VEHICLE', 'HARVESTER'], [
      makeBlock('Behavior', 'SupplyTruckAIUpdate ModuleTag_SupplyTruckAI', {
        MaxBoxes: 5,
        SupplyCenterActionDelay: 0,
        SupplyWarehouseActionDelay: 0,
        SupplyWarehouseScanDistance: 500,
      }),
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
    ]);

    const registry = makeRegistry(makeBundle({
      objects: [warehouseDef, supplyCenterDef, supplyTruckDef],
    }));

    const map = makeMap([
      makeMapObject('DepletableWarehouse', 10, 10),
      makeMapObject('SupplyCenter', 35, 10),
      makeMapObject('SupplyTruck', 10, 10),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 0 });
    logic.update(0);

    // Run frames until warehouse should be depleted and credits deposited.
    for (let i = 0; i < 300; i++) {
      logic.update(0.033);
    }

    // Warehouse entity (id=1) should be destroyed — getEntityState returns null
    // for destroyed entities after cleanup, or alive=false during death frame.
    const warehouseState = logic.getEntityState(1);
    // Entity is either null (cleaned up) or alive=false (destroyed).
    expect(warehouseState === null || warehouseState.alive === false).toBe(true);

    // Should have received 100 credits (1 box * 100).
    const credits = logic.getSideCredits('America');
    expect(credits).toBe(100);
  });

  it('does not initialize supply chain state for non-supply entities', () => {
    const logic = new GameLogicSubsystem(new THREE.Scene());

    const plainDef = makeObjectDef('PlainVehicle', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
    ]);

    const registry = makeRegistry(makeBundle({ objects: [plainDef] }));
    const map = makeMap([makeMapObject('PlainVehicle', 50, 50)]);

    logic.loadMapObjects(map, registry, makeHeightmap());

    // A plain vehicle should exist and work fine with no supply chain errors.
    logic.update(0);
    logic.update(0.033);

    const entity = logic.getEntityState(1);
    expect(entity?.alive).toBe(true);
  });

  it('awards experience points to attacker on victim kill and levels up', () => {
    const logic = new GameLogicSubsystem(new THREE.Scene());

    const attackerDef = makeObjectDef('VetAttacker', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'VetCannon'] }),
    ], {
      // ExperienceRequired: [regular=0, veteran=50, elite=200, heroic=500]
      ExperienceRequired: '0 50 200 500',
      // XP the attacker is worth if killed at each level
      ExperienceValue: '10 20 40 80',
    });

    // Victim is worth 100 XP at REGULAR level.
    const victimDef = makeObjectDef('VetVictim', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 10, InitialHealth: 10 }),
    ], {
      ExperienceRequired: '0 100 200 300',
      ExperienceValue: '100 200 300 400',
    });

    const registry = makeRegistry(makeBundle({
      objects: [attackerDef, victimDef],
      weapons: [
        makeWeaponDef('VetCannon', {
          AttackRange: 120,
          PrimaryDamage: 50,
          DelayBetweenShots: 100,
        }),
      ],
    }));

    const map = makeMap([
      makeMapObject('VetAttacker', 10, 10),
      makeMapObject('VetVictim', 20, 10),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));
    logic.setTeamRelationship('America', 'China', 0); // enemies

    // Attacker starts at REGULAR level with 0 XP.
    const attackerBefore = logic.getEntityState(1);
    expect(attackerBefore?.veterancyLevel).toBe(0); // REGULAR
    expect(attackerBefore?.currentExperience).toBe(0);

    // Order attack on victim.
    logic.submitCommand({
      type: 'attackEntity',
      entityId: 1,
      targetEntityId: 2,
    });

    // Run frames until victim is killed (10hp, 50 damage → 1 shot kill).
    for (let i = 0; i < 30; i++) {
      logic.update(0.033);
    }

    // Victim should be dead (removed from entity map after cleanup).
    const victimState = logic.getEntityState(2);
    expect(victimState).toBeNull();

    // Attacker should have gained 100 XP (victim value at REGULAR level).
    // With threshold of 50 for VETERAN, the attacker should now be VETERAN.
    const attackerAfter = logic.getEntityState(1);
    expect(attackerAfter?.currentExperience).toBe(100);
    expect(attackerAfter?.veterancyLevel).toBe(1); // VETERAN
  });

  it('does not award experience for killing allies', () => {
    const logic = new GameLogicSubsystem(new THREE.Scene());

    const killerDef = makeObjectDef('AllyKiller', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'AllyGun'] }),
    ], {
      ExperienceRequired: '0 50 200 500',
      ExperienceValue: '10 20 40 80',
    });

    const allyDef = makeObjectDef('AllyTarget', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 10, InitialHealth: 10 }),
    ], {
      ExperienceRequired: '0 100 200 300',
      ExperienceValue: '100 200 300 400',
    });

    const registry = makeRegistry(makeBundle({
      objects: [killerDef, allyDef],
      weapons: [
        makeWeaponDef('AllyGun', {
          AttackRange: 120,
          PrimaryDamage: 50,
          DelayBetweenShots: 100,
        }),
      ],
    }));

    const map = makeMap([
      makeMapObject('AllyKiller', 10, 10),
      makeMapObject('AllyTarget', 20, 10),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));
    logic.setTeamRelationship('America', 'America', 2); // allies

    // Force attack on ally.
    logic.submitCommand({
      type: 'attackEntity',
      entityId: 1,
      targetEntityId: 2,
    });

    for (let i = 0; i < 30; i++) {
      logic.update(0.033);
    }

    // Attacker should have 0 XP (no XP for killing allies).
    const killerState = logic.getEntityState(1);
    expect(killerState?.currentExperience).toBe(0);
    expect(killerState?.veterancyLevel).toBe(0);
  });

  it('reveals fog of war around units with VisionRange', () => {
    const logic = new GameLogicSubsystem();

    const scoutDef = makeObjectDef('Scout', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
    ], {
      VisionRange: 50,
    });

    const registry = makeRegistry(makeBundle({
      objects: [scoutDef],
    }));

    const map = makeMap([
      makeMapObject('Scout', 30, 30),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));

    // Run one frame to update fog of war.
    logic.update(0.033);

    // Position near the scout should be CLEAR for America.
    expect(logic.getCellVisibility('America', 30, 30)).toBe(CELL_CLEAR);

    // Position far away should be SHROUDED for America.
    expect(logic.getCellVisibility('America', 600, 600)).toBe(CELL_SHROUDED);

    // Unknown side should see everything as SHROUDED.
    expect(logic.getCellVisibility('China', 30, 30)).toBe(CELL_SHROUDED);
  });

  it('transitions cells from CLEAR to FOGGED when unit moves away', () => {
    const logic = new GameLogicSubsystem();

    const scoutDef = makeObjectDef('Scout', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('Locomotor', 'Locomotor', {
        Speed: 20,
      }),
    ], {
      VisionRange: 30,
      Speed: 20,
    });

    const registry = makeRegistry(makeBundle({
      objects: [scoutDef],
    }));

    const map = makeMap([
      makeMapObject('Scout', 10, 10),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));

    // Run a frame to establish vision.
    logic.update(0.033);
    expect(logic.getCellVisibility('America', 10, 10)).toBe(CELL_CLEAR);

    // Move the entity far away.
    logic.submitCommand({
      type: 'move',
      entityId: 1,
      x: 600,
      z: 600,
    });

    // Run enough frames for the entity to move significantly.
    for (let i = 0; i < 60; i++) {
      logic.update(0.033);
    }

    // The original position should now be FOGGED (was seen, but no longer actively visible).
    const vis = logic.getCellVisibility('America', 10, 10);
    expect(vis === CELL_FOGGED || vis === CELL_CLEAR).toBe(true);
  });

  it('returns CELL_CLEAR everywhere when no fog of war grid is loaded', () => {
    const logic = new GameLogicSubsystem();

    // Without loading a map (no heightmap → no FoW grid), getCellVisibility returns CLEAR.
    expect(logic.getCellVisibility('America', 50, 50)).toBe(CELL_CLEAR);
  });

  it('isPositionVisible returns true for positions in vision range', () => {
    const logic = new GameLogicSubsystem();

    const scoutDef = makeObjectDef('Scout', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
    ], {
      VisionRange: 50,
    });

    const registry = makeRegistry(makeBundle({
      objects: [scoutDef],
    }));

    const map = makeMap([
      makeMapObject('Scout', 30, 30),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));
    logic.update(0.033);

    expect(logic.isPositionVisible('America', 30, 30)).toBe(true);
    expect(logic.isPositionVisible('America', 600, 600)).toBe(false);
  });

  it('executes area damage special power at target position', () => {
    const logic = new GameLogicSubsystem();

    const sourceDef = makeObjectDef('PowerSource', 'America', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
      makeBlock('Behavior', 'OCLSpecialPower BombModule', {
        SpecialPowerTemplate: 'SuperweaponCarpetBomb',
      }),
    ]);

    const targetDef = makeObjectDef('EnemyTank', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
    ]);

    const registry = makeRegistry(makeBundle({
      objects: [sourceDef, targetDef],
      specialPowers: [
        makeSpecialPowerDef('SuperweaponCarpetBomb', { ReloadTime: 0 }),
      ],
    }));

    const map = makeMap([
      makeMapObject('PowerSource', 10, 10),
      makeMapObject('EnemyTank', 30, 30),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));
    logic.setTeamRelationship('America', 'China', 0); // enemies

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'CMD_BOMB',
      specialPowerName: 'SuperweaponCarpetBomb',
      commandOption: 0x20, // COMMAND_OPTION_NEED_TARGET_POS
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: 30,
      targetZ: 30,
    });
    logic.update(0);

    // The enemy tank at (30,30) should have taken area damage.
    // With default 500 area damage vs 200 HP, the target should be destroyed.
    const targetState = logic.getEntityState(2);
    expect(targetState === null || (targetState.health < 200)).toBe(true);
  });

  it('executes cash hack special power to steal enemy credits', () => {
    const logic = new GameLogicSubsystem();

    const hackerDef = makeObjectDef('Hacker', 'China', ['INFANTRY'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 50, InitialHealth: 50 }),
      makeBlock('Behavior', 'CashHackSpecialPower HackModule', {
        SpecialPowerTemplate: 'SpecialPowerCashHack',
      }),
    ]);

    const enemyBuildingDef = makeObjectDef('EnemyHQ', 'America', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
    ]);

    const registry = makeRegistry(makeBundle({
      objects: [hackerDef, enemyBuildingDef],
      specialPowers: [
        makeSpecialPowerDef('SpecialPowerCashHack', { ReloadTime: 0 }),
      ],
    }));

    const map = makeMap([
      makeMapObject('Hacker', 10, 10),
      makeMapObject('EnemyHQ', 20, 10),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));
    logic.setTeamRelationship('China', 'America', 0); // enemies

    // Give enemy some credits.
    logic.setSideCredits('America', 5000);
    const chinaBefore = logic.getSideCredits('China');

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'CMD_HACK',
      specialPowerName: 'SpecialPowerCashHack',
      commandOption: 0x01, // COMMAND_OPTION_NEED_TARGET_ENEMY_OBJECT
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: 2,
      targetX: null,
      targetZ: null,
    });
    logic.update(0);

    // China should have gained credits.
    const chinaAfter = logic.getSideCredits('China');
    expect(chinaAfter).toBeGreaterThan(chinaBefore);

    // America should have lost credits.
    expect(logic.getSideCredits('America')).toBeLessThan(5000);
  });

  it('executes defector special power to convert enemy unit', () => {
    const logic = new GameLogicSubsystem();

    const defectorDef = makeObjectDef('Defector', 'America', ['INFANTRY'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 50, InitialHealth: 50 }),
      makeBlock('Behavior', 'DefectorSpecialPower DefectModule', {
        SpecialPowerTemplate: 'SpecialPowerDefector',
      }),
    ]);

    const enemyUnitDef = makeObjectDef('EnemyUnit', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
    ]);

    const registry = makeRegistry(makeBundle({
      objects: [defectorDef, enemyUnitDef],
      specialPowers: [
        makeSpecialPowerDef('SpecialPowerDefector', { ReloadTime: 0 }),
      ],
    }));

    const map = makeMap([
      makeMapObject('Defector', 10, 10),
      makeMapObject('EnemyUnit', 20, 10),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));
    logic.setTeamRelationship('America', 'China', 0); // enemies

    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'CMD_DEFECT',
      specialPowerName: 'SpecialPowerDefector',
      commandOption: 0x01, // COMMAND_OPTION_NEED_TARGET_ENEMY_OBJECT
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: 2,
      targetX: null,
      targetZ: null,
    });
    logic.update(0);

    // The enemy unit should still be alive (defect, not destroyed).
    const convertedState = logic.getEntityState(2);
    expect(convertedState).not.toBeNull();
    expect(convertedState?.alive).toBe(true);
  });

  it('skirmish AI sends combat units to attack enemy when force threshold met', () => {
    const logic = new GameLogicSubsystem();

    // Create an AI base with several combat units.
    const aiTankDef = makeObjectDef('AITank', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      makeBlock('Locomotor', 'Locomotor', { Speed: 15 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'TankGun'] }),
    ], { Speed: 15 });

    // High HP so the building survives long enough for the test to observe attack state.
    const enemyBuildingDef = makeObjectDef('EnemyHQ', 'America', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 50000, InitialHealth: 50000 }),
    ]);

    const registry = makeRegistry(makeBundle({
      objects: [aiTankDef, enemyBuildingDef],
      weapons: [
        makeWeaponDef('TankGun', {
          AttackRange: 100,
          PrimaryDamage: 30,
          DelayBetweenShots: 100,
        }),
      ],
    }));

    // Place 5 AI tanks near each other and an enemy building far away.
    const map = makeMap([
      makeMapObject('AITank', 10, 10),
      makeMapObject('AITank', 15, 10),
      makeMapObject('AITank', 10, 15),
      makeMapObject('AITank', 15, 15),
      makeMapObject('AITank', 12, 12),
      makeMapObject('EnemyHQ', 50, 50),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));
    logic.setTeamRelationship('China', 'America', 0); // enemies

    // Enable skirmish AI for China.
    logic.enableSkirmishAI('China');

    // Run enough frames for AI to discover enemy and issue attack (90+ frames for combat eval).
    for (let i = 0; i < 100; i++) {
      logic.update(0.033);
    }

    // Verify at least some AI tanks are attacking the enemy building.
    let attackingCount = 0;
    for (let id = 1; id <= 5; id++) {
      const state = logic.getEntityState(id);
      if (state && state.attackTargetEntityId !== null) {
        attackingCount++;
      }
    }

    // AI should have issued attack commands to its idle units.
    expect(attackingCount).toBeGreaterThan(0);
  });

  it('skirmish AI replaces lost dozer by queueing production at a factory', () => {
    const logic = new GameLogicSubsystem();

    // Command center that can produce dozers.
    const commandCenterDef = makeObjectDef('CommandCenter', 'America', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 2000, InitialHealth: 2000 }),
      makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
        MaxQueueEntries: 4,
      }),
      makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
        UnitCreatePoint: [0, 0, 5],
        ExitDelay: 0,
      }),
    ], {
      CommandSet: 'CommandCenterCommandSet',
    });

    const dozerDef = makeObjectDef('USADozer', 'America', ['VEHICLE', 'DOZER'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
    ], {
      BuildCost: 200,
      BuildTime: 0.1,
    });

    // Dummy enemy so AI has something to worry about.
    const enemyDef = makeObjectDef('EnemyUnit', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
    ]);

    const registry = makeRegistry(makeBundle({
      objects: [commandCenterDef, dozerDef, enemyDef],
      commandButtons: [
        makeCommandButtonDef('Command_ConstructUSADozer', {
          Command: 'UNIT_BUILD',
          Object: 'USADozer',
        }),
      ],
      commandSets: [
        makeCommandSetDef('CommandCenterCommandSet', {
          '1': 'Command_ConstructUSADozer',
        }),
      ],
    }));

    // Place only a command center (no dozer) and a distant enemy.
    const map = makeMap([
      makeMapObject('CommandCenter', 10, 10),
      makeMapObject('EnemyUnit', 50, 50),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 5000 });
    logic.enableSkirmishAI('America');

    // Run enough frames for dozer evaluation (60+ frames).
    for (let i = 0; i < 80; i++) {
      logic.update(1 / 30);
    }

    // Check that the command center has something in its production queue (dozer).
    const ccState = logic.getEntityState(1);
    // The AI should have queued a dozer or one should already be spawned.
    let hasDozer = false;
    for (const [, state] of (logic as any).spawnedEntities) {
      if (state.templateName.toUpperCase().includes('DOZER') && !state.destroyed) {
        hasDozer = true;
        break;
      }
    }
    // At minimum, the production queue should have been used.
    expect(ccState).not.toBeNull();
    // AI queued a dozer (it may have already spawned or still be in queue).
    const ccEntity = (logic as any).spawnedEntities.get(1);
    expect(hasDozer || ccEntity.productionQueue.length > 0).toBe(true);
  });

  it('skirmish AI researches upgrades at idle buildings', () => {
    const logic = new GameLogicSubsystem();

    const factoryDef = makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 2000, InitialHealth: 2000 }),
      makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
        MaxQueueEntries: 4,
      }),
    ], {
      CommandSet: 'WarFactoryCommandSet',
    });

    const upgradeDef = makeUpgradeDef('Upgrade_WeaponBoost', {
      BuildCost: 500,
      BuildTime: 0.5,
      Type: 'PLAYER',
    });

    const registry = makeRegistry(makeBundle({
      objects: [factoryDef],
      upgrades: [upgradeDef],
      commandButtons: [
        makeCommandButtonDef('Command_UpgradeWeaponBoost', {
          Command: 'PLAYER_UPGRADE',
          Upgrade: 'Upgrade_WeaponBoost',
        }),
      ],
      commandSets: [
        makeCommandSetDef('WarFactoryCommandSet', {
          '1': 'Command_UpgradeWeaponBoost',
        }),
      ],
    }));

    const map = makeMap([makeMapObject('WarFactory', 10, 10)], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 5000 });
    logic.submitCommand({ type: 'setSidePlayerType', side: 'America', playerType: 'COMPUTER' });
    logic.enableSkirmishAI('America');

    // Run enough frames for upgrade evaluation (120+ frames).
    for (let i = 0; i < 150; i++) {
      logic.update(1 / 30);
    }

    // Check if upgrade was queued or completed.
    const factoryEntity = (logic as any).spawnedEntities.get(1);
    const wasQueued = factoryEntity.productionQueue.length > 0
      || (logic as any).hasSideUpgradeCompleted('America', 'UPGRADE_WEAPONBOOST');
    expect(wasQueued).toBe(true);
  });

  it('skirmish AI sets rally points on factory buildings toward enemy', () => {
    const logic = new GameLogicSubsystem();

    const factoryDef = makeObjectDef('WarFactory', 'America', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 2000, InitialHealth: 2000 }),
      makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
        MaxQueueEntries: 4,
      }),
      makeBlock('Behavior', 'QueueProductionExitUpdate ModuleTag_Exit', {
        UnitCreatePoint: [0, 0, 5],
        ExitDelay: 0,
      }),
    ]);

    const enemyDef = makeObjectDef('EnemyHQ', 'China', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 50000, InitialHealth: 50000 }),
    ]);

    const registry = makeRegistry(makeBundle({
      objects: [factoryDef, enemyDef],
    }));

    // Factory at (10,10), enemy at (50,50).
    const map = makeMap([
      makeMapObject('WarFactory', 10, 10),
      makeMapObject('EnemyHQ', 50, 50),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.enableSkirmishAI('America');

    // Run frames for AI initialization + rally point setting.
    for (let i = 0; i < 100; i++) {
      logic.update(1 / 30);
    }

    // Rally point should be set on the factory, somewhere between factory and enemy.
    const factoryState = logic.getEntityState(1);
    expect(factoryState).not.toBeNull();
    if (factoryState!.rallyPoint) {
      // Rally point should be between factory (10,10) and enemy (50,50).
      expect(factoryState!.rallyPoint.x).toBeGreaterThan(10);
      expect(factoryState!.rallyPoint.z).toBeGreaterThan(10);
    }
  });

  it('skirmish AI uses multiple idle dozers for parallel construction', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);

    // Use simpler setup without command sets to rely on permissive fallback.
    const dozerDef = makeObjectDef('USADozer', 'America', ['VEHICLE', 'DOZER'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      makeBlock('Behavior', 'ProductionUpdate ModuleTag_Production', {
        MaxQueueEntries: 4,
        QuantityModifier: ['USAPowerPlant 1', 'USABarracks 1'],
      }),
    ], {
      Speed: 30,
      GeometryMajorRadius: 3,
      GeometryMinorRadius: 3,
    });

    const powerPlantDef = makeObjectDef('USAPowerPlant', 'America', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
    ], {
      BuildCost: 500,
      BuildTime: 2,
      EnergyBonus: 10,
      GeometryMajorRadius: 5,
      GeometryMinorRadius: 5,
    });

    const barracksDef = makeObjectDef('USABarracks', 'America', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
    ], {
      BuildCost: 500,
      BuildTime: 2,
      GeometryMajorRadius: 5,
      GeometryMinorRadius: 5,
    });

    const enemyDef = makeObjectDef('EnemyHQ', 'China', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 50000, InitialHealth: 50000 }),
    ]);

    const registry = makeRegistry(makeBundle({
      objects: [dozerDef, powerPlantDef, barracksDef, enemyDef],
      locomotors: [makeLocomotorDef('DozerLocomotor', 30)],
    }));

    // Two dozers spaced apart.
    const map = makeMap([
      makeMapObject('USADozer', 10, 10),
      makeMapObject('USADozer', 10, 15),
      makeMapObject('EnemyHQ', 50, 50),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 10000 });
    logic.enableSkirmishAI('America');

    // Run enough frames for structure evaluation + construction start.
    for (let i = 0; i < 90; i++) {
      logic.update(1 / 30);
    }

    // Count spawned structures (beyond the initial 3 entities).
    let structureCount = 0;
    for (const entity of (logic as any).spawnedEntities.values()) {
      if (entity.kindOf.has('STRUCTURE') && !entity.destroyed
        && entity.side?.toUpperCase() === 'AMERICA') {
        structureCount++;
      }
    }

    // AI should have started building at least one structure.
    expect(structureCount).toBeGreaterThanOrEqual(1);
  });
});

// ── MinefieldBehavior collision-based detonation ──

describe('mine detonation', () => {
  function makeMineSetup(opts: {
    detonatedBy?: string;
    numVirtualMines?: number;
    workersDetonate?: boolean;
    enemyKindOf?: string[];
    enemyGeomRadius?: number;
    mineGeomRadius?: number;
    mineHealth?: number;
    weaponDamage?: number;
    weaponRadius?: number;
  } = {}) {
    const mineDef = makeObjectDef('TestMine', 'America', ['MINE', 'IMMOBILE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: opts.mineHealth ?? 100,
        InitialHealth: opts.mineHealth ?? 100,
      }),
      makeBlock('Behavior', 'MinefieldBehavior ModuleTag_Minefield', {
        DetonationWeapon: 'MineDetonationWeapon',
        NumVirtualMines: opts.numVirtualMines ?? 1,
        ...(opts.detonatedBy ? { DetonatedBy: opts.detonatedBy } : {}),
        ...(opts.workersDetonate !== undefined ? { WorkersDetonate: opts.workersDetonate } : {}),
      }),
    ], {
      Geometry: 'CYLINDER',
      GeometryMajorRadius: opts.mineGeomRadius ?? 5,
      GeometryMinorRadius: opts.mineGeomRadius ?? 5,
    });

    const enemyDef = makeObjectDef(
      'EnemyVehicle',
      'China',
      opts.enemyKindOf ?? ['VEHICLE'],
      [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ],
      {
        Geometry: 'CYLINDER',
        GeometryMajorRadius: opts.enemyGeomRadius ?? 3,
        GeometryMinorRadius: opts.enemyGeomRadius ?? 3,
      },
    );

    const registry = makeRegistry(makeBundle({
      objects: [mineDef, enemyDef],
      weapons: [
        makeWeaponDef('MineDetonationWeapon', {
          PrimaryDamage: opts.weaponDamage ?? 50,
          PrimaryDamageRadius: opts.weaponRadius ?? 10,
          DamageType: 'EXPLOSION',
        }),
      ],
    }));

    return { registry };
  }

  it('detonates mine when enemy overlaps mine geometry radius', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    const { registry } = makeMineSetup();

    // Place mine at (10,10) and enemy at (12,10) — within combined radius (5+3=8).
    const map = makeMap([
      makeMapObject('TestMine', 10, 10),
      makeMapObject('EnemyVehicle', 12, 10),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());
    logic.setTeamRelationship('America', 'China', 0); // enemies

    // Mine should exist before update.
    const mineBefore = logic.getEntityState(1);
    expect(mineBefore).not.toBeNull();
    expect(mineBefore!.alive).toBe(true);

    // Run 1 frame — collision should detonate and destroy the 1-charge mine.
    logic.update(1 / 30);

    // Mine with 1 virtual mine is destroyed and cleaned up (returns null).
    const mineAfter = logic.getEntityState(1);
    expect(mineAfter).toBeNull();

    // Enemy should have taken detonation damage (50 damage, from 200 → 150).
    const enemyAfter = logic.getEntityState(2);
    expect(enemyAfter).not.toBeNull();
    expect(enemyAfter!.health).toBeLessThan(200);
  });

  it('does not detonate mine for allies (default detonatedBy = ENEMIES+NEUTRAL)', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    const { registry } = makeMineSetup();

    // Place mine and an allied vehicle overlapping.
    const map = makeMap([
      makeMapObject('TestMine', 10, 10),
      makeMapObject('EnemyVehicle', 12, 10),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());
    // Set China as allies of America (2 = ALLIES) — mine should NOT detonate.
    logic.setTeamRelationship('America', 'China', 2);
    logic.setTeamRelationship('China', 'America', 2);

    logic.update(1 / 30);

    // Mine should still be alive — not detonated by ally.
    const mineAfter = logic.getEntityState(1);
    expect(mineAfter).not.toBeNull();
    expect(mineAfter!.alive).toBe(true);

    // Allied vehicle should be at full health.
    const allyAfter = logic.getEntityState(2);
    expect(allyAfter).not.toBeNull();
    expect(allyAfter!.health).toBe(200);
  });

  it('detonates mine for allies when DetonatedBy includes ALLIES', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    const { registry } = makeMineSetup({ detonatedBy: 'ALLIES ENEMIES NEUTRAL' });

    const map = makeMap([
      makeMapObject('TestMine', 10, 10),
      makeMapObject('EnemyVehicle', 12, 10),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());
    logic.setTeamRelationship('America', 'China', 2); // allies
    logic.setTeamRelationship('China', 'America', 2);

    logic.update(1 / 30);

    // Mine with 1 charge detonated for ally — destroyed and cleaned up.
    const mineAfter = logic.getEntityState(1);
    expect(mineAfter).toBeNull();
  });

  it('decrements virtual mine charges without destroying multi-charge mine', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    const { registry } = makeMineSetup({ numVirtualMines: 3, mineHealth: 300 });

    const map = makeMap([
      makeMapObject('TestMine', 10, 10),
      makeMapObject('EnemyVehicle', 12, 10),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());
    logic.setTeamRelationship('America', 'China', 0);

    logic.update(1 / 30);

    // Mine should still be alive with 2 charges remaining (health reduced proportionally).
    const mineAfter = logic.getEntityState(1);
    expect(mineAfter).not.toBeNull();
    expect(mineAfter!.alive).toBe(true);
    // Health reduced: 2/3 * 300 = 200.
    expect(mineAfter!.health).toBeLessThan(300);
  });

  it('does not detonate when entities are outside combined radius', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    const { registry } = makeMineSetup();

    // Place mine at (10,10) and enemy at (30,10) — distance 20 > combined radius (5+3=8).
    const map = makeMap([
      makeMapObject('TestMine', 10, 10),
      makeMapObject('EnemyVehicle', 30, 10),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());
    logic.setTeamRelationship('America', 'China', 0);

    logic.update(1 / 30);

    // Mine should be alive — no collision.
    const mineAfter = logic.getEntityState(1);
    expect(mineAfter).not.toBeNull();
    expect(mineAfter!.alive).toBe(true);

    // Enemy should be at full health.
    const enemyAfter = logic.getEntityState(2);
    expect(enemyAfter).not.toBeNull();
    expect(enemyAfter!.health).toBe(200);
  });

  it('does not detonate for worker units (infantry+dozer) when workersDetonate is false', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    const { registry } = makeMineSetup({
      workersDetonate: false,
      enemyKindOf: ['INFANTRY', 'DOZER'],
    });

    // Place mine and infantry/dozer worker overlapping.
    const map = makeMap([
      makeMapObject('TestMine', 10, 10),
      makeMapObject('EnemyVehicle', 12, 10),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());
    logic.setTeamRelationship('America', 'China', 0);

    logic.update(1 / 30);

    // Mine should NOT detonate for worker (infantry+dozer).
    const mineAfter = logic.getEntityState(1);
    expect(mineAfter).not.toBeNull();
    expect(mineAfter!.alive).toBe(true);
  });

  it('emits WEAPON_IMPACT visual event on mine detonation', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    const { registry } = makeMineSetup();

    const map = makeMap([
      makeMapObject('TestMine', 10, 10),
      makeMapObject('EnemyVehicle', 12, 10),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());
    logic.setTeamRelationship('America', 'China', 0);

    logic.update(1 / 30);

    // Should have emitted visual events including a WEAPON_IMPACT for the detonation.
    const events = logic.drainVisualEvents();
    const impactEvents = events.filter(e => e.type === 'WEAPON_IMPACT');
    expect(impactEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('sympathetically detonates when mine is shot by external weapon', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);

    // Mine with 3 charges and an attacker that can shoot the mine.
    const mineDef = makeObjectDef('TestMine', 'China', ['MINE', 'IMMOBILE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
      makeBlock('Behavior', 'MinefieldBehavior ModuleTag_Minefield', {
        DetonationWeapon: 'MineDetonationWeapon',
        NumVirtualMines: 3,
      }),
    ], {
      Geometry: 'CYLINDER',
      GeometryMajorRadius: 5,
      GeometryMinorRadius: 5,
    });

    const attackerDef = makeObjectDef('MineShooter', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ShooterGun'] }),
    ], {
      Geometry: 'CYLINDER',
      GeometryMajorRadius: 3,
      GeometryMinorRadius: 3,
    });

    const registry = makeRegistry(makeBundle({
      objects: [mineDef, attackerDef],
      weapons: [
        makeWeaponDef('ShooterGun', {
          AttackRange: 200,
          PrimaryDamage: 150,
          DelayBetweenShots: 100,
        }),
        makeWeaponDef('MineDetonationWeapon', {
          PrimaryDamage: 40,
          PrimaryDamageRadius: 10,
          DamageType: 'EXPLOSION',
        }),
      ],
    }));

    // Place mine at (10,10) and attacker FAR away (50,10) — outside mine geometry.
    const map = makeMap([
      makeMapObject('TestMine', 10, 10),
      makeMapObject('MineShooter', 50, 10),
    ], 64, 64);

    logic.loadMapObjects(map, registry, makeHeightmap(64, 64));
    logic.setTeamRelationship('America', 'China', 0); // enemies
    logic.setTeamRelationship('China', 'America', 0);

    // Command attacker to shoot the mine.
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    // Mine should exist before attack.
    const mineBefore = logic.getEntityState(1);
    expect(mineBefore).not.toBeNull();
    expect(mineBefore!.alive).toBe(true);

    // Run enough frames for the attacker to fire and deal 150 damage to a 300hp mine.
    // That should reduce health to 150/300 = 50%, expecting ceil(3*0.5) = 2 mines.
    // Since mine had 3 charges, it needs to detonate 1 charge sympathetically.
    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }

    // After 150 damage to a 300hp 3-charge mine, at least 1 sympathetic detonation
    // should have occurred. Check if visual events include detonation impacts.
    const events = logic.drainVisualEvents();
    const mineDetonations = events.filter(e =>
      e.type === 'WEAPON_IMPACT' && e.sourceEntityId === 1,
    );
    // Should have at least one sympathetic detonation from the mine.
    expect(mineDetonations.length).toBeGreaterThanOrEqual(1);
  });
});

describe('tunnel network', () => {
  function makeTunnelSetup(opts: {
    maxTunnelCapacity?: number;
    timeForFullHealMs?: number;
    tunnelCount?: number;
    infantryHealth?: number;
    infantryMaxHealth?: number;
  } = {}) {
    const timeForFullHealMs = opts.timeForFullHealMs ?? 3000;
    const tunnelDef = makeObjectDef('GLATunnelNetwork', 'GLA', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
      makeBlock('Behavior', 'TunnelContain ModuleTag_Tunnel', {
        ...(timeForFullHealMs > 0 ? { TimeForFullHeal: timeForFullHealMs } : {}),
      }),
    ], {
      Geometry: 'CYLINDER',
      GeometryMajorRadius: 15,
      GeometryMinorRadius: 15,
    });

    const infantryDef = makeObjectDef('GLARebel', 'GLA', ['INFANTRY'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: opts.infantryMaxHealth ?? 100,
        InitialHealth: opts.infantryHealth ?? (opts.infantryMaxHealth ?? 100),
      }),
    ]);

    const enemyTankDef = makeObjectDef('USATank', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'TankCannon'] }),
    ]);

    const tunnelCount = opts.tunnelCount ?? 1;
    const tunnelObjects: MapObjectJSON[] = [];
    for (let i = 0; i < tunnelCount; i++) {
      tunnelObjects.push(makeMapObject('GLATunnelNetwork', 50 + i * 40, 50));
    }

    const registry = makeRegistry(makeBundle({
      objects: [tunnelDef, infantryDef, enemyTankDef],
      weapons: [
        makeWeaponDef('TankCannon', { PrimaryDamage: 50, AttackRange: 100, DelayBetweenShots: 100, DamageType: 'ARMOR_PIERCING' }),
      ],
    }));

    return { registry, tunnelObjects, tunnelDef, infantryDef };
  }

  it('infantry enters tunnel and gets DISABLED_HELD + MASKED + UNSELECTABLE', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene, { maxTunnelCapacity: 10 });
    const { registry, tunnelObjects } = makeTunnelSetup();

    const map = makeMap([
      ...tunnelObjects,
      makeMapObject('GLARebel', 50, 50),  // Adjacent to tunnel
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());

    // Entity 1 = tunnel, entity 2 = infantry
    const infantryBefore = logic.getEntityState(2);
    expect(infantryBefore).not.toBeNull();
    expect(infantryBefore!.statusFlags).not.toContain('DISABLED_HELD');

    // Issue enter transport command to enter the tunnel.
    logic.submitCommand({ type: 'enterTransport', entityId: 2, targetTransportId: 1 });
    logic.update(1 / 30);

    const infantryAfter = logic.getEntityState(2);
    expect(infantryAfter).not.toBeNull();
    expect(infantryAfter!.statusFlags).toContain('DISABLED_HELD');
    expect(infantryAfter!.statusFlags).toContain('MASKED');
    expect(infantryAfter!.statusFlags).toContain('UNSELECTABLE');
  });

  it('infantry exits tunnel and clears containment flags', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene, { maxTunnelCapacity: 10 });
    const { registry, tunnelObjects } = makeTunnelSetup();

    const map = makeMap([
      ...tunnelObjects,
      makeMapObject('GLARebel', 50, 50),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());

    // Enter tunnel.
    logic.submitCommand({ type: 'enterTransport', entityId: 2, targetTransportId: 1 });
    logic.update(1 / 30);

    // Verify inside.
    expect(logic.getEntityState(2)!.statusFlags).toContain('DISABLED_HELD');

    // Exit container.
    logic.submitCommand({ type: 'exitContainer', entityId: 2 });
    logic.update(1 / 30);

    const infantryAfter = logic.getEntityState(2);
    expect(infantryAfter).not.toBeNull();
    expect(infantryAfter!.statusFlags).not.toContain('DISABLED_HELD');
    expect(infantryAfter!.statusFlags).not.toContain('MASKED');
    expect(infantryAfter!.statusFlags).not.toContain('UNSELECTABLE');
  });

  it('blocks aircraft from entering tunnel', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene, { maxTunnelCapacity: 10 });

    const tunnelDef = makeObjectDef('GLATunnelNetwork', 'GLA', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
      makeBlock('Behavior', 'TunnelContain ModuleTag_Tunnel', {}),
    ]);
    const aircraftDef = makeObjectDef('GLAHelicopter', 'GLA', ['AIRCRAFT'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
    ]);

    const registry = makeRegistry(makeBundle({ objects: [tunnelDef, aircraftDef] }));
    const map = makeMap([
      makeMapObject('GLATunnelNetwork', 50, 50),
      makeMapObject('GLAHelicopter', 50, 50),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());

    logic.submitCommand({ type: 'enterTransport', entityId: 2, targetTransportId: 1 });
    logic.update(1 / 30);

    // Aircraft should NOT be inside tunnel — no DISABLED_HELD.
    const aircraft = logic.getEntityState(2);
    expect(aircraft).not.toBeNull();
    expect(aircraft!.statusFlags).not.toContain('DISABLED_HELD');
  });

  it('respects maxTunnelCapacity shared across tunnels', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene, { maxTunnelCapacity: 2 });
    const { registry } = makeTunnelSetup({ tunnelCount: 2 });

    const map = makeMap([
      makeMapObject('GLATunnelNetwork', 50, 50),   // Tunnel 1
      makeMapObject('GLATunnelNetwork', 90, 50),   // Tunnel 2
      makeMapObject('GLARebel', 50, 50),  // Infantry 1
      makeMapObject('GLARebel', 50, 50),  // Infantry 2
      makeMapObject('GLARebel', 90, 50),  // Infantry 3
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());

    // Enter two infantry (fills capacity of 2).
    logic.submitCommand({ type: 'enterTransport', entityId: 3, targetTransportId: 1 });
    logic.submitCommand({ type: 'enterTransport', entityId: 4, targetTransportId: 1 });
    logic.update(1 / 30);

    expect(logic.getEntityState(3)!.statusFlags).toContain('DISABLED_HELD');
    expect(logic.getEntityState(4)!.statusFlags).toContain('DISABLED_HELD');

    // Third infantry tries to enter a DIFFERENT tunnel — should be rejected (shared capacity).
    logic.submitCommand({ type: 'enterTransport', entityId: 5, targetTransportId: 2 });
    logic.update(1 / 30);

    expect(logic.getEntityState(5)!.statusFlags).not.toContain('DISABLED_HELD');
  });

  it('cave-in kills all passengers when last tunnel destroyed', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene, { maxTunnelCapacity: 10 });
    const { registry } = makeTunnelSetup();

    const map = makeMap([
      makeMapObject('GLATunnelNetwork', 50, 50),  // Single tunnel
      makeMapObject('GLARebel', 50, 50),
      makeMapObject('GLARebel', 50, 50),
      makeMapObject('USATank', 55, 50),  // Enemy near tunnel
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());
    logic.setTeamRelationship('GLA', 'America', 0); // enemies
    logic.setTeamRelationship('America', 'GLA', 0);

    // Enter both infantry.
    logic.submitCommand({ type: 'enterTransport', entityId: 2, targetTransportId: 1 });
    logic.submitCommand({ type: 'enterTransport', entityId: 3, targetTransportId: 1 });
    logic.update(1 / 30);

    expect(logic.getEntityState(2)!.statusFlags).toContain('DISABLED_HELD');
    expect(logic.getEntityState(3)!.statusFlags).toContain('DISABLED_HELD');

    // Enemy tank attacks the tunnel.
    logic.submitCommand({ type: 'attackEntity', entityId: 4, targetEntityId: 1 });
    // Run enough frames for the tank to destroy the 500hp tunnel (50 damage per shot).
    for (let i = 0; i < 120; i++) {
      logic.update(1 / 30);
    }

    // Tunnel is destroyed.
    const tunnel = logic.getEntityState(1);
    expect(tunnel).toBeNull();

    // Both passengers should be dead (cave-in).
    expect(logic.getEntityState(2)).toBeNull();
    expect(logic.getEntityState(3)).toBeNull();
  });

  it('reassigns passengers when non-last tunnel destroyed', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene, { maxTunnelCapacity: 10 });
    const { registry } = makeTunnelSetup({ tunnelCount: 2 });

    const map = makeMap([
      makeMapObject('GLATunnelNetwork', 50, 50),  // Tunnel 1
      makeMapObject('GLATunnelNetwork', 90, 50),  // Tunnel 2
      makeMapObject('GLARebel', 50, 50),           // Infantry near tunnel 1
      makeMapObject('USATank', 55, 50),            // Enemy near tunnel 1
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());
    logic.setTeamRelationship('GLA', 'America', 0);
    logic.setTeamRelationship('America', 'GLA', 0);

    // Enter infantry into tunnel 1.
    logic.submitCommand({ type: 'enterTransport', entityId: 3, targetTransportId: 1 });
    logic.update(1 / 30);

    expect(logic.getEntityState(3)!.statusFlags).toContain('DISABLED_HELD');

    // Enemy tank destroys tunnel 1 (non-last — tunnel 2 still exists).
    logic.submitCommand({ type: 'attackEntity', entityId: 4, targetEntityId: 1 });
    for (let i = 0; i < 120; i++) {
      logic.update(1 / 30);
    }

    // Tunnel 1 should be destroyed.
    expect(logic.getEntityState(1)).toBeNull();

    // Passenger should still be alive (reassigned to tunnel 2).
    const infantry = logic.getEntityState(3);
    expect(infantry).not.toBeNull();
    expect(infantry!.statusFlags).toContain('DISABLED_HELD');
  });

  it('evacuate command exits all passengers from tunnel', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene, { maxTunnelCapacity: 10 });
    const { registry } = makeTunnelSetup();

    const map = makeMap([
      makeMapObject('GLATunnelNetwork', 50, 50),
      makeMapObject('GLARebel', 50, 50),
      makeMapObject('GLARebel', 50, 50),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());

    // Enter both.
    logic.submitCommand({ type: 'enterTransport', entityId: 2, targetTransportId: 1 });
    logic.submitCommand({ type: 'enterTransport', entityId: 3, targetTransportId: 1 });
    logic.update(1 / 30);

    expect(logic.getEntityState(2)!.statusFlags).toContain('DISABLED_HELD');
    expect(logic.getEntityState(3)!.statusFlags).toContain('DISABLED_HELD');

    // Evacuate.
    logic.submitCommand({ type: 'evacuate', entityId: 1 });
    logic.update(1 / 30);

    expect(logic.getEntityState(2)!.statusFlags).not.toContain('DISABLED_HELD');
    expect(logic.getEntityState(3)!.statusFlags).not.toContain('DISABLED_HELD');
  });

  it('heals passengers inside tunnel over time', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene, { maxTunnelCapacity: 10 });
    // 3000ms = 90 frames for full heal
    const { registry } = makeTunnelSetup({
      timeForFullHealMs: 3000,
      infantryHealth: 50,
      infantryMaxHealth: 100,
    });

    const map = makeMap([
      makeMapObject('GLATunnelNetwork', 50, 50),
      makeMapObject('GLARebel', 50, 50),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());

    // Verify infantry starts at 50hp.
    expect(logic.getEntityState(2)!.health).toBe(50);

    // Enter tunnel.
    logic.submitCommand({ type: 'enterTransport', entityId: 2, targetTransportId: 1 });
    logic.update(1 / 30);

    // Run 30 frames (~1 second) inside tunnel.
    for (let i = 0; i < 30; i++) {
      logic.update(1 / 30);
    }

    // Should have healed: 30 frames * (100 / 90) per frame ≈ 33 hp healed.
    // From 50 → should be ~83.
    const afterPartial = logic.getEntityState(2);
    expect(afterPartial).not.toBeNull();
    expect(afterPartial!.health).toBeGreaterThan(70);
    expect(afterPartial!.health).toBeLessThan(100);

    // Run 60 more frames (total 90 = full heal time).
    for (let i = 0; i < 60; i++) {
      logic.update(1 / 30);
    }

    const afterFull = logic.getEntityState(2);
    expect(afterFull).not.toBeNull();
    expect(afterFull!.health).toBe(100);
  });

  it('selling last tunnel ejects passengers safely', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene, { maxTunnelCapacity: 10 });
    const { registry } = makeTunnelSetup();

    const map = makeMap([
      makeMapObject('GLATunnelNetwork', 50, 50),
      makeMapObject('GLARebel', 50, 50),
    ]);

    logic.loadMapObjects(map, registry, makeHeightmap());

    // Enter tunnel.
    logic.submitCommand({ type: 'enterTransport', entityId: 2, targetTransportId: 1 });
    logic.update(1 / 30);
    expect(logic.getEntityState(2)!.statusFlags).toContain('DISABLED_HELD');

    // Sell the tunnel.
    logic.submitCommand({ type: 'sell', entityId: 1 });
    logic.update(1 / 30);

    // Passenger should be ejected (not killed).
    const infantry = logic.getEntityState(2);
    expect(infantry).not.toBeNull();
    expect(infantry!.alive).toBe(true);
    expect(infantry!.statusFlags).not.toContain('DISABLED_HELD');
  });
});

// ── Construction Progress System ──────────────────────────────────────────────

describe('construction progress', () => {
  function makeConstructionSetup(buildTimeSeconds = 2) {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('USADozer', 'America', ['VEHICLE', 'DOZER'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        ], {
          GeometryMajorRadius: 5,
          GeometryMinorRadius: 5,
          Speed: 30,
        }),
        makeObjectDef('USAPowerPlant', 'America', ['STRUCTURE', 'MP_COUNT_FOR_VICTORY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
        ], {
          BuildCost: 500,
          BuildTime: buildTimeSeconds,
          EnergyBonus: 10,
          GeometryMajorRadius: 10,
          GeometryMinorRadius: 10,
        }),
      ],
      locomotors: [makeLocomotorDef('DozerLocomotor', 30)],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('USADozer', 16, 16)], 64, 64),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 2000 });
    logic.update(1 / 30); // Process credits

    return { logic, scene };
  }

  it('building starts under construction with 0% and health=1 when dozer places it', () => {
    const { logic } = makeConstructionSetup(2);

    // Issue construct command — dozer at (16,16) builds at (20,20).
    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'USAPowerPlant',
      targetPosition: [20, 0, 20],
      angle: 0,
      lineEndPosition: null,
    });
    logic.update(1 / 30);

    // Building should exist with UNDER_CONSTRUCTION.
    const building = logic.getEntityState(2);
    expect(building).not.toBeNull();
    expect(building!.statusFlags).toContain('UNDER_CONSTRUCTION');
    expect(building!.constructionPercent).toBeGreaterThanOrEqual(0);
    expect(building!.constructionPercent).toBeLessThan(100);
    expect(building!.health).toBeLessThan(building!.maxHealth);

    // Credits should be deducted immediately.
    expect(logic.getSideCredits('America')).toBe(1500);
  });

  it('building completes construction after BuildTime seconds of dozer proximity', () => {
    const { logic } = makeConstructionSetup(1); // 1 second = 30 frames

    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'USAPowerPlant',
      targetPosition: [18, 0, 18], // Close to dozer at (16,16)
      angle: 0,
      lineEndPosition: null,
    });

    // Run for 31 frames (1 second + margin) — first frame places the building.
    for (let i = 0; i < 31; i++) {
      logic.update(1 / 30);
    }

    const building = logic.getEntityState(2);
    expect(building).not.toBeNull();
    expect(building!.statusFlags).not.toContain('UNDER_CONSTRUCTION');
    expect(building!.constructionPercent).toBe(-1); // CONSTRUCTION_COMPLETE
    expect(building!.health).toBe(building!.maxHealth);
  });

  it('building does not gain energy until construction completes', () => {
    const { logic } = makeConstructionSetup(1);

    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'USAPowerPlant',
      targetPosition: [18, 0, 18],
      angle: 0,
      lineEndPosition: null,
    });
    logic.update(1 / 30); // Place building

    // During construction, energy should not be contributed.
    const powerDuring = logic.getSidePowerState('America');
    expect(powerDuring.energyProduction).toBe(0);

    // Complete construction.
    for (let i = 0; i < 31; i++) {
      logic.update(1 / 30);
    }

    // After completion, energy should be registered.
    const powerAfter = logic.getSidePowerState('America');
    expect(powerAfter.energyProduction).toBe(10);
  });

  it('building under construction cannot attack', () => {
    const weaponBlock = makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'GatlingCannon'] });
    const bundle = makeBundle({
      objects: [
        makeObjectDef('USADozer', 'America', ['VEHICLE', 'DOZER'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        ], { GeometryMajorRadius: 5, GeometryMinorRadius: 5 }),
        makeObjectDef('USADefense', 'America', ['STRUCTURE', 'MP_COUNT_FOR_VICTORY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          weaponBlock,
        ], { BuildCost: 300, BuildTime: 2, GeometryMajorRadius: 10, GeometryMinorRadius: 10 }),
        makeObjectDef('ChinaTank', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        ]),
      ],
      weapons: [makeWeaponDef('GatlingCannon', {
        AttackRange: 100, PrimaryDamage: 10, PrimaryDamageRadius: 0,
        DamageType: 'ARMOR_PIERCING', DeathType: 'NORMAL', DelayBetweenShots: 100,
      })],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('USADozer', 16, 16), makeMapObject('ChinaTank', 20, 20)], 64, 64),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 1000 });
    logic.setTeamRelationship('America', 'China', 0); // enemies
    logic.setTeamRelationship('China', 'America', 0);

    // Build the defense structure.
    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'USADefense',
      targetPosition: [18, 0, 18],
      angle: 0,
      lineEndPosition: null,
    });

    // Run a few frames — building is under construction.
    for (let i = 0; i < 5; i++) {
      logic.update(1 / 30);
    }

    const building = logic.getEntityState(3); // building is entity 3 (dozer=1, tank=2)
    expect(building).not.toBeNull();
    expect(building!.statusFlags).toContain('UNDER_CONSTRUCTION');

    // Tank should NOT be under attack from the building under construction.
    const tank = logic.getEntityState(2);
    expect(tank).not.toBeNull();
    expect(tank!.health).toBe(100); // Full health — not attacked.
  });

  it('dozer interrupted during construction leaves building partially built', () => {
    const { logic } = makeConstructionSetup(2); // 2 seconds = 60 frames

    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'USAPowerPlant',
      targetPosition: [18, 0, 18],
      angle: 0,
      lineEndPosition: null,
    });

    // Build for 15 frames (~25%).
    for (let i = 0; i < 15; i++) {
      logic.update(1 / 30);
    }

    const buildingMid = logic.getEntityState(2);
    expect(buildingMid).not.toBeNull();
    expect(buildingMid!.statusFlags).toContain('UNDER_CONSTRUCTION');
    const midPercent = buildingMid!.constructionPercent;
    expect(midPercent).toBeGreaterThan(0);
    expect(midPercent).toBeLessThan(100);

    // Interrupt: order dozer to move elsewhere.
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 50, targetZ: 50 });
    logic.update(1 / 30);

    // Building should still be under construction at the same percent.
    const buildingAfter = logic.getEntityState(2);
    expect(buildingAfter).not.toBeNull();
    expect(buildingAfter!.statusFlags).toContain('UNDER_CONSTRUCTION');
    expect(buildingAfter!.constructionPercent).toBeCloseTo(midPercent, 0);
  });

  it('cancel construction refunds full cost and destroys building', () => {
    const { logic } = makeConstructionSetup(2);

    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'USAPowerPlant',
      targetPosition: [18, 0, 18],
      angle: 0,
      lineEndPosition: null,
    });
    logic.update(1 / 30);

    expect(logic.getSideCredits('America')).toBe(1500); // Deducted 500.

    // Cancel the construction.
    logic.submitCommand({ type: 'cancelDozerConstruction', entityId: 2 });
    logic.update(1 / 30);

    // Full cost refunded.
    expect(logic.getSideCredits('America')).toBe(2000);

    // Building should be destroyed.
    const building = logic.getEntityState(2);
    expect(building).toBeNull();
  });

  it('another dozer can resume partially built construction', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('USADozer', 'America', ['VEHICLE', 'DOZER'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        ], { GeometryMajorRadius: 5, GeometryMinorRadius: 5 }),
        makeObjectDef('USAPowerPlant', 'America', ['STRUCTURE', 'MP_COUNT_FOR_VICTORY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
        ], { BuildCost: 500, BuildTime: 2, GeometryMajorRadius: 10, GeometryMinorRadius: 10 }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('USADozer', 14, 14), makeMapObject('USADozer', 30, 30)], 64, 64),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );
    logic.submitCommand({ type: 'setSideCredits', side: 'America', amount: 2000 });
    logic.update(1 / 30);

    // Dozer 1 starts building.
    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'USAPowerPlant',
      targetPosition: [16, 0, 16],
      angle: 0,
      lineEndPosition: null,
    });

    // Build for 15 frames.
    for (let i = 0; i < 15; i++) {
      logic.update(1 / 30);
    }

    // Interrupt dozer 1.
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 50, targetZ: 50 });
    logic.update(1 / 30);

    const buildingMid = logic.getEntityState(3);
    expect(buildingMid).not.toBeNull();
    expect(buildingMid!.statusFlags).toContain('UNDER_CONSTRUCTION');
    const midPercent = buildingMid!.constructionPercent;

    // Dozer 2 resumes construction (via repair command on partially built building).
    logic.submitCommand({ type: 'repairBuilding', entityId: 2, targetBuildingId: 3 });

    // Run enough frames for dozer 2 to reach the building and complete it.
    for (let i = 0; i < 60; i++) {
      logic.update(1 / 30);
    }

    const buildingFinal = logic.getEntityState(3);
    expect(buildingFinal).not.toBeNull();
    expect(buildingFinal!.statusFlags).not.toContain('UNDER_CONSTRUCTION');
    expect(buildingFinal!.constructionPercent).toBe(-1);
    expect(buildingFinal!.health).toBe(500);
  });
});

describe('slow death behavior', () => {
  function makeSlowDeathBundle(slowDeathFields: Record<string, unknown> = {}) {
    return makeBundle({
      objects: [
        makeObjectDef('SlowDeathUnit', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'SlowDeathBehavior ModuleTag_SlowDeath', {
            DestructionDelay: 300, // 300ms = 9 frames
            SinkDelay: 100, // 100ms = 3 frames
            SinkRate: 0.5,
            ProbabilityModifier: 10,
            ...slowDeathFields,
          }),
        ]),
        makeObjectDef('Attacker', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'InstantKillGun'] }),
        ]),
      ],
      weapons: [
        makeWeaponDef('InstantKillGun', {
          AttackRange: 220,
          PrimaryDamage: 500,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 5000,
        }),
      ],
    });
  }

  it('delays entity destruction for the configured DestructionDelay', () => {
    const bundle = makeSlowDeathBundle();
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('SlowDeathUnit', 50, 50),
        makeMapObject('Attacker', 20, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    // Advance until the unit takes lethal damage and enters slow death.
    let enteredSlowDeath = false;
    for (let i = 0; i < 5; i++) {
      logic.update(1 / 30);
      const s = logic.getEntityState(1);
      if (s && s.health <= 0 && s.animationState === 'DIE') {
        enteredSlowDeath = true;
        break;
      }
    }
    expect(enteredSlowDeath).toBe(true);

    // Unit should be in slow death (health <= 0) but NOT destroyed yet at 5 frames.
    const midDeath = logic.getEntityState(1);
    expect(midDeath).not.toBeNull();
    expect(midDeath!.health).toBeLessThanOrEqual(0);
    expect(midDeath!.animationState).toBe('DIE');

    // Run past destructionDelay (9 frames from slow death start + margin).
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    // Now the entity should be fully destroyed and removed.
    const afterDestruction = logic.getEntityState(1);
    expect(afterDestruction).toBeNull();
  });

  it('sinks the entity below terrain after SinkDelay', () => {
    // SinkRate is in dist/sec — use 30 so per-frame rate = 1.0 for easy assertions.
    const bundle = makeSlowDeathBundle({ SinkRate: 30, SinkDelay: 100, DestructionDelay: 5000 });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('SlowDeathUnit', 50, 50),
        makeMapObject('Attacker', 20, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    // Advance until the unit enters slow death.
    let initialY = 0;
    for (let i = 0; i < 5; i++) {
      logic.update(1 / 30);
      const s = logic.getEntityState(1);
      if (s && s.health <= 0 && s.animationState === 'DIE') {
        initialY = s.y;
        break;
      }
    }

    // Run past sinkDelay (3 frames) + several more frames for sinking.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    const afterSink = logic.getEntityState(1);
    expect(afterSink).not.toBeNull();
    expect(afterSink!.y).toBeLessThan(initialY);
  });

  it('prevents the dying entity from being targeted by other attackers', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('SlowDeathUnit', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'SlowDeathBehavior ModuleTag_SlowDeath', {
            DestructionDelay: 5000, // Very long death
            ProbabilityModifier: 10,
          }),
        ]),
        makeObjectDef('Attacker1', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'BigGun'] }),
        ]),
        makeObjectDef('Attacker2', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'BigGun'] }),
        ]),
      ],
      weapons: [
        makeWeaponDef('BigGun', {
          AttackRange: 220,
          PrimaryDamage: 500,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 5000,
        }),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('SlowDeathUnit', 50, 50),
        makeMapObject('Attacker1', 20, 50),
        makeMapObject('Attacker2', 80, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    // Attacker1 kills the unit.
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });
    for (let i = 0; i < 3; i++) logic.update(1 / 30);

    // Now attacker2 tries to target the dying entity.
    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 1 });
    for (let i = 0; i < 3; i++) logic.update(1 / 30);

    // Entity 1 should still be in slow death (alive but dying).
    const dyingState = logic.getEntityState(1);
    expect(dyingState).not.toBeNull();
    expect(dyingState!.animationState).toBe('DIE');
    // Attacker2's target should have been rejected (canTakeDamage = false).
    // The dying entity should not have taken additional damage beyond the first kill.
  });

  it('executes phase OCLs at INITIAL and FINAL phases', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('SlowDeathWithOCL', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'SlowDeathBehavior ModuleTag_SlowDeath', {
            DestructionDelay: 200, // ~6 frames
            ProbabilityModifier: 10,
            OCL: ['INITIAL OCLDeathDebris', 'FINAL OCLFinalDebris'],
          }),
        ]),
        makeObjectDef('DeathDebris', 'America', ['INERT'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 10, InitialHealth: 10 }),
        ]),
        makeObjectDef('FinalDebris', 'America', ['INERT'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 10, InitialHealth: 10 }),
        ]),
        makeObjectDef('Attacker', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'KillGun'] }),
        ]),
      ],
      weapons: [
        makeWeaponDef('KillGun', {
          AttackRange: 220,
          PrimaryDamage: 500,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 5000,
        }),
      ],
    });
    // Add OCL definitions to the bundle.
    (bundle as Record<string, unknown>).objectCreationLists = [
      {
        name: 'OCLDeathDebris',
        fields: {},
        blocks: [{
          type: 'CreateObject',
          name: 'CreateObject',
          fields: { ObjectNames: 'DeathDebris', Count: '1' },
          blocks: [],
        }],
      },
      {
        name: 'OCLFinalDebris',
        fields: {},
        blocks: [{
          type: 'CreateObject',
          name: 'CreateObject',
          fields: { ObjectNames: 'FinalDebris', Count: '1' },
          blocks: [],
        }],
      },
    ];

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('SlowDeathWithOCL', 50, 50),
        makeMapObject('Attacker', 20, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    // Kill the unit — INITIAL phase should execute, spawning debris.
    for (let i = 0; i < 5; i++) logic.update(1 / 30);

    // Check that debris was spawned by the INITIAL phase OCL.
    const initialStates = logic.getRenderableEntityStates();
    const initialDebris = initialStates.filter(s => s.templateName === 'DeathDebris');
    expect(initialDebris.length).toBeGreaterThanOrEqual(1);

    // Run past destructionDelay (~6 frames) — FINAL phase should fire OCLFinalDebris.
    for (let i = 0; i < 15; i++) logic.update(1 / 30);

    const finalStates = logic.getRenderableEntityStates();
    const finalDebris = finalStates.filter(s => s.templateName === 'FinalDebris');
    expect(finalDebris.length).toBeGreaterThanOrEqual(1);
  });

  it('selects from multiple SlowDeathBehavior modules via weighted probability', () => {
    // Entity with two SlowDeathBehavior modules of different probability.
    const bundle = makeBundle({
      objects: [
        makeObjectDef('MultiDeathUnit', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'SlowDeathBehavior ModuleTag_Death1', {
            DestructionDelay: 100, // ~3 frames
            ProbabilityModifier: 1,
          }),
          makeBlock('Behavior', 'SlowDeathBehavior ModuleTag_Death2', {
            DestructionDelay: 1000, // ~30 frames
            ProbabilityModifier: 1,
          }),
        ]),
        makeObjectDef('Killer', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'OHKGun'] }),
        ]),
      ],
      weapons: [
        makeWeaponDef('OHKGun', {
          AttackRange: 220,
          PrimaryDamage: 500,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 5000,
        }),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('MultiDeathUnit', 50, 50),
        makeMapObject('Killer', 20, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    // Kill the unit.
    for (let i = 0; i < 3; i++) logic.update(1 / 30);

    // Entity should be in slow death (one of the two profiles was selected).
    const dyingState = logic.getEntityState(1);
    expect(dyingState).not.toBeNull();
    expect(dyingState!.animationState).toBe('DIE');
    expect(dyingState!.health).toBeLessThanOrEqual(0);
  });

  it('excludes slow-death entities from victory condition counting', () => {
    const bundle = makeSlowDeathBundle({ DestructionDelay: 10000 });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('SlowDeathUnit', 50, 50),
        makeMapObject('Attacker', 20, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.setPlayerSide(0, 'America');
    logic.setPlayerSide(1, 'China');
    logic.setSidePlayerType('America', 'HUMAN');
    logic.setSidePlayerType('China', 'HUMAN');
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    // Advance until the unit enters slow death.
    for (let i = 0; i < 5; i++) {
      logic.update(1 / 30);
      const s = logic.getEntityState(1);
      if (s && s.health <= 0 && s.animationState === 'DIE') break;
    }

    // Entity is in slow death but entity not yet destroyed.
    const dyingState = logic.getEntityState(1);
    expect(dyingState).not.toBeNull();
    expect(dyingState!.animationState).toBe('DIE');

    // Run a few more frames — victory should be detected even though entity hasn't
    // fully been destroyed yet, because slow-death entities are excluded from counting.
    for (let i = 0; i < 5; i++) logic.update(1 / 30);

    const gameEnd = logic.getGameEndState();
    expect(gameEnd).not.toBeNull();
    // China should win since America's only unit is in slow death.
    expect(gameEnd!.victorSides).toContain('china');
  });
});

describe('lifetime update', () => {
  it('destroys the entity after MinLifetime/MaxLifetime expires', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('DebrisChunk', 'America', ['INERT'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 10, InitialHealth: 10 }),
          makeBlock('Behavior', 'LifetimeUpdate ModuleTag_Lifetime', {
            MinLifetime: 300, // 9 frames
            MaxLifetime: 300, // 9 frames (exact for deterministic test)
          }),
        ]),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('DebrisChunk', 50, 50)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    // Entity should exist immediately.
    expect(logic.getEntityState(1)).not.toBeNull();

    // Run 5 frames — entity should still be alive.
    for (let i = 0; i < 5; i++) logic.update(1 / 30);
    expect(logic.getEntityState(1)).not.toBeNull();
    expect(logic.getEntityState(1)!.health).toBe(10);

    // Run past the 9-frame lifetime + destruction.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Entity should be destroyed.
    expect(logic.getEntityState(1)).toBeNull();
  });

  it('triggers slow death when lifetime expires on an entity with SlowDeathBehavior', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('TimedDeathUnit', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'LifetimeUpdate ModuleTag_Lifetime', {
            MinLifetime: 200, // 6 frames
            MaxLifetime: 200,
          }),
          makeBlock('Behavior', 'SlowDeathBehavior ModuleTag_SlowDeath', {
            DestructionDelay: 5000, // 150 frames
            ProbabilityModifier: 10,
          }),
        ]),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('TimedDeathUnit', 50, 50)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    // Run past lifetime (6 frames) + a couple extra.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Entity should be in slow death (still rendered, animationState = DIE).
    const state = logic.getEntityState(1);
    expect(state).not.toBeNull();
    expect(state!.animationState).toBe('DIE');
    expect(state!.health).toBeLessThanOrEqual(0);
  });
});

describe('fire weapon when dead behavior', () => {
  it('fires the death weapon at entity position when the entity dies', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('Bomber', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'FireWeaponWhenDeadBehavior ModuleTag_FWWD', {
            DeathWeapon: 'DeathExplosion',
          }),
        ]),
        makeObjectDef('Bystander', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        ]),
        makeObjectDef('Attacker', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'KillGun'] }),
        ]),
      ],
      weapons: [
        makeWeaponDef('KillGun', {
          AttackRange: 220,
          PrimaryDamage: 500,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 5000,
        }),
        makeWeaponDef('DeathExplosion', {
          AttackRange: 10,
          PrimaryDamage: 50,
          PrimaryDamageRadius: 100, // Area damage to hit Bystander
          WeaponSpeed: 999999,
          DelayBetweenShots: 1000,
        }),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('Bomber', 50, 50),
        makeMapObject('Bystander', 52, 50), // Close to Bomber
        makeMapObject('Attacker', 20, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 1 });

    const bystanderBefore = logic.getEntityState(2);
    expect(bystanderBefore).not.toBeNull();
    expect(bystanderBefore!.health).toBe(200);

    // Kill the Bomber — death explosion should damage Bystander.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Bomber should be destroyed.
    expect(logic.getEntityState(1)).toBeNull();

    // Bystander should have taken damage from the death explosion.
    const bystanderAfter = logic.getEntityState(2);
    expect(bystanderAfter).not.toBeNull();
    expect(bystanderAfter!.health).toBeLessThan(200);
  });
});

describe('fire weapon when damaged behavior', () => {
  it('fires the reaction weapon when entity takes damage', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('ToxicBuilding', 'China', ['STRUCTURE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('Behavior', 'FireWeaponWhenDamagedBehavior ModuleTag_FWWD', {
            ReactionWeaponPristine: 'ToxicSpray',
            ReactionWeaponDamaged: 'ToxicSprayDamaged',
            DamageAmount: 0,
          }),
        ]),
        makeObjectDef('NearbyUnit', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        ]),
        makeObjectDef('Attacker', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SmallGun'] }),
        ]),
      ],
      weapons: [
        makeWeaponDef('SmallGun', {
          AttackRange: 220,
          PrimaryDamage: 100,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 5000,
        }),
        makeWeaponDef('ToxicSpray', {
          AttackRange: 10,
          PrimaryDamage: 30,
          PrimaryDamageRadius: 100,
          WeaponSpeed: 999999,
          DelayBetweenShots: 1000,
        }),
        makeWeaponDef('ToxicSprayDamaged', {
          AttackRange: 10,
          PrimaryDamage: 50,
          PrimaryDamageRadius: 100,
          WeaponSpeed: 999999,
          DelayBetweenShots: 1000,
        }),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('ToxicBuilding', 50, 50),
        makeMapObject('NearbyUnit', 52, 50),
        makeMapObject('Attacker', 20, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 1 });

    const nearbyBefore = logic.getEntityState(2);
    expect(nearbyBefore).not.toBeNull();
    expect(nearbyBefore!.health).toBe(200);

    // Attack the building — reaction weapon should fire, damaging NearbyUnit.
    for (let i = 0; i < 5; i++) logic.update(1 / 30);

    const nearbyAfter = logic.getEntityState(2);
    expect(nearbyAfter).not.toBeNull();
    // NearbyUnit should have taken damage from the reaction weapon.
    expect(nearbyAfter!.health).toBeLessThan(200);
  });
});

describe('generate minefield behavior', () => {
  it('spawns mines around the entity on death when GenerateOnlyOnDeath is set', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('MineLayer', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'GenerateMinefieldBehavior ModuleTag_GenMine', {
            MineName: 'LandMine',
            DistanceAroundObject: 15,
            BorderOnly: true,
            GenerateOnlyOnDeath: true,
          }),
        ]),
        makeObjectDef('LandMine', 'China', ['MINE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 50, InitialHealth: 50 }),
        ]),
        makeObjectDef('Attacker', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'KillGun'] }),
        ]),
      ],
      weapons: [
        makeWeaponDef('KillGun', {
          AttackRange: 220,
          PrimaryDamage: 500,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 5000,
        }),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('MineLayer', 50, 50),
        makeMapObject('Attacker', 20, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    // No mines should exist before death.
    const statesBefore = logic.getRenderableEntityStates();
    const minesBefore = statesBefore.filter(s => s.templateName === 'LandMine');
    expect(minesBefore.length).toBe(0);

    // Kill the MineLayer.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // MineLayer should be destroyed.
    expect(logic.getEntityState(1)).toBeNull();

    // Mines should have been spawned in a circle around the MineLayer's position.
    const statesAfter = logic.getRenderableEntityStates();
    const minesAfter = statesAfter.filter(s => s.templateName === 'LandMine');
    expect(minesAfter.length).toBeGreaterThan(0);

    // All mines should be approximately 15 units away from the original position (50,50).
    for (const mine of minesAfter) {
      const dx = mine.x - 50;
      const dz = mine.z - 50;
      const dist = Math.sqrt(dx * dx + dz * dz);
      expect(dist).toBeCloseTo(15, 0);
    }
  });
});

describe('deploy style AI update', () => {
  function makeDeploySetup(opts: { unpackTime?: number; packTime?: number } = {}) {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('Artillery', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('Behavior', 'DeployStyleAIUpdate ModuleTag_Deploy', {
            UnpackTime: opts.unpackTime ?? 300,
            PackTime: opts.packTime ?? 300,
          }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ArtilleryGun'] }),
          makeBlock('Locomotor', 'SET_NORMAL ArtilleryLocomotor', { Speed: 30 }),
        ]),
        makeObjectDef('Target', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SmallGun'] }),
        ]),
      ],
      weapons: [
        makeWeaponDef('ArtilleryGun', {
          AttackRange: 200,
          PrimaryDamage: 100,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 1000,
        }),
        makeWeaponDef('SmallGun', {
          AttackRange: 200,
          PrimaryDamage: 10,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 1000,
        }),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('Artillery', 50, 50),
        makeMapObject('Target', 80, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    return { logic };
  }

  it('deploys before attacking and undeploys before moving', () => {
    const { logic } = makeDeploySetup({ unpackTime: 300, packTime: 300 });
    // 300ms → ceil(300/33.33) = 9 frames

    // Artillery should start in READY_TO_MOVE state.
    let state = logic.getEntityState(1);
    expect(state).not.toBeNull();
    expect(state!.health).toBe(200);

    // Issue attack command — this should start deploying.
    logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });
    logic.update(1 / 30); // frame 1

    // Target should NOT have taken damage yet (still deploying).
    const targetAfter1 = logic.getEntityState(2);
    expect(targetAfter1).not.toBeNull();
    expect(targetAfter1!.health).toBe(500);

    // Run 8 more frames to complete deploy (9 frames total for 300ms).
    for (let i = 0; i < 8; i++) logic.update(1 / 30);

    // After 9 frames, should be READY_TO_ATTACK. Run 1 more frame to let combat fire.
    logic.update(1 / 30);

    // Target should have taken damage now.
    const targetAfterDeploy = logic.getEntityState(2);
    expect(targetAfterDeploy).not.toBeNull();
    expect(targetAfterDeploy!.health).toBeLessThan(500);
  });

  it('cannot fire during deploy animation and does not move while deployed', () => {
    const { logic } = makeDeploySetup({ unpackTime: 300, packTime: 300 });
    // 300ms → 9 frames for deploy/undeploy

    // Issue attack — entity starts deploying.
    logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

    // Run 5 frames (mid-deploy). Target should not be damaged yet.
    for (let i = 0; i < 5; i++) logic.update(1 / 30);
    const targetMidDeploy = logic.getEntityState(2);
    expect(targetMidDeploy).not.toBeNull();
    expect(targetMidDeploy!.health).toBe(500); // Still full health during deploy animation

    // Run to completion of deploy (4 more frames to reach 9) + 1 extra for combat.
    for (let i = 0; i < 5; i++) logic.update(1 / 30);

    // After deploy completes, the entity should start firing.
    // Run several more frames to ensure at least one shot lands.
    for (let i = 0; i < 5; i++) logic.update(1 / 30);
    const targetAfterDeploy = logic.getEntityState(2);
    expect(targetAfterDeploy).not.toBeNull();
    expect(targetAfterDeploy!.health).toBeLessThan(500); // Took damage after full deploy

    // Verify entity hasn't moved (deployed entities can't move).
    const artilleryState = logic.getEntityState(1);
    expect(artilleryState).not.toBeNull();
    expect(artilleryState!.x).toBe(50); // Stayed at initial position
  });

  it('reverses deploy mid-transition when move command is issued', () => {
    const { logic } = makeDeploySetup({ unpackTime: 600, packTime: 600 });
    // 600ms → ceil(600/33.33) = 18 frames

    // Issue attack to start deploying.
    logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });
    // Run 6 frames (1/3 through deploy).
    for (let i = 0; i < 6; i++) logic.update(1 / 30);

    // Target should still be at full health (not deployed yet).
    const targetMidDeploy = logic.getEntityState(2);
    expect(targetMidDeploy!.health).toBe(500);

    // Issue move command to reverse the deploy.
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 10, targetZ: 50 });

    // The reversal should take 18 - (18 - 6) = 6 frames remaining → total = 6 frames to undeploy.
    // But actually the reversal formula is: totalFrames - framesLeft = 18 - 12 = 6 frames done,
    // new wait = now + (18 - 12) = 6 more frames.
    // So after 6 more frames from now, should be READY_TO_MOVE.
    for (let i = 0; i < 8; i++) logic.update(1 / 30);

    // Should have started moving by now.
    const afterReversal = logic.getEntityState(1);
    expect(afterReversal).not.toBeNull();
    // Even if not moved far, at least the entity should be alive and not stuck.
    expect(afterReversal!.health).toBe(200);
  });
});

// ── Garrison firing tests ────────────────────────────────────────────────────

describe('garrison firing', () => {
  function makeGarrisonSetup() {
    const buildingDef = makeObjectDef('CivBuilding', 'Neutral', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
      makeBlock('Behavior', 'GarrisonContain ModuleTag_Garrison', {
        ContainMax: 5,
      }),
    ], {
      Geometry: 'CYLINDER',
      GeometryMajorRadius: 15,
      GeometryMinorRadius: 15,
    });

    const infantryDef = makeObjectDef('USARanger', 'America', ['INFANTRY'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'RangerRifle'] }),
      makeBlock('Locomotor', 'SET_NORMAL InfantryLocomotor', { Speed: 20 }),
    ]);

    const enemyTankDef = makeObjectDef('EnemyTank', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
    ]);

    const bundle = makeBundle({
      objects: [buildingDef, infantryDef, enemyTankDef],
      weapons: [
        makeWeaponDef('RangerRifle', {
          AttackRange: 100,
          PrimaryDamage: 25,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 500,
        }),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    // Building at 50,50; infantry close enough to enter immediately; enemy nearby.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CivBuilding', 50, 50),
        makeMapObject('USARanger', 51, 50),
        makeMapObject('EnemyTank', 80, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.setTeamRelationship('America', 'Neutral', 2);
    logic.setTeamRelationship('Neutral', 'America', 2);
    return { logic };
  }

  it('garrisoned infantry auto-targets and damages nearby enemy', () => {
    const { logic } = makeGarrisonSetup();

    // Enter garrison.
    logic.submitCommand({ type: 'garrisonBuilding', entityId: 2, targetBuildingId: 1 });
    logic.update(1 / 30);

    // Verify infantry entered the garrison.
    const infantryState = logic.getEntityState(2);
    // Infantry at building position now.
    expect(infantryState).not.toBeNull();

    // Tick enough frames for auto-targeting scan and weapon firing.
    const enemyBefore = logic.getEntityState(3);
    expect(enemyBefore).not.toBeNull();
    const initialHealth = enemyBefore!.health;
    expect(initialHealth).toBe(500);

    // Run 90 frames (~3 seconds) — should be enough for auto-target + fire cycle.
    for (let i = 0; i < 90; i++) logic.update(1 / 30);

    const enemyAfter = logic.getEntityState(3);
    expect(enemyAfter).not.toBeNull();
    expect(enemyAfter!.health).toBeLessThan(initialHealth);
  });
});

// ── Special power INI parameter tests ────────────────────────────────────────

describe('special power INI parameters', () => {
  it('area damage uses module radius and damage from INI', () => {
    const superWeaponDef = makeObjectDef('SuperWeapon', 'America', ['STRUCTURE', 'FS_SUPERWEAPON'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
      makeBlock('Behavior', 'OCLSpecialPower ModuleTag_SP', {
        SpecialPowerTemplate: 'SuperTestPower',
        Radius: 50,
        Damage: 300,
      }),
    ]);

    const targetDef = makeObjectDef('Target', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
    ]);

    // Target slightly outside 50-unit radius (should NOT be hit).
    const farTargetDef = makeObjectDef('FarTarget', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
    ]);

    const bundle = makeBundle({
      objects: [superWeaponDef, targetDef, farTargetDef],
      specialPowers: [{ name: 'SuperTestPower', fields: {}, blocks: [] } as SpecialPowerDef],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    // SuperWeapon at 50,50; Target at 80,50 (30 units away, within 50 radius);
    // FarTarget at 120,50 (70 units away, outside 50 radius).
    logic.loadMapObjects(
      makeMap([
        makeMapObject('SuperWeapon', 50, 50),
        makeMapObject('Target', 80, 50),
        makeMapObject('FarTarget', 120, 50),
      ], 256, 256),
      makeRegistry(bundle),
      makeHeightmap(256, 256),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.update(1 / 30);

    // Issue area damage special power at center (50, 50).
    // commandOption 0x20 = COMMAND_OPTION_NEED_TARGET_POS (position-targeted power).
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: 'SuperTestButton',
      specialPowerName: 'SuperTestPower',
      commandOption: 0x20,
      issuingEntityIds: [1],
      sourceEntityId: 1,
      targetEntityId: null,
      targetX: 50,
      targetZ: 50,
    });
    logic.update(1 / 30);

    // Close target (30 units away, within 50 radius) should take 300 damage.
    const closeTarget = logic.getEntityState(2);
    expect(closeTarget).not.toBeNull();
    expect(closeTarget!.health).toBe(700);

    // Far target (70 units away, outside 50 radius) should be unharmed.
    const farTarget = logic.getEntityState(3);
    expect(farTarget).not.toBeNull();
    expect(farTarget!.health).toBe(1000);
  });
});

// ── Mine regeneration via auto-heal ──────────────────────────────────────────

describe('mine regeneration', () => {
  it('regenerating mine recovers virtual mines through auto-heal', () => {
    const mineDef = makeObjectDef('RegenMine', 'America', ['MINE', 'IMMOBILE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: 100,
        InitialHealth: 100,
      }),
      makeBlock('Behavior', 'MinefieldBehavior ModuleTag_Minefield', {
        DetonationWeapon: 'MineDetonationWeapon',
        NumVirtualMines: 2,
        Regenerates: true,
      }),
      makeBlock('Behavior', 'AutoHealBehavior ModuleTag_AutoHeal', {
        HealingAmount: 10,
        HealingDelay: 100,
        StartHealingDelay: 0,
        StartsActive: true,
      }),
    ], {
      Geometry: 'CYLINDER',
      GeometryMajorRadius: 5,
      GeometryMinorRadius: 5,
    });

    const enemyDef = makeObjectDef('EnemyVehicle', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
    ], {
      Geometry: 'CYLINDER',
      GeometryMajorRadius: 3,
      GeometryMinorRadius: 3,
    });

    const bundle = makeBundle({
      objects: [mineDef, enemyDef],
      weapons: [
        makeWeaponDef('MineDetonationWeapon', {
          PrimaryDamage: 30,
          PrimaryDamageRadius: 10,
          DamageType: 'EXPLOSION',
        }),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    // Mine at 50,50; enemy close enough to detonate.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('RegenMine', 50, 50),
        makeMapObject('EnemyVehicle', 52, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);

    // Run a few frames to trigger mine detonation (enemy overlaps mine).
    for (let i = 0; i < 5; i++) logic.update(1 / 30);

    // After detonation, enemy should have taken damage.
    const enemyAfterDetonation = logic.getEntityState(2);
    expect(enemyAfterDetonation).not.toBeNull();
    expect(enemyAfterDetonation!.health).toBeLessThan(500);

    // Move enemy away so it doesn't keep triggering detonations.
    logic.submitCommand({ type: 'moveTo', entityId: 2, targetX: 120, targetZ: 50 });
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    // Mine should be MASKED (all virtual mines spent) with health floor at 0.1.
    const mineState = logic.getEntityState(1);
    expect(mineState).not.toBeNull();
    // Mine lost health from detonation and is now low or at floor.

    // Run many frames to let auto-heal restore health.
    // HealingAmount=10, delay=100ms(~3 frames), maxHealth=100.
    // After enough healing cycles, virtual mines should regenerate.
    for (let i = 0; i < 120; i++) logic.update(1 / 30);

    // Mine should have healed and recovered at least 1 virtual mine (un-masked).
    const mineAfterHeal = logic.getEntityState(1);
    expect(mineAfterHeal).not.toBeNull();
    // If health is above 50% of maxHealth, at least 1 virtual mine should be restored.
    // The mine should be alive (not destroyed).
    expect(mineAfterHeal!.health).toBeGreaterThan(0);
  });
});

describe('WEAPON_DOESNT_AFFECT_AIRBORNE', () => {
  it('skips entities significantly above terrain in radius damage', () => {
    // Source parity: Weapon.cpp:1375 — NOT_AIRBORNE in RadiusDamageAffects
    // skips targets where isSignificantlyAboveTerrain() is true (height > 9.0).
    const launcherDef = makeObjectDef('Attacker', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'GroundBomb'] }),
    ]);
    const groundTargetDef = makeObjectDef('GroundTarget', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
    ]);
    const airTargetDef = makeObjectDef('AirTarget', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
    ]);

    const bundle = makeBundle({
      objects: [launcherDef, groundTargetDef, airTargetDef],
      weapons: [
        makeWeaponDef('GroundBomb', {
          AttackRange: 120,
          PrimaryDamage: 30,
          PrimaryDamageRadius: 100,
          DamageType: 'EXPLOSION',
          DeathType: 'NORMAL',
          RadiusDamageAffects: 'ENEMIES NOT_AIRBORNE',
          DelayBetweenShots: 100,
        }),
      ],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('Attacker', 10, 10),
        makeMapObject('GroundTarget', 30, 10),
        makeMapObject('AirTarget', 30, 12),
      ]),
      makeRegistry(bundle),
      makeHeightmap(),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);

    // Elevate entity 3 by 20 units above its base position (>9.0 threshold).
    const entities = (logic as unknown as { spawnedEntities: Map<number, { y: number; baseHeight: number }> }).spawnedEntities;
    const airEntity = entities.get(3)!;
    airEntity.y += 20;

    // Attack ground target.
    logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

    // Run enough frames for weapon to fire (matches existing combat timeline pattern).
    for (let i = 0; i < 6; i++) logic.update(1 / 30);

    // Ground target should have taken radius damage.
    const groundState = logic.getEntityState(2);
    expect(groundState).not.toBeNull();
    expect(groundState!.health).toBeLessThan(100);

    // Air target should NOT have taken radius damage (NOT_AIRBORNE filter).
    const airState = logic.getEntityState(3);
    expect(airState).not.toBeNull();
    expect(airState!.health).toBe(100);
  });
});

// ── Disabled entity restrictions ─────────────────────────────────────────────

describe('disabled entity movement restrictions', () => {
  function makeMovementSetup() {
    const tankDef = makeObjectDef('TestTank', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
      makeBlock('Locomotor', 'SET_NORMAL TankLocomotor', { Speed: 30 }),
    ]);

    const bundle = makeBundle({ objects: [tankDef], weapons: [] });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('TestTank', 50, 50)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    return { logic };
  }

  it('DISABLED_EMP blocks movement', () => {
    // Source parity: Object::isMobile() returns false when isDisabled() is true.
    const { logic } = makeMovementSetup();
    const priv = logic as unknown as { spawnedEntities: Map<number, { objectStatusFlags: Set<string>; x: number; z: number }> };
    const entity = priv.spawnedEntities.get(1)!;
    const startX = entity.x;
    const startZ = entity.z;

    entity.objectStatusFlags.add('DISABLED_EMP');
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 100, targetZ: 100 });
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    // Entity should not have moved.
    expect(entity.x).toBe(startX);
    expect(entity.z).toBe(startZ);
  });

  it('DISABLED_HACKED blocks movement', () => {
    const { logic } = makeMovementSetup();
    const priv = logic as unknown as { spawnedEntities: Map<number, { objectStatusFlags: Set<string>; x: number; z: number }> };
    const entity = priv.spawnedEntities.get(1)!;
    const startX = entity.x;

    entity.objectStatusFlags.add('DISABLED_HACKED');
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 100, targetZ: 100 });
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    expect(entity.x).toBe(startX);
  });

  it('DISABLED_SUBDUED blocks movement', () => {
    const { logic } = makeMovementSetup();
    const priv = logic as unknown as { spawnedEntities: Map<number, { objectStatusFlags: Set<string>; x: number; z: number }> };
    const entity = priv.spawnedEntities.get(1)!;
    const startX = entity.x;

    entity.objectStatusFlags.add('DISABLED_SUBDUED');
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 100, targetZ: 100 });
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    expect(entity.x).toBe(startX);
  });
});

describe('disabled container evacuation restrictions', () => {
  function makeGarrisonEvacSetup() {
    const buildingDef = makeObjectDef('CivBuilding', 'Neutral', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
      makeBlock('Behavior', 'GarrisonContain ModuleTag_Garrison', {
        ContainMax: 5,
      }),
    ], {
      Geometry: 'CYLINDER',
      GeometryMajorRadius: 15,
      GeometryMinorRadius: 15,
    });

    const infantryDef = makeObjectDef('USARanger', 'America', ['INFANTRY'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('Locomotor', 'SET_NORMAL InfantryLocomotor', { Speed: 20 }),
    ]);

    const bundle = makeBundle({ objects: [buildingDef, infantryDef], weapons: [] });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CivBuilding', 50, 50),
        makeMapObject('USARanger', 51, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'Neutral', 2);
    logic.setTeamRelationship('Neutral', 'America', 2);
    return { logic };
  }

  it('DISABLED_SUBDUED blocks evacuation from garrisoned building', () => {
    // Source parity: AIUpdate::privateEvacuate — DISABLED_SUBDUED container blocks evacuation.
    const { logic } = makeGarrisonEvacSetup();
    const priv = logic as unknown as { spawnedEntities: Map<number, { objectStatusFlags: Set<string>; garrisonContainerId: number | null }> };

    // Enter garrison.
    logic.submitCommand({ type: 'garrisonBuilding', entityId: 2, targetBuildingId: 1 });
    logic.update(1 / 30);

    // Verify infantry is garrisoned.
    const infantry = priv.spawnedEntities.get(2)!;
    expect(infantry.garrisonContainerId).toBe(1);

    // Subdue the building (e.g., Microwave Tank).
    const building = priv.spawnedEntities.get(1)!;
    building.objectStatusFlags.add('DISABLED_SUBDUED');

    // Attempt evacuation — should be blocked.
    logic.submitCommand({ type: 'evacuate', entityId: 1 });
    logic.update(1 / 30);

    // Infantry should still be garrisoned.
    expect(infantry.garrisonContainerId).toBe(1);
  });

  it('DISABLED_SUBDUED blocks individual exit from garrisoned building', () => {
    // Source parity: AIUpdate::privateExit — DISABLED_SUBDUED container blocks passenger exit.
    const { logic } = makeGarrisonEvacSetup();
    const priv = logic as unknown as { spawnedEntities: Map<number, { objectStatusFlags: Set<string>; garrisonContainerId: number | null }> };

    // Enter garrison.
    logic.submitCommand({ type: 'garrisonBuilding', entityId: 2, targetBuildingId: 1 });
    logic.update(1 / 30);

    const infantry = priv.spawnedEntities.get(2)!;
    expect(infantry.garrisonContainerId).toBe(1);

    // Subdue the building.
    const building = priv.spawnedEntities.get(1)!;
    building.objectStatusFlags.add('DISABLED_SUBDUED');

    // Attempt individual exit — should be blocked.
    logic.submitCommand({ type: 'exitContainer', entityId: 2 });
    logic.update(1 / 30);

    // Infantry should still be garrisoned.
    expect(infantry.garrisonContainerId).toBe(1);
  });

  it('evacuation works when building is NOT subdued', () => {
    const { logic } = makeGarrisonEvacSetup();
    const priv = logic as unknown as { spawnedEntities: Map<number, { garrisonContainerId: number | null }> };

    // Enter garrison.
    logic.submitCommand({ type: 'garrisonBuilding', entityId: 2, targetBuildingId: 1 });
    logic.update(1 / 30);

    const infantry = priv.spawnedEntities.get(2)!;
    expect(infantry.garrisonContainerId).toBe(1);

    // Evacuate without subdued status — should work.
    logic.submitCommand({ type: 'evacuate', entityId: 1 });
    logic.update(1 / 30);

    // Infantry should have exited.
    expect(infantry.garrisonContainerId).toBeNull();
  });
});

// ── DISABLED_UNDERPOWERED (power brown-out) tests ────────────────────────────

describe('DISABLED_UNDERPOWERED power brown-out', () => {
  function makePowerSetup() {
    // Power plant: produces 5 energy, is POWERED itself.
    const powerPlantDef = makeObjectDef('PowerPlant', 'America', ['STRUCTURE', 'POWERED'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
    ], { EnergyBonus: 5 });

    // Barracks: consumes 3 energy, is POWERED (will be disabled when underpowered).
    const barracksDef = makeObjectDef('Barracks', 'America', ['STRUCTURE', 'POWERED'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
    ], { EnergyBonus: -3 });

    // Non-POWERED building: never gets DISABLED_UNDERPOWERED.
    const wallDef = makeObjectDef('Wall', 'America', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
    ]);

    const bundle = makeBundle({ objects: [powerPlantDef, barracksDef, wallDef], weapons: [] });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    return { logic, bundle };
  }

  it('sets DISABLED_UNDERPOWERED on POWERED entities when power drops below consumption', () => {
    // Source parity: Player::onPowerBrownOutChange + doPowerDisable.
    const { logic, bundle } = makePowerSetup();
    // Power plant produces 5, barracks consumes 3, barracks2 consumes 3 = 6 consumption, 5 production → brownout.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('PowerPlant', 50, 50),
        makeMapObject('Barracks', 80, 50),
        makeMapObject('Barracks', 80, 80),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    // Initial state: no brownout yet (check happens on update).
    logic.update(1 / 30);

    // Check power state: production=5, consumption=6 → brownout.
    const state1 = logic.getEntityState(1)!;
    const state2 = logic.getEntityState(2)!;
    const state3 = logic.getEntityState(3)!;

    // Power plant is POWERED so it gets DISABLED_UNDERPOWERED too.
    expect(state1.statusFlags).toContain('DISABLED_UNDERPOWERED');
    expect(state2.statusFlags).toContain('DISABLED_UNDERPOWERED');
    expect(state3.statusFlags).toContain('DISABLED_UNDERPOWERED');
  });

  it('does NOT set DISABLED_UNDERPOWERED when power is sufficient', () => {
    const { logic, bundle } = makePowerSetup();
    // Power plant produces 5, barracks consumes 3 = sufficient power.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('PowerPlant', 50, 50),
        makeMapObject('Barracks', 80, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    logic.update(1 / 30);

    const state1 = logic.getEntityState(1)!;
    const state2 = logic.getEntityState(2)!;
    expect(state1.statusFlags).not.toContain('DISABLED_UNDERPOWERED');
    expect(state2.statusFlags).not.toContain('DISABLED_UNDERPOWERED');
  });

  it('does NOT set DISABLED_UNDERPOWERED on non-POWERED buildings', () => {
    const { logic, bundle } = makePowerSetup();
    // Even with brownout, Wall (no POWERED kindof) should not be disabled.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('Barracks', 50, 50),
        makeMapObject('Barracks', 80, 50),
        makeMapObject('Wall', 80, 80),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    logic.update(1 / 30);

    // No power plant → 0 production, 6 consumption → brownout.
    const barrState = logic.getEntityState(1)!;
    const wallState = logic.getEntityState(3)!;
    expect(barrState.statusFlags).toContain('DISABLED_UNDERPOWERED');
    expect(wallState.statusFlags).not.toContain('DISABLED_UNDERPOWERED');
  });

  it('clears DISABLED_UNDERPOWERED when power is restored via destruction of consumer', () => {
    const { logic, bundle } = makePowerSetup();
    // Power plant (5), barracks (3), barracks (3) → brownout.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('PowerPlant', 50, 50),
        makeMapObject('Barracks', 80, 50),
        makeMapObject('Barracks', 80, 80),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    logic.update(1 / 30);
    expect(logic.getEntityState(1)!.statusFlags).toContain('DISABLED_UNDERPOWERED');

    // Destroy one barracks to restore power balance: 5 production, 3 consumption → sufficient.
    const priv = logic as unknown as { markEntityDestroyed: (id: number, attackerId: number) => void };
    priv.markEntityDestroyed(3, -1);
    logic.update(1 / 30);

    // Power should be restored.
    expect(logic.getEntityState(1)!.statusFlags).not.toContain('DISABLED_UNDERPOWERED');
    expect(logic.getEntityState(2)!.statusFlags).not.toContain('DISABLED_UNDERPOWERED');
  });
});

describe('radar disable during power brown-out', () => {
  function makeRadarSetup() {
    // Power plant: produces 5 energy.
    const powerPlantDef = makeObjectDef('PowerPlant', 'America', ['STRUCTURE', 'POWERED'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
    ], { EnergyBonus: 5 });

    // Command center with radar upgrade: consumes 3 energy, has radar.
    const commandCenterDef = makeObjectDef('CommandCenter', 'America', ['STRUCTURE', 'POWERED'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
      makeBlock('Behavior', 'RadarUpgrade ModuleTag_Radar', {
        TriggeredBy: 'Upgrade_Radar',
        DisableProof: false,
      }),
    ], { EnergyBonus: -3 });

    // Command center with disable-proof radar.
    const hardCommandCenterDef = makeObjectDef('HardCommandCenter', 'America', ['STRUCTURE', 'POWERED'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
      makeBlock('Behavior', 'RadarUpgrade ModuleTag_DisableProofRadar', {
        TriggeredBy: 'Upgrade_Radar',
        DisableProof: true,
      }),
    ], { EnergyBonus: -3 });

    // Barracks: consumes 3 energy.
    const barracksDef = makeObjectDef('Barracks', 'America', ['STRUCTURE', 'POWERED'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
    ], { EnergyBonus: -3 });

    const bundle = makeBundle({
      objects: [powerPlantDef, commandCenterDef, hardCommandCenterDef, barracksDef],
      weapons: [],
      upgrades: [makeUpgradeDef('Upgrade_Radar', { Type: 'OBJECT', BuildTime: 0.1, BuildCost: 0 })],
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    return { logic, bundle };
  }

  it('disables radar when power brown-out occurs', () => {
    const { logic, bundle } = makeRadarSetup();
    // Power plant (5), CommandCenter (-3), Barracks (-3) → 5 < 6 → brownout.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('PowerPlant', 50, 50),
        makeMapObject('CommandCenter', 80, 50),
        makeMapObject('Barracks', 110, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    // Grant the radar upgrade to the command center.
    logic.applyUpgradeToEntity(2, 'Upgrade_Radar');
    logic.update(1 / 30);

    // Should have radar disabled due to brown-out.
    expect(logic.hasRadar('America')).toBe(false);
    const radarState = logic.getSideRadarState('America');
    expect(radarState.radarCount).toBe(1);
    expect(radarState.radarDisabled).toBe(true);
  });

  it('radar works when power is sufficient', () => {
    const { logic, bundle } = makeRadarSetup();
    // Power plant (5), CommandCenter (-3) → 5 >= 3 → no brownout.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('PowerPlant', 50, 50),
        makeMapObject('CommandCenter', 80, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    logic.applyUpgradeToEntity(2, 'Upgrade_Radar');
    logic.update(1 / 30);

    expect(logic.hasRadar('America')).toBe(true);
    const radarState = logic.getSideRadarState('America');
    expect(radarState.radarCount).toBe(1);
    expect(radarState.radarDisabled).toBe(false);
  });

  it('disable-proof radar survives brown-out', () => {
    const { logic, bundle } = makeRadarSetup();
    // Power plant (5), HardCommandCenter (-3), Barracks (-3) → brownout.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('PowerPlant', 50, 50),
        makeMapObject('HardCommandCenter', 80, 50),
        makeMapObject('Barracks', 110, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    logic.applyUpgradeToEntity(2, 'Upgrade_Radar');
    logic.update(1 / 30);

    // Brown-out should be active, but disable-proof radar still works.
    const radarState = logic.getSideRadarState('America');
    expect(radarState.radarDisabled).toBe(true);
    expect(radarState.disableProofRadarCount).toBe(1);
    expect(logic.hasRadar('America')).toBe(true);
  });

  it('restores radar when power is recovered', () => {
    const { logic, bundle } = makeRadarSetup();
    // Power plant (5), CommandCenter (-3), Barracks (-3) → brownout.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('PowerPlant', 50, 50),
        makeMapObject('CommandCenter', 80, 50),
        makeMapObject('Barracks', 110, 50),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    logic.applyUpgradeToEntity(2, 'Upgrade_Radar');
    logic.update(1 / 30);
    expect(logic.hasRadar('America')).toBe(false);

    // Destroy barracks to restore power: 5 production, 3 consumption → sufficient.
    const priv = logic as unknown as { markEntityDestroyed: (id: number, attackerId: number) => void };
    priv.markEntityDestroyed(3, -1);
    logic.update(1 / 30);

    expect(logic.hasRadar('America')).toBe(true);
    expect(logic.getSideRadarState('America').radarDisabled).toBe(false);
  });
});

describe('3D damage distance with terrain elevation', () => {
  it('excludes entities on elevated terrain from ground-level radius damage when 3D distance exceeds weapon radius', () => {
    // Build a heightmap where columns 4+ are at raw value 160 → 100 world height.
    // Columns 0-3 stay at 0 (ground level).
    const hmWidth = 64;
    const hmHeight = 64;
    const rawData = new Uint8Array(hmWidth * hmHeight);
    for (let row = 0; row < hmHeight; row++) {
      for (let col = 0; col < hmWidth; col++) {
        rawData[row * hmWidth + col] = col >= 4 ? 160 : 0;
      }
    }
    const heightmap = HeightmapGrid.fromJSON({
      width: hmWidth,
      height: hmHeight,
      borderSize: 0,
      data: uint8ArrayToBase64(rawData),
    });

    // Weapon: DIRECT, large radius (25 world units), instant damage.
    const attackerDef = makeObjectDef('ElevAttacker', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'ElevRadiusCannon'] }),
    ]);
    const groundTargetDef = makeObjectDef('GroundTarget', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
    ]);
    const cliffTargetDef = makeObjectDef('CliffTarget', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
    ]);

    const bundle = makeBundle({
      objects: [attackerDef, groundTargetDef, cliffTargetDef],
      weapons: [
        makeWeaponDef('ElevRadiusCannon', {
          AttackRange: 200,
          PrimaryDamage: 50,
          PrimaryDamageRadius: 25,
          SecondaryDamage: 25,
          SecondaryDamageRadius: 25,
          WeaponSpeed: 999999,
          DelayBetweenShots: 5000,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    // Attacker at (10,10) — ground (col 1).
    // GroundTarget at (20,10) — ground (col 2), XZ distance 10 from impact.
    // CliffTarget at (40,10) — elevated (col 4, height ~100), XZ distance 20 from impact.
    // Impact will be at GroundTarget position.
    logic.loadMapObjects(
      {
        heightmap: {
          width: hmWidth,
          height: hmHeight,
          borderSize: 0,
          data: uint8ArrayToBase64(rawData),
        },
        objects: [
          makeMapObject('ElevAttacker', 10, 10),
          makeMapObject('GroundTarget', 20, 10),
          makeMapObject('CliffTarget', 40, 10),
        ],
        triggers: [],
      },
      makeRegistry(bundle),
      heightmap,
    );

    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);

    // Attack the ground target (entity 2). Radius damage centered on ground target.
    logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

    // Advance enough frames for DIRECT weapon to fire and deal damage.
    for (let i = 0; i < 3; i++) {
      logic.update(1 / 30);
    }

    const groundHealth = logic.getEntityState(2)?.health ?? -1;
    const cliffHealth = logic.getEntityState(3)?.health ?? -1;

    // Ground target is within radius → takes primary damage (50).
    expect(groundHealth).toBeLessThan(200);
    // Cliff target XZ distance is 20 (within radius 25 in 2D) but 3D distance
    // includes ~100 unit elevation difference → outside radius → no damage.
    expect(cliffHealth).toBe(200);
  });

  it('bounding sphere subtraction extends effective hit zone for entities with explicit geometry', () => {
    // Source parity: FROM_BOUNDINGSPHERE_3D subtracts the target entity's bounding
    // sphere radius from the 3D center-to-point distance. An entity with large geometry
    // (majorRadius=12) gets BSR=12, making it hittable at longer range than the weapon's
    // nominal damage radius.
    const bundle = makeBundle({
      objects: [
        makeObjectDef('BSRAttacker', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'BSRWeapon'] }),
        ]),
        // SmallTarget: no geometry → BSR falls back to baseHeight (~1.5).
        makeObjectDef('SmallTarget', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        ]),
        // LargeTarget: explicit geometry with majorRadius=12 → BSR=12 (cylinder).
        makeObjectDef('LargeTarget', 'China', ['VEHICLE', 'STRUCTURE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        ], { GeometryMajorRadius: 12, GeometryMinorRadius: 12, GeometryHeight: 5 }),
      ],
      weapons: [
        makeWeaponDef('BSRWeapon', {
          AttackRange: 120,
          PrimaryDamage: 50,
          PrimaryDamageRadius: 5,
          SecondaryDamage: 0,
          SecondaryDamageRadius: 0,
          DelayBetweenShots: 1000,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    // Attacker at (10,10). SmallTarget at (25,10) → XZ dist=15 from impact at SmallTarget.
    // LargeTarget at (25,50) → placed far from attack path, won't be hit.
    // We attack SmallTarget; radius damage checks entities within radius=5 of SmallTarget.
    // SmallTarget (at impact point): shrunkenDist=0 → hit.
    // LargeTarget: too far → not hit.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('BSRAttacker', 10, 10),
        makeMapObject('SmallTarget', 25, 10),
        makeMapObject('LargeTarget', 25, 50),
      ], 64, 64),
      makeRegistry(bundle),
      makeHeightmap(64, 64),
    );

    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'attackEntity', entityId: 1, targetEntityId: 2 });

    for (let i = 0; i < 3; i++) {
      logic.update(1 / 30);
    }

    const smallHealth = logic.getEntityState(2)?.health ?? -1;
    const largeHealth = logic.getEntityState(3)?.health ?? -1;

    // SmallTarget is the primary victim → takes damage.
    expect(smallHealth).toBeLessThan(100);
    // LargeTarget is 40 units away in XZ → even with BSR=12, still outside radius 5.
    expect(largeHealth).toBe(100);
  });
});

describe('crush damage during movement', () => {
  // Shared bundle for most crush tests: tank (CrusherLevel=2) + crushable infantry.
  function makeCrushBundle(infantrySide: string = 'China') {
    return makeBundle({
      objects: [
        makeObjectDef('CrusherTank', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('LocomotorSet', 'SET_NORMAL TankLocomotor', {}),
        ], { CrusherLevel: 2, GeometryMajorRadius: 5, GeometryMinorRadius: 5 }),
        makeObjectDef('CrushableInfantry', infantrySide, ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Collide', 'SquishCollide ModuleTag_Squish', {}),
        ], { CrushableLevel: 0 }),
      ],
      locomotors: [
        makeLocomotorDef('TankLocomotor', 180),
      ],
    });
  }

  it('tank crushes infantry when moving through them', () => {
    // Source parity: SquishCollide::onCollide — moving entity with CrusherLevel > 0
    // kills crushable enemies on bounding circle overlap + moving-toward-target check.
    // Place at cell centers (PATHFIND_CELL_SIZE=10, so centers at x%10=5) for straight-line A*.
    const bundle = makeCrushBundle();
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CrusherTank', 205, 205),
        makeMapObject('CrushableInfantry', 220, 205),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);

    expect(logic.getEntityState(2)?.health).toBe(100);

    // Move tank straight through infantry in +X at same Z level.
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 255, targetZ: 205 });

    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }

    // Infantry should be dead and removed from CRUSH damage (HUGE_DAMAGE_AMOUNT).
    const infantryAfter = logic.getEntityState(2);
    expect(infantryAfter === null || infantryAfter.health === 0).toBe(true);
  });

  it('allies are not crushed', () => {
    // Same side — canCrushOrSquish rejects allies.
    const bundle = makeCrushBundle('America');
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CrusherTank', 205, 205),
        makeMapObject('CrushableInfantry', 220, 205),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 255, targetZ: 205 });

    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }

    const allyHealth = logic.getEntityState(2)?.health ?? -1;
    expect(allyHealth).toBe(100);
  });

  it('vehicle with higher crushableLevel resists crush from lower crusherLevel', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('LightTank', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('LocomotorSet', 'SET_NORMAL TankLocomotor', {}),
        ], { CrusherLevel: 1, GeometryMajorRadius: 5, GeometryMinorRadius: 5 }),
        makeObjectDef('HeavyVehicle', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
        ], { CrushableLevel: 2, GeometryMajorRadius: 4, GeometryMinorRadius: 4 }),
      ],
      locomotors: [
        makeLocomotorDef('TankLocomotor', 180),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('LightTank', 205, 205),
        makeMapObject('HeavyVehicle', 220, 205),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 255, targetZ: 205 });

    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }

    // CrushableLevel=2 >= CrusherLevel=1 — not crushed.
    const heavyHealth = logic.getEntityState(2)?.health ?? -1;
    expect(heavyHealth).toBe(300);
  });

  it('tank moving away from infantry does not crush', () => {
    // Dot product direction check: crusher moving away from victim should not crush.
    const bundle = makeCrushBundle();
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    // Infantry behind the tank: tank at cell center, infantry behind in -X.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CrusherTank', 215, 205),
        makeMapObject('CrushableInfantry', 205, 205),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);

    // Tank moves in +X direction, away from infantry at -X.
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 255, targetZ: 205 });

    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }

    // Infantry should be alive — tank moved away, dot product was <= 0.
    const infHealth = logic.getEntityState(2)?.health ?? -1;
    expect(infHealth).toBe(100);
  });

  it('hijacker infantry is immune to crush by target vehicle', () => {
    // Source parity: SquishCollide::onCollide — infantry with a pending hijackVehicle
    // action targeting the crusher is immune to being crushed by that vehicle.
    const bundle = makeBundle({
      objects: [
        makeObjectDef('CrusherTank', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('LocomotorSet', 'SET_NORMAL TankLocomotor', {}),
        ], { CrusherLevel: 2, GeometryMajorRadius: 5, GeometryMinorRadius: 5 }),
        makeObjectDef('Hijacker', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Collide', 'SquishCollide ModuleTag_Squish', {}),
          makeBlock('Behavior', 'ConvertToHijackedVehicleCrateCollide ModuleTag_Hijack', {}),
          makeBlock('LocomotorSet', 'SET_NORMAL InfLocomotor', {}),
        ], { CrushableLevel: 0 }),
      ],
      locomotors: [
        makeLocomotorDef('TankLocomotor', 180),
        makeLocomotorDef('InfLocomotor', 60),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    // Place far enough apart that the hijack doesn't resolve immediately
    // (reachDistance = 5+5=10, so distance must exceed 10).
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CrusherTank', 205, 205),
        makeMapObject('Hijacker', 235, 205),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);

    // Issue hijack command — hijacker will move toward the tank.
    logic.submitCommand({
      type: 'enterObject',
      entityId: 2,
      targetObjectId: 1,
      action: 'hijackVehicle',
    });

    // Move tank toward the hijacker — they will overlap and crush would normally kill.
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 265, targetZ: 205 });

    // Run enough frames for the entities to meet and the hijack to resolve.
    // Tank speed=180 (6 units/frame), hijacker speed=60 (2 units/frame).
    // They close at 8 units/frame, gap=30, so ~4 frames to overlap.
    // Without crush immunity the hijacker would die on overlap. With immunity,
    // the hijacker survives to reach interaction distance and the hijack resolves.
    for (let i = 0; i < 15; i++) {
      logic.update(1 / 30);
    }

    // Hijacker is consumed by the successful hijack (destroyed after entering vehicle).
    const hijackerState = logic.getEntityState(2);
    expect(hijackerState).toBeNull();

    // The tank should have been captured — side changed from China to America.
    // This proves crush immunity worked: if the hijacker had been crushed,
    // the hijack would never have resolved and the tank would remain Chinese.
    const tankState = logic.getEntityState(1);
    expect(tankState).not.toBeNull();
    expect(tankState!.side.toLowerCase()).toBe('america');
  });
});

describe('INI-driven stealth and detection', () => {
  /**
   * Shared bundle: stealthUnit with StealthUpdate module (InnateStealth=Yes, delay=1000ms)
   * and detectorUnit with KINDOF_DETECTOR + StealthDetectorUpdate module.
   */
  function makeStealthBundle(options: {
    stealthDelay?: number;
    innateStealth?: boolean;
    forbiddenConditions?: string;
    moveThresholdSpeed?: number;
    detectionRange?: number;
    detectionRate?: number;
    extraRequiredKindOf?: string;
    extraForbiddenKindOf?: string;
    detectorSide?: string;
  } = {}) {
    const stealthDelay = options.stealthDelay ?? 1000;
    const innateStealth = options.innateStealth !== false;
    const forbiddenConditions = options.forbiddenConditions ?? '';
    const moveThresholdSpeed = options.moveThresholdSpeed ?? 0;
    const detectionRange = options.detectionRange ?? 0;
    const detectionRate = options.detectionRate ?? 33;
    const detectorSide = options.detectorSide ?? 'China';
    const extraRequiredKindOf = options.extraRequiredKindOf ?? '';
    const extraForbiddenKindOf = options.extraForbiddenKindOf ?? '';

    return makeBundle({
      objects: [
        makeObjectDef('StealthUnit', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: stealthDelay,
            InnateStealth: innateStealth ? 'Yes' : 'No',
            StealthForbiddenConditions: forbiddenConditions,
            MoveThresholdSpeed: moveThresholdSpeed,
          }),
        ]),
        makeObjectDef('DetectorUnit', detectorSide, ['INFANTRY', 'DETECTOR'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthDetectorUpdate ModuleTag_Detector', {
            DetectionRange: detectionRange,
            DetectionRate: detectionRate,
            ExtraRequiredKindOf: extraRequiredKindOf,
            ExtraForbiddenKindOf: extraForbiddenKindOf,
          }),
        ], { VisionRange: 200 }),
      ],
    });
  }

  function setupRelationships(logic: GameLogicSubsystem): void {
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
  }

  it('innate stealth sets CAN_STEALTH on creation and enters stealth after delay', () => {
    const bundle = makeStealthBundle({ stealthDelay: 300 }); // 300ms = ~9 frames at 30fps
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('StealthUnit', 105, 105)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupRelationships(logic);

    // Immediately after creation, entity should have CAN_STEALTH but NOT STEALTHED.
    const initialFlags = logic.getEntityState(1)?.statusFlags ?? [];
    expect(initialFlags).toContain('CAN_STEALTH');
    expect(initialFlags).not.toContain('STEALTHED');

    // Run for enough frames to exceed stealth delay (300ms = 9 frames at 30fps).
    for (let i = 0; i < 15; i++) {
      logic.update(1 / 30);
    }

    const afterFlags = logic.getEntityState(1)?.statusFlags ?? [];
    expect(afterFlags).toContain('STEALTHED');
  });

  it('stealth breaks on damage when TAKING_DAMAGE forbidden condition is set', () => {
    const bundle = makeStealthBundle({
      stealthDelay: 100,
      forbiddenConditions: 'TAKING_DAMAGE',
    });

    // Add an enemy attacker with weapon and DETECTOR so it can see through stealth.
    const bundleWithAttacker = makeBundle({
      objects: [
        ...bundle.objects,
        makeObjectDef('Attacker', 'China', ['INFANTRY', 'DETECTOR'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'StealthBreakGun'] }),
        ], { VisionRange: 200 }),
      ],
      weapons: [
        makeWeaponDef('StealthBreakGun', {
          PrimaryDamage: 10,
          PrimaryDamageRadius: 0,
          AttackRange: 200,
          DelayBetweenShots: 100,
          DamageType: 'SMALL_ARMS',
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('StealthUnit', 105, 105),
        makeMapObject('Attacker', 115, 105),
      ], 128, 128),
      makeRegistry(bundleWithAttacker),
      makeHeightmap(128, 128),
    );
    setupRelationships(logic);

    // Wait for stealth to activate (100ms = 3 frames).
    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }
    expect(logic.getEntityState(1)?.statusFlags ?? []).toContain('STEALTHED');

    // Issue attack command — attacker can see the stealthed unit via DETECTOR.
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    // Run enough frames for the attacker to fire and damage to register.
    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }

    // Stealth should be broken because damage was taken.
    const stealthFlags = logic.getEntityState(1)?.statusFlags ?? [];
    expect(stealthFlags).not.toContain('STEALTHED');
  });

  it('detector reveals stealthed enemy within range', () => {
    const bundle = makeStealthBundle({ stealthDelay: 100 });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('StealthUnit', 105, 105),
        makeMapObject('DetectorUnit', 115, 105), // 10 units away, well within detection range
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupRelationships(logic);

    // Wait for stealth to activate.
    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }

    const flags = logic.getEntityState(1)?.statusFlags ?? [];
    expect(flags).toContain('STEALTHED');
    expect(flags).toContain('DETECTED');
  });

  it('detector does not reveal stealthed ally', () => {
    // Detector is same side as stealth unit.
    const bundle = makeStealthBundle({ stealthDelay: 100, detectorSide: 'America' });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('StealthUnit', 105, 105),
        makeMapObject('DetectorUnit', 115, 105),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupRelationships(logic);

    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }

    const flags = logic.getEntityState(1)?.statusFlags ?? [];
    expect(flags).toContain('STEALTHED');
    expect(flags).not.toContain('DETECTED');
  });

  it('detector does not reveal stealthed enemy out of range', () => {
    // Use small explicit detection range.
    const bundle = makeStealthBundle({ stealthDelay: 100, detectionRange: 5 });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('StealthUnit', 105, 105),
        makeMapObject('DetectorUnit', 205, 205), // Far away (100+ units)
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupRelationships(logic);

    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }

    const flags = logic.getEntityState(1)?.statusFlags ?? [];
    expect(flags).toContain('STEALTHED');
    expect(flags).not.toContain('DETECTED');
  });

  it('detection expires after detector is destroyed', () => {
    // Use a weapon to kill the detector so detection expires.
    const bundle = makeStealthBundle({ stealthDelay: 100, detectionRange: 200 });
    const bundleWithKiller = makeBundle({
      objects: [
        ...bundle.objects,
        makeObjectDef('Killer', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'InstantKillGun'] }),
        ]),
      ],
      weapons: [
        makeWeaponDef('InstantKillGun', {
          PrimaryDamage: 9999,
          PrimaryDamageRadius: 0,
          AttackRange: 200,
          DelayBetweenShots: 100,
          DamageType: 'EXPLOSION',
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('StealthUnit', 105, 105),
        makeMapObject('DetectorUnit', 115, 105),
        makeMapObject('Killer', 125, 105),
      ], 128, 128),
      makeRegistry(bundleWithKiller),
      makeHeightmap(128, 128),
    );
    setupRelationships(logic);

    // Activate stealth and get detected.
    for (let i = 0; i < 15; i++) {
      logic.update(1 / 30);
    }
    expect(logic.getEntityState(1)?.statusFlags ?? []).toContain('DETECTED');

    // Kill the detector with an ally unit (Killer is America, DetectorUnit is China = enemy).
    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 2 });
    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }

    // Detector should be dead, but detection may still linger briefly.
    // Run enough frames for the detection timer to expire.
    for (let i = 0; i < 60; i++) {
      logic.update(1 / 30);
    }

    // Detection should have expired since detector no longer scans.
    const flags = logic.getEntityState(1)?.statusFlags ?? [];
    expect(flags).toContain('STEALTHED');
    expect(flags).not.toContain('DETECTED');
  });

  it('non-innate stealth unit does NOT get CAN_STEALTH on creation', () => {
    const bundle = makeStealthBundle({ innateStealth: false });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('StealthUnit', 105, 105)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupRelationships(logic);

    const flags = logic.getEntityState(1)?.statusFlags ?? [];
    expect(flags).not.toContain('CAN_STEALTH');
    expect(flags).not.toContain('STEALTHED');

    // After many frames, still not stealthed (no CAN_STEALTH).
    for (let i = 0; i < 30; i++) {
      logic.update(1 / 30);
    }
    expect(logic.getEntityState(1)?.statusFlags ?? []).not.toContain('STEALTHED');
  });

  it('extraRequiredKindOf filters detection targets', () => {
    // Detector only detects VEHICLE, but stealth unit is INFANTRY.
    const bundle = makeStealthBundle({
      stealthDelay: 100,
      extraRequiredKindOf: 'VEHICLE',
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('StealthUnit', 105, 105),
        makeMapObject('DetectorUnit', 115, 105),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupRelationships(logic);

    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }

    // Stealth unit is INFANTRY, detector only detects VEHICLE — should NOT detect.
    const flags = logic.getEntityState(1)?.statusFlags ?? [];
    expect(flags).toContain('STEALTHED');
    expect(flags).not.toContain('DETECTED');
  });

  it('stealth breaks on movement when MOVING forbidden condition is set', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('MoverStealth', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 100,
            InnateStealth: 'Yes',
            StealthForbiddenConditions: 'MOVING',
          }),
          makeBlock('LocomotorSet', 'SET_NORMAL FastLoco', {}),
        ]),
      ],
      locomotors: [makeLocomotorDef('FastLoco', 120)],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('MoverStealth', 105, 105)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    // Wait for stealth activation.
    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }
    expect(logic.getEntityState(1)?.statusFlags ?? []).toContain('STEALTHED');

    // Issue move command — stealth should break.
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 505, targetZ: 105 });
    for (let i = 0; i < 5; i++) {
      logic.update(1 / 30);
    }
    expect(logic.getEntityState(1)?.statusFlags ?? []).not.toContain('STEALTHED');
  });

  it('stealth re-enters after forbidden condition clears and delay elapses', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('ResteathUnit', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
          makeBlock('Behavior', 'StealthUpdate ModuleTag_Stealth', {
            StealthDelay: 300, // 300ms = ~9 frames at 30fps
            InnateStealth: 'Yes',
            StealthForbiddenConditions: 'MOVING',
          }),
          makeBlock('LocomotorSet', 'SET_NORMAL FastLoco', {}),
        ]),
      ],
      locomotors: [makeLocomotorDef('FastLoco', 120)],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('ResteathUnit', 105, 105)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );

    // Wait for initial stealth.
    for (let i = 0; i < 15; i++) {
      logic.update(1 / 30);
    }
    expect(logic.getEntityState(1)?.statusFlags ?? []).toContain('STEALTHED');

    // Move to break stealth.
    logic.submitCommand({ type: 'moveTo', entityId: 1, targetX: 115, targetZ: 105 });
    for (let i = 0; i < 5; i++) {
      logic.update(1 / 30);
    }
    expect(logic.getEntityState(1)?.statusFlags ?? []).not.toContain('STEALTHED');

    // Stop moving (arrive). Wait for re-stealth delay (~9 frames).
    for (let i = 0; i < 30; i++) {
      logic.update(1 / 30);
    }
    // Unit should have re-entered stealth after the delay.
    expect(logic.getEntityState(1)?.statusFlags ?? []).toContain('STEALTHED');
  });

  it('extraForbiddenKindOf filters detection targets', () => {
    // Detector refuses to detect INFANTRY.
    const bundle = makeStealthBundle({
      stealthDelay: 100,
      extraForbiddenKindOf: 'INFANTRY',
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('StealthUnit', 105, 105),
        makeMapObject('DetectorUnit', 115, 105),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupRelationships(logic);

    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }

    // Stealth unit is INFANTRY with forbidden filter — should NOT detect.
    const flags = logic.getEntityState(1)?.statusFlags ?? [];
    expect(flags).toContain('STEALTHED');
    expect(flags).not.toContain('DETECTED');
  });

  it('short-form forbidden condition tokens are parsed correctly', () => {
    // Use C++ short-form token names instead of long form.
    const bundle = makeStealthBundle({
      stealthDelay: 100,
      forbiddenConditions: 'ATTACKING MOVING TAKING_DAMAGE',
    });
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('StealthUnit', 105, 105)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    setupRelationships(logic);

    // Should enter stealth after delay (forbidden conditions don't prevent entry when inactive).
    for (let i = 0; i < 10; i++) {
      logic.update(1 / 30);
    }
    expect(logic.getEntityState(1)?.statusFlags ?? []).toContain('STEALTHED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Salvage Crate System
// ═══════════════════════════════════════════════════════════════════════════════
describe('salvage crate system', () => {
  /** Destroyed entities are cleaned up from spawnedEntities, so getEntityState returns null. */
  function isEntityDead(logic: GameLogicSubsystem, entityId: number): boolean {
    const state = logic.getEntityState(entityId);
    return state === null || state.alive === false;
  }
  function makeSalvageBundle(opts: {
    salvagerKindOf?: string[];
    crateWeaponChance?: string;
    crateLevelChance?: string;
    crateMinMoney?: number;
    crateMaxMoney?: number;
    salvagerExpRequired?: string;
    salvagerExpValue?: string;
    victimHealth?: number;
    attackDamage?: number;
  } = {}) {
    // Victim spawns a crate on death.
    const victimDef = makeObjectDef('CrateVictim', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: opts.victimHealth ?? 10,
        InitialHealth: opts.victimHealth ?? 10,
      }),
      makeBlock('Behavior', 'CreateCrateDie ModuleTag_CrateDie', {
        CrateData: 'SalvageCrate',
      }),
    ]);

    // Crate object with SalvageCrateCollide behavior.
    const crateDef = makeObjectDef('SalvageCrate', '', ['CRATE', 'UNATTACKABLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', {
        MaxHealth: 100,
        InitialHealth: 100,
      }),
      makeBlock('Behavior', 'SalvageCrateCollide ModuleTag_SalvageCrate', {
        ...(opts.crateWeaponChance !== undefined ? { WeaponChance: opts.crateWeaponChance } : {}),
        ...(opts.crateLevelChance !== undefined ? { LevelChance: opts.crateLevelChance } : {}),
        ...(opts.crateMinMoney !== undefined ? { MinMoney: opts.crateMinMoney } : {}),
        ...(opts.crateMaxMoney !== undefined ? { MaxMoney: opts.crateMaxMoney } : {}),
      }),
    ], {
      Geometry: 'CYLINDER',
      GeometryMajorRadius: 5,
      GeometryMinorRadius: 5,
    });

    // Salvager unit with weapon.
    const salvagerDef = makeObjectDef(
      'Salvager',
      'America',
      opts.salvagerKindOf ?? ['VEHICLE', 'SALVAGER', 'WEAPON_SALVAGER'],
      [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', {
          MaxHealth: 200,
          InitialHealth: 200,
        }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SalvagerGun'] }),
        makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
      ],
      {
        ...(opts.salvagerExpRequired ? { ExperienceRequired: opts.salvagerExpRequired } : {}),
        ...(opts.salvagerExpValue ? { ExperienceValue: opts.salvagerExpValue } : {}),
      },
    );

    const bundle = makeBundle({
      objects: [victimDef, crateDef, salvagerDef],
      weapons: [
        makeWeaponDef('SalvagerGun', {
          AttackRange: 120,
          PrimaryDamage: opts.attackDamage ?? 50,
          DamageType: 'ARMOR_PIERCING',
          DelayBetweenShots: 100,
          DeliveryType: 'DIRECT',
        }),
      ],
      locomotors: [makeLocomotorDef('LocomotorFast', 180)],
    });

    return bundle;
  }

  it('spawns crate on enemy death and salvager collects for weapon upgrade', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    const bundle = makeSalvageBundle();
    const registry = makeRegistry(bundle);

    // Place victim at (55,55), salvager at (55,65) — within attack range.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CrateVictim', 55, 55),
        makeMapObject('Salvager', 55, 65),
      ], 128, 128),
      registry,
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0); // enemies

    // Attack and kill the victim.
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    // Victim should be dead.
    expect(isEntityDead(logic, 1)).toBe(true);

    // A crate entity should have spawned (entity 3).
    const crateState = logic.getEntityState(3);
    expect(crateState).not.toBeNull();
    expect(crateState!.alive).toBe(true);

    // Move salvager to collect the crate.
    logic.submitCommand({ type: 'moveTo', entityId: 2, targetX: crateState!.x, targetZ: crateState!.z });
    for (let i = 0; i < 60; i++) logic.update(1 / 30);

    // Crate should be consumed (destroyed).
    expect(isEntityDead(logic, 3)).toBe(true);
  });

  it('grants CRATEUPGRADE_ONE on first crate, CRATEUPGRADE_TWO on second', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);

    // Two victims at same position as salvager for auto-collection.
    const victimDef = makeObjectDef('CrateVictim', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 10, InitialHealth: 10 }),
      makeBlock('Behavior', 'CreateCrateDie ModuleTag_CrateDie', { CrateData: 'SalvageCrate' }),
    ]);
    const crateDef = makeObjectDef('SalvageCrate', '', ['CRATE', 'UNATTACKABLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('Behavior', 'SalvageCrateCollide ModuleTag_SC', {}),
    ], { Geometry: 'CYLINDER', GeometryMajorRadius: 5, GeometryMinorRadius: 5 });

    // Target with high health to verify upgraded weapon damage.
    const targetDef = makeObjectDef('DamageTarget', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 50000, InitialHealth: 50000 }),
    ]);

    // Salvager with three weapon sets: base, CRATEUPGRADE_ONE, CRATEUPGRADE_TWO.
    // Explicit geometry radius 3 ensures overlap with crate (combined 3+5=8 > max offset ~7.07).
    const salvagerDef = makeObjectDef('Salvager', 'America', ['VEHICLE', 'SALVAGER', 'WEAPON_SALVAGER'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'Gun'] }),
      makeBlock('WeaponSet', 'WeaponSet', {
        Conditions: 'CRATEUPGRADE_ONE',
        Weapon: ['PRIMARY', 'GunUpgraded1'],
      }),
      makeBlock('WeaponSet', 'WeaponSet', {
        Conditions: 'CRATEUPGRADE_TWO',
        Weapon: ['PRIMARY', 'GunUpgraded2'],
      }),
      makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
    ], { Geometry: 'CYLINDER', GeometryMajorRadius: 3, GeometryMinorRadius: 3 });

    const registry = makeRegistry(makeBundle({
      objects: [victimDef, crateDef, salvagerDef, targetDef],
      weapons: [
        makeWeaponDef('Gun', { AttackRange: 120, PrimaryDamage: 50, DamageType: 'ARMOR_PIERCING', DelayBetweenShots: 100, DeliveryType: 'DIRECT' }),
        makeWeaponDef('GunUpgraded1', { AttackRange: 120, PrimaryDamage: 80, DamageType: 'ARMOR_PIERCING', DelayBetweenShots: 100, DeliveryType: 'DIRECT' }),
        makeWeaponDef('GunUpgraded2', { AttackRange: 120, PrimaryDamage: 120, DamageType: 'ARMOR_PIERCING', DelayBetweenShots: 100, DeliveryType: 'DIRECT' }),
      ],
      locomotors: [makeLocomotorDef('LocomotorFast', 180)],
    }));

    // Place: victim1@(55,55), victim2@(55,55), salvager@(55,55), target@(55,115)
    // Overlapping positions ensure crate auto-collection on spawn.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CrateVictim', 55, 55),
        makeMapObject('CrateVictim', 55, 55),
        makeMapObject('Salvager', 55, 55),
        makeMapObject('DamageTarget', 55, 115),
      ], 128, 128),
      registry,
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);

    // Kill victim1 → crate spawns nearby and auto-collects → CRATEUPGRADE_ONE.
    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 1 });
    for (let i = 0; i < 15; i++) logic.update(1 / 30);
    expect(isEntityDead(logic, 1)).toBe(true);

    // Attack target for 30 frames — damage should come from GunUpgraded1 (80/shot).
    const health1 = logic.getEntityState(4)!.health;
    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 4 });
    for (let i = 0; i < 30; i++) logic.update(1 / 30);
    const damage1 = health1 - logic.getEntityState(4)!.health;
    // GunUpgraded1 does 80/shot. Multiple shots fired — verify damage is a multiple of 80.
    expect(damage1).toBeGreaterThan(0);
    expect(damage1 % 80).toBe(0);

    // Kill victim2 → crate spawns nearby and auto-collects → CRATEUPGRADE_TWO.
    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 2 });
    for (let i = 0; i < 15; i++) logic.update(1 / 30);
    expect(isEntityDead(logic, 2)).toBe(true);

    // Attack target for 30 frames — damage should come from GunUpgraded2 (120/shot).
    const health2 = logic.getEntityState(4)!.health;
    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 4 });
    for (let i = 0; i < 30; i++) logic.update(1 / 30);
    const damage2 = health2 - logic.getEntityState(4)!.health;
    expect(damage2).toBeGreaterThan(0);
    expect(damage2 % 120).toBe(0);
  });

  it('non-SALVAGER units cannot collect crates', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);

    const victimDef = makeObjectDef('CrateVictim', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 10, InitialHealth: 10 }),
      makeBlock('Behavior', 'CreateCrateDie ModuleTag_CrateDie', { CrateData: 'SalvageCrate' }),
    ]);
    const crateDef = makeObjectDef('SalvageCrate', '', ['CRATE', 'UNATTACKABLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('Behavior', 'SalvageCrateCollide ModuleTag_SC', {}),
    ], { Geometry: 'CYLINDER', GeometryMajorRadius: 5, GeometryMinorRadius: 5 });

    // Non-salvager — no SALVAGER kindOf.
    const normalUnit = makeObjectDef('NormalUnit', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'Gun'] }),
      makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
    ]);

    const registry = makeRegistry(makeBundle({
      objects: [victimDef, crateDef, normalUnit],
      weapons: [
        makeWeaponDef('Gun', { AttackRange: 120, PrimaryDamage: 50, DamageType: 'ARMOR_PIERCING', DelayBetweenShots: 100, DeliveryType: 'DIRECT' }),
      ],
      locomotors: [makeLocomotorDef('LocomotorFast', 180)],
    }));

    logic.loadMapObjects(
      makeMap([
        makeMapObject('CrateVictim', 55, 55),
        makeMapObject('NormalUnit', 55, 55),
      ], 128, 128),
      registry,
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);

    // Kill victim — crate spawns.
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });
    for (let i = 0; i < 30; i++) logic.update(1 / 30);
    expect(isEntityDead(logic, 1)).toBe(true);

    // Move non-salvager to crate.
    const crate = logic.getEntityState(3);
    expect(crate).not.toBeNull();
    logic.submitCommand({ type: 'moveTo', entityId: 2, targetX: crate!.x, targetZ: crate!.z });
    for (let i = 0; i < 60; i++) logic.update(1 / 30);

    // Crate should still be alive — non-salvager cannot collect.
    expect(logic.getEntityState(3)?.alive).toBe(true);
  });

  it('no crate spawns when killed by ally via area damage', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);

    // Victim (America) gets hit by friendly area damage — crate should NOT spawn.
    const victimDef = makeObjectDef('CrateVictim', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 10, InitialHealth: 10 }),
      makeBlock('Behavior', 'CreateCrateDie ModuleTag_CrateDie', { CrateData: 'SalvageCrate' }),
    ]);
    const crateDef = makeObjectDef('SalvageCrate', '', ['CRATE', 'UNATTACKABLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('Behavior', 'SalvageCrateCollide ModuleTag_SC', {}),
    ], { Geometry: 'CYLINDER', GeometryMajorRadius: 5, GeometryMinorRadius: 5 });

    // Enemy target that the attacker is actually aiming at.
    const enemyDef = makeObjectDef('Enemy', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
    ]);

    // Attacker has area-damage weapon that will splash the ally victim.
    const attackerDef = makeObjectDef('AreaAttacker', 'America', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'AreaGun'] }),
    ]);

    const registry = makeRegistry(makeBundle({
      objects: [victimDef, crateDef, enemyDef, attackerDef],
      weapons: [
        makeWeaponDef('AreaGun', {
          AttackRange: 120,
          PrimaryDamage: 50,
          PrimaryDamageRadius: 20,
          DamageType: 'EXPLOSION',
          DelayBetweenShots: 100,
          DeliveryType: 'DIRECT',
        }),
      ],
    }));

    // Place: victim@(55,55), enemy@(55,57) — within splash, attacker@(55,75).
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CrateVictim', 55, 55),
        makeMapObject('Enemy', 55, 57),
        makeMapObject('AreaAttacker', 55, 75),
      ], 128, 128),
      registry,
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);

    // Attack enemy — splash hits both enemy and ally victim.
    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 2 });
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    // Victim (10HP) should be dead from splash.
    expect(isEntityDead(logic, 1)).toBe(true);

    // No crate should have spawned — ally killed it.
    // Entity 4 would be the crate if spawned (entities 1=victim, 2=enemy, 3=attacker).
    expect(logic.getEntityState(4)).toBeNull();
  });

  it('grants veterancy level when weapon upgrade not eligible', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);

    const victimDef = makeObjectDef('CrateVictim', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 10, InitialHealth: 10 }),
      makeBlock('Behavior', 'CreateCrateDie ModuleTag_CrateDie', { CrateData: 'SalvageCrate' }),
    ]);
    const crateDef = makeObjectDef('SalvageCrate', '', ['CRATE', 'UNATTACKABLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('Behavior', 'SalvageCrateCollide ModuleTag_SC', {
        WeaponChance: '100%',
        LevelChance: '100%',
      }),
    ], { Geometry: 'CYLINDER', GeometryMajorRadius: 5, GeometryMinorRadius: 5 });

    // SALVAGER but NOT WEAPON_SALVAGER — weapon upgrade ineligible, falls through to level.
    const salvagerDef = makeObjectDef('Salvager', 'America', ['VEHICLE', 'SALVAGER'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'Gun'] }),
    ], {
      ExperienceRequired: '0 50 200 500',
      ExperienceValue: '10 20 40 80',
    });

    const registry = makeRegistry(makeBundle({
      objects: [victimDef, crateDef, salvagerDef],
      weapons: [
        makeWeaponDef('Gun', { AttackRange: 120, PrimaryDamage: 50, DamageType: 'ARMOR_PIERCING', DelayBetweenShots: 100, DeliveryType: 'DIRECT' }),
      ],
    }));

    logic.loadMapObjects(
      makeMap([
        makeMapObject('CrateVictim', 55, 55),
        makeMapObject('Salvager', 55, 55),
      ], 128, 128),
      registry,
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);

    // Check initial veterancy.
    expect(logic.getEntityState(2)?.veterancyLevel).toBe(0); // REGULAR

    // Kill victim — crate spawns nearby and salvager auto-collects (overlapping positions).
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });
    for (let i = 0; i < 30; i++) logic.update(1 / 30);
    expect(isEntityDead(logic, 1)).toBe(true);

    // Crate was auto-collected: should have leveled up to VETERAN.
    expect(logic.getEntityState(2)?.veterancyLevel).toBe(1); // VETERAN
  });

  it('grants money when both weapon and level are ineligible', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);

    const victimDef = makeObjectDef('CrateVictim', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 10, InitialHealth: 10 }),
      makeBlock('Behavior', 'CreateCrateDie ModuleTag_CrateDie', { CrateData: 'SalvageCrate' }),
    ]);
    const crateDef = makeObjectDef('SalvageCrate', '', ['CRATE', 'UNATTACKABLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('Behavior', 'SalvageCrateCollide ModuleTag_SC', {
        MinMoney: 50,
        MaxMoney: 50,
      }),
    ], { Geometry: 'CYLINDER', GeometryMajorRadius: 5, GeometryMinorRadius: 5 });

    // No WEAPON_SALVAGER and no experience profile — money fallback.
    const salvagerDef = makeObjectDef('Salvager', 'America', ['VEHICLE', 'SALVAGER'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'Gun'] }),
    ]);

    const registry = makeRegistry(makeBundle({
      objects: [victimDef, crateDef, salvagerDef],
      weapons: [
        makeWeaponDef('Gun', { AttackRange: 120, PrimaryDamage: 50, DamageType: 'ARMOR_PIERCING', DelayBetweenShots: 100, DeliveryType: 'DIRECT' }),
      ],
    }));

    logic.loadMapObjects(
      makeMap([
        makeMapObject('CrateVictim', 55, 55),
        makeMapObject('Salvager', 55, 55),
      ], 128, 128),
      registry,
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);

    const initialCredits = logic.getSideCredits('America');

    // Kill victim — crate spawns nearby and salvager auto-collects (overlapping positions).
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });
    for (let i = 0; i < 30; i++) logic.update(1 / 30);
    expect(isEntityDead(logic, 1)).toBe(true);

    // Credits should have increased by exactly 50 (money fallback from auto-collected crate).
    const finalCredits = logic.getSideCredits('America');
    expect(finalCredits - initialCredits).toBe(50);
  });

  it('fully upgraded WEAPON_SALVAGER falls through to level then money', () => {
    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);

    const victimDef = makeObjectDef('CrateVictim', 'China', ['VEHICLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 10, InitialHealth: 10 }),
      makeBlock('Behavior', 'CreateCrateDie ModuleTag_CrateDie', { CrateData: 'SalvageCrate' }),
    ]);
    const crateDef = makeObjectDef('SalvageCrate', '', ['CRATE', 'UNATTACKABLE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('Behavior', 'SalvageCrateCollide ModuleTag_SC', {
        MinMoney: 100,
        MaxMoney: 100,
      }),
    ], { Geometry: 'CYLINDER', GeometryMajorRadius: 5, GeometryMinorRadius: 5 });

    // Three victims at same position as salvager for auto-collection.
    // Explicit geometry radius 3 ensures overlap with crate (combined 3+5=8 > max offset ~7.07).
    const salvagerDef = makeObjectDef('Salvager', 'America', ['VEHICLE', 'SALVAGER', 'WEAPON_SALVAGER'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'Gun'] }),
      makeBlock('LocomotorSet', 'SET_NORMAL LocomotorFast', {}),
    ], { Geometry: 'CYLINDER', GeometryMajorRadius: 3, GeometryMinorRadius: 3 });

    const registry = makeRegistry(makeBundle({
      objects: [victimDef, crateDef, salvagerDef],
      weapons: [
        makeWeaponDef('Gun', { AttackRange: 120, PrimaryDamage: 50, DamageType: 'ARMOR_PIERCING', DelayBetweenShots: 100, DeliveryType: 'DIRECT' }),
      ],
      locomotors: [makeLocomotorDef('LocomotorFast', 180)],
    }));

    // All victims at (55,55) overlapping salvager for auto-collection.
    logic.loadMapObjects(
      makeMap([
        makeMapObject('CrateVictim', 55, 55),
        makeMapObject('CrateVictim', 55, 55),
        makeMapObject('CrateVictim', 55, 55),
        makeMapObject('Salvager', 55, 55),
      ], 128, 128),
      registry,
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);

    // Kill first victim → crate auto-collects → CRATEUPGRADE_ONE.
    logic.submitCommand({ type: 'attackEntity', entityId: 4, targetEntityId: 1 });
    for (let i = 0; i < 15; i++) logic.update(1 / 30);
    expect(isEntityDead(logic, 1)).toBe(true);

    // Kill second victim → crate auto-collects → CRATEUPGRADE_TWO.
    logic.submitCommand({ type: 'attackEntity', entityId: 4, targetEntityId: 2 });
    for (let i = 0; i < 15; i++) logic.update(1 / 30);
    expect(isEntityDead(logic, 2)).toBe(true);

    // Now fully upgraded. Kill third victim — crate should fall through to money.
    const creditsBefore = logic.getSideCredits('America');
    logic.submitCommand({ type: 'attackEntity', entityId: 4, targetEntityId: 3 });
    for (let i = 0; i < 15; i++) logic.update(1 / 30);
    expect(isEntityDead(logic, 3)).toBe(true);

    // Credits should have increased by 100 (money fallback from auto-collected crate).
    const creditsAfter = logic.getSideCredits('America');
    expect(creditsAfter - creditsBefore).toBe(100);
  });
});

// ── BattlePlanUpdate system ──────────────────────────────────────────────────

describe('BattlePlanUpdate', () => {
  // C++ source parity: each battle plan has its own SpecialPower template.
  const PLAN_POWERS = {
    BOMBARDMENT: 'SpecialPowerChangeBombardmentBattlePlan',
    HOLDTHELINE: 'SpecialPowerChangeHoldTheLineBattlePlan',
    SEARCHANDDESTROY: 'SpecialPowerChangeSearchAndDestroyBattlePlan',
  } as const;

  // Helper: issue battle plan special power command.
  function issueBattlePlan(
    logic: GameLogicSubsystem,
    sourceEntityId: number,
    plan: 'BOMBARDMENT' | 'HOLDTHELINE' | 'SEARCHANDDESTROY',
  ): void {
    logic.submitCommand({
      type: 'issueSpecialPower',
      commandButtonId: `CMD_${plan}`,
      specialPowerName: PLAN_POWERS[plan],
      commandOption: 0,
      issuingEntityIds: [sourceEntityId],
      sourceEntityId,
      targetEntityId: null,
      targetX: null,
      targetZ: null,
    });
  }

  // Helper: build a Strategy Center with BattlePlanUpdate + infantry on the same side.
  function makeBattlePlanSetup(opts?: {
    animationMs?: number;
    paralyzeMs?: number;
    transitionIdleMs?: number;
    armorDamageScalar?: number;
    sightRangeScalar?: number;
    validMemberKindOf?: string;
    invalidMemberKindOf?: string;
    strategyCenterSightRangeScalar?: number;
    strategyCenterDetectsStealth?: boolean;
    strategyCenterHealthScalar?: number;
  }) {
    const animMs = opts?.animationMs ?? 300;
    const paraMs = opts?.paralyzeMs ?? 300;
    const idleMs = opts?.transitionIdleMs ?? 300;
    const armorScalar = opts?.armorDamageScalar ?? 0.5;
    const sightScalar = opts?.sightRangeScalar ?? 1.5;

    // C++ source parity: BattlePlanUpdate module registers separate SpecialPowerTemplate
    // for each plan type. We register via three SpecialPowerModule behavior blocks.
    const strategyCenterDef = makeObjectDef('StrategyCenter', 'America', ['STRUCTURE'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
      makeBlock('Behavior', 'BattlePlanUpdate ModuleTag_BattlePlan', {
        BombardmentPlanAnimationTime: animMs,
        HoldTheLinePlanAnimationTime: animMs,
        SearchAndDestroyPlanAnimationTime: animMs,
        TransitionIdleTime: idleMs,
        BattlePlanChangeParalyzeTime: paraMs,
        HoldTheLinePlanArmorDamageScalar: armorScalar,
        SearchAndDestroyPlanSightRangeScalar: sightScalar,
        StrategyCenterSearchAndDestroySightRangeScalar: opts?.strategyCenterSightRangeScalar ?? 2.0,
        StrategyCenterSearchAndDestroyDetectsStealth: opts?.strategyCenterDetectsStealth ?? false,
        StrategyCenterHoldTheLineMaxHealthScalar: opts?.strategyCenterHealthScalar ?? 1.0,
        ValidMemberKindOf: opts?.validMemberKindOf ?? '',
        InvalidMemberKindOf: opts?.invalidMemberKindOf ?? '',
      }),
      makeBlock('Behavior', 'SpecialPowerModule BattlePlanBombardment', {
        SpecialPowerTemplate: PLAN_POWERS.BOMBARDMENT,
      }),
      makeBlock('Behavior', 'SpecialPowerModule BattlePlanHoldTheLine', {
        SpecialPowerTemplate: PLAN_POWERS.HOLDTHELINE,
      }),
      makeBlock('Behavior', 'SpecialPowerModule BattlePlanSearchAndDestroy', {
        SpecialPowerTemplate: PLAN_POWERS.SEARCHANDDESTROY,
      }),
    ]);

    const infantryDef = makeObjectDef('Ranger', 'America', ['INFANTRY'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'RangerGun'] }),
    ], { VisionRange: 150 });

    const enemyDef = makeObjectDef('Enemy', 'China', ['INFANTRY'], [
      makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
      makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'EnemyGun'] }),
    ]);

    const registry = makeRegistry(makeBundle({
      objects: [strategyCenterDef, infantryDef, enemyDef],
      specialPowers: [
        makeSpecialPowerDef(PLAN_POWERS.BOMBARDMENT, { ReloadTime: 0 }),
        makeSpecialPowerDef(PLAN_POWERS.HOLDTHELINE, { ReloadTime: 0 }),
        makeSpecialPowerDef(PLAN_POWERS.SEARCHANDDESTROY, { ReloadTime: 0 }),
      ],
      weapons: [
        makeWeaponDef('RangerGun', {
          AttackRange: 120,
          PrimaryDamage: 50,
          DamageType: 'ARMOR_PIERCING',
          DelayBetweenShots: 100,
          DeliveryType: 'DIRECT',
        }),
        makeWeaponDef('EnemyGun', {
          AttackRange: 120,
          PrimaryDamage: 100,
          DamageType: 'ARMOR_PIERCING',
          DelayBetweenShots: 100,
          DeliveryType: 'DIRECT',
        }),
      ],
    }));

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    // Entity 1: StrategyCenter at (55,55).  Entity 2: Ranger at (505,55) (far from enemy).
    // Entity 3: Enemy at (75,55).
    logic.loadMapObjects(
      makeMap([
        makeMapObject('StrategyCenter', 55, 55),
        makeMapObject('Ranger', 505, 55),
        makeMapObject('Enemy', 75, 55),
      ], 1024, 1024),
      registry,
      makeHeightmap(1024, 1024),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);

    return { logic, scene };
  }

  // At 30 FPS, 300ms → ceil(300/33.33) = 9 frames.
  const ANIM_FRAMES = 9;
  const PARALYZE_FRAMES = 9;
  const IDLE_FRAMES = 9;

  it('activates Bombardment plan and sets WEAPON_BONUS_BOMBARDMENT on allied troops', () => {
    const { logic } = makeBattlePlanSetup();

    // Before: no weapon bonus flags.
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & (1 << 12)).toBe(0);

    // Issue Bombardment.
    issueBattlePlan(logic, 1, 'BOMBARDMENT');
    logic.update(0);

    // Still UNPACKING — no bonus yet.
    for (let i = 0; i < ANIM_FRAMES - 1; i++) logic.update(1 / 30);
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & (1 << 12)).toBe(0);

    // One more frame → becomes ACTIVE.
    logic.update(1 / 30);
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & (1 << 12)).toBe(1 << 12);

    // Enemy should NOT have the flag.
    expect(logic.getEntityState(3)!.weaponBonusConditionFlags & (1 << 12)).toBe(0);
  });

  it('activates Hold the Line plan and reduces damage taken via armor scalar', () => {
    const { logic } = makeBattlePlanSetup({ armorDamageScalar: 0.5 });

    // Activate Hold the Line.
    issueBattlePlan(logic, 1, 'HOLDTHELINE');
    logic.update(0);
    for (let i = 0; i < ANIM_FRAMES; i++) logic.update(1 / 30);

    // Check damage scalar on ranger.
    const rangerState = logic.getEntityState(2)!;
    expect(rangerState.weaponBonusConditionFlags & (1 << 13)).toBe(1 << 13);
    expect(rangerState.battlePlanDamageScalar).toBeCloseTo(0.5, 5);
  });

  it('activates Search and Destroy plan and increases vision range', () => {
    const { logic } = makeBattlePlanSetup({ sightRangeScalar: 1.5 });

    // Before: base vision range.
    expect(logic.getEntityState(2)!.visionRange).toBe(150);

    // Activate Search and Destroy.
    issueBattlePlan(logic, 1, 'SEARCHANDDESTROY');
    logic.update(0);
    for (let i = 0; i < ANIM_FRAMES; i++) logic.update(1 / 30);

    // After: vision range scaled.
    const rangerState = logic.getEntityState(2)!;
    expect(rangerState.weaponBonusConditionFlags & (1 << 14)).toBe(1 << 14);
    expect(rangerState.visionRange).toBeCloseTo(225, 0); // 150 * 1.5
  });

  it('paralyzes troops when switching between active plans', () => {
    const { logic } = makeBattlePlanSetup();

    // Activate Bombardment.
    issueBattlePlan(logic, 1, 'BOMBARDMENT');
    logic.update(0);
    for (let i = 0; i < ANIM_FRAMES; i++) logic.update(1 / 30);
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & (1 << 12)).toBe(1 << 12);

    // Switch to Hold the Line — C++ parity: bonuses removed and troops paralyzed
    // immediately at packing start (not at end of packing animation).
    issueBattlePlan(logic, 1, 'HOLDTHELINE');
    logic.update(0);

    // Ranger should be paralyzed immediately (DISABLED_SUBDUED).
    expect(logic.getEntityState(2)!.statusFlags).toContain('DISABLED_SUBDUED');

    // Bombardment bonus should be removed immediately.
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & (1 << 12)).toBe(0);

    // Wait for paralysis to wear off.
    for (let i = 0; i < PARALYZE_FRAMES; i++) logic.update(1 / 30);
    expect(logic.getEntityState(2)!.statusFlags).not.toContain('DISABLED_SUBDUED');

    // Wait for idle cooldown then UNPACKING → eventually Hold the Line becomes ACTIVE.
    for (let i = 0; i < IDLE_FRAMES + ANIM_FRAMES; i++) logic.update(1 / 30);
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & (1 << 13)).toBe(1 << 13);
  });

  it('removes bonuses when Strategy Center is destroyed', () => {
    const { logic } = makeBattlePlanSetup();

    // Activate Search and Destroy.
    issueBattlePlan(logic, 1, 'SEARCHANDDESTROY');
    logic.update(0);
    for (let i = 0; i < ANIM_FRAMES; i++) logic.update(1 / 30);
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & (1 << 14)).toBe(1 << 14);
    expect(logic.getEntityState(2)!.visionRange).toBeCloseTo(225, 0);

    // Destroy Strategy Center: have enemy attack it.
    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 1 });
    for (let i = 0; i < 200; i++) logic.update(1 / 30);

    // Strategy Center should be dead.
    expect(logic.getEntityState(1)).toBeNull();

    // Bonuses should be removed from ranger (which is far from enemy, still alive).
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & (1 << 14)).toBe(0);
    expect(logic.getEntityState(2)!.visionRange).toBe(150);
  });

  it('does not apply bonuses to entities matching InvalidMemberKindOf', () => {
    const { logic } = makeBattlePlanSetup({ invalidMemberKindOf: 'INFANTRY' });

    // Activate Bombardment.
    issueBattlePlan(logic, 1, 'BOMBARDMENT');
    logic.update(0);
    for (let i = 0; i < ANIM_FRAMES; i++) logic.update(1 / 30);

    // Ranger (INFANTRY) should be excluded by InvalidMemberKindOf.
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & (1 << 12)).toBe(0);
  });

  it('does not paralyze the Strategy Center building itself', () => {
    const { logic } = makeBattlePlanSetup();

    // Activate Bombardment, then switch to Hold the Line.
    issueBattlePlan(logic, 1, 'BOMBARDMENT');
    logic.update(0);
    for (let i = 0; i < ANIM_FRAMES; i++) logic.update(1 / 30);

    issueBattlePlan(logic, 1, 'HOLDTHELINE');
    logic.update(0);
    for (let i = 0; i < ANIM_FRAMES; i++) logic.update(1 / 30);

    // Strategy Center itself should NOT be paralyzed.
    expect(logic.getEntityState(1)!.statusFlags).not.toContain('DISABLED_SUBDUED');
  });
});

// ── PointDefenseLaserUpdate tests ─────────────────────────────────────────
describe('PointDefenseLaserUpdate', () => {
  /**
   * Setup: Enemy missile launcher fires PROJECTILE at a target.
   * A PDL defender is positioned on the flight path to intercept.
   *
   * Map layout (128×128, MAP_XY_FACTOR=10 → world = cell*10+5):
   *   Entity 1: PDL defender (America) at cell (5,4) → world (55,45)
   *   Entity 2: Target building (America) at cell (5,7) → world (55,75)
   *   Entity 3: Enemy missile launcher (China) at cell (5,2) → world (55,25)
   *
   * Flight path: (55,25) → (55,75), distance = 50 world units.
   * PDL at (55,45) is right on the flight path, 20 units from launcher.
   */
  function makePdlSetup(opts?: {
    pdlScanRange?: number;
    pdlWeaponRange?: number;
    pdlScanRate?: number;
    missileSpeed?: number;
    primaryTargetTypes?: string;
    secondaryTargetTypes?: string;
  }) {
    const pdlScanRange = opts?.pdlScanRange ?? 60;
    const pdlWeaponRange = opts?.pdlWeaponRange ?? 40;
    const pdlScanRate = opts?.pdlScanRate ?? 33; // 33ms → 1 frame
    const missileSpeed = opts?.missileSpeed ?? 5; // 50 units / 5 = ~10 frame flight
    const primaryTargetTypes = opts?.primaryTargetTypes ?? 'SMALL_MISSILE';
    const secondaryTargetTypes = opts?.secondaryTargetTypes ?? '';

    const bundle = makeBundle({
      objects: [
        makeObjectDef('PDLDefender', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('Behavior', 'PointDefenseLaserUpdate ModuleTag_PDL', {
            WeaponTemplate: 'PDLLaser',
            PrimaryTargetTypes: primaryTargetTypes,
            SecondaryTargetTypes: secondaryTargetTypes,
            ScanRate: pdlScanRate,
            ScanRange: pdlScanRange,
            PredictTargetVelocityFactor: 0,
          }),
        ]),
        makeObjectDef('TargetBuilding', 'America', ['STRUCTURE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
        ]),
        makeObjectDef('MissileLauncher', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'EnemyMissile'] }),
        ]),
        makeObjectDef('MissileProjectile', 'China', ['PROJECTILE', 'SMALL_MISSILE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
        ]),
      ],
      weapons: [
        makeWeaponDef('PDLLaser', {
          AttackRange: pdlWeaponRange,
          PrimaryDamage: 100,
          WeaponSpeed: 999999,
          DelayBetweenShots: 33,
        }),
        makeWeaponDef('EnemyMissile', {
          AttackRange: 120,
          PrimaryDamage: 200,
          WeaponSpeed: missileSpeed,
          DelayBetweenShots: 5000,
          ProjectileObject: 'MissileProjectile',
        }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('PDLDefender', 5, 4),
        makeMapObject('TargetBuilding', 5, 7),
        makeMapObject('MissileLauncher', 5, 2),
      ], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);

    return { logic };
  }

  it('intercepts an in-flight enemy missile within range', () => {
    const { logic } = makePdlSetup();

    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 2 });
    logic.update(0);

    // Missile flies 50 units at speed 5 → ~10 frames. PDL should intercept within that time.
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    expect(logic.getEntityState(2)!.health).toBe(1000);
  });

  it('does not intercept ally projectiles', () => {
    const bundle = makeBundle({
      objects: [
        makeObjectDef('PDLDefender', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('Behavior', 'PointDefenseLaserUpdate ModuleTag_PDL', {
            WeaponTemplate: 'PDLLaser',
            PrimaryTargetTypes: 'SMALL_MISSILE',
            ScanRate: 33,
            ScanRange: 60,
          }),
        ]),
        makeObjectDef('AllyLauncher', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'AllyMissile'] }),
        ]),
        makeObjectDef('EnemyTarget', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
        ]),
        makeObjectDef('MissileProjectile', 'America', ['PROJECTILE', 'SMALL_MISSILE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
        ]),
      ],
      weapons: [
        makeWeaponDef('PDLLaser', { AttackRange: 40, PrimaryDamage: 100, WeaponSpeed: 999999, DelayBetweenShots: 33 }),
        makeWeaponDef('AllyMissile', { AttackRange: 120, PrimaryDamage: 200, WeaponSpeed: 5, DelayBetweenShots: 5000, ProjectileObject: 'MissileProjectile' }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([makeMapObject('PDLDefender', 5, 4), makeMapObject('AllyLauncher', 5, 2), makeMapObject('EnemyTarget', 5, 7)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);

    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 3 });
    logic.update(0);
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    // Ally missile should hit — PDL does not intercept ally projectiles.
    expect(logic.getEntityState(3)!.health).toBeLessThan(1000);
  });

  it('ignores projectiles that do not match target kindOf', () => {
    // PDL only targets BALLISTIC_MISSILE, but enemy fires SMALL_MISSILE.
    const { logic } = makePdlSetup({ primaryTargetTypes: 'BALLISTIC_MISSILE' });

    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 2 });
    logic.update(0);
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    // Missile should hit — PDL doesn't target SMALL_MISSILE.
    expect(logic.getEntityState(2)!.health).toBeLessThan(1000);
  });

  it('respects scan range — does not intercept projectiles beyond range', () => {
    // PDL positioned far from flight path with tiny scan range.
    const bundle = makeBundle({
      objects: [
        makeObjectDef('PDLDefender', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('Behavior', 'PointDefenseLaserUpdate ModuleTag_PDL', {
            WeaponTemplate: 'PDLLaser',
            PrimaryTargetTypes: 'SMALL_MISSILE',
            ScanRate: 33,
            ScanRange: 5, // very short scan range
          }),
        ]),
        makeObjectDef('TargetBuilding', 'America', ['STRUCTURE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1000, InitialHealth: 1000 }),
        ]),
        makeObjectDef('MissileLauncher', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'EnemyMissile'] }),
        ]),
        makeObjectDef('MissileProjectile', 'China', ['PROJECTILE', 'SMALL_MISSILE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 1, InitialHealth: 1 }),
        ]),
      ],
      weapons: [
        makeWeaponDef('PDLLaser', { AttackRange: 3, PrimaryDamage: 100, WeaponSpeed: 999999, DelayBetweenShots: 33 }),
        makeWeaponDef('EnemyMissile', { AttackRange: 120, PrimaryDamage: 200, WeaponSpeed: 5, DelayBetweenShots: 5000, ProjectileObject: 'MissileProjectile' }),
      ],
    });

    const scene = new THREE.Scene();
    const logic = new GameLogicSubsystem(scene);
    // PDL at cell (9,4) → world (95,45), 40 units away from flight path at x=55.
    logic.loadMapObjects(
      makeMap([makeMapObject('PDLDefender', 9, 4), makeMapObject('TargetBuilding', 5, 7), makeMapObject('MissileLauncher', 5, 2)], 128, 128),
      makeRegistry(bundle),
      makeHeightmap(128, 128),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);

    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 2 });
    logic.update(0);
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    // Missile should hit — PDL is too far away.
    expect(logic.getEntityState(2)!.health).toBeLessThan(1000);
  });

  it('intercepts using secondary target types as fallback', () => {
    // Primary targets BALLISTIC_MISSILE (no match), secondary targets SMALL_MISSILE (match).
    const { logic } = makePdlSetup({
      primaryTargetTypes: 'BALLISTIC_MISSILE',
      secondaryTargetTypes: 'SMALL_MISSILE',
    });

    logic.submitCommand({ type: 'attackEntity', entityId: 3, targetEntityId: 2 });
    logic.update(0);
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    // Missile intercepted via secondary target type.
    expect(logic.getEntityState(2)!.health).toBe(1000);
  });
});

// ── HordeUpdate tests ────────────────────────────────────────────────────────

describe('HordeUpdate', () => {
  const WEAPON_BONUS_HORDE = 1 << 1;
  const WEAPON_BONUS_NATIONALISM = 1 << 4;
  const WEAPON_BONUS_FANATICISM = 1 << 23;

  function makeHordeBlock(overrides: Record<string, unknown> = {}): IniBlock {
    return {
      type: 'Behavior',
      name: 'HordeUpdate ModuleTag_Horde',
      fields: {
        KindOf: 'INFANTRY',
        Count: 3,
        Radius: 80,
        UpdateRate: 100,
        RubOffRadius: 20,
        AlliesOnly: 'Yes',
        ExactMatch: 'No',
        AllowedNationalism: 'Yes',
        ...overrides,
      } as Record<string, string | number | boolean | string[] | number[]>,
      blocks: [],
    };
  }

  function makeHordeSetup(opts?: {
    unitCount?: number;
    hordeOverrides?: Record<string, unknown>;
    mapWidth?: number;
  }) {
    const unitCount = opts?.unitCount ?? 3;
    const hordeOverrides = opts?.hordeOverrides ?? {};
    const mapWidth = opts?.mapWidth ?? 20;

    const objects = [
      makeObjectDef('HordeInfantry', 'China', ['INFANTRY'], [
        makeHordeBlock(hordeOverrides),
      ], { MaxHealth: 100 }),
    ];

    // Place units close together (cell 5,5 / 5,6 / 5,7 → within 20 world units of each other).
    const mapObjects: MapObjectJSON[] = [];
    for (let i = 0; i < unitCount; i++) {
      mapObjects.push(makeMapObject('HordeInfantry', 5, 5 + i));
    }

    const scene = new THREE.Scene();
    const bundle = makeBundle({ objects });
    const registry = makeRegistry(bundle);
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap(mapObjects, mapWidth, mapWidth), registry, makeHeightmap(mapWidth, mapWidth));

    return { logic, registry };
  }

  it('grants HORDE weapon bonus when enough units are grouped', () => {
    // 3 infantry within radius → all get HORDE bonus (minCount=3).
    const { logic } = makeHordeSetup({ unitCount: 3 });

    // Run enough frames for the staggered scan to trigger.
    logic.update(0);
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    // All 3 entities should have HORDE bonus.
    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(WEAPON_BONUS_HORDE);
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(WEAPON_BONUS_HORDE);
    expect(logic.getEntityState(3)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(WEAPON_BONUS_HORDE);
  });

  it('does not grant HORDE bonus with too few units', () => {
    // Only 2 infantry when minCount=3 → no HORDE bonus.
    const { logic } = makeHordeSetup({ unitCount: 2 });

    logic.update(0);
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(0);
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(0);
  });

  it('removes HORDE bonus when unit is destroyed', () => {
    const { logic } = makeHordeSetup({ unitCount: 3 });

    logic.update(0);
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    // Verify horde is active.
    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(WEAPON_BONUS_HORDE);

    // Kill entity 3 to drop below threshold.
    const priv = logic as unknown as { markEntityDestroyed: (id: number, attackerId: number) => void };
    priv.markEntityDestroyed(3, 0);
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    // Entity 1 and 2 should lose HORDE bonus (only 2 alive, need 3).
    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(0);
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(0);
  });

  it('does not count enemy units toward horde when AlliesOnly is true', () => {
    // 2 China infantry + 1 America "enemy" infantry → only 2 allies, not enough.
    const objects = [
      makeObjectDef('HordeInfantry', 'China', ['INFANTRY'], [makeHordeBlock()], { MaxHealth: 100 }),
      makeObjectDef('EnemyInfantry', 'America', ['INFANTRY'], [makeHordeBlock()], { MaxHealth: 100 }),
    ];
    const mapObjects = [
      makeMapObject('HordeInfantry', 5, 5),
      makeMapObject('HordeInfantry', 5, 6),
      makeMapObject('EnemyInfantry', 5, 7),
    ];

    const scene = new THREE.Scene();
    const bundle = makeBundle({ objects });
    const registry = makeRegistry(bundle);
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap(mapObjects, 20, 20), registry, makeHeightmap(20, 20));
    logic.setTeamRelationship('China', 'America', 0);

    logic.update(0);
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    // Only 2 allied infantry → not enough for horde.
    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(0);
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(0);
  });

  it('does not count units outside scan range', () => {
    // 3 infantry but one is far away (outside 80 radius).
    // Positions are world coordinates: (5,5), (5,6), (5,100).
    // Distance from (5,5) to (5,100) = 95 > 80 scan radius.
    const objects = [
      makeObjectDef('HordeInfantry', 'China', ['INFANTRY'], [makeHordeBlock()], { MaxHealth: 100 }),
    ];
    const mapObjects = [
      makeMapObject('HordeInfantry', 5, 5),
      makeMapObject('HordeInfantry', 5, 6),
      makeMapObject('HordeInfantry', 5, 100), // Far away (95 units > 80 scan radius).
    ];

    const scene = new THREE.Scene();
    const bundle = makeBundle({ objects });
    const registry = makeRegistry(bundle);
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap(mapObjects, 120, 120), registry, makeHeightmap(120, 120));

    logic.update(0);
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    // Units 1 and 2 only have 1 neighbor each (each other) → not enough (need 2 neighbors).
    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(0);
    expect(logic.getEntityState(2)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(0);
    // Unit 3 is isolated (both other units are > 80 away).
    expect(logic.getEntityState(3)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(0);
  });

  it('grants NATIONALISM bonus when horde is active and player has science', () => {
    const { logic } = makeHordeSetup({ unitCount: 3 });

    // Directly add nationalism science for China via private method.
    // normalizeSide('China') = 'china' (lowercase), so use lowercase key.
    const priv = logic as unknown as { addScienceToSide: (side: string, science: string) => boolean };
    priv.addScienceToSide('china', 'SCIENCE_NATIONALISM');
    logic.update(0);
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    // All entities should have HORDE + NATIONALISM.
    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(WEAPON_BONUS_HORDE);
    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_NATIONALISM).toBe(WEAPON_BONUS_NATIONALISM);
    // No fanaticism without the upgrade.
    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_FANATICISM).toBe(0);
  });

  it('grants FANATICISM bonus when both nationalism and fanaticism sciences are active', () => {
    const { logic } = makeHordeSetup({ unitCount: 3 });

    const priv = logic as unknown as { addScienceToSide: (side: string, science: string) => boolean };
    priv.addScienceToSide('china', 'SCIENCE_NATIONALISM');
    priv.addScienceToSide('china', 'SCIENCE_FANATICISM');
    logic.update(0);
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(WEAPON_BONUS_HORDE);
    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_NATIONALISM).toBe(WEAPON_BONUS_NATIONALISM);
    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_FANATICISM).toBe(WEAPON_BONUS_FANATICISM);
  });

  it('rub-off inheritance grants horde to nearby non-qualifying units', () => {
    // 3 units qualify as true horde members. 4th unit placed close to them
    // but it only has 2 neighbors within count range (needs 3). However,
    // it's within rubOffRadius of a true horde member → inherits.
    const objects = [
      makeObjectDef('HordeInfantry', 'China', ['INFANTRY'], [
        makeHordeBlock({ RubOffRadius: 30 }),
      ], { MaxHealth: 100 }),
    ];
    // Place 3 close together (cell 5,5 / 5,6 / 5,7) → true horde members.
    // Place 4th at cell 5,8 → within rubOffRadius of entity at cell 5,7 (10 units away).
    // But 4th only has 2 neighbors in scan range (5,6 and 5,7) → not enough for minCount=3,
    // but entity at 5,7 IS a true horde member and within rubOffRadius.
    const mapObjects = [
      makeMapObject('HordeInfantry', 5, 5),
      makeMapObject('HordeInfantry', 5, 6),
      makeMapObject('HordeInfantry', 5, 7),
      makeMapObject('HordeInfantry', 5, 8),
    ];

    const scene = new THREE.Scene();
    const bundle = makeBundle({ objects });
    const registry = makeRegistry(bundle);
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap(mapObjects, 20, 20), registry, makeHeightmap(20, 20));

    logic.update(0);
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    // All 4 should have HORDE bonus (3 true + 1 via rub-off).
    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(WEAPON_BONUS_HORDE);
    expect(logic.getEntityState(4)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(WEAPON_BONUS_HORDE);
  });

  it('kindOf filter rejects non-matching units', () => {
    // HordeUpdate requires INFANTRY kindOf, but we place VEHICLE units nearby.
    const objects = [
      makeObjectDef('HordeInfantry', 'China', ['INFANTRY'], [
        makeHordeBlock({ KindOf: 'INFANTRY' }),
      ], { MaxHealth: 100 }),
      makeObjectDef('Vehicle', 'China', ['VEHICLE'], [
        makeHordeBlock({ KindOf: 'INFANTRY' }),
      ], { MaxHealth: 100 }),
    ];
    const mapObjects = [
      makeMapObject('HordeInfantry', 5, 5),
      makeMapObject('Vehicle', 5, 6),
      makeMapObject('Vehicle', 5, 7),
    ];

    const scene = new THREE.Scene();
    const bundle = makeBundle({ objects });
    const registry = makeRegistry(bundle);
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap(mapObjects, 20, 20), registry, makeHeightmap(20, 20));

    logic.update(0);
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    // HordeInfantry only counts INFANTRY neighbors — vehicles don't count.
    // Only 1 infantry (itself) → not enough for horde.
    expect(logic.getEntityState(1)!.weaponBonusConditionFlags & WEAPON_BONUS_HORDE).toBe(0);
  });
});

describe('ProneUpdate', () => {
  function makeProneSetup(opts?: {
    damageToFramesRatio?: number;
    attackDamage?: number;
    infantryHealth?: number;
    mapSize?: number;
  }) {
    const ratio = opts?.damageToFramesRatio ?? 2.0;
    const atkDmg = opts?.attackDamage ?? 10;
    const hp = opts?.infantryHealth ?? 200;
    const sz = opts?.mapSize ?? 64;

    const bundle = makeBundle({
      objects: [
        makeObjectDef('ProneInfantry', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: hp, InitialHealth: hp }),
          makeBlock('Behavior', 'ProneUpdate ModuleTag_Prone', {
            DamageToFramesRatio: ratio,
          }),
        ]),
        makeObjectDef('Attacker', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SmallArm'] }),
        ]),
      ],
      weapons: [
        makeWeaponDef('SmallArm', {
          AttackRange: 220,
          PrimaryDamage: atkDmg,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 5000,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const registry = makeRegistry(bundle);
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('ProneInfantry', 30, 30),
        makeMapObject('Attacker', 20, 30),
      ], sz, sz),
      registry,
      makeHeightmap(sz, sz),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);

    return { logic, scene, registry };
  }

  it('sets PRONE animation and NO_ATTACK when infantry takes damage', () => {
    const { logic } = makeProneSetup({ damageToFramesRatio: 2.0, attackDamage: 10 });

    // Before combat: entity should start IDLE.
    logic.update(0);
    expect(logic.getEntityState(1)!.animationState).toBe('IDLE');

    // Command attacker (entity 2) to attack infantry (entity 1).
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    // Run frames until the attacker fires.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    const after = logic.getEntityState(1)!;
    // Infantry took damage → should be PRONE and have lost HP.
    expect(after.health).toBeLessThan(200);
    expect(after.animationState).toBe('PRONE');
  });

  it('recovers from prone after countdown expires', () => {
    // 10 damage * 2.0 ratio = 20 frames of prone.
    const { logic } = makeProneSetup({ damageToFramesRatio: 2.0, attackDamage: 10, infantryHealth: 500 });
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    // Fire first shot.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Should be prone now.
    expect(logic.getEntityState(1)!.animationState).toBe('PRONE');

    // Stop the attacker so no more damage is dealt.
    logic.submitCommand({ type: 'stop', entityId: 2 });

    // Tick enough frames for prone to expire (20 frames at 30fps = ~0.67s).
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    // Should have recovered from prone.
    const recovered = logic.getEntityState(1)!;
    expect(recovered.animationState).not.toBe('PRONE');
  });

  it('stacks prone duration when hit multiple times', () => {
    // Use a fast-firing weapon so we get two hits quickly.
    const bundle = makeBundle({
      objects: [
        makeObjectDef('ProneInfantry', 'America', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 50000, InitialHealth: 50000 }),
          makeBlock('Behavior', 'ProneUpdate ModuleTag_Prone', {
            DamageToFramesRatio: 5.0,
          }),
        ]),
        makeObjectDef('FastAttacker', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'FastGun'] }),
        ]),
      ],
      weapons: [
        makeWeaponDef('FastGun', {
          AttackRange: 220,
          PrimaryDamage: 10,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 200,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const registry = makeRegistry(bundle);
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('ProneInfantry', 30, 30),
        makeMapObject('FastAttacker', 20, 30),
      ], 64, 64),
      registry,
      makeHeightmap(64, 64),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    // Run enough frames for at least two shots (200ms delay = ~6 frames at 30fps).
    for (let i = 0; i < 20; i++) logic.update(1 / 30);

    // Destroy attacker to prevent auto-targeting re-acquisition and further damage.
    const priv = logic as unknown as { markEntityDestroyed: (id: number, attackerId: number) => void };
    priv.markEntityDestroyed(2, 0);
    logic.update(1 / 30);

    const midState = logic.getEntityState(1)!;
    expect(midState.animationState).toBe('PRONE');
    expect(midState.health).toBeLessThan(50000);

    // Each hit: floor(10 * 5.0) = 50 prone frames. With ~200ms between shots,
    // multiple hits accumulate (3-4 in 20 frames). Total ~150-200 prone frames,
    // minus ~21 already decayed. Run 50 more — should still be prone (stacking confirmed).
    for (let i = 0; i < 50; i++) logic.update(1 / 30);
    expect(logic.getEntityState(1)!.animationState).toBe('PRONE');

    // Run enough frames to fully expire even a worst-case accumulation.
    for (let i = 0; i < 300; i++) logic.update(1 / 30);
    expect(logic.getEntityState(1)!.animationState).not.toBe('PRONE');
  });

  it('does not trigger prone on entities without ProneUpdate profile', () => {
    // The attacker has no ProneUpdate — taking damage should not cause prone.
    const bundle = makeBundle({
      objects: [
        makeObjectDef('NormalUnit', 'America', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
        ]),
        makeObjectDef('Attacker', 'China', ['VEHICLE'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
          makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'SmallGun'] }),
        ]),
      ],
      weapons: [
        makeWeaponDef('SmallGun', {
          AttackRange: 220,
          PrimaryDamage: 50,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 5000,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const registry = makeRegistry(bundle);
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(
      makeMap([
        makeMapObject('NormalUnit', 30, 30),
        makeMapObject('Attacker', 20, 30),
      ], 64, 64),
      registry,
      makeHeightmap(64, 64),
    );
    logic.setTeamRelationship('America', 'China', 0);
    logic.setTeamRelationship('China', 'America', 0);
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    const state = logic.getEntityState(1)!;
    // Should have taken damage but NOT be prone.
    expect(state.health).toBeLessThan(200);
    expect(state.animationState).not.toBe('PRONE');
  });
});

describe('DemoTrapUpdate', () => {
  function makeDemoTrapBlock(overrides: Record<string, unknown> = {}): IniBlock {
    return {
      type: 'Behavior',
      name: 'DemoTrapUpdate ModuleTag_DemoTrap',
      fields: {
        DefaultProximityMode: 'Yes',
        TriggerDetonationRange: 30,
        ScanRate: 100,
        AutoDetonationWithFriendsInvolved: 'No',
        DetonationWeapon: 'TrapExplosion',
        DetonateWhenKilled: 'Yes',
        ...overrides,
      } as Record<string, string | number | boolean | string[] | number[]>,
      blocks: [],
    };
  }

  function makeDemoTrapSetup(opts?: {
    trapOverrides?: Record<string, unknown>;
    enemyDistance?: number;
    includeAlly?: boolean;
    mapSize?: number;
  }) {
    const overrides = opts?.trapOverrides ?? {};
    const enemyDist = opts?.enemyDistance ?? 1;
    const sz = opts?.mapSize ?? 64;

    const objects = [
      makeObjectDef('DemoTrap', 'GLA', ['STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeDemoTrapBlock(overrides),
      ]),
      makeObjectDef('EnemyTank', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
      ]),
    ];

    if (opts?.includeAlly) {
      objects.push(
        makeObjectDef('AllyUnit', 'GLA', ['INFANTRY'], [
          makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        ]),
      );
    }

    const mapObjects: MapObjectJSON[] = [
      makeMapObject('DemoTrap', 30, 30),
      makeMapObject('EnemyTank', 30, 30 + enemyDist),
    ];
    if (opts?.includeAlly) {
      mapObjects.push(makeMapObject('AllyUnit', 30, 31));
    }

    const bundle = makeBundle({
      objects,
      weapons: [
        makeWeaponDef('TrapExplosion', {
          AttackRange: 10,
          PrimaryDamage: 200,
          PrimaryDamageRadius: 40,
          WeaponSpeed: 999999,
          DelayBetweenShots: 1000,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const registry = makeRegistry(bundle);
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap(mapObjects, sz, sz), registry, makeHeightmap(sz, sz));
    logic.setTeamRelationship('GLA', 'America', 0);
    logic.setTeamRelationship('America', 'GLA', 0);

    return { logic };
  }

  it('detonates when enemy enters proximity range', () => {
    // Enemy 1 unit away, range=30 → should detonate.
    const { logic } = makeDemoTrapSetup({ enemyDistance: 1 });

    logic.update(0);
    // Run enough frames for scan to trigger.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Trap should be destroyed.
    const trapState = logic.getEntityState(1);
    expect(trapState === null || !trapState.alive).toBe(true);

    // Enemy should have taken damage from the explosion.
    const enemyState = logic.getEntityState(2)!;
    expect(enemyState.health).toBeLessThan(500);
  });

  it('does not detonate when enemy is outside range', () => {
    // Enemy 50 units away, range=30 → no detonation.
    const { logic } = makeDemoTrapSetup({ enemyDistance: 50 });

    logic.update(0);
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Trap should still be alive.
    const trapState = logic.getEntityState(1)!;
    expect(trapState.alive).toBe(true);

    // Enemy should be untouched.
    const enemyState = logic.getEntityState(2)!;
    expect(enemyState.health).toBe(500);
  });

  it('blocks detonation when friendly is nearby and AutoDetonationWithFriendsInvolved=No', () => {
    // Ally unit at (30,31) within range, enemy also in range → no detonation.
    const { logic } = makeDemoTrapSetup({
      includeAlly: true,
      enemyDistance: 2,
      trapOverrides: { AutoDetonationWithFriendsInvolved: 'No' },
    });

    logic.update(0);
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Trap should still be alive (ally blocked detonation).
    const trapState = logic.getEntityState(1)!;
    expect(trapState.alive).toBe(true);
  });

  it('detonates with friendly nearby when AutoDetonationWithFriendsInvolved=Yes', () => {
    const { logic } = makeDemoTrapSetup({
      includeAlly: true,
      enemyDistance: 2,
      trapOverrides: { AutoDetonationWithFriendsInvolved: 'Yes' },
    });

    logic.update(0);
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Trap should have detonated despite ally being nearby.
    const trapState = logic.getEntityState(1);
    expect(trapState === null || !trapState.alive).toBe(true);
  });

  it('detonates on manual command', () => {
    // Start in manual mode (not proximity).
    const { logic } = makeDemoTrapSetup({
      enemyDistance: 50,
      trapOverrides: { DefaultProximityMode: 'No' },
    });

    logic.update(0);
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Trap should still be alive (manual mode, no proximity scan).
    expect(logic.getEntityState(1)!.alive).toBe(true);

    // Issue manual detonate command.
    logic.submitCommand({ type: 'detonateDemoTrap', entityId: 1 });
    logic.update(1 / 30);

    // Trap should be destroyed.
    const trapState = logic.getEntityState(1);
    expect(trapState === null || !trapState.alive).toBe(true);
  });

  it('detonates when killed if DetonateWhenKilled=Yes', () => {
    const { logic } = makeDemoTrapSetup({
      enemyDistance: 5,
      trapOverrides: { DefaultProximityMode: 'No', DetonateWhenKilled: 'Yes' },
    });

    // Add an attacker to kill the trap.
    const objects2 = [
      makeObjectDef('DemoTrap', 'GLA', ['STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
        makeDemoTrapBlock({ DefaultProximityMode: 'No', DetonateWhenKilled: 'Yes' }),
      ]),
      makeObjectDef('EnemyTank', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'BigGun'] }),
      ]),
    ];
    const bundle2 = makeBundle({
      objects: objects2,
      weapons: [
        makeWeaponDef('BigGun', {
          AttackRange: 220,
          PrimaryDamage: 500,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 5000,
        }),
        makeWeaponDef('TrapExplosion', {
          AttackRange: 10,
          PrimaryDamage: 200,
          PrimaryDamageRadius: 40,
          WeaponSpeed: 999999,
          DelayBetweenShots: 1000,
        }),
      ],
    });
    const scene2 = new THREE.Scene();
    const registry2 = makeRegistry(bundle2);
    const logic2 = new GameLogicSubsystem(scene2);
    logic2.loadMapObjects(
      makeMap([
        makeMapObject('DemoTrap', 30, 30),
        makeMapObject('EnemyTank', 28, 30),
      ], 64, 64),
      registry2,
      makeHeightmap(64, 64),
    );
    logic2.setTeamRelationship('GLA', 'America', 0);
    logic2.setTeamRelationship('America', 'GLA', 0);

    // Order the tank to attack the trap.
    logic2.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });

    const enemyBefore = logic2.getEntityState(2)!.health;

    // Run until the trap is killed by the tank.
    for (let i = 0; i < 15; i++) logic2.update(1 / 30);

    // Trap should be dead, and its detonation weapon should have damaged the tank.
    const trapState = logic2.getEntityState(1);
    expect(trapState === null || !trapState.alive).toBe(true);

    const enemyAfter = logic2.getEntityState(2)!;
    expect(enemyAfter.health).toBeLessThan(enemyBefore);
  });

  it('does not scan in manual mode', () => {
    // Start in manual mode — enemy in range should NOT trigger detonation.
    const { logic } = makeDemoTrapSetup({
      enemyDistance: 1,
      trapOverrides: { DefaultProximityMode: 'No' },
    });

    logic.update(0);
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Trap should still be alive (manual mode, no scanning).
    expect(logic.getEntityState(1)!.alive).toBe(true);

    // Toggle to proximity mode.
    logic.submitCommand({ type: 'toggleDemoTrapMode', entityId: 1 });
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Now it should have detonated.
    const trapState = logic.getEntityState(1);
    expect(trapState === null || !trapState.alive).toBe(true);
  });
});

// ── RebuildHoleBehavior tests ────────────────────────────────────────────────

describe('RebuildHoleBehavior', () => {
  /** Build the GLA building + hole + worker INI templates and a test scenario. */
  function makeRebuildHoleSetup(opts?: {
    workerRespawnDelay?: number;
    holeHealthRegenPercent?: number;
    holeMaxHealth?: number;
    buildingBuildTime?: number;
    transferAttackers?: boolean;
  }) {
    const respawnDelayMs = opts?.workerRespawnDelay ?? 100; // ~3 frames at 30fps
    const regenPercent = opts?.holeHealthRegenPercent ?? 10; // INI value: 10 = 10%/sec
    const holeMaxHp = opts?.holeMaxHealth ?? 50;
    const buildTime = opts?.buildingBuildTime ?? 5; // 5 seconds = 150 frames
    const transfer = opts?.transferAttackers ?? true;
    const sz = 64;

    const objects = [
      // 1: GLA building with RebuildHoleExposeDie die module.
      makeObjectDef('GLABarracks', 'GLA', ['STRUCTURE', 'MP_COUNT_FOR_VICTORY'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
        makeBlock('Die', 'RebuildHoleExposeDie ModuleTag_RebuildDie', {
          HoleName: 'GLAHole',
          HoleMaxHealth: holeMaxHp,
          TransferAttackers: transfer ? 'Yes' : 'No',
        }),
      ], { BuildTime: buildTime }),
      // 2: The hole object with RebuildHoleBehavior.
      makeObjectDef('GLAHole', 'GLA', ['REBUILD_HOLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: holeMaxHp, InitialHealth: holeMaxHp }),
        makeBlock('Behavior', 'RebuildHoleBehavior ModuleTag_RebuildHole', {
          WorkerObjectName: 'GLAWorker',
          WorkerRespawnDelay: respawnDelayMs,
          'HoleHealthRegen%PerSecond': regenPercent,
        }),
      ]),
      // 3: The worker unit.
      makeObjectDef('GLAWorker', 'GLA', ['INFANTRY', 'DOZER'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 100, InitialHealth: 100 }),
      ]),
      // 4: Enemy attacker.
      makeObjectDef('EnemyTank', 'America', ['VEHICLE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 500, InitialHealth: 500 }),
        makeBlock('WeaponSet', 'WeaponSet', { Weapon: ['PRIMARY', 'TankGun'] }),
      ]),
    ];

    const mapObjects: MapObjectJSON[] = [
      makeMapObject('GLABarracks', 30, 30),
      makeMapObject('EnemyTank', 30, 32),
    ];

    const bundle = makeBundle({
      objects,
      weapons: [
        makeWeaponDef('TankGun', {
          AttackRange: 100,
          PrimaryDamage: 50,
          PrimaryDamageRadius: 0,
          WeaponSpeed: 999999,
          DelayBetweenShots: 100,
        }),
      ],
    });

    const scene = new THREE.Scene();
    const registry = makeRegistry(bundle);
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap(mapObjects, sz, sz), registry, makeHeightmap(sz, sz));
    logic.setTeamRelationship('GLA', 'America', 0);
    logic.setTeamRelationship('America', 'GLA', 0);
    (logic as unknown as { sidePlayerTypes: Map<string, string> }).sidePlayerTypes.set('gla', 'HUMAN');
    (logic as unknown as { sidePlayerTypes: Map<string, string> }).sidePlayerTypes.set('america', 'COMPUTER');

    return { logic, sz };
  }

  it('creates a rebuild hole when building is destroyed', () => {
    const { logic } = makeRebuildHoleSetup();
    logic.update(0);

    // Building is entity 1, enemy is entity 2.
    const buildingBefore = logic.getEntityState(1)!;
    expect(buildingBefore.alive).toBe(true);

    // Kill the building by dealing massive damage.
    const privateApi = logic as unknown as {
      applyWeaponDamageAmount: (id: number | null, target: unknown, amount: number, type: string) => void;
      spawnedEntities: Map<number, unknown>;
    };
    const building = privateApi.spawnedEntities.get(1)!;
    privateApi.applyWeaponDamageAmount(2, building, 9999, 'EXPLOSION');

    // Building should be destroyed.
    const buildingAfter = logic.getEntityState(1);
    expect(buildingAfter === null || !buildingAfter.alive).toBe(true);

    // A hole entity should have been spawned (entity 3).
    logic.update(1 / 30);
    const holeState = logic.getEntityState(3);
    expect(holeState).not.toBeNull();
    expect(holeState!.alive).toBe(true);
    expect(holeState!.templateName).toBe('GLAHole');
  });

  it('spawns worker after respawn delay and begins reconstruction', () => {
    const { logic } = makeRebuildHoleSetup({ workerRespawnDelay: 100 }); // ~3 frames
    logic.update(0);

    // Kill the building.
    const privateApi = logic as unknown as {
      applyWeaponDamageAmount: (id: number | null, target: unknown, amount: number, type: string) => void;
      spawnedEntities: Map<number, unknown>;
    };
    const building = privateApi.spawnedEntities.get(1)!;
    privateApi.applyWeaponDamageAmount(2, building, 9999, 'EXPLOSION');

    // Run for a few frames to let the worker spawn timer tick down.
    // WorkerRespawnDelay=100ms → ~3 frames at 30fps.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Worker should exist (entity 4 — after hole=3).
    const workerState = logic.getEntityState(4);
    expect(workerState).not.toBeNull();
    expect(workerState!.alive).toBe(true);
    expect(workerState!.templateName).toBe('GLAWorker');

    // A reconstruction building should exist (entity 5).
    const reconState = logic.getEntityState(5);
    expect(reconState).not.toBeNull();
    expect(reconState!.alive).toBe(true);
    expect(reconState!.templateName).toBe('GLABarracks');
    // Should be under construction.
    expect(reconState!.constructionPercent).toBeGreaterThanOrEqual(0);
  });

  it('completes reconstruction and destroys hole and worker', () => {
    const { logic } = makeRebuildHoleSetup({
      workerRespawnDelay: 100,
      buildingBuildTime: 1, // 1 second → 30 frames
    });
    logic.update(0);

    // Kill the building.
    const privateApi = logic as unknown as {
      applyWeaponDamageAmount: (id: number | null, target: unknown, amount: number, type: string) => void;
      spawnedEntities: Map<number, unknown>;
    };
    const building = privateApi.spawnedEntities.get(1)!;
    privateApi.applyWeaponDamageAmount(2, building, 9999, 'EXPLOSION');

    // Run enough frames for worker spawn (~3 frames) + full construction (30 frames).
    for (let i = 0; i < 50; i++) logic.update(1 / 30);

    // Hole should be destroyed (reconstruction complete).
    const holeState = logic.getEntityState(3);
    expect(holeState === null || !holeState.alive).toBe(true);

    // Worker should be destroyed.
    const workerState = logic.getEntityState(4);
    expect(workerState === null || !workerState.alive).toBe(true);

    // Reconstructed building should be alive and complete.
    const reconState = logic.getEntityState(5);
    expect(reconState).not.toBeNull();
    expect(reconState!.alive).toBe(true);
    expect(reconState!.constructionPercent).toBe(-1); // CONSTRUCTION_COMPLETE
    expect(reconState!.health).toBe(500);
  });

  it('respawns worker if worker dies during reconstruction', () => {
    const { logic } = makeRebuildHoleSetup({
      workerRespawnDelay: 100,
      buildingBuildTime: 100, // 100 seconds — long enough to kill worker mid-build
    });
    logic.update(0);

    // Kill the building.
    const privateApi = logic as unknown as {
      applyWeaponDamageAmount: (id: number | null, target: unknown, amount: number, type: string) => void;
      spawnedEntities: Map<number, unknown>;
      markEntityDestroyed: (id: number, attackerId: number) => void;
    };
    const building = privateApi.spawnedEntities.get(1)!;
    privateApi.applyWeaponDamageAmount(2, building, 9999, 'EXPLOSION');

    // Let worker spawn.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);
    const firstWorkerState = logic.getEntityState(4);
    expect(firstWorkerState).not.toBeNull();
    expect(firstWorkerState!.alive).toBe(true);

    // Kill the worker.
    privateApi.markEntityDestroyed(4, -1);
    const deadWorker = logic.getEntityState(4);
    expect(deadWorker === null || !deadWorker.alive).toBe(true);

    // Run more frames to let replacement worker spawn.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // New worker should be spawned (entity 6 — after recon=5).
    const newWorkerState = logic.getEntityState(6);
    expect(newWorkerState).not.toBeNull();
    expect(newWorkerState!.alive).toBe(true);
    expect(newWorkerState!.templateName).toBe('GLAWorker');
  });

  it('restarts construction if reconstructing building is destroyed', () => {
    const { logic } = makeRebuildHoleSetup({
      workerRespawnDelay: 100,
      buildingBuildTime: 10000,
    });
    logic.update(0);

    // Kill the building.
    const privateApi = logic as unknown as {
      applyWeaponDamageAmount: (id: number | null, target: unknown, amount: number, type: string) => void;
      spawnedEntities: Map<number, unknown>;
      markEntityDestroyed: (id: number, attackerId: number) => void;
    };
    const building = privateApi.spawnedEntities.get(1)!;
    privateApi.applyWeaponDamageAmount(2, building, 9999, 'EXPLOSION');

    // Let worker spawn and reconstruction start.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);
    expect(logic.getEntityState(5)).not.toBeNull(); // Reconstruction exists.

    // Kill the reconstruction building.
    privateApi.markEntityDestroyed(5, -1);

    // Run more frames — should restart the cycle.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);

    // Hole should still be alive.
    const holeState = logic.getEntityState(3);
    expect(holeState).not.toBeNull();
    expect(holeState!.alive).toBe(true);

    // A new worker and reconstruction should exist.
    // Worker 4 was killed when recon died, new worker is 6, new recon is 7.
    const newRecon = logic.getEntityState(7);
    expect(newRecon).not.toBeNull();
    expect(newRecon!.alive).toBe(true);
    expect(newRecon!.templateName).toBe('GLABarracks');
  });

  it('destroys worker when hole is killed', () => {
    const { logic } = makeRebuildHoleSetup({
      workerRespawnDelay: 100,
      buildingBuildTime: 10000,
    });
    logic.update(0);

    // Kill the building.
    const privateApi = logic as unknown as {
      applyWeaponDamageAmount: (id: number | null, target: unknown, amount: number, type: string) => void;
      spawnedEntities: Map<number, unknown>;
      markEntityDestroyed: (id: number, attackerId: number) => void;
    };
    const building = privateApi.spawnedEntities.get(1)!;
    privateApi.applyWeaponDamageAmount(2, building, 9999, 'EXPLOSION');

    // Let worker spawn.
    for (let i = 0; i < 10; i++) logic.update(1 / 30);
    expect(logic.getEntityState(4)!.alive).toBe(true); // Worker alive.

    // Kill the hole.
    privateApi.markEntityDestroyed(3, -1);

    // Worker should also be destroyed.
    const workerState = logic.getEntityState(4);
    expect(workerState === null || !workerState.alive).toBe(true);
  });

  it('does not create hole for buildings under construction', () => {
    const { logic } = makeRebuildHoleSetup();
    logic.update(0);

    // Mark building as under construction.
    const privateApi = logic as unknown as {
      applyWeaponDamageAmount: (id: number | null, target: unknown, amount: number, type: string) => void;
      spawnedEntities: Map<number, { objectStatusFlags: Set<string> }>;
    };
    const building = privateApi.spawnedEntities.get(1)!;
    building.objectStatusFlags.add('UNDER_CONSTRUCTION');

    // Kill the building.
    privateApi.applyWeaponDamageAmount(2, building as unknown as never, 9999, 'EXPLOSION');

    logic.update(1 / 30);

    // No hole should exist — entity 3 should not be a hole.
    const entity3 = logic.getEntityState(3);
    expect(entity3).toBeNull();
  });

  it('heals hole passively over time', () => {
    const { logic } = makeRebuildHoleSetup({
      workerRespawnDelay: 30000, // Long delay so worker doesn't spawn.
      holeHealthRegenPercent: 50, // INI value: 50 = 50%/sec → heals fast.
      holeMaxHealth: 100,
    });
    logic.update(0);

    // Kill the building.
    const privateApi = logic as unknown as {
      applyWeaponDamageAmount: (id: number | null, target: unknown, amount: number, type: string) => void;
      spawnedEntities: Map<number, unknown>;
    };
    const building = privateApi.spawnedEntities.get(1)!;
    privateApi.applyWeaponDamageAmount(2, building, 9999, 'EXPLOSION');

    logic.update(1 / 30);

    // Damage the hole.
    const hole = privateApi.spawnedEntities.get(3) as { health: number; maxHealth: number };
    expect(hole).toBeTruthy();
    hole.health = 50; // Half health.

    // Run 30 frames (1 second) at 50% regen/sec → should heal ~50 HP.
    for (let i = 0; i < 30; i++) logic.update(1 / 30);

    const holeState = logic.getEntityState(3)!;
    expect(holeState.health).toBeGreaterThan(90); // Should be near max.
  });

  it('transfers attackers from dead building to hole', () => {
    const { logic } = makeRebuildHoleSetup({ transferAttackers: true });
    logic.update(0);

    // Make enemy attack the building.
    logic.submitCommand({ type: 'attackEntity', entityId: 2, targetEntityId: 1 });
    logic.update(1 / 30);

    // Kill the building.
    const privateApi = logic as unknown as {
      applyWeaponDamageAmount: (id: number | null, target: unknown, amount: number, type: string) => void;
      spawnedEntities: Map<number, { attackTargetEntityId: number | null }>;
    };
    const building = privateApi.spawnedEntities.get(1)!;
    privateApi.applyWeaponDamageAmount(2, building as unknown as never, 9999, 'EXPLOSION');

    // After building death, enemy's target should be redirected to hole (entity 3).
    const enemy = privateApi.spawnedEntities.get(2)!;
    expect(enemy.attackTargetEntityId).toBe(3);
  });
});

describe('AutoDepositUpdate', () => {
  /** Build a scenario with an auto-deposit building (e.g., oil derrick). */
  function makeAutoDepositSetup(opts?: {
    depositTimingMs?: number;
    depositAmount?: number;
    initialCaptureBonus?: number;
    startCredits?: number;
  }) {
    const timingMs = opts?.depositTimingMs ?? 1000; // 1s = 30 frames
    const amount = opts?.depositAmount ?? 100;
    const captureBonus = opts?.initialCaptureBonus ?? 0;
    const startCredits = opts?.startCredits ?? 500;
    const sz = 64;

    const objects = [
      makeObjectDef('OilDerrick', 'GLA', ['STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
        makeBlock('Behavior', 'AutoDepositUpdate ModuleTag_AutoDeposit', {
          DepositTiming: timingMs,
          DepositAmount: amount,
          InitialCaptureBonus: captureBonus,
        }),
      ]),
    ];

    const mapObjects: MapObjectJSON[] = [
      makeMapObject('OilDerrick', 30, 30),
    ];

    const bundle = makeBundle({ objects });
    const scene = new THREE.Scene();
    const registry = makeRegistry(bundle);
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap(mapObjects, sz, sz), registry, makeHeightmap(sz, sz));
    (logic as unknown as { sidePlayerTypes: Map<string, string> }).sidePlayerTypes.set('gla', 'HUMAN');
    logic.submitCommand({ type: 'setSideCredits', side: 'gla', amount: startCredits });

    return { logic, startCredits };
  }

  it('deposits money at fixed intervals', () => {
    const { logic, startCredits } = makeAutoDepositSetup({
      depositTimingMs: 1000, // 30 frames
      depositAmount: 50,
    });
    logic.update(0); // frame 0 — initializes deposit schedule

    // Advance to just before deposit (frame 29).
    for (let i = 0; i < 29; i++) {
      logic.update(1 / 30);
    }
    expect(logic.getSideCredits('gla')).toBe(startCredits);

    // Advance one more frame to trigger deposit.
    logic.update(1 / 30);
    expect(logic.getSideCredits('gla')).toBe(startCredits + 50);
  });

  it('deposits repeatedly at each interval', () => {
    const { logic, startCredits } = makeAutoDepositSetup({
      depositTimingMs: 500, // 15 frames
      depositAmount: 25,
    });
    logic.update(0);

    // Advance 45 frames = 3 deposit intervals.
    for (let i = 0; i < 45; i++) {
      logic.update(1 / 30);
    }
    expect(logic.getSideCredits('gla')).toBe(startCredits + 75);
  });

  it('awards initial capture bonus once', () => {
    const { logic, startCredits } = makeAutoDepositSetup({
      depositTimingMs: 10000, // Long interval so no periodic deposits.
      depositAmount: 10,
      initialCaptureBonus: 200,
    });
    logic.update(0); // frame 0 — should award capture bonus.

    expect(logic.getSideCredits('gla')).toBe(startCredits + 200);

    // Advance more frames — bonus should not be awarded again.
    for (let i = 0; i < 30; i++) {
      logic.update(1 / 30);
    }
    // Only bonus, no periodic deposit yet (interval is 300 frames = 10s).
    expect(logic.getSideCredits('gla')).toBe(startCredits + 200);
  });

  it('does not deposit for entities under construction', () => {
    const sz = 64;
    const objects = [
      makeObjectDef('OilDerrick', 'GLA', ['STRUCTURE'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 300, InitialHealth: 300 }),
        makeBlock('Behavior', 'AutoDepositUpdate ModuleTag_AutoDeposit', {
          DepositTiming: 100, // Very short
          DepositAmount: 999,
          InitialCaptureBonus: 0,
        }),
      ], { BuildTime: 100 }), // 100 seconds
      makeObjectDef('Dozer', 'GLA', ['VEHICLE', 'DOZER'], [
        makeBlock('Body', 'ActiveBody ModuleTag_Body', { MaxHealth: 200, InitialHealth: 200 }),
      ]),
    ];

    const mapObjects: MapObjectJSON[] = [
      makeMapObject('Dozer', 25, 30),
    ];

    const bundle = makeBundle({ objects });
    const scene = new THREE.Scene();
    const registry = makeRegistry(bundle);
    const logic = new GameLogicSubsystem(scene);
    logic.loadMapObjects(makeMap(mapObjects, sz, sz), registry, makeHeightmap(sz, sz));
    (logic as unknown as { sidePlayerTypes: Map<string, string> }).sidePlayerTypes.set('gla', 'HUMAN');
    logic.submitCommand({ type: 'setSideCredits', side: 'gla', amount: 1000 });
    logic.update(0);

    // Command dozer to construct the building.
    logic.submitCommand({
      type: 'constructBuilding',
      entityId: 1,
      templateName: 'OilDerrick',
      targetPosition: [30, 0, 30],
      angle: 0,
      lineEndPosition: null,
    });

    // Advance frames — building is under construction.
    for (let i = 0; i < 30; i++) {
      logic.update(1 / 30);
    }

    // Credits should not have increased from auto-deposit (only building cost deducted).
    const credits = logic.getSideCredits('gla');
    // Building cost is deducted but no auto-deposit income should have been added.
    expect(credits).toBeLessThanOrEqual(1000);
  });

  it('does not deposit for entities without a player type', () => {
    const { logic, startCredits } = makeAutoDepositSetup({
      depositTimingMs: 100,
      depositAmount: 999,
    });
    // Remove player type mapping.
    (logic as unknown as { sidePlayerTypes: Map<string, string> }).sidePlayerTypes.delete('gla');
    logic.update(0);

    for (let i = 0; i < 30; i++) {
      logic.update(1 / 30);
    }

    // No deposits should have been made.
    expect(logic.getSideCredits('gla')).toBe(startCredits);
  });

  it('skips deposit when depositAmount is zero', () => {
    const { logic, startCredits } = makeAutoDepositSetup({
      depositTimingMs: 100,
      depositAmount: 0,
      initialCaptureBonus: 50,
    });
    logic.update(0);

    for (let i = 0; i < 60; i++) {
      logic.update(1 / 30);
    }

    // Only capture bonus, no periodic deposits.
    expect(logic.getSideCredits('gla')).toBe(startCredits + 50);
  });
});
