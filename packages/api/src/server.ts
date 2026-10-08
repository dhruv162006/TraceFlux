import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { EventCollector, WsServer } from '@traceflux/collectors';

import tracesRouter from './routes/traces.js';
import metricsRouter from './routes/metrics.js';
import graphRouter from './routes/graph.js';
import timelineRouter from './routes/timeline.js';
import concurrencyRouter from './routes/concurrency.js';
import replayRouter from './routes/replay.js';
import { createCollectRouter } from './routes/collect.js';
import { errorHandler } from './middleware/error.js';

export function createServer() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(cors({ origin: '*' })); // Allow connections from frontend dev servers

  // X-Response-Time Middleware
  app.use((req, res, next) => {
    const start = performance.now();
    const originalSend = res.send;
    res.send = function (body) {
      const elapsed = performance.now() - start;
      res.setHeader('X-Response-Time', `${elapsed.toFixed(2)}ms`);
      return originalSend.call(this, body);
    };
    next();
  });

  // Create HTTP Server & WebSocket Server
  const server = http.createServer(app);
  const wsServer = new WsServer(server);
  const collector = new EventCollector(wsServer);

  // Mount routes
  app.use('/collect', createCollectRouter(collector));
  app.use('/api/traces', tracesRouter);
  app.use('/api/traces', graphRouter);
  app.use('/api/traces', timelineRouter);
  app.use('/api/traces', concurrencyRouter);
  app.use('/api/traces', replayRouter);
  app.use('/api/metrics', metricsRouter);

  // Centralized Error Handler
  app.use(errorHandler);

  return { server, app, wsServer, collector };
}
