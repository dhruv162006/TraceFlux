import { TraceSession } from '@traceflux/instrumentation';
import { getDb } from './db.js';

let lastDb: any = null;
let insertStmt: any = null;
let findByIdStmt: any = null;
let updateEndTimeStmt: any = null;

function getStatements() {
  const db = getDb();
  if (db !== lastDb) {
    lastDb = db;
    insertStmt = db.prepare(`
      INSERT OR IGNORE INTO trace_sessions (id, trace_id, start_time, end_time, metadata)
      VALUES (:id, :traceId, :startTime, :endTime, :metadata)
    `);
    findByIdStmt = db.prepare(`
      SELECT id, trace_id as traceId, start_time as startTime, end_time as endTime, metadata
      FROM trace_sessions
      WHERE id = ?
    `);
    updateEndTimeStmt = db.prepare(`
      UPDATE trace_sessions
      SET end_time = ?
      WHERE id = ?
    `);
  }
  return { insertStmt, findByIdStmt, updateEndTimeStmt };
}

export const sessionsRepo = {
  insert(session: TraceSession): void {
    const { insertStmt } = getStatements();
    insertStmt.run({
      id: session.id,
      traceId: session.traceId,
      startTime: session.startTime,
      endTime: session.endTime ?? null,
      metadata: session.metadata ? JSON.stringify(session.metadata) : null,
    });
  },

  findById(id: string): TraceSession | undefined {
    const { findByIdStmt } = getStatements();
    const row = findByIdStmt.get(id) as any;
    if (!row) return undefined;

    return {
      id: row.id,
      traceId: row.traceId,
      startTime: row.startTime,
      endTime: row.endTime ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  },

  updateEndTime(id: string, endTime: number): void {
    const { updateEndTimeStmt } = getStatements();
    updateEndTimeStmt.run(endTime, id);
  },

  list(limit: number, offset: number, search?: string): { traces: TraceSession[]; total: number } {
    const db = getDb();
    let query = `
      SELECT id, trace_id as traceId, start_time as startTime, end_time as endTime, metadata
      FROM trace_sessions
    `;
    let countQuery = `SELECT COUNT(*) as total FROM trace_sessions`;
    const params: any[] = [];
    const countParams: any[] = [];

    if (search) {
      query += ` WHERE id LIKE ? OR trace_id LIKE ?`;
      countQuery += ` WHERE id LIKE ? OR trace_id LIKE ?`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam);
      countParams.push(searchParam, searchParam);
    }

    query += ` ORDER BY start_time DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params) as any[];
    const countRow = db.prepare(countQuery).get(...countParams) as { total: number };

    const traces = rows.map((row) => ({
      id: row.id,
      traceId: row.traceId,
      startTime: row.startTime,
      endTime: row.endTime ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));

    return {
      traces,
      total: countRow.total,
    };
  },
};
