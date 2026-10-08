import { describe, it, expect } from 'vitest';
import { replayReducer, getActiveResourceMapping, ReplayState } from './useReplay.js';
import { AsyncEvent } from '../types/index.js';

describe('TraceFlux Replay State Machine & Mapping', () => {
  const initialState: ReplayState = {
    currentStep: 0,
    isPlaying: false,
    speed: 1,
    totalSteps: 10,
  };

  it('should transition play and pause correctly', () => {
    // 1. Play
    const playingState = replayReducer(initialState, { type: 'PLAY' });
    expect(playingState.isPlaying).toBe(true);

    // 2. Pause
    const pausedState = replayReducer(playingState, { type: 'PAUSE' });
    expect(pausedState.isPlaying).toBe(false);
  });

  it('should step forward within bounds', () => {
    let state = initialState;
    state = replayReducer(state, { type: 'STEP_FORWARD' });
    expect(state.currentStep).toBe(1);

    // Jump to near end
    state = { ...state, currentStep: 9 };
    // Stepping forward at end (step 9 with total 10) must clamp at 9
    state = replayReducer(state, { type: 'STEP_FORWARD' });
    expect(state.currentStep).toBe(9);
  });

  it('should step backward within bounds', () => {
    let state = { ...initialState, currentStep: 3 };
    state = replayReducer(state, { type: 'STEP_BACKWARD' });
    expect(state.currentStep).toBe(2);

    state = { ...state, currentStep: 0 };
    // Stepping backward at start must not become negative
    state = replayReducer(state, { type: 'STEP_BACKWARD' });
    expect(state.currentStep).toBe(0);
  });

  it('should clamp jumpTo within [0, totalSteps - 1]', () => {
    let state = replayReducer(initialState, { type: 'JUMP_TO', step: 5 });
    expect(state.currentStep).toBe(5);

    // Negative step
    state = replayReducer(state, { type: 'JUMP_TO', step: -4 });
    expect(state.currentStep).toBe(0);

    // Exceeding totalSteps
    state = replayReducer(state, { type: 'JUMP_TO', step: 100 });
    expect(state.currentStep).toBe(9);
  });

  it('should reset position to 0 and halt playback', () => {
    const activeState: ReplayState = {
      currentStep: 7,
      isPlaying: true,
      speed: 2,
      totalSteps: 10,
    };

    const resetState = replayReducer(activeState, { type: 'RESET' });
    expect(resetState.currentStep).toBe(0);
    expect(resetState.isPlaying).toBe(false);
  });

  it('should handle end-of-trace behavior on tick and restart on play', () => {
    // 1. Tick before end
    const midState: ReplayState = {
      currentStep: 8,
      isPlaying: true,
      speed: 1,
      totalSteps: 10,
    };
    const nextTick = replayReducer(midState, { type: 'TICK' });
    expect(nextTick.currentStep).toBe(9);
    expect(nextTick.isPlaying).toBe(true);

    // 2. Tick at end must halt playback
    const finalTick = replayReducer(nextTick, { type: 'TICK' });
    expect(finalTick.currentStep).toBe(9);
    expect(finalTick.isPlaying).toBe(false);

    // 3. Pressing PLAY at end of trace must loop back to step 0
    const replayRestart = replayReducer(finalTick, { type: 'PLAY' });
    expect(replayRestart.currentStep).toBe(0);
    expect(replayRestart.isPlaying).toBe(true);
  });

  it('should correctly map AsyncEvent to active resource IDs and lifecycle types', () => {
    // Null event
    const nullMapping = getActiveResourceMapping(null);
    expect(nullMapping.activeAsyncId).toBeNull();
    expect(nullMapping.resourceType).toBeNull();

    // Valid AsyncEvent
    const sampleEvent: AsyncEvent = {
      asyncId: 402,
      triggerAsyncId: 101,
      executionAsyncId: 101,
      type: 'promiseResolve',
      resourceType: 'PROMISE',
      timestamp: 17200000050,
      context: {
        traceId: 'session-xyz',
        requestId: 'req-abc',
      },
    };

    const mapping = getActiveResourceMapping(sampleEvent);
    expect(mapping.activeAsyncId).toBe(402);
    expect(mapping.triggerAsyncId).toBe(101);
    expect(mapping.executionAsyncId).toBe(101);
    expect(mapping.resourceType).toBe('PROMISE');
    expect(mapping.eventType).toBe('promiseResolve');
    expect(mapping.timestamp).toBe(17200000050);
  });
});
