# Session Summaries

## 2026-02-20T19:00Z — BattlePlanUpdate System (Task #88)
- Task #88: USA Strategy Center BattlePlanUpdate with full C++ source parity — committed a3a1872
  - BattlePlanProfile INI: Bombardment/HoldTheLine/SearchAndDestroy bonus flags + scalars
  - State machine: IDLE → UNPACKING → ACTIVE → PACKING → IDLE with timed transitions
  - Three plans: BOMBARDMENT (weapon bonus), HOLDTHELINE (armor scalar), SEARCHANDDESTROY (vision range)
  - C++ parity: bonuses/paralysis applied immediately at packing start, not end
  - Reference-counted bonuses via sideBattlePlanBonuses (0→1 apply, 1→0 remove)
  - Special power routing: specialPowerName-based plan ID (avoids commandOption bitmask collision with 0x01)
  - Vision range uses absolute restoration (not multiplicative inverse) to prevent FP drift
  - InvalidMemberKindOf filtering, building self-exclusion from paralysis
  - 7 tests: bombardment, armor scalar, vision, immediate paralysis, destruction cleanup, kindOf filter, building immunity
- Code review fixes: reference counting, packing timing, requestBattlePlanChange simplified to desiredPlan only
- All 1106 tests pass, clean build

## 2026-02-20T17:50Z — INI-Driven Stealth/Detection System + Code Review Fixes (Tasks #85-87)
- Tasks #85-87: INI-driven stealth and detection system upgrade with full C++ StealthUpdate/StealthDetectorUpdate parity
  - StealthProfile + DetectorProfile INI parsing, 9 forbidden condition tokens, detection rate throttle
  - SOLD check, garrison check, contained-in-non-garrisonable, TAKING_DAMAGE frame window, healing exclusion
  - 12 tests — All 1091 tests pass, clean build

## 2026-02-20T16:00Z — Crush/Squish Damage During Movement (Task #95)
- Task #95: Crush collision system with C++ PhysicsUpdate::checkForOverlapCollision + SquishCollide parity — committed 926c982
  - updateCrushCollisions(), direction dot-product check, canBeSquished, CRUSH damage type
  - 4 new tests — All 1079 tests pass, clean build

## 2026-02-20T15:20Z — 3D Damage Distance + Bounding Sphere Subtraction (Tasks #93-94)
- Tasks #93-94: 3D distance for radius damage + FROM_BOUNDINGSPHERE_3D subtraction — commits b6a67fd, 1e62ef5
  - Full 3D damage gathering, BSR by geometry type, code review caught BOX formula bug
  - 1 new test — All 1075 tests pass, clean build

## 2026-02-20T14:12Z — Power Brown-Out + Disabled Movement Restrictions (Tasks #88-89)
- Tasks #88-89: Disabled movement restrictions + DISABLED_UNDERPOWERED power brown-out — commits 5e8548e, ff369fe
  - isEntityDisabledForMovement(), SUBDUED blocks evacuate, brownedOut edge detection, countdown push
  - 10 new tests — All 1069 tests pass, clean build

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
