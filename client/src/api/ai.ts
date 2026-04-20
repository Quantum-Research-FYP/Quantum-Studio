// ---------------------------------------------------------------------------
// AI Draft API client
// ---------------------------------------------------------------------------

export interface AiCircuitJson {
  schemaVersion: 1;
  qubits: number;
  clbits: number;
  operations: Array<{
    type: string;
    targets: { qubits: number[]; clbits?: number[] };
    time: number;
    params?: Record<string, unknown>;
  }>;
}

export interface AiDraftResponse {
  requestId: string;
  circuitJson: AiCircuitJson;
  explanation: string;
  generatedCode: string;
  provider: string;
  model: string;
  generatedAt: string;
}

export interface AiValidationMessage {
  severity: 'error' | 'warning' | 'info';
  message: string;
  operationIndex?: number;
}

export interface AiImportableCircuit {
  schemaVersion: 1;
  qubits: number;
  clbits: number;
  operations: Array<{
    id: string;
    type: string;
    targets: { qubits: number[]; clbits?: number[] };
    time: number;
  }>;
}

export interface AiOmittedOperation {
  index: number;
  type: string;
  reason: string;
}

export interface AiValidationResponse {
  requestId: string;
  status: 'valid' | 'partially_valid' | 'invalid';
  messages: AiValidationMessage[];
  importableCircuit?: AiImportableCircuit;
  omittedOperations: AiOmittedOperation[];
}

export interface AiErrorResponse {
  error: string;
  errorCode?: string;
  requestId?: string;
  retryAfterSeconds?: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Generate a circuit draft from a natural-language prompt.
 * Accepts an AbortSignal for cancellation support.
 */
export async function generateDraft(
  prompt: string,
  signal?: AbortSignal,
): Promise<AiDraftResponse> {
  const res = await fetch('/api/ai/draft', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    signal,
  });

  const body = await res.json();

  if (!res.ok) {
    const apiErr = body as AiErrorResponse;
    const err = new Error(apiErr.error || 'An error occurred.') as Error & {
      status: number;
      errorCode?: string;
      retryAfterSeconds?: number;
    };
    err.status = res.status;
    err.errorCode = apiErr.errorCode;
    err.retryAfterSeconds = apiErr.retryAfterSeconds;
    throw err;
  }

  return body as AiDraftResponse;
}

/**
 * Validate an AI-generated circuit JSON without executing code.
 */
export async function validateDraft(circuitJson: unknown): Promise<AiValidationResponse> {
  const res = await fetch('/api/ai/validate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ circuitJson }),
  });

  const body = await res.json();

  if (!res.ok) {
    const apiErr = body as AiErrorResponse;
    const err = new Error(apiErr.error || 'An error occurred.') as Error & {
      status: number;
      errorCode?: string;
    };
    err.status = res.status;
    err.errorCode = apiErr.errorCode;
    throw err;
  }

  return body as AiValidationResponse;
}
