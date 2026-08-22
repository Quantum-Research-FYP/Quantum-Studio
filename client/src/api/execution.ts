// ---------------------------------------------------------------------------
// Execution API client
// ---------------------------------------------------------------------------
import type { NoiseConfig } from './simulations';

export interface ExecutionJobSummary {
  jobId: string;
  provider: string;
  status: string;
  backend: string;
  shots: number;
  createdAt: string;
  completedAt?: string | null;
}

export interface ExecutionProvider {
  id: string;
  name: string;
  available: boolean;
}

export interface IbmBackend {
  name: string;
  status: 'online' | 'offline' | 'maintenance';
  qubits: number;
  pendingJobs: number;
}

export interface ExecutionJobResponse {
  jobId: string;
  provider: string;
  providerJobId?: string;
  status: string;
  backend: string;
  shots: number;
  qasmInput?: string;
  codeType?: 'qasm' | 'python';
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  error?: {
    errorCode: string;
    message: string;
  };
}

export interface SubmitExecutionJobInput {
  provider: 'simulator' | 'ibm_quantum' | 'spinq';
  backend?: string;
  qasm: string;
  shots: number;
  idempotencyKey?: string;
  codeType?: 'qasm' | 'python';
  noiseConfig?: NoiseConfig;
}

export interface ApiError {
  error: string;
  errorCode?: string;
  suggestion?: string;
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
      suggestion?: string;
    };
    err.status = res.status;
    err.errorCode = apiErr?.errorCode;
    err.suggestion = apiErr?.suggestion;
    throw err;
  }

  return body as T;
}

export function listJobs(limit = 20): Promise<{ jobs: ExecutionJobSummary[] }> {
  return request(`/api/execution/jobs?limit=${limit}`);
}

export function getProviders(): Promise<{ providers: ExecutionProvider[] }> {
  return request('/api/execution/providers');
}

export function listIbmBackends(): Promise<{ backends: IbmBackend[] }> {
  return request('/api/execution/ibm/backends');
}

export function submitExecutionJob(input: SubmitExecutionJobInput): Promise<ExecutionJobResponse> {
  return request('/api/execution/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getExecutionJobStatus(jobId: string): Promise<ExecutionJobResponse> {
  return request(`/api/execution/jobs/${encodeURIComponent(jobId)}`);
}

export function cancelExecutionJob(jobId: string): Promise<ExecutionJobResponse> {
  return request(`/api/execution/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
}
