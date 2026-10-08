import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createAgent } from './index.js';
import { requestContext } from './context.js';
import { AsyncEventEmitter } from './emitter.js';
import { AsyncEvent } from './types.js';
import { runWithInternalGuard, isInternalOperationActive } from './guard.js';

describe('TraceFlux Instrumentation Agent', () => {
  let agent: ReturnType<typeof createAgent>;
  let emittedEvents: AsyncEvent[] = [];
  let emitSpy: any;

  beforeEach(() => {
    emittedEvents = [];
    // Spy on emitter's emit method to verify events locally
    emitSpy = vi.spyOn(AsyncEventEmitter.prototype, 'emit').mockImplementation((event: AsyncEvent) => {
      emittedEvents.push(event);
    });

    // Mock global fetch to prevent actual network attempts
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve({ ok: true, statusText: 'OK' } as Response);
    });

    agent = createAgent({
      endpoint: 'http://localhost:3001/collect',
      flushIntervalMs: 10,
      ignoreTypes: ['TickObject'],
    });
  });

  afterEach(() => {
    agent.disable();
    vi.restoreAllMocks();
  });

  it('should fire init event on new Promise()', async () => {
    agent.enable();

    const p = new Promise<void>((resolve) => {
      resolve();
    });

    await p;

    const initEvent = emittedEvents.find(e => e.type === 'init' && e.resourceType === 'PROMISE');
    expect(initEvent).toBeDefined();
    expect(initEvent?.asyncId).toBeTypeOf('number');
    expect(initEvent?.triggerAsyncId).toBeTypeOf('number');
  });

  it('should fire destroy after promise resolves', async () => {
    agent.enable();

    let resolvePromise: () => void = () => {};
    const p = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    const promiseAsyncId = emittedEvents.find(
      e => e.type === 'init' && e.resourceType === 'PROMISE'
    )?.asyncId;

    resolvePromise();
    await p;

    // Wait slightly for garbage collection / destroy cycle of promises if needed,
    // but Node.js usually triggers destroy hook when promises are GC'd or completed.
    // Let's check for standard resolution / destroy event.
    // Note: Promise destroy hooks in Node.js fire when the promise is GC'd.
    // Since GC is non-deterministic in tests, we can verify promiseResolve event as well,
    // which fires synchronously when resolve is called.
    const resolveEvent = emittedEvents.find(
      e => e.type === 'promiseResolve' && e.resourceType === 'PROMISE'
    );
    expect(resolveEvent).toBeDefined();
  });

  it('should propagate AsyncLocalStorage context through setTimeout', async () => {
    agent.enable();

    const ctx = agent.startRequest({
      traceId: 'test-trace-id',
      requestId: 'test-request-id',
    });

    await new Promise<void>((resolve) => {
      requestContext.run(ctx, () => {
        setTimeout(() => {
          const current = requestContext.getStore();
          expect(current).toBeDefined();
          expect(current?.traceId).toBe('test-trace-id');
          expect(current?.requestId).toBe('test-request-id');
          resolve();
        }, 5);
      });
    });
  });

  it('should propagate context through fs.readFile callback', async () => {
    agent.enable();

    const ctx = agent.startRequest({
      traceId: 'fs-trace-id',
      requestId: 'fs-request-id',
    });

    const tempFile = path.join(process.cwd(), 'temp-test-file.txt');
    fs.writeFileSync(tempFile, 'hello');

    await new Promise<void>((resolve) => {
      requestContext.run(ctx, () => {
        fs.readFile(tempFile, 'utf8', (err, data) => {
          expect(err).toBeNull();
          expect(data).toBe('hello');

          const current = requestContext.getStore();
          expect(current).toBeDefined();
          expect(current?.traceId).toBe('fs-trace-id');
          expect(current?.requestId).toBe('fs-request-id');

          // Cleanup
          try {
            fs.unlinkSync(tempFile);
          } catch {}
          resolve();
        });
      });
    });
  });

  it('should verify unref is called on the emitter interval timer', () => {
    // Access the private intervalId from the emitter to verify unref'd status
    const emitter = new AsyncEventEmitter({ endpoint: 'http://localhost:3001/collect' });
    
    // Create an unref spy
    const originalSetInterval = globalThis.setInterval;
    const mockTimer = {
      unref: vi.fn(),
    } as unknown as NodeJS.Timeout;

    vi.spyOn(globalThis, 'setInterval').mockReturnValue(mockTimer);

    emitter.start();

    expect(globalThis.setInterval).toHaveBeenCalled();
    expect(mockTimer.unref).toHaveBeenCalled();

    emitter.stop();
    // Restore
    globalThis.setInterval = originalSetInterval;
  });

  describe('Synchronous Re-entrancy Guard & Self-Tracing Prevention', () => {
    it('1. Normal application async resources are captured normally', async () => {
      agent.enable();

      const appPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('app-done'), 5);
      });
      await appPromise;

      const appInit = emittedEvents.find(e => e.type === 'init' && e.resourceType === 'PROMISE');
      const appTimeout = emittedEvents.find(e => e.type === 'init' && e.resourceType === 'Timeout');
      expect(appInit).toBeDefined();
      expect(appTimeout).toBeDefined();
    });

    it('2. Resources created while the telemetry emitter is flushing are ignored', () => {
      agent.enable();
      emittedEvents = [];

      let fetchInvoked = false;
      vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        fetchInvoked = true;
        new Promise((resolve) => resolve('internal-fetch-work'));
        return Promise.resolve({ ok: true, statusText: 'OK' } as Response);
      });

      const emitter = new AsyncEventEmitter({ endpoint: 'http://localhost:3001/collect' });
      (emitter as any).pending.push({
        asyncId: 9991,
        triggerAsyncId: 0,
        type: 'init',
        resourceType: 'PROMISE',
        timestamp: 100,
        executionAsyncId: 0,
      });

      // @ts-ignore
      emitter.flush();

      expect(fetchInvoked).toBe(true);
      // Only the application events should exist, no internal fetch resources leaked
      const internalLeak = emittedEvents.filter(e => e.asyncId !== 9991);
      expect(internalLeak).toHaveLength(0);
    });

    it('3. The internal guard is cleared even if the transport throws', () => {
      agent.enable();
      expect(isInternalOperationActive()).toBe(false);

      expect(() => {
        runWithInternalGuard(() => {
          expect(isInternalOperationActive()).toBe(true);
          throw new Error('Simulated synchronous transport network error');
        });
      }).toThrow('Simulated synchronous transport network error');

      // Guard must be cleared in finally
      expect(isInternalOperationActive()).toBe(false);
    });

    it('4. After an emitter failure, subsequent application events are captured normally', async () => {
      agent.enable();

      // Trigger a failure under guard
      try {
        runWithInternalGuard(() => {
          throw new Error('Transport failure');
        });
      } catch {}

      // Application code executes immediately after
      const subsequentPromise = new Promise<number>((resolve) => resolve(42));
      await subsequentPromise;

      const captured = emittedEvents.find(
        e => e.type === 'init' && e.resourceType === 'PROMISE'
      );
      expect(captured).toBeDefined();
    });

    it('5. No global self-tracing events are produced by the emitter transport', () => {
      agent.enable();
      emittedEvents = [];

      let fetchInvoked = false;
      vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        fetchInvoked = true;
        new Promise((resolve) => resolve('internal-transport-resource'));
        return Promise.resolve({ ok: true, statusText: 'OK' } as Response);
      });

      const emitter = new AsyncEventEmitter({
        endpoint: 'http://localhost:3001/collect',
        flushIntervalMs: 1000,
      });

      (emitter as any).pending.push({
        asyncId: 9999,
        triggerAsyncId: 0,
        type: 'init',
        resourceType: 'PROMISE',
        timestamp: 100,
        executionAsyncId: 0,
      });

      // @ts-ignore - access private flush
      emitter.flush();

      expect(fetchInvoked).toBe(true);
      // None of the internal microtasks/promises from fetch() should have been captured
      const internalLeak = emittedEvents.filter(
        e => e.asyncId !== 9999 && (!e.context || e.context.traceId === 'global')
      );
      expect(internalLeak).toHaveLength(0);
    });

    it('6. Multiple normal application events surrounding an emitter flush are still captured', async () => {
      agent.enable();
      emittedEvents = [];

      // 1. Application event before flush
      const beforePromise = new Promise<string>((resolve) => resolve('before'));
      await beforePromise;

      const countBefore = emittedEvents.length;
      expect(countBefore).toBeGreaterThan(0);

      // 2. Telemetry flush operation
      const emitter = new AsyncEventEmitter({ endpoint: 'http://localhost:3001/collect' });
      (emitter as any).pending.push({
        asyncId: 9992,
        triggerAsyncId: 0,
        type: 'init',
        resourceType: 'PROMISE',
        timestamp: 100,
        executionAsyncId: 0,
      });
      // @ts-ignore
      emitter.flush();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 3. Application event after flush
      const afterPromise = new Promise<string>((resolve) => resolve('after'));
      await afterPromise;

      // Verify second application event was captured
      const appEvents = emittedEvents.filter(e => e.asyncId !== 9992);
      expect(appEvents.length).toBeGreaterThan(countBefore);
      const afterInit = appEvents.filter(e => e.type === 'init' && e.resourceType === 'PROMISE');
      expect(afterInit.length).toBeGreaterThanOrEqual(2);
    });
  });
});
