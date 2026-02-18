interface CombatWeaponLike {
  minAttackRange: number;
  unmodifiedAttackRange: number;
  weaponSpeed: number;
  minWeaponSpeed: number;
  scaleWeaponSpeed: boolean;
  scatterRadius: number;
  scatterRadiusVsInfantry: number;
  preAttackDelayFrames: number;
  preAttackType: 'PER_SHOT' | 'PER_ATTACK' | 'PER_CLIP';
  clipSize: number;
  minDelayFrames: number;
  maxDelayFrames: number;
}

interface CombatEntityStatusLike {
  objectStatusFlags: Set<string>;
}

interface CombatEntityPrefireStateLike {
  consecutiveShotsTargetEntityId: number | null;
  consecutiveShotsAtTarget: number;
  attackAmmoInClip: number;
}

interface CombatDamageTargetLike {
  canTakeDamage: boolean;
  destroyed: boolean;
  armorDamageCoefficients: ReadonlyMap<string, number> | null;
}

export function setEntityAttackStatus(entity: CombatEntityStatusLike, isAttacking: boolean): void {
  if (isAttacking) {
    entity.objectStatusFlags.add('IS_ATTACKING');
  } else {
    entity.objectStatusFlags.delete('IS_ATTACKING');
  }
}

export function setEntityAimingWeaponStatus(entity: CombatEntityStatusLike, isAiming: boolean): void {
  if (isAiming) {
    entity.objectStatusFlags.add('IS_AIMING_WEAPON');
  } else {
    entity.objectStatusFlags.delete('IS_AIMING_WEAPON');
  }
}

export function setEntityFiringWeaponStatus(entity: CombatEntityStatusLike, isFiring: boolean): void {
  if (isFiring) {
    entity.objectStatusFlags.add('IS_FIRING_WEAPON');
  } else {
    entity.objectStatusFlags.delete('IS_FIRING_WEAPON');
  }
}

export function setEntityIgnoringStealthStatus(entity: CombatEntityStatusLike, isIgnoringStealth: boolean): void {
  if (isIgnoringStealth) {
    entity.objectStatusFlags.add('IGNORING_STEALTH');
  } else {
    entity.objectStatusFlags.delete('IGNORING_STEALTH');
  }
}

export function resolveScaledProjectileTravelSpeed(
  weapon: CombatWeaponLike,
  sourceToAimDistance: number,
  attackRangeCellEdgeFudge: number,
): number {
  if (!weapon.scaleWeaponSpeed) {
    return weapon.weaponSpeed;
  }

  const minRange = Math.max(0, weapon.minAttackRange - attackRangeCellEdgeFudge);
  const maxRange = Math.max(minRange, weapon.unmodifiedAttackRange);
  const rangeRatio = (sourceToAimDistance - minRange) / (maxRange - minRange);
  return (rangeRatio * (weapon.weaponSpeed - weapon.minWeaponSpeed)) + weapon.minWeaponSpeed;
}

export function resolveProjectileScatterRadiusForCategory(
  weapon: CombatWeaponLike,
  targetCategory: string,
): number {
  let scatter = Math.max(0, weapon.scatterRadius);
  if (targetCategory === 'infantry') {
    scatter += Math.max(0, weapon.scatterRadiusVsInfantry);
  }
  return scatter;
}

export function computeAttackRetreatTarget(
  attackerX: number,
  attackerZ: number,
  targetX: number,
  targetZ: number,
  weapon: Pick<CombatWeaponLike, 'minAttackRange' | 'minDelayFrames' | 'maxDelayFrames'> & { attackRange: number },
): { x: number; z: number } | null {
  let awayX = attackerX - targetX;
  let awayZ = attackerZ - targetZ;
  const length = Math.hypot(awayX, awayZ);
  if (length <= 1e-6) {
    awayX = 1;
    awayZ = 0;
  } else {
    awayX /= length;
    awayZ /= length;
  }

  const minAttackRange = Math.max(0, weapon.minAttackRange);
  const attackRange = Math.max(minAttackRange, weapon.attackRange);
  const desiredDistance = (attackRange + minAttackRange) * 0.5;
  if (!Number.isFinite(desiredDistance) || desiredDistance <= 0) {
    return null;
  }

  return {
    x: targetX + awayX * desiredDistance,
    z: targetZ + awayZ * desiredDistance,
  };
}

export function getConsecutiveShotsFiredAtTarget(
  entity: Pick<CombatEntityPrefireStateLike, 'consecutiveShotsTargetEntityId' | 'consecutiveShotsAtTarget'>,
  targetEntityId: number,
): number {
  if (entity.consecutiveShotsTargetEntityId !== targetEntityId) {
    return 0;
  }
  return entity.consecutiveShotsAtTarget;
}

export function resolveWeaponPreAttackDelayFrames(
  attacker: CombatEntityPrefireStateLike,
  targetEntityId: number,
  weapon: Pick<CombatWeaponLike, 'preAttackDelayFrames' | 'preAttackType' | 'clipSize'>,
): number {
  const delay = Math.max(0, Math.trunc(weapon.preAttackDelayFrames));
  if (delay <= 0) {
    return 0;
  }

  if (weapon.preAttackType === 'PER_ATTACK') {
    if (getConsecutiveShotsFiredAtTarget(attacker, targetEntityId) > 0) {
      return 0;
    }
    return delay;
  }

  if (weapon.preAttackType === 'PER_CLIP') {
    if (weapon.clipSize > 0 && attacker.attackAmmoInClip < weapon.clipSize) {
      return 0;
    }
    return delay;
  }

  return delay;
}

export function recordConsecutiveAttackShot(
  attacker: Pick<CombatEntityPrefireStateLike, 'consecutiveShotsTargetEntityId' | 'consecutiveShotsAtTarget'>,
  targetEntityId: number,
): void {
  if (attacker.consecutiveShotsTargetEntityId === targetEntityId) {
    attacker.consecutiveShotsAtTarget += 1;
    return;
  }
  attacker.consecutiveShotsTargetEntityId = targetEntityId;
  attacker.consecutiveShotsAtTarget = 1;
}

export function resolveWeaponDelayFrames(
  weapon: Pick<CombatWeaponLike, 'minDelayFrames' | 'maxDelayFrames'>,
  randomRange: (min: number, max: number) => number,
): number {
  const minDelay = Math.max(0, Math.trunc(weapon.minDelayFrames));
  const maxDelay = Math.max(minDelay, Math.trunc(weapon.maxDelayFrames));
  if (minDelay === maxDelay) {
    return minDelay;
  }
  return randomRange(minDelay, maxDelay);
}

export function adjustDamageByArmorSet(
  target: CombatDamageTargetLike,
  amount: number,
  damageType: string,
): number {
  const normalizedType = damageType.trim().toUpperCase();
  if (normalizedType === 'UNRESISTABLE') {
    return amount;
  }

  const coefficients = target.armorDamageCoefficients;
  if (!coefficients) {
    return amount;
  }

  const coefficient = coefficients.get(normalizedType);
  if (coefficient === undefined) {
    return amount;
  }

  return Math.max(0, amount * coefficient);
}
