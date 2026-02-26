import { describe, expect, it } from 'vitest';

import type { CameraState } from '@generals/input';

import {
  createScriptCameraRuntimeBridge,
  type ScriptCameraRuntimeGameLogic,
  type ScriptCameraActionRequestState,
  type ScriptCameraModifierRequestState,
} from './script-camera-runtime.js';

interface MutableScriptCameraState {
  actionRequests: ScriptCameraActionRequestState[];
  modifierRequests: ScriptCameraModifierRequestState[];
}

class RecordingGameLogic implements ScriptCameraRuntimeGameLogic {
  readonly state: MutableScriptCameraState = {
    actionRequests: [],
    modifierRequests: [],
  };

  drainScriptCameraActionRequests(): ScriptCameraActionRequestState[] {
    const drained = this.state.actionRequests.map((request) => ({ ...request }));
    this.state.actionRequests.length = 0;
    return drained;
  }

  drainScriptCameraModifierRequests(): ScriptCameraModifierRequestState[] {
    const drained = this.state.modifierRequests.map((request) => ({ ...request }));
    this.state.modifierRequests.length = 0;
    return drained;
  }
}

class RecordingCameraController {
  private state: CameraState = {
    targetX: 0,
    targetZ: 0,
    angle: 0,
    zoom: 300,
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

function makeActionRequest(
  overrides: Partial<ScriptCameraActionRequestState>,
): ScriptCameraActionRequestState {
  return {
    requestType: 'MOVE_TO',
    waypointName: null,
    lookAtWaypointName: null,
    x: null,
    z: null,
    lookAtX: null,
    lookAtZ: null,
    durationMs: 0,
    cameraStutterMs: 0,
    easeInMs: 0,
    easeOutMs: 0,
    rotations: null,
    zoom: null,
    pitch: null,
    frame: 0,
    ...overrides,
  };
}

function makeModifierRequest(
  overrides: Partial<ScriptCameraModifierRequestState>,
): ScriptCameraModifierRequestState {
  return {
    requestType: 'FREEZE_TIME',
    waypointName: null,
    x: null,
    z: null,
    zoom: null,
    pitch: null,
    easeIn: null,
    easeOut: null,
    speedMultiplier: null,
    rollingAverageFrames: null,
    frame: 0,
    ...overrides,
  };
}

describe('script camera runtime bridge', () => {
  it('animates MOVE_TO requests and reports camera movement completion', () => {
    const gameLogic = new RecordingGameLogic();
    const cameraController = new RecordingCameraController();
    const bridge = createScriptCameraRuntimeBridge({ gameLogic, cameraController });

    gameLogic.state.actionRequests.push(makeActionRequest({
      requestType: 'MOVE_TO',
      x: 90,
      z: 30,
      durationMs: 1000,
    }));

    bridge.syncAfterSimulationStep(1);
    const earlyState = cameraController.getState();
    expect(earlyState.targetX).toBeGreaterThan(0);
    expect(earlyState.targetX).toBeLessThan(90);
    expect(bridge.isCameraMovementFinished()).toBe(false);

    bridge.syncAfterSimulationStep(29);
    expect(bridge.isCameraMovementFinished()).toBe(false);

    bridge.syncAfterSimulationStep(30);
    const finalState = cameraController.getState();
    expect(finalState.targetX).toBeCloseTo(90, 4);
    expect(finalState.targetZ).toBeCloseTo(30, 4);
    expect(bridge.isCameraMovementFinished()).toBe(true);
  });

  it('applies ROTATE requests over the scripted duration', () => {
    const gameLogic = new RecordingGameLogic();
    const cameraController = new RecordingCameraController();
    const bridge = createScriptCameraRuntimeBridge({ gameLogic, cameraController });

    gameLogic.state.actionRequests.push(makeActionRequest({
      requestType: 'ROTATE',
      rotations: 0.5,
      durationMs: 1000,
    }));

    bridge.syncAfterSimulationStep(1);
    expect(bridge.isCameraMovementFinished()).toBe(false);

    bridge.syncAfterSimulationStep(30);
    expect(cameraController.getState().angle).toBeCloseTo(Math.PI, 4);
    expect(bridge.isCameraMovementFinished()).toBe(true);
  });

  it('applies SETUP requests immediately with look-at orientation and zoom', () => {
    const gameLogic = new RecordingGameLogic();
    const cameraController = new RecordingCameraController();
    const bridge = createScriptCameraRuntimeBridge({ gameLogic, cameraController });

    gameLogic.state.actionRequests.push(makeActionRequest({
      requestType: 'SETUP',
      x: 50,
      z: 60,
      lookAtX: 50,
      lookAtZ: 90,
      zoom: 420,
      pitch: 35,
    }));

    bridge.syncAfterSimulationStep(1);
    const state = cameraController.getState();
    expect(state.targetX).toBe(50);
    expect(state.targetZ).toBe(60);
    expect(state.zoom).toBe(420);
    expect(state.angle).toBeCloseTo(0, 6);
    expect(bridge.isCameraMovementFinished()).toBe(true);
  });

  it('tracks PITCH duration as non-visual movement until the scripted timer elapses', () => {
    const gameLogic = new RecordingGameLogic();
    const cameraController = new RecordingCameraController();
    const bridge = createScriptCameraRuntimeBridge({ gameLogic, cameraController });

    const before = cameraController.getState();
    gameLogic.state.actionRequests.push(makeActionRequest({
      requestType: 'PITCH',
      pitch: 40,
      durationMs: 1000,
    }));

    bridge.syncAfterSimulationStep(1);
    expect(bridge.isCameraMovementFinished()).toBe(false);
    expect(cameraController.getState()).toEqual(before);

    bridge.syncAfterSimulationStep(30);
    expect(bridge.isCameraMovementFinished()).toBe(true);
  });

  it('freezes active scripted angle movement on FREEZE_ANGLE modifier', () => {
    const gameLogic = new RecordingGameLogic();
    const cameraController = new RecordingCameraController();
    const bridge = createScriptCameraRuntimeBridge({ gameLogic, cameraController });

    gameLogic.state.actionRequests.push(makeActionRequest({
      requestType: 'ROTATE',
      rotations: 1,
      durationMs: 1000,
    }));

    bridge.syncAfterSimulationStep(1);
    const angleBeforeFreeze = cameraController.getState().angle;
    expect(angleBeforeFreeze).toBeGreaterThan(0);

    gameLogic.state.modifierRequests.push(makeModifierRequest({
      requestType: 'FREEZE_ANGLE',
    }));
    bridge.syncAfterSimulationStep(2);
    const frozenAngle = cameraController.getState().angle;

    bridge.syncAfterSimulationStep(20);
    expect(cameraController.getState().angle).toBeCloseTo(frozenAngle, 6);
    expect(bridge.isCameraMovementFinished()).toBe(true);
  });
});
