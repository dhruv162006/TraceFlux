import { Router, Request, Response, NextFunction } from 'express';
import { EventCollector } from '@traceflux/collectors';

export function createCollectRouter(collector: EventCollector): Router {
  const router = Router();

  router.post('/', (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = collector.processBatch(req.body);
      res.status(200).json({
        success: true,
        count: result.count,
      });
    } catch (error) {
      // If validation fails in Zod, express validation middleware or error handler maps it to 400
      next(error);
    }
  });

  return router;
}
