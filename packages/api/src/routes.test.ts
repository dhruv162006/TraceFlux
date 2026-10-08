import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from './server.js';
import { getDb, closeDb } from '@traceflux/storage';

describe('TraceFlux REST API Endpoints', () => {
  let app: any;
  let serverInstance: any;

  beforeEach(() => {
    // Reset database to an isolated in-memory instance for testing
    closeDb();
    getDb(':memory:');
    
    const { app: expressApp, server } = createServer();
    app = expressApp;
    serverInstance = server;
  });

  afterEach((done) => {
    closeDb();
    serverInstance.close();
  });

  it('should support trace ingestion and query pipelines end-to-end', async () => {
    // 1. Ingest telemetry events using POST /collect
    const telemetryBatch = [
      {
        asyncId: 501,
        triggerAsyncId: 1,
        type: 'init',
        resourceType: 'PROMISE',
        timestamp: 10.0,
        executionAsyncId: 1,
        context: {
          traceId: 'session-api-test',
          requestId: 'req-api-1',
        },
      },
      {
        asyncId: 501,
        triggerAsyncId: 1,
        type: 'promiseResolve',
        resourceType: 'PROMISE',
        timestamp: 25.0,
        executionAsyncId: 2,
        context: {
          traceId: 'session-api-test',
          requestId: 'req-api-1',
        },
      },
      {
        asyncId: 501,
        triggerAsyncId: 1,
        type: 'destroy',
        resourceType: 'PROMISE',
        timestamp: 30.0,
        executionAsyncId: 1,
        context: {
          traceId: 'session-api-test',
          requestId: 'req-api-1',
        },
      },
    ];

    const collectRes = await request(app)
      .post('/collect')
      .send(telemetryBatch)
      .expect(200);

    expect(collectRes.body.success).toBe(true);
    expect(collectRes.body.count).toBe(3);

    // 2. GET /api/traces — List Traces
    const listRes = await request(app)
      .get('/api/traces')
      .expect(200);
      
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.traces[0].id).toBe('session-api-test');
    expect(listRes.headers['x-response-time']).toBeDefined();

    // 3. GET /api/traces/:id — Fetch Trace details
    const detailRes = await request(app)
      .get('/api/traces/session-api-test')
      .expect(200);

    expect(detailRes.body.id).toBe('session-api-test');
    expect(detailRes.body.resourceCount).toBe(1);
    expect(detailRes.body.duration).toBe(20); // 30 - 10

    // 4. GET /api/traces/:id/graph — Fetch Graph
    const graphRes = await request(app)
      .get('/api/traces/session-api-test/graph')
      .expect(200);

    expect(graphRes.body.graph.nodes.length).toBe(1);
    expect(graphRes.body.graph.edges.length).toBe(2); // spawn + resolve
    expect(graphRes.body.criticalPath).toEqual([501]);

    // 5. GET /api/traces/:id/timeline — Fetch Timeline
    const timelineRes = await request(app)
      .get('/api/traces/session-api-test/timeline')
      .expect(200);

    expect(timelineRes.body.entries.length).toBe(1);
    expect(timelineRes.body.entries[0].startTime).toBe(0);
    expect(timelineRes.body.entries[0].duration).toBe(20);

    // 6. GET /api/traces/:id/concurrency — Fetch Concurrency
    const concurrencyRes = await request(app)
      .get('/api/traces/session-api-test/concurrency')
      .expect(200);

    expect(concurrencyRes.body.windows).toBeDefined();

    // 7. GET /api/traces/:id/replay — Fetch step replay
    const replayRes = await request(app)
      .get('/api/traces/session-api-test/replay?step=0')
      .expect(200);

    expect(replayRes.body.event).toBeDefined();
    expect(replayRes.body.event.type).toBe('init');
    expect(replayRes.body.totalEvents).toBe(3); // init, resolve, destroy

    // 8. GET /api/metrics — Fetch metrics overview
    const metricsRes = await request(app)
      .get('/api/metrics')
      .expect(200);

    expect(metricsRes.body.totalResources).toBe(1);
    expect(metricsRes.body.criticalPathDuration).toBe(20);

    // 9. POST /api/traces/:id/export — Export trace data
    const exportRes = await request(app)
      .post('/api/traces/session-api-test/export')
      .expect(200);

    expect(exportRes.headers['content-type']).toContain('application/json');
    expect(exportRes.body.session).toBeDefined();
    expect(exportRes.body.resources.length).toBe(1);
  });

  it('should reject invalid query params on list traces endpoint', async () => {
    // Should fail because limit must be an integer, not string
    await request(app)
      .get('/api/traces?limit=not-a-number')
      .expect(400);
  });

  it('should return 404 on missing session query', async () => {
    await request(app)
      .get('/api/traces/does-not-exist')
      .expect(404);
  });
});
