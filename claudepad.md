# Session Summaries

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

## 2026-02-20T23:00Z — SpecialAbilityUpdate State Machine
- SpecialAbilityUpdate: unit-based special ability system (Black Lotus, Hackers, Burton, Jarmen Kell)
  - SpecialAbilityProfile INI: SpecialPowerTemplate, StartAbilityRange, PreparationTime, PackTime, UnpackTime, SkipPackingWithNoTarget, PersistentPrepTime, FlipOwnerAfterPacking/Unpacking, LoseStealthOnTrigger, AwardXPForTriggering
  - 5-state packing machine: NONE → PACKED → UNPACKING → UNPACKED → prep → trigger → PACKING → PACKED
  - Dispatch intercepts in all three special power callbacks (NoTarget, TargetPosition, TargetObject)
  - Target approach with range check, abort on target death, stop command cancellation
  - Persistent mode for multi-trigger abilities, flip rotation, flee after completion
  - XP award via addExperiencePointsImpl, stealth loss via preTriggerUnstealthFrames
  - 9 tests — All 1183 tests pass

## 2026-02-20T22:00Z — RebuildHoleBehavior
- RebuildHoleBehavior: GLA building reconstruction system — committed 9efcdca
  - Two-module system: RebuildHoleExposeDieProfile (buildings) + RebuildHoleBehaviorProfile (holes)
  - Full lifecycle: building dies → hole created → worker spawns → construction → completion
  - INI extractors for HoleName, HoleMaxHealth, TransferAttackers, WorkerObjectName, WorkerRespawnDelay, HoleHealthRegen%PerSecond
  - Death hook in markEntityDestroyed, per-frame updateRebuildHoles, rebuildHoleSpawnWorker
  - Worker/reconstruction death detection with respawn, passive hole health regen, attacker transfer
  - Code review fixes: C++ update order parity, unconditional unmask, geometry transfer, parsePercentToReal
  - 9 tests — All 1140 tests pass

## 2026-02-20T21:30Z — ProneUpdate + DemoTrapUpdate
- ProneUpdate: infantry prone behavior — committed 7b02c75
  - proneDamageToFramesRatio INI extraction, proneFramesRemaining countdown
  - Damage trigger in applyWeaponDamageAmount with NO_ATTACK status flag
  - PRONE added to RenderAnimationState, integrated into deriveRenderAnimationState priority
  - Code review fixes: C++ double-truncation parity, removed redundant animationState assignment
  - 4 tests — All 1124 tests pass
- DemoTrapUpdate: GLA proximity detonation trap — committed b34b25b
  - DemoTrapProfile INI: DefaultProximityMode, TriggerDetonationRange, ScanRate, IgnoreTargetTypes, DetonationWeapon, DetonateWhenKilled, AutoDetonationWithFriendsInvolved
  - Proximity scan with friendly blocking (non-enemy in range prevents detonation)
  - Manual/proximity mode toggle, manual detonation command, DetonateWhenKilled in death path
  - Code review fixes: distance pre-filter before relationship check, construction/sold guard on manual detonate
  - 7 tests — All 1131 tests pass

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
