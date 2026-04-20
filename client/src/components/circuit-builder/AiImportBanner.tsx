import { useCallback, useState } from 'react';
import type { AiDraftResponse, AiValidationResponse, AiOmittedOperation } from '../../api/ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiImportInfo {
  draft: AiDraftResponse;
  validation: AiValidationResponse;
}

interface AiImportBannerProps {
  importInfo: AiImportInfo;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Non-blocking banner displayed after an AI draft has been imported into the builder.
 * Shows provenance information and, for partial imports, lists omitted operations.
 * Provides a collapsible section to view the original prompt, explanation, and code.
 */
export default function AiImportBanner({ importInfo, onDismiss }: AiImportBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const { draft, validation } = importInfo;
  const isPartial = validation.status === 'partially_valid';

  const handleCopyOriginalCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(draft.generatedCode);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback — select text if clipboard fails
    }
  }, [draft.generatedCode]);

  return (
    <div
      className={`ai-import-banner ${isPartial ? 'ai-import-banner--partial' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="AI draft import status"
    >
      <div className="ai-import-banner__header">
        <span className="ai-import-banner__label">
          {isPartial ? '⚠ Imported from AI draft (partial)' : 'Imported from AI draft'}
        </span>
        <div className="ai-import-banner__header-actions">
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls="ai-import-details"
            aria-label={expanded ? 'Hide original AI draft' : 'View original AI draft'}
          >
            {expanded ? 'Hide Details' : 'View Original'}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={onDismiss}
            aria-label="Dismiss AI import banner"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Partial import warnings */}
      {isPartial && validation.omittedOperations.length > 0 && (
        <div className="ai-import-banner__warnings" role="alert">
          <p className="ai-import-banner__warning-title">
            {validation.omittedOperations.length} operation(s) could not be imported:
          </p>
          <ul className="ai-import-banner__omitted-list">
            {validation.omittedOperations.map((op: AiOmittedOperation, i: number) => (
              <li key={i}>
                Operation {op.index} ({op.type}): {op.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expandable details — original prompt/response */}
      {expanded && (
        <div id="ai-import-details" className="ai-import-banner__details">
          <div className="ai-import-banner__section">
            <h4 className="ai-import-banner__section-title">Original Prompt</h4>
            <p className="ai-import-banner__prompt">
              <em>(Prompt not stored client-side for privacy)</em>
            </p>
          </div>

          <div className="ai-import-banner__section">
            <h4 className="ai-import-banner__section-title">AI Explanation</h4>
            <p className="ai-import-banner__explanation">{draft.explanation}</p>
          </div>

          <div className="ai-import-banner__section">
            <h4 className="ai-import-banner__section-title">
              Original Generated Code
              <button
                className="btn btn--ghost btn--sm"
                onClick={handleCopyOriginalCode}
                aria-label={copySuccess ? 'Code copied' : 'Copy original AI code'}
                style={{ marginLeft: 8 }}
              >
                {copySuccess ? 'Copied!' : 'Copy'}
              </button>
            </h4>
            <pre className="ai-import-banner__code">
              <code>{draft.generatedCode}</code>
            </pre>
          </div>

          <div className="ai-import-banner__section">
            <small>
              Provider: {draft.provider} ({draft.model}) | Generated:{' '}
              {new Date(draft.generatedAt).toLocaleString()} | Request ID: {draft.requestId}
            </small>
          </div>
        </div>
      )}
    </div>
  );
}
