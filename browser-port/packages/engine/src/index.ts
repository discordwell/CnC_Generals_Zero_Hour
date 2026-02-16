/**
 * @generals/engine
 *
 * Core engine primitives are currently implemented in `@generals/core` while the
 * dedicated package boundary is established.
 * This module re-exports the currently stable pieces to keep imports stable while
 * the dedicated engine layer is gradually expanded.
 */
export type { Subsystem } from '@generals/core';
export { EventBus, globalEventBus } from '@generals/core';
export { GameLoop } from '@generals/core';
export type { GameLoopCallbacks } from '@generals/core';
export { SubsystemRegistry } from '@generals/core';
