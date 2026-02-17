/**
 * @generals/network
 *
 * Lightweight offline-capable `NetworkInterface`-compatible runtime used while the
 * native network transport is being ported.
 */
import type { Subsystem } from '@generals/core';

interface ChatMessage {
  sender: number;
  text: string;
  mask: number;
}

interface WrapperAssembly {
  chunks: Uint8Array;
  chunkReceived: Uint8Array;
  expectedChunks: number;
  totalLength: number;
  receivedChunks: number;
}

interface WrapperChunk {
  wrappedCommandID: number;
  chunkNumber: number;
  numChunks: number;
  totalDataLength: number;
  dataOffset: number;
  chunkData: Uint8Array;
}

interface NetworkUser {
  id: number;
  name: string;
  side?: string;
}

interface FileTransferRecord {
  commandId: number;
  path: string;
  progressBySlot: Map<number, number>;
}

interface PacketRouterEvents {
  onPacketRouterQueryReceived?: (querySenderId: number, localPacketRouterId: number) => void;
  onPacketRouterAckReceived?: (ackSenderId: number, packetRouterSlot: number) => void;
}

type TransportLike = {
  getIncomingBytesPerSecond?: () => number;
  getIncomingPacketsPerSecond?: () => number;
  getOutgoingBytesPerSecond?: () => number;
  getOutgoingPacketsPerSecond?: () => number;
  getUnknownBytesPerSecond?: () => number;
  getUnknownPacketsPerSecond?: () => number;
  sendLocalCommandDirect?: (command: unknown, relayMask: number) => void;
};

type TransportMetricName =
  | 'getIncomingBytesPerSecond'
  | 'getIncomingPacketsPerSecond'
  | 'getOutgoingBytesPerSecond'
  | 'getOutgoingPacketsPerSecond'
  | 'getUnknownBytesPerSecond'
  | 'getUnknownPacketsPerSecond';

const MAX_FRAME_RATE = 300;
const MAX_SLOTS = 16;
const DEFAULT_FRAME_RATE = 30;
const DEFAULT_RUN_AHEAD = 30;
const NETCOMMANDTYPE_ACKBOTH = 0;
const NETCOMMANDTYPE_ACKSTAGE1 = 1;
const NETCOMMANDTYPE_ACKSTAGE2 = 2;
const NETCOMMANDTYPE_FRAMEINFO = 3;
const NETCOMMANDTYPE_GAMECOMMAND = 4;
const NETCOMMANDTYPE_PLAYERLEAVE = 5;
const NETCOMMANDTYPE_RUNAHEADMETRICS = 6;
const NETCOMMANDTYPE_RUNAHEAD = 7;
const NETCOMMANDTYPE_DESTROYPLAYER = 8;
const NETCOMMANDTYPE_CHAT = 11;
const NETCOMMANDTYPE_DISCONNECTCHAT = 10;
const NETCOMMANDTYPE_KEEPALIVE = 9;
const NETCOMMANDTYPE_PROGRESS = 14;
const NETCOMMANDTYPE_MANGLERQUERY = 12;
const NETCOMMANDTYPE_MANGLERRESPONSE = 13;
const NETCOMMANDTYPE_LOADCOMPLETE = 15;
const NETCOMMANDTYPE_TIMEOUTSTART = 16;
const NETCOMMANDTYPE_WRAPPER = 17;
const NETCOMMANDTYPE_FILE = 18;
const NETCOMMANDTYPE_FILEANNOUNCE = 19;
const NETCOMMANDTYPE_FILEPROGRESS = 20;
const NETCOMMANDTYPE_FRAMERESENDREQUEST = 21;
const NETCOMMANDTYPE_DISCONNECTSTART = 22;
const NETCOMMANDTYPE_DISCONNECTKEEPALIVE = 23;
const NETCOMMANDTYPE_DISCONNECTPLAYER = 24;
const NETCOMMANDTYPE_PACKETROUTERQUERY = 25;
const NETCOMMANDTYPE_PACKETROUTERACK = 26;
const NETCOMMANDTYPE_DISCONNECTVOTE = 27;
const NETCOMMANDTYPE_DISCONNECTFRAME = 28;
const NETCOMMANDTYPE_DISCONNECTSCREENOFF = 29;
const NETCOMMANDTYPE_DISCONNECTEND = 30;

/**
 * Represents the single-player/default network state that keeps the game logic in sync
 * even before multiplayer transport is ported.
 */
export class NetworkManager implements Subsystem {
  readonly name = '@generals/network';

  private started = false;
  private forceSinglePlayer = false;
  private localPlayerID = 0;
  private localPlayerName = 'Player 1';
  private numPlayers = 1;
  private gameFrame = 0;
  private lastExecutionFrame = 0;
  private frameRate = DEFAULT_FRAME_RATE;
  private runAhead = DEFAULT_RUN_AHEAD;
  private frameReady = false;
  private expectedNetworkFrame = 0;
  private networkOn = true;
  private pendingFrameNotices = 0;
  private lastUpdateMs = 0;
  private frameQueueReady = new Set<number>();
  private pingFrame = 0;
  private pingsSent = 0;
  private pingsReceived = 0;
  private lastPingMs = 0;
  private pingPeriodMs = 10000;
  private pingRepeats = 5;
  private chatHistory: ChatMessage[] = [];
  private playerNames = new Map<number, string>();
  private playerSides = new Map<number, string>();
  private disconnectedPlayers = new Set<number>();
  private fileTransfers = new Map<number, FileTransferRecord>();
  private activeWrapperAssemblies = new Map<number, WrapperAssembly>();
  private commandIdSeed = 1;
  private crcMismatch = false;
  private loadProgress = 0;
  private transport: unknown = null;
  private localIp = '';
  private localPort = 0;
  private slotAverageFPS = new Int32Array(MAX_SLOTS).fill(-1);
  private slotAverageLatency = new Float32Array(MAX_SLOTS).fill(-1);
  private packetRouterSlot = -1;
  private lastPacketRouterQuerySender = -1;
  private lastPacketRouterAckSender = -1;
  private packetRouterEvents: PacketRouterEvents;

  constructor(options: NetworkManagerOptions = {}) {
    this.forceSinglePlayer = options.forceSinglePlayer ?? false;
    if (typeof options.localPlayerID === 'number' && Number.isInteger(options.localPlayerID)) {
      this.localPlayerID = Math.max(0, options.localPlayerID);
    }
    if (options.localPlayerName) {
      this.localPlayerName = options.localPlayerName;
    }
    if (typeof options.frameRate === 'number' && Number.isFinite(options.frameRate)) {
      this.frameRate = Math.min(MAX_FRAME_RATE, Math.max(1, Math.floor(options.frameRate)));
    }
    if (typeof options.runAhead === 'number' && Number.isFinite(options.runAhead) && options.runAhead >= 0) {
      this.runAhead = Math.max(0, Math.floor(options.runAhead));
    }
    this.packetRouterEvents = options.packetRouterEvents ?? {};
  }

  init(): void {
    this.started = true;
    this.gameFrame = 0;
    this.lastExecutionFrame = -1;
    this.expectedNetworkFrame = 0;
    this.lastUpdateMs = performance.now();
    this.lastPingMs = this.lastUpdateMs;
    this.pingFrame = 0;
    this.pingsSent = 0;
    this.pingsReceived = 0;
    this.frameQueueReady.clear();
    this.disconnectedPlayers.clear();
    this.playerSides.clear();
    this.frameReady = true;

    if (this.forceSinglePlayer) {
      this.numPlayers = 1;
    }

    if (this.lastExecutionFrame < 0) {
      this.lastExecutionFrame = 0;
    }
    this.networkOn = true;
    this.crcMismatch = false;
    this.loadProgress = 0;
    this.slotAverageFPS.fill(-1);
    this.slotAverageLatency.fill(-1);
    this.packetRouterSlot = 0;
    this.lastPacketRouterQuerySender = -1;
    this.lastPacketRouterAckSender = -1;
    this.activeWrapperAssemblies.clear();
  }

  reset(): void {
    this.gameFrame = 0;
    this.lastExecutionFrame = 0;
    this.expectedNetworkFrame = 0;
    this.frameReady = this.forceSinglePlayer;
    this.frameQueueReady.clear();
    this.disconnectedPlayers.clear();
    this.lastUpdateMs = performance.now();
    this.lastPingMs = this.lastUpdateMs;
    this.pingFrame = 0;
    this.pingsSent = 0;
    this.pingsReceived = 0;
    this.pendingFrameNotices = 0;
    this.chatHistory.length = 0;
    this.fileTransfers.clear();
    this.playerSides.clear();
    this.slotAverageFPS.fill(-1);
    this.slotAverageLatency.fill(-1);
    this.packetRouterSlot = -1;
    this.lastPacketRouterQuerySender = -1;
    this.lastPacketRouterAckSender = -1;
    this.activeWrapperAssemblies.clear();
  }

  dispose(): void {
    this.started = false;
    this.frameReady = false;
    this.pendingFrameNotices = 0;
    this.frameQueueReady.clear();
    this.disconnectedPlayers.clear();
    this.chatHistory.length = 0;
    this.fileTransfers.clear();
    this.playerSides.clear();
    this.lastPacketRouterQuerySender = -1;
    this.lastPacketRouterAckSender = -1;
    this.activeWrapperAssemblies.clear();
  }

  private asByteArray(payload: unknown): Uint8Array | null {
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
        const value = this.resolveNumericField(payload[index]);
        if (value === null) {
          return null;
        }
        bytes[index] = value;
      }
      return bytes;
    }
    return null;
  }

  /**
   * Advance one local frame and mark upcoming command slots as ready.
   */
  update(): void {
    if (!this.started) {
      return;
    }
    if (!this.networkOn) {
      return;
    }

    const now = performance.now();
    if (now - this.lastUpdateMs >= 1000 / this.frameRate) {
      this.lastUpdateMs = now;
      this.gameFrame += 1;
      this.lastExecutionFrame = Math.max(this.lastExecutionFrame, this.gameFrame + this.runAhead);
      this.pendingFrameNotices = Math.max(0, this.pendingFrameNotices - 1);
      this.frameQueueReady.add(this.gameFrame);
      this.frameReady = true;
      this.tickPings(now);
    }
  }

  private tickPings(now = performance.now()): void {
    if (!this.started || !this.networkOn) {
      return;
    }

    if (now - this.lastPingMs >= this.pingPeriodMs) {
      this.lastPingMs = now;
      this.pingFrame = this.gameFrame;
      this.pingsSent = this.pingRepeats;
      this.pingsReceived = this.pingRepeats;
    }
  }

  liteupdate(): void {
    if (!this.started) {
      return;
    }
    this.update();
  }

  /**
   * Dispatch an inbound network command object to its handler.
   * @returns true when a command was consumed.
   */
  processIncomingCommand(message: unknown): boolean {
    const commandType = this.resolveCommandType(message);
    if (commandType === null) {
      return false;
    }

    if (commandType === NETCOMMANDTYPE_FRAMEINFO) {
      this.processFrameInfoCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_RUNAHEADMETRICS) {
      this.processRunAheadMetricsCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_RUNAHEAD) {
      this.processRunaheadCommand(message);
      return true;
    }

    if (
      commandType === NETCOMMANDTYPE_ACKBOTH
      || commandType === NETCOMMANDTYPE_ACKSTAGE1
      || commandType === NETCOMMANDTYPE_ACKSTAGE2
      || commandType === NETCOMMANDTYPE_GAMECOMMAND
      || commandType === NETCOMMANDTYPE_MANGLERQUERY
      || commandType === NETCOMMANDTYPE_MANGLERRESPONSE
    ) {
      return true;
    }

    if (commandType === NETCOMMANDTYPE_PLAYERLEAVE) {
      this.processPlayerLeaveCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_DESTROYPLAYER) {
      this.processDestroyPlayerCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_KEEPALIVE) {
      return true;
    }

    if (commandType === NETCOMMANDTYPE_DISCONNECTCHAT) {
      this.processDisconnectChatCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_CHAT) {
      this.processChatCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_PROGRESS) {
      this.processProgressCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_TIMEOUTSTART) {
      this.processTimeoutStartCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_LOADCOMPLETE) {
      this.processLoadCompleteCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_FILE) {
      this.processFileCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_FILEANNOUNCE) {
      this.processFileAnnounceCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_FILEPROGRESS) {
      this.processFileProgressCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_FRAMERESENDREQUEST) {
      this.processFrameResendRequestCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_WRAPPER) {
      this.processWrapperCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_PACKETROUTERQUERY) {
      this.processPacketRouterQueryCommand(message);
      return true;
    }

    if (commandType === NETCOMMANDTYPE_PACKETROUTERACK) {
      this.processPacketRouterAckCommand(message);
      return true;
    }

    if ((commandType > NETCOMMANDTYPE_DISCONNECTSTART) && (commandType < NETCOMMANDTYPE_DISCONNECTEND)) {
      this.processDisconnectCommand(commandType, message);
      return true;
    }

    return false;
  }

  setLocalAddress(ip: string | number = 0, port = 0): void {
    const normalizedIp = String(ip).trim();
    if (!normalizedIp || normalizedIp === '0') {
      this.localIp = '';
    } else {
      this.localIp = normalizedIp;
    }
    this.localPort = port;
  }

  setLocalAddressFromHost(ip: string, port = 0): void {
    this.localIp = ip;
    this.localPort = port;
  }

  getLocalAddress(): string {
    if (!this.localIp) {
      return '';
    }
    return `${this.localIp}:${this.localPort}`;
  }

  isFrameDataReady(): boolean {
    return this.frameReady;
  }

  parseUserList(game: unknown): void {
    if (this.forceSinglePlayer) {
      this.numPlayers = 1;
      this.playerNames.clear();
      this.playerSides.clear();
      this.playerNames.set(this.localPlayerID, this.localPlayerName);
      this.disconnectedPlayers.clear();
      this.frameQueueReady.clear();
      this.pendingFrameNotices = 0;
      this.frameReady = true;
      return;
    }

    const resolvedList = this.normalizeGameUserList(game);
    this.disconnectedPlayers.clear();
    // Native network code clears queued frame messages here and wipes the next runAhead-1 frames.
    this.frameQueueReady.clear();
    this.pendingFrameNotices = 0;
    this.frameReady = true;
    this.playerNames.clear();
    this.playerSides.clear();

    for (const user of resolvedList) {
      this.playerNames.set(user.id, user.name);
      if (user.side) {
        this.playerSides.set(user.id, user.side);
      }
    }

    this.numPlayers = Math.max(1, this.playerNames.size);

    if (!this.playerNames.size) {
      this.playerNames.set(this.localPlayerID, this.localPlayerName);
    }
  }

  private normalizeGameUserList(game: unknown): NetworkUser[] {
    if (!game || typeof game !== 'object') {
      return [];
    }

    const maybeUsers = game as {
      packetRouterSlot?: unknown;
      getPacketRouterSlot?: () => unknown;
      users?: unknown;
      userList?: unknown;
      playerList?: unknown;
      players?: unknown;
      slots?: unknown;
      getMaxPlayers?: () => unknown;
      getNumPlayers?: () => unknown;
      getSlots?: () => unknown;
      playersBySlot?: unknown;
      localSlot?: unknown;
      localSlotNum?: unknown;
      getLocalSlotNum?: () => unknown;
      localPlayerId?: unknown;
      localPlayerID?: unknown;
      localPlayerName?: unknown;
      localPlayerSide?: unknown;
      localSide?: unknown;
      localFaction?: unknown;
      getLocalPlayerSide?: () => unknown;
      getLocalSide?: () => unknown;
      getLocalFaction?: () => unknown;
      getSlot?: (slotNum: number) => unknown;
      getConstSlot?: (slotNum: number) => unknown;
    };

    const normalizeBoolean = (value: unknown): boolean | undefined => {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'number') {
        return value !== 0;
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
          return true;
        }
        if (normalized === '0' || normalized === 'false' || normalized === 'no') {
          return false;
        }
      }
      return undefined;
    };

    const normalizeSlotValue = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isInteger(value)) {
        return value;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!/^[+-]?\d+$/.test(trimmed)) {
          return null;
        }
        const parsed = Number(trimmed);
        if (Number.isInteger(parsed)) {
          return parsed;
        }
      }

      return null;
    };

    const readSlotProperty = (slot: unknown, property: string): unknown => {
      if (!slot || typeof slot !== 'object') {
        return undefined;
      }
      const slotObj = slot as {
        [key: string]: unknown;
      };
      const candidate = slotObj[property];
      if (typeof candidate === 'function') {
        try {
          return (candidate as () => unknown).call(slotObj);
        } catch {
          return undefined;
        }
      }
      return candidate;
    };

    const normalizeSlotText = (value: unknown, fallback: string): string => {
      if (typeof value !== 'string') {
        return fallback;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : fallback;
    };

    const normalizePlayerSide = (value: unknown): string | null => {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    type UserCandidate = {
      id?: number;
      name?: string;
      slot?: number;
      playerId?: number;
      player?: string;
      side?: string;
      faction?: string;
      playerSide?: string;
      army?: string;
      country?: string;
      isHuman?: boolean | number;
      isAI?: boolean | number | string;
      isOccupied?: boolean | number | string;
    };
    const candidates: UserCandidate[] = [];

    const addUserArray = (value: unknown): void => {
      if (!Array.isArray(value)) {
        return;
      }
      for (const user of value) {
        if (!user || typeof user !== 'object') {
          continue;
        }
        candidates.push(user as UserCandidate);
      }
    };

    const addUserMap = (value: unknown): void => {
      if (!value || typeof value !== 'object') {
        return;
      }
      const mapLike = value as Record<string, UserCandidate>;
      for (const key of Object.keys(mapLike)) {
        const user = mapLike[key];
        if (!user || typeof user !== 'object') {
          continue;
        }
        if (user.id === undefined && /^\d+$/.test(key)) {
          user.id = Number.parseInt(key, 10);
        }
        candidates.push(user);
      }
    };

    const parseLegacyUserList = (value: unknown): void => {
      if (typeof value !== 'string') {
        return;
      }
      if (!value.trim()) {
        return;
      }

      const userEntries = value.split(',');
      for (const userEntry of userEntries) {
        const [namePart] = userEntry.split('@');
        if (!namePart) {
          continue;
        }
        const playerNum = candidates.length;
        candidates.push({
          id: playerNum,
          name: namePart.trim(),
          isHuman: true,
        });
      }
    };

    const normalizeLocalSlot = (value: unknown): number | null => normalizeSlotValue(value);

    const addSlot = (slot: unknown, index: number): void => {
      if (!slot || typeof slot !== 'object') {
        return;
      }

      const slotCandidate = slot as UserCandidate & {
        isAI?: boolean | number | string;
        isHuman?: boolean | number | string;
        isOccupied?: boolean | number | string;
        name?: string;
        player?: string;
        userName?: string;
        username?: string;
        user?: string;
      };
      const isAI = normalizeBoolean(readSlotProperty(slotCandidate, 'isAI'));
      const isHuman = normalizeBoolean(readSlotProperty(slotCandidate, 'isHuman'));
      const isOccupied = normalizeBoolean(readSlotProperty(slotCandidate, 'isOccupied'));

      if (isAI === true || isHuman === false || isOccupied === false) {
        return;
      }

      const idCandidate = normalizeSlotValue(readSlotProperty(slotCandidate, 'id'))
        ?? normalizeSlotValue(readSlotProperty(slotCandidate, 'slot'))
        ?? normalizeSlotValue(readSlotProperty(slotCandidate, 'playerId'));
      const name = normalizeSlotText(
        readSlotProperty(slotCandidate, 'name')
          ?? readSlotProperty(slotCandidate, 'player')
          ?? readSlotProperty(slotCandidate, 'userName')
          ?? readSlotProperty(slotCandidate, 'username')
          ?? readSlotProperty(slotCandidate, 'user'),
        `Player ${index + 1}`,
      );
      const side = normalizePlayerSide(
        readSlotProperty(slotCandidate, 'side')
          ?? readSlotProperty(slotCandidate, 'faction')
          ?? readSlotProperty(slotCandidate, 'playerSide')
          ?? readSlotProperty(slotCandidate, 'army')
          ?? readSlotProperty(slotCandidate, 'country')
          ?? readSlotProperty(slotCandidate, 'getSide')
          ?? readSlotProperty(slotCandidate, 'getFaction'),
      );
      // TODO: Source parity gap: game slots can expose only getPlayerTemplate()
      // (index into PlayerTemplateStore). Resolve that index to Side when the
      // PlayerTemplate subsystem is wired into browser runtime session data.

      const slotId = typeof idCandidate === 'number' && idCandidate >= 0 ? idCandidate : index;
      if (slotId >= MAX_SLOTS) {
        return;
      }

      candidates.push({
        id: slotId,
        name,
        side: side ?? undefined,
        isHuman: true,
      });
    };

    const addSlotArray = (slots: unknown): void => {
      if (!Array.isArray(slots)) {
        return;
      }
      slots.forEach((slot, index) => {
        addSlot(slot, index);
      });
    };

    const addSlotByIndex = (
      getSlot: (slotNum: number) => unknown,
      maxSlots?: number,
    ): void => {
      const slotCount = typeof maxSlots === 'number' ? Math.max(0, Math.min(MAX_SLOTS, maxSlots)) : MAX_SLOTS;

      for (let index = 0; index < slotCount; index += 1) {
        const slot = getSlot(index);
        if (!slot) {
          continue;
        }
        addSlot(slot, index);
      }
    };

    addUserArray(maybeUsers.users);
    addUserArray(maybeUsers.playerList);
    addUserArray(maybeUsers.players);
    addUserMap(maybeUsers.playersBySlot);
    parseLegacyUserList(maybeUsers.userList);

    const parsedSlots = maybeUsers.getSlots?.();
    if (parsedSlots !== undefined) {
      addSlotArray(parsedSlots);
    }
    addSlotArray(maybeUsers.slots);
    if (maybeUsers.getConstSlot) {
    const localAwareSlotCount = normalizeSlotValue(
      maybeUsers.getNumPlayers?.()
        ?? maybeUsers.getMaxPlayers?.(),
    );
    addSlotByIndex((slotNum) => {
      if (!maybeUsers.getConstSlot) {
        return null;
      }
      return maybeUsers.getConstSlot(slotNum);
      }, typeof localAwareSlotCount === 'number' ? localAwareSlotCount : undefined);
    } else if (maybeUsers.getSlot) {
      addSlotByIndex((slotNum) => {
        if (!maybeUsers.getSlot) {
          return null;
        }
        return maybeUsers.getSlot(slotNum);
      });
    }

    if (Array.isArray(maybeUsers.playersBySlot as { playerId?: number; name?: string; }[])) {
      addUserArray((maybeUsers.playersBySlot as { playerId?: number; name?: string; }[]));
    }

    const localSlot = normalizeLocalSlot(
      maybeUsers.localSlot
      ?? maybeUsers.localSlotNum
      ?? maybeUsers.getLocalSlotNum?.()
      ?? maybeUsers.localPlayerId
      ?? maybeUsers.localPlayerID,
    );
    if (localSlot !== null && localSlot >= 0) {
      this.localPlayerID = localSlot;
    }

    const localPlayerNameCandidate = this.normalizePlayerName(maybeUsers.localPlayerName);
    if (localPlayerNameCandidate) {
      this.localPlayerName = localPlayerNameCandidate;
    }
    const localPlayerSideCandidate = normalizePlayerSide(
      maybeUsers.localPlayerSide
        ?? maybeUsers.localSide
        ?? maybeUsers.localFaction
        ?? maybeUsers.getLocalPlayerSide?.()
        ?? maybeUsers.getLocalSide?.()
        ?? maybeUsers.getLocalFaction?.(),
    );

    const packetRouterSlotCandidate = normalizeSlotValue(
      maybeUsers.packetRouterSlot ?? maybeUsers.getPacketRouterSlot?.(),
    );
    if (packetRouterSlotCandidate !== null && packetRouterSlotCandidate >= 0 && packetRouterSlotCandidate < MAX_SLOTS) {
      this.packetRouterSlot = packetRouterSlotCandidate;
    }

    const normalizedById = new Map<number, NetworkUser>();
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }

      const isHumanValue = candidate.isHuman;
      const isHuman =
        isHumanValue === undefined
          || isHumanValue === true
          || isHumanValue === 1;
      const isAIValue = candidate.isAI;
      const isAI = isAIValue === true || isAIValue === 1 || isAIValue === '1' || isAIValue === 'true';
      const isOccupiedValue = (candidate as { isOccupied?: unknown }).isOccupied;
      const isOccupied = isOccupiedValue === undefined
        || isOccupiedValue === true
        || isOccupiedValue === 1
        || isOccupiedValue === '1'
        || isOccupiedValue === 'true';

      if (!isHuman || isAI || !isOccupied) {
        continue;
      }

      const idCandidate =
        typeof candidate.id === 'number' ? candidate.id :
        typeof candidate.slot === 'number' ? candidate.slot :
        typeof candidate.playerId === 'number' ? candidate.playerId : null;
      if (idCandidate === null || idCandidate < 0) {
        continue;
      }

      if (idCandidate >= MAX_SLOTS) {
        continue;
      }

      const name = this.normalizePlayerName(
        candidate.name ?? candidate.player ?? `Player ${idCandidate + 1}`,
      );
      const side = normalizePlayerSide(
        candidate.side
          ?? candidate.faction
          ?? candidate.playerSide
          ?? candidate.army
          ?? candidate.country,
      );
      const previous = normalizedById.get(idCandidate);
      normalizedById.set(idCandidate, {
        id: idCandidate,
        name,
        side: side ?? previous?.side,
      });
    }

    if (localPlayerSideCandidate) {
      const localCandidate = normalizedById.get(this.localPlayerID);
      if (localCandidate) {
        localCandidate.side = localPlayerSideCandidate;
      } else {
        normalizedById.set(this.localPlayerID, {
          id: this.localPlayerID,
          name: this.localPlayerName,
          side: localPlayerSideCandidate,
        });
      }
    }

    const localEntry = normalizedById.get(this.localPlayerID);
    if (localEntry?.name) {
      this.localPlayerName = localEntry.name;
    }

    if (normalizedById.size === 0 && this.forceSinglePlayer === false && this.localPlayerName) {
      normalizedById.set(this.localPlayerID, {
        id: this.localPlayerID,
        name: this.localPlayerName,
      });
    }

    return [...normalizedById.values()];
  }

  private normalizePlayerName(name: unknown): string {
    if (typeof name !== 'string') {
      return this.localPlayerName;
    }
    const trimmed = name.trim();
    return trimmed.length > 0 ? trimmed : this.localPlayerName;
  }

  startGame(): void {
    this.frameReady = true;
    this.frameQueueReady.clear();
    this.pendingFrameNotices = 0;
    this.disconnectedPlayers.clear();
    this.lastPingMs = performance.now();
    this.pingFrame = this.gameFrame;
    this.pingsSent = this.pingRepeats;
    this.pingsReceived = this.pingRepeats;
  }

  getRunAhead(): number {
    return this.runAhead;
  }

  getFrameRate(): number {
    return this.frameRate;
  }

  getPacketArrivalCushion(): number {
    return this.runAhead;
  }

  sendChat(text: string, playerMask = 0): void {
    this.chatHistory.push({ sender: this.localPlayerID, text, mask: playerMask });
  }

  sendDisconnectChat(text: string): void {
    this.sendChat(text, 0xff ^ (1 << this.localPlayerID));
  }

  sendFile(path: string, playerMask = 0, commandId = 0): void {
    const key = this.normalizeFilePath(path);
    if (!key) {
      return;
    }

    const normalizedPlayerMask = playerMask >>> 0;

    let transfer = commandId > 0 ? this.fileTransfers.get(commandId) : undefined;
    if (!transfer) {
      transfer = this.findTransferByPath(key);
    }

    if (!transfer) {
      const resolvedCommandId = commandId || this.commandIdSeed++;
      if (commandId >= this.commandIdSeed) {
        this.commandIdSeed = commandId + 1;
      }
      transfer = {
        commandId: resolvedCommandId,
        path: key,
        progressBySlot: this.createTransferProgressByPlayerMask(playerMask),
      };
      this.fileTransfers.set(resolvedCommandId, transfer);
    } else if (commandId > 0 && transfer.commandId !== commandId) {
      if (commandId >= this.commandIdSeed) {
        this.commandIdSeed = commandId + 1;
      }
      this.fileTransfers.delete(transfer.commandId);
      transfer = {
        ...transfer,
        commandId,
      };
      transfer.path = key;
      this.fileTransfers.set(commandId, transfer);
    } else if (transfer.path !== key) {
      transfer.path = key;
    }

    for (let slot = 0; slot < MAX_SLOTS; slot += 1) {
      if ((normalizedPlayerMask & (1 << slot)) !== 0) {
        transfer.progressBySlot.set(slot, 100);
      }
    }
  }

  sendFileAnnounce(path: string, _playerMask = 0): number {
    const sanitized = this.normalizeFilePath(path);
    if (sanitized) {
      const commandId = this.commandIdSeed++;
      this.fileTransfers.set(commandId, {
        commandId,
        path: sanitized,
        progressBySlot: this.createTransferProgressByPlayerMask(_playerMask),
      });
      return commandId;
    }

    return 0;
  }

  getFileTransferProgress(playerId = 0, path = ''): number {
    const key = this.normalizeFilePath(path);
    if (!key) {
      return 0;
    }

    const transfer = this.findTransferByPath(key);
    if (!transfer) {
      return 0;
    }
    return transfer.progressBySlot.get(playerId) ?? 0;
  }

  private normalizeFilePath(path: string): string {
    if (!path.trim()) {
      return '';
    }
    return path;
  }

  areAllQueuesEmpty(): boolean {
    return this.frameQueueReady.size === 0;
  }

  private createTransferProgressByPlayerMask(playerMask: number): Map<number, number> {
    const progress = new Map<number, number>();
    const normalizedPlayerMask = playerMask >>> 0;
    for (let slot = 0; slot < MAX_SLOTS; slot += 1) {
      const included = (normalizedPlayerMask & (1 << slot)) !== 0;
      progress.set(slot, included ? 0 : 100);
    }
    return progress;
  }

  private findTransferByPath(path: string): FileTransferRecord | undefined {
    for (const transfer of this.fileTransfers.values()) {
      if (transfer.path === path) {
        return transfer;
      }
    }

    return undefined;
  }

  quitGame(): void {
    this.markPlayerDisconnected(this.localPlayerID);
  }

  selfDestructPlayer(index = 0): void {
    this.markPlayerDisconnected(index);
  }

  voteForPlayerDisconnect(slot = 0): void {
    if (slot < 0) {
      return;
    }
    this.markPlayerDisconnected(slot);
  }

  isPacketRouter(): boolean {
    return this.packetRouterSlot === this.localPlayerID;
  }

  getPacketRouterSlot(): number {
    return this.packetRouterSlot;
  }

  getLastPacketRouterQuerySender(): number {
    return this.lastPacketRouterQuerySender;
  }

  getLastPacketRouterAckSender(): number {
    return this.lastPacketRouterAckSender;
  }

  setSlotAverageFPS(slot = 0, fps = 0): void {
    if (slot < 0 || slot >= MAX_SLOTS) {
      return;
    }
    this.slotAverageFPS[slot] = fps;
  }

  setPacketRouterSlot(slot = -1): void {
    if (slot < 0 || slot >= MAX_SLOTS) {
      this.packetRouterSlot = -1;
      return;
    }
    this.packetRouterSlot = slot;
  }

  getIncomingBytesPerSecond(): number {
    return this.callTransportMetric('getIncomingBytesPerSecond');
  }

  getIncomingPacketsPerSecond(): number {
    return this.callTransportMetric('getIncomingPacketsPerSecond');
  }

  getOutgoingBytesPerSecond(): number {
    return this.callTransportMetric('getOutgoingBytesPerSecond');
  }

  getOutgoingPacketsPerSecond(): number {
    return this.callTransportMetric('getOutgoingPacketsPerSecond');
  }

  getUnknownBytesPerSecond(): number {
    return this.callTransportMetric('getUnknownBytesPerSecond');
  }

  getUnknownPacketsPerSecond(): number {
    return this.callTransportMetric('getUnknownPacketsPerSecond');
  }

  updateLoadProgress(percent = 0): void {
    if (percent < 0) {
      this.loadProgress = 0;
    } else if (percent > 100) {
      this.loadProgress = 100;
    } else {
      this.loadProgress = percent;
    }
  }

  loadProgressComplete(): void {
    this.loadProgress = 100;
  }

  sendTimeOutGameStart(): void {
    this.pendingFrameNotices = 1;
  }

  getLoadProgress(): number {
    return this.loadProgress;
  }

  getLocalPlayerID(): number {
    return this.localPlayerID;
  }

  getPlayerName(playerNum = 0): string {
    const cachedName = this.playerNames.get(playerNum);
    if (cachedName) {
      return cachedName;
    }
    if (playerNum === this.localPlayerID) {
      return this.localPlayerName;
    }
    return `Player ${playerNum + 1}`;
  }

  getPlayerSide(playerNum = 0): string | null {
    return this.playerSides.get(playerNum) ?? null;
  }

  getKnownPlayerSlots(): number[] {
    const slots = new Set<number>(this.playerNames.keys());
    slots.add(this.localPlayerID);
    return [...slots].sort((left, right) => left - right);
  }

  getNumPlayers(): number {
    const counted = new Set<number>();

    if (this.isPlayerConnected(this.localPlayerID)) {
      counted.add(this.localPlayerID);
    }

    if (this.playerNames.size > 0) {
      for (const slot of this.playerNames.keys()) {
        if (this.isPlayerConnected(slot)) {
          counted.add(slot);
        }
      }
    } else {
      for (let slot = 0; slot < this.numPlayers; slot += 1) {
        if (this.isPlayerConnected(slot)) {
          counted.add(slot);
        }
      }
    }

    return counted.size;
  }

  getAverageFPS(): number {
    return this.frameRate;
  }

  getSlotAverageFPS(slot = 0): number {
    if (slot < 0 || slot >= MAX_SLOTS) {
      return -1;
    }

    if ((this.isPacketRouter() === false) && (slot === this.localPlayerID)) {
      return -1;
    }

    const value = this.slotAverageFPS[slot];
    return value === undefined ? -1 : value;
  }

  getSlotAverageLatency(slot = 0): number {
    if (slot < 0 || slot >= MAX_SLOTS) {
      return -1;
    }

    if (!this.isPlayerConnected(slot) && slot !== this.localPlayerID) {
      return -1;
    }

    const value = this.slotAverageLatency[slot];
    return value === undefined ? -1 : value;
  }

  private resolveNumericField(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed.length) {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private resolveTextField(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private resolveMessageGetter(message: { [key: string]: unknown }, method: string): unknown {
    const getter = message[method];
    if (typeof getter !== 'function') {
      return undefined;
    }
    try {
      return getter.call(message);
    } catch {
      return undefined;
    }
  }

  private resolveNumericFieldFromMessage(message: { [key: string]: unknown }, keys: string[], getters: string[] = []): number | null {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(message, key)) {
        continue;
      }
      const value = this.resolveNumericField(message[key]);
      if (value !== null) {
        return value;
      }
    }

    for (const getter of getters) {
      const value = this.resolveMessageGetter(message, getter);
      const resolved = this.resolveNumericField(value);
      if (resolved !== null) {
        return resolved;
      }
    }

    return null;
  }

  private resolveTextFieldFromMessage(message: { [key: string]: unknown }, keys: string[], getters: string[] = []): string | null {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(message, key)) {
        continue;
      }
      const value = this.resolveTextField(message[key]);
      if (value !== null) {
        return value;
      }
    }

    for (const getter of getters) {
      const value = this.resolveMessageGetter(message, getter);
      const resolved = this.resolveTextField(value);
      if (resolved !== null) {
        return resolved;
      }
    }

    return null;
  }

  private resolvePlayerFromMessage(message: { [key: string]: unknown }): number | null {
    return this.resolveNumericFieldFromMessage(
      message,
      ['playerID', 'player', 'sender', 'slot', 'disconnectSlot', 'voteSlot', 'slotId', 'playerId', 'playerNumber'],
      ['getPlayerID', 'getPlayer', 'getSender', 'getSlot', 'getDisconnectSlot', 'getVoteSlot'],
    );
  }

  private clampPercent(value: unknown): number | null {
    const resolved = this.resolveNumericField(value);
    if (resolved === null) {
      return null;
    }
    return Math.max(0, Math.min(100, Math.trunc(resolved)));
  }

  private clampProgress(value: unknown): number | null {
    const resolved = this.resolveNumericField(value);
    if (resolved === null) {
      return null;
    }
    return Math.max(0, Math.min(100, Math.trunc(resolved)));
  }

  private resolveFileCommandId(message: { [key: string]: unknown }): number | null {
    return this.resolveNumericFieldFromMessage(message, ['commandId', 'fileId', 'fileID', 'id', 'wrappedCommandID']);
  }

  private resolveMaskFromMessage(message: { [key: string]: unknown }, keys: string[]): number {
    return this.resolveNumericFieldFromMessage(message, keys, ['getPlayerMask', 'getFrameMask']) ?? 0;
  }

  private ensureFileTransferFromMessage(message: { [key: string]: unknown }, options: { commandId?: number } = {}): void {
    const path = this.normalizeFilePath(
      this.resolveTextFieldFromMessage(message, ['path', 'filePath', 'filename', 'fileName', 'realFilename', 'portableFilename']) ?? '',
    );
    if (!path) {
      return;
    }

    const commandId = options.commandId
      ?? this.resolveFileCommandId(message)
      ?? this.commandIdSeed++;
    const resolvedCommandId = Math.trunc(commandId);

    if (!Number.isFinite(resolvedCommandId) || !Number.isInteger(resolvedCommandId) || resolvedCommandId < 0) {
      return;
    }

    let transfer = this.fileTransfers.get(resolvedCommandId);
    if (!transfer) {
      transfer = this.findTransferByPath(path);
    }

    const mask = this.resolveMaskFromMessage(message, ['playerMask', 'mask', 'recipientMask']);
    if (!transfer || transfer.commandId !== resolvedCommandId || transfer.path !== path) {
      this.fileTransfers.set(resolvedCommandId, {
        commandId: resolvedCommandId,
        path,
        progressBySlot: this.createTransferProgressByPlayerMask(mask),
      });
      return;
    }

    transfer.path = path;
    if (!transfer.progressBySlot.size) {
      transfer.progressBySlot = this.createTransferProgressByPlayerMask(mask);
    }
  }

  private updateFileProgress(commandId: number, playerId: number, progress: number): void {
    const transfer = this.fileTransfers.get(commandId);
    if (!transfer) {
      return;
    }

    const clampedProgress = this.clampProgress(progress);
    if (clampedProgress === null || playerId < 0 || playerId >= MAX_SLOTS) {
      return;
    }

    const existing = transfer.progressBySlot.get(playerId);
    if (existing === undefined) {
      transfer.progressBySlot.set(playerId, clampedProgress);
      return;
    }
    transfer.progressBySlot.set(playerId, Math.max(existing, clampedProgress));
  }

  processFrameInfoCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as { [key: string]: unknown };
    const sender = this.resolvePlayerFromMessage(msg);
    const frame = this.resolveNumericFieldFromMessage(msg, ['frame', 'executionFrame', 'gameFrame', 'frameInfo']);
    const commandCount = this.resolveNumericFieldFromMessage(msg, ['commandCount', 'count']);

    if (frame === null || sender === null) {
      return;
    }

    const safeFrame = Math.trunc(frame);
    if (!Number.isInteger(safeFrame) || safeFrame < 0 || sender < 0 || sender >= MAX_SLOTS) {
      return;
    }

    void commandCount;
    this.expectedNetworkFrame = Math.max(this.expectedNetworkFrame, safeFrame);
    if (!this.frameQueueReady.has(safeFrame)) {
      this.frameQueueReady.add(safeFrame);
    }
    this.frameReady = true;
  }

  processDisconnectChatCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as { [key: string]: unknown };
    const sender = this.resolvePlayerFromMessage(msg);
    const text = this.resolveTextFieldFromMessage(msg, ['text', 'message', 'chat', 'content']);
    if (sender === null || text === null) {
      return;
    }

    this.chatHistory.push({
      sender,
      text,
      mask: 0,
    });
  }

  processChatCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as { [key: string]: unknown };
    const sender = this.resolvePlayerFromMessage(msg);
    const text = this.resolveTextFieldFromMessage(msg, ['text', 'message', 'chat', 'content']);
    if (sender === null || text === null) {
      return;
    }
    const mask = this.resolveMaskFromMessage(msg, ['playerMask', 'mask']);
    this.chatHistory.push({
      sender,
      text,
      mask,
    });
  }

  processProgressCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as { [key: string]: unknown };
    const percent = this.resolveNumericFieldFromMessage(msg, ['percentage', 'percent', 'progress']);
    const clampedPercent = this.clampPercent(percent);
    if (clampedPercent === null) {
      return;
    }
    this.updateLoadProgress(clampedPercent);
  }

  processTimeoutStartCommand(_message: unknown): void {
    this.sendTimeOutGameStart();
  }

  processLoadCompleteCommand(_message: unknown): void {
    this.loadProgressComplete();
  }

  processFileCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as { [key: string]: unknown };
    const commandId = this.resolveFileCommandId(msg);
    this.ensureFileTransferFromMessage(msg, { commandId: commandId ?? undefined });
    const sender = this.resolvePlayerFromMessage(msg);
    const mask = this.resolveMaskFromMessage(msg, ['playerMask', 'mask']);
    const path = this.normalizeFilePath(
      this.resolveTextFieldFromMessage(msg, ['path', 'filePath', 'filename', 'fileName', 'realFilename', 'portableFilename']) ?? '',
    );
    if (!path) {
      return;
    }
    this.sendFile(path, mask, commandId ?? this.commandIdSeed);
    if (commandId !== null && sender !== null) {
      this.updateFileProgress(Math.trunc(commandId), Math.trunc(sender), 100);
    }
  }

  processFileAnnounceCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as { [key: string]: unknown };
    const path = this.resolveTextFieldFromMessage(msg, ['path', 'filePath', 'filename', 'fileName', 'realFilename', 'portableFilename']);
    if (!path) {
      return;
    }
    const commandId = this.resolveFileCommandId(msg) ?? this.sendFileAnnounce(path);
    const mask = this.resolveMaskFromMessage(msg, ['playerMask', 'mask', 'recipientMask']);
    this.ensureFileTransferFromMessage(msg, { commandId });
    if (commandId !== null) {
      if (commandId >= this.commandIdSeed) {
        this.commandIdSeed = commandId + 1;
      }
      this.fileTransfers.set(Math.trunc(commandId), {
        commandId: Math.trunc(commandId),
        path,
        progressBySlot: this.createTransferProgressByPlayerMask(mask),
      });
    }
  }

  processFileProgressCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as { [key: string]: unknown };
    const commandId = this.resolveFileCommandId(msg);
    const sender = this.resolvePlayerFromMessage(msg);
    const progress = this.resolveNumericFieldFromMessage(msg, ['progress']);
    if (commandId === null || sender === null || progress === null) {
      return;
    }

    this.updateFileProgress(Math.trunc(commandId), Math.trunc(sender), progress);
  }

  processFrameResendRequestCommand(_message: unknown): void {
    this.pendingFrameNotices += 1;
    this.frameReady = true;
  }

  private processPacketRouterQueryCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as { [key: string]: unknown };
    const querySender = this.resolvePlayerFromMessage(msg);
    if (querySender === null) {
      return;
    }

    if (querySender < 0 || querySender >= MAX_SLOTS) {
      return;
    }

    this.lastPacketRouterQuerySender = querySender;
    if (!this.isPacketRouter()) {
      return;
    }

    this.packetRouterEvents.onPacketRouterQueryReceived?.(querySender, this.packetRouterSlot);
    this.lastPacketRouterAckSender = querySender;

    const transport = this.transport as TransportLike | null;
    const directSend = transport?.sendLocalCommandDirect;
    if (typeof directSend === 'function') {
      const ackMessage = {
        commandType: NETCOMMANDTYPE_PACKETROUTERACK,
        type: 'packetrouterack',
        sender: this.localPlayerID,
      };
      directSend.call(transport, ackMessage, 1 << querySender);
    }
  }

  private processPacketRouterAckCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as { [key: string]: unknown };
    const ackSender = this.resolvePlayerFromMessage(msg);
    if (ackSender === null) {
      return;
    }

    if (ackSender < 0 || ackSender >= MAX_SLOTS) {
      return;
    }
    if (ackSender !== this.packetRouterSlot) {
      return;
    }

    this.lastPacketRouterAckSender = ackSender;
    this.packetRouterEvents.onPacketRouterAckReceived?.(ackSender, this.packetRouterSlot);
  }

  processWrapperCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    const wrappedCandidate = message as {
      wrapped?: unknown;
      command?: unknown;
      inner?: unknown;
    };
    const wrapped = wrappedCandidate.wrapped ?? wrappedCandidate.command ?? wrappedCandidate.inner;
    if (wrapped && typeof wrapped === 'object') {
      const wrappedHandled = this.processIncomingCommand(wrapped);
      if (wrappedHandled) {
        return;
      }
    }

    const chunk = this.parseWrapperChunk(message);
    if (!chunk) {
      return;
    }

    if (chunk.numChunks === 0) {
      this.activeWrapperAssemblies.delete(chunk.wrappedCommandID);
      return;
    }

    if (!this.activeWrapperAssemblies.has(chunk.wrappedCommandID)) {
      this.activeWrapperAssemblies.set(chunk.wrappedCommandID, {
        chunks: new Uint8Array(chunk.totalDataLength),
        chunkReceived: new Uint8Array(chunk.numChunks),
        expectedChunks: chunk.numChunks,
        totalLength: chunk.totalDataLength,
        receivedChunks: 0,
      });
    }

    const assembly = this.activeWrapperAssemblies.get(chunk.wrappedCommandID);
    if (!assembly) {
      return;
    }
    if (
      chunk.chunkNumber < 0
      || chunk.chunkNumber >= assembly.expectedChunks
    ) {
      return;
    }
    if (chunk.dataOffset + chunk.chunkData.byteLength > assembly.totalLength) {
      return;
    }

    if (assembly.chunkReceived[chunk.chunkNumber] === 1) {
      return;
    }

    assembly.chunkReceived[chunk.chunkNumber] = 1;
    assembly.receivedChunks += 1;
    assembly.chunks.set(chunk.chunkData, chunk.dataOffset);

    if (!this.isWrapperAssemblyComplete(assembly)) {
      return;
    }

    this.activeWrapperAssemblies.delete(chunk.wrappedCommandID);
    const parsedWrapped = this.parseWrappedNetCommand(assembly.chunks);
    if (!parsedWrapped) {
      return;
    }
    this.processIncomingCommand(parsedWrapped);
  }

  private isWrapperAssemblyComplete(assembly: WrapperAssembly): boolean {
    return assembly.receivedChunks === assembly.expectedChunks;
  }

  private parseWrapperChunk(message: unknown): WrapperChunk | null {
    if (!message || typeof message !== 'object') {
      return null;
    }

    const candidate = message as {
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

    const fromPayload = this.parseWrapperChunkFromBinary(candidate.payload);
    if (fromPayload) {
      return fromPayload;
    }

    const fromDataObject = this.parseWrapperChunkFromObject(candidate);
    if (fromDataObject) {
      return fromDataObject;
    }

    return null;
  }

  private parseWrapperChunkFromBinary(payload: unknown): WrapperChunk | null {
    const data = this.asByteArray(payload);
    if (!data) {
      return null;
    }
    return this.parseWrapperChunkFromByteBuffer(data);
  }

  private parseWrapperChunkFromObject(message: {
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
  }): WrapperChunk | null {
    const wrappedCommandID = this.resolveNumericField(
      message.wrappedCommandID ?? message.wrappedCmdID ?? message.wrappedCommandId ?? message.wrappedCmdId,
    );
    const chunkNumber = this.resolveNumericField(message.chunkNumber);
    const numChunks = this.resolveNumericField(message.numChunks);
    const totalDataLength = this.resolveNumericField(message.totalDataLength);
    const dataOffset = this.resolveNumericField(message.dataOffset);
    const explicitDataLength = this.resolveNumericField(message.dataLength);
    const hasDataField = message.data !== undefined || message.payload !== undefined;
    const data = hasDataField ? this.asByteArray(message.data ?? message.payload) : null;
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

  private parseWrapperChunkFromByteBuffer(bytes: Uint8Array): WrapperChunk | null {
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
      if (chunkNumber !== 0 || totalDataLength !== 0 || dataOffset !== 0 || dataLength !== 0 || payloadStart !== bytes.length) {
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

  private parseWrappedNetCommand(raw: Uint8Array): { [key: string]: unknown } | null {
    const data = this.asByteArray(raw);
    if (!data || data.length === 0) {
      return null;
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let index = 0;

    let commandType: number | null = null;
    let sender: number | null = null;
    let executionFrame: number | null = null;
    let commandId: number | null = null;

    const readUint8 = (): number | null => {
      if (index >= data.length) {
        return null;
      }
      const value = view.getUint8(index);
      index += 1;
      return value;
    };
    const readUint16 = (): number | null => {
      if (index + 2 > data.length) {
        return null;
      }
      const value = view.getUint16(index, true);
      index += 2;
      return value;
    };
    const readUint32 = (): number | null => {
      if (index + 4 > data.length) {
        return null;
      }
      const value = view.getUint32(index, true);
      index += 4;
      return value;
    };
    const readInt32 = (): number | null => {
      if (index + 4 > data.length) {
        return null;
      }
      const value = view.getInt32(index, true);
      index += 4;
      return value;
    };
    const readFloat32 = (): number | null => {
      if (index + 4 > data.length) {
        return null;
      }
      const value = view.getFloat32(index, true);
      index += 4;
      return value;
    };
    const readUtf16 = (): string | null => {
      const length = readUint8();
      if (length === null) {
        return null;
      }
      const chars: number[] = [];
      for (let i = 0; i < length; i += 1) {
        const charCode = this.readUint16FromView(view, index, data.length);
        if (charCode === null) {
          return null;
        }
        chars.push(charCode);
        index += 2;
      }
      return String.fromCharCode(...chars);
    };
    const readAsciiPath = (): string | null => {
      const chars: number[] = [];
      while (index < data.length) {
        const charCode = readUint8();
        if (charCode === null) {
          return null;
        }
        if (charCode === 0) {
          break;
        }
        chars.push(charCode);
      }
      return String.fromCharCode(...chars);
    };

    while (index < data.length) {
      const marker = readUint8();
      if (marker === null) {
        return null;
      }
      if (marker === 'T'.charCodeAt(0)) {
        const next = readUint8();
        if (next === null) {
          return null;
        }
        commandType = next;
        continue;
      }
      if (marker === 'F'.charCodeAt(0)) {
        const next = readUint32();
        if (next === null) {
          return null;
        }
        executionFrame = next;
        continue;
      }
      if (marker === 'P'.charCodeAt(0)) {
        const next = readUint8();
        if (next === null) {
          return null;
        }
        sender = next;
        continue;
      }
      if (marker === 'R'.charCodeAt(0)) {
        const next = readUint8();
        if (next === null) {
          return null;
        }
        void next;
        continue;
      }
      if (marker === 'C'.charCodeAt(0)) {
        const next = readUint16();
        if (next === null) {
          return null;
        }
        commandId = next;
        continue;
      }
      if (marker === 'D'.charCodeAt(0)) {
        break;
      }
      return null;
    }

    if (commandType === null) {
      return null;
    }

    const command: { [key: string]: unknown } = { commandType };
    if (sender !== null) {
      command.sender = sender;
    }
    if (executionFrame !== null) {
      command.executionFrame = executionFrame;
    }
    if (commandId !== null) {
      command.commandId = commandId;
    }

    if (commandType === NETCOMMANDTYPE_FRAMEINFO) {
      const commandCount = readUint16();
      if (commandCount === null) {
        return null;
      }
      command.commandCount = commandCount;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_RUNAHEADMETRICS) {
      const averageLatency = readFloat32();
      const averageFps = readUint16();
      if (averageLatency === null || averageFps === null) {
        return null;
      }
      command.averageLatency = averageLatency;
      command.averageFps = averageFps;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_RUNAHEAD) {
      const runAhead = readUint16();
      const frameRate = readUint8();
      if (runAhead === null || frameRate === null) {
        return null;
      }
      command.runAhead = runAhead;
      command.frameRate = frameRate;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_PLAYERLEAVE) {
      const leavingPlayerID = readUint8();
      if (leavingPlayerID === null) {
        return null;
      }
      command.leavingPlayerID = leavingPlayerID;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_DESTROYPLAYER) {
      const playerIndex = readUint32();
      if (playerIndex === null) {
        return null;
      }
      command.playerIndex = playerIndex;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_DISCONNECTCHAT) {
      const text = readUtf16();
      if (text === null) {
        return null;
      }
      command.text = text;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_CHAT) {
      const text = readUtf16();
      const playerMask = readInt32();
      if (text === null || playerMask === null) {
        return null;
      }
      command.text = text;
      command.playerMask = playerMask;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_PROGRESS) {
      const percentage = readUint8();
      if (percentage === null) {
        return null;
      }
      command.percentage = percentage;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_FILE) {
      const path = readAsciiPath();
      const fileDataLength = readUint32();
      if (path === null || fileDataLength === null) {
        return null;
      }
      if (fileDataLength > data.length - index) {
        return null;
      }
      command.path = path;
      index += fileDataLength;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_FILEANNOUNCE) {
      const path = readAsciiPath();
      const commandIdValue = readUint16();
      const playerMask = readUint8();
      if (path === null || commandIdValue === null || playerMask === null) {
        return null;
      }
      command.path = path;
      command.commandId = commandIdValue;
      command.playerMask = playerMask;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_FILEPROGRESS) {
      const commandIdValue = readUint16();
      const progress = readInt32();
      if (commandIdValue === null || progress === null) {
        return null;
      }
      command.commandId = commandIdValue;
      command.progress = progress;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_FRAMERESENDREQUEST) {
      const frame = readUint32();
      if (frame === null) {
        return null;
      }
      command.frame = frame;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_DISCONNECTPLAYER) {
      const slot = readUint8();
      const disconnectFrame = readUint32();
      if (slot === null || disconnectFrame === null) {
        return null;
      }
      command.slot = slot;
      command.disconnectFrame = disconnectFrame;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_DISCONNECTVOTE) {
      const slot = readUint8();
      const voteFrame = readUint32();
      if (slot === null || voteFrame === null) {
        return null;
      }
      command.voteSlot = slot;
      command.voteFrame = voteFrame;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_DISCONNECTFRAME) {
      const frame = readUint32();
      if (frame === null) {
        return null;
      }
      command.frame = frame;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_DISCONNECTSCREENOFF) {
      const newFrame = readUint32();
      if (newFrame === null) {
        return null;
      }
      command.newFrame = newFrame;
      return command;
    }

    if (commandType === NETCOMMANDTYPE_WRAPPER) {
      const wrappedCommandID = readUint16();
      const chunkNumber = readUint32();
      const numChunks = readUint32();
      const totalDataLength = readUint32();
      const dataLength = readUint32();
      const dataOffset = readUint32();
      if (
        wrappedCommandID === null
        || chunkNumber === null
        || numChunks === null
        || totalDataLength === null
        || dataLength === null
        || dataOffset === null
      ) {
        return null;
      }
      const payloadStart = index;
      if (payloadStart + dataLength > data.length) {
        return null;
      }
      index += dataLength;
      command.wrappedCommandID = wrappedCommandID;
      command.chunkNumber = chunkNumber;
      command.numChunks = numChunks;
      command.totalDataLength = totalDataLength;
      command.dataOffset = dataOffset;
      command.data = data.subarray(payloadStart, payloadStart + dataLength);
      return command;
    }

    return command;
  }

  private readUint16FromView(view: DataView, index: number, length: number): number | null {
    if (index + 2 > length) {
      return null;
    }
    const value = view.getUint16(index, true);
    return value;
  }

  processDisconnectCommand(commandType: number, message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (commandType === NETCOMMANDTYPE_DISCONNECTKEEPALIVE) {
      return;
    }

    const msg = message as { [key: string]: unknown };
    const slot = this.resolvePlayerFromMessage(msg);
    if (slot === null) {
      return;
    }

    const targetSlot = Math.trunc(slot);
    if (targetSlot < 0 || targetSlot >= MAX_SLOTS) {
      return;
    }
    this.markPlayerDisconnected(targetSlot);
  }

  processRunAheadMetricsCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }

    const msg = message as {
      playerID?: unknown;
      player?: unknown;
      averageFps?: unknown;
      averageLatency?: unknown;
      getPlayerID?: () => unknown;
      getAverageFps?: () => unknown;
      getAverageFPS?: () => unknown;
      getAverageLatency?: () => unknown;
      playerId?: unknown;
      avgFps?: unknown;
      playerIdNumber?: unknown;
      sender?: unknown;
      slot?: unknown;
      getSender?: () => unknown;
      getSlot?: () => unknown;
    };

    const player = this.resolvePlayerFromMessage(msg);
    const averageFps = this.resolveNumericFieldFromMessage(
      msg,
      ['averageFps', 'avgFps'],
      ['getAverageFps', 'getAverageFPS'],
    );
    if (player === null || averageFps === null) {
      return;
    }

    const slot = Math.trunc(player);
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS) {
      return;
    }

    if (!this.isPlayerConnected(slot) && slot !== this.localPlayerID) {
      return;
    }

    let fps = Math.trunc(averageFps);
    if (Number.isNaN(fps)) {
      return;
    }
    if (fps < 0) {
      fps = 0;
    }
    if (fps > 100) {
      fps = 100;
    }

    this.slotAverageFPS[slot] = fps;

    const averageLatency = this.resolveNumericField(
      this.resolveMessageGetter(msg, 'getAverageLatency') ?? msg.averageLatency,
    );
    if (averageLatency !== null) {
      this.slotAverageLatency[slot] = averageLatency;
    }
  }

  processRunaheadCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }

    const msg = message as {
      newRunAhead?: unknown;
      runAhead?: unknown;
      newFrameRate?: unknown;
      frameRate?: unknown;
      getNewRunAhead?: () => unknown;
      getRunAhead?: () => unknown;
      getNewFrameRate?: () => unknown;
      getFrameRate?: () => unknown;
    };

    const newRunAhead = this.resolveNumericFieldFromMessage(
      msg,
      ['newRunAhead', 'runAhead'],
      ['getNewRunAhead', 'getRunAhead'],
    );
    const newFrameRate = this.resolveNumericFieldFromMessage(
      msg,
      ['newFrameRate', 'frameRate'],
      ['getNewFrameRate', 'getFrameRate'],
    );
    if (newRunAhead === null || newFrameRate === null) {
      return;
    }

    const safeRunAhead = Math.trunc(newRunAhead);
    const safeFrameRate = Math.trunc(newFrameRate);
    if (!Number.isInteger(safeRunAhead) || !Number.isInteger(safeFrameRate)) {
      return;
    }
    if (safeRunAhead < 0 || safeFrameRate <= 0) {
      return;
    }

    this.runAhead = safeRunAhead;
    this.frameRate = Math.max(1, Math.min(MAX_FRAME_RATE, safeFrameRate));
    this.lastExecutionFrame = Math.max(this.lastExecutionFrame, this.gameFrame + this.runAhead);
  }

  processPlayerLeaveCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as {
      leavingPlayerID?: unknown;
      slot?: unknown;
      getLeavingPlayerID?: () => unknown;
      getSlot?: () => unknown;
    };
    const slot = this.resolveNumericFieldFromMessage(
      msg,
      ['leavingPlayerID', 'slot'],
      ['getLeavingPlayerID', 'getSlot'],
    );
    if (slot === null) {
      return;
    }

    const targetSlot = Math.trunc(slot);
    if (targetSlot < 0 || targetSlot >= MAX_SLOTS) {
      return;
    }
    this.markPlayerDisconnected(targetSlot);
  }

  processDestroyPlayerCommand(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as {
      playerIndex?: unknown;
      slot?: unknown;
      getPlayerIndex?: () => unknown;
      getSlot?: () => unknown;
    };
    const slot = this.resolveNumericFieldFromMessage(
      msg,
      ['playerIndex', 'slot'],
      ['getPlayerIndex', 'getSlot'],
    );
    if (slot === null) {
      return;
    }

    const targetSlot = Math.trunc(slot);
    if (targetSlot < 0 || targetSlot >= MAX_SLOTS) {
      return;
    }
    this.markPlayerDisconnected(targetSlot);
  }

  attachTransport(_transport: unknown): void {
    this.transport = _transport;
  }

  initTransport(): void {
    if (this.transport && typeof (this.transport as { init?: () => void }).init === 'function') {
      (this.transport as { init: () => void }).init();
    }
  }

  sawCRCMismatch(): boolean {
    return this.crcMismatch;
  }

  setSawCRCMismatch(): void {
    this.crcMismatch = true;
  }

  private markPlayerDisconnected(slot = 0): void {
    if (slot < 0) {
      return;
    }

    this.disconnectedPlayers.add(slot);
  }

  isPlayerConnected(playerID = 0): boolean {
    if (playerID < 0) {
      return false;
    }

    if (this.disconnectedPlayers.has(playerID)) {
      return false;
    }

    if (this.playerNames.size > 0) {
      return this.playerNames.has(playerID) || playerID === this.localPlayerID;
    }

    return playerID >= 0 && playerID < this.numPlayers;
  }

  notifyOthersOfCurrentFrame(): void {
    this.notifyOthersOfNewFrame(this.gameFrame);
  }

  notifyOthersOfNewFrame(frame: number): void {
    this.expectedNetworkFrame = Math.max(this.expectedNetworkFrame, frame);
    this.pendingFrameNotices += 1;
    this.frameReady = true;
  }

  getExecutionFrame(): number {
    if (!this.started) {
      return 0;
    }

    return Math.max(this.lastExecutionFrame, this.gameFrame + this.runAhead);
  }

  toggleNetworkOn(): void {
    this.networkOn = !this.networkOn;
  }

  getPingFrame(): number {
    return this.pingFrame;
  }

  getPingsSent(): number {
    return this.pingsSent;
  }

  getPingsRecieved(): number {
    return this.pingsReceived;
  }

  getPingsReceived(): number {
    return this.getPingsRecieved();
  }

  private callTransportMetric(name: TransportMetricName): number {
    const transport = this.transport as TransportLike | null;
    if (!transport) {
      return 0;
    }
    const getter = transport[name];
    if (typeof getter !== 'function') {
      return 0;
    }
    const value = getter.call(transport);
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private resolveCommandType(message: unknown): number | null {
    if (!message || typeof message !== 'object') {
      return null;
    }

    const candidate = message as {
      commandType?: unknown;
      netCommandType?: unknown;
      type?: unknown;
      kind?: unknown;
      getCommandType?: () => unknown;
      getNetCommandType?: () => unknown;
    };

    const commandType = this.resolveNumericField(
      candidate.commandType
      ?? candidate.netCommandType
      ?? candidate.type
      ?? candidate.kind
      ?? this.resolveMessageGetter(candidate, 'getCommandType')
      ?? this.resolveMessageGetter(candidate, 'getNetCommandType'),
    );
    if (commandType !== null) {
      return Math.trunc(commandType);
    }

    const commandTypeName = this.resolveTextField(
      candidate.type
      ?? candidate.kind
      ?? candidate.commandType
      ?? candidate.netCommandType
      ?? this.resolveMessageGetter(candidate, 'getCommandType')
      ?? this.resolveMessageGetter(candidate, 'getNetCommandType'),
    );
    if (commandTypeName === null) {
      return null;
    }

    const commandTypeKey = commandTypeName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalized = commandTypeKey.replace(/^netcommandtype/, '');

    if (normalized === 'runaheadmetrics') {
      return NETCOMMANDTYPE_RUNAHEADMETRICS;
    }
    if (normalized === 'ackboth') {
      return NETCOMMANDTYPE_ACKBOTH;
    }
    if (normalized === 'ackstage1') {
      return NETCOMMANDTYPE_ACKSTAGE1;
    }
    if (normalized === 'ackstage2') {
      return NETCOMMANDTYPE_ACKSTAGE2;
    }
    if (normalized === 'gamecommand') {
      return NETCOMMANDTYPE_GAMECOMMAND;
    }
    if (normalized === 'runahead') {
      return NETCOMMANDTYPE_RUNAHEAD;
    }
    if (normalized === 'playerleave') {
      return NETCOMMANDTYPE_PLAYERLEAVE;
    }
    if (normalized === 'destroyplayer') {
      return NETCOMMANDTYPE_DESTROYPLAYER;
    }
    if (normalized === 'frameinfo') {
      return NETCOMMANDTYPE_FRAMEINFO;
    }
    if (normalized === 'progress') {
      return NETCOMMANDTYPE_PROGRESS;
    }
    if (normalized === 'loadcomplete') {
      return NETCOMMANDTYPE_LOADCOMPLETE;
    }
    if (normalized === 'timeoutstart') {
      return NETCOMMANDTYPE_TIMEOUTSTART;
    }
    if (normalized === 'keepalive') {
      return NETCOMMANDTYPE_KEEPALIVE;
    }
    if (normalized === 'disconnectchat') {
      return NETCOMMANDTYPE_DISCONNECTCHAT;
    }
    if (normalized === 'chat') {
      return NETCOMMANDTYPE_CHAT;
    }
    if (normalized === 'wrapper') {
      return NETCOMMANDTYPE_WRAPPER;
    }
    if (normalized === 'file') {
      return NETCOMMANDTYPE_FILE;
    }
    if (normalized === 'fileannounce') {
      return NETCOMMANDTYPE_FILEANNOUNCE;
    }
    if (normalized === 'fileprogress') {
      return NETCOMMANDTYPE_FILEPROGRESS;
    }
    if (normalized === 'frameresendrequest') {
      return NETCOMMANDTYPE_FRAMERESENDREQUEST;
    }
    if (normalized === 'disconnectstart') {
      return NETCOMMANDTYPE_DISCONNECTSTART;
    }
    if (normalized === 'disconnectkeepalive') {
      return NETCOMMANDTYPE_DISCONNECTKEEPALIVE;
    }
    if (normalized === 'disconnectplayer') {
      return NETCOMMANDTYPE_DISCONNECTPLAYER;
    }
    if (normalized === 'manglerquery') {
      return NETCOMMANDTYPE_MANGLERQUERY;
    }
    if (normalized === 'manglerresponse') {
      return NETCOMMANDTYPE_MANGLERRESPONSE;
    }
    if (normalized === 'packetrouterquery') {
      return NETCOMMANDTYPE_PACKETROUTERQUERY;
    }
    if (normalized === 'packetrouterack') {
      return NETCOMMANDTYPE_PACKETROUTERACK;
    }
    if (normalized === 'disconnectvote') {
      return NETCOMMANDTYPE_DISCONNECTVOTE;
    }
    if (normalized === 'disconnectframe') {
      return NETCOMMANDTYPE_DISCONNECTFRAME;
    }
    if (normalized === 'disconnectscreenoff') {
      return NETCOMMANDTYPE_DISCONNECTSCREENOFF;
    }

    return null;
  }
}

let networkClientSingleton: NetworkManager | null = null;

export function initializeNetworkClient(options: NetworkManagerOptions = {}): NetworkManager {
  if (!networkClientSingleton) {
    networkClientSingleton = new NetworkManager(options);
  }

  networkClientSingleton.init();
  return networkClientSingleton;
}

export function getNetworkClient(): NetworkManager | null {
  return networkClientSingleton;
}

export interface NetworkManagerOptions {
  debugLabel?: string;
  forceSinglePlayer?: boolean;
  localPlayerID?: number;
  localPlayerName?: string;
  frameRate?: number;
  runAhead?: number;
  packetRouterEvents?: PacketRouterEvents;
}
