/**
 * Floating display-string rendering — damage, heal, and cash numbers above entities.
 *
 * Source parity: InGameUI::FloatingTextData + updateFloatingText + drawFloatingText.
 * C++ uses DisplayStringManager to render text at world positions that rise
 * (m_floatingTextMoveUpSpeed per frame) and fade (m_floatingTextMoveVanishRate).
 * Default timeout is LOGICFRAMES_PER_SECOND/3 (~10 frames at 30fps ≈ 0.33s for
 * the display phase, then fade begins). We use a combined 1.5s lifetime with
 * linear fade for the web port.
 *
 * Implementation: each number is a THREE.Sprite with a CanvasTexture rendered
 * from an offscreen <canvas>. Sprites billboard toward the camera automatically.
 */

import * as THREE from 'three';

/** The type of floating number, determines color. */
export type DisplayStringType = 'damage' | 'heal' | 'cash';

interface ActiveDisplayString {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.Texture;
  createdAt: number;
  lifetimeMs: number;
  /** Rise speed in world units per second. */
  riseSpeed: number;
}

const MAX_ACTIVE_STRINGS = 64;
const DEFAULT_LIFETIME_MS = 1500;
const DEFAULT_RISE_SPEED = 1.5; // world units/sec — source parity: m_floatingTextMoveUpSpeed
const SPRITE_SCALE = 1.0;

// Canvas dimensions for text rendering.
const CANVAS_WIDTH = 128;
const CANVAS_HEIGHT = 64;

const TYPE_COLORS: Record<DisplayStringType, string> = {
  damage: '#ff3333',
  heal: '#33ff33',
  cash: '#ffdd00',
};

/**
 * Create a texture with the number text rendered onto it.
 * In browser: uses OffscreenCanvas or HTMLCanvasElement to render styled text.
 * In Node/test: falls back to a 1x1 DataTexture placeholder.
 */
function createTextTexture(
  text: string,
  color: string,
): THREE.Texture {
  // Try OffscreenCanvas first (modern browsers).
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    if (ctx) {
      renderTextToContext(ctx, text, color);
    }
    const texture = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement);
    texture.needsUpdate = true;
    return texture;
  }

  // Fall back to HTMLCanvasElement (older browsers).
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      renderTextToContext(ctx, text, color);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // Node.js / test fallback — create a minimal DataTexture placeholder.
  const data = new Uint8Array([255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Render styled text with a black outline onto a 2D canvas context.
 * Source parity: C++ drawFloatingText uses a black dropColor shadow.
 */
function renderTextToContext(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  color: string,
): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Font: bold sans-serif, ~20px on the sprite canvas.
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Shadow / outline (source parity: dropColor = black).
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

  // Fill with the type color.
  ctx.fillStyle = color;
  ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
}

export class DisplayStringRenderer {
  private readonly scene: THREE.Scene;
  private readonly activeStrings: ActiveDisplayString[] = [];
  private lastUpdateTime = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Add a floating damage number (red) at the given world position.
   */
  addDamageNumber(x: number, y: number, z: number, amount: number): void {
    this.addString(x, y, z, `-${Math.round(amount)}`, 'damage');
  }

  /**
   * Add a floating heal number (green) at the given world position.
   */
  addHealNumber(x: number, y: number, z: number, amount: number): void {
    this.addString(x, y, z, `+${Math.round(amount)}`, 'heal');
  }

  /**
   * Add a floating cash number (yellow) at the given world position.
   */
  addCashNumber(x: number, y: number, z: number, amount: number): void {
    this.addString(x, y, z, `+$${Math.round(amount)}`, 'cash');
  }

  /**
   * Internal: create a sprite for the given text and type, add to scene.
   */
  private addString(
    x: number,
    y: number,
    z: number,
    text: string,
    type: DisplayStringType,
  ): void {
    // Evict oldest if at capacity.
    if (this.activeStrings.length >= MAX_ACTIVE_STRINGS) {
      const oldest = this.activeStrings.shift();
      if (oldest) {
        this.scene.remove(oldest.sprite);
        oldest.material.dispose();
        oldest.texture.dispose();
      }
    }

    const color = TYPE_COLORS[type];
    const texture = createTextTexture(text, color);

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      sizeAttenuation: true,
    });

    const sprite = new THREE.Sprite(material);
    sprite.name = 'display-string';
    sprite.position.set(x, y, z);
    sprite.scale.set(SPRITE_SCALE, SPRITE_SCALE * (CANVAS_HEIGHT / CANVAS_WIDTH), 1);

    // Store type as userData for identification.
    sprite.userData = { displayStringType: type };

    this.scene.add(sprite);

    this.activeStrings.push({
      sprite,
      material,
      texture,
      createdAt: performance.now(),
      lifetimeMs: DEFAULT_LIFETIME_MS,
      riseSpeed: DEFAULT_RISE_SPEED,
    });
  }

  /**
   * Update all active display strings — rise upward, fade, remove expired.
   * Source parity: updateFloatingText increments frameCount each logic frame,
   * drawFloatingText subtracts frameCount * moveUpSpeed from screen Y,
   * and fades alpha by vanishRate after timeout.
   */
  update(dt?: number): void {
    const now = performance.now();
    const dtSec = dt ?? (
      this.lastUpdateTime > 0
        ? Math.min((now - this.lastUpdateTime) / 1000, 0.05) // cap at 50ms
        : 0.016
    );
    this.lastUpdateTime = now;

    let writeIdx = 0;

    for (let i = 0; i < this.activeStrings.length; i++) {
      const entry = this.activeStrings[i]!;
      const elapsed = now - entry.createdAt;

      if (elapsed >= entry.lifetimeMs) {
        this.scene.remove(entry.sprite);
        entry.material.dispose();
        entry.texture.dispose();
        continue;
      }

      // Rise upward.
      entry.sprite.position.y += entry.riseSpeed * dtSec;

      // Fade opacity linearly over lifetime.
      // Source parity: C++ fades alpha after frameTimeOut by vanishRate per frame.
      // We simplify to a linear fade over the full lifetime.
      const progress = elapsed / entry.lifetimeMs;
      entry.material.opacity = 1 - progress;

      this.activeStrings[writeIdx++] = entry;
    }

    this.activeStrings.length = writeIdx;
  }

  getActiveStringCount(): number {
    return this.activeStrings.length;
  }

  dispose(): void {
    for (const entry of this.activeStrings) {
      this.scene.remove(entry.sprite);
      entry.material.dispose();
      entry.texture.dispose();
    }
    this.activeStrings.length = 0;
  }
}
