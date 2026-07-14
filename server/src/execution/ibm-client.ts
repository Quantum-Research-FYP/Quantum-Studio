/**
 * IBM Quantum Runtime client abstraction.
 *
 * Supports BOTH IBM Quantum Platform (128-char API Token) AND 
 * IBM Cloud (44-char API Key + Auto-resolved CRN).
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
  errorCode:
    | 'INVALID_TOKEN'
    | 'NETWORK_ERROR'
    | 'PROVIDER_UNAVAILABLE'
    | 'PROVIDER_RATE_LIMITED'
    | 'JOB_NOT_FOUND'
    | 'TRANSPILATION_ERROR'
    | 'UNSUPPORTED_FRAMEWORK';
  message: string;
}

export type IbmClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: IbmClientError };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const IBM_TIMEOUT_MS = parseInt(process.env.IBM_QUANTUM_TIMEOUT_MS || '15000', 10);

/**
 * Transpilation timeout is separate from the IBM API timeout.
 * Real backend fetches via QiskitRuntimeService can take 10-20s on first
 * call (downloading calibration data); subsequent calls hit the 5-min cache.
 */
const IBM_TRANSPILE_TIMEOUT_MS = parseInt(process.env.IBM_TRANSPILE_TIMEOUT_MS || '60000', 10);


/** URL of the Python simulation micro-service (same host, port 8000 by default). */
const SIMULATION_SERVICE_URL = process.env.SIMULATION_SERVICE_URL || 'http://localhost:8000';

function isRealMode(): boolean {
  return process.env.ENABLE_IBM_QUANTUM === 'true';
}

// ---------------------------------------------------------------------------
// Token and Configuration Management
// ---------------------------------------------------------------------------

interface IbmConfig {
  type: 'ibm_cloud' | 'ibm_quantum';
  token: string;
  crn?: string;
  baseUrl: string;
}

const iamCache = new Map<string, { accessToken: string; expiresAt: number; crn?: string }>();

async function resolveIbmConfig(apiKey: string): Promise<IbmConfig | null> {
  // IBM Quantum API Tokens are exactly 64 or 128 characters.
  if (apiKey.length >= 60) {
    return {
      type: 'ibm_quantum',
      token: apiKey,
      baseUrl: process.env.IBM_QUANTUM_API_URL || 'https://quantum.cloud.ibm.com/api/v1'
    };
  }

  // Otherwise, it's an IBM Cloud API Key (44 chars).
  const cacheKey = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  const cached = iamCache.get(cacheKey);

  if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) {
    return {
      type: 'ibm_cloud',
      token: cached.accessToken,
      crn: cached.crn,
      baseUrl: 'https://us-east.quantum-computing.cloud.ibm.com'
    };
  }

  try {
    const IAM_TOKEN_URL = 'https://iam.cloud.ibm.com/identity/token';
    const response = await fetch(IAM_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: `grant_type=urn%3Aibm%3Aparams%3Aoauth%3Agrant-type%3Aapikey&apikey=${encodeURIComponent(apiKey)}`,
    });

    if (!response.ok) return null;

    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.access_token !== 'string') return null;
    const iamToken = body.access_token;
    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;

    // Resolve CRN dynamically using IBM Cloud Resource Controller
    let crn = process.env.IBM_QUANTUM_CRN;
    if (!crn) {
      try {
        const rcRes = await fetch('https://resource-controller.cloud.ibm.com/v2/resource_instances', {
          headers: { 'Authorization': `Bearer ${iamToken}` }
        });
        if (rcRes.ok) {
          const resources = await rcRes.json() as any;
          const qiskitInstance = resources.resources?.find((r: any) =>
            r.resource_id === 'quantum-computing' || r.name.includes('quantum') || (r.crn && r.crn.includes('quantum'))
          );
          if (qiskitInstance) crn = qiskitInstance.crn;
        }
      } catch (err) {
        console.warn('[ibm-client] Failed to auto-resolve CRN:', err);
      }
    }

    if (!crn) {
      console.warn('[ibm-client] No CRN found for IBM Cloud API Key. Qiskit Runtime requires a CRN.');
      return null;
    }

    iamCache.set(cacheKey, { accessToken: iamToken, expiresAt: Date.now() + expiresIn * 1000, crn });

    return {
      type: 'ibm_cloud',
      token: iamToken,
      crn,
      baseUrl: 'https://us-east.quantum-computing.cloud.ibm.com'
    };
  } catch (err) {
    console.error('[ibm-client] IAM resolution threw:', err);
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
// Transpilation helper — convert any circuit to IBM-safe ISA QASM 3
// ---------------------------------------------------------------------------

interface SimServiceTranspileResult {
  transpiled_qasm: string;
  metadata: Record<string, unknown>;
}

/** Auth context forwarded to the Python service for real-backend transpilation. */
interface IbmTranspileAuth {
  channel: 'ibm_quantum' | 'ibm_cloud';
  /** Raw IBM API key (IBM Quantum token OR IBM Cloud API key).
   *  qiskit-ibm-runtime handles the IAM exchange internally for IBM Cloud. */
  rawApiKey: string;
  /** CRN for IBM Cloud; hub/group/project for IBM Quantum (optional). */
  instance?: string;
}

/**
 * Sends the raw circuit to the simulation micro-service for conversion and
 * ISA transpilation.  Returns the IBM-executable QASM 3 string on success,
 * or an IbmClientResult error on failure.
 *
 * When ibmAuth is provided the Python service will call QiskitRuntimeService
 * to get the real backend's coupling map — the only way to guarantee that
 * the transpiled circuit will actually run on the target QPU.
 */
async function transpileForIbm(
  code: string,
  codeType: string,
  backend: string,
  ibmAuth?: IbmTranspileAuth,
): Promise<IbmClientResult<SimServiceTranspileResult>> {
  const url = `${SIMULATION_SERVICE_URL}/transpile-ibm`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IBM_TRANSPILE_TIMEOUT_MS);


    const requestBody = {
      code,
      codeType,
      backend,
      // Pass credentials so Python can fetch the REAL coupling map from IBM.
      // Without this, transpilation uses a fake backend whose random coupling
      // map causes qubit-routing mismatches on the real QPU.
      ibm_token:    ibmAuth?.rawApiKey   ?? null,
      ibm_channel:  ibmAuth?.channel     ?? null,
      ibm_instance: ibmAuth?.instance    ?? null,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json() as SimServiceTranspileResult;
      return { ok: true, data };
    }

    // Parse error detail from FastAPI response
    let errorCode: IbmClientError['errorCode'] = 'TRANSPILATION_ERROR';
    let message = `Transpilation failed (HTTP ${response.status}).`;
    try {
      const body = await response.json() as { detail?: { errorCode?: string; message?: string } };
      const detail = body?.detail;
      if (detail?.message) message = detail.message;
      if (detail?.errorCode === 'UNSUPPORTED_FRAMEWORK') errorCode = 'UNSUPPORTED_FRAMEWORK';
    } catch {
      // ignore parse errors
    }

    return { ok: false, error: { errorCode, message } };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: { errorCode: 'NETWORK_ERROR', message: 'Transpilation request timed out.' } };
    }
    console.error('[ibm-client] transpileForIbm threw:', err);
    return { ok: false, error: { errorCode: 'NETWORK_ERROR', message: 'Could not reach simulation service for transpilation.' } };
  }
}

// ---------------------------------------------------------------------------
// Client Factory
// ---------------------------------------------------------------------------

export function createIbmClient() {
  return {
    async listBackends(apiKey: string): Promise<IbmClientResult<IbmBackend[]>> {
      if (!isRealMode()) {
        if (!apiKey.startsWith('valid-')) return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Invalid token.' } };
        return { ok: true, data: MOCK_BACKENDS };
      }

      const config = await resolveIbmConfig(apiKey);
      if (!config) {
        return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Failed to resolve credentials (check API Key and CRN).' } };
      }

      return callIbmApi<IbmBackend[]>(config, 'GET', '/backends', null, (body) => {
        let arr: any[];
        if (config.type === 'ibm_cloud') {
          arr = (body as any).devices?.map((name: string) => ({ name, status: 'online', num_qubits: 127, pending_jobs: 0 })) || [];
        } else {
          arr = Array.isArray(body) ? body : ((body as Record<string, unknown>).backends as unknown[]) ?? [];
        }
        return (arr as Array<Record<string, unknown>>).map((b) => ({
          name: (b.name as string) || 'unknown',
          status: mapBackendStatus(b.status as string),
          qubits: (b.num_qubits as number) || (b.qubits as number) || 127,
          pendingJobs: (b.pending_jobs as number) || 0,
        }));
      });
    },

    async submitJob(apiKey: string, backend: string, qasm: string, shots: number, codeType: string = 'qasm'): Promise<IbmClientResult<IbmJobSubmission>> {
      if (!isRealMode()) {
        if (!apiKey.startsWith('valid-')) return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Invalid token.' } };
        const providerJobId = `mock-ibm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        mockJobStates.set(providerJobId, { status: 'INITIALIZING', createdAt: Date.now() });
        return { ok: true, data: { providerJobId } };
      }

      const config = await resolveIbmConfig(apiKey);
      if (!config) return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Failed to resolve credentials.' } };

      // ------------------------------------------------------------------
      // Transpilation step: convert circuit to IBM-executable ISA QASM 3
      // IBM QPUs cannot execute Cirq, PennyLane, TKET, Braket, or raw QASM
      // directly. The correct flow is:
      //   1. Accept the circuit from any framework
      //   2. Convert it to a Qiskit QuantumCircuit (via simulation-service)
      //   3. Transpile for the selected backend (ISA compliance)
      //   4. Submit the transpiled QASM 3 to IBM Qiskit Runtime
      // ------------------------------------------------------------------
      console.log(`[ibm-client] Transpiling ${codeType} circuit for ${backend}...`);
      const transpileResult = await transpileForIbm(qasm, codeType, backend, {
        channel: config.type,
        // Pass the original API key (not the IAM-resolved token) so that
        // qiskit-ibm-runtime can handle its own IAM token exchange internally.
        rawApiKey: apiKey,
        instance: config.crn,
      });
      if (!transpileResult.ok) {
        console.warn('[ibm-client] Transpilation failed:', transpileResult.error.message);
        return transpileResult;
      }

      const transpiledQasm = transpileResult.data.transpiled_qasm;
      console.log('[ibm-client] Transpilation succeeded. Submitting to IBM Qiskit Runtime...');

      return callIbmApi<IbmJobSubmission>(
        config,
        'POST',
        '/jobs',
        { program_id: 'sampler', backend, params: { version: 2, pubs: [[transpiledQasm]], shots } },
        (body) => ({ providerJobId: (body as Record<string, unknown>).id as string }),
      );
    },

    async getJobStatus(apiKey: string, providerJobId: string): Promise<IbmClientResult<IbmJobStatusResponse>> {
      if (!isRealMode()) {
        if (!apiKey.startsWith('valid-')) return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Invalid token.' } };
        if (!mockJobStates.has(providerJobId)) return { ok: false, error: { errorCode: 'JOB_NOT_FOUND', message: 'Job not found.' } };
        const status = getMockJobStatus(providerJobId);
        return {
          ok: true,
          data: {
            providerJobId,
            status,
            counts: status === 'DONE' ? { '00': 512, '11': 512 } : null,
            metadata: { backend: 'ibm_brisbane', shots: 1024 },
            errorMessage: status === 'ERROR' ? 'Execution failed.' : null,
          },
        };
      }

      const config = await resolveIbmConfig(apiKey);
      if (!config) return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Failed to resolve credentials.' } };

      const statusRes = await callIbmApi<IbmJobStatusResponse>(
        config,
        'GET',
        `/jobs/${encodeURIComponent(providerJobId)}`,
        null,
        (body) => {
          console.log(`[ibm-client] Raw /jobs/${providerJobId} response from IBM:`, JSON.stringify(body).slice(0, 500));
          const b = body as Record<string, any>;
          let errorMessage = b.error_message as string | undefined;
          if (!errorMessage && b.state && typeof b.state === 'object' && typeof b.state.reason === 'string') {
            errorMessage = b.state.reason;
          }
          return {
            providerJobId: (b.id as string) || providerJobId,
            status: (b.status as string) || 'UNKNOWN',
            counts: null,
            metadata: { backend: b.backend, shots: b.shots },
            errorMessage: errorMessage ?? null,
          };
        },
      );

      if (!statusRes.ok) {
        return statusRes;
      }

      const rawStatus = statusRes.data.status.toUpperCase();
      console.log(`[ibm-client] Normalized status for ${providerJobId}: ${rawStatus}`);

      if (rawStatus !== 'COMPLETED' && rawStatus !== 'DONE') {
        return statusRes;
      }

      // ------------------------------------------------------------------
      // Job is completed, fetch counts via Python simulation service.
      // ------------------------------------------------------------------
      try {
        console.log(`[ibm-client] Job ${providerJobId} is completed. Requesting python service to fetch results...`);
        const url = `${SIMULATION_SERVICE_URL}/ibm-job-result`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), IBM_TRANSPILE_TIMEOUT_MS);
        
        const payload = {
          job_id: providerJobId,
          ibm_token: apiKey,
          ibm_channel: config.type,
          ibm_instance: config.crn ?? null,
        };
        console.log(`[ibm-client] Sending payload to python:`, { ...payload, ibm_token: '***' });

        const fetchRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (fetchRes.ok) {
          const data = await fetchRes.json() as { counts: Record<string, number>, metadata?: Record<string, unknown> };
          console.log(`[ibm-client] Python service returned counts:`, data.counts);
          statusRes.data.counts = data.counts;
          if (data.metadata) {
            statusRes.data.metadata = { ...statusRes.data.metadata, ...data.metadata };
          }
        } else {
          const errText = await fetchRes.text().catch(() => 'unknown');
          console.error(`[ibm-client] Failed to fetch job results from python service (HTTP ${fetchRes.status}): ${errText}`);
        }
      } catch (err) {
        console.error('[ibm-client] Error fetching job results from python service:', err);
      }

      return statusRes;
    },

    async cancelJob(apiKey: string, providerJobId: string): Promise<IbmClientResult<{ cancelled: boolean }>> {
      if (!isRealMode()) {
        if (!apiKey.startsWith('valid-')) return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Invalid token.' } };
        const entry = mockJobStates.get(providerJobId);
        if (!entry) return { ok: false, error: { errorCode: 'JOB_NOT_FOUND', message: 'Job not found.' } };
        const currentStatus = getMockJobStatus(providerJobId);
        if (currentStatus === 'DONE' || currentStatus === 'ERROR' || currentStatus === 'CANCELLED') {
          return { ok: true, data: { cancelled: false } };
        }
        entry.status = 'CANCELLED';
        return { ok: true, data: { cancelled: true } };
      }

      const config = await resolveIbmConfig(apiKey);
      if (!config) return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'Failed to resolve credentials.' } };

      return callIbmApi<{ cancelled: boolean }>(
        config,
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
  config: IbmConfig,
  method: string,
  path: string,
  body: unknown | null,
  transform: (responseBody: unknown) => T,
): Promise<IbmClientResult<T>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IBM_TIMEOUT_MS);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (config.type === 'ibm_cloud') {
      headers['Authorization'] = `Bearer ${config.token}`;
      if (config.crn) headers['Service-CRN'] = config.crn;
    } else {
      headers['X-Access-Token'] = config.token;
    }

    const init: RequestInit = { method, headers, signal: controller.signal };

    if (body !== null) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await fetch(`${config.baseUrl}${path}`, init);
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
    console.error('[ibm-client] fetch threw for', method, config.baseUrl + path,
      err instanceof Error ? `${err.name}: ${err.message}` : err,
      cause ? `| cause: ${cause}` : '',
    );
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: { errorCode: 'NETWORK_ERROR', message: 'Request timed out.' } };
    }
    return { ok: false, error: { errorCode: 'NETWORK_ERROR', message: 'Network error connecting to IBM Quantum.' } };
  }
}
