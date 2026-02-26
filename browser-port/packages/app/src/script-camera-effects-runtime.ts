interface ScriptCameraBlackWhiteRequestState {
  enabled: boolean;
  fadeFrames: number;
  frame: number;
}

interface ScriptCameraFadeRequestState {
  fadeType: 'ADD' | 'SUBTRACT' | 'SATURATE' | 'MULTIPLY';
  minFade: number;
  maxFade: number;
  increaseFrames: number;
  holdFrames: number;
  decreaseFrames: number;
  frame: number;
}

interface ScriptCameraFilterRequestState {
  requestType: 'MOTION_BLUR' | 'MOTION_BLUR_JUMP' | 'MOTION_BLUR_FOLLOW' | 'MOTION_BLUR_END_FOLLOW';
  zoomIn: boolean | null;
  saturate: boolean | null;
  waypointName: string | null;
  x: number | null;
  z: number | null;
  followMode: number | null;
  frame: number;
}

interface ScriptCameraShakerRequestState {
  waypointName: string;
  x: number;
  z: number;
  amplitude: number;
  durationSeconds: number;
  radius: number;
  frame: number;
}

interface ScriptScreenShakeState {
  intensity: number;
  frame: number;
}

interface ScriptCameraEffectsState {
  grayscale: number;
  saturation: number;
  blurPixels: number;
  fadeType: ScriptCameraFadeRequestState['fadeType'] | null;
  fadeAmount: number;
  shakeOffsetX: number;
  shakeOffsetY: number;
}

export interface ScriptCameraEffectsRuntimeGameLogic {
  drainScriptCameraBlackWhiteRequests(): ScriptCameraBlackWhiteRequestState[];
  drainScriptCameraFadeRequests(): ScriptCameraFadeRequestState[];
  drainScriptCameraFilterRequests(): ScriptCameraFilterRequestState[];
  drainScriptCameraShakerRequests(): ScriptCameraShakerRequestState[];
  getScriptScreenShakeState?(): ScriptScreenShakeState | null;
}

export interface ScriptCameraEffectsRuntimeBridge {
  syncAfterSimulationStep(currentLogicFrame: number): ScriptCameraEffectsState;
}

export interface CreateScriptCameraEffectsRuntimeBridgeOptions {
  gameLogic: ScriptCameraEffectsRuntimeGameLogic;
  getCameraTargetPosition?: () => { x: number; z: number } | null;
  onMotionBlurJumpToPosition?: (x: number, z: number) => void;
}

interface ScalarTransition {
  startFrame: number;
  durationFrames: number;
  from: number;
  to: number;
}

interface ActiveFadeState {
  fadeType: ScriptCameraFadeRequestState['fadeType'];
  minFade: number;
  maxFade: number;
  increaseFrames: number;
  holdFrames: number;
  decreaseFrames: number;
  startFrame: number;
}

interface ActiveShakeState {
  startFrame: number;
  durationFrames: number;
  amplitude: number;
  seed: number;
  x: number;
  z: number;
  radius: number;
}

interface ActiveMotionBlurFollowState {
  panFactor: number;
  maxCount: number;
  ending: boolean;
}

const LOGIC_FRAME_RATE = 30;
const MOTION_BLUR_DURATION_FRAMES = Math.max(1, Math.trunc(LOGIC_FRAME_RATE / 2));
const SCREEN_SHAKE_DURATION_FRAMES = Math.max(1, Math.trunc(LOGIC_FRAME_RATE * 0.4));
const MOTION_BLUR_MAX_COUNT = 60;
const MOTION_BLUR_COUNT_STEP = 5;
const MOTION_BLUR_DEFAULT_PAN_FACTOR = 30;
const MOTION_BLUR_END_MIN_COUNT = 2;
const MOTION_BLUR_JUMP_TRIGGER_FRAMES = Math.max(1, Math.trunc(MOTION_BLUR_MAX_COUNT / MOTION_BLUR_COUNT_STEP));
const MOTION_BLUR_JUMP_DURATION_FRAMES = MOTION_BLUR_JUMP_TRIGGER_FRAMES * 2;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function evaluateScalarTransition(
  transition: ScalarTransition | null,
  currentLogicFrame: number,
): number {
  if (!transition) {
    return 0;
  }
  if (transition.durationFrames <= 0 || currentLogicFrame >= transition.startFrame + transition.durationFrames) {
    return transition.to;
  }
  if (currentLogicFrame <= transition.startFrame) {
    return transition.from;
  }
  const elapsedFrames = currentLogicFrame - transition.startFrame;
  const progress = elapsedFrames / transition.durationFrames;
  return transition.from + (transition.to - transition.from) * progress;
}

function evaluateFadeAmount(
  fade: ActiveFadeState | null,
  currentLogicFrame: number,
): number {
  if (!fade) {
    return 0;
  }

  const minFade = clamp01(fade.minFade);
  const maxFade = clamp01(fade.maxFade);
  const increaseFrames = Math.max(0, Math.trunc(fade.increaseFrames));
  const holdFrames = Math.max(0, Math.trunc(fade.holdFrames));
  const decreaseFrames = Math.max(0, Math.trunc(fade.decreaseFrames));

  const elapsed = currentLogicFrame - fade.startFrame;
  if (elapsed < 0) {
    return minFade;
  }

  if (increaseFrames > 0 && elapsed < increaseFrames) {
    const t = elapsed / increaseFrames;
    return minFade + (maxFade - minFade) * t;
  }

  const holdStart = increaseFrames;
  const holdEnd = holdStart + holdFrames;
  if (elapsed < holdEnd) {
    return maxFade;
  }

  const decreaseStart = holdEnd;
  const decreaseEnd = decreaseStart + decreaseFrames;
  if (decreaseFrames > 0 && elapsed < decreaseEnd) {
    const t = (elapsed - decreaseStart) / decreaseFrames;
    return maxFade + (minFade - maxFade) * t;
  }

  return minFade;
}

export function createScriptCameraEffectsRuntimeBridge(
  options: CreateScriptCameraEffectsRuntimeBridgeOptions,
): ScriptCameraEffectsRuntimeBridge {
  const { gameLogic, getCameraTargetPosition, onMotionBlurJumpToPosition } = options;

  let grayscale = 0;
  let grayscaleTransition: ScalarTransition | null = null;
  let activeFade: ActiveFadeState | null = null;
  let blurSaturationBoost = 0;
  let blurExpireFrame = -1;
  let activeMotionBlurFollow: ActiveMotionBlurFollowState | null = null;
  let previousCameraTarget: { x: number; z: number } | null = null;
  let pendingMotionBlurJump: { x: number; z: number; triggerFrame: number } | null = null;
  let lastScreenShakeFrame = -1;
  const activeShakes: ActiveShakeState[] = [];

  return {
    syncAfterSimulationStep(currentLogicFrame: number): ScriptCameraEffectsState {
      const blackWhiteRequests = gameLogic.drainScriptCameraBlackWhiteRequests();
      for (const request of blackWhiteRequests) {
        const targetGrayscale = request.enabled ? 1 : 0;
        const durationFrames = Math.max(0, Math.trunc(request.fadeFrames));
        if (durationFrames <= 0) {
          grayscale = targetGrayscale;
          grayscaleTransition = null;
        } else {
          grayscaleTransition = {
            startFrame: currentLogicFrame,
            durationFrames,
            from: grayscale,
            to: targetGrayscale,
          };
        }
      }

      if (grayscaleTransition) {
        grayscale = clamp01(evaluateScalarTransition(grayscaleTransition, currentLogicFrame));
        if (currentLogicFrame >= grayscaleTransition.startFrame + grayscaleTransition.durationFrames) {
          grayscale = clamp01(grayscaleTransition.to);
          grayscaleTransition = null;
        }
      }

      const fadeRequests = gameLogic.drainScriptCameraFadeRequests();
      for (const request of fadeRequests) {
        activeFade = {
          fadeType: request.fadeType,
          minFade: request.minFade,
          maxFade: request.maxFade,
          increaseFrames: request.increaseFrames,
          holdFrames: request.holdFrames,
          decreaseFrames: request.decreaseFrames,
          startFrame: currentLogicFrame,
        };
      }

      const filterRequests = gameLogic.drainScriptCameraFilterRequests();
      for (const request of filterRequests) {
        switch (request.requestType) {
          case 'MOTION_BLUR':
            blurExpireFrame = Math.max(blurExpireFrame, currentLogicFrame + MOTION_BLUR_DURATION_FRAMES);
            blurSaturationBoost = request.saturate ? 0.35 : 0;
            break;
          case 'MOTION_BLUR_JUMP':
            blurExpireFrame = Math.max(blurExpireFrame, currentLogicFrame + MOTION_BLUR_JUMP_DURATION_FRAMES);
            blurSaturationBoost = request.saturate ? 0.35 : 0;
            if (request.x !== null && request.z !== null && Number.isFinite(request.x) && Number.isFinite(request.z)) {
              pendingMotionBlurJump = {
                x: request.x,
                z: request.z,
                triggerFrame: currentLogicFrame + MOTION_BLUR_JUMP_TRIGGER_FRAMES - 1,
              };
            }
            break;
          case 'MOTION_BLUR_FOLLOW': {
            const followMode = request.followMode !== null ? Math.trunc(request.followMode) : 0;
            const panFactor = followMode > 0 ? followMode : MOTION_BLUR_DEFAULT_PAN_FACTOR;
            activeMotionBlurFollow = {
              panFactor,
              maxCount: Math.max(1, panFactor / 2),
              ending: false,
            };
            break;
          }
          case 'MOTION_BLUR_END_FOLLOW':
            if (activeMotionBlurFollow) {
              activeMotionBlurFollow.ending = true;
            }
            break;
        }
      }

      const shakerRequests = gameLogic.drainScriptCameraShakerRequests();
      for (const request of shakerRequests) {
        const durationFrames = Math.max(1, Math.trunc(request.durationSeconds * LOGIC_FRAME_RATE));
        if (!Number.isFinite(request.amplitude) || request.amplitude <= 0) {
          continue;
        }
        activeShakes.push({
          startFrame: currentLogicFrame,
          durationFrames,
          amplitude: request.amplitude,
          seed: request.frame + request.x * 0.17 + request.z * 0.29,
          x: request.x,
          z: request.z,
          radius: request.radius,
        });
      }

      const screenShake = gameLogic.getScriptScreenShakeState?.() ?? null;
      if (screenShake && screenShake.frame !== lastScreenShakeFrame) {
        lastScreenShakeFrame = screenShake.frame;
        const amplitude = Math.max(0, Math.trunc(screenShake.intensity));
        if (amplitude > 0) {
          activeShakes.push({
            startFrame: currentLogicFrame,
            durationFrames: SCREEN_SHAKE_DURATION_FRAMES,
            amplitude: amplitude * 0.75,
            seed: screenShake.frame,
            x: 0,
            z: 0,
            radius: 0,
          });
        }
      }

      const cameraTarget = getCameraTargetPosition?.() ?? null;
      const cameraTargetX = cameraTarget && Number.isFinite(cameraTarget.x) ? cameraTarget.x : null;
      const cameraTargetZ = cameraTarget && Number.isFinite(cameraTarget.z) ? cameraTarget.z : null;
      if (activeMotionBlurFollow) {
        if (activeMotionBlurFollow.ending) {
          activeMotionBlurFollow.maxCount -= 1;
          if (activeMotionBlurFollow.maxCount < MOTION_BLUR_END_MIN_COUNT) {
            activeMotionBlurFollow = null;
          }
        } else {
          const deltaX = cameraTargetX !== null && previousCameraTarget
            ? (cameraTargetX - previousCameraTarget.x)
            : 0;
          const deltaZ = cameraTargetZ !== null && previousCameraTarget
            ? (cameraTargetZ - previousCameraTarget.z)
            : 0;
          const deltaLength = Math.hypot(deltaX, deltaZ);
          const panFactor = activeMotionBlurFollow.panFactor;
          let maxCount = (deltaLength * 200 * panFactor) / MOTION_BLUR_DEFAULT_PAN_FACTOR;
          const minCount = panFactor / 2;
          if (maxCount < minCount) {
            maxCount = minCount;
          }
          if (maxCount > panFactor) {
            maxCount = panFactor;
          }
          activeMotionBlurFollow.maxCount = maxCount;
        }
      }
      if (cameraTargetX !== null && cameraTargetZ !== null) {
        previousCameraTarget = { x: cameraTargetX, z: cameraTargetZ };
      } else {
        previousCameraTarget = null;
      }
      if (pendingMotionBlurJump && currentLogicFrame >= pendingMotionBlurJump.triggerFrame) {
        onMotionBlurJumpToPosition?.(pendingMotionBlurJump.x, pendingMotionBlurJump.z);
        pendingMotionBlurJump = null;
      }

      let shakeOffsetX = 0;
      let shakeOffsetY = 0;
      for (let i = activeShakes.length - 1; i >= 0; i--) {
        const shake = activeShakes[i]!;
        const ageFrames = currentLogicFrame - shake.startFrame;
        if (ageFrames >= shake.durationFrames) {
          activeShakes.splice(i, 1);
          continue;
        }
        const normalizedAge = ageFrames / shake.durationFrames;
        let frameAmplitude = shake.amplitude * (1 - normalizedAge);
        if (shake.radius > 0 && cameraTargetX !== null && cameraTargetZ !== null) {
          const dx = cameraTargetX - shake.x;
          const dz = cameraTargetZ - shake.z;
          const distance = Math.hypot(dx, dz);
          if (distance > shake.radius) {
            continue;
          }
          frameAmplitude *= (1 - distance / shake.radius);
        }
        if (frameAmplitude <= 0) {
          continue;
        }
        shakeOffsetX += Math.sin((ageFrames + shake.seed) * 0.73) * frameAmplitude;
        shakeOffsetY += Math.cos((ageFrames + shake.seed) * 0.91) * frameAmplitude;
      }

      const blurActive = currentLogicFrame <= blurExpireFrame;
      const oneShotBlurPixels = blurActive ? 2 : 0;
      const followBlurPixels = activeMotionBlurFollow
        ? 2 * (activeMotionBlurFollow.maxCount / Math.max(1, activeMotionBlurFollow.panFactor))
        : 0;
      const blurPixels = Math.max(
        oneShotBlurPixels,
        Number.isFinite(followBlurPixels) ? Math.max(0, followBlurPixels) : 0,
      );
      const saturation = blurActive ? (1 + blurSaturationBoost) : 1;
      const fadeAmount = clamp01(evaluateFadeAmount(activeFade, currentLogicFrame));
      const fadeType = activeFade ? activeFade.fadeType : null;

      return {
        grayscale,
        saturation,
        blurPixels,
        fadeType,
        fadeAmount,
        shakeOffsetX,
        shakeOffsetY,
      };
    },
  };
}
