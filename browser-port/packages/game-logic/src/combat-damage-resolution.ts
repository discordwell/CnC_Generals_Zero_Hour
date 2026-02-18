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
