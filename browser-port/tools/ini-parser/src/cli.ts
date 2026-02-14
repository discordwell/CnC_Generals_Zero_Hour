/**
 * INI Parser CLI — Asset pipeline tool
 *
 * Usage:
 *   ini-parser --input <file.ini> --output <file.json> [--base-dir <dir>]
 *   ini-parser --dir <dir> --output <dir> [--base-dir <dir>]
 *
 * Options:
 *   --input    Path to a single .ini file
 *   --output   Output JSON file or directory
 *   --dir      Process all .ini files in a directory (recursive)
 *   --base-dir Base directory for resolving #include paths (defaults to input dir)
 *   --stats    Print summary statistics
 *   --help     Show this help message
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative, extname } from 'node:path';
import { parseIni } from '@generals/core';
import type { IniBlock, IniParseError } from '@generals/core';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  input: string | undefined;
  output: string | undefined;
  dir: string | undefined;
  baseDir: string | undefined;
  stats: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    input: undefined,
    output: undefined,
    dir: undefined,
    baseDir: undefined,
    stats: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--input':
      case '-i':
        args.input = argv[++i];
        break;
      case '--output':
      case '-o':
        args.output = argv[++i];
        break;
      case '--dir':
      case '-d':
        args.dir = argv[++i];
        break;
      case '--base-dir':
        args.baseDir = argv[++i];
        break;
      case '--stats':
        args.stats = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printUsage();
        process.exit(1);
    }
  }

  return args;
}

function printUsage(): void {
  console.log(`
INI Parser — @generals/tool-ini-parser

Usage:
  ini-parser --input <file.ini> --output <file.json> [--base-dir <dir>]
  ini-parser --dir <dir> --output <dir> [--base-dir <dir>] [--stats]

Options:
  --input,    -i   Path to a single .ini file
  --output,   -o   Output JSON file or directory (required)
  --dir,      -d   Process all .ini files in a directory (recursive)
  --base-dir       Base directory for resolving #include paths
  --stats          Print summary statistics
  --help,     -h   Show this help message
  `.trim());
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function findIniFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findIniFiles(fullPath));
    } else if (extname(entry.name).toLowerCase() === '.ini') {
      results.push(fullPath);
    }
  }
  return results;
}

function makeIncludeResolver(baseDir: string): (path: string) => string | null {
  return (includePath: string): string | null => {
    // Normalize backslashes to forward slashes
    const normalized = includePath.replace(/\\/g, '/');
    const fullPath = resolve(baseDir, normalized);
    try {
      return readFileSync(fullPath, 'utf-8');
    } catch {
      return null;
    }
  };
}

// ---------------------------------------------------------------------------
// Deterministic JSON serialization
// ---------------------------------------------------------------------------

/** Serialize IniBlock[] to deterministic JSON with sorted keys. */
function toSortedJson(blocks: IniBlock[]): string {
  return JSON.stringify(blocks, (_key, value) => {
    // Sort object keys for deterministic output
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Map)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  }, 2);
}

// ---------------------------------------------------------------------------
// Single file processing
// ---------------------------------------------------------------------------

interface ParseStats {
  files: number;
  blocks: number;
  errors: number;
  byType: Map<string, number>;
}

function processFile(
  inputPath: string,
  outputPath: string,
  baseDir: string,
  stats: ParseStats,
): IniParseError[] {
  const source = readFileSync(inputPath, 'utf-8');
  const result = parseIni(source, {
    filePath: inputPath,
    resolveInclude: makeIncludeResolver(baseDir),
  });

  stats.files++;
  stats.blocks += result.blocks.length;
  stats.errors += result.errors.length;

  for (const block of result.blocks) {
    stats.byType.set(block.type, (stats.byType.get(block.type) ?? 0) + 1);
  }

  // Write JSON output
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, toSortedJson(result.blocks) + '\n');

  // Report errors
  for (const err of result.errors) {
    const loc = err.file ? `${err.file}:${err.line}` : `line ${err.line}`;
    console.error(`  [WARN] ${loc}: ${err.message}`);
  }

  return result.errors;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv);

  if (!args.output) {
    console.error('Error: --output is required\n');
    printUsage();
    process.exit(1);
  }

  if (!args.input && !args.dir) {
    console.error('Error: --input or --dir is required\n');
    printUsage();
    process.exit(1);
  }

  const stats: ParseStats = {
    files: 0,
    blocks: 0,
    errors: 0,
    byType: new Map(),
  };

  if (args.input) {
    // Single file mode
    const inputPath = resolve(args.input);
    const outputPath = resolve(args.output);
    const baseDir = args.baseDir ? resolve(args.baseDir) : dirname(inputPath);

    console.log(`Parsing: ${inputPath}`);
    processFile(inputPath, outputPath, baseDir, stats);
    console.log(`  → ${outputPath} (${stats.blocks} block(s), ${stats.errors} error(s))`);
  } else if (args.dir) {
    // Directory mode
    const dirPath = resolve(args.dir);
    const outputDir = resolve(args.output);
    const baseDir = args.baseDir ? resolve(args.baseDir) : dirPath;

    const iniFiles = findIniFiles(dirPath);
    console.log(`Found ${iniFiles.length} .ini file(s) in ${dirPath}`);

    for (const file of iniFiles) {
      const relPath = relative(dirPath, file);
      const outPath = join(outputDir, relPath.replace(/\.ini$/i, '.json'));
      processFile(file, outPath, baseDir, stats);
    }

    console.log(`\nProcessed ${stats.files} file(s) → ${outputDir}`);
  }

  // Print stats
  if (args.stats || stats.errors > 0) {
    console.log(`\nSummary:`);
    console.log(`  Files:  ${stats.files}`);
    console.log(`  Blocks: ${stats.blocks}`);
    console.log(`  Errors: ${stats.errors}`);
    if (stats.byType.size > 0) {
      console.log(`  Block types:`);
      const sorted = [...stats.byType.entries()].sort((a, b) => b[1] - a[1]);
      for (const [type, count] of sorted) {
        console.log(`    ${type}: ${count}`);
      }
    }
  }

  if (stats.errors > 0) {
    process.exit(1);
  }
}

main();
