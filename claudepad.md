# Session Summaries

## 2026-02-20T17:50Z — INI-Driven Stealth/Detection System + Code Review Fixes (Tasks #85-87)
- Tasks #85-87: INI-driven stealth and detection system upgrade with full C++ StealthUpdate/StealthDetectorUpdate parity
  - StealthProfile: INI parsing of StealthDelay, InnateStealth, StealthForbiddenConditions (9 tokens matching TheStealthLevelNames), MoveThresholdSpeed
  - Bitmask values match C++ enum ordering: ATTACKING(0), MOVING(1), USING_ABILITY(2), FIRING_PRIMARY(3), FIRING_SECONDARY(4), FIRING_TERTIARY(5), NO_BLACK_MARKET(6), TAKING_DAMAGE(7), RIDERS_ATTACKING(8)
  - Both short-form (ATTACKING) and long-form (STEALTH_NOT_WHILE_ATTACKING) token parsing
  - FIRING_WEAPON composite maps to PRIMARY|SECONDARY|TERTIARY
  - DetectorProfile: DetectionRange, DetectionRate throttle, CanDetectWhileGarrisoned/Contained, ExtraRequiredKindOf/ExtraForbiddenKindOf
  - Detection includes ENEMIES and NEUTRAL (C++ PartitionFilterRelationship parity)
  - SOLD status check on detectors, garrisonCapacity-based garrison check (not isEnclosingContainer)
  - Contained-in-non-garrisonable prevents stealth (allowedToStealth parity)
  - TAKING_DAMAGE frame window <= 1 (matching C++ getLastDamageTimestamp >= now - 1)
  - Healing damage excluded from lastDamageFrame tracking (C++ DAMAGE_HEALING exception)
  - Staggered initial detectorNextScanFrame with gameRandom offset
  - 12 tests: innate stealth, damage breaks stealth, detector reveals enemy, ally immunity, range check, detection expiration, non-innate, extraRequired/ForbiddenKindOf, movement break, re-entry delay, short-form tokens
- All 1091 tests pass, clean build

## 2026-02-20T16:00Z — Crush/Squish Damage During Movement (Task #95)
- Task #95: Crush collision system with C++ PhysicsUpdate::checkForOverlapCollision + SquishCollide parity — committed 926c982
  - updateCrushCollisions(): moving entities with crusherLevel > crushableLevel crush overlapping enemies
  - Direction check via dot product (moveDirX*dx + moveDirZ*dz > 0) — approaching targets only
  - canBeSquished (SquishCollide module) uses radius 1.0 per C++ source
  - CRUSH damage type with HUGE_DAMAGE_AMOUNT (1B) for guaranteed kill
  - Extended needsGeometry to include crusherLevel > 0 for proper obstacleGeometry resolution
  - moverRadius fallback changed to 1.0 (code review fix from MAP_XY_FACTOR/2)
  - TODO: Vehicle crush point system (front/back/center), hijacker/TNT-hunter immunity
  - 4 new tests: crush kill, ally immunity, crushable level resistance, direction rejection
  - Tests use cell-center positions (x%10=5) for straight-line A* pathfinding reliability
- All 1079 tests pass, clean build

## 2026-02-20T15:20Z — 3D Damage Distance + Bounding Sphere Subtraction (Tasks #93-94)
- Task #93: 3D damage distance for radius damage victim gathering — committed b6a67fd
  - Changed distance calc from XZ-only to full 3D (dx² + dy² + dz²)
  - entity.y (center) vs impactY (terrain height) gives proper elevation difference
  - DIRECT delivery uses getPosition() (terrain-level), not center
  - RadiusDamageAngle cone check upgraded to 3D vectors (commit d290c98)
- Task #94: FROM_BOUNDINGSPHERE_3D bounding sphere subtraction — committed 1e62ef5
  - resolveBoundingSphereRadius(): CYLINDER=max(major, h/2), BOX=hypot(major, minor, h/2)
  - GeometryHeight read from INI, stored on ObstacleGeometry.height
  - BSR subtracted from raw 3D distance, clamped to zero for overlap
  - Fallback to baseHeight when no explicit geometry (covers most combat units)
  - Code review caught BOX formula bug: was max(hypot2D, halfH), fixed to hypot3D
  - Updated scatter test expectations (BSR makes larger entities easier to hit)
  - 1 new test: BSR extends effective hit zone for entities with explicit geometry
- All 1075 tests pass, clean build

## 2026-02-20T14:12Z — Power Brown-Out + Disabled Movement Restrictions (Tasks #88-89)
- Task #88: Disabled entity movement + evacuation restrictions — committed 5e8548e, review fix 84a78fa
  - isEntityDisabledForMovement() helper: checks DISABLED_HELD/EMP/HACKED/SUBDUED/PARALYZED/UNMANNED/UNDERPOWERED
  - issueMoveTo uses new helper instead of just DISABLED_HELD
  - DISABLED_SUBDUED blocks handleEvacuateCommand and handleExitContainerCommand
  - 6 new tests: EMP/HACKED/SUBDUED block movement, SUBDUED blocks evacuate/exit, normal evacuate works
- Task #89: DISABLED_UNDERPOWERED power brown-out system — committed ff369fe
  - SidePowerState.brownedOut tracking with edge detection
  - updatePowerBrownOut(): sets/clears DISABLED_UNDERPOWERED on KINDOF_POWERED entities
  - pauseSpecialPowerCountdownsForSide(): frame-by-frame countdown push
  - DISABLED_UNDERPOWERED added to isDisabledForConstruction + isObjectDisabledForUpgradeSideEffects
  - TODO: radar disable/enable during brown-out (radar subsystem not fully wired)
  - 4 new tests: brownout flag set/clear, non-POWERED unaffected, power restore
- All 1069 tests pass, clean build

## 2026-02-20T09:30Z — Projectile Flight Collision Detection (Task #78)
- Task #78: Projectile flight collision detection with C++ DumbProjectileBehavior parity — committed 7fa2d1b
  - updateProjectileFlightCollisions() method: interpolates projectile position each frame (linear + Bezier)
  - Checks each entity for collision using shouldProjectileCollideWithEntityImpl validation
  - Early-detonation: redirects impact point and victim to collision entity
  - Sneaky-offset projectiles correctly collide after persist-immunity expires (source parity)
  - Added canTakeDamage guard on flight collision candidates (code review fix)
  - 3 new tests: blocker interception, ally pass-through, self-collision exclusion
  - Updated sneaky persist test: 2 hits instead of 1 (flight collision detects sneaky-offset projectile mid-flight)
- All 1040 tests pass, clean build

## 2026-02-20T09:10Z — Skirmish AI Enhancements (Task #77)
- Task #77: AI system enhancements for skirmish parity — committed afa1b93
  - Dozer replacement: queues dozer production when AI has none
  - Upgrade research: evaluates idle buildings for researchable upgrades (keyword priority)
  - Science purchasing: spends General's points on available sciences
  - Rally points: per-entity tracking on production buildings toward enemy
  - Multi-dozer parallel construction: all idle dozers build simultaneously
  - Fixed: dozers excluded from factory scan in evaluateProduction/Economy/DozerReplacement
  - Fixed: isDozerBusy now checks pendingConstructionActions
  - Fixed: command set button slot scan uses 18 slots (6x3 grid parity)
  - Added collectCommandSetTemplates for command-set-aware AI context
  - Added PurchaseScienceCommand.side for AI side specification
  - Refactored evaluatePower to use shared issueConstructCommand helper
  - 4 new tests: dozer replacement, upgrade research, rally points, parallel construction
- All 1037 tests pass, clean build

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
