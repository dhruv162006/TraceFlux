import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventCollector } from './collector.js';
import { getDb, closeDb, sessionsRepo, resourcesRepo, edgesRepo } from '@traceflux/storage';
import { AsyncEvent } from '@traceflux/instrumentation';
import { WsServer } from './websocket.js';

describe('EventCollector Ingestion & Validation Tests', () => {
  let collector: EventCollector;
  let broadcastSpy: any;
  let mockWsServer: any;

  beforeEach(() => {
    // Reset database state using in-memory SQLite isolation
    closeDb();
    getDb(':memory:');

    // Create a mock WebSocket server to check broadcasts
    broadcastSpy = vi.fn();
    mockWsServer = {
      broadcast: broadcastSpy,
    } as unknown as WsServer;

    collector = new EventCollector(mockWsServer);
  });

  afterEach(() => {
    closeDb();
    vi.restoreAllMocks();
  });

  it('should validate and ingest a valid batch of events transactionally', () => {
    const events: any[] = [
      {
        asyncId: 202,
        triggerAsyncId: 10,
        type: 'init',
        resourceType: 'Timeout',
        timestamp: 5.5,
        executionAsyncId: 10,
        context: {
          traceId: 'session-trace-x',
          requestId: 'req-1',
        },
      },
      {
        asyncId: 202,
        triggerAsyncId: 10,
        type: 'before',
        resourceType: 'Timeout',
        timestamp: 7.2,
        executionAsyncId: 0,
        context: {
          traceId: 'session-trace-x',
          requestId: 'req-1',
        },
      },
      {
        asyncId: 202,
        triggerAsyncId: 10,
        type: 'destroy',
        resourceType: 'Timeout',
        timestamp: 9.8,
        executionAsyncId: 10,
        context: {
          traceId: 'session-trace-x',
          requestId: 'req-1',
        },
      },
    ];

    const result = collector.processBatch(events);
    expect(result.count).toBe(3);

    // Verify trace session creation in database
    const session = sessionsRepo.findById('session-trace-x');
    expect(session).toBeDefined();
    expect(session?.id).toBe('session-trace-x');

    // Verify async resource record updates
    const resources = resourcesRepo.findBySession('session-trace-x');
    expect(resources.length).toBe(1);
    expect(resources[0].asyncId).toBe(202);
    expect(resources[0].resourceType).toBe('Timeout');
    expect(resources[0].endTime).toBeTypeOf('number');

    // Verify edges are created (spawn edge and callback edge)
    const edges = edgesRepo.findBySession('session-trace-x');
    expect(edges.length).toBe(2);
    expect(edges.find(e => e.edgeType === 'spawn')).toBeDefined();
    expect(edges.find(e => e.edgeType === 'callback')).toBeDefined();

    // Verify websocket broadcasts were dispatched
    expect(broadcastSpy).toHaveBeenCalled();
  });

  it('should successfully parse context-less events using a fallback session', () => {
    const event: any = {
      asyncId: 303,
      triggerAsyncId: 0,
      type: 'init',
      resourceType: 'Immediate',
      timestamp: 12.4,
      executionAsyncId: 0,
      // context is missing, should map to 'global'
    };

    const result = collector.processBatch([event]);
    expect(result.count).toBe(1);

    const session = sessionsRepo.findById('global');
    expect(session).toBeDefined();

    const resources = resourcesRepo.findBySession('global');
    expect(resources.length).toBe(1);
    expect(resources[0].asyncId).toBe(303);
  });

  it('should reject invalid events batch payload using Zod schema constraints', () => {
    const invalidBatch = [
      {
        asyncId: 'not-a-number', // Type constraint violation
        triggerAsyncId: 1,
        type: 'non-existent-type', // Enum constraint violation
        resourceType: 'PROMISE',
        timestamp: 1.0,
        executionAsyncId: 1,
      },
    ];

    expect(() => {
      collector.processBatch(invalidBatch);
    }).toThrow();
  });
});
