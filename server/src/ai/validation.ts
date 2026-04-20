import type { AiCircuitOperation } from './types.js';

// ---------------------------------------------------------------------------
// Gate allowlist — aligned exactly to client/src/circuit/types.ts
// ---------------------------------------------------------------------------

const SUPPORTED_GATES = ['H', 'X', 'Y', 'Z', 'S', 'T', 'CX', 'MEASURE'] as const;
type SupportedGate = (typeof SUPPORTED_GATES)[number];

const GATE_QUBIT_COUNT: Record<SupportedGate, number> = {
  H: 1, X: 1, Y: 1, Z: 1, S: 1, T: 1,
  CX: 2,
  MEASURE: 1,
};

const GATE_REQUIRES_CLBITS: Record<SupportedGate, boolean> = {
  H: false, X: false, Y: false, Z: false, S: false, T: false,
  CX: false,
  MEASURE: true,
};

function isSupportedGate(type: string): type is SupportedGate {
  return (SUPPORTED_GATES as readonly string[]).includes(type);
}

// ---------------------------------------------------------------------------
// Resource limits
// ---------------------------------------------------------------------------

export interface DraftResourceLimits {
  maxQubits: number;
  maxDepth: number;
}

export function getDraftResourceLimits(): DraftResourceLimits {
  return {
    maxQubits: parseInt(process.env.SIM_MAX_QUBITS || '32', 10),
    maxDepth: parseInt(process.env.SIM_MAX_DEPTH || '500', 10),
  };
}

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

export type ValidationStatus = 'valid' | 'partially_valid' | 'invalid';

export type MessageSeverity = 'error' | 'warning' | 'info';

export interface ValidationMessage {
  severity: MessageSeverity;
  message: string;
  /** Operation index that triggered this message, if applicable. */
  operationIndex?: number;
}

/** An importable operation with a generated UUID. */
export interface ImportableOperation {
  id: string;
  type: SupportedGate;
  targets: { qubits: number[]; clbits?: number[] };
  time: number;
}

/** An operation that was omitted during import. */
export interface OmittedOperation {
  index: number;
  type: string;
  reason: string;
}

export interface ValidationResult {
  status: ValidationStatus;
  messages: ValidationMessage[];
  /** The importable circuit model — present when status is valid or partially_valid. */
  importableCircuit?: {
    schemaVersion: 1;
    qubits: number;
    clbits: number;
    operations: ImportableOperation[];
  };
  /** Operations that could not be imported (partial import details). */
  omittedOperations: OmittedOperation[];
}

// ---------------------------------------------------------------------------
// Core validation logic
// ---------------------------------------------------------------------------

/**
 * Validate an AI-generated circuit JSON and produce an import-ready result.
 * This is a pure, deterministic function — no code execution, no side effects.
 */
export function validateAiCircuit(input: unknown, limits?: DraftResourceLimits): ValidationResult {
  const resourceLimits = limits ?? getDraftResourceLimits();
  const messages: ValidationMessage[] = [];
  const omittedOperations: OmittedOperation[] = [];

  // --- Top-level structure validation ---
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalid([{ severity: 'error', message: 'Circuit JSON must be a non-null object.' }]);
  }

  const draft = input as Record<string, unknown>;

  // schemaVersion
  if (draft.schemaVersion !== 1) {
    messages.push({
      severity: 'error',
      message: `Unsupported schemaVersion "${draft.schemaVersion}". Only version 1 is supported.`,
    });
  }

  // qubits
  if (!isPositiveInt(draft.qubits)) {
    return invalid([
      ...messages,
      { severity: 'error', message: 'qubits must be a positive integer.' },
    ]);
  }
  const qubits = draft.qubits as number;

  if (qubits > resourceLimits.maxQubits) {
    return invalid([
      ...messages,
      {
        severity: 'error',
        message: `Circuit uses ${qubits} qubits, exceeding the maximum of ${resourceLimits.maxQubits}.`,
      },
    ]);
  }

  // clbits
  if (!isNonNegativeInt(draft.clbits)) {
    return invalid([
      ...messages,
      { severity: 'error', message: 'clbits must be a non-negative integer.' },
    ]);
  }
  const clbits = draft.clbits as number;

  // operations
  if (!Array.isArray(draft.operations)) {
    return invalid([
      ...messages,
      { severity: 'error', message: 'operations must be an array.' },
    ]);
  }

  if (draft.operations.length === 0) {
    return invalid([
      ...messages,
      { severity: 'error', message: 'operations must contain at least one operation.' },
    ]);
  }

  // --- Per-operation validation ---
  const importableOps: ImportableOperation[] = [];

  for (let i = 0; i < draft.operations.length; i++) {
    const op = draft.operations[i] as unknown;
    const result = validateOperation(op, i, qubits, clbits, messages, resourceLimits);

    if (result === null) {
      // Operation was invalid but non-fatal — already added to omittedOperations via messages
      const opObj = op as Partial<AiCircuitOperation>;
      omittedOperations.push({
        index: i,
        type: typeof opObj?.type === 'string' ? opObj.type : 'unknown',
        reason: getLastWarningOrError(messages, i),
      });
    } else {
      importableOps.push(result);
    }
  }

  // --- Depth check on importable operations ---
  if (importableOps.length > 0) {
    const maxTime = Math.max(...importableOps.map((op) => op.time));
    const depth = maxTime + 1;
    if (depth > resourceLimits.maxDepth) {
      return invalid([
        ...messages,
        {
          severity: 'error',
          message: `Circuit depth (${depth}) exceeds the maximum of ${resourceLimits.maxDepth}.`,
        },
      ]);
    }
  }

  // --- Determine final status ---
  if (importableOps.length === 0) {
    messages.push({
      severity: 'error',
      message: 'No operations could be imported. All operations are unsupported or invalid.',
    });
    return invalid(messages);
  }

  const hasOmissions = omittedOperations.length > 0;
  const status: ValidationStatus = hasOmissions ? 'partially_valid' : 'valid';

  if (hasOmissions) {
    messages.push({
      severity: 'info',
      message: `${omittedOperations.length} operation(s) were omitted during import.`,
    });
  }

  return {
    status,
    messages,
    importableCircuit: {
      schemaVersion: 1,
      qubits,
      clbits,
      operations: importableOps,
    },
    omittedOperations,
  };
}

// ---------------------------------------------------------------------------
// Per-operation validation
// ---------------------------------------------------------------------------

function validateOperation(
  op: unknown,
  index: number,
  qubits: number,
  clbits: number,
  messages: ValidationMessage[],
  _limits: DraftResourceLimits,
): ImportableOperation | null {
  if (!op || typeof op !== 'object' || Array.isArray(op)) {
    messages.push({
      severity: 'warning',
      message: `Operation [${index}]: must be an object.`,
      operationIndex: index,
    });
    return null;
  }

  const opObj = op as Record<string, unknown>;

  // type
  if (typeof opObj.type !== 'string') {
    messages.push({
      severity: 'warning',
      message: `Operation [${index}]: missing or invalid "type" field.`,
      operationIndex: index,
    });
    return null;
  }

  if (!isSupportedGate(opObj.type)) {
    messages.push({
      severity: 'warning',
      message: `Operation [${index}]: gate type "${opObj.type}" is not supported. Supported: ${SUPPORTED_GATES.join(', ')}.`,
      operationIndex: index,
    });
    return null;
  }

  const gateType = opObj.type;

  // time
  if (!isNonNegativeInt(opObj.time)) {
    messages.push({
      severity: 'warning',
      message: `Operation [${index}]: "time" must be a non-negative integer.`,
      operationIndex: index,
    });
    return null;
  }
  const time = opObj.time as number;

  // targets
  if (!opObj.targets || typeof opObj.targets !== 'object' || Array.isArray(opObj.targets)) {
    messages.push({
      severity: 'warning',
      message: `Operation [${index}]: "targets" must be an object with a "qubits" array.`,
      operationIndex: index,
    });
    return null;
  }

  const targets = opObj.targets as Record<string, unknown>;

  // targets.qubits
  if (!Array.isArray(targets.qubits)) {
    messages.push({
      severity: 'warning',
      message: `Operation [${index}]: "targets.qubits" must be an array.`,
      operationIndex: index,
    });
    return null;
  }

  const expectedQubitCount = GATE_QUBIT_COUNT[gateType];
  if (targets.qubits.length !== expectedQubitCount) {
    messages.push({
      severity: 'warning',
      message: `Operation [${index}]: gate "${gateType}" requires exactly ${expectedQubitCount} qubit(s), got ${targets.qubits.length}.`,
      operationIndex: index,
    });
    return null;
  }

  // Validate each qubit index
  for (const q of targets.qubits) {
    if (!isNonNegativeInt(q) || (q as number) >= qubits) {
      messages.push({
        severity: 'warning',
        message: `Operation [${index}]: qubit index ${q} is out of range [0, ${qubits - 1}].`,
        operationIndex: index,
      });
      return null;
    }
  }

  // CX: control and target must be distinct
  if (gateType === 'CX' && targets.qubits[0] === targets.qubits[1]) {
    messages.push({
      severity: 'warning',
      message: `Operation [${index}]: CX control and target qubits must be distinct.`,
      operationIndex: index,
    });
    return null;
  }

  // targets.clbits (required for MEASURE)
  let validClbits: number[] | undefined;
  if (GATE_REQUIRES_CLBITS[gateType]) {
    if (!Array.isArray(targets.clbits) || targets.clbits.length !== 1) {
      messages.push({
        severity: 'warning',
        message: `Operation [${index}]: gate "${gateType}" requires exactly 1 classical bit target.`,
        operationIndex: index,
      });
      return null;
    }
    const clbitIdx = targets.clbits[0];
    if (!isNonNegativeInt(clbitIdx) || (clbitIdx as number) >= clbits) {
      messages.push({
        severity: 'warning',
        message: `Operation [${index}]: classical bit index ${clbitIdx} is out of range [0, ${clbits - 1}].`,
        operationIndex: index,
      });
      return null;
    }
    validClbits = [clbitIdx as number];
  }

  return {
    id: crypto.randomUUID(),
    type: gateType,
    targets: {
      qubits: targets.qubits as number[],
      ...(validClbits !== undefined ? { clbits: validClbits } : {}),
    },
    time,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function invalid(messages: ValidationMessage[]): ValidationResult {
  return { status: 'invalid', messages, omittedOperations: [] };
}

function getLastWarningOrError(messages: ValidationMessage[], operationIndex: number): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].operationIndex === operationIndex) {
      return messages[i].message;
    }
  }
  return 'Unknown reason';
}
