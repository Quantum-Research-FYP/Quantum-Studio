import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../serialization';
import { addClbit, addQubit, createEmptyCircuit, placeGate } from '../model';
import type { CircuitModel } from '../types';

describe('serialize', () => {
  it('produces deterministic output', () => {
    let circuit = addQubit(addQubit(createEmptyCircuit()));
    ({ circuit } = placeGate(circuit, 'H', { qubits: [0] }, 0));
    ({ circuit } = placeGate(circuit, 'X', { qubits: [1] }, 1));

    const json1 = serialize(circuit);
    const json2 = serialize(circuit);
    expect(json1).toBe(json2);
  });

  it('sorts operations by time then id', () => {
    let circuit = addQubit(createEmptyCircuit());
    // Place at time 2 first, then time 0
    ({ circuit } = placeGate(circuit, 'X', { qubits: [0] }, 2));
    ({ circuit } = placeGate(circuit, 'H', { qubits: [0] }, 0));

    const json = serialize(circuit);
    const parsed = JSON.parse(json);
    expect(parsed.operations[0].time).toBe(0);
    expect(parsed.operations[1].time).toBe(2);
  });

  it('includes schema version, qubits, clbits', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addClbit(circuit);
    const json = serialize(circuit);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.qubits).toBe(1);
    expect(parsed.clbits).toBe(1);
  });

  it('includes metadata when present', () => {
    const circuit: CircuitModel = {
      ...createEmptyCircuit(),
      metadata: { name: 'test circuit' },
    };
    const json = serialize(circuit);
    const parsed = JSON.parse(json);
    expect(parsed.metadata.name).toBe('test circuit');
  });

  it('omits metadata when absent', () => {
    const circuit = createEmptyCircuit();
    const json = serialize(circuit);
    const parsed = JSON.parse(json);
    expect(parsed.metadata).toBeUndefined();
  });
});

describe('deserialize', () => {
  it('parses a valid circuit JSON', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      qubits: 2,
      clbits: 1,
      operations: [
        { id: 'op1', type: 'H', targets: { qubits: [0] }, time: 0 },
      ],
    });
    const circuit = deserialize(json);
    expect(circuit.schemaVersion).toBe(1);
    expect(circuit.qubits).toBe(2);
    expect(circuit.operations).toHaveLength(1);
    expect(circuit.operations[0].type).toBe('H');
  });

  it('throws on invalid JSON', () => {
    expect(() => deserialize('not json')).toThrow(/unable to parse/i);
  });

  it('throws on wrong schema version', () => {
    expect(() => deserialize('{"schemaVersion":99}')).toThrow(/Unsupported schema version/);
  });

  it('throws on invalid qubit count', () => {
    expect(() =>
      deserialize('{"schemaVersion":1,"qubits":-1,"clbits":0,"operations":[]}'),
    ).toThrow(/Invalid qubits/);
  });

  it('throws on invalid operation type', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      qubits: 1,
      clbits: 0,
      operations: [{ id: '1', type: 'INVALID', targets: { qubits: [0] }, time: 0 }],
    });
    expect(() => deserialize(json)).toThrow(/invalid type/);
  });

  it('throws on out-of-range qubit index in operation', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      qubits: 1,
      clbits: 0,
      operations: [{ id: '1', type: 'H', targets: { qubits: [5] }, time: 0 }],
    });
    expect(() => deserialize(json)).toThrow(/invalid qubit index/i);
  });

  it('throws on missing operation id', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      qubits: 1,
      clbits: 0,
      operations: [{ type: 'H', targets: { qubits: [0] }, time: 0 }],
    });
    expect(() => deserialize(json)).toThrow(/non-empty string id/);
  });
});

describe('round-trip', () => {
  it('serialize then deserialize produces equivalent circuit', () => {
    let circuit = createEmptyCircuit();
    circuit = addQubit(circuit);
    circuit = addQubit(circuit);
    circuit = addClbit(circuit);
    ({ circuit } = placeGate(circuit, 'H', { qubits: [0] }, 0));
    ({ circuit } = placeGate(circuit, 'CX', { qubits: [0, 1] }, 1));
    ({ circuit } = placeGate(circuit, 'MEASURE', { qubits: [0], clbits: [0] }, 2));

    const json = serialize(circuit);
    const restored = deserialize(json);
    const json2 = serialize(restored);
    expect(json).toBe(json2);
  });

  it('round-trips an empty circuit', () => {
    const circuit = createEmptyCircuit();
    const json = serialize(circuit);
    const restored = deserialize(json);
    expect(restored).toEqual(circuit);
  });

  it('preserves metadata through round-trip', () => {
    const circuit: CircuitModel = {
      ...addQubit(createEmptyCircuit()),
      metadata: { name: 'my circuit' },
    };
    const restored = deserialize(serialize(circuit));
    expect(restored.metadata?.name).toBe('my circuit');
  });
});
