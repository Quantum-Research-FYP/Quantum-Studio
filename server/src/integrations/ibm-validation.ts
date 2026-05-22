/**
 * IBM Quantum token validation.
 *
 * IBM Quantum now uses IBM Cloud API keys. Validation works by exchanging the
 * key for an IAM access token — the same exchange required before any runtime
 * API call. A successful exchange means the key is valid; 400/401 means it's
 * bad or revoked.
 *
 * The old approach of probing /backends at quantum.ibm.com/api no longer works:
 * that URL is the web-app frontend and returns HTML for all requests.
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

const VALIDATION_TIMEOUT_MS = parseInt(process.env.IBM_VALIDATION_TIMEOUT_MS || '10000', 10);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export async function validateIbmToken(token: string): Promise<IbmValidationResult> {
  // Development mock: skip real validation when IBM Quantum integration is disabled
  if (process.env.ENABLE_IBM_QUANTUM !== 'true') {
    return token.startsWith('valid-')
      ? { valid: true }
      : { valid: false, errorCode: 'INVALID_TOKEN' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

    // IBM Quantum uses IBM Cloud API keys. Validate by exchanging for an IAM access token —
    // the same exchange that runtime API calls require. A successful exchange confirms the key
    // is valid and active; 400/401 means the key is bad or revoked.
    const response = await fetch('https://iam.cloud.ibm.com/identity/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: `grant_type=urn%3Aibm%3Aparams%3Aoauth%3Agrant-type%3Aapikey&apikey=${encodeURIComponent(token)}`,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        console.warn('[ibm-validation] IAM returned non-JSON 200 — treating as unavailable');
        return { valid: false, errorCode: 'PROVIDER_UNAVAILABLE' };
      }
      const body = (await response.json()) as Record<string, unknown>;
      if (typeof body.access_token === 'string') {
        return { valid: true };
      }
      return { valid: false, errorCode: 'INVALID_TOKEN' };
    }

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      console.warn(`[ibm-validation] IAM rejected API key → HTTP ${response.status}`);
      return { valid: false, errorCode: 'INVALID_TOKEN' };
    }

    if (response.status === 429) {
      return { valid: false, errorCode: 'PROVIDER_RATE_LIMITED' };
    }

    return { valid: false, errorCode: 'PROVIDER_UNAVAILABLE' };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { valid: false, errorCode: 'NETWORK_ERROR' };
    }
    return { valid: false, errorCode: 'NETWORK_ERROR' };
  }
}
