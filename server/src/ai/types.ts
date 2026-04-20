/** Structured circuit representation returned by the AI provider. */
export interface AiCircuitJson {
  schemaVersion: 1;
  qubits: number;
  clbits: number;
  operations: AiCircuitOperation[];
}

/** A single operation in the AI-generated circuit. */
export interface AiCircuitOperation {
  type: string;
  targets: {
    qubits: number[];
    clbits?: number[];
  };
  time: number;
  params?: Record<string, unknown>;
}

/** The shape returned by an AI provider implementation. */
export interface AiProviderResponse {
  circuitJson: AiCircuitJson;
  explanation: string;
  generatedCode: string;
  provider: string;
  model: string;
}

/** Options passed to the provider's generateDraft method. */
export interface AiProviderOptions {
  signal?: AbortSignal;
}

/** Interface that all AI provider implementations must satisfy. */
export interface AiProvider {
  /** Human-readable provider name (e.g. "anthropic", "mock"). */
  readonly name: string;
  /** Model identifier used for this provider instance. */
  readonly model: string;
  /** Generate a circuit draft from a natural-language prompt. */
  generateDraft(prompt: string, options?: AiProviderOptions): Promise<AiProviderResponse>;
}

/** Full response shape returned by POST /api/ai/draft. */
export interface AiDraftResponse {
  requestId: string;
  circuitJson: AiCircuitJson;
  explanation: string;
  generatedCode: string;
  provider: string;
  model: string;
  generatedAt: string;
}

/** Configuration for the AI draft feature. */
export interface AiConfig {
  enabled: boolean;
  provider: string;
  apiKey: string;
  apiUrl: string;
  model: string;
  timeoutMs: number;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
}
