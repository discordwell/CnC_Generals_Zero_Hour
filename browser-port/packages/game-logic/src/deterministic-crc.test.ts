import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { DeterministicStateKernel } from '@generals/engine';
import { IniDataRegistry } from '@generals/ini-data';
import { HeightmapGrid, type MapDataJSON } from '@generals/terrain';

import { GameLogicSubsystem } from './index.js';

const EMPTY_HEIGHTMAP_BASE64 = 'AAAAAA==';

function createTestMapData(): MapDataJSON {
  return {
    heightmap: {
      width: 2,
      height: 2,
      borderSize: 0,
      data: EMPTY_HEIGHTMAP_BASE64,
    },
    objects: [
      {
        position: {
          x: 5,
          y: 5,
          z: 0,
        },
        angle: 0,
        templateName: 'TestEntity',
        flags: 0,
        properties: {},
      },
    ],
    triggers: [],
    textureClasses: [],
    blendTileCount: 0,
  };
}

function createSubsystem(): GameLogicSubsystem {
  const scene = new THREE.Scene();
  const subsystem = new GameLogicSubsystem(scene);
  const heightmap = new HeightmapGrid(2, 2, 0, new Uint8Array([0, 0, 0, 0]));
  subsystem.loadMapObjects(createTestMapData(), new IniDataRegistry(), heightmap);
  return subsystem;
}

function computeGameLogicCrc(subsystem: GameLogicSubsystem, frame = 0): number {
  const kernel = new DeterministicStateKernel({
    gameLogicCrcSectionWriters: subsystem.createDeterministicGameLogicCrcSectionWriters(),
  });
  const crc = kernel.computeGameLogicCrc(frame);
  if (crc === null) {
    throw new Error('expected deterministic GameLogic CRC');
  }
  return crc;
}

describe('GameLogic deterministic CRC ownership', () => {
  it('produces stable CRC values when game logic state is unchanged', () => {
    const subsystem = createSubsystem();
    try {
      const first = computeGameLogicCrc(subsystem, 0);
      const second = computeGameLogicCrc(subsystem, 0);
      expect(second).toBe(first);
    } finally {
      subsystem.dispose();
    }
  });

  it('changes CRC when player relationship ownership state changes', () => {
    const subsystem = createSubsystem();
    try {
      const baseline = computeGameLogicCrc(subsystem, 0);
      subsystem.setTeamRelationship('America', 'China', 0);
      const changed = computeGameLogicCrc(subsystem, 0);
      expect(changed).not.toBe(baseline);
    } finally {
      subsystem.dispose();
    }
  });

  it('changes CRC after simulation command processing updates game logic state', () => {
    const subsystem = createSubsystem();
    try {
      const baseline = computeGameLogicCrc(subsystem, 0);
      subsystem.submitCommand({
        type: 'select',
        entityId: 1,
      });
      subsystem.update(1 / 30);
      const changed = computeGameLogicCrc(subsystem, 0);
      expect(changed).not.toBe(baseline);
    } finally {
      subsystem.dispose();
    }
  });

  it('changes CRC when script completion queues and lazy audio-test state change', () => {
    const subsystem = createSubsystem();
    try {
      const baseline = computeGameLogicCrc(subsystem, 0);

      subsystem.notifyScriptSpeechCompleted('SpeechLine_CRC');
      const withCompletionQueue = computeGameLogicCrc(subsystem, 0);
      expect(withCompletionQueue).not.toBe(baseline);

      subsystem.setScriptAudioLengthMs('SpeechLine_CRC_Timed', 1000);
      const withAudioLengthMetadata = computeGameLogicCrc(subsystem, 0);
      expect(withAudioLengthMetadata).not.toBe(withCompletionQueue);

      subsystem.evaluateScriptSpeechHasCompleted({ speechName: 'SpeechLine_CRC_Timed' });
      const withLazyDeadline = computeGameLogicCrc(subsystem, 0);
      expect(withLazyDeadline).not.toBe(withAudioLengthMetadata);

      subsystem.setScriptCounter('MissionCounter_CRC', 7);
      subsystem.setScriptFlag('MissionFlag_CRC', true);
      subsystem.notifyScriptUIInteraction('UIHook_CRC');
      subsystem.setScriptActive('Subroutine_CRC', false);
      subsystem.notifyScriptSubroutineCall('Subroutine_CRC');
      subsystem.setScriptCameraMovementFinished(false);
      subsystem.executeScriptAction({ actionType: 'RADAR_FORCE_ENABLE' });
      const withScriptRuntimeState = computeGameLogicCrc(subsystem, 0);
      expect(withScriptRuntimeState).not.toBe(withLazyDeadline);
    } finally {
      subsystem.dispose();
    }
  });
});
