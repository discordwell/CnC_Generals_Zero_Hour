/**
 * Low-level binary reader for the C&C Generals .map chunk format.
 *
 * .map files use a chunked binary format with a table of contents (TOC)
 * at the file start followed by sequential data chunks.
 *
 * TOC layout:
 *   bytes 0-3 : ASCII "CkMp" magic
 *   bytes 4-7 : uint32 number of chunk types
 *   for each chunk type:
 *     1 byte   : string length
 *     N bytes  : ASCII chunk name
 *     4 bytes  : uint32 chunk ID
 *
 * Each data chunk:
 *   bytes 0-3 : uint32 chunk ID
 *   bytes 4-5 : uint16 version
 *   bytes 6-9 : int32 data size (excluding this 10-byte header)
 *   bytes 10+ : chunk data
 */

/** A single entry from the file's table of contents. */
export interface ChunkTableEntry {
  /** Human-readable chunk label (e.g. "HeightMapData"). */
  name: string;
  /** Numeric ID used to match data chunks to TOC entries. */
  id: number;
}

/** Descriptor returned when reading a data chunk header. */
export interface DataChunk {
  /** Chunk type ID (matches a TOC entry). */
  id: number;
  /** Chunk format version. */
  version: number;
  /** Size of chunk payload in bytes (excluding the 10-byte header). */
  dataSize: number;
  /** Byte offset where chunk payload begins in the buffer. */
  dataOffset: number;
}

/** Size of the per-chunk header: id(4) + version(2) + dataSize(4) = 10 bytes. */
export const CHUNK_HEADER_SIZE = 10;

/** Expected 4-byte magic at the start of every .map file. */
export const MAP_MAGIC = 'CkMp';

export class DataChunkReader {
  private readonly view: DataView;
  private offset: number;
  readonly byteLength: number;

  constructor(private readonly buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.offset = 0;
    this.byteLength = buffer.byteLength;
  }

  /* ------------------------------------------------------------------ */
  /*  Table of contents                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Read the TOC from the start of the buffer.
   * After this call the internal offset points to the first data chunk.
   */
  readTableOfContents(): ChunkTableEntry[] {
    this.offset = 0;

    // Magic
    const magic = this.readFixedAscii(4);
    if (magic !== MAP_MAGIC) {
      throw new Error(`Invalid map magic: expected "${MAP_MAGIC}", got "${magic}"`);
    }

    // Number of chunk types
    const count = this.readUint32();
    const entries: ChunkTableEntry[] = [];

    for (let i = 0; i < count; i++) {
      const strLen = this.readUint8();
      const name = this.readFixedAscii(strLen);
      const id = this.readUint32();
      entries.push({ name, id });
    }

    return entries;
  }

  /* ------------------------------------------------------------------ */
  /*  Chunk navigation                                                   */
  /* ------------------------------------------------------------------ */

  /** Read the 10-byte chunk header at the current offset. */
  readChunkHeader(): DataChunk {
    const id = this.readUint32();
    const version = this.readUint16();
    const dataSize = this.readInt32();
    const dataOffset = this.offset;
    return { id, version, dataSize, dataOffset };
  }

  /** Skip past the current chunk's data. Call after readChunkHeader(). */
  skipChunkData(chunk: DataChunk): void {
    this.offset = chunk.dataOffset + chunk.dataSize;
  }

  /* ------------------------------------------------------------------ */
  /*  Primitive readers (all little-endian)                              */
  /* ------------------------------------------------------------------ */

  readUint8(): number {
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  readInt16(): number {
    const val = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return val;
  }

  readUint16(): number {
    const val = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return val;
  }

  readInt32(): number {
    const val = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readUint32(): number {
    const val = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readFloat32(): number {
    const val = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return val;
  }

  /** Read `count` bytes and return a copy. */
  readBytes(count: number): Uint8Array {
    const slice = new Uint8Array(this.buffer, this.offset, count);
    const copy = new Uint8Array(count);
    copy.set(slice);
    this.offset += count;
    return copy;
  }

  /** Read `count` int16 values. */
  readInt16Array(count: number): Int16Array {
    const arr = new Int16Array(count);
    for (let i = 0; i < count; i++) {
      arr[i] = this.view.getInt16(this.offset, true);
      this.offset += 2;
    }
    return arr;
  }

  /* ------------------------------------------------------------------ */
  /*  String readers                                                     */
  /* ------------------------------------------------------------------ */

  /** Read a fixed-length ASCII string (no length prefix, no null terminator). */
  readFixedAscii(length: number): string {
    const bytes = new Uint8Array(this.buffer, this.offset, length);
    this.offset += length;
    return new TextDecoder('ascii').decode(bytes);
  }

  /** Read a uint16-length-prefixed ASCII string. */
  readAsciiString(): string {
    const len = this.readUint16();
    return this.readFixedAscii(len);
  }

  /** Read a uint16-length-prefixed Unicode string (2 bytes per char). */
  readUnicodeString(): string {
    const charCount = this.readUint16();
    const codes: number[] = [];
    for (let i = 0; i < charCount; i++) {
      codes.push(this.readUint16());
    }
    return String.fromCharCode(...codes);
  }

  /* ------------------------------------------------------------------ */
  /*  Dict reader                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Read a property dictionary.
   *
   * Format:
   *   uint16 pairCount
   *   for each pair:
   *     int32  packed = (keyID << 8) | dataType
   *     value depends on dataType:
   *       0 (BOOL)           : 1 byte
   *       1 (INT)            : 4 bytes int32
   *       2 (REAL)           : 4 bytes float32
   *       3 (ASCII_STRING)   : uint16 len + chars
   *       4 (UNICODE_STRING) : uint16 charCount + 2 bytes/char
   */
  readDict(): Map<number, unknown> {
    const pairCount = this.readUint16();
    const dict = new Map<number, unknown>();

    for (let i = 0; i < pairCount; i++) {
      const packed = this.readInt32();
      const keyID = packed >>> 8;
      const dataType = packed & 0xFF;

      let value: unknown;
      switch (dataType) {
        case 0: // BOOL
          value = this.readUint8() !== 0;
          break;
        case 1: // INT
          value = this.readInt32();
          break;
        case 2: // REAL
          value = this.readFloat32();
          break;
        case 3: // ASCII_STRING
          value = this.readAsciiString();
          break;
        case 4: // UNICODE_STRING
          value = this.readUnicodeString();
          break;
        default:
          throw new Error(`Unknown dict data type: ${dataType}`);
      }

      dict.set(keyID, value);
    }

    return dict;
  }

  /* ------------------------------------------------------------------ */
  /*  Cursor control                                                     */
  /* ------------------------------------------------------------------ */

  /** Move the read cursor to an absolute offset. */
  seek(offset: number): void {
    this.offset = offset;
  }

  /** Skip forward by `bytes` bytes. */
  skip(bytes: number): void {
    this.offset += bytes;
  }

  /** Current read position. */
  get position(): number {
    return this.offset;
  }

  /** Return a reference to the underlying ArrayBuffer. */
  getBuffer(): ArrayBuffer {
    return this.buffer;
  }
}
