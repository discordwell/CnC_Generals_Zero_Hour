/**
 * Input system types and configuration.
 */

// ============================================================================
// Camera configuration
// ============================================================================

export interface CameraConfig {
  /** Minimum zoom distance (world units). */
  minZoom: number;
  /** Maximum zoom distance (world units). */
  maxZoom: number;
  /** Default zoom distance (world units). */
  defaultZoom: number;
  /** Camera pitch angle in radians (angle from vertical). */
  pitchAngle: number;
  /** Scroll speed in world units per second. */
  scrollSpeed: number;
  /** Edge scroll zone size in pixels. */
  edgeScrollSize: number;
  /** Rotation speed in radians per second. */
  rotateSpeed: number;
  /** Zoom speed multiplier per wheel tick. */
  zoomSpeed: number;
  /** Smoothing factor for camera interpolation (0 = instant, higher = smoother). */
  smoothing: number;
  /** Middle mouse drag pan speed multiplier. */
  panSpeed: number;
}

export const DEFAULT_CAMERA_CONFIG: Readonly<CameraConfig> = {
  minZoom: 80,
  maxZoom: 600,
  defaultZoom: 300,
  pitchAngle: Math.PI / 4, // 45 degrees from vertical
  scrollSpeed: 400,
  edgeScrollSize: 20,
  rotateSpeed: 2.0,
  zoomSpeed: 30,
  smoothing: 0.15,
  panSpeed: 1.5,
};

// ============================================================================
// Input state snapshot
// ============================================================================

/** Current state of all tracked inputs, read each frame by the camera. */
export interface InputState {
  /** Currently held keys (lowercased key values). */
  readonly keysDown: ReadonlySet<string>;
  /** Mouse position in viewport pixels. */
  readonly mouseX: number;
  readonly mouseY: number;
  /** Viewport dimensions. */
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Mouse wheel delta accumulated since last frame. */
  readonly wheelDelta: number;
  /** Whether middle mouse button is currently held. */
  readonly middleMouseDown: boolean;
  /** Whether left mouse button is currently held. */
  readonly leftMouseDown: boolean;
  /** Whether right mouse button is currently held. */
  readonly rightMouseDown: boolean;
  /** Left click occurred this frame. */
  readonly leftMouseClick: boolean;
  /** Right click occurred this frame. */
  readonly rightMouseClick: boolean;
  /** Middle mouse drag delta since last frame (pixels). */
  readonly middleDragDx: number;
  readonly middleDragDy: number;
  /** Whether the pointer is currently inside the canvas. */
  readonly pointerInCanvas: boolean;
}

// ============================================================================
// Camera state (save/restore for replays, etc.)
// ============================================================================

export interface CameraState {
  /** Camera look-at target in world space. */
  targetX: number;
  targetZ: number;
  /** Orbit angle around the target (radians). */
  angle: number;
  /** Zoom distance. */
  zoom: number;
}
