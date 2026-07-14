/**
 * GitHub REST API client for Quantum Studio.
 *
 * Provides methods to interact with GitHub on behalf of users:
 * - OAuth token exchange
 * - User info retrieval
 * - Repository listing
 * - File commit (create / update)
 * - File retrieval (import)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubUser {
  login: string;
  id: number;
  avatarUrl: string;
  name: string | null;
  profileUrl: string;
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

export interface GitHubCommitResult {
  sha: string;
  htmlUrl: string;
  message: string;
}

export interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  content: string;       // decoded from base64
  htmlUrl: string;
  size: number;
}

export interface GitHubClientError {
  errorCode: 'INVALID_TOKEN' | 'NETWORK_ERROR' | 'NOT_FOUND' | 'RATE_LIMITED' | 'CONFLICT';
  message: string;
}

export type GitHubResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: GitHubClientError };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GITHUB_API_URL = 'https://api.github.com';
const TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Client Factory
// ---------------------------------------------------------------------------

export function createGitHubClient() {
  return {
    /**
     * Exchange an OAuth authorization code for an access token.
     */
    async exchangeCodeForToken(
      code: string,
      clientId: string,
      clientSecret: string,
      redirectUri: string,
    ): Promise<GitHubResult<{ accessToken: string; scope: string }>> {
      try {
        const response = await fetchWithTimeout('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: redirectUri,
          }),
        });

        if (!response.ok) {
          return { ok: false, error: { errorCode: 'NETWORK_ERROR', message: `GitHub token exchange failed (HTTP ${response.status}).` } };
        }

        const body = (await response.json()) as Record<string, unknown>;
        if (body.error) {
          return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: (body.error_description as string) || 'Token exchange failed.' } };
        }

        return {
          ok: true,
          data: {
            accessToken: body.access_token as string,
            scope: (body.scope as string) || '',
          },
        };
      } catch (err) {
        return networkError(err);
      }
    },

    /**
     * Fetch the authenticated GitHub user's profile.
     */
    async getUser(accessToken: string): Promise<GitHubResult<GitHubUser>> {
      return callGitHubApi<GitHubUser>(accessToken, 'GET', '/user', null, (body) => {
        const b = body as Record<string, unknown>;
        return {
          login: b.login as string,
          id: b.id as number,
          avatarUrl: (b.avatar_url as string) || '',
          name: (b.name as string) || null,
          profileUrl: (b.html_url as string) || '',
        };
      });
    },

    /**
     * List repositories the user has push access to.
     */
    async listRepos(
      accessToken: string,
      page = 1,
      perPage = 30,
    ): Promise<GitHubResult<GitHubRepo[]>> {
      return callGitHubApi<GitHubRepo[]>(
        accessToken,
        'GET',
        `/user/repos?sort=updated&direction=desc&per_page=${perPage}&page=${page}&affiliation=owner,collaborator`,
        null,
        (body) => {
          const repos = body as Array<Record<string, unknown>>;
          return repos.map((r) => ({
            id: r.id as number,
            name: r.name as string,
            fullName: r.full_name as string,
            private: r.private as boolean,
            description: (r.description as string) || null,
            defaultBranch: (r.default_branch as string) || 'main',
            htmlUrl: r.html_url as string,
            updatedAt: r.updated_at as string,
          }));
        },
      );
    },

    /**
     * Create or update a file in a repository.
     * If the file already exists, its SHA is required to update it.
     */
    async commitFile(
      accessToken: string,
      owner: string,
      repo: string,
      filePath: string,
      content: string,
      commitMessage: string,
      branch?: string,
    ): Promise<GitHubResult<GitHubCommitResult>> {
      // First check if the file exists to get its SHA
      let existingSha: string | undefined;
      const checkResult = await callGitHubApi<{ sha: string } | null>(
        accessToken,
        'GET',
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`,
        null,
        (body) => {
          if (!body) return null;
          const b = body as Record<string, unknown>;
          return { sha: b.sha as string };
        },
      );
      if (checkResult.ok && checkResult.data) {
        existingSha = checkResult.data.sha;
      }

      // Create/update the file
      const payload: Record<string, unknown> = {
        message: commitMessage,
        content: Buffer.from(content, 'utf-8').toString('base64'),
      };
      if (existingSha) {
        payload.sha = existingSha;
      }
      if (branch) {
        payload.branch = branch;
      }

      return callGitHubApi<GitHubCommitResult>(
        accessToken,
        'PUT',
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}`,
        payload,
        (body) => {
          const b = body as Record<string, unknown>;
          const commit = b.commit as Record<string, unknown>;
          const fileContent = b.content as Record<string, unknown>;
          return {
            sha: commit.sha as string,
            htmlUrl: (fileContent?.html_url as string) || '',
            message: (commit.message as string) || commitMessage,
          };
        },
      );
    },

    /**
     * Retrieve the contents of a file from a repository.
     */
    async getFile(
      accessToken: string,
      owner: string,
      repo: string,
      filePath: string,
      branch?: string,
    ): Promise<GitHubResult<GitHubFileContent>> {
      return callGitHubApi<GitHubFileContent>(
        accessToken,
        'GET',
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`,
        null,
        (body) => {
          const b = body as Record<string, unknown>;
          const raw = (b.content as string) || '';
          const decoded = Buffer.from(raw.replace(/\n/g, ''), 'base64').toString('utf-8');
          return {
            name: b.name as string,
            path: b.path as string,
            sha: b.sha as string,
            content: decoded,
            htmlUrl: (b.html_url as string) || '',
            size: (b.size as number) || 0,
          };
        },
      );
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP Helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGitHubApi<T>(
  accessToken: string,
  method: string,
  path: string,
  body: unknown | null,
  transform: (responseBody: unknown) => T,
): Promise<GitHubResult<T>> {
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const init: RequestInit = { method, headers };

    if (body !== null) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await fetchWithTimeout(`${GITHUB_API_URL}${path}`, init);

    if (response.ok) {
      const json = await response.json();
      return { ok: true, data: transform(json) };
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: { errorCode: 'INVALID_TOKEN', message: 'GitHub authentication failed or token expired.' } };
    }
    if (response.status === 404) {
      return { ok: false, error: { errorCode: 'NOT_FOUND', message: 'Resource not found on GitHub.' } };
    }
    if (response.status === 409) {
      return { ok: false, error: { errorCode: 'CONFLICT', message: 'Conflict — the file may have been modified.' } };
    }
    if (response.status === 429) {
      return { ok: false, error: { errorCode: 'RATE_LIMITED', message: 'GitHub API rate limit exceeded. Please wait.' } };
    }

    return { ok: false, error: { errorCode: 'NETWORK_ERROR', message: `GitHub API returned status ${response.status}.` } };
  } catch (err) {
    return networkError(err);
  }
}

function networkError<T>(err: unknown): GitHubResult<T> {
  if (err instanceof Error && err.name === 'AbortError') {
    return { ok: false, error: { errorCode: 'NETWORK_ERROR', message: 'Request to GitHub timed out.' } };
  }
  return { ok: false, error: { errorCode: 'NETWORK_ERROR', message: 'Network error connecting to GitHub.' } };
}
