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

  it('playVictory switches to victory state with default USA faction', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    manager.playVictory();

    expect(manager.getState()).toBe('victory');
    expect(audio.played).toContain('EvaUSA_Victory');
  });

  it('playVictory accepts a faction parameter', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    manager.playVictory('China');

    expect(manager.getState()).toBe('victory');
    expect(audio.played).toContain('EvaChina_Victory');
  });

  it('playDefeat switches to defeat state with default USA faction', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    manager.playDefeat();

    expect(manager.getState()).toBe('defeat');
    expect(audio.played).toContain('EvaUSA_Defeat');
  });

  it('playDefeat accepts a faction parameter', () => {
    const audio = createMockAudioManager();
    const manager = new MusicManager(audio);
    manager.playDefeat('GLA');

    expect(manager.getState()).toBe('defeat');
    expect(audio.played).toContain('EvaGLA_Defeat');
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

  describe('per-list track indices', () => {
    it('menu, ambient, and battle indices are independent', () => {
      const audio = createMockAudioManager();
      const manager = new MusicManager(audio, {
        menuTracks: ['M1', 'M2'],
        ambientTracks: ['A1', 'A2', 'A3'],
        battleTracks: ['B1', 'B2'],
      });

      // Play menu -> gets M1 (index 0), menu index advances to 1
      manager.setMenuMusic();
      expect(audio.played[audio.played.length - 1]).toBe('M1');

      // Switch to ambient -> gets A1 (index 0), ambient index advances to 1
      manager.setAmbientMusic();
      expect(audio.played[audio.played.length - 1]).toBe('A1');

      // Switch to battle -> gets B1 (index 0), battle index advances to 1
      manager.notifyCombat();
      expect(audio.played[audio.played.length - 1]).toBe('B1');

      // Back to menu -> gets M2 (index 1, independent of other lists)
      manager.stop();
      manager.setMenuMusic();
      expect(audio.played[audio.played.length - 1]).toBe('M2');

      // Back to ambient -> gets A2 (index 1, independent of other lists)
      manager.setAmbientMusic();
      expect(audio.played[audio.played.length - 1]).toBe('A2');

      // Back to battle -> gets B2 (index 1, independent of other lists)
      manager.notifyCombat();
      expect(audio.played[audio.played.length - 1]).toBe('B2');
    });

    it('track indices wrap around', () => {
      const audio = createMockAudioManager();
      const manager = new MusicManager(audio, {
        menuTracks: ['M1', 'M2'],
        ambientTracks: ['A1'],
        battleTracks: ['B1', 'B2', 'B3'],
      });

      // Play menu 3 times (wraps: M1, M2, M1)
      manager.setMenuMusic();
      expect(audio.played[audio.played.length - 1]).toBe('M1');
      manager.stop();
      manager.setMenuMusic();
      expect(audio.played[audio.played.length - 1]).toBe('M2');
      manager.stop();
      manager.setMenuMusic();
      expect(audio.played[audio.played.length - 1]).toBe('M1');
    });
  });

  describe('configurable track lists', () => {
    it('uses custom track lists from config', () => {
      const audio = createMockAudioManager();
      const manager = new MusicManager(audio, {
        menuTracks: ['CustomMenu1'],
        ambientTracks: ['CustomAmbient1', 'CustomAmbient2'],
        battleTracks: ['CustomBattle1'],
      });

      manager.setMenuMusic();
      expect(audio.played).toContain('CustomMenu1');

      manager.setAmbientMusic();
      expect(audio.played).toContain('CustomAmbient1');

      manager.notifyCombat();
      expect(audio.played).toContain('CustomBattle1');
    });

    it('falls back to default tracks when config lists are not provided', () => {
      const audio = createMockAudioManager();
      const manager = new MusicManager(audio);

      manager.setMenuMusic();
      expect(audio.played[0]).toMatch(/MainMenuMusic|ShellMapMusic/);

      manager.setAmbientMusic();
      expect(audio.played[audio.played.length - 1]).toMatch(/MusicTrack_Ambient/);

      manager.notifyCombat();
      expect(audio.played[audio.played.length - 1]).toMatch(/MusicTrack_Battle/);
    });

    it('handles empty track lists gracefully', () => {
      const audio = createMockAudioManager();
      const manager = new MusicManager(audio, {
        menuTracks: [],
        ambientTracks: [],
        battleTracks: [],
      });

      manager.setMenuMusic();
      expect(audio.played.length).toBe(0);

      manager.setAmbientMusic();
      expect(audio.played.length).toBe(0);

      manager.notifyCombat();
      expect(audio.played.length).toBe(0);
    });

    it('supports registry-driven track loading', () => {
      // Simulate what getMusicTracksByType() would return
      const registryTracks = {
        menu: ['MainMenuMusic', 'ShellMapMusic'],
        ambient: ['MusicTrack_Ambient1', 'MusicTrack_Ambient2'],
        battle: ['MusicTrack_Battle1', 'MusicTrack_Score1'],
      };

      const audio = createMockAudioManager();
      const manager = new MusicManager(audio, {
        menuTracks: registryTracks.menu,
        ambientTracks: registryTracks.ambient,
        battleTracks: registryTracks.battle,
      });

      manager.setMenuMusic();
      expect(audio.played).toContain('MainMenuMusic');

      manager.setAmbientMusic();
      expect(audio.played).toContain('MusicTrack_Ambient1');

      manager.notifyCombat();
      expect(audio.played).toContain('MusicTrack_Battle1');
    });
  });
});
