import { describe, expect, it, vi } from 'vitest';

import { EventBus } from './event-bus.js';

describe('EventBus', () => {
  it('registers, emits, and unsubscribes listeners', () => {
    const bus = new EventBus();
    const listener = vi.fn<(value: number) => void>();

    const unsubscribe = bus.on<number>('tick', listener);
    bus.emit('tick', 5);
    unsubscribe();
    bus.emit('tick', 10);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(5);
  });

  it('supports once listeners and event-scoped cleanup', () => {
    const bus = new EventBus();
    const onceListener = vi.fn<(value: string) => void>();
    const regularListener = vi.fn<(value: string) => void>();

    bus.once<string>('event', onceListener);
    bus.on<string>('event', regularListener);

    bus.emit('event', 'first');
    bus.emit('event', 'second');

    expect(onceListener).toHaveBeenCalledTimes(1);
    expect(onceListener).toHaveBeenCalledWith('first');
    expect(regularListener).toHaveBeenCalledTimes(2);

    bus.removeAllListeners('event');
    bus.emit('event', 'third');
    expect(regularListener).toHaveBeenCalledTimes(2);
  });
});
