#!/usr/bin/env tsx
/**
 * Master asset conversion pipeline for C&C Generals: Zero Hour Browser Port.
 *
 * Reads the original game directory and converts all assets into
 * browser-friendly formats under browser-port/public/assets/.
 *
 * Usage:
 *   npm run convert:all -- --game-dir /path/to/generals
 *
 * Steps:
 *   1. Extract all .big archives → raw files
 *   2. Convert .tga/.dds textures → .rgba (raw RGBA)
 *   3. Convert .w3d models → .glb (glTF binary)
 *   4. Convert .map files → .json (heightmap + objects)
 *   5. Parse .ini files → .json (game data)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { addManifestEntry, createManifest, parseManifest, serializeManifest } from '@generals/core';
import type { IniDataBundle, RegistryStats } from '@generals/ini-data';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): { gameDir: string; outputDir: string; steps: Set<string> } {
  const args = process.argv.slice(2);
  let gameDir = '';
  let outputDir = '';
  const steps = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--game-dir':
        gameDir = args[++i] ?? '';
        break;
      case '--output':
        outputDir = args[++i] ?? '';
        break;
      case '--only':
        for (const s of (args[++i] ?? '').split(',')) {
          steps.add(s.trim());
        }
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
    }
  }

  if (!gameDir) {
    console.error('Error: --game-dir is required.\n');
    printUsage();
    process.exit(1);
  }

  if (!fs.existsSync(gameDir)) {
    console.error(`Error: Game directory not found: ${gameDir}`);
    process.exit(1);
  }

  if (!outputDir) {
    outputDir = path.resolve(import.meta.dirname ?? '.', '..', 'public', 'assets');
  }

  // Default: run all steps
  if (steps.size === 0) {
    steps.add('big');
    steps.add('texture');
    steps.add('w3d');
    steps.add('map');
    steps.add('ini');
  }

  return { gameDir: path.resolve(gameDir), outputDir: path.resolve(outputDir), steps };
}

function printUsage(): void {
  console.log(`
Usage: npm run convert:all -- --game-dir <path> [options]

Options:
  --game-dir <path>   Path to C&C Generals: Zero Hour install directory (required)
  --output <path>     Output directory (default: browser-port/public/assets/)
  --only <steps>      Comma-separated list of steps to run: big,texture,w3d,map,ini
  --help              Show this help message

Examples:
  npm run convert:all -- --game-dir "C:\\Games\\Command and Conquer Generals Zero Hour"
  npm run convert:all -- --game-dir ~/Games/Generals --only big,texture
`.trim());
}

// ---------------------------------------------------------------------------
// File discovery helpers
// ---------------------------------------------------------------------------

function findFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, ext));
    } else if (entry.name.toLowerCase().endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Step runners
// ---------------------------------------------------------------------------

const TOOLS_DIR = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

function runTool(tool: string, args: string[]): boolean {
  const toolPath = path.join(TOOLS_DIR, tool, 'src', 'cli.ts');
  try {
    execFileSync('npx', ['tsx', toolPath, ...args], {
      stdio: 'inherit',
      cwd: path.resolve(TOOLS_DIR, '..'),
    });
    return true;
  } catch {
    console.error(`  ⚠ Tool ${tool} failed for args: ${args.join(' ')}`);
    return false;
  }
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function ensureBundle(value: unknown): value is IniDataBundle {
  if (typeof value !== 'object' || value === null) return false;

  const bundle = value as Partial<IniDataBundle>;
  return (
    Array.isArray(bundle.objects)
    && Array.isArray(bundle.weapons)
    && Array.isArray(bundle.armors)
    && Array.isArray(bundle.upgrades)
    && Array.isArray(bundle.sciences)
    && Array.isArray(bundle.factions)
    && Array.isArray(bundle.errors)
    && Array.isArray(bundle.unsupportedBlockTypes)
    && typeof bundle.stats === 'object'
    && bundle.stats !== null
  );
}

function readBundle(pathToFile: string): IniDataBundle | null {
  if (!fs.existsSync(pathToFile)) return null;

  const text = fs.readFileSync(pathToFile, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return ensureBundle(parsed) ? parsed : null;
}

function mergeByName<T extends { name: string }>(left: T[], right: T[]): T[] {
  const byName = new Map<string, T>();
  for (const item of left) {
    byName.set(item.name, item);
  }
  for (const item of right) {
    byName.set(item.name, item);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function combineLists(left: string[], right: string[]): string[] {
  return [...left, ...right].sort();
}

function mergeStats(bundle: IniDataBundle): RegistryStats {
  const locomotorCount = bundle.locomotors?.length ?? 0;
  const commandButtonCount = bundle.commandButtons?.length ?? 0;
  const commandSetCount = bundle.commandSets?.length ?? 0;
  return {
    objects: bundle.objects.length,
    weapons: bundle.weapons.length,
    armors: bundle.armors.length,
    upgrades: bundle.upgrades.length,
    sciences: bundle.sciences.length,
    factions: bundle.factions.length,
    unresolvedInheritance: bundle.errors.filter((entry) => entry.type === 'unresolved_parent').length,
    totalBlocks:
      bundle.objects.length
      + bundle.weapons.length
      + bundle.armors.length
      + bundle.upgrades.length
      + commandButtonCount
      + commandSetCount
      + bundle.sciences.length
      + bundle.factions.length
      + locomotorCount,
  };
}

function mergeBundles(baseBundle: IniDataBundle, patchBundle: IniDataBundle): IniDataBundle {
  const mergedAi = mergeAiConfig(baseBundle.ai, patchBundle.ai);
  const merged: IniDataBundle = {
    objects: mergeByName(baseBundle.objects, patchBundle.objects),
    weapons: mergeByName(baseBundle.weapons, patchBundle.weapons),
    armors: mergeByName(baseBundle.armors, patchBundle.armors),
    upgrades: mergeByName(baseBundle.upgrades, patchBundle.upgrades),
    commandButtons: mergeByName(baseBundle.commandButtons ?? [], patchBundle.commandButtons ?? []),
    commandSets: mergeByName(baseBundle.commandSets ?? [], patchBundle.commandSets ?? []),
    sciences: mergeByName(baseBundle.sciences, patchBundle.sciences),
    factions: mergeByName(baseBundle.factions, patchBundle.factions),
    locomotors: mergeByName(baseBundle.locomotors ?? [], patchBundle.locomotors ?? []),
    errors: [...baseBundle.errors, ...patchBundle.errors],
    unsupportedBlockTypes: combineLists(
      baseBundle.unsupportedBlockTypes,
      patchBundle.unsupportedBlockTypes,
    ),
    ...(mergedAi ? { ai: mergedAi } : {}),
    stats: {
      objects: 0,
      weapons: 0,
      armors: 0,
      upgrades: 0,
      sciences: 0,
      factions: 0,
      unresolvedInheritance: 0,
      totalBlocks: 0,
    },
  };
  merged.stats = mergeStats(merged);
  return merged;
}

function mergeAiConfig(
  baseConfig: IniDataBundle['ai'],
  patchConfig: IniDataBundle['ai'],
): IniDataBundle['ai'] {
  if (!baseConfig && !patchConfig) return undefined;
  return {
    ...(baseConfig ?? {}),
    ...(patchConfig ?? {}),
  };
}

function mergeManifest(manifest: ReturnType<typeof createManifest>, manifestPath: string): void {
  if (!fs.existsSync(manifestPath)) return;

  const parsed = parseManifest(fs.readFileSync(manifestPath, 'utf-8'));
  if (!parsed) return;

  for (const entry of parsed.entries) {
    addManifestEntry(manifest, entry);
  }
}

function stepExtractBig(gameDir: string, outputDir: string): void {
  console.log('\n═══ Step 1/5: Extracting .big archives ═══\n');
  const extractedDir = path.join(outputDir, '_extracted');
  const bigFiles = findFiles(gameDir, '.big');
  console.log(`Found ${bigFiles.length} .big archive(s)`);

  for (const bigFile of bigFiles) {
    const baseName = path.basename(bigFile, '.big');
    const outDir = path.join(extractedDir, baseName);
    console.log(`  Extracting: ${path.basename(bigFile)} → ${path.relative(outputDir, outDir)}`);
    runTool('big-extractor', ['--input', bigFile, '--output', outDir]);
  }
}

function stepConvertTextures(outputDir: string): void {
  console.log('\n═══ Step 2/5: Converting textures ═══\n');
  const extractedDir = path.join(outputDir, '_extracted');
  const textureDir = path.join(outputDir, 'textures');

  const tgaFiles = findFiles(extractedDir, '.tga');
  const ddsFiles = findFiles(extractedDir, '.dds');
  console.log(`Found ${tgaFiles.length} .tga + ${ddsFiles.length} .dds texture(s)`);

  for (const file of [...tgaFiles, ...ddsFiles]) {
    const relPath = path.relative(extractedDir, file);
    const outPath = path.join(textureDir, relPath.replace(/\.(tga|dds)$/i, '.rgba'));
    runTool('texture-converter', ['--input', file, '--output', path.dirname(outPath)]);
  }
}

function stepConvertW3d(outputDir: string): void {
  console.log('\n═══ Step 3/5: Converting W3D models ═══\n');
  const extractedDir = path.join(outputDir, '_extracted');
  const modelDir = path.join(outputDir, 'models');

  const w3dFiles = findFiles(extractedDir, '.w3d');
  console.log(`Found ${w3dFiles.length} .w3d model(s)`);

  for (const file of w3dFiles) {
    const relPath = path.relative(extractedDir, file);
    const outPath = path.join(modelDir, relPath.replace(/\.w3d$/i, '.glb'));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    runTool('w3d-converter', ['--input', file, '--output', outPath]);
  }
}

function stepConvertMaps(gameDir: string, outputDir: string): void {
  console.log('\n═══ Step 4/5: Converting map files ═══\n');
  const mapDir = path.join(outputDir, 'maps');

  // Maps can be in game dir or extracted from .big
  const gameMaps = findFiles(gameDir, '.map');
  const extractedMaps = findFiles(path.join(outputDir, '_extracted'), '.map');
  const allMaps = [...new Set([...gameMaps, ...extractedMaps])];
  console.log(`Found ${allMaps.length} .map file(s)`);

  for (const file of allMaps) {
    const baseName = path.basename(file, '.map');
    const outPath = path.join(mapDir, `${baseName}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    runTool('map-converter', ['--input', file, '--output', outPath]);
  }
}

function stepParseIni(gameDir: string, outputDir: string): void {
  console.log('\n═══ Step 5/5: Parsing INI game data ═══\n');
  const iniDir = path.join(outputDir, 'data');
  const extractedDir = path.join(outputDir, '_extracted');
  const manifestDir = path.join(outputDir, 'manifests');
  const iniManifestPath = path.join(manifestDir, 'ini.json');
  const gameManifestPath = path.join(manifestDir, 'ini-game.json');
  const extractedManifestPath = path.join(manifestDir, 'ini-extracted.json');
  const gameBundlePath = path.join(iniDir, 'bundle-game.json');
  const extractedBundlePath = path.join(iniDir, '_extracted', 'bundle.json');
  const mergedBundlePath = path.join(iniDir, 'ini-bundle.json');
  fs.mkdirSync(manifestDir, { recursive: true });

  // INI files from game dir and extracted .big
  const gameInis = findFiles(gameDir, '.ini');
  const extractedInis = findFiles(extractedDir, '.ini');
  const allInis = [...new Set([...gameInis, ...extractedInis])];
  console.log(`Found ${allInis.length} .ini file(s)`);

  if (gameInis.length > 0) {
    runTool('ini-parser', [
      '--dir',
      gameDir,
      '--output',
      iniDir,
      '--base-dir',
      gameDir,
      '--manifest',
      gameManifestPath,
      '--bundle',
      gameBundlePath,
    ]);
  }

  if (extractedInis.length > 0) {
    const extractedIniDir = path.join(iniDir, '_extracted');
    runTool('ini-parser', [
      '--dir',
      extractedDir,
      '--output',
      extractedIniDir,
      '--base-dir',
      extractedDir,
      '--manifest',
      extractedManifestPath,
      '--bundle',
      extractedBundlePath,
    ]);
  }

  const manifest = createManifest();
  mergeManifest(manifest, gameManifestPath);
  mergeManifest(manifest, extractedManifestPath);

  if (allInis.length > 0) {
    const gameBundle = gameInis.length > 0 ? readBundle(gameBundlePath) : null;
    const extractedBundle = extractedInis.length > 0 ? readBundle(extractedBundlePath) : null;
    let mergedBundle: IniDataBundle | null = null;

    if (gameBundle) {
      mergedBundle = gameBundle;
    }

    if (extractedBundle) {
      if (mergedBundle) {
        mergedBundle = mergeBundles(mergedBundle, extractedBundle);
      } else {
        mergedBundle = extractedBundle;
      }
    }

    if (mergedBundle) {
      const serialized = JSON.stringify(mergedBundle, null, 2) + '\n';
      fs.writeFileSync(mergedBundlePath, serialized);
      const outputHash = sha256Hex(serialized);
      mergedBundle.stats = mergeStats(mergedBundle);
      addManifestEntry(manifest, {
        sourcePath: 'data/ini-bundle.json',
        sourceHash: outputHash,
        outputPath: path.relative(process.cwd(), mergedBundlePath),
        outputHash,
        converter: 'convert-all',
        converterVersion: '1.0.0',
        timestamp: new Date().toISOString(),
      });
      console.log(`INI data bundle written to ${mergedBundlePath}`);
    }
  }

  if (allInis.length > 0) {
    fs.writeFileSync(iniManifestPath, serializeManifest(manifest));
    console.log(`Conversion manifest written to ${iniManifestPath}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const { gameDir, outputDir, steps } = parseArgs();

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  C&C Generals: Zero Hour — Asset Conversion Pipeline ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\nGame directory: ${gameDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Steps: ${[...steps].join(', ')}\n`);

  fs.mkdirSync(outputDir, { recursive: true });

  const startTime = Date.now();

  if (steps.has('big'))     stepExtractBig(gameDir, outputDir);
  if (steps.has('texture')) stepConvertTextures(outputDir);
  if (steps.has('w3d'))     stepConvertW3d(outputDir);
  if (steps.has('map'))     stepConvertMaps(gameDir, outputDir);
  if (steps.has('ini'))     stepParseIni(gameDir, outputDir);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Conversion complete in ${elapsed}s`);
  console.log(`  Output: ${outputDir}`);
}

main();
