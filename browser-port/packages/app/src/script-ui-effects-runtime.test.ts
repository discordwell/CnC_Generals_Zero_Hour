import { describe, expect, it } from 'vitest';

import {
  createScriptUiEffectsRuntimeBridge,
  type ScriptUiEffectsRuntimeGameLogic,
} from './script-ui-effects-runtime.js';

interface MutableScriptUiEffectsState {
  movieRequests: Array<{
    movieName: string;
    playbackType: 'FULLSCREEN' | 'RADAR';
    frame: number;
  }>;
  cameoFlashRequests: Array<{
    commandButtonName: string;
    flashCount: number;
    frame: number;
  }>;
}

class RecordingGameLogic implements ScriptUiEffectsRuntimeGameLogic {
  readonly state: MutableScriptUiEffectsState = {
    movieRequests: [],
    cameoFlashRequests: [],
  };

  drainScriptMoviePlaybackRequests(): MutableScriptUiEffectsState['movieRequests'] {
    const drained = this.state.movieRequests.map((request) => ({ ...request }));
    this.state.movieRequests.length = 0;
    return drained;
  }

  drainScriptCameoFlashRequests(): MutableScriptUiEffectsState['cameoFlashRequests'] {
    const drained = this.state.cameoFlashRequests.map((request) => ({ ...request }));
    this.state.cameoFlashRequests.length = 0;
    return drained;
  }
}

class RecordingUiRuntime {
  readonly shownMessages: Array<{ message: string; durationMs: number | undefined }> = [];
  readonly flashingHistory: string[][] = [];
  flashingButtons: string[] = [];

  showMessage(message: string, durationMs?: number): void {
    this.shownMessages.push({ message, durationMs });
  }

  setFlashingControlBarButtons(buttonIds: readonly string[]): void {
    this.flashingButtons = [...buttonIds];
    this.flashingHistory.push([...buttonIds]);
  }
}

class RecordingLogger {
  readonly debugMessages: string[] = [];

  debug(message: string): void {
    this.debugMessages.push(message);
  }
}

describe('script ui-effects runtime bridge', () => {
  it('forwards movie playback requests to UI messaging', () => {
    const gameLogic = new RecordingGameLogic();
    const uiRuntime = new RecordingUiRuntime();
    const logger = new RecordingLogger();
    const bridge = createScriptUiEffectsRuntimeBridge({
      gameLogic,
      uiRuntime,
      logger,
    });

    gameLogic.state.movieRequests.push(
      {
        movieName: 'MissionIntro.bik',
        playbackType: 'FULLSCREEN',
        frame: 12,
      },
      {
        movieName: 'RadarAlert.bik',
        playbackType: 'RADAR',
        frame: 13,
      },
    );

    bridge.syncAfterSimulationStep(13);

    expect(uiRuntime.shownMessages).toEqual([
      {
        message: '[FULLSCREEN movie] MissionIntro.bik',
        durationMs: 4500,
      },
      {
        message: '[RADAR movie] RadarAlert.bik',
        durationMs: 4500,
      },
    ]);
    expect(logger.debugMessages).toEqual([
      '[ScriptMovie frame=12 type=FULLSCREEN] MissionIntro.bik',
      '[ScriptMovie frame=13 type=RADAR] RadarAlert.bik',
    ]);
  });

  it('updates flashing command button ids based on cameo flash counts', () => {
    const gameLogic = new RecordingGameLogic();
    const uiRuntime = new RecordingUiRuntime();
    const logger = new RecordingLogger();
    const bridge = createScriptUiEffectsRuntimeBridge({
      gameLogic,
      uiRuntime,
      logger,
    });

    gameLogic.state.cameoFlashRequests.push({
      commandButtonName: 'Command_AttackMove',
      flashCount: 4,
      frame: 1,
    });

    bridge.syncAfterSimulationStep(1);
    expect(uiRuntime.flashingButtons).toEqual(['Command_AttackMove']);

    bridge.syncAfterSimulationStep(14);
    expect(uiRuntime.flashingButtons).toEqual(['Command_AttackMove']);

    bridge.syncAfterSimulationStep(16);
    expect(uiRuntime.flashingButtons).toEqual([]);

    bridge.syncAfterSimulationStep(31);
    expect(uiRuntime.flashingButtons).toEqual(['Command_AttackMove']);

    bridge.syncAfterSimulationStep(46);
    expect(uiRuntime.flashingButtons).toEqual([]);
  });
});
