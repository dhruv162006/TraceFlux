import { AsyncEvent } from './types.js';
import { runWithInternalGuard } from './guard.js';

export interface EmitterConfig {
  endpoint: string;
  flushIntervalMs?: number;
}

export class AsyncEventEmitter {
  private pending: AsyncEvent[] = [];
  private endpoint: string;
  private intervalId: NodeJS.Timeout | null = null;
  private flushIntervalMs: number;
  private isFlushing = false;

  constructor(config: EmitterConfig) {
    this.endpoint = config.endpoint;
    this.flushIntervalMs = config.flushIntervalMs ?? 50;
  }

  public start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);

    // DECISION: Unref'd flush timer:
    // Calling timer.unref() allows the Node.js process to exit naturally even if the setInterval loop
    // is active. This avoids hanging the main application process and simplifies test suites.
    if (this.intervalId.unref) {
      this.intervalId.unref();
    }
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.flushSync();
  }

  public emit(event: AsyncEvent): void {
    this.pending.push(event);
  }

  public getPendingCount(): number {
    return this.pending.length;
  }

  private flush(): void {
    if (this.pending.length === 0 || this.isFlushing) return;

    this.isFlushing = true;
    const batch = [...this.pending];
    this.pending = [];

    let fetchPromise: Promise<Response>;
    try {
      fetchPromise = runWithInternalGuard(() => {
        return fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch),
        });
      });
    } catch (syncError) {
      console.error('[TraceFlux Emitter] Synchronous error initiating fetch:', syncError);
      this.isFlushing = false;
      return;
    }

    fetchPromise
      .then((response) => {
        if (!response.ok) {
          console.error(`[TraceFlux Emitter] Failed to send trace events: ${response.statusText}`);
        }
      })
      .catch((error) => {
        console.error('[TraceFlux Emitter] Connection error sending trace events:', error);
      })
      .finally(() => {
        this.isFlushing = false;
      });
  }

  private flushSync(): void {
    if (this.pending.length === 0) return;
    const batch = [...this.pending];
    this.pending = [];

    // Fire-and-forget fetch with keepalive during stop/exit phase under internal guard
    try {
      runWithInternalGuard(() => {
        fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch),
          // @ts-ignore
          keepalive: true,
        }).catch(() => {
          // Suppress network errors on teardown
        });
      });
    } catch {
      // Suppress synchronous initiation errors on teardown
    }
  }
}
