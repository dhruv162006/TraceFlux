import { ExecutionEdge } from '@traceflux/instrumentation';
import { getDb } from './db.js';

let lastDb: any = null;
let insertStmt: any = null;
let findBySessionStmt: any = null;
let batchTransaction: any = null;

function getStatements() {
  const db = getDb();
  if (db !== lastDb) {
    lastDb = db;
    
    insertStmt = db.prepare(`
      INSERT OR IGNORE INTO execution_edges (session_id, parent_async_id, child_async_id, edge_type)
      VALUES (:sessionId, :parentAsyncId, :childAsyncId, :edgeType)
    `);

    findBySessionStmt = db.prepare(`
      SELECT session_id as sessionId, parent_async_id as parentAsyncId, child_async_id as childAsyncId, edge_type as edgeType
      FROM execution_edges
      WHERE session_id = ?
    `);

    batchTransaction = db.transaction((edges: ExecutionEdge[]) => {
      for (const edge of edges) {
        insertStmt.run({
          sessionId: edge.sessionId,
          parentAsyncId: edge.parentAsyncId,
          childAsyncId: edge.childAsyncId,
          edgeType: edge.edgeType,
        });
      }
    });
  }
  return { findBySessionStmt, batchTransaction };
}

export const edgesRepo = {
  insertBatch(edges: ExecutionEdge[]): void {
    const { batchTransaction } = getStatements();
    batchTransaction(edges);
  },

  findBySession(sessionId: string): ExecutionEdge[] {
    const { findBySessionStmt } = getStatements();
    const rows = findBySessionStmt.all(sessionId) as any[];
    return rows.map((row) => ({
      sessionId: row.sessionId,
      parentAsyncId: row.parentAsyncId,
      childAsyncId: row.childAsyncId,
      edgeType: row.edgeType,
    }));
  },
};
