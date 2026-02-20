# Old Session Summaries

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
