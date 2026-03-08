/**
 * Skirmish Setup Screen -- Multi-player slot configuration for skirmish games.
 *
 * Source parity:
 *   GeneralsMD/Code/GameEngine/Source/GameClient/GUI/GUICallbacks/Menus/SkirmishGameOptionsMenu.cpp
 *
 * The original engine uses MAX_SLOTS (8) player slots, each with combo boxes
 * for player type, faction (PlayerTemplate), color, team, and start position.
 * Slot 0 is always the local human player. This module replicates that layout
 * as a standalone DOM-based screen that can be mounted by the game shell.
 */

// ──── Types ─────────────────────────────────────────────────────────────────

export type PlayerSlotType = 'human' | 'easy' | 'medium' | 'hard' | 'closed';
export type PlayerFaction = 'USA' | 'China' | 'GLA' | 'Random';

export interface SkirmishPlayerConfig {
  type: PlayerSlotType;
  faction: PlayerFaction;
  team: number;           // 0=none, 1-4
  color: number;          // index 0-7
  startPosition: number;  // 0=auto, 1-8
}

export interface SkirmishSettings {
  mapPath: string;
  players: SkirmishPlayerConfig[];
}

export interface SkirmishSetupCallbacks {
  onStart(settings: SkirmishSettings): void;
  onBack(): void;
}

// ──── Constants ─────────────────────────────────────────────────────────────

const MAX_SLOTS = 8;

const PLAYER_TYPE_OPTIONS: { value: PlayerSlotType; label: string }[] = [
  { value: 'human', label: 'Human' },
  { value: 'easy', label: 'Easy AI' },
  { value: 'medium', label: 'Medium AI' },
  { value: 'hard', label: 'Hard AI' },
  { value: 'closed', label: 'Closed' },
];

const FACTION_OPTIONS: { value: PlayerFaction; label: string }[] = [
  { value: 'USA', label: 'USA' },
  { value: 'China', label: 'China' },
  { value: 'GLA', label: 'GLA' },
  { value: 'Random', label: 'Random' },
];

export const PLAYER_COLORS: { name: string; hex: string }[] = [
  { name: 'Blue', hex: '#3366cc' },
  { name: 'Red', hex: '#cc3333' },
  { name: 'Green', hex: '#33aa33' },
  { name: 'Orange', hex: '#cc8833' },
  { name: 'Purple', hex: '#8833aa' },
  { name: 'Cyan', hex: '#33aaaa' },
  { name: 'Pink', hex: '#cc66aa' },
  { name: 'Yellow', hex: '#cccc33' },
];

/** Official skirmish maps from the retail game. */
export const OFFICIAL_SKIRMISH_MAPS: { name: string; path: string }[] = [
  { name: 'Alpine Assault', path: 'maps/Alpine Assault.json' },
  { name: 'Baikonur Cosmodrome', path: 'maps/Baikonur Cosmodrome.json' },
  { name: 'Bitter Winter', path: 'maps/Bitter Winter.json' },
  { name: 'Bombardment Beach', path: 'maps/Bombardment Beach.json' },
  { name: 'Cairo Commandos', path: 'maps/Cairo Commandos.json' },
  { name: 'Desert Fury', path: 'maps/Desert Fury.json' },
  { name: 'Dust Devil', path: 'maps/Dust Devil.json' },
  { name: 'Eastern Everglades', path: 'maps/Eastern Everglades.json' },
  { name: 'El Scorcho', path: 'maps/El Scorcho.json' },
  { name: 'Fallen Empire', path: 'maps/Fallen Empire.json' },
  { name: 'Flash Fire', path: 'maps/Flash Fire.json' },
  { name: 'Fortress Avalanche', path: 'maps/Fortress Avalanche.json' },
  { name: 'Golden Oasis', path: 'maps/Golden Oasis.json' },
  { name: 'Homeland Alliance', path: 'maps/Homeland Alliance.json' },
  { name: 'Lone Eagle', path: 'maps/Lone Eagle.json' },
  { name: 'Mountain Fox', path: 'maps/Mountain Fox.json' },
  { name: 'Rocky Rampage', path: 'maps/Rocky Rampage.json' },
  { name: 'Rogue Agent', path: 'maps/Rogue Agent.json' },
  { name: 'Sand Serpent', path: 'maps/Sand Serpent.json' },
  { name: 'Tournament Desert', path: 'maps/Tournament Desert.json' },
  { name: 'Tournament Island', path: 'maps/Tournament Island.json' },
  { name: 'Tournament Lake', path: 'maps/Tournament Lake.json' },
  { name: 'Twilight Flame', path: 'maps/Twilight Flame.json' },
  { name: 'Winter Wolf', path: 'maps/Winter Wolf.json' },
];

// ──── Styles ────────────────────────────────────────────────────────────────

const SKIRMISH_STYLES = `
  .skirmish-overlay {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1a1a2e;
    z-index: 900;
    font-family: 'Segoe UI', Arial, sans-serif;
    color: #e0d8c0;
  }
  .skirmish-panel {
    background: rgba(12, 16, 28, 0.92);
    border: 1px solid rgba(201, 168, 76, 0.3);
    padding: 28px 36px;
    min-width: 720px;
    max-width: 900px;
    max-height: 90vh;
    overflow-y: auto;
  }
  .skirmish-title {
    font-size: 1.5rem;
    color: #c9a84c;
    text-transform: uppercase;
    letter-spacing: 0.25em;
    margin-bottom: 24px;
    text-align: center;
  }
  .skirmish-section-label {
    font-size: 0.75rem;
    color: #8a8070;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    margin-bottom: 8px;
    margin-top: 16px;
    border-bottom: 1px solid rgba(201, 168, 76, 0.15);
    padding-bottom: 4px;
  }
  .skirmish-map-select {
    width: 100%;
    padding: 8px 12px;
    background: #0c101c;
    border: 1px solid rgba(201, 168, 76, 0.3);
    color: #e0d8c0;
    font-size: 0.9rem;
    font-family: inherit;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }
  .skirmish-map-select:focus {
    outline: none;
    border-color: rgba(201, 168, 76, 0.6);
  }

  /* Player slot grid */
  .skirmish-slots-header {
    display: grid;
    grid-template-columns: 36px 1fr 90px 70px 80px 70px;
    gap: 6px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(201, 168, 76, 0.15);
  }
  .skirmish-slots-header span {
    font-size: 0.65rem;
    color: #6a6258;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .skirmish-slot-row {
    display: grid;
    grid-template-columns: 36px 1fr 90px 70px 80px 70px;
    gap: 6px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(201, 168, 76, 0.06);
    align-items: center;
  }
  .skirmish-slot-row.closed {
    opacity: 0.35;
  }
  .skirmish-slot-index {
    font-size: 0.85rem;
    color: #6a6258;
    text-align: center;
    font-weight: 600;
  }
  .skirmish-slot-select {
    padding: 5px 6px;
    background: #0c101c;
    border: 1px solid rgba(201, 168, 76, 0.2);
    color: #e0d8c0;
    font-size: 0.8rem;
    font-family: inherit;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }
  .skirmish-slot-select:focus {
    outline: none;
    border-color: rgba(201, 168, 76, 0.5);
  }
  .skirmish-slot-select:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .skirmish-color-swatch {
    display: inline-block;
    width: 10px; height: 10px;
    border-radius: 2px;
    margin-right: 4px;
    vertical-align: middle;
  }

  /* Actions bar */
  .skirmish-actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
    justify-content: flex-end;
  }
  .skirmish-btn {
    padding: 10px 28px;
    border: 1px solid rgba(201, 168, 76, 0.4);
    background: rgba(201, 168, 76, 0.08);
    color: #c9a84c;
    font-size: 0.95rem;
    font-family: inherit;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
  }
  .skirmish-btn:hover {
    background: rgba(201, 168, 76, 0.18);
    border-color: rgba(201, 168, 76, 0.7);
  }
  .skirmish-btn.primary {
    background: rgba(201, 168, 76, 0.2);
    border-color: #c9a84c;
  }
  .skirmish-btn.primary:hover {
    background: rgba(201, 168, 76, 0.35);
  }
  .skirmish-btn:disabled {
    opacity: 0.35;
    cursor: default;
    pointer-events: none;
  }
`;

// ──── Helpers ───────────────────────────────────────────────────────────────

function buildOptions<T extends string | number>(
  items: { value: T; label: string }[],
  selected: T,
): string {
  return items
    .map(it => `<option value="${it.value}"${it.value === selected ? ' selected' : ''}>${it.label}</option>`)
    .join('');
}

function buildColorOptions(selectedIndex: number): string {
  return PLAYER_COLORS
    .map((c, i) =>
      `<option value="${i}"${i === selectedIndex ? ' selected' : ''}>${c.name}</option>`,
    )
    .join('');
}

function buildTeamOptions(selected: number): string {
  let html = `<option value="0"${selected === 0 ? ' selected' : ''}>None</option>`;
  for (let t = 1; t <= 4; t++) {
    html += `<option value="${t}"${t === selected ? ' selected' : ''}>Team ${t}</option>`;
  }
  return html;
}

function buildStartPosOptions(selected: number): string {
  let html = `<option value="0"${selected === 0 ? ' selected' : ''}>Auto</option>`;
  for (let p = 1; p <= 8; p++) {
    html += `<option value="${p}"${p === selected ? ' selected' : ''}>Pos ${p}</option>`;
  }
  return html;
}

// ──── Screen class ──────────────────────────────────────────────────────────

export class SkirmishSetupScreen {
  private root: HTMLElement;
  private callbacks: SkirmishSetupCallbacks;
  private overlayEl: HTMLElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private startBtn: HTMLButtonElement | null = null;

  private maps: { name: string; path: string }[];
  private selectedMapIndex = 0;
  private slots: SkirmishPlayerConfig[] = [];

  constructor(
    root: HTMLElement,
    callbacks: SkirmishSetupCallbacks,
    maps?: { name: string; path: string }[],
  ) {
    this.root = root;
    this.callbacks = callbacks;
    this.maps = maps && maps.length > 0 ? maps : OFFICIAL_SKIRMISH_MAPS;
    this.initDefaultSlots();
  }

  /** Initialize slots to the default skirmish configuration. */
  private initDefaultSlots(): void {
    this.slots = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      let type: PlayerSlotType;
      if (i === 0) type = 'human';
      else if (i === 1) type = 'medium';
      else type = 'closed';

      this.slots.push({
        type,
        faction: 'USA',
        team: 0,
        color: i,
        startPosition: 0,
      });
    }
  }

  /** Show the skirmish setup screen. */
  show(): void {
    if (this.overlayEl) return;

    if (!this.styleEl) {
      this.styleEl = document.createElement('style');
      this.styleEl.textContent = SKIRMISH_STYLES;
      document.head.appendChild(this.styleEl);
    }

    const el = document.createElement('div');
    el.className = 'skirmish-overlay';
    el.innerHTML = this.buildHtml();

    this.wireEvents(el);
    this.root.appendChild(el);
    this.overlayEl = el;

    this.startBtn = el.querySelector('[data-action="start"]') as HTMLButtonElement | null;
    this.updateStartButton();
  }

  /** Remove all DOM elements created by this screen. */
  dispose(): void {
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
    this.startBtn = null;
  }

  /** Check if the screen is currently visible. */
  get isVisible(): boolean {
    return this.overlayEl !== null;
  }

  /**
   * Return the current skirmish configuration.
   * Only includes non-closed player slots.
   */
  getSettings(): SkirmishSettings {
    return {
      mapPath: this.maps[this.selectedMapIndex]?.path ?? this.maps[0]!.path,
      players: this.slots.filter(s => s.type !== 'closed'),
    };
  }

  /** Get the raw slot configuration (including closed slots). */
  getSlots(): readonly SkirmishPlayerConfig[] {
    return this.slots;
  }

  // ──── Private: HTML generation ──────────────────────────────────────────

  private buildHtml(): string {
    const mapOptions = this.maps
      .map((m, i) => `<option value="${i}"${i === this.selectedMapIndex ? ' selected' : ''}>${m.name}</option>`)
      .join('');

    let slotsHtml = `
      <div class="skirmish-slots-header">
        <span>#</span>
        <span>Player</span>
        <span>Faction</span>
        <span>Team</span>
        <span>Color</span>
        <span>Start</span>
      </div>
    `;

    for (let i = 0; i < MAX_SLOTS; i++) {
      const slot = this.slots[i]!;
      const isClosed = slot.type === 'closed';
      const disabledAttr = isClosed ? ' disabled' : '';

      slotsHtml += `
        <div class="skirmish-slot-row${isClosed ? ' closed' : ''}" data-slot="${i}">
          <span class="skirmish-slot-index">${i + 1}</span>
          <select class="skirmish-slot-select" data-field="type" data-slot="${i}">
            ${buildOptions(PLAYER_TYPE_OPTIONS, slot.type)}
          </select>
          <select class="skirmish-slot-select" data-field="faction" data-slot="${i}"${disabledAttr}>
            ${buildOptions(FACTION_OPTIONS, slot.faction)}
          </select>
          <select class="skirmish-slot-select" data-field="team" data-slot="${i}"${disabledAttr}>
            ${buildTeamOptions(slot.team)}
          </select>
          <select class="skirmish-slot-select" data-field="color" data-slot="${i}"${disabledAttr}>
            ${buildColorOptions(slot.color)}
          </select>
          <select class="skirmish-slot-select" data-field="startPosition" data-slot="${i}"${disabledAttr}>
            ${buildStartPosOptions(slot.startPosition)}
          </select>
        </div>
      `;
    }

    return `
      <div class="skirmish-panel">
        <div class="skirmish-title">Skirmish Setup</div>

        <div class="skirmish-section-label">Map</div>
        <select class="skirmish-map-select" data-ref="map-select">
          ${mapOptions}
        </select>

        <div class="skirmish-section-label">Players</div>
        ${slotsHtml}

        <div class="skirmish-actions">
          <button class="skirmish-btn" data-action="back">Back</button>
          <button class="skirmish-btn primary" data-action="start">Start Game</button>
        </div>
      </div>
    `;
  }

  // ──── Private: event wiring ─────────────────────────────────────────────

  private wireEvents(el: HTMLElement): void {
    // Map selector
    const mapSelect = el.querySelector('[data-ref="map-select"]') as HTMLSelectElement | null;
    if (mapSelect) {
      mapSelect.addEventListener('change', () => {
        this.selectedMapIndex = Number(mapSelect.value);
      });
    }

    // Slot change events (delegated)
    el.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      const field = target.dataset.field;
      const slotIndex = target.dataset.slot;
      if (field === undefined || slotIndex === undefined) return;

      const idx = Number(slotIndex);
      const slot = this.slots[idx];
      if (!slot) return;

      switch (field) {
        case 'type':
          slot.type = target.value as PlayerSlotType;
          this.updateSlotRow(el, idx);
          this.updateStartButton();
          break;
        case 'faction':
          slot.faction = target.value as PlayerFaction;
          break;
        case 'team':
          slot.team = Number(target.value);
          break;
        case 'color':
          slot.color = Number(target.value);
          break;
        case 'startPosition':
          slot.startPosition = Number(target.value);
          break;
      }
    });

    // Action buttons
    el.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      if (target.dataset.action === 'back') {
        this.callbacks.onBack();
      } else if (target.dataset.action === 'start') {
        this.callbacks.onStart(this.getSettings());
      }
    });
  }

  // ──── Private: UI updates ───────────────────────────────────────────────

  /** Update a slot row's disabled state when player type changes. */
  private updateSlotRow(container: HTMLElement, slotIndex: number): void {
    const row = container.querySelector(`.skirmish-slot-row[data-slot="${slotIndex}"]`);
    if (!row) return;

    const slot = this.slots[slotIndex]!;
    const isClosed = slot.type === 'closed';
    row.classList.toggle('closed', isClosed);

    // Enable/disable non-type selects
    const selects = row.querySelectorAll<HTMLSelectElement>('.skirmish-slot-select');
    for (const sel of selects) {
      if (sel.dataset.field !== 'type') {
        sel.disabled = isClosed;
      }
    }
  }

  /** Enable Start button only when at least 2 non-closed players exist (1 human + 1 other). */
  private updateStartButton(): void {
    if (!this.startBtn) return;
    const activePlayers = this.slots.filter(s => s.type !== 'closed');
    const hasHuman = activePlayers.some(s => s.type === 'human');
    const hasOpponent = activePlayers.length >= 2;
    this.startBtn.disabled = !(hasHuman && hasOpponent);
  }
}
