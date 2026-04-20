import type { AiProvider, AiProviderOptions, AiProviderResponse } from '../types.js';

/**
 * Mock AI provider for development and testing.
 * Returns a deterministic Bell state circuit for any prompt.
 */
export function createMockProvider(): AiProvider {
  return {
    name: 'mock',
    model: 'mock-v1',

    async generateDraft(prompt: string, options?: AiProviderOptions): Promise<AiProviderResponse> {
      // Respect cancellation
      if (options?.signal?.aborted) {
        throw new Error('Request was cancelled.');
      }

      // Simulate network latency
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 100);
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Request was cancelled.'));
          });
        }
      });

      if (options?.signal?.aborted) {
        throw new Error('Request was cancelled.');
      }

      // Generate a simple Bell state circuit as the mock response
      const circuitJson = {
        schemaVersion: 1 as const,
        qubits: 2,
        clbits: 2,
        operations: [
          { type: 'H', targets: { qubits: [0] }, time: 0 },
          { type: 'CX', targets: { qubits: [0, 1] }, time: 1 },
          { type: 'MEASURE', targets: { qubits: [0], clbits: [0] }, time: 2 },
          { type: 'MEASURE', targets: { qubits: [1], clbits: [1] }, time: 3 },
        ],
      };

      const generatedCode = [
        'from qiskit import QuantumCircuit',
        '',
        'qc = QuantumCircuit(2, 2)',
        'qc.h(0)',
        'qc.cx(0, 1)',
        'qc.measure(0, 0)',
        'qc.measure(1, 1)',
      ].join('\n');

      const explanation =
        `Based on your prompt: "${prompt.slice(0, 100)}", here is a 2-qubit Bell state circuit. ` +
        'A Hadamard gate is applied to qubit 0 to create superposition, followed by a CNOT gate ' +
        'targeting qubit 1 (controlled by qubit 0) to entangle the two qubits. ' +
        'Both qubits are then measured.';

      return {
        circuitJson,
        explanation,
        generatedCode,
        provider: 'mock',
        model: 'mock-v1',
      };
    },
  };
}
