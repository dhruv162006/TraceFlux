import { create } from 'zustand';
import { AsyncEvent } from '../types/index.js';

export interface LiveSessionState {
  id: string;
  traceId: string;
  startTime: number;
  endTime?: number;
  events: AsyncEvent[];
  seenEventKeys: Set<string>;
  latestEvent: AsyncEvent | null;
}

export interface LiveSessionSummary {
  id: string;
  startTime: number;
  eventCount: number;
}

interface AppState {
  // Recorded trace state
  selectedTraceId: string | null;
  setSelectedTraceId: (id: string | null) => void;

  // Live streaming state
  isLiveMode: boolean;
  setLiveMode: (live: boolean) => void;
  liveSessionId: string | null;
  setLiveSessionId: (id: string | null) => void;
  isWsConnected: boolean;
  setIsWsConnected: (connected: boolean) => void;

  liveSessions: Record<string, LiveSessionState>;
  liveSessionsList: LiveSessionSummary[];

  // Live actions
  handleSessionStart: (payload: { id: string; traceId?: string; startTime: number }) => void;
  handleAsyncEvents: (events: AsyncEvent[]) => void;
  clearLiveSessions: () => void;
}

const MAX_EVENTS_PER_SESSION = 2000;
const MAX_LIVE_SESSIONS = 10;

export const useAppStore = create<AppState>((set) => ({
  selectedTraceId: null,
  setSelectedTraceId: (id) => set({ selectedTraceId: id }),

  isLiveMode: false,
  setLiveMode: (live) => {
    set((state) => {
      // When turning Live Mode ON, default to the latest live session if available
      let liveSessionId = state.liveSessionId;
      if (live && !liveSessionId && state.liveSessionsList.length > 0) {
        liveSessionId = state.liveSessionsList[0].id;
      }
      return { isLiveMode: live, liveSessionId };
    });
  },

  liveSessionId: null,
  setLiveSessionId: (id) => set({ liveSessionId: id }),

  isWsConnected: false,
  setIsWsConnected: (connected) => set({ isWsConnected: connected }),

  liveSessions: {},
  liveSessionsList: [],

  handleSessionStart: ({ id, traceId, startTime }) => {
    set((state) => {
      const existing = state.liveSessions[id];
      const newSession: LiveSessionState = {
        id,
        traceId: traceId ?? id,
        startTime,
        endTime: undefined,
        events: existing ? existing.events : [],
        seenEventKeys: existing ? existing.seenEventKeys : new Set<string>(),
        latestEvent: existing ? existing.latestEvent : null,
      };

      const updatedSessions = {
        ...state.liveSessions,
        [id]: newSession,
      };

      // Recompute summary list
      const summaryList: LiveSessionSummary[] = Object.values(updatedSessions)
        .map((s) => ({
          id: s.id,
          startTime: s.startTime,
          eventCount: s.events.length,
        }))
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, MAX_LIVE_SESSIONS);

      // Auto-follow newest live session if in live mode
      const liveSessionId = state.isLiveMode ? id : state.liveSessionId ?? id;

      return {
        liveSessions: updatedSessions,
        liveSessionsList: summaryList,
        liveSessionId,
      };
    });
  },

  handleAsyncEvents: (newEvents) => {
    if (newEvents.length === 0) return;

    set((state) => {
      const updatedSessions = { ...state.liveSessions };
      let lastActiveSessionId: string | null = null;

      for (const event of newEvents) {
        // Isolate events strictly to their context traceId or fallback to 'global'
        const sessionId = event.context?.traceId || 'global';
        lastActiveSessionId = sessionId;

        let session = updatedSessions[sessionId];
        if (!session) {
          session = {
            id: sessionId,
            traceId: sessionId,
            startTime: event.timestamp,
            events: [],
            seenEventKeys: new Set<string>(),
            latestEvent: null,
          };
          updatedSessions[sessionId] = session;
        }

        // Deduplication: Avoid processing identical duplicate events
        const eventKey = `${sessionId}:${event.asyncId}:${event.type}:${event.timestamp}:${event.executionAsyncId}`;
        if (session.seenEventKeys.has(eventKey)) {
          continue;
        }
        session.seenEventKeys.add(eventKey);

        // Append event with bounded memory safety
        session.events = [...session.events, event];
        if (session.events.length > MAX_EVENTS_PER_SESSION) {
          session.events.shift(); // Evict oldest event when session exceeds 2000 events
        }
        session.latestEvent = event;
      }

      // Recompute summaries
      const summaryList: LiveSessionSummary[] = Object.values(updatedSessions)
        .map((s) => ({
          id: s.id,
          startTime: s.startTime,
          eventCount: s.events.length,
        }))
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, MAX_LIVE_SESSIONS);

      // If in live mode and no session was selected, follow the incoming session
      const liveSessionId =
        state.isLiveMode && !state.liveSessionId ? lastActiveSessionId : state.liveSessionId;

      return {
        liveSessions: updatedSessions,
        liveSessionsList: summaryList,
        liveSessionId,
      };
    });
  },

  clearLiveSessions: () =>
    set({
      liveSessions: {},
      liveSessionsList: [],
      liveSessionId: null,
    }),
}));
