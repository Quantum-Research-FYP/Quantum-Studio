import { useMemo, useState } from 'react';
import type { Outcome } from '../../api/simulations';

const DEFAULT_MAX_DISPLAY = 20;

interface ProbabilityBarChartProps {
  outcomes: Outcome[];
  maxDisplay?: number;
  id?: string;
  compact?: boolean;
}

export default function ProbabilityBarChart({
  outcomes,
  maxDisplay = DEFAULT_MAX_DISPLAY,
  id = 'probability-bar-chart',
  compact = false,
}: ProbabilityBarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { displayed, truncated, totalCount } = useMemo(() => {
    const sorted = [...outcomes].sort((a, b) => b.probability - a.probability);
    const total = sorted.length;
    if (total <= maxDisplay) {
      return { displayed: sorted, truncated: false, totalCount: total };
    }
    return {
      displayed: sorted.slice(0, maxDisplay),
      truncated: true,
      totalCount: total,
    };
  }, [outcomes, maxDisplay]);

  const maxProb = useMemo(() => {
    const max = Math.max(...displayed.map((o) => o.probability), 0);
    return Math.min(max * 1.1, 1.0); 
  }, [displayed]);

  const CHART_HEIGHT = compact ? 220 : 380;
  const CHART_WIDTH = 800;
  const PADDING = compact 
    ? { top: 20, right: 10, bottom: 40, left: 40 }
    : { top: 40, right: 20, bottom: 60, left: 60 };

  const drawAreaWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const drawAreaHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const barCount = displayed.length;
  const maxBarWidth = 48;
  const gapRatio = 0.25; 
  
  const availableWidthPerBar = drawAreaWidth / Math.max(barCount, 1);
  const barWidth = Math.min(availableWidthPerBar * (1 - gapRatio), maxBarWidth);
  const totalBarSpace = barCount * availableWidthPerBar;
  
  const startX = PADDING.left + (drawAreaWidth - totalBarSpace) / 2;

  const yGridTicks = [0, 0.25, 0.5, 0.75, 1.0];

  const descText = `Vertical bar chart showing measurement probabilities for ${totalCount} outcome${totalCount !== 1 ? 's' : ''}. Sorted by probability descending.${truncated ? ` Showing top ${maxDisplay} of ${totalCount}.` : ''}`;

  return (
    <div className="premium-chart-wrapper" style={{ position: 'relative', width: '100%', maxWidth: '900px', margin: '0 auto' }}>
      <svg
        id={id}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        className="premium-probability-chart"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        width="100%"
        height="auto"
        style={{ overflow: 'visible', display: 'block' }}
      >
        <title id={`${id}-title`}>Measurement Probability Distribution</title>
        <desc id={`${id}-desc`}>{descText}</desc>
        
        <defs>
          <linearGradient id="bar-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 0.9)" />
            <stop offset="100%" stopColor="rgba(34, 211, 238, 0.2)" />
          </linearGradient>
          <linearGradient id="bar-gradient-hover" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 1)" />
            <stop offset="100%" stopColor="rgba(34, 211, 238, 0.5)" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Grid lines & Y-axis */}
        <g className="chart-grid">
          {yGridTicks.map((tick, i) => {
            if (tick > maxProb && tick !== 1 && tick !== maxProb) return null;
            const y = PADDING.top + drawAreaHeight - (tick / maxProb) * drawAreaHeight;
            return (
              <g key={`grid-${i}`}>
                <line 
                  x1={PADDING.left - 10} 
                  y1={y} 
                  x2={CHART_WIDTH - PADDING.right} 
                  y2={y} 
                  stroke="var(--color-border)" 
                  strokeWidth="1"
                  strokeDasharray={tick === 0 ? "0" : "4 4"}
                />
                <text 
                  x={PADDING.left - 16} 
                  y={y} 
                  textAnchor="end" 
                  dominantBaseline="middle" 
                  fill="var(--color-text-subtle)"
                  fontSize={compact ? "10px" : "12px"}
                  fontFamily="var(--font-mono, monospace)"
                >
                  {tick.toFixed(2)}
                </text>
              </g>
            );
          })}
        </g>

        {/* Bars & X-axis labels */}
        <g className="chart-bars">
          {displayed.map((outcome, i) => {
            const barHeight = maxProb > 0 ? (outcome.probability / maxProb) * drawAreaHeight : 0;
            const x = startX + i * availableWidthPerBar + (availableWidthPerBar - barWidth) / 2;
            const y = PADDING.top + drawAreaHeight - barHeight;
            const isHovered = hoveredIndex === i;

            return (
              <g 
                key={outcome.bitstring} 
                role="listitem"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Invisible hover target */}
                <rect 
                  x={x - availableWidthPerBar * 0.1}
                  y={PADDING.top}
                  width={barWidth + availableWidthPerBar * 0.2}
                  height={drawAreaHeight}
                  fill="transparent"
                />

                {/* The Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={isHovered ? "url(#bar-gradient-hover)" : "url(#bar-gradient)"}
                  rx={compact ? 3 : 6}
                  style={{
                    filter: isHovered ? 'url(#glow)' : 'none',
                    transition: 'all 0.2s ease-out'
                  }}
                />

                {/* X-axis Label (Bitstring) */}
                <text
                  x={x + barWidth / 2}
                  y={PADDING.top + drawAreaHeight + (compact ? 16 : 24)}
                  textAnchor={barWidth < 30 ? "end" : "middle"}
                  fill={isHovered ? "var(--color-text)" : "var(--color-text-muted)"}
                  fontSize={barWidth < 30 ? (compact ? "9px" : "11px") : (compact ? "10px" : "12px")}
                  fontFamily="var(--font-mono, monospace)"
                  fontWeight={isHovered ? "600" : "400"}
                  style={{ transition: 'all 0.2s ease' }}
                  transform={barWidth < 30 ? `rotate(-45, ${x + barWidth / 2}, ${PADDING.top + drawAreaHeight + (compact ? 16 : 24)})` : ''}
                >
                  {outcome.bitstring}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      
      {/* Tooltip via HTML for better styling */}
      {hoveredIndex !== null && displayed[hoveredIndex] && (
        <div 
          className="chart-tooltip"
          style={{
            position: 'absolute',
            top: `${PADDING.top - (compact ? 10 : 20)}px`,
            left: `${startX + hoveredIndex * availableWidthPerBar + availableWidthPerBar / 2}px`,
            transform: 'translate(-50%, -100%)',
            background: 'var(--color-surface)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: compact ? '8px 12px' : '12px 16px',
            color: 'var(--color-text)',
            fontSize: compact ? '11px' : '13px',
            pointerEvents: 'none',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 10,
            whiteSpace: 'nowrap',
            minWidth: compact ? '140px' : '160px'
          }}
        >
          <div style={{ color: 'var(--color-text-muted)', fontSize: compact ? '10px' : '11px', marginBottom: compact ? '4px' : '8px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            State |{displayed[hoveredIndex].bitstring}⟩
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '24px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Probability</span>
            <span style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>
              {(displayed[hoveredIndex].probability * 100).toFixed(2)}%
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '24px' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Count</span>
            <span style={{ fontWeight: 'bold', color: 'var(--color-text)' }}>
              {displayed[hoveredIndex].count.toLocaleString()}
            </span>
          </div>
        </div>
      )}
      
      {truncated && (
        <div 
          style={{ 
            textAlign: 'center', 
            marginTop: compact ? '8px' : '16px',
            color: 'var(--color-text-subtle)',
            fontSize: compact ? '11px' : '13px',
            fontStyle: 'italic'
          }}
        >
          Showing top {maxDisplay} of {totalCount} outcomes
        </div>
      )}
    </div>
  );
}
