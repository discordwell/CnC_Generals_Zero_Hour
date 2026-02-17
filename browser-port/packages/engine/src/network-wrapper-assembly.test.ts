import { describe, expect, it } from 'vitest';

import {
  ingestNetworkWrapperChunk,
  isNetworkWrapperAssemblyComplete,
  type NetworkWrapperAssemblyMap,
} from './network-wrapper-assembly.js';

describe('network-wrapper-assembly', () => {
  it('ingests chunks and yields complete payload once all chunk indices are present', () => {
    const assemblies: NetworkWrapperAssemblyMap = new Map();

    const first = ingestNetworkWrapperChunk(assemblies, {
      wrappedCommandID: 0x1234,
      chunkNumber: 0,
      numChunks: 2,
      totalDataLength: 6,
      dataOffset: 0,
      chunkData: new Uint8Array([1, 2, 3]),
    });
    expect(first.status).toBe('partial');
    expect(assemblies.has(0x1234)).toBe(true);

    const second = ingestNetworkWrapperChunk(assemblies, {
      wrappedCommandID: 0x1234,
      chunkNumber: 1,
      numChunks: 2,
      totalDataLength: 6,
      dataOffset: 3,
      chunkData: new Uint8Array([4, 5, 6]),
    });
    expect(second.status).toBe('complete');
    if (second.status === 'complete') {
      expect(second.payload).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
    }
    expect(assemblies.has(0x1234)).toBe(false);
  });

  it('ignores duplicate chunk index and out-of-range chunk numbers', () => {
    const assemblies: NetworkWrapperAssemblyMap = new Map();
    ingestNetworkWrapperChunk(assemblies, {
      wrappedCommandID: 7,
      chunkNumber: 0,
      numChunks: 2,
      totalDataLength: 4,
      dataOffset: 0,
      chunkData: new Uint8Array([1, 2]),
    });

    const duplicate = ingestNetworkWrapperChunk(assemblies, {
      wrappedCommandID: 7,
      chunkNumber: 0,
      numChunks: 2,
      totalDataLength: 4,
      dataOffset: 0,
      chunkData: new Uint8Array([9, 9]),
    });
    expect(duplicate.status).toBe('ignored');

    const outOfRange = ingestNetworkWrapperChunk(assemblies, {
      wrappedCommandID: 7,
      chunkNumber: 5,
      numChunks: 2,
      totalDataLength: 4,
      dataOffset: 2,
      chunkData: new Uint8Array([3, 4]),
    });
    expect(outOfRange.status).toBe('ignored');
    expect(assemblies.has(7)).toBe(true);
  });

  it('clears assembly state on zero-chunk control records', () => {
    const assemblies: NetworkWrapperAssemblyMap = new Map();
    ingestNetworkWrapperChunk(assemblies, {
      wrappedCommandID: 11,
      chunkNumber: 0,
      numChunks: 2,
      totalDataLength: 4,
      dataOffset: 0,
      chunkData: new Uint8Array([1, 2]),
    });
    expect(assemblies.has(11)).toBe(true);

    const cleared = ingestNetworkWrapperChunk(assemblies, {
      wrappedCommandID: 11,
      chunkNumber: 0,
      numChunks: 0,
      totalDataLength: 0,
      dataOffset: 0,
      chunkData: new Uint8Array(),
    });
    expect(cleared.status).toBe('ignored');
    expect(assemblies.has(11)).toBe(false);
  });

  it('reports completion helper state', () => {
    const assemblies: NetworkWrapperAssemblyMap = new Map();
    ingestNetworkWrapperChunk(assemblies, {
      wrappedCommandID: 99,
      chunkNumber: 0,
      numChunks: 2,
      totalDataLength: 4,
      dataOffset: 0,
      chunkData: new Uint8Array([1, 2]),
    });
    const assembly = assemblies.get(99);
    expect(assembly).toBeDefined();
    if (!assembly) {
      return;
    }
    expect(isNetworkWrapperAssemblyComplete(assembly)).toBe(false);

    ingestNetworkWrapperChunk(assemblies, {
      wrappedCommandID: 99,
      chunkNumber: 1,
      numChunks: 2,
      totalDataLength: 4,
      dataOffset: 2,
      chunkData: new Uint8Array([3, 4]),
    });
    expect(assemblies.has(99)).toBe(false);
  });
});
