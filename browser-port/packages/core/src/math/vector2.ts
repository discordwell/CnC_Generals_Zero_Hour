/**
 * 2D vector — ported from WWMath Vector2 / Coord2D.
 *
 * Used for screen coordinates, 2D map positions, UV coordinates, etc.
 */
export class Vector2 {
  constructor(
    public x: number = 0,
    public y: number = 0,
  ) {}

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(v: Readonly<Vector2>): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  add(v: Readonly<Vector2>): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v: Readonly<Vector2>): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  dot(v: Readonly<Vector2>): number {
    return this.x * v.x + this.y * v.y;
  }

  /** Returns the z-component of the cross product (scalar in 2D). */
  cross(v: Readonly<Vector2>): number {
    return this.x * v.y - this.y * v.x;
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  normalize(): this {
    const len = this.length();
    if (len > 0) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  distanceTo(v: Readonly<Vector2>): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  distanceToSq(v: Readonly<Vector2>): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  lerp(v: Readonly<Vector2>, t: number): this {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    return this;
  }

  equals(v: Readonly<Vector2>, epsilon = 1e-6): boolean {
    return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon;
  }

  toArray(): [number, number] {
    return [this.x, this.y];
  }

  static fromArray(arr: readonly [number, number]): Vector2 {
    return new Vector2(arr[0], arr[1]);
  }

  static add(a: Readonly<Vector2>, b: Readonly<Vector2>): Vector2 {
    return new Vector2(a.x + b.x, a.y + b.y);
  }

  static sub(a: Readonly<Vector2>, b: Readonly<Vector2>): Vector2 {
    return new Vector2(a.x - b.x, a.y - b.y);
  }

  static readonly ZERO = Object.freeze(new Vector2(0, 0));
  static readonly ONE = Object.freeze(new Vector2(1, 1));
  static readonly UNIT_X = Object.freeze(new Vector2(1, 0));
  static readonly UNIT_Y = Object.freeze(new Vector2(0, 1));
}
