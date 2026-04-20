import { describe, it, expect } from 'vitest';
import { validateAiCircuit } from '../validation.js';
import type { DraftResourceLimits } from '../validation.js';

const defaultLimits: DraftResourceLimits = { maxQubits: 32, maxDepth: 500 };

function bellState() {
  return {
    schemaVersion: 1,
    qubits: 2,
    clbits: 2,
    operations: [
      { type: 'H', targets: { qubits: [0] }, time: 0 },
      { type: 'CX', targets: { qubits: [0, 1] }, time: 1 },
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 2 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 3 },
    ],
  };
}

describe('validateAiCircuit', () => {
  describe('valid circuits', () => {
    it('accepts a valid Bell state circuit', () => {
      const result = validateAiCircuit(bellState(), defaultLimits);

      expect(result.status).toBe('valid');
      expect(result.messages).toHaveLength(0);
      expect(result.omittedOperations).toHaveLength(0);
      expect(result.importableCircuit).toBeDefined();
      expect(result.importableCircuit!.qubits).toBe(2);
      expect(result.importableCircuit!.clbits).toBe(2);
      expect(result.importableCircuit!.operations).toHaveLength(4);
    });

    it('generates unique IDs for each importable operation', () => {
      const result = validateAiCircuit(bellState(), defaultLimits);
      const ids = result.importableCircuit!.operations.map((op) => op.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('accepts all supported single-qubit gates', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 1,
        clbits: 0,
        operations: [
          { type: 'H', targets: { qubits: [0] }, time: 0 },
          { type: 'X', targets: { qubits: [0] }, time: 1 },
          { type: 'Y', targets: { qubits: [0] }, time: 2 },
          { type: 'Z', targets: { qubits: [0] }, time: 3 },
          { type: 'S', targets: { qubits: [0] }, time: 4 },
          { type: 'T', targets: { qubits: [0] }, time: 5 },
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      expect(result.status).toBe('valid');
      expect(result.importableCircuit!.operations).toHaveLength(6);
    });

    it('preserves operation time ordering', () => {
      const result = validateAiCircuit(bellState(), defaultLimits);
      const times = result.importableCircuit!.operations.map((op) => op.time);
      expect(times).toEqual([0, 1, 2, 3]);
    });
  });

  describe('invalid circuits — structural', () => {
    it('rejects null input', () => {
      const result = validateAiCircuit(null, defaultLimits);
      expect(result.status).toBe('invalid');
      expect(result.messages[0].message).toContain('non-null object');
    });

    it('rejects array input', () => {
      const result = validateAiCircuit([], defaultLimits);
      expect(result.status).toBe('invalid');
    });

    it('rejects missing qubits', () => {
      const result = validateAiCircuit(
        { schemaVersion: 1, clbits: 0, operations: [] },
        defaultLimits,
      );
      expect(result.status).toBe('invalid');
      expect(result.messages.some((m) => m.message.includes('qubits'))).toBe(true);
    });

    it('rejects zero qubits', () => {
      const result = validateAiCircuit(
        { schemaVersion: 1, qubits: 0, clbits: 0, operations: [{ type: 'H', targets: { qubits: [0] }, time: 0 }] },
        defaultLimits,
      );
      expect(result.status).toBe('invalid');
    });

    it('rejects negative clbits', () => {
      const result = validateAiCircuit(
        { schemaVersion: 1, qubits: 1, clbits: -1, operations: [] },
        defaultLimits,
      );
      expect(result.status).toBe('invalid');
    });

    it('rejects non-array operations', () => {
      const result = validateAiCircuit(
        { schemaVersion: 1, qubits: 1, clbits: 0, operations: 'not-array' },
        defaultLimits,
      );
      expect(result.status).toBe('invalid');
    });

    it('rejects empty operations array', () => {
      const result = validateAiCircuit(
        { schemaVersion: 1, qubits: 1, clbits: 0, operations: [] },
        defaultLimits,
      );
      expect(result.status).toBe('invalid');
      expect(result.messages.some((m) => m.message.includes('at least one'))).toBe(true);
    });
  });

  describe('invalid circuits — resource limits', () => {
    it('rejects circuits exceeding max qubits', () => {
      const result = validateAiCircuit(
        { schemaVersion: 1, qubits: 33, clbits: 0, operations: [{ type: 'H', targets: { qubits: [0] }, time: 0 }] },
        defaultLimits,
      );
      expect(result.status).toBe('invalid');
      expect(result.messages.some((m) => m.message.includes('exceeding the maximum'))).toBe(true);
    });

    it('rejects circuits exceeding max depth', () => {
      const ops = Array.from({ length: 501 }, (_, i) => ({
        type: 'H',
        targets: { qubits: [0] },
        time: i,
      }));
      const result = validateAiCircuit(
        { schemaVersion: 1, qubits: 1, clbits: 0, operations: ops },
        defaultLimits,
      );
      expect(result.status).toBe('invalid');
      expect(result.messages.some((m) => m.message.includes('depth'))).toBe(true);
    });

    it('respects custom resource limits', () => {
      const tightLimits: DraftResourceLimits = { maxQubits: 2, maxDepth: 3 };
      const circuit = {
        schemaVersion: 1,
        qubits: 3,
        clbits: 0,
        operations: [{ type: 'H', targets: { qubits: [0] }, time: 0 }],
      };
      const result = validateAiCircuit(circuit, tightLimits);
      expect(result.status).toBe('invalid');
    });
  });

  describe('partially valid circuits', () => {
    it('imports supported ops and omits unsupported gate types', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 2,
        clbits: 0,
        operations: [
          { type: 'H', targets: { qubits: [0] }, time: 0 },
          { type: 'TOFFOLI', targets: { qubits: [0, 1, 2] }, time: 1 },
          { type: 'X', targets: { qubits: [1] }, time: 2 },
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      expect(result.status).toBe('partially_valid');
      expect(result.importableCircuit!.operations).toHaveLength(2);
      expect(result.importableCircuit!.operations[0].type).toBe('H');
      expect(result.importableCircuit!.operations[1].type).toBe('X');
      expect(result.omittedOperations).toHaveLength(1);
      expect(result.omittedOperations[0].type).toBe('TOFFOLI');
      expect(result.omittedOperations[0].index).toBe(1);
    });

    it('omits operations with out-of-range qubit indices', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 2,
        clbits: 0,
        operations: [
          { type: 'H', targets: { qubits: [0] }, time: 0 },
          { type: 'X', targets: { qubits: [5] }, time: 1 }, // out of range
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      expect(result.status).toBe('partially_valid');
      expect(result.importableCircuit!.operations).toHaveLength(1);
      expect(result.omittedOperations).toHaveLength(1);
      expect(result.omittedOperations[0].reason).toContain('out of range');
    });

    it('omits operations with wrong qubit count for gate type', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 3,
        clbits: 0,
        operations: [
          { type: 'H', targets: { qubits: [0] }, time: 0 },
          { type: 'H', targets: { qubits: [0, 1] }, time: 1 }, // H needs 1 qubit
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      expect(result.status).toBe('partially_valid');
      expect(result.omittedOperations).toHaveLength(1);
      expect(result.omittedOperations[0].reason).toContain('requires exactly 1 qubit');
    });

    it('omits MEASURE ops missing clbits', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 1,
        clbits: 1,
        operations: [
          { type: 'H', targets: { qubits: [0] }, time: 0 },
          { type: 'MEASURE', targets: { qubits: [0] }, time: 1 }, // missing clbits
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      expect(result.status).toBe('partially_valid');
      expect(result.omittedOperations).toHaveLength(1);
      expect(result.omittedOperations[0].reason).toContain('classical bit target');
    });
  });

  describe('per-operation validation', () => {
    it('rejects CX with identical control and target', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 2,
        clbits: 0,
        operations: [
          { type: 'CX', targets: { qubits: [0, 0] }, time: 0 },
          { type: 'H', targets: { qubits: [0] }, time: 1 },
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      expect(result.status).toBe('partially_valid');
      expect(result.omittedOperations[0].reason).toContain('distinct');
    });

    it('rejects operations with negative time', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 1,
        clbits: 0,
        operations: [
          { type: 'H', targets: { qubits: [0] }, time: -1 },
          { type: 'X', targets: { qubits: [0] }, time: 0 },
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      expect(result.status).toBe('partially_valid');
      expect(result.omittedOperations).toHaveLength(1);
    });

    it('rejects operations with non-integer time', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 1,
        clbits: 0,
        operations: [
          { type: 'H', targets: { qubits: [0] }, time: 0.5 },
          { type: 'X', targets: { qubits: [0] }, time: 1 },
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      expect(result.status).toBe('partially_valid');
    });

    it('rejects operations with missing targets object', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 1,
        clbits: 0,
        operations: [
          { type: 'H', time: 0 },
          { type: 'X', targets: { qubits: [0] }, time: 1 },
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      expect(result.status).toBe('partially_valid');
      expect(result.omittedOperations).toHaveLength(1);
    });

    it('rejects non-object operations in the array', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 1,
        clbits: 0,
        operations: [
          'not-an-object',
          { type: 'H', targets: { qubits: [0] }, time: 0 },
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      expect(result.status).toBe('partially_valid');
      expect(result.omittedOperations).toHaveLength(1);
    });

    it('validates MEASURE clbit index is in range', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 1,
        clbits: 1,
        operations: [
          { type: 'MEASURE', targets: { qubits: [0], clbits: [5] }, time: 0 }, // clbit 5 out of range
          { type: 'H', targets: { qubits: [0] }, time: 1 },
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      expect(result.status).toBe('partially_valid');
      expect(result.omittedOperations[0].reason).toContain('classical bit index');
    });
  });

  describe('fully invalid — no importable operations', () => {
    it('returns invalid when all operations are unsupported', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 3,
        clbits: 0,
        operations: [
          { type: 'TOFFOLI', targets: { qubits: [0, 1, 2] }, time: 0 },
          { type: 'SWAP', targets: { qubits: [0, 1] }, time: 1 },
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      expect(result.status).toBe('invalid');
      expect(result.messages.some((m) => m.message.includes('No operations could be imported'))).toBe(true);
      expect(result.importableCircuit).toBeUndefined();
    });
  });

  describe('message quality', () => {
    it('provides actionable messages for unsupported gates', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 3,
        clbits: 0,
        operations: [
          { type: 'TOFFOLI', targets: { qubits: [0, 1, 2] }, time: 0 },
          { type: 'H', targets: { qubits: [0] }, time: 1 },
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      const warningMsg = result.messages.find((m) => m.severity === 'warning');
      expect(warningMsg).toBeDefined();
      expect(warningMsg!.message).toContain('Supported:');
      expect(warningMsg!.operationIndex).toBe(0);
    });

    it('includes info message about omission count for partial imports', () => {
      const circuit = {
        schemaVersion: 1,
        qubits: 2,
        clbits: 0,
        operations: [
          { type: 'H', targets: { qubits: [0] }, time: 0 },
          { type: 'RZ', targets: { qubits: [0] }, time: 1 },
          { type: 'RX', targets: { qubits: [1] }, time: 2 },
        ],
      };

      const result = validateAiCircuit(circuit, defaultLimits);
      expect(result.status).toBe('partially_valid');
      const info = result.messages.find((m) => m.severity === 'info');
      expect(info).toBeDefined();
      expect(info!.message).toContain('2 operation(s) were omitted');
    });
  });
});
