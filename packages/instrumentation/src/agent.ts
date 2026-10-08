import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { AgentConfig, RequestContext, ResourceType } from './types.js';
import { AsyncEventEmitter } from './emitter.js';
import { AsyncHooksAgent } from './hooks.js';
import { runWithContext } from './context.js';

function generateId(): string {
  // Generates a compact, unique 16-character alphanumeric ID
  return crypto.randomBytes(8).toString('hex');
}

export class TraceFluxAgent {
  private emitter: AsyncEventEmitter;
  private hooksAgent: AsyncHooksAgent;
  private enabled = false;
  private sampleRate: number;

  constructor(config: AgentConfig) {
    this.sampleRate = config.sampleRate ?? 1.0;
    
    this.emitter = new AsyncEventEmitter({
      endpoint: config.endpoint,
      flushIntervalMs: config.flushIntervalMs ?? 50,
    });

    this.hooksAgent = new AsyncHooksAgent(this.emitter, config.ignoreTypes);
  }

  public enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.emitter.start();
    this.hooksAgent.enable();
  }

  public disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.hooksAgent.disable();
    this.emitter.stop();
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public startRequest(ctx: Partial<RequestContext>): RequestContext {
    const traceId = ctx.traceId ?? generateId();
    const requestId = ctx.requestId ?? generateId();
    const isSampled = Math.random() < this.sampleRate;

    return {
      ...ctx,
      traceId,
      requestId,
      tags: {
        ...ctx.tags,
        sampled: isSampled ? 'true' : 'false',
      },
    };
  }

  public middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      // Generate request context, checking headers for trace context propagation
      const traceIdHeader = req.headers['x-trace-id'];
      const incomingTraceId = typeof traceIdHeader === 'string' ? traceIdHeader : undefined;
      
      const ctx = this.startRequest({
        traceId: incomingTraceId,
        url: req.url,
        method: req.method,
      });

      // If the agent is disabled, bypass storing context and hooks
      if (!this.enabled) {
        return next();
      }

      runWithContext(ctx, () => {
        next();
      });
    };
  }
}

// DECISION: Unref'd flush timer
// By using an unref'd timer in the event emitter, we ensure the agent does not prevent Node.js 
// from exiting naturally during unit tests or normal process termination, even if disable() is not called.
export function createAgent(config: AgentConfig) {
  const agent = new TraceFluxAgent(config);
  return {
    enable: () => agent.enable(),
    disable: () => agent.disable(),
    startRequest: (ctx: Partial<RequestContext>) => agent.startRequest(ctx),
    middleware: () => agent.middleware(),
  };
}
