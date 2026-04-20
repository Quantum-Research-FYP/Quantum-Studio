import type { Request, Response } from 'express';
import type { AiConfig, AiDraftResponse, AiProvider } from './types.js';
import type { RateLimiter } from './rate-limiter.js';

/** Maximum prompt length in characters. */
const MAX_PROMPT_LENGTH = 2000;

/** Minimum prompt length in characters. */
const MIN_PROMPT_LENGTH = 3;

export function createAiHandlers(
  provider: AiProvider,
  rateLimiter: RateLimiter,
  config: AiConfig,
) {
  return {
    /**
     * POST /api/ai/draft — Generate a circuit draft from a natural-language prompt.
     */
    async generateDraft(req: Request, res: Response): Promise<void> {
      const requestId = crypto.randomUUID();
      const userId = req.user!.id;

      try {
        // Feature flag check
        if (!config.enabled) {
          console.log(
            `[ai] action=draft-disabled userId=${userId} requestId=${requestId}`,
          );
          res.status(503).json({
            error: 'AI draft generation is currently disabled.',
            errorCode: 'AI_FEATURE_DISABLED',
            requestId,
          });
          return;
        }

        // Validate prompt input
        const { prompt } = req.body ?? {};

        if (typeof prompt !== 'string' || prompt.trim().length < MIN_PROMPT_LENGTH) {
          res.status(400).json({
            error: `Prompt must be a string with at least ${MIN_PROMPT_LENGTH} characters.`,
            errorCode: 'VALIDATION_PROMPT',
            requestId,
          });
          return;
        }

        if (prompt.length > MAX_PROMPT_LENGTH) {
          res.status(400).json({
            error: `Prompt must not exceed ${MAX_PROMPT_LENGTH} characters.`,
            errorCode: 'VALIDATION_PROMPT_LENGTH',
            requestId,
          });
          return;
        }

        // Rate limiting (per user)
        const rateResult = rateLimiter.check(userId);
        if (!rateResult.allowed) {
          console.log(
            `[ai] action=draft-rate-limited userId=${userId} requestId=${requestId} retryAfter=${rateResult.retryAfterSeconds}`,
          );
          res.setHeader('Retry-After', String(rateResult.retryAfterSeconds));
          res.status(429).json({
            error: `Rate limit exceeded. Please try again in ${rateResult.retryAfterSeconds} seconds.`,
            errorCode: 'AI_RATE_LIMITED',
            requestId,
            retryAfterSeconds: rateResult.retryAfterSeconds,
          });
          return;
        }

        // Set up timeout and cancellation
        const abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(), config.timeoutMs);

        // Cancel if client disconnects
        const onClose = () => abortController.abort();
        req.on('close', onClose);

        try {
          console.log(
            `[ai] action=draft-start userId=${userId} requestId=${requestId} provider=${provider.name} model=${provider.model}`,
          );

          const result = await provider.generateDraft(prompt.trim(), {
            signal: abortController.signal,
          });

          const response: AiDraftResponse = {
            requestId,
            circuitJson: result.circuitJson,
            explanation: result.explanation,
            generatedCode: result.generatedCode,
            provider: result.provider,
            model: result.model,
            generatedAt: new Date().toISOString(),
          };

          console.log(
            `[ai] action=draft-success userId=${userId} requestId=${requestId} provider=${result.provider} model=${result.model}`,
          );

          res.status(200).json(response);
        } finally {
          clearTimeout(timeout);
          req.off('close', onClose);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const isAbort =
          err instanceof Error &&
          (err.name === 'AbortError' || message === 'Request was cancelled.');

        if (isAbort) {
          // Client disconnected or timeout — don't send response if headers already sent
          console.log(
            `[ai] action=draft-cancelled userId=${userId} requestId=${requestId}`,
          );
          if (!res.headersSent) {
            res.status(408).json({
              error: 'Request timed out. Please try again with a simpler prompt.',
              errorCode: 'AI_TIMEOUT',
              requestId,
            });
          }
          return;
        }

        // Log error without sensitive details (no prompt, no API key)
        console.error(
          `[ai] action=draft-error userId=${userId} requestId=${requestId} error="${message}"`,
        );

        if (!res.headersSent) {
          res.status(502).json({
            error: message.startsWith('AI provider')
              ? message
              : 'An unexpected error occurred while generating the draft. Please try again.',
            errorCode: 'AI_PROVIDER_ERROR',
            requestId,
          });
        }
      }
    },
  };
}
