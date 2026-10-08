import { describe, it, expect } from 'vitest';
import { getPercentile, computeMetrics } from './metrics.js';
import { AsyncResource, ExecutionGraph, ConcurrencyWindow } from '@traceflux/instrumentation';

describe('Metrics & Percentiles Analyzer', () => {
  it('should compute percentiles correctly using Quickselect', () => {
    // Array of 1 to 10
    const list = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // P50 is index 4 (5th element) -> 5
    expect(getPercentile(list, 50)).toBe(5);

    // P90 is index 8 (9th element) -> 9
    expect(getPercentile(list, 90)).toBe(9);

    // P99 is index 9 (10th element) -> 10
    expect(getPercentile(list, 99)).toBe(10);
  });

  it('should aggregate metrics cleanly', () => {
    const resources: AsyncResource[] = [
      { sessionId: 's', asyncId: 1, triggerAsyncId: 0, resourceType: 'PROMISE', startTime: 100, endTime: 110 }, // dur 10
      { sessionId: 's', asyncId: 2, triggerAsyncId: 0, resourceType: 'PROMISE', startTime: 200, endTime: 250 }, // dur 50
    ];

    const graph: ExecutionGraph = {
      nodes: new Map(),
      roots: [1],
      criticalPath: [1],
      maxDepth: 1,
      totalDuration: 10,
    };

    const windows: ConcurrencyWindow[] = [
      { sessionId: 's', startTime: 100, endTime: 110, overlapCount: 2, resourceIds: [1, 2] },
    ];

    const metrics = computeMetrics(resources, graph, windows, 5);

    expect(metrics.avgLatency).toBe(30); // (10 + 50) / 2
    expect(metrics.totalResources).toBe(2);
    expect(metrics.maxConcurrency).toBe(2);
    expect(metrics.criticalPathDuration).toBe(10);
    expect(metrics.longestAsyncChain).toBe(1);
    expect(metrics.eventLoopLag).toBe(5);
    expect(metrics.pressureScore).toBeTypeOf('number');
  });
});
