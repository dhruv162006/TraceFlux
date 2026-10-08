import { describe, it, expect } from 'vitest';
import { detectConcurrencyWindows } from './concurrency.js';
import { AsyncResource } from '@traceflux/instrumentation';

describe('Sweep-Line Concurrency Analyzer', () => {
  it('should identify overlapping concurrency windows correctly', () => {
    // We simulate three resources with overlapping lifetimes:
    // R1: [10, 50]
    // R2: [20, 40]
    // R3: [30, 60]
    const resources: AsyncResource[] = [
      { sessionId: 'trace-c', asyncId: 1, triggerAsyncId: 0, resourceType: 'PROMISE', startTime: 10, endTime: 50 },
      { sessionId: 'trace-c', asyncId: 2, triggerAsyncId: 0, resourceType: 'Timeout', startTime: 20, endTime: 40 },
      { sessionId: 'trace-c', asyncId: 3, triggerAsyncId: 0, resourceType: 'Immediate', startTime: 30, endTime: 60 },
    ];

    const windows = detectConcurrencyWindows(resources);

    // Timeline transitions:
    // t=10: R1 starts (active: [1]) -> count 1 (no concurrency window recorded)
    // t=20: R2 starts (active: [1, 2]) -> window [20, 30] should record with active size 2
    // t=30: R3 starts (active: [1, 2, 3]) -> window [30, 40] should record with active size 3
    // t=40: R2 ends (active: [1, 3]) -> window [40, 50] should record with active size 2
    // t=50: R1 ends (active: [3]) -> no further overlap window
    // t=60: R3 ends (active: [])

    expect(windows.length).toBe(3);

    // Verify window 1
    expect(windows[0].startTime).toBe(20);
    expect(windows[0].endTime).toBe(30);
    expect(windows[0].overlapCount).toBe(2);
    expect(windows[0].resourceIds).toEqual([1, 2]);

    // Verify window 2
    expect(windows[1].startTime).toBe(30);
    expect(windows[1].endTime).toBe(40);
    expect(windows[1].overlapCount).toBe(3);
    expect(windows[1].resourceIds).toEqual([1, 2, 3]);

    // Verify window 3
    expect(windows[2].startTime).toBe(40);
    expect(windows[2].endTime).toBe(50);
    expect(windows[2].overlapCount).toBe(2);
    expect(windows[2].resourceIds).toEqual([1, 3]);
  });

  it('should ignore non-overlapping, zero-duration, or single resource windows', () => {
    // R1: [10, 20]
    // R2: [25, 30]
    const resources: AsyncResource[] = [
      { sessionId: 'trace-c2', asyncId: 1, triggerAsyncId: 0, resourceType: 'PROMISE', startTime: 10, endTime: 20 },
      { sessionId: 'trace-c2', asyncId: 2, triggerAsyncId: 0, resourceType: 'Timeout', startTime: 25, endTime: 30 },
    ];

    const windows = detectConcurrencyWindows(resources);
    expect(windows.length).toBe(0);
  });
});
