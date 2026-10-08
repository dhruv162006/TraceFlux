import { describe, it, expect } from 'vitest';
import { buildExecutionGraph } from './graph-builder.js';
import { AsyncResource, ExecutionEdge } from '@traceflux/instrumentation';

describe('Graph Builder & Critical Path Analyzer', () => {
  it('should correctly build a basic DAG and compute depths and critical path', () => {
    const resources: AsyncResource[] = [
      { sessionId: 's1', asyncId: 1, triggerAsyncId: 0, resourceType: 'PROMISE', startTime: 10, endTime: 20 }, // duration: 10
      { sessionId: 's1', asyncId: 2, triggerAsyncId: 1, resourceType: 'Timeout', startTime: 20, endTime: 50 }, // duration: 30
      { sessionId: 's1', asyncId: 3, triggerAsyncId: 1, resourceType: 'Immediate', startTime: 20, endTime: 35 }, // duration: 15
    ];

    const edges: ExecutionEdge[] = [
      { sessionId: 's1', parentAsyncId: 1, childAsyncId: 2, edgeType: 'spawn' },
      { sessionId: 's1', parentAsyncId: 1, childAsyncId: 3, edgeType: 'spawn' },
    ];

    const graph = buildExecutionGraph(resources, edges);

    // Verify roots (node 1 has no parent in the session)
    expect(graph.roots).toEqual([1]);
    expect(graph.maxDepth).toBe(1);

    // Verify BFS depths
    expect(graph.nodes.get(1)?.depth).toBe(0);
    expect(graph.nodes.get(2)?.depth).toBe(1);
    expect(graph.nodes.get(3)?.depth).toBe(1);

    // Verify Children
    expect(graph.nodes.get(1)?.children).toEqual([2, 3]);

    // Verify Critical Path (1 -> 2 has total duration 10 + 30 = 40, whereas 1 -> 3 is 10 + 15 = 25)
    // Thus critical path is [1, 2]
    expect(graph.criticalPath).toEqual([1, 2]);
    expect(graph.nodes.get(1)?.isOnCriticalPath).toBe(true);
    expect(graph.nodes.get(2)?.isOnCriticalPath).toBe(true);
    expect(graph.nodes.get(3)?.isOnCriticalPath).toBe(false);

    expect(graph.totalDuration).toBe(40);
  });

  it('should break cycle paths gracefully and prevent call stack overflow', () => {
    const resources: AsyncResource[] = [
      { sessionId: 's2', asyncId: 1, triggerAsyncId: 3, resourceType: 'PROMISE', startTime: 10, endTime: 20 },
      { sessionId: 's2', asyncId: 2, triggerAsyncId: 1, resourceType: 'PROMISE', startTime: 20, endTime: 30 },
      { sessionId: 's2', asyncId: 3, triggerAsyncId: 2, resourceType: 'PROMISE', startTime: 30, endTime: 40 },
    ];

    // Create a cycle: 1 -> 2 -> 3 -> 1
    const edges: ExecutionEdge[] = [
      { sessionId: 's2', parentAsyncId: 1, childAsyncId: 2, edgeType: 'spawn' },
      { sessionId: 's2', parentAsyncId: 2, childAsyncId: 3, edgeType: 'spawn' },
      { sessionId: 's2', parentAsyncId: 3, childAsyncId: 1, edgeType: 'spawn' },
    ];

    // Under cyclic conditions, roots might be empty (since everyone has a parent)
    // Or BFS and Critical Path should break recursion.
    const graph = buildExecutionGraph(resources, edges);
    expect(graph.roots.length).toBe(0); // empty because it's a closed cycle
    expect(graph.criticalPath).toEqual([]); // no path computable without roots
  });

  it('should handle orphan edges gracefully', () => {
    const resources: AsyncResource[] = [
      { sessionId: 's3', asyncId: 1, triggerAsyncId: 0, resourceType: 'PROMISE', startTime: 10, endTime: 20 },
    ];

    const edges: ExecutionEdge[] = [
      { sessionId: 's3', parentAsyncId: 1, childAsyncId: 999, edgeType: 'spawn' }, // 999 is an orphan
    ];

    const graph = buildExecutionGraph(resources, edges);
    expect(graph.nodes.has(1)).toBe(true);
    expect(graph.nodes.has(999)).toBe(false); // skipped since not in resources list
  });
});
