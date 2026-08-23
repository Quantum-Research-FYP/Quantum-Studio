/**
 * TranspilationEngine.tsx
 * Full IDE-style transparent transpilation engine modal.
 * Replaces the old TranspilationSimulationModal.
 */
import type { CircuitModel } from '../../circuit';
import { useTranspilationEngine } from '../../hooks/useTranspilationEngine';
import TranspilePassTree from './TranspilePassTree';
import TranspileCircuitViewer from './TranspileCircuitViewer';
import TranspilePassDetail from './TranspilePassDetail';
import TranspileHardwareMap from './TranspileHardwareMap';
import TranspileSummary from './TranspileSummary';
import './TranspilationEngine.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  circuit: CircuitModel;
}

const STAGE_ICONS: Record<string, string> = {
  Analysis: '🔍',
  Optimization: '⚡',
  Translation: '🔄',
  Mapping: '📍',
  Routing: '🔀',
  Scheduling: '⏱',
};

export default function TranspilationEngine({ isOpen, onClose, circuit }: Props) {
  const engine = useTranspilationEngine(circuit, isOpen);

  if (!isOpen) return null;

  const isOnFinalPass =
    engine.selectedGlobalIndex === engine.flatPasses.length - 1 && engine.flatPasses.length > 0;
  const showSummary = engine.status === 'ready' && isOnFinalPass && engine.selectedPass;

  return (
    <div className="te-overlay" role="dialog" aria-modal="true" aria-labelledby="te-title">
      <div className="te-window">
        {/* ── HEADER ── */}
        <header className="te-header">
          <div className="te-header-left">
            <span className="te-header-icon" aria-hidden="true">
              ⚛
            </span>
            <h2 id="te-title" className="te-header-title">
              Transparent Transpilation Engine
            </h2>
            <span className="te-header-subtitle">Qiskit pass-by-pass compiler visualization</span>
          </div>
          <div className="te-header-right">
            {engine.status === 'ready' && engine.flatPasses.length > 0 && (
              <span className="te-pass-counter">
                Pass {engine.selectedGlobalIndex + 1} / {engine.flatPasses.length}
              </span>
            )}
            <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        {/* ── STAGE TIMELINE BAR ── */}
        {engine.status === 'ready' && engine.trace && (
          <div className="te-stage-bar" role="navigation" aria-label="Transpilation stages">
            <div className="te-stage-origin-dot" title="Original Circuit" />
            {engine.trace.stages
              .filter((s) => s.passes.length > 0)
              .map((stage, si) => {
                const isActive = engine.selectedPass?.stageIndex === si;
                const isDone = engine.flatPasses
                  .filter((fp) => fp.stageIndex === si)
                  .every((fp) => fp.globalIndex < engine.selectedGlobalIndex);
                return (
                  <button
                    key={stage.stageName}
                    className={`te-stage-tab${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}
                    onClick={() => engine.jumpToStage(si)}
                  >
                    <span>{STAGE_ICONS[stage.stageName] || '○'}</span>
                    <span>{stage.stageName}</span>
                    <span className="te-stage-tab-count">{stage.passes.length}</span>
                  </button>
                );
              })}
            <div className="te-stage-final-dot" title="Final Hardware Circuit" />
          </div>
        )}

        {/* ── BODY ── */}
        <div className="te-body">
          {/* Loading */}
          {engine.status === 'loading' && (
            <div className="te-loading">
              <div className="te-loading-spinner" />
              <h3>Running Qiskit Transpilation</h3>
              <p>Executing compiler passes and capturing trace…</p>
            </div>
          )}

          {/* Error */}
          {engine.status === 'error' && (
            <div className="te-error">
              <span className="te-error-icon">⚠</span>
              <h3>Transpilation Failed</h3>
              <p>{engine.error}</p>
              <button className="btn btn--primary" onClick={engine.run}>
                Retry
              </button>
            </div>
          )}

          {/* Ready: summary view */}
          {engine.status === 'ready' && showSummary && engine.trace && (
            <TranspileSummary
              trace={engine.trace}
              originalCircuit={engine.originalCircuit}
              onClose={onClose}
            />
          )}

          {/* Ready: pass view */}
          {engine.status === 'ready' && !showSummary && engine.selectedPass && engine.trace && (
            <div className="te-main-layout">
              {/* LEFT: Pass tree */}
              <aside className="te-sidebar">
                <TranspilePassTree
                  trace={engine.trace}
                  flatPasses={engine.flatPasses}
                  selectedGlobalIndex={engine.selectedGlobalIndex}
                  onSelectPass={engine.selectPass}
                />
              </aside>

              {/* CENTER: Circuit viewer + pass detail */}
              <div className="te-center">
                <div className="te-circuit-area">
                  <TranspileCircuitViewer pass={engine.selectedPass} />
                </div>
                <div className="te-detail-area">
                  <TranspilePassDetail pass={engine.selectedPass} />
                </div>
              </div>

              {/* RIGHT: Hardware map (shown during Mapping/Routing) */}
              {['Mapping', 'Routing', 'Scheduling'].includes(engine.selectedPass.stageName) && (
                <aside className="te-hardware-panel">
                  <TranspileHardwareMap trace={engine.trace} selectedPass={engine.selectedPass} />
                </aside>
              )}
            </div>
          )}
        </div>

        {/* ── PLAYBACK FOOTER ── */}
        {engine.status === 'ready' && engine.flatPasses.length > 0 && (
          <footer className="te-footer">
            <div className="te-playback">
              <button
                className="btn btn--ghost btn--sm te-pb-btn"
                onClick={engine.reset}
                title="Reset to first pass"
                aria-label="Reset"
              >
                ⏮
              </button>
              <button
                className="btn btn--ghost btn--sm te-pb-btn"
                onClick={engine.prevPass}
                disabled={engine.selectedGlobalIndex === 0}
                aria-label="Previous pass"
              >
                ◀ Prev
              </button>

              {engine.isPlaying ? (
                <button
                  className="btn btn--primary btn--sm te-pb-play"
                  onClick={engine.pause}
                  aria-label="Pause"
                >
                  ⏸ Pause
                </button>
              ) : (
                <button
                  className="btn btn--primary btn--sm te-pb-play"
                  onClick={engine.play}
                  aria-label="Play"
                >
                  ▶ Play
                </button>
              )}

              <button
                className="btn btn--ghost btn--sm te-pb-btn"
                onClick={engine.nextPass}
                disabled={engine.selectedGlobalIndex === engine.flatPasses.length - 1}
                aria-label="Next pass"
              >
                Next ▶
              </button>

              <div className="te-pb-progress">
                <div
                  className="te-pb-progress-bar"
                  style={{
                    width: `${((engine.selectedGlobalIndex + 1) / engine.flatPasses.length) * 100}%`,
                  }}
                />
              </div>

              <span className="te-pb-label">
                {engine.selectedPass?.stageName ?? ''} · Pass {engine.selectedGlobalIndex + 1}/
                {engine.flatPasses.length}
              </span>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
