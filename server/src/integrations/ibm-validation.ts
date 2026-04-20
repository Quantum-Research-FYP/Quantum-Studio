/**
 * IBM Quantum token validation.
 *
 * Performs a lightweight check against the IBM Quantum API to verify
 * that a given token is valid and has access to backends.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IbmValidationErrorCode =
  | 'INVALID_TOKEN'
  | 'NETWORK_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_RATE_LIMITED';

export type IbmValidationResult =
  | { valid: true }
  | { valid: false; errorCode: IbmValidationErrorCode };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const IBM_QUANTUM_API_URL =
  process.env.IBM_QUANTUM_API_URL || 'https://quantum.ibm.com/api';
const VALIDATION_TIMEOUT_MS = parseInt(process.env.IBM_VALIDATION_TIMEOUT_MS || '10000', 10);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate an IBM Quantum API token by attempting to fetch user info.
 * This is a lightweight call that confirms the token is accepted.
 *
 * In mock/development mode (when IBM_QUANTUM_API_URL is not set to a real endpoint),
 * tokens starting with 'valid-' are accepted, all others are rejected.
 */
export async function validateIbmToken(token: string): Promise<IbmValidationResult> {
  // Development mock: if no real API URL is configured, use simple token-prefix validation
  if (process.env.NODE_ENV !== 'production' && !process.env.IBM_QUANTUM_API_URL) {
    return token.startsWith('valid-')
      ? { valid: true }
      : { valid: false, errorCode: 'INVALID_TOKEN' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

    const response = await fetch(`${IBM_QUANTUM_API_URL}/users/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401 || response.status === 403) {
      return { valid: false, errorCode: 'INVALID_TOKEN' };
    }

    if (response.status === 429) {
      return { valid: false, errorCode: 'PROVIDER_RATE_LIMITED' };
    }

    // 5xx or other unexpected status
    return { valid: false, errorCode: 'PROVIDER_UNAVAILABLE' };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { valid: false, errorCode: 'NETWORK_ERROR' };
    }

    // Network-level failure (DNS, connection refused, etc.)
    return { valid: false, errorCode: 'NETWORK_ERROR' };
  }
}
