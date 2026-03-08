import * as THREE from 'three';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { DisplayStringRenderer } from './display-strings.js';

describe('DisplayStringRenderer', () => {
  let scene: THREE.Scene;
  let renderer: DisplayStringRenderer;

  beforeEach(() => {
    scene = new THREE.Scene();
    renderer = new DisplayStringRenderer(scene);
  });

  afterEach(() => {
    renderer.dispose();
    vi.restoreAllMocks();
  });

  it('addDamageNumber creates a sprite in the scene', () => {
    renderer.addDamageNumber(0, 5, 0, 42);
    expect(renderer.getActiveStringCount()).toBe(1);
    const sprite = scene.getObjectByName('display-string');
    expect(sprite).toBeTruthy();
    expect(sprite).toBeInstanceOf(THREE.Sprite);
  });

  it('sprite position starts at given coordinates', () => {
    renderer.addDamageNumber(10, 20, 30, 100);
    const sprite = scene.getObjectByName('display-string') as THREE.Sprite;
    expect(sprite.position.x).toBe(10);
    expect(sprite.position.y).toBe(20);
    expect(sprite.position.z).toBe(30);
  });

  it('update moves sprite upward', () => {
    const now = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(now);

    renderer.addDamageNumber(0, 5, 0, 50);
    const sprite = scene.getObjectByName('display-string') as THREE.Sprite;
    const initialY = sprite.position.y;

    // Advance 100ms.
    vi.spyOn(performance, 'now').mockReturnValue(now + 100);
    renderer.update();

    expect(sprite.position.y).toBeGreaterThan(initialY);
  });

  it('sprite is removed after lifetime expires', () => {
    const now = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(now);

    renderer.addDamageNumber(0, 5, 0, 25);
    expect(renderer.getActiveStringCount()).toBe(1);

    // Advance past the 1500ms lifetime.
    vi.spyOn(performance, 'now').mockReturnValue(now + 1600);
    renderer.update();

    expect(renderer.getActiveStringCount()).toBe(0);
    expect(scene.getObjectByName('display-string')).toBeUndefined();
  });

  it('cap enforcement — adding beyond cap removes oldest', () => {
    for (let i = 0; i < 70; i++) {
      renderer.addDamageNumber(i, 0, 0, i);
    }
    expect(renderer.getActiveStringCount()).toBe(64);
  });

  it('dispose cleans up all sprites', () => {
    renderer.addDamageNumber(0, 0, 0, 10);
    renderer.addHealNumber(1, 0, 0, 20);
    renderer.addCashNumber(2, 0, 0, 30);
    expect(renderer.getActiveStringCount()).toBe(3);

    renderer.dispose();
    expect(renderer.getActiveStringCount()).toBe(0);
    const sprites = scene.children.filter((c) => c.name === 'display-string');
    expect(sprites.length).toBe(0);
  });

  it('damage numbers use red-ish color (type stored in userData)', () => {
    renderer.addDamageNumber(0, 0, 0, 50);
    const sprite = scene.getObjectByName('display-string') as THREE.Sprite;
    expect(sprite.userData.displayStringType).toBe('damage');
  });

  it('heal numbers use green type', () => {
    renderer.addHealNumber(0, 0, 0, 50);
    const sprite = scene.getObjectByName('display-string') as THREE.Sprite;
    expect(sprite.userData.displayStringType).toBe('heal');
  });

  it('cash numbers use cash type', () => {
    renderer.addCashNumber(0, 0, 0, 100);
    const sprite = scene.getObjectByName('display-string') as THREE.Sprite;
    expect(sprite.userData.displayStringType).toBe('cash');
  });

  it('fades sprite opacity over lifetime', () => {
    const now = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(now);

    renderer.addDamageNumber(0, 5, 0, 30);

    // Halfway through the 1500ms lifetime.
    vi.spyOn(performance, 'now').mockReturnValue(now + 750);
    renderer.update();

    const sprite = scene.getObjectByName('display-string') as THREE.Sprite;
    const material = sprite.material as THREE.SpriteMaterial;
    expect(material.opacity).toBeCloseTo(0.5, 1);
  });

  it('sprite material is transparent with no depth test', () => {
    renderer.addDamageNumber(0, 0, 0, 10);
    const sprite = scene.getObjectByName('display-string') as THREE.Sprite;
    const material = sprite.material as THREE.SpriteMaterial;
    expect(material.transparent).toBe(true);
    expect(material.depthTest).toBe(false);
  });

  it('multiple types can coexist', () => {
    renderer.addDamageNumber(0, 0, 0, 10);
    renderer.addHealNumber(1, 0, 0, 20);
    renderer.addCashNumber(2, 0, 0, 30);
    expect(renderer.getActiveStringCount()).toBe(3);

    const sprites = scene.children.filter((c) => c.name === 'display-string');
    expect(sprites.length).toBe(3);

    const types = sprites.map((s) => s.userData.displayStringType);
    expect(types).toContain('damage');
    expect(types).toContain('heal');
    expect(types).toContain('cash');
  });

  it('update with explicit dt moves sprite by expected amount', () => {
    const now = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(now);

    renderer.addDamageNumber(0, 10, 0, 25);
    const sprite = scene.getObjectByName('display-string') as THREE.Sprite;

    // Advance 16ms so elapsed < lifetime (sprite stays alive).
    vi.spyOn(performance, 'now').mockReturnValue(now + 16);

    // Pass explicit dt=1.0 second — should rise 1.5 units (riseSpeed).
    renderer.update(1.0);
    expect(sprite.position.y).toBeCloseTo(11.5, 1);
  });
});
