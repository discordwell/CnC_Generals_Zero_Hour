# Session Summaries

## 2026-02-20T21:10Z — ProneUpdate + Continued Feature Work
- ProneUpdate: infantry prone behavior — committed 7b02c75
  - proneDamageToFramesRatio INI extraction, proneFramesRemaining countdown
  - Damage trigger in applyWeaponDamageAmount with NO_ATTACK status flag
  - PRONE added to RenderAnimationState, integrated into deriveRenderAnimationState priority
  - Code review fixes: C++ double-truncation parity (Math.trunc before multiply), removed redundant animationState assignment
  - 4 tests — All 1124 tests pass

## 2026-02-20T20:30Z — PointDefenseLaserUpdate + HordeUpdate
- PointDefenseLaserUpdate: anti-projectile defense system — committed 31db58d
  - PointDefenseLaserProfile INI: WeaponTemplate, PrimaryTargetTypes, SecondaryTargetTypes, ScanRate, ScanRange
  - Scan/track/fire state machine with staggered init, projectile kindOf matching via template cache
  - Double-tracking prevention (interceptedThisFrame Set), fire-immediately-after-scan C++ parity
  - interceptProjectileEvent: splices PendingWeaponDamageEvent, emits WEAPON_FIRED/WEAPON_IMPACT
  - 5 tests — All 1111 tests pass
- HordeUpdate: formation bonus system — committed 62d0c68
  - HordeUpdateProfile INI: UpdateRate, KindOf, Count, Radius, RubOffRadius, AlliesOnly, ExactMatch, AllowedNationalism
  - Periodic spatial scan, three-tier detection (true member, rub-off inheritance, none)
  - HORDE/NATIONALISM/FANATICISM weapon bonus condition flags based on horde status + player sciences
  - Code review fixes: ALL-match kindOf (not ANY), idempotent flag recalculation, allowedNationalism clearing
  - 9 tests — All 1120 tests pass

## 2026-02-20T19:00Z — BattlePlanUpdate System (Task #88)
- Task #88: USA Strategy Center BattlePlanUpdate with full C++ source parity — committed a3a1872
  - BattlePlanProfile INI: Bombardment/HoldTheLine/SearchAndDestroy bonus flags + scalars
  - State machine: IDLE → UNPACKING → ACTIVE → PACKING → IDLE with timed transitions
  - Reference-counted bonuses via sideBattlePlanBonuses (0→1 apply, 1→0 remove)
  - 7 tests — All 1106 tests pass, clean build

## 2026-02-20T17:50Z — INI-Driven Stealth/Detection System + Code Review Fixes (Tasks #85-87)
- Tasks #85-87: INI-driven stealth and detection system with C++ StealthUpdate/StealthDetectorUpdate parity
  - StealthProfile + DetectorProfile INI parsing, 9 forbidden condition tokens, detection rate throttle
  - 12 tests — All 1091 tests pass, clean build

## 2026-02-20T16:00Z — Crush/Squish Damage During Movement (Task #95)
- Task #95: Crush collision system with C++ PhysicsUpdate::checkForOverlapCollision + SquishCollide parity — committed 926c982
  - updateCrushCollisions(), direction dot-product check, canBeSquished, CRUSH damage type
  - 4 new tests — All 1079 tests pass, clean build

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
