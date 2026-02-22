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
  localPlayerSide = 'GDI';
  readonly submittedCommands: GameLogicCommand[] = [];
  localPlayerScienceNames: string[] = [];
  commandCenterEntityId: number | null = null;
  localPlayerSciencePurchasePoints = 0;
  disabledScienceNames: string[] = [];
  hiddenScienceNames: string[] = [];
  private readonly entityTemplateById = new Map<number, string>();
  private readonly entitySideById = new Map<number, string>();
  private readonly attackMoveDistanceByEntity = new Map<number, number>();
  private readonly entityPositionById = new Map<number, readonly [number, number, number]>();
  private readonly shortcutSpecialPowerSourceByName = new Map<string, number>();

  getSelectedEntityId(): number | null {
    return this.selectedEntityId;
  }

  getPlayerSide(_playerIndex: number): string | null {
    return this.localPlayerSide;
  }

  registerEntity(entityId: number, templateName: string, side = this.localPlayerSide): void {
    this.entityTemplateById.set(entityId, templateName);
    this.entitySideById.set(entityId, side);
  }

  getEntityIdsByTemplateAndSide(templateName: string, side: string): number[] {
    const normalizedTemplateName = templateName.trim().toUpperCase();
    const normalizedSide = side.trim().toUpperCase();
    const matchingIds: number[] = [];
    for (const [entityId, entityTemplate] of this.entityTemplateById) {
      if (
        entityTemplate.trim().toUpperCase() !== normalizedTemplateName
        || this.entitySideById.get(entityId)?.trim().toUpperCase() !== normalizedSide
      ) {
        continue;
      }
      matchingIds.push(entityId);
    }
    matchingIds.sort((left, right) => left - right);
    return matchingIds;
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

  resolveCommandCenterEntityId(): number | null {
    return this.commandCenterEntityId;
  }

  getLocalPlayerSelectionIds(): readonly number[] {
    return [];
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

  it('routes UNIT_BUILD commands to all selected objects', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_UnitBuild', {
        Command: 'UNIT_BUILD',
        Object: 'BattleBus',
        UnitSpecificSound: 'UI_UnitBuild',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();
    audioManager.validEvents.add('UI_UnitBuild');

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_UnitBuild', GUICommandType.GUI_COMMAND_UNIT_BUILD, {
          selectedObjectIds: [4, 7],
        }),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'queueUnitProduction',
        entityId: 4,
        unitTemplateName: 'BattleBus',
      },
      {
        type: 'queueUnitProduction',
        entityId: 7,
        unitTemplateName: 'BattleBus',
      },
    ]);
    expect(audioManager.playedEvents).toEqual(['UI_UnitBuild']);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('shows TODO guidance when UNIT_BUILD buttons miss Object field', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_BadUnitBuild', {
        Command: 'UNIT_BUILD',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_BadUnitBuild',
          GUICommandType.GUI_COMMAND_UNIT_BUILD,
          { selectedObjectIds: [1] },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([
      'TODO: Command_BadUnitBuild unit build template is not mapped yet.',
    ]);
  });

  it('dispatches CANCEL_UNIT_BUILD when queue context includes productionId', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CancelUnitBuild', {
        Command: 'CANCEL_UNIT_BUILD',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_CancelUnitBuild',
          GUICommandType.GUI_COMMAND_CANCEL_UNIT_BUILD,
          {
            selectedObjectIds: [8],
            contextPayload: {
              productionId: 12,
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
        type: 'cancelUnitProduction',
        entityId: 8,
        productionId: 12,
      },
    ]);
  });

  it('shows TODO guidance for CANCEL_UNIT_BUILD without queue context', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CancelUnitBuild', {
        Command: 'CANCEL_UNIT_BUILD',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_CancelUnitBuild',
          GUICommandType.GUI_COMMAND_CANCEL_UNIT_BUILD,
          {
            selectedObjectIds: [8],
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
      'TODO: Command_CancelUnitBuild cancel unit build needs a queued production id context to dispatch.',
    ]);
  });

  it('requires a single selected source for CANCEL_UNIT_BUILD dispatch', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CancelUnitBuild', {
        Command: 'CANCEL_UNIT_BUILD',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_CancelUnitBuild',
          GUICommandType.GUI_COMMAND_CANCEL_UNIT_BUILD,
          {
            selectedObjectIds: [8, 9],
            contextPayload: {
              productionId: 12,
            },
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
      'Cancel Unit Build requires a single selected source object.',
    ]);
  });

  it('dispatches GUI_COMMAND_DOZER_CONSTRUCT_CANCEL for a single selected source', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CancelDozer', {
        Command: 'DOZER_CONSTRUCT_CANCEL',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_CancelDozer', GUICommandType.GUI_COMMAND_DOZER_CONSTRUCT_CANCEL, {
          selectedObjectIds: [33],
        }),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'cancelDozerConstruction',
        entityId: 33,
      },
    ]);
    expect(uiRuntime.messages).toEqual([
    ]);
  });

  it('requires a single selected source for GUI_COMMAND_DOZER_CONSTRUCT_CANCEL', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CancelDozer', {
        Command: 'DOZER_CONSTRUCT_CANCEL',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_CancelDozer', GUICommandType.GUI_COMMAND_DOZER_CONSTRUCT_CANCEL, {
          selectedObjectIds: [33, 34],
        }),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([
      'Cancel dozer construction requires a single selected source object.',
    ]);
  });

  it('dispatches CANCEL_UPGRADE when queue context includes upgrade name', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CancelUpgrade', {
        Command: 'CANCEL_UPGRADE',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();
    audioManager.validEvents.add('UI_CancelUpgrade');

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_CancelUpgrade', GUICommandType.GUI_COMMAND_CANCEL_UPGRADE, {
          selectedObjectIds: [6],
          contextPayload: {
            upgradeName: 'Upgrade_Garrison',
          },
        }),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'cancelUpgradeProduction',
        entityId: 6,
        upgradeName: 'UPGRADE_GARRISON',
      },
    ]);
  });

  it('shows TODO guidance for CANCEL_UPGRADE without queued upgrade context', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CancelUpgrade', {
        Command: 'CANCEL_UPGRADE',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_CancelUpgrade', GUICommandType.GUI_COMMAND_CANCEL_UPGRADE, {
          selectedObjectIds: [6],
        }),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([
      'TODO: Command_CancelUpgrade cancel upgrade needs queued upgrade context to dispatch.',
    ]);
  });

  it('requires a single selected source for CANCEL_UPGRADE dispatch', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CancelUpgrade', {
        Command: 'CANCEL_UPGRADE',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_CancelUpgrade',
          GUICommandType.GUI_COMMAND_CANCEL_UPGRADE,
          {
            selectedObjectIds: [6, 7],
            contextPayload: {
              upgradeName: 'Upgrade_Garrison',
            },
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
      'Cancel Upgrade requires a single selected source object.',
    ]);
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

  it('blocks GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER when command-center source is unavailable', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CommandCenterPower', {
        Command: 'SPECIAL_POWER_FROM_COMMAND_CENTER',
        SpecialPower: 'SpecialPowerDozerDrop',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_CommandCenterPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER,
          {
            selectedObjectIds: [12],
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('dispatches GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER with command-center source when available', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CommandCenterPower', {
        Command: 'SPECIAL_POWER_FROM_COMMAND_CENTER',
        SpecialPower: 'SpecialPowerDozerDrop',
        UnitSpecificSound: 'UI_SpecialPower',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.commandCenterEntityId = 42;
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();
    audioManager.validEvents.add('UI_SpecialPower');

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_CommandCenterPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER,
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
        commandButtonId: 'Command_CommandCenterPower',
        specialPowerName: 'SpecialPowerDozerDrop',
        commandOption: 0,
        issuingEntityIds: [42],
        sourceEntityId: 42,
        targetEntityId: null,
        targetX: null,
        targetZ: null,
      },
    ]);
    expect(audioManager.playedEvents).toEqual(['UI_SpecialPower']);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('requires object targets for object-targeted GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CommandCenterObjectPower', {
        Command: 'SPECIAL_POWER_FROM_COMMAND_CENTER',
        SpecialPower: 'SpecialPowerNapalmAirstrike',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.commandCenterEntityId = 17;
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_CommandCenterObjectPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER,
          {
            commandOption: CommandOption.NEED_TARGET_ENEMY_OBJECT,
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
      'Special Power from command center requires an object target.',
    ]);
  });

  it('dispatches object-targeted GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER with context payload target', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CommandCenterObjectPower', {
        Command: 'SPECIAL_POWER_FROM_COMMAND_CENTER',
        SpecialPower: 'SpecialPowerNapalmAirstrike',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.commandCenterEntityId = 17;
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_CommandCenterObjectPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER,
          {
            commandOption: CommandOption.NEED_TARGET_ENEMY_OBJECT,
            contextPayload: {
              targetObjectId: 88,
              targetPosition: [111, 0, 222],
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
        commandButtonId: 'Command_CommandCenterObjectPower',
        specialPowerName: 'SpecialPowerNapalmAirstrike',
        commandOption: CommandOption.NEED_TARGET_ENEMY_OBJECT,
        issuingEntityIds: [17],
        sourceEntityId: 17,
        targetEntityId: 88,
        targetX: null,
        targetZ: null,
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('reports missing command-center source for GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CommandCenterObjectPower', {
        Command: 'SPECIAL_POWER_FROM_COMMAND_CENTER',
        SpecialPower: 'SpecialPowerNapalmAirstrike',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_CommandCenterObjectPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER,
          {
            commandOption: CommandOption.NEED_TARGET_ENEMY_OBJECT,
            targetObjectId: 88,
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('requires world targets for position-targeted GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CommandCenterPositionPower', {
        Command: 'SPECIAL_POWER_FROM_COMMAND_CENTER',
        SpecialPower: 'SpecialPowerParachuteDrop',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.commandCenterEntityId = 17;
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_CommandCenterPositionPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER,
          {
            commandOption: CommandOption.NEED_TARGET_POS,
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
      'Special Power from command center requires a world target.',
    ]);
  });

  it('dispatches position-targeted GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER with target payload', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CommandCenterPositionPower', {
        Command: 'SPECIAL_POWER_FROM_COMMAND_CENTER',
        SpecialPower: 'SpecialPowerParachuteDrop',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.commandCenterEntityId = 17;
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_CommandCenterPositionPower',
          GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_COMMAND_CENTER,
          {
            commandOption: CommandOption.NEED_TARGET_POS,
            targetPosition: [250, 0, 600],
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
        commandButtonId: 'Command_CommandCenterPositionPower',
        specialPowerName: 'SpecialPowerParachuteDrop',
        commandOption: CommandOption.NEED_TARGET_POS,
        issuingEntityIds: [17],
        sourceEntityId: 17,
        targetEntityId: null,
        targetX: 250,
        targetZ: 600,
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('treats GUI_COMMAND_NONE as no-op', () => {
    const registry = new IniDataRegistry();
    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_None',
          GUICommandType.GUI_COMMAND_NONE,
          {
            selectedObjectIds: [1, 2],
            targetObjectId: 99,
            targetPosition: [10, 0, 20],
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('treats GUI_COMMAND_NUM_COMMANDS as no-op', () => {
    const registry = new IniDataRegistry();
    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_Num', GUICommandType.GUI_COMMAND_NUM_COMMANDS, {
          selectedObjectIds: [1],
        }),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('dispatches GUICOMMANDMODE_SABOTAGE_BUILDING as enter-object action', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_Sabotage', {
        Command: 'SABOTAGE_BUILDING',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_Sabotage', GUICommandType.GUICOMMANDMODE_SABOTAGE_BUILDING, {
          selectedObjectIds: [55],
          targetObjectId: 99,
        }),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'enterObject',
        entityId: 55,
        targetObjectId: 99,
        action: 'sabotageBuilding',
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('dispatches GUI_COMMAND_SELECT_ALL_UNITS_OF_TYPE to clear and select matching local-team units', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_SelectAll', {
        Command: 'SELECT_ALL_UNITS_OF_TYPE',
        Object: 'Tank',
        UnitSpecificSound: 'UI_SelectAll',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.registerEntity(7, 'Tank', 'GDI');
    gameLogic.registerEntity(11, 'Tank', 'GDI');
    gameLogic.registerEntity(13, 'Tank', 'NOD');
    gameLogic.registerEntity(21, 'Mantis', 'GDI');
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();
    audioManager.validEvents.add('UI_SelectAll');

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_SelectAll',
          GUICommandType.GUI_COMMAND_SELECT_ALL_UNITS_OF_TYPE,
          {
            selectedObjectIds: [99],
          },
        ),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      { type: 'clearSelection' },
      {
        type: 'selectEntities',
        entityIds: [7, 11],
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
    expect(audioManager.playedEvents).toEqual(['UI_SelectAll']);
  });

  it('shows TODO guidance when SELECT_ALL_UNITS_OF_TYPE button misses Object/ThingTemplate mapping', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_BadSelectAll', {
        Command: 'SELECT_ALL_UNITS_OF_TYPE',
        UnitSpecificSound: 'UI_SelectAll',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();
    audioManager.validEvents.add('UI_SelectAll');

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_BadSelectAll',
          GUICommandType.GUI_COMMAND_SELECT_ALL_UNITS_OF_TYPE,
          {
            selectedObjectIds: [99],
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
      'TODO: Command_BadSelectAll select-all-units button missing Object/ThingTemplate mapping.',
    ]);
  });

  it('shows TODO guidance when local player side cannot be resolved for SELECT_ALL_UNITS_OF_TYPE', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_SelectAllWithoutSide', {
        Command: 'SELECT_ALL_UNITS_OF_TYPE',
        Object: 'Tank',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.localPlayerSide = '';
    gameLogic.registerEntity(7, 'Tank', 'GDI');
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_SelectAllWithoutSide',
          GUICommandType.GUI_COMMAND_SELECT_ALL_UNITS_OF_TYPE,
          {
            selectedObjectIds: [99],
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
      'TODO: Command_SelectAllWithoutSide select-all-units requires local player side resolution parity.',
    ]);
  });

  it('dispatches remaining infrastructure-style commands as game-logic commands', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_ExitContainer', {
        Command: 'EXIT_CONTAINER',
      }),
      makeCommandButtonBlock('Command_Evacuate', {
        Command: 'EVACUATE',
      }),
      makeCommandButtonBlock('Command_ExecuteRailedTransport', {
        Command: 'EXECUTE_RAILED_TRANSPORT',
      }),
      makeCommandButtonBlock('Command_BeaconDelete', {
        Command: 'BEACON_DELETE',
      }),
      makeCommandButtonBlock('Command_HackInternet', {
        Command: 'HACK_INTERNET',
      }),
      makeCommandButtonBlock('Command_ToggleOvercharge', {
        Command: 'TOGGLE_OVERCHARGE',
      }),
      makeCommandButtonBlock('Command_CombatDrop', {
        Command: 'COMBATDROP',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const selectedObjectIds = [20, 21];
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_ExitContainer', GUICommandType.GUI_COMMAND_EXIT_CONTAINER, {
          selectedObjectIds,
        }),
        makeCommand('Command_Evacuate', GUICommandType.GUI_COMMAND_EVACUATE, {
          selectedObjectIds,
        }),
        makeCommand(
          'Command_ExecuteRailedTransport',
          GUICommandType.GUI_COMMAND_EXECUTE_RAILED_TRANSPORT,
          {
            selectedObjectIds,
          },
        ),
        makeCommand('Command_BeaconDelete', GUICommandType.GUI_COMMAND_BEACON_DELETE, {
          selectedObjectIds,
        }),
        makeCommand('Command_HackInternet', GUICommandType.GUI_COMMAND_HACK_INTERNET, {
          selectedObjectIds,
        }),
        makeCommand(
          'Command_ToggleOvercharge',
          GUICommandType.GUI_COMMAND_TOGGLE_OVERCHARGE,
          {
            selectedObjectIds,
          },
        ),
        makeCommand(
          'Command_CombatDrop',
          GUICommandType.GUI_COMMAND_COMBATDROP,
          {
            selectedObjectIds,
            commandOption: CommandOption.NEED_OBJECT_TARGET,
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
      { type: 'exitContainer', entityId: 20 },
      { type: 'exitContainer', entityId: 21 },
      { type: 'evacuate', entityId: 20 },
      { type: 'evacuate', entityId: 21 },
      { type: 'executeRailedTransport', entityId: 20 },
      { type: 'executeRailedTransport', entityId: 21 },
      { type: 'beaconDelete', entityId: 20 },
      { type: 'beaconDelete', entityId: 21 },
      { type: 'hackInternet', entityId: 20 },
      { type: 'hackInternet', entityId: 21 },
      { type: 'toggleOvercharge', entityId: 20 },
      { type: 'toggleOvercharge', entityId: 21 },
      {
        type: 'combatDrop',
        entityId: 20,
        targetObjectId: 77,
        targetPosition: null,
      },
      {
        type: 'combatDrop',
        entityId: 21,
        targetObjectId: 77,
        targetPosition: null,
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('dispatches COMBATDROP to object target when target object ID is available', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CombatDrop', {
        Command: 'COMBATDROP',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_CombatDrop',
          GUICommandType.GUI_COMMAND_COMBATDROP,
          {
            selectedObjectIds: [99],
            commandOption: CommandOption.NEED_OBJECT_TARGET,
            targetObjectId: 500,
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
        type: 'combatDrop',
        entityId: 99,
        targetObjectId: 500,
        targetPosition: null,
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('dispatches COMBATDROP to location target when position data is available', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CombatDrop', {
        Command: 'COMBATDROP',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand(
          'Command_CombatDrop',
          GUICommandType.GUI_COMMAND_COMBATDROP,
          {
            selectedObjectIds: [99],
            commandOption: CommandOption.NEED_TARGET_POS,
            targetPosition: [12, 13, 14],
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
        type: 'combatDrop',
        entityId: 99,
        targetObjectId: null,
        targetPosition: [12, 13, 14],
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('requires COMBATDROP target data in dispatch', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_CombatDrop', {
        Command: 'COMBATDROP',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_CombatDrop', GUICommandType.GUI_COMMAND_COMBATDROP, {
          selectedObjectIds: [99],
          commandOption: CommandOption.NEED_OBJECT_TARGET,
        }),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([]);
    expect(uiRuntime.messages).toEqual(['Combat Drop requires an object target.']);
  });

  it('dispatches SELL as game-logic commands', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_Sell', {
        Command: 'SELL',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_Sell', GUICommandType.GUI_COMMAND_SELL, {
          selectedObjectIds: [7, 8],
        }),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'sell',
        entityId: 7,
      },
      {
        type: 'sell',
        entityId: 8,
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('dispatches FIRE_WEAPON for object-target commands using button weapon slot and MaxShotsToFire', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_FireWeapon', {
        Command: 'FIRE_WEAPON',
        WeaponSlot: 'SECONDARY',
        MaxShotsToFire: '3',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_FireWeapon', GUICommandType.GUI_COMMAND_FIRE_WEAPON, {
          selectedObjectIds: [55],
          commandOption: CommandOption.COMMAND_OPTION_NEED_OBJECT_TARGET,
          targetObjectId: 99,
        }),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'fireWeapon',
        entityId: 55,
        weaponSlot: 1,
        maxShotsToFire: 3,
        targetObjectId: 99,
        targetPosition: null,
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('dispatches FIRE_WEAPON with ATTACK_OBJECTS_POSITION using target object world position fallback', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_FireWeapon', {
        Command: 'FIRE_WEAPON',
        WeaponSlot: 'PRIMARY',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    gameLogic.setEntityWorldPosition(77, [300, 10, 400]);
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_FireWeapon', GUICommandType.GUI_COMMAND_FIRE_WEAPON, {
          selectedObjectIds: [55],
          commandOption: CommandOption.ATTACK_OBJECTS_POSITION
            | CommandOption.COMMAND_OPTION_NEED_OBJECT_TARGET,
          targetObjectId: 77,
        }),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'fireWeapon',
        entityId: 55,
        weaponSlot: 0,
        maxShotsToFire: 0x7fffffff,
        targetObjectId: 77,
        targetPosition: [300, 10, 400],
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('dispatches switch- and command-mode paths that are now implemented', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_SwitchWeapon', {
        Command: 'SWITCH_WEAPON',
        WeaponSlot: 'PRIMARY',
      }),
      makeCommandButtonBlock('Command_HijackVehicle', {
        Command: 'HIJACK_VEHICLE',
      }),
      makeCommandButtonBlock('Command_ConvertCarbomb', {
        Command: 'CONVERT_TO_CARBOMB',
      }),
      makeCommandButtonBlock('Command_PlaceBeacon', {
        Command: 'PLACE_BEACON',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_SwitchWeapon', GUICommandType.GUI_COMMAND_SWITCH_WEAPON, {
          selectedObjectIds: [55],
        }),
        makeCommand(
          'Command_HijackVehicle',
          GUICommandType.GUICOMMANDMODE_HIJACK_VEHICLE,
          {
            selectedObjectIds: [55],
            targetObjectId: 101,
          },
        ),
        makeCommand(
          'Command_ConvertCarbomb',
          GUICommandType.GUICOMMANDMODE_CONVERT_TO_CARBOMB,
          {
            selectedObjectIds: [55],
            targetObjectId: 101,
          },
        ),
        makeCommand(
          'Command_PlaceBeacon',
          GUICommandType.GUICOMMANDMODE_PLACE_BEACON,
          {
            targetPosition: [5, 0, 6],
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
        type: 'switchWeapon',
        entityId: 55,
        weaponSlot: 0,
      },
      {
        type: 'enterObject',
        entityId: 55,
        targetObjectId: 101,
        action: 'hijackVehicle',
      },
      {
        type: 'enterObject',
        entityId: 55,
        targetObjectId: 101,
        action: 'convertToCarBomb',
      },
      {
        type: 'placeBeacon',
        targetPosition: [5, 0, 6],
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
  });

  it('defaults SWITCH_WEAPON to primary slot when WeaponSlot metadata is missing', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_SwitchWeaponDefault', {
        Command: 'SWITCH_WEAPON',
      }),
    ]);

    const gameLogic = new FakeGameLogic();
    const uiRuntime = new FakeUiRuntime();
    const audioManager = new FakeAudioManager();

    dispatchIssuedControlBarCommands(
      [
        makeCommand('Command_SwitchWeaponDefault', GUICommandType.GUI_COMMAND_SWITCH_WEAPON, {
          selectedObjectIds: [71],
        }),
      ],
      registry,
      gameLogic,
      uiRuntime,
      audioManager as unknown as AudioManager,
    );

    expect(gameLogic.submittedCommands).toEqual([
      {
        type: 'switchWeapon',
        entityId: 71,
        weaponSlot: 0,
      },
    ]);
    expect(uiRuntime.messages).toEqual([]);
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
        commandSource: 'PLAYER',
      },
    ]);
    expect(audioManager.playedEvents).toEqual([]);
  });
});
