/**
 * Type-safe event bus for cross-subsystem communication.
 */

type EventCallback<T = unknown> = (data: T) => void;

export class EventBus {
  private readonly listeners = new Map<string, Set<EventCallback>>();

  on<T>(event: string, callback: EventCallback<T>): () => void {
    let listenerSet = this.listeners.get(event);
    if (!listenerSet) {
      listenerSet = new Set();
      this.listeners.set(event, listenerSet);
    }
    listenerSet.add(callback as EventCallback);

    return () => {
      listenerSet?.delete(callback as EventCallback);
      if (listenerSet && listenerSet.size === 0) {
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
    const listenerSet = this.listeners.get(event);
    if (!listenerSet) {
      return;
    }

    for (const callback of listenerSet) {
      callback(data);
    }
  }

  removeAllListeners(event?: string): void {
    if (typeof event === 'string') {
      this.listeners.delete(event);
      return;
    }
    this.listeners.clear();
  }
}

export const globalEventBus = new EventBus();
