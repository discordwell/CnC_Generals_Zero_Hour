import {
  AudioHandleSpecialValues,
  type AudioEventRTS,
  type AudioHandle,
} from '@generals/audio';

import type { ScriptObjectAmbientSoundState } from '@generals/game-logic';

interface AmbientPlaybackState {
  audioName: string;
  handle: AudioHandle | null;
  toggleRevision: number;
}

export interface ScriptObjectAmbientAudioRuntimeGameLogic {
  getScriptObjectAmbientSoundStates(): ScriptObjectAmbientSoundState[];
}

export interface ScriptObjectAmbientAudioRuntimeAudioManager {
  addAudioEvent(event: AudioEventRTS): AudioHandle;
  removeAudioEvent(audioEvent: AudioHandle | string): void;
  isCurrentlyPlaying(handle: AudioHandle): boolean;
}

export interface ScriptObjectAmbientAudioRuntimeBridge {
  syncAfterSimulationStep(): void;
}

export interface CreateScriptObjectAmbientAudioRuntimeBridgeOptions {
  gameLogic: ScriptObjectAmbientAudioRuntimeGameLogic;
  audioManager: ScriptObjectAmbientAudioRuntimeAudioManager;
}

function asPlayableHandle(handle: AudioHandle): AudioHandle | null {
  return handle >= AudioHandleSpecialValues.AHSV_FirstHandle ? handle : null;
}

function stopPlayback(
  audioManager: ScriptObjectAmbientAudioRuntimeAudioManager,
  state: AmbientPlaybackState,
): void {
  if (state.handle !== null) {
    audioManager.removeAudioEvent(state.handle);
    state.handle = null;
  }
}

export function createScriptObjectAmbientAudioRuntimeBridge(
  options: CreateScriptObjectAmbientAudioRuntimeBridgeOptions,
): ScriptObjectAmbientAudioRuntimeBridge {
  const { gameLogic, audioManager } = options;
  const playbackByEntityId = new Map<number, AmbientPlaybackState>();

  return {
    syncAfterSimulationStep(): void {
      const ambientStates = gameLogic.getScriptObjectAmbientSoundStates();
      const seenEntityIds = new Set<number>();

      for (const ambientState of ambientStates) {
        if (!Number.isFinite(ambientState.entityId)) {
          continue;
        }
        const entityId = Math.trunc(ambientState.entityId);
        if (entityId <= 0) {
          continue;
        }

        const normalizedAudioName = ambientState.audioName.trim();
        if (!normalizedAudioName) {
          continue;
        }

        seenEntityIds.add(entityId);

        let playback = playbackByEntityId.get(entityId);
        let shouldStartPlayback = false;
        if (!playback) {
          playback = {
            audioName: normalizedAudioName,
            handle: null,
            toggleRevision: Math.trunc(ambientState.toggleRevision),
          };
          playbackByEntityId.set(entityId, playback);
          shouldStartPlayback = ambientState.enabled;
        }

        if (playback.audioName !== normalizedAudioName) {
          stopPlayback(audioManager, playback);
          playback.audioName = normalizedAudioName;
          shouldStartPlayback = ambientState.enabled;
        }

        const nextRevision = Math.trunc(ambientState.toggleRevision);
        if (playback.toggleRevision !== nextRevision) {
          playback.toggleRevision = nextRevision;
          if (ambientState.enabled) {
            // Source parity: repeated enable requests can retrigger one-shot ambients.
            stopPlayback(audioManager, playback);
            shouldStartPlayback = true;
          } else {
            stopPlayback(audioManager, playback);
          }
        }

        if (!ambientState.enabled) {
          stopPlayback(audioManager, playback);
          continue;
        }

        if (playback.handle !== null && !audioManager.isCurrentlyPlaying(playback.handle)) {
          playback.handle = null;
        }

        if (shouldStartPlayback) {
          playback.handle = asPlayableHandle(audioManager.addAudioEvent({
            eventName: playback.audioName,
            objectId: entityId,
          }));
        }
      }

      for (const [entityId, playback] of playbackByEntityId) {
        if (seenEntityIds.has(entityId)) {
          continue;
        }
        stopPlayback(audioManager, playback);
        playbackByEntityId.delete(entityId);
      }
    },
  };
}
