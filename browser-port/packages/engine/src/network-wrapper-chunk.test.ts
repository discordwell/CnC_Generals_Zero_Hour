import { describe, expect, it } from 'vitest';

import {
  coerceNetworkPayloadToBytes,
  parseNetworkWrapperChunk,
  parseNetworkWrapperChunkFromByteBuffer,
  parseNetworkWrapperChunkFromObject,
} from './network-wrapper-chunk.js';

function buildWrapperChunkPayload(
  wrappedCommandId: number,
  chunkNumber: number,
  numChunks: number,
  totalDataLength: number,
  dataOffset: number,
  chunkData: Uint8Array,
): Uint8Array {
  const payload = new Uint8Array(22 + chunkData.length);
  const view = new DataView(payload.buffer);
  view.setUint16(0, wrappedCommandId, true);
  view.setUint32(2, chunkNumber, true);
  view.setUint32(6, numChunks, true);
  view.setUint32(10, totalDataLength, true);
  view.setUint32(14, chunkData.length, true);
  view.setUint32(18, dataOffset, true);
  payload.set(chunkData, 22);
  return payload;
}

describe('network-wrapper-chunk', () => {
  it('coerces common payload shapes into bytes', () => {
    expect(coerceNetworkPayloadToBytes(new Uint8Array([1, 2, 3]))).toEqual(new Uint8Array([1, 2, 3]));
    expect(coerceNetworkPayloadToBytes(new Uint16Array([0x4142]))).toEqual(
      new Uint8Array(new Uint16Array([0x4142]).buffer),
    );
    expect(coerceNetworkPayloadToBytes('ab')).toEqual(new Uint8Array([97, 98]));
    expect(coerceNetworkPayloadToBytes([1, '2', 3])).toEqual(new Uint8Array([1, 2, 3]));
    expect(coerceNetworkPayloadToBytes([1, 'bad'])).toBeNull();
  });

  it('parses wrapper chunk from source-format byte buffer', () => {
    const payload = buildWrapperChunkPayload(
      0x1234,
      0,
      2,
      8,
      0,
      new Uint8Array([10, 11, 12, 13]),
    );
    expect(parseNetworkWrapperChunkFromByteBuffer(payload)).toEqual({
      wrappedCommandID: 0x1234,
      chunkNumber: 0,
      numChunks: 2,
      totalDataLength: 8,
      dataOffset: 0,
      chunkData: new Uint8Array([10, 11, 12, 13]),
    });
  });

  it('rejects malformed zero-chunk payloads with stray bytes', () => {
    const malformed = new Uint8Array(23);
    const view = new DataView(malformed.buffer);
    view.setUint16(0, 0x1111, true);
    view.setUint32(2, 0, true);
    view.setUint32(6, 0, true);
    view.setUint32(10, 0, true);
    view.setUint32(14, 0, true);
    view.setUint32(18, 0, true);
    malformed[22] = 99;

    expect(parseNetworkWrapperChunkFromByteBuffer(malformed)).toBeNull();
  });

  it('parses wrapper chunk object aliases and numeric strings', () => {
    expect(parseNetworkWrapperChunkFromObject({
      wrappedCmdId: '4660',
      chunkNumber: '0',
      numChunks: '1',
      totalDataLength: '4',
      dataOffset: '0',
      dataLength: '4',
      payload: [1, 2, 3, 4],
    })).toEqual({
      wrappedCommandID: 4660,
      chunkNumber: 0,
      numChunks: 1,
      totalDataLength: 4,
      dataOffset: 0,
      chunkData: new Uint8Array([1, 2, 3, 4]),
    });
  });

  it('accepts object-form zero-chunk chunks without payload bytes', () => {
    expect(parseNetworkWrapperChunkFromObject({
      wrappedCommandId: 55,
      chunkNumber: 0,
      numChunks: 0,
      totalDataLength: 0,
      dataOffset: 0,
      dataLength: 0,
    })).toEqual({
      wrappedCommandID: 55,
      chunkNumber: 0,
      numChunks: 0,
      totalDataLength: 0,
      dataOffset: 0,
      chunkData: new Uint8Array(),
    });
  });

  it('resolves wrapper chunk from payload first, then object metadata', () => {
    const payload = buildWrapperChunkPayload(
      0x2222,
      0,
      1,
      2,
      0,
      new Uint8Array([7, 8]),
    );
    const fromPayload = parseNetworkWrapperChunk({
      payload,
      wrappedCommandID: 0x9999,
      chunkNumber: 0,
      numChunks: 1,
      totalDataLength: 1,
      dataOffset: 0,
      data: new Uint8Array([1]),
    });
    expect(fromPayload?.wrappedCommandID).toBe(0x2222);
    expect(fromPayload?.chunkData).toEqual(new Uint8Array([7, 8]));

    const fromObject = parseNetworkWrapperChunk({
      wrappedCommandID: 0x3333,
      chunkNumber: 0,
      numChunks: 1,
      totalDataLength: 2,
      dataOffset: 0,
      data: new Uint8Array([3, 4]),
    });
    expect(fromObject).toEqual({
      wrappedCommandID: 0x3333,
      chunkNumber: 0,
      numChunks: 1,
      totalDataLength: 2,
      dataOffset: 0,
      chunkData: new Uint8Array([3, 4]),
    });
  });
});
