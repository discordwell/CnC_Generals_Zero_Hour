/**
 * W3D binary format chunk type identifiers.
 * Every chunk in a .w3d file begins with an 8-byte header:
 *   - uint32 ChunkType (little-endian)
 *   - uint32 ChunkSize (little-endian, bit 31 = has sub-chunks)
 */
export const W3dChunkType = {
  // ---- Mesh ----
  MESH: 0x00000000,
  MESH_HEADER3: 0x0000001f,
  VERTICES: 0x00000002,
  VERTEX_NORMALS: 0x00000003,
  TRIANGLES: 0x00000020,
  TEXCOORDS: 0x00000008,
  VERTEX_COLORS: 0x00000010,
  VERTEX_INFLUENCES: 0x0000000e,
  MESH_USER_TEXT: 0x0000000c,
  VERTEX_SHADE_INDICES: 0x00000022,

  // ---- Materials ----
  MATERIAL_INFO: 0x00000028,
  SHADERS: 0x00000029,
  VERTEX_MATERIALS: 0x0000002a,
  VERTEX_MATERIAL: 0x0000002b,
  VERTEX_MATERIAL_NAME: 0x0000002c,
  VERTEX_MATERIAL_INFO: 0x0000002d,
  TEXTURES: 0x00000030,
  TEXTURE: 0x00000031,
  TEXTURE_NAME: 0x00000032,
  TEXTURE_INFO: 0x00000033,
  MATERIAL_PASS: 0x00000038,
  VERTEX_MATERIAL_IDS: 0x00000039,
  SHADER_IDS: 0x0000003a,
  DCG: 0x0000003b,
  DIG: 0x0000003c,
  SCG: 0x0000003e,
  TEXTURE_STAGE: 0x00000048,
  TEXTURE_IDS: 0x00000049,
  STAGE_TEXCOORDS: 0x0000004a,

  // ---- Prelit ----
  PRELIT_UNLIT: 0x00000023,
  PRELIT_VERTEX: 0x00000024,
  PRELIT_LIGHTMAP_MULTI_PASS: 0x00000025,
  PRELIT_LIGHTMAP_MULTI_TEX: 0x00000026,

  // ---- Hierarchy ----
  HIERARCHY: 0x00000100,
  HIERARCHY_HEADER: 0x00000101,
  PIVOTS: 0x00000102,
  PIVOT_FIXUPS: 0x00000103,

  // ---- Animation ----
  ANIMATION: 0x00000200,
  ANIMATION_HEADER: 0x00000201,
  ANIMATION_CHANNEL: 0x00000202,
  BIT_CHANNEL: 0x00000203,

  // ---- Compressed Animation ----
  COMPRESSED_ANIMATION: 0x00000280,
  COMPRESSED_ANIMATION_HEADER: 0x00000281,
  COMPRESSED_ANIMATION_CHANNEL: 0x00000282,
  COMPRESSED_BIT_CHANNEL: 0x00000283,

  // ---- HLOD ----
  HLOD: 0x00000700,
  HLOD_HEADER: 0x00000701,
  HLOD_LOD_ARRAY: 0x00000702,
  HLOD_SUB_OBJECT_ARRAY_HEADER: 0x00000703,
  HLOD_SUB_OBJECT: 0x00000704,

  // ---- Misc ----
  BOX: 0x00000740,
  NULL_OBJECT: 0x00000750,

  // ---- Emitter ----
  EMITTER: 0x00000500,
  EMITTER_HEADER: 0x00000501,
  EMITTER_INFO: 0x00000509,
  EMITTER_INFOV2: 0x00000512,
  EMITTER_PROPS: 0x00000513,
} as const;

export type W3dChunkTypeValue = (typeof W3dChunkType)[keyof typeof W3dChunkType];

/** Reverse lookup: chunk id number -> human-readable name */
const _nameMap = new Map<number, string>();
for (const [key, value] of Object.entries(W3dChunkType)) {
  _nameMap.set(value as number, key);
}

export function chunkTypeName(type: number): string {
  return _nameMap.get(type) ?? `UNKNOWN_0x${type.toString(16).padStart(8, '0')}`;
}
