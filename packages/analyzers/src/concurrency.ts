import { AsyncResource, ConcurrencyWindow } from '@traceflux/instrumentation';

export function detectConcurrencyWindows(
  resources: AsyncResource[]
): ConcurrencyWindow[] {
  if (resources.length === 0) return [];

  interface SweepEvent {
    time: number;
    type: 1 | -1; // 1: Start, -1: End
    asyncId: number;
  }

  const events: SweepEvent[] = [];

  for (const res of resources) {
    if (res.asyncId === undefined) continue;
    events.push({
      time: res.startTime,
      type: 1,
      asyncId: res.asyncId,
    });

    if (res.endTime !== undefined) {
      events.push({
        time: res.endTime,
        type: -1,
        asyncId: res.asyncId,
      });
    }
  }

  // Sweep-line sort rules:
  // 1. Sort by timestamp ascending.
  // 2. If timestamps are equal, process END events (-1) before START events (1)
  //    to prevent false zero-duration concurrency spikes.
  events.sort((a, b) => {
    if (a.time !== b.time) {
      return a.time - b.time;
    }
    return a.type - b.type;
  });

  const windows: ConcurrencyWindow[] = [];
  const activeSet = new Set<number>();
  
  const sessionId = resources[0].sessionId;
  let lastTime = events[0].time;

  for (const event of events) {
    const duration = event.time - lastTime;

    // If there is concurrency (>= 2 active) over a positive duration, record a window
    if (activeSet.size > 1 && duration > 0) {
      windows.push({
        sessionId,
        startTime: lastTime,
        endTime: event.time,
        overlapCount: activeSet.size,
        resourceIds: Array.from(activeSet),
      });
    }

    // Apply the transition
    if (event.type === 1) {
      activeSet.add(event.asyncId);
    } else {
      activeSet.delete(event.asyncId);
    }

    lastTime = event.time;
  }

  return windows;
}
