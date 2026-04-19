// ---------------------------------------------------------------------------
// Server-side validation for simulation job submissions
// ---------------------------------------------------------------------------

/** Configurable resource limits with sensible defaults. */
export interface ResourceLimits {
  maxShots: number;
  maxQubits: number;
  maxDepth: number;
  maxExecutionTimeSeconds: number;
}

export function getResourceLimits(): ResourceLimits {
  return {
    maxShots: parseInt(process.env.SIM_MAX_SHOTS || '100000', 10),
    maxQubits: parseInt(process.env.SIM_MAX_QUBITS || '32', 10),
    maxDepth: parseInt(process.env.SIM_MAX_DEPTH || '500', 10),
    maxExecutionTimeSeconds: parseInt(process.env.SIM_MAX_EXECUTION_TIME || '30', 10),
  };
}

export interface ValidationError {
  errorCode: string;
  message: string;
  field?: string;
}

/**
 * Validate the submission payload before creating a job.
 * Returns an array of validation errors (empty = valid).
 */
export function validateSubmission(
  qasm: unknown,
  shots: unknown,
  limits: ResourceLimits,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // --- qasm ---
  if (typeof qasm !== 'string' || qasm.trim().length === 0) {
    errors.push({
      errorCode: 'VALIDATION_QASM_REQUIRED',
      message: 'A non-empty OpenQASM circuit string is required.',
      field: 'qasm',
    });
    return errors; // Can't do further QASM analysis
  }

  // --- shots ---
  if (shots === undefined || shots === null) {
    errors.push({
      errorCode: 'VALIDATION_SHOTS_REQUIRED',
      message: 'The shots parameter is required.',
      field: 'shots',
    });
  } else if (typeof shots !== 'number' || !Number.isInteger(shots) || shots < 1) {
    errors.push({
      errorCode: 'VALIDATION_SHOTS_INVALID',
      message: 'Shots must be a positive integer.',
      field: 'shots',
    });
  } else if (shots > limits.maxShots) {
    errors.push({
      errorCode: 'VALIDATION_MAX_SHOTS',
      message: `Shots exceeds the maximum of ${limits.maxShots}.`,
      field: 'shots',
    });
  }

  // --- QASM structural analysis ---
  const qasmStr = qasm as string;
  const qasmErrors = analyzeQasm(qasmStr, limits);
  errors.push(...qasmErrors);

  return errors;
}

/**
 * Lightweight analysis of OpenQASM text to extract qubit count and gate depth
 * for limit enforcement. This is not a full parser — Qiskit does the real parsing.
 */
function analyzeQasm(qasm: string, limits: ResourceLimits): ValidationError[] {
  const errors: ValidationError[] = [];

  // Detect qubit count from qreg declarations (QASM 2) or qubit declarations (QASM 3)
  const qubitCount = extractQubitCount(qasm);
  if (qubitCount > limits.maxQubits) {
    errors.push({
      errorCode: 'VALIDATION_MAX_QUBITS',
      message: `Circuit uses ${qubitCount} qubits, exceeding the maximum of ${limits.maxQubits}.`,
      field: 'qasm',
    });
  }

  // Estimate gate depth by counting gate lines (lines that aren't declarations/headers/comments)
  const depth = estimateDepth(qasm);
  if (depth > limits.maxDepth) {
    errors.push({
      errorCode: 'VALIDATION_MAX_DEPTH',
      message: `Circuit depth (~${depth}) exceeds the maximum of ${limits.maxDepth}.`,
      field: 'qasm',
    });
  }

  return errors;
}

/** Extract total qubit count from QASM 2 `qreg` or QASM 3 `qubit` declarations. */
function extractQubitCount(qasm: string): number {
  let total = 0;

  // QASM 2 style: qreg q[5];
  const qreg = /qreg\s+\w+\s*\[\s*(\d+)\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = qreg.exec(qasm)) !== null) {
    total += parseInt(m[1], 10);
  }

  // QASM 3 style: qubit[5] q;  or  qubit q;
  const qubit3 = /qubit\s*(?:\[\s*(\d+)\s*\])?\s+\w+\s*;/g;
  while ((m = qubit3.exec(qasm)) !== null) {
    total += m[1] ? parseInt(m[1], 10) : 1;
  }

  return total;
}

/** Estimate circuit depth by counting non-declaration, non-comment lines with gate-like content. */
function estimateDepth(qasm: string): number {
  const skipPrefixes = [
    'OPENQASM',
    'include',
    'qreg',
    'creg',
    'qubit',
    'bit',
    'gate',
    '//',
    '/*',
    '*',
  ];

  let count = 0;
  for (const rawLine of qasm.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line === '{' || line === '}') continue;
    if (skipPrefixes.some((p) => line.startsWith(p))) continue;
    count++;
  }
  return count;
}
