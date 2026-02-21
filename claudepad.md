# Session Summaries

## 2026-02-21T14:10Z — HelicopterSlowDeath + CleanupHazard + AssistedTargeting
- HelicopterSlowDeathBehavior: spiral orbit, self-spin oscillation, gravity descent, ground hit detection, final explosion
  - Fixed: `entity.heading` → `entity.rotationY`, `executeOCLByName` → `executeOCL`, profile index tracking in state
  - Fixed: `isDieModuleApplicable` now handles `DeathTypes: ALL` as special case
  - 5 tests (profile extraction, state init, spiral motion, ground destroy, spin oscillation)
- CleanupHazardUpdate: passive scan for CLEANUP_HAZARD entities, auto-attack with weapon damage
  - Bypasses enemy relationship checks (direct damage via `applyWeaponDamageAmount`)
  - 3 tests (profile extraction, auto-attack nearby, ignore out-of-range)
- AssistedTargetingUpdate: profile extraction + `isEntityFreeToAssist` + `issueAssistedAttack` methods
  - 3 tests (profile extraction, free-to-assist check, assisted attack issues damage)
- All 1356 tests pass

## 2026-02-21T13:25Z — JetAI + Collision Code Review Fixes
- Fixed JetAI HIGH: commands during TAKING_OFF/LANDING/RETURNING now queued as pending (C++ parity: aiDoCommand lines 2415-2420)
- Fixed JetAI MEDIUM: attackMoveTo interception added for parked/transitioning jets
- Fixed JetAI MEDIUM: suppressed auto-targeting for PARKED/RELOAD_AMMO/TAKING_OFF/LANDING jets
- Fixed JetAI MEDIUM: findSuitableAirfield uses getTeamRelationship === ALLIES (C++ ALLOW_ALLIES parity)
- Collision review findings (overlap cap + IS_USING_ABILITY guard) were already in committed code from 6b9bc6c
- All 1345 tests pass, committed e726985, pushed

## 2026-02-21T13:20Z — JetAIUpdate Flight State Machine
- Implemented 7-state JetAI state machine: PARKED → TAKING_OFF → AIRBORNE → RETURNING_FOR_LANDING → LANDING → RELOAD_AMMO → PARKED + CIRCLING_DEAD_AIRFIELD
- Replaced JetAISneakyProfile with full JetAIProfile (13 fields from INI)
- JetAIRuntimeState tracks state, altitude, pending commands, producer cache, timers
- Map-placed aircraft start AIRBORNE; produced aircraft start PARKED (set by applyQueueProductionExitPath)
- Movement: airborne aircraft skip A* pathfinding (direct waypoint), terrain snap manages cruise altitude
- Command interception: moveTo/attackEntity to PARKED aircraft stored as pendingCommand → takeoff
- Out-of-ammo damage, idle return timer, airfield search when producer destroyed
- 13 new tests, all 1345 tests pass

## 2026-02-21T12:15Z — Turret AI + Locomotor Physics Code Reviews + Collision Avoidance (IN PROGRESS)
- Turret AI committed as 482376e, pushed. Code review agent (ac60639) running in background.
- Locomotor physics code review (aea83bb) completed: 3 MEDIUM findings (braking formula, turn-alignment, heading blending are deliberate simplifications). 0 HIGH.
- **Collision avoidance (Task #100) — IN PROGRESS, 4 TESTS FAILING**:
  - Added `updateUnitCollisionSeparation()` after `updateEntityMovement` in tick loop (line ~3482)
  - Implementation: O(n²) ground entity pair check, bounding circle overlap, position separation
  - 4 tests fail because entities placed at same position intentionally (salvage crate, hive spawn slaves, sticky bomb). Need to add exclusions for:
    - Sticky bomb entities (`stickyBombTargetId !== 0`)
    - Spawn behavior slaves (entities where a parent's `spawnBehaviorState.slaveIds` includes them)
    - Entities with pending enter-object actions
  - Fix approach: skip entities that have `stickyBombTargetId !== 0` and add a `spawnBehaviorOwnerId` or check via `spawnBehaviorState.slaveIds`

## 2026-02-21T08:00Z — Damage Retaliation + Locomotor Physics + Turret AI
- Damage retaliation: committed 6d70308, code review fixes in 4590aba
  - lastAttackerEntityId tracking, immediate retaliation in idle auto-targeting
  - Fixes: stealth DETECTED exception, IS_USING_ABILITY skip, death cleanup
- Locomotor physics: committed 8b79702
  - LocomotorSetProfile extended: minSpeed, acceleration, braking, turnRate, appearance
  - currentSpeed field, rate-limited turning, braking distance lookahead
  - Split heading-based (turnRate > 0) vs direct waypoint (turnRate = 0) movement
- Turret AI: committed 482376e
  - TurretProfile + TurretRuntimeState, turretStates[] on MapEntity
  - State machine: IDLE → AIM → HOLD → RECENTER → IDLE
  - INI: TurretTurnRate (deg/s → rad/frame), NaturalTurretAngle, FiresWhileTurning, RecenterTime
  - isTurretAlignedForFiring callback wired into combat-update.ts
  - turretAngles[] exported in renderable state
- All 1332 tests passing before collision avoidance work began

## 2026-02-21T06:50Z — AutoDeposit + DynamicShroud + Code Review Fixes
- AutoDepositUpdate: C++ parity rewrite
  - Constructor-based timer init (not lazy), 3-field state (nextFrame, initialized, captureBonusPending)
  - Capture bonus awarded via captureEntity hook (Player.cpp line 1038 parity)
  - isEntityNeutralControlled() helper (checks side + player type mapping)
  - 6 tests — All 1266 tests pass
- DynamicShroudClearingRangeUpdate: animated vision range system
  - 5-state machine: NOT_STARTED → GROWING → SUSTAINING → SHRINKING → DONE → SLEEPING
  - Deadline-based state transitions from countdown timer
  - Growing: +nativeClearingRange/growTime per frame; Shrinking: -(native-final)/shrinkTime per frame
  - Change interval throttling (growInterval during GROWING, changeInterval otherwise)
  - Profile INI extraction with duration parsing
  - 3 tests — All 1266 tests pass
- Code review fixes (from agent a4f3d98):
  - CheckpointUpdate geometry save/restore before scan (prevents gate oscillation — HIGH)
  - HeightDieUpdate snap condition: entity.y < terrainY (not entity.y - baseHeight — MEDIUM)
  - Cleaned up duplicate AutoDepositProfile interface and entity fields
  - Removed duplicate entity creation fields

## 2026-02-21T03:15Z — PoisonedBehavior Fixes + StickyBombUpdate + InstantDeathBehavior
- PoisonedBehavior C++ parity fixes:
  - Profile-based poison params (guard: only entities WITH PoisonedBehavior can be poisoned)
  - Re-poison timer uses Math.min() for C++ parity
  - Healing clears poison (all heal paths: self-heal, radius, whole-player, base regen, callback)
  - Fixed AutoHeal radius mode bug: full-health healers couldn't heal others
  - 4 tests — All 1215 tests pass
- StickyBombUpdate: bomb attachment/tracking/detonation system:
  - Profile INI (OffsetZ, GeometryBasedDamageWeapon), position tracking, detonation damage
  - executeStickyBombDetonationDamage in markEntityDestroyed (handles LifetimeUpdate death + explicit detonation)
  - checkAndDetonateBoobyTrap with ally check (C++ line 966)
  - Recursion guard via clearing stickyBombTargetId before damage application
  - 5 tests — All 1220 tests pass
- InstantDeathBehavior: die module with DieMuxData filtering:
  - DeathTypes, VeterancyLevels, ExemptStatus, RequiredStatus filtering
  - Weapon and OCL effects (random selection from lists)
  - Shared isDieModuleApplicable (refactored from isSlowDeathApplicable)
  - 4 tests — All 1224 tests pass
- Code review fixes: dyingEntityIds re-entrancy guard (C++ m_hasDiedAlready), removed dead poison entity fields

## 2026-02-21T02:00Z — FlammableUpdate + DeletionUpdate + RadarUpdate + FloatUpdate + SpyVision
- FlammableUpdate parity fixes — committed dde82a5
  - Added burnedDelayFrames independent timer, fixed AFLAME→NORMAL/BURNED transition
  - Fixed flameDamageAccumulated re-ignition parity (don't reset on ignition)
  - 6 tests — All 1205 tests pass
- DeletionUpdate: silent timed removal (no death pipeline) — committed 67124f6
  - silentDestroyEntity() method: cleans up references without death events/XP/crates
  - RadarUpdateProfile + FloatUpdateProfile extraction (update logic deferred)
  - RadarUpdate extension animation timer on RadarUpgrade application
  - 5 tests — All 1210 tests pass
- Spy Vision duration expiry — committed 3e71ae5
  - temporaryVisionReveals tracking with expiration timers
  - revealFogOfWar now accepts durationMs parameter, defaults to 30s
  - updateTemporaryVisionReveals() removes expired lookers each frame
  - 1 test — All 1211 tests pass

# Key Findings

## Project Structure
- Monorepo at `browser-port/` with `packages/*` and `tools/*` workspaces
- Build: `tsc --build && vite build packages/app`
- Test: `npx vitest run`
- Tools run via `tsx` (TypeScript executor for ES modules)
- Strict TS with `noUncheckedIndexedAccess: true` — typed array indexing returns `T | undefined`

## Binary Format References (from C++ source exploration)
- **BIG archives**: BIGF/BIG4 magic, LE archive size, BE file count/offsets/sizes, null-terminated paths
- **W3D models**: Little-endian chunked format, 8-byte headers (type u32 + size u32 with MSB sub-chunk flag)
- **TGA textures**: 18-byte header, BGR/BGRA pixel order, optional RLE, bottom-left origin default
- **DDS textures**: "DDS " magic, 128-byte header, DXT1/3/5 4x4 block compression
- **MAP files**: "CkMp" magic TOC, DataChunk format (id u32 + version u16 + size i32)
