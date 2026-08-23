import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CircuitModel, GateType, OperationTargets } from '../circuit';
import {
  addClbit,
  addQubit,
  deleteGate,
  generateOpenQasm,
  generateQiskitCode,
  generateCirqCode,
  generatePennyLaneCode,
  generateBraketCode,
  generateTketCode,
  generateSpinqitCode,
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
import type { Framework } from '../components/circuit-builder/CodePanel';
import ValidationSummaryPanel from '../components/circuit-builder/ValidationSummaryPanel';
import CircuitProfilerPanel from '../components/circuit-builder/CircuitProfilerPanel';
import AiDraftPanel from '../components/circuit-builder/AiDraftPanel';
import AiImportBanner from '../components/circuit-builder/AiImportBanner';
import type { AiImportInfo } from '../components/circuit-builder/AiImportBanner';
import StateVisualizer from '../components/circuit-builder/StateVisualizer';
import TranspilationEngine from '../components/circuit-builder/TranspilationEngine';
import { useStepSimulation } from '../hooks/useStepSimulation';
import { useCircuitHistory } from '../hooks/useCircuitHistory';
import { useExperiment } from '../hooks/useExperiment';
import { useAuth } from '../hooks/useAuth';
import {
  getProviders,
  listIbmBackends,
  submitExecutionJob,
  type ExecutionProvider,
  type IbmBackend,
} from '../api/execution';
import { getIbmSettings } from '../api/integrations';
import { getTemplateById, loadTemplateCircuit, type ExecutionConfig } from '../templates';
import type { AiProvenanceInput } from '../api/experiments';

/**
 * CircuitBuilderPage is the top-level page for the visual quantum circuit editor.
 * It owns the circuit state via useCircuitHistory and passes props to child components.
 *
 * When navigated to with `?experimentId=xxx`, loads the experiment from the server
 * and populates the circuit editor with the saved state.
 */
const DEFAULT_SHOTS = 1024;

/** Compute SHA-256 hex hash of a string using SubtleCrypto. */
async function computeCodeHash(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Build AI provenance input from import info. */
async function buildAiProvenance(importInfo: AiImportInfo): Promise<AiProvenanceInput> {
  const { draft } = importInfo;
  return {
    aiAssisted: true,
    aiProvider: draft.provider,
    aiModel: draft.model,
    aiGeneratedAt: draft.generatedAt,
    aiCodeHash: await computeCodeHash(draft.generatedCode),
    aiPrompt: draft.explanation ? undefined : undefined, // Prompt not sent to server — retention is server-controlled
    aiExplanation: draft.explanation,
    aiGeneratedCode: draft.generatedCode,
  };
}

export default function CircuitBuilderPage() {
  const { circuit, canUndo, canRedo, push, undo, redo } = useCircuitHistory();
  const [selectedGate, setSelectedGate] = useState<GateType | null>(null);
  const [exportFramework, setExportFramework] = useState<Framework>('qiskit');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const experiment = useExperiment();
  const { user } = useAuth();
  const loadedRef = useRef<string | null>(null);
  const [loadedRunSettings, setLoadedRunSettings] = useState<Record<string, unknown> | null>(null);
  const [loadedLatestResult, setLoadedLatestResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [executionConfig, setExecutionConfig] = useState<ExecutionConfig>({
    shots: DEFAULT_SHOTS,
    provider: 'local',
  });
  const [providers, setProviders] = useState<ExecutionProvider[]>([]);
  const [ibmBackends, setIbmBackends] = useState<IbmBackend[]>([]);
  const [credentialStatus, setCredentialStatus] = useState<
    'unknown' | 'missing' | 'invalid' | 'valid'
  >('unknown');
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [isTranspilationModalOpen, setIsTranspilationModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    getProviders()
      .then((data) => setProviders(data.providers))
      .catch(() => setProviders([{ id: 'simulator', name: 'Simulator', available: true }]));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getIbmSettings()
      .then((settings) => {
        if (settings && settings.hasToken) {
          setCredentialStatus(settings.validationStatus === 'valid' ? 'valid' : 'invalid');
        } else {
          setCredentialStatus('missing');
        }
      })
      .catch(() => setCredentialStatus('unknown'));
  }, [user]);

  useEffect(() => {
    if (executionConfig.provider === 'ibm' && credentialStatus === 'valid') {
      listIbmBackends()
        .then((data) => {
          setIbmBackends(data.backends);
          if (data.backends.length > 0 && !executionConfig.backend) {
            setExecutionConfig((prev) => ({ ...prev, backend: data.backends[0].name }));
          }
        })
        .catch(() => setIbmBackends([]));
    }
  }, [executionConfig.provider, credentialStatus, executionConfig.backend]);

  // Stepper state
  const stepSim = useStepSimulation(circuit);

  // Operations at the current step (time column) — used by DiracNotation
  const currentStepOperations = useMemo(() => {
    if (stepSim.currentStep === 0) return [];
    // Step N means "after applying all gates at time column N-1"
    const timeCol = stepSim.currentStep - 1;
    return circuit.operations.filter((op) => op.time === timeCol);
  }, [circuit.operations, stepSim.currentStep]);

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

  // AI Draft panel toggle and provenance state (declared early — used in save handlers)
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiImportInfo, _setAiImportInfo] = useState<AiImportInfo | null>(null);

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

    const provenance = aiImportInfo ? await buildAiProvenance(aiImportInfo) : undefined;
    await experiment.save(
      name || 'Untitled Experiment',
      circuit,
      loadedRunSettings,
      loadedLatestResult,
      provenance,
    );
  }, [experiment, circuit, loadedRunSettings, loadedLatestResult, aiImportInfo]);

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
    const provenance = aiImportInfo ? await buildAiProvenance(aiImportInfo) : undefined;
    experiment.reset();
    await experiment.save(name, circuit, loadedRunSettings, loadedLatestResult, provenance);
  }, [experiment, circuit, loadedRunSettings, loadedLatestResult, aiImportInfo]);

  // Run handler — generates QASM and submits to the unified execution endpoint
  const handleRun = useCallback(async () => {
    const qasm = generateOpenQasm(circuit);
    if (!qasm) return;

    setIsRunning(true);
    setRunError(null);

    const providerVal =
      executionConfig.provider === 'ibm'
        ? 'ibm_quantum'
        : executionConfig.provider === 'spinq'
          ? 'spinq'
          : 'simulator';

    try {
      const job = await submitExecutionJob({
        provider: providerVal,
        backend: providerVal === 'ibm_quantum' ? executionConfig.backend : undefined,
        qasm,
        shots: executionConfig.shots,
        codeType: 'qasm',
      });

      // Navigate to results page immediately using unified results view
      navigate(`/results?jobId=${job.jobId}`, { replace: true });
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : 'Failed to submit execution job.');
    } finally {
      setIsRunning(false);
    }
  }, [circuit, executionConfig, navigate]);

  // Validation runs on every circuit change
  const errors = useMemo(() => validateCircuit(circuit), [circuit]);
  const errorOperationIds = useMemo(
    () => new Set(errors.filter((e) => e.operationId).map((e) => e.operationId!)),
    [errors],
  );

  const handleDismissAiBanner = useCallback(() => {
    _setAiImportInfo(null);
  }, []);

  // Code generation for export
  const code = useMemo(() => {
    switch (exportFramework) {
      case 'cirq':
        return generateCirqCode(circuit);
      case 'pennylane':
        return generatePennyLaneCode(circuit);
      case 'braket':
        return generateBraketCode(circuit);
      case 'tket':
        return generateTketCode(circuit);
      case 'spinqit':
        return generateSpinqitCode(circuit);
      case 'qasm':
        return generateOpenQasm(circuit) || '# Add qubits and gates to generate OpenQASM code';
      case 'qiskit':
      default:
        return generateQiskitCode(circuit);
    }
  }, [circuit, exportFramework]);

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
    (type: GateType, targets: OperationTargets, time: number, params?: Record<string, number>) => {
      try {
        const { circuit: updated } = placeGate(circuit, type, targets, time, params);
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
        <button
          className={`ai-chat-trigger${showAiPanel ? ' ai-chat-trigger--active' : ''}`}
          onClick={() => setShowAiPanel((prev) => !prev)}
          aria-label={showAiPanel ? 'Hide AI chat' : 'Open AI chat'}
          aria-expanded={showAiPanel}
          aria-controls="ai-draft-panel"
        >
          <span className="ai-chat-trigger__spark">✦</span>
          AI Chat
        </button>

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
          <select
            className="toolbar-selector"
            style={{ width: 'auto' }}
            value={executionConfig.provider || 'local'}
            onChange={(e) =>
              setExecutionConfig({
                ...executionConfig,
                provider: e.target.value as ExecutionConfig['provider'],
                backend: undefined,
              })
            }
            aria-label="Select Backend Provider"
          >
            <option value="local">Local Simulator</option>
            {providers.some((p) => p.id === 'ibm_quantum' && p.available) && (
              <option value="ibm">IBM Quantum</option>
            )}
            <option value="spinq">SpinQ Gemini Mini Pro</option>
          </select>

          {executionConfig.provider === 'ibm' && credentialStatus === 'valid' && (
            <select
              className="toolbar-selector"
              style={{ width: 'auto' }}
              value={executionConfig.backend || ''}
              onChange={(e) => setExecutionConfig({ ...executionConfig, backend: e.target.value })}
              aria-label="Select Hardware Backend"
            >
              {ibmBackends.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} ({b.qubits}Q)
                </option>
              ))}
            </select>
          )}

          <button
            className="btn btn--primary btn--sm"
            onClick={handleRun}
            disabled={
              isRunning ||
              errors.length > 0 ||
              circuit.operations.length === 0 ||
              (executionConfig.provider === 'ibm' &&
                (credentialStatus !== 'valid' || !executionConfig.backend))
            }
            aria-label="Run circuit"
          >
            {isRunning ? 'Submitting...' : 'Run'}
          </button>
          <button
            className="btn btn--secondary btn--sm"
            onClick={() => setIsTranspilationModalOpen(true)}
            disabled={errors.length > 0 || circuit.operations.length === 0}
            aria-label="Run with Animated Transpilation"
          >
            Run with Animated Transpilation
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

      {executionConfig.provider === 'ibm' && credentialStatus !== 'valid' && (
        <div className="alert alert--error" role="alert" style={{ margin: '12px 24px 0' }}>
          IBM Quantum credentials are not configured. Please save your API token in Settings.
        </div>
      )}
      {runError && (
        <div className="alert alert--error" role="alert" style={{ margin: '12px 24px 0' }}>
          {runError}
        </div>
      )}

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

      {/* AI import provenance banner */}
      {aiImportInfo && (
        <AiImportBanner importInfo={aiImportInfo} onDismiss={handleDismissAiBanner} />
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
              currentStep={stepSim.currentStep}
            />

            <StateVisualizer
              currentStep={stepSim.currentStep}
              maxStep={stepSim.maxStep}
              isPlaying={stepSim.isPlaying}
              isLoading={stepSim.isLoading}
              error={stepSim.error}
              currentAmplitudes={stepSim.currentAmplitudes}
              circuitQubits={circuit.qubits}
              currentOperations={currentStepOperations}
              onPlay={stepSim.play}
              onPause={stepSim.pause}
              onStepForward={stepSim.stepForward}
              onStepBack={stepSim.stepBack}
              onSeek={stepSim.setCurrentStep}
            />
          </div>

          <div className="builder__sidebar">
            <CircuitProfilerPanel circuit={circuit} />
            <CodePanel
              code={code}
              framework={exportFramework}
              onFrameworkChange={setExportFramework}
            />
            <ValidationSummaryPanel errors={errors} />
          </div>
        </div>
      )}

      {/* AI chat — floating popup, rendered outside the workspace grid */}
      {showAiPanel && (
        <div className="ai-chat-popup" id="ai-draft-panel" role="dialog" aria-label="AI Chat">
          <AiDraftPanel circuitCode={code} onClose={() => setShowAiPanel(false)} />
        </div>
      )}

      <TranspilationEngine
        isOpen={isTranspilationModalOpen}
        onClose={() => setIsTranspilationModalOpen(false)}
        circuit={circuit}
      />
    </div>
  );
}
