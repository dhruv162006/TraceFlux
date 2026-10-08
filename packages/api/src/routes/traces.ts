import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sessionsRepo, resourcesRepo, edgesRepo, getDb } from '@traceflux/storage';
import { detectRaceCandidates } from '@traceflux/analyzers';
import { validate } from '../middleware/validate.js';

const router = Router();

const listQuerySchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().positive().default(50),
    offset: z.coerce.number().int().nonnegative().default(0),
    search: z.string().optional(),
  }),
});

const traceParamsSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
});

router.get('/', validate(listQuerySchema), (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { limit, offset, search } = req.query as any;
    const result = sessionsRepo.list(limit, offset, search);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', validate(traceParamsSchema), (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const session = sessionsRepo.findById(id);
    if (!session) {
      res.status(404).json({ error: `Trace session ${id} not found`, code: 'NOT_FOUND' });
      return;
    }

    const resources = resourcesRepo.findBySession(id);
    const completed = resources.filter(r => r.startTime !== undefined && r.endTime !== undefined);

    let duration = 0;
    if (completed.length > 0) {
      const startTimes = completed.map(r => r.startTime);
      const endTimes = completed.map(r => r.endTime!);
      const minStart = Math.min(...startTimes);
      const maxEnd = Math.max(...endTimes);
      duration = maxEnd - minStart;
    }

    res.json({
      ...session,
      resourceCount: resources.length,
      duration,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/export', validate(traceParamsSchema), (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const session = sessionsRepo.findById(id);
    if (!session) {
      res.status(404).json({ error: `Trace session ${id} not found`, code: 'NOT_FOUND' });
      return;
    }

    const resources = resourcesRepo.findBySession(id);
    const edges = edgesRepo.findBySession(id);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=trace-export-${id}.json`);
    
    res.json({
      session,
      resources,
      edges,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/races', validate(traceParamsSchema), (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const db = getDb();
    const rawAccesses = db.prepare(`
      SELECT id, session_id as sessionId, resource_id as resourceId, access_type as accessType,
             async_id as asyncId, timestamp, stack_snippet as stackSnippet
      FROM shared_accesses
      WHERE session_id = ?
    `).all(id) as any[];

    const accesses = rawAccesses.map((a) => ({
      id: a.id,
      sessionId: a.sessionId,
      resourceId: a.resourceId,
      accessType: a.accessType,
      asyncId: a.asyncId,
      timestamp: a.timestamp,
      stackSnippet: a.stackSnippet ?? undefined,
    }));

    const candidates = detectRaceCandidates(accesses);
    res.json(candidates);
  } catch (error) {
    next(error);
  }
});

export default router;
