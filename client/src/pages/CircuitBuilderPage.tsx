import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CircuitModel, GateType, OperationTargets } from '../circuit';
import {
  addClbit,
  addQubit,
  deleteGate,
  generateOpenQasm,
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
import { useSimulation } from '../hooks/useSimulation';
import { getTemplateById, loadTemplateCircuit, type ExecutionConfig } from '../templates';

/**
 * CircuitBuilderPage is the top-level page for the visual quantum circuit editor.
 * It owns the circuit state via useCircuitHistory and passes props to child components.
 *
 * When navigated to with `?experimentId=xxx`, loads the experiment from the server
 * and populates the circuit editor with the saved state.
 */
const DEFAULT_SHOTS = 1024;

export default function CircuitBuilderPage() {
  const { circuit, canUndo, canRedo, push, undo, redo } = useCircuitHistory();
  const [selectedGate, setSelectedGate] = useState<GateType | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const experiment = useExperiment();
  const simulation = useSimulation();
  const loadedRef = useRef<string | null>(null);
  const [loadedRunSettings, setLoadedRunSettings] = useState<Record<string, unknown> | null>(null);
  const [loadedLatestResult, setLoadedLatestResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [executionConfig, setExecutionConfig] = useState<ExecutionConfig>({ shots: DEFAULT_SHOTS });

  // Load experiment from URL params on mount
  const experimentId = searchParams.get('experimentId');
  useEffect(() => {
    if (!experimentId || loadedRef.current === experimentId) return;
    loadedRef.current = experimentId;

    experiment.loadExperiment(experimentId).then((data) => {
      if (data?.circuitJson) {
        push(data.circuitJson as unknown as CircuitModel);
      }
      // Preserve run settings and latest result for round-trip saving
      setLoadedRunSettings(data?.runSettingsJson ?? null);
      setLoadedLatestResult(data?.latestResultJson ?? null);
    });
    // Only run when experimentId changes, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId]);

  // Load template from URL params on mount (mutually exclusive with experimentId)
  const templateId = searchParams.get('templateId');
  const loadedTemplateRef = useRef<string | null>(null);
  useEffect(() => {
    if (experimentId || !templateId || loadedTemplateRef.current === templateId) return;
    loadedTemplateRef.current = templateId;

    const template = getTemplateById(templateId);
    if (!template) return;

    // Confirm discard if user has unsaved edits (canUndo means history exists beyond initial)
    if (canUndo) {
      const confirmed = window.confirm(
        'You have unsaved changes. Discard them and load the template?',
      );
      if (!confirmed) return;
    }

    const circuitModel = loadTemplateCircuit(template);
    push(circuitModel);
    setExecutionConfig(template.defaultExecutionConfig);

    // Reset experiment state so saving creates a new experiment
    experiment.reset();
    experiment.setName(template.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // Save handler — prompts for name on first save
  const handleSave = useCallback(async () => {
    let name = experiment.experimentName;

    if (!experiment.experimentId) {
      // First save: prompt for experiment name
      const input = window.prompt('Experiment name:', name || 'Untitled Experiment');
      if (!input || input.trim().length === 0) return;
      name = input.trim();
      if (name.length > 120) {
        window.alert('Experiment name must be 120 characters or fewer.');
        return;
      }
    }

    await experiment.save(name || 'Untitled Experiment', circuit, loadedRunSettings, loadedLatestResult);
  }, [experiment, circuit, loadedRunSettings, loadedLatestResult]);

  // Save-as handler (prompt for name)
  const handleSaveAs = useCallback(async () => {
    const defaultName = experiment.experimentName || 'Untitled Experiment';
    const input = window.prompt('Experiment name:', defaultName);
    if (!input || input.trim().length === 0) return;
    const name = input.trim();
    if (name.length > 120) {
      window.alert('Experiment name must be 120 characters or fewer.');
      return;
    }

    // Reset experiment state so save() creates a new experiment
    experiment.reset();
    await experiment.save(name, circuit, loadedRunSettings, loadedLatestResult);
  }, [experiment, circuit, loadedRunSettings, loadedLatestResult]);

  // Run handler — generates QASM and submits to the simulator
  const handleRun = useCallback(async () => {
    const qasm = generateOpenQasm(circuit);
    if (!qasm) return;

    await simulation.submit({ qasm, shots: executionConfig.shots });
  }, [circuit, executionConfig.shots, simulation]);

  // Navigate to results page once a job is created and submission is complete
  useEffect(() => {
    if (simulation.job && !simulation.loading) {
      navigate(`/results?jobId=${simulation.job.jobId}`, { replace: true });
    }
  }, [simulation.job, simulation.loading, navigate]);

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
          <button
            className="btn btn--primary btn--sm"
            onClick={handleRun}
            disabled={
              simulation.loading || errors.length > 0 || circuit.operations.length === 0
            }
            aria-label="Run circuit on simulator"
          >
            {simulation.loading ? 'Submitting...' : 'Run'}
          </button>
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

      {/* Simulation error banner with retry */}
      {simulation.error && (
        <div className="alert alert--error" role="alert">
          {simulation.error}
          <button
            className="btn btn--ghost btn--sm"
            style={{ marginLeft: 8 }}
            onClick={handleRun}
            aria-label="Retry simulation"
          >
            Retry
          </button>
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
