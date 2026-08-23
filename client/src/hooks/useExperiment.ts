import { useState, useCallback, useRef, useEffect } from 'react';
import type { CircuitModel } from '../circuit';
import {
  createExperiment,
  updateExperiment,
  getExperiment,
  type ExperimentResponse,
  type CreateExperimentInput,
  type UpdateExperimentInput,
  type AiProvenanceInput,
} from '../api/experiments';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExperimentState {
  /** Current experiment ID, null for unsaved new experiments. */
  experimentId: string | null;
  /** Experiment name. */
  experimentName: string | null;
  /** Current rowVersion for optimistic concurrency. */
  rowVersion: number | null;
  /** ISO timestamp of last successful save. */
  lastSavedAt: string | null;
  /** True while a save or load is in-flight. */
  saving: boolean;
  /** True while loading an experiment. */
  loading: boolean;
  /** User-facing error message from last save/load attempt. */
  error: string | null;
  /** True if the last error was a version conflict (409). */
  isConflict: boolean;
}

interface LoadedExperiment {
  circuitJson: Record<string, unknown>;
  runSettingsJson: Record<string, unknown> | null;
  latestResultJson: Record<string, unknown> | null;
}

interface UseExperimentReturn extends ExperimentState {
  /** Save the current circuit as a new or existing experiment. */
  save: (
    name: string,
    circuit: CircuitModel,
    runSettingsJson?: Record<string, unknown> | null,
    latestResultJson?: Record<string, unknown> | null,
    aiProvenance?: AiProvenanceInput,
  ) => Promise<void>;
  /** Load an experiment by ID. Returns payloads for the editor to consume. */
  loadExperiment: (id: string) => Promise<LoadedExperiment | null>;
  /** Update experiment name locally without saving. */
  setName: (name: string) => void;
  /** Reset to a blank unsaved state. */
  reset: () => void;
  /** Clear the current error. */
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: ExperimentState = {
  experimentId: null,
  experimentName: null,
  rowVersion: null,
  lastSavedAt: null,
  saving: false,
  loading: false,
  error: null,
  isConflict: false,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExperiment(): UseExperimentReturn {
  const [state, setState] = useState<ExperimentState>(INITIAL_STATE);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Apply a response from create/update to local state. */
  const applyResponse = useCallback((resp: ExperimentResponse) => {
    setState((s) => ({
      ...s,
      experimentId: resp.id,
      experimentName: resp.name,
      rowVersion: resp.rowVersion,
      lastSavedAt: new Date().toISOString(),
      saving: false,
      error: null,
      isConflict: false,
    }));
  }, []);

  const save = useCallback(
    async (
      name: string,
      circuit: CircuitModel,
      runSettingsJson?: Record<string, unknown> | null,
      latestResultJson?: Record<string, unknown> | null,
      aiProvenance?: AiProvenanceInput,
    ) => {
      setState((s) => ({ ...s, saving: true, error: null, isConflict: false }));

      try {
        // Build the circuit JSON payload from the model
        const circuitJson = circuit as unknown as Record<string, unknown>;

        if (state.experimentId && state.rowVersion !== null) {
          // Update existing experiment
          const input: UpdateExperimentInput = {
            name,
            circuitJson,
            schemaVersion: circuit.schemaVersion,
            runSettingsJson: runSettingsJson ?? undefined,
            latestResultJson: latestResultJson ?? undefined,
            aiProvenance,
          };

          const resp = await updateExperiment(state.experimentId, input, state.rowVersion);
          if (mountedRef.current) applyResponse(resp);
        } else {
          // Create new experiment
          const input: CreateExperimentInput = {
            name,
            circuitJson,
            runSettingsJson: runSettingsJson ?? undefined,
            latestResultJson: latestResultJson ?? undefined,
            aiProvenance,
          };

          const resp = await createExperiment(input);
          if (mountedRef.current) applyResponse(resp);
        }
      } catch (err) {
        if (!mountedRef.current) return;

        const apiErr = err as Error & { status?: number; errorCode?: string };

        if (apiErr.status === 409) {
          setState((s) => ({
            ...s,
            saving: false,
            error:
              'This experiment was modified elsewhere. Please reload to get the latest version before saving.',
            isConflict: true,
          }));
          return;
        }

        setState((s) => ({
          ...s,
          saving: false,
          error: apiErr.message || 'Failed to save experiment.',
          isConflict: false,
        }));
      }
    },
    [state.experimentId, state.rowVersion, applyResponse],
  );

  const loadExperiment = useCallback(async (id: string): Promise<LoadedExperiment | null> => {
    setState((s) => ({ ...s, loading: true, error: null, isConflict: false }));

    try {
      const resp = await getExperiment(id);
      if (!mountedRef.current) return null;

      setState((s) => ({
        ...s,
        experimentId: resp.id,
        experimentName: resp.name,
        rowVersion: resp.rowVersion,
        lastSavedAt: resp.updatedAt,
        loading: false,
        error: null,
        isConflict: false,
      }));

      return {
        circuitJson: resp.circuitJson,
        runSettingsJson: resp.runSettingsJson,
        latestResultJson: resp.latestResultJson,
      };
    } catch (err) {
      if (!mountedRef.current) return null;

      const apiErr = err as Error & { status?: number; errorCode?: string; exportUrl?: string };

      let errorMessage = apiErr.message || 'Failed to load experiment.';

      if (apiErr.errorCode === 'SCHEMA_VERSION_UNSUPPORTED') {
        errorMessage =
          'This experiment uses a newer format that is not supported. ' +
          'Please upgrade the application or export the raw data for recovery.';
      } else if (apiErr.errorCode === 'SCHEMA_VERSION_TOO_OLD') {
        errorMessage =
          'This experiment uses an outdated format that can no longer be migrated. ' +
          'You can export the raw data for manual recovery.';
      }

      setState((s) => ({
        ...s,
        loading: false,
        error: errorMessage,
        isConflict: false,
      }));

      return null;
    }
  }, []);

  const setName = useCallback((name: string) => {
    setState((s) => ({ ...s, experimentName: name }));
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null, isConflict: false }));
  }, []);

  return {
    ...state,
    save,
    loadExperiment,
    setName,
    reset,
    clearError,
  };
}
