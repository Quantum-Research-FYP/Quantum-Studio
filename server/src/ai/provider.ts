import type { AiConfig, AiProvider } from './types.js';
import { createMockProvider } from './providers/mock.js';
import { createAnthropicProvider } from './providers/anthropic.js';
import { createGeminiProvider } from './providers/gemini.js';

/**
 * Factory that creates the appropriate AI provider based on configuration.
 * Throws if the configured provider is unknown or misconfigured.
 */
export function createAiProvider(config: AiConfig): AiProvider {
  switch (config.provider) {
    case 'mock':
      return createMockProvider();

    case 'anthropic': {
      if (!config.apiKey) {
        throw new Error('AI_API_KEY must be set when using the anthropic provider.');
      }
      const model = config.model || 'claude-sonnet-4-20250514';
      return createAnthropicProvider(config.apiKey, model, config.apiUrl || undefined);
    }

    case 'gemini': {
      if (!config.apiKey) {
        throw new Error('AI_API_KEY must be set when using the gemini provider.');
      }
      const model = config.model || 'gemini-2.0-flash';
      return createGeminiProvider(config.apiKey, model, config.apiUrl || undefined);
    }

    default:
      throw new Error(
        `Unknown AI provider "${config.provider}". Supported: mock, anthropic, gemini.`,
      );
  }
}
