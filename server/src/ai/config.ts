import type { AiConfig } from './types.js';

/** Read AI configuration from environment variables with sensible defaults. */
export function getAiConfig(): AiConfig {
  return {
    enabled: process.env.ENABLE_AI_DRAFTS === 'true',
    provider: process.env.AI_PROVIDER || 'mock',
    apiKey: process.env.AI_API_KEY || '',
    apiUrl: process.env.AI_API_URL || '',
    model: process.env.AI_MODEL || '',
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '30000', 10),
    rateLimitMaxRequests: parseInt(process.env.AI_RATE_LIMIT_MAX_REQUESTS || '10', 10),
    rateLimitWindowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS || '60000', 10),
  };
}
