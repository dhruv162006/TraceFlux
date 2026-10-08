import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runSeeder } from './seed.js';
import { getDb, closeDb } from '../packages/storage/src/index.js';

describe('TraceFlux Telemetry Seeder Verification', () => {
  beforeAll(() => {
    // Initialize clean DB
    getDb();
  });

  afterAll(() => {
    closeDb();
  });

  it('should seed small, medium, and large trace datasets successfully', () => {
    const results = runSeeder();
    expect(results).toHaveLength(3);

    // Verify small dataset sizes
    const small = results[0];
    expect(small.sessionId).toBe('trace-session-small');
    expect(small.resourcesCount + small.edgesCount).toBeGreaterThanOrEqual(9500);

    // Verify medium dataset sizes
    const medium = results[1];
    expect(medium.sessionId).toBe('trace-session-medium');
    expect(medium.resourcesCount + medium.edgesCount).toBeGreaterThanOrEqual(48000);

    // Verify large dataset sizes
    const large = results[2];
    expect(large.sessionId).toBe('trace-session-large');
    expect(large.resourcesCount + large.edgesCount).toBeGreaterThanOrEqual(95000);

    // Verify records exist in SQLite
    const db = getDb();
    const sessionCount = db.prepare('SELECT COUNT(*) as count FROM trace_sessions').get() as { count: number };
    expect(sessionCount.count).toBeGreaterThanOrEqual(3);

    const resourceCount = db.prepare('SELECT COUNT(*) as count FROM async_resources').get() as { count: number };
    expect(resourceCount.count).toBeGreaterThanOrEqual(100000 * 0.5); // At least large + others
  });
});
