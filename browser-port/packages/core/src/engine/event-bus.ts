/**
 * Type-safe event bus for cross-subsystem communication.
 *
 * Replaces the original engine's message stream for client-side events
 * (not game commands — those go through the deterministic command system).
 */

type EventCallback<T = unknown> = (data: T) => void;

export class EventBus {
  private readonly listeners = new Map<string, Set<EventCallback>>();

  on<T>(event: string, callback: EventCallback<T>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback as EventCallback);

    // Return unsubscribe function
    return () => {
      set!.delete(callback as EventCallback);
      if (set!.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  once<T>(event: string, callback: EventCallback<T>): () => void {
    const unsubscribe = this.on<T>(event, (data) => {
      unsubscribe();
      callback(data);
    });
    return unsubscribe;
  }

  emit<T>(event: string, data: T): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const callback of set) {
        callback(data);
      }
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

/** Singleton event bus for the application. */
export const globalEventBus = new EventBus();
