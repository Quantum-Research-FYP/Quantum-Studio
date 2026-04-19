// ---------------------------------------------------------------------------
// Simulations API client
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface JobResponse {
  jobId: string;
  status: JobStatus;
  shots: number;
  backend: string;
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

/** A single measurement outcome, pre-sorted for display. */
export interface Outcome {
  bitstring: string;
  count: number;
  probability: number;
}

export interface SubmitJobInput {
  qasm: string;
  shots: number;
  idempotencyKey?: string;
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
    const apiErr = body as ApiError | null;
    const err = new Error(apiErr?.error || 'An error occurred.') as Error & {
      status: number;
      errorCode?: string;
      details?: ApiError['details'];
    };
    err.status = res.status;
    err.errorCode = apiErr?.errorCode;
    err.details = apiErr?.details;
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
