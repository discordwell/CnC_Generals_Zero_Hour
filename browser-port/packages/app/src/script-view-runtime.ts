export interface ScriptViewRuntimeGameLogic {
  getScriptViewGuardbandBias(): { x: number; y: number } | null;
  getScriptTerrainOversizeAmount(): number;
}

export interface ScriptViewRuntimeObjectVisualManager {
  setViewGuardBandBias(guardBandX: number, guardBandY: number): void;
}

export interface ScriptViewRuntimeTerrainVisual {
  setScriptTerrainOversizeAmount(amount: number): void;
}

export function syncScriptViewRuntimeBridge(
  gameLogic: ScriptViewRuntimeGameLogic,
  objectVisualManager: ScriptViewRuntimeObjectVisualManager,
  terrainVisual: ScriptViewRuntimeTerrainVisual,
): void {
  const scriptViewGuardBandBias = gameLogic.getScriptViewGuardbandBias();
  objectVisualManager.setViewGuardBandBias(
    scriptViewGuardBandBias?.x ?? 0,
    scriptViewGuardBandBias?.y ?? 0,
  );
  terrainVisual.setScriptTerrainOversizeAmount(gameLogic.getScriptTerrainOversizeAmount());
}
