# Game Logic Remaining Roadmap (Source-Parity)

Last updated: 2026-03-04

## Objective

Ship browser gameplay that behaves as close as possible to retail C&C Generals Zero Hour,
prioritizing deterministic simulation parity first, then player-visible UI/audio parity.

## Current Baseline

- Branch target: `main`
- Test baseline: `1975` passing (`npx vitest run`)
- Worktree state: in progress (active parity slices)
- Primary parity signal: `Source parity subset` markers still present in `game-logic` (`237` hits in `index.ts`)

---

## Previous Roadmap (2026-02-24) — Completed

Status: **COMPLETED** (closed on 2026-03-04).

- [x] Phase 1: Script Team Condition/State Parity
- [x] Phase 2: Waypoint-Path Movement/Completion Parity tranche (initial subset)
- [x] Phase 3: Script CommandButton Coverage Parity tranche (initial subset)
- [x] Phase 4: Generic Enterability / GroupEnter Parity tranche (initial subset)
- [x] Phase 5: Terrain-Affecting Script Action Parity tranche
- [x] Phase 6: AI Integration Parity Cleanups tranche

Note: Completed means those slices were implemented and merged. It does not mean full source equivalence for all downstream systems.

---

## Active Roadmap (Parity Closure Plan)

### Phase 1: Projectile/Combat Delivery Parity

Goal: remove remaining projectile-delivery shortcuts and match source collision/detonation timing.

Action items:
- [x] P1.1 Port projectile entity lifecycle for weapon-delivered projectiles.
- [x] P1.2 Route `delivery === PROJECTILE` damage through projectile collision path, not direct apply shortcut.
- [x] P1.3 Port collision filters (`shouldProjectileCollideWith`-style gates) and target reacquire edge cases.
- [x] P1.4 Add parity tests for impact timing, AoE victim selection, and redirect/reacquire behavior.

Primary files:
- `browser-port/packages/game-logic/src/combat-damage-events.ts`
- `browser-port/packages/game-logic/src/index.ts`
- `browser-port/packages/game-logic/src/index.test.ts`

Exit criteria:
- Projectile combat tests pass with no direct-projectile shortcut TODO left.

### Phase 2: Waypoint-Path + Group Movement Script Parity

Goal: replace terminal-waypoint approximations with source waypoint-following semantics.

Action items:
- [x] P2.1 Port true command-button waypoint usage flow for `NAMED_USE_COMMANDBUTTON_ABILITY_USING_WAYPOINT_PATH`.
- [x] P2.2 Align `doNamedFollowWaypoints`, `doTeamFollowWaypoints`, and exact variants with source completion behavior.
- [x] P2.3 Align waypoint completion condition updates (`NAMED_REACHED_WAYPOINTS_END` / team variants) with AI path-state transitions.
- [x] P2.4 Add parity tests for `asTeam` offset behavior, exact-path behavior, and completion labels.

Primary files:
- `browser-port/packages/game-logic/src/index.ts`
- `browser-port/packages/game-logic/src/index.test.ts`

Exit criteria:
- Waypoint-path actions no longer rely on terminal-only subset behavior.

### Phase 3: Enterability and Capture Flow Parity

Goal: close remaining subset logic around scripted enter/capture actions.

Action items:
- [x] P3.1 Port generic enterability checks used by script enter flows (`isEnterable/getInOrOn` semantics).
- [x] P3.2 Upgrade `TEAM_CAPTURE_NEAREST_UNOWNED_FACTION_UNIT` target selection and execution to full partition/filter semantics.
- [x] P3.3 Align relation/ownership edge cases for disabled-unmanned capture and scripted enter commands.
- [x] P3.4 Add targeted regression tests for capture, enter rejection, and mixed-affiliation cases.

Primary files:
- `browser-port/packages/game-logic/src/index.ts`
- `browser-port/packages/game-logic/src/index.test.ts`

Exit criteria:
- Script capture/enter actions match source selection + execution behavior in tests.

### Phase 4: Control Bar and Command Validation Parity

Goal: remove UI-side fallback behavior and ensure command availability/dispatch matches source rules.

Action items:
- [x] P4.1 Replace selection-scoped upgrade/science checks with player-authoritative state.
- [x] P4.2 Remove fallback movable command-card path and rely on full `CommandSet`-driven generation.
- [x] P4.3 Port object-target validity checks (`CommandButton::isValidToUseOn` equivalent) into command issuance path.
- [x] P4.4 Remove TODO-based dispatch fallbacks for mapped commands and add explicit source-compatible handling.

Primary files:
- `browser-port/packages/app/src/control-bar-buttons.ts`
- `browser-port/packages/app/src/control-bar-dispatch.ts`
- `browser-port/packages/ui/src/control-bar.ts`
- `browser-port/packages/app/src/control-bar-buttons.test.ts`
- `browser-port/packages/app/src/control-bar-dispatch.test.ts`

Exit criteria:
- No control-bar runtime TODO fallbacks for known commands.

### Phase 5: Audio Perception Parity

Goal: align audible behavior with shroud, relationship, and interrupt/limit rules.

Action items:
- [x] P5.1 Resolve positional audio for object/drawable-bound events with runtime ownership position lookup.
- [x] P5.2 Wire `ST_SHROUDED` culling to live local-player shroud state.
- [x] P5.3 Align interrupt replacement behavior with source active-sample semantics.
- [x] P5.4 Replace neutral-default relationship fallback with team/player graph relationship resolution.

Primary files:
- `browser-port/packages/audio/src/index.ts`
- `browser-port/packages/audio/src/index.test.ts`

Exit criteria:
- Audio TODO parity gaps removed for culling/relationship/interrupt behavior.

### Phase 6: Script Endgame and Presentation Bridge Parity

Goal: align script-driven endgame/presentation behavior with source where it impacts gameplay flow.

Action items:
- [x] P6.1 Align victory/defeat handling with source timer/UI progression semantics.
- [x] P6.2 Finalize debug crash-box routing behavior and runtime pause semantics.
- [x] P6.3 Close remaining camera/emoticon bridge gaps and remove stale TODO comments where runtime is already wired.
- [x] P6.4 Add integration tests for camera/effects/emoticon state propagation through app runtime bridges.

Primary files:
- `browser-port/packages/game-logic/src/index.ts`
- `browser-port/packages/app/src/script-camera-runtime.ts`
- `browser-port/packages/app/src/script-camera-effects-runtime.ts`
- `browser-port/packages/app/src/script-emoticon-runtime.ts`
- `browser-port/packages/app/src/main.ts`

Exit criteria:
- Script presentation bridges are behaviorally consistent and test-covered.

### Phase 7: Deterministic Snapshot and Lockstep Parity

Goal: replace transitional CRC serialization with source-shaped owner snapshots.

Action items:
- [x] P7.1 Replace object CRC section with true runtime owner order/snapshot source.
- [x] P7.2 Replace partition/player/AI CRC sections with owner snapshots instead of scaffold summaries.
- [x] P7.3 Ensure deterministic command serializer supports all in-use command types (no runtime unsupported throws in normal play).
- [x] P7.4 Add long-run determinism stress tests and replay CRC invariance tests.

Primary files:
- `browser-port/packages/game-logic/src/deterministic-state.ts`
- `browser-port/packages/game-logic/src/deterministic-crc.test.ts`

Exit criteria:
- Deterministic snapshot path has no transitional TODO markers and passes replay/CRC stress tests.

### Phase 8: Browser Playability Certification

Goal: prove the game is practically playable in browser with parity-critical behavior.

Action items:
- [x] P8.1 Expand E2E from smoke-only to scenario checks (build, combat, powers, scripts).
- [x] P8.2 Add parity scenario fixtures for campaign-like script actions and skirmish AI interactions.
- [x] P8.3 Run full regression suite after each scenario slice and track parity deltas.
- [x] P8.4 Produce final “parity gap list” with blockers only.

Primary files:
- `browser-port/e2e/smoke.e2e.ts`
- `browser-port/e2e/*.e2e.ts` (new scenario files)

Exit criteria:
- Browser E2E includes gameplay scenarios beyond app-load smoke.

Current status note:
- Playwright now includes `smoke.e2e.ts`, `gameplay-script-endgame.e2e.ts`, `gameplay-build-power.e2e.ts`, `gameplay-combat.e2e.ts`, `gameplay-ai-interaction.e2e.ts`.
- Scenario slice status: `4 passed` for gameplay E2E (`script-endgame`, `build-power`, `combat`, `ai-interaction`), plus smoke coverage.

Final parity gap list (blockers only):
- None in this roadmap tranche.

---

## Global Execution Rules

- For each action item:
  1. Implement code in the listed files.
  2. Add focused regression tests.
  3. Run targeted tests, then full `npx vitest run`.
  4. Commit to `main` with one commit per discrete slice.

- Source references for all parity decisions:
  - `GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptEngine.cpp`
  - `GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptConditions.cpp`
  - `GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptActions.cpp`
  - `GeneralsMD/Code/GameEngine/Source/GameLogic/Object/Object.cpp`
  - `GeneralsMD/Code/GameEngine/Source/GameLogic/AI/*.cpp`

- Keep this document status-driven:
  - Move completed items to `[x]` immediately after merge.
  - Update baseline test count after every major phase.
