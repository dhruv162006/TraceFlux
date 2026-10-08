import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sessionsRepo, resourcesRepo } from '@traceflux/storage';
import { detectConcurrencyWindows } from '@traceflux/analyzers';
import { validate } from '../middleware/validate.js';

const router = Router();

const traceParamsSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
});

router.get('/:id/concurrency', validate(traceParamsSchema), (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const session = sessionsRepo.findById(id);
    if (!session) {
      res.status(404).json({ error: `Trace session ${id} not found`, code: 'NOT_FOUND' });
      return;
    }

    const resources = resourcesRepo.findBySession(id);
    const windows = detectConcurrencyWindows(resources);

    const maxOverlap = windows.length > 0 ? Math.max(...windows.map((w) => w.overlapCount)) : 0;
    // Standard pressure score calculation based on max active overlap
    const score = Math.min(100, Math.round(maxOverlap * 10));

    res.json({
      windows,
      maxOverlap,
      score,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
