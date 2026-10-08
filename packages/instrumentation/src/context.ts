import { AsyncLocalStorage } from 'node:async_hooks';
import { RequestContext } from './types.js';

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContext.run(ctx, fn);
}

export function getCurrentContext(): RequestContext | undefined {
  return requestContext.getStore();
}
