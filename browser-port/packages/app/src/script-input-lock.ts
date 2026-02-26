import type { InputState } from '@generals/input';

const EMPTY_KEYS = new Set<string>();

export function applyScriptInputLock(
  inputState: InputState,
  inputLocked: boolean,
): InputState {
  if (!inputLocked) {
    return inputState;
  }

  return {
    ...inputState,
    keysDown: EMPTY_KEYS,
    keysPressed: EMPTY_KEYS,
    wheelDelta: 0,
    middleMouseDown: false,
    leftMouseDown: false,
    rightMouseDown: false,
    leftMouseClick: false,
    rightMouseClick: false,
    middleDragDx: 0,
    middleDragDy: 0,
    pointerInCanvas: false,
  };
}
