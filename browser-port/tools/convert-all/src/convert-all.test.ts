import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface CliResult {
  readonly status: number;
}

interface ConversionManifestSnapshot {
  version: number;
  entryCount: number;
  entries: Array<{ sourcePath: string; outputPath: string; sourceHash: string }>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const CONVERT_ALL_PATH = resolve(PROJECT_ROOT, 'tools/convert-all.ts');
const TSX_PATH = resolve(PROJECT_ROOT, 'node_modules/tsx/dist/cli.mjs');

function runConvertAll(args: string[]): CliResult {
  const proc = spawnSync(process.execPath, [TSX_PATH, CONVERT_ALL_PATH, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });

  return {
    status: proc.status ?? 1,
  };
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'generals-convert-all-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('convert-all integration smoke', () => {
  it('parses INI inputs in ini-only mode', () => {
    return withTempDir((dir) => {
      const gameDir = resolve(dir, 'game');
      const outputDir = resolve(dir, 'out');
      const sampleIni = resolve(gameDir, 'data', 'sample.ini');
      mkdirSync(resolve(gameDir, 'data'), { recursive: true });
      writeFileSync(
        sampleIni,
        'Object Tank\\n  Side = America\\nEnd\\n',
      );

      const result = runConvertAll([
        '--game-dir',
        gameDir,
        '--output',
        outputDir,
        '--only',
        'ini',
      ]);

      expect(result.status).toBe(0);
      const manifestText = readFileSync(
        resolve(outputDir, 'manifests', 'ini.json'),
        'utf8',
      );
      const manifest = JSON.parse(manifestText) as ConversionManifestSnapshot;
      expect(manifest.version).toBe(1);
      expect(manifest.entryCount).toBe(2);
      expect(manifest.entries).toHaveLength(2);
      expect(manifest.entries.some((entry) => entry.outputPath.includes('sample.json'))).toBe(true);
      expect(manifest.entries.some((entry) => entry.sourcePath.includes('ini-bundle'))).toBe(true);
      expect(manifest.entries.every((entry) => entry.sourceHash.length === 64)).toBe(true);

      const bundleText = readFileSync(
        resolve(outputDir, 'data', 'ini-bundle.json'),
        'utf8',
      );
      const bundle = JSON.parse(bundleText) as {
        objects: unknown[];
        weapons: unknown[];
        stats: { objects: number; weapons: number };
      };
      expect(bundle.objects).toHaveLength(1);
      expect(bundle.stats.objects).toBe(1);
      expect(bundle.stats.weapons).toBe(0);
    });
  });
});
