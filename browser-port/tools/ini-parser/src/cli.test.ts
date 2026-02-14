import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface CliResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const CLI_PATH = resolve(PROJECT_ROOT, 'tools/ini-parser/src/cli.ts');
const TSX_PATH = resolve(PROJECT_ROOT, 'node_modules/tsx/dist/cli.mjs');
const SAMPLE_INI = resolve(__dirname, '../fixtures/sample.ini');

function runIniCli(args: string[]): CliResult {
  const proc = spawnSync(process.execPath, [TSX_PATH, CLI_PATH, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });

  return {
    status: proc.status ?? 1,
    stdout: typeof proc.stdout === 'string' ? proc.stdout : '',
    stderr: typeof proc.stderr === 'string' ? proc.stderr : '',
  };
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'generals-ini-parser-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ini-parser CLI', () => {
  it('writes parsed JSON and compatibility report', () => {
    return withTempDir((dir) => {
      const outputPath = resolve(dir, 'out.json');
      const reportPath = resolve(dir, 'report.json');

      const result = runIniCli([
        '--input',
        SAMPLE_INI,
        '--output',
        outputPath,
        '--report',
        reportPath,
      ]);

      expect(result.status).toBe(0);
      const output = JSON.parse(readFileSync(outputPath, 'utf8')) as unknown[];
      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        files: number;
        mode: 'single' | 'directory';
      };

      expect(output).toHaveLength(3);
      expect(report.mode).toBe('single');
      expect(report.files).toBe(1);
    });
  });

  it('writes resolved registry bundle', () => {
    return withTempDir((dir) => {
      const outputPath = resolve(dir, 'out.json');
      const bundlePath = resolve(dir, 'bundle.json');

      const result = runIniCli([
        '--input',
        SAMPLE_INI,
        '--output',
        outputPath,
        '--bundle',
        bundlePath,
      ]);

      expect(result.status).toBe(0);
      const bundle = JSON.parse(readFileSync(bundlePath, 'utf8')) as {
        objects: Array<{ name: string }>;
        weapons: Array<{ name: string }>;
        armors: Array<{ name: string }>;
        stats: { totalBlocks: number };
      };

      expect(bundle.objects).toHaveLength(1);
      expect(bundle.weapons).toHaveLength(1);
      expect(bundle.armors).toHaveLength(1);
      expect(bundle.objects[0]!.name).toBe('USATankCrusader');
      expect(bundle.stats.totalBlocks).toBe(3);
    });
  });

  it('writes conversion manifest with content hashes', () => {
    return withTempDir((dir) => {
      const outputPath = resolve(dir, 'out.json');
      const manifestPath = resolve(dir, 'manifest.json');

      const result = runIniCli([
        '--input',
        SAMPLE_INI,
        '--output',
        outputPath,
        '--manifest',
        manifestPath,
      ]);

      expect(result.status).toBe(0);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        version: number;
        entryCount: number;
        entries: Array<{ sourcePath: string; outputPath: string; sourceHash: string; outputHash: string; converter: string; converterVersion: string }>;
      };

      expect(manifest.version).toBe(1);
      expect(manifest.entryCount).toBe(1);
      expect(manifest.entries).toHaveLength(1);
      const entry = manifest.entries[0]!;
      expect(entry.converter).toBe('ini-parser');
      expect(entry.sourcePath).toBe(relative(PROJECT_ROOT, SAMPLE_INI));
      expect(entry.outputPath).toBe(relative(PROJECT_ROOT, outputPath));
      expect(entry.sourceHash).toHaveLength(64);
      expect(entry.outputHash).toHaveLength(64);
      expect(entry.converterVersion).toBeTypeOf('string');
    });
  });

  it('fails in strict mode for unsupported block types', () => {
    return withTempDir((dir) => {
      const inputPath = resolve(dir, 'unsupported.ini');
      const outputPath = resolve(dir, 'unsupported.json');
      writeFileSync(
        inputPath,
        'AnimationSoundClientBehaviorGlobalSetting Foo\n  Volume = 1\nEnd\n',
      );

      const result = runIniCli([
        '--input',
        inputPath,
        '--output',
        outputPath,
        '--strict',
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[REGISTRY]');
    });
  });

  it('preserves directory structure in directory mode', () => {
    return withTempDir((dir) => {
      const inputDir = resolve(dir, 'in');
      const outputDir = resolve(dir, 'out');
      const nestedDir = resolve(inputDir, 'sub');
      mkdirSync(nestedDir, { recursive: true });

      writeFileSync(resolve(inputDir, 'first.ini'), 'Object Tank\\n  Side = America\\nEnd\\n');
      writeFileSync(resolve(nestedDir, 'second.ini'), 'Weapon Gun\\n  Damage = 10\\nEnd\\n');

      const result = runIniCli([
        '--dir',
        inputDir,
        '--output',
        outputDir,
      ]);

      expect(result.status).toBe(0);
      expect(JSON.parse(readFileSync(resolve(outputDir, 'first.json'), 'utf8'))).toHaveLength(1);
      expect(JSON.parse(readFileSync(resolve(outputDir, 'sub', 'second.json'), 'utf8'))).toHaveLength(1);
    });
  });
});
