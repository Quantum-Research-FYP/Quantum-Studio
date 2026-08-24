import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  getTranspileTrace,
  type TranspileTraceResponse,
  type TranspileStageSummary,
  type TranspilePassTrace,
  type DagData,
} from '../../api/simulations';

// ─────────────────────────────────────────────────────────────────────────────
// Component props
// ─────────────────────────────────────────────────────────────────────────────

interface TranspilationPanelProps {
  qasm: string;
  codeType: 'qasm' | 'python';
  backendName: string;
  onClose?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation section IDs (flat sequence for prev/next)
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_IDS = [
  'tp-original',
  'tp-dag',
  'tp-stage-0',
  'tp-stage-1',
  'tp-stage-2',
  'tp-stage-3',
  'tp-stage-4',
  'tp-stage-5',
  'tp-final',
  'tp-summary',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// CSS helpers
// ─────────────────────────────────────────────────────────────────────────────

const card: CSSProperties = {
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
};

const sectionHeader: CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-text-subtle)',
  marginBottom: '4px',
};

const badge = (color: string, bg: string): CSSProperties => ({
  fontSize: '0.65rem',
  padding: '2px 7px',
  borderRadius: '10px',
  backgroundColor: bg,
  color,
  fontWeight: 600,
  whiteSpace: 'nowrap',
});

// ─────────────────────────────────────────────────────────────────────────────
// MetricDelta
// ─────────────────────────────────────────────────────────────────────────────

function MetricDelta({
  label, before, after, lowerIsBetter = true,
}: { label: string; before: number; after: number; lowerIsBetter?: boolean }) {
  const delta = after - before;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const worse = lowerIsBetter ? delta > 0 : delta < 0;
  const color = improved ? 'var(--color-success)' : worse ? 'var(--color-error)' : 'var(--color-text-muted)';
  const symbol = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '—';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={sectionHeader}>{label}</div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{before}</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>→</span>
        <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{after}</span>
        <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '8px', backgroundColor: improved ? 'rgba(52,211,153,0.1)' : worse ? 'rgba(248,113,113,0.1)' : 'transparent', color, fontWeight: 600 }}>{symbol}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MetricGrid
// ─────────────────────────────────────────────────────────────────────────────

function MetricGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '10px' }}>
      {items.map(({ label, value }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={sectionHeader}>{label}</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DagViewer
// ─────────────────────────────────────────────────────────────────────────────

function computeDagLayout(dagData: DagData, width = 420, height = 200) {
  const { nodes, edges } = dagData;
  if (!nodes.length) return null;
  const adj: Record<string, string[]> = {};
  const inEdges: Record<string, string[]> = {};
  const nodeMap: Record<string, (typeof nodes)[0]> = {};
  nodes.forEach((n) => { adj[n.id] = []; inEdges[n.id] = []; nodeMap[n.id] = n; });
  edges.forEach((e) => { if (adj[e.source]) adj[e.source].push(e.target); if (inEdges[e.target]) inEdges[e.target].push(e.source); });
  const layers: Record<string, number> = {};
  const visited = new Set<string>();
  function getRank(nodeId: string): number {
    if (layers[nodeId] !== undefined) return layers[nodeId];
    const node = nodeMap[nodeId];
    if (!node || node.type === 'in' || inEdges[nodeId].length === 0) return (layers[nodeId] = 0);
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);
    let maxParent = 0;
    inEdges[nodeId].forEach((pId) => { maxParent = Math.max(maxParent, getRank(pId)); });
    visited.delete(nodeId);
    return (layers[nodeId] = maxParent + 1);
  }
  nodes.forEach((n) => getRank(n.id));
  let maxRank = 0;
  nodes.forEach((n) => { if (layers[n.id] > maxRank) maxRank = layers[n.id]; });
  nodes.forEach((n) => { if (n.type === 'out') layers[n.id] = maxRank + 1; });
  maxRank = 0;
  nodes.forEach((n) => { if (layers[n.id] > maxRank) maxRank = layers[n.id]; });
  const layersGroup: Record<number, string[]> = {};
  for (let r = 0; r <= maxRank; r++) layersGroup[r] = [];
  nodes.forEach((n) => { const r = layers[n.id] || 0; if (!layersGroup[r]) layersGroup[r] = []; layersGroup[r].push(n.id); });
  const positions: Record<string, { x: number; y: number }> = {};
  const paddingX = 40, paddingY = 24;
  const activeLayers = Object.keys(layersGroup).map(Number).filter((l) => layersGroup[l].length > 0).sort((a, b) => a - b);
  const layerCount = activeLayers.length;
  activeLayers.forEach((l, lIdx) => {
    const x = paddingX + (lIdx / Math.max(1, layerCount - 1)) * (width - 2 * paddingX);
    const nodeIds = layersGroup[l];
    const nVal = nodeIds.length;
    nodeIds.forEach((id, idx) => { const y = paddingY + (nVal === 1 ? 0.5 : idx / (nVal - 1)) * (height - 2 * paddingY); positions[id] = { x, y }; });
  });
  return { positions, nodes, edges };
}

function DagViewer({ dagData, title, width = 420, height = 200, compact = false }: { dagData: DagData | null | undefined; title?: string; width?: number; height?: number; compact?: boolean }) {
  const layout = useMemo(() => dagData ? computeDagLayout(dagData, width, height) : null, [dagData, width, height]);
  const markerId = useMemo(() => `arrow-${Math.random().toString(36).slice(2, 7)}`, []);
  if (!dagData || !layout) return <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No DAG data available</div>;
  if (dagData.nodes.length === 0) return <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Empty DAG</div>;
  return (
    <div>
      {title && <div style={{ ...sectionHeader, marginBottom: '8px' }}>{title}</div>}
      <div style={{ overflowX: 'auto' }}>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width, display: 'block' }}>
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="18" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-text-muted)" />
            </marker>
          </defs>
          {layout.edges.map((edge, idx) => {
            const p1 = layout.positions[edge.source], p2 = layout.positions[edge.target];
            if (!p1 || !p2) return null;
            return <g key={idx}><line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--color-border-strong)" strokeWidth="1.5" markerEnd={`url(#${markerId})`} />{edge.label && <text x={(p1.x+p2.x)/2} y={(p1.y+p2.y)/2-5} textAnchor="middle" fontSize="6.5" fill="var(--color-text-muted)">{edge.label}</text>}</g>;
          })}
          {layout.nodes.map((node) => {
            const pos = layout.positions[node.id];
            if (!pos) return null;
            const isGate = node.type === 'gate', isIn = node.type === 'in', isOut = node.type === 'out';
            const isMeasure = node.label.toLowerCase() === 'measure';
            const is2Q = ['CX','ECR','CZ','SWAP'].includes(node.label);
            let fill = 'var(--color-surface-2)', stroke = 'var(--color-border-strong)';
            const r = compact ? '10' : '13';
            if (isGate && is2Q) { fill = 'rgba(167,139,250,0.15)'; stroke = 'var(--color-accent)'; }
            else if (isGate && isMeasure) { fill = 'rgba(251,191,36,0.12)'; stroke = 'var(--color-warning)'; }
            else if (isGate) { fill = 'var(--color-primary-dim)'; stroke = 'var(--color-primary)'; }
            else if (isIn) { fill = 'var(--color-surface-3)'; stroke = 'var(--color-border)'; }
            else if (isOut) { fill = 'rgba(52,211,153,0.08)'; stroke = 'var(--color-success)'; }
            return <g key={node.id}><circle cx={pos.x} cy={pos.y} r={r} fill={fill} stroke={stroke} strokeWidth="1.5" /><text x={pos.x} y={pos.y + (compact ? 3 : 4)} textAnchor="middle" fontSize={compact ? '6.5' : '7.5'} fontWeight="bold" fill="var(--color-text)">{node.label.length > 6 ? node.label.slice(0, 5) + '…' : node.label}</text></g>;
          })}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '6px', flexWrap: 'wrap', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
        {[['var(--color-primary-dim)','var(--color-primary)','1Q gate'],['rgba(167,139,250,0.15)','var(--color-accent)','2Q gate'],['var(--color-surface-3)','var(--color-border)','wire in/out']].map(([bg,bdr,lbl]) => (
          <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: bg, border: `1px solid ${bdr}`, display: 'inline-block' }} />{lbl}</span>
        ))}
      </div>
    </div>
  );
}

function DagStats({ dagData }: { dagData: DagData | null | undefined }) {
  if (!dagData) return null;
  const opNodes = dagData.nodes.filter((n) => n.type === 'gate');
  const oneQ = opNodes.filter((n) => !['CX','ECR','CZ','SWAP','MEASURE'].includes(n.label)).length;
  const twoQ = opNodes.filter((n) => ['CX','ECR','CZ','SWAP'].includes(n.label)).length;
  const meas = opNodes.filter((n) => n.label === 'MEASURE').length;
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '6px' }}>
      <span>Operation nodes: <b style={{ color: 'var(--color-text)' }}>{opNodes.length}</b></span>
      <span>1Q ops: <b style={{ color: 'var(--color-primary)' }}>{oneQ}</b></span>
      <span>2Q ops: <b style={{ color: 'var(--color-accent)' }}>{twoQ}</b></span>
      {meas > 0 && <span>Measurements: <b style={{ color: 'var(--color-warning)' }}>{meas}</b></span>}
      <span>Dependency edges: <b style={{ color: 'var(--color-text)' }}>{dagData.edges.length}</b></span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CouplingMapViewer
// ─────────────────────────────────────────────────────────────────────────────

function CouplingMapViewer({ couplingMap, layoutMap }: { couplingMap: Array<[number, number]>; layoutMap: Record<string, number> | null }) {
  const nodes = useMemo(() => Array.from(new Set(couplingMap.flat())).sort((a, b) => a - b), [couplingMap]);
  const positions = useMemo(() => {
    const pos: Record<number, { x: number; y: number }> = {};
    if (!nodes.length) return pos;
    const w = 380, h = 180, cx = w / 2, cy = h / 2, r = Math.min(cx, cy) - 28;
    nodes.forEach((node, idx) => { const angle = (idx / nodes.length) * 2 * Math.PI - Math.PI / 2; pos[node] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }; });
    return pos;
  }, [nodes]);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width="100%" height={180} viewBox="0 0 380 180" style={{ maxWidth: 380 }}>
        {couplingMap.map(([n1, n2], idx) => { const p1 = positions[n1], p2 = positions[n2]; if (!p1 || !p2) return null; return <line key={idx} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--color-border-strong)" strokeWidth="1.5" />; })}
        {nodes.map((node) => {
          const pos = positions[node];
          if (!pos) return null;
          const logicalName = layoutMap ? Object.keys(layoutMap).find((k) => layoutMap[k] === node) : null;
          return (
            <g key={node}>
              <circle cx={pos.x} cy={pos.y} r={15} fill={logicalName ? 'var(--color-primary-dim)' : 'var(--color-surface-2)'} stroke={logicalName ? 'var(--color-primary)' : 'var(--color-border-strong)'} strokeWidth="2" />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize="9" fontWeight="bold" fill="var(--color-text)">{node}</text>
              {logicalName && <text x={pos.x} y={pos.y - 20} textAnchor="middle" fontSize="8" fill="var(--color-primary)" fontWeight="600">{logicalName}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QasmCodeView
// ─────────────────────────────────────────────────────────────────────────────

function QasmCodeView({ qasm, maxHeight = 160 }: { qasm: string; maxHeight?: number }) {
  const [expanded, setExpanded] = useState(false);
  const lines = qasm.trim().split('\n');
  const preview = lines.slice(0, 12).join('\n');
  const showToggle = lines.length > 12;
  return (
    <div>
      <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: expanded ? `${maxHeight * 3}px` : `${maxHeight}px`, overflow: 'hidden' }}>
        {expanded ? qasm.trim() : preview}{!expanded && showToggle ? '\n...' : ''}
      </pre>
      {showToggle && <button onClick={() => setExpanded((e) => !e)} style={{ marginTop: '4px', background: 'none', border: 'none', fontSize: '0.7rem', color: 'var(--color-primary)', cursor: 'pointer', padding: 0 }}>{expanded ? '▲ Show less' : `▼ Show all ${lines.length} lines`}</button>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionCard
// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({ id, icon, label, sublabel, accent, children, isActive = false }: { id: string; icon: string; label: string; sublabel?: string; accent?: string; children: ReactNode; isActive?: boolean }) {
  const accentBorder = accent || 'var(--color-border)';
  return (
    <div id={id} style={{ ...card, borderLeft: `3px solid ${accentBorder}`, boxShadow: isActive ? `0 0 0 1px ${accentBorder}` : undefined, transition: 'box-shadow 0.2s', scrollMarginTop: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{label}</div>
          {sublabel && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{sublabel}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InfoBanner
// ─────────────────────────────────────────────────────────────────────────────

function InfoBanner({ children, variant = 'info' }: { children: ReactNode; variant?: 'info' | 'success' | 'warning' | 'note' }) {
  const colorMap = { info: 'var(--color-primary)', success: 'var(--color-success)', warning: 'var(--color-warning)', note: 'var(--color-accent)' };
  const bgMap = { info: 'var(--color-primary-dim)', success: 'rgba(52,211,153,0.08)', warning: 'rgba(251,191,36,0.08)', note: 'var(--color-accent-dim)' };
  return <div style={{ backgroundColor: bgMap[variant], border: `1px solid ${colorMap[variant]}`, borderRadius: '6px', padding: '10px 14px', fontSize: '0.8rem', color: colorMap[variant], lineHeight: 1.5, marginBottom: '14px' }}>{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// OptimizationPassCard
// ─────────────────────────────────────────────────────────────────────────────

function OptimizationPassCard({ pass, index }: { pass: TranspilePassTrace; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const delta = pass.deltaGates;
  const changed = pass.circuitChanged;
  const statusColor = !changed ? 'var(--color-text-muted)' : delta < 0 ? 'var(--color-success)' : delta > 0 ? 'var(--color-warning)' : 'var(--color-primary)';
  const statusLabel = !changed ? 'No change' : delta < 0 ? `${delta} gates` : delta > 0 ? `+${delta} gates` : 'Rearranged';
  return (
    <div style={{ ...card, marginBottom: '10px', padding: '12px', borderLeft: `3px solid ${statusColor}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', cursor: 'pointer' }} onClick={() => setExpanded((e) => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '8px', backgroundColor: 'var(--color-surface-3)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>#{index + 1}</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{pass.passName}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>{pass.passClass}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={badge(statusColor, `${statusColor}18`)}>{statusLabel}</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{pass.executionTimeMs.toFixed(1)} ms</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {!expanded && (
        <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {!changed ? 'No applicable pattern found. Circuit unchanged.' : pass.patternFound || pass.purpose}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: '14px' }}>
          {/* A. Purpose */}
          <div style={{ marginBottom: '12px' }}>
            <div style={sectionHeader}>A. What does this pass do?</div>
            <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.6 }}>{pass.purpose}</p>
          </div>

          {/* B + C. Why present / What found */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={{ backgroundColor: 'var(--color-surface-2)', borderRadius: '6px', padding: '10px' }}>
              <div style={{ ...sectionHeader, color: 'var(--color-primary)', marginBottom: '6px' }}>B. Why is this pass in the pipeline?</div>
              <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.55, color: 'var(--color-text-muted)' }}>{pass.pipelineReason || 'This pass is part of the optimization pipeline configured for the current Qiskit transpiler settings.'}</p>
            </div>
            <div style={{ backgroundColor: 'var(--color-surface-2)', borderRadius: '6px', padding: '10px' }}>
              <div style={{ ...sectionHeader, color: changed ? 'var(--color-success)' : 'var(--color-text-subtle)', marginBottom: '6px' }}>C. What did it find?</div>
              <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.55, color: 'var(--color-text-muted)' }}>{!changed ? 'This pass executed but found no applicable pattern in the current circuit. No circuit change was made.' : pass.patternFound || 'The pass modified the circuit, but the exact pattern could not be reliably determined from the transformation.'}</p>
            </div>
          </div>

          {/* I. Metrics */}
          <div style={{ backgroundColor: 'var(--color-surface-2)', borderRadius: '6px', padding: '12px', marginBottom: '12px' }}>
            <div style={{ ...sectionHeader, marginBottom: '10px' }}>I. Metrics (before → after)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
              <MetricDelta label="Gate Count" before={pass.gateCount - pass.deltaGates} after={pass.gateCount} />
              <MetricDelta label="Circuit Depth" before={pass.depth - pass.deltaDepth} after={pass.depth} />
              <MetricDelta label="1Q Gates" before={pass.oneQGatesBefore} after={pass.oneQGates} />
              <MetricDelta label="2Q Gates" before={pass.twoQGatesBefore} after={pass.twoQGates} />
            </div>
            {pass.changedGates.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ ...sectionHeader, marginBottom: '4px' }}>Changed gate types</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {pass.changedGates.map((g, i) => <span key={i} style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--color-surface-3)', fontFamily: 'var(--font-mono)', color: g.includes('+') ? 'var(--color-warning)' : 'var(--color-success)' }}>{g}</span>)}
                </div>
              </div>
            )}
            {delta > 0 && <div style={{ marginTop: '8px', fontSize: '0.72rem', color: 'var(--color-warning)', backgroundColor: 'rgba(251,191,36,0.07)', padding: '6px 10px', borderRadius: '4px', borderLeft: '2px solid var(--color-warning)' }}>ℹ️ Gate count increased. This is often a representation change enabling further optimization by a later pass — not a failure.</div>}
          </div>

          {/* J. Execution time */}
          <div style={{ marginBottom: '12px' }}>
            <div style={sectionHeader}>J. Execution Time</div>
            <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{pass.executionTimeMs.toFixed(3)} ms</div>
          </div>

          {/* D/E. QASM before/after */}
          {(pass.qasmBefore || pass.qasm) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {pass.qasmBefore && <div><div style={{ ...sectionHeader, marginBottom: '6px' }}>D. Circuit Before</div><div style={{ backgroundColor: 'var(--color-surface-3)', borderRadius: '6px', padding: '10px' }}><QasmCodeView qasm={pass.qasmBefore} maxHeight={120} /></div></div>}
              {pass.qasm && <div><div style={{ ...sectionHeader, marginBottom: '6px' }}>E. Circuit After</div><div style={{ backgroundColor: 'var(--color-surface-3)', borderRadius: '6px', padding: '10px' }}><QasmCodeView qasm={pass.qasm} maxHeight={120} /></div></div>}
            </div>
          )}

          {/* F/G. DAG before/after */}
          {(pass.dagBefore || pass.dagAfter) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div><div style={{ ...sectionHeader, marginBottom: '6px' }}>F. DAG Before</div><div style={{ backgroundColor: 'var(--color-surface-3)', borderRadius: '6px', padding: '8px' }}>{pass.dagBefore ? <DagViewer dagData={pass.dagBefore} width={320} height={140} compact /> : <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '8px' }}>Not captured</div>}</div></div>
              <div><div style={{ ...sectionHeader, marginBottom: '6px' }}>G. DAG After {!changed && <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>(unchanged)</span>}</div><div style={{ backgroundColor: 'var(--color-surface-3)', borderRadius: '6px', padding: '8px' }}>{pass.dagAfter ? <DagViewer dagData={pass.dagAfter} width={320} height={140} compact /> : <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '8px' }}>{!changed ? 'DAG structure unchanged.' : 'Not captured.'}</div>}</div></div>
            </div>
          )}

          {/* GNN Features */}
          {pass.gnnFeatures?.before && pass.gnnFeatures?.after && (
            <div style={{ backgroundColor: 'var(--color-surface-2)', borderRadius: '6px', padding: '10px', marginBottom: '8px' }}>
              <div style={{ ...sectionHeader, marginBottom: '8px', color: 'var(--color-accent)' }}>GNN Research Features</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px', fontSize: '0.72rem' }}>
                {Object.entries(pass.gnnFeatures.after).map(([key, val]) => {
                  const before = (pass.gnnFeatures!.before as unknown as Record<string, number>)[key];
                  const d = (val as number) - before;
                  return (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>{key}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{before} → {val}{d !== 0 && <span style={{ marginLeft: '4px', color: d < 0 ? 'var(--color-success)' : 'var(--color-warning)' }}>({d > 0 ? '+' : ''}{d})</span>}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OptimizationPassesSection
// ─────────────────────────────────────────────────────────────────────────────

function OptimizationPassesSection({ passes }: { passes: TranspilePassTrace[]; stageSummary: TranspileStageSummary }) {
  const [expanded, setExpanded] = useState(true);
  const changedCount = passes.filter((p) => p.circuitChanged).length;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{passes.length} optimization passes</span>
          <span style={badge('var(--color-success)', 'rgba(52,211,153,0.1)')}>{changedCount} modified circuit</span>
          <span style={badge('var(--color-text-muted)', 'var(--color-surface-3)')}>{passes.length - changedCount} no change</span>
        </div>
        <button onClick={() => setExpanded((e) => !e)} className="btn" style={{ fontSize: '0.72rem', padding: '3px 10px' }}>{expanded ? '▲ Collapse' : '▼ Expand All'}</button>
      </div>
      {expanded && passes.map((pass, idx) => <OptimizationPassCard key={`${pass.passName}-${idx}`} pass={pass} index={idx} />)}
      {!expanded && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {passes.map((p, idx) => <button key={`${p.passName}-${idx}`} onClick={() => setExpanded(true)} title={p.purpose} style={{ fontSize: '0.67rem', padding: '2px 7px', borderRadius: '10px', border: `1px solid ${p.circuitChanged ? 'var(--color-success)' : 'var(--color-border)'}`, backgroundColor: p.circuitChanged ? 'rgba(52,211,153,0.08)' : 'var(--color-surface-2)', color: p.circuitChanged ? 'var(--color-success)' : 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>#{idx+1} {p.passName}</button>)}
      </div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gantt helper
// ─────────────────────────────────────────────────────────────────────────────

function parseQasmToGantt(qasm: string) {
  const lines = qasm.split('\n');
  const qubitGates: Record<string, Array<{ name: string; start: number; duration: number }>> = {};
  const qubitTime: Record<string, number> = {};
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('OPENQASM') || trimmed.startsWith('include')) return;
    const match = trimmed.match(/^([a-z0-9_]+)(?:\([^)]*\))?\s+([^;]+);/i);
    if (!match) return;
    const gateName = match[1], targets = match[2].split(',').map((t) => t.trim());
    const validTargets = targets.filter((t) => t.match(/^[a-z_][a-z0-9_]*\[\d+\]$/i));
    if (!validTargets.length) return;
    let maxTime = 0;
    validTargets.forEach((t) => { if (!qubitGates[t]) { qubitGates[t] = []; qubitTime[t] = 0; } maxTime = Math.max(maxTime, qubitTime[t]); });
    const duration = ['cx','cz','swap','ecr'].includes(gateName.toLowerCase()) ? 2 : 1;
    validTargets.forEach((t) => { qubitGates[t].push({ name: gateName.toUpperCase(), start: maxTime, duration }); qubitTime[t] = maxTime + duration; });
  });
  const maxDuration = Math.max(...Object.values(qubitTime).concat(1));
  return { qubitGates, maxDuration };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main TranspilationPanel
// ─────────────────────────────────────────────────────────────────────────────

export function TranspilationPanel({ qasm, codeType, backendName, onClose }: TranspilationPanelProps) {
  const [trace, setTrace] = useState<TranspileTraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimizationLevel, setOptimizationLevel] = useState<number>(1);
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchTrace = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getTranspileTrace({ qasm, mode: codeType, backend: backendName, optimizationLevel });
      setTrace(res); setActiveSectionIdx(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate transpilation trace.');
    } finally { setLoading(false); }
  }, [qasm, codeType, backendName, optimizationLevel]);

  useEffect(() => { fetchTrace(); }, [fetchTrace]);

  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setActiveSectionIdx((prev) => { if (prev >= SECTION_IDS.length - 1) { setIsPlaying(false); return prev; } return prev + 1; });
      }, 2200);
    } else { if (playTimerRef.current) clearInterval(playTimerRef.current); }
    return () => { if (playTimerRef.current) clearInterval(playTimerRef.current); };
  }, [isPlaying]);

  useEffect(() => {
    const sectionId = SECTION_IDS[activeSectionIdx];
    const el = document.getElementById(sectionId as string);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeSectionIdx]);

  const stageAccents = ['var(--color-info)', 'var(--color-primary)', 'var(--color-accent)', '#fb923c', 'var(--color-success)', 'var(--color-warning)'];
  const stageIcons = ['🔍', '🗺️', '🔀', '🔧', '⚡', '⏱️'];
  const stageLabels = ['① Circuit Analysis', '② Qubit Mapping', '③ Routing', '④ Gate Decomposition & Basis Conversion', '⑤ Optimization', '⑥ Scheduling'];
  const stageBanners = [
    'Analyzes and prepares the input circuit for hardware-aware compilation. Verifies structure, counts gates, and collects metrics needed by later stages.',
    'Maps logical (virtual) qubits onto physical hardware qubits. A good mapping minimizes the number of SWAP gates required for routing.',
    'Resolves hardware connectivity constraints for two-qubit operations. Inserts SWAP gates to move qubit states next to each other when they are not directly connected.',
    "Converts all gates into the target hardware's native gate set (ISA). Gates like H or T are decomposed into sequences of native gates like RZ, SX, and ECR.",
    'Applies optimization passes to reduce gate count, depth, and noise. Each pass is shown in detail below — including what it found and what changed.',
    '',
  ];
  const stageBannerVariants: Array<'info' | 'success' | 'warning' | 'note'> = ['info', 'info', 'note', 'warning', 'success', 'warning'];

  const logicalLayoutMap = trace?.logicalToPhysicalLayout || null;
  const ganttData = useMemo(() => trace ? parseQasmToGantt(trace.finalQasm || '') : { qubitGates: {}, maxDuration: 1 }, [trace]);

  const navLabels = [
    { label: 'Original', icon: '📋' }, { label: 'Init DAG', icon: '🌐' },
    { label: 'Analysis', icon: '🔍' }, { label: 'Mapping', icon: '🗺️' },
    { label: 'Routing', icon: '🔀' }, { label: 'Decomp.', icon: '🔧' },
    { label: 'Optimize', icon: '⚡' }, { label: 'Schedule', icon: '⏱️' },
    { label: 'Final', icon: '✅' }, { label: 'Summary', icon: '📊' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '500px', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Transpilation Transparency</span>
          <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'var(--color-primary-dim)', color: 'var(--color-primary)' }}>{backendName}</span>
          {trace && <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>{trace.stages.reduce((s, st) => s + st.passes.length, 0)} passes · {trace.totalExecutionTimeMs.toFixed(0)} ms · Opt Level {trace.optimizationLevel}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>Opt Level:</label>
          <select value={optimizationLevel} onChange={(e) => setOptimizationLevel(Number(e.target.value))} style={{ padding: '2px 6px', fontSize: '0.72rem', backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text)' }}>
            <option value={0}>0 (None)</option><option value={1}>1 (Light)</option><option value={2}>2 (Medium)</option><option value={3}>3 (Aggressive)</option>
          </select>
          <button onClick={fetchTrace} className="btn" style={{ fontSize: '0.72rem', padding: '3px 8px' }}>↺ Reload</button>
          {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-subtle)', cursor: 'pointer', fontSize: '1.1rem' }}>&times;</button>}
        </div>
      </div>

      {/* Pipeline Nav */}
      <div style={{ padding: '0 8px', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-2)', overflowX: 'auto', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '0', alignItems: 'stretch', minWidth: 'max-content' }}>
          {navLabels.map((item, idx) => {
            const isActive = activeSectionIdx === idx;
            return (
              <button key={idx} onClick={() => { setIsPlaying(false); setActiveSectionIdx(idx); }} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 10px', background: 'none', border: 'none', borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent', fontSize: '0.72rem', fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color 0.15s' }}>
                <span style={{ fontSize: '0.85rem' }}>{item.icon}</span>{item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Playback Controls */}
      <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', flexShrink: 0 }}>
        <button onClick={() => { setIsPlaying(false); setActiveSectionIdx((p) => Math.max(0, p - 1)); }} className="btn" disabled={activeSectionIdx <= 0} style={{ padding: '3px 8px', fontSize: '0.72rem' }}>⏮ Prev</button>
        <button onClick={() => setIsPlaying((p) => !p)} className="btn btn--primary" style={{ padding: '3px 12px', fontSize: '0.72rem' }}>{isPlaying ? '⏸ Pause' : '▶ Play'}</button>
        <button onClick={() => { setIsPlaying(false); setActiveSectionIdx((p) => Math.min(SECTION_IDS.length - 1, p + 1)); }} className="btn" disabled={activeSectionIdx >= SECTION_IDS.length - 1} style={{ padding: '3px 8px', fontSize: '0.72rem' }}>Next ⏭</button>
        <input type="range" min={0} max={SECTION_IDS.length - 1} value={activeSectionIdx} onChange={(e) => { setIsPlaying(false); setActiveSectionIdx(Number(e.target.value)); }} style={{ flex: 1, cursor: 'pointer' }} />
        <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{navLabels[activeSectionIdx]?.icon} {navLabels[activeSectionIdx]?.label}</span>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '40px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'tp-spin 1s linear infinite' }} />
          <style>{`@keyframes tp-spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Capturing transpilation passes from Qiskit PassManager…</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>This may take a few seconds for complex circuits or high optimization levels</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-error)' }}>
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>Transpilation Audit Failed</div>
          <div style={{ fontSize: '0.85rem', marginBottom: '16px' }}>{error}</div>
          <button onClick={fetchTrace} className="btn btn--primary" style={{ fontSize: '0.8rem', padding: '6px 16px' }}>Retry</button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && trace && (
        <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

          {/* Original Circuit */}
          <SectionCard id="tp-original" icon="📋" label="Original Circuit" sublabel="Your circuit as defined, before any transpilation" accent="var(--color-info)" isActive={activeSectionIdx === 0}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <div style={{ ...sectionHeader, marginBottom: '10px' }}>Circuit Properties</div>
                <MetricGrid items={[
                  { label: 'Qubits', value: trace.originalQubits }, { label: 'Classical bits', value: trace.originalClassicalBits },
                  { label: 'Total gates', value: trace.originalGateCount }, { label: '1Q gates', value: trace.originalOneQGates },
                  { label: '2Q gates', value: trace.originalTwoQGates }, { label: 'Multi-qubit', value: trace.originalMultiQGates },
                  { label: 'Circuit depth', value: trace.originalDepth }, { label: 'Measurements', value: trace.originalMeasurements },
                ]} />
              </div>
              <div>
                <div style={{ ...sectionHeader, marginBottom: '10px' }}>Target Backend</div>
                <MetricGrid items={[
                  { label: 'Backend', value: backendName },
                  { label: 'Physical qubits', value: trace.backendNumQubits != null ? trace.backendNumQubits : '—' },
                  { label: 'Opt. level', value: trace.optimizationLevel },
                  { label: 'Basis gates', value: trace.backendBasisGates ? trace.backendBasisGates.slice(0, 4).join(', ') + (trace.backendBasisGates.length > 4 ? '…' : '') : 'all-to-all' },
                ]} />
                {trace.backendBasisGates && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ ...sectionHeader, marginBottom: '6px' }}>All basis gates</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>{trace.backendBasisGates.map((g) => <span key={g} style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--color-surface-3)', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>{g}</span>)}</div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ ...sectionHeader, marginBottom: '6px' }}>Original Circuit (QASM)</div>
            <div style={{ backgroundColor: 'var(--color-surface-3)', borderRadius: '6px', padding: '12px' }}><QasmCodeView qasm={trace.originalQasm} /></div>
          </SectionCard>

          {/* Initial DAG */}
          <SectionCard id="tp-dag" icon="🌐" label="Initial DAG Representation" sublabel="The circuit's internal dependency graph — not a transpilation stage" accent="var(--color-accent)" isActive={activeSectionIdx === 1}>
            <InfoBanner variant="note">The <strong>Directed Acyclic Graph (DAG)</strong> is the internal data structure Qiskit uses to represent your circuit. Each node is an operation; directed edges show qubit dependencies and gate ordering. The transpiler works directly on this DAG representation throughout compilation.</InfoBanner>
            <DagViewer dagData={trace.initialDag || trace.dag} title="Circuit Dependency Graph" width={520} height={220} />
            <DagStats dagData={trace.initialDag || trace.dag} />
          </SectionCard>

          {/* 6 Stages */}
          {trace.stages.map((stage, stageIdx) => {
            const sectionId = SECTION_IDS[2 + stageIdx] as string;
            const accent = stageAccents[stageIdx];
            const isActiveSection = activeSectionIdx === 2 + stageIdx;
            const noPasses = stage.passes.length === 0;
            const mappingStage = stageIdx === 1;
            const routingStage = stageIdx === 2;
            const schedStage = stageIdx === 5;
            const optStage = stageIdx === 4;

            return (
              <SectionCard key={stage.stageName} id={sectionId} icon={stageIcons[stageIdx]} label={stageLabels[stageIdx]} sublabel={`Qiskit: ${stage.qiskitConcept || '—'} · ${stage.passes.length} passes · ${stage.executionTimeMs.toFixed(1)} ms`} accent={accent} isActive={isActiveSection}>
                {stageBanners[stageIdx] && <InfoBanner variant={stageBannerVariants[stageIdx]}>{stageBanners[stageIdx]}</InfoBanner>}
                {schedStage && stage.schedulingActive && <InfoBanner variant="warning">Scheduling method: <strong>{stage.schedulingMethod || 'detected'}</strong>. Gates are assigned precise execution times to minimize decoherence during idle periods.</InfoBanner>}
                {schedStage && !stage.schedulingActive && !stage.passes.length && <InfoBanner variant="warning">Scheduling was not requested for this transpilation. No timing transformations were applied.</InfoBanner>}

                {!noPasses && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                    <MetricDelta label="Gate Count" before={stage.gateCountBefore} after={stage.gateCountAfter} />
                    <MetricDelta label="Depth" before={stage.depthBefore} after={stage.depthAfter} />
                    <MetricDelta label="1Q Gates" before={stage.oneQGatesBefore} after={stage.oneQGatesAfter} />
                    <MetricDelta label="2Q Gates" before={stage.twoQGatesBefore} after={stage.twoQGatesAfter} />
                    {routingStage && (
                      <div>
                        <div style={sectionHeader}>SWAPs Inserted</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: stage.swapCount > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>{stage.swapCount}</div>
                      </div>
                    )}
                  </div>
                )}

                {noPasses && !optStage && (
                  <div style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic', backgroundColor: 'var(--color-surface-2)', borderRadius: '6px', marginBottom: '14px' }}>
                    {routingStage && stage.swapCount === 0 ? '✅ No routing required. All required two-qubit interactions are compatible with the selected hardware connectivity. SWAPs inserted: 0' : 'No passes executed in this stage.'}
                  </div>
                )}

                {/* Qubit mapping table */}
                {mappingStage && stage.mappingTable && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ ...sectionHeader, marginBottom: '8px' }}>Logical → Physical Qubit Assignment</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {Object.entries(stage.mappingTable).map(([logical, physical]) => (
                        <div key={logical} style={{ padding: '5px 12px', borderRadius: '6px', backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)', fontSize: '0.8rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{logical}</span>
                          <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                          <span style={{ fontWeight: 600 }}>Q{physical}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>The logical operation structure is preserved; only the logical-to-physical qubit assignment changes.</div>
                  </div>
                )}

                {/* Hardware topology */}
                {(mappingStage || routingStage) && trace.couplingMap && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ ...sectionHeader, marginBottom: '8px' }}>Hardware Topology</div>
                    <CouplingMapViewer couplingMap={trace.couplingMap} layoutMap={logicalLayoutMap} />
                    <div style={{ marginTop: '6px', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Highlighted nodes show which physical qubits this circuit uses. Edges show which physical qubit pairs can perform two-qubit gates.</div>
                  </div>
                )}

                {/* Stage DAG before/after (not for optimization) */}
                {!noPasses && !optStage && (stage.dagBefore || stage.dagAfter) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                    <div>
                      <div style={{ ...sectionHeader, marginBottom: '6px' }}>DAG Before Stage</div>
                      <div style={{ backgroundColor: 'var(--color-surface-2)', borderRadius: '6px', padding: '8px' }}><DagViewer dagData={stage.dagBefore} width={340} height={160} compact /></div>
                    </div>
                    <div>
                      <div style={{ ...sectionHeader, marginBottom: '6px' }}>DAG After Stage</div>
                      <div style={{ backgroundColor: 'var(--color-surface-2)', borderRadius: '6px', padding: '8px' }}>
                        {stage.gateCountBefore === stage.gateCountAfter && stage.depthBefore === stage.depthAfter
                          ? <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>DAG structure unchanged.<br />(gate count and depth unchanged)</div>
                          : <DagViewer dagData={stage.dagAfter} width={340} height={160} compact />}
                      </div>
                    </div>
                  </div>
                )}

                {/* Scheduling Gantt */}
                {schedStage && stage.schedulingActive && Object.keys(ganttData.qubitGates).length > 0 && (
                  <div>
                    <div style={{ ...sectionHeader, marginBottom: '8px' }}>Gate Scheduling Timeline</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {Object.entries(ganttData.qubitGates).map(([qubit, gates]) => (
                        <div key={qubit} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '52px', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', fontWeight: 600, flexShrink: 0 }}>{qubit}</span>
                          <div style={{ flex: 1, height: '24px', position: 'relative', backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: '3px' }}>
                            {gates.map((g, idx) => {
                              const left = (g.start / ganttData.maxDuration) * 100;
                              const width = (g.duration / ganttData.maxDuration) * 100;
                              const is2Q = ['CX','CZ','SWAP','ECR'].includes(g.name);
                              return <div key={idx} title={`${g.name}`} style={{ position: 'absolute', left: `${left}%`, width: `${Math.max(width, 2)}%`, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, fontFamily: 'var(--font-mono)', backgroundColor: is2Q ? 'var(--color-primary-dim)' : 'var(--color-surface-3)', borderLeft: `1px solid ${is2Q ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRight: `1px solid ${is2Q ? 'var(--color-primary)' : 'var(--color-border)'}`, color: is2Q ? 'var(--color-primary)' : 'var(--color-text)' }}>{g.name}</div>;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Optimization passes */}
                {optStage && stage.passes.length > 0 && <OptimizationPassesSection passes={stage.passes} stageSummary={stage} />}

                {/* Other stage pass list */}
                {!optStage && stage.passes.length > 0 && (
                  <div>
                    <div style={{ ...sectionHeader, marginBottom: '6px', marginTop: '4px' }}>Passes executed ({stage.passes.length})</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {stage.passes.map((p) => <span key={p.passName} title={p.purpose} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '10px', backgroundColor: p.circuitChanged ? 'var(--color-primary-dim)' : 'var(--color-surface-2)', border: `1px solid ${p.circuitChanged ? 'var(--color-primary)' : 'var(--color-border)'}`, color: p.circuitChanged ? 'var(--color-primary)' : 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{p.passName}</span>)}
                    </div>
                  </div>
                )}
              </SectionCard>
            );
          })}

          {/* Final Circuit */}
          <SectionCard id="tp-final" icon="✅" label="Final Transpiled Circuit" sublabel="Hardware-executable circuit after all compilation stages" accent="var(--color-success)" isActive={activeSectionIdx === 8}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
              <div>
                <div style={{ ...sectionHeader, marginBottom: '10px' }}>Final Metrics</div>
                <MetricGrid items={[
                  { label: 'Gate Count', value: trace.finalGateCount }, { label: 'Circuit Depth', value: trace.finalDepth },
                  { label: '1Q Gates', value: trace.finalOneQGates }, { label: '2Q Gates', value: trace.finalTwoQGates },
                  { label: 'SWAP Gates', value: trace.finalSwapCount }, { label: 'Scheduled', value: trace.schedulingActive ? '✅ Yes' : '— No' },
                ]} />
              </div>
              <div>
                <div style={{ ...sectionHeader, marginBottom: '10px' }}>Final DAG</div>
                <div style={{ backgroundColor: 'var(--color-surface-2)', borderRadius: '6px', padding: '8px' }}><DagViewer dagData={trace.finalDag} width={340} height={160} compact /></div>
                <DagStats dagData={trace.finalDag} />
              </div>
            </div>
            <div style={{ ...sectionHeader, marginBottom: '6px' }}>Final Circuit (QASM) — Hardware ISA</div>
            <div style={{ backgroundColor: 'var(--color-surface-3)', borderRadius: '6px', padding: '12px' }}><QasmCodeView qasm={trace.finalQasm} /></div>
          </SectionCard>

          {/* Global Summary */}
          <SectionCard id="tp-summary" icon="📊" label="Transpilation Summary" sublabel="Before vs. after comparison across the full compilation pipeline" accent="var(--color-warning)" isActive={activeSectionIdx === 9}>
            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr>{['Metric', 'Before', 'After', 'Δ Change'].map((h) => <th key={h} style={{ textAlign: h === 'Metric' ? 'left' : 'right', padding: '6px 10px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-subtle)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {[
                    { metric: 'Gate Count', before: trace.originalGateCount, after: trace.finalGateCount },
                    { metric: 'Circuit Depth', before: trace.originalDepth, after: trace.finalDepth },
                    { metric: '1Q Gates', before: trace.originalOneQGates, after: trace.finalOneQGates },
                    { metric: '2Q Gates', before: trace.originalTwoQGates, after: trace.finalTwoQGates },
                    { metric: 'SWAP Gates', before: 0, after: trace.finalSwapCount },
                  ].map(({ metric, before, after }) => {
                    const delta = after - before;
                    const isImprovement = delta < 0, isWorse = delta > 0;
                    const deltaColor = isImprovement ? 'var(--color-success)' : isWorse ? 'var(--color-warning)' : 'var(--color-text-muted)';
                    return (
                      <tr key={metric}>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', fontWeight: 500 }}>{metric}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{before}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{after}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', textAlign: 'right', fontFamily: 'var(--font-mono)', color: deltaColor, fontWeight: 600 }}>{delta === 0 ? '—' : delta > 0 ? `+${delta}` : delta}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Stage timing */}
            <div style={{ ...sectionHeader, marginBottom: '8px' }}>Stage Timing Breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {trace.stages.map((stage, idx) => {
                const pct = trace.totalExecutionTimeMs > 0 ? (stage.executionTimeMs / trace.totalExecutionTimeMs) * 100 : 0;
                return (
                  <div key={stage.stageName} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '200px', fontSize: '0.72rem', flexShrink: 0 }}>{stageIcons[idx]} {stageLabels[idx].replace(/[①②③④⑤⑥]\s/, '')}</span>
                    <div style={{ flex: 1, height: '16px', backgroundColor: 'var(--color-surface-2)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: stageAccents[idx], opacity: 0.6, borderRadius: '4px' }} />
                    </div>
                    <span style={{ width: '55px', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', textAlign: 'right', flexShrink: 0, color: 'var(--color-text-muted)' }}>{stage.executionTimeMs.toFixed(1)} ms</span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.72rem', color: 'var(--color-text-muted)', textAlign: 'right' }}>Total: {trace.totalExecutionTimeMs.toFixed(1)} ms</div>

            {/* Optimization summary */}
            {(() => {
              const optStage = trace.stages.find((s) => s.stageName === 'Optimization');
              if (!optStage || optStage.passes.length === 0) return null;
              const changed = optStage.passes.filter((p) => p.circuitChanged).length;
              return (
                <div style={{ marginTop: '14px', padding: '12px', backgroundColor: 'var(--color-surface-2)', borderRadius: '6px' }}>
                  <div style={{ ...sectionHeader, marginBottom: '8px', color: 'var(--color-success)' }}>Optimization Stage Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px' }}>
                    <MetricGrid items={[
                      { label: 'Total passes', value: optStage.passes.length },
                      { label: 'Changed circuit', value: changed },
                      { label: 'No change', value: optStage.passes.length - changed },
                      { label: 'Total time', value: `${optStage.executionTimeMs.toFixed(1)} ms` },
                    ]} />
                  </div>
                  <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                    <MetricDelta label="Gate count (opt. only)" before={optStage.gateCountBefore} after={optStage.gateCountAfter} />
                    <MetricDelta label="Depth (opt. only)" before={optStage.depthBefore} after={optStage.depthAfter} />
                    <MetricDelta label="2Q gates (opt. only)" before={optStage.twoQGatesBefore} after={optStage.twoQGatesAfter} />
                  </div>
                </div>
              );
            })()}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
