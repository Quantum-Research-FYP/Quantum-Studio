import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import { getAiConfig } from './config.js';
import { createAiProvider } from './provider.js';
import { createRateLimiter } from './rate-limiter.js';
import { createAiHandlers } from './handlers.js';

/**
 * Create the AI draft router with all dependencies wired up.
 * Provider, rate limiter, and config are instantiated once at startup.
 */
export function createAiRouter(): Router {
  const router = Router();
  const config = getAiConfig();
  const provider = createAiProvider(config);
  const rateLimiter = createRateLimiter(config.rateLimitMaxRequests, config.rateLimitWindowMs);
  const handlers = createAiHandlers(provider, rateLimiter, config);

  // All AI routes require authentication
  router.use(requireAuth);

  router.post('/draft', handlers.generateDraft);

  return router;
}
