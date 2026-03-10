/**
 * Control Harness — programmatic game interface for automated play-testing.
 *
 * Exposed on `window.__harness` after game starts. Provides high-level
 * methods for querying game state and issuing commands via the console
 * or browser automation tools.
 */

import type { GameLogicSubsystem } from '@generals/game-logic';
import type { RTSCamera } from '@generals/input';

export interface ControlHarness {
  // ── State Queries ──────────────────────────────────────────────────
  /** Compact game state snapshot. */
  state(): HarnessGameState;
  /** All entities owned by the local player. */
  myEntities(): HarnessEntity[];
  /** All entities owned by enemy sides. */
  enemyEntities(): HarnessEntity[];
  /** All entities (every side, including neutral). */
  allEntities(): HarnessEntity[];
  /** Find entities by template name (case-insensitive). */
  findByTemplate(templateName: string): HarnessEntity[];
  /** Get detailed info about a single entity. */
  entity(id: number): HarnessEntity | null;
  /** Get production queue state for a building. */
  production(entityId: number): unknown;

  // ── Selection ──────────────────────────────────────────────────────
  /** Select one or more entities by ID. */
  select(...ids: number[]): void;
  /** Select all entities of a given template owned by local player. */
  selectByTemplate(templateName: string): number[];
  /** Clear selection. */
  deselect(): void;
  /** Get currently selected entity IDs. */
  selected(): readonly number[];

  // ── Movement & Combat ──────────────────────────────────────────────
  /** Move selected entities to world position. */
  move(x: number, z: number): void;
  /** Attack-move selected entities to world position. */
  attackMove(x: number, z: number): void;
  /** Attack a specific target entity. */
  attack(targetEntityId: number): void;
  /** Stop selected entities. */
  stop(): void;
  /** Guard a position. */
  guard(x: number, z: number): void;

  // ── Building & Production ──────────────────────────────────────────
  /** Order selected dozer to build a structure at position. */
  build(templateName: string, x: number, z: number, angle?: number): void;
  /** Queue a unit for production at the selected building. */
  train(unitTemplateName: string): void;
  /** Apply an upgrade to the selected building. */
  upgrade(upgradeName: string): void;
  /** Sell the selected structure. */
  sell(): void;
  /** Set rally point for selected production building. */
  rally(x: number, z: number): void;

  // ── Camera ─────────────────────────────────────────────────────────
  /** Move camera to look at world position. */
  cam(x: number, z: number): void;
  /** Center camera on an entity. */
  camEntity(entityId: number): void;

  // ── Economy ────────────────────────────────────────────────────────
  /** Get local player credits. */
  credits(): number;
  /** Set local player credits (debug). */
  setCredits(amount: number): void;

  // ── Simulation Control ────────────────────────────────────────────
  /** Advance the simulation by one frame (1/30s). */
  tick(): void;
  /** Advance the simulation by N frames. */
  advance(n: number): void;

  // ── Utilities ──────────────────────────────────────────────────────
  /** Current game frame number. */
  frame(): number;
  /** Shorthand: find my command center(s). */
  myCC(): HarnessEntity[];
  /** Shorthand: find my dozers. */
  myDozers(): HarnessEntity[];
}

export interface HarnessGameState {
  frame: number;
  credits: number;
  myEntityCount: number;
  enemyEntityCount: number;
  selectedIds: readonly number[];
  side: string;
  enemySide: string;
  defeated: boolean;
  enemyDefeated: boolean;
  gameEnd: unknown;
}

export interface HarnessEntity {
  id: number;
  templateName: string;
  side: string;
  x: number;
  y: number;
  z: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  constructionPercent: number;
  statusFlags: string[];
}

export function createControlHarness(
  gameLogic: GameLogicSubsystem,
  rtsCamera: RTSCamera,
  localPlayerIndex: number,
): ControlHarness {
  const localSide = (): string => gameLogic.getPlayerSide(localPlayerIndex) ?? '';

  const enemySide = (): string => {
    const sides = gameLogic.getActiveSideNames();
    const my = localSide().toLowerCase();
    return sides.find((s) => s.toLowerCase() !== my) ?? '';
  };

  const allEntityIds = (): number[] => {
    // Use the internal render state which lists all entity IDs.
    // We iterate through known ID range by checking entity state.
    const ids: number[] = [];
    // Check IDs 1..maxId. We find maxId by binary search or just iterate a reasonable range.
    for (let id = 1; id <= 10000; id++) {
      if (gameLogic.getEntityState(id) !== null) {
        ids.push(id);
      }
    }
    return ids;
  };

  const toHarnessEntity = (id: number): HarnessEntity | null => {
    const s = gameLogic.getEntityState(id);
    if (!s) return null;
    return {
      id: s.id,
      templateName: s.templateName,
      side: s.side,
      x: s.x,
      y: s.y,
      z: s.z,
      health: s.health,
      maxHealth: s.maxHealth,
      alive: s.alive,
      constructionPercent: s.constructionPercent,
      statusFlags: s.statusFlags,
    };
  };

  const harness: ControlHarness = {
    // ── State ──
    state() {
      const mySide = localSide();
      const eSide = enemySide();
      return {
        frame: (gameLogic as unknown as { frameCounter: number }).frameCounter ?? 0,
        credits: gameLogic.getSideCredits(mySide),
        myEntityCount: harness.myEntities().length,
        enemyEntityCount: harness.enemyEntities().length,
        selectedIds: gameLogic.getLocalPlayerSelectionIds(),
        side: mySide,
        enemySide: eSide,
        defeated: gameLogic.isSideDefeated(mySide),
        enemyDefeated: eSide ? gameLogic.isSideDefeated(eSide) : false,
        gameEnd: gameLogic.getGameEndState(),
      };
    },

    myEntities() {
      const mySide = localSide().toLowerCase();
      return allEntityIds()
        .map(toHarnessEntity)
        .filter((e): e is HarnessEntity => e !== null && e.side.toLowerCase() === mySide && e.alive);
    },

    enemyEntities() {
      const mySide = localSide().toLowerCase();
      return allEntityIds()
        .map(toHarnessEntity)
        .filter((e): e is HarnessEntity =>
          e !== null && e.alive && e.side.toLowerCase() !== mySide && e.side !== '' && e.side.toLowerCase() !== 'civilian',
        );
    },

    allEntities() {
      return allEntityIds()
        .map(toHarnessEntity)
        .filter((e): e is HarnessEntity => e !== null);
    },

    findByTemplate(templateName: string) {
      const ids = gameLogic.getEntityIdsByTemplate(templateName);
      return ids.map(toHarnessEntity).filter((e): e is HarnessEntity => e !== null);
    },

    entity(id: number) {
      return toHarnessEntity(id);
    },

    production(entityId: number) {
      return gameLogic.getProductionState(entityId);
    },

    // ── Selection ──
    select(...ids: number[]) {
      gameLogic.submitCommand({ type: 'clearSelection' });
      if (ids.length > 0) {
        gameLogic.submitCommand({ type: 'selectEntities', entityIds: ids });
      }
    },

    selectByTemplate(templateName: string) {
      const mySide = localSide();
      const ids = gameLogic.getEntityIdsByTemplateAndSide(templateName, mySide);
      if (ids.length > 0) {
        gameLogic.submitCommand({ type: 'clearSelection' });
        gameLogic.submitCommand({ type: 'selectEntities', entityIds: ids });
      }
      return ids;
    },

    deselect() {
      gameLogic.submitCommand({ type: 'clearSelection' });
    },

    selected() {
      return gameLogic.getLocalPlayerSelectionIds();
    },

    // ── Movement & Combat ──
    move(x: number, z: number) {
      const sel = gameLogic.getLocalPlayerSelectionIds();
      for (const entityId of sel) {
        gameLogic.submitCommand({
          type: 'moveTo',
          entityId,
          targetX: x,
          targetZ: z,
          commandSource: 'PLAYER',
        });
      }
    },

    attackMove(x: number, z: number) {
      const sel = gameLogic.getLocalPlayerSelectionIds();
      for (const entityId of sel) {
        gameLogic.submitCommand({
          type: 'attackMoveTo',
          entityId,
          targetX: x,
          targetZ: z,
          attackDistance: gameLogic.getAttackMoveDistanceForEntity(entityId),
          commandSource: 'PLAYER',
        });
      }
    },

    attack(targetEntityId: number) {
      const sel = gameLogic.getLocalPlayerSelectionIds();
      for (const entityId of sel) {
        gameLogic.submitCommand({
          type: 'attackEntity',
          entityId,
          targetEntityId,
          commandSource: 'PLAYER',
        });
      }
    },

    stop() {
      const sel = gameLogic.getLocalPlayerSelectionIds();
      for (const entityId of sel) {
        gameLogic.submitCommand({ type: 'stop', entityId, commandSource: 'PLAYER' });
      }
    },

    guard(x: number, z: number) {
      const sel = gameLogic.getLocalPlayerSelectionIds();
      for (const entityId of sel) {
        gameLogic.submitCommand({
          type: 'guardPosition',
          entityId,
          targetX: x,
          targetZ: z,
          guardMode: 0,
          commandSource: 'PLAYER',
        });
      }
    },

    // ── Building & Production ──
    build(templateName: string, x: number, z: number, angle = 0) {
      const sel = gameLogic.getLocalPlayerSelectionIds();
      for (const entityId of sel) {
        gameLogic.submitCommand({
          type: 'constructBuilding',
          entityId,
          templateName,
          targetPosition: [x, 0, z],
          angle,
          lineEndPosition: null,
        });
      }
    },

    train(unitTemplateName: string) {
      const sel = gameLogic.getLocalPlayerSelectionIds();
      for (const entityId of sel) {
        gameLogic.submitCommand({
          type: 'queueUnitProduction',
          entityId,
          unitTemplateName,
        });
      }
    },

    upgrade(upgradeName: string) {
      const sel = gameLogic.getLocalPlayerSelectionIds();
      for (const entityId of sel) {
        gameLogic.submitCommand({
          type: 'applyUpgrade',
          entityId,
          upgradeName,
        });
      }
    },

    sell() {
      const sel = gameLogic.getLocalPlayerSelectionIds();
      for (const entityId of sel) {
        gameLogic.submitCommand({ type: 'sell', entityId });
      }
    },

    rally(x: number, z: number) {
      const sel = gameLogic.getLocalPlayerSelectionIds();
      for (const entityId of sel) {
        gameLogic.submitCommand({
          type: 'setRallyPoint',
          entityId,
          targetX: x,
          targetZ: z,
        });
      }
    },

    // ── Camera ──
    cam(x: number, z: number) {
      rtsCamera.lookAt(x, z);
    },

    camEntity(entityId: number) {
      const pos = gameLogic.getEntityWorldPosition(entityId);
      if (pos) {
        rtsCamera.lookAt(pos[0], pos[2]);
      }
    },

    // ── Economy ──
    credits() {
      return gameLogic.getSideCredits(localSide());
    },

    setCredits(amount: number) {
      gameLogic.setSideCredits(localSide(), amount);
    },

    // ── Simulation Control ──
    tick() {
      gameLogic.update(1 / 30);
    },

    advance(n: number) {
      for (let i = 0; i < n; i++) {
        gameLogic.update(1 / 30);
      }
    },

    // ── Utilities ──
    frame() {
      return (gameLogic as unknown as { frameCounter: number }).frameCounter ?? 0;
    },

    myCC() {
      return harness.myEntities().filter((e) =>
        e.templateName.toLowerCase().includes('commandcenter'),
      );
    },

    myDozers() {
      return harness.myEntities().filter((e) =>
        e.templateName.toLowerCase().includes('dozer'),
      );
    },
  };

  return harness;
}
