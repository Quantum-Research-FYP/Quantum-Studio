import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  getProviders,
  listIbmBackends,
  submitExecutionJob,
  type ExecutionProvider,
  type IbmBackend,
} from '../api/execution';
import { getIbmSettings, type IbmSettingsResponse } from '../api/integrations';

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

type SelectedProvider = 'simulator' | 'ibm_quantum';

export default function RunPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Form state
  const [qasm, setQasm] = useState(EXAMPLE_QASM);
  const [shots, setShots] = useState(DEFAULT_SHOTS);
  const [shotsError, setShotsError] = useState('');

  // Provider selection
  const [providers, setProviders] = useState<ExecutionProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<SelectedProvider>('simulator');

  // IBM-specific state
  const [ibmBackends, setIbmBackends] = useState<IbmBackend[]>([]);
  const [selectedBackend, setSelectedBackend] = useState('');
  const [ibmSettings, setIbmSettings] = useState<IbmSettingsResponse | null>(null);
  const [loadingBackends, setLoadingBackends] = useState(false);
  const [backendsError, setBackendsError] = useState('');
  const [credentialStatus, setCredentialStatus] = useState<'unknown' | 'missing' | 'invalid' | 'valid'>('unknown');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch available providers on mount
  useEffect(() => {
    if (!user) return;
    getProviders()
      .then((data) => setProviders(data.providers))
      .catch(() => {
        // Fallback: only simulator available
        setProviders([{ id: 'simulator', name: 'Simulator', available: true }]);
      });
  }, [user]);

  const ibmAvailable = providers.some((p) => p.id === 'ibm_quantum' && p.available);

  // When IBM is selected, check credentials and load backends
  useEffect(() => {
    if (selectedProvider !== 'ibm_quantum' || !user) return;

    let cancelled = false;

    async function loadIbmData() {
      // Check credentials
      try {
        const settings = await getIbmSettings();
        if (cancelled) return;
        setIbmSettings(settings);

        if (settings.validationStatus === 'valid') {
          setCredentialStatus('valid');
        } else if (settings.validationStatus === 'invalid') {
          setCredentialStatus('invalid');
        } else {
          // pending or error — treat as valid enough to try backends
          setCredentialStatus('valid');
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const apiErr = err as { status?: number };
        if (apiErr.status === 404) {
          setCredentialStatus('missing');
          setIbmSettings(null);
          return;
        }
        setCredentialStatus('missing');
        return;
      }

      // Load backends
      setLoadingBackends(true);
      setBackendsError('');
      try {
        const data = await listIbmBackends();
        if (cancelled) return;
        setIbmBackends(data.backends);
        if (data.backends.length > 0 && !selectedBackend) {
          const online = data.backends.find((b) => b.status === 'online');
          setSelectedBackend(online?.name || data.backends[0].name);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const apiErr = err as { errorCode?: string };
        if (apiErr.errorCode === 'CREDENTIALS_MISSING') {
          setCredentialStatus('missing');
        } else if (apiErr.errorCode === 'INVALID_TOKEN') {
          setCredentialStatus('invalid');
        } else {
          setBackendsError('Unable to load IBM backends. IBM Quantum may be temporarily unavailable.');
        }
      } finally {
        if (!cancelled) setLoadingBackends(false);
      }
    }

    loadIbmData();
    return () => { cancelled = true; };
  }, [selectedProvider, user]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setError('');
    setSubmitting(true);

    try {
      const job = await submitExecutionJob({
        provider: selectedProvider,
        backend: selectedProvider === 'ibm_quantum' ? selectedBackend : undefined,
        qasm,
        shots,
      });

      navigate(`/results?jobId=${job.jobId}`, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit job.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleFallbackToSimulator() {
    setSelectedProvider('simulator');
    setError('');
  }

  const isIbmBlocked =
    selectedProvider === 'ibm_quantum' &&
    (credentialStatus === 'missing' || credentialStatus === 'invalid');

  const canSubmit =
    user &&
    !submitting &&
    qasm.trim().length > 0 &&
    !isIbmBlocked &&
    (selectedProvider !== 'ibm_quantum' || selectedBackend);

  return (
    <div className="run-page">
      <h1 className="run-page__title">Run Circuit</h1>
      <p className="run-page__subtitle">
        Submit an OpenQASM circuit to the simulator or IBM Quantum hardware.
      </p>

      {!user && (
        <div className="alert alert--error" role="alert">
          You must be logged in to run circuits.
        </div>
      )}

      <form className="run-form" onSubmit={handleSubmit} aria-label="Submit execution job">
        {/* Provider Selection */}
        <fieldset className="form-field">
          <legend className="form-field__label">Execution Provider</legend>
          <div className="provider-selector">
            <label className="provider-option">
              <input
                type="radio"
                name="provider"
                value="simulator"
                checked={selectedProvider === 'simulator'}
                onChange={() => setSelectedProvider('simulator')}
              />
              <span className="provider-option__label">Simulator</span>
              <span className="provider-option__desc">Fast local Qiskit simulation</span>
            </label>

            {ibmAvailable && (
              <label className="provider-option">
                <input
                  type="radio"
                  name="provider"
                  value="ibm_quantum"
                  checked={selectedProvider === 'ibm_quantum'}
                  onChange={() => setSelectedProvider('ibm_quantum')}
                />
                <span className="provider-option__label">IBM Quantum</span>
                <span className="provider-option__desc">Real quantum hardware</span>
              </label>
            )}
          </div>
        </fieldset>

        {/* IBM Credentials Warning */}
        {selectedProvider === 'ibm_quantum' && credentialStatus === 'missing' && (
          <div className="alert alert--warning" role="alert">
            <p>
              <strong>IBM Quantum credentials required.</strong> You need to configure your API
              token before running on hardware.
            </p>
            <div className="alert__actions">
              <Link to="/settings" className="btn btn--primary btn--sm">
                Go to Settings
              </Link>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={handleFallbackToSimulator}
              >
                Use Simulator Instead
              </button>
            </div>
          </div>
        )}

        {selectedProvider === 'ibm_quantum' && credentialStatus === 'invalid' && (
          <div className="alert alert--error" role="alert">
            <p>
              <strong>IBM Quantum token is invalid.</strong> Please update your credentials in
              settings.
              {ibmSettings?.validationErrorCode &&
                ` (Error: ${ibmSettings.validationErrorCode})`}
            </p>
            <div className="alert__actions">
              <Link to="/settings" className="btn btn--primary btn--sm">
                Update Token
              </Link>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={handleFallbackToSimulator}
              >
                Use Simulator Instead
              </button>
            </div>
          </div>
        )}

        {/* IBM Backend Selection */}
        {selectedProvider === 'ibm_quantum' && credentialStatus === 'valid' && (
          <div className="form-field">
            <label className="form-field__label" htmlFor="backend-select">
              Target Backend
            </label>
            {loadingBackends ? (
              <p className="form-field__hint">Loading available backends...</p>
            ) : backendsError ? (
              <div className="alert alert--warning alert--compact" role="alert">
                <p>{backendsError}</p>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleFallbackToSimulator}
                >
                  Use Simulator Instead
                </button>
              </div>
            ) : ibmBackends.length === 0 ? (
              <div className="alert alert--warning alert--compact" role="alert">
                <p>No backends available for your account.</p>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleFallbackToSimulator}
                >
                  Use Simulator Instead
                </button>
              </div>
            ) : (
              <>
                <select
                  id="backend-select"
                  className="form-field__input"
                  value={selectedBackend}
                  onChange={(e) => setSelectedBackend(e.target.value)}
                >
                  {ibmBackends.map((b) => (
                    <option key={b.name} value={b.name} disabled={b.status !== 'online'}>
                      {b.name} — {b.qubits}q — {b.status}
                      {b.status === 'online' ? ` (${b.pendingJobs} pending)` : ''}
                    </option>
                  ))}
                </select>
                <p className="form-field__hint">
                  Select a backend to run your circuit on real quantum hardware.
                </p>
              </>
            )}
          </div>
        )}

        {/* QASM Input */}
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

        {/* Shots Input */}
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
              Number of repetitions (1 &ndash; {MAX_SHOTS.toLocaleString()}).
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
          disabled={!canSubmit}
        >
          {submitting
            ? 'Submitting...'
            : selectedProvider === 'ibm_quantum'
              ? 'Run on IBM Quantum'
              : 'Run Simulation'}
        </button>
      </form>
    </div>
  );
}
