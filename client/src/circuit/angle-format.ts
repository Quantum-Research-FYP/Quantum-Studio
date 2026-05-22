/** Tolerance for matching a radian value to a known fraction of π. */
const EPS = 1e-10;

const PI = Math.PI;

/** Table of [value, display, qiskit-expr, qasm-expr]. */
const TABLE: [number, string, string, string][] = [
  [0,              '0',      '0',              '0'],
  [PI / 8,        'π/8',    'math.pi/8',       'pi/8'],
  [PI / 6,        'π/6',    'math.pi/6',       'pi/6'],
  [PI / 4,        'π/4',    'math.pi/4',       'pi/4'],
  [PI / 3,        'π/3',    'math.pi/3',       'pi/3'],
  [PI / 2,        'π/2',    'math.pi/2',       'pi/2'],
  [2 * PI / 3,    '2π/3',   '2*math.pi/3',     '2*pi/3'],
  [3 * PI / 4,    '3π/4',   '3*math.pi/4',     '3*pi/4'],
  [PI,            'π',      'math.pi',         'pi'],
  [5 * PI / 4,    '5π/4',   '5*math.pi/4',     '5*pi/4'],
  [3 * PI / 2,    '3π/2',   '3*math.pi/2',     '3*pi/2'],
  [7 * PI / 4,    '7π/4',   '7*math.pi/4',     '7*pi/4'],
  [2 * PI,        '2π',     '2*math.pi',       '2*pi'],
  [-PI / 8,       '-π/8',   '-math.pi/8',      '-pi/8'],
  [-PI / 6,       '-π/6',   '-math.pi/6',      '-pi/6'],
  [-PI / 4,       '-π/4',   '-math.pi/4',      '-pi/4'],
  [-PI / 3,       '-π/3',   '-math.pi/3',      '-pi/3'],
  [-PI / 2,       '-π/2',   '-math.pi/2',      '-pi/2'],
  [-2 * PI / 3,   '-2π/3',  '-2*math.pi/3',    '-2*pi/3'],
  [-3 * PI / 4,   '-3π/4',  '-3*math.pi/4',    '-3*pi/4'],
  [-PI,           '-π',     '-math.pi',        '-pi'],
  [-3 * PI / 2,   '-3π/2',  '-3*math.pi/2',    '-3*pi/2'],
];

function find(rad: number): [string, string, string] | null {
  for (const [val, display, qiskit, qasm] of TABLE) {
    if (Math.abs(rad - val) < EPS) return [display, qiskit, qasm];
  }
  return null;
}

/** Format an angle (radians) for display in the UI (e.g. "π/2"). */
export function formatAngleDisplay(rad: number): string {
  const match = find(rad);
  return match ? match[0] : `${rad.toFixed(4)} rad`;
}

/** Format an angle (radians) as a Python expression for Qiskit code (e.g. "math.pi/2"). */
export function formatAngleQiskit(rad: number): string {
  const match = find(rad);
  return match ? match[1] : rad.toFixed(6);
}

/** Format an angle (radians) as an OpenQASM 2.0 expression (e.g. "pi/2"). */
export function formatAngleQasm(rad: number): string {
  const match = find(rad);
  return match ? match[2] : rad.toFixed(6);
}
