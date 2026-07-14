import { useState } from 'react';

export type Framework = 'qiskit' | 'cirq' | 'pennylane' | 'braket' | 'tket' | 'qasm';

interface CodePanelProps {
  code: string;
  framework: Framework;
  onFrameworkChange: (fw: Framework) => void;
}

export default function CodePanel({ code, framework, onFrameworkChange }: CodePanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className="code-panel" aria-label="Generated circuit code">
      <div className="code-panel__header">
        <h3 className="code-panel__title">Code</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleCopy}
            className="code-panel__copy-btn"
            title="Copy code"
            aria-label="Copy code"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '4px',
              color: 'var(--color-text-subtle)',
              transition: 'color 0.2s ease, background 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = 'var(--color-text)';
              e.currentTarget.style.background = 'var(--color-bg-elevated)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = 'var(--color-text-subtle)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {copied ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            )}
          </button>
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
      </div>
      <pre className="code-panel__code">
        <code>{code}</code>
      </pre>
    </section>
  );
}
