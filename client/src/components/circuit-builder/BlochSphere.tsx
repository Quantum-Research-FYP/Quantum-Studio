import { useSphereRotation } from './useSphereRotation';

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

  const { rotation, isDragging, pointerHandlers } = useSphereRotation({
    x: 15 * (Math.PI / 180),
    y: -30 * (Math.PI / 180),
  });

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
      z: yTilt,
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
        {...pointerHandlers}
        aria-label={`${label || 'Qubit'} Bloch sphere. Drag to rotate.`}
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        {/* Sphere background */}
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill="transparent"
          stroke="var(--color-border-strong)"
          strokeWidth="1"
        />

        {/* Equator (approximate with an ellipse based on tilt) */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={R}
          ry={Math.abs(R * Math.sin(tilt))}
          fill="none"
          stroke="var(--color-border-strong)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Axes */}
        {axes.map((axis) => (
          <g key={axis.name}>
            <line
              x1={axis.p1.x2d}
              y1={axis.p1.y2d}
              x2={axis.p2.x2d}
              y2={axis.p2.y2d}
              stroke="var(--color-border-strong)"
              strokeWidth="1"
            />
            <text x={axis.p2.x2d + 5} y={axis.p2.y2d} fill="var(--color-text-muted)" fontSize="10">
              {axis.name === 'z' ? '|0⟩' : axis.name}
            </text>
            {axis.name === 'z' && (
              <text
                x={axis.p1.x2d + 5}
                y={axis.p1.y2d + 10}
                fill="var(--color-text-muted)"
                fontSize="10"
              >
                |1⟩
              </text>
            )}
          </g>
        ))}

        {/* State Vector Arrow */}
        <line
          x1={cx}
          y1={cy}
          x2={vec.x2d}
          y2={vec.y2d}
          stroke={probColor}
          strokeWidth="2.5"
          style={{ transition: isDragging ? 'none' : 'all 0.25s ease-out' }}
        />

        {/* State Vector Arrowhead */}
        <polygon 
          points="-6,-3 0,0 -6,3" 
          fill={probColor}
          style={{ 
            transition: isDragging ? 'none' : 'all 0.25s ease-out',
            transform: `translate(${vec.x2d}px, ${vec.y2d}px) rotate(${Math.atan2(vec.y2d - cy, vec.x2d - cx) * (180 / Math.PI)}deg)`
          }}
        />

        {/* Vector point */}
        <circle 
          cx={vec.x2d} 
          cy={vec.y2d} 
          r={4} 
          fill={probColor} 
          style={{ transition: isDragging ? 'none' : 'all 0.25s ease-out' }}
        />
      </svg>
    </div>
  );
}
