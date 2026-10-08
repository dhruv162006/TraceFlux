import { useAppStore } from '../store/useAppStore.js';
import { useTrace, useTraceTimeline, useTraceGraph } from '../hooks/useTraceData.js';
import { useReplay } from '../hooks/useReplay.js';
import { useLiveTraceData } from '../hooks/useLiveTrace.js';
import { ReplayControls } from '../components/replay/ReplayControls.js';
import { Timeline } from '../components/visualizations/Timeline.js';
import { ExecutionGraph } from '../components/visualizations/ExecutionGraph.js';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.js';
import { Radio } from 'lucide-react';

export function TraceReplay() {
  const { selectedTraceId, isLiveMode, liveSessionId } = useAppStore();

  // Recorded Mode hooks
  const { data: session, isLoading: isSessionLoading } = useTrace(isLiveMode ? null : selectedTraceId);
  const { data: timelineData, isLoading: isTimelineLoading } = useTraceTimeline(isLiveMode ? null : selectedTraceId);
  const { data: graphData, isLoading: isGraphLoading } = useTraceGraph(isLiveMode ? null : selectedTraceId);
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
            Live execution events are streaming over WebSocket. Trigger a request on the demo application to watch Timeline and Execution DAG evolve in real time.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2.5">
              <span>Trace Live Stream</span>
              <span className="text-xs px-2 py-0.5 rounded bg-accent-teal/15 text-accent-teal font-mono border border-accent-teal/30">
                LIVE
              </span>
            </h1>
            <p className="text-xs text-text-secondary font-mono">
              Session: {liveSessionId} &bull; Total Events: {liveTrace.totalEvents} &bull; Active Async ID: #{liveTrace.activeAsyncId ?? 'none'}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <Timeline
            entries={liveTrace.timelineEntries}
            sessionStart={liveTrace.sessionStart}
            sessionEnd={liveTrace.sessionEnd}
            activeAsyncId={liveTrace.activeAsyncId}
            activeEvent={liveTrace.activeEvent}
          />

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
      </div>
    );
  }

  // --- RECORDED MODE ---
  if (!selectedTraceId) {
    return (
      <div className="text-center py-20 text-sm text-text-secondary">
        Please select a trace session from the top bar to replay execution traces.
      </div>
    );
  }

  if (isSessionLoading || isTimelineLoading || isGraphLoading) {
    return <LoadingSpinner />;
  }

  const entries = timelineData?.entries ?? [];
  const start = session?.startTime ?? 0;
  const end = session?.endTime ?? (start + 100);

  return (
    <div className="space-y-6">
      {/* Page Title & Trace Information */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Trace Execution Replay
          </h1>
          <p className="text-xs text-text-secondary font-mono">
            Session ID: {selectedTraceId} &bull; Total Resources: {entries.length} &bull; Total Replay Events: {replay.totalSteps}
          </p>
        </div>
      </div>

      {/* Interactive Replay Controls Strip */}
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
        sessionStartTime={start}
      />

      {/* Visualizers Synchronized to Replay Position */}
      <div className="space-y-6">
        <Timeline
          entries={entries}
          sessionStart={start}
          sessionEnd={end}
          activeAsyncId={replay.activeAsyncId}
          activeEvent={replay.currentEvent}
        />

        {graphData && (
          <div className="w-full flex justify-center">
            <ExecutionGraph
              graphData={graphData}
              activeAsyncId={replay.activeAsyncId}
              activeEvent={replay.currentEvent}
              width={900}
              height={550}
            />
          </div>
        )}
      </div>
    </div>
  );
}
