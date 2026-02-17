/**
 * Frame resend archive and planning primitives.
 *
 * Source references:
 * - Generals/Code/GameEngine/Source/GameNetwork/ConnectionManager.cpp
 *   (ConnectionManager::sendFrameDataToPlayer, sendSingleFrameToPlayer)
 * - Generals/Code/GameEngine/Source/GameNetwork/NetworkUtil.cpp
 *   (FRAMES_TO_KEEP calculation from MAX_FRAMES_AHEAD)
 */

export const SOURCE_MAX_FRAMES_AHEAD = 128;
export const SOURCE_FRAMES_TO_KEEP = (SOURCE_MAX_FRAMES_AHEAD / 2) + 1;
const DEFAULT_FRAMES_TO_KEEP = SOURCE_FRAMES_TO_KEEP;

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function cloneCommandPayload(command: { [key: string]: unknown }): { [key: string]: unknown } {
  return { ...command };
}

function getFrameKey(senderPlayerId: number, frame: number): string {
  return `${senderPlayerId}:${frame}`;
}

function parseFrameFromKey(key: string): number | null {
  const [, frameToken] = key.split(':');
  const frame = Number.parseInt(frameToken ?? '', 10);
  if (!Number.isInteger(frame) || frame < 0) {
    return null;
  }
  return frame;
}

export interface FrameResendCommand {
  senderPlayerId: number;
  frame: number;
  command: { [key: string]: unknown };
}

export interface FrameResendFrameInfo {
  senderPlayerId: number;
  frame: number;
  commandCount: number;
}

export interface FrameResendFramePlan {
  frame: number;
  commands: FrameResendCommand[];
  frameInfo: FrameResendFrameInfo[];
}

export interface FrameResendPlan {
  targetPlayerId: number;
  requestedStartFrame: number;
  resendStartFrame: number;
  resendEndFrameExclusive: number;
  frames: FrameResendFramePlan[];
}

export interface FrameResendArchiveOptions {
  framesToKeep?: number;
}

export class FrameResendArchive {
  private readonly framesToKeep: number;
  private readonly commandsBySenderFrame = new Map<string, Array<{ [key: string]: unknown }>>();
  private readonly frameCommandCounts = new Map<string, number>();

  constructor(options: FrameResendArchiveOptions = {}) {
    const framesToKeep = options.framesToKeep ?? DEFAULT_FRAMES_TO_KEEP;
    assertNonNegativeInteger(framesToKeep, 'framesToKeep');
    this.framesToKeep = framesToKeep;
  }

  reset(): void {
    this.commandsBySenderFrame.clear();
    this.frameCommandCounts.clear();
  }

  getFramesToKeep(): number {
    return this.framesToKeep;
  }

  recordSynchronizedCommand(
    senderPlayerId: number,
    frame: number,
    command: { [key: string]: unknown },
  ): void {
    assertNonNegativeInteger(senderPlayerId, 'senderPlayerId');
    assertNonNegativeInteger(frame, 'frame');

    const key = getFrameKey(senderPlayerId, frame);
    const queue = this.commandsBySenderFrame.get(key);
    if (queue) {
      queue.push(cloneCommandPayload(command));
    } else {
      this.commandsBySenderFrame.set(key, [cloneCommandPayload(command)]);
    }
  }

  setFrameCommandCount(senderPlayerId: number, frame: number, commandCount: number): void {
    assertNonNegativeInteger(senderPlayerId, 'senderPlayerId');
    assertNonNegativeInteger(frame, 'frame');
    assertNonNegativeInteger(commandCount, 'commandCount');

    this.frameCommandCounts.set(getFrameKey(senderPlayerId, frame), commandCount);
  }

  getFrameCommandCount(senderPlayerId: number, frame: number): number | null {
    assertNonNegativeInteger(senderPlayerId, 'senderPlayerId');
    assertNonNegativeInteger(frame, 'frame');

    const count = this.frameCommandCounts.get(getFrameKey(senderPlayerId, frame));
    return typeof count === 'number' ? count : null;
  }

  getFrameCommands(senderPlayerId: number, frame: number): ReadonlyArray<{ [key: string]: unknown }> {
    assertNonNegativeInteger(senderPlayerId, 'senderPlayerId');
    assertNonNegativeInteger(frame, 'frame');

    const commands = this.commandsBySenderFrame.get(getFrameKey(senderPlayerId, frame));
    if (!commands) {
      return [];
    }
    return commands.map((command) => cloneCommandPayload(command));
  }

  pruneHistory(currentFrame: number): void {
    assertNonNegativeInteger(currentFrame, 'currentFrame');
    const earliestFrame = Math.max(0, currentFrame - this.framesToKeep);

    for (const key of this.commandsBySenderFrame.keys()) {
      const frame = parseFrameFromKey(key);
      if (frame === null || frame < earliestFrame) {
        this.commandsBySenderFrame.delete(key);
      }
    }

    for (const key of this.frameCommandCounts.keys()) {
      const frame = parseFrameFromKey(key);
      if (frame === null || frame < earliestFrame) {
        this.frameCommandCounts.delete(key);
      }
    }
  }

  buildResendPlan(
    targetPlayerId: number,
    startingFrame: number,
    currentFrame: number,
    connectedPlayerIds: Iterable<number>,
  ): FrameResendPlan {
    assertNonNegativeInteger(targetPlayerId, 'targetPlayerId');
    assertNonNegativeInteger(startingFrame, 'startingFrame');
    assertNonNegativeInteger(currentFrame, 'currentFrame');

    this.pruneHistory(currentFrame);

    const resendStartFrame = Math.max(startingFrame, Math.max(0, currentFrame - this.framesToKeep));
    const resendEndFrameExclusive = Math.max(resendStartFrame, currentFrame);
    const senders = Array.from(new Set(Array.from(connectedPlayerIds).map((id) => {
      assertNonNegativeInteger(id, 'connectedPlayerId');
      return id;
    }))).sort((left, right) => left - right);

    const frames: FrameResendFramePlan[] = [];
    for (let frame = resendStartFrame; frame < resendEndFrameExclusive; frame += 1) {
      const framePlan: FrameResendFramePlan = {
        frame,
        commands: [],
        frameInfo: [],
      };

      for (const senderPlayerId of senders) {
        if (senderPlayerId === targetPlayerId) {
          continue;
        }

        const commands = this.getFrameCommands(senderPlayerId, frame);
        for (const command of commands) {
          framePlan.commands.push({
            senderPlayerId,
            frame,
            command,
          });
        }

        const commandCount = this.getFrameCommandCount(senderPlayerId, frame) ?? commands.length;
        framePlan.frameInfo.push({
          senderPlayerId,
          frame,
          commandCount,
        });
      }

      if (framePlan.commands.length > 0 || framePlan.frameInfo.length > 0) {
        frames.push(framePlan);
      }
    }

    return {
      targetPlayerId,
      requestedStartFrame: startingFrame,
      resendStartFrame,
      resendEndFrameExclusive,
      frames,
    };
  }
}
