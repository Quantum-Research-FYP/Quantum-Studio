import { useEffect, useState, useMemo } from 'react';
import type { CircuitModel } from '../../circuit';
import CircuitCanvas from './CircuitCanvas';
import './TranspilationSimulationModal.css';

interface TranspilationSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  circuit: CircuitModel;
}

const PHASES = [
  { id: 'original', name: 'Original Circuit', desc: 'Loading the initial logical circuit.' },
  {
    id: 'analysis',
    name: 'Circuit Analysis',
    desc: 'Analyzing depth, gates, and qubit dependencies.',
  },
  {
    id: 'optimization',
    name: 'Optimization',
    desc: 'Canceling adjacent inverse gates and consolidating 1Q operations.',
  },
  {
    id: 'basis',
    name: 'Basis Conversion',
    desc: 'Unrolling into the native gate set (e.g., CX, ID, RZ, SX, X).',
  },
  {
    id: 'mapping',
    name: 'Qubit Mapping',
    desc: 'Assigning logical qubits to physical hardware qubits.',
  },
  {
    id: 'routing',
    name: 'Routing',
    desc: 'Inserting SWAP gates to satisfy hardware coupling map constraints.',
  },
  {
    id: 'scheduling',
    name: 'Scheduling',
    desc: 'Aligning gates with hardware instruction timing.',
  },
  {
    id: 'final',
    name: 'Final Hardware Circuit',
    desc: 'Transpilation complete. Circuit is ready for execution.',
  },
];

export default function TranspilationSimulationModal({
  isOpen,
  onClose,
  circuit,
}: TranspilationSimulationModalProps) {
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCurrentPhaseIndex(0);
      setIsFinished(false);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;

    const advancePhase = () => {
      setCurrentPhaseIndex((prev) => {
        if (prev < PHASES.length - 1) {
          timeoutId = setTimeout(advancePhase, 2000); // 2 seconds per phase
          return prev + 1;
        } else {
          setIsFinished(true);
          return prev;
        }
      });
    };

    timeoutId = setTimeout(advancePhase, 2000);

    return () => clearTimeout(timeoutId);
  }, [isOpen]);

  const displayCircuit: CircuitModel = useMemo(() => {
    // deep clone so we can modify it
    const newCircuit = JSON.parse(JSON.stringify(circuit)) as CircuitModel;

    if (currentPhaseIndex >= 3) {
      newCircuit.operations = newCircuit.operations.map((op) => {
        if (
          op.targets.qubits.length === 1 &&
          !['RZ', 'SX', 'X', 'ID', 'MEASURE'].includes(op.type)
        ) {
          return { ...op, type: 'SX' };
        }
        if (op.targets.qubits.length > 1 && op.type !== 'CX' && op.type !== 'MEASURE') {
          return { ...op, type: 'CX' };
        }
        return op;
      });
    }

    if (currentPhaseIndex >= 5 && newCircuit.qubits > 1) {
      // Add a mock SWAP gate
      const maxTime =
        newCircuit.operations.length > 0
          ? Math.max(...newCircuit.operations.map((o) => o.time))
          : 0;
      newCircuit.operations.push({
        id: 'mock-swap',
        type: 'SWAP',
        targets: { qubits: [0, 1] },
        time: maxTime + 1,
      });
    }

    return newCircuit;
  }, [circuit, currentPhaseIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="transpilation-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transpilation-title"
    >
      <div className="transpilation-modal-content">
        <header className="transpilation-modal-header">
          <h2 id="transpilation-title">Qiskit Transpilation Simulation</h2>
          <button
            className="btn btn--ghost btn--sm transpilation-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </header>

        <div className="transpilation-modal-body">
          <div className="transpilation-stepper">
            {PHASES.map((phase, index) => {
              const isPast = index < currentPhaseIndex;
              const isCurrent = index === currentPhaseIndex;

              let statusClass = 'pending';
              if (isPast) statusClass = 'completed';
              if (isCurrent) statusClass = 'active';

              return (
                <div key={phase.id} className={`transpilation-step ${statusClass}`}>
                  <div className="transpilation-step-indicator">{isPast ? '✓' : index + 1}</div>
                  <div className="transpilation-step-details">
                    <h4 className="transpilation-step-title">{phase.name}</h4>
                    {isCurrent && <p className="transpilation-step-desc">{phase.desc}</p>}
                  </div>
                  {index < PHASES.length - 1 && <div className="transpilation-step-connector" />}
                </div>
              );
            })}
          </div>

          <div className="transpilation-visualizer">
            <div
              className="transpilation-visualizer-circuit phase-transition"
              style={{ pointerEvents: 'none' }}
            >
              <CircuitCanvas
                circuit={displayCircuit}
                selectedGate={null}
                errorOperationIds={new Set()}
                onPlaceGate={() => {}}
                onDeleteGate={() => {}}
              />
            </div>

            {isFinished && (
              <div className="transpilation-success">
                <p>Transpilation successfully mapped to hardware topology.</p>
                <button className="btn btn--primary" onClick={onClose}>
                  Finish
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
