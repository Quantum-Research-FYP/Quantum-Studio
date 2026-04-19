import type { CircuitModel } from '../../circuit';
import { generateQiskitCode } from '../../circuit';

/**
 * CodePanel displays the generated Qiskit Python code in a read-only view.
 * Code is regenerated on every circuit change (pure function, sub-millisecond).
 * Supports text selection for manual copying alongside the explicit copy button.
 */

interface CodePanelProps {
  circuit: CircuitModel;
}

export default function CodePanel({ circuit }: CodePanelProps) {
  const code = generateQiskitCode(circuit);

  return (
    <section className="code-panel" aria-label="Generated Qiskit code">
      <h3 className="code-panel__title">Qiskit Code</h3>
      <pre className="code-panel__code">
        <code>{code}</code>
      </pre>
    </section>
  );
}
