import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '@traceflux/storage';
import { buildExecutionGraph, detectConcurrencyWindows, computeMetrics } from '@traceflux/analyzers';
import { performance } from 'node:perf_hooks';

const router = Router();

// Track rolling event loop lag of this process via an exponential moving average (EMA)
let rollingLagMs = 0;
const LAG_SAMPLE_INTERVAL_MS = 1000;

const interval = setInterval(() => {
  const start = performance.now();
  setTimeout(() => {
    const elapsed = performance.now() - start;
    const lag = Math.max(0, elapsed - 10); // subtract expected 10ms delay
    rollingLagMs = rollingLagMs * 0.8 + lag * 0.2; // EMA
  }, 10);
}, LAG_SAMPLE_INTERVAL_MS);

if (interval.unref) {
  interval.unref();
}

router.get('/', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const db = getDb();

    // 1. Query all session resources and edges
    const rawResources = db.prepare(`
      SELECT id, session_id as sessionId, async_id as asyncId, trigger_async_id as triggerAsyncId,
             resource_type as resourceType, start_time as startTime, end_time as endTime, execution_context as executionContext
      FROM async_resources
    `).all() as any[];

    const rawEdges = db.prepare(`
      SELECT session_id as sessionId, parent_async_id as parentAsyncId, child_async_id as childAsyncId, edge_type as edgeType
      FROM execution_edges
    `).all() as any[];

    if (rawResources.length === 0) {
      res.json({
        avgLatency: 0,
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        totalResources: 0,
        maxConcurrency: 0,
        criticalPathDuration: 0,
        longestAsyncChain: 0,
        eventLoopLag: rollingLagMs,
        pressureScore: 0,
      });
      return;
    }

    // Map rows to types
    const resources = rawResources.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      asyncId: r.asyncId,
      triggerAsyncId: r.triggerAsyncId,
      resourceType: r.resourceType,
      startTime: r.startTime,
      endTime: r.endTime ?? undefined,
      executionContext: r.executionContext ? JSON.parse(r.executionContext) : undefined,
    }));

    const edges = rawEdges.map((e) => ({
      sessionId: e.sessionId,
      parentAsyncId: e.parentAsyncId,
      childAsyncId: e.childAsyncId,
      edgeType: e.edgeType,
    }));

    // 2. Build execution graph and detect concurrency windows
    const graph = buildExecutionGraph(resources, edges);
    const concurrencyWindows = detectConcurrencyWindows(resources);

    // 3. Compute metrics using quickselect
    const metrics = computeMetrics(resources, graph, concurrencyWindows, rollingLagMs);

    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

export default router;
