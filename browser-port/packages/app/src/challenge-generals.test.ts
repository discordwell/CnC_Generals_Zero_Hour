import { describe, it, expect, beforeEach } from 'vitest';
import { ChallengeGenerals, NUM_GENERALS } from './challenge-generals.js';

// In-memory storage mock
class MockStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(_index: number) { return null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

describe('ChallengeGenerals', () => {
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
  });

  it('initializes with 9 general personas', () => {
    const cg = new ChallengeGenerals(storage);
    expect(cg.getPersonas().length).toBe(NUM_GENERALS);
  });

  it('each persona has unique index and campaign name', () => {
    const cg = new ChallengeGenerals(storage);
    const personas = cg.getPersonas();
    const indices = new Set(personas.map(p => p.index));
    const campaigns = new Set(personas.map(p => p.campaignName));
    expect(indices.size).toBe(NUM_GENERALS);
    expect(campaigns.size).toBe(NUM_GENERALS);
  });

  it('looks up persona by index', () => {
    const cg = new ChallengeGenerals(storage);
    const p = cg.getPersona(0);
    expect(p).not.toBeNull();
    expect(p!.name).toBe('General Granger');
  });

  it('looks up persona by campaign name', () => {
    const cg = new ChallengeGenerals(storage);
    const p = cg.getPersonaByCampaignName('CHALLENGE_1');
    expect(p).not.toBeNull();
    expect(p!.name).toBe('Dr. Thrax');
  });

  it('looks up persona by template name', () => {
    const cg = new ChallengeGenerals(storage);
    const p = cg.getPersonaByTemplateName('FactionChinaTankGeneral');
    expect(p).not.toBeNull();
    expect(p!.name).toBe('General Kwai');
  });

  it('returns null for unknown persona', () => {
    const cg = new ChallengeGenerals(storage);
    expect(cg.getPersona(99)).toBeNull();
    expect(cg.getPersonaByCampaignName('nonexistent')).toBeNull();
  });

  it('tracks defeated generals', () => {
    const cg = new ChallengeGenerals(storage);
    expect(cg.isDefeated(0)).toBe(false);
    cg.markDefeated(0);
    expect(cg.isDefeated(0)).toBe(true);
    expect(cg.getDefeatedIndices()).toEqual([0]);
  });

  it('persists defeated generals to storage', () => {
    const cg1 = new ChallengeGenerals(storage);
    cg1.markDefeated(2);
    cg1.markDefeated(5);

    // Create new instance with same storage
    const cg2 = new ChallengeGenerals(storage);
    expect(cg2.isDefeated(2)).toBe(true);
    expect(cg2.isDefeated(5)).toBe(true);
    expect(cg2.isDefeated(0)).toBe(false);
  });

  it('resets progress', () => {
    const cg = new ChallengeGenerals(storage);
    cg.markDefeated(0);
    cg.markDefeated(1);
    cg.resetProgress();
    expect(cg.isDefeated(0)).toBe(false);
    expect(cg.getDefeatedIndices()).toEqual([]);
  });

  it('handles null storage gracefully', () => {
    const cg = new ChallengeGenerals(null);
    cg.markDefeated(0);
    expect(cg.isDefeated(0)).toBe(true);
    // No error thrown
  });

  it('handles corrupt storage data', () => {
    storage.setItem('generals_challenge_progress', 'not-json');
    const cg = new ChallengeGenerals(storage);
    expect(cg.getDefeatedIndices()).toEqual([]);
  });
});
