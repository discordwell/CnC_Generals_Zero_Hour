import { describe, expect, it } from 'vitest';

import { GameLoop } from './game-loop.js';
import type { GameLoopScheduler } from './game-loop.js';

class ManualScheduler implements GameLoopScheduler {
  private timestamp = 0;
  private nextHandle = 1;
  private readonly callbacks = new Map<number, (timestamp: number) => void>();

  now(): number {
    return this.timestamp;
  }

  requestAnimationFrame(callback: (timestamp: number) => void): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancelAnimationFrame(handle: number): void {
    this.callbacks.delete(handle);
  }

  step(elapsedMs: number): void {
    this.timestamp += elapsedMs;
    const queuedCallbacks = Array.from(this.callbacks.entries());
    this.callbacks.clear();

    for (const [, callback] of queuedCallbacks) {
      callback(this.timestamp);
    }
  }

  getQueuedCallbackCount(): number {
    return this.callbacks.size;
  }
}

describe('GameLoop', () => {
  it('runs fixed simulation steps with render interpolation', () => {
    const scheduler = new ManualScheduler();
    const loop = new GameLoop(10, scheduler);

    const simulationFrames: number[] = [];
    const renderAlphas: number[] = [];

    loop.start({
      onSimulationStep: (frameNumber) => {
        simulationFrames.push(frameNumber);
      },
      onRender: (alpha) => {
        renderAlphas.push(alpha);
      },
    });

    expect(loop.isRunning()).toBe(true);
    expect(loop.getFrameNumber()).toBe(0);
    expect(scheduler.getQueuedCallbackCount()).toBe(1);

    scheduler.step(250);
    expect(simulationFrames).toEqual([0, 1]);
    expect(loop.getFrameNumber()).toBe(2);
    expect(renderAlphas.at(-1)).toBeCloseTo(0.5);

    scheduler.step(100);
    expect(simulationFrames).toEqual([0, 1, 2]);
    expect(loop.getFrameNumber()).toBe(3);
    expect(renderAlphas.at(-1)).toBeCloseTo(0.5);

    loop.stop();
    expect(loop.isRunning()).toBe(false);
    expect(scheduler.getQueuedCallbackCount()).toBe(0);
  });

  it('skips simulation updates while paused and resumes cleanly', () => {
    const scheduler = new ManualScheduler();
    const loop = new GameLoop(30, scheduler);

    const simulationFrames: number[] = [];
    let renderCount = 0;

    loop.start({
      onSimulationStep: (frameNumber) => {
        simulationFrames.push(frameNumber);
      },
      onRender: () => {
        renderCount += 1;
      },
    });

    loop.paused = true;
    scheduler.step(1000);
    expect(simulationFrames).toEqual([]);
    expect(loop.getFrameNumber()).toBe(0);

    loop.paused = false;
    scheduler.step(34);
    expect(simulationFrames).toEqual([0]);
    expect(loop.getFrameNumber()).toBe(1);
    expect(renderCount).toBeGreaterThan(0);
  });
});
