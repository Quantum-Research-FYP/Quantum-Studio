// ---------------------------------------------------------------------------
// Simulations API client
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface JobResponse {
  jobId: string;
  status: JobStatus;
  shots: number;
  backend: string;
  qasmInput?: string;
  codeType?: 'qasm' | 'python';
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error?: {
    errorCode: string;
    message: string;
  };
}

export interface JobResultResponse {
  jobId: string;
  shots: number;
  counts: Record<string, number>;
  probabilities?: Record<string, number>;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface StepperResponse {
  statevectors: Record<string, Record<string, { re: number; im: number }>>;
  metadata: Record<string, unknown>;
}

export interface AnalyzeResponse {
  idealCounts: Record<string, number>;
  noisyCounts: Record<string, number>;
  fidelity: number;
  errorBudget: Record<string, number>;
  monteCarloFidelity: Array<{ noiseScale: number; fidelity: number }>;
  metadata: Record<string, unknown>;
}

/** A single measurement outcome, pre-sorted for display. */
export interface Outcome {
  bitstring: string;
  count: number;
  probability: number;
}

export interface NoiseConfig {
  depolarizing?: number;
  bitFlip?: number;
  phaseFlip?: number;
  amplitudeDamping?: number;
  phaseDamping?: number;
  readoutError?: number;
  crosstalk?: number;
  thermalRelaxation?: {
    t1: number;
    t2: number;
    gateTime: number;
  };
}

export interface SubmitJobInput {
  qasm: string;
  shots: number;
  mode?: 'qasm' | 'python';
  provider?: 'local' | 'spinq' | 'ibm';
  idempotencyKey?: string;
  noiseConfig?: NoiseConfig;
}

export interface ApiError {
  error: string;
  errorCode?: string;
  details?: Array<{ errorCode: string; message: string; field?: string }>;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    let errMsg = 'An error occurred.';
    if (typeof body?.error === 'string' && body.error) {
      errMsg = body.error;
    } else if (typeof body?.message === 'string' && body.message) {
      errMsg = body.message;
    } else if (typeof body?.detail === 'string' && body.detail) {
      errMsg = body.detail;
    } else if (typeof body?.detail?.message === 'string' && body.detail.message) {
      errMsg = body.detail.message;
    } else if (Array.isArray(body?.detail) && body.detail.length > 0) {
      errMsg = body.detail
        .map((d: unknown) =>
          typeof d === 'object' && d !== null
            ? (d as { msg?: string; message?: string }).msg ||
              (d as { msg?: string; message?: string }).message ||
              JSON.stringify(d)
            : String(d),
        )
        .join('; ');
    }

    const err = new Error(errMsg) as Error & {
      status: number;
      errorCode?: string;
      details?: ApiError['details'];
    };
    err.status = res.status;
    err.errorCode = body?.errorCode || body?.detail?.errorCode;
    err.details = body?.details;
    throw err;
  }

  return body as T;
}

export function submitJob(input: SubmitJobInput): Promise<JobResponse> {
  return request<JobResponse>('/api/v1/simulations/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getJobStatus(jobId: string): Promise<JobResponse> {
  return request<JobResponse>(`/api/v1/simulations/jobs/${encodeURIComponent(jobId)}`);
}

export function getJobResult(jobId: string): Promise<JobResultResponse> {
  return request<JobResultResponse>(`/api/v1/simulations/jobs/${encodeURIComponent(jobId)}/result`);
}

/** Build the URL for the server-side export endpoint (JSON or CSV). */
export function getExportUrl(jobId: string, format: 'json' | 'csv'): string {
  return `/api/v1/simulations/jobs/${encodeURIComponent(jobId)}/result/export?format=${format}`;
}

export function runStepper(code: string): Promise<StepperResponse> {
  return request<StepperResponse>('/api/v1/simulations/stepper', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function analyzeCircuit(input: SubmitJobInput): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>('/api/v1/simulations/analyze', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Transparent Transpilation Trace API Definitions
// ---------------------------------------------------------------------------

export interface TranspilePassTrace {
  passName: string;
  passClass: string;
  stage: string;
  executionTimeMs: number;
  qasm: string;
  gateCount: number;
  depth: number;
  deltaGates: number;
  deltaDepth: number;
  purpose: string;
  rationale: string;
  changedGates: string[];
}

export interface TranspileStageSummary {
  stageName: string;
  passes: TranspilePassTrace[];
  gateCountBefore: number;
  gateCountAfter: number;
  depthBefore: number;
  depthAfter: number;
  executionTimeMs: number;
}

export interface TranspileTraceResponse {
  originalQasm: string;
  finalQasm: string;
  originalGateCount: number;
  originalDepth: number;
  finalGateCount: number;
  finalDepth: number;
  totalExecutionTimeMs: number;
  stages: TranspileStageSummary[];
  couplingMap: Array<[number, number]> | null;
  logicalToPhysicalLayout: Record<string, number> | null;
  dag?: {
    nodes: Array<{ id: string; label: string; type: string }>;
    edges: Array<{ source: string; target: string; label: string }>;
  } | null;
}

export interface TranspileTraceInput {
  qasm: string;
  mode?: 'qasm' | 'python';
  backend?: string;
  optimizationLevel?: number;
}

export function getTranspileTrace(input: TranspileTraceInput): Promise<TranspileTraceResponse> {
  return request<TranspileTraceResponse>('/api/v1/simulations/transpile-trace', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
