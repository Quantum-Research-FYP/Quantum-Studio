/**
 * TranspileSummary.tsx
 * Final summary card shown when all passes are complete.
 */
import type { TranspileTraceResponse } from '../../api/simulations';
import { formatMetricChange } from '../../circuit/circuitDiff';
import type { CircuitModel } from '../../circuit';

interface Props {
  trace: TranspileTraceResponse;
  originalCircuit: CircuitModel;
  onClose: () => void;
}

export default function TranspileSummary({ trace, originalCircuit, onClose }: Props) {
  const gateChange = formatMetricChange(trace.originalGateCount, trace.finalGateCount);
  const depthChange = formatMetricChange(trace.originalDepth, trace.finalDepth);

  const orig2Q = originalCircuit.operations.filter((op) => op.targets.qubits.length >= 2).length;

  // Count SWAPs inserted
  const swapCount = trace.stages
    .filter((s) => s.stageName === 'Routing')
    .flatMap((s) => s.passes)
    .reduce((acc, p) => {
      const swapDelta = (p.changedGates ?? [])
        .filter((g) => g.toLowerCase().includes('swap'))
        .reduce((sum, g) => {
          const m = g.match(/[+-]?(\d+)/);
          return sum + (m ? parseInt(m[0]) : 0);
        }, 0);
      return acc + Math.max(swapDelta, 0);
    }, 0);

  const totalPasses = trace.stages.reduce((acc, s) => acc + s.passes.length, 0);

  return (
    <div className="te-summary">
      <div className="te-summary-icon" aria-hidden="true">
        ✓
      </div>
      <h2 className="te-summary-title">Transpilation Complete</h2>
      <p className="te-summary-subtitle">
        {totalPasses} compiler passes · {trace.totalExecutionTimeMs.toFixed(1)} ms total
      </p>

      <div className="te-summary-grid">
        {/* Original */}
        <div className="te-summary-card te-summary-card--original">
          <h4>Original Circuit</h4>
          <div className="te-summary-stat">
            <span>Qubits</span>
            <strong>{trace.originalGateCount > 0 ? originalCircuit.qubits : '—'}</strong>
          </div>
          <div className="te-summary-stat">
            <span>Gates</span>
            <strong>{trace.originalGateCount}</strong>
          </div>
          <div className="te-summary-stat">
            <span>Depth</span>
            <strong>{trace.originalDepth}</strong>
          </div>
          <div className="te-summary-stat">
            <span>2Q Gates</span>
            <strong>{orig2Q}</strong>
          </div>
        </div>

        {/* Arrow */}
        <div className="te-summary-arrow" aria-hidden="true">
          →
        </div>

        {/* Final */}
        <div className="te-summary-card te-summary-card--final">
          <h4>Final Hardware Circuit</h4>
          <div className="te-summary-stat">
            <span>Qubits</span>
            <strong>{originalCircuit.qubits}</strong>
          </div>
          <div className="te-summary-stat">
            <span>Gates</span>
            <strong>{trace.finalGateCount}</strong>
          </div>
          <div className="te-summary-stat">
            <span>Depth</span>
            <strong>{trace.finalDepth}</strong>
          </div>
          <div className="te-summary-stat">
            <span>2Q Gates</span>
            <strong>—</strong>
          </div>
        </div>
      </div>

      {/* Changes summary */}
      <div className="te-summary-changes">
        <h4>Overall Changes</h4>
        <div className="te-summary-change-row">
          <span>Gate count</span>
          <span
            className={`te-summary-change-val ${gateChange.direction === 'decrease' ? 'good' : 'warn'}`}
          >
            {gateChange.label} {gateChange.pct}
          </span>
        </div>
        <div className="te-summary-change-row">
          <span>Circuit depth</span>
          <span
            className={`te-summary-change-val ${depthChange.direction === 'decrease' ? 'good' : 'warn'}`}
          >
            {depthChange.label} {depthChange.pct}
          </span>
        </div>
        {swapCount > 0 && (
          <div className="te-summary-change-row">
            <span>Routing SWAPs inserted</span>
            <span className="te-summary-change-val warn">+{swapCount} SWAP</span>
          </div>
        )}
        <div className="te-summary-change-row">
          <span>Compiler passes executed</span>
          <span className="te-summary-change-val">{totalPasses}</span>
        </div>
      </div>

      <div className="te-summary-stages">
        {trace.stages.map(
          (stage) =>
            stage.passes.length > 0 && (
              <div key={stage.stageName} className="te-summary-stage-pill">
                <span>{stage.stageName}</span>
                <span>{stage.passes.length}p</span>
              </div>
            ),
        )}
      </div>

      <button className="btn btn--primary te-summary-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
