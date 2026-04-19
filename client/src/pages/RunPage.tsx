import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSimulation } from '../hooks/useSimulation';

const DEFAULT_SHOTS = 1024;
const MAX_SHOTS = 100000;

const EXAMPLE_QASM = `OPENQASM 2.0;
include "qelib1.inc";

qreg q[2];
creg c[2];

h q[0];
cx q[0],q[1];
measure q[0] -> c[0];
measure q[1] -> c[1];
`;

export default function RunPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { submit, job, error, loading } = useSimulation();

  const [qasm, setQasm] = useState(EXAMPLE_QASM);
  const [shots, setShots] = useState(DEFAULT_SHOTS);
  const [shotsError, setShotsError] = useState('');

  function validateShots(value: number): string {
    if (!Number.isInteger(value) || value < 1) return 'Shots must be a positive integer.';
    if (value > MAX_SHOTS) return `Shots cannot exceed ${MAX_SHOTS.toLocaleString()}.`;
    return '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const err = validateShots(shots);
    if (err) {
      setShotsError(err);
      return;
    }
    setShotsError('');

    await submit({ qasm, shots });
  }

  // Navigate to results once job is created
  if (job && !loading) {
    navigate(`/results?jobId=${job.jobId}`, { replace: true });
    return null;
  }

  return (
    <div className="run-page">
      <h1 className="run-page__title">Run Simulation</h1>
      <p className="run-page__subtitle">Submit an OpenQASM circuit to the Qiskit simulator.</p>

      {!user && (
        <div className="alert alert--error" role="alert">
          You must be logged in to run simulations.
        </div>
      )}

      <form className="run-form" onSubmit={handleSubmit} aria-label="Submit simulation">
        <div className="form-field">
          <label className="form-field__label" htmlFor="qasm-input">
            OpenQASM Circuit
          </label>
          <textarea
            id="qasm-input"
            className="form-field__input run-form__qasm"
            value={qasm}
            onChange={(e) => setQasm(e.target.value)}
            placeholder="Paste OpenQASM 2.0 code here..."
            rows={12}
            spellCheck={false}
            required
            aria-describedby="qasm-hint"
          />
          <p id="qasm-hint" className="form-field__hint">
            OpenQASM 2.0 or 3 text. Must include measurement gates to produce counts.
          </p>
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor="shots-input">
            Shots
          </label>
          <input
            id="shots-input"
            className="form-field__input run-form__shots"
            type="number"
            min={1}
            max={MAX_SHOTS}
            value={shots}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setShots(isNaN(v) ? 0 : v);
              setShotsError('');
            }}
            required
            aria-describedby="shots-hint"
            aria-invalid={shotsError ? 'true' : undefined}
          />
          {shotsError ? (
            <p className="form-field__error" role="alert">
              {shotsError}
            </p>
          ) : (
            <p id="shots-hint" className="form-field__hint">
              Number of simulation repetitions (1 &ndash; {MAX_SHOTS.toLocaleString()}).
            </p>
          )}
        </div>

        {error && (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn--primary btn--full"
          disabled={loading || !user || qasm.trim().length === 0}
        >
          {loading ? 'Submitting...' : 'Run Simulation'}
        </button>
      </form>
    </div>
  );
}
