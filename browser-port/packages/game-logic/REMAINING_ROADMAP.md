# Game Logic Remaining Roadmap (Source-Parity)

Last updated: 2026-02-24

## Objective

Finish the remaining gameplay-critical parity gaps by porting behavior directly from
Generals/ZH C++ source, without heuristic substitutions.

## Current Baseline

- Branch target: `main`
- Test baseline: `1667` passing (`npx vitest run`)
- Recently completed slices:
  - Script team instance-resolution parity (`getTeamNamed` context precedence + condition-team iteration + `TEAM_HAS_UNITS` prototype fan-out)
  - Team command-button target filtering parity (source command-button source + controlling-side affiliation checks)
  - Script-facing TeamFactory lifecycle subset (`doBuildTeam`/`doRecruitTeam` non-singleton materialization + max-instance handling + delay behavior)
  - Scripted `TEAM_CREATED` lifecycle tightening (build/recruit readiness now emits one-frame created pulse)
  - `TEAM_STOP_AND_DISBAND` parity bridge (recruitable override + merge into controlling-player default team)
  - `teamThePlayer` alias fallback to map `SidesList` default-team mapping (`team<playerName>`)
  - `doSkirmishAttackNearestGroupWithValue` partition-cell parity (`getNearestGroupWithValue`-style enemy cash-value breadth-first lookup)
  - `doSkirmishCommandButtonOnMostValuable` partition iterator parity (`FROM_CENTER_2D` + strict range boundary + expensive-to-cheap first target)

## Next Tranche: Gameplay-Critical Source Parity

### Phase 1: Script Team Condition/State Parity (1-2 sessions)

Focus: remove remaining ScriptEngine team-resolution gaps that still use subset behavior.

- Expand full team-instance resolution in team-scoped conditions:
  - `evaluateScriptIsDestroyed`
  - `evaluateScriptTeamAttackedByPlayer`
  - `evaluateScriptTeamDiscovered`
  - `evaluateScriptTeamHasObjectStatus`
- Align team ownership/state checks with source semantics:
  - `evaluateScriptTeamOwnedByPlayer` via controlling-player ownership parity
  - `setScriptTeamState` integration with real team state transitions
  - `evaluateScriptTeamIsContained` include transitional `AI_EXIT` behavior
- Validate `TEAM_CREATED` condition lifecycle against TeamFactory events and remove stale subset TODOs where behavior is already wired.

Primary source references:
- `GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptConditions.cpp`
- `GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptEngine.cpp`
- `GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptActions.cpp`

### Phase 2: Waypoint-Path Movement/Completion Parity (2 sessions)

Focus: replace waypoint-path approximations with source movement semantics.

- Port true waypoint-following projectile behavior for:
  - `doNamedFireWeaponFollowingWaypointPath`
- Port group-level waypoint behavior for:
  - `doTeamFollowWaypoints`
  - `doTeamFollowWaypointsExact`
  - `doTeamFollowSkirmishApproachPath` (including `asTeam`)
- Drive waypoint completion labels from AI waypoint follower state (not ad-hoc notifications):
  - `notifyScriptWaypointPathCompleted`
  - `evaluateScriptNamedReachedWaypointsEnd`

Primary source references:
- `GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptActions.cpp`
- `GeneralsMD/Code/GameEngine/Source/GameLogic/Object/Update/AIUpdate/*.cpp`

### Phase 3: Script CommandButton Coverage Parity (2-3 sessions)

Focus: close remaining map-script command button gaps currently returning false.

- Audit `executeScriptCommandButtonForEntity` against source command dispatch matrix.
- Implement missing command types used by map scripts instead of default-false fallback.
- Ensure target-validation parity is preserved for each newly added command type.

Primary source references:
- `GeneralsMD/Code/GameEngine/Source/GameLogic/Object/Object.cpp`
- `GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptActions.cpp`
- `GeneralsMD/Code/GameEngine/Source/GameLogic/Object/CommandButton*.cpp`

### Phase 4: Generic Enterability / GroupEnter Parity (1-2 sessions)

Focus: replace special-case enter logic with source enterability framework.

- Port generic `Object::isEnterable/getInOrOn` semantics for script enter flows.
- Upgrade `TEAM_CAPTURE_NEAREST_UNOWNED_FACTION_UNIT` from subset targeting to full partition/groupEnter filter chain.
- Close related edge parity:
  - bridge-tower same-bridge repair retarget rejection once bridge linkage data is available.

Primary source references:
- `GeneralsMD/Code/GameEngine/Source/GameLogic/Object/Object.cpp`
- `GeneralsMD/Code/GameEngine/Source/GameLogic/AI/AIGroup*.cpp`
- `GeneralsMD/Code/GameEngine/Source/GameLogic/Object/PartitionManager.cpp`

### Phase 5: Terrain-Affecting Script Action Parity (1-2 sessions)

Focus: restore world-state side effects expected by campaign/skirmish scripts.

- `BLAST_CRATER`: terrain deformation + pathfinding refresh.
- `MAP_SWITCH_BORDER`: active boundary update + observer/shroud refresh.
- Water-height script actions: ensure pathfinding/nav refresh parity for dynamic water changes.

Primary source references:
- `GeneralsMD/Code/GameEngine/Source/GameLogic/Map/TerrainLogic.cpp`
- `GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptActions.cpp`
- `GeneralsMD/Code/GameEngine/Source/GameLogic/Object/PartitionManager.cpp`

### Phase 6: AI Integration Parity Cleanups (1 session)

Focus: close lower-cost but gameplay-visible behavior deltas.

- Wire `AI_RECRUITABLE` object-panel flag into AI recruit/merge logic.
- Port `AI_WANDER_IN_PLACE` repulsor transition (`AI_MOVE_AWAY_FROM_REPULSORS`).
- Add no-effect damage parity check in skirmish supply-source attacked condition.

Primary source references:
- `GeneralsMD/Code/GameEngine/Source/GameLogic/AI/AIUpdate*.cpp`
- `GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptConditions.cpp`

## Deferred (Non-Simulation Bridges)

These are important for presentation/tooling parity, but not core simulation correctness:

- TacticalView camera bridge actions
- Audio/speech completion timing from media metadata
- Drawable emoticon/indicator color rendering bridges
- Runtime debug UI/crash-box bridge behavior

## Execution Rules

- For each slice:
  1. Implement in `browser-port/packages/game-logic/src/index.ts`.
  2. Add/adjust focused tests in `browser-port/packages/game-logic/src/index.test.ts`.
  3. Run targeted vitest subset, then full `npx vitest run`.
  4. Commit and push to `main`.

- Always confirm behavior against C++ source first:
  - `GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptEngine.cpp`
  - `GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptConditions.cpp`
  - `GeneralsMD/Code/GameEngine/Source/GameLogic/ScriptEngine/ScriptActions.cpp`
  - `GeneralsMD/Code/GameEngine/Source/GameLogic/AI/AIPlayer.cpp`
