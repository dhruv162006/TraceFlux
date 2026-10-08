import { AsyncResource, ExecutionGraph, ConcurrencyWindow, MetricsResponse } from '@traceflux/instrumentation';
import { computeEventLoopPressure } from './event-loop.js';

// DECISION: Quickselect for percentiles
// We use the Quickselect selection algorithm to calculate P50, P95, and P99 latency percentiles.
// Standard sorting (e.g. Array.prototype.sort) runs in O(n log n) time. Quickselect achieves 
// O(n) average time complexity to find the element at a specific index. For large telemetry 
// datasets containing millions of trace events, this avoids expensive sorting allocations and 
// saves substantial execution time in metrics calculation loops.
function quickselect(arr: number[], k: number): number {
  if (arr.length === 0) return 0;
  if (arr.length === 1) return arr[0];

  const pivot = arr[Math.floor(Math.random() * arr.length)];
  const lows = arr.filter((x) => x < pivot);
  const highs = arr.filter((x) => x > pivot);
  const pivots = arr.filter((x) => x === pivot);

  if (k < lows.length) {
    return quickselect(lows, k);
  } else if (k < lows.length + pivots.length) {
    return pivot;
  } else {
    return quickselect(highs, k - lows.length - pivots.length);
  }
}

export function getPercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const copy = [...values];
  const idx = Math.min(
    copy.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * copy.length) - 1)
  );
  return quickselect(copy, idx);
}

export function computeMetrics(
  resources: AsyncResource[],
  graph: ExecutionGraph,
  concurrencyWindows: ConcurrencyWindow[],
  eventLoopLag: number
): MetricsResponse {
  const completedResources = resources.filter(
    (r) => r.startTime !== undefined && r.endTime !== undefined
  );

  const durations = completedResources.map((r) => r.endTime! - r.startTime);
  const totalCompleted = durations.length;

  let totalDurationSum = 0;
  for (const d of durations) {
    totalDurationSum += d;
  }

  const avgLatency = totalCompleted > 0 ? totalDurationSum / totalCompleted : 0;
  const p50Latency = getPercentile(durations, 50);
  const p95Latency = getPercentile(durations, 95);
  const p99Latency = getPercentile(durations, 99);

  // Compute maximum concurrency
  let maxConcurrency = 0;
  for (const w of concurrencyWindows) {
    if (w.overlapCount > maxConcurrency) {
      maxConcurrency = w.overlapCount;
    }
  }

  const activePromises = resources.filter((r) => !r.endTime && r.resourceType === 'PROMISE').length;
  const pressureScore = computeEventLoopPressure(eventLoopLag, resources.length, activePromises);

  return {
    avgLatency,
    p50Latency,
    p95Latency,
    p99Latency,
    totalResources: resources.length,
    maxConcurrency,
    criticalPathDuration: graph.totalDuration,
    longestAsyncChain: graph.maxDepth,
    eventLoopLag,
    pressureScore,
  };
}
