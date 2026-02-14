/**
 * INI Parser CLI — Asset pipeline tool
 *
 * Usage:
 *   ini-parser --input <file.ini> --output <file.json> [--base-dir <dir>]
 *   ini-parser --dir <dir> --output <dir> [--base-dir <dir>]
 *   ini-parser --dir <dir> --output <dir> --report <file>
 *   ini-parser --dir <dir> --output <dir> --bundle <file>
 *
 * Options:
 *   --input    Path to a single .ini file
 *   --output   Output JSON file or directory
 *   --dir      Process all .ini files in a directory (recursive)
 *   --base-dir Base directory for resolving #include paths (defaults to input dir)
 *   --stats    Print summary statistics
 *   --strict   Treat unsupported/registry issues as fatal
 *   --bundle   Write resolved registry bundle JSON
 *   --manifest Write a conversion manifest JSON file
 *   --report   Write a compatibility report JSON file
 *   --help     Show this help message
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createManifest,
  addManifestEntry,
  serializeManifest,
  type ConversionManifest,
} from '@generals/core';
import { parseIni, type IniBlock, type IniParseError } from '@generals/core';
import { IniDataRegistry } from '@generals/ini-data';

interface ParsedFileResult {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly blocks: IniBlock[];
  readonly errors: IniParseError[];
  readonly sourceHash: string;
  readonly outputHash: string;
}

interface CliReport {
  generatedAt: string;
  mode: 'single' | 'directory';
  sourcePath: string;
  outputPath: string;
  files: number;
  blocks: number;
  parseErrors: number;
  strict: boolean;
  byType: Record<string, number>;
  parseWarnings: {
    inputPath: string;
    file?: string;
    line: number;
    message: string;
  }[];
  registry: {
    stats: {
      objects: number;
      weapons: number;
      armors: number;
      upgrades: number;
      sciences: number;
      factions: number;
      unresolvedInheritance: number;
      totalBlocks: number;
    };
    unsupportedBlockTypes: string[];
    errors: {
      type: string;
      blockType: string;
      name: string;
      detail: string;
      file?: string;
    }[];
  };
  manifest?: string;
}

interface CliArgs {
  input: string | undefined;
  output: string | undefined;
  dir: string | undefined;
  baseDir: string | undefined;
  stats: boolean;
  strict: boolean;
  report: string | undefined;
  manifest: string | undefined;
  bundle: string | undefined;
}

interface ParseStats {
  files: number;
  blocks: number;
  errors: number;
  byType: Map<string, number>;
}

// ============================================================================
// Argument parsing
// ============================================================================

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    input: undefined,
    output: undefined,
    dir: undefined,
    baseDir: undefined,
    stats: false,
    strict: false,
    report: undefined,
    manifest: undefined,
    bundle: undefined,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--input':
      case '-i':
        args.input = readArgValue(argv, ++i, '--input');
        break;
      case '--output':
      case '-o':
        args.output = readArgValue(argv, ++i, '--output');
        break;
      case '--dir':
      case '-d':
        args.dir = readArgValue(argv, ++i, '--dir');
        break;
      case '--base-dir':
        args.baseDir = readArgValue(argv, ++i, '--base-dir');
        break;
      case '--stats':
        args.stats = true;
        break;
      case '--strict':
        args.strict = true;
        break;
      case '--report':
        args.report = readArgValue(argv, ++i, '--report');
        break;
      case '--manifest':
        args.manifest = readArgValue(argv, ++i, '--manifest');
        break;
      case '--bundle':
        args.bundle = readArgValue(argv, ++i, '--bundle');
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

function readArgValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    console.error(`Error: ${flag} requires a value`);
    printUsage();
    process.exit(1);
  }
  return value;
}

function printUsage(): void {
  console.log(`
INI Parser — @generals/tool-ini-parser

Usage:
  ini-parser --input <file.ini> --output <file.json> [--base-dir <dir>]
  ini-parser --dir <dir> --output <dir> [--base-dir <dir>] [--stats]
  ini-parser --dir <dir> --output <dir> --report <file> --manifest <file> --bundle <file> [--strict]

Options:
  --input,    -i   Path to a single .ini file
  --output,   -o   Output JSON file or directory (required)
  --dir,      -d   Process all .ini files in a directory (recursive)
  --base-dir       Base directory for resolving #include paths
  --stats          Print summary statistics
  --strict         Treat unsupported/compatibility issues as fatal
  --report         Write a compatibility report JSON file
  --manifest       Write a conversion manifest JSON file
  --bundle         Write resolved registry bundle JSON
  --help,     -h   Show this help message
  `.trim());
}

const CLI_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_VERSION = (() => {
  try {
    const pkgPath = resolve(CLI_DIR, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

const PARSER_TOOL_ID = 'ini-parser';

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
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

/** Serialize any object to deterministic JSON with sorted object keys. */
function toSortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, fieldValue) => {
    // Sort object keys for deterministic output
    if (
      fieldValue &&
      typeof fieldValue === 'object' &&
      !Array.isArray(fieldValue) &&
      !(fieldValue instanceof Map)
    ) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(fieldValue as Record<string, unknown>).sort()) {
        sorted[key] = (fieldValue as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return fieldValue;
  }, 2);
}

// ---------------------------------------------------------------------------
// Single file processing
// ---------------------------------------------------------------------------

function processFile(
  inputPath: string,
  outputPath: string,
  baseDir: string,
): ParsedFileResult {
  const source = readFileSync(inputPath, 'utf-8');
  const sourceHash = sha256Hex(source);
  const result = parseIni(source, {
    filePath: inputPath,
    resolveInclude: makeIncludeResolver(baseDir),
  });

  // Write JSON output
  mkdirSync(dirname(outputPath), { recursive: true });
  const outputJson = toSortedJson(result.blocks) + '\n';
  writeFileSync(outputPath, outputJson);
  const outputHash = sha256Hex(outputJson);

  return {
    inputPath,
    outputPath,
    blocks: result.blocks,
    errors: result.errors,
    sourceHash,
    outputHash,
  };
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
  const reportWarnings: CliReport['parseWarnings'] = [];
  const registry = new IniDataRegistry();
  const manifest: ConversionManifest | null = args.manifest ? createManifest() : null;
  const recordManifestEntry = (entry: ParsedFileResult): void => {
    if (!manifest) return;
    addManifestEntry(manifest, {
      sourcePath: relative(process.cwd(), entry.inputPath),
      sourceHash: entry.sourceHash,
      outputPath: relative(process.cwd(), entry.outputPath),
      outputHash: entry.outputHash,
      converter: PARSER_TOOL_ID,
      converterVersion: TOOL_VERSION,
      timestamp: new Date().toISOString(),
    });
  };
  let runtimeError = false;

  if (args.input) {
    // Single file mode
    const inputPath = resolve(args.input);
    const outputPath = resolve(args.output);
    const baseDir = args.baseDir ? resolve(args.baseDir) : dirname(inputPath);

    console.log(`Parsing: ${inputPath}`);
    try {
      const result = processFile(inputPath, outputPath, baseDir);
      stats.files++;
      stats.blocks += result.blocks.length;
      stats.errors += result.errors.length;
      for (const block of result.blocks) {
        stats.byType.set(block.type, (stats.byType.get(block.type) ?? 0) + 1);
      }
      for (const err of result.errors) {
        reportWarnings.push({
          inputPath: result.inputPath,
          file: err.file,
          line: err.line,
          message: err.message,
        });
        const loc = err.file ? `${err.file}:${err.line}` : `line ${err.line}`;
        console.error(`  [WARN] ${loc}: ${err.message}`);
      }
      registry.loadBlocks(result.blocks, result.inputPath);
      recordManifestEntry(result);
      console.log(`  → ${outputPath} (${result.blocks.length} block(s), ${result.errors.length} error(s))`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : `Failed processing ${inputPath}`);
      runtimeError = true;
    }
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
      try {
        const result = processFile(file, outPath, baseDir);
        stats.files++;
        stats.blocks += result.blocks.length;
        stats.errors += result.errors.length;
        for (const block of result.blocks) {
          stats.byType.set(block.type, (stats.byType.get(block.type) ?? 0) + 1);
        }
        for (const err of result.errors) {
          reportWarnings.push({
            inputPath: result.inputPath,
            file: err.file,
            line: err.line,
            message: err.message,
          });
          const loc = err.file ? `${err.file}:${err.line}` : `line ${err.line}`;
          console.error(`  [WARN] ${loc}: ${err.message}`);
        }
        registry.loadBlocks(result.blocks, result.inputPath);
        recordManifestEntry(result);
      } catch (error) {
        runtimeError = true;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ERROR] failed processing ${file}: ${message}`);
      }
    }

    console.log(`\nProcessed ${stats.files} file(s) → ${outputDir}`);
  }

  registry.resolveInheritance();

  // Print stats
  if (args.stats || stats.errors > 0) {
    console.log(`\nSummary:`);
    console.log(`  Files:  ${stats.files}`);
    console.log(`  Blocks: ${stats.blocks}`);
    console.log(`  Errors: ${stats.errors}`);
    if (registry.errors.length > 0) {
      console.log(`  Registry errors: ${registry.errors.length}`);
    }
    if (stats.byType.size > 0) {
      console.log(`  Block types:`);
      const sorted = [...stats.byType.entries()].sort((a, b) => b[1] - a[1]);
      for (const [type, count] of sorted) {
        console.log(`    ${type}: ${count}`);
      }
    }
    if (registry.getUnsupportedBlockTypes().length > 0) {
      console.log(`  Unsupported block types: ${registry.getUnsupportedBlockTypes().join(', ')}`);
    }
    if (registry.getStats().unresolvedInheritance > 0) {
      console.log(`  Unresolved inheritance links: ${registry.getStats().unresolvedInheritance}`);
    }
  }

  if (args.report) {
    const byType: Record<string, number> = {};
    for (const [type, count] of [...stats.byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      byType[type] = count;
    }
    const report: CliReport = {
      generatedAt: new Date().toISOString(),
      mode: args.input ? 'single' : 'directory',
      sourcePath: args.input ?? args.dir ?? '',
      outputPath: args.output ?? '',
      files: stats.files,
      blocks: stats.blocks,
      parseErrors: stats.errors,
      strict: args.strict,
      byType,
      parseWarnings: reportWarnings,
      registry: {
        stats: registry.getStats(),
        unsupportedBlockTypes: registry.getUnsupportedBlockTypes(),
        errors: registry.errors.map((error) => ({ ...error })),
      },
      manifest: args.manifest,
    };

    writeFileSync(args.report, toSortedJson(report) + '\n');
    console.log(`Compatibility report written to ${args.report}`);
  }

  if (args.manifest && manifest) {
    writeFileSync(args.manifest, serializeManifest(manifest));
    console.log(`Conversion manifest written to ${args.manifest}`);
  }

  if (args.bundle) {
    const bundle = registry.toBundle();
    writeFileSync(args.bundle, toSortedJson(bundle) + '\n');
    console.log(`Data bundle written to ${args.bundle}`);
  }

  if (args.strict) {
    for (const error of registry.errors) {
      console.error(`  [REGISTRY] ${error.blockType} ${error.name}: ${error.detail}`);
    }
  }

  const failOnRegistryIssues = args.strict && registry.errors.length > 0;
  const shouldFail = runtimeError || (stats.errors > 0) || failOnRegistryIssues;

  if (shouldFail) {
    process.exit(1);
  }
}

main();
