/**
 * Subsystem interface — ported from SubsystemInterface.
 *
 * All major engine systems (renderer, audio, game logic, network, etc.)
 * implement this interface to allow uniform lifecycle management.
 */
export interface Subsystem {
  /** Unique name for this subsystem. */
  readonly name: string;

  /** Initialize the subsystem. Called once at startup. */
  init(): Promise<void> | void;

  /** Per-frame update. Called every simulation frame. */
  update(dt: number): void;

  /** Clean up resources. Called once at shutdown. */
  dispose(): void;

  /** Reset to initial state (e.g., when starting a new game). */
  reset(): void;
}

/**
 * Registry for all engine subsystems. Manages lifecycle and update order.
 */
export class SubsystemRegistry {
  private readonly subsystems = new Map<string, Subsystem>();
  private readonly updateOrder: Subsystem[] = [];

  register(subsystem: Subsystem): void {
    if (this.subsystems.has(subsystem.name)) {
      throw new Error(`Subsystem "${subsystem.name}" already registered`);
    }
    this.subsystems.set(subsystem.name, subsystem);
    this.updateOrder.push(subsystem);
  }

  get<T extends Subsystem>(name: string): T {
    const sub = this.subsystems.get(name);
    if (!sub) {
      throw new Error(`Subsystem "${name}" not found`);
    }
    return sub as T;
  }

  has(name: string): boolean {
    return this.subsystems.has(name);
  }

  async initAll(): Promise<void> {
    for (const sub of this.updateOrder) {
      await sub.init();
    }
  }

  updateAll(dt: number): void {
    for (const sub of this.updateOrder) {
      sub.update(dt);
    }
  }

  resetAll(): void {
    for (const sub of this.updateOrder) {
      sub.reset();
    }
  }

  disposeAll(): void {
    // Dispose in reverse order
    for (let i = this.updateOrder.length - 1; i >= 0; i--) {
      this.updateOrder[i]!.dispose();
    }
    this.subsystems.clear();
    this.updateOrder.length = 0;
  }
}
