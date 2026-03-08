/**
 * ControlGroupManager — stores and recalls numbered unit groups (Ctrl+0-9).
 *
 * C++ parity: InGameUI / SelectionXlat manage 10 hotkey squads (0-9).
 *   - Ctrl+digit  → assign current selection to group  (MSG_META_CREATE_TEAM)
 *   - digit       → recall group (select those units)   (MSG_META_SELECT_TEAM)
 *   - Shift+digit → add current selection to group      (MSG_META_ADD_TEAM)
 *   - double-tap  → center camera on group              (handled externally)
 *
 * Dead/destroyed entities are filtered out on recall via an injected callback,
 * mirroring C++ Squad::getLiveObjects().
 */

/** Minimum valid group number (inclusive). */
const MIN_GROUP = 0;
/** Maximum valid group number (inclusive). */
const MAX_GROUP = 9;

export class ControlGroupManager {
  /** Stored groups keyed by group number (0-9). */
  private readonly groups: Map<number, number[]> = new Map();

  /**
   * Callback that returns true if the entity with the given ID is still alive.
   * Used to prune dead units on recall, matching C++ Squad::getLiveObjects().
   */
  private readonly isEntityAlive: (id: number) => boolean;

  constructor(isEntityAlive: (id: number) => boolean) {
    this.isEntityAlive = isEntityAlive;
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  private isValidGroup(groupNumber: number): boolean {
    return (
      Number.isInteger(groupNumber) &&
      groupNumber >= MIN_GROUP &&
      groupNumber <= MAX_GROUP
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Assign (overwrite) a control group with the given entity IDs.
   * Corresponds to C++ MSG_META_CREATE_TEAM / Ctrl+digit.
   */
  assignGroup(groupNumber: number, entityIds: readonly number[]): void {
    if (!this.isValidGroup(groupNumber)) return;
    this.groups.set(groupNumber, [...entityIds]);
  }

  /**
   * Recall a control group, filtering out dead/destroyed entities.
   * Returns a new array of live entity IDs (never the internal reference).
   * Corresponds to C++ MSG_META_SELECT_TEAM / digit key.
   */
  recallGroup(groupNumber: number): number[] {
    if (!this.isValidGroup(groupNumber)) return [];

    const stored = this.groups.get(groupNumber);
    if (!stored) return [];

    // Filter in-place to keep internal state pruned, then return a copy.
    const live = stored.filter(this.isEntityAlive);
    this.groups.set(groupNumber, live);
    return [...live];
  }

  /**
   * Add entities to an existing group (no duplicates).
   * If the group doesn't exist yet, it is created.
   * Corresponds to C++ MSG_META_ADD_TEAM / Shift+digit.
   */
  addToGroup(groupNumber: number, entityIds: readonly number[]): void {
    if (!this.isValidGroup(groupNumber)) return;

    const existing = this.groups.get(groupNumber) ?? [];
    const existingSet = new Set(existing);

    for (const id of entityIds) {
      if (!existingSet.has(id)) {
        existing.push(id);
        existingSet.add(id);
      }
    }

    this.groups.set(groupNumber, existing);
  }

  /**
   * Get the raw entity IDs for a group without filtering dead entities.
   * Returns a frozen snapshot (defensive copy).
   */
  getGroup(groupNumber: number): readonly number[] {
    if (!this.isValidGroup(groupNumber)) return [];
    const stored = this.groups.get(groupNumber);
    return stored ? [...stored] : [];
  }

  /**
   * Clear a single control group.
   */
  clearGroup(groupNumber: number): void {
    this.groups.delete(groupNumber);
  }

  /**
   * Clear all control groups. Useful on match reset / new game.
   */
  clearAll(): void {
    this.groups.clear();
  }
}
