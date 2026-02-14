import { describe, it, expect } from 'vitest';
import { Vector3 } from './vector3.js';

describe('Vector3', () => {
  it('constructs with default values', () => {
    const v = new Vector3();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('constructs with given values', () => {
    const v = new Vector3(1, 2, 3);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });

  it('adds vectors', () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(4, 5, 6);
    a.add(b);
    expect(a.x).toBe(5);
    expect(a.y).toBe(7);
    expect(a.z).toBe(9);
  });

  it('subtracts vectors', () => {
    const a = new Vector3(5, 7, 9);
    const b = new Vector3(1, 2, 3);
    a.sub(b);
    expect(a.x).toBe(4);
    expect(a.y).toBe(5);
    expect(a.z).toBe(6);
  });

  it('computes dot product', () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(4, 5, 6);
    expect(a.dot(b)).toBe(32); // 4 + 10 + 18
  });

  it('computes cross product', () => {
    const a = new Vector3(1, 0, 0);
    const b = new Vector3(0, 1, 0);
    const c = a.cross(b);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
    expect(c.z).toBe(1);
  });

  it('computes length', () => {
    const v = new Vector3(3, 4, 0);
    expect(v.length()).toBe(5);
  });

  it('normalizes', () => {
    const v = new Vector3(0, 0, 5);
    v.normalize();
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(1);
  });

  it('computes distance', () => {
    const a = new Vector3(1, 0, 0);
    const b = new Vector3(4, 0, 0);
    expect(a.distanceTo(b)).toBe(3);
  });

  it('computes 2D distance (ignoring z)', () => {
    const a = new Vector3(0, 0, 100);
    const b = new Vector3(3, 4, 200);
    expect(a.distanceTo2D(b)).toBe(5);
  });

  it('lerps between vectors', () => {
    const a = new Vector3(0, 0, 0);
    const b = new Vector3(10, 20, 30);
    a.lerp(b, 0.5);
    expect(a.x).toBe(5);
    expect(a.y).toBe(10);
    expect(a.z).toBe(15);
  });

  it('clones correctly', () => {
    const a = new Vector3(1, 2, 3);
    const b = a.clone();
    b.x = 99;
    expect(a.x).toBe(1); // original unchanged
    expect(b.x).toBe(99);
  });

  it('static add creates new vector', () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(4, 5, 6);
    const c = Vector3.add(a, b);
    expect(c.x).toBe(5);
    expect(c.y).toBe(7);
    expect(c.z).toBe(9);
    // originals unchanged
    expect(a.x).toBe(1);
    expect(b.x).toBe(4);
  });

  it('static constants are frozen', () => {
    expect(Object.isFrozen(Vector3.ZERO)).toBe(true);
    expect(Vector3.ZERO.x).toBe(0);
    expect(Vector3.UNIT_X.x).toBe(1);
  });
});
