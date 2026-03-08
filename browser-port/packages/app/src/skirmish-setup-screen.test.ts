// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SkirmishSetupScreen,
  OFFICIAL_SKIRMISH_MAPS,
  PLAYER_COLORS,
  type SkirmishSetupCallbacks,
  type SkirmishSettings,
} from './skirmish-setup-screen.js';

/**
 * Tests for SkirmishSetupScreen.
 *
 * Source parity:
 *   GeneralsMD/Code/GameEngine/Source/GameClient/GUI/GUICallbacks/Menus/SkirmishGameOptionsMenu.cpp
 *
 * The original engine uses 8 player slots (MAX_SLOTS) with combo boxes for
 * player type, faction, color, team, and start position. Slot 0 is the local
 * human player.
 */

// Helper to trigger a native 'change' event on a <select> element.
function changeSelect(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('SkirmishSetupScreen', () => {
  let root: HTMLDivElement;
  let callbacks: SkirmishSetupCallbacks;
  let onStartSpy: ReturnType<typeof vi.fn>;
  let onBackSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    onStartSpy = vi.fn();
    onBackSpy = vi.fn();
    callbacks = { onStart: onStartSpy, onBack: onBackSpy };
  });

  afterEach(() => {
    root.remove();
    // Clean up any style tags injected into <head>
    document.querySelectorAll('style').forEach(s => s.remove());
  });

  function createScreen(maps?: { name: string; path: string }[]): SkirmishSetupScreen {
    const screen = new SkirmishSetupScreen(root, callbacks, maps);
    screen.show();
    return screen;
  }

  // ──── Slot creation ─────────────────────────────────────────────────────

  it('creates exactly 8 player slot rows', () => {
    const screen = createScreen();
    const rows = root.querySelectorAll('.skirmish-slot-row');
    expect(rows.length).toBe(8);
    screen.dispose();
  });

  it('renders slot index numbers 1 through 8', () => {
    const screen = createScreen();
    const indices = root.querySelectorAll('.skirmish-slot-index');
    expect(indices.length).toBe(8);
    for (let i = 0; i < 8; i++) {
      expect(indices[i]!.textContent).toBe(String(i + 1));
    }
    screen.dispose();
  });

  // ──── Default state ─────────────────────────────────────────────────────

  it('defaults slot 0 to human, slot 1 to medium AI, rest closed', () => {
    const screen = createScreen();
    const slots = screen.getSlots();

    expect(slots[0]!.type).toBe('human');
    expect(slots[1]!.type).toBe('medium');
    for (let i = 2; i < 8; i++) {
      expect(slots[i]!.type).toBe('closed');
    }
    screen.dispose();
  });

  it('assigns unique default colors to each slot', () => {
    const screen = createScreen();
    const slots = screen.getSlots();
    const colors = slots.map(s => s.color);
    const unique = new Set(colors);
    expect(unique.size).toBe(8);
    screen.dispose();
  });

  it('defaults all slots to USA faction, no team, auto start position', () => {
    const screen = createScreen();
    const slots = screen.getSlots();
    for (const slot of slots) {
      expect(slot.faction).toBe('USA');
      expect(slot.team).toBe(0);
      expect(slot.startPosition).toBe(0);
    }
    screen.dispose();
  });

  // ──── Start button validation ───────────────────────────────────────────

  it('enables start button with default config (1 human + 1 AI)', () => {
    const screen = createScreen();
    const btn = root.querySelector('[data-action="start"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    screen.dispose();
  });

  it('disables start button when only 1 player is active', () => {
    const screen = createScreen();

    // Close slot 1 (the only AI), leaving only the human
    const typeSelects = root.querySelectorAll<HTMLSelectElement>(
      'select[data-field="type"]',
    );
    changeSelect(typeSelects[1]!, 'closed');

    const btn = root.querySelector('[data-action="start"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    screen.dispose();
  });

  it('enables start button when a second player is reopened', () => {
    const screen = createScreen();
    const typeSelects = root.querySelectorAll<HTMLSelectElement>(
      'select[data-field="type"]',
    );

    // Close slot 1
    changeSelect(typeSelects[1]!, 'closed');
    const btn = root.querySelector('[data-action="start"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    // Open slot 2 as easy AI
    changeSelect(typeSelects[2]!, 'easy');
    expect(btn.disabled).toBe(false);
    screen.dispose();
  });

  it('disables start button when no human player exists', () => {
    const screen = createScreen();
    const typeSelects = root.querySelectorAll<HTMLSelectElement>(
      'select[data-field="type"]',
    );

    // Change slot 0 from human to AI
    changeSelect(typeSelects[0]!, 'easy');
    // Slot 1 is still medium AI, so 2 players but no human
    const btn = root.querySelector('[data-action="start"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    screen.dispose();
  });

  // ──── getSettings ───────────────────────────────────────────────────────

  it('returns correct default settings', () => {
    const screen = createScreen();
    const settings = screen.getSettings();

    expect(settings.mapPath).toBe(OFFICIAL_SKIRMISH_MAPS[0]!.path);
    // Only non-closed players are included
    expect(settings.players.length).toBe(2);
    expect(settings.players[0]!.type).toBe('human');
    expect(settings.players[0]!.faction).toBe('USA');
    expect(settings.players[1]!.type).toBe('medium');
    screen.dispose();
  });

  it('reflects map selection change in getSettings', () => {
    const screen = createScreen();
    const mapSelect = root.querySelector('[data-ref="map-select"]') as HTMLSelectElement;

    changeSelect(mapSelect, '5');
    const settings = screen.getSettings();
    expect(settings.mapPath).toBe(OFFICIAL_SKIRMISH_MAPS[5]!.path);
    screen.dispose();
  });

  it('reflects faction change in getSettings', () => {
    const screen = createScreen();
    const factionSelects = root.querySelectorAll<HTMLSelectElement>(
      'select[data-field="faction"]',
    );
    changeSelect(factionSelects[0]!, 'GLA');

    const settings = screen.getSettings();
    expect(settings.players[0]!.faction).toBe('GLA');
    screen.dispose();
  });

  it('reflects team change in getSettings', () => {
    const screen = createScreen();
    const teamSelects = root.querySelectorAll<HTMLSelectElement>(
      'select[data-field="team"]',
    );
    changeSelect(teamSelects[0]!, '2');

    const settings = screen.getSettings();
    expect(settings.players[0]!.team).toBe(2);
    screen.dispose();
  });

  it('reflects color change in getSettings', () => {
    const screen = createScreen();
    const colorSelects = root.querySelectorAll<HTMLSelectElement>(
      'select[data-field="color"]',
    );
    changeSelect(colorSelects[0]!, '3');

    const settings = screen.getSettings();
    expect(settings.players[0]!.color).toBe(3);
    screen.dispose();
  });

  it('reflects start position change in getSettings', () => {
    const screen = createScreen();
    const posSelects = root.querySelectorAll<HTMLSelectElement>(
      'select[data-field="startPosition"]',
    );
    changeSelect(posSelects[0]!, '4');

    const settings = screen.getSettings();
    expect(settings.players[0]!.startPosition).toBe(4);
    screen.dispose();
  });

  it('excludes closed slots from getSettings players', () => {
    const screen = createScreen();
    const typeSelects = root.querySelectorAll<HTMLSelectElement>(
      'select[data-field="type"]',
    );

    // Open slots 2 and 3
    changeSelect(typeSelects[2]!, 'hard');
    changeSelect(typeSelects[3]!, 'easy');

    const settings = screen.getSettings();
    // Slots 0 (human), 1 (medium), 2 (hard), 3 (easy) are active; 4-7 closed
    expect(settings.players.length).toBe(4);
    expect(settings.players.map(p => p.type)).toEqual(['human', 'medium', 'hard', 'easy']);
    screen.dispose();
  });

  // ──── Back button ───────────────────────────────────────────────────────

  it('calls onBack when back button is clicked', () => {
    const screen = createScreen();
    const backBtn = root.querySelector('[data-action="back"]') as HTMLButtonElement;
    backBtn.click();
    expect(onBackSpy).toHaveBeenCalledTimes(1);
    screen.dispose();
  });

  // ──── Start button ──────────────────────────────────────────────────────

  it('calls onStart with settings when start button is clicked', () => {
    const screen = createScreen();
    const startBtn = root.querySelector('[data-action="start"]') as HTMLButtonElement;
    startBtn.click();

    expect(onStartSpy).toHaveBeenCalledTimes(1);
    const settings = onStartSpy.mock.calls[0]![0] as SkirmishSettings;
    expect(settings.mapPath).toBe(OFFICIAL_SKIRMISH_MAPS[0]!.path);
    expect(settings.players.length).toBe(2);
    screen.dispose();
  });

  // ──── Player type change updates slot UI ────────────────────────────────

  it('adds closed class when slot type changes to closed', () => {
    const screen = createScreen();
    const typeSelects = root.querySelectorAll<HTMLSelectElement>(
      'select[data-field="type"]',
    );

    // Slot 1 starts as medium AI (not closed)
    const row1 = root.querySelector('.skirmish-slot-row[data-slot="1"]')!;
    expect(row1.classList.contains('closed')).toBe(false);

    changeSelect(typeSelects[1]!, 'closed');
    expect(row1.classList.contains('closed')).toBe(true);
    screen.dispose();
  });

  it('removes closed class when slot type changes from closed', () => {
    const screen = createScreen();
    const typeSelects = root.querySelectorAll<HTMLSelectElement>(
      'select[data-field="type"]',
    );

    // Slot 2 starts as closed
    const row2 = root.querySelector('.skirmish-slot-row[data-slot="2"]')!;
    expect(row2.classList.contains('closed')).toBe(true);

    changeSelect(typeSelects[2]!, 'easy');
    expect(row2.classList.contains('closed')).toBe(false);
    screen.dispose();
  });

  it('disables non-type selects for closed slots', () => {
    const screen = createScreen();

    // Slot 2 is closed by default -- its faction/team/color/pos selects should be disabled
    const row2Selects = root.querySelectorAll<HTMLSelectElement>(
      '.skirmish-slot-row[data-slot="2"] select',
    );
    for (const sel of row2Selects) {
      if (sel.dataset.field === 'type') {
        expect(sel.disabled).toBe(false);
      } else {
        expect(sel.disabled).toBe(true);
      }
    }
    screen.dispose();
  });

  it('enables non-type selects when slot is reopened', () => {
    const screen = createScreen();
    const typeSelects = root.querySelectorAll<HTMLSelectElement>(
      'select[data-field="type"]',
    );

    changeSelect(typeSelects[2]!, 'hard');

    const row2Selects = root.querySelectorAll<HTMLSelectElement>(
      '.skirmish-slot-row[data-slot="2"] select',
    );
    for (const sel of row2Selects) {
      expect(sel.disabled).toBe(false);
    }
    screen.dispose();
  });

  // ──── Dispose ───────────────────────────────────────────────────────────

  it('removes all DOM elements on dispose', () => {
    const screen = createScreen();

    // Overlay and style should exist
    expect(root.querySelector('.skirmish-overlay')).not.toBeNull();
    expect(document.querySelector('style')).not.toBeNull();

    screen.dispose();

    expect(root.querySelector('.skirmish-overlay')).toBeNull();
    // Style tag should also be removed
    expect(document.head.querySelector('style')).toBeNull();
  });

  it('is no longer visible after dispose', () => {
    const screen = createScreen();
    expect(screen.isVisible).toBe(true);
    screen.dispose();
    expect(screen.isVisible).toBe(false);
  });

  it('can be shown again after dispose', () => {
    const screen = createScreen();
    screen.dispose();
    screen.show();
    expect(screen.isVisible).toBe(true);
    expect(root.querySelector('.skirmish-overlay')).not.toBeNull();
    screen.dispose();
  });

  // ──── Custom maps ───────────────────────────────────────────────────────

  it('uses provided custom maps list', () => {
    const customMaps = [
      { name: 'Test Map A', path: 'maps/test_a.json' },
      { name: 'Test Map B', path: 'maps/test_b.json' },
    ];
    const screen = createScreen(customMaps);

    const mapSelect = root.querySelector('[data-ref="map-select"]') as HTMLSelectElement;
    expect(mapSelect.options.length).toBe(2);
    expect(mapSelect.options[0]!.text).toBe('Test Map A');
    expect(mapSelect.options[1]!.text).toBe('Test Map B');

    const settings = screen.getSettings();
    expect(settings.mapPath).toBe('maps/test_a.json');
    screen.dispose();
  });

  it('falls back to official maps when empty array provided', () => {
    const screen = createScreen([]);
    const mapSelect = root.querySelector('[data-ref="map-select"]') as HTMLSelectElement;
    expect(mapSelect.options.length).toBe(OFFICIAL_SKIRMISH_MAPS.length);
    screen.dispose();
  });

  // ──── Map dropdown shows official maps ──────────────────────────────────

  it('renders official maps in the dropdown by default', () => {
    const screen = createScreen();
    const mapSelect = root.querySelector('[data-ref="map-select"]') as HTMLSelectElement;
    expect(mapSelect.options.length).toBe(OFFICIAL_SKIRMISH_MAPS.length);

    // Verify a few known maps
    const names = Array.from(mapSelect.options).map(o => o.text);
    expect(names).toContain('Tournament Desert');
    expect(names).toContain('Dust Devil');
    expect(names).toContain('Flash Fire');
    expect(names).toContain('Golden Oasis');
    expect(names).toContain('Lone Eagle');
    screen.dispose();
  });

  // ──── Double show is idempotent ─────────────────────────────────────────

  it('does not create duplicate overlays on double show', () => {
    const screen = new SkirmishSetupScreen(root, callbacks);
    screen.show();
    screen.show(); // second call should be no-op
    const overlays = root.querySelectorAll('.skirmish-overlay');
    expect(overlays.length).toBe(1);
    screen.dispose();
  });

  // ──── Color constants ───────────────────────────────────────────────────

  it('exports 8 player colors', () => {
    expect(PLAYER_COLORS.length).toBe(8);
    for (const c of PLAYER_COLORS) {
      expect(c.name).toBeTruthy();
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
