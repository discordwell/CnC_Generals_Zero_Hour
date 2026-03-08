/**
 * Music manager — handles background music transitions between
 * menu, ambient, battle, and victory/defeat states.
 *
 * Source parity: AudioManager::m_musicManager handles music track selection
 * with crossfade transitions. Battle music triggers on combat engagement,
 * ambient music resumes after a cooldown once combat ends.
 */

import { resolveEvaFactionPrefix } from './eva-faction-prefix.js';

/** Minimal AudioManager interface for music playback. */
export interface MusicAudioManager {
  addAudioEvent(eventName: string): number;
  removeAudioEvent(handle: number): void;
  /**
   * Optional crossfade method. If available, the MusicManager uses it for
   * smooth transitions between tracks (0.5s fade). Falls back to hard-cut.
   */
  crossfadeToMusic?(trackName: string): number;
}

export type MusicState = 'idle' | 'menu' | 'ambient' | 'battle' | 'victory' | 'defeat';

export interface MusicManagerConfig {
  /** Time (ms) after last combat event before switching back to ambient. Default 15000. */
  battleCooldownMs?: number;
  /** Minimum time (ms) battle music must play before allowing switch. Default 5000. */
  minBattleDurationMs?: number;
  /** Whether to use crossfade transitions between tracks. Default true. */
  useCrossfade?: boolean;
  /** Override menu track list. Falls back to DEFAULT_MENU_TRACKS if not provided. */
  menuTracks?: string[];
  /** Override ambient track list. Falls back to DEFAULT_AMBIENT_TRACKS if not provided. */
  ambientTracks?: string[];
  /** Override battle track list. Falls back to DEFAULT_BATTLE_TRACKS if not provided. */
  battleTracks?: string[];
}

/**
 * Source parity: The retail game selects music tracks from the INI-defined
 * music track list. Track names map to AudioEvent definitions which point
 * to actual music files.
 */
const DEFAULT_MENU_TRACKS = ['MainMenuMusic', 'ShellMapMusic'];
const DEFAULT_AMBIENT_TRACKS = [
  'MusicTrack_Ambient1',
  'MusicTrack_Ambient2',
  'MusicTrack_Ambient3',
  'MusicTrack_Ambient4',
];
const DEFAULT_BATTLE_TRACKS = [
  'MusicTrack_Battle1',
  'MusicTrack_Battle2',
  'MusicTrack_Battle3',
  'MusicTrack_Battle4',
];

const DEFAULT_BATTLE_COOLDOWN_MS = 15000;
const DEFAULT_MIN_BATTLE_DURATION_MS = 5000;

export class MusicManager {
  private readonly audioManager: MusicAudioManager;
  private readonly battleCooldownMs: number;
  private readonly minBattleDurationMs: number;
  private readonly useCrossfade: boolean;
  private readonly menuTracks: readonly string[];
  private readonly ambientTracks: readonly string[];
  private readonly battleTracks: readonly string[];

  private state: MusicState = 'idle';
  private currentHandle = 0;
  private currentTrackName = '';
  private lastCombatTime = 0;
  private battleStartTime = 0;
  private menuIndex = 0;
  private ambientIndex = 0;
  private battleIndex = 0;

  constructor(audioManager: MusicAudioManager, config: MusicManagerConfig = {}) {
    this.audioManager = audioManager;
    this.battleCooldownMs = config.battleCooldownMs ?? DEFAULT_BATTLE_COOLDOWN_MS;
    this.minBattleDurationMs = config.minBattleDurationMs ?? DEFAULT_MIN_BATTLE_DURATION_MS;
    this.useCrossfade = config.useCrossfade ?? true;
    this.menuTracks = config.menuTracks ?? DEFAULT_MENU_TRACKS;
    this.ambientTracks = config.ambientTracks ?? DEFAULT_AMBIENT_TRACKS;
    this.battleTracks = config.battleTracks ?? DEFAULT_BATTLE_TRACKS;
  }

  getState(): MusicState {
    return this.state;
  }

  getCurrentTrackName(): string {
    return this.currentTrackName;
  }

  /** Start menu music. */
  setMenuMusic(): void {
    if (this.state === 'menu') return;
    this.state = 'menu';
    this.playTrackFromMenu();
  }

  /** Start ambient in-game music. */
  setAmbientMusic(): void {
    if (this.state === 'ambient') return;
    this.state = 'ambient';
    this.playTrackFromAmbient();
  }

  /** Notify that combat is happening — switches to battle music. */
  notifyCombat(): void {
    const now = performance.now();
    this.lastCombatTime = now;

    if (this.state !== 'battle') {
      this.state = 'battle';
      this.battleStartTime = now;
      this.playTrackFromBattle();
    }
  }

  /** Play victory stinger. Defaults to USA faction. */
  playVictory(faction = 'USA'): void {
    this.playVictoryForFaction(faction);
  }

  /** Play defeat stinger. Defaults to USA faction. */
  playDefeat(faction = 'USA'): void {
    this.playDefeatForFaction(faction);
  }

  /** Play faction-specific victory. */
  playVictoryForFaction(faction: string): void {
    this.state = 'victory';
    const prefix = resolveEvaFactionPrefix(faction);
    this.playTrack(`${prefix}_Victory`);
  }

  /** Play faction-specific defeat. */
  playDefeatForFaction(faction: string): void {
    this.state = 'defeat';
    const prefix = resolveEvaFactionPrefix(faction);
    this.playTrack(`${prefix}_Defeat`);
  }

  /**
   * Per-frame update. Handles battle -> ambient transition after cooldown.
   */
  update(): void {
    if (this.state !== 'battle') return;

    const now = performance.now();
    const timeSinceCombat = now - this.lastCombatTime;
    const battleDuration = now - this.battleStartTime;

    if (
      timeSinceCombat >= this.battleCooldownMs &&
      battleDuration >= this.minBattleDurationMs
    ) {
      this.setAmbientMusic();
    }
  }

  /** Stop all music. */
  stop(): void {
    this.stopCurrent();
    this.state = 'idle';
  }

  dispose(): void {
    this.stop();
  }

  private playTrackFromMenu(): void {
    if (this.menuTracks.length === 0) return;
    const track = this.menuTracks[this.menuIndex % this.menuTracks.length]!;
    this.menuIndex = (this.menuIndex + 1) % this.menuTracks.length;
    this.playTrack(track);
  }

  private playTrackFromAmbient(): void {
    if (this.ambientTracks.length === 0) return;
    const track = this.ambientTracks[this.ambientIndex % this.ambientTracks.length]!;
    this.ambientIndex = (this.ambientIndex + 1) % this.ambientTracks.length;
    this.playTrack(track);
  }

  private playTrackFromBattle(): void {
    if (this.battleTracks.length === 0) return;
    const track = this.battleTracks[this.battleIndex % this.battleTracks.length]!;
    this.battleIndex = (this.battleIndex + 1) % this.battleTracks.length;
    this.playTrack(track);
  }

  /**
   * Play a music track, using crossfade when available and enabled.
   * Source parity: MusicManager transitions between tracks with a fade.
   */
  private playTrack(trackName: string): void {
    if (this.useCrossfade && this.currentHandle > 0 && this.audioManager.crossfadeToMusic) {
      // Crossfade: let the AudioManager handle the old-to-new fade transition.
      this.currentTrackName = trackName;
      this.currentHandle = this.audioManager.crossfadeToMusic(trackName);
    } else {
      // Hard-cut fallback.
      this.stopCurrent();
      this.currentTrackName = trackName;
      this.currentHandle = this.audioManager.addAudioEvent(trackName);
    }
  }

  private stopCurrent(): void {
    if (this.currentHandle > 0) {
      this.audioManager.removeAudioEvent(this.currentHandle);
      this.currentHandle = 0;
    }
    this.currentTrackName = '';
  }
}
