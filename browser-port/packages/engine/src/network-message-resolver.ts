/**
 * Source-backed network message resolver helpers.
 *
 * Source references:
 * - Generals/Code/GameEngine/Include/GameNetwork/NetCommandMsg.h
 *   (NetCommandMsg::getPlayerID/getExecutionFrame/getID base getters)
 * - Generals/Code/GameEngine/Source/GameNetwork/ConnectionManager.cpp
 *   (processFrameInfo/processFile/processChat field usage across command types)
 * - Generals/Code/GameEngine/Source/GameNetwork/NetworkUtil.cpp
 *   (CRC/hash command handling and validation policy)
 */

import type { NetworkMessageLike } from './network-message-field.js';
import {
  resolveNetworkNumericFieldFromMessage,
} from './network-message-field.js';

const PLAYER_KEYS = [
  'playerID',
  'player',
  'sender',
  'slot',
  'disconnectSlot',
  'voteSlot',
  'slotId',
  'playerId',
  'playerNumber',
] as const;

const PLAYER_GETTERS = [
  'getPlayerID',
  'getPlayer',
  'getSender',
  'getSlot',
  'getDisconnectSlot',
  'getVoteSlot',
] as const;

const FILE_COMMAND_ID_KEYS = [
  'commandId',
  'fileId',
  'fileID',
  'id',
  'wrappedCommandID',
] as const;

const DEFAULT_MASK_GETTERS = [
  'getPlayerMask',
  'getFrameMask',
] as const;

export interface ResolvedNetworkFrameHash {
  kind: 'logic-crc' | 'frame-hash';
  value: number;
}

export function resolveNetworkPlayerFromMessage(message: NetworkMessageLike): number | null {
  return resolveNetworkNumericFieldFromMessage(message, PLAYER_KEYS, PLAYER_GETTERS);
}

export function resolveNetworkFileCommandIdFromMessage(message: NetworkMessageLike): number | null {
  return resolveNetworkNumericFieldFromMessage(message, FILE_COMMAND_ID_KEYS);
}

export function resolveNetworkMaskFromMessage(
  message: NetworkMessageLike,
  keys: readonly string[],
): number {
  return resolveNetworkNumericFieldFromMessage(message, keys, DEFAULT_MASK_GETTERS) ?? 0;
}

export function resolveNetworkFrameHashFromFrameInfo(
  message: NetworkMessageLike,
): ResolvedNetworkFrameHash | null {
  const logicCrc = resolveNetworkNumericFieldFromMessage(
    message,
    ['logicCRC', 'crc'],
    ['getLogicCRC', 'getCRC'],
  );
  if (logicCrc !== null) {
    return {
      kind: 'logic-crc',
      value: logicCrc >>> 0,
    };
  }

  const frameHash = resolveNetworkNumericFieldFromMessage(
    message,
    ['frameHash', 'hash'],
    ['getFrameHash'],
  );
  if (frameHash !== null) {
    return {
      kind: 'frame-hash',
      value: frameHash >>> 0,
    };
  }

  return null;
}
