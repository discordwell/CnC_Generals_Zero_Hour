import { describe, expect, it } from 'vitest';

import {
  resolveNetworkAssembledWrappedCandidate,
  resolveNetworkDirectWrappedCandidate,
} from './network-wrapper-dispatch.js';

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

function buildChatWrappedCommandBytes(text: string, sender = 1, playerMask = 1): Uint8Array {
  const bytes: number[] = [];
  bytes.push('T'.charCodeAt(0), 11); // NETCOMMANDTYPE_CHAT
  bytes.push('P'.charCodeAt(0), sender & 0xff);
  bytes.push('D'.charCodeAt(0), text.length & 0xff);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i) & 0xffff;
    bytes.push(code & 0xff, (code >>> 8) & 0xff);
  }
  const mask = playerMask | 0;
  bytes.push(mask & 0xff, (mask >>> 8) & 0xff, (mask >>> 16) & 0xff, (mask >>> 24) & 0xff);
  return new Uint8Array(bytes);
}

describe('network-wrapper-dispatch', () => {
  it('resolves direct wrapped candidate with wrapped > command > inner precedence', () => {
    const wrapped = { commandType: 11, text: 'wrapped' };
    const command = { commandType: 11, text: 'command' };
    const inner = { commandType: 11, text: 'inner' };
    expect(resolveNetworkDirectWrappedCandidate({ wrapped, command, inner })).toBe(wrapped);
    expect(resolveNetworkDirectWrappedCandidate({ command, inner })).toBe(command);
    expect(resolveNetworkDirectWrappedCandidate({ inner })).toBe(inner);
    expect(resolveNetworkDirectWrappedCandidate({ wrapped: 5 })).toBeNull();
    expect(resolveNetworkDirectWrappedCandidate(null)).toBeNull();
  });

  it('assembles wrapped command from complete chunk payload', () => {
    const assemblies = new Map();
    const wrappedBytes = buildChatWrappedCommandBytes('ok', 2, 9);
    const payload = buildWrapperChunkPayload(0x1234, 0, 1, wrappedBytes.length, 0, wrappedBytes);

    const parsed = resolveNetworkAssembledWrappedCandidate(
      { commandType: 17, payload },
      assemblies,
    );
    expect(parsed).toMatchObject({
      commandType: 11,
      sender: 2,
      text: 'ok',
      playerMask: 9,
    });
    expect(assemblies.size).toBe(0);
  });

  it('returns null for partial chunk assembly and keeps in-progress state', () => {
    const assemblies = new Map();
    const wrappedBytes = buildChatWrappedCommandBytes('long text', 1, 3);
    const firstHalf = wrappedBytes.subarray(0, 4);
    const secondHalf = wrappedBytes.subarray(4);

    const first = resolveNetworkAssembledWrappedCandidate(
      {
        commandType: 17,
        payload: buildWrapperChunkPayload(0x2000, 0, 2, wrappedBytes.length, 0, firstHalf),
      },
      assemblies,
    );
    expect(first).toBeNull();
    expect(assemblies.has(0x2000)).toBe(true);

    const second = resolveNetworkAssembledWrappedCandidate(
      {
        commandType: 17,
        payload: buildWrapperChunkPayload(0x2000, 1, 2, wrappedBytes.length, 4, secondHalf),
      },
      assemblies,
    );
    expect(second).toMatchObject({
      commandType: 11,
      text: 'long text',
    });
    expect(assemblies.has(0x2000)).toBe(false);
  });
});
