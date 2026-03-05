import { describe, expect, it } from 'vitest';

import { syncScriptViewRuntimeBridge } from './script-view-runtime.js';

describe('syncScriptViewRuntimeBridge', () => {
  it('forwards guardband bias and terrain oversize from game-logic to render bridge', () => {
    const objectVisualCalls: Array<{ x: number; y: number }> = [];
    const terrainCalls: number[] = [];
    const gameLogic = {
      getScriptViewGuardbandBias: () => ({ x: 12, y: -4 }),
      getScriptTerrainOversizeAmount: () => 5,
    };
    const objectVisualManager = {
      setViewGuardBandBias: (x: number, y: number) => objectVisualCalls.push({ x, y }),
    };
    const terrainVisual = {
      setScriptTerrainOversizeAmount: (amount: number) => terrainCalls.push(amount),
    };

    syncScriptViewRuntimeBridge(gameLogic, objectVisualManager, terrainVisual);

    expect(objectVisualCalls).toEqual([{ x: 12, y: -4 }]);
    expect(terrainCalls).toEqual([5]);
  });

  it('resets guardband to zero vector when script guardband bias is absent', () => {
    const objectVisualCalls: Array<{ x: number; y: number }> = [];
    const gameLogic = {
      getScriptViewGuardbandBias: () => null,
      getScriptTerrainOversizeAmount: () => 0,
    };
    const objectVisualManager = {
      setViewGuardBandBias: (x: number, y: number) => objectVisualCalls.push({ x, y }),
    };
    const terrainVisual = {
      setScriptTerrainOversizeAmount: (_amount: number) => undefined,
    };

    syncScriptViewRuntimeBridge(gameLogic, objectVisualManager, terrainVisual);

    expect(objectVisualCalls).toEqual([{ x: 0, y: 0 }]);
  });
});
