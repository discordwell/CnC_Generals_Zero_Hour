/**
 * Basic skirmish AI opponent.
 *
 * Source parity:
 *   Generals/Code/GameEngine/Source/GameLogic/AI/AIPlayer.cpp
 *   Generals/Code/GameEngine/Include/GameLogic/AI/AIPlayer.h
 *   Generals/Code/GameEngine/Source/GameLogic/AI/AISkirmishPlayer.cpp
 *
 * Implementation: A frame-driven decision loop that evaluates economy, production,
 * and combat at staggered intervals. Issues commands through the same command API
 * used by human players.
 */

import type { GameLogicCommand } from './types.js';

// ──── Evaluation intervals (in logic frames, ~15 FPS) ────────────────────────
const ECONOMY_EVAL_INTERVAL = 30;  // ~2 seconds
const PRODUCTION_EVAL_INTERVAL = 45; // ~3 seconds
const COMBAT_EVAL_INTERVAL = 90;   // ~6 seconds
const STRUCTURE_EVAL_INTERVAL = 60; // ~4 seconds
const DEFENSE_EVAL_INTERVAL = 20;  // ~1.3 seconds
const SCOUT_EVAL_INTERVAL = 150;   // ~10 seconds

// ──── Resource thresholds (source parity: AIData.ini) ────────────────────────
const RESOURCES_POOR_THRESHOLD = 500;
const RESOURCES_WEALTHY_THRESHOLD = 3000;
const MIN_ATTACK_FORCE = 4;
const DESIRED_HARVESTERS = 2;
const RETREAT_HEALTH_RATIO = 0.25;
const DEFENSE_RADIUS = 80;

// ──── Entity abstraction ─────────────────────────────────────────────────────

export interface AIEntity {
  id: number;
  templateName: string;
  side?: string;
  x: number;
  z: number;
  destroyed: boolean;
  health: number;
  maxHealth: number;
  kindOf: ReadonlySet<string>;
  moving: boolean;
  attackTargetEntityId: number | null;
  canMove: boolean;
}

// ──── AI context (provided by GameLogicSubsystem) ────────────────────────────

export interface SkirmishAIContext<TEntity extends AIEntity> {
  readonly frameCounter: number;
  readonly spawnedEntities: ReadonlyMap<number, TEntity>;

  /** Get credits for a side. */
  getSideCredits(side: string): number;

  /** Submit a command. */
  submitCommand(command: GameLogicCommand): void;

  /** Get team relationship between sides: 0=enemies, 1=neutral, 2=allies. */
  getRelationship(sideA: string, sideB: string): number;

  /** Normalize a side string. */
  normalizeSide(side: string | undefined): string;

  /** Check if an entity has a production queue capability. */
  hasProductionQueue(entity: TEntity): boolean;

  /** Check if an entity is currently producing. */
  isProducing(entity: TEntity): boolean;

  /** Get producible unit template names for a factory entity. */
  getProducibleUnits(entity: TEntity): string[];

  /** Get the world map dimensions. */
  getWorldDimensions(): { width: number; depth: number } | null;

  /** Find dozers/workers owned by a side. */
  getDozers(side: string): TEntity[];

  /** Get buildable structure templates for a dozer entity. */
  getBuildableStructures(entity: TEntity): string[];

  /** Check if a dozer is currently constructing. */
  isDozerBusy(entity: TEntity): boolean;
}

// ──── Per-AI state ──────────────────────────────────────────────────────────

export interface SkirmishAIState {
  side: string;
  enabled: boolean;
  lastEconomyFrame: number;
  lastProductionFrame: number;
  lastCombatFrame: number;
  lastStructureFrame: number;
  lastDefenseFrame: number;
  lastScoutFrame: number;
  /** Rally point for new units. */
  rallyX: number;
  rallyZ: number;
  /** Known enemy base position (first discovered enemy structure). */
  enemyBaseX: number;
  enemyBaseZ: number;
  enemyBaseKnown: boolean;
  /** Track attack waves sent. */
  attackWavesSent: number;
  /** Build order phase index. */
  buildOrderPhase: number;
  /** Entity ID of active scout (-1 if none). */
  scoutEntityId: number;
  /** Scout exploration waypoints. */
  scoutWaypoints: Array<{ x: number; z: number }>;
  scoutWaypointIndex: number;
  /** Last known base threat frame (for defense response). */
  lastBaseThreatFrame: number;
}

export function createSkirmishAIState(side: string): SkirmishAIState {
  return {
    side,
    enabled: true,
    lastEconomyFrame: 0,
    lastProductionFrame: 0,
    lastCombatFrame: 0,
    lastStructureFrame: 0,
    lastDefenseFrame: 0,
    lastScoutFrame: 0,
    rallyX: 0,
    rallyZ: 0,
    enemyBaseX: 0,
    enemyBaseZ: 0,
    enemyBaseKnown: false,
    attackWavesSent: 0,
    buildOrderPhase: 0,
    scoutEntityId: -1,
    scoutWaypoints: [],
    scoutWaypointIndex: 0,
    lastBaseThreatFrame: 0,
  };
}

// ──── Helper: collect entities by side and criteria ──────────────────────────

function collectEntitiesBySide<TEntity extends AIEntity>(
  entities: ReadonlyMap<number, TEntity>,
  side: string,
  normalizeSide: (s: string | undefined) => string,
  filter?: (entity: TEntity) => boolean,
): TEntity[] {
  const result: TEntity[] = [];
  const normalizedSide = normalizeSide(side);

  for (const entity of entities.values()) {
    if (entity.destroyed) {
      continue;
    }
    if (normalizeSide(entity.side) !== normalizedSide) {
      continue;
    }
    if (filter && !filter(entity)) {
      continue;
    }
    result.push(entity);
  }

  return result;
}

function hasKindOf(entity: AIEntity, kind: string): boolean {
  return entity.kindOf.has(kind);
}

function distSquared(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

// ──── Main AI update ────────────────────────────────────────────────────────

export function updateSkirmishAI<TEntity extends AIEntity>(
  state: SkirmishAIState,
  context: SkirmishAIContext<TEntity>,
): void {
  if (!state.enabled) {
    return;
  }

  const frame = context.frameCounter;

  // Initialize rally point near our base.
  if (state.rallyX === 0 && state.rallyZ === 0) {
    initializeBasePosition(state, context);
  }

  // Discover enemy base position.
  if (!state.enemyBaseKnown) {
    discoverEnemyBase(state, context);
  }

  // Staggered evaluation loops.
  if (frame - state.lastDefenseFrame >= DEFENSE_EVAL_INTERVAL) {
    evaluateDefense(state, context);
    state.lastDefenseFrame = frame;
  }

  if (frame - state.lastEconomyFrame >= ECONOMY_EVAL_INTERVAL) {
    evaluateEconomy(state, context);
    state.lastEconomyFrame = frame;
  }

  if (frame - state.lastStructureFrame >= STRUCTURE_EVAL_INTERVAL) {
    evaluateStructures(state, context);
    state.lastStructureFrame = frame;
  }

  if (frame - state.lastProductionFrame >= PRODUCTION_EVAL_INTERVAL) {
    evaluateProduction(state, context);
    state.lastProductionFrame = frame;
  }

  if (frame - state.lastScoutFrame >= SCOUT_EVAL_INTERVAL) {
    evaluateScout(state, context);
    state.lastScoutFrame = frame;
  }

  if (frame - state.lastCombatFrame >= COMBAT_EVAL_INTERVAL) {
    evaluateCombat(state, context);
    state.lastCombatFrame = frame;
  }
}

// ──── Initialize base position ──────────────────────────────────────────────

function initializeBasePosition<TEntity extends AIEntity>(
  state: SkirmishAIState,
  context: SkirmishAIContext<TEntity>,
): void {
  // Find our structures to set rally point near base.
  const structures = collectEntitiesBySide(
    context.spawnedEntities,
    state.side,
    context.normalizeSide,
    (e) => hasKindOf(e, 'STRUCTURE'),
  );

  if (structures.length > 0) {
    // Average position of structures = base center.
    let sumX = 0;
    let sumZ = 0;
    for (const s of structures) {
      sumX += s.x;
      sumZ += s.z;
    }
    state.rallyX = sumX / structures.length;
    state.rallyZ = sumZ / structures.length;
  } else {
    // Use any owned unit position as fallback.
    const units = collectEntitiesBySide(
      context.spawnedEntities,
      state.side,
      context.normalizeSide,
    );
    const firstUnit = units[0];
    if (firstUnit) {
      state.rallyX = firstUnit.x;
      state.rallyZ = firstUnit.z;
    }
  }
}

// ──── Discover enemy base ───────────────────────────────────────────────────

function discoverEnemyBase<TEntity extends AIEntity>(
  state: SkirmishAIState,
  context: SkirmishAIContext<TEntity>,
): void {
  const normalizedSide = context.normalizeSide(state.side);

  for (const entity of context.spawnedEntities.values()) {
    if (entity.destroyed) {
      continue;
    }

    const entitySide = context.normalizeSide(entity.side);
    if (context.getRelationship(normalizedSide, entitySide) !== 0) {
      continue;
    }

    // Found an enemy entity — use first enemy structure as base, or any enemy unit.
    if (hasKindOf(entity, 'STRUCTURE')) {
      state.enemyBaseX = entity.x;
      state.enemyBaseZ = entity.z;
      state.enemyBaseKnown = true;
      return;
    }

    // Fallback: use first enemy unit found.
    if (!state.enemyBaseKnown) {
      state.enemyBaseX = entity.x;
      state.enemyBaseZ = entity.z;
      state.enemyBaseKnown = true;
    }
  }
}

// ──── Economy evaluation ────────────────────────────────────────────────────

function evaluateEconomy<TEntity extends AIEntity>(
  state: SkirmishAIState,
  context: SkirmishAIContext<TEntity>,
): void {
  // Count our harvesters (supply trucks).
  const harvesters = collectEntitiesBySide(
    context.spawnedEntities,
    state.side,
    context.normalizeSide,
    (e) => hasKindOf(e, 'HARVESTER') || e.templateName.toUpperCase().includes('SUPPLY'),
  );

  if (harvesters.length < DESIRED_HARVESTERS) {
    // Find a factory that can produce harvesters.
    const factories = collectEntitiesBySide(
      context.spawnedEntities,
      state.side,
      context.normalizeSide,
      (e) => context.hasProductionQueue(e) && !context.isProducing(e),
    );

    for (const factory of factories) {
      const producible = context.getProducibleUnits(factory);
      const harvesterTemplate = producible.find(
        name => name.toUpperCase().includes('SUPPLY') || name.toUpperCase().includes('WORKER'),
      );

      if (harvesterTemplate) {
        context.submitCommand({
          type: 'queueUnitProduction',
          entityId: factory.id,
          unitTemplateName: harvesterTemplate,
        });
        break;
      }
    }
  }
}

// ──── Production evaluation ─────────────────────────────────────────────────

function evaluateProduction<TEntity extends AIEntity>(
  state: SkirmishAIState,
  context: SkirmishAIContext<TEntity>,
): void {
  const credits = context.getSideCredits(state.side);
  if (credits < RESOURCES_POOR_THRESHOLD) {
    return; // Save money.
  }

  // Count our combat units (non-structure, non-harvester units that can move).
  const combatUnits = collectEntitiesBySide(
    context.spawnedEntities,
    state.side,
    context.normalizeSide,
    (e) =>
      e.canMove
      && !hasKindOf(e, 'STRUCTURE')
      && !hasKindOf(e, 'HARVESTER')
      && !e.templateName.toUpperCase().includes('SUPPLY')
      && !e.templateName.toUpperCase().includes('DOZER')
      && !e.templateName.toUpperCase().includes('WORKER'),
  );

  // Find idle factories (not currently producing).
  const factories = collectEntitiesBySide(
    context.spawnedEntities,
    state.side,
    context.normalizeSide,
    (e) => context.hasProductionQueue(e) && !context.isProducing(e),
  );

  if (factories.length === 0) {
    return;
  }

  // Source parity: AI builds more aggressively when wealthy.
  const desiredUnits = credits >= RESOURCES_WEALTHY_THRESHOLD ? 12 : 8;

  if (combatUnits.length >= desiredUnits) {
    return; // Have enough.
  }

  // Queue units at idle factories.
  for (const factory of factories) {
    if (credits < RESOURCES_POOR_THRESHOLD) {
      break;
    }

    const producible = context.getProducibleUnits(factory);
    // Filter out harvesters/workers.
    const combatTemplates = producible.filter(
      name =>
        !name.toUpperCase().includes('SUPPLY')
        && !name.toUpperCase().includes('WORKER')
        && !name.toUpperCase().includes('DOZER'),
    );

    if (combatTemplates.length === 0) {
      continue;
    }

    // Simple round-robin selection based on frame counter.
    const templateIndex = context.frameCounter % combatTemplates.length;
    const selectedTemplate = combatTemplates[templateIndex]!;

    context.submitCommand({
      type: 'queueUnitProduction',
      entityId: factory.id,
      unitTemplateName: selectedTemplate,
    });
  }
}

// ──── Combat evaluation ─────────────────────────────────────────────────────

function evaluateCombat<TEntity extends AIEntity>(
  state: SkirmishAIState,
  context: SkirmishAIContext<TEntity>,
): void {
  if (!state.enemyBaseKnown) {
    return;
  }

  // Collect idle combat units (not already attacking or moving).
  const idleCombat = collectEntitiesBySide(
    context.spawnedEntities,
    state.side,
    context.normalizeSide,
    (e) =>
      e.canMove
      && !hasKindOf(e, 'STRUCTURE')
      && !hasKindOf(e, 'HARVESTER')
      && !e.templateName.toUpperCase().includes('SUPPLY')
      && !e.templateName.toUpperCase().includes('DOZER')
      && !e.templateName.toUpperCase().includes('WORKER')
      && e.attackTargetEntityId === null
      && !e.moving,
  );

  // Only attack with minimum force.
  if (idleCombat.length < MIN_ATTACK_FORCE) {
    return;
  }

  // Find nearest enemy structure/unit to attack.
  const target = findPriorityTarget(state, context);
  if (!target) {
    return;
  }

  // Order all idle combat units to attack-move to enemy.
  for (const unit of idleCombat) {
    context.submitCommand({
      type: 'attackEntity',
      entityId: unit.id,
      targetEntityId: target.id,
      commandSource: 'AI',
    });
  }

  state.attackWavesSent++;
}

// ──── Find priority attack target ───────────────────────────────────────────

function findPriorityTarget<TEntity extends AIEntity>(
  state: SkirmishAIState,
  context: SkirmishAIContext<TEntity>,
): TEntity | null {
  const normalizedSide = context.normalizeSide(state.side);
  let bestTarget: TEntity | null = null;
  let bestScore = -Infinity;

  for (const entity of context.spawnedEntities.values()) {
    if (entity.destroyed) {
      continue;
    }

    const entitySide = context.normalizeSide(entity.side);
    if (context.getRelationship(normalizedSide, entitySide) !== 0) {
      continue;
    }

    // Prioritize: structures > vehicles > infantry.
    // Closer targets preferred.
    let score = 0;
    if (hasKindOf(entity, 'STRUCTURE')) {
      score += 100;
    } else if (hasKindOf(entity, 'VEHICLE')) {
      score += 50;
    } else {
      score += 25;
    }

    // Proximity bonus.
    const dist = Math.sqrt(distSquared(state.rallyX, state.rallyZ, entity.x, entity.z));
    score -= dist * 0.1;

    // Low health bonus.
    if (entity.maxHealth > 0) {
      const healthRatio = entity.health / entity.maxHealth;
      score += (1 - healthRatio) * 30;
    }

    if (score > bestScore) {
      bestScore = score;
      bestTarget = entity;
    }
  }

  return bestTarget;
}

// ──── Structure build-order evaluation ────────────────────────────────────────

// Generic build order priorities by keyword match.
// Source parity: AISkirmishPlayer.cpp tracks build list templates.
const BUILD_ORDER_KEYWORDS = [
  'POWERPLANT', 'REACTOR', 'COLDFU',
  'BARRACKS', 'ARMSTRAINING',
  'WARFACTORY', 'ARMSFACTORY',
  'SUPPLYC',
  'AIRFIELD', 'STRATCENTER', 'COMMANDCENTER',
  'RADAR',
];

function evaluateStructures<TEntity extends AIEntity>(
  state: SkirmishAIState,
  context: SkirmishAIContext<TEntity>,
): void {
  const credits = context.getSideCredits(state.side);
  if (credits < RESOURCES_POOR_THRESHOLD) return;

  const dozers = context.getDozers(state.side);
  if (dozers.length === 0) return;

  // Find idle dozer.
  const idleDozer = dozers.find((d) => !context.isDozerBusy(d));
  if (!idleDozer) return;

  const buildable = context.getBuildableStructures(idleDozer);
  if (buildable.length === 0) return;

  // Check existing structures to determine what we have.
  const ownedStructures = collectEntitiesBySide(
    context.spawnedEntities, state.side, context.normalizeSide,
    (e) => hasKindOf(e, 'STRUCTURE'),
  );
  const ownedNames = new Set(ownedStructures.map((s) => s.templateName.toUpperCase()));

  // Walk the build order and find the first structure we don't have.
  for (const keyword of BUILD_ORDER_KEYWORDS) {
    // Check if we already own a structure matching this keyword.
    let alreadyHave = false;
    for (const name of ownedNames) {
      if (name.includes(keyword)) {
        alreadyHave = true;
        break;
      }
    }
    if (alreadyHave) continue;

    // Find a buildable template matching the keyword.
    const template = buildable.find(
      (name) => name.toUpperCase().includes(keyword),
    );
    if (!template) continue;

    // Place structure near base center with an offset.
    const offsetAngle = state.buildOrderPhase * 0.7;
    const offsetDist = 15 + state.buildOrderPhase * 5;
    const placeX = state.rallyX + Math.cos(offsetAngle) * offsetDist;
    const placeZ = state.rallyZ + Math.sin(offsetAngle) * offsetDist;

    context.submitCommand({
      type: 'constructBuilding',
      entityId: idleDozer.id,
      templateName: template,
      targetPosition: [placeX, 0, placeZ],
      angle: 0,
      lineEndPosition: null,
    });
    state.buildOrderPhase = (state.buildOrderPhase + 1) % 20;
    return;
  }
}

// ──── Defense evaluation (retreat damaged units, defend base) ─────────────────

function evaluateDefense<TEntity extends AIEntity>(
  state: SkirmishAIState,
  context: SkirmishAIContext<TEntity>,
): void {
  const normalizedSide = context.normalizeSide(state.side);

  // Check for enemy units near our base.
  let baseThreat = false;
  for (const entity of context.spawnedEntities.values()) {
    if (entity.destroyed) continue;
    const entitySide = context.normalizeSide(entity.side);
    if (context.getRelationship(normalizedSide, entitySide) !== 0) continue;

    const distSqToBase = distSquared(state.rallyX, state.rallyZ, entity.x, entity.z);
    if (distSqToBase < DEFENSE_RADIUS * DEFENSE_RADIUS) {
      baseThreat = true;
      break;
    }
  }

  if (baseThreat) {
    state.lastBaseThreatFrame = context.frameCounter;

    // Rally idle combat units back to defend base.
    const combatUnits = collectEntitiesBySide(
      context.spawnedEntities, state.side, context.normalizeSide,
      (e) => e.canMove
        && !hasKindOf(e, 'STRUCTURE')
        && !hasKindOf(e, 'HARVESTER')
        && !e.templateName.toUpperCase().includes('SUPPLY')
        && !e.templateName.toUpperCase().includes('DOZER')
        && !e.templateName.toUpperCase().includes('WORKER')
        && e.attackTargetEntityId === null
        && !e.moving,
    );

    for (const unit of combatUnits) {
      context.submitCommand({
        type: 'attackMoveTo',
        entityId: unit.id,
        targetX: state.rallyX,
        targetZ: state.rallyZ,
        attackDistance: 30,
      });
    }
  }

  // Retreat badly damaged units.
  const ownUnits = collectEntitiesBySide(
    context.spawnedEntities, state.side, context.normalizeSide,
    (e) => e.canMove && !hasKindOf(e, 'STRUCTURE'),
  );

  for (const unit of ownUnits) {
    if (unit.maxHealth <= 0) continue;
    const healthRatio = unit.health / unit.maxHealth;
    if (healthRatio < RETREAT_HEALTH_RATIO && unit.attackTargetEntityId !== null) {
      // Retreat to base.
      context.submitCommand({
        type: 'moveTo',
        entityId: unit.id,
        targetX: state.rallyX,
        targetZ: state.rallyZ,
      });
    }
  }
}

// ──── Scouting evaluation ───────────────────────────────────────────────────

function evaluateScout<TEntity extends AIEntity>(
  state: SkirmishAIState,
  context: SkirmishAIContext<TEntity>,
): void {
  // Initialize scout waypoints if not done.
  if (state.scoutWaypoints.length === 0) {
    const dims = context.getWorldDimensions();
    if (!dims) return;
    const w = dims.width;
    const d = dims.depth;
    // Generate exploration waypoints around the map.
    state.scoutWaypoints = [
      { x: w * 0.25, z: d * 0.25 },
      { x: w * 0.75, z: d * 0.25 },
      { x: w * 0.75, z: d * 0.75 },
      { x: w * 0.25, z: d * 0.75 },
      { x: w * 0.5, z: d * 0.5 },
      { x: w * 0.1, z: d * 0.5 },
      { x: w * 0.9, z: d * 0.5 },
      { x: w * 0.5, z: d * 0.1 },
      { x: w * 0.5, z: d * 0.9 },
    ];
  }

  // Check if current scout is still alive.
  if (state.scoutEntityId >= 0) {
    const scout = context.spawnedEntities.get(state.scoutEntityId);
    if (!scout || scout.destroyed) {
      state.scoutEntityId = -1;
    }
  }

  // Assign a new scout if needed.
  if (state.scoutEntityId < 0) {
    const candidates = collectEntitiesBySide(
      context.spawnedEntities, state.side, context.normalizeSide,
      (e) => e.canMove
        && !hasKindOf(e, 'STRUCTURE')
        && !hasKindOf(e, 'HARVESTER')
        && !e.templateName.toUpperCase().includes('SUPPLY')
        && !e.templateName.toUpperCase().includes('DOZER')
        && !e.templateName.toUpperCase().includes('WORKER')
        && e.attackTargetEntityId === null
        && !e.moving,
    );

    if (candidates.length > 0) {
      state.scoutEntityId = candidates[0]!.id;
    }
  }

  // Send scout to next waypoint.
  if (state.scoutEntityId >= 0 && state.scoutWaypoints.length > 0) {
    const scout = context.spawnedEntities.get(state.scoutEntityId);
    if (scout && !scout.destroyed && !scout.moving) {
      const wp = state.scoutWaypoints[state.scoutWaypointIndex % state.scoutWaypoints.length]!;
      context.submitCommand({
        type: 'moveTo',
        entityId: state.scoutEntityId,
        targetX: wp.x,
        targetZ: wp.z,
      });
      state.scoutWaypointIndex++;
    }
  }
}
