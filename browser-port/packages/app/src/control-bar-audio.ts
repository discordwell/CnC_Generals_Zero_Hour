import type { AudioManager } from '@generals/audio';
import { type IssuedControlBarCommand } from '@generals/ui';
import { IniDataRegistry } from '@generals/ini-data';

export function playUiAudioIfRegistered(audioManager: AudioManager, eventName: string): void {
  if (!audioManager.isValidAudioEvent(eventName)) {
    return;
  }
  audioManager.addAudioEvent(eventName);
}

function playUiAudioForPlayerIfRegistered(
  audioManager: AudioManager,
  eventName: string,
  playerIndex: number | null | undefined,
): void {
  if (!audioManager.isValidAudioEvent(eventName)) {
    return;
  }
  if (typeof playerIndex === 'number' && Number.isFinite(playerIndex)) {
    audioManager.addAudioEvent({
      eventName,
      playerIndex: Math.trunc(playerIndex),
    });
    return;
  }
  audioManager.addAudioEvent(eventName);
}

export function resolveIssuedCommandAudioEventName(
  iniDataRegistry: IniDataRegistry,
  command: IssuedControlBarCommand,
): string | null {
  const commandButton = iniDataRegistry.getCommandButton(command.sourceButtonId);
  if (!commandButton) {
    return null;
  }

  // Source behavior from ControlBar::processCommandUI: command UI playback is
  // driven directly by CommandButton::UnitSpecificSound. Explicit NoSound must
  // suppress playback.
  if (Object.prototype.hasOwnProperty.call(commandButton.fields, 'UnitSpecificSound')) {
    return commandButton.unitSpecificSoundName ?? null;
  }
  return commandButton.unitSpecificSoundName ?? null;
}

export function playIssuedCommandAudio(
  iniDataRegistry: IniDataRegistry,
  audioManager: AudioManager,
  command: IssuedControlBarCommand,
  localPlayerIndex?: number | null,
): void {
  const eventName = resolveIssuedCommandAudioEventName(iniDataRegistry, command);
  if (!eventName) {
    return;
  }

  // Source behavior from ControlBar::processCommandUI:
  // unit-specific command sounds carry the local player index.
  playUiAudioForPlayerIfRegistered(audioManager, eventName, localPlayerIndex);
}

export type UiFeedbackAudioKind = 'select' | 'accept' | 'invalid';

export function resolveUiFeedbackAudioEventName(
  iniDataRegistry: IniDataRegistry,
  kind: UiFeedbackAudioKind,
): string | null {
  const miscAudio = iniDataRegistry.getMiscAudio();
  if (kind === 'invalid') {
    return miscAudio?.noCanDoSoundName ?? 'ControlBar_Invalid';
  }

  return miscAudio?.guiClickSoundName ?? (kind === 'select' ? 'ControlBar_Select' : 'ControlBar_Accept');
}

export function playUiFeedbackAudio(
  iniDataRegistry: IniDataRegistry,
  audioManager: AudioManager,
  kind: UiFeedbackAudioKind,
): void {
  const eventName = resolveUiFeedbackAudioEventName(iniDataRegistry, kind);
  if (!eventName) {
    return;
  }
  playUiAudioIfRegistered(audioManager, eventName);
}
