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

import asyncio
import os
import re
import time as _time
import hashlib
import builtins as _builtins_module
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    import qiskit_aer
except ImportError:
    pass

app = FastAPI(title="Quantum Simulation Service", version="1.1.0")

# ---------------------------------------------------------------------------
# Concurrency limiter — prevents race conditions when multiple users run
# simulations simultaneously on a single-process worker (free-tier Render).
# Both /simulate, /simulate-stepper, /analyze and transpile endpoints acquire
# this semaphore before doing heavy Qiskit work.
#
# SIM_MAX_CONCURRENT: max parallel Qiskit executions (default: 1)
# SIM_QUEUE_TIMEOUT_SECONDS: how long a request waits before 503 (default: 60)
# ---------------------------------------------------------------------------
_SIM_MAX_CONCURRENT = int(os.getenv("SIM_MAX_CONCURRENT", "1"))
_SIM_QUEUE_TIMEOUT = int(os.getenv("SIM_QUEUE_TIMEOUT_SECONDS", "60"))
_sim_semaphore: asyncio.Semaphore  # initialised in startup event


@app.on_event("startup")
async def _init_semaphore() -> None:
    global _sim_semaphore
    _sim_semaphore = asyncio.Semaphore(_SIM_MAX_CONCURRENT)
    print(
        f"[startup] Simulation semaphore: max_concurrent={_SIM_MAX_CONCURRENT}, "
        f"queue_timeout={_SIM_QUEUE_TIMEOUT}s"
    )

_cors_origins_env = os.getenv("CORS_ALLOW_ORIGINS", "*")
_cors_origins = [origin.strip() for origin in _cors_origins_env.split(",") if origin.strip()]

if _cors_origins == ["*"]:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
    )

# ---------------------------------------------------------------------------
# Restricted execution sandbox for Python mode
# ---------------------------------------------------------------------------

_ALLOWED_MODULES = frozenset({
    'qiskit', 'qiskit_aer', 'qiskit_ibm_runtime', 'spinqit',
    'cirq', 'pennylane', 'braket', 'pytket',
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
    provider: Literal["local", "spinq", "simulator"] = Field("local", description="Backend provider: local, spinq, or simulator")
    spinqConfig: dict[str, Any] | None = Field(None, description="Optional SpinQ QC configuration")


class TranspileIbmRequest(BaseModel):
    code: str = Field(..., description="Circuit source code")
    codeType: Literal["qasm", "python", "cirq", "pennylane", "braket", "tket"] = Field(
        "qasm", description="Framework / format of the input code"
    )
    backend: str = Field("ibm_brisbane", description="Target IBM backend name (used for ISA transpilation)")
    # Credentials — when provided, used to fetch the real backend's coupling map
    # from IBM Quantum / IBM Cloud, ensuring ISA-compliant qubit routing.
    ibm_token: str | None = Field(None, description="Raw IBM API key or IBM Quantum token")
    ibm_channel: str | None = Field(None, description="'ibm_quantum' or 'ibm_cloud'")
    ibm_instance: str | None = Field(None, description="CRN for IBM Cloud, or hub/group/project for IBM Quantum")


class TranspileIbmResponse(BaseModel):
    transpiled_qasm: str
    metadata: dict[str, Any]


class IbmJobResultRequest(BaseModel):
    job_id: str = Field(..., description="The provider job ID from IBM Qiskit Runtime")
    ibm_token: str = Field(..., description="Raw IBM API key or IBM Quantum token")
    ibm_channel: str = Field("ibm_cloud", description="'ibm_quantum' or 'ibm_cloud'")
    ibm_instance: str | None = Field(None, description="CRN for IBM Cloud, or hub/group/project for IBM Quantum")


class IbmJobResultResponse(BaseModel):
    counts: dict[str, int]
    status: str
    metadata: dict[str, Any] | None = None


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
# IBM QPU Transpilation endpoint
# ---------------------------------------------------------------------------
#
# ARCHITECTURE: Each IBM QPU must be transpiled INDEPENDENTLY.
#
# Even backends that appear identical on paper — same family, same qubit
# count, same native gate set — are DIFFERENT physical machines with their
# own coupling map, error rates, calibration data, and gate quality.
#
# Example: ibm_fez, ibm_kingston, ibm_marrakesh are all Heron r2 / 156 qubits,
# but submitting a circuit transpiled FOR ibm_fez TO ibm_kingston will fail
# because their coupling maps (which qubits are physically connected) differ.
#
# Correct usage:
#   transpile(circuit, backend=service.backend("ibm_fez"))       # for ibm_fez
#   transpile(circuit, backend=service.backend("ibm_kingston"))  # for ibm_kingston
#
# The ONLY source of truth is QiskitRuntimeService(token=...).backend(name),
# which returns the live backend object with its exact coupling map and
# calibration data. This is what the real-backend path (A) below uses.
#
# The fallback (B) uses GenericBackendV2 with the correct native 2-qubit
# gate for the backend's processor family. Basis gate decomposition will be
# correct, but qubit routing will NOT match the real device.

# ---------------------------------------------------------------------------
# Native 2-qubit gate per backend.
# This is the ONLY property we can determine from the backend NAME alone
# (it is family-level). Everything else — coupling map, error rates,
# calibration, qubit count per machine — requires the real backend object.
# ---------------------------------------------------------------------------
_IBM_NATIVE_2Q_GATE: dict[str, str] = {
    # Eagle r1 (127 qubits) — native 2Q gate: ecr
    "ibm_brisbane":   "ecr",
    "ibm_osaka":      "ecr",
    "ibm_kyoto":      "ecr",
    "ibm_sherbrooke": "ecr",
    "ibm_nazca":      "ecr",
    "ibm_hanoi":      "ecr",
    "ibm_cairo":      "ecr",
    # Heron r1 (133 qubits) — native 2Q gate: cz
    "ibm_torino":     "cz",
    # Heron r2 (156 qubits) — native 2Q gate: cz
    # NOTE: ibm_fez, ibm_kingston, ibm_marrakesh are SEPARATE physical
    # machines. They share the same native gate but NOT the same coupling map.
    "ibm_fez":        "cz",
    "ibm_kingston":   "cz",
    "ibm_marrakesh":  "cz",
    "ibm_strasbourg": "cz",
}

# Qubit count per backend — used ONLY to size the fallback GenericBackendV2.
# This is also family-level; the real backend may have a different effective
# qubit count depending on which qubits are currently calibrated.
_IBM_BACKEND_QUBIT_COUNT: dict[str, int] = {
    "ibm_brisbane":   127, "ibm_osaka":      127, "ibm_kyoto":      127,
    "ibm_sherbrooke": 127, "ibm_nazca":      127, "ibm_hanoi":      127,
    "ibm_cairo":      127,
    "ibm_torino":     133,
    "ibm_fez":        156, "ibm_kingston":   156, "ibm_marrakesh":  156,
    "ibm_strasbourg": 156,
}
_DEFAULT_QUBIT_COUNT = 127
_DEFAULT_NATIVE_2Q   = "ecr"   # Eagle is the most common current family

_SINGLE_QUBIT_BASIS = ['id', 'rz', 'sx', 'x', 'reset']

def _basis_gates_for(backend_name: str) -> list[str]:
    """Return the basis gate list for a backend, derived from its native 2Q gate."""
    native_2q = _IBM_NATIVE_2Q_GATE.get(backend_name, _DEFAULT_NATIVE_2Q)
    return _SINGLE_QUBIT_BASIS + [native_2q]

# ---------------------------------------------------------------------------
# Backend cache: real IBM backend objects are cached for 5 minutes
# to avoid a round-trip to IBM on every job submission.
# ---------------------------------------------------------------------------

_BACKEND_CACHE: dict[str, tuple[Any, float]] = {}
_BACKEND_CACHE_TTL_S = 300  # 5 minutes


def _get_real_backend_cached(ibm_channel: str, ibm_token: str, ibm_instance: str | None, backend_name: str) -> Any:
    """
    Fetch the real IBM backend object from QiskitRuntimeService.

    The backend object carries the exact coupling map, basis gates, and
    calibration data needed for ISA-compliant transpilation. Results are
    cached for 5 minutes to avoid repeated API round-trips.

    Raises on auth failure or unknown backend name.
    """
    token_hash = hashlib.sha256(ibm_token.encode()).hexdigest()[:16]
    cache_key = f"{ibm_channel}:{token_hash}:{backend_name}"

    cached = _BACKEND_CACHE.get(cache_key)
    if cached and (_time.monotonic() - cached[1]) < _BACKEND_CACHE_TTL_S:
        return cached[0]

    from qiskit_ibm_runtime import QiskitRuntimeService

    kwargs: dict[str, Any] = {"channel": ibm_channel, "token": ibm_token}
    if ibm_instance:
        kwargs["instance"] = ibm_instance

    service = QiskitRuntimeService(**kwargs)
    backend = service.backend(backend_name)
    _BACKEND_CACHE[cache_key] = (backend, _time.monotonic())
    return backend


def _get_ibm_fake_backend(backend_name: str) -> Any:
    """
    FALLBACK ONLY. Returns a GenericBackendV2 with the correct native
    2-qubit gate for the target backend's processor family.
    """
    if backend_name in ("aer_simulator", "simulator", "local", "basic_simulator", "spinq"):
        return None

    print(
        f"[transpile-ibm] WARNING: Using GenericBackendV2 fallback for '{backend_name}'. "
        "Coupling map is RANDOM — qubit routing will not match the real QPU. "
        "Provide IBM credentials for correct ISA transpilation."
    )
    from qiskit.providers.fake_provider import GenericBackendV2
    n_qubits = _IBM_BACKEND_QUBIT_COUNT.get(backend_name, _DEFAULT_QUBIT_COUNT)
    basis_gates = _basis_gates_for(backend_name)
    return GenericBackendV2(num_qubits=n_qubits, basis_gates=basis_gates)


@app.post(
    "/transpile-ibm",
    response_model=TranspileIbmResponse,
    responses={
        422: {"description": "Validation or conversion error"},
        500: {"description": "Runtime error during transpilation"},
    },
)
async def transpile_ibm(req: TranspileIbmRequest):
    """
    Convert a circuit to an IBM-QPU-executable ISA circuit for the selected backend.

    Per-QPU transpilation pipeline:
      Input code (QASM / Qiskit Python)
                ↓
      Parse → Qiskit QuantumCircuit
                ↓
      [A] QiskitRuntimeService(token).backend(req.backend)
           └─ Real backend with EXACT coupling map + calibration for THIS machine
                ↓
      qiskit.transpile(qc, backend=real_backend, optimization_level=1)
           └─ ISA-compliant QASM 3 (gates native to this QPU, routing
              using only connected qubit pairs on this physical device)
                ↓
      IBM Qiskit Runtime Sampler

    Backends in the same family (e.g. ibm_fez / ibm_kingston / ibm_marrakesh,
    all Heron r2 156q) are still different physical machines with different
    coupling maps.  The backend name is therefore treated as the EXACT
    compilation target — not as a family hint.

    Fallback (no credentials): GenericBackendV2 with correct basis gates but
    random coupling map. Gate decomposition is correct; routing is NOT.
    """
    if not req.code.strip():
        raise HTTPException(
            status_code=422,
            detail={"errorCode": "VALIDATION_SYNTAX", "message": "Empty circuit input."},
        )

    # Wait for a concurrency slot (queue up instead of crashing under load)
    try:
        await asyncio.wait_for(_sim_semaphore.acquire(), timeout=_SIM_QUEUE_TIMEOUT)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=503,
            detail={
                "errorCode": "SERVICE_BUSY",
                "message": "The simulation service is currently busy. Please try again in a moment.",
            },
        )

    try:
        # -----------------------------------------------------------------------
        # Step 1: Convert input to a Qiskit QuantumCircuit
        # -----------------------------------------------------------------------
        if req.codeType in ("cirq", "pennylane", "braket", "tket"):
            raise HTTPException(
                status_code=422,
                detail={
                    "errorCode": "UNSUPPORTED_FRAMEWORK",
                    "message": (
                        f"Framework '{req.codeType}' is not supported for IBM QPU execution yet. "
                        "Please convert your circuit to OpenQASM 2/3 or Qiskit Python first."
                    ),
                },
            )

        qc = None

        if req.codeType == "qasm":
            try:
                qc = _parse_qasm(req.code)
            except Exception as exc:
                raise HTTPException(
                    status_code=422,
                    detail={"errorCode": "VALIDATION_SYNTAX", "message": _sanitize(str(exc))},
                )

        elif req.codeType == "python":
            # Sandboxed exec — same as the /simulate Python path.
            try:
                compiled = compile(req.code, "<user_circuit>", "exec")
            except SyntaxError as exc:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "errorCode": "VALIDATION_SYNTAX",
                        "message": f"Python syntax error on line {exc.lineno}: {exc.msg}",
                    },
                )

            namespace: dict = {"__builtins__": _SAFE_BUILTINS}
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

            qc = namespace.get("qc")
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
                from qiskit import QuantumCircuit as QC
                if not isinstance(qc, QC):
                    raise HTTPException(
                        status_code=422,
                        detail={
                            "errorCode": "VALIDATION_NO_CIRCUIT",
                            "message": f"'qc' must be a QuantumCircuit, got {type(qc).__name__}.",
                        },
                    )
            except ImportError:
                pass

        if qc is None:
            raise HTTPException(
                status_code=500,
                detail={"errorCode": "EXECUTION_RUNTIME_ERROR", "message": "No circuit was produced."},
            )

        # -----------------------------------------------------------------------
        # Step 2: Per-QPU transpilation
        # -----------------------------------------------------------------------
        #
        # Every IBM backend is a unique physical machine. Even backends in the
        # same processor family (same qubit count, same native gate) have
        # different coupling maps, error rates, and calibration data.
        #
        # Strategy:
        #   A (correct): QiskitRuntimeService(token).backend(name)
        #      └─ Fetches the LIVE backend with its exact coupling map and
        #         calibration. Transpilation produces a circuit that is
        #         guaranteed to route correctly on THIS specific QPU.
        #
        #   B (fallback — routing WILL be wrong):
        #      GenericBackendV2 with the correct native 2Q gate (ecr/cz) but
        #      a RANDOM coupling map. Gate decomposition is correct; qubit
        #      routing is unreliable. Use only for local testing.
        try:
            from qiskit import transpile

            backend = None

            # --- Path A: real backend (correct coupling map per QPU) ---
            if req.ibm_token and req.ibm_channel:
                try:
                    print(
                        f"[transpile-ibm] Fetching real backend '{req.backend}' "
                        f"via {req.ibm_channel} (coupling map is QPU-specific)..."
                    )
                    backend = _get_real_backend_cached(
                        req.ibm_channel, req.ibm_token, req.ibm_instance, req.backend
                    )
                    print(
                        f"[transpile-ibm] Real backend loaded. "
                        f"Qubits: {backend.num_qubits}, "
                        f"Basis: {list(backend.operation_names)}"
                    )
                except Exception as e:
                    print(
                        f"[transpile-ibm] Could not load real backend '{req.backend}': {e}. "
                        f"Falling back to GenericBackendV2 (routing will be approximate)."
                    )
                    backend = None

            # --- Path B: fallback (basis gates correct, coupling map random) ---
            if backend is None:
                backend = _get_ibm_fake_backend(req.backend)

            transpiled = transpile(
                qc,
                backend=backend,
                optimization_level=1,
            )
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail={"errorCode": "TRANSPILATION_ERROR", "message": _sanitize(str(exc))},
            )

        # -----------------------------------------------------------------------
        # Step 3: Serialise transpiled circuit to OpenQASM 3
        # -----------------------------------------------------------------------
        try:
            from qiskit import qasm3
            transpiled_qasm = qasm3.dumps(transpiled)
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail={"errorCode": "TRANSPILATION_ERROR", "message": _sanitize(str(exc))},
            )

        metadata = {
            "backend": req.backend,
            "depth": transpiled.depth(),
            "width": transpiled.width(),
            "size": transpiled.size(),
            "codeType": req.codeType,
        }

        return TranspileIbmResponse(transpiled_qasm=transpiled_qasm, metadata=metadata)
    finally:
        _sim_semaphore.release()


# ---------------------------------------------------------------------------
# Transparent Transpilation Trace Engine Schemas and Callback
# ---------------------------------------------------------------------------

class TranspileTraceRequest(BaseModel):
    code: str = Field(..., description="Circuit source code")
    codeType: Literal["qasm", "python", "cirq", "pennylane", "braket", "tket"] = Field(
        "qasm", description="Framework / format of the input code"
    )
    backend: str = Field("ibm_brisbane", description="Target IBM backend name (used for ISA transpilation)")
    ibm_token: str | None = Field(None, description="Raw IBM API key or IBM Quantum token")
    ibm_channel: str | None = Field(None, description="'ibm_quantum' or 'ibm_cloud'")
    ibm_instance: str | None = Field(None, description="CRN for IBM Cloud, or hub/group/project for IBM Quantum")
    optimization_level: int = Field(1, ge=0, le=3, description="Qiskit transpilation optimization level (0-3)")


class TranspilePassTrace(BaseModel):
    passName: str
    passClass: str
    # 'AnalysisPass' | 'TransformationPass'
    passType: str = "TransformationPass"
    stage: str
    executionTimeMs: float
    # QASM state AFTER this pass executes
    qasm: str
    # QASM state BEFORE this pass executes (captured in collector)
    qasmBefore: str
    # Gate count / depth AFTER this pass
    gateCount: int
    depth: int
    # Signed deltas (0 for AnalysisPass by definition)
    deltaGates: int
    deltaDepth: int
    purpose: str
    rationale: str
    pipelineReason: str | None = None
    changedGates: list[str]
    # Was the circuit DAG actually structurally changed by this pass?
    # Always False for AnalysisPass.
    circuitChanged: bool
    # 1Q / 2Q / multi-Q gate counts AFTER pass
    oneQGates: int
    twoQGates: int
    multiQGates: int
    # 1Q / 2Q / multi-Q gate counts BEFORE pass
    oneQGatesBefore: int
    twoQGatesBefore: int
    multiQGatesBefore: int
    # DAG snapshot before/after — populated for Optimization passes; None otherwise
    dagBefore: dict | None = None
    dagAfter: dict | None = None
    # GNN-ready feature dictionary for future optimization pass prediction research
    gnnFeatures: dict | None = None
    # Human-readable description of what circuit pattern the pass found (if reliably inferable)
    patternFound: str | None = None


class TranspileStageSummary(BaseModel):
    stageName: str
    # Qiskit's internal stage concept for this canonical stage
    qiskitConcept: str
    passes: list[TranspilePassTrace]
    gateCountBefore: int
    gateCountAfter: int
    depthBefore: int
    depthAfter: int
    executionTimeMs: float
    # 1Q / 2Q gate counts at stage boundaries
    oneQGatesBefore: int
    twoQGatesBefore: int
    oneQGatesAfter: int
    twoQGatesAfter: int
    # Stage-level DAG snapshots
    dagBefore: dict | None = None
    dagAfter: dict | None = None
    # Stage-specific fields
    swapCount: int = 0          # Routing: number of SWAP gates inserted
    mappingTable: dict | None = None  # Qubit Mapping: logical->physical dict
    schedulingActive: bool = False    # Scheduling: whether timing was applied
    schedulingMethod: str | None = None


class TranspileTraceResponse(BaseModel):
    originalQasm: str
    finalQasm: str
    originalGateCount: int
    originalDepth: int
    originalOneQGates: int
    originalTwoQGates: int
    originalMultiQGates: int
    originalMeasurements: int
    originalQubits: int
    originalClassicalBits: int
    finalGateCount: int
    finalDepth: int
    finalOneQGates: int
    finalTwoQGates: int
    finalSwapCount: int
    totalExecutionTimeMs: float
    stages: list[TranspileStageSummary]
    couplingMap: list[list[int]] | None = None
    logicalToPhysicalLayout: dict[str, int] | None = None
    # Initial DAG (original circuit before all transpilation)
    initialDag: dict | None = None
    # Final DAG (after all transpilation)
    finalDag: dict | None = None
    # Kept for backwards compatibility
    dag: dict | None = None
    # Backend metadata
    backendNumQubits: int | None = None
    backendBasisGates: list[str] | None = None
    optimizationLevel: int = 1
    schedulingActive: bool = False


# Maps Qiskit Pass Name to one of the 6 canonical educational stages
# Canonical stage names (user-facing)
STAGE_CIRCUIT_ANALYSIS = "Circuit Analysis"
STAGE_QUBIT_MAPPING = "Qubit Mapping"
STAGE_ROUTING = "Routing"
STAGE_GATE_DECOMPOSITION = "Gate Decomposition & Basis Conversion"
STAGE_OPTIMIZATION = "Optimization"
STAGE_SCHEDULING = "Scheduling"

# Maps Qiskit's internal stage concept to canonical name for display
QISKIT_STAGE_CONCEPT = {
    STAGE_CIRCUIT_ANALYSIS: "INIT / analysis and preparation",
    STAGE_QUBIT_MAPPING: "LAYOUT",
    STAGE_ROUTING: "ROUTING",
    STAGE_GATE_DECOMPOSITION: "TRANSLATION",
    STAGE_OPTIMIZATION: "OPTIMIZATION",
    STAGE_SCHEDULING: "SCHEDULING",
}

PASS_STAGE_MAP = {
    # Circuit Analysis
    "CheckMap": STAGE_CIRCUIT_ANALYSIS,
    "CheckGate": STAGE_CIRCUIT_ANALYSIS,
    "Depth": STAGE_CIRCUIT_ANALYSIS,
    "Size": STAGE_CIRCUIT_ANALYSIS,
    "Width": STAGE_CIRCUIT_ANALYSIS,
    "CountOps": STAGE_CIRCUIT_ANALYSIS,
    "CheckCXDirection": STAGE_CIRCUIT_ANALYSIS,
    "CheckNothing": STAGE_CIRCUIT_ANALYSIS,
    "FixedPoint": STAGE_CIRCUIT_ANALYSIS,
    # Qubit Mapping
    "TrivialLayout": STAGE_QUBIT_MAPPING,
    "DenseLayout": STAGE_QUBIT_MAPPING,
    "SabreLayout": STAGE_QUBIT_MAPPING,
    "VF2Layout": STAGE_QUBIT_MAPPING,
    "VF2PostLayout": STAGE_QUBIT_MAPPING,
    "SetLayout": STAGE_QUBIT_MAPPING,
    "FullAncillaAllocation": STAGE_QUBIT_MAPPING,
    "EnlargeWithAncilla": STAGE_QUBIT_MAPPING,
    "ApplyLayout": STAGE_QUBIT_MAPPING,
    # Routing
    "BasicSwap": STAGE_ROUTING,
    "StochasticSwap": STAGE_ROUTING,
    "SabreSwap": STAGE_ROUTING,
    "SwapMapper": STAGE_ROUTING,
    "LookaheadSwap": STAGE_ROUTING,
    # Gate Decomposition & Basis Conversion
    "BasisTranslator": STAGE_GATE_DECOMPOSITION,
    "Decompose": STAGE_GATE_DECOMPOSITION,
    "UnrollCustomDefinitions": STAGE_GATE_DECOMPOSITION,
    "UnitarySynthesis": STAGE_GATE_DECOMPOSITION,
    "TranslateParameterizedGates": STAGE_GATE_DECOMPOSITION,
    "GateDirection": STAGE_GATE_DECOMPOSITION,
    "BarrierBeforeFinalMeasurements": STAGE_GATE_DECOMPOSITION,
    # Optimization
    "Optimize1qGates": STAGE_OPTIMIZATION,
    "Optimize1qGatesDecomposition": STAGE_OPTIMIZATION,
    "Optimize1qGatesSimpleCollapse": STAGE_OPTIMIZATION,
    "CXCancellation": STAGE_OPTIMIZATION,
    "CommutativeCancellation": STAGE_OPTIMIZATION,
    "CommutationAnalysis": STAGE_OPTIMIZATION,
    "Collect2qBlocks": STAGE_OPTIMIZATION,
    "ConsolidateBlocks": STAGE_OPTIMIZATION,
    "InverseCancellation": STAGE_OPTIMIZATION,
    "RemoveResetInZeroState": STAGE_OPTIMIZATION,
    "RemoveDiagonalGatesBeforeMeasure": STAGE_OPTIMIZATION,
    "OptimizeCliffords": STAGE_OPTIMIZATION,
    "NormalizeRXAngle": STAGE_OPTIMIZATION,
    "ResetAfterMeasureSimplification": STAGE_OPTIMIZATION,
    "ContractIdleWiresAfterReset": STAGE_OPTIMIZATION,
    # Scheduling
    "ALAPScheduleAnalysis": STAGE_SCHEDULING,
    "ASAPScheduleAnalysis": STAGE_SCHEDULING,
    "ALAPSchedule": STAGE_SCHEDULING,
    "ASAPSchedule": STAGE_SCHEDULING,
    "DynamicalDecoupling": STAGE_SCHEDULING,
    "PadDelay": STAGE_SCHEDULING,
    "PadDynamicalDecoupling": STAGE_SCHEDULING,
    "ConstrainedReschedule": STAGE_SCHEDULING,
}


def _determine_stage(pass_name: str) -> str:
    if pass_name in PASS_STAGE_MAP:
        return PASS_STAGE_MAP[pass_name]
    name_lower = pass_name.lower()
    if "check" in name_lower or "verify" in name_lower or "analyze" in name_lower or "analysis" in name_lower:
        return STAGE_CIRCUIT_ANALYSIS
    elif "layout" in name_lower or "placement" in name_lower or "ancilla" in name_lower:
        return STAGE_QUBIT_MAPPING
    elif "swap" in name_lower or "route" in name_lower or "routing" in name_lower:
        return STAGE_ROUTING
    elif "schedule" in name_lower or "delay" in name_lower or "dynamical" in name_lower:
        return STAGE_SCHEDULING
    elif "translate" in name_lower or "decompose" in name_lower or "unroll" in name_lower or "basis" in name_lower:
        return STAGE_GATE_DECOMPOSITION
    return STAGE_OPTIMIZATION


PASS_EXPLANATIONS = {
    "Optimize1qGatesDecomposition": {
        "purpose": "Combines sequences of single-qubit gates on the same qubit into a more compact equivalent.",
        "rationale": "Consecutive single-qubit gates are mathematically equivalent to a single rotation. Merging them reduces gate execution time and overall error rate.",
        "pipelineReason": "This pass is part of the single-qubit gate optimization pipeline configured for the current optimization level.",
    },
    "Optimize1qGates": {
        "purpose": "Optimizes single-qubit gate sequences by merging consecutive rotations.",
        "rationale": "Multiple consecutive single-qubit rotations on the same qubit can always be merged into at most one rotation. This reduces circuit depth and error accumulation.",
        "pipelineReason": "This pass is included in the optimization pipeline to reduce single-qubit gate overhead.",
    },
    "CXCancellation": {
        "purpose": "Eliminates adjacent pairs of CNOT (CX) gates that cancel each other.",
        "rationale": "Executing CX twice in succession on the same qubits acts as an identity (does nothing). Removing them avoids unnecessary two-qubit gate errors.",
        "pipelineReason": "This pass is included because CX pairs can appear after routing or decomposition steps.",
    },
    "CommutativeCancellation": {
        "purpose": "Commutes gates through each other to find and cancel redundant pairs.",
        "rationale": "Some gates (like Z rotations and CNOT targets) commute mathematically. Sliding them past each other can reveal cancellations not immediately adjacent.",
        "pipelineReason": "This pass runs after CommutationAnalysis to exploit gate commutativity for additional cancellations.",
    },
    "CommutationAnalysis": {
        "purpose": "Analyzes which gates in the circuit can be commuted through each other without changing the circuit's effect.",
        "rationale": "This pass builds a commutation graph as preparation for CommutativeCancellation. It does not modify the circuit itself.",
        "pipelineReason": "Required as a pre-processing step before CommutativeCancellation can run.",
    },
    "Collect2qBlocks": {
        "purpose": "Groups consecutive two-qubit gates into blocks for joint optimization.",
        "rationale": "Collecting adjacent two-qubit gates into a block allows the compiler to replace the entire block with a more efficient sequence.",
        "pipelineReason": "This pass prepares blocks for ConsolidateBlocks to process together.",
    },
    "ConsolidateBlocks": {
        "purpose": "Replaces two-qubit gate blocks (identified by Collect2qBlocks) with optimized unitaries.",
        "rationale": "Two-qubit gate sequences can often be re-synthesized as shorter sequences. The unitary of the block is computed and re-decomposed more efficiently.",
        "pipelineReason": "This pass runs after Collect2qBlocks and performs the actual block-level optimization.",
    },
    "InverseCancellation": {
        "purpose": "Finds and removes pairs of inverse gates that cancel each other.",
        "rationale": "If a gate G is followed by its inverse G†, their combined effect is identity (nothing happens). Removing both reduces the circuit.",
        "pipelineReason": "This pass is included to catch gate-inverse pairs that may have been introduced during decomposition or routing.",
    },
    "RemoveResetInZeroState": {
        "purpose": "Removes Reset operations when the qubit is already guaranteed to be in state |0>.",
        "rationale": "Resetting a qubit already in |0> is a no-op. Removing it reduces circuit depth without changing functionality.",
        "pipelineReason": "Included as a lightweight cleanup pass to remove unnecessary reset operations.",
    },
    "RemoveDiagonalGatesBeforeMeasure": {
        "purpose": "Removes diagonal gates immediately before a measurement if they do not affect the measurement outcome.",
        "rationale": "Computational basis measurements cannot distinguish states that differ only by a phase. Diagonal gates (like Z, S, T, RZ) before measurement can be safely removed.",
        "pipelineReason": "Included to eliminate gates that have no effect on measurement probability distributions.",
    },
    "NormalizeRXAngle": {
        "purpose": "Normalizes the angles of RX gates to a canonical range.",
        "rationale": "Ensures consistent angle representation to enable subsequent optimization passes to recognize and cancel equivalent gates.",
        "pipelineReason": "Included as a normalization step before angle-based optimization passes.",
    },
    "BasisTranslator": {
        "purpose": "Decomposes non-native gates into the target hardware's native gate set.",
        "rationale": "Quantum hardware only implements a small set of physical gates (e.g. ECR, RZ, SX, X). Other gates (like H) must be decomposed into equivalent sequences of native gates.",
        "pipelineReason": "This pass is the primary gate decomposition step, required to make the circuit executable on the target hardware.",
    },
    "UnrollCustomDefinitions": {
        "purpose": "Replaces custom-defined gates with their explicit decompositions.",
        "rationale": "User-defined or library gates must be expanded before basis translation, since the hardware has no knowledge of high-level gate abstractions.",
        "pipelineReason": "Runs before BasisTranslator to ensure all gates have known decompositions.",
    },
    "Decompose": {
        "purpose": "Decomposes composite gates into their constituent primitive gates.",
        "rationale": "Multi-gate composite instructions must be decomposed into primitive operations that can be further processed by subsequent passes.",
        "pipelineReason": "Included as a generic decomposition step for gates that have explicit decomposition rules.",
    },
    "UnitarySynthesis": {
        "purpose": "Synthesizes arbitrary unitary matrices into native gate sequences.",
        "rationale": "When a gate cannot be decomposed via simple rules, its full unitary matrix is synthesized directly into an optimal native gate sequence.",
        "pipelineReason": "Included to handle gates that require full unitary synthesis for basis conversion.",
    },
    "GateDirection": {
        "purpose": "Corrects the direction of two-qubit gates to match hardware coupling direction.",
        "rationale": "Some hardware backends only support two-qubit gates in one direction (e.g. CX from qubit A to B but not B to A). This pass adds conjugating gates to flip direction when needed.",
        "pipelineReason": "Required after routing to ensure all gate directions are physically realizable on the hardware.",
    },
    "SabreLayout": {
        "purpose": "Finds a high-quality initial mapping of logical qubits to physical hardware qubits.",
        "rationale": "A good initial placement minimizes the number of SWAP gates required later. SABRE uses a heuristic look-ahead algorithm to find near-optimal placements.",
        "pipelineReason": "This is the default layout (qubit placement) strategy selected by the current transpiler configuration.",
    },
    "VF2Layout": {
        "purpose": "Attempts to find an isomorphic subgraph mapping between the logical circuit and hardware topology.",
        "rationale": "If the two-qubit interaction pattern of the circuit can be matched exactly to a connected subgraph of the hardware, no SWAP gates are needed for routing.",
        "pipelineReason": "Included as the preferred layout strategy; falls back to SabreLayout if no isomorphic mapping exists.",
    },
    "TrivialLayout": {
        "purpose": "Maps logical qubit i directly to physical qubit i.",
        "rationale": "The simplest possible qubit mapping. Suitable for circuits that already match the hardware connectivity or for benchmarking purposes.",
        "pipelineReason": "Selected as the layout strategy for optimization level 0 or when a simple mapping is explicitly requested.",
    },
    "ApplyLayout": {
        "purpose": "Applies the chosen qubit layout by relabeling qubit references throughout the circuit.",
        "rationale": "After a layout pass selects which physical qubits to use, this pass updates all gate references to use the physical qubit indices.",
        "pipelineReason": "Runs immediately after any Layout pass to apply the selected physical qubit assignment.",
    },
    "FullAncillaAllocation": {
        "purpose": "Allocates ancilla (auxiliary) qubits from the physical backend register.",
        "rationale": "If the circuit uses fewer qubits than the hardware has, this pass assigns the unused physical qubits as ancilla for potential use in routing.",
        "pipelineReason": "Runs as part of the layout stage to fully utilize the available physical qubit register.",
    },
    "EnlargeWithAncilla": {
        "purpose": "Expands the quantum register to include ancilla qubits allocated by FullAncillaAllocation.",
        "rationale": "After ancilla allocation, the circuit register must be enlarged to include those physical qubits so subsequent passes can route through them.",
        "pipelineReason": "Runs after FullAncillaAllocation as a register expansion step.",
    },
    "SabreSwap": {
        "purpose": "Inserts SWAP gates to route logical qubit states next to each other for two-qubit operations.",
        "rationale": "Hardware only allows two-qubit gates between directly connected physical qubits. SWAP gates move qubit states along the hardware topology until the required qubits are adjacent.",
        "pipelineReason": "This is the default SWAP-based routing strategy selected by the current transpiler configuration.",
    },
    "BasicSwap": {
        "purpose": "Inserts SWAP gates using a simple greedy strategy to resolve connectivity constraints.",
        "rationale": "A straightforward but potentially non-optimal routing strategy that inserts SWAPs greedily. Used at low optimization levels.",
        "pipelineReason": "Selected as the routing strategy for optimization level 0.",
    },
    "ALAPSchedule": {
        "purpose": "Schedules gate execution times As-Late-As-Possible.",
        "rationale": "Delays operations as long as possible so qubits remain in their ground state |0> before execution, minimizing T1/T2 decoherence errors.",
        "pipelineReason": "Included when ALAP scheduling is selected or required by dynamical decoupling configuration.",
    },
    "ASAPSchedule": {
        "purpose": "Schedules gate execution times As-Soon-As-Possible.",
        "rationale": "Executes gates immediately to minimize total circuit duration, reducing exposure time to decoherence.",
        "pipelineReason": "Included when ASAP scheduling is selected in the transpiler configuration.",
    },
    "DynamicalDecoupling": {
        "purpose": "Inserts dynamical decoupling sequences (e.g. X-X pulse pairs) into idle qubit periods.",
        "rationale": "Idle qubits decohere over time. Inserting carefully timed refocusing pulses suppresses phase errors caused by environmental noise during idle periods.",
        "pipelineReason": "Included when dynamical decoupling is enabled in the scheduling configuration.",
    },
    "BarrierBeforeFinalMeasurements": {
        "purpose": "Inserts a barrier instruction before all measurement operations.",
        "rationale": "Ensures the compiler does not reorder gates across measurement boundaries, which could change measurement semantics.",
        "pipelineReason": "Added as a correctness constraint during the translation/decomposition stage.",
    },
}


def _get_pass_explanation(pass_name: str, stage: str) -> tuple[str, str, str]:
    """Returns (purpose, rationale, pipelineReason) for a given pass."""
    if pass_name in PASS_EXPLANATIONS:
        exp = PASS_EXPLANATIONS[pass_name]
        return exp["purpose"], exp["rationale"], exp.get("pipelineReason", "This pass is part of the transpiler pipeline configured for the current settings.")
    
    # Generic stage-based explanations
    if stage == STAGE_CIRCUIT_ANALYSIS:
        return (
            "Analyzes circuit properties such as depth, gate count, or layout correctness.",
            "Ensures the circuit is structurally valid and collects metrics needed for subsequent compilation stages.",
            "This pass is part of the circuit analysis and preparation pipeline.",
        )
    elif stage == STAGE_GATE_DECOMPOSITION:
        return (
            "Translates or decomposes gates into the target hardware's native gate set.",
            "Decomposes gates into basis operations physically supported by the target device.",
            "This pass is part of the gate decomposition and basis conversion pipeline.",
        )
    elif stage == STAGE_QUBIT_MAPPING:
        return (
            "Maps logical (virtual) qubits to physical hardware qubits.",
            "Prepares the circuit for the physical coupling constraints of the target hardware by assigning logical to physical qubit indices.",
            "This pass is part of the qubit mapping (layout) pipeline.",
        )
    elif stage == STAGE_ROUTING:
        return (
            "Inserts SWAP gates to satisfy hardware connectivity constraints.",
            "Allows two-qubit gates to execute between non-adjacent physical qubits by moving qubit states via SWAP chains.",
            "This pass is part of the routing pipeline.",
        )
    elif stage == STAGE_SCHEDULING:
        return (
            "Computes gate execution times and assigns timing instructions.",
            "Determines when each gate should execute to balance parallelism and minimize decoherence during idle periods.",
            "This pass is part of the scheduling pipeline.",
        )
    return (
        "Optimizes circuit gates, depth, or structure.",
        "Reduces the circuit's resource footprint to improve execution fidelity on hardware.",
        "This pass is part of the optimization pipeline configured for the current optimization level.",
    )


def _diff_gates(ops_before: dict[str, int], ops_after: dict[str, int]) -> list[str]:
    changed = []
    all_keys = set(ops_before.keys()) | set(ops_after.keys())
    for k in all_keys:
        before = ops_before.get(k, 0)
        after = ops_after.get(k, 0)
        diff = after - before
        if diff != 0:
            sign = "+" if diff > 0 else ""
            changed.append(f"{k}: {sign}{diff}")
    return sorted(changed)


def _serialize_dag(circuit) -> dict:
    if circuit is None:
        return {"nodes": [], "edges": []}
    try:
        from qiskit.converters import circuit_to_dag
        from qiskit.dagcircuit import DAGOpNode, DAGInNode, DAGOutNode
        dag = circuit_to_dag(circuit)
        
        nodes = []
        edges = []
        node_id_map = {}
        
        for idx, node in enumerate(dag.nodes()):
            node_id = f"node_{idx}"
            node_id_map[node] = node_id
            
            label = "Gate"
            type_ = "gate"
            qubits_str = ""
            
            if isinstance(node, DAGOpNode):
                type_ = "gate"
                if hasattr(node, 'op') and hasattr(node.op, 'name'):
                    label = node.op.name.upper()
                elif hasattr(node, 'name'):
                    label = str(node.name).upper()
                else:
                    label = "OP"
                    
                if hasattr(node, 'qargs') and node.qargs:
                    q_indices = []
                    for q in node.qargs:
                        if hasattr(q, '_index') and q._index is not None:
                            q_indices.append(f"q[{q._index}]")
                        elif hasattr(circuit, 'find_bit'):
                            try:
                                q_indices.append(f"q[{circuit.find_bit(q).index}]")
                            except Exception:
                                q_indices.append(str(q))
                        else:
                            q_indices.append(str(q))
                    qubits_str = ", ".join(q_indices)
                    
            elif isinstance(node, DAGInNode):
                type_ = "in"
                wire = getattr(node, 'wire', None)
                if wire:
                    if hasattr(wire, '_index') and wire._index is not None:
                        label = f"In: q[{wire._index}]"
                    elif hasattr(circuit, 'find_bit'):
                        try:
                            label = f"In: q[{circuit.find_bit(wire).index}]"
                        except Exception:
                            label = f"In: {wire}"
                    else:
                        label = f"In: {wire}"
                else:
                    label = "In"
            elif isinstance(node, DAGOutNode):
                type_ = "out"
                wire = getattr(node, 'wire', None)
                if wire:
                    if hasattr(wire, '_index') and wire._index is not None:
                        label = f"Out: q[{wire._index}]"
                    elif hasattr(circuit, 'find_bit'):
                        try:
                            label = f"Out: q[{circuit.find_bit(wire).index}]"
                        except Exception:
                            label = f"Out: {wire}"
                    else:
                        label = f"Out: {wire}"
                else:
                    label = "Out"
            elif hasattr(node, 'type'):
                if node.type == "op":
                    label = getattr(node, 'name', 'Gate').upper()
                    type_ = "gate"
                elif node.type == "in":
                    label = "In"
                    type_ = "in"
                elif node.type == "out":
                    label = "Out"
                    type_ = "out"
            else:
                label = getattr(node, 'name', 'Gate').upper() if hasattr(node, 'name') else "Gate"
                
            nodes.append({
                "id": node_id,
                "label": label,
                "type": type_,
                "qubits": qubits_str
            })
            
        for edge in dag.edges():
            try:
                if isinstance(edge, tuple):
                    src_node = edge[0]
                    dest_node = edge[1]
                    wire = edge[2] if len(edge) > 2 else None
                else:
                    src_node = getattr(edge, 'src', None)
                    dest_node = getattr(edge, 'dest', None)
                    wire = getattr(edge, 'wire', None)
                    
                if src_node in node_id_map and dest_node in node_id_map:
                    src_id = node_id_map[src_node]
                    dest_id = node_id_map[dest_node]
                    
                    wire_label = ""
                    if wire:
                        if hasattr(wire, '_index') and wire._index is not None:
                            wire_label = f"q[{wire._index}]"
                        elif hasattr(circuit, 'find_bit'):
                            try:
                                wire_label = f"q[{circuit.find_bit(wire).index}]"
                            except Exception:
                                wire_label = str(wire)
                        else:
                            reg_name = getattr(wire.register, 'name', 'q') if hasattr(wire, 'register') and wire.register else 'q'
                            idx_val = getattr(wire, 'index', 0)
                            wire_label = f"{reg_name}[{idx_val}]"
                        
                    edges.append({
                        "source": src_id,
                        "target": dest_id,
                        "label": wire_label
                    })
            except Exception:
                pass
                
        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        print(f"[transpile-trace] Failed to serialize DAG: {e}")
        return {"nodes": [], "edges": []}


def _safe_qasm_dump(circ) -> str:
    """
    Safely dumps a circuit to OpenQASM 3 / OpenQASM 2 text.
    Handles circuits containing physical or anonymous qubits without throwing QASM3ExporterError.
    """
    if circ is None:
        return ""
    try:
        from qiskit import qasm3
        return qasm3.dumps(circ)
    except Exception:
        pass

    try:
        from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister
        from qiskit import qasm3
        
        num_qubits = len(circ.qubits)
        num_clbits = len(circ.clbits)
        
        qr = QuantumRegister(num_qubits, "q")
        cr = ClassicalRegister(num_clbits, "c") if num_clbits > 0 else None
        
        safe_circ = QuantumCircuit(qr)
        if cr:
            safe_circ.add_register(cr)
            
        qubit_map = {q: qr[i] for i, q in enumerate(circ.qubits)}
        clbit_map = {c: cr[i] for i, c in enumerate(circ.clbits)} if cr else {}
        
        for inst in circ.data:
            safe_inst_qubits = [qubit_map[q] for q in inst.qubits if q in qubit_map]
            safe_inst_clbits = [clbit_map[c] for c in inst.clbits if c in clbit_map]
            safe_circ.append(inst.operation, safe_inst_qubits, safe_inst_clbits)
            
        return qasm3.dumps(safe_circ)
    except Exception as e:
        print(f"[transpile-trace] safe_qasm_dump qasm3 fallback failed: {e}")

    try:
        from qiskit import qasm2
        return qasm2.dumps(circ)
    except Exception:
        pass

    try:
        return str(circ.draw(output='text'))
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Helper: count 1Q / 2Q / multi-Q gates and measurements from ops dict
# ---------------------------------------------------------------------------

_KNOWN_1Q_GATES = frozenset({
    'h', 'x', 'y', 'z', 's', 't', 'sdg', 'tdg', 'sx', 'sxdg',
    'rx', 'ry', 'rz', 'r', 'u1', 'u2', 'u3', 'u', 'p', 'id', 'i', 'reset',
    'rxx', 'ryy', 'rzz',  # these are actually 2Q but listed for completeness
})

_KNOWN_2Q_GATES = frozenset({
    'cx', 'cy', 'cz', 'ch', 'cp', 'cs', 'csdg', 'csx', 'csx',
    'ecr', 'dcx', 'swap', 'iswap', 'rzx', 'rxx', 'ryy', 'rzz',
    'cnot',
})


def _count_gate_types(circuit) -> tuple[int, int, int, int]:
    """Return (one_q, two_q, multi_q, measurements) for a circuit."""
    one_q = 0
    two_q = 0
    multi_q = 0
    measurements = 0
    try:
        for inst in circuit.data:
            gate_name = inst.operation.name.lower()
            num_qubits = len(inst.qubits)
            if gate_name == 'measure':
                measurements += 1
            elif gate_name == 'barrier':
                pass
            elif num_qubits == 1:
                one_q += 1
            elif num_qubits == 2:
                two_q += 1
            elif num_qubits >= 3:
                multi_q += 1
    except Exception:
        pass
    return one_q, two_q, multi_q, measurements


# ---------------------------------------------------------------------------
# Helper: detect AnalysisPass vs TransformationPass from Qiskit base classes
# ---------------------------------------------------------------------------

def _get_pass_type(pass_) -> str:
    """
    Safely detect whether a Qiskit pass is an AnalysisPass (read-only inspection
    of the DAG) or a TransformationPass (modifies the DAG).

    AnalysisPass  → updates the property-set, NEVER modifies the DAG.
    TransformationPass → may or may not modify the DAG (checked by diff after).

    Returns 'AnalysisPass' or 'TransformationPass'.
    """
    # Try the standard Qiskit import path (works for Qiskit >= 0.39)
    for module_path in (
        "qiskit.transpiler.basepasses",
        "qiskit.transpiler",
        "qiskit.passmanager",
    ):
        try:
            mod = __import__(module_path, fromlist=["AnalysisPass", "TransformationPass"])
            ap = getattr(mod, "AnalysisPass", None)
            tp = getattr(mod, "TransformationPass", None)
            if ap is not None and isinstance(pass_, ap):
                return "AnalysisPass"
            if tp is not None and isinstance(pass_, tp):
                return "TransformationPass"
        except Exception:
            continue
    # Heuristic fallback based on known pass-class names
    cn = pass_.__class__.__name__
    if any(cn == n for n in (
        "Size", "Depth", "Width", "CheckMap", "CheckGates", "CheckGate",
        "CheckCXDirection", "CheckCalibrationFixed",
        "CountOps", "CountOpsLongest", "NumTensors", "NumQubits",
        "DAGLongestPath", "DAGSize",
        "CollectLinearFunctions", "CollectCliffords",
        "ContainsInstruction",
    )):
        return "AnalysisPass"
    # Last resort: Qiskit analysis passes typically do not override `run()` to return a DAG
    return "TransformationPass"


def _extract_gnn_features(circuit, dag_data: dict | None) -> dict:
    """Extract GNN-ready feature dictionary from a circuit and its DAG data."""
    try:
        one_q, two_q, multi_q, measurements = _count_gate_types(circuit)
        node_count = len(dag_data.get('nodes', [])) if dag_data else 0
        edge_count = len(dag_data.get('edges', [])) if dag_data else 0
        gate_nodes = [
            n for n in (dag_data.get('nodes', []) if dag_data else [])
            if n.get('type') == 'gate'
        ]
        return {
            "nodeCount": node_count,
            "edgeCount": edge_count,
            "dagDepth": circuit.depth(),
            "gateCount": circuit.size(),
            "oneQGates": one_q,
            "twoQGates": two_q,
            "multiQGates": multi_q,
            "measurements": measurements,
            "gateNodeCount": len(gate_nodes),
        }
    except Exception:
        return {}


class TranspileTraceCollector:
    def __init__(self, initial_circuit):
        self.trace = []
        self.current_circuit = initial_circuit
        self.initial_qasm = _safe_qasm_dump(initial_circuit)
        self.current_qasm = self.initial_qasm
        self.current_gates = initial_circuit.size()
        self.current_depth = initial_circuit.depth()
        self.current_ops = dict(initial_circuit.count_ops())
        one_q, two_q, multi_q, _ = _count_gate_types(initial_circuit)
        self.current_1q = one_q
        self.current_2q = two_q
        self.current_multi = multi_q

    def callback(self, pass_, dag, time, property_set, count):
        try:
            from qiskit.converters import dag_to_circuit

            pass_name = pass_.name()
            pass_class = pass_.__class__.__name__
            stage = _determine_stage(pass_name)
            pass_type = _get_pass_type(pass_)
            is_analysis = (pass_type == "AnalysisPass")

            # ── Snapshot BEFORE state ────────────────────────────────────
            # Always captured from self so it reflects the real circuit
            # state immediately before this pass ran.
            qasm_before    = self.current_qasm
            gates_before   = self.current_gates
            depth_before   = self.current_depth
            ops_before     = self.current_ops
            one_q_before   = self.current_1q
            two_q_before   = self.current_2q
            multi_q_before = self.current_multi

            # ── Compute AFTER state ──────────────────────────────────────
            if is_analysis:
                # AnalysisPass: the DAG is contractually unchanged.
                # We still receive the dag parameter from Qiskit, but it
                # must equal the circuit before the pass — do NOT update
                # self state so that the next pass's "before" is still
                # consistent with what actually happened.
                qasm_str     = qasm_before
                gate_count   = gates_before
                depth        = depth_before
                ops          = ops_before
                one_q_after  = one_q_before
                two_q_after  = two_q_before
                multi_q_after = multi_q_before
                delta_gates  = 0
                delta_depth  = 0
                changed_gates = []
                circuit_changed = False
                dag_before_data = None
                dag_after_data  = None
                gnn_before      = None
                gnn_after       = None
                pattern_found   = None
                # self.current_* NOT updated — state is unchanged
            else:
                # TransformationPass: may or may not change the DAG.
                # Qiskit returns the (possibly modified) DAG as the
                # `dag` parameter.
                circ = dag_to_circuit(dag)
                qasm_str      = _safe_qasm_dump(circ)
                gate_count    = circ.size()
                depth         = circ.depth()
                ops           = dict(circ.count_ops())
                one_q_after, two_q_after, multi_q_after, _ = _count_gate_types(circ)
                delta_gates   = gate_count - gates_before
                delta_depth   = depth - depth_before
                changed_gates = _diff_gates(ops_before, ops)
                circuit_changed = (
                    delta_gates != 0
                    or delta_depth != 0
                    or len(changed_gates) > 0
                )

                # Infer pattern found from gate diff (Optimization stage only)
                pattern_found = None
                if circuit_changed and stage == STAGE_OPTIMIZATION:
                    if delta_gates < 0:
                        if any('cx' in g.lower() or 'ecr' in g.lower() for g in changed_gates):
                            pattern_found = (
                                f"Found cancellable or reducible two-qubit gate sequences "
                                f"({', '.join(changed_gates[:3])})."
                            )
                        elif any(
                            k.lower() in ('rz', 'rx', 'ry', 'sx', 'u', 'u1', 'u2', 'u3')
                            for g in changed_gates
                            for k in [g.split(':')[0].strip()]
                        ):
                            pattern_found = (
                                f"Found consecutive single-qubit operations that could be "
                                f"merged or cancelled ({', '.join(changed_gates[:3])})."
                            )
                        else:
                            pattern_found = f"Found optimizable pattern: {', '.join(changed_gates[:3])}."
                    elif delta_gates > 0:
                        pattern_found = (
                            "This pass transformed the circuit representation. "
                            "A later pass may reduce these gates further."
                        )
                    elif circuit_changed:
                        pattern_found = "Gate types were rearranged or renamed without changing total count."

                # DAG snapshots — Optimization passes only (payload size control)
                dag_before_data = None
                dag_after_data  = None
                gnn_before      = None
                gnn_after       = None
                if stage == STAGE_OPTIMIZATION:
                    try:
                        before_circ = _parse_qasm_safe(qasm_before) if qasm_before else None
                        dag_before_data = _serialize_dag(before_circ) if before_circ else None
                        gnn_before = _extract_gnn_features(before_circ, dag_before_data) if before_circ else None
                    except Exception:
                        dag_before_data = None
                    dag_after_data = _serialize_dag(circ)
                    gnn_after = _extract_gnn_features(circ, dag_after_data)

                # Advance self state — only TransformationPass changes the circuit
                self.current_circuit = circ
                self.current_qasm    = qasm_str
                self.current_gates   = gate_count
                self.current_depth   = depth
                self.current_ops     = ops
                self.current_1q      = one_q_after
                self.current_2q      = two_q_after
                self.current_multi   = multi_q_after

            purpose, rationale, pipeline_reason = _get_pass_explanation(pass_name, stage)

            self.trace.append({
                "passName":       pass_name,
                "passClass":      pass_class,
                "passType":       pass_type,
                "stage":          stage,
                "executionTimeMs": float(time * 1000),
                # QASM/metrics BEFORE this pass
                "qasmBefore":      qasm_before,
                "gateCountBefore": gates_before,
                "depthBefore":     depth_before,
                "oneQGatesBefore":  one_q_before,
                "twoQGatesBefore":  two_q_before,
                "multiQGatesBefore": multi_q_before,
                # QASM/metrics AFTER this pass
                "qasm":       qasm_str,
                "gateCount":  gate_count,
                "depth":      depth,
                "oneQGates":  one_q_after,
                "twoQGates":  two_q_after,
                "multiQGates": multi_q_after,
                # Signed deltas
                "deltaGates": delta_gates,
                "deltaDepth": delta_depth,
                # Change metadata
                "changedGates":   changed_gates,
                "circuitChanged": circuit_changed,
                # Explanations
                "purpose":       purpose,
                "rationale":     rationale,
                "pipelineReason": pipeline_reason,
                # DAG data (Optimization only)
                "dagBefore": dag_before_data,
                "dagAfter":  dag_after_data,
                "gnnFeatures": {
                    "before": gnn_before,
                    "after":  gnn_after,
                    "delta": {
                        k: (gnn_after.get(k, 0) - gnn_before.get(k, 0))
                        for k in (gnn_after or {})
                        if k in (gnn_before or {})
                    } if gnn_before and gnn_after else None,
                } if stage == STAGE_OPTIMIZATION else None,
                "patternFound": pattern_found,
            })
        except Exception as e:
            import traceback
            print(f"[transpile-trace] Error in transpilation callback: {e}\n{traceback.format_exc()}")


def _parse_qasm_safe(qasm_str: str):
    """Parse QASM string silently — returns None on failure."""
    if not qasm_str or not qasm_str.strip():
        return None
    try:
        return _parse_qasm(qasm_str)
    except Exception:
        return None



def _group_trace_into_stages(collector, initial_circuit, qasm_initial: str) -> list[dict]:
    """
    Groups the flat pass trace into the 6 canonical educational stages.

    KEY CORRECTNESS RULE
    ────────────────────
    Stage-level before/after metrics are computed from the actual per-pass
    ``gateCountBefore`` / ``gateCount`` fields recorded during the
    transpilation callback — NOT from a sequential accumulator that would
    accidentally assign later-stage metric values to earlier stages.

    For a stage whose passes are all AnalysisPass:
        gateCountBefore == gateCountAfter  (DAG untouched)

    For a stage with at least one TransformationPass:
        gateCountAfter = gateCount of the last TransformationPass in the stage

    This correctly prevents Circuit Analysis (Size, Depth, …) from showing
    the gate-count reduction that was actually caused by Routing or Decomposition.
    """
    stage_order = [
        STAGE_CIRCUIT_ANALYSIS,
        STAGE_QUBIT_MAPPING,
        STAGE_ROUTING,
        STAGE_GATE_DECOMPOSITION,
        STAGE_OPTIMIZATION,
        STAGE_SCHEDULING,
    ]

    # ── Group passes by stage (preserves callback order within each group) ──
    stages_dict: dict[str, list] = {s: [] for s in stage_order}
    for p in collector.trace:
        stage = p["stage"]
        if stage in stages_dict:
            stages_dict[stage].append(p)
        else:
            stages_dict[STAGE_CIRCUIT_ANALYSIS].append({**p, "stage": STAGE_CIRCUIT_ANALYSIS})

    # ── Build a lookup: for each stage, what was the circuit state just
    #    before the very first pass of that stage ran?
    #
    #    We use the ``gateCountBefore`` field that was stored in the callback
    #    at the moment the pass started, so it is always accurate regardless
    #    of interleaving.
    #
    #    For empty stages we fall back to the last known circuit state,
    #    which we derive by scanning the chronological trace.
    # ────────────────────────────────────────────────────────────────────────



    def _stage_entry_metrics(stage_name: str) -> dict:
        """
        Return the circuit metrics immediately before the first pass of
        stage_name ran.  Falls back to the final known state if no pass
        is found (which means the stage was skipped entirely).
        """
        passes = stages_dict.get(stage_name, [])
        if passes:
            fp = passes[0]
            return {
                "gateCount": fp["gateCountBefore"],
                "depth":     fp["depthBefore"],
                "oneQ":      fp["oneQGatesBefore"],
                "twoQ":      fp["twoQGatesBefore"],
                "qasm":      fp["qasmBefore"],
            }
        # Stage was skipped — find where it would sit chronologically and
        # return the state that was current at that point.
        # We approximate by returning the state after the last pass of any
        # earlier stage that had passes.
        earlier_after_qasm = qasm_initial
        earlier_after_gates = initial_circuit.size()
        earlier_after_depth = initial_circuit.depth()
        earlier_1q, earlier_2q, _, _ = _count_gate_types(initial_circuit)
        for s in stage_order:
            if s == stage_name:
                break
            if stages_dict[s]:
                last_t = stages_dict[s][-1]
                earlier_after_qasm   = last_t["qasm"]
                earlier_after_gates  = last_t["gateCount"]
                earlier_after_depth  = last_t["depth"]
                earlier_1q           = last_t["oneQGates"]
                earlier_2q           = last_t["twoQGates"]
        return {
            "gateCount": earlier_after_gates,
            "depth":     earlier_after_depth,
            "oneQ":      earlier_1q,
            "twoQ":      earlier_2q,
            "qasm":      earlier_after_qasm,
        }

    def _stage_exit_metrics(stage_name: str, entry: dict) -> dict:
        """
        Return the circuit metrics after the last transformation pass of
        stage_name.  If the stage has no transformation passes (all are
        AnalysisPass) the exit == entry, meaning the circuit was unchanged.
        """
        passes = stages_dict.get(stage_name, [])
        if not passes:
            return entry.copy()
        # Find the last TransformationPass in this stage
        xform_passes = [p for p in passes if p.get("passType", "TransformationPass") == "TransformationPass"]
        if not xform_passes:
            # All are AnalysisPass — circuit is unchanged
            return {
                "gateCount": entry["gateCount"],
                "depth":     entry["depth"],
                "oneQ":      entry["oneQ"],
                "twoQ":      entry["twoQ"],
                "qasm":      entry["qasm"],
            }
        last_xform = xform_passes[-1]
        return {
            "gateCount": last_xform["gateCount"],
            "depth":     last_xform["depth"],
            "oneQ":      last_xform["oneQGates"],
            "twoQ":      last_xform["twoQGates"],
            "qasm":      last_xform["qasm"],
        }

    stages_list = []

    for stage_name in stage_order:
        passes = stages_dict[stage_name]
        qiskit_concept = QISKIT_STAGE_CONCEPT.get(stage_name, stage_name)
        total_time = sum(p["executionTimeMs"] for p in passes)

        entry = _stage_entry_metrics(stage_name)
        exit_  = _stage_exit_metrics(stage_name, entry)

        gate_count_before = entry["gateCount"]
        depth_before      = entry["depth"]
        one_q_before      = entry["oneQ"]
        two_q_before      = entry["twoQ"]
        qasm_before_stage = entry["qasm"]

        gate_count_after  = exit_["gateCount"]
        depth_after       = exit_["depth"]
        one_q_after       = exit_["oneQ"]
        two_q_after       = exit_["twoQ"]
        qasm_after_stage  = exit_["qasm"]

        # ── Stage-level DAG snapshots ────────────────────────────────────
        # Parse QASM at the stage boundary to produce a visual DAG.
        # If both QASMs are identical (analysis-only stage) only one parse
        # is needed — dagAfter == dagBefore.
        dag_before = None
        dag_after  = None
        try:
            before_circ = _parse_qasm_safe(qasm_before_stage)
            dag_before = _serialize_dag(before_circ) if before_circ else None
        except Exception:
            pass

        if qasm_after_stage == qasm_before_stage:
            # Truly unchanged (e.g. analysis-only stage)
            dag_after = dag_before
        else:
            try:
                after_circ = _parse_qasm_safe(qasm_after_stage)
                dag_after = _serialize_dag(after_circ) if after_circ else None
            except Exception:
                dag_after = dag_before  # safe fallback

        # ── Stage-specific extras ────────────────────────────────────────
        # SWAP count (Routing)
        swap_count = 0
        if stage_name == STAGE_ROUTING:
            try:
                after_circ = _parse_qasm_safe(qasm_after_stage)
                if after_circ:
                    for inst in after_circ.data:
                        if inst.operation.name.lower() == 'swap':
                            swap_count += 1
            except Exception:
                pass

        # Mapping table (populated later in the endpoint from layout)
        mapping_table = None

        # Scheduling detection
        scheduling_active = False
        scheduling_method = None
        if stage_name == STAGE_SCHEDULING and passes:
            # Only active if at least one TransformationPass ran here
            xform_passes = [p for p in passes if p.get("passType", "TransformationPass") == "TransformationPass"]
            if xform_passes:
                scheduling_active = True
                for p in passes:
                    pn = p["passName"].lower()
                    if "alap" in pn:
                        scheduling_method = "ALAP (As-Late-As-Possible)"
                        break
                    elif "asap" in pn:
                        scheduling_method = "ASAP (As-Soon-As-Possible)"
                        break

        stages_list.append({
            "stageName":      stage_name,
            "qiskitConcept":  qiskit_concept,
            "passes":         passes,
            "gateCountBefore": gate_count_before,
            "gateCountAfter":  gate_count_after,
            "depthBefore":     depth_before,
            "depthAfter":      depth_after,
            "executionTimeMs": total_time,
            "oneQGatesBefore": one_q_before,
            "twoQGatesBefore": two_q_before,
            "oneQGatesAfter":  one_q_after,
            "twoQGatesAfter":  two_q_after,
            "dagBefore":       dag_before,
            "dagAfter":        dag_after,
            "swapCount":       swap_count,
            "mappingTable":    mapping_table,
            "schedulingActive": scheduling_active,
            "schedulingMethod": scheduling_method,
        })

    return stages_list



def _extract_coupling_map(backend) -> list[list[int]] | None:
    if backend is None:
        return None
    try:
        if hasattr(backend, "coupling_map") and backend.coupling_map is not None:
            return list(backend.coupling_map.get_edges())
        elif hasattr(backend, "configuration"):
            config = backend.configuration()
            if hasattr(config, "coupling_map") and config.coupling_map is not None:
                return list(config.coupling_map)
    except Exception as e:
        print(f"[transpile-trace] Error extracting coupling map: {e}")
    return None


def _extract_layout(transpiled_circuit) -> dict[str, int] | None:
    if not hasattr(transpiled_circuit, "layout") or transpiled_circuit.layout is None:
        return None
    try:
        layout_dict = {}
        virtual_bits = transpiled_circuit.layout.get_virtual_bits()
        for logical_qubit, phys_idx in virtual_bits.items():
            if logical_qubit is not None:
                reg_name = "q"
                if hasattr(logical_qubit, "register") and logical_qubit.register is not None:
                    reg_name = logical_qubit.register.name
                idx = logical_qubit._index if hasattr(logical_qubit, "_index") else 0
                layout_dict[f"{reg_name}[{idx}]"] = int(phys_idx)
        return layout_dict
    except Exception as e:
        print(f"[transpile-trace] Error extracting layout: {e}")
        return None


@app.post(
    "/transpile-trace",
    response_model=TranspileTraceResponse,
    responses={
        422: {"description": "Validation or conversion error"},
        500: {"description": "Runtime error during transpilation"},
    },
)
async def transpile_trace(req: TranspileTraceRequest):
    """
    Run the transpilation pipeline step-by-step and return a detailed pass trace
    with rationales, stage groupings, and qubit layout information.
    """
    if not req.code.strip():
        raise HTTPException(
            status_code=422,
            detail={"errorCode": "VALIDATION_SYNTAX", "message": "Empty circuit input."},
        )

    # Wait for a concurrency slot (queue up instead of crashing under load)
    try:
        await asyncio.wait_for(_sim_semaphore.acquire(), timeout=_SIM_QUEUE_TIMEOUT)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=503,
            detail={
                "errorCode": "SERVICE_BUSY",
                "message": "The simulation service is currently busy. Please try again in a moment.",
            },
        )

    try:
        if req.codeType in ("cirq", "pennylane", "braket", "tket"):
            raise HTTPException(
                status_code=422,
                detail={
                    "errorCode": "UNSUPPORTED_FRAMEWORK",
                    "message": f"Framework '{req.codeType}' not supported for step-by-pass transpilation trace.",
                },
            )

        qc = None
        if req.codeType == "qasm":
            try:
                qc = _parse_qasm(req.code)
            except Exception as exc:
                raise HTTPException(
                    status_code=422,
                    detail={"errorCode": "VALIDATION_SYNTAX", "message": _sanitize(str(exc))},
                )
        elif req.codeType == "python":
            try:
                compiled = compile(req.code, "<user_circuit>", "exec")
            except SyntaxError as exc:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "errorCode": "VALIDATION_SYNTAX",
                        "message": f"Python syntax error on line {exc.lineno}: {exc.msg}",
                    },
                )
            namespace: dict = {"__builtins__": _SAFE_BUILTINS}
            try:
                exec(compiled, namespace)  # noqa: S102
            except Exception as exc:
                raise HTTPException(
                    status_code=422,
                    detail={"errorCode": "EXECUTION_RUNTIME_ERROR", "message": _sanitize(str(exc))},
                )
            qc = namespace.get("qc")

        if qc is None:
            raise HTTPException(
                status_code=500,
                detail={"errorCode": "EXECUTION_RUNTIME_ERROR", "message": "No circuit was produced."},
            )

        # Load backend (skip hardware topologies for simulators)
        backend = None
        is_simulator = req.backend in ("aer_simulator", "simulator", "local", "basic_simulator", "spinq")
        if not is_simulator and req.ibm_token and req.ibm_channel:
            try:
                backend = _get_real_backend_cached(
                    req.ibm_channel, req.ibm_token, req.ibm_instance, req.backend
                )
            except Exception:
                backend = None
        if not is_simulator and backend is None:
            backend = _get_ibm_fake_backend(req.backend)

        # Run Qiskit transpile with callback
        try:
            from qiskit import transpile

            collector = TranspileTraceCollector(qc)
            initial_qasm = collector.initial_qasm
            start_time = _time.time()

            transpiled = transpile(
                qc,
                backend=backend,
                optimization_level=req.optimization_level,
                callback=collector.callback,
            )

            total_time_ms = (_time.time() - start_time) * 1000
            final_qasm = _safe_qasm_dump(transpiled)

            # Build stage-level trace summaries using new enhanced grouper
            stages = _group_trace_into_stages(collector, qc, initial_qasm)
            coupling_map = _extract_coupling_map(backend)
            layout = _extract_layout(transpiled)

            # Build initial and final DAG
            initial_dag = _serialize_dag(qc)
            final_dag = _serialize_dag(transpiled)

            # Original circuit gate type breakdown
            orig_1q, orig_2q, orig_multi, orig_measurements = _count_gate_types(qc)
            # Final circuit gate type breakdown
            final_1q, final_2q, final_multi, _ = _count_gate_types(transpiled)

            # Count final SWAP gates
            final_swap_count = 0
            try:
                for inst in transpiled.data:
                    if inst.operation.name.lower() == 'swap':
                        final_swap_count += 1
            except Exception:
                pass

            # Backend metadata
            backend_num_qubits = None
            backend_basis_gates = None
            try:
                if backend is not None:
                    backend_num_qubits = getattr(backend, 'num_qubits', None)
                    if hasattr(backend, 'operation_names'):
                        backend_basis_gates = list(backend.operation_names)
                    elif hasattr(backend, 'configuration'):
                        cfg = backend.configuration()
                        backend_basis_gates = getattr(cfg, 'basis_gates', None)
            except Exception:
                pass

            # Detect if any scheduling was active
            scheduling_active = any(
                s["schedulingActive"] for s in stages
                if s["stageName"] == STAGE_SCHEDULING
            )

            # Map layout to the qubit mapping stage
            if layout:
                for stage in stages:
                    if stage["stageName"] == STAGE_QUBIT_MAPPING:
                        stage["mappingTable"] = {k: v for k, v in layout.items()}
                        break

            return TranspileTraceResponse(
                originalQasm=initial_qasm,
                finalQasm=final_qasm,
                originalGateCount=qc.size(),
                originalDepth=qc.depth(),
                originalOneQGates=orig_1q,
                originalTwoQGates=orig_2q,
                originalMultiQGates=orig_multi,
                originalMeasurements=orig_measurements,
                originalQubits=qc.num_qubits,
                originalClassicalBits=qc.num_clbits,
                finalGateCount=transpiled.size(),
                finalDepth=transpiled.depth(),
                finalOneQGates=final_1q,
                finalTwoQGates=final_2q,
                finalSwapCount=final_swap_count,
                totalExecutionTimeMs=total_time_ms,
                stages=stages,
                couplingMap=coupling_map,
                logicalToPhysicalLayout=layout,
                initialDag=initial_dag,
                finalDag=final_dag,
                dag=initial_dag,  # backwards compatibility
                backendNumQubits=backend_num_qubits,
                backendBasisGates=backend_basis_gates,
                optimizationLevel=req.optimization_level,
                schedulingActive=scheduling_active,
            )
        except Exception as exc:
            import traceback
            tb = traceback.format_exc()
            print(f"[transpile-trace] Error: {exc}\n{tb}")
            raise HTTPException(
                status_code=500,
                detail={"errorCode": "TRANSPILATION_ERROR", "message": _sanitize(str(exc))},
            )
    finally:
        _sim_semaphore.release()


# ---------------------------------------------------------------------------
# IBM QPU Job Result Fetcher
# ---------------------------------------------------------------------------

@app.post(
    "/ibm-job-result",
    response_model=IbmJobResultResponse,
    responses={
        404: {"description": "Job not found"},
        500: {"description": "Error fetching or parsing results"},
    }
)
def get_ibm_job_result(req: IbmJobResultRequest):
    """
    Fetch and decode results for a completed IBM Qiskit Runtime job.
    Primitive V2 results are heavily encoded (MessagePack/Base64/Numpy).
    Using the Python SDK is the only robust way to extract the counts.
    """
    try:
        from qiskit_ibm_runtime import QiskitRuntimeService

        kwargs: dict[str, Any] = {"channel": req.ibm_channel, "token": req.ibm_token}
        if req.ibm_instance:
            kwargs["instance"] = req.ibm_instance

        service = QiskitRuntimeService(**kwargs)
        job = service.job(req.job_id)
        
        status = job.status()
        if status not in ("DONE", "COMPLETED"):
            return IbmJobResultResponse(counts={}, status=status)
            
        result = job.result()
        
        counts = {}
        
        # 1. Try V2 PrimitiveResult (Iterable of PubResult)
        try:
            # We use a loop instead of [0] to avoid KeyError if it's acting like a dict
            if hasattr(result, "__iter__") and not isinstance(result, dict):
                for pub_result in result:
                    if hasattr(pub_result, "data"):
                        for val in pub_result.data.values():
                            if hasattr(val, "get_counts"):
                                c = val.get_counts()
                                for k, v in c.items():
                                    counts[k] = counts.get(k, 0) + v
        except Exception:
            pass

        # 2. Try V1 SamplerResult (has quasi_dists)
        if not counts and hasattr(result, "quasi_dists"):
            try:
                dists = result.quasi_dists
                if dists and len(dists) > 0:
                    d = dists[0]
                    shots = job.metadata.get("shots", 1024)
                    
                    # If it's a QuasiDistribution, it should have binary_probabilities
                    if hasattr(d, "binary_probabilities"):
                        probs = d.binary_probabilities()
                        for k, v in probs.items():
                            counts[str(k)] = counts.get(str(k), 0) + int(v * shots)
                    else:
                        for k, v in d.items():
                            # naive string conversion if binary_probabilities is missing
                            k_str = str(k)
                            counts[k_str] = counts.get(k_str, 0) + int(v * shots)
            except Exception as e:
                import traceback
                print(f"[ibm-job-result] quasi_dists extraction failed: {e}\n{traceback.format_exc()}")

        # 3. Try standard get_counts() (legacy backend.run)
        if not counts and hasattr(result, "get_counts"):
            try:
                c = result.get_counts()
                if isinstance(c, list) and len(c) > 0:
                    c = c[0]
                counts = dict(c)
            except Exception:
                pass
                
        # 4. Try treating result as a dictionary (if SDK didn't deserialize)
        if not counts and isinstance(result, dict):
            # A raw Sampler V2 pub result dict looks like:
            # {"results": [{"data": {"c": {"samples": ["0x3", "0x0", ...]}}}]}
            results_list = result.get("results", [])
            for res_item in results_list:
                data = res_item.get("data", {})
                for reg_name, reg_data in data.items():
                    if isinstance(reg_data, dict):
                        # V2 samples format
                        samples = reg_data.get("samples")
                        if isinstance(samples, list):
                            # Guess the register size based on the largest hex value
                            max_val = 0
                            for s in samples:
                                try:
                                    max_val = max(max_val, int(str(s).replace("0x", "") or "0", 16))
                                except Exception:
                                    pass
                            
                            reg_bits = len(bin(max_val)[2:]) if max_val > 0 else 1
                            
                            for s in samples:
                                clean_k = str(s).replace("0x", "")
                                if not clean_k:
                                    clean_k = "0"
                                try:
                                    bin_k = bin(int(clean_k, 16))[2:]
                                    bin_k = bin_k.zfill(reg_bits)
                                except Exception:
                                    bin_k = clean_k
                                counts[bin_k] = counts.get(bin_k, 0) + 1
                                
                        # V2 counts format (just in case)
                        c = reg_data.get("counts")
                        if isinstance(c, dict):
                            for k, v in c.items():
                                clean_k = str(k).replace("0x", "")
                                try:
                                    bin_k = bin(int(clean_k, 16))[2:]
                                    counts[bin_k] = counts.get(bin_k, 0) + int(v)
                                except Exception:
                                    counts[clean_k] = counts.get(clean_k, 0) + int(v)

        if not counts:
            err_details = f"Could not extract counts. Type: {type(result)}, Dir: {dir(result)}"
            if isinstance(result, dict):
                import json
                err_details += f"\nDict content: {json.dumps(result)[:500]}"
            raise ValueError(err_details)
                
        return IbmJobResultResponse(counts=counts, status=status, metadata=job.metadata)

    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        print(f"[ibm-job-result] Error extracting results for {req.job_id}:\n{tb}")
        
        err_msg = str(exc)
        if "not found" in err_msg.lower() or "404" in err_msg:
            raise HTTPException(status_code=404, detail="Job not found on IBM Quantum.")
        raise HTTPException(
            status_code=500,
            detail={"errorCode": "RESULT_FETCH_ERROR", "message": f"{type(exc).__name__}: {err_msg}\n\n{tb}"},
        )


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
async def simulate(req: SimulateRequest):
    if not req.qasm.strip():
        raise HTTPException(
            status_code=422,
            detail={"errorCode": "VALIDATION_SYNTAX", "message": "Empty circuit input."},
        )

    # Wait for a concurrency slot (queue up instead of crashing under load)
    try:
        await asyncio.wait_for(_sim_semaphore.acquire(), timeout=_SIM_QUEUE_TIMEOUT)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=503,
            detail={
                "errorCode": "SERVICE_BUSY",
                "message": "The simulation service is currently busy. Please try again in a moment.",
            },
        )

    try:
        if req.mode == "python":
            counts, backend_name, duration_ms = _run_python_mode(req.qasm, req.shots, req.noiseConfig, req.provider, req.spinqConfig)
        else:
            if req.provider == "spinq":
                try:
                    counts, backend_name, duration_ms = _run_spinq_simulation(req.qasm, req.shots, req.spinqConfig)
                except Exception as exc:
                    raise HTTPException(
                        status_code=500,
                        detail={"errorCode": "EXECUTION_RUNTIME_ERROR", "message": _sanitize(str(exc))},
                    )
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
    finally:
        _sim_semaphore.release()


# ---------------------------------------------------------------------------
# Python sandbox executor
# ---------------------------------------------------------------------------

def _run_python_mode(code: str, shots: int, noiseConfig: dict | None = None, provider: str = "local", spinqConfig: dict | None = None) -> tuple:
    """Execute Python in a restricted sandbox, then simulate the circuit."""
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

    if provider == "spinq":
        if 'counts' in namespace and isinstance(namespace['counts'], dict):
            return namespace['counts'], "spinq_python_script", 0
        if 'result' in namespace and hasattr(namespace['result'], 'counts'):
            return namespace['result'].counts, "spinq_python_script", 0
        if 'circ' in namespace:
            return _execute_spinq_circuit(namespace['circ'], shots, spinqConfig)
        raise HTTPException(
            status_code=422,
            detail={
                "errorCode": "VALIDATION_NO_CIRCUIT",
                "message": (
                    "Your SpinQ code must define a variable named 'circ' (Circuit), "
                    "or perform execution and save 'counts' or 'result'."
                ),
            },
        )

    # Universal check for generic framework execution output
    if 'counts' in namespace and isinstance(namespace['counts'], dict):
        return namespace['counts'], "python_script", 0
    if 'result' in namespace and hasattr(namespace['result'], 'counts'):
        return namespace['result'].counts, "python_script", 0

    # Expect a `qc` variable holding a QuantumCircuit for Qiskit local provider
    qc = namespace.get('qc')
    if qc is None:
        raise HTTPException(
            status_code=422,
            detail={
                "errorCode": "VALIDATION_NO_CIRCUIT",
                "message": (
                    "Your code must define a variable named 'qc' (QuantumCircuit), "
                    "or perform execution and save a 'counts' dictionary. "
                    "Example: qc = QuantumCircuit(2, 2) OR counts = {'00': 100}"
                ),
            },
        )

    try:
        from qiskit import QuantumCircuit
        if not isinstance(qc, QuantumCircuit):
            raise HTTPException(
                status_code=422,
                detail={
                    "errorCode": "VALIDATION_TYPE_ERROR",
                    "message": "The variable 'qc' is not a valid Qiskit QuantumCircuit.",
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
async def simulate_stepper(req: StepperRequest):
    if not req.code.strip():
        raise HTTPException(
            status_code=422,
            detail={"errorCode": "VALIDATION_SYNTAX", "message": "Empty circuit input."},
        )

    # Wait for a concurrency slot (queue up instead of crashing under load)
    try:
        await asyncio.wait_for(_sim_semaphore.acquire(), timeout=_SIM_QUEUE_TIMEOUT)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=503,
            detail={
                "errorCode": "SERVICE_BUSY",
                "message": "The simulation service is currently busy. Please try again in a moment.",
            },
        )

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
        start = _time.monotonic()
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
        
        elapsed_ms = round((_time.monotonic() - start) * 1000)
        
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
    finally:
        _sim_semaphore.release()


@app.post(
    "/analyze",
    response_model=AnalyzeResponse,
)
async def analyze(req: AnalyzeRequest):
    if not req.qasm.strip():
        raise HTTPException(status_code=422, detail={"errorCode": "VALIDATION_SYNTAX", "message": "Empty circuit input."})

    # Wait for a concurrency slot (queue up instead of crashing under load)
    try:
        await asyncio.wait_for(_sim_semaphore.acquire(), timeout=_SIM_QUEUE_TIMEOUT)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=503,
            detail={
                "errorCode": "SERVICE_BUSY",
                "message": "The simulation service is currently busy. Please try again in a moment.",
            },
        )

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
    finally:
        _sim_semaphore.release()

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


def _execute_spinq_circuit(circuit, shots: int, spinq_config: dict | None = None) -> tuple:
    start = _time.monotonic()
    from spinqit import get_compiler, get_nmr, NMRConfig

    compiler = get_compiler("native")
    exe = compiler.compile(circuit, 1)

    engine = get_nmr()
    config = NMRConfig()
    
    if spinq_config:
        if spinq_config.get("ip"):
            config.configure_ip(spinq_config["ip"])
        if spinq_config.get("port"):
            config.configure_port(spinq_config["port"])
        if spinq_config.get("username") and spinq_config.get("password"):
            config.configure_account(spinq_config["username"], spinq_config["password"])
    else:
        # Fallback to defaults
        config.configure_ip("172.31.80.238")
        config.configure_port(8989)
        config.configure_account("GamithChanuka", "123Samsung@")
        
    config.configure_task("qs_task", "Generated from Quantum Studio")
    config.configure_shots(shots)

    result = engine.execute(exe, config)
    end = _time.monotonic()
    return result.counts, "spinq_gemini_mini_pro", int((end - start) * 1000)

def _run_spinq_simulation(qasm_text: str, shots: int, spinq_config: dict | None = None) -> tuple:
    try:
        from spinqit import Circuit
    except ImportError:
        raise RuntimeError("spinqit library is not installed. Please install it to use the SpinQ backend.")
    
    circuit = None
    # 1. Try to load QASM using qiskit -> spinqit if possible
    try:
        qc = _parse_qasm(qasm_text)
        from spinqit.interface.qiskit import to_spinqit
        circuit = to_spinqit(qc)
    except Exception:
        pass

    # 2. Try direct parser
    if circuit is None:
        try:
            if hasattr(Circuit, 'from_qasm_str'):
                circuit = Circuit.from_qasm_str(qasm_text)
            elif hasattr(Circuit, 'from_qasm'):
                circuit = Circuit.from_qasm(qasm_text)
        except Exception:
            pass

    # 3. Try to parse using a generic qasm load
    if circuit is None:
        try:
            import spinqit.qasm as sqasm
            circuit = sqasm.loads(qasm_text)
        except Exception:
            pass
            
    if circuit is None:
        raise RuntimeError("Could not parse OpenQASM 2.0 into a SpinQit Circuit. Please ensure SpinQit supports QASM loading or write native Python SpinQit code.")
        
    return _execute_spinq_circuit(circuit, shots, spinq_config)


def _run_simulation(circuit, shots: int, noiseConfig: dict | None = None) -> tuple:
    """Execute the circuit on the best available simulator."""
    start = _time.monotonic()

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

    elapsed_ms = round((_time.monotonic() - start) * 1000)
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
