/**
 * 3D vector — ported from WWMath Vector3 / Coord3D.
 *
 * Primary coordinate type for world-space positions, directions, velocities.
 * In the original engine, Coord3D has {x, y, z} where:
 *   x = east/west, y = north/south, z = up/down (height).
 */
export class Vector3 {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0,
  ) {}

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v: Readonly<Vector3>): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  add(v: Readonly<Vector3>): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  sub(v: Readonly<Vector3>): this {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  dot(v: Readonly<Vector3>): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v: Readonly<Vector3>): Vector3 {
    return new Vector3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x,
    );
  }

  crossInPlace(v: Readonly<Vector3>): this {
    const cx = this.y * v.z - this.z * v.y;
    const cy = this.z * v.x - this.x * v.z;
    const cz = this.x * v.y - this.y * v.x;
    this.x = cx;
    this.y = cy;
    this.z = cz;
    return this;
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  normalize(): this {
    const len = this.length();
    if (len > 0) {
      const invLen = 1 / len;
      this.x *= invLen;
      this.y *= invLen;
      this.z *= invLen;
    }
    return this;
  }

  negate(): this {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  distanceTo(v: Readonly<Vector3>): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  distanceToSq(v: Readonly<Vector3>): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }

  /** 2D distance ignoring z (height). Useful for ground-plane calculations. */
  distanceTo2D(v: Readonly<Vector3>): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  lerp(v: Readonly<Vector3>, t: number): this {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    this.z += (v.z - this.z) * t;
    return this;
  }

  equals(v: Readonly<Vector3>, epsilon = 1e-6): boolean {
    return (
      Math.abs(this.x - v.x) < epsilon &&
      Math.abs(this.y - v.y) < epsilon &&
      Math.abs(this.z - v.z) < epsilon
    );
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  static fromArray(arr: readonly [number, number, number]): Vector3 {
    return new Vector3(arr[0], arr[1], arr[2]);
  }

  static add(a: Readonly<Vector3>, b: Readonly<Vector3>): Vector3 {
    return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
  }

  static sub(a: Readonly<Vector3>, b: Readonly<Vector3>): Vector3 {
    return new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  static cross(a: Readonly<Vector3>, b: Readonly<Vector3>): Vector3 {
    return new Vector3(
      a.y * b.z - a.z * b.y,
      a.z * b.x - a.x * b.z,
      a.x * b.y - a.y * b.x,
    );
  }

  static readonly ZERO = Object.freeze(new Vector3(0, 0, 0));
  static readonly ONE = Object.freeze(new Vector3(1, 1, 1));
  static readonly UNIT_X = Object.freeze(new Vector3(1, 0, 0));
  static readonly UNIT_Y = Object.freeze(new Vector3(0, 1, 0));
  static readonly UNIT_Z = Object.freeze(new Vector3(0, 0, 1));
}
