import {
  TraceListResponse,
  TraceSession,
  GraphResponse,
  TimelineEntry,
  ConcurrencyWindow,
  AsyncEvent,
  MetricsResponse,
  RaceCandidate,
} from '../types/index.js';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function get<T>(url: string, params?: Record<string, any>): Promise<T> {
  const query = params
    ? '?' + new URLSearchParams(
        Object.entries(params)
          .filter(([_, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : '';

  const response = await fetch(`${BASE}${url}${query}`);
  if (!response.ok) {
    throw new Error(`API GET request failed on ${url}: ${response.statusText}`);
  }
  return response.json();
}

async function post<T>(url: string, body?: any): Promise<T> {
  const response = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API POST request failed on ${url}: ${response.statusText}`);
  }

  // Handle blob responses (such as exports)
  if (url.endsWith('/export')) {
    return response.blob() as any;
  }

  return response.json();
}

export const api = {
  traces: {
    list: (params?: { limit?: number; offset?: number; search?: string }) =>
      get<TraceListResponse>('/api/traces', params),
    get: (id: string) =>
      get<TraceSession & { resourceCount: number; duration: number }>(`/api/traces/${id}`),
    graph: (id: string) =>
      get<GraphResponse>(`/api/traces/${id}/graph`),
    timeline: (id: string, from?: number, to?: number) =>
      get<{ entries: TimelineEntry[]; totalLanes: number }>(`/api/traces/${id}/timeline`, { from, to }),
    concurrency: (id: string) =>
      get<{ windows: ConcurrencyWindow[]; maxOverlap: number; score: number }>(`/api/traces/${id}/concurrency`),
    replay: (id: string, step: number) =>
      get<{ event: AsyncEvent; totalEvents: number; currentStep: number }>(`/api/traces/${id}/replay`, { step }),
    export: (id: string) =>
      post<Blob>(`/api/traces/${id}/export`),
    races: (id: string) =>
      get<RaceCandidate[]>(`/api/traces/${id}/races`),
  },
  metrics: {
    get: () => get<MetricsResponse>('/api/metrics'),
  },
};
