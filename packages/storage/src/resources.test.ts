import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performance } from 'node:perf_hooks';
import { getDb, closeDb } from './db.js';
import { sessionsRepo } from './sessions.js';
import { resourcesRepo } from './resources.js';
import { edgesRepo } from './edges.js';
import { AsyncResource, TraceSession, ExecutionEdge } from '@traceflux/instrumentation';

describe('Storage Layer Integration Tests', () => {
  beforeEach(() => {
    // Reset singleton and use in-memory database for complete test isolation
    closeDb();
    getDb(':memory:');
  });

  afterEach(() => {
    closeDb();
  });

  it('should perform CRUD operations on sessions', () => {
    const session: TraceSession = {
      id: 'session-id-123',
      traceId: 'trace-id-abc',
      startTime: Date.now(),
      metadata: { debug: true, agent: 'traceflux' },
    };

    // Insert
    sessionsRepo.insert(session);

    // Find
    const found = sessionsRepo.findById('session-id-123');
    expect(found).toBeDefined();
    expect(found?.traceId).toBe('trace-id-abc');
    expect(found?.metadata).toEqual({ debug: true, agent: 'traceflux' });

    // Update
    const updatedEndTime = session.startTime + 150;
    sessionsRepo.updateEndTime('session-id-123', updatedEndTime);
    
    const foundUpdated = sessionsRepo.findById('session-id-123');
    expect(foundUpdated?.endTime).toBe(updatedEndTime);

    // List and Search
    const list = sessionsRepo.list(5, 0, 'abc');
    expect(list.total).toBe(1);
    expect(list.traces[0].id).toBe('session-id-123');
  });

  it('should insert and fetch resources and execution edges', () => {
    const session: TraceSession = {
      id: 'session-1',
      traceId: 'trace-1',
      startTime: Date.now(),
    };
    sessionsRepo.insert(session);

    const resource: AsyncResource = {
      sessionId: 'session-1',
      asyncId: 50,
      triggerAsyncId: 5,
      resourceType: 'Timeout',
      startTime: Date.now(),
      executionContext: { traceId: 'trace-1', requestId: 'req-1' },
    };

    // Insert resources
    resourcesRepo.insertBatch([resource]);

    const resources = resourcesRepo.findBySession('session-1');
    expect(resources.length).toBe(1);
    expect(resources[0].asyncId).toBe(50);
    expect(resources[0].resourceType).toBe('Timeout');
    expect(resources[0].executionContext?.requestId).toBe('req-1');

    // Update resource end time
    const end = resource.startTime + 250;
    resourcesRepo.updateEndTime(50, 'session-1', end);
    const resourcesUpdated = resourcesRepo.findBySession('session-1');
    expect(resourcesUpdated[0].endTime).toBe(end);

    // Insert execution edge
    const edge: ExecutionEdge = {
      sessionId: 'session-1',
      parentAsyncId: 5,
      childAsyncId: 50,
      edgeType: 'spawn',
    };
    edgesRepo.insertBatch([edge]);

    const edges = edgesRepo.findBySession('session-1');
    expect(edges.length).toBe(1);
    expect(edges[0].parentAsyncId).toBe(5);
    expect(edges[0].childAsyncId).toBe(50);
  });

  it('should insert 1000 events in less than 50ms', () => {
    const session: TraceSession = {
      id: 'perf-session-id',
      traceId: 'perf-trace-id',
      startTime: Date.now(),
    };
    sessionsRepo.insert(session);

    const resources: AsyncResource[] = [];
    const baseTime = Date.now();
    for (let i = 0; i < 1000; i++) {
      resources.push({
        sessionId: 'perf-session-id',
        asyncId: i + 10000,
        triggerAsyncId: i + 9999,
        resourceType: 'PROMISE',
        startTime: baseTime + i,
        executionContext: {
          traceId: 'perf-trace-id',
          requestId: `req-index-${i}`,
        },
      });
    }

    const start = performance.now();
    resourcesRepo.insertBatch(resources);
    const duration = performance.now() - start;

    console.log(`[Storage Perf Result] 1000 resources transactional insert duration: ${duration.toFixed(2)}ms`);

    // Performance requirement: Inserting 1000 events must complete in < 50ms
    expect(duration).toBeLessThan(50);

    // Verify database count
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM async_resources').get() as { count: number };
    expect(row.count).toBe(1000);
  });
});
