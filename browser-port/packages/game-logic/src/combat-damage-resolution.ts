interface ContinueAttackCandidateLike {
  id: number;
  x: number;
  z: number;
  destroyed: boolean;
  canTakeDamage: boolean;
  controllingPlayerToken: string | null;
}

interface ProjectileCollisionEntityLike {
  obstacleGeometry: { majorRadius: number; minorRadius: number } | null;
  obstacleFootprint: number;
  pathDiameter: number;
}

interface ProjectileIncidentalCandidateLike {
  id: number;
  x: number;
  z: number;
  destroyed: boolean;
  canTakeDamage: boolean;
}

interface ProjectileCollisionWeaponLike {
  damageType: string;
  projectileCollideMask: number;
}

interface ProjectileCollisionLauncherLike {
  id: number;
  side?: string;
}

interface ProjectileCollisionCandidateLike extends ProjectileIncidentalCandidateLike {
  side?: string;
  objectStatusFlags: Set<string>;
  parkingPlaceProfile: { occupiedSpaceEntityIds: Set<number> } | null;
  parkingSpaceProducerId: number | null;
}

interface ProjectileCollisionMasksLike {
  collideAllies: number;
  collideEnemies: number;
  collideControlledStructures: number;
  collideStructures: number;
  collideShrubbery: number;
  collideProjectile: number;
  collideWalls: number;
  collideSmallMissiles: number;
  collideBallisticMissiles: number;
}

interface ProjectileCollisionRelationshipLike {
  allies: number;
  enemies: number;
}

interface VectorXZ {
  x: number;
  z: number;
}

export function findContinueAttackVictim<TCandidate extends ContinueAttackCandidateLike>(
  attackerId: number,
  destroyedVictimId: number,
  victimPlayerToken: string | null,
  originalVictimPosition: VectorXZ,
  continueRange: number,
  candidates: Iterable<TCandidate>,
  canAttackerTarget: (candidate: TCandidate) => boolean,
): TCandidate | null {
  if (!victimPlayerToken) {
    return null;
  }

  const continueRangeSqr = continueRange * continueRange;
  let bestCandidate: TCandidate | null = null;
  let bestDistanceSqr = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.destroyed || !candidate.canTakeDamage) {
      continue;
    }
    if (candidate.id === attackerId || candidate.id === destroyedVictimId) {
      continue;
    }
    if (!canAttackerTarget(candidate)) {
      continue;
    }
    if (candidate.controllingPlayerToken !== victimPlayerToken) {
      continue;
    }

    const dx = candidate.x - originalVictimPosition.x;
    const dz = candidate.z - originalVictimPosition.z;
    const distanceSqr = (dx * dx) + (dz * dz);
    if (distanceSqr > continueRangeSqr) {
      continue;
    }

    if (
      !bestCandidate
      || distanceSqr < bestDistanceSqr
      || (distanceSqr === bestDistanceSqr && candidate.id < bestCandidate.id)
    ) {
      bestCandidate = candidate;
      bestDistanceSqr = distanceSqr;
    }
  }

  return bestCandidate;
}

export function resolveProjectilePointCollisionRadius(
  entity: ProjectileCollisionEntityLike,
  mapXyFactor: number,
): number {
  if (entity.obstacleGeometry) {
    return Math.max(0, Math.max(entity.obstacleGeometry.majorRadius, entity.obstacleGeometry.minorRadius));
  }
  if (entity.obstacleFootprint > 0) {
    return entity.obstacleFootprint * (mapXyFactor * 0.5);
  }
  if (entity.pathDiameter > 0) {
    return Math.max(mapXyFactor * 0.5, entity.pathDiameter * (mapXyFactor * 0.5));
  }
  return mapXyFactor * 0.5;
}

export function resolveProjectileIncidentalVictimForPointImpact<TCandidate extends ProjectileIncidentalCandidateLike>(
  candidates: Iterable<TCandidate>,
  intendedVictimId: number | null,
  impactX: number,
  impactZ: number,
  resolveCollisionRadius: (candidate: TCandidate) => number,
  shouldProjectileCollideWithEntity: (candidate: TCandidate) => boolean,
): TCandidate | null {
  const filtered: TCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.destroyed || !candidate.canTakeDamage) {
      continue;
    }
    if (intendedVictimId !== null && candidate.id === intendedVictimId) {
      continue;
    }
    filtered.push(candidate);
  }
  filtered.sort((left, right) => left.id - right.id);

  for (const candidate of filtered) {
    const collisionRadius = resolveCollisionRadius(candidate);
    const dx = candidate.x - impactX;
    const dz = candidate.z - impactZ;
    const distanceSqr = dx * dx + dz * dz;
    if (distanceSqr > collisionRadius * collisionRadius) {
      continue;
    }
    if (!shouldProjectileCollideWithEntity(candidate)) {
      continue;
    }
    return candidate;
  }

  return null;
}

export function isAirfieldReservedForProjectileVictim<
  TCandidate extends Pick<ProjectileCollisionCandidateLike, 'id' | 'parkingPlaceProfile' | 'parkingSpaceProducerId'>,
>(
  candidate: TCandidate,
  candidateKindOf: Set<string>,
  intendedVictimId: number | null,
  resolveEntityById: (entityId: number) => TCandidate | null,
): boolean {
  if (intendedVictimId === null) {
    return false;
  }
  if (!candidateKindOf.has('FS_AIRFIELD')) {
    return false;
  }

  const parkingProfile = candidate.parkingPlaceProfile;
  if (!parkingProfile) {
    return false;
  }

  if (parkingProfile.occupiedSpaceEntityIds.has(intendedVictimId)) {
    return true;
  }

  const intendedVictim = resolveEntityById(intendedVictimId);
  if (intendedVictim?.parkingSpaceProducerId === candidate.id) {
    return true;
  }
  return false;
}

export function shouldProjectileCollideWithEntity<
  TLauncher extends ProjectileCollisionLauncherLike,
  TCandidate extends ProjectileCollisionCandidateLike,
>(
  projectileLauncher: TLauncher | null,
  weapon: ProjectileCollisionWeaponLike,
  candidate: TCandidate,
  intendedVictimId: number | null,
  resolveProjectileLauncherContainer: (launcher: TLauncher) => { id: number } | null,
  resolveEntityKindOfSet: (candidate: TCandidate) => Set<string>,
  isAirfieldReservedForProjectileVictimFn: (
    candidate: TCandidate,
    candidateKindOf: Set<string>,
    intendedVictimId: number | null,
  ) => boolean,
  entityHasSneakyTargetingOffset: (candidate: TCandidate) => boolean,
  getTeamRelationship: (launcher: TLauncher, candidate: TCandidate) => number,
  normalizeSide: (side: string | undefined) => string | null,
  resolveEntityFenceWidth: (candidate: TCandidate) => number,
  relationshipMasks: ProjectileCollisionRelationshipLike,
  collisionMasks: ProjectileCollisionMasksLike,
): boolean {
  if (intendedVictimId !== null && candidate.id === intendedVictimId) {
    return true;
  }
  if (projectileLauncher && projectileLauncher.id === candidate.id) {
    return false;
  }

  if (projectileLauncher) {
    const launcherContainer = resolveProjectileLauncherContainer(projectileLauncher);
    if (launcherContainer && launcherContainer.id === candidate.id) {
      return false;
    }
  }

  if (
    (weapon.damageType === 'FLAME' || weapon.damageType === 'PARTICLE_BEAM')
    && candidate.objectStatusFlags.has('BURNED')
  ) {
    return false;
  }

  const kindOf = resolveEntityKindOfSet(candidate);
  if (isAirfieldReservedForProjectileVictimFn(candidate, kindOf, intendedVictimId)) {
    return false;
  }
  if (entityHasSneakyTargetingOffset(candidate)) {
    return false;
  }

  let requiredMask = 0;
  if (projectileLauncher) {
    const relationship = getTeamRelationship(projectileLauncher, candidate);
    if (relationship === relationshipMasks.allies) {
      requiredMask |= collisionMasks.collideAllies;
    } else if (relationship === relationshipMasks.enemies) {
      requiredMask |= collisionMasks.collideEnemies;
    }
  }

  if (kindOf.has('STRUCTURE')) {
    const launcherSide = normalizeSide(projectileLauncher?.side);
    const candidateSide = normalizeSide(candidate.side);
    if (launcherSide && candidateSide && launcherSide === candidateSide) {
      requiredMask |= collisionMasks.collideControlledStructures;
    } else {
      requiredMask |= collisionMasks.collideStructures;
    }
  }
  if (kindOf.has('SHRUBBERY')) {
    requiredMask |= collisionMasks.collideShrubbery;
  }
  if (kindOf.has('PROJECTILE')) {
    requiredMask |= collisionMasks.collideProjectile;
  }
  if (resolveEntityFenceWidth(candidate) > 0) {
    requiredMask |= collisionMasks.collideWalls;
  }
  if (kindOf.has('SMALL_MISSILE')) {
    requiredMask |= collisionMasks.collideSmallMissiles;
  }
  if (kindOf.has('BALLISTIC_MISSILE')) {
    requiredMask |= collisionMasks.collideBallisticMissiles;
  }

  if (requiredMask === 0) {
    return false;
  }
  return (weapon.projectileCollideMask & requiredMask) !== 0;
}
