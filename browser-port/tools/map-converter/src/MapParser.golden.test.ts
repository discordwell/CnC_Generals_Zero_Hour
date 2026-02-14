/**
 * Golden fixture tests for the MAP converter.
 *
 * Builds a comprehensive synthetic map with all chunk types:
 *  - HeightMapData with realistic terrain gradient
 *  - ObjectsList with multiple objects of different types
 *  - PolygonTriggers with multi-point polygons
 * Then verifies the full MapParser.parse() pipeline.
 */

import { describe, it, expect } from 'vitest';
import { MAP_MAGIC, CHUNK_HEADER_SIZE } from './DataChunkReader.js';
import { MapParser } from './MapParser.js';

// ---------------------------------------------------------------------------
// Map builder helpers (matching unit test patterns)
// ---------------------------------------------------------------------------

function writeUint8(view: DataView, off: number, v: number): number {
  view.setUint8(off, v); return off + 1;
}
function writeUint16(view: DataView, off: number, v: number): number {
  view.setUint16(off, v, true); return off + 2;
}
function writeInt32(view: DataView, off: number, v: number): number {
  view.setInt32(off, v, true); return off + 4;
}
function writeUint32(view: DataView, off: number, v: number): number {
  view.setUint32(off, v, true); return off + 4;
}
function writeFloat32(view: DataView, off: number, v: number): number {
  view.setFloat32(off, v, true); return off + 4;
}
function writeAscii(view: DataView, off: number, s: string): number {
  for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  return off + s.length;
}
function writePrefixedAscii(view: DataView, off: number, s: string): number {
  off = writeUint16(view, off, s.length);
  return writeAscii(view, off, s);
}

interface ChunkDef { name: string; id: number; }
function tocSize(chunks: ChunkDef[]): number {
  let size = 8;
  for (const c of chunks) size += 1 + c.name.length + 4;
  return size;
}
function writeTOC(view: DataView, chunks: ChunkDef[]): number {
  let off = writeAscii(view, 0, MAP_MAGIC);
  off = writeUint32(view, off, chunks.length);
  for (const c of chunks) {
    off = writeUint8(view, off, c.name.length);
    off = writeAscii(view, off, c.name);
    off = writeUint32(view, off, c.id);
  }
  return off;
}
function writeChunkHeader(view: DataView, off: number, id: number, ver: number, size: number): number {
  off = writeUint32(view, off, id);
  off = writeUint16(view, off, ver);
  off = writeInt32(view, off, size);
  return off;
}

// ---------------------------------------------------------------------------
// Build a comprehensive golden map
// ---------------------------------------------------------------------------

function buildGoldenMap(): ArrayBuffer {
  const chunks: ChunkDef[] = [
    { name: 'HeightMapData', id: 1 },
    { name: 'ObjectsList', id: 2 },
    { name: 'Object', id: 3 },
    { name: 'PolygonTriggers', id: 4 },
  ];

  // ---- Heightmap: 8x8 terrain with v3 format ----
  const hmW = 8, hmH = 8, hmBorder = 2;
  const hmDataLen = hmW * hmH;
  const hmPayload = 4 + 4 + 4 + 4 + hmDataLen;

  // ---- Objects: 3 placed objects ----
  const templates = ['USATankCrusader', 'ChinaOverlord', 'GLAScorpion'];
  const objPayloads: number[] = [];
  for (const tpl of templates) {
    // v3: posX + posY + posZ + angle + flags + name(2+len) + emptyDict(2)
    objPayloads.push(4 + 4 + 4 + 4 + 4 + 2 + tpl.length + 2);
  }
  const totalObjChunks = objPayloads.reduce((a, b) => a + CHUNK_HEADER_SIZE + b, 0);

  // ---- Triggers: 2 polygon triggers ----
  const trig1Name = 'PlayerStart_0';
  const trig1Points = 4;
  const trig2Name = 'WaterZone';
  const trig2Points = 3;
  // Trigger payload = count(4) + (name(2+len) + id(4) + isWater(1) + pointCount(4) + points(N*12)) × 2
  const trigPayload =
    4 +
    (2 + trig1Name.length + 4 + 1 + 4 + trig1Points * 12) +
    (2 + trig2Name.length + 4 + 1 + 4 + trig2Points * 12);

  const totalSize =
    tocSize(chunks) +
    CHUNK_HEADER_SIZE + hmPayload +
    CHUNK_HEADER_SIZE + totalObjChunks +
    CHUNK_HEADER_SIZE + trigPayload;

  const buffer = new ArrayBuffer(totalSize + 256); // Extra padding for safety
  const view = new DataView(buffer);

  let off = writeTOC(view, chunks);

  // ---- HeightMapData ----
  off = writeChunkHeader(view, off, 1, 3, hmPayload);
  off = writeInt32(view, off, hmW);
  off = writeInt32(view, off, hmH);
  off = writeInt32(view, off, hmBorder);
  off = writeInt32(view, off, hmDataLen);
  // Terrain gradient: low in corners, high in center
  for (let y = 0; y < hmH; y++) {
    for (let x = 0; x < hmW; x++) {
      const cx = x - hmW / 2 + 0.5;
      const cy = y - hmH / 2 + 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy);
      const height = Math.max(0, Math.min(255, Math.round(255 - dist * 40)));
      off = writeUint8(view, off, height);
    }
  }

  // ---- ObjectsList ----
  off = writeChunkHeader(view, off, 2, 1, totalObjChunks);

  const positions = [
    { x: 100, y: 200, z: 0 },
    { x: 500, y: 300, z: 5.5 },
    { x: 800, y: 100, z: 0 },
  ];
  const angles = [0, 180, 270];

  for (let i = 0; i < 3; i++) {
    off = writeChunkHeader(view, off, 3, 3, objPayloads[i]!);
    off = writeFloat32(view, off, positions[i]!.x);
    off = writeFloat32(view, off, positions[i]!.y);
    off = writeFloat32(view, off, positions[i]!.z);
    off = writeFloat32(view, off, angles[i]!);
    off = writeInt32(view, off, i + 1); // flags
    off = writePrefixedAscii(view, off, templates[i]!);
    off = writeUint16(view, off, 0); // empty dict
  }

  // ---- PolygonTriggers (v2) ----
  off = writeChunkHeader(view, off, 4, 2, trigPayload);
  off = writeInt32(view, off, 2); // 2 triggers

  // Trigger 1: PlayerStart_0 (rectangle)
  off = writePrefixedAscii(view, off, trig1Name);
  off = writeInt32(view, off, 1); // id
  off = writeUint8(view, off, 0); // not water
  off = writeInt32(view, off, trig1Points);
  const rect = [[0, 0], [100, 0], [100, 100], [0, 100]];
  for (const [px, py] of rect) {
    off = writeInt32(view, off, px!);
    off = writeInt32(view, off, py!);
    off = writeInt32(view, off, 0); // z
  }

  // Trigger 2: WaterZone (triangle, water area)
  off = writePrefixedAscii(view, off, trig2Name);
  off = writeInt32(view, off, 2); // id
  off = writeUint8(view, off, 1); // isWater
  off = writeInt32(view, off, trig2Points);
  const tri = [[200, 200], [300, 200], [250, 300]];
  for (const [px, py] of tri) {
    off = writeInt32(view, off, px!);
    off = writeInt32(view, off, py!);
    off = writeInt32(view, off, 0);
  }

  return buffer.slice(0, off);
}

// ---------------------------------------------------------------------------
// Golden tests
// ---------------------------------------------------------------------------

describe('MAP golden fixtures', () => {
  it('parses a comprehensive map with all chunk types', () => {
    const buffer = buildGoldenMap();
    const parsed = MapParser.parse(buffer);

    // Heightmap
    expect(parsed.heightmap.width).toBe(8);
    expect(parsed.heightmap.height).toBe(8);
    expect(parsed.heightmap.borderSize).toBe(2);
    expect(parsed.heightmap.data).toHaveLength(64);

    // Terrain gradient: center should be highest
    const centerIdx = 3 * 8 + 3; // near center
    const cornerIdx = 0;          // corner
    expect(parsed.heightmap.data[centerIdx]!).toBeGreaterThan(parsed.heightmap.data[cornerIdx]!);

    // Objects
    expect(parsed.objects).toHaveLength(3);
    expect(parsed.objects[0]!.templateName).toBe('USATankCrusader');
    expect(parsed.objects[0]!.position.x).toBeCloseTo(100);
    expect(parsed.objects[0]!.position.y).toBeCloseTo(200);
    expect(parsed.objects[0]!.angle).toBeCloseTo(0);

    expect(parsed.objects[1]!.templateName).toBe('ChinaOverlord');
    expect(parsed.objects[1]!.position.z).toBeCloseTo(5.5);
    expect(parsed.objects[1]!.angle).toBeCloseTo(180);

    expect(parsed.objects[2]!.templateName).toBe('GLAScorpion');
    expect(parsed.objects[2]!.angle).toBeCloseTo(270);
    expect(parsed.objects[2]!.flags).toBe(3);

    // Triggers
    expect(parsed.triggers).toHaveLength(2);

    const t1 = parsed.triggers[0]!;
    expect(t1.name).toBe('PlayerStart_0');
    expect(t1.id).toBe(1);
    expect(t1.isWaterArea).toBe(false);
    expect(t1.points).toHaveLength(4);
    expect(t1.points[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(t1.points[2]).toEqual({ x: 100, y: 100, z: 0 });

    const t2 = parsed.triggers[1]!;
    expect(t2.name).toBe('WaterZone');
    expect(t2.isWaterArea).toBe(true);
    expect(t2.points).toHaveLength(3);
  });

  it('heightmap data forms valid terrain gradient', () => {
    const buffer = buildGoldenMap();
    const parsed = MapParser.parse(buffer);
    const hm = parsed.heightmap;

    // All height values should be in [0, 255]
    for (let i = 0; i < hm.data.length; i++) {
      expect(hm.data[i]!).toBeGreaterThanOrEqual(0);
      expect(hm.data[i]!).toBeLessThanOrEqual(255);
    }

    // Check that border areas have lower height than center
    const edgeAvg = (
      (hm.data[0]! + hm.data[7]! + hm.data[56]! + hm.data[63]!) / 4
    );
    const centerAvg = (
      (hm.data[27]! + hm.data[28]! + hm.data[35]! + hm.data[36]!) / 4
    );
    expect(centerAvg).toBeGreaterThan(edgeAvg);
  });

  it('object properties snapshot correctly', () => {
    const buffer = buildGoldenMap();
    const parsed = MapParser.parse(buffer);

    const objSummary = parsed.objects.map((o) => ({
      templateName: o.templateName,
      position: { x: Math.round(o.position.x), y: Math.round(o.position.y), z: Math.round(o.position.z) },
      angle: Math.round(o.angle),
      flags: o.flags,
    }));

    expect(objSummary).toMatchSnapshot('map-objects');
  });

  it('trigger polygon vertices snapshot correctly', () => {
    const buffer = buildGoldenMap();
    const parsed = MapParser.parse(buffer);

    const trigSummary = parsed.triggers.map((t) => ({
      name: t.name,
      id: t.id,
      isWaterArea: t.isWaterArea,
      pointCount: t.points.length,
      points: t.points,
    }));

    expect(trigSummary).toMatchSnapshot('map-triggers');
  });
});
