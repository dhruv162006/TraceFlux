import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../store/useAppStore.js';
import { eventsToTraceData, deriveLiveTrace } from './useLiveTrace.js';
import { AsyncEvent } from '../types/index.js';

describe('TraceFlux Live Trace State & Analyzer Integration', () => {
  beforeEach(() => {
    useAppStore.getState().clearLiveSessions();
    useAppStore.getState().setLiveMode(false);
    useAppStore.getState().setSelectedTraceId(null);
  });

  describe('Zustand Live Session Management', () => {
    it('creates a new session on handleSessionStart', () => {
      const store = useAppStore.getState();
      store.handleSessionStart({ id: 'sess-1', traceId: 'trace-1', startTime: 1000 });

      const state = useAppStore.getState();
      expect(state.liveSessions['sess-1']).toBeDefined();
      expect(state.liveSessions['sess-1'].traceId).toBe('trace-1');
      expect(state.liveSessions['sess-1'].startTime).toBe(1000);
      expect(state.liveSessions['sess-1'].events).toHaveLength(0);
      expect(state.liveSessionsList).toHaveLength(1);
      expect(state.liveSessionsList[0].id).toBe('sess-1');
    });

    it('auto-selects newest live session when isLiveMode is true', () => {
      const store = useAppStore.getState();
      store.setLiveMode(true);

      store.handleSessionStart({ id: 'sess-alpha', startTime: 2000 });
      expect(useAppStore.getState().liveSessionId).toBe('sess-alpha');

      store.handleSessionStart({ id: 'sess-beta', startTime: 3000 });
      expect(useAppStore.getState().liveSessionId).toBe('sess-beta');
    });

    it('isolates events strictly across multiple concurrent sessions', () => {
      const store = useAppStore.getState();

      const eventA: AsyncEvent = {
        asyncId: 10,
        triggerAsyncId: 1,
        executionAsyncId: 1,
        type: 'init',
        resourceType: 'PROMISE',
        timestamp: 100,
        context: { traceId: 'sess-A', requestId: 'req-A' },
      };

      const eventB: AsyncEvent = {
        asyncId: 20,
        triggerAsyncId: 1,
        executionAsyncId: 1,
        type: 'init',
        resourceType: 'Timeout',
        timestamp: 105,
        context: { traceId: 'sess-B', requestId: 'req-B' },
      };

      store.handleAsyncEvents([eventA, eventB]);

      const state = useAppStore.getState();
      expect(state.liveSessions['sess-A'].events).toHaveLength(1);
      expect(state.liveSessions['sess-A'].events[0].asyncId).toBe(10);

      expect(state.liveSessions['sess-B'].events).toHaveLength(1);
      expect(state.liveSessions['sess-B'].events[0].asyncId).toBe(20);
    });

    it('deduplicates identical incoming events within a session', () => {
      const store = useAppStore.getState();

      const event: AsyncEvent = {
        asyncId: 100,
        triggerAsyncId: 1,
        executionAsyncId: 1,
        type: 'init',
        resourceType: 'PROMISE',
        timestamp: 500,
        context: { traceId: 'sess-dedup', requestId: 'req-dedup' },
      };

      // Dispatch same event twice
      store.handleAsyncEvents([event]);
      store.handleAsyncEvents([event]);

      const session = useAppStore.getState().liveSessions['sess-dedup'];
      expect(session.events).toHaveLength(1);
    });

    it('caps session events at MAX_EVENTS_PER_SESSION (2000)', () => {
      const store = useAppStore.getState();
      const batch: AsyncEvent[] = [];

      for (let i = 0; i < 2050; i++) {
        batch.push({
          asyncId: i,
          triggerAsyncId: 1,
          executionAsyncId: 1,
          type: 'init',
          resourceType: 'PROMISE',
          timestamp: 1000 + i,
          context: { traceId: 'sess-overflow', requestId: `req-${i}` },
        });
      }

      store.handleAsyncEvents(batch);

      const session = useAppStore.getState().liveSessions['sess-overflow'];
      expect(session.events).toHaveLength(2000);
      // Oldest events (0..49) evicted, earliest should be asyncId 50
      expect(session.events[0].asyncId).toBe(50);
      expect(session.events[session.events.length - 1].asyncId).toBe(2049);
    });

    it('toggles live mode and falls back to existing session', () => {
      const store = useAppStore.getState();
      store.handleSessionStart({ id: 'sess-existing', startTime: 1000 });

      expect(useAppStore.getState().isLiveMode).toBe(false);

      store.setLiveMode(true);
      expect(useAppStore.getState().isLiveMode).toBe(true);
      expect(useAppStore.getState().liveSessionId).toBe('sess-existing');

      store.setLiveMode(false);
      expect(useAppStore.getState().isLiveMode).toBe(false);
      // Retains selection
      expect(useAppStore.getState().liveSessionId).toBe('sess-existing');
    });
  });

  describe('eventsToTraceData Graph Rebuilding', () => {
    it('correctly maps init, destroy, resolve, and callback events', () => {
      const events: AsyncEvent[] = [
        {
          asyncId: 1,
          triggerAsyncId: 0,
          executionAsyncId: 0,
          type: 'init',
          resourceType: 'PROMISE',
          timestamp: 1000,
        },
        {
          asyncId: 2,
          triggerAsyncId: 1,
          executionAsyncId: 1,
          type: 'init',
          resourceType: 'PROMISE',
          timestamp: 1010,
        },
        {
          asyncId: 2,
          triggerAsyncId: 1,
          executionAsyncId: 1,
          type: 'promiseResolve',
          resourceType: 'PROMISE',
          timestamp: 1050,
        },
        {
          asyncId: 2,
          triggerAsyncId: 1,
          executionAsyncId: 1,
          type: 'before',
          resourceType: 'PROMISE',
          timestamp: 1051,
        },
        {
          asyncId: 2,
          triggerAsyncId: 1,
          executionAsyncId: 1,
          type: 'after',
          resourceType: 'PROMISE',
          timestamp: 1055,
        },
        {
          asyncId: 2,
          triggerAsyncId: 1,
          executionAsyncId: 1,
          type: 'destroy',
          resourceType: 'PROMISE',
          timestamp: 1060,
        },
      ];

      const { resources, edges } = eventsToTraceData('sess-test', events);

      expect(resources).toHaveLength(2);
      const rootRes = resources.find((r) => r.asyncId === 1);
      const promiseRes = resources.find((r) => r.asyncId === 2);

      expect(rootRes).toBeDefined();
      expect(promiseRes).toBeDefined();
      expect(promiseRes?.startTime).toBe(1010);
      expect(promiseRes?.endTime).toBe(1060);

      // Edges: 1->2 (spawn), 1->2 (resolve), 1->2 (callback)
      expect(edges).toHaveLength(3);
      expect(edges.some((e) => e.edgeType === 'spawn' && e.parentAsyncId === 1 && e.childAsyncId === 2)).toBe(true);
      expect(edges.some((e) => e.edgeType === 'resolve' && e.parentAsyncId === 1 && e.childAsyncId === 2)).toBe(true);
      expect(edges.some((e) => e.edgeType === 'callback' && e.parentAsyncId === 1 && e.childAsyncId === 2)).toBe(true);
    });
  });

  describe('deriveLiveTrace Analyzer & Timeline Stacking', () => {
    it('returns empty structure when no events exist', () => {
      const derived = deriveLiveTrace('empty-sess', [], 1000);
      expect(derived.graphData).toBeNull();
      expect(derived.timelineEntries).toHaveLength(0);
      expect(derived.totalEvents).toBe(0);
    });

    it('builds DAG graph and computes greedy timeline lanes for concurrent and sequential tasks', () => {
      // Async 1 (100-300), Async 2 concurrent with Async 1 (150-250), Async 3 sequential after Async 2 (260-350)
      const events: AsyncEvent[] = [
        { asyncId: 1, triggerAsyncId: 0, executionAsyncId: 0, type: 'init', resourceType: 'HTTPCLIENTREQUEST', timestamp: 100 },
        { asyncId: 2, triggerAsyncId: 1, executionAsyncId: 1, type: 'init', resourceType: 'PROMISE', timestamp: 150 },
        { asyncId: 2, triggerAsyncId: 1, executionAsyncId: 1, type: 'destroy', resourceType: 'PROMISE', timestamp: 250 },
        { asyncId: 3, triggerAsyncId: 1, executionAsyncId: 1, type: 'init', resourceType: 'Timeout', timestamp: 260 },
        { asyncId: 1, triggerAsyncId: 0, executionAsyncId: 0, type: 'destroy', resourceType: 'HTTPCLIENTREQUEST', timestamp: 300 },
        { asyncId: 3, triggerAsyncId: 1, executionAsyncId: 1, type: 'destroy', resourceType: 'Timeout', timestamp: 350 },
      ];

      const derived = deriveLiveTrace('sess-concurrency', events, 100);

      expect(derived.graphData).not.toBeNull();
      expect(derived.graphData?.stats.nodeCount).toBe(3);
      expect(derived.timelineEntries).toHaveLength(3);

      const entry1 = derived.timelineEntries.find((e) => e.asyncId === 1)!;
      const entry2 = derived.timelineEntries.find((e) => e.asyncId === 2)!;
      const entry3 = derived.timelineEntries.find((e) => e.asyncId === 3)!;

      // Entry 1 and Entry 2 overlap -> distinct lanes
      expect(entry1.lane).not.toBe(entry2.lane);

      // Entry 3 starts at 260 after Entry 2 ended at 250 -> should reuse entry2's lane
      expect(entry3.lane).toBe(entry2.lane);
    });
  });
});
