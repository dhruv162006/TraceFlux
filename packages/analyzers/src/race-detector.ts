import { SharedAccess } from '@traceflux/instrumentation';

export interface RaceCandidate {
  resourceId: string;
  conflicts: Array<{
    asyncId1: number;
    asyncId2: number;
    conflictType: 'write-write' | 'read-write';
    timeGap: number;
    riskScore: number;    // 0–100
  }>;
}

export function detectRaceCandidates(
  accesses: SharedAccess[]
): RaceCandidate[] {
  if (accesses.length === 0) return [];

  // 1. Group accesses by shared resource ID
  const groups = new Map<string, SharedAccess[]>();
  for (const acc of accesses) {
    let list = groups.get(acc.resourceId);
    if (!list) {
      list = [];
      groups.set(acc.resourceId, list);
    }
    list.push(acc);
  }

  const candidates: RaceCandidate[] = [];

  // 2. Scan each group for conflicting concurrent operations
  for (const [resourceId, groupAccesses] of groups.entries()) {
    // Sort chronological
    groupAccesses.sort((a, b) => a.timestamp - b.timestamp);

    const conflicts: RaceCandidate['conflicts'] = [];

    for (let i = 0; i < groupAccesses.length; i++) {
      for (let j = i + 1; j < groupAccesses.length; j++) {
        const acc1 = groupAccesses[i];
        const acc2 = groupAccesses[j];

        // Only conflicts if accesses occur in different async contexts
        if (acc1.asyncId === acc2.asyncId) continue;

        // A conflict requires at least one write operation
        const hasWrite = acc1.accessType === 'write' || acc2.accessType === 'write';
        if (!hasWrite) continue;

        const timeGap = Math.abs(acc2.timestamp - acc1.timestamp);
        
        // Only evaluate conflicts within a tight 100ms window
        if (timeGap <= 100) {
          const isWriteWrite = acc1.accessType === 'write' && acc2.accessType === 'write';
          const conflictType = isWriteWrite ? 'write-write' : 'read-write';
          
          // Write-Write conflicts have a base risk of 100; Read-Write has a base risk of 80
          const baseRisk = isWriteWrite ? 100 : 80;
          // Risk score decays linearly as timeGap approaches 100ms
          const riskScore = Math.max(1, Math.round(baseRisk * (1 - timeGap / 100)));

          conflicts.push({
            asyncId1: acc1.asyncId,
            asyncId2: acc2.asyncId,
            conflictType,
            timeGap,
            riskScore,
          });
        }
      }
    }

    if (conflicts.length > 0) {
      candidates.push({
        resourceId,
        conflicts,
      });
    }
  }

  return candidates;
}
