import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { AsyncEvent } from '../../types/index.js';

export interface ReplayControlsProps {
  currentStep: number;
  totalSteps: number;
  currentEvent: AsyncEvent | null;
  isPlaying: boolean;
  isLoading?: boolean;
  play: () => void;
  pause: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  jumpTo: (step: number) => void;
  reset: () => void;
  speed: number;
  setSpeed: (speed: number) => void;
  sessionStartTime?: number;
}

export function ReplayControls({
  currentStep,
  totalSteps,
  currentEvent,
  isPlaying,
  isLoading = false,
  play,
  pause,
  stepForward,
  stepBackward,
  jumpTo,
  reset,
  speed,
  setSpeed,
  sessionStartTime,
}: ReplayControlsProps) {
  const hasEvents = totalSteps > 0;
  const isAtEnd = hasEvents && currentStep >= totalSteps - 1;

  // Format relative timestamp from session start
  const formattedTimestamp = currentEvent
    ? sessionStartTime
      ? `+${Math.max(0, currentEvent.timestamp - sessionStartTime)}ms`
      : `${currentEvent.timestamp}ms`
    : '-';

  return (
    <div className="glass-panel p-4 bg-bg-surface border border-border/60 rounded-xl space-y-4">
      {/* Top Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Playback Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Play / Pause Toggle */}
          <button
            onClick={isPlaying ? pause : play}
            disabled={!hasEvents}
            title={isPlaying ? 'Pause Replay' : isAtEnd ? 'Replay from Start' : 'Play Replay'}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent-blue hover:bg-accent-blue/80 text-white rounded-lg text-xs font-semibold shadow transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-white" />}
            <span>{isPlaying ? 'Pause' : isAtEnd ? 'Restart' : 'Play'}</span>
          </button>

          {/* Step Backward */}
          <button
            onClick={stepBackward}
            disabled={!hasEvents || currentStep === 0 || isPlaying}
            title="Step Backward (Previous Event)"
            className="p-1.5 bg-bg-elevated hover:bg-bg-hover text-text-secondary hover:text-text-primary border border-border rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <SkipBack className="h-4 w-4" />
          </button>

          {/* Step Forward */}
          <button
            onClick={stepForward}
            disabled={!hasEvents || isAtEnd || isPlaying}
            title="Step Forward (Next Event)"
            className="p-1.5 bg-bg-elevated hover:bg-bg-hover text-text-secondary hover:text-text-primary border border-border rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <SkipForward className="h-4 w-4" />
          </button>

          {/* Reset */}
          <button
            onClick={reset}
            disabled={!hasEvents || (currentStep === 0 && !isPlaying)}
            title="Reset to Step 0"
            className="p-1.5 bg-bg-elevated hover:bg-bg-hover text-text-secondary hover:text-text-primary border border-border rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {/* Scrubber Slider & Event Position */}
        <div className="flex-1 max-w-md flex items-center gap-3">
          <span className="text-xs font-mono text-text-muted whitespace-nowrap min-w-[90px]">
            Event {hasEvents ? currentStep + 1 : 0} / {totalSteps}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0, totalSteps - 1)}
            value={currentStep}
            onChange={(e) => jumpTo(Number(e.target.value))}
            disabled={!hasEvents || totalSteps <= 1}
            className="flex-1 h-1.5 bg-bg-elevated rounded-lg appearance-none cursor-pointer accent-accent-blue"
          />
        </div>

        {/* Speed Selector Buttons */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted">Speed:</span>
          {[0.5, 1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2.5 py-1 text-xs rounded font-mono transition-colors ${
                speed === s
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/50 font-bold'
                  : 'bg-bg-elevated text-text-muted hover:text-text-secondary border border-border'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Replay Event Details Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-2 border-t border-border/40 text-xs">
        <div className="bg-bg-elevated/70 px-2.5 py-1.5 rounded border border-border/30">
          <span className="text-[10px] text-text-muted block uppercase tracking-wider">Event Type</span>
          <span className="font-mono font-semibold text-accent-blue">
            {currentEvent?.type ?? (isLoading ? 'Loading...' : 'None')}
          </span>
        </div>

        <div className="bg-bg-elevated/70 px-2.5 py-1.5 rounded border border-border/30">
          <span className="text-[10px] text-text-muted block uppercase tracking-wider">Resource</span>
          <span className="font-mono font-semibold text-accent-teal">
            {currentEvent?.resourceType ?? '-'}
          </span>
        </div>

        <div className="bg-bg-elevated/70 px-2.5 py-1.5 rounded border border-border/30">
          <span className="text-[10px] text-text-muted block uppercase tracking-wider">Async ID</span>
          <span className="font-mono font-semibold text-text-primary">
            {currentEvent ? `#${currentEvent.asyncId}` : '-'}
          </span>
        </div>

        <div className="bg-bg-elevated/70 px-2.5 py-1.5 rounded border border-border/30">
          <span className="text-[10px] text-text-muted block uppercase tracking-wider">Trigger ID</span>
          <span className="font-mono font-semibold text-text-secondary">
            {currentEvent ? `#${currentEvent.triggerAsyncId}` : '-'}
          </span>
        </div>

        <div className="bg-bg-elevated/70 px-2.5 py-1.5 rounded border border-border/30">
          <span className="text-[10px] text-text-muted block uppercase tracking-wider">Exec Async ID</span>
          <span className="font-mono font-semibold text-text-secondary">
            {currentEvent ? `#${currentEvent.executionAsyncId}` : '-'}
          </span>
        </div>

        <div className="bg-bg-elevated/70 px-2.5 py-1.5 rounded border border-border/30">
          <span className="text-[10px] text-text-muted block uppercase tracking-wider">Relative Time</span>
          <span className="font-mono font-semibold text-text-primary">
            {formattedTimestamp}
          </span>
        </div>
      </div>
    </div>
  );
}
