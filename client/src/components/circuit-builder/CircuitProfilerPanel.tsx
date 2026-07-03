import type { CircuitModel, Operation } from '../../circuit/types';
import { GATE_QUBIT_COUNT } from '../../circuit/types';

export interface CircuitProfilerPanelProps {
  circuit: CircuitModel;
}

export default function CircuitProfilerPanel({ circuit }: CircuitProfilerPanelProps) {
  const gateCount = circuit.operations.length;
  
  // Depth is the max time column + 1
  const depth = gateCount > 0 
    ? Math.max(...circuit.operations.map((o) => o.time)) + 1 
    : 0;
    
  // Calculate how many multi-qubit gates exist (costly on NISQ hardware)
  const multiQubitGates = circuit.operations.filter(
    (o) => GATE_QUBIT_COUNT[o.type] > 1
  ).length;
  
  // Calculate single qubit gates
  const singleQubitGates = gateCount - multiQubitGates;

  // Simple heuristic for NISQ success probability 
  // Assuming ~99% fidelity for 2-qubit gates and ~99.9% for 1-qubit gates
  const estimatedFidelity = gateCount === 0 
    ? 100 
    : Math.max(0, Math.round(Math.pow(0.99, multiQubitGates) * Math.pow(0.999, singleQubitGates) * 100));

  const isDeep = depth > 20;
  const isNoisy = estimatedFidelity < 70;

  return (
    <div className="profiler-panel">
      <div className="profiler-panel__header">
        <h3 className="profiler-panel__title">Circuit Profiler & Cost</h3>
      </div>
      
      <div className="profiler-panel__metrics">
        <div className="profiler-panel__metric">
          <span className="profiler-panel__metric-label">Depth</span>
          <span className={`profiler-panel__metric-value ${isDeep ? 'profiler-panel__metric-value--warn' : ''}`}>
            {depth}
          </span>
        </div>
        
        <div className="profiler-panel__metric">
          <span className="profiler-panel__metric-label">Total Gates</span>
          <span className="profiler-panel__metric-value">{gateCount}</span>
        </div>
        
        <div className="profiler-panel__metric">
          <span className="profiler-panel__metric-label">2+ Qubit Gates</span>
          <span className="profiler-panel__metric-value">{multiQubitGates}</span>
        </div>

        <div className="profiler-panel__metric">
          <span className="profiler-panel__metric-label">Est. NISQ Fidelity</span>
          <span className={`profiler-panel__metric-value ${isNoisy ? 'profiler-panel__metric-value--error' : 'profiler-panel__metric-value--success'}`}>
            {estimatedFidelity}%
          </span>
        </div>
      </div>

      {(isDeep || isNoisy) && (
        <div className="profiler-panel__warning">
          <strong>Hardware Warning:</strong> This circuit is deep and contains many multi-qubit gates. It may suffer from significant noise and decoherence on actual NISQ hardware. Consider optimizing your circuit.
        </div>
      )}
    </div>
  );
}
