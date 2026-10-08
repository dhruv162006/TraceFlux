import async_hooks from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { AsyncEvent, ResourceType } from './types.js';
import { AsyncEventEmitter } from './emitter.js';
import { getCurrentContext } from './context.js';

import { isInternalAsync, markInternalAsync, clearInternalAsync, resetInternalGuard, isInternalAsyncId } from './guard.js';

export class AsyncHooksAgent {
  private enabled = false;
  private hook: async_hooks.AsyncHook | null = null;
  private emitter: AsyncEventEmitter;
  private ignoreTypes: Set<ResourceType>;

  // Track active resources to populate trigger and resource details for non-init hooks
  private activeResources = new Map<number, {
    triggerAsyncId: number;
    resourceType: ResourceType;
    context?: any;
  }>();

  constructor(emitter: AsyncEventEmitter, ignoreTypes?: ResourceType[]) {
    this.emitter = emitter;
    this.ignoreTypes = new Set<ResourceType>(ignoreTypes ?? ['TickObject']);
  }

  public enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    if (!this.hook) {
      this.hook = this.createHooks();
    }
    this.hook.enable();
  }

  public disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    if (this.hook) {
      this.hook.disable();
    }
    this.activeResources.clear();
    resetInternalGuard();
  }

  public destroy(): void {
    this.disable();
    this.activeResources.clear();
    resetInternalGuard();
  }

  private createHooks(): async_hooks.AsyncHook {
    // DECISION: async_hooks vs diagnostics_channel:
    // Node's native async_hooks API is used instead of diagnostics_channel because async_hooks
    // provides comprehensive, low-level execution context tracing, trigger identification (parent-child dependencies),
    // and exact resolution hooks for all async resources (Promises, Timeouts, TCP sockets, etc.).
    // While diagnostics_channel has lower overhead, it is higher-level and does not expose trigger links
    // or granular lifecycle phases (e.g. promiseResolve, before/after ticks) required to construct a reliable execution DAG.
    return async_hooks.createHook({
      init: (asyncId, type, triggerAsyncId) => {
        if (!this.enabled) return;

        const executionAsyncId = async_hooks.executionAsyncId();
        if (isInternalAsync(asyncId, triggerAsyncId, executionAsyncId)) {
          markInternalAsync(asyncId);
          return;
        }

        const context = getCurrentContext();
        if (context?.tags?.sampled === 'false') return;

        const resourceType = this.mapType(type);
        if (this.ignoreTypes.has(resourceType)) return;

        this.activeResources.set(asyncId, {
          triggerAsyncId,
          resourceType,
          context,
        });

        this.emitter.emit({
          asyncId,
          triggerAsyncId,
          type: 'init',
          resourceType,
          timestamp: performance.now(),
          executionAsyncId,
          context,
        });
      },
      before: (asyncId) => {
        if (!this.enabled) return;
        if (isInternalAsyncId(asyncId)) return;

        const resource = this.activeResources.get(asyncId);
        if (!resource) return;

        this.emitter.emit({
          asyncId,
          triggerAsyncId: resource.triggerAsyncId,
          type: 'before',
          resourceType: resource.resourceType,
          timestamp: performance.now(),
          executionAsyncId: async_hooks.executionAsyncId(),
          context: resource.context,
        });
      },
      after: (asyncId) => {
        if (!this.enabled) return;
        if (isInternalAsyncId(asyncId)) return;

        const resource = this.activeResources.get(asyncId);
        if (!resource) return;

        this.emitter.emit({
          asyncId,
          triggerAsyncId: resource.triggerAsyncId,
          type: 'after',
          resourceType: resource.resourceType,
          timestamp: performance.now(),
          executionAsyncId: async_hooks.executionAsyncId(),
          context: resource.context,
        });
      },
      promiseResolve: (asyncId) => {
        if (!this.enabled) return;
        if (isInternalAsyncId(asyncId)) return;

        const resource = this.activeResources.get(asyncId);
        if (!resource) return;

        this.emitter.emit({
          asyncId,
          triggerAsyncId: resource.triggerAsyncId,
          type: 'promiseResolve',
          resourceType: resource.resourceType,
          timestamp: performance.now(),
          executionAsyncId: async_hooks.executionAsyncId(),
          context: resource.context,
        });
      },
      destroy: (asyncId) => {
        if (!this.enabled) return;
        if (isInternalAsyncId(asyncId)) {
          clearInternalAsync(asyncId);
          return;
        }

        const resource = this.activeResources.get(asyncId);
        if (!resource) return;

        this.emitter.emit({
          asyncId,
          triggerAsyncId: resource.triggerAsyncId,
          type: 'destroy',
          resourceType: resource.resourceType,
          timestamp: performance.now(),
          executionAsyncId: async_hooks.executionAsyncId(),
          context: resource.context,
        });

        // Delete from the map to prevent memory leaks when resources are garbage-collected
        this.activeResources.delete(asyncId);
      },
    });
  }

  private mapType(type: string): ResourceType {
    switch (type) {
      case 'PROMISE':
        return 'PROMISE';
      case 'TCPWRAP':
        return 'TCPWRAP';
      case 'TIMERWRAP':
        return 'TIMERWRAP';
      case 'Timeout':
        return 'Timeout';
      case 'Immediate':
        return 'Immediate';
      case 'FSREQCALLBACK':
        return 'FSREQCALLBACK';
      case 'TickObject':
        return 'TickObject';
      case 'HTTPINCOMINGMESSAGE':
        return 'HTTPINCOMINGMESSAGE';
      case 'HTTPCLIENTREQUEST':
        return 'HTTPCLIENTREQUEST';
      case 'GETADDRINFOREQWRAP':
        return 'GETADDRINFOREQWRAP';
      case 'QueryWrap':
        return 'QueryWrap';
      default:
        return 'CUSTOM';
    }
  }
}
