import type { GateType } from '../../circuit';

/**
 * GatePalette provides clickable gate buttons for the supported v1 gate set.
 * Users select a gate from the palette, then click on the circuit canvas to place it.
 */

const GATES: readonly { type: GateType; label: string; description: string }[] = [
  { type: 'H', label: 'H', description: 'Hadamard gate' },
  { type: 'X', label: 'X', description: 'Pauli-X (NOT) gate' },
  { type: 'Y', label: 'Y', description: 'Pauli-Y gate' },
  { type: 'Z', label: 'Z', description: 'Pauli-Z gate' },
  { type: 'S', label: 'S', description: 'S (phase) gate' },
  { type: 'T', label: 'T', description: 'T gate' },
  { type: 'CX', label: 'CX', description: 'Controlled-X (CNOT) gate' },
  { type: 'MEASURE', label: 'M', description: 'Measurement' },
] as const;

interface GatePaletteProps {
  selectedGate: GateType | null;
  onSelectGate: (gate: GateType | null) => void;
}

export default function GatePalette({ selectedGate, onSelectGate }: GatePaletteProps) {
  return (
    <aside className="gate-palette" aria-label="Gate palette">
      <h3 className="gate-palette__title">Gates</h3>
      <div className="gate-palette__grid">
        {GATES.map(({ type, label, description }) => (
          <button
            key={type}
            type="button"
            className={`gate-palette__btn${selectedGate === type ? ' gate-palette__btn--selected' : ''}`}
            title={description}
            aria-label={description}
            aria-pressed={selectedGate === type}
            onClick={() => onSelectGate(selectedGate === type ? null : type)}
          >
            {label}
          </button>
        ))}
      </div>
    </aside>
  );
}
