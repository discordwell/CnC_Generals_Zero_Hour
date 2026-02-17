/**
 * Source-backed wrapped network command decoding.
 *
 * Source references:
 * - Generals/Code/GameEngine/Source/GameNetwork/NetPacket.cpp
 *   (serialized marker stream consumed by read*Message paths)
 */

import {
  NETCOMMANDTYPE_CHAT,
  NETCOMMANDTYPE_DESTROYPLAYER,
  NETCOMMANDTYPE_DISCONNECTCHAT,
  NETCOMMANDTYPE_DISCONNECTFRAME,
  NETCOMMANDTYPE_DISCONNECTPLAYER,
  NETCOMMANDTYPE_DISCONNECTSCREENOFF,
  NETCOMMANDTYPE_DISCONNECTVOTE,
  NETCOMMANDTYPE_FILE,
  NETCOMMANDTYPE_FILEANNOUNCE,
  NETCOMMANDTYPE_FILEPROGRESS,
  NETCOMMANDTYPE_FRAMEINFO,
  NETCOMMANDTYPE_FRAMERESENDREQUEST,
  NETCOMMANDTYPE_PLAYERLEAVE,
  NETCOMMANDTYPE_PROGRESS,
  NETCOMMANDTYPE_RUNAHEAD,
  NETCOMMANDTYPE_RUNAHEADMETRICS,
  NETCOMMANDTYPE_WRAPPER,
} from './network-command-type.js';
import { coerceNetworkPayloadToBytes } from './network-wrapper-chunk.js';

export type NetworkWrappedCommand = { [key: string]: unknown };

function readUint16FromView(view: DataView, index: number, length: number): number | null {
  if (index + 2 > length) {
    return null;
  }
  const value = view.getUint16(index, true);
  return value;
}

/**
 * Decodes a wrapped network command payload into a command-like object.
 *
 * Source parity notes:
 * - This decoder preserves current marker precedence and field aliases used by network runtime.
 * - Marker stream behavior is based on NetPacket serialization/read paths.
 */
export function parseNetworkWrappedCommand(raw: unknown): NetworkWrappedCommand | null {
  const data = coerceNetworkPayloadToBytes(raw);
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
      const charCode = readUint16FromView(view, index, data.length);
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
