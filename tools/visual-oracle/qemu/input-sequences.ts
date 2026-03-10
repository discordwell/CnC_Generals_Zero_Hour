/**
 * Reusable keyboard/click/wait sequences for navigating C&C Generals Zero Hour.
 * Coordinates assume 800x600 game resolution.
 */

export interface InputStep {
  action: 'key' | 'wait' | 'click';
  keys?: string[];
  ms?: number;
  /** Screen coordinates for click actions. */
  x?: number;
  y?: number;
  button?: 'left' | 'right';
  comment?: string;
}

export const SEQUENCES: Record<string, InputStep[]> = {
  /** Skip intro videos (press Escape repeatedly). */
  skipIntros: [
    { action: 'key', keys: ['esc'], comment: 'skip EA logo' },
    { action: 'wait', ms: 500 },
    { action: 'key', keys: ['esc'], comment: 'skip intro video' },
    { action: 'wait', ms: 500 },
    { action: 'key', keys: ['esc'], comment: 'skip second video if any' },
    { action: 'wait', ms: 2000 },
  ],

  /** From main menu, navigate to Skirmish setup. */
  mainMenuToSkirmish: [
    // Main menu buttons are centered, vertically stacked
    // "Skirmish" is the third option in Zero Hour
    { action: 'click', x: 400, y: 340, comment: 'click Skirmish button' },
    { action: 'wait', ms: 2000 },
  ],

  /** Start the skirmish game from the setup screen. */
  startSkirmish: [
    // The "Start Game" button is at the bottom center of the skirmish setup
    { action: 'click', x: 400, y: 555, comment: 'click Start Game' },
    { action: 'wait', ms: 5000, comment: 'wait for map load' },
  ],

  /** Common hotkeys for Generals. */
  selectAllUnits: [
    { action: 'key', keys: ['q'], comment: 'select all units of type' },
  ],

  /** Pause/unpause the game. */
  togglePause: [
    { action: 'key', keys: ['pause'], comment: 'toggle game pause' },
  ],

  /** Open the game options menu. */
  openOptions: [
    { action: 'key', keys: ['esc'], comment: 'open options menu' },
  ],
};

/**
 * Generals faction names for menu selection.
 */
export const FACTIONS = {
  USA: 'USA',
  CHINA: 'China',
  GLA: 'GLA',
  // Zero Hour generals
  USA_AIRFORCE: 'USA Air Force',
  USA_LASER: 'USA Laser',
  USA_SUPERWEAPON: 'USA Super Weapon',
  CHINA_TANK: 'China Tank',
  CHINA_INFANTRY: 'China Infantry',
  CHINA_NUKE: 'China Nuke',
  GLA_TOXIN: 'GLA Toxin',
  GLA_STEALTH: 'GLA Stealth',
  GLA_DEMOLITION: 'GLA Demolition',
} as const;

export type FactionKey = keyof typeof FACTIONS;
