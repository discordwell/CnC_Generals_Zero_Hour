import { describe, expect, it } from 'vitest';

import {
  type ConditionMatchable,
  createConditionMatcher,
  findBestConditionMatch,
} from './condition-state-matcher.js';

function info(flags: string[]): ConditionMatchable {
  return { conditionFlags: flags };
}

describe('findBestConditionMatch', () => {
  it('returns null for an empty infos array', () => {
    expect(findBestConditionMatch([], new Set(['MOVING']))).toBeNull();
  });

  it('returns the single default (empty flags) info as a fallback', () => {
    const defaultInfo = info([]);
    expect(findBestConditionMatch([defaultInfo], new Set(['MOVING']))).toBe(defaultInfo);
  });

  it('picks an exact match when entity flags equal condition flags', () => {
    const exact = info(['MOVING', 'DAMAGED']);
    const other = info(['FIRING_A']);
    const result = findBestConditionMatch(
      [other, exact],
      new Set(['MOVING', 'DAMAGED']),
    );
    expect(result).toBe(exact);
  });

  it('prefers more matching flags among multiple candidates', () => {
    const one = info(['MOVING']);
    const two = info(['MOVING', 'DAMAGED']);
    const result = findBestConditionMatch(
      [one, two],
      new Set(['MOVING', 'DAMAGED', 'FIRING_A']),
    );
    expect(result).toBe(two);
  });

  it('breaks ties by fewest extraneous bits', () => {
    // Entity has only MOVING.
    // info A: MOVING           -> yesMatch=1, extraneous=0
    // info B: MOVING DAMAGED   -> yesMatch=1, extraneous=1
    const a = info(['MOVING']);
    const b = info(['MOVING', 'DAMAGED']);
    const result = findBestConditionMatch(
      [b, a],
      new Set(['MOVING']),
    );
    expect(result).toBe(a);
  });

  it('handles subset matching (entity has more flags than the info)', () => {
    const subset = info(['MOVING', 'DAMAGED']);
    const result = findBestConditionMatch(
      [subset],
      new Set(['MOVING', 'DAMAGED', 'FIRING_A']),
    );
    expect(result).toBe(subset);
  });

  it('falls back to default when entity flags have no overlap with non-default infos', () => {
    const defaultInfo = info([]);
    const unrelated = info(['NIGHT', 'SNOW']);
    const result = findBestConditionMatch(
      [unrelated, defaultInfo],
      new Set(['MOVING']),
    );
    // Default has yesMatch=0, extraneous=0.
    // Unrelated has yesMatch=0, extraneous=2.
    // Default wins on tie-break (fewer extraneous).
    expect(result).toBe(defaultInfo);
  });

  it('picks the info with the highest overlap among multiple unrelated infos', () => {
    const a = info(['MOVING', 'DAMAGED']);
    const b = info(['FIRING_A', 'RELOADING']);
    const c = info(['MOVING', 'DAMAGED', 'FIRING_A']);
    const result = findBestConditionMatch(
      [a, b, c],
      new Set(['MOVING', 'DAMAGED', 'FIRING_A']),
    );
    expect(result).toBe(c);
  });

  it('returns default info when no flags are in common', () => {
    const defaultInfo = info([]);
    const noOverlap = info(['NIGHT']);
    const result = findBestConditionMatch(
      [noOverlap, defaultInfo],
      new Set(['MOVING']),
    );
    expect(result).toBe(defaultInfo);
  });

  it('treats flag names as case-sensitive', () => {
    const lower = info(['moving']);
    const upper = info(['MOVING']);
    const result = findBestConditionMatch(
      [lower, upper],
      new Set(['MOVING']),
    );
    expect(result).toBe(upper);
  });

  it('matches via conditionFlagSets when multiple flag sets share one info', () => {
    // Simulates C++ SparseMatchFinder with multiple ConditionsYes per ModelConditionState.
    // One info represents an animation shared by two different flag combinations.
    const merged: ConditionMatchable = {
      conditionFlags: ['MOVING', 'DAMAGED'],
      conditionFlagSets: [
        ['MOVING', 'DAMAGED'],
        ['MOVING', 'RUBBLE'],
      ],
    };
    const other = info(['FIRING_A']);

    // First flag set matches
    expect(findBestConditionMatch([merged, other], new Set(['MOVING', 'DAMAGED']))).toBe(merged);
    // Second flag set matches
    expect(findBestConditionMatch([merged, other], new Set(['MOVING', 'RUBBLE']))).toBe(merged);
    // Neither flag set matches well; FIRING_A matches exactly
    expect(findBestConditionMatch([merged, other], new Set(['FIRING_A']))).toBe(other);
  });

  it('picks best score across all flag sets in a merged info', () => {
    const merged: ConditionMatchable = {
      conditionFlags: ['MOVING'],
      conditionFlagSets: [
        ['MOVING'],              // yesMatch=1, extraneous=0
        ['MOVING', 'DAMAGED'],   // yesMatch=1, extraneous=1
      ],
    };
    // With activeFlags = {MOVING}, the first flag set scores better (0 extraneous).
    // The info should still be selected (best across all its flag sets).
    const result = findBestConditionMatch([merged], new Set(['MOVING']));
    expect(result).toBe(merged);
  });
});

describe('createConditionMatcher', () => {
  it('returns the same result on a repeated call (cache hit)', () => {
    const a = info(['MOVING']);
    const b = info(['DAMAGED']);
    const matcher = createConditionMatcher([a, b]);

    const flags = new Set(['MOVING']);
    const first = matcher.findBest(flags);
    const second = matcher.findBest(flags);
    expect(first).toBe(a);
    expect(second).toBe(first);
  });

  it('clears the cache without affecting future lookups', () => {
    const a = info(['MOVING']);
    const matcher = createConditionMatcher([a]);

    const flags = new Set(['MOVING']);
    expect(matcher.findBest(flags)).toBe(a);

    matcher.clearCache();

    // After clearing, lookup should still work (re-computes).
    expect(matcher.findBest(flags)).toBe(a);
  });
});
