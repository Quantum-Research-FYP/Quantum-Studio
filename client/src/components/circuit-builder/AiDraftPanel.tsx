import { useCallback, useRef, useState } from 'react';
import { generateDraft, validateDraft } from '../../api/ai';
import type { AiDraftResponse, AiValidationResponse } from '../../api/ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiDraftPanelProps {
  /** Called when the user clicks "Import into builder" with a validated circuit. */
  onImport: (validationResult: AiValidationResponse, draft: AiDraftResponse) => void;
}

type PanelState = 'idle' | 'loading' | 'result' | 'error';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PROMPT_LENGTH = 2000;
const MIN_PROMPT_LENGTH = 3;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * AiDraftPanel collects a user prompt, submits it to the AI draft endpoint,
 * and displays the result with actions to validate, import, or copy.
 * No auto-import or auto-run occurs — all actions require explicit user interaction.
 */
export default function AiDraftPanel({ onImport }: AiDraftPanelProps) {
  const [panelState, setPanelState] = useState<PanelState>('idle');
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<AiDraftResponse | null>(null);
  const [validation, setValidation] = useState<AiValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Submit prompt
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (trimmed.length < MIN_PROMPT_LENGTH) return;

    // Reset previous state
    setDraft(null);
    setValidation(null);
    setError(null);
    setCopySuccess(false);
    setPanelState('loading');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await generateDraft(trimmed, controller.signal);
      setDraft(response);
      setPanelState('result');
      // Move focus to result area for screen readers
      setTimeout(() => resultRef.current?.focus(), 100);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setPanelState('idle');
        return;
      }
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
      setPanelState('error');
    } finally {
      abortRef.current = null;
    }
  }, [prompt]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPanelState('idle');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleValidate = useCallback(async () => {
    if (!draft) return;
    setValidating(true);
    setValidation(null);

    try {
      const result = await validateDraft(draft.circuitJson);
      setValidation(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Validation failed.';
      setValidation(null);
      setError(message);
    } finally {
      setValidating(false);
    }
  }, [draft]);

  const handleImport = useCallback(async () => {
    if (!draft) return;

    // Validate first if not already validated
    let result = validation;
    if (!result) {
      setValidating(true);
      try {
        result = await validateDraft(draft.circuitJson);
        setValidation(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Validation failed.';
        setError(message);
        setValidating(false);
        return;
      }
      setValidating(false);
    }

    onImport(result, draft);
  }, [draft, validation, onImport]);

  const handleCopyCode = useCallback(async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.generatedCode);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback: select text in the code block
      const codeEl = document.querySelector('.ai-draft-panel__code code');
      if (codeEl) {
        const range = document.createRange();
        range.selectNodeContents(codeEl);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }, [draft]);

  const handleNewPrompt = useCallback(() => {
    setDraft(null);
    setValidation(null);
    setError(null);
    setCopySuccess(false);
    setPanelState('idle');
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const promptValid = prompt.trim().length >= MIN_PROMPT_LENGTH;
  const promptTooLong = prompt.length > MAX_PROMPT_LENGTH;

  return (
    <section className="ai-draft-panel" aria-label="AI Circuit Draft">
      <h3 className="ai-draft-panel__title">AI Draft</h3>

      {/* Prompt input — shown in idle and error states */}
      {(panelState === 'idle' || panelState === 'error') && (
        <div className="ai-draft-panel__input-area">
          <label htmlFor="ai-prompt" className="ai-draft-panel__label">
            Describe the circuit you want to create:
          </label>
          <textarea
            id="ai-prompt"
            className="ai-draft-panel__textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Create a 2-qubit Bell state and measure both qubits"
            rows={3}
            maxLength={MAX_PROMPT_LENGTH}
            aria-describedby="ai-prompt-hint"
            aria-invalid={promptTooLong}
          />
          <div id="ai-prompt-hint" className="ai-draft-panel__hint">
            {prompt.length}/{MAX_PROMPT_LENGTH} characters. Press Ctrl+Enter to submit.
          </div>
          <button
            className="btn btn--primary btn--sm"
            onClick={handleSubmit}
            disabled={!promptValid || promptTooLong}
            aria-label="Generate AI draft"
          >
            Generate Draft
          </button>
        </div>
      )}

      {/* Loading state */}
      {panelState === 'loading' && (
        <div className="ai-draft-panel__loading" role="status" aria-live="polite">
          <span className="ai-draft-panel__spinner" aria-hidden="true" />
          <span>Generating circuit draft...</span>
          <button
            className="btn btn--ghost btn--sm"
            onClick={handleCancel}
            aria-label="Cancel draft generation"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Error state */}
      {panelState === 'error' && error && (
        <div className="ai-draft-panel__error" role="alert" aria-live="assertive">
          <p className="ai-draft-panel__error-message">{error}</p>
          <button
            className="btn btn--ghost btn--sm"
            onClick={handleNewPrompt}
            aria-label="Dismiss error"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Result display */}
      {panelState === 'result' && draft && (
        <div
          ref={resultRef}
          className="ai-draft-panel__result"
          tabIndex={-1}
          aria-label="AI draft result"
        >
          {/* AI Disclaimer */}
          <div className="ai-draft-panel__disclaimer" role="note">
            This content was generated by AI and may contain errors. Review carefully before
            importing.
          </div>

          {/* Explanation */}
          <div className="ai-draft-panel__section">
            <h4 className="ai-draft-panel__section-title">Explanation</h4>
            <p className="ai-draft-panel__explanation">{draft.explanation}</p>
          </div>

          {/* Generated code */}
          <div className="ai-draft-panel__section">
            <h4 className="ai-draft-panel__section-title">Generated Code</h4>
            <pre className="ai-draft-panel__code">
              <code>{draft.generatedCode}</code>
            </pre>
          </div>

          {/* Circuit summary */}
          <div className="ai-draft-panel__section">
            <h4 className="ai-draft-panel__section-title">Circuit Summary</h4>
            <ul className="ai-draft-panel__summary">
              <li>Qubits: {draft.circuitJson.qubits}</li>
              <li>Classical bits: {draft.circuitJson.clbits}</li>
              <li>Operations: {draft.circuitJson.operations.length}</li>
              <li>
                Provider: {draft.provider} ({draft.model})
              </li>
            </ul>
          </div>

          {/* Validation result */}
          {validation && (
            <div
              className="ai-draft-panel__validation"
              role="status"
              aria-live="polite"
              aria-label="Validation result"
            >
              <h4 className="ai-draft-panel__section-title">
                Validation:{' '}
                <span className={`ai-draft-panel__status ai-draft-panel__status--${validation.status}`}>
                  {formatStatus(validation.status)}
                </span>
              </h4>
              {validation.messages.length > 0 && (
                <ul className="ai-draft-panel__messages">
                  {validation.messages.map((msg, i) => (
                    <li key={i} className={`ai-draft-panel__msg ai-draft-panel__msg--${msg.severity}`}>
                      {msg.message}
                    </li>
                  ))}
                </ul>
              )}
              {validation.status === 'invalid' && (
                <p className="ai-draft-panel__suggestion">
                  Try simplifying your prompt or using only supported gates (H, X, Y, Z, S, T, CX,
                  MEASURE). Ensure qubit and classical bit counts are within limits.
                </p>
              )}
              {validation.status === 'partially_valid' && (
                <p className="ai-draft-panel__suggestion">
                  Some operations were omitted. You can still import the supported parts, or refine
                  your prompt to avoid unsupported gates.
                </p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="ai-draft-panel__actions">
            <button
              className="btn btn--sm"
              onClick={handleValidate}
              disabled={validating}
              aria-label="Validate draft circuit"
            >
              {validating ? 'Validating...' : 'Validate'}
            </button>
            <button
              className="btn btn--primary btn--sm"
              onClick={handleImport}
              disabled={validating || validation?.status === 'invalid'}
              aria-label={
                validation?.status === 'invalid'
                  ? 'Cannot import — draft is invalid'
                  : 'Import draft into circuit builder'
              }
            >
              {validating ? 'Validating...' : 'Import into Builder'}
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={handleCopyCode}
              aria-label={copySuccess ? 'Code copied to clipboard' : 'Copy generated code'}
            >
              {copySuccess ? 'Copied!' : 'Copy Code'}
            </button>
          </div>

          {/* New prompt button */}
          <button
            className="btn btn--ghost btn--sm ai-draft-panel__new-prompt"
            onClick={handleNewPrompt}
            aria-label="Start a new AI draft prompt"
          >
            New Prompt
          </button>

          {/* Metadata (minimal, for debugging/provenance) */}
          <div className="ai-draft-panel__meta" aria-label="Request metadata">
            <small>Request ID: {draft.requestId}</small>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatStatus(status: string): string {
  switch (status) {
    case 'valid':
      return 'Valid';
    case 'partially_valid':
      return 'Partially Valid';
    case 'invalid':
      return 'Invalid';
    default:
      return status;
  }
}
