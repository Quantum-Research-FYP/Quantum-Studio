/**
 * CodePanel displays the generated Qiskit Python code in a read-only view.
 * Supports text selection for manual copying alongside the explicit copy button.
 */
export default function CodePanel() {
  const code = '# Add qubits and gates to generate Qiskit code';

  return (
    <section className="code-panel" aria-label="Generated Qiskit code">
      <h3 className="code-panel__title">Qiskit Code</h3>
      <pre className="code-panel__code">
        <code>{code}</code>
      </pre>
    </section>
  );
}
