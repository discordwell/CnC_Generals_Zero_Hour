import { describe, expect, it } from 'vitest';

import { DeterministicFrameState } from './frame-state.js';

describe('DeterministicFrameState', () => {
  it('tracks ready frames and expected frame ownership', () => {
    const state = new DeterministicFrameState();

    expect(state.isFrameReady()).toBe(false);
    expect(state.getExpectedNetworkFrame()).toBe(0);
    expect(state.getReadyFrames().size).toBe(0);

    state.markFrameReady(7);

    expect(state.isFrameReady()).toBe(true);
    expect(state.getExpectedNetworkFrame()).toBe(7);
    expect(state.getReadyFrames().has(7)).toBe(true);

    state.noteExpectedNetworkFrame(10);
    expect(state.getExpectedNetworkFrame()).toBe(10);
  });

  it('tracks pending notices and clamps decrements to zero', () => {
    const state = new DeterministicFrameState({
      initialPendingFrameNotices: 1,
    });

    state.incrementPendingFrameNotices();
    expect(state.getPendingFrameNotices()).toBe(2);

    state.decrementPendingFrameNotices();
    state.decrementPendingFrameNotices();
    state.decrementPendingFrameNotices();

    expect(state.getPendingFrameNotices()).toBe(0);
  });

  it('resets queue and counters', () => {
    const state = new DeterministicFrameState({
      initialFrameReady: true,
      initialExpectedNetworkFrame: 12,
      initialPendingFrameNotices: 2,
    });
    state.markFrameReady(12);

    state.reset({ initialFrameReady: false });

    expect(state.isFrameReady()).toBe(false);
    expect(state.getExpectedNetworkFrame()).toBe(0);
    expect(state.getPendingFrameNotices()).toBe(0);
    expect(state.getReadyFrames().size).toBe(0);
  });

  it('tracks per-player frame command counts and flags overflows', () => {
    const state = new DeterministicFrameState();
    const mismatches: Array<{ playerId: number; frame: number }> = [];
    state.onFrameCommandCountMismatch((mismatch) => {
      mismatches.push({ playerId: mismatch.playerId, frame: mismatch.frame });
    });

    state.setFrameCommandCount(1, 9, 2);
    expect(state.getExpectedFrameCommandCount(1, 9)).toBe(2);
    expect(state.getReceivedFrameCommandCount(1, 9)).toBe(0);
    expect(state.isFrameCommandCountSatisfied(1, 9)).toBe(false);

    state.recordFrameCommand(1, 9);
    state.recordFrameCommand(1, 9);
    expect(state.getReceivedFrameCommandCount(1, 9)).toBe(2);
    expect(state.isFrameCommandCountSatisfied(1, 9)).toBe(true);
    expect(state.hasAnyFrameCommandCountMismatch()).toBe(false);
    expect(state.hasObservedFrameCommandMismatch()).toBe(false);

    state.recordFrameCommand(1, 9);
    expect(state.hasFrameCommandCountMismatch(1, 9)).toBe(true);
    expect(state.hasAnyFrameCommandCountMismatch()).toBe(true);
    expect(state.hasObservedFrameCommandMismatch()).toBe(true);
    expect(mismatches).toEqual([{ playerId: 1, frame: 9 }]);

    expect(state.requestFrameResend(1, 9)).toBe(true);
    expect(state.requestFrameResend(1, 9)).toBe(false);
    expect(state.hasFrameResendRequest(1, 9)).toBe(true);
    expect(state.getFrameResendRequests()).toEqual([{ playerId: 1, frame: 9 }]);

    state.setFrameCommandCount(2, 9, 1);
    state.recordFrameCommand(2, 9);
    state.resetFrameCommandTracking(9, { excludePlayerId: 1 });
    expect(state.getExpectedFrameCommandCount(1, 9)).toBe(2);
    expect(state.getExpectedFrameCommandCount(2, 9)).toBeNull();
  });

  it('consumes frame command ownership data after frame execution', () => {
    const state = new DeterministicFrameState({ initialFrameReady: true });
    state.markFrameReady(6);
    state.setFrameCommandCount(1, 6, 1);
    state.recordFrameCommand(1, 6);
    state.recordFrameCommand(1, 6);
    state.requestFrameResend(1, 6);

    expect(state.getReadyFrames().has(6)).toBe(true);
    expect(state.hasFrameCommandCountMismatch(1, 6)).toBe(true);
    expect(state.hasFrameResendRequest(1, 6)).toBe(true);

    state.consumeFrameCommandData(6);

    expect(state.getReadyFrames().has(6)).toBe(false);
    expect(state.getExpectedFrameCommandCount(1, 6)).toBeNull();
    expect(state.getReceivedFrameCommandCount(1, 6)).toBe(0);
    expect(state.hasFrameCommandCountMismatch(1, 6)).toBe(false);
    expect(state.hasFrameResendRequest(1, 6)).toBe(false);
  });

  it('reports frame command readiness for connected players', () => {
    const state = new DeterministicFrameState();
    state.setFrameCommandCount(1, 4, 2);
    state.setFrameCommandCount(2, 4, 1);
    state.recordFrameCommand(1, 4);

    const beforeReady = state.getFrameCommandReadiness(4, [0, 1, 2], 0);
    expect(beforeReady.readyPlayers).toEqual([]);
    expect(beforeReady.pendingPlayers).toEqual([1, 2]);
    expect(state.areFrameCommandsReady(4, [0, 1, 2], 0)).toBe(false);

    state.recordFrameCommand(1, 4);
    state.recordFrameCommand(2, 4);

    const afterReady = state.getFrameCommandReadiness(4, [0, 1, 2], 0);
    expect(afterReady.readyPlayers).toEqual([1, 2]);
    expect(afterReady.pendingPlayers).toEqual([]);
    expect(state.areFrameCommandsReady(4, [0, 1, 2], 0)).toBe(true);
  });

  it('evaluates connected-slot command readiness with resend recovery', () => {
    const state = new DeterministicFrameState();
    state.setFrameCommandCount(1, 6, 1);
    state.setFrameCommandCount(2, 6, 1);
    state.recordFrameCommand(1, 6);
    state.recordFrameCommand(2, 6);
    state.recordFrameCommand(2, 6);

    const evaluation = state.evaluateFrameCommandReadiness(6, [0, 1, 2], 0);

    expect(evaluation.status).toBe('resend');
    expect(evaluation.readyPlayers).toEqual([1]);
    expect(evaluation.pendingPlayers).toEqual([2]);
    expect(evaluation.resendRequests).toEqual([{ playerId: 2, frame: 6 }]);
    expect(state.getExpectedFrameCommandCount(2, 6)).toBeNull();
    expect(state.getReceivedFrameCommandCount(2, 6)).toBe(0);
  });

  it('requests resend when frame commands arrive before frame command count', () => {
    const state = new DeterministicFrameState();
    expect(state.hasObservedFrameCommandMismatch()).toBe(false);
    state.recordFrameCommand(1, 3);

    const evaluation = state.evaluateFrameCommandReadiness(3, [0, 1], 0);

    expect(evaluation.status).toBe('resend');
    expect(evaluation.pendingPlayers).toEqual([1]);
    expect(evaluation.resendRequests).toEqual([{ playerId: 1, frame: 3 }]);
    expect(state.getFrameResendRequests()).toEqual([{ playerId: 1, frame: 3 }]);
    expect(state.hasObservedFrameCommandMismatch()).toBe(true);

    state.consumeFrameCommandData(3);
    expect(state.hasObservedFrameCommandMismatch()).toBe(true);

    state.reset();
    expect(state.hasObservedFrameCommandMismatch()).toBe(false);
  });

  it('resolves resend target with source-style connected-slot fallback', () => {
    const state = new DeterministicFrameState();

    expect(state.resolveFrameResendTarget(3, [0, 2, 3])).toBe(3);
    expect(state.resolveFrameResendTarget(3, [0, 2, 5])).toBe(0);
    expect(state.resolveFrameResendTarget(3, [])).toBeNull();
  });

  it('applies continuation gate after frame command readiness passes', () => {
    const state = new DeterministicFrameState();
    state.setFrameCommandCount(1, 8, 1);
    state.recordFrameCommand(1, 8);

    state.setContinuationGate(() => false);
    const blocked = state.evaluateFrameExecutionReadiness(8, [0, 1], 0);
    expect(blocked.status).toBe('ready');
    expect(blocked.continuationAllowed).toBe(false);
    expect(blocked.readyToAdvance).toBe(false);
    expect(blocked.disconnectScreenTransitionedToOff).toBe(false);

    state.setContinuationGate(() => true);
    const allowed = state.evaluateFrameExecutionReadiness(8, [0, 1], 0);
    expect(allowed.status).toBe('ready');
    expect(allowed.continuationAllowed).toBe(true);
    expect(allowed.readyToAdvance).toBe(true);
    expect(allowed.disconnectScreenTransitionedToOff).toBe(false);
  });

  it('flips disconnect continuation state off when ready frame is evaluated', () => {
    const state = new DeterministicFrameState();
    state.markDisconnectScreenOn();
    expect(state.getDisconnectContinuationState()).toBe('screen-on');

    state.setFrameCommandCount(1, 10, 1);
    state.recordFrameCommand(1, 10);
    const evaluation = state.evaluateFrameExecutionReadiness(10, [0, 1], 0);

    expect(evaluation.status).toBe('ready');
    expect(evaluation.readyToAdvance).toBe(true);
    expect(evaluation.disconnectScreenTransitionedToOff).toBe(true);
    expect(state.getDisconnectContinuationState()).toBe('screen-off');
  });

  it('evaluates disconnect stall timeout and keepalive pacing', () => {
    const state = new DeterministicFrameState();

    const initial = state.evaluateDisconnectStall(2, 1000, 500, 200);
    expect(initial.shouldTurnOnScreen).toBe(false);
    expect(initial.shouldSendKeepAlive).toBe(false);
    expect(initial.state).toBe('screen-off');

    const timedOut = state.evaluateDisconnectStall(2, 1601, 500, 200);
    expect(timedOut.shouldTurnOnScreen).toBe(true);
    expect(timedOut.shouldSendKeepAlive).toBe(true);
    expect(timedOut.state).toBe('screen-on');
    expect(timedOut.stalledDurationMs).toBe(601);

    const throttled = state.evaluateDisconnectStall(2, 1700, 500, 200);
    expect(throttled.shouldTurnOnScreen).toBe(false);
    expect(throttled.shouldSendKeepAlive).toBe(false);
    expect(throttled.state).toBe('screen-on');

    const paced = state.evaluateDisconnectStall(2, 1810, 500, 200);
    expect(paced.shouldTurnOnScreen).toBe(false);
    expect(paced.shouldSendKeepAlive).toBe(true);
    expect(paced.state).toBe('screen-on');

    const nextFrame = state.evaluateDisconnectStall(3, 1900, 500, 200);
    expect(nextFrame.shouldTurnOnScreen).toBe(false);
    expect(nextFrame.shouldSendKeepAlive).toBe(false);
    expect(nextFrame.stalledDurationMs).toBe(0);
  });

  it('tracks disconnect votes per frame and resets caster votes on disconnect updates', () => {
    const state = new DeterministicFrameState();

    state.recordDisconnectVote(2, 10, 1);
    state.recordDisconnectVote(3, 10, 1);
    state.recordDisconnectVote(2, 9, 4);

    expect(state.getDisconnectVoteCount(2, 10)).toBe(1);
    expect(state.getDisconnectVoteCount(3, 10)).toBe(1);
    expect(state.getDisconnectVoteCount(2, 9)).toBe(1);
    expect(state.hasDisconnectVote(2, 1)).toBe(true);
    expect(state.hasDisconnectVote(3, 1)).toBe(true);

    state.recordDisconnectFrame(1, 11, 0, [0, 1, 2, 3, 4]);
    expect(state.getDisconnectVoteCount(2, 10)).toBe(0);
    expect(state.getDisconnectVoteCount(3, 10)).toBe(0);
    expect(state.getDisconnectVoteCount(2, 9)).toBe(1);
    expect(state.hasDisconnectVote(2, 1)).toBe(false);

    state.recordDisconnectScreenOff(4, 9);
    expect(state.getDisconnectVoteCount(2, 9)).toBe(0);
    expect(state.hasDisconnectVote(2, 4)).toBe(false);
  });

  it('clears local disconnect votes when screen transitions off', () => {
    const state = new DeterministicFrameState();
    state.recordDisconnectVote(2, 5, 0);
    state.markDisconnectScreenOn();

    state.setFrameCommandCount(1, 5, 1);
    state.recordFrameCommand(1, 5);
    const evaluation = state.evaluateFrameExecutionReadiness(5, [0, 1], 0);

    expect(evaluation.disconnectScreenTransitionedToOff).toBe(true);
    expect(state.getDisconnectVoteCount(2, 5)).toBe(0);
    expect(state.hasDisconnectVote(2, 0)).toBe(false);
  });

  it('applies source slot translation and voted-out in-game gating', () => {
    const state = new DeterministicFrameState();

    expect(state.translatedSlotPosition(1, 2)).toBe(1);
    expect(state.translatedSlotPosition(2, 2)).toBe(-1);
    expect(state.translatedSlotPosition(4, 2)).toBe(3);
    expect(state.untranslatedSlotPosition(-1, 2)).toBe(2);
    expect(state.untranslatedSlotPosition(1, 2)).toBe(1);
    expect(state.untranslatedSlotPosition(3, 2)).toBe(4);

    state.recordDisconnectVote(1, 7, 0);
    expect(state.isDisconnectSlotVotedOut(1, 2, 3, 7)).toBe(false);
    state.recordDisconnectVote(1, 7, 4);
    expect(state.getDisconnectVoteCount(1, 7)).toBe(2);
    expect(state.isDisconnectSlotVotedOut(1, 2, 3, 7)).toBe(true);

    expect(state.isDisconnectPlayerInGame(1, 2, [0, 2, 4], 3, 7)).toBe(false);
    expect(state.isDisconnectPlayerInGame(3, 2, [0, 2, 4], 3, 7)).toBe(true);
    expect(state.isDisconnectPlayerInGame(3, 2, [0, 2, 4], 3, 7, [3])).toBe(false);
  });

  it('tracks disconnect frames and computes resend targets from source parity rules', () => {
    const state = new DeterministicFrameState();

    const localFrame = state.recordDisconnectFrame(0, 10, 0, [0, 1, 2]);
    expect(localFrame.accepted).toBe(true);
    expect(localFrame.resendTargets).toEqual([]);
    expect(state.getDisconnectFrame(0)).toBe(10);
    expect(state.hasDisconnectFrameReceipt(0)).toBe(true);

    const peerBehind = state.recordDisconnectFrame(1, 8, 0, [0, 1, 2]);
    expect(peerBehind.accepted).toBe(true);
    expect(peerBehind.resendTargets).toEqual([{ playerId: 1, frame: 8 }]);
    expect(state.hasDisconnectFrameReceipt(1)).toBe(true);

    const peerAhead = state.recordDisconnectFrame(2, 12, 0, [0, 1, 2]);
    expect(peerAhead.accepted).toBe(true);
    expect(peerAhead.resendTargets).toEqual([]);

    const newerLocalFrame = state.recordDisconnectFrame(0, 14, 0, [0, 1, 2]);
    expect(newerLocalFrame.accepted).toBe(true);
    expect(newerLocalFrame.resendTargets).toEqual([
      { playerId: 1, frame: 8 },
      { playerId: 2, frame: 12 },
    ]);
    expect(state.getMaxDisconnectFrame()).toBe(14);

    const stalePeer = state.recordDisconnectFrame(1, 7, 0, [0, 1, 2]);
    expect(stalePeer.accepted).toBe(false);
    expect(stalePeer.resendTargets).toEqual([]);
  });

  it('applies disconnect screen-off and frame-advance reset behavior', () => {
    const state = new DeterministicFrameState();

    state.recordDisconnectFrame(1, 9, 0, [0, 1]);
    expect(state.hasDisconnectFrameReceipt(1)).toBe(true);

    const rejected = state.recordDisconnectScreenOff(1, 8);
    expect(rejected.accepted).toBe(false);
    expect(state.hasDisconnectFrameReceipt(1)).toBe(true);
    expect(state.getDisconnectFrame(1)).toBe(9);

    const accepted = state.recordDisconnectScreenOff(1, 9);
    expect(accepted.accepted).toBe(true);
    expect(state.hasDisconnectFrameReceipt(1)).toBe(false);
    expect(state.getDisconnectFrame(1)).toBe(9);

    state.recordDisconnectFrame(1, 10, 0, [0, 1]);
    expect(state.hasDisconnectFrameReceipt(1)).toBe(true);
    state.notePlayerAdvancedFrame(1, 10);
    expect(state.hasDisconnectFrameReceipt(1)).toBe(false);
    expect(state.getDisconnectFrame(1)).toBe(10);

    state.notePlayerAdvancedFrame(1, 8);
    expect(state.getDisconnectFrame(1)).toBe(10);
  });

  it('tracks disconnect player timeout resets by translated slot', () => {
    const state = new DeterministicFrameState();
    state.markDisconnectScreenOn(100);
    state.resetDisconnectPlayerTimeouts(0, [0, 1, 2], 100);

    const translatedSlot = state.translatedSlotPosition(1, 0);
    expect(translatedSlot).toBe(0);
    expect(state.hasDisconnectPlayerTimedOut(translatedSlot, 1099, 1000)).toBe(false);
    expect(state.hasDisconnectPlayerTimedOut(translatedSlot, 1101, 1000)).toBe(true);

    state.resetDisconnectPlayerTimeoutForPlayer(1, 0, 1200);
    expect(state.hasDisconnectPlayerTimedOut(translatedSlot, 2100, 1000)).toBe(false);
    expect(state.hasDisconnectPlayerTimedOut(translatedSlot, 2201, 1000)).toBe(true);
  });

  it('evaluates packet-router wait timeout window from the reset timestamp', () => {
    const state = new DeterministicFrameState();

    expect(state.getPacketRouterTimeoutResetMs()).toBeNull();
    expect(state.evaluateWaitForPacketRouter(500, 1000)).toEqual({
      remainingMs: 1000,
      timedOut: false,
    });

    state.resetPacketRouterTimeout(200);
    expect(state.getPacketRouterTimeoutResetMs()).toBe(200);
    expect(state.evaluateWaitForPacketRouter(1000, 1000)).toEqual({
      remainingMs: 200,
      timedOut: false,
    });
    expect(state.evaluateWaitForPacketRouter(1201, 1000)).toEqual({
      remainingMs: 0,
      timedOut: true,
    });
  });

  it('clears packet-router wait timeout marker on reset', () => {
    const state = new DeterministicFrameState();
    state.resetPacketRouterTimeout(250);
    expect(state.getPacketRouterTimeoutResetMs()).toBe(250);

    state.reset();
    expect(state.getPacketRouterTimeoutResetMs()).toBeNull();
  });

  it('evaluates disconnect status with packet-router ownership and timeout-driven disconnects', () => {
    const state = new DeterministicFrameState();
    state.recordDisconnectFrame(0, 12, 0, [0, 1, 2]);
    state.recordDisconnectFrame(1, 12, 0, [0, 1, 2]);
    state.recordDisconnectFrame(2, 12, 0, [0, 1, 2]);
    state.markDisconnectScreenOn(1000);
    state.resetDisconnectPlayerTimeouts(0, [0, 1, 2], 1000);

    const notifyPass = state.evaluateDisconnectStatus({
      frame: 12,
      nowMs: 1700,
      localPlayerId: 0,
      connectedPlayerIds: [0, 1, 2],
      packetRouterSlot: 0,
      playerTimeoutMs: 1000,
      disconnectScreenNotifyTimeoutMs: 15000,
    });

    expect(notifyPass.shouldNotifyOthersOfCurrentFrame).toBe(true);
    expect(notifyPass.allOnSameFrame).toBe(true);
    expect(notifyPass.localPlayerIsNextPacketRouter).toBe(true);
    expect(notifyPass.playersToDisconnect).toEqual([]);

    const timeoutPass = state.evaluateDisconnectStatus({
      frame: 12,
      nowMs: 2200,
      localPlayerId: 0,
      connectedPlayerIds: [0, 1, 2],
      packetRouterSlot: 0,
      playerTimeoutMs: 1000,
      disconnectScreenNotifyTimeoutMs: 15000,
    });

    expect(timeoutPass.shouldNotifyOthersOfCurrentFrame).toBe(false);
    expect(timeoutPass.timedOutOrVotedOutPlayerIds).toEqual([1, 2]);
    expect(timeoutPass.playersToDisconnect).toEqual([1, 2]);
  });
});
