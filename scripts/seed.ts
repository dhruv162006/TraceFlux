import { performance } from 'node:perf_hooks';
import { sessionsRepo, resourcesRepo, edgesRepo, getDb } from '../packages/storage/src/index.js';
import { AsyncResource, ExecutionEdge, ResourceType } from '../packages/instrumentation/src/types.js';

interface SeedResult {
  sessionId: string;
  resourcesCount: number;
  edgesCount: number;
  racesCount: number;
  durationMs: number;
}

function generateDataset(
  sessionId: string,
  targetEvents: number
): { resources: AsyncResource[]; edges: ExecutionEdge[]; accesses: any[] } {
  const startTime = Date.now() - 2 * 3600000; // 2 hours ago
  const resources: AsyncResource[] = [];
  const edges: ExecutionEdge[] = [];
  const accesses: any[] = [];

  // Define target counts (split events between resources and edges)
  const targetResources = Math.floor(targetEvents * 0.55);
  
  // 1. Create Root Resource
  resources.push({
    sessionId,
    asyncId: 1,
    triggerAsyncId: 0,
    resourceType: 'CUSTOM',
    startTime,
    endTime: startTime + 5,
    executionContext: { traceId: sessionId, requestId: 'root-req', url: '/seed-trigger', method: 'GET' },
  });

  // 2. Generate tree structures of async operations
  let currentAsyncId = 2;
  const parentQueue: number[] = [1];

  const resourceTypes: ResourceType[] = [
    'PROMISE',
    'Timeout',
    'Immediate',
    'FSREQCALLBACK',
    'TCPWRAP',
    'HTTPCLIENTREQUEST',
  ];

  while (resources.length < targetResources) {
    const parentId = parentQueue[Math.floor(Math.random() * parentQueue.length)];
    const childId = currentAsyncId++;
    const type = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];

    const taskStart = startTime + Math.random() * 5000; // spread over 5s
    const taskEnd = taskStart + Math.random() * 150;     // durations up to 150ms

    resources.push({
      sessionId,
      asyncId: childId,
      triggerAsyncId: parentId,
      resourceType: type,
      startTime: Math.round(taskStart),
      endTime: Math.round(taskEnd),
    });

    edges.push({
      sessionId,
      parentAsyncId: parentId,
      childAsyncId: childId,
      edgeType: 'spawn',
    });

    // Resolve edge
    if (Math.random() < 0.3) {
      edges.push({
        sessionId,
        parentAsyncId: parentId,
        childAsyncId: childId,
        edgeType: 'resolve',
      });
    }

    // Callback edge
    if (Math.random() < 0.2) {
      edges.push({
        sessionId,
        parentAsyncId: parentId,
        childAsyncId: childId,
        edgeType: 'callback',
      });
    }

    // Grow tree hierarchy
    if (Math.random() < 0.75) {
      parentQueue.push(childId);
    }
    // Limit queue size for tree depth
    if (parentQueue.length > 80) {
      parentQueue.shift();
    }
  }

  // 3. Generate Race Variable Access conflicts (approx. 1% of nodes)
  const raceCount = Math.max(5, Math.floor(targetResources * 0.005));
  for (let r = 0; r < raceCount; r++) {
    const resourceId = `db_pool_connection_${r}`;
    const asyncId1 = Math.floor(Math.random() * targetResources) + 1;
    const asyncId2 = Math.floor(Math.random() * targetResources) + 1;
    
    if (asyncId1 !== asyncId2) {
      const baseTime = startTime + Math.random() * 4000;
      accesses.push({
        sessionId,
        resourceId,
        accessType: 'write',
        asyncId: asyncId1,
        timestamp: Math.round(baseTime),
        stackSnippet: 'at updateProfile (controllers/user.js:45:12)',
      });

      accesses.push({
        sessionId,
        resourceId,
        accessType: Math.random() < 0.5 ? 'write' : 'read',
        asyncId: asyncId2,
        timestamp: Math.round(baseTime + Math.random() * 8), // 0-8ms overlap -> triggers high risk score
        stackSnippet: 'at fetchSettings (controllers/user.js:89:4)',
      });
    }
  }

  return { resources, edges, accesses };
}

function seedSession(sessionId: string, targetEvents: number): SeedResult {
  console.log(`\nGenerating dataset for ${sessionId} (~${targetEvents} events)...`);
  const genStart = performance.now();
  const { resources, edges, accesses } = generateDataset(sessionId, targetEvents);
  const genDuration = performance.now() - genStart;
  console.log(`Generation took ${genDuration.toFixed(2)}ms.`);

  const db = getDb();
  
  // Insert session root
  sessionsRepo.insert({
    id: sessionId,
    traceId: sessionId,
    startTime: resources[0].startTime,
    endTime: resources[0].startTime + 5000,
    metadata: { generated: true, targetEvents },
  });

  const insertStart = performance.now();

  // Batch insert resources
  resourcesRepo.insertBatch(resources);

  // Batch insert edges
  edgesRepo.insertBatch(edges);

  // Batch insert shared accesses using custom transaction
  if (accesses.length > 0) {
    const insertAccessStmt = db.prepare(`
      INSERT INTO shared_accesses (session_id, resource_id, access_type, async_id, timestamp, stack_snippet)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertAccessesTx = db.transaction((accs: any[]) => {
      for (const a of accs) {
        insertAccessStmt.run(a.sessionId, a.resourceId, a.accessType, a.asyncId, a.timestamp, a.stackSnippet);
      }
    });
    insertAccessesTx(accesses);
  }

  const durationMs = performance.now() - insertStart;
  const totalEvents = resources.length + edges.length + accesses.length;

  console.log(`Inserted ${totalEvents} records to SQLite database in ${durationMs.toFixed(2)}ms.`);
  console.log(`Throughput: ${(totalEvents / (durationMs / 1000)).toFixed(0)} events/sec`);

  return {
    sessionId,
    resourcesCount: resources.length,
    edgesCount: edges.length,
    racesCount: accesses.length,
    durationMs,
  };
}

export function runSeeder(): SeedResult[] {
  console.log('--- TraceFlux Database Telemetry Seeding In Progress ---');
  const results: SeedResult[] = [];

  // Seed Small Session (10k+ total events)
  results.push(seedSession('trace-session-small', 10000));

  // Seed Medium Session (50k+ total events)
  results.push(seedSession('trace-session-medium', 50000));

  // Seed Large Session (100k+ total events)
  results.push(seedSession('trace-session-large', 100000));

  console.log('\n--- Seeding Completed Successfully ---');
  return results;
}

// Check if run directly
if (process.env.NODE_ENV !== 'test') {
  runSeeder();
}
