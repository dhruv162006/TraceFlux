// DECISION: event-loop pressure scoring
// We implement a pure analyzer function to determine the event loop pressure score (0–100).
// Lag (50%) - >50ms lag implies extreme queue blocking, mapping to full contribution.
// Active Handles (25%) - >200 open system handles (TCP, timers, files) is heavy load.
// Pending Promises (25%) - >1000 unfinished queue tasks indicates high microtask queue pressure.
export function computeEventLoopPressure(
  avgLagMs: number,
  activeHandles: number,
  pendingPromises: number
): number {
  const lagScore = Math.min(50, (avgLagMs / 50) * 50);
  const handleScore = Math.min(25, (activeHandles / 200) * 25);
  const promiseScore = Math.min(25, (pendingPromises / 1000) * 25);
  
  return Math.round(lagScore + handleScore + promiseScore);
}
