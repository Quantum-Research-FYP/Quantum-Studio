/** Supported single-qubit gate types for v1. */
export type SingleQubitGate = 'H' | 'X' | 'Y' | 'Z' | 'S' | 'T';

/** Multi-qubit gate types for v1. */
export type MultiQubitGate = 'CX';

/** Measurement pseudo-gate. */
export type MeasurementGate = 'MEASURE';

/** Union of all supported gate types. */
export type GateType = SingleQubitGate | MultiQubitGate | MeasurementGate;

/** All supported gate types as a runtime array for validation. */
export const GATE_TYPES: readonly GateType[] = [
  'H', 'X', 'Y', 'Z', 'S', 'T', 'CX', 'MEASURE',
] as const;

/** Number of qubits required by each gate type. */
export const GATE_QUBIT_COUNT: Record<GateType, number> = {
  H: 1, X: 1, Y: 1, Z: 1, S: 1, T: 1,
  CX: 2,
  MEASURE: 1,
};

/** Whether a gate type requires classical bit targets. */
export const GATE_REQUIRES_CLBITS: Record<GateType, boolean> = {
  H: false, X: false, Y: false, Z: false, S: false, T: false,
  CX: false,
  MEASURE: true,
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
  /** Reserved for future parameterized gates. */
  params?: Record<string, unknown>;
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
