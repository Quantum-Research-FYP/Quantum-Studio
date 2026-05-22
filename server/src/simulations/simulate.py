"""
Constrained Qiskit simulator script for the Quantum Experiment Studio.

Supports two input modes:
  --mode qasm   (default) Reads OpenQASM from stdin, parses and runs it.
  --mode python           Reads Qiskit Python from stdin, executes it in a
                          restricted sandbox, expects a `qc` QuantumCircuit
                          variable, then runs simulation.

No arbitrary code execution in python mode — imports are restricted to
qiskit/math/numpy and dangerous builtins are removed.

Usage:
    echo "OPENQASM 2.0; ..." | python simulate.py --shots 1024
    echo "qc = QuantumCircuit(2,2)..." | python simulate.py --shots 1024 --mode python

Output (success):
    {"counts": {"00": 512, "11": 512}, "metadata": {"shots": 1024, "backend": "aer_simulator", "durationMs": 42}}

Output (error):
    {"error": true, "errorCode": "...", "message": "..."}
"""

import json
import sys
import time
import argparse


# ---------------------------------------------------------------------------
# Restricted execution sandbox for Python mode
# ---------------------------------------------------------------------------

# Top-level module names allowed to import in user code
_ALLOWED_MODULES = frozenset({
    'qiskit', 'qiskit_aer', 'qiskit_ibm_runtime',
    'numpy', 'math', 'cmath',
    'collections', 'itertools', 'functools',
})

# Safe subset of Python builtins — nothing that touches files, processes, or network
_SAFE_BUILTIN_NAMES = frozenset({
    'abs', 'all', 'any', 'bin', 'bool', 'chr', 'complex', 'dict', 'divmod',
    'enumerate', 'filter', 'float', 'frozenset', 'getattr', 'hasattr', 'hash',
    'hex', 'int', 'isinstance', 'issubclass', 'iter', 'len', 'list', 'map',
    'max', 'min', 'next', 'object', 'oct', 'ord', 'pow', 'print', 'range',
    'repr', 'reversed', 'round', 'set', 'slice', 'sorted', 'str', 'sum',
    'tuple', 'type', 'zip', 'True', 'False', 'None',
    'ValueError', 'TypeError', 'IndexError', 'KeyError', 'AttributeError',
    'ImportError', 'StopIteration', 'Exception', 'RuntimeError',
    'NotImplementedError', 'ArithmeticError', 'ZeroDivisionError',
})


def _make_safe_builtins():
    import builtins
    safe = {name: getattr(builtins, name) for name in _SAFE_BUILTIN_NAMES if hasattr(builtins, name)}

    def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
        top = name.split('.')[0]
        if top not in _ALLOWED_MODULES:
            raise ImportError(
                f"Import of '{name}' is not allowed. "
                f"Permitted modules: {', '.join(sorted(_ALLOWED_MODULES))}."
            )
        return __import__(name, globals, locals, fromlist, level)

    safe['__import__'] = safe_import
    safe['__build_class__'] = __build_class__  # needed for class definitions
    return safe


_SAFE_BUILTINS = _make_safe_builtins()


def run_python_mode(code: str, shots: int):
    """Execute user Qiskit Python in a restricted sandbox, then simulate."""
    # 1. Compile first to catch syntax errors cleanly
    try:
        compiled = compile(code, '<user_circuit>', 'exec')
    except SyntaxError as exc:
        emit_error(
            'VALIDATION_SYNTAX',
            f'Python syntax error on line {exc.lineno}: {exc.msg}'
        )
        return

    # 2. Execute in sandbox
    namespace = {'__builtins__': _SAFE_BUILTINS}
    try:
        exec(compiled, namespace)
    except ImportError as exc:
        emit_error('VALIDATION_SYNTAX', str(exc))
        return
    except Exception as exc:
        emit_error('EXECUTION_RUNTIME_ERROR', sanitize_message(str(exc)))
        return

    # 3. Expect a `qc` variable holding a QuantumCircuit
    qc = namespace.get('qc')
    if qc is None:
        emit_error(
            'VALIDATION_NO_CIRCUIT',
            "Your code must define a variable named 'qc' (QuantumCircuit). "
            "Example: qc = QuantumCircuit(2, 2)"
        )
        return

    try:
        from qiskit import QuantumCircuit
        if not isinstance(qc, QuantumCircuit):
            emit_error(
                'VALIDATION_NO_CIRCUIT',
                f"'qc' must be a QuantumCircuit, got {type(qc).__name__}."
            )
            return
    except ImportError:
        pass  # If qiskit not available, let run_simulation fail naturally

    # 4. Run simulation directly on the circuit object
    try:
        counts, backend_name, duration_ms = run_simulation(qc, shots)
    except Exception as exc:
        emit_error('EXECUTION_RUNTIME_ERROR', sanitize_message(str(exc)))
        return

    result = {
        'counts': counts,
        'metadata': {
            'shots': shots,
            'backend': backend_name,
            'durationMs': duration_ms,
            'codeType': 'python',
        },
    }
    json.dump(result, sys.stdout)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Run a quantum circuit simulation')
    parser.add_argument('--shots', type=int, required=True, help='Number of shots')
    parser.add_argument(
        '--mode', choices=['qasm', 'python'], default='qasm',
        help='Input format: qasm (default) or python'
    )
    args = parser.parse_args()

    code_input = sys.stdin.read()
    if not code_input.strip():
        emit_error('VALIDATION_SYNTAX', 'Empty circuit input.')
        return

    if args.mode == 'python':
        run_python_mode(code_input, args.shots)
        return

    # QASM mode (default)
    try:
        circuit = parse_qasm(code_input)
    except Exception as exc:
        emit_error('VALIDATION_SYNTAX', sanitize_message(str(exc)))
        return

    try:
        counts, backend_name, duration_ms = run_simulation(circuit, args.shots)
    except Exception as exc:
        emit_error('EXECUTION_RUNTIME_ERROR', sanitize_message(str(exc)))
        return

    result = {
        'counts': counts,
        'metadata': {
            'shots': args.shots,
            'backend': backend_name,
            'durationMs': duration_ms,
        },
    }
    json.dump(result, sys.stdout)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def parse_qasm(qasm_text: str):
    """Parse OpenQASM text into a Qiskit QuantumCircuit."""
    from qiskit import qasm2

    try:
        return qasm2.loads(qasm_text)
    except Exception:
        pass

    try:
        from qiskit import qasm3
        return qasm3.loads(qasm_text)
    except Exception:
        pass

    return qasm2.loads(qasm_text)


def run_simulation(circuit, shots: int):
    """Execute the circuit on the best available simulator."""
    start = time.monotonic()

    backend_name = 'aer_simulator'
    try:
        from qiskit_aer import AerSimulator
        backend = AerSimulator()
    except ImportError:
        from qiskit.providers.basic_provider import BasicSimulator
        backend = BasicSimulator()
        backend_name = 'basic_simulator'

    from qiskit import transpile
    transpiled = transpile(circuit, backend)
    job = backend.run(transpiled, shots=shots)
    result = job.result()

    elapsed_ms = round((time.monotonic() - start) * 1000)
    counts = result.get_counts()

    clean_counts = {str(k): int(v) for k, v in counts.items()}
    return clean_counts, backend_name, elapsed_ms


def sanitize_message(msg: str) -> str:
    """Strip file paths, tracebacks, and internal details from error messages."""
    import re
    msg = re.sub(r'(/[^\s:]+/)', '', msg)
    if len(msg) > 300:
        msg = msg[:297] + '...'
    return msg or 'An error occurred during simulation.'


def emit_error(error_code: str, message: str):
    """Output a structured error as JSON."""
    json.dump({'error': True, 'errorCode': error_code, 'message': message}, sys.stdout)


if __name__ == '__main__':
    main()
