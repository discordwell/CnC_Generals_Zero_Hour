import { describe, it, expect } from 'vitest';
import { DdsDecoder } from './DdsDecoder.js';

// ---------------------------------------------------------------------------
// Helper: build a minimal valid DDS header
// ---------------------------------------------------------------------------

function buildDdsHeader(opts: {
  width: number;
  height: number;
  fourCC: string;
}): Uint8Array {
  const header = new Uint8Array(128);
  const view = new DataView(header.buffer);

  // Magic "DDS "
  view.setUint32(0, 0x20534444, true);
  // Header size = 124
  view.setUint32(4, 124, true);
  // Flags (DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT)
  view.setUint32(8, 0x1 | 0x2 | 0x4 | 0x1000, true);
  // Height
  view.setUint32(12, opts.height, true);
  // Width
  view.setUint32(16, opts.width, true);

  // Pixel format struct (starts at offset 76)
  // PF size = 32
  view.setUint32(76, 32, true);
  // PF flags: DDPF_FOURCC = 0x4
  view.setUint32(80, 0x4, true);
  // FourCC
  header[84] = opts.fourCC.charCodeAt(0);
  header[85] = opts.fourCC.charCodeAt(1);
  header[86] = opts.fourCC.charCodeAt(2);
  header[87] = opts.fourCC.charCodeAt(3);

  return header;
}

/**
 * Build a DXT1 block (8 bytes).
 * color0 and color1 are RGB565 values.
 * indices is a 4-element array of bytes, each containing 4 x 2-bit indices.
 */
function buildDxt1Block(
  color0: number,
  color1: number,
  indices: [number, number, number, number],
): Uint8Array {
  const block = new Uint8Array(8);
  block[0] = color0 & 0xff;
  block[1] = (color0 >> 8) & 0xff;
  block[2] = color1 & 0xff;
  block[3] = (color1 >> 8) & 0xff;
  block[4] = indices[0];
  block[5] = indices[1];
  block[6] = indices[2];
  block[7] = indices[3];
  return block;
}

/**
 * Encode an RGB color as RGB565.
 */
function rgb565(r: number, g: number, b: number): number {
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

/**
 * Decode RGB565 back to 8-bit (with the rounding artifacts).
 */
function decodeRgb565(value: number): [number, number, number] {
  const r5 = (value >> 11) & 0x1f;
  const g6 = (value >> 5) & 0x3f;
  const b5 = value & 0x1f;
  return [
    (r5 << 3) | (r5 >> 2),
    (g6 << 2) | (g6 >> 4),
    (b5 << 3) | (b5 >> 2),
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DdsDecoder', () => {
  describe('Header parsing', () => {
    it('rejects buffer too small', () => {
      expect(() => DdsDecoder.decode(new ArrayBuffer(64))).toThrow('Buffer too small');
    });

    it('rejects invalid magic', () => {
      const buf = new Uint8Array(128);
      const view = new DataView(buf.buffer);
      view.setUint32(0, 0x12345678, true);
      view.setUint32(4, 124, true);
      expect(() => DdsDecoder.decode(buf.buffer)).toThrow('Invalid magic');
    });

    it('rejects unsupported format', () => {
      const header = buildDdsHeader({ width: 4, height: 4, fourCC: 'BC7\0' });
      const data = new Uint8Array(header.length + 16);
      data.set(header, 0);
      expect(() => DdsDecoder.decode(data.buffer)).toThrow('Unsupported format');
    });
  });

  describe('DXT1', () => {
    it('decodes a single 4x4 block with all pixels using color0', () => {
      // Create a DXT1 block where all pixels use index 0 (color0).
      // color0 = pure red (RGB565)
      const c0 = rgb565(255, 0, 0);
      const c1 = rgb565(0, 0, 255);

      // All indices = 0 (all pixels = color0)
      const block = buildDxt1Block(c0, c1, [0x00, 0x00, 0x00, 0x00]);

      // Ensure c0 > c1 for 4-color mode
      expect(c0).toBeGreaterThan(c1);

      const header = buildDdsHeader({ width: 4, height: 4, fourCC: 'DXT1' });
      const fullBuf = new Uint8Array(header.length + block.length);
      fullBuf.set(header, 0);
      fullBuf.set(block, header.length);

      const img = DdsDecoder.decode(fullBuf.buffer);

      expect(img.width).toBe(4);
      expect(img.height).toBe(4);
      expect(img.data.length).toBe(4 * 4 * 4);

      const [expectedR, expectedG, expectedB] = decodeRgb565(c0);

      // All 16 pixels should be red-ish (with RGB565 rounding)
      for (let i = 0; i < 16; i++) {
        expect(img.data[i * 4]).toBe(expectedR);
        expect(img.data[i * 4 + 1]).toBe(expectedG);
        expect(img.data[i * 4 + 2]).toBe(expectedB);
        expect(img.data[i * 4 + 3]).toBe(255);
      }
    });

    it('decodes DXT1 with mixed indices', () => {
      const c0 = rgb565(255, 0, 0);
      const c1 = rgb565(0, 0, 255);

      // Row 0: all index 0 (color0 = red)
      // Row 1: all index 1 (color1 = blue)
      // Row 2: all index 2 (2/3 c0, 1/3 c1)
      // Row 3: all index 3 (1/3 c0, 2/3 c1)
      // Each row byte: 4 pixels x 2 bits = 8 bits
      // index 0 for all 4 pixels: 0b00_00_00_00 = 0x00
      // index 1 for all 4 pixels: 0b01_01_01_01 = 0x55
      // index 2 for all 4 pixels: 0b10_10_10_10 = 0xAA
      // index 3 for all 4 pixels: 0b11_11_11_11 = 0xFF
      const block = buildDxt1Block(c0, c1, [0x00, 0x55, 0xaa, 0xff]);

      const header = buildDdsHeader({ width: 4, height: 4, fourCC: 'DXT1' });
      const fullBuf = new Uint8Array(header.length + block.length);
      fullBuf.set(header, 0);
      fullBuf.set(block, header.length);

      const img = DdsDecoder.decode(fullBuf.buffer);

      const [r0, g0, b0] = decodeRgb565(c0);
      const [r1, g1, b1] = decodeRgb565(c1);

      // Row 0 should be color0
      expect(img.data[0]).toBe(r0);
      expect(img.data[1]).toBe(g0);
      expect(img.data[2]).toBe(b0);

      // Row 1 should be color1
      expect(img.data[4 * 4]).toBe(r1);
      expect(img.data[4 * 4 + 1]).toBe(g1);
      expect(img.data[4 * 4 + 2]).toBe(b1);

      // Row 2 should be 2/3 c0 + 1/3 c1
      const r2 = Math.round((2 * r0 + r1) / 3);
      const g2 = Math.round((2 * g0 + g1) / 3);
      const b2 = Math.round((2 * b0 + b1) / 3);
      expect(img.data[8 * 4]).toBe(r2);
      expect(img.data[8 * 4 + 1]).toBe(g2);
      expect(img.data[8 * 4 + 2]).toBe(b2);

      // Row 3 should be 1/3 c0 + 2/3 c1
      const r3 = Math.round((r0 + 2 * r1) / 3);
      const g3 = Math.round((g0 + 2 * g1) / 3);
      const b3 = Math.round((b0 + 2 * b1) / 3);
      expect(img.data[12 * 4]).toBe(r3);
      expect(img.data[12 * 4 + 1]).toBe(g3);
      expect(img.data[12 * 4 + 2]).toBe(b3);
    });

    it('decodes DXT1 transparent mode when c0 <= c1', () => {
      // Use c0 <= c1 to trigger 3-color + transparent mode
      const c0 = rgb565(0, 0, 255);  // small value
      const c1 = rgb565(255, 0, 0);  // large value
      expect(c0).toBeLessThanOrEqual(c1);

      // All pixels index 3 = transparent black
      const block = buildDxt1Block(c0, c1, [0xff, 0xff, 0xff, 0xff]);

      const header = buildDdsHeader({ width: 4, height: 4, fourCC: 'DXT1' });
      const fullBuf = new Uint8Array(header.length + block.length);
      fullBuf.set(header, 0);
      fullBuf.set(block, header.length);

      const img = DdsDecoder.decode(fullBuf.buffer);

      // All pixels should be transparent black
      for (let i = 0; i < 16; i++) {
        expect(img.data[i * 4]).toBe(0);
        expect(img.data[i * 4 + 1]).toBe(0);
        expect(img.data[i * 4 + 2]).toBe(0);
        expect(img.data[i * 4 + 3]).toBe(0);
      }
    });
  });

  describe('DXT5', () => {
    it('decodes a single 4x4 block', () => {
      // Build a DXT5 block:
      // - Alpha: alpha0=255, alpha1=0, all indices=0 => all alpha=255
      // - Color: solid red
      const c0 = rgb565(255, 0, 0);
      const c1 = rgb565(0, 0, 0);

      // Alpha bytes (8 bytes)
      const alphaBytes = new Uint8Array(8);
      alphaBytes[0] = 255;  // alpha0
      alphaBytes[1] = 0;    // alpha1
      // Bytes 2-7: 3-bit indices, all zero => all use alpha0=255
      // Already zero from initialization

      // Color block (8 bytes): all indices 0 = color0
      const colorBlock = buildDxt1Block(c0, c1, [0x00, 0x00, 0x00, 0x00]);

      // Assemble DXT5 block (16 bytes)
      const dxt5Block = new Uint8Array(16);
      dxt5Block.set(alphaBytes, 0);
      dxt5Block.set(colorBlock, 8);

      const header = buildDdsHeader({ width: 4, height: 4, fourCC: 'DXT5' });
      const fullBuf = new Uint8Array(header.length + dxt5Block.length);
      fullBuf.set(header, 0);
      fullBuf.set(dxt5Block, header.length);

      const img = DdsDecoder.decode(fullBuf.buffer);

      expect(img.width).toBe(4);
      expect(img.height).toBe(4);

      const [expectedR, expectedG, expectedB] = decodeRgb565(c0);

      for (let i = 0; i < 16; i++) {
        expect(img.data[i * 4]).toBe(expectedR);
        expect(img.data[i * 4 + 1]).toBe(expectedG);
        expect(img.data[i * 4 + 2]).toBe(expectedB);
        expect(img.data[i * 4 + 3]).toBe(255);
      }
    });

    it('decodes DXT5 with varying alpha', () => {
      // alpha0=200, alpha1=50 => 8-alpha interpolation mode (alpha0 > alpha1)
      // Index 0 => alpha=200, Index 1 => alpha=50
      const c0 = rgb565(128, 128, 128);
      const c1 = rgb565(0, 0, 0);

      const alphaBytes = new Uint8Array(8);
      alphaBytes[0] = 200;  // alpha0
      alphaBytes[1] = 50;   // alpha1

      // 48 bits of 3-bit indices. Let's make first pixel index=0, second=1,
      // rest=0. Indices are packed little-endian, 3 bits each.
      // pixel0 = index 0 (bits 0-2) = 0b000
      // pixel1 = index 1 (bits 3-5) = 0b001 => byte[0] = 0b00_001_000 = 0x08
      alphaBytes[2] = 0x08;
      // Remaining bytes all zero => index 0

      const colorBlock = buildDxt1Block(c0, c1, [0x00, 0x00, 0x00, 0x00]);
      const dxt5Block = new Uint8Array(16);
      dxt5Block.set(alphaBytes, 0);
      dxt5Block.set(colorBlock, 8);

      const header = buildDdsHeader({ width: 4, height: 4, fourCC: 'DXT5' });
      const fullBuf = new Uint8Array(header.length + dxt5Block.length);
      fullBuf.set(header, 0);
      fullBuf.set(dxt5Block, header.length);

      const img = DdsDecoder.decode(fullBuf.buffer);

      // Pixel 0: alpha index 0 => alpha = 200
      expect(img.data[3]).toBe(200);

      // Pixel 1: alpha index 1 => alpha = 50
      expect(img.data[7]).toBe(50);

      // Pixel 2: alpha index 0 => alpha = 200
      expect(img.data[11]).toBe(200);
    });
  });
});
