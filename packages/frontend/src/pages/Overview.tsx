import { useMetrics, useTraces } from '../hooks/useTraceData.js';
import { useAppStore } from '../store/useAppStore.js';
import { MetricCard } from '../components/ui/MetricCard.js';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.js';
import { Cpu, Activity, AlertTriangle, Layers, Clock } from 'lucide-react';

export function Overview() {
  const { setSelectedTraceId, selectedTraceId } = useAppStore();
  const { data: metrics, isLoading: isMetricsLoading } = useMetrics();
  const { data: tracesData, isLoading: isTracesLoading } = useTraces();

  const traces = tracesData?.traces ?? [];
  const totalTraces = tracesData?.total ?? 0;

  if (isMetricsLoading || isTracesLoading) {
    return <LoadingSpinner />;
  }

  // Determine pressure status colors
  const pressureScore = metrics?.pressureScore ?? 0;
  let pressureColor = 'text-accent-green';
  let pressureText = 'Good';
  if (pressureScore >= 40 && pressureScore < 70) {
    pressureColor = 'text-accent-amber';
    pressureText = 'Moderate';
  } else if (pressureScore >= 70) {
    pressureColor = 'text-accent-red';
    pressureText = 'Critical';
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          Observability Overview
        </h1>
        <p className="text-xs text-text-secondary">
          Real-time asynchronous runtime event monitoring and performance diagnostics.
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Traces"
          value={totalTraces}
          subtitle="All recorded sessions"
          icon={Activity}
        />
        <MetricCard
          title="Average Latency"
          value={`${metrics?.avgLatency.toFixed(2) ?? '0'}ms`}
          subtitle="Across all resources"
          icon={Clock}
          colorClass="text-accent-blue"
        />
        <MetricCard
          title="P99 Latency"
          value={`${metrics?.p99Latency.toFixed(2) ?? '0'}ms`}
          subtitle="99th percentile spike"
          icon={AlertTriangle}
          colorClass="text-accent-purple"
        />
        <MetricCard
          title="Max Concurrency"
          value={`${metrics?.maxConcurrency ?? '0'} ops`}
          subtitle="Peak concurrent tasks"
          icon={Layers}
          colorClass="text-accent-teal"
        />
        <MetricCard
          title="Event Loop Pressure"
          value={`${pressureScore}/100`}
          subtitle={`Status: ${pressureText}`}
          icon={Cpu}
          colorClass={pressureColor}
        />
      </div>

      {/* Traces List Table */}
      <div className="glass-panel p-6 bg-bg-surface border border-border/40">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-4">
          Recent Trace Sessions
        </span>

        {traces.length === 0 ? (
          <div className="text-center py-12 text-sm text-text-muted">
            No trace sessions found. Start a client app to ingest traces.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-xs text-text-muted uppercase tracking-wider">
                  <th className="pb-3 font-semibold">Session ID</th>
                  <th className="pb-3 font-semibold">Trace ID</th>
                  <th className="pb-3 font-semibold">Start Time</th>
                  <th className="pb-3 font-semibold">End Time</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 text-sm text-text-secondary">
                {traces.map((trace) => {
                  const isSelected = selectedTraceId === trace.id;
                  return (
                    <tr
                      key={trace.id}
                      className={`hover:bg-bg-hover/40 transition-colors ${
                        isSelected ? 'bg-accent-blue/5' : ''
                      }`}
                    >
                      <td className="py-3.5 font-mono font-medium text-text-primary text-xs">
                        {trace.id}
                      </td>
                      <td className="py-3.5 font-mono text-xs">
                        {trace.traceId}
                      </td>
                      <td className="py-3.5">
                        {new Date(trace.startTime).toLocaleString()}
                      </td>
                      <td className="py-3.5">
                        {trace.endTime ? new Date(trace.endTime).toLocaleString() : 'Running'}
                      </td>
                      <td className="py-3.5 text-right">
                        <button
                          onClick={() => setSelectedTraceId(trace.id)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                            isSelected
                              ? 'bg-accent-blue text-bg-primary border-accent-blue'
                              : 'bg-bg-elevated hover:bg-bg-hover text-text-primary border-border'
                          }`}
                        >
                          {isSelected ? 'Inspecting' : 'Inspect'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
