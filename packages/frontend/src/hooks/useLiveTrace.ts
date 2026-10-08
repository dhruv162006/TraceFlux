import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore.js';
import { AsyncEvent, AsyncResource, ExecutionEdge, GraphResponse, TimelineEntry } from '../types/index.js';
import { buildExecutionGraph } from '@traceflux/analyzers';

/**
 * Reconstructs AsyncResource[] and ExecutionEdge[] from chronological AsyncEvent stream.
 */
export function eventsToTraceData(
  sessionId: string,
  events: AsyncEvent[]
): { resources: AsyncResource[]; edges: ExecutionEdge[] } {
  const resourceMap = new Map<number, AsyncResource>();
  const edges: ExecutionEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const event of events) {
    if (event.type === 'init') {
      resourceMap.set(event.asyncId, {
        sessionId,
        asyncId: event.asyncId,
        triggerAsyncId: event.triggerAsyncId,
        resourceType: event.resourceType,
        startTime: event.timestamp,
        executionContext: event.context,
      });

      if (event.triggerAsyncId > 0) {
        const edgeKey = `${event.triggerAsyncId}->${event.asyncId}:spawn`;
        if (!edgeKeys.has(edgeKey)) {
          edgeKeys.add(edgeKey);
          edges.push({
            sessionId,
            parentAsyncId: event.triggerAsyncId,
            childAsyncId: event.asyncId,
            edgeType: 'spawn',
          });
        }
      }
    } else if (event.type === 'destroy') {
      const res = resourceMap.get(event.asyncId);
      if (res) {
        res.endTime = event.timestamp;
      }
    } else if (event.type === 'promiseResolve') {
      const edgeKey = `${event.executionAsyncId}->${event.asyncId}:resolve`;
      if (!edgeKeys.has(edgeKey)) {
        edgeKeys.add(edgeKey);
        edges.push({
          sessionId,
          parentAsyncId: event.executionAsyncId,
          childAsyncId: event.asyncId,
          edgeType: 'resolve',
        });
      }
    } else if (event.type === 'before' || event.type === 'after') {
      const edgeKey = `${event.executionAsyncId}->${event.asyncId}:callback`;
      if (!edgeKeys.has(edgeKey)) {
        edgeKeys.add(edgeKey);
        edges.push({
          sessionId,
          parentAsyncId: event.executionAsyncId,
          childAsyncId: event.asyncId,
          edgeType: 'callback',
        });
      }
    }
  }

  return {
    resources: Array.from(resourceMap.values()),
    edges,
  };
}

/**
 * Derives live graph topology and timeline swimlanes from accumulated live events.
 */
export function deriveLiveTrace(
  sessionId: string,
  events: AsyncEvent[],
  sessionStartTime: number
): {
  graphData: GraphResponse | null;
  timelineEntries: TimelineEntry[];
  sessionStart: number;
  sessionEnd: number;
  activeAsyncId: number | null;
  activeEvent: AsyncEvent | null;
  totalEvents: number;
} {
  if (events.length === 0) {
    return {
      graphData: null,
      timelineEntries: [],
      sessionStart: sessionStartTime,
      sessionEnd: sessionStartTime + 100,
      activeAsyncId: null,
      activeEvent: null,
      totalEvents: 0,
    };
  }

  const { resources, edges } = eventsToTraceData(sessionId, events);
  const graph = buildExecutionGraph(resources, edges);

  const nodes = Array.from(graph.nodes.values());
  const graphData: GraphResponse = {
    graph: { nodes, edges },
    criticalPath: graph.criticalPath,
    orphans: [],
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      maxDepth: graph.maxDepth,
      totalDuration: graph.totalDuration,
    },
  };

  // Greedy Interval Stacking for Timeline Lanes
  const sorted = [...resources].sort((a, b) => a.startTime - b.startTime);
  const lanesLastEndTime: number[] = [];
  const sessionStart = sessionStartTime || (sorted.length > 0 ? sorted[0].startTime : 0);

  const latestEvent = events[events.length - 1];
  const maxTimestamp = latestEvent ? latestEvent.timestamp : sessionStart + 100;
  const sessionEnd = Math.max(sessionStart + 100, maxTimestamp);

  const timelineEntries: TimelineEntry[] = sorted.map((res) => {
    // If resource is ongoing, render with duration up to the newest observed timestamp
    const duration = res.endTime
      ? Math.max(1, res.endTime - res.startTime)
      : Math.max(1, maxTimestamp - res.startTime);

    const startOffset = Math.max(0, res.startTime - sessionStart);

    let lane = 0;
    let placed = false;
    for (let l = 0; l < lanesLastEndTime.length; l++) {
      if (lanesLastEndTime[l] <= res.startTime) {
        lanesLastEndTime[l] = res.endTime ?? maxTimestamp;
        lane = l;
        placed = true;
        break;
      }
    }

    if (!placed) {
      lanesLastEndTime.push(res.endTime ?? maxTimestamp);
      lane = lanesLastEndTime.length - 1;
    }

    const node = graph.nodes.get(res.asyncId);
    return {
      asyncId: res.asyncId,
      resourceType: res.resourceType,
      startTime: startOffset,
      duration,
      lane,
      isOnCriticalPath: node ? node.isOnCriticalPath : false,
    };
  });

  return {
    graphData,
    timelineEntries,
    sessionStart,
    sessionEnd,
    activeAsyncId: latestEvent ? latestEvent.asyncId : null,
    activeEvent: latestEvent ?? null,
    totalEvents: events.length,
  };
}

/**
 * Hook to consume live streaming trace data for a given session.
 */
export function useLiveTraceData(sessionId: string | null) {
  const { liveSessions } = useAppStore();
  const liveSession = sessionId ? liveSessions[sessionId] : null;

  return useMemo(() => {
    if (!sessionId || !liveSession) {
      return {
        graphData: null,
        timelineEntries: [],
        sessionStart: Date.now(),
        sessionEnd: Date.now() + 100,
        activeAsyncId: null,
        activeEvent: null,
        totalEvents: 0,
        isLive: true,
      };
    }

    const derived = deriveLiveTrace(sessionId, liveSession.events, liveSession.startTime);
    return {
      ...derived,
      isLive: true,
    };
  }, [sessionId, liveSession]);
}
