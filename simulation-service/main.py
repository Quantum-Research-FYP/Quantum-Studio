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
    provider: Literal["local", "spinq"] = Field("local", description="Backend provider: local or spinq")
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

    What this gets RIGHT:
      - Gate decomposition: cx / other gates are converted to ecr (Eagle)
        or cz (Heron) — the correct native 2Q gate for this family.

    What this gets WRONG (and why it will still fail on real hardware):
      - Coupling map: GenericBackendV2 generates a RANDOM topology.
        ibm_fez, ibm_kingston, and ibm_marrakesh are all Heron r2 /
        156 qubits, but their qubit connectivity is DIFFERENT per machine.
        Routing against a random coupling map will place 2Q gates on qubit
        pairs that don't exist on the real device.

    The correct path is ALWAYS A: QiskitRuntimeService(token=...).backend(name),
    which returns the live backend with its exact coupling map.
    This fallback exists only for local dev / testing without credentials.
    """
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
def transpile_ibm(req: TranspileIbmRequest):
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
def simulate(req: SimulateRequest):
    if not req.qasm.strip():
        raise HTTPException(
            status_code=422,
            detail={"errorCode": "VALIDATION_SYNTAX", "message": "Empty circuit input."},
        )

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

    # Expect a `qc` variable holding a QuantumCircuit for Qiskit local provider
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
        from qiskit import QuantumCircuit
        qc = QuantumCircuit.from_qasm_str(qasm_text)
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
