import { describe, expect, it } from 'vitest';

import { AudioAffect, AudioHandleSpecialValues, type AudioEventRTS, type AudioHandle } from '@generals/audio';

import { createScriptAudioRuntimeBridge, type ScriptAudioRuntimeGameLogic } from './script-audio-runtime.js';

class RecordingAudioManager {
  readonly addedEvents: AudioEventRTS[] = [];
  readonly removedEvents: Array<AudioHandle | string> = [];
  readonly pauseAudioCalls: AudioAffect[] = [];
  readonly resumeAudioCalls: AudioAffect[] = [];
  readonly pauseAmbientCalls: boolean[] = [];
  readonly setVolumeCalls: Array<{ volume: number; whichToAffect: AudioAffect }> = [];
  readonly setAudioEventEnabledCalls: Array<{ eventName: string; enabled: boolean }> = [];
  readonly setAudioEventVolumeOverrideCalls: Array<{ eventName: string; volume: number }> = [];
  removeDisabledEventsCallCount = 0;

  private readonly handleByEventName = new Map<string, AudioHandle>();
  private readonly playingHandles = new Set<AudioHandle>();
  private nextHandle = AudioHandleSpecialValues.AHSV_FirstHandle;

  setNextHandleForEvent(eventName: string, handle: AudioHandle): void {
    this.handleByEventName.set(eventName, handle);
  }

  setHandlePlaying(handle: AudioHandle, playing: boolean): void {
    if (playing) {
      this.playingHandles.add(handle);
      return;
    }
    this.playingHandles.delete(handle);
  }

  addAudioEvent(event: AudioEventRTS): AudioHandle {
    this.addedEvents.push({ ...event });
    const handle = this.handleByEventName.get(event.eventName) ?? this.nextHandle++;
    if (handle >= AudioHandleSpecialValues.AHSV_FirstHandle) {
      this.playingHandles.add(handle);
    }
    return handle;
  }

  removeAudioEvent(audioEvent: AudioHandle | string): void {
    this.removedEvents.push(audioEvent);
    if (typeof audioEvent === 'number') {
      this.playingHandles.delete(audioEvent);
    }
  }

  removeDisabledEvents(): void {
    this.removeDisabledEventsCallCount += 1;
  }

  isCurrentlyPlaying(handle: AudioHandle): boolean {
    return this.playingHandles.has(handle);
  }

  pauseAudio(whichToAffect: AudioAffect): void {
    this.pauseAudioCalls.push(whichToAffect);
  }

  resumeAudio(whichToAffect: AudioAffect): void {
    this.resumeAudioCalls.push(whichToAffect);
  }

  pauseAmbient(shouldPause: boolean): void {
    this.pauseAmbientCalls.push(shouldPause);
  }

  setVolume(volume: number, whichToAffect: AudioAffect): void {
    this.setVolumeCalls.push({ volume, whichToAffect });
  }

  setAudioEventEnabled(eventName: string, enabled: boolean): void {
    this.setAudioEventEnabledCalls.push({ eventName, enabled });
  }

  setAudioEventVolumeOverride(eventName: string, volume: number): void {
    this.setAudioEventVolumeOverrideCalls.push({ eventName, volume });
  }
}

interface MutableScriptState {
  playbackRequests: Array<{
    audioName: string;
    playbackType: 'SOUND_EFFECT' | 'SPEECH';
    allowOverlap: boolean;
    sourceEntityId: number | null;
    x: number | null;
    y: number | null;
    z: number | null;
    frame: number;
  }>;
  removalRequests: Array<{
    eventName: string | null;
    removeDisabledOnly: boolean;
    frame: number;
  }>;
  musicTrackState: {
    trackName: string;
    fadeOut: boolean;
    fadeIn: boolean;
    frame: number;
  } | null;
  soundVolumeScale: number;
  speechVolumeScale: number;
  musicVolumeScale: number;
  backgroundSoundsPaused: boolean;
  ambientSoundsPaused: boolean;
  disabledEventNames: string[];
  volumeOverrides: Array<{ eventName: string; volumeScale: number }>;
}

class RecordingGameLogic implements ScriptAudioRuntimeGameLogic {
  readonly completedSpeechNames: string[] = [];
  readonly completedAudioNames: string[] = [];
  readonly completedMusic: Array<{ trackName: string; index: number }> = [];

  readonly state: MutableScriptState = {
    playbackRequests: [],
    removalRequests: [],
    musicTrackState: null,
    soundVolumeScale: 1,
    speechVolumeScale: 1,
    musicVolumeScale: 1,
    backgroundSoundsPaused: false,
    ambientSoundsPaused: false,
    disabledEventNames: [],
    volumeOverrides: [],
  };

  drainScriptAudioPlaybackRequests(): MutableScriptState['playbackRequests'] {
    const drained = this.state.playbackRequests.map((request) => ({ ...request }));
    this.state.playbackRequests.length = 0;
    return drained;
  }

  drainScriptAudioRemovalRequests(): MutableScriptState['removalRequests'] {
    const drained = this.state.removalRequests.map((request) => ({ ...request }));
    this.state.removalRequests.length = 0;
    return drained;
  }

  notifyScriptSpeechCompleted(speechName: string): void {
    this.completedSpeechNames.push(speechName);
  }

  notifyScriptAudioCompleted(audioName: string): void {
    this.completedAudioNames.push(audioName);
  }

  notifyScriptMusicCompleted(trackName: string, index: number): void {
    this.completedMusic.push({ trackName, index });
  }

  isScriptBackgroundSoundsPaused(): boolean {
    return this.state.backgroundSoundsPaused;
  }

  isScriptAmbientSoundsPaused(): boolean {
    return this.state.ambientSoundsPaused;
  }

  getScriptMusicTrackState(): MutableScriptState['musicTrackState'] {
    return this.state.musicTrackState ? { ...this.state.musicTrackState } : null;
  }

  getScriptSoundVolumeScale(): number {
    return this.state.soundVolumeScale;
  }

  getScriptSpeechVolumeScale(): number {
    return this.state.speechVolumeScale;
  }

  getScriptMusicVolumeScale(): number {
    return this.state.musicVolumeScale;
  }

  getScriptDisabledAudioEventNames(): string[] {
    return [...this.state.disabledEventNames];
  }

  getScriptAudioVolumeOverrides(): MutableScriptState['volumeOverrides'] {
    return this.state.volumeOverrides.map((override) => ({ ...override }));
  }
}

describe('script audio runtime bridge', () => {
  it('queues script playback requests and dispatches completion notifications', () => {
    const gameLogic = new RecordingGameLogic();
    const audioManager = new RecordingAudioManager();
    audioManager.setNextHandleForEvent('MissionMissing', AudioHandleSpecialValues.AHSV_Error);
    const bridge = createScriptAudioRuntimeBridge({
      gameLogic,
      audioManager,
      getLocalPlayerIndex: () => 7,
    });

    gameLogic.state.playbackRequests.push(
      {
        audioName: 'MissionStart',
        playbackType: 'SOUND_EFFECT',
        allowOverlap: true,
        sourceEntityId: null,
        x: null,
        y: null,
        z: null,
        frame: 1,
      },
      {
        audioName: 'MissionAt',
        playbackType: 'SOUND_EFFECT',
        allowOverlap: true,
        sourceEntityId: null,
        x: 48,
        y: 0,
        z: 64,
        frame: 1,
      },
      {
        audioName: 'MissionFromUnit',
        playbackType: 'SOUND_EFFECT',
        allowOverlap: true,
        sourceEntityId: 11,
        x: 10,
        y: 1,
        z: 12,
        frame: 1,
      },
      {
        audioName: 'MissionSpeech',
        playbackType: 'SPEECH',
        allowOverlap: false,
        sourceEntityId: null,
        x: null,
        y: null,
        z: null,
        frame: 1,
      },
      {
        audioName: 'MissionMissing',
        playbackType: 'SOUND_EFFECT',
        allowOverlap: true,
        sourceEntityId: null,
        x: null,
        y: null,
        z: null,
        frame: 1,
      },
    );

    bridge.syncAfterSimulationStep();

    expect(audioManager.addedEvents).toEqual([
      { eventName: 'MissionStart', playerIndex: 7 },
      { eventName: 'MissionAt', position: [48, 0, 64], playerIndex: 7 },
      { eventName: 'MissionFromUnit', objectId: 11 },
      { eventName: 'MissionSpeech', playerIndex: 7, uninterruptable: true },
      { eventName: 'MissionMissing', playerIndex: 7 },
    ]);
    expect(gameLogic.completedAudioNames).toEqual(['MissionMissing']);

    const startHandle = AudioHandleSpecialValues.AHSV_FirstHandle;
    const atHandle = startHandle + 1;
    const fromUnitHandle = startHandle + 2;
    const speechHandle = startHandle + 3;
    audioManager.setHandlePlaying(startHandle, false);
    audioManager.setHandlePlaying(atHandle, false);
    audioManager.setHandlePlaying(fromUnitHandle, false);
    audioManager.setHandlePlaying(speechHandle, false);

    bridge.syncBeforeSimulationStep();

    expect(gameLogic.completedAudioNames).toEqual([
      'MissionMissing',
      'MissionStart',
      'MissionAt',
      'MissionFromUnit',
    ]);
    expect(gameLogic.completedSpeechNames).toEqual(['MissionSpeech']);
  });

  it('applies script audio controls and handles removal requests', () => {
    const gameLogic = new RecordingGameLogic();
    const audioManager = new RecordingAudioManager();
    const bridge = createScriptAudioRuntimeBridge({
      gameLogic,
      audioManager,
      getLocalPlayerIndex: () => 0,
    });

    gameLogic.state.soundVolumeScale = 0.5;
    gameLogic.state.speechVolumeScale = 0.25;
    gameLogic.state.musicVolumeScale = 0.75;
    gameLogic.state.backgroundSoundsPaused = true;
    gameLogic.state.ambientSoundsPaused = true;
    gameLogic.state.disabledEventNames = ['DisabledA'];
    gameLogic.state.volumeOverrides = [{ eventName: 'OverrideA', volumeScale: 1.2 }];
    gameLogic.state.removalRequests = [
      { eventName: null, removeDisabledOnly: true, frame: 3 },
      { eventName: 'RemoveThis', removeDisabledOnly: false, frame: 3 },
    ];

    bridge.syncAfterSimulationStep();

    expect(audioManager.setVolumeCalls).toEqual([
      {
        volume: 0.5,
        whichToAffect: AudioAffect.AudioAffect_Sound | AudioAffect.AudioAffect_Sound3D,
      },
      {
        volume: 0.25,
        whichToAffect: AudioAffect.AudioAffect_Speech,
      },
      {
        volume: 0.75,
        whichToAffect: AudioAffect.AudioAffect_Music,
      },
    ]);
    expect(audioManager.pauseAudioCalls).toEqual([AudioAffect.AudioAffect_Sound]);
    expect(audioManager.pauseAmbientCalls).toEqual([true]);
    expect(audioManager.setAudioEventEnabledCalls).toEqual([
      { eventName: '', enabled: true },
      { eventName: 'DisabledA', enabled: false },
    ]);
    expect(audioManager.setAudioEventVolumeOverrideCalls).toEqual([
      { eventName: 'OverrideA', volume: 1.2 },
    ]);
    expect(audioManager.removeDisabledEventsCallCount).toBe(1);
    expect(audioManager.removedEvents).toEqual(['RemoveThis']);

    gameLogic.state.backgroundSoundsPaused = false;
    gameLogic.state.ambientSoundsPaused = false;
    bridge.syncAfterSimulationStep();
    expect(audioManager.resumeAudioCalls).toEqual([AudioAffect.AudioAffect_Sound]);
    expect(audioManager.pauseAmbientCalls).toEqual([true, false]);
  });

  it('plays script music tracks once per frame and notifies completion indices', () => {
    const gameLogic = new RecordingGameLogic();
    const audioManager = new RecordingAudioManager();
    const bridge = createScriptAudioRuntimeBridge({
      gameLogic,
      audioManager,
      getLocalPlayerIndex: () => 2,
    });

    gameLogic.state.musicTrackState = {
      trackName: 'BattleTrack',
      fadeOut: true,
      fadeIn: false,
      frame: 9,
    };
    bridge.syncAfterSimulationStep();

    expect(audioManager.removedEvents).toEqual([AudioHandleSpecialValues.AHSV_StopTheMusicFade]);
    expect(audioManager.addedEvents[0]).toEqual({
      eventName: 'BattleTrack',
      audioAffect: AudioAffect.AudioAffect_Music,
      playerIndex: 2,
    });

    const firstMusicHandle = AudioHandleSpecialValues.AHSV_FirstHandle;
    audioManager.setHandlePlaying(firstMusicHandle, false);
    bridge.syncBeforeSimulationStep();
    expect(gameLogic.completedMusic).toEqual([{ trackName: 'BattleTrack', index: 1 }]);

    // Same frame should not enqueue a duplicate track change.
    bridge.syncAfterSimulationStep();
    expect(audioManager.addedEvents).toHaveLength(1);

    gameLogic.state.musicTrackState = {
      trackName: 'BattleTrack',
      fadeOut: false,
      fadeIn: true,
      frame: 10,
    };
    bridge.syncAfterSimulationStep();

    const secondMusicHandle = firstMusicHandle + 1;
    audioManager.setHandlePlaying(secondMusicHandle, false);
    bridge.syncBeforeSimulationStep();
    expect(gameLogic.completedMusic).toEqual([
      { trackName: 'BattleTrack', index: 1 },
      { trackName: 'BattleTrack', index: 2 },
    ]);
  });
});
