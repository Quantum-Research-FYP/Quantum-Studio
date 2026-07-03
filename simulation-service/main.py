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

try:
    import qiskit_aer
except ImportError:
    pass

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
    noiseConfig: dict[str, Any] | None = Field(None, description="Optional noise configuration")


class SimulateResponse(BaseModel):
    counts: dict[str, int]
    metadata: dict[str, Any]


class AnalyzeRequest(BaseModel):
    qasm: str = Field(..., description="Circuit code")
    shots: int = Field(..., ge=1, le=100_000)
    mode: Literal["qasm", "python"] = Field("qasm")
    noiseConfig: dict[str, Any] | None = Field(None)

class AnalyzeResponse(BaseModel):
    idealCounts: dict[str, int]
    noisyCounts: dict[str, int]
    fidelity: float
    errorBudget: dict[str, float]
    monteCarloFidelity: list[dict[str, float]]
    metadata: dict[str, Any]


class StepperRequest(BaseModel):
    code: str = Field(..., description="Qiskit Python code with save_statevector calls")


class StepperResponse(BaseModel):
    statevectors: dict[str, dict[str, dict[str, float]]]
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
        counts, backend_name, duration_ms = _run_python_mode(req.qasm, req.shots, req.noiseConfig)
    else:
        try:
            circuit = _parse_qasm(req.qasm)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail={"errorCode": "VALIDATION_SYNTAX", "message": _sanitize(str(exc))},
            )
        try:
            counts, backend_name, duration_ms = _run_simulation(circuit, req.shots, req.noiseConfig)
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

def _run_python_mode(code: str, shots: int, noiseConfig: dict | None = None) -> tuple:
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
        return _run_simulation(qc, shots, noiseConfig)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"errorCode": "EXECUTION_RUNTIME_ERROR", "message": _sanitize(str(exc))},
        )


@app.post(
    "/simulate-stepper",
    response_model=StepperResponse,
    responses={
        422: {"description": "Validation / syntax error in the circuit"},
        500: {"description": "Runtime error during simulation"},
    },
)
def simulate_stepper(req: StepperRequest):
    if not req.code.strip():
        raise HTTPException(
            status_code=422,
            detail={"errorCode": "VALIDATION_SYNTAX", "message": "Empty circuit input."},
        )

    # Compile first for clean syntax error reporting
    try:
        compiled = compile(req.code, '<user_circuit>', 'exec')
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
        exec(compiled, namespace)  # noqa: S102
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

    qc = namespace.get('qc')
    if qc is None:
        raise HTTPException(
            status_code=422,
            detail={
                "errorCode": "VALIDATION_NO_CIRCUIT",
                "message": "Your code must define a variable named 'qc' (QuantumCircuit).",
            },
        )

    try:
        start = time.monotonic()
        backend_name = "aer_simulator"
        
        try:
            from qiskit_aer import AerSimulator
            backend = AerSimulator(method="statevector")
        except ImportError:
            raise HTTPException(
                status_code=500,
                detail={"errorCode": "EXECUTION_RUNTIME_ERROR", "message": "AerSimulator is required for stepper."},
            )

        from qiskit import transpile
        transpiled = transpile(qc, backend)
        job = backend.run(transpiled)
        result = job.result()
        
        elapsed_ms = round((time.monotonic() - start) * 1000)
        
        data = result.data(0)
        statevectors = {}
        
        for key, value in data.items():
            if key.startswith("step_"):
                # value is a Statevector object
                sv_dict = value.to_dict()
                formatted_sv = {}
                for state_label, complex_amp in sv_dict.items():
                    formatted_sv[state_label] = {
                        "re": complex_amp.real,
                        "im": complex_amp.imag
                    }
                statevectors[key] = formatted_sv

        return StepperResponse(
            statevectors=statevectors,
            metadata={
                "backend": backend_name,
                "durationMs": elapsed_ms,
            }
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"errorCode": "EXECUTION_RUNTIME_ERROR", "message": _sanitize(str(exc))},
        )


@app.post(
    "/analyze",
    response_model=AnalyzeResponse,
)
def analyze(req: AnalyzeRequest):
    if not req.qasm.strip():
        raise HTTPException(status_code=422, detail={"errorCode": "VALIDATION_SYNTAX", "message": "Empty circuit input."})

    try:
        if req.mode == "python":
            compiled = compile(req.qasm, '<user_circuit>', 'exec')
            namespace: dict = {'__builtins__': _SAFE_BUILTINS}
            exec(compiled, namespace)
            circuit = namespace.get('qc')
        else:
            circuit = _parse_qasm(req.qasm)
    except Exception as exc:
        raise HTTPException(status_code=422, detail={"errorCode": "VALIDATION_SYNTAX", "message": _sanitize(str(exc))})

    if not circuit:
        raise HTTPException(status_code=422, detail={"errorCode": "VALIDATION_NO_CIRCUIT", "message": "No valid circuit found."})

    try:
        # Ideal run
        ideal_counts, backend_name, t1 = _run_simulation(circuit, req.shots, None)
        # Noisy run
        noisy_counts, _, t2 = _run_simulation(circuit, req.shots, req.noiseConfig)
        
        # Calculate Fidelity (Bhattacharyya coefficient)
        def _fidelity(c1, c2, shots):
            keys = set(c1.keys()).union(set(c2.keys()))
            fid = 0.0
            for k in keys:
                p1 = c1.get(k, 0) / shots
                p2 = c2.get(k, 0) / shots
                import math
                fid += math.sqrt(p1 * p2)
            return fid

        baseline_fidelity = _fidelity(ideal_counts, noisy_counts, req.shots)

        # Estimate Error Budget
        error_budget = {}
        if req.noiseConfig:
            from qiskit import transpile
            from qiskit_aer import AerSimulator
            # Basic approximation: sum up noise parameters scaled by transpiled gate counts
            backend = AerSimulator()
            t_circ = transpile(circuit, backend)
            ops = t_circ.count_ops()
            one_q_ops = sum(ops.get(g, 0) for g in ['u1', 'u2', 'u3', 'h', 'x', 'y', 'z', 'rx', 'ry', 'rz', 's', 't'])
            two_q_ops = sum(ops.get(g, 0) for g in ['cx', 'cy', 'cz', 'swap', 'ccx'])
            
            raw_budget = {
                "Depolarizing Error": (req.noiseConfig.get("depolarizing", 0) * (one_q_ops + two_q_ops)),
                "Bit Flip Error": (req.noiseConfig.get("bitFlip", 0) * one_q_ops),
                "Phase Flip Error": (req.noiseConfig.get("phaseFlip", 0) * one_q_ops),
                "Amplitude Damping": (req.noiseConfig.get("amplitudeDamping", 0) * one_q_ops),
                "Phase Damping": (req.noiseConfig.get("phaseDamping", 0) * one_q_ops),
                "Readout Error": (req.noiseConfig.get("readoutError", 0) * ops.get("measure", 0)),
                "Crosstalk": (req.noiseConfig.get("crosstalk", 0) * ops.get("cx", 0))
            }
            # Thermal relaxation is approx
            if th := req.noiseConfig.get("thermalRelaxation"):
                t1_th = th.get("t1", 1)
                gt = th.get("gateTime", 0.1)
                raw_budget["Thermal Relaxation"] = (gt / t1_th) * (one_q_ops + two_q_ops)
                
            total_err = sum(raw_budget.values())
            if total_err > 0:
                error_budget = {k: round((v / total_err) * 100, 2) for k, v in raw_budget.items() if v > 0}

        # Monte Carlo Sweep (scale noise)
        mc_results = []
        if req.noiseConfig:
            scales = [0.0, 0.5, 1.0, 1.5, 2.0]
            for s in scales:
                s_config = {}
                for k, v in req.noiseConfig.items():
                    if isinstance(v, (int, float)):
                        s_config[k] = min(0.99, v * s)
                    elif isinstance(v, dict):
                        s_config[k] = v # pass thermal as is
                mc_counts, _, _ = _run_simulation(circuit, req.shots, s_config)
                mc_results.append({
                    "noiseScale": s,
                    "fidelity": _fidelity(ideal_counts, mc_counts, req.shots)
                })

        return AnalyzeResponse(
            idealCounts=ideal_counts,
            noisyCounts=noisy_counts,
            fidelity=baseline_fidelity,
            errorBudget=error_budget,
            monteCarloFidelity=mc_results,
            metadata={"backend": backend_name, "durationMs": t1 + t2}
        )

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


def _run_simulation(circuit, shots: int, noiseConfig: dict | None = None) -> tuple:
    """Execute the circuit on the best available simulator."""
    start = time.monotonic()

    backend_name = "aer_simulator"
    try:
        from qiskit_aer import AerSimulator
        noise_model = None
        if noiseConfig:
            noise_model = _build_noise_model(noiseConfig)
        
        if noise_model is not None:
            backend = AerSimulator(noise_model=noise_model)
        else:
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


def _build_noise_model(config: dict):
    from qiskit_aer.noise import (
        NoiseModel, depolarizing_error, pauli_error, 
        amplitude_damping_error, phase_damping_error, 
        thermal_relaxation_error, ReadoutError
    )
    
    nm = NoiseModel()
    
    # 1-qubit, 2-qubit, 3-qubit gates mapping
    one_q_gates = ['u1', 'u2', 'u3', 'h', 'x', 'y', 'z', 'rx', 'ry', 'rz', 's', 't']
    two_q_gates = ['cx', 'cy', 'cz', 'swap']
    three_q_gates = ['ccx']

    # 1. Depolarizing Error
    if p_depol := config.get('depolarizing'):
        nm.add_all_qubit_quantum_error(depolarizing_error(p_depol, 1), one_q_gates)
        nm.add_all_qubit_quantum_error(depolarizing_error(p_depol, 2), two_q_gates)
        nm.add_all_qubit_quantum_error(depolarizing_error(p_depol, 3), three_q_gates)

    # 2. Bit Flip Error (X)
    if p_bit := config.get('bitFlip'):
        err = pauli_error([('X', p_bit), ('I', 1 - p_bit)])
        nm.add_all_qubit_quantum_error(err, one_q_gates)

    # 3. Phase Flip Error (Z)
    if p_phase := config.get('phaseFlip'):
        err = pauli_error([('Z', p_phase), ('I', 1 - p_phase)])
        nm.add_all_qubit_quantum_error(err, one_q_gates)

    # 4. Amplitude Damping
    if gamma := config.get('amplitudeDamping'):
        err = amplitude_damping_error(gamma)
        nm.add_all_qubit_quantum_error(err, one_q_gates)

    # 5. Phase Damping
    if lam := config.get('phaseDamping'):
        err = phase_damping_error(lam)
        nm.add_all_qubit_quantum_error(err, one_q_gates)

    # 6. Readout Error
    if p_ro := config.get('readoutError'):
        # Probabilities: P(0|0)=1-p_ro, P(1|0)=p_ro, P(0|1)=p_ro, P(1|1)=1-p_ro
        err = ReadoutError([[1 - p_ro, p_ro], [p_ro, 1 - p_ro]])
        nm.add_all_qubit_readout_error(err)

    # 7. Crosstalk (simulated as two-qubit depolarizing error on CX)
    if p_cross := config.get('crosstalk'):
        err = depolarizing_error(p_cross, 2)
        nm.add_all_qubit_quantum_error(err, ['cx'])

    # 8. Thermal Relaxation
    if therm := config.get('thermalRelaxation'):
        t1 = therm.get('t1')
        t2 = therm.get('t2')
        gate_time = therm.get('gateTime')
        if t1 and t2 and gate_time:
            # Add thermal relaxation to 1 qubit gates
            err = thermal_relaxation_error(t1, t2, gate_time)
            nm.add_all_qubit_quantum_error(err, one_q_gates)
            # Add for 2-qubit gates (approx gate_time * 2)
            err2 = err.tensor(err)
            nm.add_all_qubit_quantum_error(err2, two_q_gates)
            err3 = err2.tensor(err)
            nm.add_all_qubit_quantum_error(err3, three_q_gates)

    return nm


def _sanitize(msg: str) -> str:
    """Strip file paths and internal details from error messages."""
    msg = re.sub(r"(/[^\s:]+/)", "", msg)
    if len(msg) > 300:
        msg = msg[:297] + "..."
    return msg or "An error occurred during simulation."
