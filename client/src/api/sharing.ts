import { API_BASE_URL } from '../config';
// ---------------------------------------------------------------------------
// Sharing API client
// ---------------------------------------------------------------------------

export type Visibility = 'private' | 'unlisted';
export type ShareAccess = 'read' | 'write';

export interface SharedExperimentResponse {
  id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  schemaVersion: number;
  circuitJson: Record<string, unknown>;
  latestResultJson: Record<string, unknown> | null;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
  access: ShareAccess;
  aiAssisted?: boolean;
  aiProvider?: string | null;
  aiModel?: string | null;
  aiGeneratedAt?: string | null;
  aiPrompt?: string | null;
  aiExplanation?: string | null;
  aiGeneratedCode?: string | null;
}

export interface VisibilityResponse {
  id: string;
  visibility: Visibility;
}

export interface ShareLinkResponse {
  id: string;
  hasToken: boolean;
  shareUrl?: string;
  token?: string;
  message?: string;
  access: ShareAccess;
}

export interface RotateTokenResponse {
  id: string;
  shareUrl: string;
  token: string;
  access: ShareAccess;
}

export interface ShareApiError {
  error: string;
  errorCode?: string;
}

// ---------------------------------------------------------------------------
// Request helper (authenticated)
// ---------------------------------------------------------------------------

async function authRequest<T>(url: string, options?: RequestInit): Promise<T> {
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
    const apiErr = body as ShareApiError | null;
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

// ---------------------------------------------------------------------------
// Public shared viewer
// ---------------------------------------------------------------------------

/**
 * Fetch a shared experiment (public or unlisted with token).
 * Returns null on 404 (experiment not found or not accessible).
 */
export async function getSharedExperiment(
  id: string,
  token?: string,
): Promise<SharedExperimentResponse | null> {
  const params = new URLSearchParams();
  if (token) params.set('token', token);

  const qs = params.toString();
  const url = `${API_BASE_URL}/api/shared/experiments/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;

  const res = await fetch(url);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error('Failed to load shared experiment.');
  }

  return res.json() as Promise<SharedExperimentResponse>;
}

// ---------------------------------------------------------------------------
// Owner sharing management
// ---------------------------------------------------------------------------

/** Update experiment visibility. */
export function updateVisibility(id: string, visibility: Visibility): Promise<VisibilityResponse> {
  return authRequest<VisibilityResponse>(`${API_BASE_URL}/api/experiments/${encodeURIComponent(id)}/visibility`, {
    method: 'PATCH',
    body: JSON.stringify({ visibility }),
  });
}

/** Get or create a share link for an unlisted experiment. */
export function getShareLink(id: string, access: ShareAccess = 'read'): Promise<ShareLinkResponse> {
  return authRequest<ShareLinkResponse>(`${API_BASE_URL}/api/experiments/${encodeURIComponent(id)}/share-link?access=${access}`);
}

/** Rotate the share token (revokes old, issues new). */
export function rotateShareToken(id: string, access: ShareAccess): Promise<RotateTokenResponse> {
  return authRequest<RotateTokenResponse>(
    `${API_BASE_URL}/api/experiments/${encodeURIComponent(id)}/share-token/rotate`,
    { method: 'POST', body: JSON.stringify({ access }) },
  );
}

export function updateShareAccess(id: string, access: ShareAccess): Promise<void> {
  return authRequest<void>(`${API_BASE_URL}/api/experiments/${encodeURIComponent(id)}/share-token/access`, {
    method: 'PATCH',
    body: JSON.stringify({ access }),
  });
}

export interface SharedExperimentUpdateResponse {
  id: string;
  name: string;
  rowVersion: number;
  updatedAt: string;
}

export function updateSharedExperiment(
  id: string,
  token: string,
  name: string,
  circuitJson: Record<string, unknown>,
  rowVersion: number,
): Promise<SharedExperimentUpdateResponse> {
  return authRequest<SharedExperimentUpdateResponse>(
    `${API_BASE_URL}/api/shared/experiments/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
    { method: 'PUT', body: JSON.stringify({ name, circuitJson, rowVersion }) },
  );
}

/** Revoke the share token without issuing a new one. */
export function revokeShareToken(id: string): Promise<void> {
  return authRequest<void>(`${API_BASE_URL}/api/experiments/${encodeURIComponent(id)}/share-token`, {
    method: 'DELETE',
  });
}
