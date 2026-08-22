// ---------------------------------------------------------------------------
// Integrations API client (IBM Quantum credentials)
// ---------------------------------------------------------------------------

export interface IbmSettingsResponse {
  id: string;
  userId: string;
  provider: string;
  hasToken: boolean;
  validationStatus: 'pending' | 'valid' | 'invalid' | 'error';
  validationErrorCode: string | null;
  validationMessage?: string;
  lastValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationsApiError {
  error: string;
  errorCode?: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const apiErr = body as IntegrationsApiError | null;
    const err = new Error(apiErr?.error || 'An error occurred.') as Error & {
      status: number;
      errorCode?: string;
    };
    err.status = res.status;
    err.errorCode = apiErr?.errorCode;
    throw err;
  }

  return body as T;
}

export function saveIbmSettings(token: string): Promise<IbmSettingsResponse> {
  return request('/api/integrations/ibm-quantum/settings', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function getIbmSettings(): Promise<IbmSettingsResponse> {
  return request('/api/integrations/ibm-quantum/settings');
}

export function deleteIbmSettings(): Promise<void> {
  return request('/api/integrations/ibm-quantum/settings', {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// SpinQ Quantum Settings
// ---------------------------------------------------------------------------

export interface SpinqSettingsResponse {
  settings: {
    id: string;
    userId: string;
    ip: string;
    port: number;
    username: string;
    hasPassword: boolean;
    createdAt: string;
    updatedAt: string;
  };
}

export function saveSpinqSettings(ip: string, port: number, username: string, password?: string): Promise<SpinqSettingsResponse> {
  return request('/api/integrations/spinq/settings', {
    method: 'POST',
    body: JSON.stringify({ ip, port, username, password }),
  });
}

export function getSpinqSettings(): Promise<SpinqSettingsResponse> {
  return request('/api/integrations/spinq/settings');
}
