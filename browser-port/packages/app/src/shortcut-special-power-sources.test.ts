import { describe, expect, it } from 'vitest';

import { IniDataRegistry } from '@generals/ini-data';
import { GUICommandType, type ControlBarButton } from '@generals/ui';

import {
  collectShortcutSpecialPowerNames,
  collectShortcutSpecialPowerReadyFrames,
  SHORTCUT_SPECIAL_POWER_READY_FRAME_DISABLED,
  SHORTCUT_SPECIAL_POWER_READY_FRAME_NOW,
} from './shortcut-special-power-sources.js';

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

describe('collectShortcutSpecialPowerNames', () => {
  it('collects only shortcut special powers from control-bar buttons', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_NormalSpecialPower', {
        Command: 'SPECIAL_POWER',
        SpecialPower: 'SpecialPowerA10Strike',
      }),
      makeCommandButtonBlock('Command_ShortcutSpecialPower', {
        Command: 'SPECIAL_POWER_FROM_SHORTCUT',
        SpecialPower: 'SpecialPowerCarpetBombing',
      }),
      makeCommandButtonBlock('Command_ConstructShortcutSpecialPower', {
        Command: 'SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT',
        SpecialPower: 'SpecialPowerSneakAttack',
        Object: 'GLAInfantryTunnelNetwork',
      }),
    ]);

    const buttons: ControlBarButton[] = [
      {
        id: 'Command_NormalSpecialPower',
        label: 'Normal',
        commandType: GUICommandType.GUI_COMMAND_SPECIAL_POWER,
      },
      {
        id: 'Command_ShortcutSpecialPower',
        label: 'Shortcut',
        commandType: GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT,
      },
      {
        id: 'Command_ConstructShortcutSpecialPower',
        label: 'Construct Shortcut',
        commandType: GUICommandType.GUI_COMMAND_SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT,
      },
    ];

    expect(
      [...collectShortcutSpecialPowerNames(buttons, registry)].sort(),
    ).toEqual(['SPECIALPOWERCARPETBOMBING', 'SPECIALPOWERSNEAKATTACK']);
  });

  it('ignores missing or malformed special power references', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_ShortcutMissingSpecialPower', {
        Command: 'SPECIAL_POWER_FROM_SHORTCUT',
      }),
    ]);

    const buttons: ControlBarButton[] = [
      {
        id: 'Command_NotInRegistry',
        label: 'Unknown',
        commandType: GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT,
      },
      {
        id: 'Command_ShortcutMissingSpecialPower',
        label: 'MissingField',
        commandType: GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT,
      },
    ];

    expect(collectShortcutSpecialPowerNames(buttons, registry)).toEqual(new Set());
  });

  it('tracks shortcut special-power ready frames from button enabled state', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeCommandButtonBlock('Command_DisabledShortcut', {
        Command: 'SPECIAL_POWER_FROM_SHORTCUT',
        SpecialPower: 'SpecialPowerCarpetBombing',
      }),
      makeCommandButtonBlock('Command_EnabledShortcut', {
        Command: 'SPECIAL_POWER_FROM_SHORTCUT',
        SpecialPower: 'SpecialPowerCarpetBombing',
      }),
      makeCommandButtonBlock('Command_ConstructShortcut', {
        Command: 'SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT',
        SpecialPower: 'SpecialPowerSneakAttack',
      }),
    ]);

    const buttons: ControlBarButton[] = [
      {
        id: 'Command_DisabledShortcut',
        label: 'Disabled',
        commandType: GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT,
        enabled: false,
      },
      {
        id: 'Command_EnabledShortcut',
        label: 'Enabled',
        commandType: GUICommandType.GUI_COMMAND_SPECIAL_POWER_FROM_SHORTCUT,
        enabled: true,
      },
      {
        id: 'Command_ConstructShortcut',
        label: 'Construct',
        commandType: GUICommandType.GUI_COMMAND_SPECIAL_POWER_CONSTRUCT_FROM_SHORTCUT,
        enabled: false,
      },
    ];

    expect(
      [...collectShortcutSpecialPowerReadyFrames(buttons, registry).entries()].sort((a, b) =>
        a[0].localeCompare(b[0]),
      ),
    ).toEqual([
      ['SPECIALPOWERCARPETBOMBING', SHORTCUT_SPECIAL_POWER_READY_FRAME_NOW],
      ['SPECIALPOWERSNEAKATTACK', SHORTCUT_SPECIAL_POWER_READY_FRAME_DISABLED],
    ]);
  });
});
