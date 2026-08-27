import { useCallback, useEffect, useState } from 'react';
import type { CircuitModel } from '../circuit';
import { createEmptyCircuit } from '../circuit';

const MAX_HISTORY = 200;

interface CircuitHistory {
  /** The current circuit model. */
  circuit: CircuitModel;
  /** Whether undo is available. */
  canUndo: boolean;
  /** Whether redo is available. */
  canRedo: boolean;
  /** Push a new circuit state onto the history stack, discarding any redo future. */
  push: (next: CircuitModel) => void;
  /** Revert to the previous circuit state. */
  undo: () => void;
  /** Re-apply a previously undone state. */
  redo: () => void;
  /** Reset the history with an optional initial state */
  reset: (initial?: CircuitModel) => void;
}

/**
 * Snapshot-based undo/redo hook for the circuit model.
 *
 * Stores full CircuitModel snapshots (lightweight for up to ~20 qubits / ~200 ops).
 * Every call to `push()` records a new state and truncates any redo future.
 * Undo/redo navigate the snapshot stack without mutation.
 */
export function useCircuitHistory(cacheKey?: string): CircuitHistory {
  const [stack, setStack] = useState<CircuitModel[]>(() => {
    if (cacheKey) {
      const saved = localStorage.getItem(cacheKey);
      if (saved) {
        try {
          return [JSON.parse(saved)];
        } catch (e) {
          console.error('Failed to parse cached circuit', e);
        }
      }
    }
    return [createEmptyCircuit()];
  });
  const [index, setIndex] = useState(0);

  const push = useCallback(
    (next: CircuitModel) => {
      setStack((prev) => {
        // Truncate any redo future and append the new state
        const truncated = prev.slice(Math.max(0, prev.length - MAX_HISTORY + 1), index + 1);
        return [...truncated, next];
      });
      setIndex((prev) => {
        // After truncation the new index is at the end
        const base = Math.min(prev, MAX_HISTORY - 2);
        return base + 1;
      });
    },
    [index],
  );

  const undo = useCallback(() => {
    setIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const redo = useCallback(() => {
    setIndex((prev) => {
      // Read stack length via the state to avoid stale closure
      setStack((s) => s);
      return prev + 1;
    });
  }, []);

  const reset = useCallback((initial?: CircuitModel) => {
    const c = initial || createEmptyCircuit();
    setStack([c]);
    setIndex(0);
    if (cacheKey && !initial) {
      localStorage.removeItem(cacheKey);
    }
  }, [cacheKey]);

  useEffect(() => {
    if (cacheKey) {
      localStorage.setItem(cacheKey, JSON.stringify(stack[index]));
    }
  }, [stack, index, cacheKey]);

  // Guard redo to not exceed stack bounds — we enforce via canRedo disable,
  // but also clamp in case of race
  const clampedIndex = Math.min(index, stack.length - 1);

  return {
    circuit: stack[clampedIndex],
    canUndo: clampedIndex > 0,
    canRedo: clampedIndex < stack.length - 1,
    push,
    undo,
    redo,
    reset,
  };
}
