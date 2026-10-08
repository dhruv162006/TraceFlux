import { useAppStore } from '../store/useAppStore.js';
import { useTraceRaces } from '../hooks/useTraceData.js';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.js';
import { Badge } from '../components/ui/Badge.js';
import { AlertCircle, Terminal, HelpCircle } from 'lucide-react';
import { RaceCandidate } from '../types/index.js';

export function RaceConditionAnalyzer() {
  const { selectedTraceId } = useAppStore();
  const { data: candidates, isLoading } = useTraceRaces(selectedTraceId);

  if (!selectedTraceId) {
    return (
      <div className="text-center py-20 text-sm text-text-secondary">
        Please select a trace session from the top bar to inspect race conditions.
      </div>
    );
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const list = candidates ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          Shared Access Race Condition Analyzer
        </h1>
        <p className="text-xs text-text-secondary font-mono">
          Session ID: {selectedTraceId}
        </p>
      </div>

      {/* Explainer card */}
      <div className="bg-bg-surface border border-border/60 p-4 rounded-xl flex items-start gap-3.5 text-xs text-text-secondary max-w-3xl">
        <HelpCircle className="h-5 w-5 text-accent-blue shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-text-primary">How Race Detection Works</p>
          <p>
            TraceFlux monitors reads and writes to shared resource variables (files, counters, records)
            across different asynchronous execution contexts (`asyncId`). If two operations overlap within
            a <span className="text-text-primary font-semibold">100ms window</span>, and at least one is a write,
            it flags a potential conflict. Risk scores scale based on operation time proximity.
          </p>
        </div>
      </div>

      {/* Conflicts List */}
      <div className="glass-panel p-6 bg-bg-surface border border-border/40">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-5">
          Race Condition Candidates ({list.length})
        </span>

        {list.length === 0 ? (
          <div className="text-center py-12 text-sm text-text-muted flex flex-col items-center justify-center gap-2">
            <AlertCircle className="h-6 w-6 text-accent-green" />
            <span>No race condition candidates detected. All async resource operations are properly isolated.</span>
          </div>
        ) : (
          <div className="space-y-6">
            {list.map((candidate) => (
              <div
                key={candidate.resourceId}
                className="bg-bg-elevated rounded-xl border border-border/30 p-5 space-y-4 hover:border-border/60 transition-colors"
              >
                <div className="flex items-center justify-between border-b border-border/20 pb-3">
                  <span className="font-mono text-sm font-bold text-text-primary flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-text-muted" />
                    Resource ID: {candidate.resourceId}
                  </span>
                  <Badge variant="red">
                    {candidate.conflicts.length} conflict{candidate.conflicts.length > 1 ? 's' : ''}
                  </Badge>
                </div>

                {/* Sub list of conflicts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {candidate.conflicts.map((conflict: RaceCandidate['conflicts'][number], idx: number) => {
                    const isHighRisk = conflict.riskScore >= 70;
                    return (
                      <div
                        key={idx}
                        className="bg-bg-primary p-4 rounded-lg border border-border/10 space-y-3 flex flex-col justify-between"
                      >
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                              Conflict Type
                            </div>
                            <Badge variant={conflict.conflictType === 'write-write' ? 'red' : 'amber'}>
                              {conflict.conflictType}
                            </Badge>
                          </div>
                          <div className="text-right space-y-1">
                            <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                              Risk Score
                            </div>
                            <span className={`text-sm font-extrabold ${isHighRisk ? 'text-accent-red' : 'text-accent-amber'}`}>
                              {conflict.riskScore}/100
                            </span>
                          </div>
                        </div>

                        <div className="text-xs text-text-secondary space-y-1.5 pt-2 border-t border-border/10">
                          <div>
                            Context 1: <span className="font-mono text-text-primary">asyncId #{conflict.asyncId1}</span>
                          </div>
                          <div>
                            Context 2: <span className="font-mono text-text-primary">asyncId #{conflict.asyncId2}</span>
                          </div>
                          <div className="text-[10px] text-text-muted">
                            Access gap: {conflict.timeGap.toFixed(2)}ms
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
