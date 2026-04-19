import { useMemo } from 'react';
import type { Outcome } from '../../api/simulations';

const DEFAULT_MAX_DISPLAY = 20;
const BAR_HEIGHT = 28;
const BAR_GAP = 6;
const LABEL_WIDTH = 100;
const VALUE_WIDTH = 70;
const CHART_PADDING = 16;
const MIN_CHART_WIDTH = 800;

interface ProbabilityBarChartProps {
  outcomes: Outcome[];
  maxDisplay?: number;
  /** id used to link the SVG to an external accessible description */
  id?: string;
}

export default function ProbabilityBarChart({
  outcomes,
  maxDisplay = DEFAULT_MAX_DISPLAY,
  id = 'probability-bar-chart',
}: ProbabilityBarChartProps) {
  const { displayed, truncated, totalCount } = useMemo(() => {
    const total = outcomes.length;
    if (total <= maxDisplay) {
      return { displayed: outcomes, truncated: false, totalCount: total };
    }
    return {
      displayed: outcomes.slice(0, maxDisplay),
      truncated: true,
      totalCount: total,
    };
  }, [outcomes, maxDisplay]);

  const maxProb = useMemo(
    () => Math.max(...displayed.map((o) => o.probability), 0),
    [displayed],
  );

  const barAreaWidth = MIN_CHART_WIDTH - LABEL_WIDTH - VALUE_WIDTH - CHART_PADDING * 2;
  const svgHeight =
    CHART_PADDING * 2 +
    displayed.length * (BAR_HEIGHT + BAR_GAP) -
    BAR_GAP +
    (truncated ? 30 : 0);

  const descText = `Bar chart showing measurement probabilities for ${totalCount} outcome${totalCount !== 1 ? 's' : ''}. Sorted by probability descending.${truncated ? ` Showing top ${maxDisplay} of ${totalCount}.` : ''}`;

  return (
    <svg
      id={id}
      role="img"
      aria-labelledby={`${id}-title ${id}-desc`}
      className="probability-bar-chart"
      viewBox={`0 0 ${MIN_CHART_WIDTH} ${svgHeight}`}
      width={MIN_CHART_WIDTH}
      style={{ maxWidth: '100%', height: 'auto' }}
    >
      <title id={`${id}-title`}>Measurement Probability Distribution</title>
      <desc id={`${id}-desc`}>{descText}</desc>

      {displayed.map((outcome, i) => {
        const y = CHART_PADDING + i * (BAR_HEIGHT + BAR_GAP);
        const barWidth = maxProb > 0 ? (outcome.probability / maxProb) * barAreaWidth : 0;

        return (
          <g key={outcome.bitstring} role="listitem">
            {/* Bitstring label */}
            <text
              x={LABEL_WIDTH - 8}
              y={y + BAR_HEIGHT / 2}
              textAnchor="end"
              dominantBaseline="central"
              className="probability-bar-chart__label"
            >
              {outcome.bitstring}
            </text>

            {/* Bar background */}
            <rect
              x={LABEL_WIDTH}
              y={y}
              width={barAreaWidth}
              height={BAR_HEIGHT}
              className="probability-bar-chart__bg"
              rx={4}
            />

            {/* Filled bar */}
            <rect
              x={LABEL_WIDTH}
              y={y}
              width={Math.max(barWidth, 0)}
              height={BAR_HEIGHT}
              className="probability-bar-chart__bar"
              rx={4}
            />

            {/* Probability value */}
            <text
              x={LABEL_WIDTH + barAreaWidth + 8}
              y={y + BAR_HEIGHT / 2}
              dominantBaseline="central"
              className="probability-bar-chart__value"
            >
              {outcome.probability.toFixed(4)}
            </text>
          </g>
        );
      })}

      {truncated && (
        <text
          x={MIN_CHART_WIDTH / 2}
          y={svgHeight - CHART_PADDING + 4}
          textAnchor="middle"
          className="probability-bar-chart__truncation"
        >
          Showing top {maxDisplay} of {totalCount} outcomes
        </text>
      )}
    </svg>
  );
}
