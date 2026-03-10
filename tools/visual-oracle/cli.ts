#!/usr/bin/env tsx
/**
 * Visual Oracle CLI — compare original C&C Generals Zero Hour with the browser port.
 *
 * Usage:
 *   npx tsx cli.ts screenshot              — Capture a screenshot from the running VM
 *   npx tsx cli.ts capture <scenario.json>  — Run a scenario in the original game
 *   npx tsx cli.ts compare <scenario.json>  — Compare original vs port screenshots
 *   npx tsx cli.ts navigate                 — Boot VM and navigate to gameplay
 *   npx tsx cli.ts connect                  — Connect to running VM for interactive use
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QemuController } from './qemu/QemuController.js';
import { QEMU_CONFIG } from './qemu/generals-config.js';
import { GeneralsOracle } from './oracle/GeneralsOracle.js';
import { ScenarioRunner, DEFAULT_JUDGE_CONFIG, type Scenario } from './compare/ScenarioRunner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'screenshot':
      await cmdScreenshot(args[0]);
      break;

    case 'capture':
      await cmdCapture(args[0]);
      break;

    case 'compare':
      await cmdCompare(args[0]);
      break;

    case 'navigate':
      await cmdNavigate();
      break;

    case 'connect':
      await cmdConnect();
      break;

    default:
      console.log(`Visual Oracle — C&C Generals Zero Hour Parity Tool

Usage:
  npx tsx cli.ts screenshot [output.png]  — Capture VM screenshot
  npx tsx cli.ts capture <scenario.json>  — Run scenario in original game
  npx tsx cli.ts compare <scenario.json>  — Full comparison (original + port)
  npx tsx cli.ts navigate                 — Boot VM, navigate to gameplay
  npx tsx cli.ts connect                  — Connect to running VM

Prerequisites:
  1. QEMU installed: brew install qemu
  2. VM disk image: ${QEMU_CONFIG.diskImage}
  3. See tools/visual-oracle/vm/README.md for VM setup
`);
      break;
  }
}

async function cmdScreenshot(outputPath?: string) {
  const out = outputPath ?? path.join(__dirname, 'screenshot.png');
  const controller = new QemuController();
  await controller.connectToExisting();
  const buf = await controller.captureScreenshot(out);
  console.log(`Screenshot saved: ${out} (${buf.length} bytes)`);
  controller.disconnectQmp();
}

async function cmdCapture(scenarioPath?: string) {
  if (!scenarioPath) {
    console.error('Usage: npx tsx cli.ts capture <scenario.json>');
    process.exit(1);
  }

  const scenario = loadScenario(scenarioPath);
  const oracle = new GeneralsOracle({
    faction: scenario.faction,
    connectExisting: true,
    skipNavigation: true,
  });

  await oracle.connect();
  try {
    await oracle.executeScenario(scenario.originalActions);
    const screenshots = oracle.getScreenshots();
    console.log(`Captured ${screenshots.size} screenshots`);

    // Save to artifacts
    const outDir = path.join(QEMU_CONFIG.screenshotDir, scenario.id, 'original');
    fs.mkdirSync(outDir, { recursive: true });
    for (const [label, buf] of screenshots) {
      const outPath = path.join(outDir, `${label}.png`);
      fs.writeFileSync(outPath, buf);
      console.log(`  → ${outPath}`);
    }
  } finally {
    await oracle.disconnect();
  }
}

async function cmdCompare(scenarioPath?: string) {
  if (!scenarioPath) {
    console.error('Usage: npx tsx cli.ts compare <scenario.json>');
    process.exit(1);
  }

  const scenario = loadScenario(scenarioPath);
  const runner = new ScenarioRunner();

  // Load port screenshots from artifacts dir
  const portDir = path.join(QEMU_CONFIG.screenshotDir, scenario.id, 'port');
  const portScreenshots = new Map<string, Buffer>();

  if (fs.existsSync(portDir)) {
    for (const file of fs.readdirSync(portDir)) {
      if (file.endsWith('.png')) {
        const label = path.basename(file, '.png');
        portScreenshots.set(label, fs.readFileSync(path.join(portDir, file)));
      }
    }
  }

  if (portScreenshots.size === 0) {
    console.log('No port screenshots found. Running judge on original only...');
    console.log(`Expected port screenshots at: ${portDir}`);
    return;
  }

  const result = await runner.compare(scenario, portScreenshots);

  if (result.judgeResult) {
    console.log('\n=== Comparison Result ===');
    console.log(`Overall Score: ${result.judgeResult.overallScore}/10`);
    console.log('\nAspect Scores:');
    for (const [aspect, score] of Object.entries(result.judgeResult.aspectScores)) {
      const bar = '█'.repeat(score) + '░'.repeat(10 - score);
      console.log(`  ${bar} ${score}/10 ${aspect}`);
    }
    if (result.judgeResult.differences.length > 0) {
      console.log('\nKey Differences:');
      for (const diff of result.judgeResult.differences) {
        console.log(`  • ${diff}`);
      }
    }
    if (result.judgeResult.suggestions.length > 0) {
      console.log('\nSuggestions:');
      for (const sug of result.judgeResult.suggestions) {
        console.log(`  → ${sug}`);
      }
    }
  }

  if (result.error) {
    console.error(`\nError: ${result.error}`);
  }
}

async function cmdNavigate() {
  const oracle = new GeneralsOracle({
    faction: 'USA',
  });

  await oracle.connect();
  console.log('VM is at gameplay. Taking initial screenshot...');
  await oracle.screenshot('initial');
  console.log('Ready. Press Ctrl+C to disconnect.');

  // Keep alive until interrupted
  await new Promise<void>((resolve) => {
    process.on('SIGINT', async () => {
      console.log('\nDisconnecting...');
      await oracle.disconnect();
      resolve();
    });
  });
}

async function cmdConnect() {
  const controller = new QemuController();
  await controller.connectToExisting();
  console.log('Connected to running VM. Taking screenshot...');

  const buf = await controller.captureScreenshot(path.join(__dirname, 'connected.png'));
  console.log(`Screenshot: ${buf.length} bytes`);

  const fb = await controller.getFramebufferSize();
  console.log(`Framebuffer: ${fb.width}x${fb.height}`);

  console.log('Ready. Press Ctrl+C to disconnect.');
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      controller.disconnectQmp();
      resolve();
    });
  });
}

function loadScenario(scenarioPath: string): Scenario {
  const fullPath = path.resolve(scenarioPath);
  const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

  return {
    id: raw.id ?? path.basename(scenarioPath, '.json'),
    name: raw.name ?? 'Unnamed Scenario',
    description: raw.description ?? '',
    faction: raw.faction ?? 'USA',
    originalActions: raw.originalActions ?? [],
    portCommands: raw.portCommands ?? [],
    judgeConfig: raw.judgeConfig ?? DEFAULT_JUDGE_CONFIG,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
