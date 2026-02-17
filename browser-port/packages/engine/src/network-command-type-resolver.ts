/**
 * Source-backed network command type name/ID resolution.
 *
 * Source references:
 * - Generals/Code/GameEngine/Source/GameNetwork/NetworkUtil.cpp
 *   (GetAsciiNetCommandType)
 */

import {
  NETCOMMANDTYPE_ACKBOTH,
  NETCOMMANDTYPE_ACKSTAGE1,
  NETCOMMANDTYPE_ACKSTAGE2,
  NETCOMMANDTYPE_CHAT,
  NETCOMMANDTYPE_DESTROYPLAYER,
  NETCOMMANDTYPE_DISCONNECTCHAT,
  NETCOMMANDTYPE_DISCONNECTFRAME,
  NETCOMMANDTYPE_DISCONNECTKEEPALIVE,
  NETCOMMANDTYPE_DISCONNECTPLAYER,
  NETCOMMANDTYPE_DISCONNECTSCREENOFF,
  NETCOMMANDTYPE_DISCONNECTVOTE,
  NETCOMMANDTYPE_FILE,
  NETCOMMANDTYPE_FILEANNOUNCE,
  NETCOMMANDTYPE_FILEPROGRESS,
  NETCOMMANDTYPE_FRAMEINFO,
  NETCOMMANDTYPE_FRAMERESENDREQUEST,
  NETCOMMANDTYPE_GAMECOMMAND,
  NETCOMMANDTYPE_KEEPALIVE,
  NETCOMMANDTYPE_LOADCOMPLETE,
  NETCOMMANDTYPE_MANGLERQUERY,
  NETCOMMANDTYPE_MANGLERRESPONSE,
  NETCOMMANDTYPE_PACKETROUTERACK,
  NETCOMMANDTYPE_PACKETROUTERQUERY,
  NETCOMMANDTYPE_PLAYERLEAVE,
  NETCOMMANDTYPE_PROGRESS,
  NETCOMMANDTYPE_RUNAHEAD,
  NETCOMMANDTYPE_RUNAHEADMETRICS,
  NETCOMMANDTYPE_TIMEOUTSTART,
  NETCOMMANDTYPE_UNKNOWN,
  NETCOMMANDTYPE_WRAPPER,
} from './network-command-type.js';
import {
  resolveNetworkMessageGetter,
} from './network-message-field.js';

const SOURCE_ASCII_NAME_BY_TYPE = new Map<number, string>([
  [NETCOMMANDTYPE_FRAMEINFO, 'NETCOMMANDTYPE_FRAMEINFO'],
  [NETCOMMANDTYPE_GAMECOMMAND, 'NETCOMMANDTYPE_GAMECOMMAND'],
  [NETCOMMANDTYPE_PLAYERLEAVE, 'NETCOMMANDTYPE_PLAYERLEAVE'],
  [NETCOMMANDTYPE_RUNAHEADMETRICS, 'NETCOMMANDTYPE_RUNAHEADMETRICS'],
  [NETCOMMANDTYPE_RUNAHEAD, 'NETCOMMANDTYPE_RUNAHEAD'],
  [NETCOMMANDTYPE_DESTROYPLAYER, 'NETCOMMANDTYPE_DESTROYPLAYER'],
  [NETCOMMANDTYPE_ACKBOTH, 'NETCOMMANDTYPE_ACKBOTH'],
  [NETCOMMANDTYPE_ACKSTAGE1, 'NETCOMMANDTYPE_ACKSTAGE1'],
  [NETCOMMANDTYPE_ACKSTAGE2, 'NETCOMMANDTYPE_ACKSTAGE2'],
  [NETCOMMANDTYPE_KEEPALIVE, 'NETCOMMANDTYPE_KEEPALIVE'],
  [NETCOMMANDTYPE_DISCONNECTCHAT, 'NETCOMMANDTYPE_DISCONNECTCHAT'],
  [NETCOMMANDTYPE_CHAT, 'NETCOMMANDTYPE_CHAT'],
  [NETCOMMANDTYPE_MANGLERQUERY, 'NETCOMMANDTYPE_MANGLERQUERY'],
  [NETCOMMANDTYPE_MANGLERRESPONSE, 'NETCOMMANDTYPE_MANGLERRESPONSE'],
  [NETCOMMANDTYPE_DISCONNECTKEEPALIVE, 'NETCOMMANDTYPE_DISCONNECTKEEPALIVE'],
  [NETCOMMANDTYPE_DISCONNECTPLAYER, 'NETCOMMANDTYPE_DISCONNECTPLAYER'],
  [NETCOMMANDTYPE_PACKETROUTERQUERY, 'NETCOMMANDTYPE_PACKETROUTERQUERY'],
  [NETCOMMANDTYPE_PACKETROUTERACK, 'NETCOMMANDTYPE_PACKETROUTERACK'],
  [NETCOMMANDTYPE_DISCONNECTVOTE, 'NETCOMMANDTYPE_DISCONNECTVOTE'],
  [NETCOMMANDTYPE_PROGRESS, 'NETCOMMANDTYPE_PROGRESS'],
  [NETCOMMANDTYPE_LOADCOMPLETE, 'NETCOMMANDTYPE_LOADCOMPLETE'],
  [NETCOMMANDTYPE_TIMEOUTSTART, 'NETCOMMANDTYPE_TIMEOUTSTART'],
  [NETCOMMANDTYPE_WRAPPER, 'NETCOMMANDTYPE_WRAPPER'],
  [NETCOMMANDTYPE_FILE, 'NETCOMMANDTYPE_FILE'],
  [NETCOMMANDTYPE_FILEANNOUNCE, 'NETCOMMANDTYPE_FILEANNOUNCE'],
  [NETCOMMANDTYPE_FILEPROGRESS, 'NETCOMMANDTYPE_FILEPROGRESS'],
  [NETCOMMANDTYPE_DISCONNECTFRAME, 'NETCOMMANDTYPE_DISCONNECTFRAME'],
  [NETCOMMANDTYPE_DISCONNECTSCREENOFF, 'NETCOMMANDTYPE_DISCONNECTSCREENOFF'],
  [NETCOMMANDTYPE_FRAMERESENDREQUEST, 'NETCOMMANDTYPE_FRAMERESENDREQUEST'],
]);

const TYPE_BY_NORMALIZED_NAME = new Map<string, number>();
for (const [type, sourceName] of SOURCE_ASCII_NAME_BY_TYPE.entries()) {
  const normalizedWithPrefix = normalizeNetworkCommandTypeName(sourceName);
  TYPE_BY_NORMALIZED_NAME.set(normalizedWithPrefix, type);
}

TYPE_BY_NORMALIZED_NAME.set('unknown', NETCOMMANDTYPE_UNKNOWN);

function isFiniteInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value);
}

export function normalizeNetworkCommandTypeName(name: string): string {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized.replace(/^netcommandtype/, '');
}

/**
 * Source parity:
 * - NetworkUtil::GetAsciiNetCommandType
 */
export function getAsciiNetworkCommandType(type: number): string {
  return SOURCE_ASCII_NAME_BY_TYPE.get(type) ?? 'UNKNOWN';
}

export function resolveNetworkCommandTypeName(name: string): number | null {
  const normalized = normalizeNetworkCommandTypeName(name);
  const resolved = TYPE_BY_NORMALIZED_NAME.get(normalized);
  return typeof resolved === 'number' ? resolved : null;
}

export function resolveNetworkCommandType(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!isFiniteInteger(value)) {
      return null;
    }
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (isFiniteInteger(parsed)) {
      return Math.trunc(parsed);
    }
    return resolveNetworkCommandTypeName(trimmed);
  }

  return null;
}

/**
 * Resolves command type from a network command-like object using source-compatible
 * field/getter precedence.
 *
 * Source parity:
 * - NetworkUtil::GetAsciiNetCommandType naming contracts used by packet logs/tools.
 */
export function resolveNetworkCommandTypeFromMessage(message: unknown): number | null {
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

  const numericOrTypedCommandType = resolveNetworkCommandType(
    candidate.commandType
    ?? candidate.netCommandType
    ?? candidate.type
    ?? candidate.kind
    ?? resolveNetworkMessageGetter(candidate, 'getCommandType')
    ?? resolveNetworkMessageGetter(candidate, 'getNetCommandType'),
  );
  if (numericOrTypedCommandType !== null) {
    return numericOrTypedCommandType;
  }

  return resolveNetworkCommandType(
    candidate.type
    ?? candidate.kind
    ?? candidate.commandType
    ?? candidate.netCommandType
    ?? resolveNetworkMessageGetter(candidate, 'getCommandType')
    ?? resolveNetworkMessageGetter(candidate, 'getNetCommandType'),
  );
}
