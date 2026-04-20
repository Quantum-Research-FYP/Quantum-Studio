// ---------------------------------------------------------------------------
// Sharing API client
// ---------------------------------------------------------------------------

export interface SharedExperimentResponse {
  id: string;
  name: string;
  description: string | null;
  tags: string[] | null;
  schemaVersion: number;
  circuitJson: Record<string, unknown>;
  latestResultJson: Record<string, unknown> | null;
  visibility: 'private' | 'unlisted' | 'public';
  createdAt: string;
  updatedAt: string;
}

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
