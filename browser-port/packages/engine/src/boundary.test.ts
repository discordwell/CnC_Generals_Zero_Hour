import { describe, expect, it } from 'vitest';

import {
  DeterministicFrameState as CoreDeterministicFrameState,
  EventBus as CoreEventBus,
  FrameResendArchive as CoreFrameResendArchive,
  GameLoop as CoreGameLoop,
  NetworkCommandIdSequencer as CoreNetworkCommandIdSequencer,
  SubsystemRegistry as CoreSubsystemRegistry,
  DeterministicStateKernel as CoreDeterministicStateKernel,
  XferCrcAccumulator as CoreXferCrcAccumulator,
  hashDeterministicGameLogicCrc as coreHashDeterministicGameLogicCrc,
  doesNetworkCommandRequireAck as coreDoesNetworkCommandRequireAck,
  doesNetworkCommandRequireCommandId as coreDoesNetworkCommandRequireCommandId,
  doesNetworkCommandRequireDirectSend as coreDoesNetworkCommandRequireDirectSend,
  isNetworkCommandSynchronized as coreIsNetworkCommandSynchronized,
  NETCOMMANDTYPE_FRAMEINFO as coreNetCommandTypeFrameInfo,
  NETCOMMANDTYPE_DISCONNECTSCREENOFF as coreNetCommandTypeDisconnectScreenOff,
  NETCOMMANDTYPE_PACKETROUTERACK as coreNetCommandTypePacketRouterAck,
  resolveNetworkFileCommandIdFromMessage as coreResolveNetworkFileCommandIdFromMessage,
  resolveNetworkFrameHashFromFrameInfo as coreResolveNetworkFrameHashFromFrameInfo,
  parseNetworkFrameInfoMessage as coreParseNetworkFrameInfoMessage,
  parseNetworkFrameResendRequestMessage as coreParseNetworkFrameResendRequestMessage,
  parseNetworkPacketRouterQueryMessage as coreParseNetworkPacketRouterQueryMessage,
  parseNetworkPacketRouterAckMessage as coreParseNetworkPacketRouterAckMessage,
  isNetworkPacketRouterAckFromCurrentRouter as coreIsNetworkPacketRouterAckFromCurrentRouter,
  resolveNetworkMaskFromMessage as coreResolveNetworkMaskFromMessage,
  resolveNetworkNumericFieldFromMessage as coreResolveNetworkNumericFieldFromMessage,
  resolveNetworkPlayerFromMessage as coreResolveNetworkPlayerFromMessage,
  coerceNetworkPayloadToBytes as coreCoerceNetworkPayloadToBytes,
  parseNetworkWrapperChunk as coreParseNetworkWrapperChunk,
  parseNetworkWrapperChunkFromBinary as coreParseNetworkWrapperChunkFromBinary,
  parseNetworkWrapperChunkFromObject as coreParseNetworkWrapperChunkFromObject,
  parseNetworkWrapperChunkFromByteBuffer as coreParseNetworkWrapperChunkFromByteBuffer,
  ingestNetworkWrapperChunk as coreIngestNetworkWrapperChunk,
  isNetworkWrapperAssemblyComplete as coreIsNetworkWrapperAssemblyComplete,
  resolveNetworkDirectWrappedCandidate as coreResolveNetworkDirectWrappedCandidate,
  resolveNetworkAssembledWrappedCandidate as coreResolveNetworkAssembledWrappedCandidate,
  parseNetworkWrappedCommand as coreParseNetworkWrappedCommand,
  resolveNetworkCommandType as coreResolveNetworkCommandType,
  resolveNetworkCommandTypeFromMessage as coreResolveNetworkCommandTypeFromMessage,
} from '@generals/core';

import {
  DeterministicFrameState as EngineDeterministicFrameState,
  EventBus as EngineEventBus,
  FrameResendArchive as EngineFrameResendArchive,
  GameLoop as EngineGameLoop,
  NetworkCommandIdSequencer as EngineNetworkCommandIdSequencer,
  SubsystemRegistry as EngineSubsystemRegistry,
  DeterministicStateKernel as EngineDeterministicStateKernel,
  XferCrcAccumulator as EngineXferCrcAccumulator,
  hashDeterministicGameLogicCrc as engineHashDeterministicGameLogicCrc,
  doesNetworkCommandRequireAck as engineDoesNetworkCommandRequireAck,
  doesNetworkCommandRequireCommandId as engineDoesNetworkCommandRequireCommandId,
  doesNetworkCommandRequireDirectSend as engineDoesNetworkCommandRequireDirectSend,
  isNetworkCommandSynchronized as engineIsNetworkCommandSynchronized,
  NETCOMMANDTYPE_FRAMEINFO as engineNetCommandTypeFrameInfo,
  NETCOMMANDTYPE_DISCONNECTSCREENOFF as engineNetCommandTypeDisconnectScreenOff,
  NETCOMMANDTYPE_PACKETROUTERACK as engineNetCommandTypePacketRouterAck,
  resolveNetworkFileCommandIdFromMessage as engineResolveNetworkFileCommandIdFromMessage,
  resolveNetworkFrameHashFromFrameInfo as engineResolveNetworkFrameHashFromFrameInfo,
  parseNetworkFrameInfoMessage as engineParseNetworkFrameInfoMessage,
  parseNetworkFrameResendRequestMessage as engineParseNetworkFrameResendRequestMessage,
  parseNetworkPacketRouterQueryMessage as engineParseNetworkPacketRouterQueryMessage,
  parseNetworkPacketRouterAckMessage as engineParseNetworkPacketRouterAckMessage,
  isNetworkPacketRouterAckFromCurrentRouter as engineIsNetworkPacketRouterAckFromCurrentRouter,
  resolveNetworkMaskFromMessage as engineResolveNetworkMaskFromMessage,
  resolveNetworkNumericFieldFromMessage as engineResolveNetworkNumericFieldFromMessage,
  resolveNetworkPlayerFromMessage as engineResolveNetworkPlayerFromMessage,
  coerceNetworkPayloadToBytes as engineCoerceNetworkPayloadToBytes,
  parseNetworkWrapperChunk as engineParseNetworkWrapperChunk,
  parseNetworkWrapperChunkFromBinary as engineParseNetworkWrapperChunkFromBinary,
  parseNetworkWrapperChunkFromObject as engineParseNetworkWrapperChunkFromObject,
  parseNetworkWrapperChunkFromByteBuffer as engineParseNetworkWrapperChunkFromByteBuffer,
  ingestNetworkWrapperChunk as engineIngestNetworkWrapperChunk,
  isNetworkWrapperAssemblyComplete as engineIsNetworkWrapperAssemblyComplete,
  resolveNetworkDirectWrappedCandidate as engineResolveNetworkDirectWrappedCandidate,
  resolveNetworkAssembledWrappedCandidate as engineResolveNetworkAssembledWrappedCandidate,
  parseNetworkWrappedCommand as engineParseNetworkWrappedCommand,
  resolveNetworkCommandType as engineResolveNetworkCommandType,
  resolveNetworkCommandTypeFromMessage as engineResolveNetworkCommandTypeFromMessage,
} from './index.js';

describe('engine boundary compatibility', () => {
  it('keeps core exports aliased to engine-owned primitives', () => {
    expect(CoreEventBus).toBe(EngineEventBus);
    expect(CoreGameLoop).toBe(EngineGameLoop);
    expect(CoreSubsystemRegistry).toBe(EngineSubsystemRegistry);
    expect(CoreDeterministicFrameState).toBe(EngineDeterministicFrameState);
    expect(CoreDeterministicStateKernel).toBe(EngineDeterministicStateKernel);
    expect(CoreXferCrcAccumulator).toBe(EngineXferCrcAccumulator);
    expect(coreHashDeterministicGameLogicCrc).toBe(engineHashDeterministicGameLogicCrc);
    expect(CoreNetworkCommandIdSequencer).toBe(EngineNetworkCommandIdSequencer);
    expect(CoreFrameResendArchive).toBe(EngineFrameResendArchive);
    expect(coreDoesNetworkCommandRequireAck).toBe(engineDoesNetworkCommandRequireAck);
    expect(coreDoesNetworkCommandRequireCommandId).toBe(engineDoesNetworkCommandRequireCommandId);
    expect(coreDoesNetworkCommandRequireDirectSend).toBe(engineDoesNetworkCommandRequireDirectSend);
    expect(coreIsNetworkCommandSynchronized).toBe(engineIsNetworkCommandSynchronized);
    expect(coreNetCommandTypeFrameInfo).toBe(engineNetCommandTypeFrameInfo);
    expect(coreNetCommandTypeDisconnectScreenOff).toBe(engineNetCommandTypeDisconnectScreenOff);
    expect(coreNetCommandTypePacketRouterAck).toBe(engineNetCommandTypePacketRouterAck);
    expect(coreResolveNetworkNumericFieldFromMessage).toBe(engineResolveNetworkNumericFieldFromMessage);
    expect(coreResolveNetworkPlayerFromMessage).toBe(engineResolveNetworkPlayerFromMessage);
    expect(coreResolveNetworkFileCommandIdFromMessage).toBe(engineResolveNetworkFileCommandIdFromMessage);
    expect(coreResolveNetworkMaskFromMessage).toBe(engineResolveNetworkMaskFromMessage);
    expect(coreResolveNetworkFrameHashFromFrameInfo).toBe(engineResolveNetworkFrameHashFromFrameInfo);
    expect(coreParseNetworkFrameInfoMessage).toBe(engineParseNetworkFrameInfoMessage);
    expect(coreParseNetworkFrameResendRequestMessage).toBe(engineParseNetworkFrameResendRequestMessage);
    expect(coreParseNetworkPacketRouterQueryMessage).toBe(engineParseNetworkPacketRouterQueryMessage);
    expect(coreParseNetworkPacketRouterAckMessage).toBe(engineParseNetworkPacketRouterAckMessage);
    expect(coreIsNetworkPacketRouterAckFromCurrentRouter).toBe(engineIsNetworkPacketRouterAckFromCurrentRouter);
    expect(coreCoerceNetworkPayloadToBytes).toBe(engineCoerceNetworkPayloadToBytes);
    expect(coreParseNetworkWrapperChunk).toBe(engineParseNetworkWrapperChunk);
    expect(coreParseNetworkWrapperChunkFromBinary).toBe(engineParseNetworkWrapperChunkFromBinary);
    expect(coreParseNetworkWrapperChunkFromObject).toBe(engineParseNetworkWrapperChunkFromObject);
    expect(coreParseNetworkWrapperChunkFromByteBuffer).toBe(engineParseNetworkWrapperChunkFromByteBuffer);
    expect(coreIngestNetworkWrapperChunk).toBe(engineIngestNetworkWrapperChunk);
    expect(coreIsNetworkWrapperAssemblyComplete).toBe(engineIsNetworkWrapperAssemblyComplete);
    expect(coreResolveNetworkDirectWrappedCandidate).toBe(engineResolveNetworkDirectWrappedCandidate);
    expect(coreResolveNetworkAssembledWrappedCandidate).toBe(engineResolveNetworkAssembledWrappedCandidate);
    expect(coreParseNetworkWrappedCommand).toBe(engineParseNetworkWrappedCommand);
    expect(coreResolveNetworkCommandType).toBe(engineResolveNetworkCommandType);
    expect(coreResolveNetworkCommandTypeFromMessage).toBe(engineResolveNetworkCommandTypeFromMessage);
  });
});
