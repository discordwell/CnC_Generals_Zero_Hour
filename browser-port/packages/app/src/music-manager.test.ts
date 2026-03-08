import { describe, expect, it, vi } from 'vitest';
import { MusicManager, type MusicAudioManager } from './music-manager.js';

function createMockAudioManager(): MusicAudioManager & { played: string[]; removed: number[] } {
  const played: string[] = [];
  const removed: number[] = [];
  let nextHandle = 1;
  return {
    played,
    removed,
    addAudioEvent(eventName: string) {
      played.push(eventName);
      return nextHandle++;
    },
    removeAudioEvent(handle: number) {
      removed.push(handle);
    },
  };
}

describe('MusicManager', () => {
  it('starts in idle state', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    expect(manager.getState()).toBe('idle');
    expect(manager.getCurrentTrackName()).toBe('');
  });

  it('setMenuMusic plays a menu track', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    manager.setMenuMusic();

    expect(manager.getState()).toBe('menu');
    expect(audio.played.length).toBe(1);
    expect(audio.played[0]).toMatch(/MainMenuMusic|ShellMapMusic/);
  });

  it('setAmbientMusic plays an ambient track', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    manager.setAmbientMusic();

    expect(manager.getState()).toBe('ambient');
    expect(audio.played.length).toBe(1);
    expect(audio.played[0]).toMatch(/MusicTrack_Ambient/);
  });

  it('notifyCombat switches to battle music', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    manager.setAmbientMusic();
    manager.notifyCombat();

    expect(manager.getState()).toBe('battle');
    expect(audio.played.some(t => t.match(/MusicTrack_Battle/))).toBe(true);
  });

  it('battle music transitions back to ambient after cooldown', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio, {
      battleCooldownMs: 5000,
      minBattleDurationMs: 2000,
    });

    let mockTime = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

    manager.setAmbientMusic();
    manager.notifyCombat();
    expect(manager.getState()).toBe('battle');

    // Not enough time passed.
    mockTime += 3000;
    manager.update();
    expect(manager.getState()).toBe('battle');

    // Past cooldown + min duration.
    mockTime += 5000;
    manager.update();
    expect(manager.getState()).toBe('ambient');

    vi.restoreAllMocks();
  });

  it('notifyCombat resets cooldown timer', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio, {
      battleCooldownMs: 5000,
      minBattleDurationMs: 1000,
    });

    let mockTime = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

    manager.notifyCombat();
    mockTime += 4000;
    manager.notifyCombat(); // Reset cooldown timer.
    mockTime += 4000; // 4s since last combat, under cooldown.
    manager.update();
    expect(manager.getState()).toBe('battle');

    mockTime += 3000; // Now 7s since last combat, past cooldown.
    manager.update();
    expect(manager.getState()).toBe('ambient');

    vi.restoreAllMocks();
  });

  it('playVictory switches to victory state', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    manager.playVictory();

    expect(manager.getState()).toBe('victory');
    expect(audio.played).toContain('EvaUSA_Victory');
  });

  it('playDefeat switches to defeat state', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    manager.playDefeat();

    expect(manager.getState()).toBe('defeat');
    expect(audio.played).toContain('EvaUSA_Defeat');
  });

  it('playVictoryForFaction uses correct faction prefix', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    manager.playVictoryForFaction('China');

    expect(audio.played).toContain('EvaChina_Victory');
  });

  it('stop stops all music', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    manager.setAmbientMusic();
    manager.stop();

    expect(manager.getState()).toBe('idle');
    expect(manager.getCurrentTrackName()).toBe('');
  });

  it('dispose stops music', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    manager.setAmbientMusic();
    manager.dispose();

    expect(manager.getState()).toBe('idle');
  });

  it('does not restart same state', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    manager.setAmbientMusic();
    const playCount = audio.played.length;
    manager.setAmbientMusic(); // Should not re-trigger.
    expect(audio.played.length).toBe(playCount);
  });

  it('uses crossfade when crossfadeToMusic is available and enabled', () => {
    const crossfadeCalls: string[] = [];
    let nextHandle = 1;
    const audio: MusicAudioManager & { played: string[]; removed: number[] } = {
      played: [],
      removed: [],
      addAudioEvent(eventName: string) {
        this.played.push(eventName);
        return nextHandle++;
      },
      removeAudioEvent(handle: number) {
        this.removed.push(handle);
      },
      crossfadeToMusic(trackName: string) {
        crossfadeCalls.push(trackName);
        return nextHandle++;
      },
    };

    const manager = new MusicManager(audio, { useCrossfade: true });
    manager.setAmbientMusic();
    expect(audio.played.length).toBe(1); // First track uses addAudioEvent (no previous)

    // Transition to battle triggers crossfade (because there's a current track)
    manager.notifyCombat();
    expect(crossfadeCalls.length).toBe(1);
    expect(crossfadeCalls[0]).toMatch(/MusicTrack_Battle/);
  });

  it('falls back to hard-cut when crossfade is disabled', () => {
    const crossfadeCalls: string[] = [];
    let nextHandle = 1;
    const audio: MusicAudioManager & { played: string[]; removed: number[] } = {
      played: [],
      removed: [],
      addAudioEvent(eventName: string) {
        this.played.push(eventName);
        return nextHandle++;
      },
      removeAudioEvent(handle: number) {
        this.removed.push(handle);
      },
      crossfadeToMusic(trackName: string) {
        crossfadeCalls.push(trackName);
        return nextHandle++;
      },
    };

    const manager = new MusicManager(audio, { useCrossfade: false });
    manager.setAmbientMusic();
    manager.notifyCombat();

    // Crossfade should NOT be used
    expect(crossfadeCalls.length).toBe(0);
    // Should use addAudioEvent for hard-cut
    expect(audio.played.length).toBe(2);
  });
});
