import React, { useMemo } from 'react';
import BlochSphere from './BlochSphere';

interface MultiBlochPanelProps {
  amplitudes: Record<string, { re: number; im: number }>;
  qubitCount: number;
}

export default function MultiBlochPanel({ amplitudes, qubitCount }: MultiBlochPanelProps) {
  const blochVectors = useMemo(() => {
    const vectors: { x: number; y: number; z: number }[] = [];
    const states = Object.keys(amplitudes);

    for (let q = 0; q < qubitCount; q++) {
      // Assuming little-endian bitstring convention (like Qiskit),
      // Qubit 0 corresponds to the right-most bit of the string.
      const charIndex = qubitCount - 1 - q;
      
      let p00 = 0, p11 = 0;
      let p01Re = 0, p01Im = 0;

      for (const s of states) {
        if (charIndex >= 0 && charIndex < s.length) {
          if (s[charIndex] === '0') {
            const a = amplitudes[s];
            p00 += a.re * a.re + a.im * a.im;

            const s1 = s.substring(0, charIndex) + '1' + s.substring(charIndex + 1);
            if (amplitudes[s1]) {
              const b = amplitudes[s1];
              // rho_01 = a * b* = (a.re + i a.im)(b.re - i b.im)
              // = (a.re * b.re + a.im * b.im) + i (a.im * b.re - a.re * b.im)
              p01Re += a.re * b.re + a.im * b.im;
              p01Im += a.im * b.re - a.re * b.im;
            }
          } else {
            const a = amplitudes[s];
            p11 += a.re * a.re + a.im * a.im;
          }
        }
      }

      // Tr(Y * rho) = -2 * Im(rho_01)
      vectors.push({
        x: 2 * p01Re,
        y: -2 * p01Im,
        z: p00 - p11
      });
    }

    return vectors;
  }, [amplitudes, qubitCount]);

  if (qubitCount === 0) return null;

  return (
    <div className="multi-bloch-panel">
      {blochVectors.map((v, i) => (
        <BlochSphere key={i} x={v.x} y={v.y} z={v.z} label={`Qubit ${i}`} />
      ))}
    </div>
  );
}
