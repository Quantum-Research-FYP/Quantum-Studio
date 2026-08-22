import type { GateType, OperationTargets } from '../circuit';

/**
 * A single operation within a template circuit definition.
 * Omits `id` — fresh UUIDs are generated at load time.
 */
export interface TemplateOperation {
  type: GateType;
  targets: OperationTargets;
  time: number;
}

/** Static circuit structure stored in a template (no runtime IDs). */
export interface TemplateCircuit {
  qubits: number;
  clbits: number;
  operations: TemplateOperation[];
}

/** Default execution configuration for running a template on the simulator. */
export interface ExecutionConfig {
  /** Number of measurement shots. */
  shots: number;
  /** Simulator backend identifier (optional, uses server default if omitted). */
  backend?: string;
  /** Provider for the simulation (optional). */
  provider?: 'local' | 'spinq' | 'ibm';
}

/**
 * A versioned, static template definition.
 *
 * Template definitions are bundled with the client and do not require
 * a backend API. Each definition contains enough information to populate
 * the circuit editor, drive Qiskit code generation, and execute on the simulator.
 */
export interface TemplateDefinition {
  /** Stable unique identifier (e.g., 'bell-state'). Never changes once published. */
  templateId: string;
  /** Human-readable display name. */
  name: string;
  /** Short description shown in the gallery. */
  description: string;
  /** Categorization tags for filtering/grouping. */
  tags: string[];
  /** Circuit schema version — must match CircuitModel.schemaVersion. */
  schemaVersion: 1;
  /** The circuit structure to load into the editor. */
  circuit: TemplateCircuit;
  /** Default execution settings for running on the simulator. */
  defaultExecutionConfig: ExecutionConfig;
  /** Educational content to display in the "Learn More" modal. */
  learnMore?: {
    imageSrc: string;
    longDescription: string;
  };
}
