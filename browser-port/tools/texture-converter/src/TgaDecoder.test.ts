import { describe, it, expect } from 'vitest';
import { TgaDecoder } from './TgaDecoder.js';

// ---------------------------------------------------------------------------
// Helper: build a minimal TGA buffer from parts
// ---------------------------------------------------------------------------

function buildTgaBuffer(opts: {
  imageType: number;
  width: number;
  height: number;
  pixelDepth: number;
  topLeftOrigin?: boolean;
  pixelData: Uint8Array;
}): ArrayBuffer {
  const header = new Uint8Array(18);
  const view = new DataView(header.buffer);

  header[0] = 0; // idLength
  header[1] = 0; // colorMapType
  header[2] = opts.imageType;
  // Bytes 3-7: color map (all zeros)
  // Bytes 8-11: x/y origin (zeros)
  view.setUint16(12, opts.width, true);
  view.setUint16(14, opts.height, true);
  header[16] = opts.pixelDepth;
  header[17] = opts.topLeftOrigin ? 0x20 : 0x00;

  const result = new Uint8Array(header.length + opts.pixelData.length);
  result.set(header, 0);
  result.set(opts.pixelData, header.length);
  return result.buffer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TgaDecoder', () => {
  it('decodes 24-bit uncompressed 2x2 image (bottom-left origin)', () => {
    // 2x2 image, 24-bit BGR, bottom-left origin (default).
    // Bottom row (pixels 0,1 in file) then top row (pixels 2,3 in file).
    // Pixel layout in file (bottom-left origin):
    //   row0 (bottom): pixel(0,1), pixel(1,1)
    //   row1 (top):    pixel(0,0), pixel(1,0)
    const pixelData = new Uint8Array([
      // Row 0 (bottom row in image): two pixels in BGR
      0x00, 0x00, 0xff,   // pixel (0,1): B=0, G=0, R=255 -> red
      0x00, 0xff, 0x00,   // pixel (1,1): B=0, G=255, R=0 -> green
      // Row 1 (top row in image): two pixels in BGR
      0xff, 0x00, 0x00,   // pixel (0,0): B=255, G=0, R=0 -> blue
      0xff, 0xff, 0xff,   // pixel (1,0): B=255, G=255, R=255 -> white
    ]);

    const buf = buildTgaBuffer({
      imageType: 2,
      width: 2,
      height: 2,
      pixelDepth: 24,
      topLeftOrigin: false,
      pixelData,
    });

    const img = TgaDecoder.decode(buf);

    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(img.data.length).toBe(2 * 2 * 4);

    // After flipping, top row should be row1 from file, bottom row = row0 from file.
    // Top-left pixel (0,0) = blue
    expect(img.data[0]).toBe(0);    // R
    expect(img.data[1]).toBe(0);    // G
    expect(img.data[2]).toBe(255);  // B
    expect(img.data[3]).toBe(255);  // A

    // Top-right pixel (1,0) = white
    expect(img.data[4]).toBe(255);
    expect(img.data[5]).toBe(255);
    expect(img.data[6]).toBe(255);
    expect(img.data[7]).toBe(255);

    // Bottom-left pixel (0,1) = red
    expect(img.data[8]).toBe(255);  // R
    expect(img.data[9]).toBe(0);    // G
    expect(img.data[10]).toBe(0);   // B
    expect(img.data[11]).toBe(255); // A

    // Bottom-right pixel (1,1) = green
    expect(img.data[12]).toBe(0);
    expect(img.data[13]).toBe(255);
    expect(img.data[14]).toBe(0);
    expect(img.data[15]).toBe(255);
  });

  it('decodes 32-bit uncompressed with alpha (top-left origin)', () => {
    // 2x2 image, 32-bit BGRA, top-left origin (no flip needed).
    const pixelData = new Uint8Array([
      // Row 0 (top): two pixels in BGRA
      0x00, 0x00, 0xff, 0x80,   // pixel (0,0): R=255, G=0, B=0, A=128
      0x00, 0xff, 0x00, 0xff,   // pixel (1,0): R=0, G=255, B=0, A=255
      // Row 1 (bottom): two pixels in BGRA
      0xff, 0x00, 0x00, 0x40,   // pixel (0,1): R=0, G=0, B=255, A=64
      0x80, 0x80, 0x80, 0xc0,   // pixel (1,1): R=128, G=128, B=128, A=192
    ]);

    const buf = buildTgaBuffer({
      imageType: 2,
      width: 2,
      height: 2,
      pixelDepth: 32,
      topLeftOrigin: true,
      pixelData,
    });

    const img = TgaDecoder.decode(buf);

    expect(img.width).toBe(2);
    expect(img.height).toBe(2);

    // (0,0) = R=255, G=0, B=0, A=128
    expect(img.data[0]).toBe(255);
    expect(img.data[1]).toBe(0);
    expect(img.data[2]).toBe(0);
    expect(img.data[3]).toBe(128);

    // (1,0) = R=0, G=255, B=0, A=255
    expect(img.data[4]).toBe(0);
    expect(img.data[5]).toBe(255);
    expect(img.data[6]).toBe(0);
    expect(img.data[7]).toBe(255);

    // (0,1) = R=0, G=0, B=255, A=64
    expect(img.data[8]).toBe(0);
    expect(img.data[9]).toBe(0);
    expect(img.data[10]).toBe(255);
    expect(img.data[11]).toBe(64);

    // (1,1) = R=128, G=128, B=128, A=192
    expect(img.data[12]).toBe(128);
    expect(img.data[13]).toBe(128);
    expect(img.data[14]).toBe(128);
    expect(img.data[15]).toBe(192);
  });

  it('decodes RLE-compressed image', () => {
    // 4x1 image, 24-bit, RLE, top-left origin.
    // RLE packet: repeat red pixel 3 times, then raw packet: 1 green pixel.
    const rleData = new Uint8Array([
      // RLE packet: bit7=1, count-1=2 => repeat 3 times
      0x82,
      0x00, 0x00, 0xff,  // BGR: red pixel
      // Raw packet: bit7=0, count-1=0 => 1 raw pixel
      0x00,
      0x00, 0xff, 0x00,  // BGR: green pixel
    ]);

    const buf = buildTgaBuffer({
      imageType: 10,
      width: 4,
      height: 1,
      pixelDepth: 24,
      topLeftOrigin: true,
      pixelData: rleData,
    });

    const img = TgaDecoder.decode(buf);

    expect(img.width).toBe(4);
    expect(img.height).toBe(1);
    expect(img.data.length).toBe(4 * 1 * 4);

    // Pixels 0-2 = red
    for (let i = 0; i < 3; i++) {
      expect(img.data[i * 4]).toBe(255);      // R
      expect(img.data[i * 4 + 1]).toBe(0);    // G
      expect(img.data[i * 4 + 2]).toBe(0);    // B
      expect(img.data[i * 4 + 3]).toBe(255);  // A
    }

    // Pixel 3 = green
    expect(img.data[12]).toBe(0);
    expect(img.data[13]).toBe(255);
    expect(img.data[14]).toBe(0);
    expect(img.data[15]).toBe(255);
  });

  it('correctly flips bottom-left origin image', () => {
    // 1x3 image (1 column, 3 rows), 24-bit, bottom-left origin.
    // File order: bottom row first.
    const pixelData = new Uint8Array([
      0x00, 0x00, 0xff,  // bottom row pixel -> R=255 (red)
      0x00, 0xff, 0x00,  // middle row pixel -> G=255 (green)
      0xff, 0x00, 0x00,  // top row pixel    -> B=255 (blue)
    ]);

    const buf = buildTgaBuffer({
      imageType: 2,
      width: 1,
      height: 3,
      pixelDepth: 24,
      topLeftOrigin: false,
      pixelData,
    });

    const img = TgaDecoder.decode(buf);

    // After flip: top row = blue, middle = green, bottom = red
    // Top pixel (row 0): blue
    expect(img.data[0]).toBe(0);
    expect(img.data[1]).toBe(0);
    expect(img.data[2]).toBe(255);
    expect(img.data[3]).toBe(255);

    // Middle pixel (row 1): green
    expect(img.data[4]).toBe(0);
    expect(img.data[5]).toBe(255);
    expect(img.data[6]).toBe(0);
    expect(img.data[7]).toBe(255);

    // Bottom pixel (row 2): red
    expect(img.data[8]).toBe(255);
    expect(img.data[9]).toBe(0);
    expect(img.data[10]).toBe(0);
    expect(img.data[11]).toBe(255);
  });

  it('does not flip top-left origin image', () => {
    // 1x2 image, 24-bit, top-left origin.
    const pixelData = new Uint8Array([
      0x00, 0x00, 0xff,  // row 0 (top): red
      0x00, 0xff, 0x00,  // row 1 (bottom): green
    ]);

    const buf = buildTgaBuffer({
      imageType: 2,
      width: 1,
      height: 2,
      pixelDepth: 24,
      topLeftOrigin: true,
      pixelData,
    });

    const img = TgaDecoder.decode(buf);

    // No flip — row 0 stays red, row 1 stays green
    expect(img.data[0]).toBe(255);  // R
    expect(img.data[1]).toBe(0);
    expect(img.data[2]).toBe(0);
    expect(img.data[3]).toBe(255);

    expect(img.data[4]).toBe(0);
    expect(img.data[5]).toBe(255);  // G
    expect(img.data[6]).toBe(0);
    expect(img.data[7]).toBe(255);
  });

  it('rejects buffer too small for header', () => {
    expect(() => TgaDecoder.decode(new ArrayBuffer(10))).toThrow('Buffer too small');
  });

  it('rejects unsupported image type', () => {
    const buf = buildTgaBuffer({
      imageType: 9, // RLE color-mapped — not supported
      width: 1,
      height: 1,
      pixelDepth: 24,
      pixelData: new Uint8Array(3),
    });
    expect(() => TgaDecoder.decode(buf)).toThrow('Unsupported image type');
  });
});
