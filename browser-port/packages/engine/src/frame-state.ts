/**
 * Deterministic frame-readiness state used by the network/update boundary.
 *
 * Source references:
 * - Generals/Code/GameEngine/Source/GameNetwork/Network.cpp
 *   (m_frameDataReady lifecycle in update/isFrameDataReady)
 * - Generals/Code/GameEngine/Source/GameNetwork/FrameDataManager.cpp
 *   (frame-window queue/reset behavior)
 */

export interface DeterministicFrameStateOptions {
  initialFrameReady?: boolean;
  initialExpectedNetworkFrame?: number;
  initialPendingFrameNotices?: number;
}

export interface FrameCommandCountMismatch {
  playerId: number;
  frame: number;
  expectedCommandCount: number;
  receivedCommandCount: number;
}

export type FrameCommandCountMismatchListener =
  (mismatch: FrameCommandCountMismatch) => void;

export interface FrameResendRequest {
  playerId: number;
  frame: number;
}

export interface FrameCommandTrackingResetOptions {
  excludePlayerId?: number;
}

export interface FrameCommandReadiness {
  frame: number;
  readyPlayers: number[];
  pendingPlayers: number[];
}

export type FrameCommandEvaluationStatus = 'ready' | 'not-ready' | 'resend';

export interface FrameCommandEvaluation {
  frame: number;
  status: FrameCommandEvaluationStatus;
  readyPlayers: number[];
  pendingPlayers: number[];
  resendRequests: FrameResendRequest[];
}

export type FrameContinuationGate = (frame: number) => boolean;

export interface FrameExecutionEvaluation extends FrameCommandEvaluation {
  continuationAllowed: boolean;
  readyToAdvance: boolean;
  disconnectScreenTransitionedToOff: boolean;
}

export type DisconnectContinuationState = 'screen-on' | 'screen-off';

export interface DisconnectStallEvaluation {
  frame: number;
  state: DisconnectContinuationState;
  stalledDurationMs: number;
  shouldTurnOnScreen: boolean;
  shouldSendKeepAlive: boolean;
}

export interface DisconnectPlayerTimeoutStatus {
  playerId: number;
  translatedSlot: number;
  remainingMs: number;
  timedOut: boolean;
  votedOut: boolean;
}

export interface DisconnectStatusOptions {
  frame: number;
  nowMs: number;
  localPlayerId: number;
  connectedPlayerIds: Iterable<number>;
  packetRouterSlot: number;
  playerTimeoutMs: number;
  disconnectScreenNotifyTimeoutMs: number;
  packetRouterFallbackSlots?: Iterable<number>;
}

export interface DisconnectStatusEvaluation {
  frame: number;
  state: DisconnectContinuationState;
  shouldNotifyOthersOfCurrentFrame: boolean;
  playerTimeoutStatus: DisconnectPlayerTimeoutStatus[];
  timedOutTranslatedSlots: number[];
  timedOutOrVotedOutPlayerIds: number[];
  allOnSameFrame: boolean;
  localPlayerIsNextPacketRouter: boolean;
  playersToDisconnect: number[];
}

export interface PacketRouterTimeoutEvaluation {
  remainingMs: number;
  timedOut: boolean;
}

export interface DisconnectFrameResendTarget {
  playerId: number;
  frame: number;
}

export interface DisconnectFrameEvaluation {
  playerId: number;
  frame: number;
  accepted: boolean;
  resendTargets: DisconnectFrameResendTarget[];
}

export interface DisconnectScreenOffEvaluation {
  playerId: number;
  newFrame: number;
  accepted: boolean;
}

export interface DisconnectVote {
  slot: number;
  fromPlayerId: number;
  frame: number;
}

export interface DisconnectVoteEvaluation {
  slot: number;
  fromPlayerId: number;
  frame: number;
  voteCount: number;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number`);
  }
}

function assertDisconnectTranslatedSlot(value: number, name: string): void {
  if (!Number.isInteger(value) || value < -1) {
    throw new Error(`${name} must be an integer >= -1`);
  }
}

export class DeterministicFrameState {
  private frameReady: boolean;
  private expectedNetworkFrame: number;
  private pendingFrameNotices: number;
  private readonly frameQueueReady = new Set<number>();
  private readonly expectedFrameCommandCounts = new Map<string, number>();
  private readonly receivedFrameCommandCounts = new Map<string, number>();
  private readonly mismatchedFrameCommandCounts = new Set<string>();
  private readonly frameResendRequests = new Map<string, FrameResendRequest>();
  private sawFrameCommandMismatch = false;
  private readonly mismatchListeners = new Set<FrameCommandCountMismatchListener>();
  private continuationGate: FrameContinuationGate | null = null;
  private disconnectContinuationState: DisconnectContinuationState = 'screen-off';
  private disconnectObservedFrame: number | null = null;
  private disconnectLastFrameChangeTimeMs = -1;
  private lastDisconnectKeepAliveTimeMs = -1;
  private readonly disconnectPlayerTimeoutResetMs = new Map<number, number>();
  private disconnectScreenOnTimeMs = -1;
  private haveNotifiedOthersOfCurrentFrame = false;
  private packetRouterTimeoutResetMs = -1;
  private readonly disconnectFrames = new Map<number, number>();
  private readonly disconnectFramesReceived = new Set<number>();
  private readonly disconnectVotes = new Map<string, number>();

  constructor(options: DeterministicFrameStateOptions = {}) {
    const initialExpectedNetworkFrame = options.initialExpectedNetworkFrame ?? 0;
    const initialPendingFrameNotices = options.initialPendingFrameNotices ?? 0;
    assertNonNegativeInteger(initialExpectedNetworkFrame, 'initialExpectedNetworkFrame');
    assertNonNegativeInteger(initialPendingFrameNotices, 'initialPendingFrameNotices');

    this.frameReady = options.initialFrameReady ?? false;
    this.expectedNetworkFrame = initialExpectedNetworkFrame;
    this.pendingFrameNotices = initialPendingFrameNotices;
  }

  reset(options: DeterministicFrameStateOptions = {}): void {
    const initialExpectedNetworkFrame = options.initialExpectedNetworkFrame ?? 0;
    const initialPendingFrameNotices = options.initialPendingFrameNotices ?? 0;
    assertNonNegativeInteger(initialExpectedNetworkFrame, 'initialExpectedNetworkFrame');
    assertNonNegativeInteger(initialPendingFrameNotices, 'initialPendingFrameNotices');

    this.frameReady = options.initialFrameReady ?? false;
    this.expectedNetworkFrame = initialExpectedNetworkFrame;
    this.pendingFrameNotices = initialPendingFrameNotices;
    this.frameQueueReady.clear();
    this.expectedFrameCommandCounts.clear();
    this.receivedFrameCommandCounts.clear();
    this.mismatchedFrameCommandCounts.clear();
    this.frameResendRequests.clear();
    this.sawFrameCommandMismatch = false;
    this.disconnectContinuationState = 'screen-off';
    this.disconnectObservedFrame = null;
    this.disconnectLastFrameChangeTimeMs = -1;
    this.lastDisconnectKeepAliveTimeMs = -1;
    this.disconnectPlayerTimeoutResetMs.clear();
    this.disconnectScreenOnTimeMs = -1;
    this.haveNotifiedOthersOfCurrentFrame = false;
    this.packetRouterTimeoutResetMs = -1;
    this.disconnectFrames.clear();
    this.disconnectFramesReceived.clear();
    this.disconnectVotes.clear();
  }

  isFrameReady(): boolean {
    return this.frameReady;
  }

  setFrameReady(frameReady: boolean): void {
    this.frameReady = frameReady;
  }

  getExpectedNetworkFrame(): number {
    return this.expectedNetworkFrame;
  }

  setExpectedNetworkFrame(frame: number): void {
    assertNonNegativeInteger(frame, 'frame');
    this.expectedNetworkFrame = frame;
  }

  getPendingFrameNotices(): number {
    return this.pendingFrameNotices;
  }

  setPendingFrameNotices(count: number): void {
    assertNonNegativeInteger(count, 'count');
    this.pendingFrameNotices = count;
  }

  getReadyFrames(): Set<number> {
    return this.frameQueueReady;
  }

  clearReadyFrames(): void {
    this.frameQueueReady.clear();
  }

  noteExpectedNetworkFrame(frame: number): void {
    assertNonNegativeInteger(frame, 'frame');
    if (frame > this.expectedNetworkFrame) {
      this.expectedNetworkFrame = frame;
    }
  }

  markFrameReady(frame: number): void {
    assertNonNegativeInteger(frame, 'frame');
    this.noteExpectedNetworkFrame(frame);
    this.frameQueueReady.add(frame);
    this.frameReady = true;
  }

  incrementPendingFrameNotices(): void {
    this.pendingFrameNotices += 1;
    this.frameReady = true;
  }

  decrementPendingFrameNotices(): void {
    this.pendingFrameNotices = Math.max(0, this.pendingFrameNotices - 1);
  }

  setFrameCommandCount(playerId: number, frame: number, commandCount: number): void {
    assertNonNegativeInteger(playerId, 'playerId');
    assertNonNegativeInteger(frame, 'frame');
    assertNonNegativeInteger(commandCount, 'commandCount');

    const key = this.toFrameCommandKey(playerId, frame);
    this.expectedFrameCommandCounts.set(key, commandCount);
    this.maybeFlagCommandCountMismatch(playerId, frame, key);
  }

  recordFrameCommand(playerId: number, frame: number): number {
    assertNonNegativeInteger(playerId, 'playerId');
    assertNonNegativeInteger(frame, 'frame');

    const key = this.toFrameCommandKey(playerId, frame);
    const currentCount = this.receivedFrameCommandCounts.get(key) ?? 0;
    const nextCount = currentCount + 1;
    this.receivedFrameCommandCounts.set(key, nextCount);
    this.maybeFlagCommandCountMismatch(playerId, frame, key);
    return nextCount;
  }

  getExpectedFrameCommandCount(playerId: number, frame: number): number | null {
    assertNonNegativeInteger(playerId, 'playerId');
    assertNonNegativeInteger(frame, 'frame');

    const key = this.toFrameCommandKey(playerId, frame);
    const count = this.expectedFrameCommandCounts.get(key);
    return typeof count === 'number' ? count : null;
  }

  getReceivedFrameCommandCount(playerId: number, frame: number): number {
    assertNonNegativeInteger(playerId, 'playerId');
    assertNonNegativeInteger(frame, 'frame');

    const key = this.toFrameCommandKey(playerId, frame);
    return this.receivedFrameCommandCounts.get(key) ?? 0;
  }

  isFrameCommandCountSatisfied(playerId: number, frame: number): boolean {
    const expected = this.getExpectedFrameCommandCount(playerId, frame);
    if (expected === null) {
      return false;
    }

    const received = this.getReceivedFrameCommandCount(playerId, frame);
    return received === expected;
  }

  hasAnyFrameCommandCountMismatch(): boolean {
    return this.mismatchedFrameCommandCounts.size > 0;
  }

  /**
   * Source parity:
   * - FrameData::allCommandsReady mismatch/overflow paths are treated as
   *   deterministic command-count validation failures until a full state reset.
   */
  hasObservedFrameCommandMismatch(): boolean {
    return this.sawFrameCommandMismatch || this.mismatchedFrameCommandCounts.size > 0;
  }

  hasFrameCommandCountMismatch(playerId: number, frame: number): boolean {
    assertNonNegativeInteger(playerId, 'playerId');
    assertNonNegativeInteger(frame, 'frame');
    return this.mismatchedFrameCommandCounts.has(this.toFrameCommandKey(playerId, frame));
  }

  onFrameCommandCountMismatch(listener: FrameCommandCountMismatchListener): () => void {
    this.mismatchListeners.add(listener);
    return () => {
      this.mismatchListeners.delete(listener);
    };
  }

  requestFrameResend(playerId: number, frame: number): boolean {
    assertNonNegativeInteger(playerId, 'playerId');
    assertNonNegativeInteger(frame, 'frame');

    const key = this.toFrameCommandKey(playerId, frame);
    this.sawFrameCommandMismatch = true;
    if (this.frameResendRequests.has(key)) {
      return false;
    }
    this.frameResendRequests.set(key, {
      playerId,
      frame,
    });
    return true;
  }

  getFrameResendRequests(): ReadonlyArray<FrameResendRequest> {
    return Array.from(this.frameResendRequests.values());
  }

  hasFrameResendRequest(playerId: number, frame: number): boolean {
    assertNonNegativeInteger(playerId, 'playerId');
    assertNonNegativeInteger(frame, 'frame');
    return this.frameResendRequests.has(this.toFrameCommandKey(playerId, frame));
  }

  clearFrameResendRequests(): void {
    this.frameResendRequests.clear();
  }

  resetFrameCommandTracking(frame: number, options: FrameCommandTrackingResetOptions = {}): void {
    assertNonNegativeInteger(frame, 'frame');
    const excludePlayerId = options.excludePlayerId;
    if (typeof excludePlayerId === 'number') {
      assertNonNegativeInteger(excludePlayerId, 'excludePlayerId');
    }

    this.deleteFrameTrackingEntries(this.expectedFrameCommandCounts, frame, excludePlayerId);
    this.deleteFrameTrackingEntries(this.receivedFrameCommandCounts, frame, excludePlayerId);
    this.deleteFrameTrackingEntries(this.mismatchedFrameCommandCounts, frame, excludePlayerId);
  }

  /**
   * Source parity:
   * - ConnectionManager::getFrameCommandList consumes a frame and then resets
   *   frame data ownership for that consumed frame.
   */
  consumeFrameCommandData(frame: number): void {
    assertNonNegativeInteger(frame, 'frame');
    this.frameQueueReady.delete(frame);
    this.resetFrameCommandTracking(frame);
    this.deleteFrameTrackingEntries(this.frameResendRequests, frame);
  }

  getFrameCommandReadiness(
    frame: number,
    playerIds: Iterable<number>,
    localPlayerId?: number,
  ): FrameCommandReadiness {
    assertNonNegativeInteger(frame, 'frame');
    if (typeof localPlayerId === 'number') {
      assertNonNegativeInteger(localPlayerId, 'localPlayerId');
    }

    const readyPlayers: number[] = [];
    const pendingPlayers: number[] = [];
    const uniquePlayers = this.getUniquePlayerIds(playerIds);

    for (const playerId of uniquePlayers) {
      if (typeof localPlayerId === 'number' && playerId === localPlayerId) {
        continue;
      }

      const expected = this.getExpectedFrameCommandCount(playerId, frame);
      if (expected === null) {
        pendingPlayers.push(playerId);
        continue;
      }

      const received = this.getReceivedFrameCommandCount(playerId, frame);
      if (received === expected) {
        readyPlayers.push(playerId);
      } else {
        pendingPlayers.push(playerId);
      }
    }

    return {
      frame,
      readyPlayers,
      pendingPlayers,
    };
  }

  /**
   * Source parity:
   * - ConnectionManager::allCommandsReady (slot iteration + resend handling)
   * - FrameData::allCommandsReady (count overflow triggers resend/reset)
   */
  evaluateFrameCommandReadiness(
    frame: number,
    playerIds: Iterable<number>,
    localPlayerId?: number,
  ): FrameCommandEvaluation {
    assertNonNegativeInteger(frame, 'frame');
    if (typeof localPlayerId === 'number') {
      assertNonNegativeInteger(localPlayerId, 'localPlayerId');
    }

    const readyPlayers: number[] = [];
    const pendingPlayers: number[] = [];
    const resendRequests: FrameResendRequest[] = [];
    const uniquePlayers = this.getUniquePlayerIds(playerIds);

    for (const playerId of uniquePlayers) {
      if (typeof localPlayerId === 'number' && playerId === localPlayerId) {
        continue;
      }

      const expected = this.getExpectedFrameCommandCount(playerId, frame);
      const received = this.getReceivedFrameCommandCount(playerId, frame);
      const hasOverflow = expected === null
        ? received > 0
        : received > expected;

      if (hasOverflow) {
        if (this.requestFrameResend(playerId, frame)) {
          resendRequests.push({ playerId, frame });
        }
        pendingPlayers.push(playerId);
        continue;
      }

      if (expected === null || received < expected) {
        pendingPlayers.push(playerId);
        continue;
      }

      readyPlayers.push(playerId);
    }

    if (resendRequests.length > 0) {
      this.resetFrameCommandTracking(frame, { excludePlayerId: localPlayerId });
      return {
        frame,
        status: 'resend',
        readyPlayers,
        pendingPlayers,
        resendRequests,
      };
    }

    return {
      frame,
      status: pendingPlayers.length > 0 ? 'not-ready' : 'ready',
      readyPlayers,
      pendingPlayers,
      resendRequests,
    };
  }

  areFrameCommandsReady(frame: number, playerIds: Iterable<number>, localPlayerId?: number): boolean {
    return this.getFrameCommandReadiness(frame, playerIds, localPlayerId).pendingPlayers.length === 0;
  }

  /**
   * Source parity:
   * - ConnectionManager::allCommandsReady invokes DisconnectManager::allowedToContinue
   *   after command readiness passes.
   */
  setContinuationGate(gate: FrameContinuationGate | null): void {
    this.continuationGate = gate;
  }

  evaluateFrameExecutionReadiness(
    frame: number,
    playerIds: Iterable<number>,
    localPlayerId?: number,
  ): FrameExecutionEvaluation {
    const commandEvaluation = this.evaluateFrameCommandReadiness(frame, playerIds, localPlayerId);
    let disconnectScreenTransitionedToOff = false;
    if (commandEvaluation.status === 'ready') {
      const wasScreenOn = this.disconnectContinuationState === 'screen-on';
      // Source parity: DisconnectManager::allCommandsReady flips screen state off
      // before allowedToContinue() is evaluated.
      this.markDisconnectScreenOff();
      disconnectScreenTransitionedToOff = wasScreenOn;
      if (wasScreenOn && typeof localPlayerId === 'number') {
        // Source parity: DisconnectManager::allCommandsReady clears local votes when
        // transitioning the disconnect screen back to off.
        this.clearDisconnectVotesFromPlayer(localPlayerId);
      }
    }

    const continuationAllowed = commandEvaluation.status === 'ready'
      ? this.disconnectContinuationState === 'screen-off'
        && this.isContinuationAllowed(commandEvaluation.frame)
      : true;

    return {
      ...commandEvaluation,
      continuationAllowed,
      readyToAdvance: commandEvaluation.status === 'ready' && continuationAllowed,
      disconnectScreenTransitionedToOff,
    };
  }

  isContinuationAllowed(frame: number): boolean {
    assertNonNegativeInteger(frame, 'frame');
    const gate = this.continuationGate;
    if (!gate) {
      return true;
    }
    return gate(frame);
  }

  markDisconnectScreenOn(nowMs?: number): void {
    if (typeof nowMs === 'number') {
      assertNonNegativeFinite(nowMs, 'nowMs');
    }
    if (this.disconnectContinuationState !== 'screen-on') {
      this.haveNotifiedOthersOfCurrentFrame = false;
    }
    this.disconnectContinuationState = 'screen-on';
    if (typeof nowMs === 'number') {
      this.disconnectScreenOnTimeMs = nowMs;
    }
  }

  markDisconnectScreenOff(): void {
    this.disconnectContinuationState = 'screen-off';
    this.disconnectScreenOnTimeMs = -1;
    this.haveNotifiedOthersOfCurrentFrame = false;
  }

  getDisconnectContinuationState(): DisconnectContinuationState {
    return this.disconnectContinuationState;
  }

  getDisconnectFrame(playerId: number): number {
    assertNonNegativeInteger(playerId, 'playerId');
    return this.disconnectFrames.get(playerId) ?? 0;
  }

  hasDisconnectFrameReceipt(playerId: number): boolean {
    assertNonNegativeInteger(playerId, 'playerId');
    return this.disconnectFramesReceived.has(playerId);
  }

  getMaxDisconnectFrame(): number {
    let maxFrame = 0;
    for (const frame of this.disconnectFrames.values()) {
      if (frame > maxFrame) {
        maxFrame = frame;
      }
    }
    return maxFrame;
  }

  /**
   * Source parity:
   * - DisconnectManager::applyDisconnectVote
   * - DisconnectManager::countVotesForPlayer
   */
  recordDisconnectVote(slot: number, frame: number, fromPlayerId: number): DisconnectVoteEvaluation {
    assertNonNegativeInteger(slot, 'slot');
    assertNonNegativeInteger(frame, 'frame');
    assertNonNegativeInteger(fromPlayerId, 'fromPlayerId');

    this.disconnectVotes.set(this.toDisconnectVoteKey(slot, fromPlayerId), frame);
    return {
      slot,
      fromPlayerId,
      frame,
      voteCount: this.getDisconnectVoteCount(slot, frame),
    };
  }

  getDisconnectVoteCount(slot: number, frame: number): number {
    assertNonNegativeInteger(slot, 'slot');
    assertNonNegativeInteger(frame, 'frame');

    let voteCount = 0;
    for (const [key, voteFrame] of this.disconnectVotes.entries()) {
      const [targetToken] = key.split(':');
      const targetSlot = Number.parseInt(targetToken ?? '', 10);
      if (!Number.isInteger(targetSlot) || targetSlot !== slot) {
        continue;
      }
      if (voteFrame === frame) {
        voteCount += 1;
      }
    }
    return voteCount;
  }

  hasDisconnectVote(slot: number, fromPlayerId: number): boolean {
    assertNonNegativeInteger(slot, 'slot');
    assertNonNegativeInteger(fromPlayerId, 'fromPlayerId');
    return this.disconnectVotes.has(this.toDisconnectVoteKey(slot, fromPlayerId));
  }

  /**
   * Source parity:
   * - DisconnectManager::translatedSlotPosition
   */
  translatedSlotPosition(slot: number, localPlayerId: number): number {
    assertNonNegativeInteger(slot, 'slot');
    assertNonNegativeInteger(localPlayerId, 'localPlayerId');

    if (slot < localPlayerId) {
      return slot;
    }

    if (slot === localPlayerId) {
      return -1;
    }

    return slot - 1;
  }

  /**
   * Source parity:
   * - DisconnectManager::untranslatedSlotPosition
   */
  untranslatedSlotPosition(slot: number, localPlayerId: number): number {
    assertDisconnectTranslatedSlot(slot, 'slot');
    assertNonNegativeInteger(localPlayerId, 'localPlayerId');

    if (slot === -1) {
      return localPlayerId;
    }

    if (slot < localPlayerId) {
      return slot;
    }

    return slot + 1;
  }

  /**
   * Source parity:
   * - DisconnectManager::isPlayerVotedOut
   * - DisconnectManager::countVotesForPlayer
   */
  isDisconnectSlotVotedOut(
    slot: number,
    localPlayerId: number,
    connectedPlayerCount: number,
    frame: number,
  ): boolean {
    assertDisconnectTranslatedSlot(slot, 'slot');
    assertNonNegativeInteger(localPlayerId, 'localPlayerId');
    assertNonNegativeInteger(connectedPlayerCount, 'connectedPlayerCount');
    assertNonNegativeInteger(frame, 'frame');

    if (slot === -1) {
      return false;
    }

    const targetSlot = this.untranslatedSlotPosition(slot, localPlayerId);
    const voteCount = this.getDisconnectVoteCount(targetSlot, frame);
    const requiredVotes = Math.max(0, connectedPlayerCount - 1);
    return voteCount >= requiredVotes;
  }

  /**
   * Source parity:
   * - DisconnectManager::isPlayerInGame
   *
   * Timeout state is caller-provided until timeout ownership is engine-owned.
   */
  isDisconnectPlayerInGame(
    slot: number,
    localPlayerId: number,
    connectedPlayerIds: Iterable<number>,
    connectedPlayerCount: number,
    frame: number,
    timedOutTranslatedSlots: Iterable<number> = [],
  ): boolean {
    assertDisconnectTranslatedSlot(slot, 'slot');
    assertNonNegativeInteger(localPlayerId, 'localPlayerId');
    assertNonNegativeInteger(connectedPlayerCount, 'connectedPlayerCount');
    assertNonNegativeInteger(frame, 'frame');

    const connectedPlayers = new Set(this.getUniquePlayerIds(connectedPlayerIds));
    const translatedTimedOutSlots = new Set<number>();
    for (const timedOutSlot of timedOutTranslatedSlots) {
      assertDisconnectTranslatedSlot(timedOutSlot, 'timedOutSlot');
      translatedTimedOutSlots.add(timedOutSlot);
    }

    const untranslatedSlot = this.untranslatedSlotPosition(slot, localPlayerId);
    if (!connectedPlayers.has(untranslatedSlot)) {
      return false;
    }

    if (this.isDisconnectSlotVotedOut(slot, localPlayerId, connectedPlayerCount, frame)) {
      return false;
    }

    if (translatedTimedOutSlots.has(slot)) {
      return false;
    }

    return true;
  }

  /**
   * Source parity:
   * - DisconnectManager::resetPlayersVotes
   */
  resetDisconnectVotesFromPlayer(playerId: number, frame: number): void {
    assertNonNegativeInteger(playerId, 'playerId');
    assertNonNegativeInteger(frame, 'frame');

    const keysToDelete: string[] = [];
    for (const [key, voteFrame] of this.disconnectVotes.entries()) {
      const [, casterToken] = key.split(':');
      const castingPlayerId = Number.parseInt(casterToken ?? '', 10);
      if (!Number.isInteger(castingPlayerId) || castingPlayerId !== playerId) {
        continue;
      }
      if (voteFrame <= frame) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.disconnectVotes.delete(key);
    }
  }

  clearDisconnectVotesFromPlayer(playerId: number): void {
    assertNonNegativeInteger(playerId, 'playerId');

    const keysToDelete: string[] = [];
    for (const key of this.disconnectVotes.keys()) {
      const [, casterToken] = key.split(':');
      const castingPlayerId = Number.parseInt(casterToken ?? '', 10);
      if (!Number.isInteger(castingPlayerId) || castingPlayerId !== playerId) {
        continue;
      }
      keysToDelete.push(key);
    }

    for (const key of keysToDelete) {
      this.disconnectVotes.delete(key);
    }
  }

  /**
   * Source parity:
   * - DisconnectManager::processDisconnectFrame
   * - DisconnectManager::playerHasAdvancedAFrame
   */
  recordDisconnectFrame(
    playerId: number,
    frame: number,
    localPlayerId: number,
    inGamePlayerIds: Iterable<number>,
  ): DisconnectFrameEvaluation {
    assertNonNegativeInteger(playerId, 'playerId');
    assertNonNegativeInteger(frame, 'frame');
    assertNonNegativeInteger(localPlayerId, 'localPlayerId');

    const currentFrame = this.getDisconnectFrame(playerId);
    if (currentFrame >= frame) {
      return {
        playerId,
        frame,
        accepted: false,
        resendTargets: [],
      };
    }

    const resetVoteFrame = frame > 0 ? frame - 1 : 0;
    this.resetDisconnectVotesFromPlayer(playerId, resetVoteFrame);
    this.disconnectFrames.set(playerId, frame);
    this.disconnectFramesReceived.add(playerId);

    const resendTargets: DisconnectFrameResendTarget[] = [];
    const localDisconnectFrame = this.getDisconnectFrame(localPlayerId);
    if (playerId === localPlayerId) {
      for (const candidatePlayerId of this.getUniquePlayerIds(inGamePlayerIds)) {
        if (candidatePlayerId === localPlayerId) {
          continue;
        }

        if (!this.disconnectFramesReceived.has(candidatePlayerId)) {
          continue;
        }

        const candidateFrame = this.getDisconnectFrame(candidatePlayerId);
        if (candidateFrame < localDisconnectFrame) {
          resendTargets.push({
            playerId: candidatePlayerId,
            frame: candidateFrame,
          });
        }
      }
    } else if (frame < localDisconnectFrame && this.disconnectFramesReceived.has(playerId)) {
      resendTargets.push({
        playerId,
        frame,
      });
    }

    return {
      playerId,
      frame,
      accepted: true,
      resendTargets,
    };
  }

  /**
   * Source parity:
   * - DisconnectManager::processDisconnectScreenOff
   */
  recordDisconnectScreenOff(playerId: number, newFrame: number): DisconnectScreenOffEvaluation {
    assertNonNegativeInteger(playerId, 'playerId');
    assertNonNegativeInteger(newFrame, 'newFrame');

    const currentFrame = this.getDisconnectFrame(playerId);
    if (newFrame < currentFrame) {
      return {
        playerId,
        newFrame,
        accepted: false,
      };
    }

    this.resetDisconnectVotesFromPlayer(playerId, newFrame);
    this.disconnectFramesReceived.delete(playerId);
    this.disconnectFrames.set(playerId, newFrame);
    return {
      playerId,
      newFrame,
      accepted: true,
    };
  }

  notePlayerAdvancedFrame(playerId: number, frame: number): void {
    assertNonNegativeInteger(playerId, 'playerId');
    assertNonNegativeInteger(frame, 'frame');

    if (frame < this.getDisconnectFrame(playerId)) {
      return;
    }

    this.disconnectFrames.set(playerId, frame);
    this.disconnectFramesReceived.delete(playerId);
  }

  /**
   * Source parity:
   * - DisconnectManager::resetPlayerTimeouts
   * - DisconnectManager::resetPlayerTimeout
   */
  resetDisconnectPlayerTimeouts(
    localPlayerId: number,
    connectedPlayerIds: Iterable<number>,
    nowMs: number,
  ): void {
    assertNonNegativeInteger(localPlayerId, 'localPlayerId');
    assertNonNegativeFinite(nowMs, 'nowMs');

    for (const playerId of this.getUniquePlayerIds(connectedPlayerIds)) {
      const translatedSlot = this.translatedSlotPosition(playerId, localPlayerId);
      if (translatedSlot < 0) {
        continue;
      }
      this.disconnectPlayerTimeoutResetMs.set(translatedSlot, nowMs);
    }
  }

  resetDisconnectPlayerTimeoutForPlayer(playerId: number, localPlayerId: number, nowMs: number): void {
    assertNonNegativeInteger(playerId, 'playerId');
    assertNonNegativeInteger(localPlayerId, 'localPlayerId');
    assertNonNegativeFinite(nowMs, 'nowMs');

    const translatedSlot = this.translatedSlotPosition(playerId, localPlayerId);
    if (translatedSlot < 0) {
      return;
    }
    this.disconnectPlayerTimeoutResetMs.set(translatedSlot, nowMs);
  }

  /**
   * Source parity:
   * - DisconnectManager::resetPacketRouterTimeout
   */
  resetPacketRouterTimeout(nowMs: number): void {
    assertNonNegativeFinite(nowMs, 'nowMs');
    this.packetRouterTimeoutResetMs = nowMs;
  }

  getPacketRouterTimeoutResetMs(): number | null {
    return this.packetRouterTimeoutResetMs >= 0 ? this.packetRouterTimeoutResetMs : null;
  }

  /**
   * Source parity:
   * - DisconnectManager::updateWaitForPacketRouter
   *
   * Native logic currently comments out the quit-game/UI path. This evaluator
   * preserves the timeout calculation as engine-owned state so transport/UI
   * boundaries can consume it directly.
   */
  evaluateWaitForPacketRouter(nowMs: number, playerTimeoutMs: number): PacketRouterTimeoutEvaluation {
    assertNonNegativeFinite(nowMs, 'nowMs');
    assertNonNegativeFinite(playerTimeoutMs, 'playerTimeoutMs');

    const timeoutStartMs = this.packetRouterTimeoutResetMs >= 0
      ? this.packetRouterTimeoutResetMs
      : nowMs;
    const elapsedMs = Math.max(0, nowMs - timeoutStartMs);
    const remainingMs = playerTimeoutMs - elapsedMs;
    return {
      remainingMs: Math.max(0, remainingMs),
      timedOut: remainingMs < 0,
    };
  }

  hasDisconnectPlayerTimedOut(
    translatedSlot: number,
    nowMs: number,
    playerTimeoutMs: number,
  ): boolean {
    assertDisconnectTranslatedSlot(translatedSlot, 'translatedSlot');
    assertNonNegativeFinite(nowMs, 'nowMs');
    assertNonNegativeFinite(playerTimeoutMs, 'playerTimeoutMs');

    if (translatedSlot < 0) {
      return false;
    }
    const lastResetMs = this.disconnectPlayerTimeoutResetMs.get(translatedSlot) ?? nowMs;
    const remainingMs = playerTimeoutMs - Math.max(0, nowMs - lastResetMs);
    return remainingMs < 0;
  }

  /**
   * Source parity:
   * - DisconnectManager::updateDisconnectStatus
   * - DisconnectManager::allOnSameFrame
   * - DisconnectManager::isLocalPlayerNextPacketRouter
   */
  evaluateDisconnectStatus(options: DisconnectStatusOptions): DisconnectStatusEvaluation {
    assertNonNegativeInteger(options.frame, 'frame');
    assertNonNegativeFinite(options.nowMs, 'nowMs');
    assertNonNegativeInteger(options.localPlayerId, 'localPlayerId');
    assertNonNegativeFinite(options.playerTimeoutMs, 'playerTimeoutMs');
    assertNonNegativeFinite(options.disconnectScreenNotifyTimeoutMs, 'disconnectScreenNotifyTimeoutMs');

    const connectedPlayerIds = this.getUniquePlayerIds(options.connectedPlayerIds);
    const connectedPlayerCount = connectedPlayerIds.length;
    const shouldEvaluateDisconnectState = this.disconnectContinuationState === 'screen-on';
    const playerTimeoutStatus: DisconnectPlayerTimeoutStatus[] = [];
    const timedOutTranslatedSlots: number[] = [];
    const timedOutOrVotedOutPlayerIds: number[] = [];
    let shouldNotifyOthersOfCurrentFrame = false;

    if (shouldEvaluateDisconnectState) {
      for (const playerId of connectedPlayerIds) {
        const translatedSlot = this.translatedSlotPosition(playerId, options.localPlayerId);
        if (translatedSlot < 0) {
          continue;
        }

        const lastResetMs = this.disconnectPlayerTimeoutResetMs.get(translatedSlot) ?? options.nowMs;
        const elapsedMs = Math.max(0, options.nowMs - lastResetMs);
        const remainingMs = options.playerTimeoutMs - elapsedMs;
        const timedOut = remainingMs < 0;
        const votedOut = this.isDisconnectSlotVotedOut(
          translatedSlot,
          options.localPlayerId,
          connectedPlayerCount,
          options.frame,
        );

        playerTimeoutStatus.push({
          playerId,
          translatedSlot,
          remainingMs: Math.max(0, remainingMs),
          timedOut,
          votedOut,
        });
        if (timedOut) {
          timedOutTranslatedSlots.push(translatedSlot);
        }
        if (timedOut || votedOut) {
          timedOutOrVotedOutPlayerIds.push(playerId);
        }

        if (!this.haveNotifiedOthersOfCurrentFrame) {
          if (remainingMs < (options.playerTimeoutMs / 3) || votedOut) {
            shouldNotifyOthersOfCurrentFrame = true;
          } else if (
            this.disconnectScreenOnTimeMs >= 0
            && (options.nowMs - this.disconnectScreenOnTimeMs) > options.disconnectScreenNotifyTimeoutMs
          ) {
            shouldNotifyOthersOfCurrentFrame = true;
          }
        }
      }
    }

    if (shouldNotifyOthersOfCurrentFrame) {
      this.haveNotifiedOthersOfCurrentFrame = true;
    }

    const allOnSameFrame = shouldEvaluateDisconnectState
      ? this.areDisconnectPlayersOnSameFrame(
        options.localPlayerId,
        connectedPlayerIds,
        connectedPlayerCount,
        options.frame,
        timedOutTranslatedSlots,
      )
      : false;
    const localPlayerIsNextPacketRouter = shouldEvaluateDisconnectState
      ? this.isLocalPlayerNextPacketRouter(
        options.localPlayerId,
        options.packetRouterSlot,
        connectedPlayerIds,
        connectedPlayerCount,
        options.frame,
        timedOutTranslatedSlots,
        options.packetRouterFallbackSlots,
      )
      : false;
    const playersToDisconnect = allOnSameFrame && localPlayerIsNextPacketRouter
      ? timedOutOrVotedOutPlayerIds
      : [];

    return {
      frame: options.frame,
      state: this.disconnectContinuationState,
      shouldNotifyOthersOfCurrentFrame,
      playerTimeoutStatus,
      timedOutTranslatedSlots,
      timedOutOrVotedOutPlayerIds,
      allOnSameFrame,
      localPlayerIsNextPacketRouter,
      playersToDisconnect,
    };
  }

  /**
   * Source parity:
   * - DisconnectManager::update + turnOnScreen + sendKeepAlive pacing.
   */
  evaluateDisconnectStall(
    frame: number,
    nowMs: number,
    disconnectTimeoutMs: number,
    keepAliveIntervalMs = 500,
  ): DisconnectStallEvaluation {
    assertNonNegativeInteger(frame, 'frame');
    assertNonNegativeFinite(nowMs, 'nowMs');
    assertNonNegativeFinite(disconnectTimeoutMs, 'disconnectTimeoutMs');
    assertNonNegativeFinite(keepAliveIntervalMs, 'keepAliveIntervalMs');

    if (
      this.disconnectObservedFrame === null
      || this.disconnectLastFrameChangeTimeMs < 0
      || this.disconnectObservedFrame !== frame
    ) {
      this.disconnectObservedFrame = frame;
      this.disconnectLastFrameChangeTimeMs = nowMs;
      return {
        frame,
        state: this.disconnectContinuationState,
        stalledDurationMs: 0,
        shouldTurnOnScreen: false,
        shouldSendKeepAlive: false,
      };
    }

    const stalledDurationMs = Math.max(0, nowMs - this.disconnectLastFrameChangeTimeMs);
    const timedOut = stalledDurationMs > disconnectTimeoutMs;
    const shouldTurnOnScreen = timedOut && this.disconnectContinuationState === 'screen-off';
    if (shouldTurnOnScreen) {
      this.markDisconnectScreenOn(nowMs);
      this.lastDisconnectKeepAliveTimeMs = -1;
    }

    let shouldSendKeepAlive = false;
    if (timedOut) {
      if (
        this.lastDisconnectKeepAliveTimeMs < 0
        || (nowMs - this.lastDisconnectKeepAliveTimeMs) > keepAliveIntervalMs
      ) {
        this.lastDisconnectKeepAliveTimeMs = nowMs;
        shouldSendKeepAlive = true;
      }
    }

    return {
      frame,
      state: this.disconnectContinuationState,
      stalledDurationMs,
      shouldTurnOnScreen,
      shouldSendKeepAlive,
    };
  }

  /**
   * Source parity:
   * - ConnectionManager::requestFrameDataResend fallback behavior.
   *   If requested slot is disconnected, pick first connected slot.
   */
  resolveFrameResendTarget(playerId: number, connectedPlayerIds: Iterable<number>): number | null {
    assertNonNegativeInteger(playerId, 'playerId');
    const connectedPlayers = this.getUniquePlayerIds(connectedPlayerIds);
    if (connectedPlayers.length === 0) {
      return null;
    }

    if (connectedPlayers.includes(playerId)) {
      return playerId;
    }

    return Math.min(...connectedPlayers);
  }

  private areDisconnectPlayersOnSameFrame(
    localPlayerId: number,
    connectedPlayerIds: ReadonlyArray<number>,
    connectedPlayerCount: number,
    frame: number,
    timedOutTranslatedSlots: ReadonlyArray<number>,
  ): boolean {
    const localDisconnectFrame = this.getDisconnectFrame(localPlayerId);
    for (const playerId of connectedPlayerIds) {
      const translatedSlot = this.translatedSlotPosition(playerId, localPlayerId);
      if (translatedSlot < 0) {
        continue;
      }
      if (!this.isDisconnectPlayerInGame(
        translatedSlot,
        localPlayerId,
        connectedPlayerIds,
        connectedPlayerCount,
        frame,
        timedOutTranslatedSlots,
      )) {
        continue;
      }
      if (!this.hasDisconnectFrameReceipt(playerId)) {
        return false;
      }
      if (this.getDisconnectFrame(playerId) !== localDisconnectFrame) {
        return false;
      }
    }
    return true;
  }

  private isLocalPlayerNextPacketRouter(
    localPlayerId: number,
    packetRouterSlot: number,
    connectedPlayerIds: ReadonlyArray<number>,
    connectedPlayerCount: number,
    frame: number,
    timedOutTranslatedSlots: ReadonlyArray<number>,
    packetRouterFallbackSlots?: Iterable<number>,
  ): boolean {
    if (!Number.isInteger(packetRouterSlot) || packetRouterSlot < 0) {
      return false;
    }

    let candidatePacketRouter = packetRouterSlot;
    const maxIterations = Math.max(1, connectedPlayerIds.length + 1);
    let iterations = 0;
    while (iterations < maxIterations) {
      const translatedSlot = this.translatedSlotPosition(candidatePacketRouter, localPlayerId);
      if (
        translatedSlot < 0
        || this.isDisconnectPlayerInGame(
          translatedSlot,
          localPlayerId,
          connectedPlayerIds,
          connectedPlayerCount,
          frame,
          timedOutTranslatedSlots,
        )
      ) {
        return candidatePacketRouter === localPlayerId;
      }

      const nextPacketRouter = this.resolveNextPacketRouterSlot(
        candidatePacketRouter,
        connectedPlayerIds,
        packetRouterFallbackSlots,
      );
      if (nextPacketRouter === null) {
        return false;
      }
      candidatePacketRouter = nextPacketRouter;
      iterations += 1;
    }

    return false;
  }

  private resolveNextPacketRouterSlot(
    packetRouterSlot: number,
    connectedPlayerIds: ReadonlyArray<number>,
    packetRouterFallbackSlots?: Iterable<number>,
  ): number | null {
    const fallbackCandidates = packetRouterFallbackSlots
      ? this.getUniquePlayerIds(packetRouterFallbackSlots)
      : [];
    const searchSlots = fallbackCandidates.length > 0
      ? fallbackCandidates
      : [...connectedPlayerIds].sort((left, right) => left - right);

    if (searchSlots.length === 0) {
      return null;
    }

    const currentIndex = searchSlots.indexOf(packetRouterSlot);
    if (currentIndex < 0) {
      return searchSlots[0] ?? null;
    }

    return searchSlots[(currentIndex + 1) % searchSlots.length] ?? null;
  }

  private toFrameCommandKey(playerId: number, frame: number): string {
    return `${playerId}:${frame}`;
  }

  private toDisconnectVoteKey(slot: number, fromPlayerId: number): string {
    return `${slot}:${fromPlayerId}`;
  }

  private getUniquePlayerIds(playerIds: Iterable<number>): number[] {
    const uniquePlayers = new Set<number>();
    for (const playerId of playerIds) {
      assertNonNegativeInteger(playerId, 'playerId');
      uniquePlayers.add(playerId);
    }
    return [...uniquePlayers.values()];
  }

  private deleteFrameTrackingEntries<T>(
    collection: Map<string, T> | Set<string>,
    frame: number,
    excludePlayerId?: number,
  ): void {
    const keyIterator = collection instanceof Map
      ? collection.keys()
      : collection.values();

    const keysToDelete: string[] = [];
    for (const key of keyIterator) {
      const [playerToken, frameToken] = key.split(':');
      const playerId = Number.parseInt(playerToken ?? '', 10);
      const frameId = Number.parseInt(frameToken ?? '', 10);
      if (!Number.isInteger(playerId) || !Number.isInteger(frameId)) {
        continue;
      }
      if (frameId !== frame) {
        continue;
      }
      if (typeof excludePlayerId === 'number' && playerId === excludePlayerId) {
        continue;
      }
      keysToDelete.push(key);
    }

    for (const key of keysToDelete) {
      if (collection instanceof Map) {
        collection.delete(key);
      } else {
        collection.delete(key);
      }
    }
  }

  private maybeFlagCommandCountMismatch(playerId: number, frame: number, key: string): void {
    const expectedCommandCount = this.expectedFrameCommandCounts.get(key);
    if (typeof expectedCommandCount !== 'number') {
      return;
    }

    const receivedCommandCount = this.receivedFrameCommandCounts.get(key) ?? 0;
    if (receivedCommandCount <= expectedCommandCount) {
      return;
    }

    if (this.mismatchedFrameCommandCounts.has(key)) {
      return;
    }

    this.sawFrameCommandMismatch = true;
    this.mismatchedFrameCommandCounts.add(key);
    const mismatch: FrameCommandCountMismatch = {
      playerId,
      frame,
      expectedCommandCount,
      receivedCommandCount,
    };
    for (const listener of this.mismatchListeners) {
      listener(mismatch);
    }
  }
}
