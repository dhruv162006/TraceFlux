import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useTraces(params?: { limit?: number; offset?: number; search?: string }) {
  return useQuery({
    queryKey: ['traces', params],
    queryFn: () => api.traces.list(params),
    refetchInterval: 5000, // poll traces list every 5 seconds
  });
}

export function useTrace(id: string | null) {
  return useQuery({
    queryKey: ['trace', id],
    queryFn: () => api.traces.get(id!),
    enabled: !!id,
  });
}

export function useTraceGraph(id: string | null) {
  return useQuery({
    queryKey: ['traceGraph', id],
    queryFn: () => api.traces.graph(id!),
    enabled: !!id,
  });
}

export function useTraceTimeline(id: string | null, from?: number, to?: number) {
  return useQuery({
    queryKey: ['traceTimeline', id, from, to],
    queryFn: () => api.traces.timeline(id!, from, to),
    enabled: !!id,
  });
}

export function useTraceConcurrency(id: string | null) {
  return useQuery({
    queryKey: ['traceConcurrency', id],
    queryFn: () => api.traces.concurrency(id!),
    enabled: !!id,
  });
}

export function useTraceReplay(id: string | null, step: number) {
  return useQuery({
    queryKey: ['traceReplay', id, step],
    queryFn: () => api.traces.replay(id!, step),
    enabled: !!id,
    placeholderData: (previousData) => previousData,
  });
}

export function useMetrics() {
  return useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.metrics.get(),
    refetchInterval: 3000, // poll overview metrics every 3 seconds
  });
}

export function useTraceRaces(id: string | null) {
  return useQuery({
    queryKey: ['traceRaces', id],
    queryFn: () => api.traces.races(id!),
    enabled: !!id,
  });
}
