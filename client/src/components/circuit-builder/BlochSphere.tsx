import React, { useState, useRef } from 'react';

interface BlochSphereProps {
  x: number;
  y: number;
  z: number;
  label?: string;
}

export default function BlochSphere({ x, y, z, label }: BlochSphereProps) {
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.4;

  const [rotation, setRotation] = useState({ x: 15 * (Math.PI / 180), y: -30 * (Math.PI / 180) });
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    if (e.target instanceof Element) e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    setRotation(prev => {
      let newX = prev.x - dy * 0.01;
      newX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, newX));
      return { x: newX, y: prev.y + dx * 0.01 };
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    if (e.target instanceof Element) e.target.releasePointerCapture(e.pointerId);
  };

  const tilt = rotation.x;
  const pan = rotation.y;

  // Project 3D to 2D
  const project = (x3: number, y3: number, z3: number) => {
    // 1. Rotate around Z axis (pan)
    const xRot = x3 * Math.cos(pan) - y3 * Math.sin(pan);
    const yRot = x3 * Math.sin(pan) + y3 * Math.cos(pan);
    const zRot = z3;

    // 2. Rotate around X axis (tilt)
    const yTilt = yRot * Math.cos(tilt) - zRot * Math.sin(tilt);
    const zTilt = yRot * Math.sin(tilt) + zRot * Math.cos(tilt);

    // Screen Y goes down, so we subtract zTilt.
    return {
      x2d: cx + xRot * R,
      y2d: cy - zTilt * R,
      z: yTilt 
    };
  };

  // Axes
  const axes = [
    { name: 'x', p1: project(-1, 0, 0), p2: project(1, 0, 0) },
    { name: 'y', p1: project(0, -1, 0), p2: project(0, 1, 0) },
    { name: 'z', p1: project(0, 0, -1), p2: project(0, 0, 1) },
  ];

  // State vector
  const vec = project(x, y, z);
  const probColor = 'hsl(280, 80%, 65%)'; // Bright purple

  return (
    <div className="bloch-sphere-container">
      {label && <div className="bloch-sphere-label">{label}</div>}
      <svg
        width={size}
        height={size}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        {/* Sphere background */}
        <circle cx={cx} cy={cy} r={R} fill="rgba(255, 255, 255, 0.03)" stroke="var(--border)" strokeWidth="1" />
        
        {/* Equator (approximate with an ellipse based on tilt) */}
        <ellipse 
          cx={cx} 
          cy={cy} 
          rx={R} 
          ry={Math.abs(R * Math.sin(tilt))} 
          fill="none" 
          stroke="var(--border)" 
          strokeWidth="1" 
          strokeDasharray="4 4"
        />

        {/* Axes */}
        {axes.map(axis => (
          <g key={axis.name}>
            <line x1={axis.p1.x2d} y1={axis.p1.y2d} x2={axis.p2.x2d} y2={axis.p2.y2d} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
            <text x={axis.p2.x2d + 5} y={axis.p2.y2d} fill="rgba(255,255,255,0.5)" fontSize="10">{axis.name === 'z' ? '|0⟩' : axis.name}</text>
            {axis.name === 'z' && <text x={axis.p1.x2d + 5} y={axis.p1.y2d + 10} fill="rgba(255,255,255,0.5)" fontSize="10">|1⟩</text>}
          </g>
        ))}

        {/* State Vector Arrow */}
        <line x1={cx} y1={cy} x2={vec.x2d} y2={vec.y2d} stroke={probColor} strokeWidth="2.5" markerEnd="url(#arrowhead)" />
        
        {/* Vector point */}
        <circle cx={vec.x2d} cy={vec.y2d} r={4} fill={probColor} />

        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <polygon points="0 0, 6 3, 0 6" fill={probColor} />
          </marker>
        </defs>
      </svg>
    </div>
  );
}
