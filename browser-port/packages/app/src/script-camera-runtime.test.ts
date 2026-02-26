import { describe, expect, it } from 'vitest';

import type { CameraState } from '@generals/input';

import {
  createScriptCameraRuntimeBridge,
  type ScriptCameraRuntimeGameLogic,
  type ScriptCameraActionRequestState,
  type ScriptCameraDefaultViewState,
  type ScriptCameraFollowState,
  type ScriptCameraLookTowardObjectState,
  type ScriptCameraLookTowardWaypointState,
  type ScriptCameraModifierRequestState,
  type ScriptCameraSlaveModeState,
  type ScriptCameraTetherState,
} from './script-camera-runtime.js';

interface MutableScriptCameraState {
  actionRequests: ScriptCameraActionRequestState[];
  modifierRequests: ScriptCameraModifierRequestState[];
  tetherState: ScriptCameraTetherState | null;
  followState: ScriptCameraFollowState | null;
  slaveModeState: ScriptCameraSlaveModeState | null;
  defaultViewState: ScriptCameraDefaultViewState | null;
  lookTowardObjectState: ScriptCameraLookTowardObjectState | null;
  lookTowardWaypointState: ScriptCameraLookTowardWaypointState | null;
  entityPositions: Map<number, readonly [number, number, number]>;
  renderableEntities: Array<{
    id: number;
    templateName: string;
    x: number;
    y: number;
    z: number;
  }>;
}

class RecordingGameLogic implements ScriptCameraRuntimeGameLogic {
  readonly state: MutableScriptCameraState = {
    actionRequests: [],
    modifierRequests: [],
    tetherState: null,
    followState: null,
    slaveModeState: null,
    defaultViewState: null,
    lookTowardObjectState: null,
    lookTowardWaypointState: null,
    entityPositions: new Map<number, readonly [number, number, number]>(),
    renderableEntities: [],
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

  getScriptCameraTetherState(): ScriptCameraTetherState | null {
    return this.state.tetherState ? { ...this.state.tetherState } : null;
  }

  getScriptCameraFollowState(): ScriptCameraFollowState | null {
    return this.state.followState ? { ...this.state.followState } : null;
  }

  getScriptCameraSlaveModeState(): ScriptCameraSlaveModeState | null {
    return this.state.slaveModeState ? { ...this.state.slaveModeState } : null;
  }

  getScriptCameraDefaultViewState(): ScriptCameraDefaultViewState | null {
    return this.state.defaultViewState ? { ...this.state.defaultViewState } : null;
  }

  getScriptCameraLookTowardObjectState(): ScriptCameraLookTowardObjectState | null {
    return this.state.lookTowardObjectState ? { ...this.state.lookTowardObjectState } : null;
  }

  getScriptCameraLookTowardWaypointState(): ScriptCameraLookTowardWaypointState | null {
    return this.state.lookTowardWaypointState ? { ...this.state.lookTowardWaypointState } : null;
  }

  getEntityWorldPosition(entityId: number): readonly [number, number, number] | null {
    return this.state.entityPositions.get(entityId) ?? null;
  }

  getRenderableEntityStates(): MutableScriptCameraState['renderableEntities'] {
    return this.state.renderableEntities.map((entity) => ({ ...entity }));
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

  panTo(worldX: number, worldZ: number): void {
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

  it('applies RESET defaults from script camera default view state', () => {
    const gameLogic = new RecordingGameLogic();
    const cameraController = new RecordingCameraController();
    const bridge = createScriptCameraRuntimeBridge({ gameLogic, cameraController });

    gameLogic.state.defaultViewState = {
      pitch: 35,
      angle: 90,
      maxHeight: 480,
    };
    gameLogic.state.actionRequests.push(makeActionRequest({
      requestType: 'RESET',
      x: 64,
      z: 96,
      durationMs: 1000,
    }));

    bridge.syncAfterSimulationStep(1);
    bridge.syncAfterSimulationStep(30);

    const state = cameraController.getState();
    expect(state.targetX).toBeCloseTo(64, 4);
    expect(state.targetZ).toBeCloseTo(96, 4);
    expect(state.angle).toBeCloseTo(Math.PI / 2, 4);
    expect(state.zoom).toBeCloseTo(480, 4);
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

  it('reports camera time frozen while FREEZE_TIME is active and movement is in progress', () => {
    const gameLogic = new RecordingGameLogic();
    const cameraController = new RecordingCameraController();
    const bridge = createScriptCameraRuntimeBridge({ gameLogic, cameraController });

    gameLogic.state.modifierRequests.push(makeModifierRequest({
      requestType: 'FREEZE_TIME',
    }));
    bridge.syncAfterSimulationStep(1);
    expect(bridge.isCameraTimeFrozen()).toBe(false);

    gameLogic.state.actionRequests.push(makeActionRequest({
      requestType: 'MOVE_TO',
      x: 120,
      z: 20,
      durationMs: 1000,
    }));
    gameLogic.state.modifierRequests.push(makeModifierRequest({
      requestType: 'FREEZE_TIME',
    }));

    bridge.syncAfterSimulationStep(2);
    expect(bridge.isCameraMovementFinished()).toBe(false);
    expect(bridge.isCameraTimeFrozen()).toBe(true);

    bridge.syncAfterSimulationStep(31);
    expect(bridge.isCameraMovementFinished()).toBe(true);
    expect(bridge.isCameraTimeFrozen()).toBe(false);
  });

  it('applies persistent FOLLOW camera lock states each frame', () => {
    const gameLogic = new RecordingGameLogic();
    const cameraController = new RecordingCameraController();
    const bridge = createScriptCameraRuntimeBridge({ gameLogic, cameraController });

    gameLogic.state.followState = {
      entityId: 7,
      snapToUnit: false,
    };
    gameLogic.state.entityPositions.set(7, [100, 0, 200]);

    bridge.syncAfterSimulationStep(1);
    expect(cameraController.getState().targetX).toBe(100);
    expect(cameraController.getState().targetZ).toBe(200);

    gameLogic.state.entityPositions.set(7, [120, 0, 240]);
    bridge.syncAfterSimulationStep(2);
    expect(cameraController.getState().targetX).toBe(120);
    expect(cameraController.getState().targetZ).toBe(240);
  });

  it('triggers waypoint look-toward rotation once per new state signature', () => {
    const gameLogic = new RecordingGameLogic();
    const cameraController = new RecordingCameraController();
    const bridge = createScriptCameraRuntimeBridge({ gameLogic, cameraController });

    gameLogic.state.lookTowardWaypointState = {
      waypointName: 'LookAtA',
      x: 0,
      z: 100,
      durationMs: 1000,
      easeInMs: 0,
      easeOutMs: 0,
      reverseRotation: false,
    };

    bridge.syncAfterSimulationStep(1);
    expect(bridge.isCameraMovementFinished()).toBe(false);

    bridge.syncAfterSimulationStep(30);
    const firstAngle = cameraController.getState().angle;
    expect(firstAngle).toBeCloseTo(0, 5);
    expect(bridge.isCameraMovementFinished()).toBe(true);

    bridge.syncAfterSimulationStep(31);
    expect(cameraController.getState().angle).toBeCloseTo(firstAngle, 5);
    expect(bridge.isCameraMovementFinished()).toBe(true);
  });

  it('follows slave-mode template targets when no explicit follow/tether lock is active', () => {
    const gameLogic = new RecordingGameLogic();
    const cameraController = new RecordingCameraController();
    const bridge = createScriptCameraRuntimeBridge({ gameLogic, cameraController });

    gameLogic.state.slaveModeState = {
      thingTemplateName: 'CameraDrone',
      boneName: 'BONE01',
    };
    gameLogic.state.renderableEntities = [
      { id: 4, templateName: 'Ranger', x: 10, y: 0, z: 20 },
      { id: 9, templateName: 'CameraDrone', x: 120, y: 0, z: 240 },
    ];

    bridge.syncAfterSimulationStep(1);
    expect(cameraController.getState().targetX).toBe(120);
    expect(cameraController.getState().targetZ).toBe(240);

    gameLogic.state.renderableEntities = [
      { id: 9, templateName: 'CameraDrone', x: 150, y: 0, z: 260 },
    ];
    bridge.syncAfterSimulationStep(2);
    expect(cameraController.getState().targetX).toBe(150);
    expect(cameraController.getState().targetZ).toBe(260);
  });
});
