/**
 * CompilationPathComparison.tsx
 *
 * Real-Time Educational & Execution Comparison:
 * Shows the live, side-by-side difference between Qiskit Simulation (Aer)
 * and real IBM Hardware compilation for the user's active circuit.
 *
 * Features:
 * - Beginner-friendly DAG (Directed Acyclic Graph) visual flowchart & explainer
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
  type DagData,
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
    name: '2. DAG Flowchart',
    stageName: 'Analysis',
    sim: {
      status: 'passthrough',
      title: 'DAG as a Read-Only Recipe',
      description:
        'A DAG (Directed Acyclic Graph) is simply a "Dependency Flowchart" of your gates. For simulation, Aer reads this recipe step-by-step to compute the math, without needing to rearrange or modify anything.',
      callout: {
        type: 'info',
        text: 'Analogy: Like following a baking recipe in order. You read the steps, but you don’t need to rewrite the cookbook.',
      },
    },
    hw: {
      status: 'transforms',
      title: 'DAG as a Working Blueprint',
      description:
        'For hardware, the DAG is an active blueprint. The compiler searches the graph for gates that can be cancelled (e.g. X·X=I), reordered, or replaced with physical native pulses.',
      callout: {
        type: 'note',
        text: 'Analogy: Like editing a movie script. The compiler cuts out unnecessary scenes, replaces complex stunts with standard moves, and rearranges actions for the actors (qubits).',
      },
    },
    takeaway:
      'A DAG is a **gate dependency flowchart** (Arrows = Qubit wires, Nodes = Gates). Simulation **reads it in order**; Hardware **rewrites and optimizes it**.',
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

// ─────────────────────────────────────────────────────────────────────────────
// DAG SVG Layout Computer for Beginners
// ─────────────────────────────────────────────────────────────────────────────

function computeDagLayout(dagData: DagData, width = 420, height = 180) {
  const { nodes, edges } = dagData;
  if (!nodes.length) return null;

  const inEdges: Record<string, string[]> = {};
  const nodeMap: Record<string, (typeof nodes)[0]> = {};
  nodes.forEach((n) => { inEdges[n.id] = []; nodeMap[n.id] = n; });
  edges.forEach((e) => { if (inEdges[e.target]) inEdges[e.target].push(e.source); });

  const wireLanes: string[] = [];
  const nodeLaneMap: Record<string, number> = {};

  nodes.forEach((n) => {
    let wireName = 'q[0]';
    if (n.label.includes('q[')) {
      const match = n.label.match(/q\[\d+\]/);
      if (match) wireName = match[0];
    } else if (n.label.includes('c[')) {
      const match = n.label.match(/c\[\d+\]/);
      if (match) wireName = match[0];
    }
    if (!wireLanes.includes(wireName)) wireLanes.push(wireName);
    nodeLaneMap[n.id] = wireLanes.indexOf(wireName);
  });

  if (wireLanes.length === 0) wireLanes.push('q[0]');

  const layers: Record<string, number> = {};
  const visited = new Set<string>();
  function getRank(nodeId: string): number {
    if (layers[nodeId] !== undefined) return layers[nodeId];
    const node = nodeMap[nodeId];
    if (!node || node.type === 'in' || inEdges[nodeId].length === 0) return (layers[nodeId] = 0);
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);
    let maxParent = 0;
    inEdges[nodeId].forEach((pId) => { maxParent = Math.max(maxParent, getRank(pId)); });
    visited.delete(nodeId);
    return (layers[nodeId] = maxParent + 1);
  }

  nodes.forEach((n) => getRank(n.id));
  let maxRank = 0;
  nodes.forEach((n) => { if (layers[n.id] > maxRank) maxRank = layers[n.id]; });
  nodes.forEach((n) => { if (n.type === 'out') layers[n.id] = maxRank + 1; });
  maxRank = 0;
  nodes.forEach((n) => { if (layers[n.id] > maxRank) maxRank = layers[n.id]; });

  const numLanes = Math.max(1, wireLanes.length);
  const paddingX = 45;
  const paddingY = 28;
  const totalLayers = Math.max(1, maxRank);

  const nodeWidths: Record<string, number> = {};
  const positions: Record<string, { x: number; y: number }> = {};

  nodes.forEach((n) => {
    const displayLabel = n.label.startsWith('node_') ? 'Gate' : n.label;
    const badgeW = Math.max(42, displayLabel.length * 7 + 16);
    nodeWidths[n.id] = badgeW;

    const rank = layers[n.id] || 0;
    const x = paddingX + (rank / totalLayers) * (width - 2 * paddingX);
    const laneIdx = nodeLaneMap[n.id] ?? 0;
    const y = paddingY + (laneIdx / Math.max(1, numLanes - 1)) * (height - 2 * paddingY);
    positions[n.id] = { x, y: numLanes === 1 ? height / 2 : y };
  });

  return { positions, nodes, edges, nodeWidths, wireLanes };
}

function DagVisualGraph({
  dagData,
  width = 420,
  height = 180,
}: {
  dagData: DagData | null | undefined;
  width?: number;
  height?: number;
}) {
  const layout = useMemo(() => (dagData ? computeDagLayout(dagData, width, height) : null), [dagData, width, height]);
  const markerId = useMemo(() => `dag-arrow-${Math.random().toString(36).slice(2, 7)}`, []);

  if (!dagData || !layout || dagData.nodes.length === 0) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
        No DAG graph captured yet.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', background: 'var(--color-surface-2)', borderRadius: '8px', padding: '10px', border: '1px solid var(--color-border)' }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width, display: 'block', margin: '0 auto' }}>
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--color-text-muted)" />
          </marker>
        </defs>

        {layout.edges.map((edge, idx) => {
          const p1 = layout.positions[edge.source];
          const p2 = layout.positions[edge.target];
          if (!p1 || !p2) return null;

          const w1 = layout.nodeWidths[edge.source] || 40;
          const w2 = layout.nodeWidths[edge.target] || 40;
          const h = 22;

          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          const startX = p1.x + (w1 / 2) * (dx / dist);
          const startY = p1.y + (h / 2) * (dy / dist);
          const endX = p2.x - (w2 / 2 + 4) * (dx / dist);
          const endY = p2.y - (h / 2 + 4) * (dy / dist);

          return (
            <g key={idx}>
              <line
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke="var(--color-border-strong)"
                strokeWidth="1.5"
                markerEnd={`url(#${markerId})`}
              />
              {edge.label && (
                <text
                  x={(startX + endX) / 2}
                  y={(startY + endY) / 2 - 4}
                  textAnchor="middle"
                  fontSize="7"
                  fill="var(--color-text-muted)"
                  fontFamily="var(--font-mono)"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {layout.nodes.map((node) => {
          const pos = layout.positions[node.id];
          if (!pos) return null;
          const isGate = node.type === 'gate';
          const isIn = node.type === 'in';
          const isOut = node.type === 'out';
          const isMeasure = node.label.toLowerCase().includes('measure');
          const is2Q = ['CX', 'ECR', 'CZ', 'SWAP'].some((g) => node.label.toUpperCase().includes(g));

          let fill = 'var(--color-surface-3)';
          let stroke = 'var(--color-border-strong)';
          let textFill = 'var(--color-text)';

          if (isGate && is2Q) {
            fill = 'rgba(167, 139, 250, 0.18)';
            stroke = 'var(--color-accent)';
            textFill = 'var(--color-accent)';
          } else if (isGate && isMeasure) {
            fill = 'rgba(251, 191, 36, 0.15)';
            stroke = 'var(--color-warning)';
            textFill = 'var(--color-warning)';
          } else if (isGate) {
            fill = 'var(--color-primary-dim)';
            stroke = 'var(--color-primary)';
            textFill = 'var(--color-primary)';
          } else if (isIn) {
            fill = 'var(--color-surface-3)';
            stroke = 'var(--color-border-strong)';
            textFill = 'var(--color-text-muted)';
          } else if (isOut) {
            fill = 'rgba(52, 211, 153, 0.12)';
            stroke = 'var(--color-success)';
            textFill = 'var(--color-success)';
          }

          const displayLabel = node.label.startsWith('node_') || node.label.startsWith('<') ? 'Gate' : node.label;
          const w = layout.nodeWidths[node.id] || 44;
          const h = 22;

          return (
            <g key={node.id} style={{ cursor: 'pointer' }}>
              <title>{`${node.label} (${node.type})`}</title>
              <rect
                x={pos.x - w / 2}
                y={pos.y - h / 2}
                width={w}
                height={h}
                rx={5}
                ry={5}
                fill={fill}
                stroke={stroke}
                strokeWidth="1.5"
              />
              <text
                x={pos.x}
                y={pos.y + 3.5}
                textAnchor="middle"
                fontSize="7.5"
                fontWeight="bold"
                fill={textFill}
                fontFamily="var(--font-mono)"
              >
                {displayLabel}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: '12px', marginTop: '6px', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '3px', background: 'var(--color-primary-dim)', border: '1px solid var(--color-primary)' }} /> 1Q Gate
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '3px', background: 'rgba(167,139,250,0.18)', border: '1px solid var(--color-accent)' }} /> 2Q Gate
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '3px', background: 'rgba(52,211,153,0.12)', border: '1px solid var(--color-success)' }} /> Wire In / Out
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Beginner DAG Explainer Card
// ─────────────────────────────────────────────────────────────────────────────

function BeginnerDagExplainer() {
  return (
    <div className="cpc-dag-explainer">
      <div className="cpc-dag-explainer-title">
        <span>💡 What is a DAG? (Beginner Guide)</span>
      </div>

      <div className="cpc-dag-letters">
        <div className="cpc-dag-letter-card">
          <div className="letter-badge">D</div>
          <div className="letter-title">Directed</div>
          <div className="letter-desc">Arrows only point <strong>forward in time</strong> (left ➔ right).</div>
        </div>

        <div className="cpc-dag-letter-card">
          <div className="letter-badge">A</div>
          <div className="letter-title">Acyclic</div>
          <div className="letter-desc"><strong>No loops</strong>. Quantum states cannot travel back in time.</div>
        </div>

        <div className="cpc-dag-letter-card">
          <div className="letter-badge">G</div>
          <div className="letter-title">Graph</div>
          <div className="letter-desc"><strong>Circles</strong> = Gates (H, CX). <strong>Arrows</strong> = Qubit wires.</div>
        </div>
      </div>

      <div className="cpc-dag-comparison-box">
        <div className="cpc-dag-comparison-col">
          <div className="col-header">1. Circuit View (Drawing)</div>
          <div className="col-visual">
            <div>q0 ──[ H ]──●─────</div>
            <div>           │     </div>
            <div>q1 ────────[ + ]───</div>
          </div>
          <div className="col-note">Shows gates in fixed visual columns.</div>
        </div>

        <div className="cpc-dag-comparison-arrow">➔</div>

        <div className="cpc-dag-comparison-col">
          <div className="col-header">2. DAG View (Flowchart)</div>
          <div className="col-visual">
            <div>(q0_in) ➔ [ H ] ➔ [ CX_ctrl ] ➔ (q0_out)</div>
            <div>                       │                 </div>
            <div>(q1_in) ──────────➔ [ CX_targ ] ➔ (q1_out)</div>
          </div>
          <div className="col-note">Reveals the TRUE gate dependencies.</div>
        </div>
      </div>

      <div className="cpc-dag-benefit">
        🎯 <strong>Why does the compiler use it?</strong> It lets Qiskit instantly see which gates can run in parallel, which gates cancel out (like X·X=I), and where SWAP gates must be inserted!
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

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

          {/* STEP 2 SPECIAL: Beginner-friendly DAG Explainer Card */}
          {step.id === 'dag' && (
            <div style={{ padding: '14px 24px 0' }}>
              <BeginnerDagExplainer />
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

                {/* If Step 2 DAG: show visual DAG graph */}
                {step.id === 'dag' && trace?.initialDag ? (
                  <div className="cpc-circuit-box">
                    <div className="cpc-circuit-box-label">Live Circuit Dependency Graph (Read-Only)</div>
                    <DagVisualGraph dagData={trace.initialDag} />
                  </div>
                ) : (
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
                )}

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

                {/* If Step 2 DAG: show live mutable DAG graph */}
                {step.id === 'dag' && trace?.initialDag ? (
                  <div className="cpc-circuit-box">
                    <div className="cpc-circuit-box-label">Compiler Working DAG Graph (Target for Rewrite Passes)</div>
                    <DagVisualGraph dagData={trace.initialDag} />
                  </div>
                ) : (
                  <>
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
                  </>
                )}

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
