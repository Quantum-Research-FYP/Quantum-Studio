// ---------------------------------------------------------------------------
// GitHub Integration API client
// ---------------------------------------------------------------------------

export interface GitHubStatus {
  enabled: boolean;
  connected: boolean;
  validationStatus?: 'pending' | 'valid' | 'invalid' | 'error';
  username?: string | null;
  avatarUrl?: string | null;
  name?: string | null;
  profileUrl?: string | null;
  linkedAt?: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  description: string | null;
  defaultBranch: string;
  htmlUrl: string;
  updatedAt: string;
}

export interface GitHubPushResult {
  success: boolean;
  sha: string;
  htmlUrl: string;
  message: string;
}

export interface GitHubImportResult {
  name: string;
  path: string;
  content: string;
  htmlUrl: string;
  size: number;
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
    const apiErr = body as { error?: string; errorCode?: string } | null;
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

/** Check GitHub connection status. */
export function getGitHubStatus(): Promise<GitHubStatus> {
  return request('/api/integrations/github/status');
}

/** Disconnect GitHub account. */
export function disconnectGitHub(): Promise<{ disconnected: boolean }> {
  return request('/api/integrations/github/disconnect', { method: 'POST' });
}

/** List user's GitHub repositories. */
export function listGitHubRepos(page = 1): Promise<{ repos: GitHubRepo[] }> {
  return request(`/api/integrations/github/repos?page=${page}`);
}

/** Push a file to a GitHub repository. */
export function pushToGitHub(
  owner: string,
  repo: string,
  filePath: string,
  content: string,
  commitMessage?: string,
  branch?: string,
): Promise<GitHubPushResult> {
  return request('/api/integrations/github/push', {
    method: 'POST',
    body: JSON.stringify({ owner, repo, filePath, content, commitMessage, branch }),
  });
}

/** Import a file from a GitHub repository. */
export function importFromGitHub(
  owner: string,
  repo: string,
  filePath: string,
  branch?: string,
): Promise<GitHubImportResult> {
  return request('/api/integrations/github/import', {
    method: 'POST',
    body: JSON.stringify({ owner, repo, filePath, branch }),
  });
}
