/**
 * PlatformGuideModal.tsx
 *
 * Interactive Onboarding & User Guide for Quantum Studio.
 * Teaches new students and researchers the complete workflow:
 * Learn ➔ Build ➔ Transpile ➔ Run ➔ Analyze
 */
import { useState } from 'react';
import './PlatformGuideModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToBuilder?: () => void;
}

interface GuideSection {
  id: string;
  tabLabel: string;
  icon: string;
  title: string;
  description: string;
  features: Array<{ icon: string; title: string; desc: string }>;
  example?: string;
  tip: string;
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'overview',
    tabLabel: '1. Quickstart Tour',
    icon: '🚀',
    title: 'Welcome to Quantum Studio',
    description:
      'Quantum Studio is an interactive virtual quantum laboratory designed to help you learn, build, compile, and execute quantum algorithms on classical simulators and real superconducting quantum processors.',
    features: [
      {
        icon: '🔬',
        title: 'Visual Circuit Lab',
        desc: 'Drag and drop gates on quantum wires. Watch live statevectors, Dirac math, and Bloch spheres update instantly.',
      },
      {
        icon: '💻',
        title: 'Multi-Framework Code Lab',
        desc: 'Auto-generates clean code in Qiskit, Cirq, PennyLane, TKET, Amazon Braket, and SpinQIT.',
      },
      {
        icon: '⚙️',
        title: 'Transparent Transpiler',
        desc: 'Inspect how Qiskit transforms high-level circuits into hardware ISA pulses, tracking SWAP gates and coupling maps.',
      },
      {
        icon: '🤖',
        title: 'Context-Aware AI Tutor',
        desc: 'Ask questions directly about your active circuit or explore mathematical physics concepts in real time.',
      },
    ],
    tip: '💡 Tip: Beginners can switch on "Learning Mode" in the Circuit Builder toolbar to simplify the interface and get live mathematical explanations!',
  },
  {
    id: 'builder',
    tabLabel: '2. Circuit Lab',
    icon: '🔬',
    title: 'Building Quantum Circuits',
    description:
      'The Circuit Builder is where your ideas take physical form. You drag quantum gates from the palette on the left and place them along qubit timelines.',
    features: [
      {
        icon: '🎛️',
        title: 'Gate Palette & Info',
        desc: 'Includes Pauli (X, Y, Z), Superposition (H), Phase (S, T), Rotations (Rx, Ry, Rz), Entanglement (CX, CZ, SWAP), and Measurement.',
      },
      {
        icon: '🌐',
        title: 'Live State Visualizers',
        desc: 'Dirac notation (|ψ⟩), Probability distribution bar charts, and 3D Bloch spheres update in real time on every gate placement.',
      },
      {
        icon: '💡',
        title: 'Explain My Circuit',
        desc: 'Click "Explain Circuit" to get an immediate plain-English breakdown of your algorithm and expected measurement probabilities.',
      },
      {
        icon: '📐',
        title: 'Step Simulation',
        desc: 'Use step controls to scrub time forward and backward to see how quantum states evolve layer by layer.',
      },
    ],
    example: `// Example: Creating an Entangled Bell State (|Φ+⟩)
1. Drag 'H' gate onto Wire q[0]  ➔ Creates equal superposition
2. Drag 'CX' gate (Control: q[0], Target: q[1]) ➔ Entangles qubits
3. Add 'Measure' gates ➔ 50% chance |00⟩, 50% chance |11⟩`,
    tip: '💡 Tip: Click the ⓘ icon on any gate in the palette to see its exact mathematical matrix, transformation rule, and Bloch rotation!',
  },
  {
    id: 'transpile',
    tabLabel: '3. Transpilation & Hardware',
    icon: '⚙️',
    title: 'Why Compilation Matters in Quantum',
    description:
      'Unlike classical code, quantum hardware has strict physical limits: fixed qubit coupling (nearest-neighbor connectivity) and native calibrated microwave basis gates.',
    features: [
      {
        icon: '🔵',
        title: 'Simulation Path (Aer)',
        desc: 'Computes matrix math directly in memory on virtual qubits. Skips routing and decomposition overhead with 0 added noise.',
      },
      {
        icon: '🔴',
        title: 'Hardware Path (IBM QPU)',
        desc: 'Must pass through 6 mandatory transpiler stages (Init, Layout, Routing, Translation, Optimization, Scheduling) to create valid ISA pulses.',
      },
      {
        icon: '⚖️',
        title: 'Sim vs Hardware Tool',
        desc: 'Click "⚖️ Sim vs Hardware" in the toolbar to see a live, side-by-side comparison of both paths for your active circuit.',
      },
      {
        icon: '🌐',
        title: 'DAG Flowchart',
        desc: 'Inspect the Directed Acyclic Graph to see true gate dependencies without confusing visual grid columns.',
      },
    ],
    tip: '💡 Tip: Good transpilation minimizes circuit depth and SWAP gates, protecting your qubits from environmental decoherence (T1 / T2)!',
  },
  {
    id: 'run',
    tabLabel: '4. Run & Analyze Results',
    icon: '📊',
    title: 'Executing & Interpreting Results',
    description:
      'Execute your quantum circuit on your computer or dispatch it to real superconducting transmon processors in IBM’s quantum cloud.',
    features: [
      {
        icon: '🖥️',
        title: 'Local Aer Simulator',
        desc: 'Runs instantly on your CPU/GPU with exact probability amplitudes and zero cloud queue waiting.',
      },
      {
        icon: '☁️',
        title: 'Real IBM QPUs',
        desc: 'Connect your API token in Settings to execute on 127-qubit quantum processors like ibm_brisbane or ibm_osaka.',
      },
      {
        icon: '📊',
        title: 'Histogram Analysis',
        desc: 'Results display exact shot counts, percentage frequencies, and explain the physical meaning of your measurement collapse.',
      },
      {
        icon: '📥',
        title: 'Export & Share',
        desc: 'Export experiment summaries to PDF or download raw JSON results for research papers and laboratory reports.',
      },
    ],
    tip: '💡 Tip: When running on real hardware, small residual counts (e.g. 2% on unexpected states) reflect real physical noise and readout errors!',
  },
];

export default function PlatformGuideModal({ isOpen, onClose, onNavigateToBuilder }: Props) {
  const [activeTab, setActiveTab] = useState(0);

  if (!isOpen) return null;

  const current = GUIDE_SECTIONS[activeTab];

  return (
    <div className="platform-guide-overlay" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div className="platform-guide-window">
        {/* Header */}
        <header className="platform-guide-header">
          <div className="platform-guide-title-box">
            <span className="platform-guide-icon">📖</span>
            <div>
              <h2 id="guide-title" className="platform-guide-title">
                Quantum Studio User Guide & Workflow
              </h2>
              <span className="platform-guide-subtitle">
                Mastering the Quantum Laboratory: Learn · Build · Compile · Execute · Understand
              </span>
            </div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close guide">
            ✕
          </button>
        </header>

        {/* Navigation Tabs */}
        <nav className="platform-guide-nav" aria-label="Guide sections">
          {GUIDE_SECTIONS.map((sec, idx) => (
            <button
              key={sec.id}
              className={`platform-guide-tab${idx === activeTab ? ' active' : ''}`}
              onClick={() => setActiveTab(idx)}
            >
              <span>{sec.icon}</span>
              <span>{sec.tabLabel}</span>
            </button>
          ))}
        </nav>

        {/* Body */}
        <div className="platform-guide-body">
          <div className="guide-step-card">
            <div className="guide-step-heading">
              <span className="guide-step-num">{activeTab + 1}</span>
              <div>
                <h3 className="guide-step-title">{current.title}</h3>
              </div>
            </div>

            <p className="guide-step-desc">{current.description}</p>

            {/* Feature Cards Grid */}
            <div className="guide-grid">
              {current.features.map((feat) => (
                <div key={feat.title} className="guide-feature-box">
                  <span className="guide-feature-icon">{feat.icon}</span>
                  <div className="guide-feature-title">{feat.title}</div>
                  <div className="guide-feature-desc">{feat.desc}</div>
                </div>
              ))}
            </div>

            {/* Code / Walkthrough Example */}
            {current.example && (
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: '6px' }}>
                  Interactive Walkthrough
                </div>
                <div className="guide-code-example">{current.example}</div>
              </div>
            )}

            {/* Tip Banner */}
            <div className="guide-tip-banner">{current.tip}</div>
          </div>
        </div>

        {/* Footer */}
        <footer className="platform-guide-footer">
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setActiveTab((prev) => Math.max(prev - 1, 0))}
            disabled={activeTab === 0}
          >
            ◀ Previous
          </button>

          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
            Section {activeTab + 1} of {GUIDE_SECTIONS.length}
          </span>

          {activeTab < GUIDE_SECTIONS.length - 1 ? (
            <button
              className="btn btn--primary btn--sm"
              onClick={() => setActiveTab((prev) => Math.min(prev + 1, GUIDE_SECTIONS.length - 1))}
            >
              Next Section ▶
            </button>
          ) : (
            <button
              className="btn btn--primary btn--sm"
              onClick={() => {
                onClose();
                if (onNavigateToBuilder) onNavigateToBuilder();
              }}
            >
              🚀 Start Building in Circuit Lab
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
