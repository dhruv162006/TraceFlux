import { useMetrics } from '../hooks/useTraceData.js';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.js';
import { MetricCard } from '../components/ui/MetricCard.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Clock, ShieldAlert, Cpu } from 'lucide-react';

export function PerformanceMetrics() {
  const { data: metrics, isLoading } = useMetrics();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Prepare chart datasets for latency comparison
  const latencyData = [
    { name: 'Avg Latency', value: metrics?.avgLatency ?? 0, fill: '#4f8ef7' },
    { name: 'P50 Latency', value: metrics?.p50Latency ?? 0, fill: '#4ade80' },
    { name: 'P95 Latency', value: metrics?.p95Latency ?? 0, fill: '#fbbf24' },
    { name: 'P99 Latency', value: metrics?.p99Latency ?? 0, fill: '#f87171' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          System Performance Metrics
        </h1>
        <p className="text-xs text-text-secondary">
          Detailed telemetry statistics covering percentiles, chain lengths, and scheduling pressure.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="Critical Path Duration"
          value={`${metrics?.criticalPathDuration.toFixed(2) ?? '0'}ms`}
          subtitle="Longest execution bottleneck"
          icon={Clock}
          colorClass="text-accent-purple"
        />
        <MetricCard
          title="Longest Async Chain"
          value={`${metrics?.longestAsyncChain ?? 0} links`}
          subtitle="Max graph BFS depth level"
          icon={ShieldAlert}
          colorClass="text-accent-amber"
        />
        <MetricCard
          title="Average Event Loop Lag"
          value={`${metrics?.eventLoopLag.toFixed(2) ?? '0'}ms`}
          subtitle="Process event tick delay"
          icon={Cpu}
          colorClass="text-accent-teal"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latency Percentiles Bar Chart */}
        <div className="glass-panel p-6 bg-bg-surface border border-border/40 flex flex-col min-h-[350px]">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-6">
            Latency Percentiles (ms)
          </span>

          <div className="flex-1 w-full min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latencyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1d24" />
                <XAxis dataKey="name" stroke="#8b91a1" style={{ fontSize: '11px' }} />
                <YAxis stroke="#8b91a1" style={{ fontSize: '11px' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1d24', borderColor: '#2a2f3a', borderRadius: '8px' }}
                  labelStyle={{ color: '#8b91a1', fontSize: '11px' }}
                  itemStyle={{ color: '#e8eaf0', fontSize: '12px' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Telemetry Summary parameters */}
        <div className="glass-panel p-6 bg-bg-surface border border-border/40 flex flex-col min-h-[350px] justify-between">
          <div>
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-4">
              Observability Summary Details
            </span>

            <div className="divide-y divide-border/20 text-xs">
              <div className="flex justify-between py-3">
                <span className="text-text-secondary">Total Instrumented Resources:</span>
                <span className="font-semibold text-text-primary font-mono">{metrics?.totalResources ?? 0}</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-text-secondary">Average Operation Latency:</span>
                <span className="font-semibold text-text-primary font-mono">{metrics?.avgLatency.toFixed(2) ?? 0}ms</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-text-secondary">Bottleneck Path Duration:</span>
                <span className="font-semibold text-text-primary font-mono">{metrics?.criticalPathDuration.toFixed(2) ?? 0}ms</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-text-secondary">Max Task Concurrency Count:</span>
                <span className="font-semibold text-text-primary font-mono">{metrics?.maxConcurrency ?? 0} ops</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-text-secondary">System Pressure Score:</span>
                <span className="font-semibold text-text-primary font-mono">{metrics?.pressureScore ?? 0}/100</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
