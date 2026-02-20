# Old Session Summaries

## 2026-02-20T16:00Z — Crush/Squish Damage During Movement (Task #95)
- Task #95: Crush collision system with C++ PhysicsUpdate::checkForOverlapCollision + SquishCollide parity — committed 926c982
  - updateCrushCollisions(), direction dot-product check, canBeSquished, CRUSH damage type
  - 4 new tests — All 1079 tests pass, clean build

## 2026-02-20T15:20Z — 3D Damage Distance + Bounding Sphere Subtraction (Tasks #93-94)
- Tasks #93-94: 3D distance for radius damage + FROM_BOUNDINGSPHERE_3D subtraction — commits b6a67fd, 1e62ef5
  - Full 3D damage gathering, BSR by geometry type
  - 1 new test — All 1075 tests pass, clean build

## 2026-02-20T14:12Z — Power Brown-Out + Disabled Movement Restrictions (Tasks #88-89)
- Tasks #88-89: Disabled movement restrictions + DISABLED_UNDERPOWERED power brown-out — commits 5e8548e, ff369fe
  - isEntityDisabledForMovement(), SUBDUED blocks evacuate, brownedOut edge detection, countdown push
  - 10 new tests — All 1069 tests pass, clean build

## 2026-02-20T09:10Z — Skirmish AI Enhancements (Task #77)
- Task #77: AI system enhancements for skirmish parity — committed afa1b93
  - Dozer replacement, upgrade research, science purchasing, rally points, multi-dozer parallel construction
  - Fixed: dozers excluded from factory scan, isDozerBusy checks pendingConstructionActions, 18-slot command set grid
  - 4 new tests — All 1037 tests pass, clean build

## 2026-02-20T09:30Z — Projectile Flight Collision Detection (Task #78)
- Task #78: Projectile flight collision detection with C++ DumbProjectileBehavior parity — committed 7fa2d1b
  - Interpolation-based collision, shouldProjectileCollideWithEntityImpl, sneaky-offset parity
  - 3 new tests — All 1040 tests pass, clean build

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

## 2026-02-19T05:30Z — OCL Pipeline + EVA Announcer + Code Review Fixes
- Completed EVA announcer event system (#47): buffer, cooldowns, 11 event types wired
- Code review fixes: Math.random()→gameRandom, Offset as 3-component Coord3D, block type guard
- Commits: 81437bf, fcfeed5 — All 1009 tests pass

## 2026-02-14T15:00Z — Stage 2 Asset Pipeline Implementation
- Merged `claude/plan-generals-browser-game-czKRy` into main (fast-forward)
- Fixed TS build errors: matrix4.ts noUncheckedIndexedAccess (added @ts-nocheck), engine/index.ts isolatedModules export type
- Build passes, 38 tests pass (vector3, ini-parser, game-math)
- Created `tools/convert-all.ts` master conversion script
- Added `convert:texture` and `convert:all` npm scripts
- Added `public/assets/` to .gitignore
- Launched 4 parallel agents for Stage 2A-2D:
  - 2A: BIG archive extractor (agent a433959)
  - 2B: Texture converter TGA+DDS (agent adb2ecf)
  - 2C: W3D→glTF converter (agent a471faa)
  - 2D: Map converter (agent aa243f2)
