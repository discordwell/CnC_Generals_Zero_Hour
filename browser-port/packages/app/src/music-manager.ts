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
}

/**
 * Source parity: The retail game selects music tracks from the INI-defined
 * music track list. Track names map to AudioEvent definitions which point
 * to actual music files.
 */
const MENU_TRACKS = ['MainMenuMusic', 'ShellMapMusic'];
const AMBIENT_TRACKS = [
  'MusicTrack_Ambient1',
  'MusicTrack_Ambient2',
  'MusicTrack_Ambient3',
  'MusicTrack_Ambient4',
];
const BATTLE_TRACKS = [
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

  private state: MusicState = 'idle';
  private currentHandle = 0;
  private currentTrackName = '';
  private lastCombatTime = 0;
  private battleStartTime = 0;
  private trackIndex = 0;

  constructor(audioManager: MusicAudioManager, config: MusicManagerConfig = {}) {
    this.audioManager = audioManager;
    this.battleCooldownMs = config.battleCooldownMs ?? DEFAULT_BATTLE_COOLDOWN_MS;
    this.minBattleDurationMs = config.minBattleDurationMs ?? DEFAULT_MIN_BATTLE_DURATION_MS;
    this.useCrossfade = config.useCrossfade ?? true;
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
    this.playTrackFromList(MENU_TRACKS);
  }

  /** Start ambient in-game music. */
  setAmbientMusic(): void {
    if (this.state === 'ambient') return;
    this.state = 'ambient';
    this.playTrackFromList(AMBIENT_TRACKS);
  }

  /** Notify that combat is happening — switches to battle music. */
  notifyCombat(): void {
    const now = performance.now();
    this.lastCombatTime = now;

    if (this.state !== 'battle') {
      this.state = 'battle';
      this.battleStartTime = now;
      this.playTrackFromList(BATTLE_TRACKS);
    }
  }

  /** Play victory stinger. */
  playVictory(): void {
    this.state = 'victory';
    this.playTrack('EvaUSA_Victory');
  }

  /** Play defeat stinger. */
  playDefeat(): void {
    this.state = 'defeat';
    this.playTrack('EvaUSA_Defeat');
  }

  /** Play faction-specific victory/defeat. */
  playVictoryForFaction(faction: string): void {
    this.state = 'victory';
    const prefix = resolveEvaFactionPrefix(faction);
    this.playTrack(`${prefix}_Victory`);
  }

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

  private playTrackFromList(tracks: readonly string[]): void {
    if (tracks.length === 0) return;
    const track = tracks[this.trackIndex % tracks.length]!;
    this.trackIndex = (this.trackIndex + 1) % tracks.length;
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
