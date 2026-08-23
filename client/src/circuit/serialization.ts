import type { CircuitModel, GateType, Operation, OperationTargets } from './types';
import { GATE_TYPES } from './types';

/**
 * Serialize a CircuitModel to a deterministic JSON string.
 *
 * Determinism guarantees:
 * - Operations are sorted by (time, id) before serialization.
 * - Object keys are emitted in a fixed order.
 * - Output is byte-for-byte identical for equivalent circuit models.
 */
export function serialize(circuit: CircuitModel): string {
  const sorted = [...circuit.operations].sort(compareOperations);
  const serializable = buildSerializable(circuit, sorted);
  return JSON.stringify(serializable, null, 2);
}

/** Compare operations by time first, then by id for stable ordering. */
function compareOperations(a: Operation, b: Operation): number {
  if (a.time !== b.time) return a.time - b.time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Build a plain object with fixed key order for deterministic JSON output.
 * JSON.stringify emits keys in insertion order, so we construct
 * objects with keys in the canonical order.
 */
function buildSerializable(circuit: CircuitModel, sortedOps: Operation[]): Record<string, unknown> {
  const result: Record<string, unknown> = {
    schemaVersion: circuit.schemaVersion,
    qubits: circuit.qubits,
    clbits: circuit.clbits,
    operations: sortedOps.map(buildSerializableOperation),
  };

  if (circuit.metadata) {
    result.metadata = { ...circuit.metadata };
  }

  return result;
}

function buildSerializableOperation(op: Operation): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: op.id,
    type: op.type,
    targets: buildSerializableTargets(op.targets),
    time: op.time,
  };

  if (op.params && Object.keys(op.params).length > 0) {
    result.params = { ...op.params };
  }

  return result;
}

function buildSerializableTargets(targets: OperationTargets): Record<string, unknown> {
  const result: Record<string, unknown> = {
    qubits: [...targets.qubits],
  };
  if (targets.clbits) {
    result.clbits = [...targets.clbits];
  }
  return result;
}

/**
 * Deserialize a JSON string into a validated CircuitModel.
 *
 * Throws descriptive errors if the JSON is malformed or violates the schema.
 */
export function deserialize(json: string): CircuitModel {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON: unable to parse circuit data');
  }

  return validateCircuitModel(parsed);
}

function validateCircuitModel(data: unknown): CircuitModel {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Circuit data must be a non-null object');
  }

  const obj = data as Record<string, unknown>;

  if (obj.schemaVersion !== 1) {
    throw new Error(`Unsupported schema version: ${String(obj.schemaVersion)} (expected 1)`);
  }

  if (typeof obj.qubits !== 'number' || !Number.isInteger(obj.qubits) || obj.qubits < 0) {
    throw new Error(`Invalid qubits count: ${String(obj.qubits)}`);
  }

  if (typeof obj.clbits !== 'number' || !Number.isInteger(obj.clbits) || obj.clbits < 0) {
    throw new Error(`Invalid clbits count: ${String(obj.clbits)}`);
  }

  if (!Array.isArray(obj.operations)) {
    throw new Error('Operations must be an array');
  }

  const operations = obj.operations.map((op: unknown, i: number) =>
    validateOperation(op, i, obj.qubits as number, obj.clbits as number),
  );

  const circuit: CircuitModel = {
    schemaVersion: 1,
    qubits: obj.qubits as number,
    clbits: obj.clbits as number,
    operations,
  };

  if (obj.metadata !== undefined) {
    circuit.metadata = validateMetadata(obj.metadata);
  }

  return circuit;
}

function validateOperation(
  data: unknown,
  index: number,
  qubits: number,
  clbits: number,
): Operation {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Operation [${index}] must be a non-null object`);
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new Error(`Operation [${index}] must have a non-empty string id`);
  }

  if (typeof obj.type !== 'string' || !GATE_TYPES.includes(obj.type as GateType)) {
    throw new Error(`Operation [${index}] has invalid type: ${String(obj.type)}`);
  }

  if (typeof obj.time !== 'number' || !Number.isInteger(obj.time) || obj.time < 0) {
    throw new Error(`Operation [${index}] has invalid time: ${String(obj.time)}`);
  }

  const targets = validateTargets(obj.targets, index, qubits, clbits);

  const operation: Operation = {
    id: obj.id,
    type: obj.type as GateType,
    targets,
    time: obj.time,
  };

  if (obj.params !== undefined) {
    if (typeof obj.params !== 'object' || obj.params === null || Array.isArray(obj.params)) {
      throw new Error(`Operation [${index}] params must be a plain object`);
    }
    operation.params = obj.params as Record<string, number>;
  }

  return operation;
}

function validateTargets(
  data: unknown,
  opIndex: number,
  qubits: number,
  clbits: number,
): OperationTargets {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Operation [${opIndex}] targets must be a non-null object`);
  }

  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.qubits)) {
    throw new Error(`Operation [${opIndex}] targets.qubits must be an array`);
  }

  for (const q of obj.qubits) {
    if (typeof q !== 'number' || !Number.isInteger(q) || q < 0 || q >= qubits) {
      throw new Error(
        `Operation [${opIndex}] has invalid qubit index: ${String(q)} (circuit has ${qubits} qubits)`,
      );
    }
  }

  const targets: OperationTargets = { qubits: obj.qubits as number[] };

  if (obj.clbits !== undefined) {
    if (!Array.isArray(obj.clbits)) {
      throw new Error(`Operation [${opIndex}] targets.clbits must be an array`);
    }
    for (const c of obj.clbits) {
      if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= clbits) {
        throw new Error(
          `Operation [${opIndex}] has invalid clbit index: ${String(c)} (circuit has ${clbits} clbits)`,
        );
      }
    }
    targets.clbits = obj.clbits as number[];
  }

  return targets;
}

function validateMetadata(data: unknown): { name?: string } {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Metadata must be a plain object');
  }

  const obj = data as Record<string, unknown>;
  const metadata: { name?: string } = {};

  if (obj.name !== undefined) {
    if (typeof obj.name !== 'string') {
      throw new Error('Metadata name must be a string');
    }
    metadata.name = obj.name;
  }

  return metadata;
}
