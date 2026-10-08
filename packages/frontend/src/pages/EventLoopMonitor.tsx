import { useMetrics } from '../hooks/useTraceData.js';
import { EventLoopGauge } from '../components/visualizations/EventLoopGauge.js';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.js';

export function EventLoopMonitor() {
  const { data: metrics, isLoading } = useMetrics();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Get parameters or default to mock base for static preview
  const score = metrics?.pressureScore ?? 12;
  const lag = metrics?.eventLoopLag ?? 1.5;
  const activeHandles = metrics?.totalResources ?? 40;
  const pendingPromises = Math.round(activeHandles * 0.15); // simulate pending ratio

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          Event Loop Monitor
        </h1>
        <p className="text-xs text-text-secondary">
          Monitor the Node.js event loop lag and calculate real-time queue pressure scoring.
        </p>
      </div>

      {/* Gauge Visual */}
      <div className="max-w-md mx-auto">
        <EventLoopGauge
          score={score}
          lagMs={lag}
          activeHandles={activeHandles}
          pendingPromises={pendingPromises}
        />
      </div>
    </div>
  );
}
