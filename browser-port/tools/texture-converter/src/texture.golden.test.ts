/**
 * Golden fixture tests for texture converters (TGA + DDS).
 *
 * Builds realistic texture data and verifies:
 *  - Full decode pipeline produces correct pixel values
 *  - All supported TGA pixel depths work
 *  - All DXT formats decode correctly
 *  - Unsupported formats produce clear error messages
 *  - Edge cases: 1x1, non-power-of-two dimensions
 */

import { describe, it, expect } from 'vitest';
import { TgaDecoder } from './TgaDecoder.js';
import { DdsDecoder } from './DdsDecoder.js';

// ---------------------------------------------------------------------------
// TGA helpers
// ---------------------------------------------------------------------------

function buildTga(opts: {
  width: number;
  height: number;
  depth: 8 | 16 | 24 | 32;
  imageType?: number;
  topLeft?: boolean;
  pixelData: Uint8Array;
}): ArrayBuffer {
  const { width, height, depth, imageType = 2, topLeft = false, pixelData } = opts;
  const headerSize = 18;
  const buf = new ArrayBuffer(headerSize + pixelData.byteLength);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  view.setUint8(0, 0); // ID length
  view.setUint8(1, 0); // Color map type
  view.setUint8(2, imageType);
  // Color map spec (5 bytes) = 0
  view.setUint16(12, width, true);
  view.setUint16(14, height, true);
  view.setUint8(16, depth);
  view.setUint8(17, topLeft ? 0x20 : 0); // Image descriptor

  bytes.set(pixelData, headerSize);
  return buf;
}

function buildDds(opts: {
  width: number;
  height: number;
  fourCC: string;
  data: Uint8Array;
}): ArrayBuffer {
  const { width, height, fourCC, data } = opts;
  const headerSize = 128; // 4 (magic) + 124 (header)
  const buf = new ArrayBuffer(headerSize + data.byteLength);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Magic
  view.setUint32(0, 0x20534444, true); // "DDS "
  // Header size
  view.setUint32(4, 124, true);
  // Flags
  view.setUint32(8, 0x000a1007, true);
  // Height, Width
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  // Pitch or linear size
  view.setUint32(20, 0, true);
  // Pixel format at offset 76
  // pfSize
  view.setUint32(76, 32, true);
  // pfFlags (DDPF_FOURCC)
  view.setUint32(80, 0x04, true);
  // FourCC at offset 84
  for (let i = 0; i < 4; i++) {
    bytes[84 + i] = fourCC.charCodeAt(i);
  }

  bytes.set(data, headerSize);
  return buf;
}

// ---------------------------------------------------------------------------
// TGA Golden Tests
// ---------------------------------------------------------------------------

describe('TGA golden fixtures', () => {
  it('decodes a 4x4 32-bit BGRA image with correct pixel values', () => {
    const w = 4, h = 4;
    const pixels = new Uint8Array(w * h * 4);
    // Fill with a pattern: each pixel = (B=row*30, G=col*50, R=row*col*10, A=200+row)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        pixels[i] = (y * 30) & 0xff;     // B
        pixels[i + 1] = (x * 50) & 0xff; // G
        pixels[i + 2] = (y * x * 10) & 0xff; // R
        pixels[i + 3] = (200 + y) & 0xff;    // A
      }
    }

    const tga = buildTga({ width: w, height: h, depth: 32, pixelData: pixels, topLeft: true });
    const result = TgaDecoder.decode(tga);

    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.data.length).toBe(4 * 4 * 4);

    // Verify first pixel: B=0, G=0, R=0, A=200 → RGBA: R=0, G=0, B=0, A=200
    expect(result.data[0]).toBe(0);   // R
    expect(result.data[1]).toBe(0);   // G
    expect(result.data[2]).toBe(0);   // B
    expect(result.data[3]).toBe(200); // A

    // Verify pixel at (2, 1): B=30, G=100, R=20, A=201 → RGBA: R=20, G=100, B=30, A=201
    const px = (1 * w + 2) * 4;
    expect(result.data[px]).toBe(20);    // R
    expect(result.data[px + 1]).toBe(100); // G
    expect(result.data[px + 2]).toBe(30);  // B
    expect(result.data[px + 3]).toBe(201); // A
  });

  it('decodes a 24-bit BGR image with vertical flip (bottom-left origin)', () => {
    const w = 2, h = 2;
    // Bottom-to-top order in TGA: row0 = bottom, row1 = top
    const pixels = new Uint8Array([
      // Bottom row (y=1 in output): pixel (0,1) then (1,1)
      10, 20, 30,   40, 50, 60,
      // Top row (y=0 in output): pixel (0,0) then (1,0)
      70, 80, 90,  100, 110, 120,
    ]);

    const tga = buildTga({ width: w, height: h, depth: 24, pixelData: pixels });
    const result = TgaDecoder.decode(tga);

    // After vertical flip, top row should be the second TGA row
    // Pixel (0,0) in output = TGA row1 pixel0 = B=70, G=80, R=90
    expect(result.data[0]).toBe(90);  // R
    expect(result.data[1]).toBe(80);  // G
    expect(result.data[2]).toBe(70);  // B
    expect(result.data[3]).toBe(255); // A (opaque for 24-bit)

    // Pixel (0,1) in output = TGA row0 pixel0 = B=10, G=20, R=30
    const px = (1 * w + 0) * 4;
    expect(result.data[px]).toBe(30);
    expect(result.data[px + 1]).toBe(20);
    expect(result.data[px + 2]).toBe(10);
    expect(result.data[px + 3]).toBe(255);
  });

  it('decodes an 8-bit grayscale image', () => {
    const w = 3, h = 2;
    const pixels = new Uint8Array([0, 128, 255, 64, 192, 32]);

    const tga = buildTga({ width: w, height: h, depth: 8, imageType: 3, pixelData: pixels, topLeft: true });
    const result = TgaDecoder.decode(tga);

    expect(result.width).toBe(3);
    expect(result.height).toBe(2);

    // First pixel: gray 0 → RGBA (0, 0, 0, 255)
    expect(result.data[0]).toBe(0);
    expect(result.data[3]).toBe(255);

    // Second pixel: gray 128
    expect(result.data[4]).toBe(128);

    // Third pixel: gray 255
    expect(result.data[8]).toBe(255);
  });

  it('decodes an RLE-compressed 24-bit image', () => {
    const w = 4, h = 1;
    // RLE data: 2 repeated pixels + 2 raw pixels
    const rleData = new Uint8Array([
      0x81,           // RLE run of 2 pixels
      10, 20, 30,     // BGR pixel repeated 2x
      0x01,           // Raw run of 2 pixels
      40, 50, 60,     // First raw pixel
      70, 80, 90,     // Second raw pixel
    ]);

    const tga = buildTga({ width: w, height: h, depth: 24, imageType: 10, pixelData: rleData, topLeft: true });
    const result = TgaDecoder.decode(tga);

    // Pixel 0: B=10, G=20, R=30 → RGBA (30, 20, 10, 255)
    expect(result.data[0]).toBe(30);
    expect(result.data[1]).toBe(20);
    expect(result.data[2]).toBe(10);
    // Pixel 1: same (RLE repeat)
    expect(result.data[4]).toBe(30);
    // Pixel 2: B=40, G=50, R=60
    expect(result.data[8]).toBe(60);
    // Pixel 3: B=70, G=80, R=90
    expect(result.data[12]).toBe(90);
  });

  it('decodes a 1x1 minimum size TGA', () => {
    const tga = buildTga({
      width: 1, height: 1, depth: 32,
      pixelData: new Uint8Array([100, 150, 200, 255]), // BGRA
      topLeft: true,
    });
    const result = TgaDecoder.decode(tga);

    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(result.data[0]).toBe(200); // R
    expect(result.data[1]).toBe(150); // G
    expect(result.data[2]).toBe(100); // B
    expect(result.data[3]).toBe(255); // A
  });

  it('throws clear error for unsupported TGA image type', () => {
    const tga = buildTga({
      width: 2, height: 2, depth: 24,
      imageType: 1, // color-mapped, unsupported
      pixelData: new Uint8Array(12),
    });

    expect(() => TgaDecoder.decode(tga)).toThrow(/Unsupported image type 1/);
  });
});

// ---------------------------------------------------------------------------
// DDS Golden Tests
// ---------------------------------------------------------------------------

describe('DDS golden fixtures', () => {
  it('decodes a 4x4 DXT1 texture with known color values', () => {
    // Single 4x4 block: 8 bytes
    // Color0 = RGB565(31, 0, 0) = pure red = 0xF800
    // Color1 = RGB565(0, 0, 31) = pure blue = 0x001F
    // All pixels use index 0 (color0 = red)
    const blockData = new Uint8Array([
      0x00, 0xF8, // color0 (little-endian)
      0x1F, 0x00, // color1 (little-endian)
      0x00, 0x00, 0x00, 0x00, // all indices = 0 (color0)
    ]);

    const dds = buildDds({ width: 4, height: 4, fourCC: 'DXT1', data: blockData });
    const result = DdsDecoder.decode(dds);

    expect(result.width).toBe(4);
    expect(result.height).toBe(4);

    // All 16 pixels should be red (R=255, G=0, B=0, A=255)
    for (let i = 0; i < 16; i++) {
      expect(result.data[i * 4]).toBe(255);     // R
      expect(result.data[i * 4 + 1]).toBe(0);   // G
      expect(result.data[i * 4 + 2]).toBe(0);   // B
      expect(result.data[i * 4 + 3]).toBe(255); // A
    }
  });

  it('decodes DXT1 transparent mode (c0 <= c1)', () => {
    // Color0 < Color1 triggers 3-color + transparent mode
    // Color0 = 0x001F (blue), Color1 = 0xF800 (red)
    // Index 3 = transparent black
    const blockData = new Uint8Array([
      0x1F, 0x00, // color0 = blue (smaller)
      0x00, 0xF8, // color1 = red (larger)
      0xFF, 0xFF, 0xFF, 0xFF, // all indices = 3 (transparent)
    ]);

    const dds = buildDds({ width: 4, height: 4, fourCC: 'DXT1', data: blockData });
    const result = DdsDecoder.decode(dds);

    // All pixels should be transparent black
    for (let i = 0; i < 16; i++) {
      expect(result.data[i * 4]).toBe(0);     // R
      expect(result.data[i * 4 + 1]).toBe(0); // G
      expect(result.data[i * 4 + 2]).toBe(0); // B
      expect(result.data[i * 4 + 3]).toBe(0); // A (transparent)
    }
  });

  it('decodes a 4x4 DXT5 texture with interpolated alpha', () => {
    // DXT5 block = 16 bytes: 8 alpha + 8 color
    // Alpha0 = 200, Alpha1 = 100
    // Since Alpha0 > Alpha1, 8-alpha interpolation mode
    // All alpha indices = 0 (alpha0 = 200)
    const blockData = new Uint8Array([
      200, 100,                 // alpha0, alpha1
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // all alpha indices = 0
      0x00, 0xF8,               // color0 = red
      0x1F, 0x00,               // color1 = blue
      0x00, 0x00, 0x00, 0x00,   // all color indices = 0 (color0)
    ]);

    const dds = buildDds({ width: 4, height: 4, fourCC: 'DXT5', data: blockData });
    const result = DdsDecoder.decode(dds);

    // All pixels should be red with alpha 200
    for (let i = 0; i < 16; i++) {
      expect(result.data[i * 4]).toBe(255);     // R
      expect(result.data[i * 4 + 3]).toBe(200); // A
    }
  });

  it('throws clear error for unsupported DDS format', () => {
    const dds = buildDds({
      width: 4, height: 4,
      fourCC: 'BC7\0',
      data: new Uint8Array(16),
    });

    expect(() => DdsDecoder.decode(dds)).toThrow(/Unsupported format.*BC7/);
  });

  it('throws error for invalid DDS magic', () => {
    const buf = new ArrayBuffer(128);
    expect(() => DdsDecoder.decode(buf)).toThrow(/Invalid magic/);
  });
});
