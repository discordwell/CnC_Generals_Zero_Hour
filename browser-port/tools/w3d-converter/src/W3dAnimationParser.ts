/**
 * Parses W3D ANIMATION (0x200) and COMPRESSED_ANIMATION (0x280) chunks.
 *
 * ANIMATION contains:
 *   ANIMATION_HEADER  (0x201) – version, name, hierarchy, numFrames, frameRate
 *   ANIMATION_CHANNEL (0x202) – per-channel keyframe data
 *   BIT_CHANNEL       (0x203) – boolean channels (visibility, etc.)
 *
 * COMPRESSED_ANIMATION contains:
 *   COMPRESSED_ANIMATION_HEADER  (0x281)
 *   COMPRESSED_ANIMATION_CHANNEL (0x282) – time-coded keyframe data
 *   COMPRESSED_BIT_CHANNEL       (0x283)
 *
 * Animation Channel binary layout:
 *   uint16 FirstFrame
 *   uint16 LastFrame
 *   uint16 VectorLen    // 1 for scalar, 4 for quaternion
 *   uint16 Flags        // 0=X, 1=Y, 2=Z, 6=Quaternion
 *   uint16 Pivot        // bone index
 *   uint16 pad
 *   float32 Data[]      // (LastFrame - FirstFrame + 1) × VectorLen values
 */

import { W3dChunkReader } from './W3dChunkReader.js';
import { W3dChunkType } from './W3dChunkTypes.js';

export interface W3dAnimChannel {
  pivot: number;
  type: 'x' | 'y' | 'z' | 'quaternion';
  firstFrame: number;
  lastFrame: number;
  data: Float32Array;
}

export interface W3dAnimation {
  name: string;
  hierarchyName: string;
  numFrames: number;
  frameRate: number;
  channels: W3dAnimChannel[];
}

/** Map from the Flags field to our channel type discriminator. */
function flagsToType(flags: number): 'x' | 'y' | 'z' | 'quaternion' {
  switch (flags) {
    case 0: return 'x';
    case 1: return 'y';
    case 2: return 'z';
    case 6: return 'quaternion';
    default: return 'x'; // Fallback – treat as X translation.
  }
}

/* ------------------------------------------------------------------ */
/*  Standard (uncompressed) animation                                  */
/* ------------------------------------------------------------------ */

export function parseAnimationChunk(
  reader: W3dChunkReader,
  dataOffset: number,
  chunkSize: number,
): W3dAnimation {
  const endOffset = dataOffset + chunkSize;

  let name = '';
  let hierarchyName = '';
  let numFrames = 0;
  let frameRate = 0;
  const channels: W3dAnimChannel[] = [];

  for (const sub of reader.iterateChunks(dataOffset, endOffset)) {
    switch (sub.type) {
      case W3dChunkType.ANIMATION_HEADER: {
        // uint32 Version       offset +0
        // char Name[32]        offset +4
        // char HierarchyName[32] offset +36
        // uint32 NumFrames     offset +68
        // uint32 FrameRate     offset +72
        name = reader.readString(sub.dataOffset + 4, 32);
        hierarchyName = reader.readString(sub.dataOffset + 36, 32);
        numFrames = reader.readUint32(sub.dataOffset + 68);
        frameRate = reader.readUint32(sub.dataOffset + 72);
        break;
      }

      case W3dChunkType.ANIMATION_CHANNEL: {
        const ch = parseAnimChannel(reader, sub.dataOffset);
        if (ch) channels.push(ch);
        break;
      }

      case W3dChunkType.BIT_CHANNEL:
        // Boolean channels (visibility); skip for now.
        break;

      default:
        break;
    }
  }

  return { name, hierarchyName, numFrames, frameRate, channels };
}

function parseAnimChannel(reader: W3dChunkReader, offset: number): W3dAnimChannel | null {
  const firstFrame = reader.readUint16(offset);
  const lastFrame = reader.readUint16(offset + 2);
  const vectorLen = reader.readUint16(offset + 4);
  const flags = reader.readUint16(offset + 6);
  const pivot = reader.readUint16(offset + 8);
  // uint16 pad at offset + 10

  const frameCount = lastFrame - firstFrame + 1;
  const dataCount = frameCount * vectorLen;
  const data = reader.readFloat32Array(offset + 12, dataCount);

  return {
    pivot,
    type: flagsToType(flags),
    firstFrame,
    lastFrame,
    data,
  };
}

/* ------------------------------------------------------------------ */
/*  Compressed animation                                               */
/* ------------------------------------------------------------------ */

export function parseCompressedAnimationChunk(
  reader: W3dChunkReader,
  dataOffset: number,
  chunkSize: number,
): W3dAnimation {
  const endOffset = dataOffset + chunkSize;

  let name = '';
  let hierarchyName = '';
  let numFrames = 0;
  let frameRate = 0;
  const channels: W3dAnimChannel[] = [];

  for (const sub of reader.iterateChunks(dataOffset, endOffset)) {
    switch (sub.type) {
      case W3dChunkType.COMPRESSED_ANIMATION_HEADER: {
        // Same layout as ANIMATION_HEADER but may have extra fields.
        // uint32 Version       offset +0
        // char Name[32]        offset +4
        // char HierarchyName[32] offset +36
        // uint32 NumFrames     offset +68
        // uint16 Flavor        offset +72  (0 = TimeCoded, 1 = AdaptiveDelta)
        // uint16 pad           offset +74
        name = reader.readString(sub.dataOffset + 4, 32);
        hierarchyName = reader.readString(sub.dataOffset + 36, 32);
        numFrames = reader.readUint32(sub.dataOffset + 68);
        // Flavor determines the compressed data layout.
        // For now we read TimeCoded only.
        // FrameRate is not stored in compressed header; use 30 as default.
        frameRate = 30;
        break;
      }

      case W3dChunkType.COMPRESSED_ANIMATION_CHANNEL: {
        const ch = parseCompressedChannel(reader, sub.dataOffset, sub.size, numFrames);
        if (ch) channels.push(ch);
        break;
      }

      case W3dChunkType.COMPRESSED_BIT_CHANNEL:
        // Skip compressed boolean channels for now.
        break;

      default:
        break;
    }
  }

  return { name, hierarchyName, numFrames, frameRate, channels };
}

function parseCompressedChannel(
  reader: W3dChunkReader,
  offset: number,
  _size: number,
  numFrames: number,
): W3dAnimChannel | null {
  // Compressed channel header (TimeCoded flavour):
  //   uint32 NumTimeCodes
  //   uint16 Pivot
  //   uint8  VectorLen
  //   uint8  Flags
  //   ... then NumTimeCodes × (uint16 frame + float32[VectorLen])
  const numTimeCodes = reader.readUint32(offset);
  const pivot = reader.readUint16(offset + 4);
  const vectorLen = reader.readUint8(offset + 6);
  const flags = reader.readUint8(offset + 7);

  const type = flagsToType(flags);
  const entrySize = 2 + vectorLen * 4; // uint16 frame + float32[vectorLen]

  // Expand time-coded data into a per-frame array.
  const totalValues = numFrames * vectorLen;
  const data = new Float32Array(totalValues);

  let prevValues = new Float32Array(vectorLen);
  let nextTcIdx = 0;

  // Read all time codes first.
  interface TimeCode { frame: number; values: Float32Array<ArrayBuffer> }
  const timeCodes: TimeCode[] = [];
  for (let i = 0; i < numTimeCodes; i++) {
    const entryOffset = offset + 8 + i * entrySize;
    const frame = reader.readUint16(entryOffset);
    const values = reader.readFloat32Array(entryOffset + 2, vectorLen);
    timeCodes.push({ frame, values });
  }

  // Fill per-frame data via step interpolation (no blending – matches engine).
  for (let f = 0; f < numFrames; f++) {
    while (nextTcIdx < timeCodes.length) {
      const tc = timeCodes[nextTcIdx];
      if (tc && tc.frame <= f) {
        prevValues = tc.values;
        nextTcIdx++;
      } else {
        break;
      }
    }
    for (let v = 0; v < vectorLen; v++) {
      data[f * vectorLen + v] = prevValues[v] ?? 0;
    }
  }

  return {
    pivot,
    type,
    firstFrame: 0,
    lastFrame: numFrames > 0 ? numFrames - 1 : 0,
    data,
  };
}
