import { ExecutionGraph } from '@traceflux/instrumentation';

export function findCriticalPath(graph: ExecutionGraph): number[] {
  // Memoization cache: node asyncId -> { distance, path }
  const memo = new Map<number, { distance: number; path: number[] }>();
  // visiting set to detect and handle cyclical edges cleanly
  const visiting = new Set<number>();

  function longestPath(nodeId: number): { distance: number; path: number[] } {
    if (memo.has(nodeId)) return memo.get(nodeId)!;
    if (visiting.has(nodeId)) {
      // Cycle detected: return base case to break recursion and prevent stack overflow
      return { distance: 0, path: [] };
    }

    visiting.add(nodeId);

    const node = graph.nodes.get(nodeId);
    const duration = node?.duration ?? 0;

    let maxChildDist = 0;
    let bestChildPath: number[] = [];

    if (node && node.children) {
      for (const childId of node.children) {
        const childRes = longestPath(childId);
        if (childRes.distance > maxChildDist) {
          maxChildDist = childRes.distance;
          bestChildPath = childRes.path;
        }
      }
    }

    visiting.delete(nodeId);

    const result = {
      distance: duration + maxChildDist,
      path: [nodeId, ...bestChildPath],
    };
    memo.set(nodeId, result);
    return result;
  }

  let globalMaxDist = -1;
  let globalBestPath: number[] = [];

  for (const rootId of graph.roots) {
    const rootRes = longestPath(rootId);
    if (rootRes.distance > globalMaxDist) {
      globalMaxDist = rootRes.distance;
      globalBestPath = rootRes.path;
    }
  }

  return globalBestPath;
}
