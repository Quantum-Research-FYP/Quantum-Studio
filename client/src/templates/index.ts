import type { CircuitModel } from '../circuit';
import type { TemplateDefinition } from './types';
import { bellStateTemplate } from './bell-state';
import { groverTemplate } from './grover';

export type { TemplateDefinition, TemplateCircuit, ExecutionConfig, TemplateOperation } from './types';

/** All available starter templates, ordered for display. */
const TEMPLATES: readonly TemplateDefinition[] = [bellStateTemplate, groverTemplate];

/** Get all available templates. */
export function getTemplates(): readonly TemplateDefinition[] {
  return TEMPLATES;
}

/** Look up a template by its stable identifier. Returns undefined if not found. */
export function getTemplateById(templateId: string): TemplateDefinition | undefined {
  return TEMPLATES.find((t) => t.templateId === templateId);
}

/**
 * Convert a template definition into a fully valid CircuitModel ready for the editor.
 *
 * Generates fresh unique IDs for each operation so that loaded templates
 * have no ID collisions with existing circuits or repeated loads.
 */
export function loadTemplateCircuit(template: TemplateDefinition): CircuitModel {
  return {
    schemaVersion: template.schemaVersion,
    qubits: template.circuit.qubits,
    clbits: template.circuit.clbits,
    operations: template.circuit.operations.map((op) => ({
      id: crypto.randomUUID(),
      type: op.type,
      targets: {
        qubits: [...op.targets.qubits],
        ...(op.targets.clbits ? { clbits: [...op.targets.clbits] } : {}),
      },
      time: op.time,
    })),
    metadata: {
      name: template.name,
    },
  };
}
