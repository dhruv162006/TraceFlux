import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sessionsRepo, resourcesRepo, edgesRepo } from '@traceflux/storage';
import { AsyncEvent, LifecycleEvent } from '@traceflux/instrumentation';
import { validate } from '../middleware/validate.js';

const router = Router();

const replaySchema = z.object({
  params: z.object({
    id: z.string(),
  }),
  query: z.object({
    step: z.coerce.number().int().nonnegative().default(0),
  }),
});

router.get('/:id/replay', validate(replaySchema), (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const { step } = req.query as any;

    const session = sessionsRepo.findById(id);
    if (!session) {
      res.status(404).json({ error: `Trace session ${id} not found`, code: 'NOT_FOUND' });
      return;
    }

    const resources = resourcesRepo.findBySession(id);
    const edges = edgesRepo.findBySession(id);

    // DECISION: Chronological Trace Event Reconstruction:
    // To minimize SQLite storage footprint, we do not store heavy raw trace events in the DB.
    // Instead, we reconstruct the original AsyncEvent sequence on-the-fly by parsing stored 
    // resources and edges, assigning precise priorities to lifecycle events (init < before < resolve < after < destroy)
    // to preserve event-loop ordering.
    const events: AsyncEvent[] = [];

    for (const r of resources) {
      if (r.asyncId === undefined) continue;

      // 1. Reconstruct 'init' events
      events.push({
        asyncId: r.asyncId,
        triggerAsyncId: r.triggerAsyncId,
        type: 'init',
        resourceType: r.resourceType,
        timestamp: r.startTime,
        executionAsyncId: r.triggerAsyncId,
        context: r.executionContext,
      });

      // 2. Reconstruct 'destroy' events if they completed
      if (r.endTime !== undefined) {
        events.push({
          asyncId: r.asyncId,
          triggerAsyncId: r.triggerAsyncId,
          type: 'destroy',
          resourceType: r.resourceType,
          timestamp: r.endTime,
          executionAsyncId: r.asyncId,
          context: r.executionContext,
        });
      }
    }

    for (const e of edges) {
      const childRes = resources.find((r) => r.asyncId === e.childAsyncId);
      if (!childRes) continue;

      if (e.edgeType === 'resolve') {
        events.push({
          asyncId: e.childAsyncId,
          triggerAsyncId: e.parentAsyncId,
          type: 'promiseResolve',
          resourceType: childRes.resourceType,
          timestamp: childRes.endTime ?? childRes.startTime,
          executionAsyncId: e.parentAsyncId,
          context: childRes.executionContext,
        });
      } else if (e.edgeType === 'callback') {
        // A callback execution edge maps to a before event (start of callback) and after event (end of callback)
        events.push({
          asyncId: e.childAsyncId,
          triggerAsyncId: childRes.triggerAsyncId,
          type: 'before',
          resourceType: childRes.resourceType,
          timestamp: childRes.startTime,
          executionAsyncId: e.parentAsyncId,
          context: childRes.executionContext,
        });

        events.push({
          asyncId: e.childAsyncId,
          triggerAsyncId: childRes.triggerAsyncId,
          type: 'after',
          resourceType: childRes.resourceType,
          timestamp: childRes.endTime ?? (childRes.startTime + 1),
          executionAsyncId: e.parentAsyncId,
          context: childRes.executionContext,
        });
      }
    }

    // Sort events chronologically, using priority multipliers to resolve tie-breakers
    events.sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      const priorities: Record<LifecycleEvent, number> = {
        init: 1,
        before: 2,
        promiseResolve: 3,
        after: 4,
        destroy: 5,
      };
      return (priorities[a.type] || 0) - (priorities[b.type] || 0);
    });

    const event = events[step] || null;

    res.json({
      event,
      totalEvents: events.length,
      currentStep: step,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
