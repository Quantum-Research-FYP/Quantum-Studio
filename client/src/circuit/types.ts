/** Supported single-qubit gate types. */
export type SingleQubitGate =
  | 'H' | 'X' | 'Y' | 'Z'
  | 'S' | 'SDG' | 'T' | 'TDG'
  | 'SX' | 'SXDG' | 'ID'
  | 'RX' | 'RY' | 'RZ' | 'P' | 'U';

/** Two-qubit gate types. */
export type MultiQubitGate =
  | 'CX' | 'CZ' | 'CY' | 'CH' | 'SWAP'
  | 'CRX' | 'CRY' | 'CRZ' | 'CP';

/** Three-qubit gate types. */
export type ThreeQubitGate = 'CCX' | 'CSWAP';

/** Measurement pseudo-gate. */
export type MeasurementGate = 'MEASURE';

/** Union of all supported gate types. */
export type GateType = SingleQubitGate | MultiQubitGate | ThreeQubitGate | MeasurementGate;

/** All supported gate types as a runtime array for validation. */
export const GATE_TYPES: readonly GateType[] = [
  'H', 'X', 'Y', 'Z',
  'S', 'SDG', 'T', 'TDG',
  'SX', 'SXDG', 'ID',
  'RX', 'RY', 'RZ', 'P', 'U',
  'CX', 'CZ', 'CY', 'CH', 'SWAP',
  'CRX', 'CRY', 'CRZ', 'CP',
  'CCX', 'CSWAP',
  'MEASURE',
] as const;

/** Number of qubits required by each gate type. */
export const GATE_QUBIT_COUNT: Record<GateType, number> = {
  H: 1, X: 1, Y: 1, Z: 1,
  S: 1, SDG: 1, T: 1, TDG: 1,
  SX: 1, SXDG: 1, ID: 1,
  RX: 1, RY: 1, RZ: 1, P: 1, U: 1,
  CX: 2, CZ: 2, CY: 2, CH: 2, SWAP: 2,
  CRX: 2, CRY: 2, CRZ: 2, CP: 2,
  CCX: 3, CSWAP: 3,
  MEASURE: 1,
};

/** Whether a gate type requires classical bit targets. */
export const GATE_REQUIRES_CLBITS: Record<GateType, boolean> = {
  H: false, X: false, Y: false, Z: false,
  S: false, SDG: false, T: false, TDG: false,
  SX: false, SXDG: false, ID: false,
  RX: false, RY: false, RZ: false, P: false, U: false,
  CX: false, CZ: false, CY: false, CH: false, SWAP: false,
  CRX: false, CRY: false, CRZ: false, CP: false,
  CCX: false, CSWAP: false,
  MEASURE: true,
};

/** Gates that require angle parameters to be specified during placement. */
export const PARAMETERIZED_GATES = new Set<GateType>([
  'RX', 'RY', 'RZ', 'P', 'U', 'CRX', 'CRY', 'CRZ', 'CP',
]);

/** Describes a single angle parameter for a gate. */
export interface GateParamSpec {
  /** Storage key used in Operation.params (e.g. "theta"). */
  key: string;
  /** Human-readable label (e.g. "θ (theta)"). */
  label: string;
  /** Default value in radians. */
  defaultValue: number;
}

/** Parameter specs for each parameterized gate. */
export const GATE_PARAM_SPECS: Partial<Record<GateType, GateParamSpec[]>> = {
  RX:  [{ key: 'theta',  label: 'θ (theta)',  defaultValue: Math.PI / 2 }],
  RY:  [{ key: 'theta',  label: 'θ (theta)',  defaultValue: Math.PI / 2 }],
  RZ:  [{ key: 'theta',  label: 'θ (theta)',  defaultValue: Math.PI / 4 }],
  P:   [{ key: 'lambda', label: 'λ (lambda)', defaultValue: Math.PI / 4 }],
  U: [
    { key: 'theta',  label: 'θ (theta)',  defaultValue: Math.PI / 2 },
    { key: 'phi',    label: 'φ (phi)',    defaultValue: 0 },
    { key: 'lambda', label: 'λ (lambda)', defaultValue: Math.PI },
  ],
  CRX: [{ key: 'theta',  label: 'θ (theta)',  defaultValue: Math.PI / 2 }],
  CRY: [{ key: 'theta',  label: 'θ (theta)',  defaultValue: Math.PI / 2 }],
  CRZ: [{ key: 'theta',  label: 'θ (theta)',  defaultValue: Math.PI / 4 }],
  CP:  [{ key: 'lambda', label: 'λ (lambda)', defaultValue: Math.PI / 4 }],
};

/** Wire targets for an operation. */
export interface OperationTargets {
  /** Qubit indices this operation acts on. */
  qubits: number[];
  /** Classical bit indices (required for MEASURE). */
  clbits?: number[];
}

/** A single gate/measurement placed on the circuit timeline. */
export interface Operation {
  /** Unique identifier for this operation. */
  id: string;
  /** Gate type. */
  type: GateType;
  /** Wire indices this operation targets. */
  targets: OperationTargets;
  /** Column index on the timeline (integer, 0-based). */
  time: number;
  /** Angle parameters for parameterized gates (values in radians). */
  params?: Record<string, number>;
}

/** Versioned quantum circuit model. */
export interface CircuitModel {
  /** Schema version for forward compatibility. */
  schemaVersion: 1;
  /** Number of qubit wires. */
  qubits: number;
  /** Number of classical bit wires. */
  clbits: number;
  /** Ordered list of operations on the circuit. */
  operations: Operation[];
  /** Optional circuit metadata. */
  metadata?: {
    name?: string;
  };
}

/** Wire type discriminator for add/remove operations. */
export type WireType = 'qubit' | 'clbit';

/** Result of attempting to remove a wire that has dependent operations. */
export interface WireRemovalResult {
  /** The updated circuit (wire and dependents removed). */
  circuit: CircuitModel;
  /** Operations that were removed because they depended on the wire. */
  removedOperations: Operation[];
}
