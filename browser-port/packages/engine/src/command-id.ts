/**
 * Source-backed command ID sequencing and policy guards.
 *
 * Source references:
 * - Generals/Code/GameEngine/Source/GameNetwork/NetworkUtil.cpp
 *   (GenerateNextCommandID, DoesCommandRequireACommandID)
 */

import {
  NETCOMMANDTYPE_CHAT,
  NETCOMMANDTYPE_DESTROYPLAYER,
  NETCOMMANDTYPE_DISCONNECTFRAME,
  NETCOMMANDTYPE_DISCONNECTPLAYER,
  NETCOMMANDTYPE_DISCONNECTSCREENOFF,
  NETCOMMANDTYPE_DISCONNECTVOTE,
  NETCOMMANDTYPE_FILE,
  NETCOMMANDTYPE_FILEANNOUNCE,
  NETCOMMANDTYPE_FILEPROGRESS,
  NETCOMMANDTYPE_FRAMEINFO,
  NETCOMMANDTYPE_FRAMERESENDREQUEST,
  NETCOMMANDTYPE_GAMECOMMAND,
  NETCOMMANDTYPE_LOADCOMPLETE,
  NETCOMMANDTYPE_PLAYERLEAVE,
  NETCOMMANDTYPE_RUNAHEAD,
  NETCOMMANDTYPE_RUNAHEADMETRICS,
  NETCOMMANDTYPE_TIMEOUTSTART,
  NETCOMMANDTYPE_WRAPPER,
} from './network-command-type.js';

export const NETWORK_COMMAND_ID_INITIAL_SEED = 64000;

const UINT16_MASK = 0xffff;

const COMMAND_TYPES_REQUIRING_IDS = new Set<number>([
  NETCOMMANDTYPE_FRAMEINFO,
  NETCOMMANDTYPE_GAMECOMMAND,
  NETCOMMANDTYPE_PLAYERLEAVE,
  NETCOMMANDTYPE_RUNAHEADMETRICS,
  NETCOMMANDTYPE_RUNAHEAD,
  NETCOMMANDTYPE_DESTROYPLAYER,
  NETCOMMANDTYPE_CHAT,
  NETCOMMANDTYPE_LOADCOMPLETE,
  NETCOMMANDTYPE_TIMEOUTSTART,
  NETCOMMANDTYPE_WRAPPER,
  NETCOMMANDTYPE_FILE,
  NETCOMMANDTYPE_FILEANNOUNCE,
  NETCOMMANDTYPE_FILEPROGRESS,
  NETCOMMANDTYPE_FRAMERESENDREQUEST,
  NETCOMMANDTYPE_DISCONNECTPLAYER,
  NETCOMMANDTYPE_DISCONNECTVOTE,
  NETCOMMANDTYPE_DISCONNECTFRAME,
  NETCOMMANDTYPE_DISCONNECTSCREENOFF,
]);

const COMMAND_TYPES_REQUIRING_ACK = new Set<number>([
  NETCOMMANDTYPE_FRAMEINFO,
  NETCOMMANDTYPE_GAMECOMMAND,
  NETCOMMANDTYPE_PLAYERLEAVE,
  NETCOMMANDTYPE_RUNAHEADMETRICS,
  NETCOMMANDTYPE_RUNAHEAD,
  NETCOMMANDTYPE_DESTROYPLAYER,
  NETCOMMANDTYPE_CHAT,
  NETCOMMANDTYPE_LOADCOMPLETE,
  NETCOMMANDTYPE_TIMEOUTSTART,
  NETCOMMANDTYPE_WRAPPER,
  NETCOMMANDTYPE_FILE,
  NETCOMMANDTYPE_FILEANNOUNCE,
  NETCOMMANDTYPE_FILEPROGRESS,
  NETCOMMANDTYPE_FRAMERESENDREQUEST,
  NETCOMMANDTYPE_DISCONNECTPLAYER,
  NETCOMMANDTYPE_DISCONNECTVOTE,
  NETCOMMANDTYPE_DISCONNECTFRAME,
  NETCOMMANDTYPE_DISCONNECTSCREENOFF,
]);

const COMMAND_TYPES_REQUIRING_DIRECT_SEND = new Set<number>([
  NETCOMMANDTYPE_LOADCOMPLETE,
  NETCOMMANDTYPE_TIMEOUTSTART,
  NETCOMMANDTYPE_FILE,
  NETCOMMANDTYPE_FILEANNOUNCE,
  NETCOMMANDTYPE_FILEPROGRESS,
  NETCOMMANDTYPE_FRAMERESENDREQUEST,
  NETCOMMANDTYPE_DISCONNECTPLAYER,
  NETCOMMANDTYPE_DISCONNECTVOTE,
  NETCOMMANDTYPE_DISCONNECTFRAME,
  NETCOMMANDTYPE_DISCONNECTSCREENOFF,
]);

const SYNCHRONIZED_COMMAND_TYPES = new Set<number>([
  NETCOMMANDTYPE_FRAMEINFO,
  NETCOMMANDTYPE_GAMECOMMAND,
  NETCOMMANDTYPE_PLAYERLEAVE,
  NETCOMMANDTYPE_RUNAHEAD,
  NETCOMMANDTYPE_DESTROYPLAYER,
]);

function assertCommandId(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT16_MASK) {
    throw new Error(`${name} must be an integer between 0 and ${UINT16_MASK}`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

export interface NetworkCommandIdSequencerOptions {
  initialCommandId?: number;
}

/**
 * Mirrors NetworkUtil::GenerateNextCommandID with unsigned-short rollover.
 */
export class NetworkCommandIdSequencer {
  private currentCommandId: number;

  constructor(options: NetworkCommandIdSequencerOptions = {}) {
    const initialCommandId = options.initialCommandId ?? NETWORK_COMMAND_ID_INITIAL_SEED;
    assertCommandId(initialCommandId, 'initialCommandId');
    this.currentCommandId = initialCommandId;
  }

  getCurrentCommandId(): number {
    return this.currentCommandId;
  }

  generateNextCommandId(): number {
    this.currentCommandId = (this.currentCommandId + 1) & UINT16_MASK;
    return this.currentCommandId;
  }

  generateCommandIdForType(commandType: number): number | null {
    if (!doesNetworkCommandRequireCommandId(commandType)) {
      return null;
    }
    return this.generateNextCommandId();
  }
}

/**
 * Mirrors NetworkUtil::DoesCommandRequireACommandID.
 */
export function doesNetworkCommandRequireCommandId(commandType: number): boolean {
  assertNonNegativeInteger(commandType, 'commandType');
  return COMMAND_TYPES_REQUIRING_IDS.has(commandType);
}

/**
 * Mirrors NetworkUtil::CommandRequiresAck.
 */
export function doesNetworkCommandRequireAck(commandType: number): boolean {
  assertNonNegativeInteger(commandType, 'commandType');
  return COMMAND_TYPES_REQUIRING_ACK.has(commandType);
}

/**
 * Mirrors NetworkUtil::CommandRequiresDirectSend.
 */
export function doesNetworkCommandRequireDirectSend(commandType: number): boolean {
  assertNonNegativeInteger(commandType, 'commandType');
  return COMMAND_TYPES_REQUIRING_DIRECT_SEND.has(commandType);
}

/**
 * Mirrors NetworkUtil::IsCommandSynchronized.
 */
export function isNetworkCommandSynchronized(commandType: number): boolean {
  assertNonNegativeInteger(commandType, 'commandType');
  return SYNCHRONIZED_COMMAND_TYPES.has(commandType);
}
