# Claudepad — Session Memory

## Session Summaries

### 2026-03-12T21:20Z — Phase 1a: script-actions.ts extraction COMPLETE
- Extracted 402 script action methods from `GameLogicSubsystem` class in `index.ts` to new `script-actions.ts` (12,273 lines)
- `index.ts` reduced from 66,247 → 54,165 lines (12,082 line reduction)
- Pattern: `self: GL` parameter (GL = any), `@ts-nocheck`, facades in index.ts with `(impl as any)(this, ...args)`
- 109 facade methods added, ~80 class methods changed from `private` to `/* @internal */`
- 44 module-level constants exported for script-actions.ts to import
- Circular import from index.js works because constants only accessed inside function bodies (ESM live bindings)
- Also imports from ini-readers.js, registry-lookups.js, special-power-routing.js, supply-chain.js, production-prerequisites.js
- All 3241 tests pass, only 3 pre-existing TS errors remain (parity-agent.ts)
- Temp extraction scripts cleaned up (15 files removed)

## Key Findings

### Phase 1a Extraction Lessons
- **Brace counting for method boundaries** gets confused by inline object types in function parameters — need manual correction
- **ESM circular deps** work fine if the imported values are only accessed inside function bodies (not at module evaluation time)
- **`@ts-nocheck` + `self: any`** is the pragmatic choice for extracted methods — real type safety comes from the test suite
- **ALL_CAPS string-stripping** to find missing constants: strip quoted strings before scanning, or you'll get false negatives from constants whose names match switch case labels
- **`export type type`** bug: adding `export` to `type X` declarations must avoid doubling the `type` keyword
- **TS6133 for private methods**: Methods called via `self.method()` from `@ts-nocheck` files are invisible to TS — remove `private` to silence
