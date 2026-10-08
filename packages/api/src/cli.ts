#!/usr/bin/env node
import { createServer } from './server.js';
import { getDb, closeDb } from '@traceflux/storage';

const port = parseInt(process.env.PORT || '3001', 10);
const dbPath = process.env.TRACEFLUX_DB_PATH;

// Resolve and initialize database instance
const db = getDb(dbPath);

const { server, wsServer } = createServer();

server.listen(port, () => {
  console.log(`[TraceFlux API] HTTP server listening on http://localhost:${port}`);
  console.log(`[TraceFlux API] WebSocket server listening on ws://localhost:${port}`);
  console.log(`[TraceFlux API] Storage initialized at: ${db.name}`);
});

function gracefulShutdown(signal: string) {
  console.log(`\n[TraceFlux API] Received ${signal}. Shutting down gracefully...`);

  // Close WebSocket connections
  try {
    wsServer.close();
  } catch (err) {
    console.error('[TraceFlux API] Error closing WebSocket server:', err);
  }

  // Close HTTP server and database
  server.close((err) => {
    if (err) {
      console.error('[TraceFlux API] Error closing HTTP server:', err);
    }
    try {
      closeDb();
    } catch (dbErr) {
      console.error('[TraceFlux API] Error closing database:', dbErr);
    }
    console.log('[TraceFlux API] Shutdown complete.');
    process.exit(0);
  });

  // Force exit after 5 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.warn('[TraceFlux API] Forced shutdown due to timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
