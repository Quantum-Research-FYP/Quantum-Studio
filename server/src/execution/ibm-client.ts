/**
 * IBM Quantum Runtime client abstraction.
 *
 * IBM Quantum now uses IBM Cloud API keys. Every real API call requires an IAM
 * access token obtained by exchanging the stored API key at the IBM Cloud IAM
 * token endpoint. Tokens are cached in memory (keyed by a hash of the API key)
 * and reused until they are within 5 minutes of expiry.
 *
 * Mock mode activates when ENABLE_IBM_QUANTUM !== 'true', allowing dev/test
 * workflows without real credentials.
 */

import { createHash } from 'node:crypto';

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

const IBM_API_URL = process.env.IBM_QUANTUM_API_URL || 'https://us-east.quantum-computing.ibm.com/runtime';
const IBM_TIMEOUT_MS = parseInt(process.env.IBM_QUANTUM_TIMEOUT_MS || '15000', 10);
const IAM_TOKEN_URL = 'https://iam.cloud.ibm.com/identity/token';

function isRealMode(): boolean {
  return process.env.ENABLE_IBM_QUANTUM === 'true';
}

// ---------------------------------------------------------------------------
// IAM Token Cache
// ---------------------------------------------------------------------------

interface IamCacheEntry {
  accessToken: string;
  expiresAt: number; // ms epoch
}

const iamCache = new Map<string, IamCacheEntry>();

/** Exchange an IBM Cloud API key for a short-lived IAM access token. Cached until near-expiry. */
async function resolveIamToken(apiKey: string): Promise<string | null> {
  // Cache key is a truncated hash of the API key — never store the raw key
  const cacheKey = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  const cached = iamCache.get(cacheKey);

  if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) {
    return cached.accessToken;
  }

  try {
    const response = await fetch(IAM_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: `grant_type=urn%3Aibm%3Aparams%3Aoauth%3Agrant-type%3Aapikey&apikey=${encodeURIComponent(apiKey)}`,
    });

    if (!response.ok) {
      console.warn(`[ibm-client] IAM token exchange failed → HTTP ${response.status}`);
      return null;
    }

    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.access_token !== 'string') return null;

    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    iamCache.set(cacheKey, {
      accessToken: body.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    });

    console.log(`[ibm-client] IAM token obtained, expires in ${expiresIn}s. Will call: ${IBM_API_URL}`);
    return body.access_token;
  } catch (err) {
    console.error('[ibm-client] IAM token exchange threw:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mock Implementation
// ---------------------------------------------------------------------------

const MOCK_BACKENDS: IbmBackend[] = [
  { name: 'ibm_brisbane', status: 'online', qubits: 127, pendingJobs: 12 },
  { name: 'ibm_osaka', status: 'online', qubits: 127, pendingJobs: 5 },
  { name: 'ibm_kyoto', status: 'maintenance', qubits: 127, pendingJobs: 0 },
];

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
    async listBackends(apiKey: string): Promise<IbmClientResult<IbmBackend[]>> {
      if (!isRealMode()) {
        if (!apiKey.startsWith('valid-')) {
          return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Invalid token.' } };
        }
        return { ok: true, data: MOCK_BACKENDS };
      }

      const iamToken = await resolveIamToken(apiKey);
      if (!iamToken) {
        return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Failed to obtain IAM access token. Check your IBM Cloud API key.' } };
      }

      return callIbmApi<IbmBackend[]>(iamToken, 'GET', '/backends', null, (body) => {
        const arr = Array.isArray(body) ? body : ((body as Record<string, unknown>).backends as unknown[]) ?? [];
        return (arr as Array<Record<string, unknown>>).map((b) => ({
          name: (b.name as string) || 'unknown',
          status: mapBackendStatus(b.status as string),
          qubits: (b.num_qubits as number) || (b.qubits as number) || 0,
          pendingJobs: (b.pending_jobs as number) || 0,
        }));
      });
    },

    async submitJob(
      apiKey: string,
      backend: string,
      qasm: string,
      shots: number,
    ): Promise<IbmClientResult<IbmJobSubmission>> {
      if (!isRealMode()) {
        if (!apiKey.startsWith('valid-')) {
          return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Invalid token.' } };
        }
        const providerJobId = `mock-ibm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        mockJobStates.set(providerJobId, { status: 'INITIALIZING', createdAt: Date.now() });
        return { ok: true, data: { providerJobId } };
      }

      const iamToken = await resolveIamToken(apiKey);
      if (!iamToken) {
        return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Failed to obtain IAM access token.' } };
      }

      return callIbmApi<IbmJobSubmission>(
        iamToken,
        'POST',
        '/jobs',
        { program_id: 'sampler', backend, params: { pubs: [[qasm]], shots } },
        (body) => ({ providerJobId: (body as Record<string, unknown>).id as string }),
      );
    },

    async getJobStatus(
      apiKey: string,
      providerJobId: string,
    ): Promise<IbmClientResult<IbmJobStatusResponse>> {
      if (!isRealMode()) {
        if (!apiKey.startsWith('valid-')) {
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

      const iamToken = await resolveIamToken(apiKey);
      if (!iamToken) {
        return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Failed to obtain IAM access token.' } };
      }

      return callIbmApi<IbmJobStatusResponse>(
        iamToken,
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
      apiKey: string,
      providerJobId: string,
    ): Promise<IbmClientResult<{ cancelled: boolean }>> {
      if (!isRealMode()) {
        if (!apiKey.startsWith('valid-')) {
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

      const iamToken = await resolveIamToken(apiKey);
      if (!iamToken) {
        return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Failed to obtain IAM access token.' } };
      }

      // IBM Quantum Runtime cancels jobs via DELETE
      return callIbmApi<{ cancelled: boolean }>(
        iamToken,
        'DELETE',
        `/jobs/${encodeURIComponent(providerJobId)}`,
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
  if (upper === 'ONLINE' || upper === 'ACTIVE' || upper === 'AVAILABLE') return 'online';
  if (upper === 'MAINTENANCE' || upper === 'CALIBRATING') return 'maintenance';
  return 'offline';
}

async function callIbmApi<T>(
  iamToken: string,
  method: string,
  path: string,
  body: unknown | null,
  transform: (responseBody: unknown) => T,
): Promise<IbmClientResult<T>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IBM_TIMEOUT_MS);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${iamToken}`,
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
      // DELETE /jobs returns 204 No Content on success
      if (response.status === 204) {
        return { ok: true, data: transform(null) };
      }
      const json = await response.json();
      return { ok: true, data: transform(json) };
    }

    if (response.status === 401 || response.status === 403) {
      console.warn(`[ibm-client] Auth rejected: ${method} ${path} → HTTP ${response.status}`);
      return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Authentication failed.' } };
    }
    if (response.status === 404) {
      console.warn(`[ibm-client] Not found: ${method} ${path} → HTTP 404`);
      return { ok: false, error: { errorCode: 'JOB_NOT_FOUND', message: 'Resource not found.' } };
    }
    if (response.status === 429) {
      return { ok: false, error: { errorCode: 'PROVIDER_RATE_LIMITED', message: 'Rate limited by IBM Quantum.' } };
    }

    return { ok: false, error: { errorCode: 'PROVIDER_UNAVAILABLE', message: `IBM returned status ${response.status}.` } };
  } catch (err: unknown) {
    const cause = err instanceof Error && 'cause' in err ? (err as Error & { cause?: unknown }).cause : undefined;
    console.error('[ibm-client] fetch threw for', method, IBM_API_URL + path,
      err instanceof Error ? `${err.name}: ${err.message}` : err,
      cause ? `| cause: ${cause}` : '',
    );
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: { errorCode: 'NETWORK_ERROR', message: 'Request timed out.' } };
    }
    return { ok: false, error: { errorCode: 'NETWORK_ERROR', message: 'Network error connecting to IBM Quantum.' } };
  }
}
