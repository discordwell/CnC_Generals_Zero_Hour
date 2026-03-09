/**
 * Port of C++ SparseMatchFinder::findBestInfoSlow() from
 * Generals/Code/GameEngine/Include/Common/SparseMatchFinder.h
 *
 * Finds the best-matching condition info for a given set of active entity flags.
 * The algorithm maximises the number of matching flags (yesMatch) and, as a
 * tie-breaker, minimises the number of extraneous flags (flags present in the
 * condition info but absent from the entity).
 */

/**
 * Minimal interface for items that carry a set of condition flags.
 * Kept dependency-free so this module can be tested in isolation.
 */
export interface ConditionMatchable {
  conditionFlags: readonly string[];
  /**
   * Source parity: m_conditionsYesVec — alternative condition flag arrays.
   * When present, the match loop iterates all sets.
   */
  conditionFlagSets?: readonly (readonly string[])[];
}

/**
 * Port of C++ SparseMatchFinder::findBestInfoSlow().
 * Finds the best-matching condition info for a given set of active entity flags.
 *
 * Source parity: inner loop over m_conditionsYesVec (multiple ConditionsYes
 * per ModelConditionState). Each flag set is scored independently and the
 * best score across all sets of all infos wins.
 *
 * @param infos      Array of condition infos to search
 * @param activeFlags Set of currently active flags on the entity
 * @returns The best matching info, or null if infos is empty
 */
export function findBestConditionMatch<T extends ConditionMatchable>(
  infos: readonly T[],
  activeFlags: ReadonlySet<string>,
): T | null {
  let result: T | null = null;
  let bestYesMatch = 0;
  let bestYesExtraneousBits = Infinity;

  for (const info of infos) {
    // Iterate all alternative flag sets (conditionFlagSets), falling back to
    // the single conditionFlags array for backward compatibility.
    const flagSets: readonly (readonly string[])[] =
      info.conditionFlagSets ?? [info.conditionFlags];

    for (const flags of flagSets) {
      // countConditionIntersection: flags in info that ARE in activeFlags
      let yesMatch = 0;
      // countConditionInverseIntersection: flags in info that are NOT in activeFlags
      let yesExtraneousBits = 0;

      for (const flag of flags) {
        if (activeFlags.has(flag)) {
          yesMatch++;
        } else {
          yesExtraneousBits++;
        }
      }

      if (
        yesMatch > bestYesMatch ||
        (yesMatch >= bestYesMatch && yesExtraneousBits < bestYesExtraneousBits)
      ) {
        result = info;
        bestYesMatch = yesMatch;
        bestYesExtraneousBits = yesExtraneousBits;
      }
    }
  }

  return result;
}

/** Compute a stable condition key from a flags array. */
export function computeConditionKey(flags: readonly string[]): string {
  return flags.slice().sort().join('|');
}

/**
 * Serialise a flag set into a stable cache key.
 */
function serializeFlags(flags: ReadonlySet<string>): string {
  return [...flags].sort().join('|');
}

/**
 * Creates a cached condition matcher (mirrors the C++ SparseMatchFinder's
 * hash_map cache around findBestInfoSlow).
 *
 * @param infos The full list of condition infos to match against.
 */
export function createConditionMatcher<T extends ConditionMatchable>(
  infos: readonly T[],
): {
  findBest(activeFlags: ReadonlySet<string>): T | null;
  clearCache(): void;
} {
  const cache = new Map<string, T | null>();

  return {
    findBest(activeFlags: ReadonlySet<string>): T | null {
      const key = serializeFlags(activeFlags);
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const result = findBestConditionMatch(infos, activeFlags);
      cache.set(key, result);
      return result;
    },
    clearCache() {
      cache.clear();
    },
  };
}
