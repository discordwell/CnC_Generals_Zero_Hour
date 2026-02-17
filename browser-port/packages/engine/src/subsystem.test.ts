import { describe, expect, it } from 'vitest';

import type { Subsystem } from './subsystem.js';
import { SubsystemRegistry } from './subsystem.js';

class TestSubsystem implements Subsystem {
  readonly name: string;
  private readonly log: string[];

  constructor(name: string, log: string[]) {
    this.name = name;
    this.log = log;
  }

  init(): void {
    this.log.push(`init:${this.name}`);
  }

  postProcessLoad(): void {
    this.log.push(`post:${this.name}`);
  }

  update(_dt: number): void {
    this.log.push(`update:${this.name}`);
  }

  reset(): void {
    this.log.push(`reset:${this.name}`);
  }

  dispose(): void {
    this.log.push(`dispose:${this.name}`);
  }
}

describe('SubsystemRegistry', () => {
  it('applies lifecycle ordering with reverse reset/dispose parity', async () => {
    const log: string[] = [];
    const registry = new SubsystemRegistry();
    const a = new TestSubsystem('A', log);
    const b = new TestSubsystem('B', log);
    const c = new TestSubsystem('C', log);

    registry.register(a);
    registry.register(b);
    registry.register(c);

    await registry.initAll();
    await registry.postProcessLoadAll();
    registry.updateAll(1 / 30);
    registry.resetAll();
    registry.disposeAll();

    expect(log).toEqual([
      'init:A',
      'init:B',
      'init:C',
      'post:A',
      'post:B',
      'post:C',
      'update:A',
      'update:B',
      'update:C',
      'reset:C',
      'reset:B',
      'reset:A',
      'dispose:C',
      'dispose:B',
      'dispose:A',
    ]);
  });

  it('rejects duplicate registrations', () => {
    const log: string[] = [];
    const registry = new SubsystemRegistry();
    const subsystem = new TestSubsystem('Duplicate', log);

    registry.register(subsystem);
    expect(() => registry.register(subsystem)).toThrow('already registered');
  });
});
