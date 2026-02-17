/**
 * Source-backed frame-info parsing for network boundary ownership.
 *
 * Source references:
 * - Generals/Code/GameEngine/Source/GameNetwork/ConnectionManager.cpp
 *   (ConnectionManager::processFrameInfo)
 * - Generals/Code/GameEngine/Source/GameNetwork/ConnectionManager.cpp
 *   (ConnectionManager::allCommandsReady frame command-count flow)
 */

import {
  resolveNetworkFrameHashFromFrameInfo,
  resolveNetworkPlayerFromMessage,
} from './network-message-resolver.js';
import { resolveNetworkNumericFieldFromMessage } from './network-message-field.js';
import type { ResolvedNetworkFrameHash } from './network-message-resolver.js';

export interface ParsedNetworkFrameInfo {
  sender: number;
  frame: number;
  commandCount: number | null;
  hash: ResolvedNetworkFrameHash | null;
}

export interface ParseNetworkFrameInfoOptions {
  maxSlots?: number;
}

export function parseNetworkFrameInfoMessage(
  message: unknown,
  options: ParseNetworkFrameInfoOptions = {},
): ParsedNetworkFrameInfo | null {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const msg = message as { [key: string]: unknown };
  const sender = resolveNetworkPlayerFromMessage(msg);
  const frame = resolveNetworkNumericFieldFromMessage(msg, ['frame', 'executionFrame', 'gameFrame', 'frameInfo']);
  if (sender === null || frame === null) {
    return null;
  }

  const safeSender = Math.trunc(sender);
  const safeFrame = Math.trunc(frame);
  if (!Number.isInteger(safeSender) || !Number.isInteger(safeFrame) || safeFrame < 0) {
    return null;
  }

  if (typeof options.maxSlots === 'number') {
    if (!Number.isInteger(options.maxSlots) || options.maxSlots <= 0) {
      return null;
    }
    if (safeSender < 0 || safeSender >= options.maxSlots) {
      return null;
    }
  }

  const commandCountValue = resolveNetworkNumericFieldFromMessage(msg, ['commandCount', 'count']);
  let commandCount: number | null = null;
  if (commandCountValue !== null) {
    const safeCommandCount = Math.trunc(commandCountValue);
    if (Number.isInteger(safeCommandCount) && safeCommandCount >= 0) {
      commandCount = safeCommandCount;
    }
  }

  return {
    sender: safeSender,
    frame: safeFrame,
    commandCount,
    hash: resolveNetworkFrameHashFromFrameInfo(msg),
  };
}

