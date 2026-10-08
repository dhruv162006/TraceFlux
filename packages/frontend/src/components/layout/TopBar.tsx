import { useAppStore } from '../../store/useAppStore.js';
import { useTraces } from '../../hooks/useTraceData.js';
import { useWebSocket } from '../../hooks/useWebSocket.js';
import { Zap, ZapOff, Radio } from 'lucide-react';

export function TopBar() {
  const {
    selectedTraceId,
    setSelectedTraceId,
    isLiveMode,
    setLiveMode,
    liveSessionId,
    setLiveSessionId,
    liveSessionsList,
  } = useAppStore();

  const { data: tracesData } = useTraces();
  const { isConnected } = useWebSocket();

  const traces = tracesData?.traces ?? [];

  return (
    <header className="h-16 border-b border-border bg-bg-surface flex items-center justify-between px-6 z-40">
      {/* Selection Dropdown */}
      <div className="flex items-center gap-4">
        <label className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
          {isLiveMode ? (
            <>
              <Radio className="h-3.5 w-3.5 text-accent-teal animate-pulse" />
              Live Session
            </>
          ) : (
            'Active Trace'
          )}
        </label>

        {isLiveMode ? (
          <select
            value={liveSessionId ?? ''}
            onChange={(e) => setLiveSessionId(e.target.value || null)}
            className="bg-bg-elevated border border-accent-teal/40 rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-teal min-w-[240px]"
          >
            {liveSessionsList.length === 0 ? (
              <option value="">-- Waiting for Live Activity... --</option>
            ) : (
              liveSessionsList.map((session) => (
                <option key={session.id} value={session.id}>
                  [Live] {session.id.slice(0, 16)}... ({session.eventCount} ops)
                </option>
              ))
            )}
          </select>
        ) : (
          <select
            value={selectedTraceId ?? ''}
            onChange={(e) => setSelectedTraceId(e.target.value || null)}
            className="bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue min-w-[240px]"
          >
            <option value="">-- Select Historical Trace --</option>
            {traces.map((trace) => (
              <option key={trace.id} value={trace.id}>
                {trace.id.slice(0, 16)}... ({new Date(trace.startTime).toLocaleTimeString()})
              </option>
            ))}
          </select>
        )}

        {isLiveMode && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent-teal/15 text-accent-teal text-xs font-mono font-bold border border-accent-teal/30">
            <span className="h-2 w-2 rounded-full bg-accent-teal animate-ping" />
            LIVE
          </span>
        )}
      </div>

      {/* Mode Control and Status */}
      <div className="flex items-center gap-6">
        {/* Toggle Mode */}
        <button
          onClick={() => setLiveMode(!isLiveMode)}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
            isLiveMode
              ? 'bg-accent-teal/15 text-accent-teal border border-accent-teal/40 shadow-sm shadow-accent-teal/10'
              : 'bg-bg-hover text-text-secondary hover:text-text-primary border border-border'
          }`}
        >
          {isLiveMode ? (
            <>
              <Zap className="h-4 w-4 text-accent-teal animate-pulse" />
              Live Mode ON
            </>
          ) : (
            <>
              <ZapOff className="h-4 w-4" />
              Static Inspection
            </>
          )}
        </button>

        {/* WS Connection Indicator */}
        <div className="flex items-center gap-2 bg-bg-elevated border border-border rounded-lg px-3 py-1.5">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isConnected ? 'bg-accent-green animate-ping' : 'bg-text-muted'
            }`}
          />
          <span
            className={`h-2.5 w-2.5 rounded-full absolute ${
              isConnected ? 'bg-accent-green' : 'bg-text-muted'
            }`}
          />
          <span className="text-xs text-text-secondary font-medium ml-1">
            {isConnected ? 'WS Connected' : 'WS Disconnected'}
          </span>
        </div>
      </div>
    </header>
  );
}
