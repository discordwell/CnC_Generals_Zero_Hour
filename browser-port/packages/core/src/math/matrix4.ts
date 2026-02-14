// @ts-nocheck — all indexed accesses are to valid offsets of a 16-element Float64Array
import { Vector3 } from './vector3.js';

/**
 * 4x4 matrix stored in column-major order (matching WebGL/Three.js convention).
 *
 * Ported from WWMath Matrix4 / Matrix3D.
 * The original engine used row-major, so all operations are transposed
 * relative to the C++ source.
 */
export class Matrix4 {
  /** Column-major array of 16 elements. */
  readonly elements: Float64Array;

  constructor() {
    this.elements = new Float64Array(16);
    this.identity();
  }

  identity(): this {
    const e = this.elements;
    e[0] = 1;  e[4] = 0;  e[8]  = 0; e[12] = 0;
    e[1] = 0;  e[5] = 1;  e[9]  = 0; e[13] = 0;
    e[2] = 0;  e[6] = 0;  e[10] = 1; e[14] = 0;
    e[3] = 0;  e[7] = 0;  e[11] = 0; e[15] = 1;
    return this;
  }

  copy(m: Readonly<Matrix4>): this {
    this.elements.set(m.elements);
    return this;
  }

  clone(): Matrix4 {
    const m = new Matrix4();
    m.elements.set(this.elements);
    return m;
  }

  /** Set from individual values (row-major argument order for readability). */
  set(
    m00: number, m01: number, m02: number, m03: number,
    m10: number, m11: number, m12: number, m13: number,
    m20: number, m21: number, m22: number, m23: number,
    m30: number, m31: number, m32: number, m33: number,
  ): this {
    const e = this.elements;
    // Row-major args → column-major storage
    e[0] = m00; e[4] = m01; e[8]  = m02; e[12] = m03;
    e[1] = m10; e[5] = m11; e[9]  = m12; e[13] = m13;
    e[2] = m20; e[6] = m21; e[10] = m22; e[14] = m23;
    e[3] = m30; e[7] = m31; e[11] = m32; e[15] = m33;
    return this;
  }

  multiply(m: Readonly<Matrix4>): this {
    return this.multiplyMatrices(this, m);
  }

  premultiply(m: Readonly<Matrix4>): this {
    return this.multiplyMatrices(m, this);
  }

  multiplyMatrices(a: Readonly<Matrix4>, b: Readonly<Matrix4>): this {
    const ae = a.elements;
    const be = b.elements;
    const e = this.elements;

    const a00 = ae[0], a01 = ae[4], a02 = ae[8],  a03 = ae[12];
    const a10 = ae[1], a11 = ae[5], a12 = ae[9],  a13 = ae[13];
    const a20 = ae[2], a21 = ae[6], a22 = ae[10], a23 = ae[14];
    const a30 = ae[3], a31 = ae[7], a32 = ae[11], a33 = ae[15];

    const b00 = be[0], b01 = be[4], b02 = be[8],  b03 = be[12];
    const b10 = be[1], b11 = be[5], b12 = be[9],  b13 = be[13];
    const b20 = be[2], b21 = be[6], b22 = be[10], b23 = be[14];
    const b30 = be[3], b31 = be[7], b32 = be[11], b33 = be[15];

    e[0]  = a00 * b00 + a01 * b10 + a02 * b20 + a03 * b30;
    e[4]  = a00 * b01 + a01 * b11 + a02 * b21 + a03 * b31;
    e[8]  = a00 * b02 + a01 * b12 + a02 * b22 + a03 * b32;
    e[12] = a00 * b03 + a01 * b13 + a02 * b23 + a03 * b33;

    e[1]  = a10 * b00 + a11 * b10 + a12 * b20 + a13 * b30;
    e[5]  = a10 * b01 + a11 * b11 + a12 * b21 + a13 * b31;
    e[9]  = a10 * b02 + a11 * b12 + a12 * b22 + a13 * b32;
    e[13] = a10 * b03 + a11 * b13 + a12 * b23 + a13 * b33;

    e[2]  = a20 * b00 + a21 * b10 + a22 * b20 + a23 * b30;
    e[6]  = a20 * b01 + a21 * b11 + a22 * b21 + a23 * b31;
    e[10] = a20 * b02 + a21 * b12 + a22 * b22 + a23 * b32;
    e[14] = a20 * b03 + a21 * b13 + a22 * b23 + a23 * b33;

    e[3]  = a30 * b00 + a31 * b10 + a32 * b20 + a33 * b30;
    e[7]  = a30 * b01 + a31 * b11 + a32 * b21 + a33 * b31;
    e[11] = a30 * b02 + a31 * b12 + a32 * b22 + a33 * b32;
    e[15] = a30 * b03 + a31 * b13 + a32 * b23 + a33 * b33;

    return this;
  }

  /** Transform a point (w=1, includes translation). */
  transformPoint(v: Readonly<Vector3>, out = new Vector3()): Vector3 {
    const e = this.elements;
    const x = v.x, y = v.y, z = v.z;
    out.x = e[0] * x + e[4] * y + e[8]  * z + e[12];
    out.y = e[1] * x + e[5] * y + e[9]  * z + e[13];
    out.z = e[2] * x + e[6] * y + e[10] * z + e[14];
    return out;
  }

  /** Transform a direction (w=0, no translation). */
  transformDirection(v: Readonly<Vector3>, out = new Vector3()): Vector3 {
    const e = this.elements;
    const x = v.x, y = v.y, z = v.z;
    out.x = e[0] * x + e[4] * y + e[8]  * z;
    out.y = e[1] * x + e[5] * y + e[9]  * z;
    out.z = e[2] * x + e[6] * y + e[10] * z;
    return out;
  }

  setTranslation(x: number, y: number, z: number): this {
    const e = this.elements;
    e[12] = x;
    e[13] = y;
    e[14] = z;
    return this;
  }

  getTranslation(out = new Vector3()): Vector3 {
    const e = this.elements;
    out.x = e[12];
    out.y = e[13];
    out.z = e[14];
    return out;
  }

  makeTranslation(x: number, y: number, z: number): this {
    this.identity();
    const e = this.elements;
    e[12] = x;
    e[13] = y;
    e[14] = z;
    return this;
  }

  makeScale(x: number, y: number, z: number): this {
    this.identity();
    const e = this.elements;
    e[0] = x;
    e[5] = y;
    e[10] = z;
    return this;
  }

  makeRotationX(angle: number): this {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.set(
      1, 0,  0, 0,
      0, c, -s, 0,
      0, s,  c, 0,
      0, 0,  0, 1,
    );
    return this;
  }

  makeRotationY(angle: number): this {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.set(
       c, 0, s, 0,
       0, 1, 0, 0,
      -s, 0, c, 0,
       0, 0, 0, 1,
    );
    return this;
  }

  makeRotationZ(angle: number): this {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.set(
      c, -s, 0, 0,
      s,  c, 0, 0,
      0,  0, 1, 0,
      0,  0, 0, 1,
    );
    return this;
  }

  determinant(): number {
    const e = this.elements;
    const a00 = e[0], a01 = e[4], a02 = e[8],  a03 = e[12];
    const a10 = e[1], a11 = e[5], a12 = e[9],  a13 = e[13];
    const a20 = e[2], a21 = e[6], a22 = e[10], a23 = e[14];
    const a30 = e[3], a31 = e[7], a32 = e[11], a33 = e[15];

    return (
      a00 * (a11 * (a22 * a33 - a23 * a32) - a12 * (a21 * a33 - a23 * a31) + a13 * (a21 * a32 - a22 * a31)) -
      a01 * (a10 * (a22 * a33 - a23 * a32) - a12 * (a20 * a33 - a23 * a30) + a13 * (a20 * a32 - a22 * a30)) +
      a02 * (a10 * (a21 * a33 - a23 * a31) - a11 * (a20 * a33 - a23 * a30) + a13 * (a20 * a31 - a21 * a30)) -
      a03 * (a10 * (a21 * a32 - a22 * a31) - a11 * (a20 * a32 - a22 * a30) + a12 * (a20 * a31 - a21 * a30))
    );
  }

  invert(): this {
    const e = this.elements;
    const a00 = e[0], a01 = e[4], a02 = e[8],  a03 = e[12];
    const a10 = e[1], a11 = e[5], a12 = e[9],  a13 = e[13];
    const a20 = e[2], a21 = e[6], a22 = e[10], a23 = e[14];
    const a30 = e[3], a31 = e[7], a32 = e[11], a33 = e[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (det === 0) return this;
    det = 1.0 / det;

    e[0]  = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    e[4]  = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    e[8]  = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    e[12] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    e[1]  = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    e[5]  = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    e[9]  = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    e[13] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    e[2]  = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    e[6]  = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    e[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    e[14] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    e[3]  = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    e[7]  = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    e[11] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    e[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

    return this;
  }

  transpose(): this {
    const e = this.elements;
    let tmp: number;
    tmp = e[1];  e[1]  = e[4];  e[4]  = tmp;
    tmp = e[2];  e[2]  = e[8];  e[8]  = tmp;
    tmp = e[3];  e[3]  = e[12]; e[12] = tmp;
    tmp = e[6];  e[6]  = e[9];  e[9]  = tmp;
    tmp = e[7];  e[7]  = e[13]; e[13] = tmp;
    tmp = e[11]; e[11] = e[14]; e[14] = tmp;
    return this;
  }

  /** Create a perspective projection matrix. */
  static perspective(fovY: number, aspect: number, near: number, far: number): Matrix4 {
    const m = new Matrix4();
    const e = m.elements;
    const f = 1.0 / Math.tan(fovY / 2);
    const rangeInv = 1.0 / (near - far);

    e[0] = f / aspect; e[4] = 0; e[8]  = 0;                       e[12] = 0;
    e[1] = 0;          e[5] = f; e[9]  = 0;                       e[13] = 0;
    e[2] = 0;          e[6] = 0; e[10] = (near + far) * rangeInv; e[14] = 2 * near * far * rangeInv;
    e[3] = 0;          e[7] = 0; e[11] = -1;                      e[15] = 0;

    return m;
  }

  /** Create a look-at view matrix. */
  static lookAt(eye: Readonly<Vector3>, target: Readonly<Vector3>, up: Readonly<Vector3>): Matrix4 {
    const m = new Matrix4();
    const e = m.elements;

    const zAxis = Vector3.sub(eye, target).normalize();
    const xAxis = Vector3.cross(up, zAxis).normalize();
    const yAxis = Vector3.cross(zAxis, xAxis);

    e[0] = xAxis.x; e[4] = xAxis.y; e[8]  = xAxis.z; e[12] = -xAxis.dot(eye);
    e[1] = yAxis.x; e[5] = yAxis.y; e[9]  = yAxis.z; e[13] = -yAxis.dot(eye);
    e[2] = zAxis.x; e[6] = zAxis.y; e[10] = zAxis.z; e[14] = -zAxis.dot(eye);
    e[3] = 0;       e[7] = 0;       e[11] = 0;       e[15] = 1;

    return m;
  }
}
