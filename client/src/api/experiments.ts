// ---------------------------------------------------------------------------
// Experiments API client
// ---------------------------------------------------------------------------

export interface AiProvenanceInput {
  aiAssisted: boolean;
  aiProvider?: string;
  aiModel?: string;
  aiGeneratedAt?: string;
  aiCodeHash?: string;
  aiPrompt?: string;
  aiExplanation?: string;
  aiGeneratedCode?: string;
}

export interface ExperimentResponse {
  id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  schemaVersion: number;
  circuitJson: Record<string, unknown>;
  runSettingsJson: Record<string, unknown> | null;
  latestResultJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
  aiAssisted: boolean;
  aiProvider: string | null;
  aiModel: string | null;
  aiGeneratedAt: string | null;
  aiCodeHash: string | null;
  aiPrompt: string | null;
  aiExplanation: string | null;
  aiGeneratedCode: string | null;
  aiShareProvenance: boolean;
}

export interface ExperimentListItem {
  id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  visibility: 'private' | 'unlisted' | 'public';
}

export interface ExperimentListResponse {
  items: ExperimentListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateExperimentInput {
  name: string;
  circuitJson: Record<string, unknown>;
  description?: string;
  tags?: string[];
  runSettingsJson?: Record<string, unknown>;
  latestResultJson?: Record<string, unknown>;
  aiProvenance?: AiProvenanceInput;
}

export interface UpdateExperimentInput {
  name: string;
  circuitJson: Record<string, unknown>;
  description?: string | null;
  tags?: string[] | null;
  schemaVersion?: number;
  runSettingsJson?: Record<string, unknown> | null;
  latestResultJson?: Record<string, unknown> | null;
  aiProvenance?: AiProvenanceInput;
}

export interface ExperimentListOptions {
  page?: number;
  pageSize?: number;
  sortBy?: 'updated_at' | 'created_at' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface ExperimentApiError {
  error: string;
  errorCode?: string;
  exportUrl?: string;
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  // DELETE returns 204 with no body
  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const apiErr = body as ExperimentApiError | null;
    const err = new Error(apiErr?.error || 'An error occurred.') as Error & {
      status: number;
      errorCode?: string;
      exportUrl?: string;
    };
    err.status = res.status;
    err.errorCode = apiErr?.errorCode;
    err.exportUrl = apiErr?.exportUrl;
    throw err;
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export function createExperiment(input: CreateExperimentInput): Promise<ExperimentResponse> {
  return request<ExperimentResponse>('/api/experiments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getExperiment(id: string): Promise<ExperimentResponse> {
  return request<ExperimentResponse>(`/api/experiments/${encodeURIComponent(id)}`);
}

export function listExperiments(
  options: ExperimentListOptions = {},
): Promise<ExperimentListResponse> {
  const params = new URLSearchParams();
  if (options.page !== undefined) params.set('page', String(options.page));
  if (options.pageSize !== undefined) params.set('pageSize', String(options.pageSize));
  if (options.sortBy) params.set('sortBy', options.sortBy);
  if (options.sortOrder) params.set('sortOrder', options.sortOrder);

  const qs = params.toString();
  return request<ExperimentListResponse>(`/api/experiments${qs ? `?${qs}` : ''}`);
}

export function updateExperiment(
  id: string,
  input: UpdateExperimentInput,
  rowVersion: number,
): Promise<ExperimentResponse> {
  return request<ExperimentResponse>(`/api/experiments/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': `"${rowVersion}"`,
    },
    body: JSON.stringify(input),
  });
}

export function renameExperiment(
  id: string,
  name: string,
  rowVersion: number,
): Promise<ExperimentResponse> {
  return request<ExperimentResponse>(`/api/experiments/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': `"${rowVersion}"`,
    },
    body: JSON.stringify({ name }),
  });
}

export function deleteExperiment(id: string): Promise<void> {
  return request<void>(`/api/experiments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function exportExperimentRaw(id: string): Promise<ExperimentResponse> {
  return request<ExperimentResponse>(`/api/experiments/${encodeURIComponent(id)}/raw`);
}
