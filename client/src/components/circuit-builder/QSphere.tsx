import React, { useMemo, useState, useRef } from 'react';

interface QSphereProps {
  amplitudes: Record<string, { re: number; im: number }>;
  qubitCount: number;
}

export default function QSphere({ amplitudes, qubitCount }: QSphereProps) {
  // Dimensions
  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.35; // Radius of the sphere

  const [rotation, setRotation] = useState({ x: 15 * (Math.PI / 180), y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    if (e.target instanceof Element) {
      e.target.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    setRotation((prev) => {
      let newX = prev.x - dy * 0.01;
      newX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, newX));
      return { x: newX, y: prev.y + dx * 0.01 };
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    if (e.target instanceof Element) {
      e.target.releasePointerCapture(e.pointerId);
    }
  };

  const tilt = rotation.x;

  // Map phase [-PI, PI] to a hue [0, 360]
  const getPhaseColor = (phase: number) => {
    const hue = ((phase / Math.PI) * 180 + 360) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  };

  // Helper to count 1s in binary string
  const hammingWeight = (str: string) => {
    let count = 0;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '1') count++;
    }
    return count;
  };

  const nodes = useMemo(() => {
    const states = Object.keys(amplitudes).sort();
    if (states.length === 0) return [];

    // Group states by Hamming weight
    const groups: Record<number, string[]> = {};
    states.forEach((state) => {
      const w = hammingWeight(state);
      if (!groups[w]) groups[w] = [];
      groups[w].push(state);
    });

    const result: Array<{
      state: string;
      x: number;
      y: number;
      isBack: boolean;
      prob: number;
      phase: number;
      color: string;
      r: number;
      cx: number;
      cy: number;
    }> = [];
    const n = qubitCount === 0 ? 1 : qubitCount; // prevent division by zero

    for (const [wStr, groupStates] of Object.entries(groups)) {
      const w = parseInt(wStr, 10);
      // Latitude angle (0 at North pole, PI at South pole)
      const theta = Math.PI * (w / n);

      const k = groupStates.length;
      groupStates.forEach((state, i) => {
        // Longitude angle
        const phi = (2 * Math.PI * i) / k + rotation.y;

        // 3D coordinates
        const x3d = R * Math.sin(theta) * Math.cos(phi);
        const y3d = R * Math.sin(theta) * Math.sin(phi);
        const z3d = R * Math.cos(theta);

        // 2D Projection with tilt
        const x2d = cx + x3d;
        // Screen Y goes down, so we subtract Z. Add tilt to Y.
        const y2d = cy - z3d * Math.cos(tilt) + y3d * Math.sin(tilt);

        // Is it on the front or back of the sphere?
        // Front means y3d > 0 (if we consider standard orientation)
        // With tilt, visibility depends on depth.
        // Let depth = z-axis going into screen.
        const depth = y3d * Math.cos(tilt) + z3d * Math.sin(tilt);
        const isBack = depth < 0;

        const complex = amplitudes[state];
        const prob = complex.re * complex.re + complex.im * complex.im;
        let phase = Math.atan2(complex.im, complex.re);
        if (prob < 1e-6) phase = 0;

        // Node radius depends on probability.
        // Area ~ prob => radius ~ sqrt(prob).
        // Let max radius be 12.
        const maxNodeR = 12;
        const nodeR = Math.max(2, maxNodeR * Math.sqrt(prob));

        result.push({
          state,
          x: x2d,
          y: y2d,
          isBack,
          prob,
          phase,
          color: getPhaseColor(phase),
          r: nodeR,
          cx,
          cy,
        });
      });
    }

    // Sort by depth so back nodes are drawn first
    return result.sort((a, b) => (a.isBack === b.isBack ? 0 : a.isBack ? -1 : 1));
  }, [amplitudes, qubitCount, R, cx, cy, tilt, rotation.y]);

  if (qubitCount === 0 || nodes.length === 0) {
    return (
      <div className="qsphere">
        <div className="qsphere__header">
          <span className="qsphere__title">Q-Sphere</span>
        </div>
        <div className="qsphere__empty">No state data available.</div>
      </div>
    );
  }

  return (
    <div className="qsphere">
      <div className="qsphere__header">
        <span className="qsphere__title">
          Q-Sphere
          <button
            className="info-btn"
            data-tooltip="Visualizes the multi-qubit quantum state where the radius indicates probability and color represents the phase."
            aria-label="Info"
          >
            !
          </button>
        </span>
      </div>
      <div className="qsphere__canvas-wrapper">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="qsphere__svg"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          <defs>
            <radialGradient id="sphereGrad" cx="30%" cy="30%" r="70%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.02)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.4)" />
            </radialGradient>
            <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.8" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Background Sphere */}
          <circle
            cx={cx}
            cy={cy}
            r={R}
            fill="url(#sphereGrad)"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />

          {/* Equator / Latitude Rings */}
          {Array.from({ length: qubitCount - 1 }).map((_, i) => {
            const w = i + 1;
            const theta = Math.PI * (w / qubitCount);
            // Radius of this latitude ring
            const rRing = R * Math.sin(theta);
            // Y offset of the center of this ring
            const zRing = R * Math.cos(theta);
            // Projected Y center
            const yCenter = cy - zRing * Math.cos(tilt);
            // The height of the ellipse is 2 * rRing * sin(tilt)
            const ry = rRing * Math.abs(Math.sin(tilt));
            return (
              <ellipse
                key={i}
                cx={cx}
                cy={yCenter}
                rx={rRing}
                ry={ry}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
            );
          })}

          {/* Lines from center to nodes */}
          {nodes.map((n) => {
            if (n.prob < 1e-4) return null; // don't draw lines for zero prob
            return (
              <line
                key={`line-${n.state}`}
                x1={cx}
                y1={cy}
                x2={n.x}
                y2={n.y}
                stroke={n.color}
                strokeWidth="1.5"
                opacity={n.isBack ? 0.2 : 0.6}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((n) => {
            if (n.prob < 1e-4) return null;
            return (
              <g key={`node-${n.state}`} className="qsphere__node" style={{ color: n.color }}>
                {/* Glow effect */}
                <circle cx={n.x} cy={n.y} r={n.r * 2.5} fill="url(#nodeGlow)" />
                {/* Core */}
                <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} stroke="#000" strokeWidth="1" />

                {/* Label if it's on front or high probability */}
                {(!n.isBack || n.prob > 0.1) &&
                  (() => {
                    const labelText = `|${n.state}⟩`;
                    const charWidth = 6.5; // Approx width for 10px monospace
                    const boxWidth = labelText.length * charWidth + 8;
                    const boxHeight = 16;
                    const boxX = n.x - boxWidth / 2;
                    const boxY = n.y - n.r - boxHeight - 2;

                    return (
                      <g className="qsphere__label-group">
                        <rect
                          x={boxX}
                          y={boxY}
                          width={boxWidth}
                          height={boxHeight}
                          rx={3}
                          fill="rgba(25, 30, 40, 0.9)"
                        />
                        <text
                          x={n.x}
                          y={n.y - n.r - 6}
                          fill="#fff"
                          fontSize="10"
                          textAnchor="middle"
                          className="qsphere__label"
                        >
                          {labelText}
                        </text>
                      </g>
                    );
                  })()}
              </g>
            );
          })}
        </svg>

        {/* Phase Legend */}
        <div className="qsphere__legend">
          <div className="qsphere__legend-title">Phase</div>
          <div className="qsphere__phase-wheel" />
          <div className="qsphere__legend-labels">
            <span>0</span>
            <span>π</span>
            <span>2π</span>
          </div>
        </div>
      </div>
    </div>
  );
}
