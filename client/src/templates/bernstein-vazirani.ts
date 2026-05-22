import type { TemplateDefinition } from './types';

/**
 * Bernstein-Vazirani algorithm template (2 input qubits, secret string s = "11").
 *
 * Finds a hidden bit-string s such that f(x) = s·x (bitwise dot product mod 2)
 * using a single query, versus n classical queries.
 *
 * Setup:
 *   q0, q1 = input qubits; q2 = ancilla initialised to |−⟩ via X then H.
 *   Oracle encodes s = "11" via CX(q0→q2) and CX(q1→q2).
 *
 * Circuit:
 *   q0: ────── H ─ ● ───── H ─ M ─
 *   q1: ────── H ─│─── ● ─ H ─ M ─
 *   q2: ─ X ─ H ─⊕────⊕ ─────────
 *
 * Expected results: q0 = "1", q1 = "1" (recovering the secret s = "11").
 */
export const bernsteinVaziraniTemplate: TemplateDefinition = {
  templateId: 'bernstein-vazirani',
  name: 'Bernstein-Vazirani',
  description: 'Recover a hidden bit-string in one quantum query instead of n classical queries.',
  tags: ['algorithm', 'intermediate'],
  schemaVersion: 1,
  circuit: {
    qubits: 3,
    clbits: 2,
    operations: [
      // Prepare ancilla in |−⟩
      { type: 'X',       targets: { qubits: [2] },    time: 0 },

      // Hadamard on all qubits (inputs + ancilla)
      { type: 'H',       targets: { qubits: [0] },    time: 1 },
      { type: 'H',       targets: { qubits: [1] },    time: 1 },
      { type: 'H',       targets: { qubits: [2] },    time: 1 },

      // Oracle for s = "11": f(x) = x0·s0 ⊕ x1·s1
      { type: 'CX',      targets: { qubits: [0, 2] }, time: 2 },
      { type: 'CX',      targets: { qubits: [1, 2] }, time: 3 },

      // Inverse Hadamard on input qubits
      { type: 'H',       targets: { qubits: [0] },    time: 4 },
      { type: 'H',       targets: { qubits: [1] },    time: 4 },

      // Measure input qubits — deterministically yield s = "11"
      { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 5 },
      { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 5 },
    ],
  },
  defaultExecutionConfig: {
    shots: 1024,
  },
};
