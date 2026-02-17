import { describe, expect, it } from 'vitest';

import type { AudioManager } from '@generals/audio';
import { GuardMode, type GameLogicCommand } from '@generals/game-logic';
import { IniDataRegistry } from '@generals/ini-data';
import { CommandOption, GUICommandType, type IssuedControlBarCommand } from '@generals/ui';

import { dispatchIssuedControlBarCommands } from './control-bar-dispatch.js';

class FakeAudioManager {
  readonly validEvents = new Set<string>();
  readonly playedEvents: string[] = [];

  isValidAudioEvent(eventName: string): boolean {
    return this.validEvents.has(eventName);
  }

  addAudioEvent(eventName: string): void {
    this.playedEvents.push(eventName);
  }
}

class FakeGameLogic {
  selectedEntityId: number | null = null;
  readonly submittedCommands: GameLogicCommand[] = [];
  localPlayerScienceNames: string[] = [];
  localPlayerSciencePurchasePoints = 0;
  disabledScienceNames: string[] = [];
  hiddenScienceNames: string[] = [];
  private readonly attackMoveDistanceByEntity = new Map<number, number>();
  private readonly entityPositionById = new Map<number, readonly [number, number, number]>();
  private readonly shortcutSpecialPowerSourceByName = new Map<string, number>();

  getSelectedEntityId(): number | null {
    return this.selectedEntityId;
  }

  getAttackMoveDistanceForEntity(entityId: number): number {
    return this.attackMoveDistanceByEntity.get(entityId) ?? 0;
  }

  getEntityWorldPosition(entityId: number): readonly [number, number, number] | null {
    return this.entityPositionById.get(entityId) ?? null;
  }

  getLocalPlayerScienceNames(): string[] {
    return [...this.localPlayerScienceNames];
  }

  getLocalPlayerSciencePurchasePoints(): number {
    return this.localPlayerSciencePurchasePoints;
  }

  getLocalPlayerDisabledScienceNames(): string[] {
    return [...this.disabledScienceNames];
  }

  getLocalPlayerHiddenScienceNames(): string[] {
    return [...this.hiddenScienceNames];
  }

  resolveShortcutSpecialPowerSourceEntityId(specialPowerName: string): number | null {
    return this.shortcutSpecialPowerSourceByName.get(
      specialPowerName.trim().toUpperCase(),
    ) ?? null;
  }

  setAttackMoveDistanceForEntity(entityId: number, distance: number): void {
    this.attackMoveDistanceByEntity.set(entityId, distance);
  }

  setEntityWorldPosition(
    entityId: number,
    position: readonly [number, number, number],
  ): void {
    this.entityPositionById.set(entityId, position);
  }

  setShortcutSpecialPowerSourceEntity(
    specialPowerName: string,
    entityId: number,
  ): void {
    this.shortcutSpecialPowerSourceByName.set(
      specialPowerName.trim().toUpperCase(),
      entityId,
    );
  }

  submitCommand(command: GameLogicCommand): void {
    this.submittedCommands.push(command);
  }
}

class FakeUiRuntime {
  readonly messages: string[] = [];

  showMessage(message: string): void {
    this.messages.push(message);
  }
}

function makeCommand(
  sourceButtonId: string,
  commandType: GUICommandType,
  overrides: Partial<IssuedControlBarCommand> = {},
): IssuedControlBarCommand {
  return {
    sourceButtonId,
    commandType,
    commandOption: 0,
    selectedObjectIds: [],
    ...overrides,
  };
}

function makeCommandButtonBlock(
  name: string,
  fields: Record<string, string>,
): {
  type: 'CommandButton';
  name: string;
  fields: Record<string, string>;
  blocks: [];
} {
  return {
    type: 'CommandButton',
    name,
    fields,
    blocks: [],
  };
}

describe('dispatchIssuedControlBarCommands', () => {
  it('routes PLAYER_UPGRADE commands to player upgrade progression without requiring selected objects', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_PlayerUpgradeRadar', {
        Command: 'PLAYER_UPGRADE',
        Upgrade: 'Upgrade_PlayerRadar',
        UnitSpecificSound: 'UI_PlayerUpgradeRadar',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();
    audioManager.validEvents.add('UI_PlayerUpgradeRadar');

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_PlayerUpgradeRadar',
          GUICommandType.GUI_COMMAND_PLAYER_UPGRADE,
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'applyPlayerUpgrade',
        upgradeName: 'Upgrade_PlayerRadar',
      },
    ]);
    expect(audioManager.playedEvents).toEqual(['UI_PlayerUpgradeRadar']);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('routes OBJECT_UPGRADE commands to all selected objects', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_ObjectArmorUpgrade', {
        Command: 'OBJECT_UPGRADE',
        Upgrade: 'Upgrade_ObjectArmor',
        UnitSpecificSound: 'UI_ObjectUpgrade',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();
    audioManager.validEvents.add('UI_ObjectUpgrade');

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_ObjectArmorUpgrade',
          GUICommandType.GUI_COMMAND_OBJECT_UPGRADE,
          { selectedObjectIds: [4, 7] },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'applyUpgrade',
        entityId: 4,
        upgradeName: 'Upgrade_ObjectArmor',
      },
      {
        type: 'applyUpgrade',
        entityId: 7,
        upgradeName: 'Upgrade_ObjectArmor',
      },
    ]);
    expect(audioManager.playedEvents).toEqual(['UI_ObjectUpgrade']);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('routes SET_RALLY_POINT commands to a single selected structure', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_SetRallyPoint', {
        Command: 'SET_RALLY_POINT',
        UnitSpecificSound: 'UI_SetRallyPoint',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();
    audioManager.validEvents.add('UI_SetRallyPoint');

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_SetRallyPoint',
          GUICommandType.GUI_COMMAND_SET_RALLY_POINT,
          {
            selectedObjectIds: [41],
            targetPosition: [120, 0, 340],
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'setRallyPoint',
        entityId: 41,
        targetX: 120,
        targetZ: 340,
      },
    ]);
    expect(audioManager.playedEvents).toEqual(['UI_SetRallyPoint']);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('routes GUARD object-target commands with source guard mode values', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_Guard', {
        Command: 'GUARD',
        UnitSpecificSound: 'UI_Guard',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();
    audioManager.validEvents.add('UI_Guard');

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_Guard',
          GUICommandType.GUI_COMMAND_GUARD,
          {
            selectedObjectIds: [8, 9],
            targetObjectId: 77,
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'guardObject',
        entityId: 8,
        targetEntityId: 77,
        guardMode: GuardMode.GUARDMODE_NORMAL,
      },
      {
        type: 'guardObject',
        entityId: 9,
        targetEntityId: 77,
        guardMode: GuardMode.GUARDMODE_NORMAL,
      },
    ]);
    expect(audioManager.playedEvents).toEqual(['UI_Guard']);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('falls back to guarding current position when GUARD_WITHOUT_PURSUIT has no explicit target', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_GuardNoPursuit', {
        Command: 'GUARD_WITHOUT_PURSUIT',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.setEntityWorldPosition(14, [40, 5, 60]);
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_GuardNoPursuit',
          GUICommandType.GUI_COMMAND_GUARD_WITHOUT_PURSUIT,
          {
            selectedObjectIds: [14],
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'guardPosition',
        entityId: 14,
        targetX: 40,
        targetZ: 60,
        guardMode: GuardMode.GUARDMODE_GUARD_WITHOUT_PURSUIT,
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('routes GUARD_FLYING_UNITS_ONLY position-target commands', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_GuardFlyingOnly', {
        Command: 'GUARD_FLYING_UNITS_ONLY',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_GuardFlyingOnly',
          GUICommandType.GUI_COMMAND_GUARD_FLYING_UNITS_ONLY,
          {
            selectedObjectIds: [22],
            targetPosition: [90, 0, 110],
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'guardPosition',
        entityId: 22,
        targetX: 90,
        targetZ: 110,
        guardMode: GuardMode.GUARDMODE_GUARD_FLYING_UNITS_ONLY,
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('routes SPECIAL_POWER object-target commands to special-power runtime payloads', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_ObjectSpecialPower', {
        Command: 'SPECIAL_POWER',
        SpecialPower: 'SpecialPowerEMPPulse',
        UnitSpecificSound: 'UI_SpecialPower',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();
    audioManager.validEvents.add('UI_SpecialPower');

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_ObjectSpecialPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER,
          {
            commandOption: CommandOption.NEED_TARGET_ENEMY_OBJECT,
            selectedObjectIds: [31],
            targetObjectId: 77,
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'issueSpecialPower',
        commandButtonId: 'Command_ObjectSpecialPower',
        specialPowerName: 'SpecialPowerEMPPulse',
        commandOption: CommandOption.NEED_TARGET_ENEMY_OBJECT,
        issuingEntityIds: [31],
        sourceEntityId: null,
        targetEntityId: 77,
        targetX: null,
        targetZ: null,
      },
    ]);
    expect(audioManager.playedEvents).toEqual(['UI_SpecialPower']);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('uses context payload target data for SPECIAL_POWER position-target commands', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_PositionSpecialPower', {
        Command: 'SPECIAL_POWER',
        SpecialPower: 'SpecialPowerA10Strike',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_PositionSpecialPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER,
          {
            commandOption: CommandOption.NEED_TARGET_POS | CommandOption.CONTEXTMODE_COMMAND,
            selectedObjectIds: [8],
            contextPayload: {
              targetObjectId: 99,
              targetPosition: [450, 0, 275],
            },
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'issueSpecialPower',
        commandButtonId: 'Command_PositionSpecialPower',
        specialPowerName: 'SpecialPowerA10Strike',
        commandOption: CommandOption.NEED_TARGET_POS | CommandOption.CONTEXTMODE_COMMAND,
        issuingEntityIds: [8],
        sourceEntityId: null,
        targetEntityId: 99,
        targetX: 450,
        targetZ: 275,
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('requires selected source units for GUI_COMMAND_SPECIAL_POWER', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_UnitSpecialPower', {
        Command: 'SPECIAL_POWER',
        SpecialPower: 'SpecialPowerPointDefenseLaser',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_UnitSpecialPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER,
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual(['Special Power requires a selected source unit.']);
  });

  it('shows TODO guidance when SPECIAL_POWER buttons miss SpecialPower field', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_MissingSpecialPower', {
        Command: 'SPECIAL_POWER',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_MissingSpecialPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER,
          {
            selectedObjectIds: [1],
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([
      'TODO: Command_MissingSpecialPower special power template is not mapped yet.',
    ]);
  });

  it('blocks GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT until source lookup parity is wired', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_ShortcutSpecialPower', {
        Command: 'SPECIAL_POWER_FROM_SHORTCUT',
        SpecialPower: 'SpecialPowerCarpetBombing',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_ShortcutSpecialPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT,
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([
      'TODO: shortcut special power source lookup has no tracked ready-frame source.',
    ]);
  });

  it('routes GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT when source lookup resolves', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_ShortcutSpecialPower', {
        Command: 'SPECIAL_POWER_FROM_SHORTCUT',
        SpecialPower: 'SpecialPowerCarpetBombing',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.setShortcutSpecialPowerSourceEntity('SpecialPowerCarpetBombing', 91);
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_ShortcutSpecialPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT,
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'issueSpecialPower',
        commandButtonId: 'Command_ShortcutSpecialPower',
        specialPowerName: 'SpecialPowerCarpetBombing',
        commandOption: 0,
        issuingEntityIds: [91],
        sourceEntityId: 91,
        targetEntityId: null,
        targetX: null,
        targetZ: null,
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('routes GUI_COMMAND_SPECIAL_POWER_CONSTRUCT with source + position payload', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_ConstructSpecialPower', {
        Command: 'SPECIAL_POWER_CONSTRUCT',
        SpecialPower: 'SpecialPowerSneakAttack',
        Object: 'GLAInfantryTunnelNetwork',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_ConstructSpecialPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_CONSTRUCT,
          {
            selectedObjectIds: [66],
            targetPosition: [300, 0, 425],
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'issueSpecialPower',
        commandButtonId: 'Command_ConstructSpecialPower',
        specialPowerName: 'SpecialPowerSneakAttack',
        commandOption: 0,
        issuingEntityIds: [66],
        sourceEntityId: 66,
        targetEntityId: null,
        targetX: 300,
        targetZ: 425,
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('requires world target for GUI_COMMAND_SPECIAL_POWER_CONSTRUCT', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_ConstructSpecialPower', {
        Command: 'SPECIAL_POWER_CONSTRUCT',
        SpecialPower: 'SpecialPowerSneakAttack',
        Object: 'GLAInfantryTunnelNetwork',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_ConstructSpecialPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_CONSTRUCT,
          {
            selectedObjectIds: [66],
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([
      'Construct Special Power requires a world target.',
    ]);
  });

  it('shows TODO guidance when SPECIAL_POWER_CONSTRUCT button misses Object field', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_ConstructSpecialPowerMissingObject', {
        Command: 'SPECIAL_POWER_CONSTRUCT',
        SpecialPower: 'SpecialPowerSneakAttack',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_ConstructSpecialPowerMissingObject',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_CONSTRUCT,
          {
            selectedObjectIds: [66],
            targetPosition: [300, 0, 425],
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([
      'TODO: Command_ConstructSpecialPowerMissingObject construct object template is not mapped yet.',
    ]);
  });

  it('blocks GUI_COMMAND_SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT when source lookup is unresolved', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_ConstructShortcutSpecialPower', {
        Command: 'SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT',
        SpecialPower: 'SpecialPowerSneakAttack',
        Object: 'GLAInfantryTunnelNetwork',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_ConstructShortcutSpecialPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT,
          {
            targetPosition: [130, 0, 220],
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([
      'TODO: shortcut special power source lookup has no tracked ready-frame source.',
    ]);
  });

  it('routes GUI_COMMAND_SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT with resolved source + position', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_ConstructShortcutSpecialPower', {
        Command: 'SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT',
        SpecialPower: 'SpecialPowerSneakAttack',
        Object: 'GLAInfantryTunnelNetwork',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.setShortcutSpecialPowerSourceEntity('SpecialPowerSneakAttack', 55);
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_ConstructShortcutSpecialPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT,
          {
            targetPosition: [130, 0, 220],
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'issueSpecialPower',
        commandButtonId: 'Command_ConstructShortcutSpecialPower',
        specialPowerName: 'SpecialPowerSneakAttack',
        commandOption: 0,
        issuingEntityIds: [55],
        sourceEntityId: 55,
        targetEntityId: null,
        targetX: 130,
        targetZ: 220,
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('routes PURCHASE_SCIENCE commands to player science progression', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      {
        type: 'Science',
        name: 'SCIENCE_EMP_BOMB',
        fields: {
          SciencePurchasePointCost: '2',
        },
        blocks: [],
      },
      makeCommandButtonBlock('Command_PurchaseScience', {
        Command: 'PURCHASE_SCIENCE',
        Science: 'SCIENCE_EMP_BOMB',
        UnitSpecificSound: 'UI_PurchaseScience',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.localPlayerSciencePurchasePoints = 4;
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();
    audioManager.validEvents.add('UI_PurchaseScience');

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_PurchaseScience',
          GUICommandType.GUI_COMMAND_PURCHASE_SCIENCE,
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'purchaseScience',
        scienceName: 'SCIENCE_EMP_BOMB',
        scienceCost: 2,
      },
    ]);
    expect(audioManager.playedEvents).toEqual(['UI_PurchaseScience']);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('selects the first purchasable science on PURCHASE_SCIENCE commands', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      {
        type: 'Science',
        name: 'SCIENCE_ROOT',
        fields: {
          SciencePurchasePointCost: '1',
        },
        blocks: [],
      },
      {
        type: 'Science',
        name: 'SCIENCE_ALREADY_OWNED',
        fields: {
          SciencePurchasePointCost: '1',
        },
        blocks: [],
      },
      {
        type: 'Science',
        name: 'SCIENCE_NEEDS_ROOT',
        fields: {
          PrerequisiteSciences: 'SCIENCE_ROOT',
          SciencePurchasePointCost: '3',
        },
        blocks: [],
      },
      makeCommandButtonBlock('Command_PurchaseScience', {
        Command: 'PURCHASE_SCIENCE',
        Science: 'SCIENCE_ALREADY_OWNED SCIENCE_NEEDS_ROOT',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.localPlayerScienceNames = ['SCIENCE_ROOT', 'SCIENCE_ALREADY_OWNED'];
    gameLogic.localPlayerSciencePurchasePoints = 3;
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_PurchaseScience',
          GUICommandType.GUI_COMMAND_PURCHASE_SCIENCE,
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'purchaseScience',
        scienceName: 'SCIENCE_NEEDS_ROOT',
        scienceCost: 3,
      },
    ]);
  });

  it('does not dispatch PURCHASE_SCIENCE when all sciences are already owned or blocked by prerequisites', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      {
        type: 'Science',
        name: 'SCIENCE_ALREADY_OWNED',
        fields: {
          SciencePurchasePointCost: '1',
        },
        blocks: [],
      },
      {
        type: 'Science',
        name: 'SCIENCE_BLOCKED',
        fields: {
          PrerequisiteSciences: 'SCIENCE_ROOT',
          SciencePurchasePointCost: '1',
        },
        blocks: [],
      },
      makeCommandButtonBlock('Command_PurchaseScience', {
        Command: 'PURCHASE_SCIENCE',
        Science: 'SCIENCE_ALREADY_OWNED SCIENCE_BLOCKED',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.localPlayerScienceNames = ['SCIENCE_ALREADY_OWNED'];
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_PurchaseScience',
          GUICommandType.GUI_COMMAND_PURCHASE_SCIENCE,
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([
      'TODO: Command_PurchaseScience has no purchasable science yet.',
    ]);
  });

  it('shows TODO guidance when source command buttons miss required Upgrade or Science fields', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_PlayerUpgradeMissingField', {
        Command: 'PLAYER_UPGRADE',
      }),
      makeCommandButtonBlock('Command_ScienceMissingField', {
        Command: 'PURCHASE_SCIENCE',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_PlayerUpgradeMissingField',
          GUICommandType.GUI_COMMAND_PLAYER_UPGRADE,
        ),
        makeCommand(
          'Command_ScienceMissingField',
          GUICommandType.GUI_COMMAND_PURCHASE_SCIENCE,
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([
      'TODO: Command_PlayerUpgradeMissingField player upgrade is not mapped yet.',
      'TODO: Command_ScienceMissingField has no purchasable science yet.',
    ]);
  });

  it('skips disabled and hidden sciences when selecting PURCHASE_SCIENCE candidates', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      {
        type: 'Science',
        name: 'SCIENCE_DISABLED',
        fields: {
          SciencePurchasePointCost: '1',
        },
        blocks: [],
      },
      {
        type: 'Science',
        name: 'SCIENCE_HIDDEN',
        fields: {
          SciencePurchasePointCost: '1',
        },
        blocks: [],
      },
      {
        type: 'Science',
        name: 'SCIENCE_VISIBLE',
        fields: {
          SciencePurchasePointCost: '2',
        },
        blocks: [],
      },
      makeCommandButtonBlock('Command_PurchaseScience', {
        Command: 'PURCHASE_SCIENCE',
        Science: 'SCIENCE_DISABLED SCIENCE_HIDDEN SCIENCE_VISIBLE',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.localPlayerSciencePurchasePoints = 5;
    gameLogic.disabledScienceNames = ['SCIENCE_DISABLED'];
    gameLogic.hiddenScienceNames = ['SCIENCE_HIDDEN'];
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_PurchaseScience',
          GUICommandType.GUI_COMMAND_PURCHASE_SCIENCE,
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'purchaseScience',
        scienceName: 'SCIENCE_VISIBLE',
        scienceCost: 2,
      },
    ]);
  });

  it('does not dispatch PURCHASE_SCIENCE when player lacks purchase points', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      {
        type: 'Science',
        name: 'SCIENCE_EXPENSIVE',
        fields: {
          SciencePurchasePointCost: '5',
        },
        blocks: [],
      },
      makeCommandButtonBlock('Command_PurchaseScience', {
        Command: 'PURCHASE_SCIENCE',
        Science: 'SCIENCE_EXPENSIVE',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.localPlayerSciencePurchasePoints = 4;
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_PurchaseScience',
          GUICommandType.GUI_COMMAND_PURCHASE_SCIENCE,
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([
      'TODO: Command_PurchaseScience has no purchasable science yet.',
    ]);
  });

  it('preserves existing STOP dispatch behavior without synthetic fallback audio', () => {
    const registry = new IniDataRegistry();
    const gameLogic = new FakeGameLogic();
    gameLogic.selectedEntityId = 23;
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Unmapped_Stop', GUICommandType.GUI_COMMAND_STOP),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'stop',
        entityId: 23,
      },
    ]);
    expect(audioManager.playedEvents).toEqual([]);
  });
});
