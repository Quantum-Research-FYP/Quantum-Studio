/**
 * circuitDiff.ts
 *
 * Compares two CircuitModel instances and returns a structured diff
 * of added, removed, modified, and moved operations.
 *
 * Strategy:
 *   1. Build a key for each op: `${type}@q${qubits.join(',')}@t${time}`
 *   2. Exact matches → unchanged
 *   3. Same qubit set, same time, different type → modified
 *   4. Same type + qubit set, different time → moved
 *   5. Remaining in before → removed; remaining in after → added
 */

import type { CircuitModel, Operation } from './types';

export type DiffStatus = 'added' | 'removed' | 'modified' | 'moved' | 'unchanged';

export interface AnnotatedOp {
  op: Operation;
  status: DiffStatus;
  /** For 'modified': what was the gate type before */
  previousType?: string;
  /** For 'moved': what was the time slot before */
  previousTime?: number;
}

export interface CircuitDiff {
  added: Operation[];
  removed: Operation[];
  modified: Array<{ before: Operation; after: Operation }>;
  moved: Array<{ op: Operation; fromTime: number; toTime: number }>;
  unchanged: Operation[];
  /** Annotated operations for the 'before' circuit visualization */
  beforeAnnotated: AnnotatedOp[];
  /** Annotated operations for the 'after' circuit visualization */
  afterAnnotated: AnnotatedOp[];
}

function opKey(op: Operation): string {
  return `${op.type}@q${op.targets.qubits.slice().sort().join(',')}@t${op.time}`;
}

function qubitsKey(op: Operation): string {
  return `q${op.targets.qubits.slice().sort().join(',')}`;
}

function typeQubitsKey(op: Operation): string {
  return `${op.type}@${qubitsKey(op)}`;
}

export function computeCircuitDiff(before: CircuitModel, after: CircuitModel): CircuitDiff {
  const beforeOps = before.operations;
  const afterOps = after.operations;

  const beforeKeys = new Map<string, Operation>();
  const afterKeys = new Map<string, Operation>();

  for (const op of beforeOps) beforeKeys.set(opKey(op), op);
  for (const op of afterOps) afterKeys.set(opKey(op), op);

  const unchanged: Operation[] = [];
  const removed: Operation[] = [];
  const added: Operation[] = [];
  const modified: Array<{ before: Operation; after: Operation }> = [];
  const moved: Array<{ op: Operation; fromTime: number; toTime: number }> = [];

  const usedAfter = new Set<string>();

  for (const bOp of beforeOps) {
    const key = opKey(bOp);
    if (afterKeys.has(key)) {
      unchanged.push(bOp);
      usedAfter.add(key);
    } else {
      removed.push(bOp);
    }
  }

  // Match removed ops against genuinely new after ops to detect modified/moved
  const unmatchedAfter = afterOps.filter((op) => !usedAfter.has(opKey(op)));

  const matchedRemoved = new Set<string>();
  const matchedAfter = new Set<string>();

  for (const rOp of removed) {
    // Check for modification (same qubit+time, different type)
    for (const aOp of unmatchedAfter) {
      if (matchedAfter.has(opKey(aOp))) continue;
      if (
        aOp.time === rOp.time &&
        JSON.stringify(aOp.targets.qubits.slice().sort()) ===
          JSON.stringify(rOp.targets.qubits.slice().sort())
      ) {
        modified.push({ before: rOp, after: aOp });
        matchedRemoved.add(opKey(rOp));
        matchedAfter.add(opKey(aOp));
        break;
      }
    }
    if (matchedRemoved.has(opKey(rOp))) continue;

    // Check for move (same type+qubits, different time)
    for (const aOp of unmatchedAfter) {
      if (matchedAfter.has(opKey(aOp))) continue;
      if (typeQubitsKey(aOp) === typeQubitsKey(rOp) && aOp.time !== rOp.time) {
        moved.push({ op: aOp, fromTime: rOp.time, toTime: aOp.time });
        matchedRemoved.add(opKey(rOp));
        matchedAfter.add(opKey(aOp));
        break;
      }
    }
  }

  // Anything removed that wasn't matched as modified/moved is truly removed
  const trulyRemoved = removed.filter((op) => !matchedRemoved.has(opKey(op)));

  // Anything in unmatchedAfter that wasn't matched is truly added
  const trulyAdded = unmatchedAfter.filter((op) => !matchedAfter.has(opKey(op)));
  added.push(...trulyAdded);

  // Build annotated views
  const beforeAnnotated: AnnotatedOp[] = [];
  for (const op of beforeOps) {
    const key = opKey(op);
    if (unchanged.some((u) => opKey(u) === key)) {
      beforeAnnotated.push({ op, status: 'unchanged' });
    } else {
      const mod = modified.find((m) => opKey(m.before) === key);
      if (mod) {
        beforeAnnotated.push({ op, status: 'modified', previousType: undefined });
      } else {
        const mov = moved.find(
          (m) => m.fromTime === op.time && typeQubitsKey(m.op) === typeQubitsKey(op),
        );
        if (mov) {
          beforeAnnotated.push({ op, status: 'moved', previousTime: op.time });
        } else {
          beforeAnnotated.push({ op, status: 'removed' });
        }
      }
    }
  }

  const afterAnnotated: AnnotatedOp[] = [];
  for (const op of afterOps) {
    const key = opKey(op);
    if (unchanged.some((u) => opKey(u) === key)) {
      afterAnnotated.push({ op, status: 'unchanged' });
    } else if (trulyAdded.some((a) => opKey(a) === key)) {
      afterAnnotated.push({ op, status: 'added' });
    } else {
      const mod = modified.find((m) => opKey(m.after) === key);
      if (mod) {
        afterAnnotated.push({ op, status: 'modified', previousType: mod.before.type });
      } else {
        const mov = moved.find((m) => opKey(m.op) === key);
        if (mov) {
          afterAnnotated.push({ op, status: 'moved', previousTime: mov.fromTime });
        } else {
          afterAnnotated.push({ op, status: 'unchanged' });
        }
      }
    }
  }

  return {
    added: trulyAdded,
    removed: trulyRemoved,
    modified,
    moved,
    unchanged,
    beforeAnnotated,
    afterAnnotated,
  };
}

/** Returns a human-readable diff summary string */
export function diffSummary(diff: CircuitDiff): string {
  const parts: string[] = [];
  if (diff.added.length > 0) parts.push(`+${diff.added.length} added`);
  if (diff.removed.length > 0) parts.push(`-${diff.removed.length} removed`);
  if (diff.modified.length > 0) parts.push(`~${diff.modified.length} modified`);
  if (diff.moved.length > 0) parts.push(`↕${diff.moved.length} moved`);
  if (parts.length === 0) return 'No changes';
  return parts.join('  ');
}

/** Compute percentage change, formatted nicely */
export function formatMetricChange(
  before: number,
  after: number,
): {
  label: string;
  direction: 'increase' | 'decrease' | 'none';
  pct: string;
} {
  if (before === 0 && after === 0) return { label: '0 → 0', direction: 'none', pct: '0%' };
  const delta = after - before;
  const pct = before > 0 ? ((delta / before) * 100).toFixed(1) : '—';
  const direction = delta < 0 ? 'decrease' : delta > 0 ? 'increase' : 'none';
  const arrow = delta < 0 ? '↓' : delta > 0 ? '↑' : '';
  return {
    label: `${before} → ${after}`,
    direction,
    pct: `${arrow} ${Math.abs(Number(pct))}%`.trim(),
  };
}
