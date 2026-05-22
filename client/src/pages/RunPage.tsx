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
const SHOTS_PRESETS = [512, 1024, 4096, 10000];

const EXAMPLE_QASM = `OPENQASM 2.0;
include "qelib1.inc";

qreg q[2];
creg c[2];

h q[0];
cx q[0],q[1];
measure q[0] -> c[0];
measure q[1] -> c[1];
`;

const EXAMPLE_PYTHON = `from qiskit import QuantumCircuit

qc = QuantumCircuit(2, 2)
qc.h(0)
qc.cx(0, 1)
qc.measure(0, 0)
qc.measure(1, 1)
`;

type SelectedProvider = 'simulator' | 'ibm_quantum';
type CredentialStatus = 'unknown' | 'missing' | 'invalid' | 'valid';
type CodeType = 'qasm' | 'python';
// Separate from credentialStatus: token passed settings validation but was
// rejected by the live IBM backend-listing call (e.g. expired or wrong scope).
type LiveTokenState = 'ok' | 'rejected';

export default function RunPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [codeType, setCodeType] = useState<CodeType>('qasm');
  const [code, setCode] = useState(EXAMPLE_QASM);
  const [shots, setShots] = useState(DEFAULT_SHOTS);
  const [shotsError, setShotsError] = useState('');

  const [providers, setProviders] = useState<ExecutionProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<SelectedProvider>('simulator');

  const [ibmBackends, setIbmBackends] = useState<IbmBackend[]>([]);
  const [selectedBackend, setSelectedBackend] = useState('');
  const [ibmSettings, setIbmSettings] = useState<IbmSettingsResponse | null>(null);
  const [loadingBackends, setLoadingBackends] = useState(false);
  const [backendsError, setBackendsError] = useState('');
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus>('unknown');
  const [liveTokenState, setLiveTokenState] = useState<LiveTokenState>('ok');
  const [loadingCredentials, setLoadingCredentials] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    getProviders()
      .then((data) => setProviders(data.providers))
      .catch(() => setProviders([{ id: 'simulator', name: 'Simulator', available: true }]));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoadingCredentials(true);
    getIbmSettings()
      .then((settings) => {
        setIbmSettings(settings);
        setCredentialStatus(settings.validationStatus === 'invalid' ? 'invalid' : 'valid');
      })
      .catch((err: unknown) => {
        const apiErr = err as { status?: number };
        setCredentialStatus(apiErr.status === 404 ? 'missing' : 'missing');
        setIbmSettings(null);
      })
      .finally(() => setLoadingCredentials(false));
  }, [user]);

  useEffect(() => {
    if (selectedProvider !== 'ibm_quantum' || credentialStatus !== 'valid' || !user) return;

    let cancelled = false;
    setLoadingBackends(true);
    setBackendsError('');
    setLiveTokenState('ok');

    listIbmBackends()
      .then((data) => {
        if (cancelled) return;
        setIbmBackends(data.backends);
        if (data.backends.length > 0 && !selectedBackend) {
          const online = data.backends.find((b) => b.status === 'online');
          setSelectedBackend(online?.name || data.backends[0].name);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const apiErr = err as { errorCode?: string };
        if (apiErr.errorCode === 'CREDENTIALS_MISSING') {
          setCredentialStatus('missing');
        } else if (apiErr.errorCode === 'INVALID_TOKEN') {
          // Token was accepted by settings validation but rejected by the live
          // IBM API. Keep credentialStatus as-is so the settings badge stays
          // accurate; use a separate flag to block submission.
          setLiveTokenState('rejected');
        } else {
          setBackendsError('Unable to load backends. IBM Quantum may be temporarily unavailable.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBackends(false);
      });

    return () => { cancelled = true; };
  }, [selectedProvider, credentialStatus, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const ibmAvailable = providers.some((p) => p.id === 'ibm_quantum' && p.available);

  function validateShots(value: number): string {
    if (!Number.isInteger(value) || value < 1) return 'Shots must be a positive integer.';
    if (value > MAX_SHOTS) return `Shots cannot exceed ${MAX_SHOTS.toLocaleString()}.`;
    return '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateShots(shots);
    if (err) { setShotsError(err); return; }
    setShotsError('');
    setError('');
    setSubmitting(true);
    try {
      const job = await submitExecutionJob({
        provider: selectedProvider,
        backend: selectedProvider === 'ibm_quantum' ? selectedBackend : undefined,
        qasm: code,
        shots,
        codeType,
      });
      navigate(`/results?jobId=${job.jobId}`, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit job.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const isIbmBlocked =
    selectedProvider === 'ibm_quantum' &&
    (credentialStatus === 'missing' || credentialStatus === 'invalid' || liveTokenState === 'rejected');

  const canSubmit =
    user &&
    !submitting &&
    code.trim().length > 0 &&
    !isIbmBlocked &&
    (selectedProvider !== 'ibm_quantum' || selectedBackend);

  const activePreset = SHOTS_PRESETS.includes(shots) ? shots : null;

  function switchCodeType(next: CodeType) {
    setCodeType(next);
    if (next === 'python' && code === EXAMPLE_QASM) setCode(EXAMPLE_PYTHON);
    if (next === 'qasm' && code === EXAMPLE_PYTHON) setCode(EXAMPLE_QASM);
  }

  return (
    <div className="run-page">
      <div className="run-page__header">
        <div>
          <h1 className="run-page__title">Run Circuit</h1>
          <p className="run-page__subtitle">
            Simulate locally or run on real IBM Quantum hardware.
          </p>
        </div>
        <Link to="/builder" className="btn btn--ghost btn--sm">← Builder</Link>
      </div>

      {!user && (
        <div className="alert alert--error" role="alert">
          You must be logged in to run circuits.
        </div>
      )}

      <form className="run-layout" onSubmit={handleSubmit} aria-label="Submit execution job">

        {/* ── Left sidebar ── */}
        <aside className="run-sidebar">

          {/* Provider */}
          <div className="run-sidebar__section">
            <div className="run-sidebar__label">Provider</div>
            <div className="provider-cards provider-cards--vertical">
              <button
                type="button"
                className={`provider-card${selectedProvider === 'simulator' ? ' provider-card--selected' : ''}`}
                onClick={() => setSelectedProvider('simulator')}
              >
                <div className="provider-card__icon">⚡</div>
                <div className="provider-card__body">
                  <div className="provider-card__name">Simulator</div>
                  <div className="provider-card__desc">Fast local Qiskit AerSimulator</div>
                  <span className="provider-card__badge provider-card__badge--ok">Always available</span>
                </div>
              </button>

              {ibmAvailable && (
                <button
                  type="button"
                  className={[
                    'provider-card',
                    selectedProvider === 'ibm_quantum' ? 'provider-card--selected' : '',
                    credentialStatus === 'missing' || credentialStatus === 'invalid' ? 'provider-card--warn' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setSelectedProvider('ibm_quantum')}
                >
                  <div className="provider-card__icon">🔬</div>
                  <div className="provider-card__body">
                    <div className="provider-card__name">IBM Quantum</div>
                    <div className="provider-card__desc">Real quantum hardware</div>
                    {loadingCredentials ? (
                      <span className="provider-card__badge">Checking…</span>
                    ) : credentialStatus === 'missing' ? (
                      <span className="provider-card__badge provider-card__badge--warn">Setup required</span>
                    ) : credentialStatus === 'invalid' ? (
                      <span className="provider-card__badge provider-card__badge--error">Token invalid</span>
                    ) : (
                      <span className="provider-card__badge provider-card__badge--ok">Ready</span>
                    )}
                  </div>
                </button>
              )}
            </div>

            {selectedProvider === 'ibm_quantum' && credentialStatus === 'missing' && (
              <div className="run-inline-notice run-inline-notice--warn" role="alert">
                Configure your IBM Quantum API token to run on real hardware.
                <div className="run-inline-notice__actions">
                  <Link to="/settings" className="btn btn--primary btn--sm">Go to Settings</Link>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedProvider('simulator')}>
                    Use Simulator
                  </button>
                </div>
              </div>
            )}

            {selectedProvider === 'ibm_quantum' && credentialStatus === 'invalid' && (
              <div className="run-inline-notice run-inline-notice--error" role="alert">
                IBM Quantum token is invalid.
                {ibmSettings?.validationErrorCode && ` (${ibmSettings.validationErrorCode})`}
                <div className="run-inline-notice__actions">
                  <Link to="/settings" className="btn btn--primary btn--sm">Update Token</Link>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedProvider('simulator')}>
                    Use Simulator
                  </button>
                </div>
              </div>
            )}

            {selectedProvider === 'ibm_quantum' && credentialStatus === 'valid' && liveTokenState === 'rejected' && (
              <div className="run-inline-notice run-inline-notice--error" role="alert">
                Your token was rejected by the IBM Quantum API. It may have expired or lack
                the required permissions. Please re-enter it in Settings.
                <div className="run-inline-notice__actions">
                  <Link to="/settings" className="btn btn--primary btn--sm">Update Token</Link>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedProvider('simulator')}>
                    Use Simulator
                  </button>
                </div>
              </div>
            )}

            {selectedProvider === 'ibm_quantum' && credentialStatus === 'valid' && liveTokenState === 'ok' && (
              <div className="backends-section">
                <div className="backends-section__label">Backend</div>
                {loadingBackends ? (
                  <p className="form-field__hint">Loading backends…</p>
                ) : backendsError ? (
                  <div className="run-inline-notice run-inline-notice--warn" role="alert">
                    {backendsError}
                    <div className="run-inline-notice__actions">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedProvider('simulator')}>
                        Use Simulator
                      </button>
                    </div>
                  </div>
                ) : ibmBackends.length === 0 ? (
                  <div className="run-inline-notice run-inline-notice--warn" role="alert">
                    No backends available for your account.
                    <div className="run-inline-notice__actions">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelectedProvider('simulator')}>
                        Use Simulator
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="backends-grid">
                    {ibmBackends.map((b) => (
                      <button
                        key={b.name}
                        type="button"
                        className={[
                          'backend-card',
                          selectedBackend === b.name ? 'backend-card--selected' : '',
                          b.status !== 'online' ? 'backend-card--offline' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => b.status === 'online' && setSelectedBackend(b.name)}
                        disabled={b.status !== 'online'}
                      >
                        <div className="backend-card__name">{b.name}</div>
                        <div className="backend-card__meta">
                          <span>{b.qubits}q</span>
                          <span className={`backend-card__dot${b.status === 'online' ? ' backend-card__dot--online' : ''}`} />
                          <span>{b.status}</span>
                          {b.status === 'online' && <span>{b.pendingJobs} queued</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Shots */}
          <div className="run-sidebar__section">
            <div className="run-sidebar__label">Shots</div>
            <div className="shots-presets">
              {SHOTS_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`shots-preset${activePreset === p ? ' shots-preset--active' : ''}`}
                  onClick={() => { setShots(p); setShotsError(''); }}
                >
                  {p.toLocaleString()}
                </button>
              ))}
            </div>
            <input
              className="form-field__input run-shots-input"
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
              aria-label="Shots"
              aria-invalid={shotsError ? 'true' : undefined}
            />
            {shotsError ? (
              <p className="form-field__error" role="alert">{shotsError}</p>
            ) : (
              <p className="form-field__hint">1 – {MAX_SHOTS.toLocaleString()} executions</p>
            )}
          </div>

          {/* Error + Submit */}
          <div className="run-sidebar__footer">
            {error && (
              <div className="alert alert--error" role="alert">{error}</div>
            )}
            <button
              type="submit"
              className="btn btn--primary btn--full run-submit-btn"
              disabled={!canSubmit}
            >
              {submitting
                ? 'Submitting…'
                : selectedProvider === 'ibm_quantum'
                  ? `Run on IBM Quantum${selectedBackend ? ` — ${selectedBackend}` : ''}`
                  : `Run Simulation — ${shots.toLocaleString()} shots`}
            </button>
          </div>
        </aside>

        {/* ── Code editor pane ── */}
        <div className="run-editor">
          <div className="run-editor__header">
            <div className="code-type-toggle" role="group" aria-label="Code type">
              <button
                type="button"
                className={`code-type-btn${codeType === 'qasm' ? ' code-type-btn--active' : ''}`}
                onClick={() => switchCodeType('qasm')}
              >
                QASM
              </button>
              <button
                type="button"
                className={`code-type-btn${codeType === 'python' ? ' code-type-btn--active' : ''}`}
                onClick={() => switchCodeType('python')}
              >
                Qiskit Python
              </button>
            </div>
            <span className="run-editor__hint">
              {codeType === 'python'
                ? 'Define your circuit as qc = QuantumCircuit(…)'
                : 'OpenQASM 2.0 or 3 — include measure gates'}
            </span>
          </div>
          <textarea
            className="run-editor__textarea"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={
              codeType === 'python'
                ? 'from qiskit import QuantumCircuit\n\nqc = QuantumCircuit(2, 2)\n...'
                : 'OPENQASM 2.0;\ninclude "qelib1.inc";\n\nqreg q[2];\n...'
            }
            spellCheck={false}
            required
            aria-label={codeType === 'python' ? 'Qiskit Python Circuit' : 'OpenQASM Circuit'}
          />
        </div>

      </form>
    </div>
  );
}
