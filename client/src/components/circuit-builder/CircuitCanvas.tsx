/**
 * CircuitCanvas displays the quantum circuit as a grid/timeline.
 * Qubits and classical bits are shown as horizontal wires, with gates
 * placed at integer time-step columns.
 */
export default function CircuitCanvas() {
  return (
    <section className="circuit-canvas" aria-label="Circuit timeline">
      <div className="circuit-canvas__empty">
        <p>Add qubits and gates to start building your circuit.</p>
      </div>
    </section>
  );
}
