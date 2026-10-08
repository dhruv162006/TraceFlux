import { AsyncResource, ExecutionEdge, GraphNode, ExecutionGraph } from '@traceflux/instrumentation';
import { findCriticalPath } from './critical-path.js';

export function buildExecutionGraph(
  resources: AsyncResource[],
  edges: ExecutionEdge[]
): ExecutionGraph {
  const nodes = new Map<number, GraphNode>();

  // 1. Initialize Graph Nodes for all resources
  for (const res of resources) {
    if (res.asyncId === undefined) continue;
    nodes.set(res.asyncId, {
      asyncId: res.asyncId,
      resourceType: res.resourceType,
      duration: res.endTime ? (res.endTime - res.startTime) : undefined,
      startTime: res.startTime,
      depth: 0,
      isOnCriticalPath: false,
      concurrentPeers: 0,
      children: [],
    });
  }

  // 2. Build Adjacency list of children and track child nodes with incoming parent edges
  const childWithParent = new Set<number>();
  for (const edge of edges) {
    const parentNode = nodes.get(edge.parentAsyncId);
    const childNode = nodes.get(edge.childAsyncId);

    // Only map edges where both parent and child exist in this session context
    if (parentNode && childNode) {
      if (!parentNode.children.includes(edge.childAsyncId)) {
        parentNode.children.push(edge.childAsyncId);
      }
      childWithParent.add(edge.childAsyncId);
    }
  }

  // 3. Detect root nodes (nodes in this session that have no parent edges in this session)
  const roots: number[] = [];
  for (const asyncId of nodes.keys()) {
    if (!childWithParent.has(asyncId)) {
      roots.push(asyncId);
    }
  }

  // 4. Run Breadth-First Search (BFS) from roots to calculate BFS depth of each node
  const queue: { id: number; depth: number }[] = roots.map((r) => ({ id: r, depth: 0 }));
  const visited = new Set<number>();
  let maxDepth = 0;

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = nodes.get(id);
    if (node) {
      node.depth = depth;
      if (depth > maxDepth) {
        maxDepth = depth;
      }
      for (const childId of node.children) {
        queue.push({ id: childId, depth: depth + 1 });
      }
    }
  }

  // 5. Construct initial ExecutionGraph object
  const graph: ExecutionGraph = {
    nodes,
    roots,
    criticalPath: [],
    maxDepth,
    totalDuration: 0,
  };

  // 6. Find and flag nodes on the critical path
  const criticalPath = findCriticalPath(graph);
  graph.criticalPath = criticalPath;

  let totalDuration = 0;
  for (const id of criticalPath) {
    const node = nodes.get(id);
    if (node) {
      node.isOnCriticalPath = true;
      if (node.duration) {
        totalDuration += node.duration;
      }
    }
  }
  graph.totalDuration = totalDuration;

  // 7. Calculate concurrent peer overlaps for each node (using overlap intervals)
  const nodeList = Array.from(nodes.values());
  for (let i = 0; i < nodeList.length; i++) {
    const nodeA = nodeList[i];
    const startA = nodeA.startTime;
    const endA = startA + (nodeA.duration ?? 0);
    let overlaps = 0;

    for (let j = 0; j < nodeList.length; j++) {
      if (i === j) continue;
      const nodeB = nodeList[j];
      const startB = nodeB.startTime;
      const endB = startB + (nodeB.duration ?? 0);

      // Node interval intersection rule
      if (startA < endB && startB < endA) {
        overlaps++;
      }
    }
    nodeA.concurrentPeers = overlaps;
  }

  return graph;
}
