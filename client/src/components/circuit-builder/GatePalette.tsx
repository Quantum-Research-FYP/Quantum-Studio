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
      { type: 'H',   label: 'H',  description: 'Hadamard gate' },
      { type: 'X',   label: 'X',  description: 'Pauli-X (NOT) gate' },
      { type: 'Y',   label: 'Y',  description: 'Pauli-Y gate' },
      { type: 'Z',   label: 'Z',  description: 'Pauli-Z gate' },
      { type: 'ID',  label: 'I',  description: 'Identity gate (no-op)' },
    ],
  },
  {
    title: 'Phase',
    gates: [
      { type: 'S',   label: 'S',   description: 'S phase gate (T²)' },
      { type: 'SDG', label: 'S†',  description: 'S-dagger (inverse S)' },
      { type: 'T',   label: 'T',   description: 'T gate (π/8 phase)' },
      { type: 'TDG', label: 'T†',  description: 'T-dagger (inverse T)' },
      { type: 'SX',  label: '√X',  description: 'Square root of X (V gate)' },
      { type: 'SXDG',label: '√X†', description: 'Inverse square root of X' },
    ],
  },
  {
    title: 'Rotation',
    gates: [
      { type: 'RX',  label: 'Rx',  description: 'Rx(θ) — rotation around X axis' },
      { type: 'RY',  label: 'Ry',  description: 'Ry(θ) — rotation around Y axis' },
      { type: 'RZ',  label: 'Rz',  description: 'Rz(θ) — rotation around Z axis' },
      { type: 'P',   label: 'P',   description: 'P(λ) — phase gate with custom angle' },
      { type: 'U',   label: 'U',   description: 'U(θ,φ,λ) — general single-qubit gate' },
    ],
  },
  {
    title: '2-Qubit',
    gates: [
      { type: 'CX',   label: 'CX',   description: 'Controlled-X (CNOT) — click control then target' },
      { type: 'CZ',   label: 'CZ',   description: 'Controlled-Z' },
      { type: 'CY',   label: 'CY',   description: 'Controlled-Y' },
      { type: 'CH',   label: 'CH',   description: 'Controlled-Hadamard' },
      { type: 'SWAP', label: 'SWAP', description: 'SWAP — exchanges two qubit states' },
      { type: 'CRX',  label: 'CRx',  description: 'Controlled-Rx(θ)' },
      { type: 'CRY',  label: 'CRy',  description: 'Controlled-Ry(θ)' },
      { type: 'CRZ',  label: 'CRz',  description: 'Controlled-Rz(θ)' },
      { type: 'CP',   label: 'CP',   description: 'Controlled-Phase P(λ)' },
    ],
  },
  {
    title: '3-Qubit',
    gates: [
      { type: 'CCX',   label: 'CCX',   description: 'Toffoli (CCNOT) — click ctrl1, ctrl2, then target' },
      { type: 'CSWAP', label: 'CSWAP', description: 'Fredkin (controlled SWAP) — click control then 2 swap qubits' },
    ],
  },
  {
    title: 'Measure',
    gates: [
      { type: 'MEASURE', label: 'M', description: 'Measurement (requires a classical bit)' },
    ],
  },
];

interface GatePaletteProps {
  selectedGate: GateType | null;
  onSelectGate: (gate: GateType | null) => void;
}

export default function GatePalette({ selectedGate, onSelectGate }: GatePaletteProps) {
  return (
    <aside className="gate-palette" aria-label="Gate palette">
      <h3 className="gate-palette__title">Gates</h3>
      {GATE_CATEGORIES.map(({ title, gates }) => (
        <div key={title} className="gate-palette__category">
          <span className="gate-palette__category-label">{title}</span>
          <div className="gate-palette__grid">
            {gates.map(({ type, label, description }) => (
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
        </div>
      ))}
    </aside>
  );
}
