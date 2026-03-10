/**
 * GeneralsOracle: plays C&C Generals Zero Hour inside a headless QEMU VM.
 * Observes via QMP screendump + Claude vision, acts via QMP mouse/keyboard.
 *
 * Unlike Emperor BFD's full AI oracle loop, this is focused on:
 * 1. Launching the game and navigating to a specific scenario
 * 2. Executing scripted actions (build order, unit movement)
 * 3. Capturing screenshots at specified moments for comparison
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { QemuController } from '../qemu/QemuController.js';
import { QEMU_CONFIG } from '../qemu/generals-config.js';
import type { FactionKey } from '../qemu/input-sequences.js';

export interface OracleConfig {
  /** Which faction to play as. */
  faction: FactionKey;
  /** Claude API key (defaults to ANTHROPIC_API_KEY env var). */
  apiKey?: string;
  /** Connect to running VM instead of booting fresh. */
  connectExisting?: boolean;
  /** Load this snapshot on boot. */
  snapshotName?: string;
  /** Skip menu navigation (snapshot is already in-game). */
  skipNavigation?: boolean;
}

/** Detected screen type during menu navigation. */
interface ScreenDetection {
  screen:
    | 'video'
    | 'main_menu'
    | 'skirmish_setup'
    | 'loading'
    | 'gameplay'
    | 'generals_selection'
    | 'dialog'
    | 'unknown';
  clickTarget?: { x: number; y: number };
  keyPress?: string[];
  waitMs?: number;
  description?: string;
}

/**
 * A scripted action to execute in the original game via mouse/keyboard.
 * These map 1:1 to harness commands on the browser port side.
 */
export interface ScriptedAction {
  type: 'click' | 'rightClick' | 'key' | 'dragSelect' | 'wait' | 'screenshot';
  /** Screen coordinates for click/drag. */
  x?: number;
  y?: number;
  /** End coordinates for drag selection. */
  endX?: number;
  endY?: number;
  /** Key names for keyboard actions. */
  keys?: string[];
  /** Wait duration in ms. */
  ms?: number;
  /** Screenshot output label. */
  label?: string;
  comment?: string;
}

export class GeneralsOracle {
  private controller: QemuController;
  private anthropic: Anthropic;
  private faction: FactionKey;
  private connectExisting: boolean;
  private snapshotName: string | null;
  private skipNavigation: boolean;
  private fbSize: { width: number; height: number } = QEMU_CONFIG.gameResolution;
  private tmpDir: string;
  private capturedScreenshots: Map<string, Buffer> = new Map();

  constructor(config: OracleConfig) {
    this.controller = new QemuController();
    this.faction = config.faction;
    this.connectExisting = config.connectExisting ?? false;
    this.snapshotName = config.snapshotName ?? QEMU_CONFIG.snapshotName;
    this.skipNavigation = config.skipNavigation ?? false;
    this.anthropic = new Anthropic(config.apiKey ? { apiKey: config.apiKey } : undefined);
    this.tmpDir = path.join(os.tmpdir(), 'generals-oracle');
    fs.mkdirSync(this.tmpDir, { recursive: true });
  }

  /**
   * Boot/connect to the VM and navigate to gameplay.
   */
  async connect(): Promise<void> {
    if (this.connectExisting) {
      console.log('[GeneralsOracle] Connecting to existing VM...');
      await this.controller.connectToExisting();
    } else {
      console.log('[GeneralsOracle] Booting VM...');
      await this.controller.boot();
    }

    if (this.snapshotName && !this.connectExisting) {
      console.log(`[GeneralsOracle] Loading snapshot "${this.snapshotName}"...`);
      await this.controller.loadSnapshot(this.snapshotName);
      await sleep(3000);
    }

    await this.detectFramebuffer();
    console.log(`[GeneralsOracle] Framebuffer: ${this.fbSize.width}x${this.fbSize.height}`);

    if (!this.skipNavigation) {
      await this.navigateToGame();
    }

    console.log('[GeneralsOracle] Ready');
  }

  /**
   * Shut down the VM (or disconnect if using connectExisting).
   */
  async disconnect(): Promise<void> {
    if (this.connectExisting) {
      this.controller.disconnectQmp();
    } else {
      await this.controller.shutdown();
    }
  }

  /**
   * Execute a scripted scenario — a sequence of actions with optional
   * screenshot capture points. Returns all captured screenshots.
   */
  async executeScenario(actions: ScriptedAction[]): Promise<Map<string, Buffer>> {
    for (const action of actions) {
      await this.executeAction(action);
    }
    return this.capturedScreenshots;
  }

  /**
   * Capture a screenshot right now.
   */
  async screenshot(label?: string): Promise<Buffer> {
    const outPath = path.join(this.tmpDir, `${label ?? `cap-${Date.now()}`}.png`);
    const buf = await this.controller.captureScreenshot(outPath);
    if (label) {
      this.capturedScreenshots.set(label, buf);
    }
    return buf;
  }

  /**
   * Get all screenshots captured during the scenario.
   */
  getScreenshots(): Map<string, Buffer> {
    return this.capturedScreenshots;
  }

  // ── Action Execution ──────────────────────────────────────────────

  private async executeAction(action: ScriptedAction): Promise<void> {
    switch (action.type) {
      case 'click':
        if (action.x !== undefined && action.y !== undefined) {
          console.log(`[GeneralsOracle] Click (${action.x}, ${action.y})${action.comment ? ` — ${action.comment}` : ''}`);
          await this.gameClick(action.x, action.y);
          await sleep(200);
        }
        break;

      case 'rightClick':
        if (action.x !== undefined && action.y !== undefined) {
          console.log(`[GeneralsOracle] Right-click (${action.x}, ${action.y})${action.comment ? ` — ${action.comment}` : ''}`);
          await this.gameClick(action.x, action.y, 'right');
          await sleep(200);
        }
        break;

      case 'key':
        if (action.keys) {
          console.log(`[GeneralsOracle] Key: ${action.keys.join('+')}${action.comment ? ` — ${action.comment}` : ''}`);
          await this.controller.sendKey(action.keys);
          await sleep(200);
        }
        break;

      case 'dragSelect':
        if (action.x !== undefined && action.y !== undefined &&
            action.endX !== undefined && action.endY !== undefined) {
          console.log(`[GeneralsOracle] Drag (${action.x},${action.y}) → (${action.endX},${action.endY})${action.comment ? ` — ${action.comment}` : ''}`);
          await this.gameDrag(action.x, action.y, action.endX, action.endY);
          await sleep(200);
        }
        break;

      case 'wait':
        console.log(`[GeneralsOracle] Wait ${action.ms ?? 1000}ms${action.comment ? ` — ${action.comment}` : ''}`);
        await sleep(action.ms ?? 1000);
        break;

      case 'screenshot':
        console.log(`[GeneralsOracle] Screenshot: ${action.label ?? 'unnamed'}`);
        await this.screenshot(action.label);
        break;
    }
  }

  // ── Menu Navigation ───────────────────────────────────────────────

  /**
   * Navigate from current screen to in-game skirmish using Claude vision
   * to detect menus and decide clicks.
   */
  private async navigateToGame(): Promise<void> {
    const maxSteps = 30;
    console.log('[GeneralsOracle] Navigating to skirmish gameplay...');

    for (let step = 0; step < maxSteps; step++) {
      const buf = await this.captureForNav(`nav-step-${step}`);
      const detection = await this.detectScreen(buf);

      console.log(`[GeneralsOracle] Nav step ${step}: screen=${detection.screen} — ${detection.description ?? ''}`);

      if (detection.screen === 'gameplay') {
        console.log('[GeneralsOracle] Reached gameplay');
        await this.detectFramebuffer();
        return;
      }

      if (detection.clickTarget) {
        const cx = Math.max(0, Math.min(this.fbSize.width - 1, detection.clickTarget.x));
        const cy = Math.max(0, Math.min(this.fbSize.height - 1, detection.clickTarget.y));
        await this.fbClick(cx, cy);
      } else if (detection.keyPress) {
        await this.controller.sendKey(detection.keyPress);
      } else {
        console.log('[GeneralsOracle] No navigation action, pressing ESC');
        await this.controller.sendKey(['esc']);
      }

      await sleep(detection.waitMs ?? 2000);
    }

    throw new Error('Failed to reach gameplay within 30 navigation steps');
  }

  /**
   * Use Claude vision to identify the current screen and determine next action.
   */
  private async detectScreen(screenshot: Buffer): Promise<ScreenDetection> {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshot.toString('base64'),
              },
            },
            {
              type: 'text',
              text: `You are navigating C&C Generals: Zero Hour menus to start a skirmish game as ${this.faction}.

The game runs at 800x600. Identify the current screen and tell me what to click or press next.

Screens you might see:
- "video" — intro video or cutscene (press ESC to skip)
- "main_menu" — main menu with: Solo Player, Multiplayer, Replay, Options, Exit
- "skirmish_setup" — map selection, player slots, faction selection, Start Game button
- "generals_selection" — choosing a General (sub-faction)
- "loading" — loading screen with progress bar (just wait)
- "gameplay" — in-game: terrain, units, buildings, command bar at bottom, minimap bottom-left
- "dialog" — confirmation dialog or error popup (click OK/Yes)

The main menu buttons in Generals ZH are on the LEFT side of the screen, stacked vertically.
In skirmish setup, the Start Game button is at the BOTTOM CENTER.

Reply with ONLY valid JSON:
{
  "screen": "<screen type>",
  "clickTarget": {"x": <0-799>, "y": <0-599>} or null,
  "keyPress": ["<qemu key name>"] or null,
  "waitMs": <ms to wait after action>,
  "description": "<what you see>"
}

For skirmish_setup: Select faction if needed, then click Start Game.
If you see a dialog, click OK/Yes/Accept.`,
            },
          ],
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { screen: 'unknown', keyPress: ['esc'], waitMs: 2000, description: 'Could not parse response' };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        screen: parsed.screen ?? 'unknown',
        clickTarget: parsed.clickTarget ?? undefined,
        keyPress: parsed.keyPress ?? undefined,
        waitMs: parsed.waitMs ?? 2000,
        description: parsed.description ?? undefined,
      };
    } catch (e) {
      console.warn('[GeneralsOracle] Screen detection failed:', e);
      return { screen: 'unknown', keyPress: ['esc'], waitMs: 3000, description: 'Vision API error' };
    }
  }

  // ── Click/Drag Helpers ────────────────────────────────────────────

  private async gameClick(x: number, y: number, button?: 'left' | 'right' | 'middle'): Promise<void> {
    await this.controller.mouseClick(x, y, button, QEMU_CONFIG.gameResolution);
  }

  private async fbClick(x: number, y: number, button?: 'left' | 'right' | 'middle'): Promise<void> {
    await this.controller.mouseClick(x, y, button, this.fbSize);
  }

  /**
   * Drag-select: press left button at start, move to end, release.
   * Used for box-selecting units in the original game.
   */
  private async gameDrag(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    const res = QEMU_CONFIG.gameResolution;

    // Move to start position
    await this.controller.mouseMove(x1, y1, res);
    await sleep(50);

    // Press left button
    await this.controller.mouseDown('left');
    await sleep(50);

    // Move to end position (drag)
    await this.controller.mouseMove(x2, y2, res);
    await sleep(100);

    // Release
    await this.controller.mouseUp();
  }

  private async detectFramebuffer(): Promise<void> {
    try {
      this.fbSize = await this.controller.getFramebufferSize();
    } catch (e) {
      console.warn('[GeneralsOracle] Could not detect framebuffer, using default:', e);
      this.fbSize = QEMU_CONFIG.gameResolution;
    }
  }

  private async captureForNav(label: string): Promise<Buffer> {
    const p = path.join(this.tmpDir, `${label}.png`);
    return this.controller.captureScreenshot(p);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
