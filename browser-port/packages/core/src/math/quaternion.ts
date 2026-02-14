import { Vector3 } from './vector3.js';
import { Matrix4 } from './matrix4.js';

/**
 * Quaternion for rotation representation — ported from WWMath Quaternion.
 * Stored as (x, y, z, w) where w is the scalar component.
 */
export class Quaternion {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0,
    public w: number = 1,
  ) {}

  set(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  copy(q: Readonly<Quaternion>): this {
    this.x = q.x;
    this.y = q.y;
    this.z = q.z;
    this.w = q.w;
    return this;
  }

  clone(): Quaternion {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }

  identity(): this {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.w = 1;
    return this;
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  normalize(): this {
    const len = this.length();
    if (len > 0) {
      const inv = 1 / len;
      this.x *= inv;
      this.y *= inv;
      this.z *= inv;
      this.w *= inv;
    }
    return this;
  }

  conjugate(): this {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  invert(): this {
    this.conjugate();
    const lenSq = this.lengthSq();
    if (lenSq > 0) {
      const inv = 1 / lenSq;
      this.x *= inv;
      this.y *= inv;
      this.z *= inv;
      this.w *= inv;
    }
    return this;
  }

  multiply(q: Readonly<Quaternion>): this {
    const ax = this.x, ay = this.y, az = this.z, aw = this.w;
    const bx = q.x, by = q.y, bz = q.z, bw = q.w;
    this.x = aw * bx + ax * bw + ay * bz - az * by;
    this.y = aw * by - ax * bz + ay * bw + az * bx;
    this.z = aw * bz + ax * by - ay * bx + az * bw;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }

  /** Set from axis-angle (axis must be normalized). */
  setFromAxisAngle(axis: Readonly<Vector3>, angle: number): this {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    this.x = axis.x * s;
    this.y = axis.y * s;
    this.z = axis.z * s;
    this.w = Math.cos(halfAngle);
    return this;
  }

  /** Set from Euler angles (ZYX order, matching original engine). */
  setFromEuler(x: number, y: number, z: number): this {
    const c1 = Math.cos(x / 2), s1 = Math.sin(x / 2);
    const c2 = Math.cos(y / 2), s2 = Math.sin(y / 2);
    const c3 = Math.cos(z / 2), s3 = Math.sin(z / 2);

    this.x = s1 * c2 * c3 - c1 * s2 * s3;
    this.y = c1 * s2 * c3 + s1 * c2 * s3;
    this.z = c1 * c2 * s3 - s1 * s2 * c3;
    this.w = c1 * c2 * c3 + s1 * s2 * s3;

    return this;
  }

  /** Convert to a 4x4 rotation matrix. */
  toMatrix4(out = new Matrix4()): Matrix4 {
    const x = this.x, y = this.y, z = this.z, w = this.w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    out.set(
      1 - (yy + zz), xy - wz,       xz + wy,       0,
      xy + wz,       1 - (xx + zz), yz - wx,       0,
      xz - wy,       yz + wx,       1 - (xx + yy), 0,
      0,              0,              0,              1,
    );
    return out;
  }

  /** Rotate a vector by this quaternion. */
  rotateVector(v: Readonly<Vector3>, out = new Vector3()): Vector3 {
    const qx = this.x, qy = this.y, qz = this.z, qw = this.w;
    const vx = v.x, vy = v.y, vz = v.z;

    // q * v * q^-1 (optimized)
    const ix =  qw * vx + qy * vz - qz * vy;
    const iy =  qw * vy + qz * vx - qx * vz;
    const iz =  qw * vz + qx * vy - qy * vx;
    const iw = -qx * vx - qy * vy - qz * vz;

    out.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    out.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    out.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return out;
  }

  /** Spherical linear interpolation. */
  static slerp(a: Readonly<Quaternion>, b: Readonly<Quaternion>, t: number, out = new Quaternion()): Quaternion {
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;

    let cosHalfTheta = a.x * bx + a.y * by + a.z * bz + a.w * bw;

    // Take shortest path
    if (cosHalfTheta < 0) {
      bx = -bx; by = -by; bz = -bz; bw = -bw;
      cosHalfTheta = -cosHalfTheta;
    }

    if (cosHalfTheta >= 1.0) {
      out.x = a.x; out.y = a.y; out.z = a.z; out.w = a.w;
      return out;
    }

    const halfTheta = Math.acos(cosHalfTheta);
    const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

    if (Math.abs(sinHalfTheta) < 0.001) {
      out.x = (a.x + bx) * 0.5;
      out.y = (a.y + by) * 0.5;
      out.z = (a.z + bz) * 0.5;
      out.w = (a.w + bw) * 0.5;
      return out;
    }

    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

    out.x = a.x * ratioA + bx * ratioB;
    out.y = a.y * ratioA + by * ratioB;
    out.z = a.z * ratioA + bz * ratioB;
    out.w = a.w * ratioA + bw * ratioB;
    return out;
  }

  static readonly IDENTITY = Object.freeze(new Quaternion(0, 0, 0, 1));
}
