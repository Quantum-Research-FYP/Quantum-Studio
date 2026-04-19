"""
Constrained Qiskit simulator script for the Quantum Experiment Studio.

Reads OpenQASM from stdin, runs simulation, outputs JSON to stdout.
No arbitrary code execution — only parses QASM and runs a simulator.

Usage:
    echo "OPENQASM 2.0; ..." | python simulate.py --shots 1024

Output (success):
    {"counts": {"00": 512, "11": 512}, "metadata": {"shots": 1024, "backend": "aer_simulator", "durationMs": 42}}

Output (error):
    {"error": true, "errorCode": "...", "message": "..."}
"""

import json
import sys
import time
import argparse


def main():
    parser = argparse.ArgumentParser(description="Run a quantum circuit simulation")
    parser.add_argument("--shots", type=int, required=True, help="Number of shots")
    args = parser.parse_args()

    qasm_input = sys.stdin.read()
    if not qasm_input.strip():
        emit_error("VALIDATION_SYNTAX", "Empty circuit input.")
        return

    try:
        circuit = parse_qasm(qasm_input)
    except Exception as exc:
        emit_error("VALIDATION_SYNTAX", sanitize_message(str(exc)))
        return

    try:
        counts, backend_name, duration_ms = run_simulation(circuit, args.shots)
    except Exception as exc:
        emit_error("EXECUTION_RUNTIME_ERROR", sanitize_message(str(exc)))
        return

    result = {
        "counts": counts,
        "metadata": {
            "shots": args.shots,
            "backend": backend_name,
            "durationMs": duration_ms,
        },
    }
    json.dump(result, sys.stdout)


def parse_qasm(qasm_text: str):
    """Parse OpenQASM text into a Qiskit QuantumCircuit."""
    from qiskit import qasm2

    # Try QASM 2 first (most common)
    try:
        return qasm2.loads(qasm_text)
    except Exception:
        pass

    # Fallback: try QASM 3
    try:
        from qiskit import qasm3
        return qasm3.loads(qasm_text)
    except Exception:
        pass

    # Re-raise the QASM 2 error for a cleaner message
    return qasm2.loads(qasm_text)


def run_simulation(circuit, shots: int):
    """Execute the circuit on the best available simulator."""
    start = time.monotonic()

    backend_name = "aer_simulator"
    try:
        from qiskit_aer import AerSimulator
        backend = AerSimulator()
    except ImportError:
        from qiskit.providers.basic_provider import BasicSimulator
        backend = BasicSimulator()
        backend_name = "basic_simulator"

    from qiskit import transpile
    transpiled = transpile(circuit, backend)
    job = backend.run(transpiled, shots=shots)
    result = job.result()

    elapsed_ms = round((time.monotonic() - start) * 1000)
    counts = result.get_counts()

    # Ensure counts keys are strings and values are ints
    clean_counts = {str(k): int(v) for k, v in counts.items()}
    return clean_counts, backend_name, elapsed_ms


def sanitize_message(msg: str) -> str:
    """Strip file paths, tracebacks, and internal details from error messages."""
    # Remove file path references
    import re
    msg = re.sub(r'(/[^\s:]+/)', '', msg)
    # Truncate long messages
    if len(msg) > 300:
        msg = msg[:297] + "..."
    return msg or "An error occurred during simulation."


def emit_error(error_code: str, message: str):
    """Output a structured error as JSON."""
    json.dump({"error": True, "errorCode": error_code, "message": message}, sys.stdout)


if __name__ == "__main__":
    main()
