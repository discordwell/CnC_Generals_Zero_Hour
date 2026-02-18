interface ParkingPlaceProfileLike {
  totalSpaces: number;
  occupiedSpaceEntityIds: Set<number>;
  reservedProductionIds: Set<number>;
}

interface ProductionQueueEntryLike {
  type: string;
  productionId: number;
}

interface SpawnedEntityLike {
  destroyed: boolean;
}

function normalizeKindOf(kindOf: readonly string[] | undefined): Set<string> {
  const normalized = new Set<string>();
  if (!Array.isArray(kindOf)) {
    return normalized;
  }
  for (const token of kindOf) {
    const nextToken = token.trim().toUpperCase();
    if (nextToken) {
      normalized.add(nextToken);
    }
  }
  return normalized;
}

export function shouldReserveParkingDoorWhenQueued(kindOf: readonly string[] | undefined): boolean {
  // Source parity: ParkingPlaceBehavior::shouldReserveDoorWhenQueued() bypasses parking
  // reservation for KINDOF_PRODUCED_AT_HELIPAD units.
  return !normalizeKindOf(kindOf).has('PRODUCED_AT_HELIPAD');
}

export function releaseParkingDoorReservationForProduction(
  parkingProfile: ParkingPlaceProfileLike | null,
  productionId: number,
): void {
  parkingProfile?.reservedProductionIds.delete(productionId);
}

export function pruneParkingReservations(
  parkingProfile: ParkingPlaceProfileLike | null,
  productionQueue: readonly ProductionQueueEntryLike[],
): void {
  if (!parkingProfile || parkingProfile.reservedProductionIds.size === 0) {
    return;
  }

  const activeUnitProductionIds = new Set<number>();
  for (const entry of productionQueue) {
    if (entry.type === 'UNIT') {
      activeUnitProductionIds.add(entry.productionId);
    }
  }

  for (const reservedProductionId of Array.from(parkingProfile.reservedProductionIds.values())) {
    if (!activeUnitProductionIds.has(reservedProductionId)) {
      parkingProfile.reservedProductionIds.delete(reservedProductionId);
    }
  }
}

export function pruneParkingOccupancy(
  parkingProfile: ParkingPlaceProfileLike | null,
  spawnedEntities: ReadonlyMap<number, SpawnedEntityLike>,
): void {
  if (!parkingProfile) {
    return;
  }

  for (const occupiedEntityId of Array.from(parkingProfile.occupiedSpaceEntityIds.values())) {
    const occupiedEntity = spawnedEntities.get(occupiedEntityId);
    if (!occupiedEntity || occupiedEntity.destroyed) {
      parkingProfile.occupiedSpaceEntityIds.delete(occupiedEntityId);
    }
  }
}

function refreshParkingState(
  parkingProfile: ParkingPlaceProfileLike,
  productionQueue: readonly ProductionQueueEntryLike[],
  spawnedEntities: ReadonlyMap<number, SpawnedEntityLike>,
): void {
  pruneParkingOccupancy(parkingProfile, spawnedEntities);
  pruneParkingReservations(parkingProfile, productionQueue);
}

export function hasAvailableParkingSpace(
  parkingProfile: ParkingPlaceProfileLike | null,
  productionQueue: readonly ProductionQueueEntryLike[],
  spawnedEntities: ReadonlyMap<number, SpawnedEntityLike>,
): boolean {
  if (!parkingProfile) {
    return true;
  }

  refreshParkingState(parkingProfile, productionQueue, spawnedEntities);
  return (parkingProfile.occupiedSpaceEntityIds.size + parkingProfile.reservedProductionIds.size)
    < parkingProfile.totalSpaces;
}

export function reserveParkingDoorForQueuedUnit(
  parkingProfile: ParkingPlaceProfileLike | null,
  productionQueue: readonly ProductionQueueEntryLike[],
  spawnedEntities: ReadonlyMap<number, SpawnedEntityLike>,
  productionId: number,
): boolean {
  if (!parkingProfile) {
    return true;
  }

  refreshParkingState(parkingProfile, productionQueue, spawnedEntities);
  if ((parkingProfile.occupiedSpaceEntityIds.size + parkingProfile.reservedProductionIds.size) >= parkingProfile.totalSpaces) {
    return false;
  }

  // Source parity subset: ProductionUpdate::queueCreateUnit() reserves an exit door up front
  // via ParkingPlaceBehavior::reserveDoorForExit() for units that require hangar parking.
  parkingProfile.reservedProductionIds.add(productionId);
  return true;
}

export function canExitProducedUnitViaParking(
  parkingProfile: ParkingPlaceProfileLike | null,
  productionQueue: readonly ProductionQueueEntryLike[],
  spawnedEntities: ReadonlyMap<number, SpawnedEntityLike>,
  productionId: number,
): boolean {
  if (!parkingProfile) {
    return true;
  }

  refreshParkingState(parkingProfile, productionQueue, spawnedEntities);
  if (parkingProfile.reservedProductionIds.has(productionId)) {
    return true;
  }

  return (parkingProfile.occupiedSpaceEntityIds.size + parkingProfile.reservedProductionIds.size)
    < parkingProfile.totalSpaces;
}

export function reserveParkingSpaceForProducedUnit(
  parkingProfile: ParkingPlaceProfileLike | null,
  productionQueue: readonly ProductionQueueEntryLike[],
  spawnedEntities: ReadonlyMap<number, SpawnedEntityLike>,
  productionId: number,
  producedUnitId: number,
): boolean {
  if (!parkingProfile) {
    return true;
  }

  refreshParkingState(parkingProfile, productionQueue, spawnedEntities);
  if (parkingProfile.reservedProductionIds.has(productionId)) {
    parkingProfile.reservedProductionIds.delete(productionId);
  } else if ((parkingProfile.occupiedSpaceEntityIds.size + parkingProfile.reservedProductionIds.size) >= parkingProfile.totalSpaces) {
    return false;
  }

  parkingProfile.occupiedSpaceEntityIds.add(producedUnitId);
  return true;
}
