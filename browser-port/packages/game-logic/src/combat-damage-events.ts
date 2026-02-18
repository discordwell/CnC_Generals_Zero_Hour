import { findContinueAttackVictim as findContinueAttackVictimImpl } from './combat-damage-resolution.js';

interface VectorXZLike {
  x: number;
  z: number;
}

interface CombatDamageEntityLike {
  id: number;
  x: number;
  z: number;
  destroyed: boolean;
  canTakeDamage: boolean;
  templateName: string;
  controllingPlayerToken: string | null;
  attackTargetEntityId: number | null;
  attackOriginalVictimPosition: VectorXZLike | null;
  attackCommandSource: string;
}

interface CombatDamageWeaponLike {
  primaryDamageRadius: number;
  secondaryDamageRadius: number;
  radiusDamageAngle: number;
  radiusDamageAffectsMask: number;
  primaryDamage: number;
  secondaryDamage: number;
  damageType: string;
  continueAttackRange: number;
}

interface PendingWeaponDamageEventLike<TWeapon extends CombatDamageWeaponLike> {
  sourceEntityId: number;
  primaryVictimEntityId: number | null;
  impactX: number;
  impactZ: number;
  executeFrame: number;
  delivery: 'DIRECT' | 'PROJECTILE';
  weapon: TWeapon;
}

interface CombatDamageMasks {
  affectsSelf: number;
  affectsAllies: number;
  affectsEnemies: number;
  affectsNeutrals: number;
  killsSelf: number;
  doesntAffectSimilar: number;
}

interface CombatDamageRelationships {
  allies: number;
  enemies: number;
}

export interface CombatDamageEventContext<
  TEntity extends CombatDamageEntityLike,
  TWeapon extends CombatDamageWeaponLike,
  TEvent extends PendingWeaponDamageEventLike<TWeapon>,
> {
  frameCounter: number;
  pendingEvents: TEvent[];
  entitiesById: ReadonlyMap<number, TEntity>;
  resolveForwardUnitVector(entity: TEntity): VectorXZLike;
  resolveProjectilePointCollisionRadius(entity: TEntity): number;
  resolveProjectileIncidentalVictimForPointImpact(
    projectileLauncher: TEntity | null,
    weapon: TWeapon,
    intendedVictimId: number | null,
    impactX: number,
    impactZ: number,
  ): TEntity | null;
  getTeamRelationship(attacker: TEntity, target: TEntity): number;
  applyWeaponDamageAmount(
    sourceEntityId: number | null,
    target: TEntity,
    amount: number,
    damageType: string,
  ): void;
  canEntityAttackFromStatus(entity: TEntity): boolean;
  canAttackerTargetEntity(attacker: TEntity, target: TEntity, commandSource: string): boolean;
  masks: CombatDamageMasks;
  relationships: CombatDamageRelationships;
  hugeDamageAmount: number;
}

function normalizeVector2(x: number, z: number): VectorXZLike {
  const length = Math.hypot(x, z);
  if (length <= 1e-6) {
    return { x: 0, z: 0 };
  }
  return { x: x / length, z: z / length };
}

function tryContinueAttackOnVictimDeath<
  TEntity extends CombatDamageEntityLike,
  TWeapon extends CombatDamageWeaponLike,
  TEvent extends PendingWeaponDamageEventLike<TWeapon>,
>(
  context: CombatDamageEventContext<TEntity, TWeapon, TEvent>,
  attacker: TEntity,
  destroyedVictim: TEntity,
  weapon: TWeapon,
): void {
  const continueRange = Math.max(0, weapon.continueAttackRange);
  if (continueRange <= 0) {
    return;
  }
  if (attacker.destroyed || !context.canEntityAttackFromStatus(attacker)) {
    return;
  }
  if (attacker.attackTargetEntityId !== destroyedVictim.id) {
    return;
  }
  const originalVictimPosition = attacker.attackOriginalVictimPosition;
  if (!originalVictimPosition) {
    return;
  }

  const replacementVictim = findContinueAttackVictimImpl(
    attacker.id,
    destroyedVictim.id,
    destroyedVictim.controllingPlayerToken,
    originalVictimPosition,
    continueRange,
    context.entitiesById.values(),
    (candidate) => context.canAttackerTargetEntity(attacker, candidate, attacker.attackCommandSource),
  );
  if (!replacementVictim) {
    return;
  }

  // Source parity subset: AIAttackState::notifyNewVictimChosen() does not update
  // m_originalVictimPos. Keep the initial victim position for chained reacquire.
  attacker.attackTargetEntityId = replacementVictim.id;
}

export function applyWeaponDamageEvent<
  TEntity extends CombatDamageEntityLike,
  TWeapon extends CombatDamageWeaponLike,
  TEvent extends PendingWeaponDamageEventLike<TWeapon>,
>(
  context: CombatDamageEventContext<TEntity, TWeapon, TEvent>,
  event: TEvent,
): void {
  const weapon = event.weapon;
  if (event.delivery === 'PROJECTILE') {
    // Source parity subset: damage arrives via projectile detonation/collision timing.
    // TODO(C&C source parity): replace with spawned projectile entities and
    // shouldProjectileCollideWith()/ProjectileUpdateInterface behavior.
  }

  const source = context.entitiesById.get(event.sourceEntityId) ?? null;
  const primaryVictim = event.primaryVictimEntityId !== null
    ? (context.entitiesById.get(event.primaryVictimEntityId) ?? null)
    : null;
  const primaryVictimWasAlive = !!primaryVictim && !primaryVictim.destroyed && primaryVictim.canTakeDamage;

  let impactX = event.impactX;
  let impactZ = event.impactZ;
  if (event.delivery === 'DIRECT' && primaryVictim && !primaryVictim.destroyed) {
    impactX = primaryVictim.x;
    impactZ = primaryVictim.z;
  }

  const primaryRadius = Math.max(0, weapon.primaryDamageRadius);
  const secondaryRadius = Math.max(0, weapon.secondaryDamageRadius);
  const radiusDamageAngle = Math.max(0, weapon.radiusDamageAngle);
  const radiusDamageAngleCos = Math.cos(radiusDamageAngle);
  const primaryRadiusSqr = primaryRadius * primaryRadius;
  const effectRadius = Math.max(primaryRadius, secondaryRadius);
  const effectRadiusSqr = effectRadius * effectRadius;
  const sourceFacingVector = source
    ? normalizeVector2(
      context.resolveForwardUnitVector(source).x,
      context.resolveForwardUnitVector(source).z,
    )
    : null;

  const victims: Array<{ entity: TEntity; distanceSqr: number }> = [];
  if (effectRadius > 0) {
    for (const entity of context.entitiesById.values()) {
      if (entity.destroyed || !entity.canTakeDamage) {
        continue;
      }
      const dx = entity.x - impactX;
      const dz = entity.z - impactZ;
      const distanceSqr = dx * dx + dz * dz;
      if (distanceSqr <= effectRadiusSqr) {
        victims.push({ entity, distanceSqr });
      }
    }
    victims.sort((left, right) => left.entity.id - right.entity.id);
  } else if (primaryVictim && !primaryVictim.destroyed && primaryVictim.canTakeDamage) {
    if (event.delivery === 'PROJECTILE') {
      const collisionRadius = context.resolveProjectilePointCollisionRadius(primaryVictim);
      const dx = primaryVictim.x - impactX;
      const dz = primaryVictim.z - impactZ;
      const distanceSqr = dx * dx + dz * dz;
      if (distanceSqr <= collisionRadius * collisionRadius) {
        victims.push({ entity: primaryVictim, distanceSqr: 0 });
      } else {
        const incidentalVictim = context.resolveProjectileIncidentalVictimForPointImpact(
          source,
          weapon,
          primaryVictim.id,
          impactX,
          impactZ,
        );
        if (incidentalVictim) {
          victims.push({ entity: incidentalVictim, distanceSqr: 0 });
        }
      }
    } else {
      victims.push({ entity: primaryVictim, distanceSqr: 0 });
    }
  } else if (event.delivery === 'PROJECTILE') {
    const incidentalVictim = context.resolveProjectileIncidentalVictimForPointImpact(
      source,
      weapon,
      primaryVictim?.id ?? null,
      impactX,
      impactZ,
    );
    if (incidentalVictim) {
      victims.push({ entity: incidentalVictim, distanceSqr: 0 });
    }
  }

  if (
    victims.length === 0
    && source
    && (weapon.radiusDamageAffectsMask & context.masks.killsSelf) !== 0
    && effectRadius <= 0
  ) {
    context.applyWeaponDamageAmount(source.id, source, context.hugeDamageAmount, weapon.damageType);
    return;
  }

  for (const victim of victims) {
    const candidate = victim.entity;
    let killSelf = false;

    if (radiusDamageAngle < Math.PI) {
      if (!source || !sourceFacingVector) {
        continue;
      }
      const damageVector = normalizeVector2(candidate.x - source.x, candidate.z - source.z);
      // Source parity subset: WeaponTemplate::dealDamageInternal gates radius damage by
      // comparing source orientation to candidate direction against RadiusDamageAngle.
      // TODO(C&C source parity): include full 3D source/candidate vectors once altitude and
      // pitch-limited facing are represented in simulation data.
      if ((sourceFacingVector.x * damageVector.x) + (sourceFacingVector.z * damageVector.z) < radiusDamageAngleCos) {
        continue;
      }
    }

    if (source && candidate !== primaryVictim) {
      if (
        (weapon.radiusDamageAffectsMask & context.masks.killsSelf) !== 0
        && candidate.id === source.id
      ) {
        killSelf = true;
      } else {
        if (
          (weapon.radiusDamageAffectsMask & context.masks.affectsSelf) === 0
          && candidate.id === source.id
        ) {
          continue;
        }
        if (
          (weapon.radiusDamageAffectsMask & context.masks.doesntAffectSimilar) !== 0
          && context.getTeamRelationship(source, candidate) === context.relationships.allies
          && source.templateName.trim().toUpperCase() === candidate.templateName.trim().toUpperCase()
        ) {
          continue;
        }

        // TODO(C&C source parity): implement WEAPON_DOESNT_AFFECT_AIRBORNE via
        // Object::isSignificantlyAboveTerrain once 3D movement altitude parity is represented.
        let requiredMask = context.masks.affectsNeutrals;
        const relationship = context.getTeamRelationship(source, candidate);
        if (relationship === context.relationships.allies) {
          requiredMask = context.masks.affectsAllies;
        } else if (relationship === context.relationships.enemies) {
          requiredMask = context.masks.affectsEnemies;
        }
        if ((weapon.radiusDamageAffectsMask & requiredMask) === 0) {
          continue;
        }
      }
    }

    const rawAmount = killSelf
      ? context.hugeDamageAmount
      : (victim.distanceSqr <= primaryRadiusSqr ? weapon.primaryDamage : weapon.secondaryDamage);
    context.applyWeaponDamageAmount(source?.id ?? null, candidate, rawAmount, weapon.damageType);
  }

  if (source && primaryVictimWasAlive && primaryVictim && primaryVictim.destroyed) {
    tryContinueAttackOnVictimDeath(context, source, primaryVictim, weapon);
  }

  // TODO(C&C source parity): use 3D/bounding-volume damage distance checks from
  // PartitionManager::iterateObjectsInRange(DAMAGE_RANGE_CALC_TYPE).
}

export function updatePendingWeaponDamage<
  TEntity extends CombatDamageEntityLike,
  TWeapon extends CombatDamageWeaponLike,
  TEvent extends PendingWeaponDamageEventLike<TWeapon>,
>(
  context: CombatDamageEventContext<TEntity, TWeapon, TEvent>,
): void {
  if (context.pendingEvents.length === 0) {
    return;
  }

  const remainingEvents: TEvent[] = [];
  for (const event of context.pendingEvents) {
    if (event.executeFrame > context.frameCounter) {
      remainingEvents.push(event);
      continue;
    }
    applyWeaponDamageEvent(context, event);
  }

  context.pendingEvents.length = 0;
  context.pendingEvents.push(...remainingEvents);
}
