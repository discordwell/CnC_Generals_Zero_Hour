import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { GameLogicSubsystem } from './index.js';

interface MutableGameLogicInternals {
  spawnedEntities: Map<number, unknown>;
}

function getMutableInternals(gameLogic: GameLogicSubsystem): MutableGameLogicInternals {
  return gameLogic as unknown as MutableGameLogicInternals;
}

describe('GameLogicSubsystem shortcut special-power source resolution', () => {
  it('selects the tracked source with the lowest ready frame', () => {
    const gameLogic = new GameLogicSubsystem(new THREE.Scene());
    const internals = getMutableInternals(gameLogic);
    internals.spawnedEntities.set(11, {});
    internals.spawnedEntities.set(12, {});

    gameLogic.trackShortcutSpecialPowerSourceEntity('SpecialPowerCarpetBombing', 11, 120);
    gameLogic.trackShortcutSpecialPowerSourceEntity('SpecialPowerCarpetBombing', 12, 15);

    expect(
      gameLogic.resolveShortcutSpecialPowerSourceEntityId('SpecialPowerCarpetBombing'),
    ).toBe(12);
    expect(
      gameLogic.resolveShortcutSpecialPowerSourceEntityReadyFrame('SpecialPowerCarpetBombing'),
    ).toBe(15);
  });

  it('drops stale tracked sources that no longer exist in spawned entities', () => {
    const gameLogic = new GameLogicSubsystem(new THREE.Scene());
    const internals = getMutableInternals(gameLogic);
    internals.spawnedEntities.set(21, {});

    gameLogic.trackShortcutSpecialPowerSourceEntity('SpecialPowerSneakAttack', 99, 0);
    gameLogic.trackShortcutSpecialPowerSourceEntity('SpecialPowerSneakAttack', 21, 30);

    expect(
      gameLogic.resolveShortcutSpecialPowerSourceEntityId('SpecialPowerSneakAttack'),
    ).toBe(21);

    internals.spawnedEntities.delete(21);
    expect(
      gameLogic.resolveShortcutSpecialPowerSourceEntityId('SpecialPowerSneakAttack'),
    ).toBeNull();
  });

  it('keeps compatibility behavior for set/clear shortcut source mapping', () => {
    const gameLogic = new GameLogicSubsystem(new THREE.Scene());
    const internals = getMutableInternals(gameLogic);
    internals.spawnedEntities.set(31, {});
    internals.spawnedEntities.set(32, {});

    gameLogic.trackShortcutSpecialPowerSourceEntity('SpecialPowerFuelAirBomb', 31, 60);
    gameLogic.setShortcutSpecialPowerSourceEntity('SpecialPowerFuelAirBomb', 32);

    expect(
      gameLogic.resolveShortcutSpecialPowerSourceEntityId('SpecialPowerFuelAirBomb'),
    ).toBe(32);
    expect(
      gameLogic.resolveShortcutSpecialPowerSourceEntityReadyFrame('SpecialPowerFuelAirBomb'),
    ).toBe(0);

    gameLogic.setShortcutSpecialPowerSourceEntity('SpecialPowerFuelAirBomb', null);
    expect(
      gameLogic.resolveShortcutSpecialPowerSourceEntityId('SpecialPowerFuelAirBomb'),
    ).toBeNull();
  });

  it('resolves live ready frames for a specific tracked source entity', () => {
    const gameLogic = new GameLogicSubsystem(new THREE.Scene());
    const internals = getMutableInternals(gameLogic);
    internals.spawnedEntities.set(41, {
      destroyed: false,
      specialPowerModules: new Map<string, unknown>([['SPECIALPOWERSPECTREGUNSHIP', {}]]),
    });

    gameLogic.trackShortcutSpecialPowerSourceEntity('SpecialPowerSpectreGunship', 41, 90);

    expect(
      gameLogic.resolveShortcutSpecialPowerReadyFrameForSourceEntity(
        'SpecialPowerSpectreGunship',
        41,
      ),
    ).toBe(90);
    expect(
      gameLogic.resolveShortcutSpecialPowerReadyFrameForSourceEntity(
        'SpecialPowerCarpetBombing',
        41,
      ),
    ).toBeNull();
  });
});
