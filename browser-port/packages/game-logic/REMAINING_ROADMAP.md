# Game Logic Remaining Roadmap (Source-Parity)

Last updated: 2026-02-23

## Objective

Finish the remaining gameplay-critical parity gaps by porting behavior directly from
Generals/ZH C++ source, without heuristic substitutions.

## Current Baseline

- Branch target: `main`
- Test baseline: `1660` passing (`npx vitest run`)
- Recent completed slices:
  - Trigger-transition cache invalidation parity for area/value/unit-type/unit-kind script conditions
  - Team area `surfacesAllowed` locomotor-mask parity
  - Skirmish command-button-ready team-member parity
  - Shared tunnel/cave tracker capacity parity for named free-container-slot condition

## Remaining High-Impact Slices

1. Script team instance-resolution parity
- Port `ScriptEngine::getTeamNamed` semantics in TypeScript:
  - `<This Team>` resolves calling-team first, then condition-team
  - explicit team-name lookups prefer current calling/condition team when names match
  - team-prototype resolution behavior for singleton/non-singleton access
- Port `ScriptEngine::executeScript` condition-team iteration semantics for non-singleton team refs.
- Port `ScriptConditions::evaluateHasUnits` multi-instance behavior (prototype fan-out).

2. Team command-button target filtering parity
- Port remaining `ScriptActions.cpp` target scan behavior for:
  - nearest enemy / nearest building / nearest garrisoned building
  - nearest kind-of / nearest object type
  - skirmish command-button-on-most-valuable
- Mirror `PartitionFilterValidCommandButtonTarget` gate behavior and same-map filtering.

3. TeamFactory/recruit lifecycle parity (script-facing subset)
- Port script-facing lifecycle expectations around:
  - `doBuildTeam`
  - `doRecruitTeam`
  - `evaluateTeamCreated`
- Keep implementation bound to source behavior; avoid synthetic AI heuristics.

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

