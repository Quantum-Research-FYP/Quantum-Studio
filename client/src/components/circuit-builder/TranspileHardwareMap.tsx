/**
 * TranspileHardwareMap.tsx
 * Hardware coupling map visualization shown during Mapping & Routing stages.
 */
import type { FlatPass } from '../../hooks/useTranspilationEngine';
import type { TranspileTraceResponse } from '../../api/simulations';

interface Props {
  trace: TranspileTraceResponse;
  selectedPass: FlatPass;
}

const VISIBLE_STAGES = new Set(['Mapping', 'Routing', 'Scheduling']);

export default function TranspileHardwareMap({ trace, selectedPass }: Props) {
  if (!VISIBLE_STAGES.has(selectedPass.stageName)) return null;

  const couplingMap = trace.couplingMap;
  const layout = trace.logicalToPhysicalLayout;

  if (!couplingMap || couplingMap.length === 0) {
    return (
      <div className="te-hardware-map te-hardware-map--empty">
        <span className="te-hardware-empty-icon">🖥️</span>
        <p>Hardware topology not provided by backend.</p>
        <p className="te-source-note">Requires IBM credentials for real coupling map.</p>
      </div>
    );
  }

  // Collect unique physical qubits
  const physQubits = Array.from(new Set(couplingMap.flat())).sort((a, b) => a - b);
  const maxQ = Math.max(...physQubits);
  const displayQubits = physQubits.slice(0, Math.min(physQubits.length, 20)); // cap at 20 for display

  // Build reverse mapping: physical → logical
  const physToLogical: Record<number, string> = {};
  if (layout) {
    for (const [logical, phys] of Object.entries(layout)) {
      physToLogical[phys] = logical;
    }
  }

  // Simple grid layout: arrange qubits in a grid
  const cols = Math.ceil(Math.sqrt(displayQubits.length));
  const rows = Math.ceil(displayQubits.length / cols);
  const cellSize = 56;
  const padding = 32;

  const positions: Record<number, { x: number; y: number }> = {};
  displayQubits.forEach((q, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions[q] = {
      x: padding + col * cellSize,
      y: padding + row * cellSize,
    };
  });

  const svgWidth = padding * 2 + cols * cellSize;
  const svgHeight = padding * 2 + rows * cellSize;

  const visibleEdges = couplingMap.filter(
    ([a, b]) => positions[a] !== undefined && positions[b] !== undefined && a < b
  );

  return (
    <div className="te-hardware-map">
      <div className="te-hardware-map-header">
        <span className="te-hardware-map-title">Hardware Topology</span>
        <span className="te-hardware-map-subtitle">
          {physQubits.length} physical qubits · {couplingMap.length / 2} connections
          {physQubits.length > 20 && ` (showing 20/${physQubits.length})`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="te-topology-svg"
        aria-label="Hardware coupling map"
      >
        {/* Edges */}
        {visibleEdges.map(([a, b], i) => (
          <line
            key={i}
            x1={positions[a].x + cellSize / 2 - 8}
            y1={positions[a].y + cellSize / 2 - 8}
            x2={positions[b].x + cellSize / 2 - 8}
            y2={positions[b].y + cellSize / 2 - 8}
            className="te-topology-edge"
          />
        ))}
        {/* Nodes */}
        {displayQubits.map((q) => {
          const pos = positions[q];
          const logical = physToLogical[q];
          const isActive = logical !== undefined;
          return (
            <g key={q} className={`te-topology-node${isActive ? ' active' : ''}`}>
              <circle
                cx={pos.x + cellSize / 2 - 8}
                cy={pos.y + cellSize / 2 - 8}
                r={isActive ? 14 : 11}
                className={`te-topology-circle${isActive ? ' te-topology-circle--active' : ''}`}
              />
              <text
                x={pos.x + cellSize / 2 - 8}
                y={pos.y + cellSize / 2 - 8}
                className="te-topology-phys-label"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {isActive ? logical : `Q${q}`}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Mapping table */}
      {layout && Object.keys(layout).length > 0 && (
        <div className="te-mapping-table">
          <div className="te-mapping-table-header">
            <span>Logical</span>
            <span>→</span>
            <span>Physical</span>
          </div>
          {Object.entries(layout).map(([logical, phys]) => (
            <div key={logical} className="te-mapping-row">
              <code>{logical}</code>
              <span className="te-mapping-arrow">→</span>
              <code>Q{phys}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
