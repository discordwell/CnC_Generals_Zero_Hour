/**
 * Low-level binary reader for the W3D chunk hierarchy.
 *
 * W3D files are composed of nested chunks. Each chunk has an 8-byte header:
 *   bytes 0-3 : uint32 ChunkType  (little-endian)
 *   bytes 4-7 : uint32 ChunkSize  (little-endian)
 *     - bit 31 (MSB) = 1 → the chunk body contains sub-chunks
 *     - actual payload size = ChunkSize & 0x7FFF_FFFF
 */

/** Descriptor returned when reading a single chunk header. */
export interface W3dChunk {
  /** Chunk type id (see W3dChunkType). */
  type: number;
  /** Payload size in bytes (MSB already masked off). */
  size: number;
  /** Whether the chunk body contains nested sub-chunks. */
  hasSubChunks: boolean;
  /** Byte offset where the chunk payload begins (right after the 8-byte header). */
  dataOffset: number;
}

/** Size of every chunk header in bytes. */
export const CHUNK_HEADER_SIZE = 8;

export class W3dChunkReader {
  private readonly view: DataView;
  readonly byteLength: number;

  constructor(private readonly buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.byteLength = buffer.byteLength;
  }

  /* ------------------------------------------------------------------ */
  /*  Chunk navigation                                                   */
  /* ------------------------------------------------------------------ */

  /** Read the 8-byte chunk header at `offset` and return a descriptor. */
  readChunkAt(offset: number): W3dChunk {
    const type = this.view.getUint32(offset, true);
    const raw = this.view.getUint32(offset + 4, true);
    const hasSubChunks = (raw & 0x80000000) !== 0;
    const size = raw & 0x7fffffff;
    return { type, size, hasSubChunks, dataOffset: offset + CHUNK_HEADER_SIZE };
  }

  /**
   * Generator that yields every top-level chunk whose header starts between
   * `offset` (inclusive) and `endOffset` (exclusive).
   */
  *iterateChunks(offset: number, endOffset: number): Generator<W3dChunk> {
    let pos = offset;
    while (pos < endOffset) {
      if (pos + CHUNK_HEADER_SIZE > endOffset) break;
      const chunk = this.readChunkAt(pos);
      yield chunk;
      pos = chunk.dataOffset + chunk.size;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Primitive readers (all little-endian)                              */
  /* ------------------------------------------------------------------ */

  readUint32(offset: number): number {
    return this.view.getUint32(offset, true);
  }

  readInt32(offset: number): number {
    return this.view.getInt32(offset, true);
  }

  readUint16(offset: number): number {
    return this.view.getUint16(offset, true);
  }

  readUint8(offset: number): number {
    return this.view.getUint8(offset);
  }

  readFloat32(offset: number): number {
    return this.view.getFloat32(offset, true);
  }

  readFloat32Array(offset: number, count: number): Float32Array<ArrayBuffer> {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      arr[i] = this.view.getFloat32(offset + i * 4, true);
    }
    return arr;
  }

  readUint32Array(offset: number, count: number): Uint32Array<ArrayBuffer> {
    const arr = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      arr[i] = this.view.getUint32(offset + i * 4, true);
    }
    return arr;
  }

  readUint16Array(offset: number, count: number): Uint16Array<ArrayBuffer> {
    const arr = new Uint16Array(count);
    for (let i = 0; i < count; i++) {
      arr[i] = this.view.getUint16(offset + i * 2, true);
    }
    return arr;
  }

  readUint8Array(offset: number, count: number): Uint8Array<ArrayBuffer> {
    return new Uint8Array(this.buffer, offset, count);
  }

  /** Read a null-terminated (or null-padded) string of up to `maxLen` bytes. */
  readString(offset: number, maxLen: number): string {
    const bytes = new Uint8Array(this.buffer, offset, maxLen);
    let end = 0;
    while (end < maxLen && bytes[end] !== 0) end++;
    return new TextDecoder('ascii').decode(bytes.subarray(0, end));
  }

  /** Return a reference to the underlying ArrayBuffer. */
  getBuffer(): ArrayBuffer {
    return this.buffer;
  }
}
