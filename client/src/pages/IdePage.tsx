import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import EditorPanel from '../components/ide/EditorPanel';
import { useExecution } from '../hooks/useExecution';
import { useAuth } from '../hooks/useAuth';
import {
  getProviders,
  listIbmBackends,
  submitExecutionJob,
  type ExecutionProvider,
  type IbmBackend,
} from '../api/execution';
import { getIbmSettings } from '../api/integrations';
import {
  getGitHubStatus,
  listGitHubRepos,
  pushToGitHub,
  type GitHubStatus,
  type GitHubRepo,
} from '../api/github';
import ProbabilityBarChart from '../components/results/ProbabilityBarChart';
import ResultsTable from '../components/results/ResultsTable';
import { PerformanceAnalysisPanel } from '../components/results/PerformanceAnalysisPanel';
import { analyzeCircuit } from '../api/simulations';
import type { NoiseConfig, AnalyzeResponse } from '../api/simulations';

const DEFAULT_PYTHON = `from qiskit import QuantumCircuit

qc = QuantumCircuit(2, 2)
qc.h(0)
qc.cx(0, 1)
qc.measure([0, 1], [0, 1])
`;

const DEFAULT_QASM = `OPENQASM 2.0;
include "qelib1.inc";

qreg q[2];
creg c[2];

h q[0];
cx q[0], q[1];
measure q[0] -> c[0];
measure q[1] -> c[1];
`;

/* ------------------------------------------------------------------ */
/* Explorer Sub-Components                                              */
/* ------------------------------------------------------------------ */

const PythonIcon = () => (
  <svg viewBox="0 0 128 128" width="16" height="16" style={{ flexShrink: 0 }}>
    <path fill="#4B8BBE" d="M64 6.7c-31.5 0-30.2 13.5-30.2 13.5l.1 14h30.8v4.4H33.3s-14.1-.7-14.1 13.9 14.1 14.7 14.1 14.7h9.5v-13.4s-.3-14.7 14.3-14.7h18.2s13.4.1 13.4-13.7V12.1S88.6 6.7 64 6.7zm-14.8 8.6c2.8 0 5 2.2 5 5s-2.2 5-5 5-5-2.2-5-5 2.2-5 5-5z" />
    <path fill="#FFD43B" d="M64 121.3c31.5 0 30.2-13.5 30.2-13.5l-.1-14H63.2v-4.4h31.4s14.1.7 14.1-13.9-14.1-14.7-14.1-14.7h-9.5v13.4s.3 14.7-14.3 14.7H52.5s-13.4-.1-13.4 13.7v13.3s.1 14.6 24.9 14.6zm14.8-8.6c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z" />
  </svg>
);

const QasmIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const FolderIcon = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#fbbf24', flexShrink: 0 }}>
    {open ? (
      <path d="M3 5v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
    ) : (
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    )}
  </svg>
);

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.1s', color: 'var(--color-text-subtle)', flexShrink: 0 }}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

function FileItem({ name, active, onClick, icon }: { name: string, active: boolean, onClick: () => void, icon: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px 6px 36px',
        cursor: 'pointer', fontSize: '0.85rem', userSelect: 'none',
        backgroundColor: active ? 'var(--color-primary-dim)' : hover ? 'var(--color-surface-3)' : 'transparent',
        color: active ? 'var(--color-text)' : hover ? 'var(--color-text)' : 'var(--color-text-muted)',
        borderLeft: active ? '2px solid var(--color-primary)' : '2px solid transparent'
      }}
    >
      {icon}
      <span>{name}</span>
    </div>
  );
}

function FileExplorer({ activeFile, onSelect }: { activeFile: string, onSelect: (f: 'main.py' | 'main.qasm') => void }) {
  const [srcOpen, setSrcOpen] = useState(true);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '12px', borderBottom: '1px solid var(--color-border)' }}>
      <div
        style={{ padding: '16px 16px 12px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-subtle)' }}
      >
        Explorer
      </div>

      <div
        onClick={() => setSrcOpen(!srcOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', cursor: 'pointer',
          color: 'var(--color-text-muted)', fontSize: '0.85rem', userSelect: 'none'
        }}
      >
        <ChevronIcon open={srcOpen} />
        <FolderIcon open={srcOpen} />
        <span style={{ fontWeight: 500, letterSpacing: '0.02em' }}>Quantum-Project</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '2px', overflow: 'hidden', height: srcOpen ? 'auto' : 0 }}>
        <FileItem name="main.py" active={activeFile === 'main.py'} onClick={() => onSelect('main.py')} icon={<PythonIcon />} />
        <FileItem name="main.qasm" active={activeFile === 'main.qasm'} onClick={() => onSelect('main.qasm')} icon={<QasmIcon />} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page Component                                                       */
/* ------------------------------------------------------------------ */

export default function IdePage() {
  const { user } = useAuth();

  // File state
  const [activeFile, setActiveFile] = useState<'main.py' | 'main.qasm'>('main.py');
  const [files, setFiles] = useState<{ 'main.py': string, 'main.qasm': string }>({
    'main.py': DEFAULT_PYTHON,
    'main.qasm': DEFAULT_QASM,
  });

  // Settings State
  const [shots, setShots] = useState(1024);
  const [providers, setProviders] = useState<ExecutionProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<'simulator' | 'ibm_quantum'>('simulator');
  const [ibmBackends, setIbmBackends] = useState<IbmBackend[]>([]);
  const [selectedBackend, setSelectedBackend] = useState('');
  const [credentialStatus, setCredentialStatus] = useState<'unknown' | 'missing' | 'invalid' | 'valid'>('unknown');

  // Noise Settings
  const [noiseEnabled, setNoiseEnabled] = useState(false);
  const [noiseConfig, setNoiseConfig] = useState<NoiseConfig>({
    depolarizing: 0,
    bitFlip: 0,
    phaseFlip: 0,
    amplitudeDamping: 0,
    phaseDamping: 0,
    readoutError: 0,
    crosstalk: 0,
  });

  // Bottom panel tabs
  const [bottomTab, setBottomTab] = useState<'terminal' | 'results' | 'analysis'>('terminal');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResponse | null>(null);

  const execution = useExecution();
  const [editorError, setEditorError] = useState<{ line?: number; message: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    getProviders()
      .then((data) => setProviders(data.providers))
      .catch(() => setProviders([{ id: 'simulator', name: 'Simulator', available: true }]));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getIbmSettings()
      .then((settings) => {
        setCredentialStatus(settings.validationStatus === 'invalid' ? 'invalid' : 'valid');
      })
      .catch((err: any) => {
        setCredentialStatus('missing');
      });
  }, [user]);

  useEffect(() => {
    if (selectedProvider !== 'ibm_quantum' || credentialStatus !== 'valid' || !user) return;

    let cancelled = false;
    listIbmBackends()
      .then((data) => {
        if (cancelled) return;
        setIbmBackends(data.backends);
        if (data.backends.length > 0 && !selectedBackend) {
          const online = data.backends.find((b) => b.status === 'online');
          setSelectedBackend(online?.name || data.backends[0].name);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCredentialStatus('missing');
      });

    return () => { cancelled = true; };
  }, [selectedProvider, credentialStatus, user, selectedBackend]);

  // --- GitHub push state ---
  const [ghStatus, setGhStatus] = useState<GitHubStatus | null>(null);
  const [showGhPush, setShowGhPush] = useState(false);
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
  const [ghReposLoading, setGhReposLoading] = useState(false);
  const [ghSelectedRepo, setGhSelectedRepo] = useState('');
  const [ghFilePath, setGhFilePath] = useState('');
  const [ghCommitMsg, setGhCommitMsg] = useState('');
  const [ghPushing, setGhPushing] = useState(false);
  const [ghPushResult, setGhPushResult] = useState<{ type: 'success' | 'error'; text: string; url?: string } | null>(null);

  // Load GitHub status
  useEffect(() => {
    if (!user) return;
    getGitHubStatus()
      .then((s) => setGhStatus(s))
      .catch(() => setGhStatus(null));
  }, [user]);

  // GitHub push dialog open handler
  const openGhPush = useCallback(async () => {
    setShowGhPush(true);
    setGhPushResult(null);
    setGhFilePath(activeFile === 'main.py' ? 'circuits/main.py' : 'circuits/main.qasm');
    setGhCommitMsg(`Update ${activeFile} via Quantum Studio`);
    setGhReposLoading(true);
    try {
      const data = await listGitHubRepos();
      setGhRepos(data.repos);
      if (data.repos.length > 0 && !ghSelectedRepo) {
        setGhSelectedRepo(data.repos[0].fullName);
      }
    } catch {
      setGhRepos([]);
    } finally {
      setGhReposLoading(false);
    }
  }, [activeFile, ghSelectedRepo]);

  const handleGhPush = useCallback(async () => {
    if (!ghSelectedRepo || !ghFilePath.trim()) return;
    setGhPushing(true);
    setGhPushResult(null);
    try {
      const [owner, repo] = ghSelectedRepo.split('/');
      const result = await pushToGitHub(
        owner,
        repo,
        ghFilePath.trim(),
        files[activeFile],
        ghCommitMsg || undefined,
      );
      setGhPushResult({
        type: 'success',
        text: `Pushed successfully! Commit: ${result.sha.slice(0, 7)}`,
        url: result.htmlUrl,
      });
    } catch (err: any) {
      setGhPushResult({ type: 'error', text: err.message || 'Push failed.' });
    } finally {
      setGhPushing(false);
    }
  }, [ghSelectedRepo, ghFilePath, ghCommitMsg, files, activeFile]);

  const ibmAvailable = providers.some((p) => p.id === 'ibm_quantum' && p.available);

  const handleFileChange = (file: 'main.py' | 'main.qasm') => {
    setActiveFile(file);
    setEditorError(null);
  };

  const handleCodeChange = (newCode: string | undefined) => {
    setFiles(prev => ({ ...prev, [activeFile]: newCode || '' }));
  };

  const handleRun = useCallback(async () => {
    setEditorError(null);
    execution.reset();
    setAnalyzeResult(null);
    setBottomTab('terminal'); // Switch to terminal on run
    const codeType = activeFile === 'main.py' ? 'python' : 'qasm';

    // Clean noiseConfig to only include >0 values if enabled
    let finalNoiseConfig = undefined;
    if (noiseEnabled && selectedProvider === 'simulator') {
      const cleaned: any = {};
      Object.entries(noiseConfig).forEach(([key, val]) => {
        if (val > 0) cleaned[key] = val;
      });
      if (Object.keys(cleaned).length > 0) {
        finalNoiseConfig = cleaned;
      }
    }

    try {
      const job = await submitExecutionJob({
        provider: selectedProvider,
        backend: selectedProvider === 'ibm_quantum' ? selectedBackend : undefined,
        qasm: files[activeFile],
        shots,
        codeType,
        noiseConfig: finalNoiseConfig,
      });
      execution.loadJob(job.jobId);
    } catch (err: any) {
      setEditorError({ message: err.message || 'Failed to submit job.' });
    }
  }, [files, activeFile, execution, selectedProvider, selectedBackend, shots, noiseEnabled, noiseConfig]);

  const handleAnalyze = useCallback(async () => {
    if (selectedProvider !== 'simulator' || !noiseEnabled) return;
    setIsAnalyzing(true);
    setAnalyzeResult(null);
    setBottomTab('analysis');
    try {
      const codeType = activeFile === 'main.py' ? 'python' : 'qasm';
      const cleaned: any = {};
      Object.entries(noiseConfig).forEach(([key, val]) => {
        if (val > 0) cleaned[key] = val;
      });
      const result = await analyzeCircuit({
        qasm: files[activeFile],
        shots,
        mode: codeType,
        noiseConfig: Object.keys(cleaned).length > 0 ? cleaned : undefined,
      });
      setAnalyzeResult(result);
    } catch (err: any) {
      setEditorError({ message: err.message || 'Analysis failed.' });
      setBottomTab('terminal');
    } finally {
      setIsAnalyzing(false);
    }
  }, [files, activeFile, selectedProvider, shots, noiseEnabled, noiseConfig]);

  useEffect(() => {
    if (execution.viewState === 'completed' && execution.outcomes.length > 0) {
      setBottomTab('results');
    }
  }, [execution.viewState, execution.outcomes.length]);

  return (
    <div className="ide-layout" style={{ display: 'flex', height: '100%', width: '100%', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>

      <div className="ide-sidebar" style={{ width: '280px', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        <FileExplorer activeFile={activeFile} onSelect={handleFileChange} />

        {/* Execution Settings */}
        <div style={{ padding: '24px 16px 12px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-subtle)' }}>
          Execution Settings
        </div>

        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Provider</label>
            <select
              className="form-field__input"
              style={{ width: '100%', backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', padding: '8px', borderRadius: '4px', fontSize: '0.85rem' }}
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value as any)}
            >
              <option value="simulator">Local Simulator</option>
              {ibmAvailable && <option value="ibm_quantum">IBM Quantum</option>}
            </select>
            {selectedProvider === 'ibm_quantum' && credentialStatus !== 'valid' && (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-error)', marginTop: '4px' }}>
                Valid IBM Token required. <Link to="/settings" style={{ color: 'var(--color-primary)' }}>Go to Settings</Link>
              </div>
            )}
          </div>

          {selectedProvider === 'ibm_quantum' && credentialStatus === 'valid' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Hardware Backend</label>
              <select
                className="form-field__input"
                style={{ width: '100%', backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', padding: '8px', borderRadius: '4px', fontSize: '0.85rem' }}
                value={selectedBackend}
                onChange={(e) => setSelectedBackend(e.target.value)}
              >
                {ibmBackends.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({b.qubits}Q) - {b.status}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Shots</label>
            <input
              type="number"
              className="form-field__input"
              style={{ width: '100%', backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', padding: '8px', borderRadius: '4px', fontSize: '0.85rem' }}
              min={1}
              max={100000}
              value={shots}
              onChange={(e) => setShots(parseInt(e.target.value, 10) || 1)}
            />
          </div>
        </div>

        {/* Noise Settings */}
        {selectedProvider === 'simulator' && (
          <>
            <style>{`
              .noise-slider {
                -webkit-appearance: none;
                width: 100%;
                height: 4px;
                background: var(--color-border);
                border-radius: 2px;
                outline: none;
              }
              .noise-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: var(--color-primary);
                cursor: pointer;
                border: 2px solid var(--color-bg);
                box-shadow: 0 0 0 1px var(--color-primary);
              }
              .noise-slider::-moz-range-thumb {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: var(--color-primary);
                cursor: pointer;
                border: 2px solid var(--color-bg);
                box-shadow: 0 0 0 1px var(--color-primary);
              }
              
              .noise-toggle {
                position: relative;
                display: inline-block;
                width: 32px;
                height: 18px;
                margin-right: 8px;
              }
              .noise-toggle input {
                opacity: 0;
                width: 0;
                height: 0;
              }
              .noise-toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0; left: 0; right: 0; bottom: 0;
                background-color: var(--color-border);
                transition: .2s;
                border-radius: 18px;
              }
              .noise-toggle-slider:before {
                position: absolute;
                content: "";
                height: 14px;
                width: 14px;
                left: 2px;
                bottom: 2px;
                background-color: var(--color-text-muted);
                transition: .2s;
                border-radius: 50%;
              }
              .noise-toggle input:checked + .noise-toggle-slider {
                background-color: var(--color-primary);
              }
              .noise-toggle input:checked + .noise-toggle-slider:before {
                transform: translateX(14px);
                background-color: var(--color-text);
              }
            `}</style>
            <div style={{ padding: '24px 16px 12px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Noise Simulator</span>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                <div className="noise-toggle">
                  <input
                    type="checkbox"
                    checked={noiseEnabled}
                    onChange={(e) => setNoiseEnabled(e.target.checked)}
                  />
                  <span className="noise-toggle-slider"></span>
                </div>
                <span style={{ color: noiseEnabled ? 'var(--color-primary)' : 'var(--color-text-muted)', textTransform: 'none', fontSize: '0.75rem', minWidth: '18px' }}>{noiseEnabled ? 'On' : 'Off'}</span>
              </label>
            </div>

            {noiseEnabled && (
              <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {Object.entries({
                  depolarizing: 'Depolarizing Error',
                  bitFlip: 'Bit Flip Error',
                  phaseFlip: 'Phase Flip Error',
                  amplitudeDamping: 'Amplitude Damping',
                  phaseDamping: 'Phase Damping',
                  readoutError: 'Readout Error',
                  crosstalk: 'Crosstalk',
                }).map(([key, label]) => (
                  <div key={key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--color-text)' }}>{label}</label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                        {((noiseConfig as any)[key] * 100).toFixed(1)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      className="noise-slider"
                      min="0"
                      max="0.5"
                      step="0.01"
                      value={(noiseConfig as any)[key]}
                      onChange={(e) => setNoiseConfig({ ...noiseConfig, [key]: parseFloat(e.target.value) })}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className="ide-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className="ide-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', backgroundColor: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {activeFile === 'main.py' ? <PythonIcon /> : <QasmIcon />}
            {activeFile}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Push to GitHub button */}
            {ghStatus?.connected && (
              <button
                type="button"
                className="btn"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)', borderRadius: '6px', fontSize: '0.8125rem', cursor: 'pointer' }}
                onClick={openGhPush}
                title="Push to GitHub"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                Push
              </button>
            )}

            <button
              className="btn btn--primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px' }}
              onClick={handleRun}
              disabled={execution.loading || (selectedProvider === 'ibm_quantum' && credentialStatus !== 'valid')}
            >
              {execution.loading ? (
                <>Running...</>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                  Run {selectedProvider === 'ibm_quantum' ? 'on IBM' : (noiseEnabled ? 'with Noise' : 'Simulator')}
                </>
              )}
            </button>
          </div>
        </div>

        <div style={{ flex: 2, position: 'relative', borderBottom: '1px solid var(--color-border)' }}>
          <EditorPanel
            code={files[activeFile]}
            onChange={handleCodeChange}
            language={activeFile === 'main.py' ? 'python' : 'qasm'}
          />
        </div>

        <div style={{ flex: 1, backgroundColor: 'var(--color-bg)', display: 'flex', flexDirection: 'column' }}>

          <div style={{ display: 'flex', gap: '2px', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', padding: '0 8px' }}>
            <style>{`
              .ide-tab {
                padding: 8px 16px;
                font-size: 0.75rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: var(--color-text-subtle);
                border: none;
                border-bottom: 2px solid transparent;
                cursor: pointer;
                background: transparent;
                transition: color 0.2s;
              }
              .ide-tab--active {
                color: var(--color-text);
                border-bottom: 2px solid var(--color-primary);
              }
            `}</style>
            <button
              className={`ide-tab ${bottomTab === 'terminal' ? 'ide-tab--active' : ''}`}
              onClick={() => setBottomTab('terminal')}
            >
              Terminal
            </button>
            <button
              className={`ide-tab ${bottomTab === 'results' ? 'ide-tab--active' : ''}`}
              onClick={() => setBottomTab('results')}
            >
              Visualizer
            </button>
            <button
              className={`ide-tab ${bottomTab === 'analysis' ? 'ide-tab--active' : ''}`}
              title={(!noiseEnabled || selectedProvider !== 'simulator') ? "Enable noise simulator to view Analysis" : ""}
              disabled={!noiseEnabled || selectedProvider !== 'simulator' || execution.viewState !== 'completed'}
              style={{
                opacity: (!noiseEnabled || selectedProvider !== 'simulator' || execution.viewState !== 'completed') ? 0.5 : 1,
                cursor: (!noiseEnabled || selectedProvider !== 'simulator' || execution.viewState !== 'completed') ? 'not-allowed' : 'pointer'
              }}
              onClick={() => {
                if (!noiseEnabled || selectedProvider !== 'simulator' || execution.viewState !== 'completed') return;
                if (!analyzeResult && !isAnalyzing) handleAnalyze();
                else setBottomTab('analysis');
              }}
            >
              Analysis
              {(!noiseEnabled || selectedProvider !== 'simulator') ? (
                <span style={{ marginLeft: '6px', fontSize: '0.65rem', backgroundColor: 'var(--color-error)', color: 'var(--color-text)', padding: '2px 6px', borderRadius: '10px' }}>Requires Noise</span>
              ) : (
                <span style={{ marginLeft: '6px', fontSize: '0.65rem', backgroundColor: 'var(--color-success)', color: 'var(--color-text)', padding: '2px 6px', borderRadius: '10px' }}>New</span>
              )}
            </button>
          </div>

          <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {bottomTab === 'terminal' && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                {!execution.job && !editorError && (
                  <div>&gt; Ready. Configured for {selectedProvider} ({shots} shots){noiseEnabled && selectedProvider === 'simulator' ? ' [NOISE ENABLED]' : ''}.</div>
                )}
                {execution.loading && <div>&gt; Submitting job...</div>}
                {execution.job && execution.viewState === 'pending' && (
                  <div>
                    &gt; Job [{execution.job.jobId}] {execution.job.status}...
                    {selectedProvider === 'ibm_quantum' ? ' (Hardware queue may take a while)' : ''}
                  </div>
                )}
                {execution.viewState === 'completed' && (
                  <div style={{ color: 'var(--color-success)' }}>
                    &gt; Job [{execution.job?.jobId}] completed. Open the Visualizer tab to see results.
                  </div>
                )}
                {execution.viewState === 'failed' && (
                  <div style={{ color: 'var(--color-error)' }}>
                    &gt; Job failed: {execution.job?.error?.message || 'Unknown error'}
                  </div>
                )}
                {execution.viewState === 'cancelled' && (
                  <div style={{ color: 'var(--color-warning)' }}>&gt; Job cancelled.</div>
                )}
                {editorError && (
                  <div style={{ color: 'var(--color-error)', marginTop: '8px' }}>
                    <div style={{ fontWeight: 600 }}>Error:</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{editorError.message}</div>
                  </div>
                )}
              </div>
            )}

            {bottomTab === 'results' && (
              <div className="ide-visualizer" style={{ flex: 1, color: 'var(--color-text)', display: 'flex', flexDirection: 'column' }}>
                {execution.viewState === 'completed' && execution.outcomes.length > 0 ? (
                  <div style={{ display: 'flex', gap: '32px', height: '100%' }}>
                    <div style={{ flex: 2, minWidth: '300px', height: '100%', maxHeight: '300px' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Probability Distribution</h4>
                      <ProbabilityBarChart outcomes={execution.outcomes} maxDisplay={20} />
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Counts</h4>
                      <ResultsTable outcomes={execution.outcomes} maxDisplay={20} />
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                    {execution.viewState === 'completed'
                      ? "No outcomes recorded for this run. Did you forget to add measurement gates?"
                      : "Run a circuit successfully to view visualization."}
                  </div>
                )}
              </div>
            )}

            {bottomTab === 'analysis' && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {isAnalyzing && (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                    &gt; Running Monte Carlo simulations and computing fidelity... This may take a few seconds.
                  </div>
                )}
                {!isAnalyzing && analyzeResult && (
                  <PerformanceAnalysisPanel data={analyzeResult} onClose={() => setBottomTab('results')} />
                )}
                {!isAnalyzing && !analyzeResult && (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                    <button onClick={handleAnalyze} className="btn btn--primary">Analyze Performance</button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

      </div>

      {/* ======================== Push to GitHub Dialog ======================== */}
      {showGhPush && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'rgba(var(--color-bg), 0.6)', backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowGhPush(false); }}
        >
          <div
            style={{
              width: 480, maxWidth: '95vw', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 12, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--color-surface-2)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <svg width="20" height="20" viewBox="0 0 16 16" fill="var(--color-text)">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Push to GitHub</h3>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {ghPushResult && (
                <div style={{
                  padding: '10px 14px', borderRadius: 6, fontSize: '0.875rem',
                  background: ghPushResult.type === 'success' ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                  color: ghPushResult.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
                  border: `1px solid ${ghPushResult.type === 'success' ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
                }}>
                  {ghPushResult.text}
                  {ghPushResult.url && (
                    <>
                      {' '}
                      <a href={ghPushResult.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-info)' }}>
                        View on GitHub ↗
                      </a>
                    </>
                  )}
                </div>
              )}

              {/* Repository */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>Repository</label>
                {ghReposLoading ? (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Loading repositories…</div>
                ) : (
                  <select
                    style={{ width: '100%', background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: 6, fontSize: '0.85rem', boxSizing: 'border-box' }}
                    value={ghSelectedRepo}
                    onChange={(e) => setGhSelectedRepo(e.target.value)}
                  >
                    {ghRepos.length === 0 && <option value="">No repositories found</option>}
                    {ghRepos.map((r) => (
                      <option key={r.id} value={r.fullName}>
                        {r.fullName} {r.private ? '🔒' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* File path */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>File Path</label>
                <input
                  type="text"
                  style={{ width: '100%', background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: 6, fontSize: '0.85rem', boxSizing: 'border-box' }}
                  value={ghFilePath}
                  onChange={(e) => setGhFilePath(e.target.value)}
                  placeholder="e.g. circuits/bell_state.py"
                />
              </div>

              {/* Commit message */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>Commit Message</label>
                <input
                  type="text"
                  style={{ width: '100%', background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', padding: '8px 10px', borderRadius: 6, fontSize: '0.85rem', boxSizing: 'border-box' }}
                  value={ghCommitMsg}
                  onChange={(e) => setGhCommitMsg(e.target.value)}
                  placeholder="Describe your changes"
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-surface-2)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowGhPush(false)}
                style={{ padding: '8px 16px', background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGhPush}
                disabled={ghPushing || !ghSelectedRepo || !ghFilePath.trim()}
                style={{
                  padding: '8px 16px', background: 'var(--color-success)', color: 'var(--color-text)', border: '1px solid var(--color-success)',
                  borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: ghPushing ? 'wait' : 'pointer',
                  opacity: (ghPushing || !ghSelectedRepo || !ghFilePath.trim()) ? 0.5 : 1,
                }}
              >
                {ghPushing ? 'Pushing…' : 'Push to GitHub'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
