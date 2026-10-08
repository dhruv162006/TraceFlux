import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sessionsRepo, resourcesRepo, edgesRepo } from '@traceflux/storage';
import { buildExecutionGraph } from '@traceflux/analyzers';
import { validate } from '../middleware/validate.js';

const router = Router();

const traceParamsSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
});

router.get('/:id/graph', validate(traceParamsSchema), (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const session = sessionsRepo.findById(id);
    if (!session) {
      res.status(404).json({ error: `Trace session ${id} not found`, code: 'NOT_FOUND' });
      return;
    }

    const resources = resourcesRepo.findBySession(id);
    const edges = edgesRepo.findBySession(id);

    const graph = buildExecutionGraph(resources, edges);

    // Filter orphans (resources not referenced by any edges in the session)
    const referencedIds = new Set<number>();
    for (const edge of edges) {
      referencedIds.add(edge.parentAsyncId);
      referencedIds.add(edge.childAsyncId);
    }
    const orphans = resources
      .filter((r) => r.asyncId !== undefined && !referencedIds.has(r.asyncId))
      .map((r) => r.asyncId!);

    res.json({
      graph: {
        nodes: Array.from(graph.nodes.values()),
        edges,
      },
      criticalPath: graph.criticalPath,
      orphans,
      stats: {
        nodeCount: graph.nodes.size,
        edgeCount: edges.length,
        maxDepth: graph.maxDepth,
        totalDuration: graph.totalDuration,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
