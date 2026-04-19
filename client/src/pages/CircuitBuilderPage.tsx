import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CircuitModel, GateType, OperationTargets } from '../circuit';
import {
  addClbit,
  addQubit,
  deleteGate,
  generateQiskitCode,
  getDependentOperations,
  placeGate,
  removeWireWithDependents,
  validateCircuit,
} from '../circuit';
import CircuitCanvas from '../components/circuit-builder/CircuitCanvas';
import GatePalette from '../components/circuit-builder/GatePalette';
import WireList from '../components/circuit-builder/WireList';
import UndoRedoControls from '../components/circuit-builder/UndoRedoControls';
import CodePanel from '../components/circuit-builder/CodePanel';
import ValidationSummaryPanel from '../components/circuit-builder/ValidationSummaryPanel';
import ExportControls from '../components/circuit-builder/ExportControls';
import { useCircuitHistory } from '../hooks/useCircuitHistory';
import { useExperiment } from '../hooks/useExperiment';

/**
 * CircuitBuilderPage is the top-level page for the visual quantum circuit editor.
 * It owns the circuit state via useCircuitHistory and passes props to child components.
 *
 * When navigated to with `?experimentId=xxx`, loads the experiment from the server
 * and populates the circuit editor with the saved state.
 */
export default function CircuitBuilderPage() {
  const { circuit, canUndo, canRedo, push, undo, redo } = useCircuitHistory();
  const [selectedGate, setSelectedGate] = useState<GateType | null>(null);
  const [searchParams] = useSearchParams();

  const experiment = useExperiment();
  const loadedRef = useRef<string | null>(null);

  // Load experiment from URL params on mount
  const experimentId = searchParams.get('experimentId');
  useEffect(() => {
    if (!experimentId || loadedRef.current === experimentId) return;
    loadedRef.current = experimentId;

    experiment.loadExperiment(experimentId).then((data) => {
      if (data?.circuitJson) {
        // Push the loaded circuit as the initial state
        push(data.circuitJson as unknown as CircuitModel);
      }
    });
    // Only run when experimentId changes, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId]);

  // Save handler
  const handleSave = useCallback(async () => {
    const name = experiment.experimentName || 'Untitled Experiment';
    await experiment.save(name, circuit);
  }, [experiment, circuit]);

  // Save-as handler (prompt for name)
  const handleSaveAs = useCallback(async () => {
    const defaultName = experiment.experimentName || 'Untitled Experiment';
    const name = window.prompt('Experiment name:', defaultName);
    if (!name || name.trim().length === 0) return;

    // Reset experiment state so save() creates a new experiment
    experiment.reset();
    await experiment.save(name.trim(), circuit);
  }, [experiment, circuit]);

  // Validation runs on every circuit change
  const errors = useMemo(() => validateCircuit(circuit), [circuit]);
  const errorOperationIds = useMemo(
    () => new Set(errors.filter((e) => e.operationId).map((e) => e.operationId!)),
    [errors],
  );

  // Code generation for export
  const code = generateQiskitCode(circuit);

  const handleAddQubit = useCallback(() => {
    push(addQubit(circuit));
  }, [circuit, push]);

  const handleAddClbit = useCallback(() => {
    push(addClbit(circuit));
  }, [circuit, push]);

  const handleRemoveQubit = useCallback(() => {
    const lastIndex = circuit.qubits - 1;
    if (lastIndex < 0) return;

    const dependents = getDependentOperations(circuit, 'qubit', lastIndex);
    if (dependents.length > 0) {
      const confirmed = window.confirm(
        `Qubit q${lastIndex} has ${dependents.length} operation(s). Remove the qubit and all dependent operations?`,
      );
      if (!confirmed) return;
    }

    const { circuit: updated } = removeWireWithDependents(circuit, 'qubit', lastIndex);
    push(updated);
  }, [circuit, push]);

  const handleRemoveClbit = useCallback(() => {
    const lastIndex = circuit.clbits - 1;
    if (lastIndex < 0) return;

    const dependents = getDependentOperations(circuit, 'clbit', lastIndex);
    if (dependents.length > 0) {
      const confirmed = window.confirm(
        `Classical bit c${lastIndex} has ${dependents.length} operation(s). Remove it and all dependent operations?`,
      );
      if (!confirmed) return;
    }

    const { circuit: updated } = removeWireWithDependents(circuit, 'clbit', lastIndex);
    push(updated);
  }, [circuit, push]);

  const handlePlaceGate = useCallback(
    (type: GateType, targets: OperationTargets, time: number) => {
      try {
        const { circuit: updated } = placeGate(circuit, type, targets, time);
        push(updated);
      } catch {
        // Validation error — gate can't be placed here
      }
    },
    [circuit, push],
  );

  const handleDeleteGate = useCallback(
    (operationId: string) => {
      push(deleteGate(circuit, operationId));
    },
    [circuit, push],
  );

  return (
    <div className="builder">
      <div className="builder__toolbar">
        <WireList
          qubits={circuit.qubits}
          clbits={circuit.clbits}
          onAddQubit={handleAddQubit}
          onRemoveQubit={handleRemoveQubit}
          onAddClbit={handleAddClbit}
          onRemoveClbit={handleRemoveClbit}
        />
        <UndoRedoControls canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
        <ExportControls
          code={code}
          hasErrors={errors.length > 0}
          hasGates={circuit.operations.length > 0}
        />

        {/* Experiment save controls */}
        <div className="builder__save-controls">
          <button
            className="btn btn--primary btn--sm"
            onClick={handleSave}
            disabled={experiment.saving}
            aria-label={experiment.experimentId ? 'Save experiment' : 'Save as new experiment'}
          >
            {experiment.saving ? 'Saving...' : 'Save'}
          </button>
          {experiment.experimentId && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={handleSaveAs}
              disabled={experiment.saving}
              aria-label="Save as a new experiment"
            >
              Save As
            </button>
          )}
          {experiment.lastSavedAt && (
            <span className="builder__save-status">
              Saved {new Date(experiment.lastSavedAt).toLocaleTimeString()}
            </span>
          )}
          {experiment.experimentName && (
            <span className="builder__experiment-name">{experiment.experimentName}</span>
          )}
        </div>
      </div>

      {/* Error/conflict banner */}
      {experiment.error && (
        <div className="alert alert--error" role="alert">
          {experiment.error}
          {experiment.isConflict && (
            <button
              className="btn btn--ghost btn--sm"
              style={{ marginLeft: 8 }}
              onClick={() => {
                if (experiment.experimentId) {
                  window.location.href = `/builder?experimentId=${experiment.experimentId}`;
                }
              }}
            >
              Reload
            </button>
          )}
        </div>
      )}

      {experiment.loading ? (
        <div className="builder__loading">Loading experiment...</div>
      ) : (
        <div className="builder__workspace">
          <GatePalette selectedGate={selectedGate} onSelectGate={setSelectedGate} />

          <div className="builder__center">
            <CircuitCanvas
              circuit={circuit}
              selectedGate={selectedGate}
              errorOperationIds={errorOperationIds}
              onPlaceGate={handlePlaceGate}
              onDeleteGate={handleDeleteGate}
            />
          </div>

          <div className="builder__sidebar">
            <CodePanel code={code} />
            <ValidationSummaryPanel errors={errors} />
          </div>
        </div>
      )}
    </div>
  );
}
