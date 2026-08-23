// ---------------------------------------------------------------------------
// Sharing API client
// ---------------------------------------------------------------------------

export type Visibility = 'private' | 'unlisted' | 'public';

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
}

export interface RotateTokenResponse {
  id: string;
  shareUrl: string;
  token: string;
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
  const url = `/api/shared/experiments/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;

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
  return authRequest<VisibilityResponse>(`/api/experiments/${encodeURIComponent(id)}/visibility`, {
    method: 'PATCH',
    body: JSON.stringify({ visibility }),
  });
}

/** Get or create a share link for an unlisted experiment. */
export function getShareLink(id: string): Promise<ShareLinkResponse> {
  return authRequest<ShareLinkResponse>(`/api/experiments/${encodeURIComponent(id)}/share-link`);
}

/** Rotate the share token (revokes old, issues new). */
export function rotateShareToken(id: string): Promise<RotateTokenResponse> {
  return authRequest<RotateTokenResponse>(
    `/api/experiments/${encodeURIComponent(id)}/share-token/rotate`,
    { method: 'POST' },
  );
}

/** Revoke the share token without issuing a new one. */
export function revokeShareToken(id: string): Promise<void> {
  return authRequest<void>(`/api/experiments/${encodeURIComponent(id)}/share-token`, {
    method: 'DELETE',
  });
}
