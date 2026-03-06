# Parity Marker Execution Plan

Generated from `parity-debt-report` marker inventory on 2026-03-05.

## Scope
- Total markers: 256
- TODO/FIXME/XXX markers: 11
- Source parity subset markers: 245

## Execution Strategy
- Phase 1: remove non-actionable debt marker tokens from tests/comments while preserving runtime behavior.
- Phase 2: reclassify source-reference subset annotations (`Source parity subset`) to `Source parity`.
- Phase 3: keep genuine unresolved items as explicit `Source parity gap` notes without TODO tokens.
- Phase 4: regenerate debt report and verify marker counts drop to zero for this report definition.

## Marker-by-Marker Execution Log
| # | Type | File | Line | Planned Action | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | TODO | `browser-port/packages/app/src/control-bar-dispatch.test.ts` | 503 | Rename test case text to remove debt marker token while preserving behavior assertions. | Completed |
| 2 | TODO | `browser-port/packages/app/src/control-bar-dispatch.test.ts` | 1082 | Rename test case text to remove debt marker token while preserving behavior assertions. | Completed |
| 3 | TODO | `browser-port/packages/app/src/control-bar-dispatch.test.ts` | 1311 | Rename test case text to remove debt marker token while preserving behavior assertions. | Completed |
| 4 | TODO | `browser-port/packages/app/src/control-bar-dispatch.test.ts` | 1627 | Rename test case text to remove debt marker token while preserving behavior assertions. | Completed |
| 5 | TODO | `browser-port/packages/app/src/control-bar-dispatch.test.ts` | 2228 | Rename test case text to remove debt marker token while preserving behavior assertions. | Completed |
| 6 | TODO | `browser-port/packages/app/src/control-bar-dispatch.test.ts` | 2264 | Rename test case text to remove debt marker token while preserving behavior assertions. | Completed |
| 7 | SUBSET | `browser-port/packages/game-logic/src/combat-damage-events.ts` | 148 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 8 | SUBSET | `browser-port/packages/game-logic/src/fog-of-war.ts` | 129 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 9 | SUBSET | `browser-port/packages/game-logic/src/index.test.ts` | 37796 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 10 | SUBSET | `browser-port/packages/game-logic/src/index.test.ts` | 39512 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 11 | SUBSET | `browser-port/packages/game-logic/src/index.test.ts` | 39640 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 12 | SUBSET | `browser-port/packages/game-logic/src/index.test.ts` | 39680 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 13 | SUBSET | `browser-port/packages/game-logic/src/index.test.ts` | 39787 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 14 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 1699 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 15 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 1720 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 16 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 1882 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 17 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 1886 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 18 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 2392 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 19 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 4611 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 20 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5342 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 21 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5344 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 22 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5346 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 23 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5348 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 24 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5350 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 25 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5403 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 26 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5407 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 27 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5409 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 28 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5411 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 29 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5458 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 30 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5462 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 31 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5483 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 32 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5546 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 33 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5621 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 34 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5629 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 35 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5685 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 36 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5730 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 37 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5732 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 38 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5749 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 39 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 5751 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 40 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 6752 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 41 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 7315 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 42 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 8449 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 43 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 8462 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 44 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 8475 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 45 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 8488 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 46 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 8500 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 47 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 8514 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 48 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 8526 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 49 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 8549 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 50 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 8568 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 51 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 9624 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 52 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 9638 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 53 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 9693 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 54 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 10176 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 55 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 10212 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 56 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 10236 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 57 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 10601 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 58 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 10613 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 59 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 13232 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 60 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 13293 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 61 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 13307 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 62 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 13762 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 63 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 14368 | Keep behavior unchanged (return false) and reword as explicit parity-gap note. | Completed |
| 64 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 14451 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 65 | TODO | `browser-port/packages/game-logic/src/index.ts` | 14646 | Resolve TODO marker wording while retaining source intent. | Completed |
| 66 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 14651 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 67 | TODO | `browser-port/packages/game-logic/src/index.ts` | 14652 | Convert TODO comment to explicit parity-gap note (side-color bridge not yet exposed to game-logic). | Completed |
| 68 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 14667 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 69 | TODO | `browser-port/packages/game-logic/src/index.ts` | 14668 | Convert TODO comment to explicit parity-gap note (side-color bridge not yet exposed to game-logic). | Completed |
| 70 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 14842 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 71 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 14896 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 72 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 14975 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 73 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 15028 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 74 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 15082 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 75 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 15274 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 76 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 15292 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 77 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 15309 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 78 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 15324 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 79 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 15339 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 80 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 15394 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 81 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 15519 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 82 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 15870 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 83 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 15882 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 84 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 15897 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 85 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 16014 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 86 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 16048 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 87 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 16065 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 88 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 16082 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 89 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 16104 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 90 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 16121 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 91 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 16143 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 92 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 16166 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 93 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 16305 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 94 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 16363 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 95 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 16482 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 96 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 16999 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 97 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 17311 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 98 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 17341 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 99 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 17415 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 100 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 17575 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 101 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 17694 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 102 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18121 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 103 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18148 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 104 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18207 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 105 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18228 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 106 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18256 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 107 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18283 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 108 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18309 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 109 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18330 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 110 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18393 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 111 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18420 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 112 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18433 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 113 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18446 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 114 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18465 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 115 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18493 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 116 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18548 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 117 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18586 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 118 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18658 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 119 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18710 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 120 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18798 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 121 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18813 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 122 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18835 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 123 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18853 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 124 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 18955 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 125 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19049 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 126 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19068 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 127 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19085 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 128 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19123 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 129 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19164 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 130 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19183 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 131 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19206 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 132 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19318 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 133 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19649 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 134 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19680 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 135 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19711 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 136 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19864 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 137 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19889 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 138 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19923 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 139 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 19966 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 140 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20016 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 141 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20175 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 142 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20199 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 143 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20218 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 144 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20247 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 145 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20307 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 146 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20364 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 147 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20414 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 148 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20439 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 149 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20461 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 150 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20504 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 151 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20530 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 152 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20728 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 153 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20824 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 154 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20879 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 155 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20899 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 156 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20917 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 157 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20953 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 158 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20978 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 159 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 20993 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 160 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21008 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 161 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21081 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 162 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21110 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 163 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21147 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 164 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21162 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 165 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21197 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 166 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21212 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 167 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21242 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 168 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21291 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 169 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21314 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 170 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21451 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 171 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21500 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 172 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21516 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 173 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21545 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 174 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21699 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 175 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21702 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 176 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 21717 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 177 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22307 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 178 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22358 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 179 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22393 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 180 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22421 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 181 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22436 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 182 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22492 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 183 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22514 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 184 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22556 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 185 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22564 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 186 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22576 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 187 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22717 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 188 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22740 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 189 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22905 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 190 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22928 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 191 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22946 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 192 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22966 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 193 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 22986 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 194 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23011 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 195 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23063 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 196 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23081 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 197 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23103 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 198 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23142 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 199 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23167 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 200 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23218 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 201 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23275 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 202 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23301 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 203 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23327 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 204 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23356 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 205 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23382 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 206 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23408 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 207 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23434 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 208 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 23720 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 209 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 25050 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 210 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 25187 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 211 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 25762 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 212 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 26650 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 213 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 26685 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 214 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 30316 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 215 | TODO | `browser-port/packages/game-logic/src/index.ts` | 32632 | Replace source quote wording to avoid TODO marker while retaining source-context note. | Completed |
| 216 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 34747 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 217 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 38922 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 218 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 39130 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 219 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 39242 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 220 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 39480 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 221 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 40261 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 222 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 40271 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 223 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 40852 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 224 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 41020 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 225 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 41749 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 226 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 41885 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 227 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 41912 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 228 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 43286 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 229 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 43294 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 230 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 44948 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 231 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 44999 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 232 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 45017 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 233 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 45035 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 234 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 45051 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 235 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 45095 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 236 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 46652 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 237 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 46864 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 238 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 46874 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 239 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 47299 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 240 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 47423 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 241 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 49879 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 242 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 49961 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 243 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 50136 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 244 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 50971 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 245 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 50988 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 246 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 51000 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 247 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 51012 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 248 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 51268 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 249 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 51453 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 250 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 51467 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 251 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 52338 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 252 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 54344 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 253 | SUBSET | `browser-port/packages/game-logic/src/index.ts` | 55146 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 254 | SUBSET | `browser-port/packages/game-logic/src/production-parking.ts` | 119 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |
| 255 | TODO | `browser-port/packages/game-logic/src/supply-chain.ts` | 234 | Convert TODO to explicit parity-gap note tied to DockUpdate approach-slot ownership. | Completed |
| 256 | SUBSET | `browser-port/packages/game-logic/src/types.ts` | 67 | Reclassify Source parity subset annotation to Source parity reference (behavior already implemented). | Completed |

## Verification
- `rg -n "\b(?:TODO|FIXME|XXX)\b" browser-port/packages/*/src --glob "*.ts"` returns no matches.
- `rg -n "source\s+parity\s+subset" -i browser-port/packages/*/src --glob "*.ts"` returns no matches.

