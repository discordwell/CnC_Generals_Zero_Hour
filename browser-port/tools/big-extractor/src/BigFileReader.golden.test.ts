/**
 * Golden fixture tests for the BIG archive extractor.
 *
 * Builds realistic multi-entry archives and verifies that:
 *  - Round-trip parse + extract produces identical data
 *  - Entry metadata (paths, offsets, sizes) snapshot correctly
 *  - Large file handling works (entries > 64KB)
 *  - Archives with deeply nested directory structures parse
 */

import { describe, it, expect } from 'vitest';
import { BigFileReader } from './BigFileReader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildBigArchive(
  files: { path: string; data: Uint8Array }[],
  magic: string = 'BIGF',
): ArrayBuffer {
  const encoder = new TextEncoder();

  let entryTableSize = 0;
  const encodedPaths: Uint8Array[] = [];
  for (const file of files) {
    const pathBytes = encoder.encode(file.path);
    encodedPaths.push(pathBytes);
    entryTableSize += 4 + 4 + pathBytes.byteLength + 1;
  }

  const headerSize = 16;
  const dataStart = headerSize + entryTableSize;

  let totalDataSize = 0;
  for (const file of files) {
    totalDataSize += file.data.byteLength;
  }
  const archiveSize = dataStart + totalDataSize;

  const buffer = new ArrayBuffer(archiveSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  for (let i = 0; i < 4; i++) {
    bytes[i] = magic.charCodeAt(i);
  }
  view.setUint32(4, archiveSize, true);
  view.setUint32(8, files.length, false); // big-endian
  view.setUint32(12, dataStart, true);

  let entryCursor = headerSize;
  let dataCursor = dataStart;

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const pathBytes = encodedPaths[i]!;
    view.setUint32(entryCursor, dataCursor, false);
    entryCursor += 4;
    view.setUint32(entryCursor, file.data.byteLength, false);
    entryCursor += 4;
    bytes.set(pathBytes, entryCursor);
    entryCursor += pathBytes.byteLength;
    bytes[entryCursor] = 0;
    entryCursor++;
    bytes.set(file.data, dataCursor);
    dataCursor += file.data.byteLength;
  }

  return buffer;
}

function makeData(size: number, seed: number = 0): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = (seed + i * 7 + 13) & 0xff;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Golden tests
// ---------------------------------------------------------------------------

describe('BIG golden fixtures', () => {
  it('round-trips a realistic multi-entry archive', () => {
    const entries = [
      { path: 'Art\\Textures\\BCTank.tga', data: makeData(1024, 1) },
      { path: 'Art\\Textures\\BCTank_N.dds', data: makeData(2048, 2) },
      { path: 'Art\\W3D\\BCTank.w3d', data: makeData(4096, 3) },
      { path: 'Art\\W3D\\BCTank_SKL.w3d', data: makeData(512, 4) },
      { path: 'Data\\INI\\Object\\USA\\BCTank.ini', data: makeData(256, 5) },
      { path: 'Data\\INI\\GameData.ini', data: makeData(128, 6) },
      { path: 'Maps\\USAvsCHN\\USAvsCHN.map', data: makeData(8192, 7) },
      { path: 'Data\\Scripts\\Scripts.scb', data: makeData(64, 8) },
    ];

    const buffer = buildBigArchive(entries);
    const archive = BigFileReader.parse(buffer);

    expect(archive.magic).toBe('BIGF');
    expect(archive.fileCount).toBe(8);
    expect(archive.entries).toHaveLength(8);

    // Verify every entry round-trips with correct data
    for (let i = 0; i < entries.length; i++) {
      const original = entries[i]!;
      const normalizedPath = original.path.replace(/\\/g, '/');
      const found = BigFileReader.findEntry(archive, normalizedPath);
      expect(found, `Entry not found: ${normalizedPath}`).toBeDefined();
      expect(found!.size).toBe(original.data.byteLength);

      const extracted = BigFileReader.extractFile(buffer, found!);
      expect(extracted).toEqual(original.data);
    }

    // Snapshot entry metadata (paths and sizes)
    const metadata = archive.entries.map((e) => ({
      path: e.path,
      size: e.size,
    }));
    expect(metadata).toMatchSnapshot('archive-entry-metadata');
  });

  it('handles large entries (> 64KB)', () => {
    const largeData = makeData(100_000, 42);
    const entries = [
      { path: 'Data\\Large\\bigfile.bin', data: largeData },
      { path: 'Data\\Small\\tiny.txt', data: new Uint8Array([72, 101, 108, 108, 111]) },
    ];

    const buffer = buildBigArchive(entries);
    const archive = BigFileReader.parse(buffer);

    expect(archive.fileCount).toBe(2);

    const largeEntry = BigFileReader.findEntry(archive, 'Data/Large/bigfile.bin')!;
    expect(largeEntry.size).toBe(100_000);
    const extracted = BigFileReader.extractFile(buffer, largeEntry);
    expect(extracted).toEqual(largeData);
  });

  it('handles BIG4 format with deep directory nesting', () => {
    const entries = [
      { path: 'A\\B\\C\\D\\E\\F\\G\\deep.txt', data: makeData(16, 99) },
      { path: 'root.txt', data: makeData(8, 100) },
    ];

    const buffer = buildBigArchive(entries, 'BIG4');
    const archive = BigFileReader.parse(buffer);

    expect(archive.magic).toBe('BIG4');
    expect(archive.entries[0]!.path).toBe('A/B/C/D/E/F/G/deep.txt');
    expect(archive.entries[1]!.path).toBe('root.txt');

    // Extension filtering across deep paths
    const txtFiles = BigFileReader.listByExtension(archive, '.txt');
    expect(txtFiles).toHaveLength(2);
  });

  it('handles archive with many entries', () => {
    const entries = [];
    for (let i = 0; i < 50; i++) {
      entries.push({
        path: `Data\\Auto\\file_${String(i).padStart(3, '0')}.dat`,
        data: makeData(32 + i, i),
      });
    }

    const buffer = buildBigArchive(entries);
    const archive = BigFileReader.parse(buffer);

    expect(archive.fileCount).toBe(50);
    expect(archive.entries).toHaveLength(50);

    // Spot-check first, middle, and last entries
    for (const idx of [0, 25, 49]) {
      const e = entries[idx]!;
      const found = BigFileReader.findEntry(archive, e.path.replace(/\\/g, '/'))!;
      const extracted = BigFileReader.extractFile(buffer, found);
      expect(extracted).toEqual(e.data);
    }
  });
});
