/**
 * TGA (Truevision Graphics Adapter) image decoder.
 *
 * Supports:
 *   - Image types: 2 (uncompressed RGB), 3 (grayscale), 10 (RLE RGB)
 *   - Pixel depths: 8, 16 (A1R5G5B5), 24 (BGR), 32 (BGRA)
 *   - Bottom-left and top-left origin
 */

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA pixels, row-major, top-to-bottom */
  data: Uint8Array;
}

const IMAGE_TYPE_UNCOMPRESSED_RGB = 2;
const IMAGE_TYPE_GRAYSCALE = 3;
const IMAGE_TYPE_RLE_RGB = 10;

export class TgaDecoder {
  static decode(buffer: ArrayBuffer): DecodedImage {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    if (buffer.byteLength < 18) {
      throw new Error('TGA: Buffer too small for header');
    }

    // --- Parse header ---
    const idLength = view.getUint8(0);
    const colorMapType = view.getUint8(1);
    const imageType = view.getUint8(2);

    const colorMapFirstEntry = view.getUint16(3, true);
    const colorMapLength = view.getUint16(5, true);
    const colorMapDepth = view.getUint8(7);

    const width = view.getUint16(12, true);
    const height = view.getUint16(14, true);
    const pixelDepth = view.getUint8(16);
    const imageDescriptor = view.getUint8(17);

    if (width === 0 || height === 0) {
      throw new Error(`TGA: Invalid dimensions ${width}x${height}`);
    }

    if (
      imageType !== IMAGE_TYPE_UNCOMPRESSED_RGB &&
      imageType !== IMAGE_TYPE_RLE_RGB &&
      imageType !== IMAGE_TYPE_GRAYSCALE
    ) {
      throw new Error(`TGA: Unsupported image type ${imageType}`);
    }

    const topLeftOrigin = (imageDescriptor & 0x20) !== 0;
    const bytesPerPixel = pixelDepth / 8;

    // Skip past header, image-ID, and color-map data
    let offset = 18 + idLength;
    if (colorMapType === 1) {
      offset += colorMapLength * Math.ceil(colorMapDepth / 8);
    }
    // Suppress unused-variable warnings for fields we parse but don't actively use
    void colorMapFirstEntry;

    const pixelCount = width * height;
    const rgba = new Uint8Array(pixelCount * 4);

    if (imageType === IMAGE_TYPE_UNCOMPRESSED_RGB || imageType === IMAGE_TYPE_GRAYSCALE) {
      for (let i = 0; i < pixelCount; i++) {
        writePixel(rgba, i, bytes, offset, pixelDepth);
        offset += bytesPerPixel;
      }
    } else if (imageType === IMAGE_TYPE_RLE_RGB) {
      let pixelIndex = 0;
      while (pixelIndex < pixelCount) {
        const packetByte = bytes[offset++];
        if (packetByte === undefined) {
          throw new Error('TGA: Unexpected end of RLE data');
        }
        const isRle = (packetByte & 0x80) !== 0;
        const count = (packetByte & 0x7f) + 1;

        if (isRle) {
          // One pixel repeated `count` times
          const pixelOffset = offset;
          offset += bytesPerPixel;
          for (let j = 0; j < count && pixelIndex < pixelCount; j++, pixelIndex++) {
            writePixel(rgba, pixelIndex, bytes, pixelOffset, pixelDepth);
          }
        } else {
          // `count` raw pixels
          for (let j = 0; j < count && pixelIndex < pixelCount; j++, pixelIndex++) {
            writePixel(rgba, pixelIndex, bytes, offset, pixelDepth);
            offset += bytesPerPixel;
          }
        }
      }
    }

    // Flip vertically if origin is bottom-left (the default)
    if (!topLeftOrigin) {
      flipVertical(rgba, width, height);
    }

    return { width, height, data: rgba };
  }
}

/**
 * Decode a single pixel from the source buffer and write it into the RGBA
 * output array at the given pixel index.
 */
function writePixel(
  rgba: Uint8Array,
  pixelIndex: number,
  src: Uint8Array,
  srcOffset: number,
  pixelDepth: number,
): void {
  const dst = pixelIndex * 4;

  if (pixelDepth === 32) {
    // BGRA -> RGBA
    const b = src[srcOffset] ?? 0;
    const g = src[srcOffset + 1] ?? 0;
    const r = src[srcOffset + 2] ?? 0;
    const a = src[srcOffset + 3] ?? 0;
    rgba[dst] = r;
    rgba[dst + 1] = g;
    rgba[dst + 2] = b;
    rgba[dst + 3] = a;
  } else if (pixelDepth === 24) {
    // BGR -> RGBA (alpha = 255)
    const b = src[srcOffset] ?? 0;
    const g = src[srcOffset + 1] ?? 0;
    const r = src[srcOffset + 2] ?? 0;
    rgba[dst] = r;
    rgba[dst + 1] = g;
    rgba[dst + 2] = b;
    rgba[dst + 3] = 255;
  } else if (pixelDepth === 16) {
    // A1R5G5B5
    const lo = src[srcOffset] ?? 0;
    const hi = src[srcOffset + 1] ?? 0;
    const value = lo | (hi << 8);
    const r5 = (value >> 10) & 0x1f;
    const g5 = (value >> 5) & 0x1f;
    const b5 = value & 0x1f;
    const a1 = (value >> 15) & 1;
    rgba[dst] = (r5 << 3) | (r5 >> 2);
    rgba[dst + 1] = (g5 << 3) | (g5 >> 2);
    rgba[dst + 2] = (b5 << 3) | (b5 >> 2);
    rgba[dst + 3] = a1 ? 255 : 0;
  } else if (pixelDepth === 8) {
    // Grayscale
    const v = src[srcOffset] ?? 0;
    rgba[dst] = v;
    rgba[dst + 1] = v;
    rgba[dst + 2] = v;
    rgba[dst + 3] = 255;
  }
}

/** Flip an RGBA image vertically in-place. */
function flipVertical(rgba: Uint8Array, width: number, height: number): void {
  const rowBytes = width * 4;
  const temp = new Uint8Array(rowBytes);

  for (let y = 0; y < Math.floor(height / 2); y++) {
    const topStart = y * rowBytes;
    const bottomStart = (height - 1 - y) * rowBytes;

    // Swap rows
    temp.set(rgba.subarray(topStart, topStart + rowBytes));
    rgba.copyWithin(topStart, bottomStart, bottomStart + rowBytes);
    rgba.set(temp, bottomStart);
  }
}
