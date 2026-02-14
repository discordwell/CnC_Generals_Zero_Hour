/**
 * CLI for converting W3D binary model files to glTF 2.0 GLB format.
 *
 * Usage:
 *   w3d-converter --input <file.w3d> --output <file.glb> [--info]
 *
 * Options:
 *   --input   Path to the input .w3d file
 *   --output  Path for the output .glb file
 *   --info    Print the W3D chunk tree without converting
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { W3dChunkReader } from './W3dChunkReader.js';
import { chunkTypeName } from './W3dChunkTypes.js';
import { W3dParser } from './W3dParser.js';
import { GltfBuilder } from './GltfBuilder.js';

/* ------------------------------------------------------------------ */
/*  Argument parsing                                                   */
/* ------------------------------------------------------------------ */

interface CliArgs {
  input?: string;
  output?: string;
  info: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { info: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') {
      args.input = argv[++i];
    } else if (arg === '--output' || arg === '-o') {
      args.output = argv[++i];
    } else if (arg === '--info') {
      args.info = true;
    }
  }
  return args;
}

/* ------------------------------------------------------------------ */
/*  Chunk tree printer                                                 */
/* ------------------------------------------------------------------ */

function printChunkTree(reader: W3dChunkReader, offset: number, endOffset: number, depth: number): void {
  for (const chunk of reader.iterateChunks(offset, endOffset)) {
    const indent = '  '.repeat(depth);
    const name = chunkTypeName(chunk.type);
    const sizeStr = chunk.size.toLocaleString();
    const subStr = chunk.hasSubChunks ? ' [container]' : '';
    console.log(`${indent}${name} (0x${chunk.type.toString(16).padStart(8, '0')})  ${sizeStr} bytes${subStr}`);

    if (chunk.hasSubChunks) {
      printChunkTree(reader, chunk.dataOffset, chunk.dataOffset + chunk.size, depth + 1);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!args.input) {
    console.error('Usage: w3d-converter --input <file.w3d> --output <file.glb> [--info]');
    process.exit(1);
  }

  const inputPath = resolve(args.input);
  const fileBytes = readFileSync(inputPath);
  const buffer = fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength);

  if (args.info) {
    console.log(`W3D chunk tree for: ${inputPath}`);
    console.log(`File size: ${buffer.byteLength.toLocaleString()} bytes\n`);
    const reader = new W3dChunkReader(buffer);
    printChunkTree(reader, 0, reader.byteLength, 0);
    return;
  }

  if (!args.output) {
    console.error('Error: --output is required when not using --info');
    process.exit(1);
  }

  const outputPath = resolve(args.output);

  console.log(`Parsing W3D: ${inputPath}`);
  const w3d = W3dParser.parse(buffer);

  console.log(`  Meshes:      ${w3d.meshes.length}`);
  console.log(`  Hierarchies: ${w3d.hierarchies.length}`);
  console.log(`  Animations:  ${w3d.animations.length}`);
  console.log(`  HLODs:       ${w3d.hlods.length}`);

  for (const mesh of w3d.meshes) {
    const verts = mesh.vertices.length / 3;
    const tris = mesh.indices.length / 3;
    console.log(`  Mesh "${mesh.name}": ${verts} verts, ${tris} tris`);
  }

  console.log(`\nBuilding GLB...`);
  const glb = GltfBuilder.buildGlb(w3d);

  writeFileSync(outputPath, new Uint8Array(glb));
  console.log(`Written: ${outputPath} (${glb.byteLength.toLocaleString()} bytes)`);
}

main();
