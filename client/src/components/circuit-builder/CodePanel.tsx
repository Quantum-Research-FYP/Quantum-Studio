/**
 * CodePanel displays the generated Qiskit Python code in a read-only view.
 * Supports text selection for manual copying alongside the explicit copy button.
 */

interface CodePanelProps {
  code: string;
}

export default function CodePanel({ code }: CodePanelProps) {
  return (
    <section className="code-panel" aria-label="Generated Qiskit code">
      <h3 className="code-panel__title">Qiskit Code</h3>
      <pre className="code-panel__code">
        <code>{code}</code>
      </pre>
    </section>
  );
}
