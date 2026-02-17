import { describe, expect, it } from 'vitest';

import {
  isNetworkPacketRouterAckFromCurrentRouter,
  parseNetworkPacketRouterAckMessage,
  parseNetworkPacketRouterQueryMessage,
} from './network-packet-router.js';

describe('network-packet-router', () => {
  it('parses packet-router query sender with source-compatible aliases', () => {
    expect(parseNetworkPacketRouterQueryMessage({
      sender: 3,
    }, { maxSlots: 16 })).toEqual({ sender: 3 });

    expect(parseNetworkPacketRouterQueryMessage({
      playerID: 2,
    }, { maxSlots: 16 })).toEqual({ sender: 2 });
  });

  it('parses packet-router ack sender with getter fallback', () => {
    expect(parseNetworkPacketRouterAckMessage({
      getPlayerID: () => 5,
    }, { maxSlots: 16 })).toEqual({ sender: 5 });
  });

  it('rejects invalid packet-router sender/max-slot combinations', () => {
    expect(parseNetworkPacketRouterQueryMessage({
      sender: -1,
    }, { maxSlots: 16 })).toBeNull();
    expect(parseNetworkPacketRouterAckMessage({
      sender: 16,
    }, { maxSlots: 16 })).toBeNull();
    expect(parseNetworkPacketRouterAckMessage({
      sender: 1,
    }, { maxSlots: 0 })).toBeNull();
    expect(parseNetworkPacketRouterAckMessage({})).toBeNull();
  });

  it('accepts packet-router acks only from the current packet router slot', () => {
    expect(isNetworkPacketRouterAckFromCurrentRouter(2, 2)).toBe(true);
    expect(isNetworkPacketRouterAckFromCurrentRouter(3, 2)).toBe(false);
  });
});

