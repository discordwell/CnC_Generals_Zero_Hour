/**
 * Wrapper command dispatch helpers for network boundary ownership.
 *
 * Source references:
 * - Generals/Code/GameEngine/Source/GameNetwork/ConnectionManager.cpp
 *   (wrapper command handling path / wrapped command reconstruction)
 * - Generals/Code/GameEngine/Source/GameNetwork/NetCommandWrapperList.cpp
 *   (chunk ingestion and ready-command transition)
 */

import {
  ingestNetworkWrapperChunk,
  type NetworkWrapperAssemblyMap,
} from './network-wrapper-assembly.js';
import { parseNetworkWrapperChunk } from './network-wrapper-chunk.js';
import {
  parseNetworkWrappedCommand,
  type NetworkWrappedCommand,
} from './network-wrapped-command.js';

export function resolveNetworkDirectWrappedCandidate(
  message: unknown,
): NetworkWrappedCommand | null {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const wrappedCandidate = message as {
    wrapped?: unknown;
    command?: unknown;
    inner?: unknown;
  };
  const wrapped = wrappedCandidate.wrapped ?? wrappedCandidate.command ?? wrappedCandidate.inner;
  if (!wrapped || typeof wrapped !== 'object') {
    return null;
  }

  return wrapped as NetworkWrappedCommand;
}

/**
 * Attempts to produce a wrapped command from chunked wrapper metadata.
 *
 * Caller controls dispatch ordering; this helper only handles chunk ingestion and decode.
 */
export function resolveNetworkAssembledWrappedCandidate(
  message: unknown,
  assemblies: NetworkWrapperAssemblyMap,
): NetworkWrappedCommand | null {
  const chunk = parseNetworkWrapperChunk(message);
  if (!chunk) {
    return null;
  }

  const ingestResult = ingestNetworkWrapperChunk(assemblies, chunk);
  if (ingestResult.status !== 'complete') {
    return null;
  }

  return parseNetworkWrappedCommand(ingestResult.payload);
}
