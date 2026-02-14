/**
 * DDS (DirectDraw Surface) texture decoder.
 *
 * Supports DXT1, DXT3, and DXT5 compressed formats.
 * Only decodes the first mipmap level.
 */

import type { DecodedImage } from './TgaDecoder.js';

const DDS_MAGIC = 0x20534444; // "DDS "

export class DdsDecoder {
  static decode(buffer: ArrayBuffer): DecodedImage {
    const view = new DataView(buffer);

    if (buffer.byteLength < 128) {
      throw new Error('DDS: Buffer too small for header');
    }

    // --- Magic number ---
    const magic = view.getUint32(0, true);
    if (magic !== DDS_MAGIC) {
      throw new Error(`DDS: Invalid magic 0x${magic.toString(16)}, expected 0x${DDS_MAGIC.toString(16)}`);
    }

    // --- Main header (starts at byte 4) ---
    const headerSize = view.getUint32(4, true);
    if (headerSize !== 124) {
      throw new Error(`DDS: Unexpected header size ${headerSize}`);
    }

    const height = view.getUint32(12, true);
    const width = view.getUint32(16, true);

    if (width === 0 || height === 0) {
      throw new Error(`DDS: Invalid dimensions ${width}x${height}`);
    }

    // --- Pixel format (starts at byte 76, offset from start = 4 + 72 = 76) ---
    // Pixel format struct is at offset 76 within the file (byte 4 + 72 = 76)
    const pfFourCC = String.fromCharCode(
      view.getUint8(84),
      view.getUint8(85),
      view.getUint8(86),
      view.getUint8(87),
    );

    // Data starts after magic (4) + header (124) = 128
    const dataOffset = 128;
    const dataBytes = new Uint8Array(buffer, dataOffset);

    let rgba: Uint8Array;

    switch (pfFourCC) {
      case 'DXT1':
        rgba = decodeDXT1(dataBytes, width, height);
        break;
      case 'DXT3':
        rgba = decodeDXT3(dataBytes, width, height);
        break;
      case 'DXT5':
        rgba = decodeDXT5(dataBytes, width, height);
        break;
      default:
        throw new Error(`DDS: Unsupported format "${pfFourCC}"`);
    }

    return { width, height, data: rgba };
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Decode an RGB565 color to [R, G, B] (0-255 each). */
function rgb565(value: number): [number, number, number] {
  const r = (value >> 11) & 0x1f;
  const g = (value >> 5) & 0x3f;
  const b = value & 0x1f;
  return [
    (r << 3) | (r >> 2),
    (g << 2) | (g >> 4),
    (b << 3) | (b >> 2),
  ];
}

/**
 * Decode the color portion of a DXT block (bytes 0-7 for DXT1, or
 * the last 8 bytes for DXT3/DXT5).
 *
 * Returns a 4x4 grid of [R,G,B,A] values packed into a flat array (64 elements).
 * For DXT1, alpha is set according to the transparent-black rule.
 * For DXT3/DXT5 the caller will overwrite alpha after.
 */
function decodeColorBlock(
  src: Uint8Array,
  blockOffset: number,
  isDxt1: boolean,
): Uint8Array {
  const c0val = (src[blockOffset] ?? 0) | ((src[blockOffset + 1] ?? 0) << 8);
  const c1val = (src[blockOffset + 2] ?? 0) | ((src[blockOffset + 3] ?? 0) << 8);

  const c0 = rgb565(c0val);
  const c1 = rgb565(c1val);

  // Build the 4-color palette
  const palette = new Uint8Array(16); // 4 colors x 4 components (RGBA)

  // Color 0
  palette[0] = c0[0];
  palette[1] = c0[1];
  palette[2] = c0[2];
  palette[3] = 255;

  // Color 1
  palette[4] = c1[0];
  palette[5] = c1[1];
  palette[6] = c1[2];
  palette[7] = 255;

  if (!isDxt1 || c0val > c1val) {
    // 4-color mode: c2 = 2/3*c0 + 1/3*c1, c3 = 1/3*c0 + 2/3*c1
    palette[8]  = Math.round((2 * c0[0] + c1[0]) / 3);
    palette[9]  = Math.round((2 * c0[1] + c1[1]) / 3);
    palette[10] = Math.round((2 * c0[2] + c1[2]) / 3);
    palette[11] = 255;

    palette[12] = Math.round((c0[0] + 2 * c1[0]) / 3);
    palette[13] = Math.round((c0[1] + 2 * c1[1]) / 3);
    palette[14] = Math.round((c0[2] + 2 * c1[2]) / 3);
    palette[15] = 255;
  } else {
    // 3-color + transparent mode (DXT1 only)
    palette[8]  = Math.round((c0[0] + c1[0]) / 2);
    palette[9]  = Math.round((c0[1] + c1[1]) / 2);
    palette[10] = Math.round((c0[2] + c1[2]) / 2);
    palette[11] = 255;

    // Color 3 = transparent black
    palette[12] = 0;
    palette[13] = 0;
    palette[14] = 0;
    palette[15] = 0;
  }

  // Decode the 2-bit lookup indices (4 bytes, 16 pixels)
  const result = new Uint8Array(64); // 16 pixels * 4 components
  for (let row = 0; row < 4; row++) {
    const indexByte = src[blockOffset + 4 + row] ?? 0;
    for (let col = 0; col < 4; col++) {
      const idx = (indexByte >> (col * 2)) & 0x03;
      const pixelIdx = (row * 4 + col) * 4;
      const palIdx = idx * 4;
      result[pixelIdx] = palette[palIdx] ?? 0;
      result[pixelIdx + 1] = palette[palIdx + 1] ?? 0;
      result[pixelIdx + 2] = palette[palIdx + 2] ?? 0;
      result[pixelIdx + 3] = palette[palIdx + 3] ?? 0;
    }
  }

  return result;
}

/** Write a decoded 4x4 block into the output RGBA buffer. */
function writeBlock(
  rgba: Uint8Array,
  block: Uint8Array,
  imgWidth: number,
  blockX: number,
  blockY: number,
  imgHeight: number,
): void {
  for (let row = 0; row < 4; row++) {
    const py = blockY + row;
    if (py >= imgHeight) continue;
    for (let col = 0; col < 4; col++) {
      const px = blockX + col;
      if (px >= imgWidth) continue;
      const srcIdx = (row * 4 + col) * 4;
      const dstIdx = (py * imgWidth + px) * 4;
      rgba[dstIdx] = block[srcIdx] ?? 0;
      rgba[dstIdx + 1] = block[srcIdx + 1] ?? 0;
      rgba[dstIdx + 2] = block[srcIdx + 2] ?? 0;
      rgba[dstIdx + 3] = block[srcIdx + 3] ?? 0;
    }
  }
}

// ---------------------------------------------------------------------------
// DXT1
// ---------------------------------------------------------------------------

function decodeDXT1(data: Uint8Array, width: number, height: number): Uint8Array {
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const rgba = new Uint8Array(width * height * 4);

  let offset = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const block = decodeColorBlock(data, offset, true);
      writeBlock(rgba, block, width, bx * 4, by * 4, height);
      offset += 8;
    }
  }

  return rgba;
}

// ---------------------------------------------------------------------------
// DXT3
// ---------------------------------------------------------------------------

function decodeDXT3(data: Uint8Array, width: number, height: number): Uint8Array {
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const rgba = new Uint8Array(width * height * 4);

  let offset = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      // First 8 bytes: explicit 4-bit alpha per pixel
      const block = decodeColorBlock(data, offset + 8, false);

      // Override alpha values from the explicit alpha bytes
      for (let row = 0; row < 4; row++) {
        const alphaByte0 = data[offset + row * 2] ?? 0;
        const alphaByte1 = data[offset + row * 2 + 1] ?? 0;
        const alphaRow = alphaByte0 | (alphaByte1 << 8);

        for (let col = 0; col < 4; col++) {
          const a4 = (alphaRow >> (col * 4)) & 0x0f;
          const pixelIdx = (row * 4 + col) * 4;
          block[pixelIdx + 3] = a4 | (a4 << 4); // Expand 4-bit to 8-bit
        }
      }

      writeBlock(rgba, block, width, bx * 4, by * 4, height);
      offset += 16;
    }
  }

  return rgba;
}

// ---------------------------------------------------------------------------
// DXT5
// ---------------------------------------------------------------------------

function decodeDXT5(data: Uint8Array, width: number, height: number): Uint8Array {
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const rgba = new Uint8Array(width * height * 4);

  let offset = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      // Bytes 0-1: alpha reference values
      const alpha0 = data[offset] ?? 0;
      const alpha1 = data[offset + 1] ?? 0;

      // Build alpha lookup table
      const alphaTable = new Uint8Array(8);
      alphaTable[0] = alpha0;
      alphaTable[1] = alpha1;

      if (alpha0 > alpha1) {
        // 8-alpha interpolation
        alphaTable[2] = Math.round((6 * alpha0 + 1 * alpha1) / 7);
        alphaTable[3] = Math.round((5 * alpha0 + 2 * alpha1) / 7);
        alphaTable[4] = Math.round((4 * alpha0 + 3 * alpha1) / 7);
        alphaTable[5] = Math.round((3 * alpha0 + 4 * alpha1) / 7);
        alphaTable[6] = Math.round((2 * alpha0 + 5 * alpha1) / 7);
        alphaTable[7] = Math.round((1 * alpha0 + 6 * alpha1) / 7);
      } else {
        // 6-alpha interpolation + 0 + 255
        alphaTable[2] = Math.round((4 * alpha0 + 1 * alpha1) / 5);
        alphaTable[3] = Math.round((3 * alpha0 + 2 * alpha1) / 5);
        alphaTable[4] = Math.round((2 * alpha0 + 3 * alpha1) / 5);
        alphaTable[5] = Math.round((1 * alpha0 + 4 * alpha1) / 5);
        alphaTable[6] = 0;
        alphaTable[7] = 255;
      }

      // Decode 48 bits of 3-bit alpha indices (6 bytes, offset+2 through offset+7)
      // Pack them into a BigInt-style manual extraction
      const alphaIndices = new Uint8Array(16);
      {
        // Read 6 bytes as a 48-bit value (little-endian)
        let bits = 0n;
        for (let i = 0; i < 6; i++) {
          bits |= BigInt(data[offset + 2 + i] ?? 0) << BigInt(i * 8);
        }
        for (let i = 0; i < 16; i++) {
          alphaIndices[i] = Number((bits >> BigInt(i * 3)) & 0x07n);
        }
      }

      // Decode color block (last 8 bytes of the 16-byte DXT5 block)
      const block = decodeColorBlock(data, offset + 8, false);

      // Override alpha from the decoded alpha indices
      for (let i = 0; i < 16; i++) {
        const idx = alphaIndices[i] ?? 0;
        block[i * 4 + 3] = alphaTable[idx] ?? 0;
      }

      writeBlock(rgba, block, width, bx * 4, by * 4, height);
      offset += 16;
    }
  }

  return rgba;
}
