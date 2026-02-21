# Next Session Handoff — 2026-02-21T12:15Z

## Current State

**Branch**: `main`
**Last commit**: `482376e` — Turret AI rotation and aiming system
**Tests**: 1332 passing (before collision avoidance changes)
**Uncommitted work**: Unit collision avoidance — **4 tests failing**

---

## Task In Progress: Unit Collision Avoidance (Task #100)

### What Was Done

Added `updateUnitCollisionSeparation()` to the game tick loop, right after `updateEntityMovement(dt)` and before `updateCrushCollisions()`.

**Implementation** (`index.ts` line ~26093):
- Builds a compact array of ground entities eligible for collision (skips air, destroyed, contained, noCollisions)
- O(n²) pair check using bounding circle overlap (`obstacleGeometry.majorRadius`)
- Pushes overlapping entities apart with `SEPARATION_STRENGTH = 0.4` per frame
- Priority: stationary entities don't get pushed (moving entities yield)
- Idle-idle overlap at very close range issues a `moveTo` command to resolve permanent overlap
- Deterministic pseudo-random direction for coincident entities

**Tick loop change** (line ~3482):
```typescript
this.updateEntityMovement(dt);
this.updateUnitCollisionSeparation();  // ← NEW
this.updateCrushCollisions();
```

### What's Broken — 4 Failing Tests

The collision separation pushes apart entities that are **intentionally co-located** in tests:

1. **`salvage crate system > grants CRATEUPGRADE_ONE...`** (line 11952)
   - Setup: CrateVictim + Salvager at (55,55). Both are VEHICLE.
   - Problem: Collision separation pushes them apart before the salvager kills the victim and collects the crate.

2. **`salvage crate system > fully upgraded WEAPON_SALVAGER...`** (line ~12040)
   - Same root cause — co-located vehicles pushed apart.

3. **`HiveStructureBody > redirects matching damage types...`** (line 16882)
   - Setup: GlaTunnel(STRUCTURE) + Tank(VEHICLE) at (5,5). Spawn behavior creates 2 TunnelDefender(INFANTRY) nearby.
   - Problem: The infantry defenders get pushed away from each other and potentially out of the damage redirect range.

4. **`StickyBombUpdate > detonates bomb with geometry-scaled damage...`** (line 17666)
   - Setup: Tank + StickyBomb + Infantry all at (10,10).
   - Problem: StickyBomb (VEHICLE, BOOBY_TRAP) is a special entity that should track its target, not get pushed away. Infantry bystander also gets pushed out of blast radius.

### How to Fix

Add these exclusions to the entity filter in `updateUnitCollisionSeparation()`:

```typescript
// Skip sticky bomb entities (they track their target position).
if (entity.stickyBombProfile && entity.stickyBombTargetId !== 0) continue;
```

For the pair-level check, add:
```typescript
// Skip pairs where one entity is attacking the other (combat approach).
if (a.attackTargetEntityId === b.id || b.attackTargetEntityId === a.id) continue;
```

For the hive/spawn slave issue, add to entity filter:
```typescript
// Skip entities that are spawn slaves (they position-track their owner).
// Check: any parent's spawnBehaviorState.slaveIds includes this entity.
```

This is slightly tricky because there's no `spawnBehaviorOwnerId` field on the entity. Options:
- **Option A**: Add a `spawnBehaviorOwnerId: number | null` field to `MapEntity` and set it when slaves are spawned
- **Option B**: Build a lookup set of all slave entity IDs at the start of `updateUnitCollisionSeparation()`
- **Option C**: Skip separation for entities whose distance to any structure < threshold

**Option A is cleanest** and follows existing patterns (like `transportContainerId`).

For the infantry bystander in the sticky bomb test, the issue is that all 3 entities are at (10,10). This should be fixed by the combat pair exclusion above (tank and bomb share position but the bomb tracks the tank).

### Alternative approach

Instead of adding exclusions, consider: only apply collision separation between **allied** ground units (same side). Enemy units are handled by combat engagement and crush collisions already. This would fix all 4 failing tests since:
- Salvage crate: salvager (America) vs victim (China) = enemies
- Hive: tank (America) vs defenders (GLA) = enemies
- Sticky bomb: bomb (America) vs tank (China) = enemies

This is also more aligned with C++ behavior where `processCollision` primarily handles same-team blocking.

---

## Background Agent Results

### Code Review for Turret AI (ac60639) — Still Running
Check output: `tail -100 /private/tmp/claude-501/-Users-discordwell-Projects-CnC-Generals-Zero-Hour/tasks/ac60639.output`

### Feature Research (aebb8f0) — Completed
Priority list for next features:
1. **Unit Collision Avoidance** ← currently in progress
2. **JetAIUpdate** (aircraft takeoff/landing/loiter) — CRITICAL, HIGH complexity
3. **HelicopterSlowDeathUpdate** (death spiral) — HIGH, MEDIUM complexity
4. **ChinookAIUpdate** (rope rappel/transport) — HIGH, HIGH complexity
5. **TensileFormationUpdate** (unit cohesion) — HIGH, MEDIUM complexity
6. **WorkerAIUpdate** (construction AI) — MEDIUM, MEDIUM complexity
7. **ProneUpdate** — already implemented (commit 7b02c75)
8. **MissileAIUpdate** (homing missiles) — MEDIUM, HIGH complexity

---

## Recent Commits (last 10)

```
482376e Implement turret AI rotation and aiming system
8b79702 Implement locomotor physics: acceleration, braking, and turn rate
4590aba Fix retaliation: stealth DETECTED exception, IS_USING_ABILITY skip, death cleanup
6d70308 Add damage retaliation tracking (lastAttackerEntityId)
9cabdb0 Enhance fireTemporaryWeaponAtPosition with secondary damage and relationship filtering
d47fb9d Add OCL FireWeapon nugget support and position-aware OCL execution
04cac8b Add EMP disable system with airborne aircraft kill and hardened immunity
afb92a1 Add HijackerUpdate auto-enter and vehicle capture with XP theft
9167425 Add structure collapse physics and rubble spawn system
a076bfd Add HelixContain air transport, napalm bomb, and EMP pulse modules
```

---

## Key Architecture Notes

- **LOGIC_FRAME_RATE = 30** fps
- **MAP_XY_FACTOR = 10.0** (world units per heightmap cell)
- **PATHFIND_CELL_SIZE = MAP_XY_FACTOR**
- Heading convention: `rotationY = atan2(dz, dx) + PI/2`
- Direction from heading: `cos(rotationY - PI/2)` for X, `sin(rotationY - PI/2)` for Z
- TurretTurnRate: C++ degrees/sec → TS radians/frame: `deg * (PI/180) / 30`
- Locomotor TurnRate: C++ degrees/sec → TS radians/sec: `deg * (PI/180)`, multiplied by `dt` each frame
- Relationship constants: ENEMIES=0, NEUTRAL=1, ALLIES=2
- Entity creation: `this.spawnEntity()` → set fields → push to `spawnedEntities` map
- Profile + RuntimeState pattern for entity modules
- INI field reading: `readStringField`, `readNumericField`, `readBooleanField`

---

## File Locations

- **Main game logic**: `browser-port/packages/game-logic/src/index.ts` (~26500 lines)
- **Types**: `browser-port/packages/game-logic/src/types.ts`
- **Combat update**: `browser-port/packages/game-logic/src/combat-update.ts`
- **Tests**: `browser-port/packages/game-logic/src/index.test.ts`
- **C++ source**: `GeneralsMD/Code/GameEngine/` (Include/ and Source/)
- **INI data types**: `browser-port/packages/ini-data/src/`
