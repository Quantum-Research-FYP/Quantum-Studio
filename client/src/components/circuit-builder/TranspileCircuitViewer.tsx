/**
 * TranspileCircuitViewer.tsx
 * Center panel: Before / After circuit views with diff highlighting.
 * Diff badges are shown in a dedicated scrollable strip ABOVE each canvas,
 * never overlapping the circuit wires.
 */
import type { FlatPass } from '../../hooks/useTranspilationEngine';
import type { AnnotatedOp } from '../../circuit/circuitDiff';
import { diffSummary } from '../../circuit/circuitDiff';
import CircuitCanvas from './CircuitCanvas';

interface Props {
  pass: FlatPass;
}

const STATUS_COLORS: Record<string, string> = {
  added:     '#22c55e',
  removed:   '#ef4444',
  modified:  '#f59e0b',
  moved:     '#60a5fa',
  unchanged: 'transparent',
};

/** Badge strip above the circuit — horizontally scrollable, never overlapping */
function DiffBadgeStrip({ annotated, side }: { annotated: AnnotatedOp[]; side: 'before' | 'after' }) {
  const changed = annotated.filter(a => a.status !== 'unchanged');
  if (changed.length === 0) {
    return <div className="te-diff-strip te-diff-strip--empty"><span>No changes</span></div>;
  }

  return (
    <div className="te-diff-strip" aria-label={`${side} diff badges`}>
      {changed.map((a, i) => (
        <span
          key={i}
          className={`te-diff-badge te-diff-badge--${a.status}`}
          title={
            a.status === 'modified' ? `${a.previousType} → ${a.op.type}` :
            a.status === 'moved'    ? `t${a.previousTime} → t${a.op.time}` :
            a.status
          }
        >
          {a.status === 'added'    && `+${a.op.type}`}
          {a.status === 'removed'  && `-${a.op.type}`}
          {a.status === 'modified' && `${a.previousType ?? '?'}→${a.op.type}`}
          {a.status === 'moved'    && `↕${a.op.type}`}
        </span>
      ))}
    </div>
  );
}

export default function TranspileCircuitViewer({ pass }: Props) {
  const { inputCircuit, outputCircuit, diff, pass: p } = pass;
  const summary = diffSummary(diff);
  const noChange = summary === 'No changes';

  return (
    <div className="te-circuit-viewer">

      {/* ── Top header bar: pass name + summary counts ── */}
      <div className="te-circuit-viewer-header">
        <div className="te-circuit-panel-label">
          <span className="te-panel-tag te-panel-tag--before">Input</span>
          <span className="te-circuit-panel-name">{p.passName}</span>
        </div>

        <div className="te-diff-summary" aria-label="Diff summary">
          {noChange
            ? <span className="te-diff-none">No gate changes</span>
            : summary.split('  ').map((part, i) => (
                <span
                  key={i}
                  className={`te-diff-count te-diff-count--${
                    part.startsWith('+') ? 'added'    :
                    part.startsWith('-') ? 'removed'  :
                    part.startsWith('~') ? 'modified' : 'moved'
                  }`}
                >{part}</span>
              ))
          }
        </div>

        <div className="te-circuit-panel-label">
          <span className="te-panel-tag te-panel-tag--after">Output</span>
        </div>
      </div>

      {/* ── Two-panel area ── */}
      <div className="te-circuit-panels">

        {/* Before panel */}
        <div className="te-circuit-panel te-circuit-panel--before">
          {/* Badge strip — separate row, clips horizontally */}
          <DiffBadgeStrip annotated={diff.beforeAnnotated} side="before" />
          {/* Canvas — its own scrollable area, no overlap */}
          <div className="te-circuit-canvas-wrapper" style={{ pointerEvents: 'none' }}>
            <CircuitCanvas
              circuit={inputCircuit}
              selectedGate={null}
              errorOperationIds={new Set()}
              onPlaceGate={() => {}}
              onDeleteGate={() => {}}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="te-circuit-divider" aria-hidden="true">
          <span className="te-circuit-arrow">→</span>
        </div>

        {/* After panel */}
        <div className="te-circuit-panel te-circuit-panel--after">
          <DiffBadgeStrip annotated={diff.afterAnnotated} side="after" />
          <div className="te-circuit-canvas-wrapper" style={{ pointerEvents: 'none' }}>
            <CircuitCanvas
              circuit={outputCircuit}
              selectedGate={null}
              errorOperationIds={new Set()}
              onPlaceGate={() => {}}
              onDeleteGate={() => {}}
            />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="te-diff-legend" role="legend">
        {(['added', 'removed', 'modified', 'moved'] as const).map(s => (
          <span key={s} className="te-legend-item">
            <span className="te-legend-dot" style={{ background: STATUS_COLORS[s] }} />
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
}
