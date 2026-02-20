# Session Summaries

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

## 2026-02-20T08:15Z — Construction Progress System + Tunnel Code Review Fixes
- Task #73 code review fixes: immediate tunnel unregister on sell (double-sell race), non-movable scatter positioning — committed 141cd5b
- Task #74: Construction Progress/Duration System with full C++ DozerAIUpdate parity:
  - constructionPercent field (0..100 during build, -1 = CONSTRUCTION_COMPLETE)
  - builderId field for builder exclusivity, buildTotalFrames from INI BuildTime
  - UNDER_CONSTRUCTION status flag: blocks attack, energy, XP, cash bounty
  - Per-frame progress: percent += 100/totalFrames, health += maxHealth/totalFrames
  - Starting health = 1 HP, completes at maxHealth
  - completeConstruction: clears flags, registers energy, emits EVA event
  - Dozer interruption: building stays partially built, builderId cleared
  - Resume construction: repair command on UNDER_CONSTRUCTION building resumes build
  - Cancel construction: full cost refund, building destroyed
  - pendingConstructionActions map with cleanup in cancelEntityCommandPathActions
  - RenderableEntityState.constructionPercent for UI display
  - 7 new tests: initial state, completion timing, energy delay, attack block, interruption, cancel/refund, resume
- All 1033 tests pass, clean build

## 2026-02-20T08:00Z — Tunnel Network Transport System + Mine onDamage
- Task #72: Mine onDamage sympathetic detonation handler — committed d503474
- Task #73: Tunnel Network Transport System with full C++ TunnelTracker parity:
  - Per-side shared TunnelTrackerState (tunnelIds, passengerIds, healFrames)
  - TUNNELCONTAIN INI parsing with TimeForFullHeal → msToLogicFrames
  - Enter tunnel: DISABLED_HELD + MASKED + UNSELECTABLE, shared capacity check
  - Exit tunnel: scatter to random position (1.0-1.5× bounding radius), clear flags
  - Cave-in: last tunnel destroyed → kill all passengers
  - Reassign: non-last tunnel destroyed → passengers reference surviving tunnel
  - Sell: last tunnel sold → eject passengers safely before destruction
  - Healing: linear maxHealth/framesForFullHeal per frame, full heal after timer
  - No aircraft filter, maxTunnelCapacity from GameLogicConfig (default 10)
  - Integration: collectContainedEntityIds, releaseEntityFromContainer, resolveEntityContainingObject, isEnclosingContainer, handleExitContainerCommand, handleEvacuateCommand, combat-containment firecheck
  - 9 new tests: enter/exit flags, aircraft block, shared capacity, cave-in, reassign, evacuate, healing, sell eject
- All 1026 tests pass, clean build

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
