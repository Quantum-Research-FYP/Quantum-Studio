/**
 * IBM Quantum Runtime client abstraction.
 *
 * Provides a consistent interface for listing backends, submitting jobs,
 * checking status, and cancelling jobs. Uses a mock implementation in
 * development when no real API URL is configured.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IbmBackend {
  name: string;
  status: 'online' | 'offline' | 'maintenance';
  qubits: number;
  pendingJobs: number;
}

export interface IbmJobSubmission {
  providerJobId: string;
}

export interface IbmJobStatusResponse {
  providerJobId: string;
  status: string; // Raw IBM status (INITIALIZING, QUEUED, RUNNING, DONE, ERROR, CANCELLED, etc.)
  counts: Record<string, number> | null;
  metadata: Record<string, unknown>;
  errorMessage: string | null;
}

export interface IbmClientError {
  errorCode: 'INVALID_TOKEN' | 'NETWORK_ERROR' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_RATE_LIMITED' | 'JOB_NOT_FOUND';
  message: string;
}

export type IbmClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: IbmClientError };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const IBM_API_URL = process.env.IBM_QUANTUM_API_URL || '';
const IBM_TIMEOUT_MS = parseInt(process.env.IBM_QUANTUM_TIMEOUT_MS || '15000', 10);

function isRealMode(): boolean {
  return Boolean(IBM_API_URL);
}

// ---------------------------------------------------------------------------
// Mock Implementation
// ---------------------------------------------------------------------------

const MOCK_BACKENDS: IbmBackend[] = [
  { name: 'ibm_brisbane', status: 'online', qubits: 127, pendingJobs: 12 },
  { name: 'ibm_osaka', status: 'online', qubits: 127, pendingJobs: 5 },
  { name: 'ibm_kyoto', status: 'maintenance', qubits: 127, pendingJobs: 0 },
];

/** Simulates job lifecycle: transitions through states over time. */
const mockJobStates = new Map<string, { status: string; createdAt: number }>();

function getMockJobStatus(providerJobId: string): string {
  const entry = mockJobStates.get(providerJobId);
  if (!entry) return 'ERROR';

  const elapsedMs = Date.now() - entry.createdAt;

  if (entry.status === 'CANCELLED') return 'CANCELLED';
  if (elapsedMs < 2000) return 'INITIALIZING';
  if (elapsedMs < 5000) return 'QUEUED';
  if (elapsedMs < 10000) return 'RUNNING';
  return 'DONE';
}

// ---------------------------------------------------------------------------
// Client Factory
// ---------------------------------------------------------------------------

export function createIbmClient() {
  return {
    async listBackends(token: string): Promise<IbmClientResult<IbmBackend[]>> {
      if (!isRealMode()) {
        // Mock: validate token prefix
        if (!token.startsWith('valid-')) {
          return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Invalid token.' } };
        }
        return { ok: true, data: MOCK_BACKENDS };
      }

      return callIbmApi<IbmBackend[]>(token, 'GET', '/backends', null, (body) => {
        const backends = (body as Array<Record<string, unknown>>).map((b) => ({
          name: (b.name as string) || 'unknown',
          status: mapBackendStatus(b.status as string),
          qubits: (b.num_qubits as number) || 0,
          pendingJobs: (b.pending_jobs as number) || 0,
        }));
        return backends;
      });
    },

    async submitJob(
      token: string,
      backend: string,
      qasm: string,
      shots: number,
    ): Promise<IbmClientResult<IbmJobSubmission>> {
      if (!isRealMode()) {
        if (!token.startsWith('valid-')) {
          return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Invalid token.' } };
        }
        const providerJobId = `mock-ibm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        mockJobStates.set(providerJobId, { status: 'INITIALIZING', createdAt: Date.now() });
        return { ok: true, data: { providerJobId } };
      }

      return callIbmApi<IbmJobSubmission>(
        token,
        'POST',
        '/jobs',
        { backend, qasm, shots },
        (body) => ({ providerJobId: (body as Record<string, unknown>).id as string }),
      );
    },

    async getJobStatus(
      token: string,
      providerJobId: string,
    ): Promise<IbmClientResult<IbmJobStatusResponse>> {
      if (!isRealMode()) {
        if (!token.startsWith('valid-')) {
          return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Invalid token.' } };
        }
        if (!mockJobStates.has(providerJobId)) {
          return { ok: false, error: { errorCode: 'JOB_NOT_FOUND', message: 'Job not found.' } };
        }
        const status = getMockJobStatus(providerJobId);
        const counts = status === 'DONE' ? { '00': 512, '11': 512 } : null;
        return {
          ok: true,
          data: {
            providerJobId,
            status,
            counts,
            metadata: { backend: 'ibm_brisbane', shots: 1024 },
            errorMessage: status === 'ERROR' ? 'Execution failed.' : null,
          },
        };
      }

      return callIbmApi<IbmJobStatusResponse>(
        token,
        'GET',
        `/jobs/${encodeURIComponent(providerJobId)}`,
        null,
        (body) => {
          const b = body as Record<string, unknown>;
          return {
            providerJobId: (b.id as string) || providerJobId,
            status: (b.status as string) || 'UNKNOWN',
            counts: (b.results as Record<string, number>) ?? null,
            metadata: { backend: b.backend, shots: b.shots },
            errorMessage: (b.error_message as string) ?? null,
          };
        },
      );
    },

    async cancelJob(
      token: string,
      providerJobId: string,
    ): Promise<IbmClientResult<{ cancelled: boolean }>> {
      if (!isRealMode()) {
        if (!token.startsWith('valid-')) {
          return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Invalid token.' } };
        }
        const entry = mockJobStates.get(providerJobId);
        if (!entry) {
          return { ok: false, error: { errorCode: 'JOB_NOT_FOUND', message: 'Job not found.' } };
        }
        const currentStatus = getMockJobStatus(providerJobId);
        if (currentStatus === 'DONE' || currentStatus === 'ERROR' || currentStatus === 'CANCELLED') {
          return { ok: true, data: { cancelled: false } };
        }
        entry.status = 'CANCELLED';
        return { ok: true, data: { cancelled: true } };
      }

      return callIbmApi<{ cancelled: boolean }>(
        token,
        'POST',
        `/jobs/${encodeURIComponent(providerJobId)}/cancel`,
        null,
        () => ({ cancelled: true }),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP Helpers (real mode)
// ---------------------------------------------------------------------------

function mapBackendStatus(raw: string | undefined): IbmBackend['status'] {
  if (!raw) return 'offline';
  const upper = raw.toUpperCase();
  if (upper === 'ONLINE' || upper === 'ACTIVE') return 'online';
  if (upper === 'MAINTENANCE') return 'maintenance';
  return 'offline';
}

async function callIbmApi<T>(
  token: string,
  method: string,
  path: string,
  body: unknown | null,
  transform: (responseBody: unknown) => T,
): Promise<IbmClientResult<T>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IBM_TIMEOUT_MS);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };

    const init: RequestInit = { method, headers, signal: controller.signal };

    if (body !== null) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await fetch(`${IBM_API_URL}${path}`, init);
    clearTimeout(timeoutId);

    if (response.ok) {
      const json = await response.json();
      return { ok: true, data: transform(json) };
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Authentication failed.' } };
    }
    if (response.status === 404) {
      return { ok: false, error: { errorCode: 'JOB_NOT_FOUND', message: 'Resource not found.' } };
    }
    if (response.status === 429) {
      return { ok: false, error: { errorCode: 'PROVIDER_RATE_LIMITED', message: 'Rate limited by IBM Quantum.' } };
    }

    return { ok: false, error: { errorCode: 'PROVIDER_UNAVAILABLE', message: `IBM returned status ${response.status}.` } };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: { errorCode: 'NETWORK_ERROR', message: 'Request timed out.' } };
    }
    return { ok: false, error: { errorCode: 'NETWORK_ERROR', message: 'Network error connecting to IBM Quantum.' } };
  }
}
