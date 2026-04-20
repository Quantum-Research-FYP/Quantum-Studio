import type { AiProvider, AiProviderOptions, AiProviderResponse, AiCircuitJson } from '../types.js';

const SYSTEM_PROMPT = `You are a quantum circuit design assistant. Given a user's description of a quantum circuit, you must respond with ONLY a valid JSON object (no markdown, no explanation outside JSON) matching this exact schema:

{
  "circuitJson": {
    "schemaVersion": 1,
    "qubits": <number of qubits>,
    "clbits": <number of classical bits>,
    "operations": [
      {
        "type": "<gate type>",
        "targets": { "qubits": [<qubit indices>], "clbits": [<classical bit indices, if measurement>] },
        "time": <column index, 0-based>
      }
    ]
  },
  "explanation": "<plain-language explanation of the circuit>",
  "generatedCode": "<equivalent Qiskit Python code>"
}

Supported gate types: H, X, Y, Z, S, T, CX, MEASURE.
- Single-qubit gates (H, X, Y, Z, S, T): targets.qubits must have exactly 1 element.
- CX (CNOT): targets.qubits must have exactly 2 elements [control, target].
- MEASURE: targets.qubits has 1 element, targets.clbits has 1 element.

Rules:
- Operations must be ordered by time (column index).
- Each qubit index must be < qubits count.
- Each clbit index must be < clbits count.
- Do not include any imports other than "from qiskit import QuantumCircuit" in generatedCode.
- The generatedCode must be valid Qiskit code that constructs the same circuit as circuitJson.
- Keep explanations concise and educational.`;

/**
 * Google Gemini AI provider implementation.
 * Calls the Gemini generateContent REST API to generate circuit drafts.
 *
 * Default base URL: https://generativelanguage.googleapis.com
 * Override with AI_API_URL if you need a proxy or a different region endpoint.
 *
 * Default model: gemini-2.0-flash (fast & cheap; override with AI_MODEL).
 */
export function createGeminiProvider(apiKey: string, model: string, apiUrl?: string): AiProvider {
  const baseUrl = (apiUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');

  return {
    name: 'gemini',
    model,

    async generateDraft(prompt: string, options?: AiProviderOptions): Promise<AiProviderResponse> {
      const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.2,
          },
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          throw new Error('AI provider rate limit exceeded. Please try again later.');
        }
        if (status >= 500) {
          throw new Error('AI provider is temporarily unavailable. Please try again later.');
        }
        throw new Error(`AI provider returned an error (status ${status}).`);
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('AI provider returned an empty response.');
      }

      const parsed = parseProviderResponse(text);

      return {
        circuitJson: parsed.circuitJson,
        explanation: parsed.explanation,
        generatedCode: parsed.generatedCode,
        provider: 'gemini',
        model,
      };
    },
  };
}

/** Parse and minimally validate the JSON response from the provider. */
function parseProviderResponse(text: string): {
  circuitJson: AiCircuitJson;
  explanation: string;
  generatedCode: string;
} {
  // Strip any markdown code fences the model might wrap around the JSON
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI provider returned malformed JSON. Please try a different prompt.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI provider returned an invalid response structure.');
  }

  const obj = parsed as Record<string, unknown>;

  if (!obj.circuitJson || typeof obj.circuitJson !== 'object') {
    throw new Error('AI provider response is missing circuitJson.');
  }

  const explanation = typeof obj.explanation === 'string' ? obj.explanation : '';
  const generatedCode = typeof obj.generatedCode === 'string' ? obj.generatedCode : '';

  return {
    circuitJson: obj.circuitJson as AiCircuitJson,
    explanation,
    generatedCode,
  };
}
