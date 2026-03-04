import { describe, expect, it } from 'vitest';

import type { CameraState } from '@generals/input';

import {
  createScriptCameraRuntimeBridge,
  type ScriptCameraRuntimeGameLogic,
} from './script-camera-runtime.js';
import {
  createScriptCameraEffectsRuntimeBridge,
  type ScriptCameraEffectsRuntimeGameLogic,
} from './script-camera-effects-runtime.js';
import {
  createScriptEmoticonRuntimeBridge,
  type ScriptEmoticonRuntimeGameLogic,
} from './script-emoticon-runtime.js';

class RecordingCameraController {
  private state: CameraState = {
    targetX: 0,
    targetZ: 0,
    angle: 0,
    zoom: 300,
    pitch: 1,
  };

  getState(): CameraState {
    return { ...this.state };
  }

  setState(state: CameraState): void {
    this.state = { ...state };
  }

  lookAt(worldX: number, worldZ: number): void {
    this.state = {
      ...this.state,
      targetX: worldX,
      targetZ: worldZ,
    };
  }
}

describe('script runtime bridge integration', () => {
  it('propagates camera/effects/emoticon script requests through runtime bridges in the same frame', () => {
    const cameraActionRequests = [{
      requestType: 'MOVE_TO' as const,
      waypointName: null,
      lookAtWaypointName: null,
      x: 150,
      z: 75,
      lookAtX: null,
      lookAtZ: null,
      durationMs: 1,
      cameraStutterMs: 0,
      easeInMs: 0,
      easeOutMs: 0,
      rotations: null,
      zoom: null,
      pitch: null,
      frame: 1,
    }];
    const cameraModifierRequests: Array<ReturnType<ScriptCameraRuntimeGameLogic['drainScriptCameraModifierRequests']>[number]> = [];
    const blackWhiteRequests = [{ enabled: true, fadeFrames: 0, frame: 1 }];
    const fadeRequests: Array<ReturnType<ScriptCameraEffectsRuntimeGameLogic['drainScriptCameraFadeRequests']>[number]> = [];
    const filterRequests: Array<ReturnType<ScriptCameraEffectsRuntimeGameLogic['drainScriptCameraFilterRequests']>[number]> = [];
    const shakerRequests: Array<ReturnType<ScriptCameraEffectsRuntimeGameLogic['drainScriptCameraShakerRequests']>[number]> = [];
    const emoticonRequests = [{ entityId: 7, emoticonName: 'EMOTICON_ALERT', durationFrames: 5, frame: 1 }];

    const gameLogic: ScriptCameraRuntimeGameLogic & ScriptCameraEffectsRuntimeGameLogic & ScriptEmoticonRuntimeGameLogic = {
      drainScriptCameraActionRequests: () => {
        const drained = cameraActionRequests.map((request) => ({ ...request }));
        cameraActionRequests.length = 0;
        return drained;
      },
      drainScriptCameraModifierRequests: () => {
        const drained = cameraModifierRequests.map((request) => ({ ...request }));
        cameraModifierRequests.length = 0;
        return drained;
      },
      drainScriptCameraBlackWhiteRequests: () => {
        const drained = blackWhiteRequests.map((request) => ({ ...request }));
        blackWhiteRequests.length = 0;
        return drained;
      },
      drainScriptCameraFadeRequests: () => {
        const drained = fadeRequests.map((request) => ({ ...request }));
        fadeRequests.length = 0;
        return drained;
      },
      drainScriptCameraFilterRequests: () => {
        const drained = filterRequests.map((request) => ({ ...request }));
        filterRequests.length = 0;
        return drained;
      },
      drainScriptCameraShakerRequests: () => {
        const drained = shakerRequests.map((request) => ({ ...request }));
        shakerRequests.length = 0;
        return drained;
      },
      drainScriptEmoticonRequests: () => {
        const drained = emoticonRequests.map((request) => ({ ...request }));
        emoticonRequests.length = 0;
        return drained;
      },
    };

    const cameraController = new RecordingCameraController();
    const cameraBridge = createScriptCameraRuntimeBridge({
      gameLogic,
      cameraController,
    });
    const cameraEffectsBridge = createScriptCameraEffectsRuntimeBridge({ gameLogic });
    const emoticonBridge = createScriptEmoticonRuntimeBridge({ gameLogic });

    cameraBridge.syncAfterSimulationStep(1);
    const cameraEffectsState = cameraEffectsBridge.syncAfterSimulationStep(1);
    emoticonBridge.syncAfterSimulationStep(1);

    expect(cameraController.getState().targetX).toBeCloseTo(150, 6);
    expect(cameraController.getState().targetZ).toBeCloseTo(75, 6);
    expect(cameraEffectsState.grayscale).toBe(1);
    expect(emoticonBridge.getActiveEmoticons(1)).toEqual([
      {
        entityId: 7,
        emoticonName: 'EMOTICON_ALERT',
        expireOnFrame: 5,
      },
    ]);
  });
});
