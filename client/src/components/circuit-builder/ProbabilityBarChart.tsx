import { useMemo, useRef } from 'react';

interface ProbabilityBarChartProps {
  amplitudes: Record<string, { re: number; im: number }>;
}

export default function ProbabilityBarChart({ amplitudes }: ProbabilityBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const states = useMemo(() => {
    return Object.entries(amplitudes)
      .map(([state, complex]) => {
        const prob = complex.re * complex.re + complex.im * complex.im;
        let phase = Math.atan2(complex.im, complex.re);
        if (prob < 1e-6) phase = 0;
        return { state, prob, phase };
      })
      .sort((a, b) => a.state.localeCompare(b.state));
  }, [amplitudes]);

  // Map phase [-PI, PI] to a hue [0, 360]
  // 0 -> Blue, PI/2 -> Purple, PI -> Red, -PI/2 -> Green
  const getPhaseColor = (phase: number) => {
    const hue = ((phase / Math.PI) * 180 + 360) % 360;
    // We use a cyan-to-purple-to-red color map similar to IBM Q
    return `hsl(${hue}, 70%, 50%)`;
  };

  if (states.length === 0) {
    return (
      <div className="prob-barchart">
        <div className="prob-barchart__header">
          <span className="prob-barchart__title">
            Probabilities
            <button
              className="info-btn"
              data-tooltip="Shows the measurement probability for each computational basis state."
              aria-label="Info"
            >
              !
            </button>
          </span>
        </div>
        <div className="prob-barchart__empty">No state data available.</div>
      </div>
    );
  }

  // Find max probability to scale the chart if necessary.
  // Standard probability charts often fix max Y at 1.0 (100%), but if max prob is very small, we might want to scale.
  // IBM Q typically uses a fixed 0-100% scale for probabilities.
  const yAxisTicks = [100, 80, 60, 40, 20, 0];

  return (
    <div className="prob-barchart" ref={containerRef}>
      <div className="prob-barchart__header">
        <span className="prob-barchart__title">
          Probabilities
          <button
            className="info-btn"
            data-tooltip="Shows the measurement probability for each computational basis state."
            aria-label="Info"
          >
            !
          </button>
        </span>
      </div>

      <div className="prob-barchart__layout">
        {/* Y Axis */}
        <div className="prob-barchart__y-axis">
          {yAxisTicks.map((tick) => (
            <div key={tick} className="prob-barchart__y-tick">
              <span>{tick}</span>
            </div>
          ))}
          <div className="prob-barchart__y-label">Probability (%)</div>
        </div>

        {/* Chart Area */}
        <div className="prob-barchart__chart-area">
          {/* Horizontal Grid Lines */}
          <div className="prob-barchart__grid">
            {yAxisTicks.map((tick) => (
              <div
                key={`grid-${tick}`}
                className="prob-barchart__grid-line"
                style={{ bottom: `${tick}%` }}
              />
            ))}
          </div>

          {/* Bars */}
          <div className="prob-barchart__bars-container">
            {states.map(({ state, prob, phase }) => (
              <div
                key={state}
                className="prob-barchart__bar-group"
                title={`|${state}⟩: ${(prob * 100).toFixed(2)}%\nPhase: ${((phase * 180) / Math.PI).toFixed(1)}°`}
              >
                <div className="prob-barchart__bar-wrapper">
                  <div
                    className="prob-barchart__bar"
                    style={{
                      height: `${prob * 100}%`,
                      backgroundColor: prob > 1e-6 ? getPhaseColor(phase) : 'transparent',
                    }}
                  />
                </div>
                <div className="prob-barchart__x-label">
                  <span className="prob-barchart__x-label-text">{state}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="prob-barchart__footer">
        <div className="prob-barchart__x-axis-title">Computational basis states</div>
      </div>
    </div>
  );
}
