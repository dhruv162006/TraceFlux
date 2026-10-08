import { AsyncResource } from '@traceflux/instrumentation';
import { getDb } from './db.js';

let lastDb: any = null;
let insertStmt: any = null;
let findBySessionStmt: any = null;
let findByIdStmt: any = null;
let updateEndTimeStmt: any = null;
let batchTransaction: any = null;

function getStatements() {
  const db = getDb();
  if (db !== lastDb) {
    lastDb = db;
    
    insertStmt = db.prepare(`
      INSERT INTO async_resources (session_id, async_id, trigger_async_id, resource_type, start_time, end_time, execution_context)
      VALUES (:sessionId, :asyncId, :triggerAsyncId, :resourceType, :startTime, :endTime, :executionContext)
    `);

    findBySessionStmt = db.prepare(`
      SELECT id, session_id as sessionId, async_id as asyncId, trigger_async_id as triggerAsyncId,
             resource_type as resourceType, start_time as startTime, end_time as endTime, execution_context as executionContext
      FROM async_resources
      WHERE session_id = ?
      ORDER BY start_time ASC
    `);

    findByIdStmt = db.prepare(`
      SELECT id, session_id as sessionId, async_id as asyncId, trigger_async_id as triggerAsyncId,
             resource_type as resourceType, start_time as startTime, end_time as endTime, execution_context as executionContext
      FROM async_resources
      WHERE id = ?
    `);

    updateEndTimeStmt = db.prepare(`
      UPDATE async_resources
      SET end_time = ?
      WHERE async_id = ? AND session_id = ?
    `);

    // Define the transaction associated with the active DB instance
    batchTransaction = db.transaction((resources: AsyncResource[]) => {
      for (const res of resources) {
        insertStmt.run({
          sessionId: res.sessionId,
          asyncId: res.asyncId,
          triggerAsyncId: res.triggerAsyncId,
          resourceType: res.resourceType,
          startTime: res.startTime,
          endTime: res.endTime ?? null,
          executionContext: res.executionContext ? JSON.stringify(res.executionContext) : null,
        });
      }
    });
  }
  return { findBySessionStmt, findByIdStmt, updateEndTimeStmt, batchTransaction };
}

function mapRow(row: any): AsyncResource {
  return {
    id: row.id,
    sessionId: row.sessionId,
    asyncId: row.asyncId,
    triggerAsyncId: row.triggerAsyncId,
    resourceType: row.resourceType,
    startTime: row.startTime,
    endTime: row.endTime ?? undefined,
    executionContext: row.executionContext ? JSON.parse(row.executionContext) : undefined,
  };
}

export const resourcesRepo = {
  insertBatch(resources: AsyncResource[]): void {
    const { batchTransaction } = getStatements();
    batchTransaction(resources);
  },

  findBySession(sessionId: string): AsyncResource[] {
    const { findBySessionStmt } = getStatements();
    const rows = findBySessionStmt.all(sessionId) as any[];
    return rows.map(mapRow);
  },

  findById(id: number): AsyncResource | undefined {
    const { findByIdStmt } = getStatements();
    const row = findByIdStmt.get(id) as any;
    if (!row) return undefined;
    return mapRow(row);
  },

  updateEndTime(asyncId: number, sessionId: string, endTime: number): void {
    const { updateEndTimeStmt } = getStatements();
    updateEndTimeStmt.run(endTime, asyncId, sessionId);
  },
};
