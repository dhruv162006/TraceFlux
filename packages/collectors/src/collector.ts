import { z } from 'zod';
import { performance } from 'node:perf_hooks';
import { AsyncEvent, AsyncResource, ExecutionEdge, ResourceType, LifecycleEvent } from '@traceflux/instrumentation';
import { sessionsRepo, resourcesRepo, edgesRepo, getDb } from '@traceflux/storage';
import { WsServer } from './websocket.js';

// Zod schemas for runtime validation
const RequestContextSchema = z.object({
  traceId: z.string(),
  requestId: z.string(),
  url: z.string().optional(),
  method: z.string().optional(),
  spanName: z.string().optional(),
  userId: z.string().optional(),
  tags: z.record(z.string()).optional(),
});

const AsyncEventSchema = z.object({
  asyncId: z.number(),
  triggerAsyncId: z.number(),
  type: z.enum(['init', 'before', 'after', 'destroy', 'promiseResolve']),
  resourceType: z.enum([
    'PROMISE',
    'TCPWRAP',
    'TIMERWRAP',
    'Timeout',
    'Immediate',
    'FSREQCALLBACK',
    'TickObject',
    'HTTPINCOMINGMESSAGE',
    'HTTPCLIENTREQUEST',
    'GETADDRINFOREQWRAP',
    'QueryWrap',
    'CUSTOM',
  ]),
  timestamp: z.number(),
  executionAsyncId: z.number(),
  context: RequestContextSchema.optional(),
});

export const AsyncEventBatchSchema = z.array(AsyncEventSchema);

// Compute process start offset once to convert performance.now() relative ms to absolute Unix epoch ms
const processStartUnixMs = Date.now() - performance.now();

function toUnixMs(perfTimestamp: number): number {
  return Math.round(processStartUnixMs + perfTimestamp);
}

export class EventCollector {
  private wsServer?: WsServer;
  private knownSessions = new Set<string>();

  constructor(wsServer?: WsServer) {
    this.wsServer = wsServer;
  }

  public processBatch(rawEvents: unknown[]): { count: number } {
    // 1. Zod runtime validation
    const events = AsyncEventBatchSchema.parse(rawEvents) as AsyncEvent[];
    if (events.length === 0) return { count: 0 };

    const db = getDb();

    // 2. Perform ingestion transactionally
    db.transaction(() => {
      const resourcesToInsert: AsyncResource[] = [];
      const edgesToInsert: ExecutionEdge[] = [];

      for (const event of events) {
        // ASSUMPTION: If context traceId is absent, fallback to a 'global' session context
        const sessionId = event.context?.traceId || 'global';

        // Ensure the trace session exists to satisfy foreign key constraints
        if (!this.knownSessions.has(sessionId)) {
          this.knownSessions.add(sessionId);
          sessionsRepo.insert({
            id: sessionId,
            traceId: sessionId,
            startTime: toUnixMs(event.timestamp),
          });

          this.wsServer?.broadcast({
            type: 'session_start',
            payload: { id: sessionId, traceId: sessionId, startTime: toUnixMs(event.timestamp) },
            timestamp: Date.now(),
          });
        }

        // Map lifecycle event to resource inserts/updates and edges
        switch (event.type) {
          case 'init':
            resourcesToInsert.push({
              sessionId,
              asyncId: event.asyncId,
              triggerAsyncId: event.triggerAsyncId,
              resourceType: event.resourceType,
              startTime: toUnixMs(event.timestamp),
              executionContext: event.context,
            });

            edgesToInsert.push({
              sessionId,
              parentAsyncId: event.triggerAsyncId,
              childAsyncId: event.asyncId,
              edgeType: 'spawn',
            });
            break;

          case 'destroy': {
            const inMemoryRes = resourcesToInsert.find(
              (r) => r.asyncId === event.asyncId && r.sessionId === sessionId
            );
            if (inMemoryRes) {
              inMemoryRes.endTime = toUnixMs(event.timestamp);
            } else {
              resourcesRepo.updateEndTime(event.asyncId, sessionId, toUnixMs(event.timestamp));
            }
            break;
          }

          case 'promiseResolve':
            edgesToInsert.push({
              sessionId,
              parentAsyncId: event.executionAsyncId,
              childAsyncId: event.asyncId,
              edgeType: 'resolve',
            });
            break;

          case 'before':
            edgesToInsert.push({
              sessionId,
              parentAsyncId: event.executionAsyncId,
              childAsyncId: event.asyncId,
              edgeType: 'callback',
            });
            break;

          default:
            break;
        }

        // Broadcast raw event to connected frontends in real-time
        this.wsServer?.broadcast({
          type: 'async_event',
          payload: event,
          timestamp: Date.now(),
        });
      }

      // Execute bulk inserts transactionally
      if (resourcesToInsert.length > 0) {
        resourcesRepo.insertBatch(resourcesToInsert);
      }
      if (edgesToInsert.length > 0) {
        edgesRepo.insertBatch(edgesToInsert);
      }
    })();

    return { count: events.length };
  }
}
