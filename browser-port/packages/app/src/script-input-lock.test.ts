import { describe, expect, it } from 'vitest';

import type { InputState } from '@generals/input';

import { applyScriptInputLock } from './script-input-lock.js';

function makeInputState(): InputState {
  return {
    keysDown: new Set<string>(['a', 'b']),
    keysPressed: new Set<string>(['x']),
    mouseX: 123,
    mouseY: 456,
    viewportWidth: 1280,
    viewportHeight: 720,
    wheelDelta: 1,
    middleMouseDown: true,
    leftMouseDown: true,
    rightMouseDown: true,
    leftMouseClick: true,
    rightMouseClick: true,
    middleDragDx: 4,
    middleDragDy: -2,
    pointerInCanvas: true,
  };
}

describe('applyScriptInputLock', () => {
  it('returns the original input state when script input is enabled', () => {
    const inputState = makeInputState();
    expect(applyScriptInputLock(inputState, false)).toBe(inputState);
  });

  it('masks command/camera input fields when script input is disabled', () => {
    const inputState = makeInputState();
    const masked = applyScriptInputLock(inputState, true);

    expect(masked).not.toBe(inputState);
    expect(masked.keysDown.size).toBe(0);
    expect(masked.keysPressed.size).toBe(0);
    expect(masked.wheelDelta).toBe(0);
    expect(masked.middleMouseDown).toBe(false);
    expect(masked.leftMouseDown).toBe(false);
    expect(masked.rightMouseDown).toBe(false);
    expect(masked.leftMouseClick).toBe(false);
    expect(masked.rightMouseClick).toBe(false);
    expect(masked.middleDragDx).toBe(0);
    expect(masked.middleDragDy).toBe(0);
    expect(masked.pointerInCanvas).toBe(false);

    // Position and viewport remain untouched for hover/render projection math.
    expect(masked.mouseX).toBe(123);
    expect(masked.mouseY).toBe(456);
    expect(masked.viewportWidth).toBe(1280);
    expect(masked.viewportHeight).toBe(720);
  });
});
