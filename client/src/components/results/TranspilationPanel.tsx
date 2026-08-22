import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getTranspileTrace, TranspileTraceResponse, TranspilePassTrace, TranspileStageSummary } from '../../api/simulations';

interface TranspilationPanelProps {
  qasm: string;
  codeType: 'qasm' | 'python';
  backendName: string;
  onClose?: () => void;
}

export function TranspilationPanel({ qasm, codeType, backendName, onClose }: TranspilationPanelProps) {
  const [trace, setTrace] = useState<TranspileTraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Playback state
  const [currentPassIndex, setCurrentPassIndex] = useState<number>(-1); // -1 = original circuit
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filters
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [optimizationLevel, setOptimizationLevel] = useState<number>(1);

  // Load the trace trace
  const fetchTrace = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTranspileTrace({
        qasm,
        mode: codeType,
        backend: backendName,
        optimizationLevel
      });
      setTrace(res);
      setCurrentPassIndex(-1); // Start at original circuit
    } catch (err: any) {
      setError(err.message || 'Failed to generate transpilation trace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrace();
  }, [qasm, codeType, backendName, optimizationLevel]);

  // Flattened list of passes for playback
  const allPasses = useMemo(() => {
    if (!trace) return [];
    return trace.stages.flatMap(stage => stage.passes);
  }, [trace]);

  // Handle Play/Pause autoplay
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setCurrentPassIndex(prev => {
          if (prev >= allPasses.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1500);
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, allPasses]);

  // Selected pass detail helper
  const currentPass = currentPassIndex >= 0 ? allPasses[currentPassIndex] : null;

  // Next / Prev control
  const handlePrev = () => {
    setIsPlaying(false);
    setCurrentPassIndex(prev => Math.max(-1, prev - 1));
  };
  const handleNext = () => {
    setIsPlaying(false);
    setCurrentPassIndex(prev => Math.min(allPasses.length - 1, prev + 1));
  };

  // Auto-build node positions for coupling map
  const couplingNodes = useMemo(() => {
    if (!trace?.couplingMap) return [];
    return Array.from(new Set(trace.couplingMap.flat())).sort((a, b) => a - b);
  }, [trace]);

  const couplingPositions = useMemo(() => {
    const positions: Record<number, { x: number; y: number }> = {};
    if (couplingNodes.length === 0) return positions;

    const width = 360;
    const height = 180;
    const cx = width / 2;
    const cy = height / 2;
    
    // Circle layout for simple topologies, or custom layouts if nodes size matches common patterns
    const r = Math.min(cx, cy) - 25;
    couplingNodes.forEach((node, idx) => {
      const angle = (idx / couplingNodes.length) * 2 * Math.PI - Math.PI / 2;
      positions[node] = {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      };
    });
    return positions;
  }, [couplingNodes]);

  // Filtered stages / passes listing
  const filteredStages = useMemo(() => {
    if (!trace) return [];
    return trace.stages.map(stage => {
      const filteredPasses = stage.passes.filter(p => {
        const matchesStage = stageFilter === 'ALL' || stageFilter === stage.stageName;
        const matchesQuery = p.passName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             p.passClass.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStage && matchesQuery;
      });
      return { ...stage, passes: filteredPasses };
    }).filter(stage => stageFilter === 'ALL' || stage.stageName === stageFilter);
  }, [trace, stageFilter, searchQuery]);

  // Gantt chart parse data
  const currentQasm = currentPass ? currentPass.qasm : (trace?.originalQasm || qasm);
  const ganttData = useMemo(() => {
    return parseQasmToGantt(currentQasm);
  }, [currentQasm]);

  // Locate layout logical-to-physical index
  const logicalLayoutMap = trace?.logicalToPhysicalLayout || null;

  return (
    <div className="transpile-panel" style={{
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: '500px',
      color: 'var(--color-text)', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)',
      borderRadius: '8px', overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Transparent Transpilation Engine</span>
          <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'var(--color-primary-dim)', color: 'var(--color-primary)' }}>
            Target: {backendName}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>Opt Level:</label>
          <select 
            value={optimizationLevel} 
            onChange={(e) => setOptimizationLevel(Number(e.target.value))}
            style={{ padding: '2px 6px', fontSize: '0.75rem', backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text)' }}
          >
            <option value={0}>0 (None)</option>
            <option value={1}>1 (Light)</option>
            <option value={2}>2 (Medium)</option>
            <option value={3}>3 (Aggressive)</option>
          </select>
          {onClose && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-subtle)', cursor: 'pointer', fontSize: '1.1rem' }}>
              &times;
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px' }}>
          <div className="spinner" style={{ width: '32px', height: '32px', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Capturing transpilation passes from Qiskit PassManager...</div>
        </div>
      )}

      {error && (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-error)' }}>
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>Transpilation Audit Failed</div>
          <div style={{ fontSize: '0.85rem', marginBottom: '16px' }}>{error}</div>
          <button onClick={fetchTrace} className="btn btn--primary" style={{ fontSize: '0.8rem', padding: '6px 16px' }}>Retry</button>
        </div>
      )}

      {!loading && !error && trace && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Left panel: Stages and Pass timeline */}
          <div style={{ width: '280px', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-surface-2)' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border)' }}>
              <input 
                type="text" 
                placeholder="Search passes..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text)' }}
              />
              <select 
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                style={{ width: '100%', marginTop: '6px', padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text)' }}
              >
                <option value="ALL">All Stages</option>
                <option value="Analysis">1. Analysis</option>
                <option value="Optimization">2. Optimization</option>
                <option value="Translation">3. Translation</option>
                <option value="Mapping">4. Mapping</option>
                <option value="Routing">5. Routing</option>
                <option value="Scheduling">6. Scheduling</option>
              </select>
            </div>

            {/* Stage timeline list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              
              {/* Step 0: Original Circuit */}
              <div 
                onClick={() => { setIsPlaying(false); setCurrentPassIndex(-1); }}
                style={{
                  padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', marginBottom: '8px',
                  backgroundColor: currentPassIndex === -1 ? 'var(--color-primary-dim)' : 'transparent',
                  border: currentPassIndex === -1 ? '1px solid var(--color-primary)' : '1px solid transparent',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>Original Circuit</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)' }}>
                  Gates: {trace.originalGateCount} | Depth: {trace.originalDepth}
                </div>
              </div>

              {filteredStages.map((stage) => (
                <div key={stage.stageName} style={{ marginBottom: '12px' }}>
                  <div style={{ 
                    fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-subtle)',
                    padding: '4px 8px', display: 'flex', justifyContent: 'space-between',
                    borderBottom: '1px solid var(--color-border)', marginBottom: '4px'
                  }}>
                    <span>{stage.stageName}</span>
                    <span>{stage.passes.length} passes</span>
                  </div>

                  {stage.passes.length === 0 ? (
                    <div style={{ padding: '4px 12px', fontSize: '0.7rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                      No passes executed
                    </div>
                  ) : (
                    stage.passes.map((pass) => {
                      const passIndex = allPasses.findIndex(p => p.passName === pass.passName);
                      const active = currentPassIndex === passIndex;
                      const hasDelta = pass.deltaGates !== 0 || pass.deltaDepth !== 0;
                      
                      return (
                        <div 
                          key={pass.passName}
                          onClick={() => { setIsPlaying(false); setCurrentPassIndex(passIndex); }}
                          style={{
                            padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', margin: '2px 0',
                            backgroundColor: active ? 'var(--color-primary-dim)' : 'transparent',
                            borderLeft: active ? '3px solid var(--color-primary)' : '3px solid transparent',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontWeight: 500, fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }} title={pass.passName}>
                              {pass.passName}
                            </div>
                            {hasDelta && (
                              <span style={{ 
                                fontSize: '0.65rem', padding: '1px 4px', borderRadius: '3px',
                                backgroundColor: pass.deltaGates < 0 ? 'var(--color-success-dim)' : 'var(--color-warning-dim)',
                                color: pass.deltaGates < 0 ? 'var(--color-success)' : 'var(--color-warning)'
                              }}>
                                {pass.deltaGates < 0 ? pass.deltaGates : `+${pass.deltaGates}`}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                            Time: {pass.executionTimeMs.toFixed(1)} ms
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right workspace: split into current state / visualizers / code diff */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            
            {/* Playback Controls */}
            <div style={{
              padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)'
            }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={handlePrev} className="btn" disabled={currentPassIndex <= -1} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>⏮ Prev</button>
                <button 
                  onClick={() => setIsPlaying(!isPlaying)} 
                  className="btn btn--primary" 
                  style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                >
                  {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
                <button onClick={handleNext} className="btn" disabled={currentPassIndex >= allPasses.length - 1} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>Next ⏭</button>
              </div>

              {/* Progress Slider */}
              <div style={{ flex: 1, margin: '0 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input 
                  type="range" 
                  min={-1} 
                  max={allPasses.length - 1} 
                  value={currentPassIndex}
                  onChange={(e) => { setIsPlaying(false); setCurrentPassIndex(Number(e.target.value)); }}
                  style={{ flex: 1, cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                  {currentPassIndex + 2} / {allPasses.length + 1}
                </span>
              </div>

              <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                {currentPass ? `Pass: ${currentPass.passName}` : 'Original Circuit'}
              </div>
            </div>

            {/* Pass Description & Explanation */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-2)', display: 'flex', gap: '16px' }}>
              <div style={{ flex: 2 }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-subtle)' }}>Compilation Purpose</h4>
                <p style={{ margin: 0, fontSize: '0.8rem' }}>{currentPass ? currentPass.purpose : 'Shows the circuit exactly as loaded prior to compilation/transpilation optimization.'}</p>
              </div>
              <div style={{ flex: 3 }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-subtle)' }}>Rationale (Why does this run?)</h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{currentPass ? currentPass.rationale : 'Ensures the compiler baseline begins with the user-defined logical gates.'}</p>
              </div>
              {currentPass && (
                <div style={{ minWidth: '120px', borderLeft: '1px solid var(--color-border)', paddingLeft: '16px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)' }}>Pass Duration</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{currentPass.executionTimeMs.toFixed(2)} ms</div>
                  {currentPass.changedGates.length > 0 && (
                    <div style={{ marginTop: '4px' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-subtle)' }}>Deltas:</div>
                      <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {currentPass.changedGates.join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Main Visual Workspace Split */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              
              {/* Bottom Left: Visualizers (Coupling & Gantt) */}
              <div style={{ flex: 1, borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '16px', gap: '16px' }}>
                
                {/* 1. Qubit layout mapping */}
                {logicalLayoutMap && (
                  <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '12px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-subtle)' }}>Logical-to-Physical Qubit Layout</h4>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {Object.entries(logicalLayoutMap).map(([logical, physical]) => (
                        <div key={logical} style={{
                          padding: '4px 10px', borderRadius: '4px', backgroundColor: 'var(--color-surface-2)',
                          border: '1px solid var(--color-border)', fontSize: '0.75rem', display: 'flex', gap: '6px'
                        }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{logical}</span>
                          <span style={{ color: 'var(--color-text-muted)' }}>&rarr;</span>
                          <span style={{ fontWeight: 600 }}>Q{physical}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Target Hardware Topology */}
                <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-subtle)' }}>Hardware Coupling Map Network</h4>
                  {trace.couplingMap ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                      <svg width="100%" height="100%" viewBox="0 0 360 180" style={{ maxWidth: '360px' }}>
                        {/* Draw coupling connections */}
                        {trace.couplingMap.map(([n1, n2], idx) => {
                          const p1 = couplingPositions[n1];
                          const p2 = couplingPositions[n2];
                          if (!p1 || !p2) return null;
                          return (
                            <line 
                              key={idx}
                              x1={p1.x} y1={p1.y}
                              x2={p2.x} y2={p2.y}
                              stroke="var(--color-border)"
                              strokeWidth="2"
                            />
                          );
                        })}

                        {/* Draw Qubit nodes */}
                        {couplingNodes.map(node => {
                          const pos = couplingPositions[node];
                          if (!pos) return null;
                          // Check if logical qubit is mapped to this physical node
                          const logicalName = logicalLayoutMap 
                            ? Object.keys(logicalLayoutMap).find(k => logicalLayoutMap[k] === node)
                            : null;

                          return (
                            <g key={node}>
                              <circle 
                                cx={pos.x} cy={pos.y} r="14"
                                fill={logicalName ? 'var(--color-primary-dim)' : 'var(--color-surface-2)'}
                                stroke={logicalName ? 'var(--color-primary)' : 'var(--color-border)'}
                                strokeWidth="2"
                              />
                              <text 
                                x={pos.x} y={pos.y + 4} 
                                textAnchor="middle" 
                                fontSize="10" 
                                fontWeight="bold"
                                fill="var(--color-text)"
                              >
                                {node}
                              </text>
                              {logicalName && (
                                <text 
                                  x={pos.x} y={pos.y - 18} 
                                  textAnchor="middle" 
                                  fontSize="8" 
                                  fill="var(--color-primary)"
                                  fontWeight="600"
                                >
                                  {logicalName}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  ) : (
                    <div style={{ padding: '24px 0', fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                      Generic Simulator uses all-to-all connectivity. No coupling constraints applied.
                    </div>
                  )}
                </div>

                {/* 3. Scheduling Gantt Timeline */}
                <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '12px' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-subtle)' }}>Qubit Gate Scheduling Gantt Chart</h4>
                  
                  {Object.keys(ganttData.qubitGates).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                      {Object.entries(ganttData.qubitGates).map(([qubit, gates]) => (
                        <div key={qubit} style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{ width: '48px', fontSize: '0.7rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{qubit}</span>
                          <div style={{ flex: 1, height: '24px', position: 'relative', backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: '3px' }}>
                            {gates.map((g, idx) => {
                              const leftPercent = (g.start / ganttData.maxDuration) * 100;
                              const widthPercent = (g.duration / ganttData.maxDuration) * 100;
                              
                              const is2Q = g.name === 'CX' || g.name === 'CZ' || g.name === 'SWAP';
                              const color = is2Q ? 'var(--color-primary-dim)' : 'var(--color-surface-3)';
                              const border = is2Q ? '1px solid var(--color-primary)' : '1px solid var(--color-border)';

                              return (
                                <div 
                                  key={idx}
                                  title={`${g.name} (Start: ${g.start}, Dur: ${g.duration})`}
                                  style={{
                                    position: 'absolute', left: `${leftPercent}%`, width: `${widthPercent}%`,
                                    height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.65rem', fontWeight: 'bold', fontFamily: 'var(--font-mono)',
                                    backgroundColor: color, borderLeft: border, borderRight: border,
                                    color: is2Q ? 'var(--color-primary)' : 'var(--color-text)'
                                  }}
                                >
                                  {g.name}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '16px 0', fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                      Add gate instructions to view scheduling timeline.
                    </div>
                  )}
                </div>

              </div>

              {/* Bottom Right: Code Diff / Visualized QASM */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-surface-3)' }}>
                <div style={{
                  padding: '6px 12px', borderBottom: '1px solid var(--color-border)', 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-subtle)' }}>QASM Output View</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                    Gates: {currentPass ? currentPass.gateCount : trace.originalGateCount} | Depth: {currentPass ? currentPass.depth : trace.originalDepth}
                  </span>
                </div>
                <div style={{ flex: 1, padding: '12px', overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'pre-wrap', lineHeight: '1.4em' }}>
                  {currentQasm.trim() || '// Empty or un-serializable circuit'}
                </div>
              </div>

            </div>

          </div>

        </div>
      )}
    </div>
  );
}

// Custom parser to map QASM lines to simplified Gantt layout blocks
function parseQasmToGantt(qasm: string) {
  const lines = qasm.split('\n');
  const qubitGates: Record<string, Array<{ name: string; start: number; duration: number }>> = {};
  const qubitTime: Record<string, number> = {};

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('OPENQASM') || trimmed.startsWith('include')) return;

    // Match gate call: gate_name(params) targets;
    // e.g., h q[0]; or cx q[0], q[1]; or rz(pi/2) q[0];
    const match = trimmed.match(/^([a-z0-9_]+)(?:\([^)]*\))?\s+([^;]+);/i);
    if (!match) return;

    const gateName = match[1];
    const targetsStr = match[2];
    const targets = targetsStr.split(',').map(t => t.trim());

    // Filter targets to validate names
    const validTargets = targets.filter(t => t.match(/^[a-z_][a-z0-9_]*\[\d+\]$/i));
    if (validTargets.length === 0) return;

    let maxTime = 0;
    validTargets.forEach(t => {
      if (!qubitGates[t]) {
        qubitGates[t] = [];
        qubitTime[t] = 0;
      }
      maxTime = Math.max(maxTime, qubitTime[t]);
    });

    const duration = gateName === 'cx' || gateName === 'cz' || gateName === 'swap' ? 2 : 1;
    
    validTargets.forEach(t => {
      qubitGates[t].push({
        name: gateName.toUpperCase(),
        start: maxTime,
        duration: duration
      });
      qubitTime[t] = maxTime + duration;
    });
  });

  const maxDuration = Math.max(...Object.values(qubitTime).concat(1));
  return { qubitGates, maxDuration };
}
