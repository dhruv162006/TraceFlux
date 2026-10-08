import DatabaseConstructor, { Database } from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

let dbInstance: Database | null = null;

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS trace_sessions (
  id          TEXT PRIMARY KEY,
  trace_id    TEXT NOT NULL UNIQUE,
  start_time  INTEGER NOT NULL,        -- Unix ms
  end_time    INTEGER,
  metadata    TEXT                     -- JSON blob
);

CREATE TABLE IF NOT EXISTS async_resources (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL REFERENCES trace_sessions(id),
  async_id        INTEGER NOT NULL,
  trigger_async_id INTEGER NOT NULL,
  resource_type   TEXT NOT NULL,
  start_time      INTEGER NOT NULL,
  end_time        INTEGER,
  execution_context TEXT              -- JSON blob: url, queryId, etc.
);

CREATE TABLE IF NOT EXISTS execution_edges (
  session_id      TEXT NOT NULL REFERENCES trace_sessions(id),
  parent_async_id INTEGER NOT NULL,
  child_async_id  INTEGER NOT NULL,
  edge_type       TEXT DEFAULT 'spawn', -- spawn | resolve | reject | callback
  PRIMARY KEY (session_id, parent_async_id, child_async_id)
);

CREATE TABLE IF NOT EXISTS concurrency_windows (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES trace_sessions(id),
  start_time    INTEGER NOT NULL,
  end_time      INTEGER NOT NULL,
  overlap_count INTEGER NOT NULL,
  resource_ids  TEXT                 -- JSON array of async_ids
);

CREATE TABLE IF NOT EXISTS shared_accesses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES trace_sessions(id),
  resource_id   TEXT NOT NULL,
  access_type   TEXT NOT NULL,       -- read | write
  async_id      INTEGER NOT NULL,
  timestamp     INTEGER NOT NULL,
  stack_snippet TEXT                 -- optional abbreviated call stack
);

CREATE INDEX IF NOT EXISTS idx_resources_session ON async_resources(session_id);
CREATE INDEX IF NOT EXISTS idx_edges_session ON execution_edges(session_id);
CREATE INDEX IF NOT EXISTS idx_shared_session ON shared_accesses(session_id);
`;

export function getDb(dbPath?: string): Database {
  if (dbInstance) return dbInstance;

  // DECISION: Centralized database path resolution
  // Priority order:
  // 1. Explicit dbPath parameter passed to getDb()
  // 2. TRACEFLUX_DB_PATH environment variable (shared between API, demo app, and seeder)
  // 3. Fallback to process.cwd()/traceflux.db
  const envPath = process.env.TRACEFLUX_DB_PATH?.trim();
  const rawPath = dbPath ?? (envPath && envPath.length > 0 ? envPath : undefined);
  const targetPath = rawPath
    ? (rawPath === ':memory:' ? ':memory:' : path.resolve(rawPath))
    : path.join(process.cwd(), 'traceflux.db');

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  // DECISION: better-sqlite3 sync API
  // Using a synchronous SQLite driver (better-sqlite3) is ideal for a local telemetry collector.
  // Because SQLite works directly on a local file in-process, synchronous operations bypass the Node.js
  // event loop overhead, promise allocation costs, and queueing latency of async drivers, achieving 
  // insertion rates that are up to 10x faster. Since the collector is local, blocking is negligible.
  const db = new DatabaseConstructor(targetPath);

  // DECISION: WAL mode for SQLite
  // Enabling Write-Ahead Logging (WAL) allows readers (the dashboard UI APIs) to read data concurrently 
  // while the writer (the trace collector) is writing batches of telemetry. This prevents write queries 
  // from locking out read queries and avoids blocking trace ingestion.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  db.exec(MIGRATION_SQL);

  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
