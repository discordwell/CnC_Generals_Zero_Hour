import { describe, expect, it } from 'vitest';

import type { AudioManager } from '@generals/audio';
import { IniDataRegistry } from '@generals/ini-data';
import { GUICommandType, type IssuedControlBarCommand } from '@generals/ui';

import {
  playIssuedCommandAudio,
  resolveIssuedCommandAudioEventName,
  resolveUiFeedbackAudioEventName,
} from './control-bar-audio.js';

function makeCommand(
  sourceButtonId: string,
  commandType: GUICommandType,
): IssuedControlBarCommand {
  return {
    sourceButtonId,
    commandType,
    commandOption: 0,
    selectedObjectIds: [1],
  };
}

class RecordingAudioManager {
  readonly events: Array<string | { eventName: string; playerIndex: number }> = [];
  private readonly validAudioEvents = new Set<string>();

  setValidAudioEvents(eventNames: readonly string[]): void {
    this.validAudioEvents.clear();
    for (const eventName of eventNames) {
      this.validAudioEvents.add(eventName);
    }
  }

  isValidAudioEvent(eventName: string): boolean {
    return this.validAudioEvents.has(eventName);
  }

  addAudioEvent(event: string | { eventName: string; playerIndex: number }): void {
    this.events.push(event);
  }
}

describe('control-bar audio routing', () => {
  it('uses UnitSpecificSound from CommandButton definitions when present', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      {
        type: 'CommandButton',
        name: 'Command_AttackMove',
        fields: {
          Command: 'ATTACK_MOVE',
          UnitSpecificSound: 'UnitSound_AttackMove',
        },
        blocks: [],
      },
    ]);

    const eventName = resolveIssuedCommandAudioEventName(
      registry,
      makeCommand('Command_AttackMove', GUICommandType.GUI_COMMAND_ATTACK_MOVE),
    );

    expect(eventName).toBe('UnitSound_AttackMove');
  });

  it('suppresses fallback audio when UnitSpecificSound is explicitly NoSound', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      {
        type: 'CommandButton',
        name: 'Command_Stop',
        fields: {
          Command: 'STOP',
          UnitSpecificSound: 'NoSound',
        },
        blocks: [],
      },
    ]);

    const eventName = resolveIssuedCommandAudioEventName(
      registry,
      makeCommand('Command_Stop', GUICommandType.GUI_COMMAND_STOP),
    );

    expect(eventName).toBeNull();
  });

  it('suppresses command audio for unmapped command button IDs', () => {
    const registry = new IniDataRegistry();

    const stop = resolveIssuedCommandAudioEventName(
      registry,
      makeCommand('Unmapped_Stop', GUICommandType.GUI_COMMAND_STOP),
    );
    const attackMove = resolveIssuedCommandAudioEventName(
      registry,
      makeCommand('Unmapped_AttackMove', GUICommandType.GUI_COMMAND_ATTACK_MOVE),
    );

    expect(stop).toBeNull();
    expect(attackMove).toBeNull();
  });

  it('maps UI feedback sounds from MiscAudio when present', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      {
        type: 'MiscAudio',
        name: '',
        fields: {
          GUIClickSound: 'Gui_Click',
          NoCanDoSound: 'Gui_NoCanDo',
        },
        blocks: [],
      },
    ]);

    expect(resolveUiFeedbackAudioEventName(registry, 'select')).toBe('Gui_Click');
    expect(resolveUiFeedbackAudioEventName(registry, 'accept')).toBe('Gui_Click');
    expect(resolveUiFeedbackAudioEventName(registry, 'invalid')).toBe('Gui_NoCanDo');
  });

  it('falls back to legacy UI feedback sound names without MiscAudio', () => {
    const registry = new IniDataRegistry();

    expect(resolveUiFeedbackAudioEventName(registry, 'select')).toBe('ControlBar_Select');
    expect(resolveUiFeedbackAudioEventName(registry, 'accept')).toBe('ControlBar_Accept');
    expect(resolveUiFeedbackAudioEventName(registry, 'invalid')).toBe('ControlBar_Invalid');
  });

  it('passes local player index on issued command audio events', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      {
        type: 'CommandButton',
        name: 'Command_AttackMove',
        fields: {
          Command: 'ATTACK_MOVE',
          UnitSpecificSound: 'UnitSound_AttackMove',
        },
        blocks: [],
      },
    ]);
    const audioManager = new RecordingAudioManager();
    audioManager.setValidAudioEvents(['UnitSound_AttackMove']);

    playIssuedCommandAudio(
      registry,
      audioManager as unknown as AudioManager,
      makeCommand('Command_AttackMove', GUICommandType.GUI_COMMAND_ATTACK_MOVE),
      4,
    );

    expect(audioManager.events).toEqual([
      {
        eventName: 'UnitSound_AttackMove',
        playerIndex: 4,
      },
    ]);
  });

  it('uses plain event names when local player index is unavailable', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      {
        type: 'CommandButton',
        name: 'Command_Stop',
        fields: {
          Command: 'STOP',
          UnitSpecificSound: 'UnitSound_Stop',
        },
        blocks: [],
      },
    ]);
    const audioManager = new RecordingAudioManager();
    audioManager.setValidAudioEvents(['UnitSound_Stop']);

    playIssuedCommandAudio(
      registry,
      audioManager as unknown as AudioManager,
      makeCommand('Command_Stop', GUICommandType.GUI_COMMAND_STOP),
      null,
    );

    expect(audioManager.events).toEqual(['UnitSound_Stop']);
  });
});
