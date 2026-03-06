/**
 * CLI for converting W3D binary model files to glTF 2.0 GLB format.
 *
 * Usage:
 *   w3d-converter --input <file.w3d|dir> --output <file.glb|dir> [--info] [--quiet]
 *
 * Options:
 *   --input   Path to an input .w3d file, or a directory to convert recursively
 *   --output  Output .glb path (file mode) or output root directory (directory mode)
 *   --info    Print the W3D chunk tree (file mode only) without converting
 *   --quiet   Suppress per-file conversion logs
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
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
  quiet: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { info: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') {
      args.input = argv[++i];
    } else if (arg === '--output' || arg === '-o') {
      args.output = argv[++i];
    } else if (arg === '--info') {
      args.info = true;
    } else if (arg === '--quiet') {
      args.quiet = true;
    }
  }
  return args;
}

function discoverW3dFiles(inputPath: string): { files: string[]; isSingleFile: boolean; baseDir: string } {
  const stat = statSync(inputPath);
  if (stat.isFile()) {
    if (extname(inputPath).toLowerCase() !== '.w3d') {
      throw new Error(`Input file is not a .w3d model: ${inputPath}`);
    }
    return { files: [inputPath], isSingleFile: true, baseDir: dirname(inputPath) };
  }

  if (!stat.isDirectory()) {
    throw new Error(`Input path is neither a file nor directory: ${inputPath}`);
  }

  const files: string[] = [];
  const entries = readdirSync(inputPath, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.w3d') {
      continue;
    }
    const parentPath = entry.parentPath ?? (entry as unknown as { path: string }).path ?? inputPath;
    files.push(join(parentPath, entry.name));
  }
  files.sort((left, right) => left.localeCompare(right));
  return { files, isSingleFile: false, baseDir: inputPath };
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

function convertFileToGlb(inputPath: string, outputPath: string, quiet: boolean): void {
  const fileBytes = readFileSync(inputPath);
  const buffer = fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength);

  if (!quiet) {
    console.log(`Parsing W3D: ${inputPath}`);
  }

  const w3d = W3dParser.parse(buffer);

  if (!quiet) {
    console.log(`  Meshes:      ${w3d.meshes.length}`);
    console.log(`  Hierarchies: ${w3d.hierarchies.length}`);
    console.log(`  Animations:  ${w3d.animations.length}`);
    console.log(`  HLODs:       ${w3d.hlods.length}`);

    for (const mesh of w3d.meshes) {
      const verts = mesh.vertices.length / 3;
      const tris = mesh.indices.length / 3;
      console.log(`  Mesh "${mesh.name}": ${verts} verts, ${tris} tris`);
    }

    console.log('\nBuilding GLB...');
  }

  const glb = GltfBuilder.buildGlb(w3d);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, new Uint8Array(glb));

  if (!quiet) {
    console.log(`Written: ${outputPath} (${glb.byteLength.toLocaleString()} bytes)`);
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!args.input) {
    console.error('Usage: w3d-converter --input <file.w3d|dir> --output <file.glb|dir> [--info] [--quiet]');
    process.exit(1);
  }

  const inputPath = resolve(args.input);
  const discovered = discoverW3dFiles(inputPath);

  if (args.info) {
    if (!discovered.isSingleFile) {
      console.error('Error: --info only supports single-file input');
      process.exit(1);
    }
    const fileBytes = readFileSync(inputPath);
    const buffer = fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength);
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

  if (discovered.isSingleFile) {
    convertFileToGlb(inputPath, outputPath, args.quiet);
    return;
  }

  console.log(`Found ${discovered.files.length} .w3d model(s) to convert.`);
  let success = 0;
  let failed = 0;

  for (const file of discovered.files) {
    const rel = relative(discovered.baseDir, file);
    const outFile = join(outputPath, rel.replace(/\.w3d$/i, '.glb'));
    try {
      convertFileToGlb(file, outFile, true);
      if (!args.quiet) {
        console.log(`  OK: ${rel}`);
      }
      success += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  FAIL: ${rel} — ${message}`);
      failed += 1;
    }
  }

  console.log(`\nDone. ${success} converted, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
