# C&C Generals: Zero Hour Browser Port — Execution Build Plan

Date: 2026-02-14
Scope: full JavaScript/TypeScript browser port with deterministic simulation, playable skirmish, and production-grade tooling.

## 1) Current Baseline (Observed)

### Implemented now
- Monorepo layout exists under `browser-port/` with `packages/*` and `tools/*`.
- Working packages:
  - `@generals/core`: math, deterministic helpers, INI parser core, subsystem registry, game loop.
  - `@generals/input`: DOM input + RTS camera controls.
  - `@generals/terrain`: heightmap parsing, mesh build, terrain/water visuals, procedural terrain.
  - `@generals/app`: Three.js demo app wiring (`terrain + camera + loop`).
- Working tool CLIs:
  - `big-extractor`, `texture-converter`, `map-converter`, `w3d-converter`, `convert-all`.
- Placeholder packages:
  - `engine`, `assets`, `renderer`, `audio`, `ui`, `game-logic`, `network`, `ini-data`.
- Placeholder tool:
  - `tools/ini-parser/src/cli.ts`.

### Baseline command status (today)
- `npm run test`: PASS (`163` tests).
- `npm run typecheck`: FAIL (`TS6310` project-reference/noEmit issue).
- `npm run lint`: FAIL (`@ts-nocheck` in `matrix4.ts`, plus unused vars in tests).
- `npm run build`: FAIL (test files included in build; missing `beforeAll` types).
- `npm run test:e2e`: FAIL (no E2E tests, expect conflict + “No tests found”).

## 2) Execution Principles

1. Keep the repo continuously buildable.
2. Require deterministic simulation checks for any logic/system touching gameplay.
3. Use golden-file verification for binary format converters.
4. Every phase must end with a repeatable command set in CI.
5. Do not expand feature scope until prior phase gates are green.

## 3) Global Quality Gates (Apply To Every Phase)

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- New phase-specific test suites must be added to CI before phase is considered complete.

## 4) Phase Plan

## Phase 0 — Toolchain Stabilization And Repo Hygiene

Objective: make baseline green and reproducible.

Work:
1. Fix TypeScript project-reference config (`typecheck` must work).
2. Separate build tsconfig from test tsconfig so `build` excludes test files.
3. Remove or replace `@ts-nocheck` from `matrix4.ts`.
4. Fix lint failures in tests.
5. Add Playwright config and at least one smoke E2E test.
6. Decide artifact policy:
   - Either commit generated JS/DTS under `src/` intentionally and codify it.
   - Or stop committing generated outputs and clean `src/`.

Verification:
- Automated:
  - `npm run lint` passes.
  - `npm run typecheck` passes.
  - `npm run test` passes.
  - `npm run build` passes.
  - `npm run test:e2e` runs and passes at least one smoke test.
- Manual:
  - `npm run dev` opens app and renders procedural terrain.

Exit criteria:
- All five baseline commands are green on a clean clone.

## Phase 1 — INI Compiler And Data Registry Foundation

Objective: replace placeholder INI tooling with production parser/compiler path.

Work:
1. Implement `tools/ini-parser` CLI:
   - parse all INI files from base game + Zero Hour.
   - support includes, inheritance, typed fields, and deterministic output ordering.
2. Implement `packages/ini-data`:
   - schema-validated JSON bundles.
   - indexed lookup registries for objects, weapons, upgrades, sciences, factions.
3. Add error reporting with file+line+field context.
4. Add compatibility report for unsupported directives/features.

Verification:
- Automated:
  - unit tests for parser edge cases.
  - fixture tests on real INI samples.
  - snapshot tests for generated normalized JSON.
  - `npm run convert:ini -- --input <fixtureDir> --output <outDir>` exits 0.
- Data quality:
  - object/weapon/upgrade counts match expected baseline counts.
  - zero unresolved inheritance references.
- CI:
  - add `test:ini` suite and run in CI.

Exit criteria:
- `convert:ini` works on representative real data and emits stable outputs.

## Phase 2 — Asset Pipeline Hardening (BIG, Texture, W3D, MAP)

Objective: move converters from synthetic-test confidence to real-asset confidence.

Work:
1. Add golden fixtures for each converter using real extracted files.
2. Expand texture support matrix (document unsupported formats explicitly).
3. Expand W3D coverage:
   - more chunk variants.
   - skeletal animation + hierarchy validation.
4. Add map conversion correctness checks for triggers, object dictionaries, and edge cases.
5. Add conversion manifest output:
   - source hash.
   - converted artifact hash.
   - converter version.

Verification:
- Automated:
  - converter golden tests pass (`test:converters`).
  - `npm run convert:all -- --game-dir <path> --only big,texture,w3d,map,ini` completes.
- Artifact validation:
  - produced files can be reloaded by runtime parsers with no parse errors.
  - rerun produces identical hashes.

Exit criteria:
- Full conversion pipeline produces deterministic outputs and manifest.

## Phase 3 — Runtime Asset System (`@generals/assets`)

Objective: runtime loading and caching of converted artifacts.

Work:
1. Implement `@generals/assets`:
   - manifest loader.
   - fetch + IndexedDB cache layer.
   - path resolution + versioned cache invalidation.
2. Add streaming + progress reporting APIs.
3. Add runtime integrity checks (hash compare against manifest).

Verification:
- Automated:
  - unit tests with mocked fetch/IndexedDB.
  - integration test loading map + textures + model from manifest.
- Manual:
  - cold load and warm load timings logged in dev overlay.

Exit criteria:
- App can load converted assets through `@generals/assets` only (no hardcoded demo path dependency).

## Phase 4 — Engine Package And Deterministic Simulation Kernel

Objective: implement real `@generals/engine` and `@generals/game-logic` foundations.

Work:
1. Move loop/subsystem ownership from `core` into `engine` package boundary.
2. Implement deterministic state container:
   - object IDs.
   - frame tick.
   - command queue.
3. Add state hashing (CRC) per frame.
4. Add headless simulation mode.

Verification:
- Automated:
  - headless test: run 10,000 frames with fixed seed and compare final CRC.
  - same test under Node and browser worker.
- CI:
  - add `test:determinism`.

Exit criteria:
- Deterministic headless sim exists and produces stable CRC for fixed input.

## Phase 5 — Pathfinding And Terrain Logic

Objective: playable movement and terrain interaction.

Work:
1. Passability grid generation from map + object blockers.
2. A* pathfinding with terrain constraints and unit footprint sizes.
3. Dynamic obstacle updates.
4. Path smoothing and local steering.

Verification:
- Automated:
  - pathfinding fixtures with expected waypoint outputs.
  - stress tests for 200 moving units within frame budget.
- Manual:
  - in-app debug overlay for passability and computed paths.

Exit criteria:
- Units path around obstacles reliably in scripted scenarios.

## Phase 6 — Renderer Package (`@generals/renderer`) Integration

Objective: migrate rendering out of app glue and support real art pipeline outputs.

Work:
1. Move terrain/water visuals into `@generals/renderer`.
2. Add texture material system tied to converted texture outputs.
3. Add sky/fog/light presets from map metadata.
4. Add minimap render target.

Verification:
- Automated:
  - renderer integration tests (scene bootstrap + resource lifecycle).
  - screenshot-golden tests on canonical maps.
- Manual:
  - compare 3 maps against reference captures.

Exit criteria:
- Renderer package owns map scene rendering end-to-end.

## Phase 7 — Object Rendering, Animation, Effects

Objective: units/buildings are visible, animated, and selectable.

Work:
1. Runtime glTF model loader integration.
2. Skeleton + animation playback + transitions.
3. Selection rings, health bars, simple projectile/explosion effects.
4. LOD and instancing for repeated units.

Verification:
- Automated:
  - animation state-machine tests.
  - model loading regression fixtures.
- Performance:
  - 50 visible units at target FPS on reference hardware.

Exit criteria:
- Unit set can idle/move/attack/die visually.

## Phase 8 — Gameplay Core (Economy, Combat, Production, Upgrades)

Objective: first true skirmish gameplay loop.

Work:
1. Player resources and supply gather/deposit loop.
2. Production queues and build times.
3. Weapon/damage/armor interaction.
4. Upgrade research and application.
5. Command system for move/attack/build/train/upgrade.

Verification:
- Automated:
  - scenario tests for economy and production timings.
  - combat tests with expected TTK/armor multipliers.
  - deterministic replay of command stream.
- Manual:
  - scripted 1v1 sandbox with two factions.

Exit criteria:
- Player can play core RTS loop against scripted opponent.

## Phase 9 — UI And UX (`@generals/ui`)

Objective: playable shell + in-game control bar flow.

Work:
1. Main menu and skirmish setup.
2. In-game HUD: resource, minimap, command card, build queue.
3. Selection interaction and hotkeys.
4. Context-sensitive command buttons.

Verification:
- Automated:
  - component interaction tests.
  - E2E tests for menu → skirmish → command issuance.
- Manual:
  - keyboard and mouse controls parity checks.

Exit criteria:
- Full menu-to-match-to-command flow works without debug shortcuts.

## Phase 10 — Audio (`@generals/audio`)

Objective: complete audio runtime (music, SFX, speech/EVA).

Work:
1. Audio manager and channel/group volume control.
2. Positional sound for world events.
3. EVA event routing and cooldown rules.

Verification:
- Automated:
  - unit tests for routing and prioritization.
  - integration tests for event-driven playback.
- Manual:
  - validate volume sliders and category muting in options.

Exit criteria:
- Audio behaves consistently in extended gameplay sessions.

## Phase 11 — Fog Of War, Stealth, Intel

Objective: visibility system parity for gameplay correctness.

Work:
1. Per-player visibility grids and reveal updates.
2. Shroud rendering integration with minimap.
3. Stealth + detector mechanics.

Verification:
- Automated:
  - visibility-state unit tests for moving units/buildings.
  - stealth boundary tests.
- Manual:
  - visual debug overlays for visible/seen/unseen states.

Exit criteria:
- Fog/stealth affect both rendering and targetability correctly.

## Phase 12 — AI (Skirmish)

Objective: practical AI opponent baseline.

Work:
1. Build-order/economy planner.
2. Tactical attack/defend behavior.
3. Difficulty tuning parameters.

Verification:
- Automated:
  - long-run stability tests (AI vs AI N frames, no crashes/asserts).
- Gameplay:
  - win-rate benchmarks by difficulty against scripted player bot.

Exit criteria:
- AI can complete full match loop and produce credible pressure.

## Phase 13 — Faction And Content Completion

Objective: complete base factions then Zero Hour subfactions.

Work:
1. Implement full USA/China/GLA tech trees.
2. Implement 9 generals deltas.
3. Validate unit/building availability and upgrade wiring.

Verification:
- Automated:
  - content integrity checks:
    - unresolved references.
    - missing art/audio assets.
    - missing command buttons/upgrades.
  - matrix tests for faction-vs-faction startup validity.
- Manual:
  - curated checklist for signature faction mechanics.

Exit criteria:
- Feature-complete faction content with no unresolved data references.

## Phase 14 — Multiplayer Lockstep And Replay

Objective: deterministic multiplayer with desync detection and replay.

Work:
1. Lobby + room lifecycle.
2. Lockstep command distribution.
3. Frame CRC desync detection and diagnostics.
4. Replay record/playback.

Verification:
- Automated:
  - two-client integration tests with simulated latency/jitter.
  - replay determinism: replay CRC equals live game CRC.
- Manual:
  - 10+ minute live session with no desync.

Exit criteria:
- Stable lockstep multiplayer and deterministic replay path.

## Phase 15 — Optimization, Compatibility, Release Readiness

Objective: production readiness and cross-browser quality.

Work:
1. CPU/GPU profiling and bottleneck removal.
2. Memory pressure reduction and object pools.
3. Browser compatibility fixes (Chrome/Firefox/Safari/Edge).
4. Crash logging and telemetry hooks.

Verification:
- Performance budgets:
  - target scene unit counts at FPS threshold.
  - startup and asset load budget targets.
- Compatibility matrix:
  - smoke and core gameplay tests per target browser.

Exit criteria:
- Meets documented FPS/memory/load-time targets and passes compatibility matrix.

## 5) Immediate Next Sprint (Recommended Order)

1. Complete Phase 0 fully before any new feature work.
2. Implement `tools/ini-parser` and `@generals/ini-data` (Phase 1).
3. Add real-asset golden tests for all converters (Phase 2).
4. Build `@generals/assets` runtime loader/caching (Phase 3).
5. Start deterministic kernel in `@generals/engine` + `@generals/game-logic` (Phase 4).

## 6) Definition Of Done For This Plan

This plan is complete when:
- each phase has code deliverables,
- each phase has explicit verification,
- global gates remain green,
- and progress is tracked phase-by-phase without skipping unresolved blockers.
