import { useAppStore } from '../store/useAppStore.js';
import { useTrace, useTraceConcurrency } from '../hooks/useTraceData.js';
import { Heatmap } from '../components/visualizations/Heatmap.js';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.js';
import { MetricCard } from '../components/ui/MetricCard.js';
import { Badge } from '../components/ui/Badge.js';
import { Layers, Activity, ShieldAlert } from 'lucide-react';

export function ConcurrencyInspector() {
  const { selectedTraceId } = useAppStore();
  const { data: session, isLoading: isSessionLoading } = useTrace(selectedTraceId);
  const { data: concurrencyData, isLoading: isConcurrencyLoading } = useTraceConcurrency(selectedTraceId);

  if (!selectedTraceId) {
    return (
      <div className="text-center py-20 text-sm text-text-secondary">
        Please select a trace session from the top bar to inspect concurrency.
      </div>
    );
  }

  if (isSessionLoading || isConcurrencyLoading) {
    return <LoadingSpinner />;
  }

  const windows = concurrencyData?.windows ?? [];
  const maxOverlap = concurrencyData?.maxOverlap ?? 0;
  const score = concurrencyData?.score ?? 0;

  const start = session?.startTime ?? 0;
  const end = session?.endTime ?? (start + 100);

  // Map resources used in sweep-line
  const sampleResources = windows.flatMap((w) =>
    w.resourceIds.map((id) => ({
      asyncId: id,
      triggerAsyncId: 0,
      resourceType: 'PROMISE' as any, // fallback for drawing
      startTime: w.startTime,
      endTime: w.endTime,
      sessionId: w.sessionId,
    }))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          Concurrency Inspector
        </h1>
        <p className="text-xs text-text-secondary font-mono">
          Session ID: {selectedTraceId}
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="Max Concurrency"
          value={`${maxOverlap} ops`}
          subtitle="Peak overlapping tasks"
          icon={Layers}
          colorClass="text-accent-teal"
        />
        <MetricCard
          title="Total Windows"
          value={windows.length}
          subtitle="Number of overlap intervals"
          icon={Activity}
          colorClass="text-accent-blue"
        />
        <MetricCard
          title="Concurrency Score"
          value={`${score}/100`}
          subtitle="Task queue density index"
          icon={ShieldAlert}
          colorClass={score >= 70 ? 'text-accent-red' : score >= 40 ? 'text-accent-amber' : 'text-accent-green'}
        />
      </div>

      {/* Visual heatmap + windows list grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Heatmap Visual */}
        <div className="lg:col-span-2">
          <Heatmap
            resources={sampleResources}
            sessionStart={start}
            sessionEnd={end}
            width={600}
            height={320}
          />
        </div>

        {/* Windows list */}
        <div className="glass-panel p-6 bg-bg-surface border border-border/40 overflow-hidden">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-4">
            Overlap Windows ({windows.length})
          </span>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {windows.map((win, idx) => (
              <div
                key={idx}
                className="bg-bg-elevated p-3 rounded-lg border border-border/20 flex flex-col gap-2 hover:bg-bg-hover transition-colors"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="teal">
                    Overlap: {win.overlapCount}
                  </Badge>
                  <span className="text-[10px] text-text-muted">
                    {Math.round(win.endTime - win.startTime)}ms duration
                  </span>
                </div>
                <div className="text-[10px] text-text-secondary">
                  Ids: <span className="font-mono text-text-primary">{win.resourceIds.join(', ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
