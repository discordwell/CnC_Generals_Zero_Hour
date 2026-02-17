import { describe, expect, it } from 'vitest';

import { parseNetworkFrameInfoMessage } from './network-frame-info.js';

describe('network-frame-info', () => {
  it('parses sender/frame/commandCount and frame hash', () => {
    const parsed = parseNetworkFrameInfoMessage({
      commandType: 3,
      sender: 2,
      frame: 14,
      commandCount: 5,
      frameHash: 0x1020,
    }, { maxSlots: 16 });

    expect(parsed).toEqual({
      sender: 2,
      frame: 14,
      commandCount: 5,
      hash: {
        kind: 'frame-hash',
        value: 0x1020,
      },
    });
  });

  it('parses game logic crc hashes and frame aliases', () => {
    const parsed = parseNetworkFrameInfoMessage({
      player: 1,
      executionFrame: 30,
      commandCount: 9.8,
      logicCRC: 0x7788,
    }, { maxSlots: 16 });

    expect(parsed).toEqual({
      sender: 1,
      frame: 30,
      commandCount: 9,
      hash: {
        kind: 'logic-crc',
        value: 0x7788,
      },
    });
  });

  it('accepts frame info without commandCount/hash and rejects invalid sender/frame', () => {
    expect(parseNetworkFrameInfoMessage({
      sender: 0,
      frame: 2,
    }, { maxSlots: 16 })).toEqual({
      sender: 0,
      frame: 2,
      commandCount: null,
      hash: null,
    });

    expect(parseNetworkFrameInfoMessage({
      sender: 16,
      frame: 2,
    }, { maxSlots: 16 })).toBeNull();

    expect(parseNetworkFrameInfoMessage({
      sender: 0,
      frame: -1,
    }, { maxSlots: 16 })).toBeNull();

    expect(parseNetworkFrameInfoMessage({
      sender: 'x',
      frame: 1,
    }, { maxSlots: 16 })).toBeNull();
  });

  it('drops invalid commandCount values', () => {
    const parsed = parseNetworkFrameInfoMessage({
      sender: 1,
      frame: 4,
      commandCount: -2,
    }, { maxSlots: 16 });

    expect(parsed).toEqual({
      sender: 1,
      frame: 4,
      commandCount: null,
      hash: null,
    });
  });
});
