import { describe, expect, it } from 'vitest';

import { parseNetworkFrameResendRequestMessage } from './network-frame-resend-request.js';

describe('network-frame-resend-request', () => {
  it('parses sender and frameToResend using source-compatible fields', () => {
    const parsed = parseNetworkFrameResendRequestMessage({
      commandType: 21,
      sender: 3,
      frameToResend: 44,
    }, { maxSlots: 16 });

    expect(parsed).toEqual({
      sender: 3,
      frameToResend: 44,
    });
  });

  it('accepts frame aliases and getter fallbacks', () => {
    const parsedFromField = parseNetworkFrameResendRequestMessage({
      playerID: 1,
      frame: 22,
    }, { maxSlots: 16 });
    expect(parsedFromField).toEqual({
      sender: 1,
      frameToResend: 22,
    });

    const parsedFromGetter = parseNetworkFrameResendRequestMessage({
      getPlayerID: () => 2,
      getFrameToResend: () => 33,
    }, { maxSlots: 16 });
    expect(parsedFromGetter).toEqual({
      sender: 2,
      frameToResend: 33,
    });
  });

  it('returns sender with null frameToResend when frame is missing/invalid', () => {
    expect(parseNetworkFrameResendRequestMessage({
      sender: 1,
    }, { maxSlots: 16 })).toEqual({
      sender: 1,
      frameToResend: null,
    });

    expect(parseNetworkFrameResendRequestMessage({
      sender: 1,
      frameToResend: -5,
    }, { maxSlots: 16 })).toEqual({
      sender: 1,
      frameToResend: null,
    });
  });

  it('rejects invalid sender/max-slot inputs', () => {
    expect(parseNetworkFrameResendRequestMessage({
      sender: -1,
      frameToResend: 7,
    }, { maxSlots: 16 })).toBeNull();

    expect(parseNetworkFrameResendRequestMessage({
      sender: 16,
      frameToResend: 7,
    }, { maxSlots: 16 })).toBeNull();

    expect(parseNetworkFrameResendRequestMessage({
      sender: 1,
      frameToResend: 7,
    }, { maxSlots: 0 })).toBeNull();

    expect(parseNetworkFrameResendRequestMessage({
      frameToResend: 7,
    }, { maxSlots: 16 })).toBeNull();
  });
});

