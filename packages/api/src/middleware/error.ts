import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  // Log using pino-http attached logger if available, otherwise console
  const logger = (req as any).log || console;
  logger.error(err);

  res.status(status).json({
    error: message,
    code,
  });
}
