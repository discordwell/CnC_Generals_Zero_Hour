import { describe, expect, it } from 'vitest';

import {
  DeterministicStateKernel,
  FIRST_OBJECT_ID,
  MAX_OBJECT_ID,
  XferCrcAccumulator,
  hashDeterministicGameLogicCrc,
  hashDeterministicFrameMetadata,
} from './index.js';

describe('DeterministicStateKernel', () => {
  it('matches source XferCRC arithmetic for deterministic validation words', () => {
    const singleWord = new XferCrcAccumulator();
    singleWord.addUnsignedInt(0x01020304);
    expect(singleWord.getCrc()).toBe(0x01020304);

    const twoWords = new XferCrcAccumulator();
    twoWords.addUnsignedInt(0x01020304);
    twoWords.addUnsignedInt(0x0a0b0c0d);
    expect(twoWords.getCrc()).toBe(0x0c0f1215);

    const shortWord = new XferCrcAccumulator();
    shortWord.addUnsignedShort(0xabcd);
    expect(shortWord.getCrc()).toBe(0xcdab0000);

    const ascii = new XferCrcAccumulator();
    ascii.addAsciiString('ABC');
    expect(ascii.getCrc()).toBe(0x47424300);
  });

  it('hashes deterministic frame metadata with source-style CRC markers', () => {
    const hash = hashDeterministicFrameMetadata({
      frame: 12,
      nextObjectId: 101,
      randomSeedCrc: 0x01234567,
      commands: [
        {
          commandType: 4,
          playerId: 0,
          sortNumber: 1,
          payload: 'alpha',
          dedupeKey: '4:0:1',
        },
        {
          commandType: 7,
          playerId: 1,
          sortNumber: 2,
          payload: 'beta',
          dedupeKey: '7:1:2',
        },
      ],
    });
    expect(hash).toBe(0xcb16bc15);
  });

  it('tracks random-seed CRC state used by deterministic frame validation', () => {
    const kernel = new DeterministicStateKernel({
      initialRandomSeedCrc: 0x11111111,
      frameHashProvider: hashDeterministicFrameMetadata,
    });

    expect(kernel.getRandomSeedCrc()).toBe(0x11111111);
    const hashBefore = kernel.recordLocalFrameHash(0xabcdef01, 0);
    expect(hashBefore).toBe(0xabcdef01);

    kernel.setRandomSeedCrc(0x22222222);
    expect(kernel.getRandomSeedCrc()).toBe(0x22222222);

    const hashAfter = kernel.computeFrameHash(0);
    expect(hashAfter).not.toBeNull();
    expect(hashAfter).not.toBe(hashBefore);

    kernel.reset({ initialRandomSeedCrc: 0x33333333 });
    expect(kernel.getRandomSeedCrc()).toBe(0x33333333);
  });

  it('hashes source-ordered GameLogic CRC sections with explicit section writers', () => {
    const callOrder: string[] = [];
    const snapshot = {
      frame: 12,
      nextObjectId: 101,
      randomSeedCrc: 0x89abcdef,
      commands: [],
    };

    const hash = hashDeterministicGameLogicCrc(
      snapshot,
      {
        writeObjects: (crc) => {
          callOrder.push('objects');
          crc.addUnsignedInt(0x11111111);
        },
        writePartitionManager: (crc) => {
          callOrder.push('partition');
          crc.addUnsignedInt(0x22222222);
        },
        writePlayerList: (crc) => {
          callOrder.push('players');
          crc.addUnsignedInt(0x33333333);
        },
        writeAi: (crc) => {
          callOrder.push('ai');
          crc.addUnsignedInt(0x44444444);
        },
        writeModuleFactory: (crc) => {
          callOrder.push('moduleFactory');
          crc.addUnsignedInt(0x55555555);
        },
      },
      { includeModuleFactory: true },
    );

    expect(callOrder).toEqual([
      'objects',
      'partition',
      'moduleFactory',
      'players',
      'ai',
    ]);

    const expected = new XferCrcAccumulator();
    expected.addAsciiString('MARKER:Objects');
    expected.addUnsignedInt(0x11111111);
    expected.addUnsignedInt(0x89abcdef);
    expected.addAsciiString('MARKER:ThePartitionManager');
    expected.addUnsignedInt(0x22222222);
    expected.addAsciiString('MARKER:TheModuleFactory');
    expected.addUnsignedInt(0x55555555);
    expected.addAsciiString('MARKER:ThePlayerList');
    expected.addUnsignedInt(0x33333333);
    expected.addAsciiString('MARKER:TheAI');
    expected.addUnsignedInt(0x44444444);

    expect(hash).toBe(expected.getCrc());
  });

  it('rejects module factory CRC requests when module factory writer is unavailable', () => {
    const snapshot = {
      frame: 0,
      nextObjectId: FIRST_OBJECT_ID,
      randomSeedCrc: 0,
      commands: [],
    };

    expect(() =>
      hashDeterministicGameLogicCrc(
        snapshot,
        {
          writeObjects: () => undefined,
          writePartitionManager: () => undefined,
          writePlayerList: () => undefined,
          writeAi: () => undefined,
        },
        { includeModuleFactory: true },
      )).toThrow('includeModuleFactory requires writeModuleFactory');
  });

  it('supports kernel-owned GameLogic CRC section writers as deterministic validation hooks', () => {
    const kernel = new DeterministicStateKernel({
      initialRandomSeedCrc: 0x01010101,
    });

    expect(kernel.computeGameLogicCrc()).toBeNull();

    kernel.setGameLogicCrcSectionWriters({
      writeObjects: (crc) => crc.addUnsignedInt(1),
      writePartitionManager: (crc) => crc.addUnsignedInt(2),
      writePlayerList: (crc) => crc.addUnsignedInt(3),
      writeAi: (crc) => crc.addUnsignedInt(4),
    });

    const gameLogicCrc = kernel.computeGameLogicCrc();
    expect(gameLogicCrc).not.toBeNull();
    expect(kernel.getGameLogicCrcSectionWriters()).not.toBeNull();
  });

  it('allocates ObjectID values from 1 upward', () => {
    const kernel = new DeterministicStateKernel();

    expect(kernel.getObjectIdCounter()).toBe(FIRST_OBJECT_ID);
    expect(kernel.allocateObjectId()).toBe(1);
    expect(kernel.allocateObjectId()).toBe(2);
    expect(kernel.getObjectIdCounter()).toBe(3);
  });

  it('guards ObjectID counter overflow at source range max', () => {
    const kernel = new DeterministicStateKernel({
      initialObjectId: MAX_OBJECT_ID,
    });

    expect(kernel.allocateObjectId()).toBe(MAX_OBJECT_ID);
    expect(() => kernel.allocateObjectId()).toThrow('ObjectID counter exhausted');
  });

  it('keeps command queue ordered by commandType/playerId/sortNumber and dedupes by key', () => {
    const kernel = new DeterministicStateKernel<string>();
    kernel.enqueueCommand({ commandType: 4, playerId: 1, sortNumber: 40, payload: 'late' });
    kernel.enqueueCommand({ commandType: 2, playerId: 3, sortNumber: 10, payload: 'early' });
    kernel.enqueueCommand({ commandType: 2, playerId: 2, sortNumber: 99, payload: 'mid-a' });
    kernel.enqueueCommand({ commandType: 2, playerId: 2, sortNumber: 10, payload: 'mid-b' });

    const firstInsert = kernel.enqueueCommand({
      commandType: 7,
      playerId: 1,
      sortNumber: 5,
      payload: 'dedupe',
      dedupeKey: 'slot1-cmd5',
    });
    const duplicateInsert = kernel.enqueueCommand({
      commandType: 7,
      playerId: 1,
      sortNumber: 5,
      payload: 'dedupe-duplicate',
      dedupeKey: 'slot1-cmd5',
    });

    expect(firstInsert).toBe(true);
    expect(duplicateInsert).toBe(false);
    expect(
      kernel.peekCommands().map((command) => `${command.commandType}:${command.playerId}:${command.sortNumber}`),
    ).toEqual([
      '2:2:10',
      '2:2:99',
      '2:3:10',
      '4:1:40',
      '7:1:5',
    ]);
  });

  it('records and validates local/remote frame hashes with mismatch callbacks', () => {
    const kernel = new DeterministicStateKernel({
      frameHashProvider: hashDeterministicFrameMetadata,
    });
    const mismatchFrames: number[] = [];
    kernel.onFrameHashMismatch((mismatch) => mismatchFrames.push(mismatch.frame));

    kernel.enqueueCommand({ commandType: 4, playerId: 0, sortNumber: 1, payload: 'command' });
    const localHash = kernel.recordLocalFrameHash();

    expect(kernel.recordRemoteFrameHash(0, 1, localHash)).toBe(false);
    expect(kernel.sawFrameHashMismatch(0)).toBe(false);

    expect(kernel.recordRemoteFrameHash(0, 2, (localHash + 1) >>> 0)).toBe(true);
    expect(kernel.sawFrameHashMismatch(0)).toBe(true);
    expect(kernel.getFrameHashMismatchFrames()).toEqual([0]);
    expect(mismatchFrames).toEqual([0]);
  });

  it('detects mismatch when remote hashes arrive before local hash publication', () => {
    const kernel = new DeterministicStateKernel();
    const mismatchFrames: number[] = [];
    kernel.onFrameHashMismatch((mismatch) => mismatchFrames.push(mismatch.frame));

    kernel.recordRemoteFrameHash(7, 3, 123);
    expect(kernel.sawFrameHashMismatch(7)).toBe(false);
    expect(kernel.getFrameHashMismatchFrames()).toEqual([]);

    kernel.recordLocalFrameHash(456, 7);
    expect(kernel.sawFrameHashMismatch(7)).toBe(true);
    expect(kernel.getFrameHashMismatchFrames()).toEqual([7]);
    expect(mismatchFrames).toEqual([7]);
  });

  it('records and validates local/remote GameLogic CRC values with mismatch callbacks', () => {
    const kernel = new DeterministicStateKernel({
      gameLogicCrcSectionWriters: {
        writeObjects: (crc, snapshot) => crc.addUnsignedInt(snapshot.nextObjectId >>> 0),
        writePartitionManager: (crc, snapshot) => crc.addUnsignedInt(snapshot.frame >>> 0),
        writePlayerList: (crc, snapshot) => crc.addUnsignedInt(snapshot.commands.length >>> 0),
        writeAi: (crc) => crc.addUnsignedInt(0),
      },
    });
    const mismatchFrames: number[] = [];
    kernel.onGameLogicCrcMismatch((mismatch) => mismatchFrames.push(mismatch.frame));

    const localCrc = kernel.recordLocalGameLogicCrc(undefined, 0);
    expect(kernel.recordRemoteGameLogicCrc(0, 1, localCrc)).toBe(false);
    expect(kernel.sawGameLogicCrcMismatch(0)).toBe(false);

    expect(kernel.recordRemoteGameLogicCrc(0, 2, (localCrc + 1) >>> 0)).toBe(true);
    expect(kernel.sawGameLogicCrcMismatch(0)).toBe(true);
    expect(kernel.getGameLogicCrcMismatchFrames()).toEqual([0]);
    expect(mismatchFrames).toEqual([0]);
  });

  it('detects GameLogic CRC mismatch when remote values arrive before local publication', () => {
    const kernel = new DeterministicStateKernel();
    const mismatchFrames: number[] = [];
    kernel.onGameLogicCrcMismatch((mismatch) => mismatchFrames.push(mismatch.frame));

    kernel.recordRemoteGameLogicCrc(9, 2, 0x1234);
    expect(kernel.sawGameLogicCrcMismatch(9)).toBe(false);
    expect(kernel.getGameLogicCrcMismatchFrames()).toEqual([]);
    expect(kernel.hasPendingGameLogicCrcValidation(9)).toBe(true);
    expect(kernel.getPendingGameLogicCrcValidationFrames()).toEqual([9]);
    expect(kernel.getPendingGameLogicCrcValidationPlayers(9)).toEqual([2]);

    kernel.recordLocalGameLogicCrc(0x5678, 9);
    expect(kernel.sawGameLogicCrcMismatch(9)).toBe(true);
    expect(kernel.getGameLogicCrcMismatchFrames()).toEqual([9]);
    expect(mismatchFrames).toEqual([9]);
    expect(kernel.hasPendingGameLogicCrcValidation(9)).toBe(false);
    expect(kernel.hasPendingGameLogicCrcValidation()).toBe(false);
    expect(kernel.getPendingGameLogicCrcValidationFrames()).toEqual([]);
    expect(kernel.getPendingGameLogicCrcValidationPlayers(9)).toEqual([]);
  });

  it('tracks pending GameLogic CRC validation across multiple frames and players', () => {
    const kernel = new DeterministicStateKernel();
    kernel.recordRemoteGameLogicCrc(4, 2, 0x1111);
    kernel.recordRemoteGameLogicCrc(6, 1, 0x2222);
    kernel.recordRemoteGameLogicCrc(6, 3, 0x3333);

    expect(kernel.hasPendingGameLogicCrcValidation()).toBe(true);
    expect(kernel.getPendingGameLogicCrcValidationFrames()).toEqual([4, 6]);
    expect(kernel.getPendingGameLogicCrcValidationPlayers(4)).toEqual([2]);
    expect(kernel.getPendingGameLogicCrcValidationPlayers(6)).toEqual([1, 3]);

    kernel.recordLocalGameLogicCrc(0x4444, 6);
    expect(kernel.getPendingGameLogicCrcValidationFrames()).toEqual([4]);
    expect(kernel.getPendingGameLogicCrcValidationPlayers(6)).toEqual([]);
  });

  it('evaluates source-style GameLogic CRC consensus across expected players', () => {
    const kernel = new DeterministicStateKernel();
    kernel.recordRemoteGameLogicCrc(3, 1, 0xaaaa);
    kernel.recordRemoteGameLogicCrc(3, 2, 0xaaaa);

    const pending = kernel.evaluateGameLogicCrcConsensus(3, [0, 1, 2], 0);
    expect(pending.status).toBe('pending');
    expect(pending.missingPlayerIds).toEqual([0]);
    expect(pending.expectedPlayerIds).toEqual([0, 1, 2]);

    kernel.recordLocalGameLogicCrc(0xaaaa, 3);
    const matched = kernel.evaluateGameLogicCrcConsensus(3, [0, 1, 2], 0);
    expect(matched.status).toBe('match');
    expect(matched.validatorCrc).toBe(0xaaaa);
    expect(matched.mismatchedPlayerIds).toEqual([]);

    kernel.recordRemoteGameLogicCrc(3, 2, 0xbbbb);
    const mismatched = kernel.evaluateGameLogicCrcConsensus(3, [0, 1, 2], 0);
    expect(mismatched.status).toBe('mismatch');
    expect(mismatched.mismatchedPlayerIds).toEqual([2]);
    expect(mismatched.missingPlayerIds).toEqual([]);
  });

  it('tracks frame-hash validation frames and prunes old frame-hash state', () => {
    const kernel = new DeterministicStateKernel();
    kernel.recordLocalFrameHash(0x11111111, 2);
    kernel.recordLocalFrameHash(0x22222222, 5);
    kernel.recordRemoteFrameHash(2, 1, 0x11111111);
    kernel.recordRemoteFrameHash(4, 2, 0x44444444);
    kernel.recordRemoteFrameHash(5, 1, 0x22222222);
    kernel.recordRemoteFrameHash(5, 2, 0x33333333);

    expect(kernel.getLocalFrameHashFrames()).toEqual([2, 5]);
    expect(kernel.getRemoteFrameHashFrames()).toEqual([2, 4, 5]);
    expect(kernel.sawFrameHashMismatch(5)).toBe(true);
    expect(kernel.getFrameHashMismatchFrames()).toEqual([5]);

    kernel.pruneFrameHashesBefore(5);
    expect(kernel.getLocalFrameHashFrames()).toEqual([5]);
    expect(kernel.getRemoteFrameHashFrames()).toEqual([5]);
    expect(kernel.sawFrameHashMismatch(5)).toBe(true);
    expect(kernel.getFrameHashMismatchFrames()).toEqual([5]);
    expect(kernel.sawFrameHashMismatch(2)).toBe(false);

    kernel.pruneFrameHashesBefore(6);
    expect(kernel.getLocalFrameHashFrames()).toEqual([]);
    expect(kernel.getRemoteFrameHashFrames()).toEqual([]);
    expect(kernel.sawFrameHashMismatch()).toBe(false);
    expect(kernel.getFrameHashMismatchFrames()).toEqual([]);
  });

  it('tracks GameLogic CRC validation frames and prunes old CRC state', () => {
    const kernel = new DeterministicStateKernel();
    kernel.recordLocalGameLogicCrc(0xaaaa1111, 3);
    kernel.recordRemoteGameLogicCrc(3, 1, 0xbbbb1111);
    kernel.recordRemoteGameLogicCrc(4, 2, 0xcccc1111);
    kernel.recordLocalGameLogicCrc(0xdddd1111, 5);
    kernel.recordRemoteGameLogicCrc(5, 1, 0xdddd1111);

    expect(kernel.getLocalGameLogicCrcFrames()).toEqual([3, 5]);
    expect(kernel.getRemoteGameLogicCrcFrames()).toEqual([3, 4, 5]);
    expect(kernel.getPendingGameLogicCrcValidationFrames()).toEqual([4]);
    expect(kernel.sawGameLogicCrcMismatch(3)).toBe(true);
    expect(kernel.getGameLogicCrcMismatchFrames()).toEqual([3]);

    kernel.pruneGameLogicCrcBefore(5);
    expect(kernel.getLocalGameLogicCrcFrames()).toEqual([5]);
    expect(kernel.getRemoteGameLogicCrcFrames()).toEqual([5]);
    expect(kernel.getPendingGameLogicCrcValidationFrames()).toEqual([]);
    expect(kernel.sawGameLogicCrcMismatch(3)).toBe(false);
    expect(kernel.getGameLogicCrcMismatchFrames()).toEqual([]);

    kernel.pruneValidationBefore(6);
    expect(kernel.getLocalGameLogicCrcFrames()).toEqual([]);
    expect(kernel.getRemoteGameLogicCrcFrames()).toEqual([]);
    expect(kernel.sawGameLogicCrcMismatch()).toBe(false);
    expect(kernel.getGameLogicCrcMismatchFrames()).toEqual([]);
  });
});
