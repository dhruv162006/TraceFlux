import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, agent } from './app.js';
import { getDb, closeDb } from '@traceflux/storage';

describe('TraceFlux Demo App Workloads Integration', () => {
  beforeAll(() => {
    // Enable instrumentation agent
    agent.enable();
    // Initialize DB to ensure shared_accesses exists
    getDb();
  });

  afterAll(() => {
    // Disable agent and clean up db
    agent.disable();
    closeDb();
  });

  it('should execute light workload successfully', async () => {
    const res = await request(app)
      .get('/workloads/light')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.workload).toBe('light');
    expect(res.body.numbers).toBeDefined();
  });

  it('should execute heavy workload successfully generating high async counts', async () => {
    const res = await request(app)
      .get('/workloads/heavy')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.workload).toBe('heavy');
    expect(res.body.eventsCount).toBe(35);
  });

  it('should execute concurrency workload successfully', async () => {
    const res = await request(app)
      .get('/workloads/concurrency')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.workload).toBe('concurrency');
    expect(res.body.parallelTasks).toBe(80);
  });

  it('should execute event loop pressure workload successfully', async () => {
    const res = await request(app)
      .get('/workloads/eventloop-pressure')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.workload).toBe('eventloop-pressure');
    expect(res.body.blockedDurationMs).toBeGreaterThanOrEqual(100);
  });

  it('should execute race condition candidate workload and record accesses', async () => {
    const res = await request(app)
      .get('/workloads/race')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.workload).toBe('race');
    expect(res.body.simulatedResource).toBe('config_settings_var');

    // Query database to ensure conflicts were recorded
    const db = getDb();
    const rows = db.prepare('SELECT * FROM shared_accesses WHERE resource_id = ?').all('config_settings_var');
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
