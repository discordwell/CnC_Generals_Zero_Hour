/**
 * InputManager — captures DOM events and provides clean input snapshots.
 *
 * Tracks keyboard, mouse movement, wheel, and middle-button drag state.
 * Each frame the camera reads the current InputState, then the manager
 * resets per-frame accumulators (wheel delta, drag delta).
 */

import type { Subsystem } from '@generals/engine';
import type { InputState } from './types.js';

export class InputManager implements Subsystem {
  readonly name = 'InputManager';

  private readonly canvas: HTMLCanvasElement;

  // Keyboard
  private readonly _keysDown = new Set<string>();

  // Mouse
  private _mouseX = 0;
  private _mouseY = 0;
  private _mouseClientX = 0;
  private _mouseClientY = 0;
  private _viewportWidth = 1;
  private _viewportHeight = 1;
  private _pointerInCanvas = true;

  // Wheel
  private _wheelDelta = 0;

  // Middle mouse drag
  private _middleMouseDown = false;
  private _leftMouseDown = false;
  private _rightMouseDown = false;
  private _leftMouseClick = false;
  private _rightMouseClick = false;
  private _middleDragDx = 0;
  private _middleDragDy = 0;
  private _lastMiddleX = 0;
  private _lastMiddleY = 0;

  // Bound event handlers (for cleanup)
  private readonly _onKeyDown: (e: KeyboardEvent) => void;
  private readonly _onKeyUp: (e: KeyboardEvent) => void;
  private readonly _onMouseMove: (e: MouseEvent) => void;
  private readonly _onWheel: (e: WheelEvent) => void;
  private readonly _onMouseDown: (e: MouseEvent) => void;
  private readonly _onMouseUp: (e: MouseEvent) => void;
  private readonly _onMouseEnter: () => void;
  private readonly _onMouseLeave: () => void;
  private readonly _onContextMenu: (e: Event) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this._onKeyDown = (e) => {
      // Don't capture keys when typing in inputs
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      this._keysDown.add(e.key.toLowerCase());
      // Prevent default for game keys to avoid browser shortcuts
      if (['w', 'a', 's', 'd', 'q', 'e', ' ', 'f1'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };

    this._onKeyUp = (e) => {
      this._keysDown.delete(e.key.toLowerCase());
    };

    this._onMouseMove = (e) => {
      this._mouseClientX = e.clientX;
      this._mouseClientY = e.clientY;
      this.updateCanvasMousePosition();

      if (this._middleMouseDown) {
        this._middleDragDx += e.clientX - this._lastMiddleX;
        this._middleDragDy += e.clientY - this._lastMiddleY;
        this._lastMiddleX = e.clientX;
        this._lastMiddleY = e.clientY;
      }
    };

    this._onWheel = (e) => {
      e.preventDefault();
      // Normalize deltaY across deltaMode (pixel, line, page)
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 40;  // LINE mode (Firefox)
      else if (e.deltaMode === 2) delta *= 800; // PAGE mode
      this._wheelDelta += delta;
    };

    this._onMouseDown = (e) => {
      this._mouseClientX = e.clientX;
      this._mouseClientY = e.clientY;
      this.updateCanvasMousePosition();
      if (e.button === 1) {
        // Middle mouse button
        e.preventDefault();
        this._middleMouseDown = true;
        this._lastMiddleX = e.clientX;
        this._lastMiddleY = e.clientY;
      } else if (e.button === 0) {
        this._leftMouseDown = true;
        this._leftMouseClick = true;
      } else if (e.button === 2) {
        this._rightMouseDown = true;
        this._rightMouseClick = true;
        e.preventDefault();
      }
    };

    this._onMouseUp = (e) => {
      if (e.button === 1) {
        this._middleMouseDown = false;
      } else if (e.button === 0) {
        this._leftMouseDown = false;
      } else if (e.button === 2) {
        this._rightMouseDown = false;
      }
    };

    this._onMouseEnter = () => {
      this._pointerInCanvas = true;
    };

    this._onMouseLeave = () => {
      this._pointerInCanvas = false;
    };

    this._onContextMenu = (e) => {
      e.preventDefault();
    };
  }

  init(): void {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('mouseenter', this._onMouseEnter);
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);
    this.canvas.addEventListener('contextmenu', this._onContextMenu);
  }

  /**
   * Get a snapshot of the current input state.
   * Call this once per frame before the camera update.
   */
  getState(): InputState {
    this.updateCanvasMousePosition();
    return {
      keysDown: this._keysDown,
      mouseX: this._mouseX,
      mouseY: this._mouseY,
      viewportWidth: this._viewportWidth,
      viewportHeight: this._viewportHeight,
      wheelDelta: this._wheelDelta,
      middleMouseDown: this._middleMouseDown,
      leftMouseDown: this._leftMouseDown,
      rightMouseDown: this._rightMouseDown,
      leftMouseClick: this._leftMouseClick,
      rightMouseClick: this._rightMouseClick,
      middleDragDx: this._middleDragDx,
      middleDragDy: this._middleDragDy,
      pointerInCanvas: this._pointerInCanvas,
    };
  }

  /**
   * Called after the camera reads state to reset per-frame accumulators.
   */
  update(_dt: number): void {
    this._wheelDelta = 0;
    this._middleDragDx = 0;
    this._middleDragDy = 0;
    this._leftMouseClick = false;
    this._rightMouseClick = false;
  }

  reset(): void {
    this._keysDown.clear();
    this._wheelDelta = 0;
    this._middleMouseDown = false;
    this._leftMouseDown = false;
    this._rightMouseDown = false;
    this._leftMouseClick = false;
    this._rightMouseClick = false;
    this._middleDragDx = 0;
    this._middleDragDy = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('mouseenter', this._onMouseEnter);
    this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    this._keysDown.clear();
  }

  private updateCanvasMousePosition(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this._viewportWidth = width;
    this._viewportHeight = height;

    this._mouseX = clamp(this._mouseClientX - rect.left, 0, width);
    this._mouseY = clamp(this._mouseClientY - rect.top, 0, height);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
