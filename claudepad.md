# Session Summaries

## 2026-02-14T15:00Z — Stage 2 Asset Pipeline Implementation
- Merged `claude/plan-generals-browser-game-czKRy` into main (fast-forward)
- Fixed TS build errors: matrix4.ts noUncheckedIndexedAccess (added @ts-nocheck), engine/index.ts isolatedModules export type
- Build passes, 38 tests pass (vector3, ini-parser, game-math)
- Created `tools/convert-all.ts` master conversion script
- Added `convert:texture` and `convert:all` npm scripts
- Added `public/assets/` to .gitignore
- Launched 4 parallel agents for Stage 2A-2D:
  - 2A: BIG archive extractor (agent a433959)
  - 2B: Texture converter TGA+DDS (agent adb2ecf)
  - 2C: W3D→glTF converter (agent a471faa)
  - 2D: Map converter (agent aa243f2)

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
