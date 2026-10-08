import { useEffect, useState, useRef } from 'react';
import { WsMessage, AsyncEvent } from '../types/index.js';
import { useAppStore } from '../store/useAppStore.js';

export function useWebSocket(wsUrl?: string) {
  const url = wsUrl ?? `ws://${window.location.hostname}:3001`;

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const [latestEvents, setLatestEvents] = useState<AsyncEvent[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const eventsBufferRef = useRef<AsyncEvent[]>([]);

  // DECISION: Coalesced Micro-Batching for High-Throughput WebSockets:
  // Workloads in Node.js can generate 200–500 async events within a 10ms burst.
  // Dispatching a separate React state update for every single raw WebSocket packet causes
  // hundreds of unnecessary re-renders per second, starving the browser main thread and stalling D3.
  // We collect incoming events in a micro-queue and flush them to the Zustand store in 25ms coalescing
  // windows (approx. 40 FPS).
  // Latency Tradeoff: Introduces at most 25ms of display delay, which is imperceptible to human eyes
  // while maintaining smooth, non-blocking UI interactivity under heavy async load.
  const pendingEventsRef = useRef<AsyncEvent[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    function flushPendingEvents() {
      if (pendingEventsRef.current.length > 0) {
        const batch = pendingEventsRef.current;
        pendingEventsRef.current = [];
        useAppStore.getState().handleAsyncEvents(batch);
      }
      batchTimerRef.current = null;
    }

    function connect() {
      if (wsRef.current) {
        wsRef.current.close();
      }

      const socket = new WebSocket(url);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!active) return;
        setIsConnected(true);
        useAppStore.getState().setIsWsConnected(true);
        backoffRef.current = 1000;
      };

      socket.onmessage = (event) => {
        if (!active) return;
        try {
          const msg = JSON.parse(event.data) as WsMessage;
          setLastMessage(msg);

          if (msg.type === 'session_start') {
            flushPendingEvents();
            useAppStore.getState().handleSessionStart(msg.payload as any);
          } else if (msg.type === 'async_event') {
            const rawEvent = msg.payload as AsyncEvent;

            // Maintain local 500-item ring buffer for backwards compatibility
            const buffer = [...eventsBufferRef.current, rawEvent];
            if (buffer.length > 500) {
              buffer.shift();
            }
            eventsBufferRef.current = buffer;
            setLatestEvents(buffer);

            // Queue for coalesced live state dispatch
            pendingEventsRef.current.push(rawEvent);
            if (!batchTimerRef.current) {
              batchTimerRef.current = setTimeout(flushPendingEvents, 25);
            }
          }
        } catch (e) {
          console.error('[TraceFlux WS] Failed parsing message:', e);
        }
      };

      socket.onclose = () => {
        if (!active) return;
        flushPendingEvents();
        setIsConnected(false);
        useAppStore.getState().setIsWsConnected(false);
        wsRef.current = null;

        const delay = backoffRef.current;
        backoffRef.current = Math.min(8000, delay * 2);
        setTimeout(() => {
          if (active) connect();
        }, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      active = false;
      flushPendingEvents();
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url]);

  return {
    isConnected,
    lastMessage,
    latestEvents,
  };
}
