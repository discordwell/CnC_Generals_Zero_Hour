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
});
