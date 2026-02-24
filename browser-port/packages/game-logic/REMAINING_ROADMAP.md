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

## Remaining High-Impact Slices

- None in this roadmap tranche.

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
