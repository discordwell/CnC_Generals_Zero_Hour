import { describe, expect, it } from 'vitest';

import {
  NETWORK_COMMAND_ID_INITIAL_SEED,
  NetworkCommandIdSequencer,
  doesNetworkCommandRequireAck,
  doesNetworkCommandRequireCommandId,
  doesNetworkCommandRequireDirectSend,
  isNetworkCommandSynchronized,
} from './command-id.js';

describe('NetworkCommandIdSequencer', () => {
  it('starts at the source seed and increments on allocation', () => {
    const sequencer = new NetworkCommandIdSequencer();

    expect(sequencer.getCurrentCommandId()).toBe(NETWORK_COMMAND_ID_INITIAL_SEED);
    expect(sequencer.generateNextCommandId()).toBe(64001);
    expect(sequencer.generateNextCommandId()).toBe(64002);
  });

  it('wraps through unsigned-short command id range', () => {
    const sequencer = new NetworkCommandIdSequencer({ initialCommandId: 0xffff });

    expect(sequencer.generateNextCommandId()).toBe(0);
    expect(sequencer.generateNextCommandId()).toBe(1);
  });

  it('allocates IDs only for command types that require one', () => {
    const sequencer = new NetworkCommandIdSequencer();

    expect(sequencer.generateCommandIdForType(27)).toBe(64001); // DISCONNECTVOTE
    expect(sequencer.generateCommandIdForType(23)).toBeNull(); // DISCONNECTKEEPALIVE
    expect(sequencer.generateCommandIdForType(21)).toBe(64002); // FRAMERESENDREQUEST
  });
});

describe('doesNetworkCommandRequireCommandId', () => {
  it('matches source command-id policy from NetworkUtil.cpp', () => {
    expect(doesNetworkCommandRequireCommandId(4)).toBe(true); // GAMECOMMAND
    expect(doesNetworkCommandRequireCommandId(3)).toBe(true); // FRAMEINFO
    expect(doesNetworkCommandRequireCommandId(27)).toBe(true); // DISCONNECTVOTE
    expect(doesNetworkCommandRequireCommandId(21)).toBe(true); // FRAMERESENDREQUEST
    expect(doesNetworkCommandRequireCommandId(29)).toBe(true); // DISCONNECTSCREENOFF

    expect(doesNetworkCommandRequireCommandId(0)).toBe(false); // ACKBOTH
    expect(doesNetworkCommandRequireCommandId(23)).toBe(false); // DISCONNECTKEEPALIVE
    expect(doesNetworkCommandRequireCommandId(26)).toBe(false); // PACKETROUTERACK
    expect(doesNetworkCommandRequireCommandId(30)).toBe(false); // DISCONNECTEND
  });
});

describe('doesNetworkCommandRequireAck', () => {
  it('matches source ack policy from NetworkUtil.cpp', () => {
    expect(doesNetworkCommandRequireAck(4)).toBe(true); // GAMECOMMAND
    expect(doesNetworkCommandRequireAck(3)).toBe(true); // FRAMEINFO
    expect(doesNetworkCommandRequireAck(27)).toBe(true); // DISCONNECTVOTE
    expect(doesNetworkCommandRequireAck(29)).toBe(true); // DISCONNECTSCREENOFF

    expect(doesNetworkCommandRequireAck(23)).toBe(false); // DISCONNECTKEEPALIVE
    expect(doesNetworkCommandRequireAck(26)).toBe(false); // PACKETROUTERACK
    expect(doesNetworkCommandRequireAck(30)).toBe(false); // DISCONNECTEND
  });
});

describe('doesNetworkCommandRequireDirectSend', () => {
  it('matches source direct-send policy from NetworkUtil.cpp', () => {
    expect(doesNetworkCommandRequireDirectSend(24)).toBe(true); // DISCONNECTPLAYER
    expect(doesNetworkCommandRequireDirectSend(27)).toBe(true); // DISCONNECTVOTE
    expect(doesNetworkCommandRequireDirectSend(21)).toBe(true); // FRAMERESENDREQUEST

    expect(doesNetworkCommandRequireDirectSend(4)).toBe(false); // GAMECOMMAND
    expect(doesNetworkCommandRequireDirectSend(3)).toBe(false); // FRAMEINFO
    expect(doesNetworkCommandRequireDirectSend(23)).toBe(false); // DISCONNECTKEEPALIVE
  });
});

describe('isNetworkCommandSynchronized', () => {
  it('matches source synchronization policy from NetworkUtil.cpp', () => {
    expect(isNetworkCommandSynchronized(4)).toBe(true); // GAMECOMMAND
    expect(isNetworkCommandSynchronized(3)).toBe(true); // FRAMEINFO
    expect(isNetworkCommandSynchronized(5)).toBe(true); // PLAYERLEAVE
    expect(isNetworkCommandSynchronized(8)).toBe(true); // DESTROYPLAYER
    expect(isNetworkCommandSynchronized(7)).toBe(true); // RUNAHEAD

    expect(isNetworkCommandSynchronized(24)).toBe(false); // DISCONNECTPLAYER
    expect(isNetworkCommandSynchronized(27)).toBe(false); // DISCONNECTVOTE
    expect(isNetworkCommandSynchronized(23)).toBe(false); // DISCONNECTKEEPALIVE
  });
});
