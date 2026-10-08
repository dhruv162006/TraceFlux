/**
 * Synchronous re-entrancy guard to prevent TraceFlux instrumentation from capturing its own telemetry transport operations.
 * Uses a global Symbol singleton so state is shared across module loaders, test runners, and packages.
 */
const GUARD_KEY = Symbol.for('__TRACEFLUX_INTERNAL_GUARD__');

interface InternalGuardState {
  isInternal: boolean;
  internalIds: Set<number>;
}

function getGuardState(): InternalGuardState {
  const g = globalThis as any;
  if (!g[GUARD_KEY]) {
    g[GUARD_KEY] = {
      isInternal: false,
      internalIds: new Set<number>(),
    };
  }
  return g[GUARD_KEY];
}

/**
 * Executes a function synchronously while flagging any async resources created during its execution as internal.
 */
export function runWithInternalGuard<T>(fn: () => T): T {
  const state = getGuardState();
  state.isInternal = true;
  try {
    return fn();
  } finally {
    state.isInternal = false;
  }
}

/**
 * Returns true if an internal telemetry transport operation is currently executing synchronously.
 */
export function isInternalOperationActive(): boolean {
  return getGuardState().isInternal;
}

/**
 * Checks whether an async resource or its causal parents belong to internal telemetry transport operations.
 */
export function isInternalAsync(
  asyncId: number,
  triggerAsyncId: number,
  executionAsyncId: number
): boolean {
  const state = getGuardState();
  return (
    state.isInternal ||
    state.internalIds.has(triggerAsyncId) ||
    state.internalIds.has(executionAsyncId) ||
    state.internalIds.has(asyncId)
  );
}

export function isInternalAsyncId(asyncId: number): boolean {
  return getGuardState().internalIds.has(asyncId);
}

/**
 * Marks an asyncId as internal so its subsequent lifecycle events and descendants are ignored.
 */
export function markInternalAsync(asyncId: number): void {
  getGuardState().internalIds.add(asyncId);
}

/**
 * Clears an asyncId from the internal registry when destroyed.
 */
export function clearInternalAsync(asyncId: number): void {
  getGuardState().internalIds.delete(asyncId);
}

/**
 * Resets the internal guard state (for testing and teardown).
 */
export function resetInternalGuard(): void {
  const state = getGuardState();
  state.isInternal = false;
  state.internalIds.clear();
}
