/**
 * Source-backed network wrapper chunk parsing helpers.
 *
 * Source references:
 * - Generals/Code/GameEngine/Source/GameNetwork/NetPacket.cpp
 *   (NetPacket::readWrapperMessage)
 */

import { resolveNetworkNumericField } from './network-message-field.js';

export interface NetworkWrapperChunk {
  wrappedCommandID: number;
  chunkNumber: number;
  numChunks: number;
  totalDataLength: number;
  dataOffset: number;
  chunkData: Uint8Array;
}

type NetworkWrapperChunkLike = {
  payload?: unknown;
  wrapped?: unknown;
  commandType?: unknown;
  command?: unknown;
  inner?: unknown;
  wrappedCommandID?: unknown;
  wrappedCmdID?: unknown;
  wrappedCommandId?: unknown;
  wrappedCmdId?: unknown;
  chunkNumber?: unknown;
  numChunks?: unknown;
  totalDataLength?: unknown;
  dataOffset?: unknown;
  data?: unknown;
  dataLength?: unknown;
};

type NetworkWrapperChunkObjectLike = {
  wrappedCommandID?: unknown;
  wrappedCmdID?: unknown;
  wrappedCommandId?: unknown;
  wrappedCmdId?: unknown;
  chunkNumber?: unknown;
  numChunks?: unknown;
  totalDataLength?: unknown;
  dataOffset?: unknown;
  dataLength?: unknown;
  data?: unknown;
  payload?: unknown;
};

export function coerceNetworkPayloadToBytes(payload: unknown): Uint8Array | null {
  if (payload instanceof Uint8Array) {
    return payload;
  }
  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }
  if (ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (typeof payload === 'string') {
    return new TextEncoder().encode(payload);
  }
  if (Array.isArray(payload)) {
    const bytes = new Uint8Array(payload.length);
    for (let index = 0; index < payload.length; index += 1) {
      const value = resolveNetworkNumericField(payload[index]);
      if (value === null) {
        return null;
      }
      bytes[index] = value;
    }
    return bytes;
  }
  return null;
}

export function parseNetworkWrapperChunk(message: unknown): NetworkWrapperChunk | null {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const candidate = message as NetworkWrapperChunkLike;
  const fromPayload = parseNetworkWrapperChunkFromBinary(candidate.payload);
  if (fromPayload) {
    return fromPayload;
  }

  const fromDataObject = parseNetworkWrapperChunkFromObject(candidate);
  if (fromDataObject) {
    return fromDataObject;
  }

  return null;
}

export function parseNetworkWrapperChunkFromBinary(payload: unknown): NetworkWrapperChunk | null {
  const data = coerceNetworkPayloadToBytes(payload);
  if (!data) {
    return null;
  }
  return parseNetworkWrapperChunkFromByteBuffer(data);
}

export function parseNetworkWrapperChunkFromObject(
  message: NetworkWrapperChunkObjectLike,
): NetworkWrapperChunk | null {
  const wrappedCommandID = resolveNetworkNumericField(
    message.wrappedCommandID ?? message.wrappedCmdID ?? message.wrappedCommandId ?? message.wrappedCmdId,
  );
  const chunkNumber = resolveNetworkNumericField(message.chunkNumber);
  const numChunks = resolveNetworkNumericField(message.numChunks);
  const totalDataLength = resolveNetworkNumericField(message.totalDataLength);
  const dataOffset = resolveNetworkNumericField(message.dataOffset);
  const explicitDataLength = resolveNetworkNumericField(message.dataLength);
  const hasDataField = message.data !== undefined || message.payload !== undefined;
  const data = hasDataField ? coerceNetworkPayloadToBytes(message.data ?? message.payload) : null;
  if (
    wrappedCommandID === null
    || chunkNumber === null
    || numChunks === null
    || totalDataLength === null
    || dataOffset === null
    || (numChunks !== 0 && !data)
  ) {
    return null;
  }

  if (
    !Number.isFinite(wrappedCommandID)
    || !Number.isFinite(chunkNumber)
    || !Number.isFinite(numChunks)
    || !Number.isFinite(totalDataLength)
    || !Number.isFinite(dataOffset)
  ) {
    return null;
  }

  if (
    !Number.isInteger(wrappedCommandID)
    || !Number.isInteger(chunkNumber)
    || !Number.isInteger(numChunks)
    || !Number.isInteger(totalDataLength)
    || !Number.isInteger(dataOffset)
  ) {
    return null;
  }

  if (
    wrappedCommandID < 0
    || chunkNumber < 0
    || numChunks < 0
    || totalDataLength < 0
    || dataOffset < 0
  ) {
    return null;
  }

  if (numChunks === 0) {
    if (
      chunkNumber !== 0
      || dataOffset !== 0
      || totalDataLength !== 0
      || (data !== null && data.length !== 0)
    ) {
      return null;
    }
  } else if (data === null || chunkNumber >= numChunks || dataOffset > totalDataLength) {
    return null;
  }

  if (explicitDataLength !== null) {
    if (numChunks === 0) {
      if (explicitDataLength !== 0) {
        return null;
      }
    } else if (data === null || explicitDataLength !== data.length) {
      return null;
    }
  }

  if (numChunks === 0) {
    return {
      wrappedCommandID: Math.trunc(wrappedCommandID),
      chunkNumber: Math.trunc(chunkNumber),
      numChunks: Math.trunc(numChunks),
      totalDataLength: Math.trunc(totalDataLength),
      dataOffset: Math.trunc(dataOffset),
      chunkData: new Uint8Array(),
    };
  }

  if (data === null) {
    return null;
  }

  const chunkData = data;

  if (chunkData.byteLength + dataOffset > totalDataLength) {
    return null;
  }

  return {
    wrappedCommandID: Math.trunc(wrappedCommandID),
    chunkNumber: Math.trunc(chunkNumber),
    numChunks: Math.trunc(numChunks),
    totalDataLength: Math.trunc(totalDataLength),
    dataOffset: Math.trunc(dataOffset),
    chunkData,
  };
}

export function parseNetworkWrapperChunkFromByteBuffer(bytes: Uint8Array): NetworkWrapperChunk | null {
  if (bytes.length < 2 + 4 + 4 + 4 + 4 + 4) {
    return null;
  }
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const wrappedCommandID = dataView.getUint16(0, true);
  const chunkNumber = dataView.getUint32(2, true);
  const numChunks = dataView.getUint32(6, true);
  const totalDataLength = dataView.getUint32(10, true);
  const dataLength = dataView.getUint32(14, true);
  const dataOffset = dataView.getUint32(18, true);
  const payloadStart = 22;
  if (numChunks === 0) {
    if (
      chunkNumber !== 0
      || totalDataLength !== 0
      || dataOffset !== 0
      || dataLength !== 0
      || payloadStart !== bytes.length
    ) {
      return null;
    }
    return {
      wrappedCommandID,
      chunkNumber,
      numChunks,
      totalDataLength,
      dataOffset,
      chunkData: new Uint8Array(),
    };
  }

  if (
    chunkNumber >= numChunks
    || dataOffset > totalDataLength
    || dataOffset + dataLength > totalDataLength
    || payloadStart + dataLength > bytes.length
  ) {
    return null;
  }
  const chunkData = bytes.subarray(payloadStart, payloadStart + dataLength);

  return {
    wrappedCommandID,
    chunkNumber,
    numChunks,
    totalDataLength,
    dataOffset,
    chunkData,
  };
}
