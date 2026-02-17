/**
 * Source-backed frame-resend-request parsing helpers.
 *
 * Source references:
 * - Generals/Code/GameEngine/Source/GameNetwork/ConnectionManager.cpp
 *   (ConnectionManager::processFrameResendRequest)
 * - Generals/Code/GameEngine/Source/GameNetwork/NetPacket.cpp
 *   (readFrameResendRequestMessage frame payload field)
 */

import { resolveNetworkNumericFieldFromMessage } from './network-message-field.js';
import { resolveNetworkPlayerFromMessage } from './network-message-resolver.js';

export interface ParsedNetworkFrameResendRequest {
  sender: number;
  frameToResend: number | null;
}

export interface ParseNetworkFrameResendRequestOptions {
  maxSlots?: number;
}

export function parseNetworkFrameResendRequestMessage(
  message: unknown,
  options: ParseNetworkFrameResendRequestOptions = {},
): ParsedNetworkFrameResendRequest | null {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const msg = message as { [key: string]: unknown };
  const sender = resolveNetworkPlayerFromMessage(msg);
  if (sender === null) {
    return null;
  }

  const safeSender = Math.trunc(sender);
  if (!Number.isInteger(safeSender) || safeSender < 0) {
    return null;
  }

  if (typeof options.maxSlots === 'number') {
    if (!Number.isInteger(options.maxSlots) || options.maxSlots <= 0) {
      return null;
    }
    if (safeSender >= options.maxSlots) {
      return null;
    }
  }

  const frameToResendValue = resolveNetworkNumericFieldFromMessage(
    msg,
    ['frameToResend', 'frame', 'executionFrame'],
    ['getFrameToResend', 'getFrame', 'getExecutionFrame'],
  );
  let frameToResend: number | null = null;
  if (frameToResendValue !== null) {
    const safeFrameToResend = Math.trunc(frameToResendValue);
    if (Number.isInteger(safeFrameToResend) && safeFrameToResend >= 0) {
      frameToResend = safeFrameToResend;
    }
  }

  return {
    sender: safeSender,
    frameToResend,
  };
}

