import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAiHandlers } from '../handlers.js';
import { createRateLimiter } from '../rate-limiter.js';
import type { AiConfig, AiProvider, AiProviderResponse } from '../types.js';

function createTestApp(provider: AiProvider, configOverrides: Partial<AiConfig> = {}) {
  const app = express();
  app.use(express.json());

  const config: AiConfig = {
    enabled: true,
    provider: 'mock',
    apiKey: '',
    apiUrl: '',
    model: 'test-model',
    timeoutMs: 5000,
    rateLimitMaxRequests: 10,
    rateLimitWindowMs: 60000,
    ...configOverrides,
  };

  const rateLimiter = createRateLimiter(config.rateLimitMaxRequests, config.rateLimitWindowMs);
  const handlers = createAiHandlers(provider, rateLimiter, config);

  // Mock auth — attach a user to all requests
  app.use((req, _res, next) => {
    req.user = { id: 'test-user-id', email: 'test@example.com' };
    next();
  });

  app.post('/api/ai/draft', handlers.generateDraft);

  return app;
}

function createMockProvider(overrides: Partial<AiProvider> = {}): AiProvider {
  const defaultResponse: AiProviderResponse = {
    circuitJson: {
      schemaVersion: 1,
      qubits: 2,
      clbits: 2,
      operations: [
        { type: 'H', targets: { qubits: [0] }, time: 0 },
        { type: 'CX', targets: { qubits: [0, 1] }, time: 1 },
      ],
    },
    explanation: 'Test explanation',
    generatedCode: 'qc = QuantumCircuit(2, 2)\nqc.h(0)\nqc.cx(0, 1)',
    provider: 'mock',
    model: 'mock-v1',
  };

  return {
    name: 'mock',
    model: 'mock-v1',
    generateDraft: vi.fn().mockResolvedValue(defaultResponse),
    ...overrides,
  };
}

describe('AI Draft Handlers', () => {
  describe('POST /api/ai/draft', () => {
    it('returns a draft with valid prompt', async () => {
      const app = createTestApp(createMockProvider());

      const res = await request(app)
        .post('/api/ai/draft')
        .send({ prompt: 'Create a Bell state circuit' });

      expect(res.status).toBe(200);
      expect(res.body.requestId).toBeDefined();
      expect(res.body.circuitJson).toBeDefined();
      expect(res.body.circuitJson.schemaVersion).toBe(1);
      expect(res.body.circuitJson.qubits).toBe(2);
      expect(res.body.explanation).toBe('Test explanation');
      expect(res.body.generatedCode).toBeDefined();
      expect(res.body.provider).toBe('mock');
      expect(res.body.model).toBe('mock-v1');
      expect(res.body.generatedAt).toBeDefined();
    });

    it('returns 503 when feature is disabled', async () => {
      const app = createTestApp(createMockProvider(), { enabled: false });

      const res = await request(app).post('/api/ai/draft').send({ prompt: 'Create a Bell state' });

      expect(res.status).toBe(503);
      expect(res.body.errorCode).toBe('AI_FEATURE_DISABLED');
      expect(res.body.requestId).toBeDefined();
    });

    it('returns 400 for missing prompt', async () => {
      const app = createTestApp(createMockProvider());

      const res = await request(app).post('/api/ai/draft').send({});

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_PROMPT');
    });

    it('returns 400 for prompt too short', async () => {
      const app = createTestApp(createMockProvider());

      const res = await request(app).post('/api/ai/draft').send({ prompt: 'ab' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_PROMPT');
    });

    it('returns 400 for prompt too long', async () => {
      const app = createTestApp(createMockProvider());
      const longPrompt = 'x'.repeat(2001);

      const res = await request(app).post('/api/ai/draft').send({ prompt: longPrompt });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_PROMPT_LENGTH');
    });

    it('returns 429 when rate limited', async () => {
      const app = createTestApp(createMockProvider(), {
        rateLimitMaxRequests: 1,
        rateLimitWindowMs: 60000,
      });

      // First request succeeds
      const res1 = await request(app).post('/api/ai/draft').send({ prompt: 'Create a circuit' });
      expect(res1.status).toBe(200);

      // Second request is rate limited
      const res2 = await request(app)
        .post('/api/ai/draft')
        .send({ prompt: 'Create another circuit' });
      expect(res2.status).toBe(429);
      expect(res2.body.errorCode).toBe('AI_RATE_LIMITED');
      expect(res2.body.retryAfterSeconds).toBeGreaterThan(0);
      expect(res2.headers['retry-after']).toBeDefined();
    });

    it('returns 502 when provider throws', async () => {
      const failingProvider = createMockProvider({
        generateDraft: vi
          .fn()
          .mockRejectedValue(
            new Error('AI provider is temporarily unavailable. Please try again later.'),
          ),
      });
      const app = createTestApp(failingProvider);

      const res = await request(app).post('/api/ai/draft').send({ prompt: 'Create a circuit' });

      expect(res.status).toBe(502);
      expect(res.body.errorCode).toBe('AI_PROVIDER_ERROR');
      expect(res.body.error).toContain('AI provider');
      expect(res.body.requestId).toBeDefined();
    });

    it('returns 408 on timeout (AbortError)', async () => {
      const timeoutProvider = createMockProvider({
        generateDraft: vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
          ),
      });
      const app = createTestApp(timeoutProvider);

      const res = await request(app).post('/api/ai/draft').send({ prompt: 'Create a circuit' });

      expect(res.status).toBe(408);
      expect(res.body.errorCode).toBe('AI_TIMEOUT');
    });

    it('trims prompt whitespace before sending to provider', async () => {
      const provider = createMockProvider();
      const app = createTestApp(provider);

      await request(app).post('/api/ai/draft').send({ prompt: '   Create a Bell state   ' });

      expect(provider.generateDraft).toHaveBeenCalledWith(
        'Create a Bell state',
        expect.any(Object),
      );
    });

    it('includes requestId in all error responses', async () => {
      const app = createTestApp(createMockProvider(), { enabled: false });

      const res = await request(app).post('/api/ai/draft').send({ prompt: 'test' });

      expect(res.body.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });
});
