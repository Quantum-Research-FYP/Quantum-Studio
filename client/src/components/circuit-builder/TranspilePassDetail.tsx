/**
 * TranspilePassDetail.tsx
 * Bottom panel: detailed information for the selected transpilation pass.
 */
import type { FlatPass } from '../../hooks/useTranspilationEngine';
import { formatMetricChange } from '../../circuit/circuitDiff';

interface Props {
  pass: FlatPass;
}

const STAGE_COLORS: Record<string, string> = {
  Analysis:     'var(--color-info)',
  Optimization: 'var(--color-accent)',
  Translation:  'var(--color-primary)',
  Mapping:      '#f59e0b',
  Routing:      '#ec4899',
  Scheduling:   'var(--color-success)',
};

function MetricRow({
  label, before, after
}: { label: string; before: number; after: number }) {
  const change = formatMetricChange(before, after);
  return (
    <div className="te-metric-row">
      <span className="te-metric-label">{label}</span>
      <span className="te-metric-values">{change.label}</span>
      <span className={`te-metric-pct te-metric-pct--${change.direction}`}>{change.pct}</span>
    </div>
  );
}

export default function TranspilePassDetail({ pass }: Props) {
  const { pass: p, diff, inputCircuit, outputCircuit, stageName } = pass;

  const gatesBefore = inputCircuit.operations.length;
  const gatesAfter = outputCircuit.operations.length;
  const twoBefore = inputCircuit.operations.filter(op => op.targets.qubits.length >= 2).length;
  const twoAfter = outputCircuit.operations.filter(op => op.targets.qubits.length >= 2).length;

  const stageColor = STAGE_COLORS[stageName] || 'var(--color-primary)';

  const changedGates = p.changedGates ?? [];
  const hasChanges = diff.added.length + diff.removed.length + diff.modified.length > 0;

  return (
    <div className="te-pass-detail">
      {/* Header */}
      <div className="te-detail-header">
        <div className="te-detail-title-group">
          <span className="te-detail-stage-badge" style={{ background: `${stageColor}22`, color: stageColor, borderColor: `${stageColor}44` }}>
            {stageName}
          </span>
          <h3 className="te-detail-pass-name">{p.passName}</h3>
          {p.passClass && p.passClass !== p.passName && (
            <code className="te-detail-pass-class">{p.passClass}</code>
          )}
        </div>
        <div className="te-detail-time">
          <span className="te-detail-time-label">Execution time</span>
          <span className="te-detail-time-value">
            {p.executionTimeMs > 0
              ? `${p.executionTimeMs.toFixed(2)} ms`
              : <em className="te-not-provided">Not provided by backend</em>}
          </span>
        </div>
      </div>

      <div className="te-detail-body">
        {/* Purpose & Rationale */}
        <div className="te-detail-section">
          <h4 className="te-detail-section-title">Purpose</h4>
          <p className="te-detail-text">{p.purpose}</p>
        </div>

        {p.rationale && (
          <div className="te-detail-section">
            <h4 className="te-detail-section-title">Why did this happen?</h4>
            <p className="te-detail-text te-detail-rationale">{p.rationale}</p>
          </div>
        )}

        {/* Metrics */}
        <div className="te-detail-section">
          <h4 className="te-detail-section-title">Metrics</h4>
          <div className="te-metrics-grid">
            <MetricRow label="Gate Count" before={gatesBefore} after={gatesAfter} />
            <MetricRow label="Circuit Depth" before={p.gateCount - p.deltaGates === 0 ? gatesBefore : inputCircuit.operations.length} after={p.depth} />
            <MetricRow label="2Q Gates" before={twoBefore} after={twoAfter} />
          </div>
        </div>

        {/* Changed gates */}
        {(hasChanges || changedGates.length > 0) && (
          <div className="te-detail-section">
            <h4 className="te-detail-section-title">Gate Changes</h4>
            <div className="te-gate-changes">
              {diff.added.map((op, i) => (
                <div key={`a${i}`} className="te-gate-change te-gate-change--added">
                  <span className="te-gate-change-icon">+</span>
                  <code>{op.type}(q{op.targets.qubits.join(',')})</code>
                  <span className="te-gate-change-reason">Added</span>
                </div>
              ))}
              {diff.removed.map((op, i) => (
                <div key={`r${i}`} className="te-gate-change te-gate-change--removed">
                  <span className="te-gate-change-icon">−</span>
                  <code>{op.type}(q{op.targets.qubits.join(',')})</code>
                  <span className="te-gate-change-reason">Removed</span>
                </div>
              ))}
              {diff.modified.map((m, i) => (
                <div key={`m${i}`} className="te-gate-change te-gate-change--modified">
                  <span className="te-gate-change-icon">~</span>
                  <code>{m.before.type} → {m.after.type}</code>
                  <span className="te-gate-change-reason">Decomposed / converted</span>
                </div>
              ))}
              {diff.moved.map((mv, i) => (
                <div key={`mv${i}`} className="te-gate-change te-gate-change--moved">
                  <span className="te-gate-change-icon">↕</span>
                  <code>{mv.op.type}(q{mv.op.targets.qubits.join(',')})</code>
                  <span className="te-gate-change-reason">t{mv.fromTime} → t{mv.toTime}</span>
                </div>
              ))}
              {/* Fallback: backend-reported gate changes when diff finds nothing */}
              {!hasChanges && changedGates.map((g, i) => (
                <div key={`bg${i}`} className="te-gate-change te-gate-change--modified">
                  <span className="te-gate-change-icon">~</span>
                  <code>{g}</code>
                  <span className="te-gate-change-reason">Reported by compiler</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasChanges && changedGates.length === 0 && (
          <div className="te-detail-section">
            <p className="te-no-changes">No gate changes in this pass — analysis or bookkeeping only.</p>
          </div>
        )}

        <p className="te-source-note">
          Source: <strong>Qiskit Compiler</strong> via pass callback
        </p>
      </div>
    </div>
  );
}
