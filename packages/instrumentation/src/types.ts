export interface AgentConfig {
  endpoint: string;
  flushIntervalMs?: number;
  ignoreTypes?: ResourceType[];
  sampleRate?: number;
}

export type ResourceType =
  | 'PROMISE'
  | 'TCPWRAP'
  | 'TIMERWRAP'
  | 'Timeout'
  | 'Immediate'
  | 'FSREQCALLBACK'
  | 'TickObject'
  | 'HTTPINCOMINGMESSAGE'
  | 'HTTPCLIENTREQUEST'
  | 'GETADDRINFOREQWRAP'
  | 'QueryWrap'
  | 'CUSTOM';

export type LifecycleEvent = 'init' | 'before' | 'after' | 'destroy' | 'promiseResolve';

export interface RequestContext {
  traceId: string;
  requestId: string;
  url?: string;
  method?: string;
  spanName?: string;
  userId?: string;
  tags?: Record<string, string>;
}

export interface AsyncEvent {
  asyncId: number;
  triggerAsyncId: number;
  type: LifecycleEvent;
  resourceType: ResourceType;
  timestamp: number;            // performance.now() — high-res
  executionAsyncId: number;
  context?: RequestContext;
}

export interface TraceSession {
  id: string;
  traceId: string;
  startTime: number;
  endTime?: number;
  metadata?: Record<string, unknown>;
}

export interface AsyncResource {
  id?: number;
  sessionId: string;
  asyncId: number;
  triggerAsyncId: number;
  resourceType: ResourceType;
  startTime: number;
  endTime?: number;
  executionContext?: RequestContext;
}

export interface ExecutionEdge {
  sessionId: string;
  parentAsyncId: number;
  childAsyncId: number;
  edgeType: 'spawn' | 'resolve' | 'reject' | 'callback';
}

export interface SharedAccess {
  id?: number;
  sessionId: string;
  resourceId: string;
  accessType: 'read' | 'write';
  asyncId: number;
  timestamp: number;
  stackSnippet?: string;
}

// Graph representation (in-memory, for analysis)
export interface GraphNode {
  asyncId: number;
  resourceType: ResourceType;
  duration?: number;            // endTime - startTime
  startTime: number;
  depth: number;                // BFS depth from root
  isOnCriticalPath: boolean;
  concurrentPeers: number;      // how many others overlap this node
  children: number[];           // child asyncIds
}

export interface ExecutionGraph {
  nodes: Map<number, GraphNode>;
  roots: number[];              // asyncIds with no parent in session
  criticalPath: number[];       // ordered asyncIds
  maxDepth: number;
  totalDuration: number;
}

// API response shapes
export interface TraceListResponse {
  traces: TraceSession[];
  total: number;
}

export interface GraphResponse {
  graph: {
    nodes: GraphNode[];
    edges: ExecutionEdge[];
  };
  criticalPath: number[];
  orphans: number[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    maxDepth: number;
    totalDuration: number;
  };
}

export interface TimelineEntry {
  asyncId: number;
  resourceType: ResourceType;
  startTime: number;
  duration: number;
  lane: number;                 // for stacked timeline rows
  isOnCriticalPath: boolean;
}

export interface ConcurrencyWindow {
  id?: number;
  sessionId: string;
  startTime: number;
  endTime: number;
  overlapCount: number;
  resourceIds: number[];
}

export interface MetricsResponse {
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  totalResources: number;
  maxConcurrency: number;
  criticalPathDuration: number;
  longestAsyncChain: number;
  eventLoopLag: number;
  pressureScore: number;        // 0–100
}

// WebSocket message envelope
export interface WsMessage<T = unknown> {
  type: 'async_event' | 'session_start' | 'session_end' | 'metrics_update';
  payload: T;
  timestamp: number;
}
