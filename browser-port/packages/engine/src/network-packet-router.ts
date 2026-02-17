/**
 * Source-backed packet-router command parsing/validation helpers.
 *
 * Source references:
 * - Generals/Code/GameEngine/Source/GameNetwork/DisconnectManager.cpp
 *   (DisconnectManager::processPacketRouterQuery)
 * - Generals/Code/GameEngine/Source/GameNetwork/DisconnectManager.cpp
 *   (DisconnectManager::processPacketRouterAck)
 */

import { resolveNetworkPlayerFromMessage } from './network-message-resolver.js';

export interface ParsedNetworkPacketRouterMessage {
  sender: number;
}

export interface ParseNetworkPacketRouterMessageOptions {
  maxSlots?: number;
}

function parseNetworkPacketRouterMessage(
  message: unknown,
  options: ParseNetworkPacketRouterMessageOptions = {},
): ParsedNetworkPacketRouterMessage | null {
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

  return { sender: safeSender };
}

export function parseNetworkPacketRouterQueryMessage(
  message: unknown,
  options: ParseNetworkPacketRouterMessageOptions = {},
): ParsedNetworkPacketRouterMessage | null {
  return parseNetworkPacketRouterMessage(message, options);
}

export function parseNetworkPacketRouterAckMessage(
  message: unknown,
  options: ParseNetworkPacketRouterMessageOptions = {},
): ParsedNetworkPacketRouterMessage | null {
  return parseNetworkPacketRouterMessage(message, options);
}

/**
 * Source parity:
 * - DisconnectManager::processPacketRouterAck accepts only ack messages whose
 *   sender matches ConnectionManager::getPacketRouterSlot().
 */
export function isNetworkPacketRouterAckFromCurrentRouter(
  ackSender: number,
  packetRouterSlot: number,
): boolean {
  return ackSender === packetRouterSlot;
}

