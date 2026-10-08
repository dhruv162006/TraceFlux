import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTraceReplay } from './useTraceData.js';
import { api } from '../lib/api.js';
import { AsyncEvent } from '../types/index.js';

export interface ReplayState {
  currentStep: number;
  isPlaying: boolean;
  speed: number;
  totalSteps: number;
}

export type ReplayAction =
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'STEP_FORWARD' }
  | { type: 'STEP_BACKWARD' }
  | { type: 'JUMP_TO'; step: number }
  | { type: 'RESET' }
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'SET_TOTAL_STEPS'; totalSteps: number }
  | { type: 'TICK' };

/**
 * Pure state reducer governing replay state transitions.
 * Facilitates deterministic unit testing of stepping, looping, and bounds clamping.
 */
export function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.type) {
    case 'PLAY': {
      if (state.totalSteps <= 0) return { ...state, isPlaying: false };
      // If currently at the end of the trace, restart from the beginning
      const currentStep = state.currentStep >= state.totalSteps - 1 ? 0 : state.currentStep;
      return { ...state, isPlaying: true, currentStep };
    }

    case 'PAUSE':
      return { ...state, isPlaying: false };

    case 'STEP_FORWARD': {
      const maxStep = Math.max(0, state.totalSteps - 1);
      return { ...state, currentStep: Math.min(maxStep, state.currentStep + 1) };
    }

    case 'STEP_BACKWARD':
      return { ...state, currentStep: Math.max(0, state.currentStep - 1) };

    case 'JUMP_TO': {
      const maxStep = Math.max(0, state.totalSteps - 1);
      return { ...state, currentStep: Math.max(0, Math.min(maxStep, action.step)) };
    }

    case 'RESET':
      return { ...state, isPlaying: false, currentStep: 0 };

    case 'SET_SPEED':
      return { ...state, speed: action.speed };

    case 'SET_TOTAL_STEPS': {
      const maxStep = Math.max(0, action.totalSteps - 1);
      return {
        ...state,
        totalSteps: action.totalSteps,
        currentStep: Math.min(state.currentStep, maxStep),
      };
    }

    case 'TICK': {
      if (!state.isPlaying || state.totalSteps <= 0) return state;
      if (state.currentStep >= state.totalSteps - 1) {
        // End of trace reached during auto-playback: stop playing
        return { ...state, isPlaying: false };
      }
      return { ...state, currentStep: state.currentStep + 1 };
    }

    default:
      return state;
  }
}

/**
 * Extracts normalized active identifiers and lifecycle metrics from an AsyncEvent.
 */
export function getActiveResourceMapping(event: AsyncEvent | null) {
  if (!event) {
    return {
      activeAsyncId: null,
      triggerAsyncId: null,
      executionAsyncId: null,
      resourceType: null,
      eventType: null,
      timestamp: null,
    };
  }
  return {
    activeAsyncId: event.asyncId,
    triggerAsyncId: event.triggerAsyncId,
    executionAsyncId: event.executionAsyncId,
    resourceType: event.resourceType,
    eventType: event.type,
    timestamp: event.timestamp,
  };
}

export function useReplay(sessionId: string | null) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1); // 0.5x | 1x | 2x | 4x
  const queryClient = useQueryClient();

  // Fetch replay details for currentStep
  const { data, isLoading } = useTraceReplay(sessionId, currentStep);

  const totalSteps = data?.totalEvents ?? 0;
  const currentEvent = data?.event ?? null;

  // Prefetch adjacent upcoming steps for instant, lag-free playback
  useEffect(() => {
    if (!sessionId || totalSteps === 0) return;

    if (currentStep + 1 < totalSteps) {
      queryClient.prefetchQuery({
        queryKey: ['traceReplay', sessionId, currentStep + 1],
        queryFn: () => api.traces.replay(sessionId, currentStep + 1),
      });
    }
  }, [sessionId, currentStep, totalSteps, queryClient]);

  // Auto-stepping playback loop
  useEffect(() => {
    if (!isPlaying || !sessionId || totalSteps === 0) return;

    if (currentStep >= totalSteps - 1) {
      setIsPlaying(false);
      return;
    }

    const stepIntervalMs = Math.max(50, 1000 / speed);

    const intervalId = setInterval(() => {
      setCurrentStep((prev) => {
        const nextState = replayReducer(
          { currentStep: prev, isPlaying: true, speed, totalSteps },
          { type: 'TICK' }
        );
        if (!nextState.isPlaying) {
          setIsPlaying(false);
        }
        return nextState.currentStep;
      });
    }, stepIntervalMs);

    return () => clearInterval(intervalId);
  }, [isPlaying, speed, currentStep, totalSteps, sessionId]);

  // Restart replay if session changes
  useEffect(() => {
    setCurrentStep(0);
    setIsPlaying(false);
  }, [sessionId]);

  const play = () => {
    if (totalSteps > 0 && currentStep >= totalSteps - 1) {
      setCurrentStep(0);
    }
    setIsPlaying(true);
  };

  const pause = () => setIsPlaying(false);

  const stepForward = () => {
    setCurrentStep((prev) =>
      replayReducer(
        { currentStep: prev, isPlaying, speed, totalSteps },
        { type: 'STEP_FORWARD' }
      ).currentStep
    );
  };

  const stepBackward = () => {
    setCurrentStep((prev) =>
      replayReducer(
        { currentStep: prev, isPlaying, speed, totalSteps },
        { type: 'STEP_BACKWARD' }
      ).currentStep
    );
  };

  const jumpTo = (step: number) => {
    setCurrentStep(
      replayReducer(
        { currentStep, isPlaying, speed, totalSteps },
        { type: 'JUMP_TO', step }
      ).currentStep
    );
  };

  const reset = () => {
    setIsPlaying(false);
    setCurrentStep(0);
  };

  const activeMapping = getActiveResourceMapping(currentEvent);

  return {
    currentStep,
    totalSteps,
    currentEvent,
    isPlaying,
    isLoading,
    play,
    pause,
    stepForward,
    stepBackward,
    jumpTo,
    reset,
    speed,
    setSpeed,
    activeAsyncId: activeMapping.activeAsyncId,
    activeMapping,
  };
}
