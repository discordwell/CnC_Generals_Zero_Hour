/**
 * ScenarioRunner: runs the same scenario in both the original C&C Generals
 * (via QEMU) and the browser port (via control harness), captures screenshots,
 * and compares them using the LLM judge.
 *
 * Scenarios are defined as JSON with two parallel action lists:
 * - originalActions: mouse/keyboard steps for the QEMU VM
 * - portActions: harness commands for the browser port
 * - capturePoints: labeled moments to capture screenshots in both
 */

import fs from 'node:fs';
import path from 'node:path';
import { GeneralsOracle, type ScriptedAction } from '../oracle/GeneralsOracle.js';
import { LlmJudge, type JudgeConfig, type JudgeResult } from './LlmJudge.js';
import { QEMU_CONFIG } from '../qemu/generals-config.js';
import type { FactionKey } from '../qemu/input-sequences.js';

export interface Scenario {
  id: string;
  name: string;
  description: string;
  faction: FactionKey;
  /** Actions to execute in the original game via QEMU. */
  originalActions: ScriptedAction[];
  /**
   * Harness commands to execute in the browser port.
   * These are stringified JS expressions evaluated against window.__harness.
   * e.g. "h.selectByTemplate('AmericaTank'); h.move(200, 200)"
   */
  portCommands: string[];
  /** What aspects to judge. */
  judgeConfig: JudgeConfig;
}

export interface ComparisonResult {
  scenario: Scenario;
  originalScreenshots: Map<string, Buffer>;
  portScreenshots: Map<string, Buffer>;
  judgeResult: JudgeResult | null;
  error?: string;
}

export class ScenarioRunner {
  private judge: LlmJudge;
  private outputDir: string;

  constructor(apiKey?: string) {
    this.judge = new LlmJudge(apiKey);
    this.outputDir = QEMU_CONFIG.screenshotDir;
  }

  /**
   * Run a scenario in the original game only.
   * Returns captured screenshots from the QEMU VM.
   */
  async runOriginal(scenario: Scenario): Promise<Map<string, Buffer>> {
    const oracle = new GeneralsOracle({
      faction: scenario.faction,
      connectExisting: true, // assume VM is already running
    });

    try {
      await oracle.connect();
      await oracle.executeScenario(scenario.originalActions);
      const screenshots = oracle.getScreenshots();
      this.saveScreenshots(scenario.id, 'original', screenshots);
      return screenshots;
    } finally {
      await oracle.disconnect();
    }
  }

  /**
   * Run a full comparison: execute scenario in both games, capture, judge.
   * The browser port side is captured externally (passed in as buffers).
   */
  async compare(
    scenario: Scenario,
    portScreenshots: Map<string, Buffer>,
  ): Promise<ComparisonResult> {
    let originalScreenshots: Map<string, Buffer>;
    let judgeResult: JudgeResult | null = null;

    try {
      originalScreenshots = await this.runOriginal(scenario);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`[ScenarioRunner] Original game failed: ${errMsg}`);
      return {
        scenario,
        originalScreenshots: new Map(),
        portScreenshots,
        judgeResult: null,
        error: `Original game error: ${errMsg}`,
      };
    }

    // Save port screenshots
    this.saveScreenshots(scenario.id, 'port', portScreenshots);

    // Run the LLM judge if we have screenshots from both sides
    if (originalScreenshots.size > 0 && portScreenshots.size > 0) {
      try {
        // Match screenshots by label, then compare matching pairs
        const matchedOriginal: Buffer[] = [];
        const matchedPort: Buffer[] = [];

        for (const [label, origBuf] of originalScreenshots) {
          const portBuf = portScreenshots.get(label);
          if (portBuf) {
            matchedOriginal.push(origBuf);
            matchedPort.push(portBuf);
          }
        }

        if (matchedOriginal.length > 0) {
          judgeResult = await this.judge.compare(
            matchedOriginal,
            matchedPort,
            scenario.name,
            scenario.description,
            scenario.judgeConfig,
          );
        } else {
          // No matching labels — compare all screenshots together
          judgeResult = await this.judge.compare(
            [...originalScreenshots.values()],
            [...portScreenshots.values()],
            scenario.name,
            scenario.description,
            scenario.judgeConfig,
          );
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[ScenarioRunner] Judge failed: ${errMsg}`);
      }
    }

    return {
      scenario,
      originalScreenshots,
      portScreenshots,
      judgeResult,
    };
  }

  /**
   * Judge port screenshots without the original game.
   * Useful when the VM isn't available.
   */
  async judgePortOnly(
    scenario: Scenario,
    portScreenshots: Map<string, Buffer>,
  ): Promise<JudgeResult> {
    this.saveScreenshots(scenario.id, 'port', portScreenshots);
    return this.judge.judgeRemakeOnly(
      [...portScreenshots.values()],
      scenario.name,
      scenario.description,
      scenario.judgeConfig,
    );
  }

  private saveScreenshots(scenarioId: string, side: string, screenshots: Map<string, Buffer>): void {
    const dir = path.join(this.outputDir, scenarioId, side);
    fs.mkdirSync(dir, { recursive: true });
    for (const [label, buf] of screenshots) {
      const outPath = path.join(dir, `${label}.png`);
      fs.writeFileSync(outPath, buf);
      console.log(`[ScenarioRunner] Saved ${side}/${label}.png`);
    }
  }
}

/**
 * Predefined comparison aspects for C&C Generals.
 */
export const GENERALS_JUDGE_ASPECTS = [
  'terrain rendering',
  'building placement and scale',
  'unit rendering and positioning',
  'UI layout (command bar, minimap)',
  'color palette and lighting',
  'fog of war',
  'resource display',
];

/**
 * Default judge config for general parity testing.
 */
export const DEFAULT_JUDGE_CONFIG: JudgeConfig = {
  aspects: GENERALS_JUDGE_ASPECTS,
  minimumScore: 5,
};

/**
 * Create a basic skirmish scenario definition.
 */
export function createSkirmishScenario(opts: {
  id: string;
  name: string;
  description: string;
  faction: FactionKey;
  originalActions: ScriptedAction[];
  portCommands: string[];
}): Scenario {
  return {
    ...opts,
    judgeConfig: DEFAULT_JUDGE_CONFIG,
  };
}
