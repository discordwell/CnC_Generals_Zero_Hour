/**
 * Source-backed wrapper assembly state helpers.
 *
 * Source references:
 * - Generals/Code/GameEngine/Source/GameNetwork/NetCommandWrapperList.cpp
 *   (NetCommandWrapperList::processWrapper / NetCommandWrapperListNode::copyChunkData)
 * - Generals/Code/GameEngine/Source/GameNetwork/NetPacket.cpp
 *   (NetPacket::readWrapperMessage chunk header/data format)
 */

import type { NetworkWrapperChunk } from './network-wrapper-chunk.js';

export interface NetworkWrapperAssembly {
  chunks: Uint8Array;
  chunkReceived: Uint8Array;
  expectedChunks: number;
  totalLength: number;
  receivedChunks: number;
}

export type NetworkWrapperAssemblyMap = Map<number, NetworkWrapperAssembly>;

export type NetworkWrapperChunkIngestResult =
  | {
      status: 'ignored';
      wrappedCommandID: number;
    }
  | {
      status: 'partial';
      wrappedCommandID: number;
    }
  | {
      status: 'complete';
      wrappedCommandID: number;
      payload: Uint8Array;
    };

export function isNetworkWrapperAssemblyComplete(assembly: NetworkWrapperAssembly): boolean {
  return assembly.receivedChunks === assembly.expectedChunks;
}

/**
 * Applies one wrapper chunk into the active assembly map.
 *
 * Behavior intentionally mirrors existing runtime semantics:
 * - zero-chunk messages clear assembly state for the wrapped command ID
 * - first chunk initializes fixed expected-chunk/total-length metadata
 * - duplicate chunk indices are ignored
 * - invalid offsets/chunk index are ignored
 * - complete assembly returns contiguous payload and removes assembly from map
 */
export function ingestNetworkWrapperChunk(
  assemblies: NetworkWrapperAssemblyMap,
  chunk: NetworkWrapperChunk,
): NetworkWrapperChunkIngestResult {
  if (chunk.numChunks === 0) {
    assemblies.delete(chunk.wrappedCommandID);
    return {
      status: 'ignored',
      wrappedCommandID: chunk.wrappedCommandID,
    };
  }

  if (!assemblies.has(chunk.wrappedCommandID)) {
    assemblies.set(chunk.wrappedCommandID, {
      chunks: new Uint8Array(chunk.totalDataLength),
      chunkReceived: new Uint8Array(chunk.numChunks),
      expectedChunks: chunk.numChunks,
      totalLength: chunk.totalDataLength,
      receivedChunks: 0,
    });
  }

  const assembly = assemblies.get(chunk.wrappedCommandID);
  if (!assembly) {
    return {
      status: 'ignored',
      wrappedCommandID: chunk.wrappedCommandID,
    };
  }

  if (
    chunk.chunkNumber < 0
    || chunk.chunkNumber >= assembly.expectedChunks
  ) {
    return {
      status: 'ignored',
      wrappedCommandID: chunk.wrappedCommandID,
    };
  }

  if (chunk.dataOffset + chunk.chunkData.byteLength > assembly.totalLength) {
    return {
      status: 'ignored',
      wrappedCommandID: chunk.wrappedCommandID,
    };
  }

  if (assembly.chunkReceived[chunk.chunkNumber] === 1) {
    return {
      status: 'ignored',
      wrappedCommandID: chunk.wrappedCommandID,
    };
  }

  assembly.chunkReceived[chunk.chunkNumber] = 1;
  assembly.receivedChunks += 1;
  assembly.chunks.set(chunk.chunkData, chunk.dataOffset);

  if (!isNetworkWrapperAssemblyComplete(assembly)) {
    return {
      status: 'partial',
      wrappedCommandID: chunk.wrappedCommandID,
    };
  }

  assemblies.delete(chunk.wrappedCommandID);
  return {
    status: 'complete',
    wrappedCommandID: chunk.wrappedCommandID,
    payload: assembly.chunks,
  };
}
