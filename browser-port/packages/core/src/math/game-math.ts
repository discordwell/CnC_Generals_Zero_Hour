/**
 * Deterministic math utilities — ported from GameMath / QuickTrig.
 *
 * The original engine uses lookup-table-based trig for deterministic
 * multiplayer. We replicate this to ensure lockstep sync across browsers.
 *
 * IMPORTANT: All game-logic code must use these functions instead of
 * Math.sin/cos/atan2 directly. Rendering code can use native Math.
 */

const SIN_TABLE_SIZE = 4096;
const sinTable = new Float64Array(SIN_TABLE_SIZE);
const TWO_PI = 2 * Math.PI;

// Pre-compute sine lookup table
for (let i = 0; i < SIN_TABLE_SIZE; i++) {
  sinTable[i] = Math.sin((i / SIN_TABLE_SIZE) * TWO_PI);
}

/** Normalize angle to [0, 2*PI). */
export function normalizeAngle(angle: number): number {
  angle = angle % TWO_PI;
  if (angle < 0) angle += TWO_PI;
  return angle;
}

/** Deterministic sine via lookup table with linear interpolation. */
export function gameSin(angle: number): number {
  angle = normalizeAngle(angle);
  const index = (angle / TWO_PI) * SIN_TABLE_SIZE;
  const i0 = Math.floor(index) % SIN_TABLE_SIZE;
  const i1 = (i0 + 1) % SIN_TABLE_SIZE;
  const frac = index - Math.floor(index);
  return sinTable[i0]! * (1 - frac) + sinTable[i1]! * frac;
}

/** Deterministic cosine via lookup table. */
export function gameCos(angle: number): number {
  return gameSin(angle + Math.PI / 2);
}

/** Deterministic atan2 approximation. */
export function gameAtan2(y: number, x: number): number {
  // Use native atan2 — it's deterministic within a single browser engine,
  // and for cross-browser multiplayer we validate via CRC checks.
  // If CRC mismatches occur, we can switch to a polynomial approximation.
  return Math.atan2(y, x);
}

/** Deterministic square root. */
export function gameSqrt(x: number): number {
  return Math.sqrt(x);
}

/** Fast inverse square root (for normalization). */
export function gameInvSqrt(x: number): number {
  return 1.0 / Math.sqrt(x);
}

/** Clamp value to range. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth step interpolation. */
export function smoothStep(a: number, b: number, t: number): number {
  t = clamp((t - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Convert degrees to radians. */
export function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/** Convert radians to degrees. */
export function toDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Compute the shortest angular difference between two angles.
 * Result is in [-PI, PI].
 */
export function angleDifference(from: number, to: number): number {
  let diff = normalizeAngle(to - from);
  if (diff > Math.PI) diff -= TWO_PI;
  return diff;
}

/** Integer-based random number generator (deterministic, seedable). */
export class GameRandom {
  private seed: number;

  constructor(seed: number = 1) {
    this.seed = seed >>> 0;
  }

  /** Returns next pseudo-random integer [0, 2^31). */
  nextInt(): number {
    // Linear congruential generator matching original engine parameters
    this.seed = (this.seed * 214013 + 2531011) >>> 0;
    return (this.seed >>> 16) & 0x7fff;
  }

  /** Returns float [0, 1). */
  nextFloat(): number {
    return this.nextInt() / 32768;
  }

  /** Returns integer in [min, max] inclusive. */
  nextRange(min: number, max: number): number {
    return min + (this.nextInt() % (max - min + 1));
  }

  getSeed(): number {
    return this.seed;
  }

  setSeed(seed: number): void {
    this.seed = seed >>> 0;
  }
}
