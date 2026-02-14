/**
 * Core game loop — ported from GameEngine.cpp.
 *
 * Runs a fixed-timestep simulation loop decoupled from rendering.
 * The original game runs logic at ~30 FPS (33ms per frame) while
 * rendering can run at the display refresh rate.
 */

export interface GameLoopCallbacks {
  /** Fixed-timestep simulation update. */
  onSimulationStep(frameNumber: number, dt: number): void;
  /** Variable-timestep render update. Called with interpolation alpha [0,1). */
  onRender(alpha: number): void;
}

export class GameLoop {
  /** Simulation timestep in milliseconds (default: ~30 FPS logic). */
  readonly simulationDt: number;

  private frameNumber = 0;
  private accumulator = 0;
  private lastTimestamp = 0;
  private running = false;
  private rafId = 0;
  private callbacks: GameLoopCallbacks | null = null;

  /** Simulation speed multiplier (1.0 = normal, 2.0 = double speed). */
  speed = 1.0;

  /** Whether the simulation is paused (rendering still runs). */
  paused = false;

  constructor(simulationFps = 30) {
    this.simulationDt = 1000 / simulationFps;
  }

  start(callbacks: GameLoopCallbacks): void {
    if (this.running) return;
    this.running = true;
    this.callbacks = callbacks;
    this.lastTimestamp = performance.now();
    this.accumulator = 0;
    this.tick(this.lastTimestamp);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.callbacks = null;
  }

  reset(): void {
    this.frameNumber = 0;
    this.accumulator = 0;
    this.lastTimestamp = performance.now();
  }

  getFrameNumber(): number {
    return this.frameNumber;
  }

  private tick = (timestamp: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    let elapsed = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    // Cap elapsed time to prevent spiral of death (e.g., tab was backgrounded)
    if (elapsed > 250) elapsed = 250;

    elapsed *= this.speed;

    if (!this.paused) {
      this.accumulator += elapsed;

      // Run simulation steps
      while (this.accumulator >= this.simulationDt) {
        this.callbacks!.onSimulationStep(this.frameNumber, this.simulationDt / 1000);
        this.frameNumber++;
        this.accumulator -= this.simulationDt;
      }
    }

    // Render with interpolation
    const alpha = this.accumulator / this.simulationDt;
    this.callbacks!.onRender(alpha);
  };
}
