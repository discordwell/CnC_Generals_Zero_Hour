# Game Logic Remaining Roadmap (Source-Parity)

Last updated: 2026-02-23

## Objective

Finish the remaining gameplay-critical parity gaps by porting behavior directly from
Generals/ZH C++ source, without heuristic substitutions.

## Current Baseline

- Branch target: `main`
- Test baseline: `1666` passing (`npx vitest run`)
- Recently completed slices:
  - Script team instance-resolution parity (`getTeamNamed` context precedence + condition-team iteration + `TEAM_HAS_UNITS` prototype fan-out)
  - Team command-button target filtering parity (source command-button source + controlling-side affiliation checks)
  - Script-facing TeamFactory lifecycle subset (`doBuildTeam`/`doRecruitTeam` non-singleton materialization + max-instance handling + delay behavior)
  - `TEAM_STOP_AND_DISBAND` parity bridge (recruitable override + merge into controlling-player default team)
  - `teamThePlayer` alias fallback to map `SidesList` default-team mapping (`team<playerName>`)

## Remaining High-Impact Slices

1. Skirmish nearest-group-with-value parity
- Port `ScriptActions::doSkirmishAttackNearestGroupWithValue` from object-value approximation
  to source `PartitionManager::getNearestGroupWithValue` semantics.
- Keep comparison handling and destination selection aligned to source behavior.

2. Skirmish command-button-on-most-valuable partition parity
- Replace current candidate scan/sort approximation with source iterator behavior:
  `iterateObjectsInRange(..., ITER_SORTED_EXPENSIVE_TO_CHEAP)` +
  `PartitionFilterValidCommandButtonTarget` semantics.
- Preserve existing source-command-button-source and same-map filters.

3. Team created lifecycle parity tightening
- Align `evaluateTeamCreated`/`created` transitions closer to `Team::setActive` + `Team::updateState`
  one-frame semantics where feasible in the current script-facing architecture.
- Keep delay behavior wired through script base-construction-speed controls.

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
