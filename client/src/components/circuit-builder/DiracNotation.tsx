import { useMemo, useRef, useEffect } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { GateType, Operation } from '../../circuit/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DiracNotationProps {
  amplitudes: Record<string, { re: number; im: number }>;
  /** Operations active at the current step (time column). */
  currentOperations: Operation[];
  /** The step index (0 = initial |0…0⟩, 1 = after first column, etc.) */
  currentStep: number;
}

// ---------------------------------------------------------------------------
// Gate matrix definitions (LaTeX)
// ---------------------------------------------------------------------------

const GATE_MATRICES: Partial<Record<GateType, string>> = {
  H:    '\\frac{1}{\\sqrt{2}}\\begin{pmatrix} 1 & 1 \\\\ 1 & -1 \\end{pmatrix}',
  X:    '\\begin{pmatrix} 0 & 1 \\\\ 1 & 0 \\end{pmatrix}',
  Y:    '\\begin{pmatrix} 0 & -i \\\\ i & 0 \\end{pmatrix}',
  Z:    '\\begin{pmatrix} 1 & 0 \\\\ 0 & -1 \\end{pmatrix}',
  S:    '\\begin{pmatrix} 1 & 0 \\\\ 0 & i \\end{pmatrix}',
  SDG:  '\\begin{pmatrix} 1 & 0 \\\\ 0 & -i \\end{pmatrix}',
  T:    '\\begin{pmatrix} 1 & 0 \\\\ 0 & e^{i\\pi/4} \\end{pmatrix}',
  TDG:  '\\begin{pmatrix} 1 & 0 \\\\ 0 & e^{-i\\pi/4} \\end{pmatrix}',
  SX:   '\\frac{1}{2}\\begin{pmatrix} 1+i & 1-i \\\\ 1-i & 1+i \\end{pmatrix}',
  ID:   '\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}',
  CX:   '\\begin{pmatrix} 1&0&0&0 \\\\ 0&1&0&0 \\\\ 0&0&0&1 \\\\ 0&0&1&0 \\end{pmatrix}',
  CZ:   '\\begin{pmatrix} 1&0&0&0 \\\\ 0&1&0&0 \\\\ 0&0&1&0 \\\\ 0&0&0&-1 \\end{pmatrix}',
  SWAP: '\\begin{pmatrix} 1&0&0&0 \\\\ 0&0&1&0 \\\\ 0&1&0&0 \\\\ 0&0&0&1 \\end{pmatrix}',
  CCX:  '\\text{Toffoli}_{8\\times8}',
};

const GATE_NAMES: Partial<Record<GateType, string>> = {
  H: 'Hadamard', X: 'Pauli\\text{-}X', Y: 'Pauli\\text{-}Y', Z: 'Pauli\\text{-}Z',
  S: 'S\\text{-Phase}', SDG: 'S^{\\dagger}', T: 'T\\text{-Gate}', TDG: 'T^{\\dagger}',
  SX: '\\sqrt{X}', SXDG: '\\sqrt{X}^{\\dagger}', ID: 'Identity',
  CX: 'CNOT', CZ: 'CZ', CY: 'CY', CH: 'CH', SWAP: 'SWAP',
  CRX: 'CR_X', CRY: 'CR_Y', CRZ: 'CR_Z', CP: 'CPhase',
  CCX: 'Toffoli', CSWAP: 'Fredkin',
  RX: 'R_X', RY: 'R_Y', RZ: 'R_Z', P: 'Phase', U: 'U',
  MEASURE: 'Measure',
};

// ---------------------------------------------------------------------------
// Helpers — recognise common amplitudes for clean LaTeX output
// ---------------------------------------------------------------------------

/** Attempt to express a real number as a recognisable fraction string. */
function recogniseFraction(value: number): string | null {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  const TOLERANCE = 1e-6;

  // 0
  if (abs < TOLERANCE) return '0';
  // 1
  if (Math.abs(abs - 1) < TOLERANCE) return `${sign}1`;
  // 1/√2 ≈ 0.7071
  if (Math.abs(abs - Math.SQRT1_2) < TOLERANCE) return `${sign}\\frac{1}{\\sqrt{2}}`;
  // 1/2
  if (Math.abs(abs - 0.5) < TOLERANCE) return `${sign}\\frac{1}{2}`;
  // √3/2 ≈ 0.8660
  if (Math.abs(abs - Math.sqrt(3) / 2) < TOLERANCE) return `${sign}\\frac{\\sqrt{3}}{2}`;
  // 1/√3 ≈ 0.5774
  if (Math.abs(abs - 1 / Math.sqrt(3)) < TOLERANCE) return `${sign}\\frac{1}{\\sqrt{3}}`;
  // 1/2√2 ≈ 0.3536
  if (Math.abs(abs - 1 / (2 * Math.SQRT2)) < TOLERANCE) return `${sign}\\frac{1}{2\\sqrt{2}}`;
  // 1/√8 = 1/(2√2) already covered; try 1/√4 = 1/2 already covered
  // For 3+ qubit GHZ: 1/√(2^n)
  for (let n = 3; n <= 8; n++) {
    if (Math.abs(abs - 1 / Math.sqrt(2 ** n)) < TOLERANCE) {
      return `${sign}\\frac{1}{\\sqrt{${2 ** n}}}`;
    }
  }

  return null;
}

/** Format a complex amplitude {re, im} as a LaTeX string. */
function formatAmplitude(re: number, im: number): string {
  const prob = re * re + im * im;
  if (prob < 1e-10) return '0';

  const reStr = recogniseFraction(re);
  const imStr = recogniseFraction(im);

  // Pure real
  if (Math.abs(im) < 1e-8) {
    return reStr ?? re.toFixed(4);
  }
  // Pure imaginary
  if (Math.abs(re) < 1e-8) {
    const coeff = imStr ?? im.toFixed(4);
    if (coeff === '1') return 'i';
    if (coeff === '-1') return '-i';
    return `${coeff}\\,i`;
  }

  // Complex
  const realPart = reStr ?? re.toFixed(4);
  const imagCoeff = imStr ?? im.toFixed(4);
  const imagSign = im > 0 ? '+' : '';
  if (imagCoeff === '1') return `${realPart}${imagSign}i`;
  if (imagCoeff === '-1') return `${realPart}-i`;
  return `${realPart}${imagSign}${imagCoeff}\\,i`;
}

// ---------------------------------------------------------------------------
// KaTeX rendering helper
// ---------------------------------------------------------------------------

function KatexBlock({ latex, displayMode = true }: { latex: string; displayMode?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      try {
        katex.render(latex, ref.current, {
          displayMode,
          throwOnError: false,
          trust: true,
        });
      } catch {
        ref.current.textContent = latex;
      }
    }
  }, [latex, displayMode]);

  return <div ref={ref} className="dirac-notation__katex" />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DiracNotation({
  amplitudes,
  currentOperations,
  currentStep,
}: DiracNotationProps) {
  // Build the Dirac notation LaTeX string from the amplitudes
  const stateLatex = useMemo(() => {
    const entries = Object.entries(amplitudes)
      .filter(([, c]) => c.re * c.re + c.im * c.im > 1e-10)
      .sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) {
      return '|\\psi\\rangle = |0\\rangle';
    }

    // Check if this is the initial all-zeros state
    if (entries.length === 1) {
      const [state, c] = entries[0];
      if (Math.abs(c.re - 1) < 1e-6 && Math.abs(c.im) < 1e-6) {
        return `|\\psi\\rangle = |${state}\\rangle`;
      }
    }

    const terms: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const [state, c] = entries[i];
      const amp = formatAmplitude(c.re, c.im);

      if (amp === '0') continue;

      let term: string;
      if (amp === '1') {
        term = `|${state}\\rangle`;
      } else if (amp === '-1') {
        term = `-|${state}\\rangle`;
      } else if (amp.startsWith('-')) {
        // Negative amplitude — the minus is part of the coefficient
        term = `${amp}\\,|${state}\\rangle`;
      } else {
        term = `${amp}\\,|${state}\\rangle`;
      }

      // Add + sign between terms (skip for first term or negative leading terms)
      if (i > 0 && terms.length > 0 && !term.startsWith('-')) {
        terms.push('+');
      }

      terms.push(term);
    }

    return `|\\psi\\rangle = ${terms.join(' ')}`;
  }, [amplitudes]);

  // Build gate info LaTeX (which gates are applied at this step)
  const gateInfoLatex = useMemo(() => {
    if (currentStep === 0 || currentOperations.length === 0) {
      return null;
    }

    const parts: string[] = [];
    for (const op of currentOperations) {
      if (op.type === 'MEASURE') continue;
      const name = GATE_NAMES[op.type] ?? op.type;
      const qubits = op.targets.qubits.map(q => `q_{${q}}`).join(',\\,');
      // Include angle params if present
      if (op.params) {
        const paramEntries = Object.entries(op.params);
        if (paramEntries.length > 0) {
          const paramStr = paramEntries.map(([k, v]) => {
            // Try to express as a fraction of pi
            const ratio = v / Math.PI;
            if (Math.abs(ratio - 1) < 1e-6) return `${k}=\\pi`;
            if (Math.abs(ratio + 1) < 1e-6) return `${k}=-\\pi`;
            if (Math.abs(ratio - 0.5) < 1e-6) return `${k}=\\pi/2`;
            if (Math.abs(ratio + 0.5) < 1e-6) return `${k}=-\\pi/2`;
            if (Math.abs(ratio - 0.25) < 1e-6) return `${k}=\\pi/4`;
            if (Math.abs(ratio + 0.25) < 1e-6) return `${k}=-\\pi/4`;
            return `${k}=${v.toFixed(3)}`;
          }).join(',\\;');
          parts.push(`\\textbf{${name}}(${paramStr})\\;\\text{on}\\;${qubits}`);
        } else {
          parts.push(`\\textbf{${name}}\\;\\text{on}\\;${qubits}`);
        }
      } else {
        parts.push(`\\textbf{${name}}\\;\\text{on}\\;${qubits}`);
      }
    }

    return parts.length > 0 ? parts.join('\\;,\\quad ') : null;
  }, [currentOperations, currentStep]);

  // Get gate matrix LaTeX for the first non-measurement operation
  const matrixLatex = useMemo(() => {
    if (currentStep === 0 || currentOperations.length === 0) return null;

    for (const op of currentOperations) {
      if (op.type === 'MEASURE') continue;

      // For parameterised rotation gates, build the matrix dynamically
      if (op.params && ['RX', 'RY', 'RZ', 'P'].includes(op.type)) {
        const theta = op.params.theta ?? op.params.lambda ?? Math.PI / 4;
        const c = Math.cos(theta / 2).toFixed(4);
        const s = Math.sin(theta / 2).toFixed(4);

        switch (op.type) {
          case 'RX': return `R_X(\\theta) = \\begin{pmatrix} ${c} & -i \\cdot ${s} \\\\ -i \\cdot ${s} & ${c} \\end{pmatrix}`;
          case 'RY': return `R_Y(\\theta) = \\begin{pmatrix} ${c} & -${s} \\\\ ${s} & ${c} \\end{pmatrix}`;
          case 'RZ': return `R_Z(\\theta) = \\begin{pmatrix} e^{-i\\theta/2} & 0 \\\\ 0 & e^{i\\theta/2} \\end{pmatrix}`;
          case 'P':  return `P(\\lambda) = \\begin{pmatrix} 1 & 0 \\\\ 0 & e^{i\\lambda} \\end{pmatrix}`;
        }
      }

      const matrix = GATE_MATRICES[op.type];
      if (matrix) {
        const name = GATE_NAMES[op.type] ?? op.type;
        return `${name} = ${matrix}`;
      }
    }
    return null;
  }, [currentOperations, currentStep]);

  // Calculate probabilities summary
  const probSummary = useMemo(() => {
    const entries = Object.entries(amplitudes)
      .filter(([, c]) => c.re * c.re + c.im * c.im > 1e-10)
      .sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) return null;

    const terms = entries.map(([state, c]) => {
      const prob = c.re * c.re + c.im * c.im;
      const pct = (prob * 100).toFixed(1);
      return `P(|${state}\\rangle) = ${pct}\\%`;
    });

    return terms.join('\\;,\\quad ');
  }, [amplitudes]);

  const isEmpty = Object.keys(amplitudes).length === 0;

  return (
    <div className="dirac-notation">
      <div className="dirac-notation__header">
        <span className="dirac-notation__title">
          <span className="dirac-notation__icon">∑</span>
          Mathematical State
          <button 
            className="info-btn" 
            data-tooltip="Displays the quantum state vector and active gate matrices in mathematical Dirac notation."
            aria-label="Info"
          >
            !
          </button>
        </span>
        <span className="dirac-notation__step-badge">
          Step {currentStep}
        </span>
      </div>

      {isEmpty ? (
        <div className="dirac-notation__empty">
          No state data available. Add gates to your circuit.
        </div>
      ) : (
        <div className="dirac-notation__content">
          {/* State Vector in Dirac Notation */}
          <div className="dirac-notation__section">
            <div className="dirac-notation__section-label">State Vector (Dirac Notation)</div>
            <div className="dirac-notation__formula-card">
              <KatexBlock latex={stateLatex} />
            </div>
          </div>

          {/* Gate Applied at This Step */}
          {gateInfoLatex && (
            <div className="dirac-notation__section">
              <div className="dirac-notation__section-label">Gate Applied</div>
              <div className="dirac-notation__formula-card dirac-notation__formula-card--gate">
                <KatexBlock latex={`\\text{Step }${currentStep}:\\quad ${gateInfoLatex}`} />
              </div>
            </div>
          )}

          {/* Gate Unitary Matrix */}
          {matrixLatex && (
            <div className="dirac-notation__section">
              <div className="dirac-notation__section-label">Unitary Matrix</div>
              <div className="dirac-notation__formula-card dirac-notation__formula-card--matrix">
                <KatexBlock latex={matrixLatex} />
              </div>
            </div>
          )}

          {/* Probability Summary */}
          {probSummary && (
            <div className="dirac-notation__section">
              <div className="dirac-notation__section-label">Measurement Probabilities</div>
              <div className="dirac-notation__formula-card dirac-notation__formula-card--prob">
                <KatexBlock latex={probSummary} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
