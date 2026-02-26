import { describe, expect, it } from 'vitest';

import {
  createScriptEmoticonRuntimeBridge,
  type ScriptEmoticonRuntimeGameLogic,
} from './script-emoticon-runtime.js';

interface MutableScriptEmoticonState {
  requests: Array<{
    entityId: number;
    emoticonName: string;
    durationFrames: number;
    frame: number;
  }>;
}

class RecordingGameLogic implements ScriptEmoticonRuntimeGameLogic {
  readonly state: MutableScriptEmoticonState = {
    requests: [],
  };

  drainScriptEmoticonRequests(): MutableScriptEmoticonState['requests'] {
    const drained = this.state.requests.map((request) => ({ ...request }));
    this.state.requests.length = 0;
    return drained;
  }
}

describe('script emoticon runtime bridge', () => {
  it('tracks active emoticons for requested duration frames', () => {
    const gameLogic = new RecordingGameLogic();
    const bridge = createScriptEmoticonRuntimeBridge({ gameLogic });

    gameLogic.state.requests.push({
      entityId: 4,
      emoticonName: 'EMOTICON_CHEER',
      durationFrames: 3,
      frame: 1,
    });

    bridge.syncAfterSimulationStep(1);
    expect(bridge.getActiveEmoticons(1)).toEqual([
      {
        entityId: 4,
        emoticonName: 'EMOTICON_CHEER',
        expireOnFrame: 3,
      },
    ]);

    expect(bridge.getActiveEmoticons(3)).toHaveLength(1);
    expect(bridge.getActiveEmoticons(4)).toEqual([]);
  });

  it('replaces previous emoticon request on the same entity', () => {
    const gameLogic = new RecordingGameLogic();
    const bridge = createScriptEmoticonRuntimeBridge({ gameLogic });

    gameLogic.state.requests.push({
      entityId: 9,
      emoticonName: 'EMOTICON_ALERT',
      durationFrames: 5,
      frame: 1,
    });
    bridge.syncAfterSimulationStep(1);

    gameLogic.state.requests.push({
      entityId: 9,
      emoticonName: 'EMOTICON_HAPPY',
      durationFrames: 2,
      frame: 2,
    });
    bridge.syncAfterSimulationStep(2);

    expect(bridge.getActiveEmoticons(2)).toEqual([
      {
        entityId: 9,
        emoticonName: 'EMOTICON_HAPPY',
        expireOnFrame: 3,
      },
    ]);
    expect(bridge.getActiveEmoticons(4)).toEqual([]);
  });
});
