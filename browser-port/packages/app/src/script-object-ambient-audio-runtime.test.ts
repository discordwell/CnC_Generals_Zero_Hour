import { describe, expect, it } from 'vitest';

import {
  AudioControl,
  AudioHandleSpecialValues,
  AudioPriority,
  AudioType,
  SoundType,
  type AudioEventInfo,
  type AudioEventRTS,
  type AudioHandle,
} from '@generals/audio';
import type { ScriptObjectAmbientSoundState } from '@generals/game-logic';

import { createScriptObjectAmbientAudioRuntimeBridge } from './script-object-ambient-audio-runtime.js';

class RecordingAudioManager {
  readonly addedEvents: AudioEventRTS[] = [];
  readonly addedEventInfos: AudioEventInfo[] = [];
  readonly removedEvents: Array<AudioHandle | string> = [];
  private readonly playingHandles = new Set<AudioHandle>();
  private nextHandle = AudioHandleSpecialValues.AHSV_FirstHandle;
  private readonly eventInfos = new Map<string, AudioEventInfo>();

  addAudioEvent(event: AudioEventRTS): AudioHandle {
    this.addedEvents.push({ ...event });
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.playingHandles.add(handle);
    return handle;
  }

  addAudioEventInfo(eventInfo: AudioEventInfo): void {
    this.addedEventInfos.push({ ...eventInfo });
    this.eventInfos.set(eventInfo.audioName, { ...eventInfo });
  }

  findAudioEventInfo(eventName: string): AudioEventInfo | null {
    return this.eventInfos.get(eventName) ?? null;
  }

  removeAudioEvent(audioEvent: AudioHandle | string): void {
    this.removedEvents.push(audioEvent);
    if (typeof audioEvent === 'number') {
      this.playingHandles.delete(audioEvent);
    }
  }

  isCurrentlyPlaying(handle: AudioHandle): boolean {
    return this.playingHandles.has(handle);
  }

  setHandlePlaying(handle: AudioHandle, playing: boolean): void {
    if (playing) {
      this.playingHandles.add(handle);
    } else {
      this.playingHandles.delete(handle);
    }
  }
}

class RecordingGameLogic {
  state: ScriptObjectAmbientSoundState[] = [];

  getScriptObjectAmbientSoundStates(): ScriptObjectAmbientSoundState[] {
    return this.state.map((entry) => ({ ...entry }));
  }
}

describe('createScriptObjectAmbientAudioRuntimeBridge', () => {
  it('starts and stops object ambient playback when script gate changes', () => {
    const gameLogic = new RecordingGameLogic();
    const audioManager = new RecordingAudioManager();
    const bridge = createScriptObjectAmbientAudioRuntimeBridge({
      gameLogic,
      audioManager,
    });

    gameLogic.state = [{
      entityId: 7,
      audioName: 'FactoryHum',
      enabled: true,
      toggleRevision: 0,
    }];
    bridge.syncAfterSimulationStep();

    expect(audioManager.addedEvents).toEqual([
      { eventName: 'FactoryHum', objectId: 7 },
    ]);

    gameLogic.state = [{
      entityId: 7,
      audioName: 'FactoryHum',
      enabled: false,
      toggleRevision: 1,
    }];
    bridge.syncAfterSimulationStep();

    expect(audioManager.removedEvents).toEqual([
      AudioHandleSpecialValues.AHSV_FirstHandle,
    ]);
  });

  it('restarts ambient playback on repeated enable requests', () => {
    const gameLogic = new RecordingGameLogic();
    const audioManager = new RecordingAudioManager();
    const bridge = createScriptObjectAmbientAudioRuntimeBridge({
      gameLogic,
      audioManager,
    });

    gameLogic.state = [{
      entityId: 11,
      audioName: 'LoopOneShotHybrid',
      enabled: true,
      toggleRevision: 0,
    }];
    bridge.syncAfterSimulationStep();

    gameLogic.state = [{
      entityId: 11,
      audioName: 'LoopOneShotHybrid',
      enabled: true,
      toggleRevision: 1,
    }];
    bridge.syncAfterSimulationStep();

    expect(audioManager.removedEvents).toEqual([
      AudioHandleSpecialValues.AHSV_FirstHandle,
    ]);
    expect(audioManager.addedEvents).toEqual([
      { eventName: 'LoopOneShotHybrid', objectId: 11 },
      { eventName: 'LoopOneShotHybrid', objectId: 11 },
    ]);
  });

  it('switches playback when ambient variant changes', () => {
    const gameLogic = new RecordingGameLogic();
    const audioManager = new RecordingAudioManager();
    const bridge = createScriptObjectAmbientAudioRuntimeBridge({
      gameLogic,
      audioManager,
    });

    gameLogic.state = [{
      entityId: 3,
      audioName: 'AmbientPristine',
      enabled: true,
      toggleRevision: 0,
    }];
    bridge.syncAfterSimulationStep();

    gameLogic.state = [{
      entityId: 3,
      audioName: 'AmbientDamaged',
      enabled: true,
      toggleRevision: 0,
    }];
    bridge.syncAfterSimulationStep();

    expect(audioManager.removedEvents).toEqual([
      AudioHandleSpecialValues.AHSV_FirstHandle,
    ]);
    expect(audioManager.addedEvents).toEqual([
      { eventName: 'AmbientPristine', objectId: 3 },
      { eventName: 'AmbientDamaged', objectId: 3 },
    ]);
  });

  it('does not auto-restart ended playback without a new trigger', () => {
    const gameLogic = new RecordingGameLogic();
    const audioManager = new RecordingAudioManager();
    const bridge = createScriptObjectAmbientAudioRuntimeBridge({
      gameLogic,
      audioManager,
    });

    gameLogic.state = [{
      entityId: 9,
      audioName: 'AmbientOneShot',
      enabled: true,
      toggleRevision: 0,
    }];
    bridge.syncAfterSimulationStep();

    audioManager.setHandlePlaying(AudioHandleSpecialValues.AHSV_FirstHandle, false);
    bridge.syncAfterSimulationStep();

    expect(audioManager.addedEvents).toEqual([
      { eventName: 'AmbientOneShot', objectId: 9 },
    ]);
  });

  it('stops playback when entity ambient state disappears', () => {
    const gameLogic = new RecordingGameLogic();
    const audioManager = new RecordingAudioManager();
    const bridge = createScriptObjectAmbientAudioRuntimeBridge({
      gameLogic,
      audioManager,
    });

    gameLogic.state = [{
      entityId: 5,
      audioName: 'AmbientEmitter',
      enabled: true,
      toggleRevision: 0,
    }];
    bridge.syncAfterSimulationStep();

    gameLogic.state = [];
    bridge.syncAfterSimulationStep();

    expect(audioManager.removedEvents).toEqual([
      AudioHandleSpecialValues.AHSV_FirstHandle,
    ]);
  });

  it('registers per-object custom ambient audio definitions before playback', () => {
    const gameLogic = new RecordingGameLogic();
    const audioManager = new RecordingAudioManager();
    const bridge = createScriptObjectAmbientAudioRuntimeBridge({
      gameLogic,
      audioManager,
    });

    audioManager.addAudioEventInfo({
      audioName: 'BaseAmbient',
      soundType: AudioType.AT_SoundEffect,
      type: SoundType.ST_WORLD,
      control: AudioControl.AC_LOOP,
      volume: 0.8,
      minVolume: 0.1,
      minRange: 15,
      maxRange: 120,
      priority: AudioPriority.AP_NORMAL,
    });

    gameLogic.state = [{
      entityId: 13,
      audioName: ' CUSTOM 13 BaseAmbient',
      enabled: true,
      toggleRevision: 0,
      customAudioDefinition: {
        sourceAudioName: 'BaseAmbient',
        loopingOverride: false,
        volumeOverride: 0.35,
        minVolumeOverride: 0.2,
        minRangeOverride: 20,
        maxRangeOverride: 180,
        priorityNameOverride: 'CRITICAL',
      },
    }];

    bridge.syncAfterSimulationStep();

    expect(audioManager.findAudioEventInfo(' CUSTOM 13 BaseAmbient')).toEqual({
      audioName: ' CUSTOM 13 BaseAmbient',
      soundType: AudioType.AT_SoundEffect,
      type: SoundType.ST_WORLD,
      control: 0,
      volume: 0.35,
      minVolume: 0.2,
      minRange: 20,
      maxRange: 180,
      priority: AudioPriority.AP_CRITICAL,
    });
    expect(audioManager.addedEvents).toEqual([
      { eventName: ' CUSTOM 13 BaseAmbient', objectId: 13 },
    ]);
  });
});
