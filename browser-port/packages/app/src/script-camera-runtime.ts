import type { CameraState } from '@generals/input';

const TWO_PI = Math.PI * 2;
const MIN_DIRECTION_LENGTH = 0.1;

export interface ScriptCameraActionRequestState {
  requestType: 'MOVE_TO' | 'MOVE_ALONG_WAYPOINT_PATH' | 'RESET' | 'ROTATE' | 'SETUP' | 'ZOOM' | 'PITCH';
  waypointName: string | null;
  lookAtWaypointName: string | null;
  x: number | null;
  z: number | null;
  lookAtX: number | null;
  lookAtZ: number | null;
  durationMs: number;
  cameraStutterMs: number;
  easeInMs: number;
  easeOutMs: number;
  rotations: number | null;
  zoom: number | null;
  pitch: number | null;
  frame: number;
}

export interface ScriptCameraModifierRequestState {
  requestType:
    | 'FREEZE_TIME'
    | 'FREEZE_ANGLE'
    | 'FINAL_ZOOM'
    | 'FINAL_PITCH'
    | 'FINAL_SPEED_MULTIPLIER'
    | 'ROLLING_AVERAGE'
    | 'FINAL_LOOK_TOWARD'
    | 'LOOK_TOWARD'
    | 'MOVE_TO_SELECTION';
  waypointName: string | null;
  x: number | null;
  z: number | null;
  zoom: number | null;
  pitch: number | null;
  easeIn: number | null;
  easeOut: number | null;
  speedMultiplier: number | null;
  rollingAverageFrames: number | null;
  frame: number;
}

export interface ScriptCameraTetherState {
  entityId: number;
  immediate: boolean;
  play: number;
}

export interface ScriptCameraFollowState {
  entityId: number;
  snapToUnit: boolean;
}

export interface ScriptCameraLookTowardObjectState {
  entityId: number;
  durationMs: number;
  holdMs: number;
  easeInMs: number;
  easeOutMs: number;
}

export interface ScriptCameraLookTowardWaypointState {
  waypointName: string;
  x: number;
  z: number;
  durationMs: number;
  easeInMs: number;
  easeOutMs: number;
  reverseRotation: boolean;
}

export interface ScriptCameraSlaveModeState {
  thingTemplateName: string;
  boneName: string;
}

export interface ScriptCameraRuntimeGameLogic {
  drainScriptCameraActionRequests(): ScriptCameraActionRequestState[];
  drainScriptCameraModifierRequests(): ScriptCameraModifierRequestState[];
  getScriptCameraTetherState?(): ScriptCameraTetherState | null;
  getScriptCameraFollowState?(): ScriptCameraFollowState | null;
  getScriptCameraSlaveModeState?(): ScriptCameraSlaveModeState | null;
  getScriptCameraLookTowardObjectState?(): ScriptCameraLookTowardObjectState | null;
  getScriptCameraLookTowardWaypointState?(): ScriptCameraLookTowardWaypointState | null;
  getEntityWorldPosition?(entityId: number): readonly [number, number, number] | null;
  getRenderableEntityStates?(): readonly Array<{
    id: number;
    templateName: string;
    x: number;
    y: number;
    z: number;
  }>;
}

export interface ScriptCameraRuntimeController {
  getState(): CameraState;
  setState(state: CameraState): void;
  lookAt(worldX: number, worldZ: number): void;
  panTo?(worldX: number, worldZ: number): void;
}

export interface ScriptCameraRuntimeBridge {
  syncAfterSimulationStep(currentLogicFrame: number): void;
  isCameraMovementFinished(): boolean;
}

export interface CreateScriptCameraRuntimeBridgeOptions {
  gameLogic: ScriptCameraRuntimeGameLogic;
  cameraController: ScriptCameraRuntimeController;
}

interface ScalarTransition {
  startFrame: number;
  durationFrames: number;
  from: number;
  to: number;
}

interface TargetTransition {
  startFrame: number;
  durationFrames: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) {
    normalized -= TWO_PI;
  }
  while (normalized <= -Math.PI) {
    normalized += TWO_PI;
  }
  return normalized;
}

function toDurationFrames(durationMs: number): number {
  const normalizedMs = Number.isFinite(durationMs) ? Math.trunc(durationMs) : 0;
  if (normalizedMs < 1) {
    return 1;
  }
  return Math.max(1, Math.trunc((normalizedMs * 30) / 1000));
}

function getTransitionProgress(currentLogicFrame: number, startFrame: number, durationFrames: number): number {
  const elapsedFrames = currentLogicFrame - startFrame + 1;
  if (elapsedFrames <= 0) {
    return 0;
  }
  if (elapsedFrames >= durationFrames) {
    return 1;
  }
  return elapsedFrames / durationFrames;
}

function evaluateScalarTransition(transition: ScalarTransition, currentLogicFrame: number): number {
  const progress = getTransitionProgress(
    currentLogicFrame,
    transition.startFrame,
    transition.durationFrames,
  );
  return transition.from + (transition.to - transition.from) * progress;
}

function evaluateTargetTransition(
  transition: TargetTransition,
  currentLogicFrame: number,
): { x: number; z: number } {
  const progress = getTransitionProgress(
    currentLogicFrame,
    transition.startFrame,
    transition.durationFrames,
  );
  return {
    x: transition.fromX + (transition.toX - transition.fromX) * progress,
    z: transition.fromZ + (transition.toZ - transition.fromZ) * progress,
  };
}

function isTransitionComplete(
  transition: ScalarTransition | TargetTransition,
  currentLogicFrame: number,
): boolean {
  return getTransitionProgress(
    currentLogicFrame,
    transition.startFrame,
    transition.durationFrames,
  ) >= 1;
}

function getRemainingFrames(
  transition: ScalarTransition | TargetTransition | null,
  currentLogicFrame: number,
): number {
  if (!transition) {
    return 0;
  }
  const elapsedFrames = currentLogicFrame - transition.startFrame + 1;
  return Math.max(0, transition.durationFrames - elapsedFrames);
}

function resolveLookTowardAngle(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  reverseRotation = false,
  currentAngle = 0,
): number | null {
  const dirX = toX - fromX;
  const dirZ = toZ - fromZ;
  const dirLength = Math.hypot(dirX, dirZ);
  if (dirLength < MIN_DIRECTION_LENGTH) {
    return null;
  }

  const clampedX = Math.max(-1, Math.min(1, dirX / dirLength));
  let angle = Math.acos(clampedX);
  if (dirZ < 0) {
    angle = -angle;
  }
  angle -= Math.PI / 2;
  const normalizedAngle = normalizeAngle(angle);
  if (!reverseRotation) {
    return normalizedAngle;
  }

  if (currentAngle < normalizedAngle) {
    return normalizedAngle - TWO_PI;
  }
  return normalizedAngle + TWO_PI;
}

export function createScriptCameraRuntimeBridge(
  options: CreateScriptCameraRuntimeBridgeOptions,
): ScriptCameraRuntimeBridge {
  const { gameLogic, cameraController } = options;

  const defaultCameraState = cameraController.getState();

  let targetTransition: TargetTransition | null = null;
  let angleTransition: ScalarTransition | null = null;
  let zoomTransition: ScalarTransition | null = null;
  let nonVisualMovementEndFrame = -1;
  let movementFinished = true;
  let lastCameraLockSignature: string | null = null;
  let lastLookTowardObjectSignature: string | null = null;
  let lastLookTowardWaypointSignature: string | null = null;

  const beginTargetTransition = (
    currentLogicFrame: number,
    toX: number,
    toZ: number,
    durationFrames: number,
  ): void => {
    const state = cameraController.getState();
    targetTransition = {
      startFrame: currentLogicFrame,
      durationFrames,
      fromX: state.targetX,
      fromZ: state.targetZ,
      toX,
      toZ,
    };
  };

  const beginAngleTransition = (
    currentLogicFrame: number,
    toAngle: number,
    durationFrames: number,
  ): void => {
    const state = cameraController.getState();
    angleTransition = {
      startFrame: currentLogicFrame,
      durationFrames,
      from: state.angle,
      to: toAngle,
    };
  };

  const beginZoomTransition = (
    currentLogicFrame: number,
    toZoom: number,
    durationFrames: number,
  ): void => {
    const state = cameraController.getState();
    zoomTransition = {
      startFrame: currentLogicFrame,
      durationFrames,
      from: state.zoom,
      to: toZoom,
    };
  };

  const holdMovementForFrames = (currentLogicFrame: number, durationFrames: number): void => {
    if (durationFrames < 1) {
      return;
    }
    nonVisualMovementEndFrame = Math.max(nonVisualMovementEndFrame, currentLogicFrame + durationFrames - 1);
  };

  const applyActiveTransitions = (currentLogicFrame: number): void => {
    if (!targetTransition && !angleTransition && !zoomTransition) {
      return;
    }

    const currentState = cameraController.getState();
    let nextTargetX = currentState.targetX;
    let nextTargetZ = currentState.targetZ;
    let nextAngle = currentState.angle;
    let nextZoom = currentState.zoom;
    let stateChanged = false;

    if (targetTransition) {
      const interpolated = evaluateTargetTransition(targetTransition, currentLogicFrame);
      nextTargetX = interpolated.x;
      nextTargetZ = interpolated.z;
      stateChanged = true;
      if (isTransitionComplete(targetTransition, currentLogicFrame)) {
        targetTransition = null;
      }
    }

    if (angleTransition) {
      nextAngle = evaluateScalarTransition(angleTransition, currentLogicFrame);
      stateChanged = true;
      if (isTransitionComplete(angleTransition, currentLogicFrame)) {
        angleTransition = null;
      }
    }

    if (zoomTransition) {
      nextZoom = evaluateScalarTransition(zoomTransition, currentLogicFrame);
      stateChanged = true;
      if (isTransitionComplete(zoomTransition, currentLogicFrame)) {
        zoomTransition = null;
      }
    }

    if (stateChanged) {
      cameraController.setState({
        targetX: nextTargetX,
        targetZ: nextTargetZ,
        angle: nextAngle,
        zoom: nextZoom,
      });
    }
  };

  const getMaxVisualMovementRemainingFrames = (currentLogicFrame: number): number => {
    return Math.max(
      getRemainingFrames(targetTransition, currentLogicFrame),
      getRemainingFrames(angleTransition, currentLogicFrame),
      getRemainingFrames(zoomTransition, currentLogicFrame),
    );
  };

  const processActionRequests = (currentLogicFrame: number): void => {
    const requests = gameLogic.drainScriptCameraActionRequests();
    for (const request of requests) {
      switch (request.requestType) {
        case 'MOVE_TO':
        case 'MOVE_ALONG_WAYPOINT_PATH': {
          if (request.x === null || request.z === null) {
            break;
          }
          beginTargetTransition(
            currentLogicFrame,
            request.x,
            request.z,
            toDurationFrames(request.durationMs),
          );
          break;
        }

        case 'RESET': {
          if (request.x === null || request.z === null) {
            break;
          }
          const durationFrames = toDurationFrames(request.durationMs);
          beginTargetTransition(currentLogicFrame, request.x, request.z, durationFrames);
          beginAngleTransition(currentLogicFrame, 0, durationFrames);
          beginZoomTransition(currentLogicFrame, defaultCameraState.zoom, durationFrames);
          break;
        }

        case 'ROTATE': {
          if (request.rotations === null || !Number.isFinite(request.rotations)) {
            break;
          }
          const state = cameraController.getState();
          beginAngleTransition(
            currentLogicFrame,
            state.angle + TWO_PI * request.rotations,
            toDurationFrames(request.durationMs),
          );
          break;
        }

        case 'SETUP': {
          if (request.x === null || request.z === null) {
            break;
          }
          cameraController.lookAt(request.x, request.z);
          const state = cameraController.getState();
          const nextState: CameraState = { ...state };

          if (request.lookAtX !== null && request.lookAtZ !== null) {
            const lookTowardAngle = resolveLookTowardAngle(
              request.x,
              request.z,
              request.lookAtX,
              request.lookAtZ,
            );
            if (lookTowardAngle !== null) {
              nextState.angle = lookTowardAngle;
            }
          }
          if (request.zoom !== null && Number.isFinite(request.zoom)) {
            nextState.zoom = request.zoom;
          }
          cameraController.setState(nextState);
          targetTransition = null;
          angleTransition = null;
          zoomTransition = null;
          break;
        }

        case 'ZOOM': {
          if (request.zoom === null || !Number.isFinite(request.zoom)) {
            break;
          }
          beginZoomTransition(
            currentLogicFrame,
            request.zoom,
            toDurationFrames(request.durationMs),
          );
          break;
        }

        case 'PITCH': {
          // Source-parity TODO: RTSCamera currently has a fixed pitch-angle config.
          holdMovementForFrames(currentLogicFrame, toDurationFrames(request.durationMs));
          break;
        }
      }
    }
  };

  const processModifierRequests = (currentLogicFrame: number): void => {
    const requests = gameLogic.drainScriptCameraModifierRequests();
    for (const request of requests) {
      switch (request.requestType) {
        case 'FREEZE_ANGLE': {
          if (!angleTransition) {
            break;
          }
          const state = cameraController.getState();
          const frozenAngle = evaluateScalarTransition(angleTransition, currentLogicFrame);
          cameraController.setState({ ...state, angle: frozenAngle });
          angleTransition = null;
          break;
        }

        case 'FINAL_ZOOM': {
          if (request.zoom === null || !Number.isFinite(request.zoom)) {
            break;
          }
          const remainingFrames = getMaxVisualMovementRemainingFrames(currentLogicFrame);
          if (remainingFrames < 1) {
            break;
          }
          beginZoomTransition(currentLogicFrame, request.zoom, remainingFrames);
          break;
        }

        case 'MOVE_TO_SELECTION': {
          if (!targetTransition || request.x === null || request.z === null) {
            break;
          }
          targetTransition = {
            ...targetTransition,
            toX: request.x,
            toZ: request.z,
          };
          break;
        }

        case 'FINAL_LOOK_TOWARD':
        case 'LOOK_TOWARD': {
          if (!targetTransition || request.x === null || request.z === null) {
            break;
          }
          const lookTowardAngle = resolveLookTowardAngle(
            targetTransition.toX,
            targetTransition.toZ,
            request.x,
            request.z,
          );
          if (lookTowardAngle === null) {
            break;
          }
          const remainingFrames = getRemainingFrames(targetTransition, currentLogicFrame);
          if (remainingFrames < 1) {
            break;
          }
          beginAngleTransition(currentLogicFrame, lookTowardAngle, remainingFrames);
          break;
        }

        case 'FINAL_PITCH': {
          // Source-parity TODO: RTSCamera currently has a fixed pitch-angle config.
          const remainingFrames = getMaxVisualMovementRemainingFrames(currentLogicFrame);
          holdMovementForFrames(currentLogicFrame, remainingFrames);
          break;
        }

        case 'FREEZE_TIME':
        case 'FINAL_SPEED_MULTIPLIER':
        case 'ROLLING_AVERAGE':
          // Source-parity TODO: these camera movement-timing modifiers are not yet wired.
          break;
      }
    }
  };

  const processLookTowardStates = (currentLogicFrame: number): void => {
    const lookTowardObjectState = gameLogic.getScriptCameraLookTowardObjectState?.() ?? null;
    if (!lookTowardObjectState) {
      lastLookTowardObjectSignature = null;
    } else {
      const signature = [
        lookTowardObjectState.entityId,
        lookTowardObjectState.durationMs,
        lookTowardObjectState.holdMs,
        lookTowardObjectState.easeInMs,
        lookTowardObjectState.easeOutMs,
      ].join(':');
      if (signature !== lastLookTowardObjectSignature) {
        const worldPosition = gameLogic.getEntityWorldPosition?.(lookTowardObjectState.entityId) ?? null;
        if (worldPosition) {
          const state = cameraController.getState();
          const lookTowardAngle = resolveLookTowardAngle(
            state.targetX,
            state.targetZ,
            worldPosition[0],
            worldPosition[2],
            false,
            state.angle,
          );
          if (lookTowardAngle !== null) {
            const durationFrames = toDurationFrames(lookTowardObjectState.durationMs);
            beginAngleTransition(currentLogicFrame, lookTowardAngle, durationFrames);
            const holdFrames = toDurationFrames(lookTowardObjectState.holdMs);
            nonVisualMovementEndFrame = Math.max(
              nonVisualMovementEndFrame,
              currentLogicFrame + durationFrames + holdFrames - 1,
            );
          }
        }
        lastLookTowardObjectSignature = signature;
      }
    }

    const lookTowardWaypointState = gameLogic.getScriptCameraLookTowardWaypointState?.() ?? null;
    if (!lookTowardWaypointState) {
      lastLookTowardWaypointSignature = null;
      return;
    }

    const signature = [
      lookTowardWaypointState.waypointName,
      lookTowardWaypointState.x,
      lookTowardWaypointState.z,
      lookTowardWaypointState.durationMs,
      lookTowardWaypointState.easeInMs,
      lookTowardWaypointState.easeOutMs,
      lookTowardWaypointState.reverseRotation ? 1 : 0,
    ].join(':');
    if (signature === lastLookTowardWaypointSignature) {
      return;
    }

    const state = cameraController.getState();
    const lookTowardAngle = resolveLookTowardAngle(
      state.targetX,
      state.targetZ,
      lookTowardWaypointState.x,
      lookTowardWaypointState.z,
      lookTowardWaypointState.reverseRotation,
      state.angle,
    );
    if (lookTowardAngle !== null) {
      beginAngleTransition(
        currentLogicFrame,
        lookTowardAngle,
        toDurationFrames(lookTowardWaypointState.durationMs),
      );
    }
    lastLookTowardWaypointSignature = signature;
  };

  const processCameraLockStates = (): void => {
    const tetherState = gameLogic.getScriptCameraTetherState?.() ?? null;
    const followState = tetherState
      ? null
      : (gameLogic.getScriptCameraFollowState?.() ?? null);
    const slaveState = (!tetherState && !followState)
      ? (gameLogic.getScriptCameraSlaveModeState?.() ?? null)
      : null;

    if (!tetherState && !followState && !slaveState) {
      lastCameraLockSignature = null;
      return;
    }

    let lockSignature = '';
    let worldX = 0;
    let worldZ = 0;
    let shouldSnapOnAcquire = false;

    if (tetherState || followState) {
      const entityId = tetherState?.entityId ?? followState?.entityId ?? null;
      if (entityId === null) {
        return;
      }

      const worldPosition = gameLogic.getEntityWorldPosition?.(entityId) ?? null;
      if (!worldPosition) {
        return;
      }
      worldX = worldPosition[0];
      worldZ = worldPosition[2];

      lockSignature = tetherState
        ? `TETHER:${entityId}:${tetherState.immediate ? 1 : 0}:${tetherState.play}`
        : `FOLLOW:${entityId}:${followState?.snapToUnit ? 1 : 0}`;
      shouldSnapOnAcquire = tetherState?.immediate ?? followState?.snapToUnit ?? false;
    } else if (slaveState) {
      const normalizedTemplateName = slaveState.thingTemplateName.trim().toUpperCase();
      if (!normalizedTemplateName) {
        return;
      }
      const candidates = gameLogic.getRenderableEntityStates?.() ?? [];
      const matchedEntity = [...candidates]
        .sort((left, right) => left.id - right.id)
        .find((candidate) => candidate.templateName.trim().toUpperCase() === normalizedTemplateName);
      if (!matchedEntity) {
        return;
      }

      worldX = matchedEntity.x;
      worldZ = matchedEntity.z;
      lockSignature = `SLAVE:${normalizedTemplateName}:${slaveState.boneName.trim().toUpperCase()}`;
      shouldSnapOnAcquire = true;
    } else {
      return;
    }

    const shouldSnapNow = lastCameraLockSignature !== lockSignature
      && shouldSnapOnAcquire;

    if (shouldSnapNow) {
      cameraController.lookAt(worldX, worldZ);
    } else if (cameraController.panTo) {
      cameraController.panTo(worldX, worldZ);
    } else {
      cameraController.lookAt(worldX, worldZ);
    }

    // Source parity: object camera-lock mode cancels scripted camera-move tracks.
    targetTransition = null;
    angleTransition = null;
    zoomTransition = null;
    lastCameraLockSignature = lockSignature;
  };

  const updateMovementFinished = (currentLogicFrame: number): void => {
    movementFinished = (
      !targetTransition
      && !angleTransition
      && !zoomTransition
      && currentLogicFrame >= nonVisualMovementEndFrame
    );
  };

  return {
    syncAfterSimulationStep(currentLogicFrame: number): void {
      applyActiveTransitions(currentLogicFrame);
      processActionRequests(currentLogicFrame);
      processModifierRequests(currentLogicFrame);
      processLookTowardStates(currentLogicFrame);
      processCameraLockStates();
      applyActiveTransitions(currentLogicFrame);
      updateMovementFinished(currentLogicFrame);
    },

    isCameraMovementFinished(): boolean {
      return movementFinished;
    },
  };
}
