import type { Request, Response } from 'express';
import type { AiConfig, AiDraftResponse, AiProvider } from './types.js';
import type { RateLimiter } from './rate-limiter.js';
import { validateAiCircuit } from './validation.js';

/** Maximum prompt length in characters. */
const MAX_PROMPT_LENGTH = 2000;

/** Minimum prompt length in characters. */
const MIN_PROMPT_LENGTH = 3;

export function createAiHandlers(provider: AiProvider, rateLimiter: RateLimiter, config: AiConfig) {
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
          console.log(`[ai] action=draft-disabled userId=${userId} requestId=${requestId}`);
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
          console.log(`[ai] action=draft-cancelled userId=${userId} requestId=${requestId}`);
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

    /**
     * POST /api/ai/chat — Free-form Gemini chat with the user's current circuit as context.
     * Accepts { messages: [{role, content}], circuitCode: string }
     * Returns { reply, requestId }
     */
    async chat(req: Request, res: Response): Promise<void> {
      const requestId = crypto.randomUUID();
      const userId = req.user!.id;

      try {
        if (!config.apiKey) {
          res.status(503).json({
            error: 'AI chat is not configured. Set AI_API_KEY in your environment.',
            errorCode: 'AI_NOT_CONFIGURED',
            requestId,
          });
          return;
        }

        const { messages, circuitCode } = req.body ?? {};

        if (!Array.isArray(messages) || messages.length === 0) {
          res.status(400).json({
            error: 'messages must be a non-empty array.',
            errorCode: 'VALIDATION_MESSAGES',
            requestId,
          });
          return;
        }

        // Rate limiting
        const rateResult = rateLimiter.check(userId);
        if (!rateResult.allowed) {
          res.setHeader('Retry-After', String(rateResult.retryAfterSeconds));
          res.status(429).json({
            error: `Rate limit exceeded. Please try again in ${rateResult.retryAfterSeconds} seconds.`,
            errorCode: 'AI_RATE_LIMITED',
            requestId,
            retryAfterSeconds: rateResult.retryAfterSeconds,
          });
          return;
        }

        const model = config.model || 'gemini-2.0-flash';
        const baseUrl = (config.apiUrl || 'https://generativelanguage.googleapis.com').replace(
          /\/$/,
          '',
        );
        const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

        const systemPrompt =
          typeof circuitCode === 'string' && circuitCode.trim()
            ? `You are a helpful quantum computing assistant embedded in a visual quantum circuit builder.\n\nThe user's current circuit (Qiskit Python):\n\`\`\`python\n${circuitCode.trim().slice(0, 3000)}\n\`\`\`\n\nHelp them understand this circuit, answer questions about quantum gates and concepts, suggest improvements, and explain what the circuit does. Keep answers concise and educational.`
            : `You are a helpful quantum computing assistant. Help users understand quantum circuits, Qiskit code, quantum gates, and quantum computing concepts. Keep answers concise and educational.`;

        const contents = (messages as Array<{ role: string; content: string }>)
          .filter((m) => typeof m.role === 'string' && typeof m.content === 'string')
          .slice(-20)
          .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(m.content).slice(0, 2000) }],
          }));

        const abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(), config.timeoutMs);
        const onClose = () => abortController.abort();
        req.on('close', onClose);

        try {
          console.log(
            `[ai] action=chat-start userId=${userId} requestId=${requestId} messages=${messages.length}`,
          );

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents,
              generationConfig: { maxOutputTokens: 8192, temperature: 0.5 },
            }),
            signal: abortController.signal,
          });

          if (!response.ok) {
            const status = response.status;
            if (status === 429)
              throw new Error('AI provider rate limit exceeded. Please try again later.');
            if (status >= 500)
              throw new Error('AI provider is temporarily unavailable. Please try again later.');
            throw new Error(`AI provider returned an error (status ${status}).`);
          }

          const data = (await response.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };

          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!reply) throw new Error('AI provider returned an empty response.');

          console.log(`[ai] action=chat-success userId=${userId} requestId=${requestId}`);
          res.status(200).json({ reply: reply.trim(), requestId });
        } finally {
          clearTimeout(timeout);
          req.off('close', onClose);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const isAbort = err instanceof Error && err.name === 'AbortError';

        if (isAbort) {
          console.log(`[ai] action=chat-cancelled userId=${userId} requestId=${requestId}`);
          if (!res.headersSent) {
            res
              .status(408)
              .json({ error: 'Request timed out.', errorCode: 'AI_TIMEOUT', requestId });
          }
          return;
        }

        console.error(
          `[ai] action=chat-error userId=${userId} requestId=${requestId} error="${message}"`,
        );
        if (!res.headersSent) {
          res.status(502).json({
            error: message.startsWith('AI provider')
              ? message
              : 'An unexpected error occurred. Please try again.',
            errorCode: 'AI_CHAT_ERROR',
            requestId,
          });
        }
      }
    },

    /**
     * POST /api/ai/validate — Validate an AI-generated circuit JSON and return
     * an import-ready result without executing any code.
     */
    async validateDraft(req: Request, res: Response): Promise<void> {
      const requestId = crypto.randomUUID();
      const userId = req.user!.id;

      try {
        const { circuitJson } = req.body ?? {};

        if (circuitJson === undefined || circuitJson === null) {
          res.status(400).json({
            error: 'Request body must include a "circuitJson" object.',
            errorCode: 'VALIDATION_MISSING_INPUT',
            requestId,
          });
          return;
        }

        const result = validateAiCircuit(circuitJson);

        console.log(
          `[ai] action=validate userId=${userId} requestId=${requestId} status=${result.status} importable=${result.importableCircuit?.operations.length ?? 0} omitted=${result.omittedOperations.length}`,
        );

        res.status(200).json({ requestId, ...result });
      } catch (err) {
        console.error(
          `[ai] action=validate-error userId=${userId} requestId=${requestId} error="${err instanceof Error ? err.message : 'Unknown'}"`,
        );
        res.status(500).json({
          error: 'An unexpected error occurred during validation. Please try again.',
          errorCode: 'VALIDATION_INTERNAL_ERROR',
          requestId,
        });
      }
    },
  };
}
