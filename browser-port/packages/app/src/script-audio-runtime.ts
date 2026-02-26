import {
  AudioAffect,
  AudioHandleSpecialValues,
  type AudioEventRTS,
  type AudioHandle,
} from '@generals/audio';

type ScriptAudioPlaybackType = 'SOUND_EFFECT' | 'SPEECH';

interface ScriptAudioPlaybackRequestState {
  audioName: string;
  playbackType: ScriptAudioPlaybackType;
  allowOverlap: boolean;
  sourceEntityId: number | null;
  x: number | null;
  y: number | null;
  z: number | null;
  frame: number;
}

interface ScriptAudioRemovalRequestState {
  eventName: string | null;
  removeDisabledOnly: boolean;
  frame: number;
}

interface ScriptMusicTrackState {
  trackName: string;
  fadeOut: boolean;
  fadeIn: boolean;
  frame: number;
}

interface ScriptAudioVolumeOverrideState {
  eventName: string;
  volumeScale: number;
}

export interface ScriptAudioRuntimeGameLogic {
  drainScriptAudioPlaybackRequests(): ScriptAudioPlaybackRequestState[];
  drainScriptAudioRemovalRequests(): ScriptAudioRemovalRequestState[];
  notifyScriptSpeechCompleted(speechName: string): void;
  notifyScriptAudioCompleted(audioName: string): void;
  notifyScriptMusicCompleted(trackName: string, index: number): void;
  isScriptBackgroundSoundsPaused(): boolean;
  isScriptAmbientSoundsPaused(): boolean;
  getScriptMusicTrackState(): ScriptMusicTrackState | null;
  getScriptSoundVolumeScale(): number;
  getScriptSpeechVolumeScale(): number;
  getScriptMusicVolumeScale(): number;
  getScriptDisabledAudioEventNames(): string[];
  getScriptAudioVolumeOverrides(): ScriptAudioVolumeOverrideState[];
}

export interface ScriptAudioRuntimeAudioManager {
  addAudioEvent(event: AudioEventRTS): AudioHandle;
  removeAudioEvent(audioEvent: AudioHandle | string): void;
  removeDisabledEvents(): void;
  isCurrentlyPlaying(handle: AudioHandle): boolean;
  pauseAudio(whichToAffect: AudioAffect): void;
  resumeAudio(whichToAffect: AudioAffect): void;
  pauseAmbient(shouldPause: boolean): void;
  setVolume(volume: number, whichToAffect: AudioAffect): void;
  setAudioEventEnabled(eventToAffect: string, enable: boolean): void;
  setAudioEventVolumeOverride(eventToAffect: string, newVolume: number): void;
}

export interface ScriptAudioRuntimeBridge {
  syncBeforeSimulationStep(): void;
  syncAfterSimulationStep(): void;
}

interface PendingScriptAudioCompletion {
  audioName: string;
  playbackType: ScriptAudioPlaybackType;
}

interface PendingScriptMusicCompletion {
  trackName: string;
  completionIndex: number;
}

export interface CreateScriptAudioRuntimeBridgeOptions {
  gameLogic: ScriptAudioRuntimeGameLogic;
  audioManager: ScriptAudioRuntimeAudioManager;
  getLocalPlayerIndex: () => number | null;
}

function notifyScriptAudioCompleted(
  gameLogic: ScriptAudioRuntimeGameLogic,
  completion: PendingScriptAudioCompletion,
): void {
  if (completion.playbackType === 'SPEECH') {
    gameLogic.notifyScriptSpeechCompleted(completion.audioName);
    return;
  }
  gameLogic.notifyScriptAudioCompleted(completion.audioName);
}

function asPlayableHandle(handle: AudioHandle): AudioHandle | null {
  return handle >= AudioHandleSpecialValues.AHSV_FirstHandle ? handle : null;
}

export function createScriptAudioRuntimeBridge(
  options: CreateScriptAudioRuntimeBridgeOptions,
): ScriptAudioRuntimeBridge {
  const {
    gameLogic,
    audioManager,
    getLocalPlayerIndex,
  } = options;

  const pendingScriptAudioCompletionsByHandle = new Map<AudioHandle, PendingScriptAudioCompletion>();
  const pendingScriptMusicCompletionsByHandle = new Map<AudioHandle, PendingScriptMusicCompletion>();
  const completedScriptMusicCountByTrackName = new Map<string, number>();

  let lastScriptMusicFrame = -1;

  const syncCompletedHandles = (): void => {
    for (const [handle, completion] of pendingScriptAudioCompletionsByHandle) {
      if (audioManager.isCurrentlyPlaying(handle)) {
        continue;
      }
      pendingScriptAudioCompletionsByHandle.delete(handle);
      notifyScriptAudioCompleted(gameLogic, completion);
    }

    for (const [handle, completion] of pendingScriptMusicCompletionsByHandle) {
      if (audioManager.isCurrentlyPlaying(handle)) {
        continue;
      }
      pendingScriptMusicCompletionsByHandle.delete(handle);
      completedScriptMusicCountByTrackName.set(completion.trackName, completion.completionIndex);
      gameLogic.notifyScriptMusicCompleted(completion.trackName, completion.completionIndex);
    }
  };

  const applyScriptAudioControlState = (): void => {
    audioManager.setVolume(
      gameLogic.getScriptSoundVolumeScale(),
      AudioAffect.AudioAffect_Sound | AudioAffect.AudioAffect_Sound3D,
    );
    audioManager.setVolume(
      gameLogic.getScriptSpeechVolumeScale(),
      AudioAffect.AudioAffect_Speech,
    );
    audioManager.setVolume(
      gameLogic.getScriptMusicVolumeScale(),
      AudioAffect.AudioAffect_Music,
    );

    if (gameLogic.isScriptBackgroundSoundsPaused()) {
      audioManager.pauseAudio(AudioAffect.AudioAffect_Sound);
    } else {
      audioManager.resumeAudio(AudioAffect.AudioAffect_Sound);
    }

    audioManager.pauseAmbient(gameLogic.isScriptAmbientSoundsPaused());

    audioManager.setAudioEventEnabled('', true);
    for (const volumeOverride of gameLogic.getScriptAudioVolumeOverrides()) {
      audioManager.setAudioEventVolumeOverride(
        volumeOverride.eventName,
        volumeOverride.volumeScale,
      );
    }
    for (const disabledEventName of gameLogic.getScriptDisabledAudioEventNames()) {
      audioManager.setAudioEventEnabled(disabledEventName, false);
    }
  };

  const queueScriptMusicPlayback = (): void => {
    const musicTrackState = gameLogic.getScriptMusicTrackState();
    if (!musicTrackState || musicTrackState.frame === lastScriptMusicFrame) {
      return;
    }

    lastScriptMusicFrame = musicTrackState.frame;

    if (musicTrackState.fadeOut) {
      audioManager.removeAudioEvent(AudioHandleSpecialValues.AHSV_StopTheMusicFade);
    } else {
      audioManager.removeAudioEvent(AudioHandleSpecialValues.AHSV_StopTheMusic);
    }

    const localPlayerIndex = getLocalPlayerIndex();
    const musicEvent: AudioEventRTS = {
      eventName: musicTrackState.trackName,
      audioAffect: AudioAffect.AudioAffect_Music,
    };
    if (localPlayerIndex !== null) {
      musicEvent.playerIndex = localPlayerIndex;
    }

    const completionIndex =
      (completedScriptMusicCountByTrackName.get(musicTrackState.trackName) ?? 0) + 1;
    const handle = asPlayableHandle(audioManager.addAudioEvent(musicEvent));
    if (handle === null) {
      completedScriptMusicCountByTrackName.set(musicTrackState.trackName, completionIndex);
      gameLogic.notifyScriptMusicCompleted(musicTrackState.trackName, completionIndex);
      return;
    }

    pendingScriptMusicCompletionsByHandle.set(handle, {
      trackName: musicTrackState.trackName,
      completionIndex,
    });
  };

  const queueScriptAudioPlayback = (): void => {
    const playbackRequests = gameLogic.drainScriptAudioPlaybackRequests();
    for (const request of playbackRequests) {
      void request.frame;
      const audioEvent: AudioEventRTS = {
        eventName: request.audioName,
      };

      if (request.playbackType === 'SPEECH' && !request.allowOverlap) {
        audioEvent.uninterruptable = true;
      }

      if (request.sourceEntityId !== null) {
        audioEvent.objectId = request.sourceEntityId;
      } else if (
        request.x !== null
        && request.y !== null
        && request.z !== null
      ) {
        audioEvent.position = [request.x, request.y, request.z];
      }

      if (request.sourceEntityId === null) {
        const localPlayerIndex = getLocalPlayerIndex();
        if (localPlayerIndex !== null) {
          audioEvent.playerIndex = localPlayerIndex;
        }
      }

      const completion: PendingScriptAudioCompletion = {
        audioName: request.audioName,
        playbackType: request.playbackType,
      };
      const handle = asPlayableHandle(audioManager.addAudioEvent(audioEvent));
      if (handle === null) {
        notifyScriptAudioCompleted(gameLogic, completion);
        continue;
      }

      pendingScriptAudioCompletionsByHandle.set(handle, completion);
    }
  };

  const queueScriptAudioRemoval = (): void => {
    const removalRequests = gameLogic.drainScriptAudioRemovalRequests();
    for (const request of removalRequests) {
      void request.frame;
      if (request.removeDisabledOnly) {
        audioManager.removeDisabledEvents();
        continue;
      }
      if (request.eventName) {
        audioManager.removeAudioEvent(request.eventName);
      }
    }
  };

  return {
    syncBeforeSimulationStep(): void {
      syncCompletedHandles();
    },

    syncAfterSimulationStep(): void {
      applyScriptAudioControlState();
      queueScriptMusicPlayback();
      queueScriptAudioPlayback();
      queueScriptAudioRemoval();
      syncCompletedHandles();
    },
  };
}
