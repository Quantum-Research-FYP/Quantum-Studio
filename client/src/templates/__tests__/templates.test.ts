import { describe, it, expect } from 'vitest';
import { getTemplates, getTemplateById, loadTemplateCircuit } from '../index';
import { validateCircuit } from '../../circuit/validation';
import { generateQiskitCode } from '../../circuit/codegen';

describe('Template definitions', () => {
  it('provides at least two templates', () => {
    const templates = getTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(2);
  });

  it('each template has required metadata fields', () => {
    for (const template of getTemplates()) {
      expect(template.templateId).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.tags.length).toBeGreaterThan(0);
      expect(template.schemaVersion).toBe(1);
      expect(template.defaultExecutionConfig.shots).toBeGreaterThan(0);
    }
  });

  it('each template has a unique stable templateId', () => {
    const templates = getTemplates();
    const ids = templates.map((t) => t.templateId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getTemplateById returns correct template', () => {
    expect(getTemplateById('bell-state')?.name).toBe('Bell State');
    expect(getTemplateById('grover-2q')?.name).toBe('Grover');
    expect(getTemplateById('nonexistent')).toBeUndefined();
  });
});

describe('loadTemplateCircuit', () => {
  it('generates a valid CircuitModel for Bell state with no validation errors', () => {
    const template = getTemplateById('bell-state')!;
    const circuit = loadTemplateCircuit(template);

    expect(circuit.schemaVersion).toBe(1);
    expect(circuit.qubits).toBe(2);
    expect(circuit.clbits).toBe(2);
    expect(circuit.operations).toHaveLength(4);

    const errors = validateCircuit(circuit);
    expect(errors).toEqual([]);
  });

  it('generates a valid CircuitModel for Grover with no validation errors', () => {
    const template = getTemplateById('grover-2q')!;
    const circuit = loadTemplateCircuit(template);

    expect(circuit.schemaVersion).toBe(1);
    expect(circuit.qubits).toBe(2);
    expect(circuit.clbits).toBe(2);
    expect(circuit.operations.length).toBeGreaterThan(0);

    const errors = validateCircuit(circuit);
    expect(errors).toEqual([]);
  });

  it('assigns unique operation IDs on each load', () => {
    const template = getTemplateById('bell-state')!;
    const circuit1 = loadTemplateCircuit(template);
    const circuit2 = loadTemplateCircuit(template);

    const ids1 = circuit1.operations.map((op) => op.id);
    const ids2 = circuit2.operations.map((op) => op.id);

    // IDs within a single load are unique
    expect(new Set(ids1).size).toBe(ids1.length);
    // IDs differ between loads
    expect(ids1).not.toEqual(ids2);
  });

  it('produces valid Qiskit code for Bell state', () => {
    const template = getTemplateById('bell-state')!;
    const circuit = loadTemplateCircuit(template);
    const code = generateQiskitCode(circuit);

    expect(code).toContain('from qiskit import QuantumCircuit');
    expect(code).toContain('QuantumCircuit(2, 2)');
    expect(code).toContain('qc.h(0)');
    expect(code).toContain('qc.cx(0, 1)');
    expect(code).toContain('qc.measure(0, 0)');
    expect(code).toContain('qc.measure(1, 1)');
  });

  it('produces valid Qiskit code for Grover', () => {
    const template = getTemplateById('grover-2q')!;
    const circuit = loadTemplateCircuit(template);
    const code = generateQiskitCode(circuit);

    expect(code).toContain('from qiskit import QuantumCircuit');
    expect(code).toContain('QuantumCircuit(2, 2)');
    expect(code).toContain('qc.h(');
    expect(code).toContain('qc.cx(0, 1)');
    expect(code).toContain('qc.x(');
    expect(code).toContain('qc.measure(0, 0)');
    expect(code).toContain('qc.measure(1, 1)');
  });

  it('sets metadata.name from template name', () => {
    const template = getTemplateById('bell-state')!;
    const circuit = loadTemplateCircuit(template);
    expect(circuit.metadata?.name).toBe('Bell State');
  });
});
