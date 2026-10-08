import { useAppStore } from '../store/useAppStore.js';
import { useTraceGraph, useTrace } from '../hooks/useTraceData.js';
import { useReplay } from '../hooks/useReplay.js';
import { useLiveTraceData } from '../hooks/useLiveTrace.js';
import { ReplayControls } from '../components/replay/ReplayControls.js';
import { ExecutionGraph } from '../components/visualizations/ExecutionGraph.js';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.js';
import { Radio } from 'lucide-react';

export function ResourceGraph() {
  const { selectedTraceId, isLiveMode, liveSessionId } = useAppStore();

  // Recorded Mode hooks
  const { data: session } = useTrace(isLiveMode ? null : selectedTraceId);
  const { data: graphData, isLoading } = useTraceGraph(isLiveMode ? null : selectedTraceId);
  const replay = useReplay(isLiveMode ? null : selectedTraceId);

  // Live Mode hook
  const liveTrace = useLiveTraceData(isLiveMode ? liveSessionId : null);

  if (isLiveMode) {
    if (!liveSessionId || liveTrace.totalEvents === 0) {
      return (
        <div className="text-center py-20 space-y-3">
          <div className="flex items-center justify-center gap-2 text-accent-teal font-mono text-sm">
            <Radio className="h-4 w-4 animate-pulse" />
            <span>Live Stream Mode Active</span>
          </div>
          <p className="text-xs text-text-secondary max-w-md mx-auto">
            Waiting for live execution graph events. Newly initialized async resources will appear as nodes in real time.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Live Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2.5">
              <span>Resource Dependency Graph</span>
              <span className="text-xs px-2 py-0.5 rounded bg-accent-teal/15 text-accent-teal font-mono border border-accent-teal/30">
                LIVE STREAM
              </span>
            </h1>
            <p className="text-xs text-text-secondary font-mono">
              Live Session: {liveSessionId} &bull; Nodes: {liveTrace.graphData?.stats.nodeCount ?? 0} &bull; Causal Edges: {liveTrace.graphData?.stats.edgeCount ?? 0} &bull; Active: #{liveTrace.activeAsyncId ?? 'none'}
            </p>
          </div>
        </div>

        {/* Live Graph Visualizer */}
        {liveTrace.graphData && (
          <div className="w-full flex justify-center">
            <ExecutionGraph
              graphData={liveTrace.graphData}
              activeAsyncId={liveTrace.activeAsyncId}
              activeEvent={liveTrace.activeEvent}
              width={900}
              height={550}
            />
          </div>
        )}
      </div>
    );
  }

  // --- RECORDED MODE ---
  if (!selectedTraceId) {
    return (
      <div className="text-center py-20 text-sm text-text-secondary">
        Please select a trace session from the top bar to inspect execution graphs.
      </div>
    );
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!graphData) {
    return (
      <div className="text-center py-20 text-sm text-text-secondary">
        No graph data available for session: {selectedTraceId}.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Recorded Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          Resource Dependency Graph
        </h1>
        <p className="text-xs text-text-secondary font-mono">
          Session ID: {selectedTraceId} &bull; Total Replay Events: {replay.totalSteps}
        </p>
      </div>

      {/* Replay Controls Strip */}
      <ReplayControls
        currentStep={replay.currentStep}
        totalSteps={replay.totalSteps}
        currentEvent={replay.currentEvent}
        isPlaying={replay.isPlaying}
        isLoading={replay.isLoading}
        play={replay.play}
        pause={replay.pause}
        stepForward={replay.stepForward}
        stepBackward={replay.stepBackward}
        jumpTo={replay.jumpTo}
        reset={replay.reset}
        speed={replay.speed}
        setSpeed={replay.setSpeed}
        sessionStartTime={session?.startTime}
      />

      {/* Graph Visual container */}
      <div className="w-full flex justify-center">
        <ExecutionGraph
          graphData={graphData}
          activeAsyncId={replay.activeAsyncId}
          activeEvent={replay.currentEvent}
          width={900}
          height={550}
        />
      </div>
    </div>
  );
}
