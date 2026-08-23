/**
 * TranspilePassTree.tsx
 * Left panel: Accordion stage/pass navigator for the Transpilation Engine.
 */
import type { FlatPass } from '../../hooks/useTranspilationEngine';
import type { TranspileTraceResponse } from '../../api/simulations';
import { formatMetricChange } from '../../circuit/circuitDiff';

interface Props {
  trace: TranspileTraceResponse;
  flatPasses: FlatPass[];
  selectedGlobalIndex: number;
  onSelectPass: (globalIndex: number) => void;
}

const STAGE_ICONS: Record<string, string> = {
  Analysis: '🔍',
  Optimization: '⚡',
  Translation: '🔄',
  Mapping: '📍',
  Routing: '🔀',
  Scheduling: '⏱',
};

const STAGE_COLORS: Record<string, string> = {
  Analysis: 'var(--color-info)',
  Optimization: 'var(--color-accent)',
  Translation: 'var(--color-primary)',
  Mapping: '#f59e0b',
  Routing: '#ec4899',
  Scheduling: 'var(--color-success)',
};

export default function TranspilePassTree({
  trace,
  flatPasses,
  selectedGlobalIndex,
  onSelectPass,
}: Props) {
  const selectedPass = flatPasses[selectedGlobalIndex];

  return (
    <div className="te-pass-tree">
      {/* Original circuit row */}
      <div className="te-tree-origin">
        <span className="te-tree-origin-label">Original Circuit</span>
        <span className="te-tree-metric">
          {trace.originalGateCount}g / d{trace.originalDepth}
        </span>
      </div>

      {trace.stages.map((stage, si) => {
        const stagePasses = flatPasses.filter((fp) => fp.stageIndex === si);
        if (stagePasses.length === 0) return null;
        const isStageActive = selectedPass?.stageIndex === si;
        const color = STAGE_COLORS[stage.stageName] || 'var(--color-primary)';
        const icon = STAGE_ICONS[stage.stageName] || '◎';
        const gateChange = formatMetricChange(stage.gateCountBefore, stage.gateCountAfter);

        return (
          <div key={stage.stageName} className={`te-stage-group${isStageActive ? ' active' : ''}`}>
            <div className="te-stage-header" style={{ borderLeftColor: color }}>
              <span className="te-stage-icon">{icon}</span>
              <span className="te-stage-name">{stage.stageName}</span>
              {gateChange.direction !== 'none' && (
                <span
                  className={`te-stage-badge ${gateChange.direction === 'decrease' ? 'good' : 'warn'}`}
                >
                  {gateChange.pct}
                </span>
              )}
              <span className="te-stage-pass-count">{stagePasses.length} passes</span>
            </div>

            <div className="te-pass-list">
              {stagePasses.map((fp) => {
                const isSelected = fp.globalIndex === selectedGlobalIndex;
                const isDone = fp.globalIndex < selectedGlobalIndex;
                const hasDiff =
                  fp.diff.added.length + fp.diff.removed.length + fp.diff.modified.length > 0;

                return (
                  <button
                    key={fp.globalIndex}
                    className={`te-pass-item${isSelected ? ' selected' : ''}${isDone ? ' done' : ''}`}
                    onClick={() => onSelectPass(fp.globalIndex)}
                    style={{ '--stage-color': color } as React.CSSProperties}
                  >
                    <span className="te-pass-indicator">
                      {isDone ? '✓' : isSelected ? '▶' : String(fp.passIndex + 1)}
                    </span>
                    <span className="te-pass-name">{fp.pass.passName}</span>
                    {hasDiff && (
                      <span className="te-pass-diff-badge">
                        {fp.diff.added.length > 0 && (
                          <span className="diff-added">+{fp.diff.added.length}</span>
                        )}
                        {fp.diff.removed.length > 0 && (
                          <span className="diff-removed">-{fp.diff.removed.length}</span>
                        )}
                        {fp.diff.modified.length > 0 && (
                          <span className="diff-modified">~{fp.diff.modified.length}</span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Final circuit row */}
      <div className="te-tree-final">
        <span className="te-tree-origin-label">Final Hardware Circuit</span>
        <span className="te-tree-metric">
          {trace.finalGateCount}g / d{trace.finalDepth}
        </span>
      </div>
    </div>
  );
}
