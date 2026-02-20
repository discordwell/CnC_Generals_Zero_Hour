# Session Summaries

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

## 2026-02-20T07:12Z — Fog of War targeting/render + Mine collision detonation system
- Task #70: Fog-of-war targeting gate in canAttackerTargetEntity(), resolveEntityShroudStatusForLocalPlayer(), shroudStatus on RenderableEntityState — committed d6c87a1
- Task #71: Collision-based mine detonation system with full C++ MinefieldBehavior parity:
  - MinefieldProfile INI parsing (DetonationWeapon, DetonatedBy, NumVirtualMines, etc.)
  - Geometry-based collision detection (2D bounding circle overlap)
  - handleMineCollision with immunity list, worker rejection, relationship mask, mine-clearing immunity
  - detonateMineOnce with weapon firing, charge tracking, MASKED status
  - fireTemporaryWeaponAtPosition for area damage
  - Fixed: mine entities now get obstacleGeometry even though they don't block path (MINE kindOf)
  - 7 new tests: detonation, ally immunity, DetonatedBy override, multi-charge, out-of-range, worker immunity, visual events
- All 1016 tests pass, clean build

## 2026-02-19T15:15Z — ObjectStatus + WeaponSet + maxShotsToFire + Weapon State Preservation
- Task #48: Wired ObjectStatus side-effects — INDESTRUCTIBLE (body field), IMMOBILE (kindOf), DISABLED_HELD, UNSELECTABLE, MASKED (selection+targeting), NO_COLLISIONS (pathfinding), NO_ATTACK_FROM_AI
- Task #49: Weapon anti-mask system — parsed 8 anti-mask flags from INI, totalWeaponAntiMask per entity, resolveTargetAntiMask from kindOf, container enclosure check (garrison/helix), helix portable rider exempt
- Task #50: maxShotsToFire shot counter + LOCKED_TEMPORARILY weapon lock in combat-update, clearMaxShotsAttackState callback
- Task #51: Preserve weapon slot runtime state across set changes — only reset timing when template name changes
- Code review fixes each task: INDESTRUCTIBLE as body field not status, entity.isImmobile not status bit, DEMOTRAP in mine branch, helix portable rider, anti-mask priority order, AntiGround pre-seeded default
- Commits: 440e329, 3a7c40b, baeedc1, c3e7e68
- All 1009 tests pass, clean build
- Next: Tasks #52-55 created (containment fire rules, slaver linkage, transport containment, AI state machine)

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
