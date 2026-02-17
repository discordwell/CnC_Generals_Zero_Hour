import { describe, expect, it } from 'vitest';

import {
  resolveNetworkFileCommandIdFromMessage,
  resolveNetworkFrameHashFromFrameInfo,
  resolveNetworkMaskFromMessage,
  resolveNetworkPlayerFromMessage,
} from './network-message-resolver.js';

describe('network-message-resolver', () => {
  it('resolves player id from properties and getters', () => {
    expect(resolveNetworkPlayerFromMessage({ playerID: 3 })).toBe(3);
    expect(resolveNetworkPlayerFromMessage({ sender: '4' })).toBe(4);
    expect(resolveNetworkPlayerFromMessage({ getPlayerID: () => 6 })).toBe(6);
    expect(resolveNetworkPlayerFromMessage({})).toBeNull();
  });

  it('resolves file command id across source-compatible aliases', () => {
    expect(resolveNetworkFileCommandIdFromMessage({ commandId: 10 })).toBe(10);
    expect(resolveNetworkFileCommandIdFromMessage({ fileID: '11' })).toBe(11);
    expect(resolveNetworkFileCommandIdFromMessage({ wrappedCommandID: 12 })).toBe(12);
    expect(resolveNetworkFileCommandIdFromMessage({})).toBeNull();
  });

  it('resolves relay masks with source-compatible getter fallback', () => {
    expect(resolveNetworkMaskFromMessage({ playerMask: 7 }, ['playerMask', 'mask'])).toBe(7);
    expect(resolveNetworkMaskFromMessage(
      { getPlayerMask: () => 15 },
      ['playerMask', 'mask'],
    )).toBe(15);
    expect(resolveNetworkMaskFromMessage({}, ['playerMask', 'mask'])).toBe(0);
  });

  it('resolves frame info hash payload with crc precedence', () => {
    expect(resolveNetworkFrameHashFromFrameInfo({
      logicCRC: 0x1234abcd,
      frameHash: 0x1,
    })).toEqual({
      kind: 'logic-crc',
      value: 0x1234abcd,
    });

    expect(resolveNetworkFrameHashFromFrameInfo({
      getFrameHash: () => 0x00ff00ff,
    })).toEqual({
      kind: 'frame-hash',
      value: 0x00ff00ff,
    });

    expect(resolveNetworkFrameHashFromFrameInfo({})).toBeNull();
  });
});
