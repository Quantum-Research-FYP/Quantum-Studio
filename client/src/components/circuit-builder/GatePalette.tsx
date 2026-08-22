import type { GateType } from '../../circuit';

interface GateEntry {
  type: GateType;
  label: string;
  description: string;
}

interface GateCategory {
  title: string;
  gates: GateEntry[];
}

const GATE_CATEGORIES: readonly GateCategory[] = [
  {
    title: 'Pauli & H',
    gates: [
      { type: 'H',   label: 'H',  description: 'Hadamard gate\nCreates a superposition state by mapping |0⟩ to (|0⟩+|1⟩)/√2 and |1⟩ to (|0⟩-|1⟩)/√2. Represents a π rotation about the X+Z axis.' },
      { type: 'X',   label: 'X',  description: 'Pauli-X (NOT) gate\nFlips the state of the qubit, mapping |0⟩ to |1⟩ and vice versa. Represents a π rotation about the X axis.' },
      { type: 'Y',   label: 'Y',  description: 'Pauli-Y gate\nMaps |0⟩ to i|1⟩ and |1⟩ to -i|0⟩. Represents a π rotation about the Y axis.' },
      { type: 'Z',   label: 'Z',  description: 'Pauli-Z gate\nLeaves |0⟩ unchanged and maps |1⟩ to -|1⟩ (flips the phase). Represents a π rotation about the Z axis.' },
      { type: 'ID',  label: 'I',  description: 'Identity gate\nApplies no operation (leaves the state unchanged).' },
    ],
  },
  {
    title: 'Phase',
    gates: [
      { type: 'S',   label: 'S',   description: 'S phase gate (√Z)\nApplies a π/2 phase shift to the |1⟩ state. It is the square root of the Z gate.' },
      { type: 'SDG', label: 'S†',  description: 'S-dagger gate\nThe inverse of the S gate, applying a -π/2 phase shift.' },
      { type: 'T',   label: 'T',   description: 'T gate (π/8 phase)\nApplies a π/4 phase shift to the |1⟩ state. It is the square root of the S gate.' },
      { type: 'TDG', label: 'T†',  description: 'T-dagger gate\nThe inverse of the T gate, applying a -π/4 phase shift.' },
      { type: 'SX',  label: '√X',  description: 'Square root of X (V gate)\nApplies a π/2 rotation about the X axis.' },
      { type: 'SXDG',label: '√X†', description: 'Inverse square root of X\nApplies a -π/2 rotation about the X axis.' },
    ],
  },
  {
    title: 'Rotation',
    gates: [
      { type: 'RX',  label: 'Rx',  description: 'Rx(θ)\nParameterized rotation around the X axis by angle θ.' },
      { type: 'RY',  label: 'Ry',  description: 'Ry(θ)\nParameterized rotation around the Y axis by angle θ.' },
      { type: 'RZ',  label: 'Rz',  description: 'Rz(θ)\nParameterized rotation around the Z axis by angle θ.' },
      { type: 'P',   label: 'P',   description: 'P(λ)\nParameterized phase shift applied to the |1⟩ state.' },
      { type: 'U',   label: 'U',   description: 'U(θ,φ,λ)\nUniversal single-qubit gate capable of expressing any arbitrary single-qubit rotation.' },
    ],
  },
  {
    title: '2-Qubit',
    gates: [
      { type: 'CX',   label: 'CX',   description: 'Controlled-X (CNOT)\nFlips the target qubit if the control qubit is in state |1⟩. Crucial for creating entanglement.' },
      { type: 'CZ',   label: 'CZ',   description: 'Controlled-Z\nApplies a Z gate (phase flip) to the target qubit if the control is in state |1⟩.' },
      { type: 'CY',   label: 'CY',   description: 'Controlled-Y\nApplies a Y gate to the target qubit if the control is in state |1⟩.' },
      { type: 'CH',   label: 'CH',   description: 'Controlled-Hadamard\nApplies an H gate to the target qubit if the control is in state |1⟩.' },
      { type: 'SWAP', label: 'SWAP', description: 'SWAP gate\nExchanges the states of two qubits.' },
      { type: 'CRX',  label: 'CRx',  description: 'Controlled-Rx(θ)\nApplies an Rx rotation to the target qubit if the control is |1⟩.' },
      { type: 'CRY',  label: 'CRy',  description: 'Controlled-Ry(θ)\nApplies an Ry rotation to the target qubit if the control is |1⟩.' },
      { type: 'CRZ',  label: 'CRz',  description: 'Controlled-Rz(θ)\nApplies an Rz rotation to the target qubit if the control is |1⟩.' },
      { type: 'CP',   label: 'CP',   description: 'Controlled-Phase P(λ)\nApplies a phase shift if both qubits are in state |1⟩.' },
    ],
  },
  {
    title: '3-Qubit',
    gates: [
      { type: 'CCX',   label: 'CCX',   description: 'Toffoli (CCNOT)\nFlips the target qubit if both control qubits are in state |1⟩. Universal for classical reversible computation.' },
      { type: 'CSWAP', label: 'CSWAP', description: 'Fredkin (Controlled-SWAP)\nSwaps the states of two target qubits if the control qubit is in state |1⟩.' },
    ],
  },
  {
    title: 'Measure',
    gates: [
      { type: 'MEASURE', label: 'M', description: 'Measurement\nCollapses the quantum state and writes the classical outcome (0 or 1) to a classical register.' },
    ],
  },
];

export const GATE_DESCRIPTIONS = GATE_CATEGORIES.reduce((acc, cat) => {
  cat.gates.forEach(g => { acc[g.type] = g.description; });
  return acc;
}, {} as Record<GateType, string>);

interface GatePaletteProps {
  selectedGate: GateType | null;
  onSelectGate: (gate: GateType | null) => void;
}

export default function GatePalette({ selectedGate, onSelectGate }: GatePaletteProps) {
  return (
    <aside className="gate-palette" aria-label="Gate palette">
      <h3 className="gate-palette__title">
        Gates
        <button 
          className="info-btn" 
          data-tooltip="Select and place quantum gates onto the circuit wires."
          aria-label="Info"
        >
          !
        </button>
      </h3>
      {GATE_CATEGORIES.map(({ title, gates }) => (
        <div key={title} className="gate-palette__category">
          <span className="gate-palette__category-label">{title}</span>
          <div className="gate-palette__grid">
            {gates.map(({ type, label, description }) => (
              <button
                key={type}
                type="button"
                className={`gate-palette__btn${selectedGate === type ? ' gate-palette__btn--selected' : ''}`}
                data-tooltip={description}
                aria-label={description}
                aria-pressed={selectedGate === type}
                onClick={() => onSelectGate(selectedGate === type ? null : type)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </aside>
  );
}
