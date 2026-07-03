export type Framework = 'qiskit' | 'cirq' | 'pennylane' | 'braket' | 'tket' | 'qasm';

interface CodePanelProps {
  code: string;
  framework: Framework;
  onFrameworkChange: (fw: Framework) => void;
}

export default function CodePanel({ code, framework, onFrameworkChange }: CodePanelProps) {
  return (
    <section className="code-panel" aria-label="Generated circuit code">
      <div className="code-panel__header">
        <h3 className="code-panel__title">Code</h3>
        <select 
          value={framework} 
          onChange={(e) => onFrameworkChange(e.target.value as Framework)}
          className="code-panel__selector"
          aria-label="Select framework"
        >
          <option value="qiskit">Qiskit</option>
          <option value="cirq">Cirq</option>
          <option value="pennylane">PennyLane</option>
          <option value="braket">Amazon Braket</option>
          <option value="tket">TKET</option>
          <option value="qasm">OpenQASM</option>
        </select>
      </div>
      <pre className="code-panel__code">
        <code>{code}</code>
      </pre>
    </section>
  );
}
