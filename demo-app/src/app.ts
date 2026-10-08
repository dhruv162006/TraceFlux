import express, { Request, Response } from 'express';
import { performance } from 'node:perf_hooks';
import async_hooks from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { createAgent, getCurrentContext } from '@traceflux/instrumentation';
import { getDb } from '@traceflux/storage';

const collectorUrl = process.env.COLLECTOR_URL ?? 'http://localhost:3001/collect';

// Initialize the TraceFlux Instrumentation Agent
const agent = createAgent({
  endpoint: collectorUrl,
  flushIntervalMs: 10, // flush quickly for demo app responsiveness
  ignoreTypes: ['TickObject'],
});
agent.enable();

const app = express();
app.use(express.json());

// Inject TraceFlux middleware to trace requests
app.use(agent.middleware());

// Route: Checkout Workload (~40-80 async events with Promises, Timers, and concurrent tasks)
app.get('/checkout', async (req: Request, res: Response) => {
  // Step 1: Simulated Auth & Cart fetch
  await new Promise((resolve) => setTimeout(resolve, 15));
  const cart = await Promise.resolve({ items: ['item_1', 'item_2'], total: 99.99 });

  // Step 2: Payment Gateway call
  const payment = await new Promise((resolve) => setTimeout(() => resolve({ status: 'CHARGED', id: 'pay_123' }), 30));

  // Step 3: Concurrent notification and inventory updates
  const receipt = await Promise.all([
    new Promise((resolve) => setTimeout(() => resolve('email_sent'), 10)),
    new Promise((resolve) => setTimeout(() => resolve('inventory_decremented'), 15)),
  ]);

  res.json({ success: true, orderId: 'ord_998', cart, payment, receipt });
});

// Route 1: Light Workload (~20-50 async events)
app.get('/workloads/light', async (req: Request, res: Response) => {
  // Simple timeout + resolve chain
  await new Promise((resolve) => setTimeout(resolve, 10));
  
  const numbers = await Promise.resolve([1, 2, 3])
    .then((arr) => arr.map(x => x * 2))
    .then((arr) => arr.filter(x => x > 2));

  res.json({ success: true, workload: 'light', numbers });
});

// Route 2: Heavy Workload (200-500 async events per request)
app.get('/workloads/heavy', async (req: Request, res: Response) => {
  const taskCount = 35; // Spawning 35 parallel tasks
  
  // Each task executes nested promises, timeouts, and filesystem reads to generate high async hook counts
  const tasks = Array.from({ length: taskCount }).map(async (_, idx) => {
    // 1. Timeout delay
    await new Promise((resolve) => setTimeout(resolve, 2 + (idx % 5)));
    
    // 2. Promise chain depth 5
    let val = idx;
    val = await Promise.resolve(val).then(v => v + 1);
    val = await Promise.resolve(val).then(v => v * 2);
    val = await Promise.resolve(val).then(v => v - 1);
    val = await Promise.resolve(val).then(v => v / 2);
    val = await Promise.resolve(val).then(v => Math.round(v));
    
    // 3. Simulated file read to generate native FS callback hooks
    // We'll read package.json (known to exist)
    const filePath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(filePath)) {
      await fs.promises.readFile(filePath, 'utf8');
    }

    return val;
  });

  const results = await Promise.all(tasks);
  res.json({ success: true, workload: 'heavy', eventsCount: results.length });
});

// Route 3: Concurrency Workload (High parallel overlapping requests)
app.get('/workloads/concurrency', async (req: Request, res: Response) => {
  const parallelTasksCount = 80;
  
  // Runs 80 overlapping tasks executing simultaneously for 30ms
  const tasks = Array.from({ length: parallelTasksCount }).map(async (_, idx) => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return idx;
  });

  await Promise.all(tasks);
  res.json({ success: true, workload: 'concurrency', parallelTasks: parallelTasksCount });
});

// Route 4: Event Loop Pressure (Injects lag spike)
app.get('/workloads/eventloop-pressure', (req: Request, res: Response) => {
  const blockDurationMs = 120; // Block the single thread for 120ms
  const start = performance.now();
  
  while (performance.now() - start < blockDurationMs) {
    // CPU-bound loop that blocks the event loop ticks
  }

  res.json({
    success: true,
    workload: 'eventloop-pressure',
    blockedDurationMs: Math.round(performance.now() - start),
  });
});

// Route 5: Race Condition Workload
app.get('/workloads/race', async (req: Request, res: Response) => {
  const db = getDb();
  const context = getCurrentContext();
  const sessionId = context?.traceId ?? 'global';

  // Ensure the trace session exists in the database to satisfy the foreign key constraint
  db.prepare(`
    INSERT OR IGNORE INTO trace_sessions (id, trace_id, start_time)
    VALUES (?, ?, ?)
  `).run(sessionId, sessionId, Date.now());

  // We will simulate 2 concurrent workflows writing/reading to the same variable
  const sharedResourceId = 'config_settings_var';
  
  // Execution Context 1: Write Operation
  const task1 = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    const currentAsyncId = async_hooks.executionAsyncId();
    
    db.prepare(`
      INSERT INTO shared_accesses (session_id, resource_id, access_type, async_id, timestamp, stack_snippet)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, sharedResourceId, 'write', currentAsyncId, Date.now(), 'at configUpdate (workflows.ts:12:4)');
  })();

  // Execution Context 2: Read/Write Conflict within 10ms (<= 100ms)
  const task2 = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 8));
    const currentAsyncId = async_hooks.executionAsyncId();
    
    db.prepare(`
      INSERT INTO shared_accesses (session_id, resource_id, access_type, async_id, timestamp, stack_snippet)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, sharedResourceId, 'read', currentAsyncId, Date.now() + 3, 'at configRead (workflows.ts:24:9)');
  })();

  await Promise.all([task1, task2]);

  res.json({
    success: true,
    workload: 'race',
    simulatedResource: sharedResourceId,
  });
});

// Start listening if executed directly
if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT ?? 3002;
  app.listen(port, () => {
    console.log(`[TraceFlux Demo App] Server listening on port ${port}`);
  });
}

export { app, agent };
