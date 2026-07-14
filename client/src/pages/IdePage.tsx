import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import EditorPanel from '../components/ide/EditorPanel';
import FileExplorer, { type FileNode } from '../components/ide/FileExplorer';
import { useExecution } from '../hooks/useExecution';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import {
  getProviders,
  listIbmBackends,
  submitExecutionJob,
  type ExecutionProvider,
  type IbmBackend,
} from '../api/execution';
import { getIbmSettings } from '../api/integrations';
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
/* Page Component                                                       */
/* ------------------------------------------------------------------ */

export default function IdePage() {
  const { user } = useAuth();
  
  // File state
  const [files, setFiles] = useState<FileNode[]>([
    { id: '1', name: 'main.py', type: 'file', parentId: null, content: DEFAULT_PYTHON },
    { id: '2', name: 'main.qasm', type: 'file', parentId: null, content: DEFAULT_QASM }
  ]);
  const [activeFileId, setActiveFileId] = useState<string | null>('1');

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

  const ibmAvailable = providers.some((p) => p.id === 'ibm_quantum' && p.available);

  const handleFileSelect = (id: string) => {
    setActiveFileId(id);
    setEditorError(null);
  };

  const handleCodeChange = (newCode: string | undefined) => {
    if (!activeFileId) return;
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: newCode || '' } : f));
  };

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const handleCreateFile = (parentId: string | null, name: string) => {
    const newId = generateId();
    setFiles(prev => [...prev, { id: newId, name, type: 'file', parentId, content: '' }]);
    setActiveFileId(newId);
  };

  const handleCreateFolder = (parentId: string | null, name: string) => {
    const newId = generateId();
    setFiles(prev => [...prev, { id: newId, name, type: 'folder', parentId, isOpen: true }]);
  };

  const handleRename = (id: string, newName: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
  };

  const handleDelete = (id: string) => {
    const getIdsToDelete = (nodeId: string, allFiles: FileNode[]): string[] => {
      const children = allFiles.filter(f => f.parentId === nodeId).map(f => f.id);
      return [nodeId, ...children.flatMap(childId => getIdsToDelete(childId, allFiles))];
    };
    const idsToDelete = getIdsToDelete(id, files);
    setFiles(prev => prev.filter(f => !idsToDelete.includes(f.id)));
    if (activeFileId && idsToDelete.includes(activeFileId)) {
      setActiveFileId(null);
    }
  };

  const handleToggleFolder = (id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, isOpen: !f.isOpen } : f));
  };

  const handleImportFile = (parentId: string | null, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const newId = generateId();
      setFiles(prev => [...prev, { id: newId, name: file.name, type: 'file', parentId, content }]);
      setActiveFileId(newId);
    };
    reader.readAsText(file);
  };

  const activeFileNode = files.find(f => f.id === activeFileId);
  const activeFileName = activeFileNode?.name || '';
  const activeFileContent = activeFileNode?.content || '';

  const handleRun = useCallback(async () => {
    setEditorError(null);
    execution.reset();
    setAnalyzeResult(null);
    setBottomTab('terminal'); // Switch to terminal on run
    if (!activeFileNode) {
      setEditorError({ message: 'No file selected.' });
      return;
    }
    const codeType = activeFileName.endsWith('.py') ? 'python' : 'qasm';
    
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
        qasm: activeFileContent,
        shots,
        codeType,
        noiseConfig: finalNoiseConfig,
      });
      execution.loadJob(job.jobId);
    } catch (err: any) {
      setEditorError({ message: err.message || 'Failed to submit job.' });
    }
  }, [activeFileNode, activeFileName, activeFileContent, execution, selectedProvider, selectedBackend, shots, noiseEnabled, noiseConfig]);

  const handleAnalyze = useCallback(async () => {
    if (selectedProvider !== 'simulator' || !noiseEnabled) return;
    setIsAnalyzing(true);
    setAnalyzeResult(null);
    setBottomTab('analysis');
    try {
      if (!activeFileNode) throw new Error('No file selected.');
      const codeType = activeFileName.endsWith('.py') ? 'python' : 'qasm';
      const cleaned: any = {};
      Object.entries(noiseConfig).forEach(([key, val]) => {
        if (val > 0) cleaned[key] = val;
      });
      const result = await analyzeCircuit({
        qasm: activeFileContent,
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
  }, [activeFileNode, activeFileName, activeFileContent, selectedProvider, shots, noiseEnabled, noiseConfig]);

  useEffect(() => {
    if (execution.viewState === 'completed' && execution.outcomes.length > 0) {
      setBottomTab('results');
    }
  }, [execution.viewState, execution.outcomes.length]);

  return (
    <div className="ide-layout" style={{ display: 'flex', height: '100%', width: '100%', backgroundColor: '#000', color: '#fff' }}>
      
      <div className="ide-sidebar" style={{ width: '280px', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        
        <FileExplorer 
          files={files} 
          activeFileId={activeFileId} 
          onSelect={handleFileSelect}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onRename={handleRename}
          onDelete={handleDelete}
          onToggleFolder={handleToggleFolder}
          onImportFile={handleImportFile}
        />

        {/* Execution Settings */}
        <div style={{ padding: '24px 16px 12px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-subtle)' }}>
          Execution Settings
        </div>
        
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '16px', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#a1a1aa', marginBottom: '6px' }}>Provider</label>
            <select 
              className="form-field__input"
              style={{ width: '100%', backgroundColor: '#18181b', color: '#fff', border: '1px solid #27272a', padding: '8px', borderRadius: '4px', fontSize: '0.85rem' }}
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value as any)}
            >
              <option value="simulator">Local Simulator</option>
              {ibmAvailable && <option value="ibm_quantum">IBM Quantum</option>}
            </select>
            {selectedProvider === 'ibm_quantum' && credentialStatus !== 'valid' && (
              <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px' }}>
                Valid IBM Token required. <Link to="/settings" style={{ color: '#3b82f6' }}>Go to Settings</Link>
              </div>
            )}
          </div>

          {selectedProvider === 'ibm_quantum' && credentialStatus === 'valid' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#a1a1aa', marginBottom: '6px' }}>Hardware Backend</label>
              <select 
                className="form-field__input"
                style={{ width: '100%', backgroundColor: '#18181b', color: '#fff', border: '1px solid #27272a', padding: '8px', borderRadius: '4px', fontSize: '0.85rem' }}
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
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#a1a1aa', marginBottom: '6px' }}>Shots</label>
            <input 
              type="number"
              className="form-field__input"
              style={{ width: '100%', backgroundColor: '#18181b', color: '#fff', border: '1px solid #27272a', padding: '8px', borderRadius: '4px', fontSize: '0.85rem' }}
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
                background: #27272a;
                border-radius: 2px;
                outline: none;
              }
              .noise-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: #3b82f6;
                cursor: pointer;
                border: 2px solid #09090b;
                box-shadow: 0 0 0 1px #3b82f6;
              }
              .noise-slider::-moz-range-thumb {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: #3b82f6;
                cursor: pointer;
                border: 2px solid #09090b;
                box-shadow: 0 0 0 1px #3b82f6;
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
                background-color: #27272a;
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
                background-color: #a1a1aa;
                transition: .2s;
                border-radius: 50%;
              }
              .noise-toggle input:checked + .noise-toggle-slider {
                background-color: #3b82f6;
              }
              .noise-toggle input:checked + .noise-toggle-slider:before {
                transform: translateX(14px);
                background-color: #ffffff;
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
                <span style={{ color: noiseEnabled ? '#3b82f6' : '#a1a1aa', textTransform: 'none', fontSize: '0.75rem', minWidth: '18px' }}>{noiseEnabled ? 'On' : 'Off'}</span>
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
                      <label style={{ fontSize: '0.8rem', color: '#e4e4e7' }}>{label}</label>
                      <span style={{ fontSize: '0.75rem', color: '#3b82f6', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
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
                      onChange={(e) => setNoiseConfig({...noiseConfig, [key]: parseFloat(e.target.value)})}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="ide-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        
        <div className="ide-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', backgroundColor: '#09090b', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '0.9rem', color: '#e4e4e7', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {activeFileName && (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#a1a1aa' }}>
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
            )}
            {activeFileName}
          </div>
          <Button 
            variant="primary" 
            onClick={handleRun}
            disabled={execution.loading || (selectedProvider === 'ibm_quantum' && credentialStatus !== 'valid')}
          >
            {execution.loading ? (
              <>Running...</>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ marginRight: '8px' }}><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                Run {selectedProvider === 'ibm_quantum' ? 'on IBM' : (noiseEnabled ? 'with Noise' : 'Simulator')}
              </>
            )}
          </Button>
        </div>

        <div style={{ flex: 2, position: 'relative', borderBottom: '1px solid var(--color-border)' }}>
          {activeFileNode ? (
            <EditorPanel
              code={activeFileContent}
              onChange={handleCodeChange}
              language={activeFileName.endsWith('.py') ? 'python' : 'qasm'}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#a1a1aa' }}>
              Select a file to edit
            </div>
          )}
        </div>

        <div style={{ flex: 1, backgroundColor: '#09090b', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', gap: '2px', borderBottom: '1px solid var(--color-border)', backgroundColor: '#09090b', padding: '0 8px' }}>
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
                color: #fff;
                border-bottom: 2px solid #3b82f6;
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
                <span style={{ marginLeft: '6px', fontSize: '0.65rem', backgroundColor: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: '10px' }}>Requires Noise</span>
              ) : (
                <span style={{ marginLeft: '6px', fontSize: '0.65rem', backgroundColor: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: '10px' }}>New</span>
              )}
            </button>
          </div>

          <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            
            {bottomTab === 'terminal' && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#a1a1aa' }}>
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
                  <div style={{ color: '#10b981' }}>
                    &gt; Job [{execution.job?.jobId}] completed. Open the Visualizer tab to see results.
                  </div>
                )}
                {execution.viewState === 'failed' && (
                  <div style={{ color: '#ef4444' }}>
                    &gt; Job failed: {execution.job?.error?.message || 'Unknown error'}
                  </div>
                )}
                {execution.viewState === 'cancelled' && (
                  <div style={{ color: '#eab308' }}>&gt; Job cancelled.</div>
                )}
                {editorError && (
                  <div style={{ color: '#ef4444', marginTop: '8px' }}>
                    <div style={{ fontWeight: 600 }}>Error:</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{editorError.message}</div>
                  </div>
                )}
              </div>
            )}

            {bottomTab === 'results' && (
              <div className="ide-visualizer" style={{ flex: 1, color: '#e4e4e7', display: 'flex', flexDirection: 'column' }}>
                {execution.viewState === 'completed' && execution.outcomes.length > 0 ? (
                  <div style={{ display: 'flex', gap: '32px', height: '100%' }}>
                    <div style={{ flex: 2, minWidth: '300px', height: '100%', maxHeight: '300px' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Probability Distribution</h4>
                      <ProbabilityBarChart outcomes={execution.outcomes} maxDisplay={20} />
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Counts</h4>
                      <ResultsTable outcomes={execution.outcomes} maxDisplay={20} />
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#a1a1aa', fontStyle: 'italic', display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
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
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                    &gt; Running Monte Carlo simulations and computing fidelity... This may take a few seconds.
                  </div>
                )}
                {!isAnalyzing && analyzeResult && (
                  <PerformanceAnalysisPanel data={analyzeResult} onClose={() => setBottomTab('results')} />
                )}
                {!isAnalyzing && !analyzeResult && (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                    <Button onClick={handleAnalyze} variant="primary">Analyze Performance</Button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
