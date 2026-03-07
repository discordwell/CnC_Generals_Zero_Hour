import { describe, it, expect, beforeAll } from 'vitest';
import {
  CursorManager,
  parseSpriteSheet,
  JIFFY_MS,
  resolveGameCursor,
  detectEdgeScrollDir,
  type CursorMeta,
} from './cursor-manager.js';

// Polyfill ImageData for Node test environment
beforeAll(() => {
  if (typeof globalThis.ImageData === 'undefined') {
    (globalThis as Record<string, unknown>).ImageData = class ImageData {
      readonly data: Uint8ClampedArray;
      readonly width: number;
      readonly height: number;
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    };
  }
});

function makeMeta(overrides: Partial<CursorMeta> = {}): CursorMeta {
  return {
    numFrames: 2,
    frameWidth: 4,
    frameHeight: 4,
    displayRate: 6,
    sequence: [0, 1],
    rates: [6, 6],
    hotspots: [{ x: 0, y: 0 }, { x: 2, y: 2 }],
    ...overrides,
  };
}

function makeSpriteSheet(width: number, frameHeight: number, numFrames: number): ArrayBuffer {
  const sheetHeight = frameHeight * numFrames;
  const headerSize = 8;
  const buf = new ArrayBuffer(headerSize + width * sheetHeight * 4);
  const view = new DataView(buf);
  view.setUint32(0, width, true);
  view.setUint32(4, sheetHeight, true);
  // Fill pixels with frame index for identification
  const pixels = new Uint8Array(buf, headerSize);
  for (let f = 0; f < numFrames; f++) {
    for (let row = 0; row < frameHeight; row++) {
      for (let col = 0; col < width; col++) {
        const idx = (f * frameHeight + row) * width * 4 + col * 4;
        pixels[idx] = f;     // R = frame index
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 255;
      }
    }
  }
  return buf;
}

describe('parseSpriteSheet', () => {
  it('parses frames from sprite sheet buffer', () => {
    const meta = makeMeta({ numFrames: 2, frameWidth: 4, frameHeight: 4 });
    const buffer = makeSpriteSheet(4, 4, 2);
    const frames = parseSpriteSheet(buffer, meta);

    expect(frames).toHaveLength(2);
    expect(frames[0]!.width).toBe(4);
    expect(frames[0]!.height).toBe(4);
    // First frame pixels should have R=0
    expect(frames[0]!.data[0]).toBe(0);
    // Second frame pixels should have R=1
    expect(frames[1]!.data[0]).toBe(1);
  });

  it('handles single-frame cursor', () => {
    const meta = makeMeta({ numFrames: 1, sequence: [0], rates: [6], hotspots: [{ x: 0, y: 0 }] });
    const buffer = makeSpriteSheet(4, 4, 1);
    const frames = parseSpriteSheet(buffer, meta);

    expect(frames).toHaveLength(1);
  });

  it('returns empty array for truncated buffer', () => {
    const meta = makeMeta({ numFrames: 2, frameWidth: 4, frameHeight: 4 });
    // Buffer too small: only header + 1 frame instead of 2
    const buffer = makeSpriteSheet(4, 4, 1);
    const frames = parseSpriteSheet(buffer, meta);

    expect(frames).toHaveLength(0);
  });
});

describe('CursorManager', () => {
  it('advances animation frame based on dt', () => {
    const manager = new CursorManager();
    // Directly inject a cached cursor for testing
    const meta = makeMeta({ numFrames: 3, sequence: [0, 1, 2], rates: [6, 6, 6] });
    const buffer = makeSpriteSheet(4, 4, 3);
    const frames = parseSpriteSheet(buffer, meta);
    (manager as unknown as { cache: Map<string, unknown> }).cache.set('test', { meta, frames });

    manager.setCursor('test');

    // At rate 6 jiffies, each frame lasts 6 * JIFFY_MS ms
    const frameDuration = 6 * JIFFY_MS / 1000; // in seconds
    manager.update(frameDuration + 0.001);
    // Should have advanced to frame 1
    expect((manager as unknown as { currentFrame: number }).currentFrame).toBe(1);
  });

  it('resets animation on cursor switch', () => {
    const manager = new CursorManager();
    const meta = makeMeta();
    const buffer = makeSpriteSheet(4, 4, 2);
    const frames = parseSpriteSheet(buffer, meta);
    (manager as unknown as { cache: Map<string, unknown> }).cache.set('a', { meta, frames });
    (manager as unknown as { cache: Map<string, unknown> }).cache.set('b', { meta, frames });

    manager.setCursor('a');
    manager.update(1); // advance time
    manager.setCursor('b');

    expect((manager as unknown as { currentFrame: number }).currentFrame).toBe(0);
    expect((manager as unknown as { frameTimer: number }).frameTimer).toBe(0);
  });

  it('does not reset when setting same cursor', () => {
    const manager = new CursorManager();
    const meta = makeMeta({ numFrames: 3, sequence: [0, 1, 2], rates: [6, 6, 6] });
    const buffer = makeSpriteSheet(4, 4, 3);
    const frames = parseSpriteSheet(buffer, meta);
    (manager as unknown as { cache: Map<string, unknown> }).cache.set('test', { meta, frames });

    manager.setCursor('test');
    const frameDuration = 6 * JIFFY_MS / 1000;
    manager.update(frameDuration + 0.001);
    const frameAfterUpdate = (manager as unknown as { currentFrame: number }).currentFrame;

    manager.setCursor('test'); // same cursor
    expect((manager as unknown as { currentFrame: number }).currentFrame).toBe(frameAfterUpdate);
  });
});

describe('resolveGameCursor', () => {
  it('returns SCCPointer with no selection and no hover', () => {
    expect(resolveGameCursor({
      hasSelection: false,
      hoverTarget: 'none',
      edgeScrollDir: null,
      pendingAbility: false,
    })).toBe('SCCPointer');
  });

  it('returns SCCSelect when hovering own unit without selection', () => {
    expect(resolveGameCursor({
      hasSelection: false,
      hoverTarget: 'own-unit',
      edgeScrollDir: null,
      pendingAbility: false,
    })).toBe('SCCSelect');
  });

  it('returns SCCMove when selected and hovering ground', () => {
    expect(resolveGameCursor({
      hasSelection: true,
      hoverTarget: 'ground',
      edgeScrollDir: null,
      pendingAbility: false,
    })).toBe('SCCMove');
  });

  it('returns SCCAttack when selected and hovering enemy', () => {
    expect(resolveGameCursor({
      hasSelection: true,
      hoverTarget: 'enemy',
      edgeScrollDir: null,
      pendingAbility: false,
    })).toBe('SCCAttack');
  });

  it('returns edge scroll cursor when at edge', () => {
    expect(resolveGameCursor({
      hasSelection: false,
      hoverTarget: 'none',
      edgeScrollDir: 3,
      pendingAbility: false,
    })).toBe('SCCScroll3');
  });

  it('prioritizes edge scroll over selection state', () => {
    expect(resolveGameCursor({
      hasSelection: true,
      hoverTarget: 'enemy',
      edgeScrollDir: 0,
      pendingAbility: false,
    })).toBe('SCCScroll0');
  });

  it('returns SCCTarget when ability is pending', () => {
    expect(resolveGameCursor({
      hasSelection: true,
      hoverTarget: 'ground',
      edgeScrollDir: null,
      pendingAbility: true,
    })).toBe('SCCTarget');
  });
});

describe('detectEdgeScrollDir', () => {
  const W = 1024;
  const H = 768;
  const E = 20;

  it('returns null when not at any edge', () => {
    expect(detectEdgeScrollDir(512, 384, W, H, E)).toBeNull();
  });

  it('detects north edge', () => {
    expect(detectEdgeScrollDir(512, 5, W, H, E)).toBe(0);
  });

  it('detects northeast corner', () => {
    expect(detectEdgeScrollDir(1020, 5, W, H, E)).toBe(1);
  });

  it('detects east edge', () => {
    expect(detectEdgeScrollDir(1020, 384, W, H, E)).toBe(2);
  });

  it('detects southeast corner', () => {
    expect(detectEdgeScrollDir(1020, 760, W, H, E)).toBe(3);
  });

  it('detects south edge', () => {
    expect(detectEdgeScrollDir(512, 760, W, H, E)).toBe(4);
  });

  it('detects southwest corner', () => {
    expect(detectEdgeScrollDir(5, 760, W, H, E)).toBe(5);
  });

  it('detects west edge', () => {
    expect(detectEdgeScrollDir(5, 384, W, H, E)).toBe(6);
  });

  it('detects northwest corner', () => {
    expect(detectEdgeScrollDir(5, 5, W, H, E)).toBe(7);
  });
});
