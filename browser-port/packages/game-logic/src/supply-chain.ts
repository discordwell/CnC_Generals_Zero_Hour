/**
 * Supply chain economy — harvester/warehouse/supply-center gather–deposit cycle.
 *
 * Source parity:
 *   Generals/Code/GameEngine/Source/GameLogic/Object/Update/DockUpdate/SupplyWarehouseDockUpdate.cpp
 *   Generals/Code/GameEngine/Source/GameLogic/Object/Update/AIUpdate/SupplyTruckAIUpdate.cpp
 *   Generals/Code/GameEngine/Source/GameLogic/Object/Update/DockUpdate/SupplyCenterDockUpdate.cpp
 *   Generals/Code/GameEngine/Source/Common/RTS/Player.cpp — getSupplyBoxValue()
 *   Generals/Code/GameEngine/Source/Common/GlobalData.cpp — m_baseValuePerSupplyBox = 100
 */

// Source parity: default from GlobalData.cpp:747
export const DEFAULT_SUPPLY_BOX_VALUE = 100;

// ──── Supply truck AI state machine ────────────────────────────────────────
export const enum SupplyTruckAIState {
  /** No orders — look for nearest warehouse with boxes. */
  IDLE = 0,
  /** Moving towards a supply warehouse to pick up boxes. */
  APPROACHING_WAREHOUSE = 1,
  /** Docked at warehouse, picking up boxes (1 per action delay). */
  GATHERING = 2,
  /** Moving towards supply center to deposit boxes. */
  APPROACHING_DEPOT = 3,
  /** Docked at supply center, depositing boxes → money. */
  DEPOSITING = 4,
  /** Waiting because no warehouse or depot is available. */
  WAITING = 5,
}

// ──── Profile interfaces (extracted from INI Behavior blocks) ──────────────
export interface SupplyWarehouseProfile {
  startingBoxes: number;
  deleteWhenEmpty: boolean;
}

export interface SupplyTruckProfile {
  maxBoxes: number;
  supplyCenterActionDelayFrames: number;
  supplyWarehouseActionDelayFrames: number;
  supplyWarehouseScanDistance: number;
}

// ──── Per-entity runtime state ─────────────────────────────────────────────
export interface SupplyWarehouseState {
  currentBoxes: number;
}

export interface SupplyTruckState {
  aiState: SupplyTruckAIState;
  currentBoxes: number;
  targetWarehouseId: number | null;
  targetDepotId: number | null;
  actionDelayFinishFrame: number;
}

// ──── Entity abstraction for supply chain logic ────────────────────────────
export interface SupplyChainEntity {
  id: number;
  side?: string;
  x: number;
  z: number;
  destroyed: boolean;
  moving: boolean;
  moveTarget: { x: number; z: number } | null;
}

// ──── Context interface (provided by GameLogicSubsystem) ───────────────────
export interface SupplyChainContext<TEntity extends SupplyChainEntity> {
  readonly frameCounter: number;
  readonly spawnedEntities: ReadonlyMap<number, TEntity>;

  /** Resolve the INI-based warehouse profile for an entity. Null → not a warehouse. */
  getWarehouseProfile(entity: TEntity): SupplyWarehouseProfile | null;
  /** Resolve the INI-based truck profile for an entity. Null → not a truck. */
  getTruckProfile(entity: TEntity): SupplyTruckProfile | null;
  /** Check if an entity is a supply center (has SupplyCenterDockUpdate). */
  isSupplyCenter(entity: TEntity): boolean;

  /** Get/set warehouse runtime state. */
  getWarehouseState(entityId: number): SupplyWarehouseState | undefined;
  setWarehouseState(entityId: number, state: SupplyWarehouseState): void;

  /** Get/set truck runtime state. */
  getTruckState(entityId: number): SupplyTruckState | undefined;
  setTruckState(entityId: number, state: SupplyTruckState): void;

  /** Deposit credits to a side. */
  depositCredits(side: string, amount: number): void;

  /** Issue a move-to command for an entity. */
  moveEntityTo(entityId: number, targetX: number, targetZ: number): void;

  /** Mark an entity for destruction. */
  destroyEntity(entityId: number): void;

  /** Normalize side string. */
  normalizeSide(side: string | undefined): string;

  /** Value per supply box for this context (from INI GlobalData or default). */
  readonly supplyBoxValue: number;
}

// ──── Distance helpers ─────────────────────────────────────────────────────
function distSquared(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

const DOCK_PROXIMITY_THRESHOLD_SQ = 25 * 25; // 25 world-units arrival radius

// ──── Find nearest warehouse with boxes within scan distance ───────────────
export function findNearestWarehouseWithBoxes<TEntity extends SupplyChainEntity>(
  truck: TEntity,
  scanDistance: number,
  context: SupplyChainContext<TEntity>,
): TEntity | null {
  const scanDistSq = scanDistance * scanDistance;
  let bestEntity: TEntity | null = null;
  let bestDistSq = Infinity;
  const truckSide = context.normalizeSide(truck.side);

  for (const entity of context.spawnedEntities.values()) {
    if (entity.destroyed) {
      continue;
    }
    if (context.normalizeSide(entity.side) !== truckSide) {
      continue;
    }

    const profile = context.getWarehouseProfile(entity);
    if (!profile) {
      continue;
    }

    const warehouseState = context.getWarehouseState(entity.id);
    if (!warehouseState || warehouseState.currentBoxes <= 0) {
      continue;
    }

    const dSq = distSquared(truck.x, truck.z, entity.x, entity.z);
    if (dSq <= scanDistSq && dSq < bestDistSq) {
      bestDistSq = dSq;
      bestEntity = entity;
    }
  }

  return bestEntity;
}

// ──── Find nearest supply center ───────────────────────────────────────────
export function findNearestSupplyCenter<TEntity extends SupplyChainEntity>(
  truck: TEntity,
  context: SupplyChainContext<TEntity>,
): TEntity | null {
  let bestEntity: TEntity | null = null;
  let bestDistSq = Infinity;
  const truckSide = context.normalizeSide(truck.side);

  for (const entity of context.spawnedEntities.values()) {
    if (entity.destroyed) {
      continue;
    }
    if (context.normalizeSide(entity.side) !== truckSide) {
      continue;
    }
    if (!context.isSupplyCenter(entity)) {
      continue;
    }

    const dSq = distSquared(truck.x, truck.z, entity.x, entity.z);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestEntity = entity;
    }
  }

  return bestEntity;
}

// ──── Check if entity has arrived near target ──────────────────────────────
function isNearTarget(entity: SupplyChainEntity, targetEntity: SupplyChainEntity): boolean {
  return distSquared(entity.x, entity.z, targetEntity.x, targetEntity.z) <= DOCK_PROXIMITY_THRESHOLD_SQ;
}

// ──── Main per-frame update for a single supply truck ──────────────────────
export function updateSupplyTruck<TEntity extends SupplyChainEntity>(
  truck: TEntity,
  truckProfile: SupplyTruckProfile,
  context: SupplyChainContext<TEntity>,
): void {
  let state = context.getTruckState(truck.id);
  if (!state) {
    state = {
      aiState: SupplyTruckAIState.IDLE,
      currentBoxes: 0,
      targetWarehouseId: null,
      targetDepotId: null,
      actionDelayFinishFrame: 0,
    };
    context.setTruckState(truck.id, state);
  }

  switch (state.aiState) {
    case SupplyTruckAIState.IDLE:
      tickIdle(truck, truckProfile, state, context);
      break;
    case SupplyTruckAIState.APPROACHING_WAREHOUSE:
      tickApproachingWarehouse(truck, truckProfile, state, context);
      break;
    case SupplyTruckAIState.GATHERING:
      tickGathering(truck, truckProfile, state, context);
      break;
    case SupplyTruckAIState.APPROACHING_DEPOT:
      tickApproachingDepot(truck, state, context);
      break;
    case SupplyTruckAIState.DEPOSITING:
      tickDepositing(truck, truckProfile, state, context);
      break;
    case SupplyTruckAIState.WAITING:
      tickWaiting(truck, truckProfile, state, context);
      break;
  }
}

// ──── State machine ticks ──────────────────────────────────────────────────

function tickIdle<TEntity extends SupplyChainEntity>(
  truck: TEntity,
  truckProfile: SupplyTruckProfile,
  state: SupplyTruckState,
  context: SupplyChainContext<TEntity>,
): void {
  // If we have boxes, go deposit them.
  if (state.currentBoxes > 0) {
    const depot = findNearestSupplyCenter(truck, context);
    if (depot) {
      state.targetDepotId = depot.id;
      state.aiState = SupplyTruckAIState.APPROACHING_DEPOT;
      context.moveEntityTo(truck.id, depot.x, depot.z);
      return;
    }
    // No depot available — wait.
    state.aiState = SupplyTruckAIState.WAITING;
    state.actionDelayFinishFrame = context.frameCounter + 30;
    return;
  }

  // Otherwise find a warehouse to gather from.
  const warehouse = findNearestWarehouseWithBoxes(truck, truckProfile.supplyWarehouseScanDistance, context);
  if (warehouse) {
    state.targetWarehouseId = warehouse.id;
    state.aiState = SupplyTruckAIState.APPROACHING_WAREHOUSE;
    context.moveEntityTo(truck.id, warehouse.x, warehouse.z);
    return;
  }

  // No warehouse with boxes — wait and retry.
  state.aiState = SupplyTruckAIState.WAITING;
  state.actionDelayFinishFrame = context.frameCounter + 60;
}

function tickApproachingWarehouse<TEntity extends SupplyChainEntity>(
  truck: TEntity,
  truckProfile: SupplyTruckProfile,
  state: SupplyTruckState,
  context: SupplyChainContext<TEntity>,
): void {
  if (state.targetWarehouseId === null) {
    state.aiState = SupplyTruckAIState.IDLE;
    return;
  }

  const warehouse = context.spawnedEntities.get(state.targetWarehouseId);
  if (!warehouse || warehouse.destroyed) {
    state.targetWarehouseId = null;
    state.aiState = SupplyTruckAIState.IDLE;
    return;
  }

  // Check if warehouse still has boxes.
  const warehouseState = context.getWarehouseState(warehouse.id);
  if (!warehouseState || warehouseState.currentBoxes <= 0) {
    state.targetWarehouseId = null;
    state.aiState = SupplyTruckAIState.IDLE;
    return;
  }

  if (isNearTarget(truck, warehouse)) {
    state.aiState = SupplyTruckAIState.GATHERING;
    state.actionDelayFinishFrame = context.frameCounter + truckProfile.supplyWarehouseActionDelayFrames;
  }
}

function tickGathering<TEntity extends SupplyChainEntity>(
  truck: TEntity,
  truckProfile: SupplyTruckProfile,
  state: SupplyTruckState,
  context: SupplyChainContext<TEntity>,
): void {
  if (context.frameCounter < state.actionDelayFinishFrame) {
    return;
  }

  if (state.targetWarehouseId === null) {
    state.aiState = SupplyTruckAIState.IDLE;
    return;
  }

  const warehouse = context.spawnedEntities.get(state.targetWarehouseId);
  if (!warehouse || warehouse.destroyed) {
    state.targetWarehouseId = null;
    // Go deposit whatever we have.
    if (state.currentBoxes > 0) {
      transitionToDeposit(truck, state, context);
    } else {
      state.aiState = SupplyTruckAIState.IDLE;
    }
    return;
  }

  const warehouseProfile = context.getWarehouseProfile(warehouse);
  const warehouseState = context.getWarehouseState(warehouse.id);
  if (!warehouseState || !warehouseProfile) {
    state.aiState = SupplyTruckAIState.IDLE;
    return;
  }

  // Source parity: transfer 1 box per action cycle.
  if (warehouseState.currentBoxes > 0 && state.currentBoxes < truckProfile.maxBoxes) {
    warehouseState.currentBoxes--;
    state.currentBoxes++;
    context.setWarehouseState(warehouse.id, warehouseState);

    // If warehouse empty and flagged, destroy it.
    if (warehouseState.currentBoxes <= 0 && warehouseProfile.deleteWhenEmpty) {
      context.destroyEntity(warehouse.id);
    }

    // If truck not full and warehouse not empty, schedule next pick-up.
    if (state.currentBoxes < truckProfile.maxBoxes && warehouseState.currentBoxes > 0) {
      state.actionDelayFinishFrame = context.frameCounter + truckProfile.supplyWarehouseActionDelayFrames;
      return;
    }
  }

  // Truck is full or warehouse is empty — go deposit.
  state.targetWarehouseId = null;
  if (state.currentBoxes > 0) {
    transitionToDeposit(truck, state, context);
  } else {
    state.aiState = SupplyTruckAIState.IDLE;
  }
}

function transitionToDeposit<TEntity extends SupplyChainEntity>(
  truck: TEntity,
  state: SupplyTruckState,
  context: SupplyChainContext<TEntity>,
): void {
  const depot = findNearestSupplyCenter(truck, context);
  if (depot) {
    state.targetDepotId = depot.id;
    state.aiState = SupplyTruckAIState.APPROACHING_DEPOT;
    context.moveEntityTo(truck.id, depot.x, depot.z);
  } else {
    state.aiState = SupplyTruckAIState.WAITING;
    state.actionDelayFinishFrame = context.frameCounter + 30;
  }
}

function tickApproachingDepot<TEntity extends SupplyChainEntity>(
  truck: TEntity,
  state: SupplyTruckState,
  context: SupplyChainContext<TEntity>,
): void {
  if (state.targetDepotId === null) {
    state.aiState = SupplyTruckAIState.IDLE;
    return;
  }

  const depot = context.spawnedEntities.get(state.targetDepotId);
  if (!depot || depot.destroyed) {
    state.targetDepotId = null;
    // Try another depot.
    transitionToDeposit(truck, state, context);
    return;
  }

  if (isNearTarget(truck, depot)) {
    state.aiState = SupplyTruckAIState.DEPOSITING;
    state.actionDelayFinishFrame = context.frameCounter;
  }
}

function tickDepositing<TEntity extends SupplyChainEntity>(
  truck: TEntity,
  truckProfile: SupplyTruckProfile,
  state: SupplyTruckState,
  context: SupplyChainContext<TEntity>,
): void {
  if (context.frameCounter < state.actionDelayFinishFrame) {
    return;
  }

  if (state.targetDepotId === null) {
    state.aiState = SupplyTruckAIState.IDLE;
    return;
  }

  const depot = context.spawnedEntities.get(state.targetDepotId);
  if (!depot || depot.destroyed) {
    state.targetDepotId = null;
    state.aiState = SupplyTruckAIState.IDLE;
    return;
  }

  // Source parity: deposit all boxes at once.
  // SupplyCenterDockUpdate::action() loops loseOneBox() and accumulates value.
  if (state.currentBoxes > 0) {
    const side = context.normalizeSide(truck.side);
    const totalValue = state.currentBoxes * context.supplyBoxValue;
    state.currentBoxes = 0;
    context.depositCredits(side, totalValue);
  }

  // Done depositing — schedule action delay then go back for more.
  state.targetDepotId = null;
  state.actionDelayFinishFrame = context.frameCounter + truckProfile.supplyCenterActionDelayFrames;
  state.aiState = SupplyTruckAIState.IDLE;
}

function tickWaiting<TEntity extends SupplyChainEntity>(
  truck: TEntity,
  truckProfile: SupplyTruckProfile,
  state: SupplyTruckState,
  context: SupplyChainContext<TEntity>,
): void {
  if (context.frameCounter < state.actionDelayFinishFrame) {
    return;
  }

  // Retry — transition back to IDLE to re-evaluate.
  state.aiState = SupplyTruckAIState.IDLE;
  tickIdle(truck, truckProfile, state, context);
}

// ──── Initialize warehouse state from profile ──────────────────────────────
export function initializeWarehouseState(profile: SupplyWarehouseProfile): SupplyWarehouseState {
  return {
    currentBoxes: Math.max(0, Math.trunc(profile.startingBoxes)),
  };
}
