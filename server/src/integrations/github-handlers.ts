/**
 * GitHub integration handlers.
 *
 * Provides the following endpoints:
 *   GET  /connect          — Redirect user to GitHub OAuth authorization
 *   GET  /callback         — Handle OAuth callback, store encrypted token
 *   GET  /status           — Check if GitHub is connected, return profile info
 *   POST /disconnect       — Remove stored GitHub credentials
 *   GET  /repos            — List user's repositories
 *   POST /push             — Commit a file to a repository
 *   POST /import           — Import a file from a repository
 */

import type { Request, Response } from 'express';
import type { Db } from 'mongodb';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/authenticate.js';
import { createIntegrationsRepository } from './repository.js';
import { createAuditRepository } from '../execution/audit.js';
import { createGitHubClient } from './github-client.js';
import { decrypt, type EncryptedPayload } from '../execution/encryption.js';
import { COLLECTIONS, type AppDocument } from '../db/collections.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER = 'github';

const ERROR_CODES = {
  FEATURE_DISABLED: 'GITHUB_DISABLED',
  NOT_CONNECTED: 'GITHUB_NOT_CONNECTED',
  OAUTH_FAILED: 'GITHUB_OAUTH_FAILED',
  MISSING_FIELDS: 'MISSING_FIELDS',
  PUSH_FAILED: 'PUSH_FAILED',
  IMPORT_FAILED: 'IMPORT_FAILED',
} as const;

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getGitHubConfig() {
  return {
    enabled: process.env.ENABLE_GITHUB_INTEGRATION === 'true',
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    redirectUri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:3001/api/integrations/github/callback',
    frontendUrl: process.env.APP_URL || 'http://localhost:5173',
  };
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/** Retrieve the decrypted GitHub access token for a user. */
async function getDecryptedGitHubToken(pool: Db, userId: string): Promise<string | null> {
  const settings = pool.collection<AppDocument>(COLLECTIONS.USER_INTEGRATION_SETTINGS);
  const doc = await settings.findOne(
    { userId, provider: PROVIDER },
    { projection: { encryptedToken: 1, tokenIv: 1, tokenAuthTag: 1 } },
  );

  if (!doc || !doc.encryptedToken) return null;

  const payload: EncryptedPayload = {
    ciphertext: doc.encryptedToken as string,
    iv: doc.tokenIv as string,
    authTag: doc.tokenAuthTag as string,
  };

  try {
    return decrypt(payload);
  } catch {
    console.error('[github] Failed to decrypt token for user', userId);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler Factory
// ---------------------------------------------------------------------------

export function createGitHubHandlers(pool: Db) {
  const repo = createIntegrationsRepository(pool);
  const audit = createAuditRepository(pool);
  const github = createGitHubClient();
  const config = getGitHubConfig();

  return {
    /**
     * GET /connect
     * Initiates the GitHub OAuth flow by redirecting the user to GitHub.
     */
    connect(req: Request, res: Response): void {
      if (!config.enabled) {
        res.status(503).json({ error: 'GitHub integration is not enabled.', errorCode: ERROR_CODES.FEATURE_DISABLED });
        return;
      }

      // Generate a CSRF state token tied to the user's session
      const state = Buffer.from(
        JSON.stringify({ userId: req.user!.id, nonce: crypto.randomUUID() }),
      ).toString('base64url');

      const scopes = ['repo', 'read:user'].join(' ');
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(config.clientId)}&redirect_uri=${encodeURIComponent(config.redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;

      res.redirect(authUrl);
    },

    /**
     * GET /callback
     * Handles the OAuth callback from GitHub: exchanges code for token, fetches user info, stores encrypted token.
     */
    async callback(req: Request, res: Response): Promise<void> {
      if (!config.enabled) {
        res.redirect(`${config.frontendUrl}/settings?github=disabled`);
        return;
      }

      const { code, state, error: oauthError } = req.query;

      if (oauthError || !code || !state) {
        console.warn('[github] OAuth callback error:', oauthError || 'missing code/state');
        res.redirect(`${config.frontendUrl}/settings?github=error&reason=${encodeURIComponent(String(oauthError || 'missing_params'))}`);
        return;
      }

      // Parse state to get userId
      let userId: string;
      try {
        const parsed = JSON.parse(Buffer.from(String(state), 'base64url').toString());
        userId = parsed.userId;
        if (!userId) throw new Error('No userId in state');
      } catch {
        res.redirect(`${config.frontendUrl}/settings?github=error&reason=invalid_state`);
        return;
      }

      // Exchange code for access token
      const tokenResult = await github.exchangeCodeForToken(
        String(code),
        config.clientId,
        config.clientSecret,
        config.redirectUri,
      );

      if (!tokenResult.ok) {
        console.error('[github] Token exchange failed:', tokenResult.error.message);
        res.redirect(`${config.frontendUrl}/settings?github=error&reason=token_exchange_failed`);
        return;
      }

      const { accessToken, scope } = tokenResult.data;

      // Fetch GitHub user profile
      const userResult = await github.getUser(accessToken);
      if (!userResult.ok) {
        console.error('[github] User fetch failed:', userResult.error.message);
        res.redirect(`${config.frontendUrl}/settings?github=error&reason=user_fetch_failed`);
        return;
      }

      const ghUser = userResult.data;

      // Store encrypted token using the existing integrations repository
      try {
        await repo.upsertSettings(userId, PROVIDER, accessToken);
        await repo.updateValidationStatus(userId, PROVIDER, 'valid');
      } catch (err) {
        console.error('[github] Failed to store token:', (err as Error).message);
        res.redirect(`${config.frontendUrl}/settings?github=error&reason=storage_failed`);
        return;
      }

      // Store GitHub profile metadata on the user document
      const users = pool.collection<AppDocument>(COLLECTIONS.USERS);
      await users.updateOne(
        { _id: userId },
        {
          $set: {
            'github.username': ghUser.login,
            'github.accountId': ghUser.id,
            'github.avatarUrl': ghUser.avatarUrl,
            'github.name': ghUser.name,
            'github.profileUrl': ghUser.profileUrl,
            'github.scopes': scope.split(',').map((s: string) => s.trim()),
            'github.linkedAt': new Date(),
          },
        },
      );

      // Audit log
      const correlationId = crypto.randomUUID();
      await audit.log({
        actorUserId: userId,
        action: 'credential.create',
        entityType: 'integration_settings',
        entityId: `github-${userId}`,
        correlationId,
        metadata: { provider: PROVIDER, githubUsername: ghUser.login },
      });

      console.log(`[github] Successfully connected user=${userId} github=${ghUser.login}`);
      res.redirect(`${config.frontendUrl}/settings?github=connected`);
    },

    /**
     * GET /status
     * Returns the current GitHub connection status for the authenticated user.
     */
    async status(req: Request, res: Response): Promise<void> {
      if (!config.enabled) {
        res.status(200).json({ enabled: false, connected: false });
        return;
      }

      const userId = req.user!.id;

      // Check if we have stored settings
      const settings = await repo.getSettings(userId, PROVIDER);
      if (!settings || !settings.hasToken) {
        res.status(200).json({ enabled: true, connected: false });
        return;
      }

      // Get the GitHub profile from the user document
      const users = pool.collection<AppDocument>(COLLECTIONS.USERS);
      const userDoc = await users.findOne(
        { _id: userId },
        { projection: { github: 1 } },
      );

      const ghProfile = userDoc?.github as Record<string, unknown> | undefined;

      res.status(200).json({
        enabled: true,
        connected: true,
        validationStatus: settings.validationStatus,
        username: ghProfile?.username || null,
        avatarUrl: ghProfile?.avatarUrl || null,
        name: ghProfile?.name || null,
        profileUrl: ghProfile?.profileUrl || null,
        linkedAt: ghProfile?.linkedAt ? (ghProfile.linkedAt as Date).toISOString() : null,
      });
    },

    /**
     * POST /disconnect
     * Removes the GitHub integration for the authenticated user.
     */
    async disconnect(req: Request, res: Response): Promise<void> {
      const userId = req.user!.id;

      await repo.deleteSettings(userId, PROVIDER);

      // Remove GitHub metadata from user document
      const users = pool.collection<AppDocument>(COLLECTIONS.USERS);
      await users.updateOne({ _id: userId }, { $unset: { github: '' } });

      // Audit log
      await audit.log({
        actorUserId: userId,
        action: 'credential.delete',
        entityType: 'integration_settings',
        entityId: `github-${userId}`,
        metadata: { provider: PROVIDER },
      });

      console.log(`[github] Disconnected user=${userId}`);
      res.status(200).json({ disconnected: true });
    },

    /**
     * GET /repos
     * Lists the authenticated user's GitHub repositories.
     */
    async listRepos(req: Request, res: Response): Promise<void> {
      const userId = req.user!.id;
      const accessToken = await getDecryptedGitHubToken(pool, userId);

      if (!accessToken) {
        res.status(400).json({ error: 'GitHub is not connected.', errorCode: ERROR_CODES.NOT_CONNECTED });
        return;
      }

      const page = parseInt(String(req.query.page || '1'), 10);
      const result = await github.listRepos(accessToken, page);

      if (!result.ok) {
        res.status(502).json({ error: result.error.message, errorCode: result.error.errorCode });
        return;
      }

      res.status(200).json({ repos: result.data });
    },

    /**
     * POST /push
     * Commits a file to a GitHub repository on behalf of the user.
     * Body: { owner, repo, filePath, content, commitMessage, branch? }
     */
    async push(req: Request, res: Response): Promise<void> {
      const userId = req.user!.id;
      const accessToken = await getDecryptedGitHubToken(pool, userId);

      if (!accessToken) {
        res.status(400).json({ error: 'GitHub is not connected.', errorCode: ERROR_CODES.NOT_CONNECTED });
        return;
      }

      const { owner, repo: repoName, filePath, content, commitMessage, branch } = req.body ?? {};

      if (!owner || !repoName || !filePath || typeof content !== 'string') {
        res.status(400).json({
          error: 'Missing required fields: owner, repo, filePath, content.',
          errorCode: ERROR_CODES.MISSING_FIELDS,
        });
        return;
      }

      const message = commitMessage || `Update ${filePath} via Quantum Studio`;

      const result = await github.commitFile(
        accessToken,
        String(owner),
        String(repoName),
        String(filePath),
        content,
        message,
        branch ? String(branch) : undefined,
      );

      if (!result.ok) {
        console.error(`[github] Push failed for user=${userId}:`, result.error.message);
        res.status(502).json({ error: result.error.message, errorCode: ERROR_CODES.PUSH_FAILED });
        return;
      }

      console.log(`[github] Push success user=${userId} file=${owner}/${repoName}/${filePath}`);
      res.status(200).json({
        success: true,
        sha: result.data.sha,
        htmlUrl: result.data.htmlUrl,
        message: result.data.message,
      });
    },

    /**
     * POST /import
     * Imports a file from a GitHub repository.
     * Body: { owner, repo, filePath, branch? }
     */
    async importFile(req: Request, res: Response): Promise<void> {
      const userId = req.user!.id;
      const accessToken = await getDecryptedGitHubToken(pool, userId);

      if (!accessToken) {
        res.status(400).json({ error: 'GitHub is not connected.', errorCode: ERROR_CODES.NOT_CONNECTED });
        return;
      }

      const { owner, repo: repoName, filePath, branch } = req.body ?? {};

      if (!owner || !repoName || !filePath) {
        res.status(400).json({
          error: 'Missing required fields: owner, repo, filePath.',
          errorCode: ERROR_CODES.MISSING_FIELDS,
        });
        return;
      }

      const result = await github.getFile(
        accessToken,
        String(owner),
        String(repoName),
        String(filePath),
        branch ? String(branch) : undefined,
      );

      if (!result.ok) {
        console.error(`[github] Import failed for user=${userId}:`, result.error.message);
        res.status(502).json({ error: result.error.message, errorCode: ERROR_CODES.IMPORT_FAILED });
        return;
      }

      console.log(`[github] Import success user=${userId} file=${owner}/${repoName}/${filePath}`);
      res.status(200).json({
        name: result.data.name,
        path: result.data.path,
        content: result.data.content,
        htmlUrl: result.data.htmlUrl,
        size: result.data.size,
      });
    },
  };
}
