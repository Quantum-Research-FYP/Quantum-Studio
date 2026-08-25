/**
 * CompilationPathComparison.tsx
 *
 * Real-Time Educational & Execution Comparison:
 * Shows the live, side-by-side difference between Qiskit Simulation (Aer)
 * and real IBM Hardware compilation for the user's active circuit.
 *
 * Features:
 * - Live real-time transpilation trace fetch (`getTranspileTrace`)
 * - Stage-by-stage real metric deltas (gate count, depth, SWAPs, qubit mapping)
 * - Actual intermediate and final ISA QASM
 * - Live Execution triggers for both paths (Run Simulation & Run Hardware)
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { CircuitModel } from '../../circuit';
import { generateOpenQasm } from '../../circuit';
import {
  getTranspileTrace,
  type TranspileTraceResponse,
  type TranspileStageSummary,
} from '../../api/simulations';
import './CompilationPathComparison.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  circuit: CircuitModel;
  onExecuteSim?: () => void;
  onExecuteHardware?: () => void;
}

interface StepConfig {
  id: string;
  icon: string;
  name: string;
  stageName?: string;
  sim: {
    status: 'active' | 'skipped' | 'passthrough';
    title: string;
    description: string;
    callout: { type: 'info' | 'note' | 'success' | 'warning'; text: string };
  };
  hw: {
    status: 'active' | 'transforms' | 'required';
    title: string;
    description: string;
    callout: { type: 'info' | 'note' | 'success' | 'warning'; text: string };
  };
  takeaway: string;
}

const STEP_CONFIGS: StepConfig[] = [
  {
    id: 'abstract',
    icon: '📝',
    name: '1. Abstract Circuit',
    sim: {
      status: 'active',
      title: 'Abstract Circuit (Untranspiled)',
      description:
        'Your algorithm defined with high-level logical gates. Simulation directly interprets this mathematical state without requiring hardware mapping.',
      callout: {
        type: 'info',
        text: 'Uses logical qubits (q0, q1...). No hardware gate limits or routing topologies applied.',
      },
    },
    hw: {
      status: 'required',
      title: 'Abstract Circuit (Requires Transpilation)',
      description:
        'Physical quantum processors cannot execute this directly. It must be synthesized into physical instructions meeting the device ISA.',
      callout: {
        type: 'warning',
        text: 'IBM QPUs only execute specific native basis gates with fixed qubit-to-qubit coupling.',
      },
    },
    takeaway:
      'Both flows start with the **exact same circuit**. Simulation computes the math directly, whereas hardware requires a 6-stage transformation pipeline.',
  },
  {
    id: 'dag',
    icon: '🌐',
    name: '2. DAG Graph',
    stageName: 'Analysis',
    sim: {
      status: 'passthrough',
      title: 'DAG Representation (Read-Only)',
      description:
        'Qiskit parses operations into a Directed Acyclic Graph (DAG) for dependency tracking. For simulation, no transformation passes modify this graph.',
      callout: {
        type: 'info',
        text: 'The simulator calculates state transitions layer-by-layer without rewriting gate nodes.',
      },
    },
    hw: {
      status: 'transforms',
      title: 'DAG Working Graph (Active)',
      description:
        'The DAG is the live compiler data structure. Transpiler passes will mutate, replace, and insert nodes in this graph.',
      callout: {
        type: 'note',
        text: 'Analysis passes inspect topological depth; transformation passes rewrite the graph nodes.',
      },
    },
    takeaway:
      'The DAG is the internal data structure: **read-only** for simulation, but **actively rewritten** for hardware.',
  },
  {
    id: 'init',
    icon: '🔧',
    name: '3. Init Stage',
    stageName: 'Init',
    sim: {
      status: 'skipped',
      title: 'Init Stage — SKIPPED',
      description:
        'Aer handles custom, multi-controlled, and high-level gates natively without decomposition overhead.',
      callout: {
        type: 'success',
        text: 'Multi-qubit gates (CCX, MCX, unitary matrices) simulate directly without synthesized expansion.',
      },
    },
    hw: {
      status: 'transforms',
      title: 'Init Stage — ACTIVE',
      description:
        'Unrolls custom gates and breaks multi-controlled gates into standard 1-qubit and 2-qubit building blocks.',
      callout: {
        type: 'note',
        text: 'Prepares the circuit so subsequent layout and routing passes can process every interaction.',
      },
    },
    takeaway:
      'Multi-qubit gates run natively in simulator math, but must be **decomposed into 1Q and 2Q gates** for physical hardware.',
  },
  {
    id: 'layout',
    icon: '🗺️',
    name: '4. Layout (Mapping)',
    stageName: 'Mapping',
    sim: {
      status: 'skipped',
      title: 'Layout Stage — SKIPPED',
      description:
        'Simulation has no concept of physical chip locations. Logical q0, q1... exist in an ideal all-to-all Hilbert space.',
      callout: {
        type: 'success',
        text: 'All virtual qubits have identical zero-noise properties; no physical placement needed.',
      },
    },
    hw: {
      status: 'transforms',
      title: 'Layout Stage — ACTIVE',
      description:
        'Assigns each logical circuit qubit to a real physical qubit (e.g. Q14, Q15) on the IBM heavy-hex topology.',
      callout: {
        type: 'note',
        text: 'The layout algorithm selects high-fidelity physical qubits to minimize readout error and distance.',
      },
    },
    takeaway:
      'Simulation has no hardware topology. IBM hardware **binds logical qubits to physical chip pins** based on calibrated error rates.',
  },
  {
    id: 'routing',
    icon: '🔀',
    name: '5. Routing (SWAP)',
    stageName: 'Routing',
    sim: {
      status: 'skipped',
      title: 'Routing Stage — SKIPPED',
      description:
        'Ideal all-to-all connectivity. Any qubit can entangle with any other qubit with zero added SWAP gates.',
      callout: {
        type: 'success',
        text: '0 SWAP gates inserted. Zero routing overhead or added noise.',
      },
    },
    hw: {
      status: 'transforms',
      title: 'Routing Stage — ACTIVE',
      description:
        'Resolves physical connectivity constraints. Inserts SWAP networks when interacting qubits are not physical neighbors.',
      callout: {
        type: 'warning',
        text: 'Every inserted SWAP adds 3 CX/ECR gates of noise. Good routing minimizes this penalty.',
      },
    },
    takeaway:
      'Routing is the biggest hardware penalty: non-adjacent interactions require **SWAP gates** (each costing 3 two-qubit operations).',
  },
  {
    id: 'translation',
    icon: '🔄',
    name: '6. Translation (Basis)',
    stageName: 'Translation',
    sim: {
      status: 'skipped',
      title: 'Translation Stage — SKIPPED',
      description:
        'Aer recognizes all standard quantum gates (H, X, Y, Z, CX, RZ, T, S) and multiplies their exact matrix representations.',
      callout: {
        type: 'success',
        text: 'Gates remain in their original human-readable algorithmic basis.',
      },
    },
    hw: {
      status: 'transforms',
      title: 'Translation Stage — ACTIVE',
      description:
        'Converts all gates into the backend native instruction set (typically RZ, SX, X, CZ or ECR).',
      callout: {
        type: 'note',
        text: 'Example: Hadamard (H) decomposes into RZ(π/2) · SX · RZ(π/2).',
      },
    },
    takeaway:
      'The simulator computes any gate matrix; hardware can only pulse **native calibrated microwave instructions**.',
  },
  {
    id: 'optimization',
    icon: '⚡',
    name: '7. Optimization',
    stageName: 'Optimization',
    sim: {
      status: 'skipped',
      title: 'Optimization Stage — SKIPPED',
      description:
        'No optimization needed for noiseless math. Cancelling redundant gates does not alter the exact algebraic output.',
      callout: {
        type: 'info',
        text: 'Math execution time is dominated by statevector dimension (2ⁿ), not gate cancellation.',
      },
    },
    hw: {
      status: 'transforms',
      title: 'Optimization Stage — ACTIVE',
      description:
        'Combines adjacent single-qubit rotations, cancels inverse pairs (X·X=I), and optimizes 2Q blocks to fight decoherence.',
      callout: {
        type: 'success',
        text: 'Directly lowers circuit depth, reducing T1 relaxation and T2 dephasing errors.',
      },
    },
    takeaway:
      'Optimization is optional for simulation, but **critical for hardware** to beat noise before qubits decohere.',
  },
  {
    id: 'scheduling',
    icon: '⏱️',
    name: '8. Scheduling',
    stageName: 'Scheduling',
    sim: {
      status: 'skipped',
      title: 'Scheduling Stage — SKIPPED',
      description:
        'Mathematical operations are timeless. Simulation assumes instantaneous gate application with zero idle decay.',
      callout: {
        type: 'info',
        text: 'No physical timing, gate durations, or dynamical decoupling needed.',
      },
    },
    hw: {
      status: 'transforms',
      title: 'Scheduling Stage — ACTIVE / OPTIONAL',
      description:
        'Translates gates into nanosecond pulse durations (ALAP/ASAP scheduling) and can insert dynamical decoupling (DD) pulses.',
      callout: {
        type: 'note',
        text: 'Aligns operations with pulse clock cycles and protects idle qubits against environmental noise.',
      },
    },
    takeaway:
      'Simulation is instantaneous; hardware must schedule **nanosecond pulse timelines** to suppress idle decoherence.',
  },
  {
    id: 'execution',
    icon: '🚀',
    name: '9. Live Execution',
    sim: {
      status: 'active',
      title: 'Classical Aer Simulation',
      description:
        'Calculates full 2ⁿ statevector on local CPU/GPU. Fast, exact, zero noise, free of queue times.',
      callout: {
        type: 'success',
        text: 'Ideal for circuit development, unit testing, and state debugging.',
      },
    },
    hw: {
      status: 'active',
      title: 'Real IBM Quantum QPU',
      description:
        'Executes physical microwave control pulses on cryogenic superconducting transmon qubits.',
      callout: {
        type: 'warning',
        text: 'Subject to real quantum decoherence, readout noise, and cloud job queueing.',
      },
    },
    takeaway:
      'Simulation gives **instant exact validation** on your computer. Hardware gives **true physical quantum execution**.',
  },
  {
    id: 'results',
    icon: '📊',
    name: '10. Summary & Metrics',
    sim: {
      status: 'active',
      title: 'Ideal Result Profile',
      description:
        'Zero systemic noise. Probability distribution matches pure mathematical expectation.',
      callout: {
        type: 'success',
        text: 'Exact state analysis with zero fidelity loss.',
      },
    },
    hw: {
      status: 'active',
      title: 'Real Hardware Profile',
      description:
        'ISA circuit profile with physical qubit mappings, native gate counts, and realistic noise dispersion.',
      callout: {
        type: 'note',
        text: 'Ready for IBM Runtime SamplerV2 execution.',
      },
    },
    takeaway:
      'Understanding both paths enables you to **prototype rapidly on the simulator** and **transpile cleanly for hardware**.',
  },
];

export default function CompilationPathComparison({
  isOpen,
  onClose,
  circuit,
  onExecuteSim,
  onExecuteHardware,
}: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [optLevel, setOptLevel] = useState<number>(1);
  const [targetBackend, setTargetBackend] = useState<string>('ibm_brisbane');
  const [trace, setTrace] = useState<TranspileTraceResponse | null>(null);
  const [loadingTrace, setLoadingTrace] = useState<boolean>(false);
  const [traceError, setTraceError] = useState<string | null>(null);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const qasm = useMemo(() => (isOpen ? generateOpenQasm(circuit) : ''), [circuit, isOpen]);
  const qubitCount = circuit.qubits;
  const gateCount = circuit.operations.length;

  // Fetch real-time transpilation trace for the active circuit
  const fetchLiveTrace = useCallback(async () => {
    if (!qasm || !isOpen) return;
    setLoadingTrace(true);
    setTraceError(null);
    try {
      const res = await getTranspileTrace({
        qasm,
        mode: 'qasm',
        backend: targetBackend,
        optimizationLevel: optLevel,
      });
      setTrace(res);
    } catch (err: unknown) {
      setTraceError(err instanceof Error ? err.message : 'Could not fetch live transpilation trace.');
    } finally {
      setLoadingTrace(false);
    }
  }, [qasm, isOpen, targetBackend, optLevel]);

  useEffect(() => {
    if (isOpen) {
      fetchLiveTrace();
    } else {
      if (playRef.current) clearInterval(playRef.current);
      setCurrentStep(0);
      setIsPlaying(false);
      setTrace(null);
    }
  }, [isOpen, fetchLiveTrace]);

  // Playback logic
  const stopPlayback = useCallback(() => {
    if (playRef.current) {
      clearInterval(playRef.current);
      playRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    setIsPlaying(true);
    playRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= STEP_CONFIGS.length - 1) {
          stopPlayback();
          return prev;
        }
        return prev + 1;
      });
    }, 4000);
  }, [stopPlayback]);

  const pause = useCallback(() => stopPlayback(), [stopPlayback]);

  const nextStep = useCallback(() => {
    stopPlayback();
    setCurrentStep((prev) => Math.min(prev + 1, STEP_CONFIGS.length - 1));
  }, [stopPlayback]);

  const prevStep = useCallback(() => {
    stopPlayback();
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, [stopPlayback]);

  const goToStep = useCallback(
    (idx: number) => {
      stopPlayback();
      setCurrentStep(idx);
    },
    [stopPlayback],
  );

  if (!isOpen) return null;

  const step = STEP_CONFIGS[currentStep];

  // Match stage from real trace
  const matchedStage: TranspileStageSummary | undefined = trace?.stages.find((s) => {
    if (step.stageName === 'Init') return s.stageName.toLowerCase().includes('init') || s.stageName.toLowerCase().includes('analysis');
    if (step.stageName === 'Mapping') return s.stageName.toLowerCase().includes('layout') || s.stageName.toLowerCase().includes('mapping');
    if (step.stageName === 'Routing') return s.stageName.toLowerCase().includes('routing');
    if (step.stageName === 'Translation') return s.stageName.toLowerCase().includes('translation') || s.stageName.toLowerCase().includes('basis');
    if (step.stageName === 'Optimization') return s.stageName.toLowerCase().includes('optimiz');
    if (step.stageName === 'Scheduling') return s.stageName.toLowerCase().includes('schedul');
    return false;
  });

  return (
    <div className="cpc-overlay" role="dialog" aria-modal="true" aria-labelledby="cpc-title">
      <div className="cpc-window">
        {/* ── HEADER ── */}
        <header className="cpc-header">
          <div className="cpc-header-left">
            <span className="cpc-header-icon">⚛️</span>
            <div>
              <h2 id="cpc-title" className="cpc-header-title">
                Real-Time Compilation: Simulation vs IBM Hardware
              </h2>
              <span className="cpc-header-subtitle">
                Live Analysis for Circuit ({qubitCount} qubits · {gateCount} gates)
              </span>
            </div>
          </div>

          <div className="cpc-header-right">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>Target Backend:</label>
              <select
                value={targetBackend}
                onChange={(e) => setTargetBackend(e.target.value)}
                style={{
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  backgroundColor: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  color: 'var(--color-text)',
                }}
              >
                <option value="ibm_brisbane">ibm_brisbane (127Q)</option>
                <option value="ibm_kyoto">ibm_kyoto (127Q)</option>
                <option value="ibm_osaka">ibm_osaka (127Q)</option>
              </select>

              <label style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>Opt Level:</label>
              <select
                value={optLevel}
                onChange={(e) => setOptLevel(Number(e.target.value))}
                style={{
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  backgroundColor: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  color: 'var(--color-text)',
                }}
              >
                <option value={0}>0 (None)</option>
                <option value={1}>1 (Light)</option>
                <option value={2}>2 (Medium)</option>
                <option value={3}>3 (Aggressive)</option>
              </select>

              <button
                onClick={fetchLiveTrace}
                className="btn btn--sm"
                title="Re-run live transpilation analysis"
                style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              >
                ↻ Refresh
              </button>
            </div>

            <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        {/* ── STEP TIMELINE ── */}
        <nav className="cpc-timeline" aria-label="Compilation steps">
          {STEP_CONFIGS.map((s, idx) => {
            const isActive = idx === currentStep;
            const isVisited = idx < currentStep;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  className={`cpc-timeline-step${isActive ? ' active' : ''}${isVisited ? ' visited' : ''}`}
                  onClick={() => goToStep(idx)}
                  title={s.name}
                >
                  <span className="step-num">{isVisited ? '✓' : idx + 1}</span>
                  <span>{s.name}</span>
                </button>
                {idx < STEP_CONFIGS.length - 1 && (
                  <span className={`cpc-timeline-connector${isVisited ? ' visited' : ''}`} />
                )}
              </div>
            );
          })}
        </nav>

        {/* ── BODY: SPLIT VIEW ── */}
        <div className="cpc-body">
          {loadingTrace && (
            <div style={{ padding: '8px 24px', backgroundColor: 'var(--color-surface-2)', fontSize: '0.75rem', color: 'var(--color-primary)' }}>
              ⚡ Updating real-time compilation trace from Qiskit compiler engine…
            </div>
          )}

          {traceError && (
            <div style={{ padding: '8px 24px', backgroundColor: 'rgba(248, 113, 113, 0.1)', color: 'var(--color-error)', fontSize: '0.75rem' }}>
              ⚠️ Live compiler note: {traceError} (Displaying calibrated educational baseline)
            </div>
          )}

          <div className="cpc-split-view">
            {/* LEFT: Simulation Path */}
            <div className="cpc-path-panel sim" key={`sim-${step.id}`}>
              <div className="cpc-path-header">
                <span className="cpc-path-badge sim">🔵 SIMULATION PATH</span>
                <span className="cpc-path-label">Qiskit Aer / Statevector (Local)</span>
              </div>

              <div className={`cpc-stage-card sim${step.sim.status === 'skipped' ? ' skipped' : ''}`}>
                <div className="cpc-stage-title">
                  <span className="cpc-stage-icon">{step.icon}</span>
                  <span className="cpc-stage-name">{step.sim.title}</span>
                  <span className={`cpc-stage-status ${step.sim.status === 'skipped' ? 'skipped' : 'active'}`}>
                    {step.sim.status === 'skipped' ? '⏭ SKIPPED' : '✅ ACTIVE'}
                  </span>
                </div>

                <p className="cpc-stage-desc">{step.sim.description}</p>
                <div className={`cpc-callout ${step.sim.callout.type}`}>{step.sim.callout.text}</div>

                <div className="cpc-circuit-box">
                  <div className="cpc-circuit-box-label">Simulation Circuit Model</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                    {step.sim.status === 'skipped'
                      ? 'No transformation applied. Circuit remains unchanged:'
                      : 'Raw Abstract Input Circuit:'}
                  </div>
                  <pre className="cpc-circuit-ascii">
                    {qasm.split('\n').slice(0, 10).join('\n')}
                    {qasm.split('\n').length > 10 ? '\n...' : ''}
                  </pre>
                </div>

                {/* Simulation Metrics */}
                <div className="cpc-metrics">
                  <div className="cpc-metric">
                    <span className="cpc-metric-label">Qubits</span>
                    <span className="cpc-metric-value">{qubitCount} (Virtual)</span>
                  </div>
                  <div className="cpc-metric">
                    <span className="cpc-metric-label">Gates</span>
                    <span className="cpc-metric-value">{gateCount}</span>
                  </div>
                  <div className="cpc-metric">
                    <span className="cpc-metric-label">SWAP Overhead</span>
                    <span className="cpc-metric-value improved">0 SWAPs</span>
                  </div>
                  <div className="cpc-metric">
                    <span className="cpc-metric-label">Noise Floor</span>
                    <span className="cpc-metric-value improved">0.00% (Exact)</span>
                  </div>
                </div>
              </div>

              {/* Execution Actions for Simulation */}
              {step.id === 'execution' && (
                <div className="cpc-stage-card sim" style={{ marginTop: '12px' }}>
                  <div className="cpc-stage-title">
                    <span className="cpc-stage-icon">⚡</span>
                    <span className="cpc-stage-name">Run Simulation Now</span>
                  </div>
                  <p className="cpc-stage-desc">
                    Execute this abstract circuit immediately with full exact statevector amplitudes.
                  </p>
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => {
                      onClose();
                      if (onExecuteSim) onExecuteSim();
                    }}
                    style={{ marginTop: '10px', width: '100%' }}
                  >
                    ▶ Launch Aer Simulation
                  </button>
                </div>
              )}
            </div>

            {/* DIVIDER */}
            <div className="cpc-divider" />

            {/* RIGHT: Real Hardware Path */}
            <div className="cpc-path-panel hw" key={`hw-${step.id}`}>
              <div className="cpc-path-header">
                <span className="cpc-path-badge hw">🔴 HARDWARE PATH</span>
                <span className="cpc-path-label">
                  Target: {targetBackend} (QPU ISA)
                </span>
              </div>

              <div className="cpc-stage-card hw active-step">
                <div className="cpc-stage-title">
                  <span className="cpc-stage-icon">{step.icon}</span>
                  <span className="cpc-stage-name">{step.hw.title}</span>
                  <span className="cpc-stage-status transforms">⚙ TRANSFORMS</span>
                </div>

                <p className="cpc-stage-desc">{step.hw.description}</p>
                <div className={`cpc-callout ${step.hw.callout.type}`}>{step.hw.callout.text}</div>

                {/* Live Data from Real Trace */}
                {matchedStage && (
                  <div style={{ marginTop: '12px', padding: '10px', backgroundColor: 'var(--color-surface-2)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: '6px' }}>
                      Live Compiler Pass Trace ({matchedStage.passes.length} passes · {matchedStage.executionTimeMs.toFixed(1)}ms)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.72rem' }}>
                      <div>Gates: <b>{matchedStage.gateCountBefore} → {matchedStage.gateCountAfter}</b></div>
                      <div>Depth: <b>{matchedStage.depthBefore} → {matchedStage.depthAfter}</b></div>
                      <div>1Q Gates: <b>{matchedStage.oneQGatesAfter}</b></div>
                      <div>2Q Gates: <b>{matchedStage.twoQGatesAfter}</b></div>
                    </div>
                    {matchedStage.swapCount > 0 && (
                      <div style={{ marginTop: '6px', fontSize: '0.72rem', color: 'var(--color-warning)' }}>
                        ⚠️ {matchedStage.swapCount} SWAP gates inserted for hardware coupling compliance.
                      </div>
                    )}
                  </div>
                )}

                {/* Qubit Layout Mapping if in Layout Stage */}
                {step.stageName === 'Mapping' && trace?.logicalToPhysicalLayout && (
                  <div className="cpc-circuit-box">
                    <div className="cpc-circuit-box-label">Logical → Physical Qubit Mapping</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                      {Object.entries(trace.logicalToPhysicalLayout).map(([log, phys]) => (
                        <span
                          key={log}
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--color-surface-3)',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-accent)',
                          }}
                        >
                          {log} ➔ Q{phys}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hardware ISA QASM */}
                <div className="cpc-circuit-box">
                  <div className="cpc-circuit-box-label">
                    {step.id === 'results' || step.id === 'execution' ? 'Final Hardware ISA Circuit' : 'Transpiled Circuit Representation'}
                  </div>
                  <pre className="cpc-circuit-ascii">
                    {(trace?.finalQasm || qasm).split('\n').slice(0, 10).join('\n')}
                    {(trace?.finalQasm || qasm).split('\n').length > 10 ? '\n...' : ''}
                  </pre>
                </div>

                {/* Hardware Live Metrics */}
                <div className="cpc-metrics">
                  <div className="cpc-metric">
                    <span className="cpc-metric-label">Physical Qubits</span>
                    <span className="cpc-metric-value">{trace?.backendNumQubits ?? 127} Qubits</span>
                  </div>
                  <div className="cpc-metric">
                    <span className="cpc-metric-label">Final Gate Count</span>
                    <span className="cpc-metric-value changed">{trace?.finalGateCount ?? gateCount}</span>
                  </div>
                  <div className="cpc-metric">
                    <span className="cpc-metric-label">Total SWAPs</span>
                    <span className="cpc-metric-value changed">{trace?.finalSwapCount ?? 0}</span>
                  </div>
                  <div className="cpc-metric">
                    <span className="cpc-metric-label">Compiled Basis</span>
                    <span className="cpc-metric-value">{trace?.backendBasisGates ? trace.backendBasisGates.slice(0, 3).join(',') : 'rz,sx,x,cz'}</span>
                  </div>
                </div>
              </div>

              {/* Execution Actions for Hardware */}
              {step.id === 'execution' && (
                <div className="cpc-stage-card hw" style={{ marginTop: '12px' }}>
                  <div className="cpc-stage-title">
                    <span className="cpc-stage-icon">🛰️</span>
                    <span className="cpc-stage-name">Submit to Real QPU</span>
                  </div>
                  <p className="cpc-stage-desc">
                    Submit the ISA-compiled circuit to IBM Quantum cloud queue via SamplerV2.
                  </p>
                  <button
                    className="btn btn--secondary btn--sm"
                    onClick={() => {
                      onClose();
                      if (onExecuteHardware) onExecuteHardware();
                    }}
                    style={{ marginTop: '10px', width: '100%', borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
                  >
                    🚀 Submit to IBM Hardware Queue
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Step 10: Comparison Table */}
          {step.id === 'results' && (
            <div style={{ padding: '0 24px 16px' }}>
              <div className="cpc-stage-card sim" style={{ width: '100%' }}>
                <div className="cpc-stage-title">
                  <span className="cpc-stage-icon">⚖️</span>
                  <span className="cpc-stage-name">Real-Time Circuit Metric Summary</span>
                </div>
                <table className="cpc-summary-table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>🔵 Aer Simulation</th>
                      <th>🔴 IBM Hardware ({targetBackend})</th>
                      <th>Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Transpilation</td>
                      <td className="col-sim">Skipped (Direct execution)</td>
                      <td className="col-hw">Mandatory 6 Stages</td>
                      <td>Hardware requires device-specific ISA conformity.</td>
                    </tr>
                    <tr>
                      <td>Gate Count</td>
                      <td className="col-sim">{gateCount} gates</td>
                      <td className="col-hw">{trace?.finalGateCount ?? gateCount} gates</td>
                      <td>Basis decomposition & SWAP insertion change gate count.</td>
                    </tr>
                    <tr>
                      <td>Circuit Depth</td>
                      <td className="col-sim">{circuit.operations.length > 0 ? Math.max(...circuit.operations.map((o) => o.time)) + 1 : 0}</td>
                      <td className="col-hw">{trace?.finalDepth ?? 'Calculated'}</td>
                      <td>Hardware depth accounts for serial routing dependencies.</td>
                    </tr>
                    <tr>
                      <td>Routing SWAPs</td>
                      <td className="col-sim">0 SWAPs</td>
                      <td className="col-hw">{trace?.finalSwapCount ?? 0} SWAPs</td>
                      <td>Inserted only when physical coupling constraints require it.</td>
                    </tr>
                    <tr>
                      <td>Execution Time</td>
                      <td className="col-sim">&lt; 100ms (CPU/GPU)</td>
                      <td className="col-hw">Minutes / Hours (Queue)</td>
                      <td>Simulation runs locally; hardware queues via IBM cloud.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Takeaway banner */}
          <div style={{ padding: '0 24px 16px', background: 'var(--color-bg)' }}>
            <div className="cpc-takeaway">
              <span className="cpc-takeaway-icon">💡</span>
              <div
                className="cpc-takeaway-text"
                dangerouslySetInnerHTML={{ __html: step.takeaway }}
              />
            </div>
          </div>
        </div>

        {/* ── PLAYBACK FOOTER ── */}
        <footer className="cpc-footer">
          <button
            className="btn btn--ghost btn--sm cpc-pb-btn"
            onClick={() => goToStep(0)}
            title="Reset to first step"
            aria-label="Reset"
          >
            ⏮
          </button>
          <button
            className="btn btn--ghost btn--sm cpc-pb-btn"
            onClick={prevStep}
            disabled={currentStep === 0}
            aria-label="Previous step"
          >
            ◀ Prev
          </button>

          {isPlaying ? (
            <button className="btn btn--primary btn--sm cpc-pb-play" onClick={pause} aria-label="Pause">
              ⏸ Pause
            </button>
          ) : (
            <button className="btn btn--primary btn--sm cpc-pb-play" onClick={play} aria-label="Play">
              ▶ Play
            </button>
          )}

          <button
            className="btn btn--ghost btn--sm cpc-pb-btn"
            onClick={nextStep}
            disabled={currentStep === STEP_CONFIGS.length - 1}
            aria-label="Next step"
          >
            Next ▶
          </button>

          <div className="cpc-pb-progress">
            <div
              className="cpc-pb-progress-bar"
              style={{
                width: `${((currentStep + 1) / STEP_CONFIGS.length) * 100}%`,
              }}
            />
          </div>

          <span className="cpc-pb-label">
            {step.icon} {step.name}
          </span>
        </footer>
      </div>
    </div>
  );
}
