import { describe, expect, it } from 'vitest';

import {
  FrameResendArchive,
  SOURCE_FRAMES_TO_KEEP,
  SOURCE_MAX_FRAMES_AHEAD,
} from './frame-resend.js';

describe('FrameResendArchive', () => {
  it('exposes source frame-retention constants and uses them by default', () => {
    expect(SOURCE_MAX_FRAMES_AHEAD).toBe(128);
    expect(SOURCE_FRAMES_TO_KEEP).toBe((SOURCE_MAX_FRAMES_AHEAD / 2) + 1);
    expect(new FrameResendArchive().getFramesToKeep()).toBe(SOURCE_FRAMES_TO_KEEP);
  });

  it('builds resend plans with per-sender command replay and frame info', () => {
    const archive = new FrameResendArchive({ framesToKeep: 65 });

    archive.recordSynchronizedCommand(0, 10, {
      commandType: 4,
      sender: 0,
      executionFrame: 10,
      commandId: 101,
    });
    archive.setFrameCommandCount(0, 10, 1);
    archive.setFrameCommandCount(2, 10, 0);

    const plan = archive.buildResendPlan(1, 10, 12, [0, 1, 2]);

    expect(plan.resendStartFrame).toBe(10);
    expect(plan.resendEndFrameExclusive).toBe(12);
    expect(plan.frames).toHaveLength(2);
    expect(plan.frames[0]?.commands).toEqual([
      {
        senderPlayerId: 0,
        frame: 10,
        command: {
          commandType: 4,
          sender: 0,
          executionFrame: 10,
          commandId: 101,
        },
      },
    ]);
    expect(plan.frames[0]?.frameInfo).toEqual([
      { senderPlayerId: 0, frame: 10, commandCount: 1 },
      { senderPlayerId: 2, frame: 10, commandCount: 0 },
    ]);
    expect(plan.frames[1]?.commands).toEqual([]);
    expect(plan.frames[1]?.frameInfo).toEqual([
      { senderPlayerId: 0, frame: 11, commandCount: 0 },
      { senderPlayerId: 2, frame: 11, commandCount: 0 },
    ]);
  });

  it('applies source frames-to-keep resend window cutoff', () => {
    const archive = new FrameResendArchive({ framesToKeep: 2 });

    archive.recordSynchronizedCommand(0, 0, {
      commandType: 4,
      sender: 0,
      executionFrame: 0,
      commandId: 1,
    });
    archive.recordSynchronizedCommand(0, 2, {
      commandType: 4,
      sender: 0,
      executionFrame: 2,
      commandId: 2,
    });
    archive.recordSynchronizedCommand(0, 3, {
      commandType: 4,
      sender: 0,
      executionFrame: 3,
      commandId: 3,
    });

    const plan = archive.buildResendPlan(1, 0, 4, [0, 1]);

    expect(plan.requestedStartFrame).toBe(0);
    expect(plan.resendStartFrame).toBe(2);
    expect(plan.resendEndFrameExclusive).toBe(4);
    expect(plan.frames.map((framePlan) => framePlan.frame)).toEqual([2, 3]);
  });

  it('prunes command/count history outside configured frame window', () => {
    const archive = new FrameResendArchive({ framesToKeep: 1 });

    archive.recordSynchronizedCommand(0, 4, {
      commandType: 4,
      sender: 0,
      executionFrame: 4,
      commandId: 401,
    });
    archive.setFrameCommandCount(0, 4, 1);
    archive.recordSynchronizedCommand(0, 5, {
      commandType: 4,
      sender: 0,
      executionFrame: 5,
      commandId: 501,
    });
    archive.setFrameCommandCount(0, 5, 1);

    archive.pruneHistory(6);

    expect(archive.getFrameCommands(0, 4)).toEqual([]);
    expect(archive.getFrameCommandCount(0, 4)).toBeNull();
    expect(archive.getFrameCommands(0, 5)).toEqual([
      {
        commandType: 4,
        sender: 0,
        executionFrame: 5,
        commandId: 501,
      },
    ]);
    expect(archive.getFrameCommandCount(0, 5)).toBe(1);
  });
});
