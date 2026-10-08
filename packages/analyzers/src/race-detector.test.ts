import { describe, it, expect } from 'vitest';
import { detectRaceCandidates } from './race-detector.js';
import { SharedAccess } from '@traceflux/instrumentation';

describe('Shared Access Race Condition Detector', () => {
  it('should detect write-write and read-write conflicts under 100ms threshold', () => {
    const accesses: SharedAccess[] = [
      // Write-Write conflict on counter_A (within 10ms)
      { sessionId: 's1', resourceId: 'counter_A', accessType: 'write', asyncId: 10, timestamp: 100 },
      { sessionId: 's1', resourceId: 'counter_A', accessType: 'write', asyncId: 11, timestamp: 110 },

      // Read-Write conflict on file_B (within 50ms)
      { sessionId: 's1', resourceId: 'file_B', accessType: 'read', asyncId: 20, timestamp: 200 },
      { sessionId: 's1', resourceId: 'file_B', accessType: 'write', asyncId: 21, timestamp: 250 },

      // No conflict: occurs outside the 100ms window (gap is 150ms)
      { sessionId: 's1', resourceId: 'db_C', accessType: 'write', asyncId: 30, timestamp: 300 },
      { sessionId: 's1', resourceId: 'db_C', accessType: 'write', asyncId: 31, timestamp: 450 },

      // No conflict: accessed by the same async context
      { sessionId: 's1', resourceId: 'map_D', accessType: 'write', asyncId: 40, timestamp: 500 },
      { sessionId: 's1', resourceId: 'map_D', accessType: 'write', asyncId: 40, timestamp: 510 },
    ];

    const candidates = detectRaceCandidates(accesses);

    // Should only have counter_A and file_B conflicts
    expect(candidates.length).toBe(2);

    const counterCandidate = candidates.find(c => c.resourceId === 'counter_A');
    expect(counterCandidate).toBeDefined();
    expect(counterCandidate?.conflicts[0].conflictType).toBe('write-write');
    expect(counterCandidate?.conflicts[0].timeGap).toBe(10);
    // Write-Write base = 100. decay = 100 * (1 - 10/100) = 90.
    expect(counterCandidate?.conflicts[0].riskScore).toBe(90);

    const fileCandidate = candidates.find(c => c.resourceId === 'file_B');
    expect(fileCandidate).toBeDefined();
    expect(fileCandidate?.conflicts[0].conflictType).toBe('read-write');
    expect(fileCandidate?.conflicts[0].timeGap).toBe(50);
    // Read-Write base = 80. decay = 80 * (1 - 50/100) = 40.
    expect(fileCandidate?.conflicts[0].riskScore).toBe(40);
  });

  it('should ignore read-read accesses as they do not constitute conflicts', () => {
    const accesses: SharedAccess[] = [
      { sessionId: 's1', resourceId: 'config', accessType: 'read', asyncId: 10, timestamp: 100 },
      { sessionId: 's1', resourceId: 'config', accessType: 'read', asyncId: 11, timestamp: 110 },
    ];

    const candidates = detectRaceCandidates(accesses);
    expect(candidates.length).toBe(0);
  });
});
