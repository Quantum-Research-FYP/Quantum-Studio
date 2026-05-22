"""
Quantum Experiment Studio — Simulation Microservice

FastAPI HTTP service that accepts OpenQASM circuits or Qiskit Python code
and returns simulation results.

Endpoints:
  GET  /health     → { status: "ok", backend: "aer_simulator"|"basic_simulator" }
  POST /simulate   → { counts, metadata } | { error, errorCode, message }

Request body for /simulate:
  { qasm: str, shots: int, mode?: "qasm" | "python" }

  - mode "qasm" (default): qasm field is parsed as OpenQASM 2.0/3
  - mode "python": qasm field is executed as Qiskit Python in a restricted sandbox;
    the code must define a `qc` QuantumCircuit variable
"""

import re
import time
import builtins as _builtins_module
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Quantum Simulation Service", version="1.1.0")

# ---------------------------------------------------------------------------
# Restricted execution sandbox for Python mode
# ---------------------------------------------------------------------------

_ALLOWED_MODULES = frozenset({
    'qiskit', 'qiskit_aer', 'qiskit_ibm_runtime',
    'numpy', 'math', 'cmath',
    'collections', 'itertools', 'functools',
})

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


def _make_safe_builtins() -> dict:
    safe = {
        name: getattr(_builtins_module, name)
        for name in _SAFE_BUILTIN_NAMES
        if hasattr(_builtins_module, name)
    }

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


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class SimulateRequest(BaseModel):
    qasm: str = Field(..., description="Circuit code: OpenQASM string or Qiskit Python code")
    shots: int = Field(..., ge=1, le=100_000, description="Number of shots (1–100 000)")
    mode: Literal["qasm", "python"] = Field("qasm", description="Input mode: qasm (default) or python")


class SimulateResponse(BaseModel):
    counts: dict[str, int]
    metadata: dict[str, Any]


class ErrorDetail(BaseModel):
    errorCode: str
    message: str


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    backend = _detect_backend_name()
    return {"status": "ok", "backend": backend}


def _detect_backend_name() -> str:
    try:
        from qiskit_aer import AerSimulator  # noqa: F401
        return "aer_simulator"
    except ImportError:
        return "basic_simulator"


# ---------------------------------------------------------------------------
# Simulation endpoint
# ---------------------------------------------------------------------------

@app.post(
    "/simulate",
    response_model=SimulateResponse,
    responses={
        422: {"description": "Validation / syntax error in the circuit"},
        500: {"description": "Runtime error during simulation"},
    },
)
def simulate(req: SimulateRequest):
    if not req.qasm.strip():
        raise HTTPException(
            status_code=422,
            detail={"errorCode": "VALIDATION_SYNTAX", "message": "Empty circuit input."},
        )

    if req.mode == "python":
        counts, backend_name, duration_ms = _run_python_mode(req.qasm, req.shots)
    else:
        try:
            circuit = _parse_qasm(req.qasm)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail={"errorCode": "VALIDATION_SYNTAX", "message": _sanitize(str(exc))},
            )
        try:
            counts, backend_name, duration_ms = _run_simulation(circuit, req.shots)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail={"errorCode": "EXECUTION_RUNTIME_ERROR", "message": _sanitize(str(exc))},
            )

    return SimulateResponse(
        counts=counts,
        metadata={
            "shots": req.shots,
            "backend": backend_name,
            "durationMs": duration_ms,
            "codeType": req.mode,
        },
    )


# ---------------------------------------------------------------------------
# Python sandbox executor
# ---------------------------------------------------------------------------

def _run_python_mode(code: str, shots: int) -> tuple:
    """Execute Qiskit Python in a restricted sandbox, then simulate the circuit."""
    # Compile first for clean syntax error reporting
    try:
        compiled = compile(code, '<user_circuit>', 'exec')
    except SyntaxError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "errorCode": "VALIDATION_SYNTAX",
                "message": f"Python syntax error on line {exc.lineno}: {exc.msg}",
            },
        )

    # Execute in sandbox
    namespace: dict = {'__builtins__': _SAFE_BUILTINS}
    try:
        exec(compiled, namespace)  # noqa: S102 — intentional sandboxed exec
    except ImportError as exc:
        raise HTTPException(
            status_code=422,
            detail={"errorCode": "VALIDATION_SYNTAX", "message": str(exc)},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail={"errorCode": "EXECUTION_RUNTIME_ERROR", "message": _sanitize(str(exc))},
        )

    # Expect a `qc` variable holding a QuantumCircuit
    qc = namespace.get('qc')
    if qc is None:
        raise HTTPException(
            status_code=422,
            detail={
                "errorCode": "VALIDATION_NO_CIRCUIT",
                "message": (
                    "Your code must define a variable named 'qc' (QuantumCircuit). "
                    "Example: qc = QuantumCircuit(2, 2)"
                ),
            },
        )

    try:
        from qiskit import QuantumCircuit
        if not isinstance(qc, QuantumCircuit):
            raise HTTPException(
                status_code=422,
                detail={
                    "errorCode": "VALIDATION_NO_CIRCUIT",
                    "message": f"'qc' must be a QuantumCircuit, got {type(qc).__name__}.",
                },
            )
    except ImportError:
        pass  # Let _run_simulation fail naturally

    try:
        return _run_simulation(qc, shots)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"errorCode": "EXECUTION_RUNTIME_ERROR", "message": _sanitize(str(exc))},
        )


# ---------------------------------------------------------------------------
# Simulation helpers
# ---------------------------------------------------------------------------

def _parse_qasm(qasm_text: str):
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


def _run_simulation(circuit, shots: int) -> tuple:
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
    clean_counts = {str(k): int(v) for k, v in counts.items()}
    return clean_counts, backend_name, elapsed_ms


def _sanitize(msg: str) -> str:
    """Strip file paths and internal details from error messages."""
    msg = re.sub(r"(/[^\s:]+/)", "", msg)
    if len(msg) > 300:
        msg = msg[:297] + "..."
    return msg or "An error occurred during simulation."
