import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sessionsRepo, resourcesRepo, edgesRepo } from '@traceflux/storage';
import { buildExecutionGraph } from '@traceflux/analyzers';
import { validate } from '../middleware/validate.js';

const router = Router();

const timelineSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
  query: z.object({
    from: z.coerce.number().nonnegative().optional(),
    to: z.coerce.number().nonnegative().optional(),
  }),
});

router.get('/:id/timeline', validate(timelineSchema), (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const { from, to } = req.query as any;

    const session = sessionsRepo.findById(id);
    if (!session) {
      res.status(404).json({ error: `Trace session ${id} not found`, code: 'NOT_FOUND' });
      return;
    }

    const resources = resourcesRepo.findBySession(id);
    const edges = edgesRepo.findBySession(id);

    const graph = buildExecutionGraph(resources, edges);

    // Greedy Interval Stacking for Lanes
    // Sort resources by startTime to allocate lanes sequentially
    const sorted = [...resources].sort((a, b) => a.startTime - b.startTime);
    const lanesLastEndTime: number[] = [];

    let entries = sorted.map((res) => {
      const duration = res.endTime ? (res.endTime - res.startTime) : 0;
      const startOffset = res.startTime - session.startTime; // relative to session start

      let lane = 0;
      let placed = false;
      for (let l = 0; l < lanesLastEndTime.length; l++) {
        // If the last resource in this lane ended before current resource starts
        if (lanesLastEndTime[l] <= res.startTime) {
          lanesLastEndTime[l] = res.endTime ?? res.startTime;
          lane = l;
          placed = true;
          break;
        }
      }

      if (!placed) {
        lanesLastEndTime.push(res.endTime ?? res.startTime);
        lane = lanesLastEndTime.length - 1;
      }

      const node = graph.nodes.get(res.asyncId);
      const isOnCriticalPath = node ? node.isOnCriticalPath : false;

      return {
        asyncId: res.asyncId,
        resourceType: res.resourceType,
        startTime: startOffset, // milliseconds from session start
        duration,
        lane,
        isOnCriticalPath,
      };
    });

    // Filter by timeline range query params (?from=X&to=Y)
    if (from !== undefined) {
      entries = entries.filter((e) => e.startTime >= from);
    }
    if (to !== undefined) {
      entries = entries.filter((e) => e.startTime <= to);
    }

    res.json({
      entries,
      totalLanes: lanesLastEndTime.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
