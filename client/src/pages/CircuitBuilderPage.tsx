import { useCallback, useState } from 'react';
import type { GateType } from '../circuit';
import {
  addClbit,
  addQubit,
  deleteGate,
  getDependentOperations,
  placeGate,
  removeWireWithDependents,
} from '../circuit';
import CircuitCanvas from '../components/circuit-builder/CircuitCanvas';
import GatePalette from '../components/circuit-builder/GatePalette';
import WireList from '../components/circuit-builder/WireList';
import UndoRedoControls from '../components/circuit-builder/UndoRedoControls';
import CodePanel from '../components/circuit-builder/CodePanel';
import ValidationSummaryPanel from '../components/circuit-builder/ValidationSummaryPanel';
import ExportControls from '../components/circuit-builder/ExportControls';
import { useCircuitHistory } from '../hooks/useCircuitHistory';

/**
 * CircuitBuilderPage is the top-level page for the visual quantum circuit editor.
 * It owns the circuit state via useCircuitHistory and passes props to child components.
 */
export default function CircuitBuilderPage() {
  const { circuit, canUndo, canRedo, push, undo, redo } = useCircuitHistory();
  const [selectedGate, setSelectedGate] = useState<GateType | null>(null);

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
    (type: GateType, qubitIndex: number, time: number) => {
      try {
        const { circuit: updated } = placeGate(circuit, type, { qubits: [qubitIndex] }, time);
        push(updated);
      } catch {
        // Validation error — gate can't be placed here (e.g. CX needs 2 qubits)
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
        <ExportControls circuit={circuit} />
      </div>

      <div className="builder__workspace">
        <GatePalette selectedGate={selectedGate} onSelectGate={setSelectedGate} />

        <div className="builder__center">
          <CircuitCanvas
            circuit={circuit}
            selectedGate={selectedGate}
            onPlaceGate={handlePlaceGate}
            onDeleteGate={handleDeleteGate}
          />
        </div>

        <div className="builder__sidebar">
          <CodePanel circuit={circuit} />
          <ValidationSummaryPanel circuit={circuit} />
        </div>
      </div>
    </div>
  );
}
