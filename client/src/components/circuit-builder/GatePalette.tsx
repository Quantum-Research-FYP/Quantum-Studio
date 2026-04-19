/**
 * GatePalette provides clickable gate buttons for the supported v1 gate set.
 * Users select a gate from the palette and then place it on the circuit canvas.
 */

const GATES = [
  { type: 'H', label: 'H', description: 'Hadamard gate' },
  { type: 'X', label: 'X', description: 'Pauli-X (NOT) gate' },
  { type: 'Y', label: 'Y', description: 'Pauli-Y gate' },
  { type: 'Z', label: 'Z', description: 'Pauli-Z gate' },
  { type: 'S', label: 'S', description: 'S (phase) gate' },
  { type: 'T', label: 'T', description: 'T gate' },
  { type: 'CX', label: 'CX', description: 'Controlled-X (CNOT) gate' },
  { type: 'MEASURE', label: 'M', description: 'Measurement' },
] as const;

export default function GatePalette() {
  return (
    <aside className="gate-palette" aria-label="Gate palette">
      <h3 className="gate-palette__title">Gates</h3>
      <div className="gate-palette__grid">
        {GATES.map(({ type, label, description }) => (
          <button
            key={type}
            type="button"
            className="gate-palette__btn"
            title={description}
            aria-label={description}
          >
            {label}
          </button>
        ))}
      </div>
    </aside>
  );
}
