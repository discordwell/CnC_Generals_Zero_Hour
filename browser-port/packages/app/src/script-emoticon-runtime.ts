interface ScriptEmoticonRequestState {
  entityId: number;
  emoticonName: string;
  durationFrames: number;
  frame: number;
}

export interface ActiveScriptEmoticonState {
  entityId: number;
  emoticonName: string;
  expireOnFrame: number;
}

export interface ScriptEmoticonRuntimeGameLogic {
  drainScriptEmoticonRequests(): ScriptEmoticonRequestState[];
}

export interface ScriptEmoticonRuntimeBridge {
  syncAfterSimulationStep(currentLogicFrame: number): void;
  getActiveEmoticons(currentLogicFrame: number): ActiveScriptEmoticonState[];
}

export interface CreateScriptEmoticonRuntimeBridgeOptions {
  gameLogic: ScriptEmoticonRuntimeGameLogic;
}

interface RuntimeEmoticonState {
  emoticonName: string;
  expireOnFrame: number;
}

export function createScriptEmoticonRuntimeBridge(
  options: CreateScriptEmoticonRuntimeBridgeOptions,
): ScriptEmoticonRuntimeBridge {
  const { gameLogic } = options;
  const emoticonByEntityId = new Map<number, RuntimeEmoticonState>();

  const pruneExpired = (currentLogicFrame: number): void => {
    for (const [entityId, state] of emoticonByEntityId) {
      if (currentLogicFrame > state.expireOnFrame) {
        emoticonByEntityId.delete(entityId);
      }
    }
  };

  return {
    syncAfterSimulationStep(currentLogicFrame: number): void {
      const requests = gameLogic.drainScriptEmoticonRequests();
      for (const request of requests) {
        if (!Number.isFinite(request.entityId)) {
          continue;
        }
        const normalizedName = request.emoticonName.trim();
        if (!normalizedName) {
          continue;
        }
        const durationFrames = Math.max(0, Math.trunc(request.durationFrames));
        if (durationFrames <= 0) {
          emoticonByEntityId.delete(request.entityId);
          continue;
        }
        emoticonByEntityId.set(request.entityId, {
          emoticonName: normalizedName,
          expireOnFrame: currentLogicFrame + durationFrames - 1,
        });
      }
      pruneExpired(currentLogicFrame);
    },

    getActiveEmoticons(currentLogicFrame: number): ActiveScriptEmoticonState[] {
      pruneExpired(currentLogicFrame);
      return [...emoticonByEntityId.entries()]
        .map(([entityId, state]) => ({
          entityId,
          emoticonName: state.emoticonName,
          expireOnFrame: state.expireOnFrame,
        }))
        .sort((left, right) => left.entityId - right.entityId);
    },
  };
}
