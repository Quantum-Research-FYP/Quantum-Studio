import type { ValidationError } from '../../circuit';

/**
 * ValidationSummaryPanel displays a list of circuit validation errors.
 * Accessible: messages are available to screen readers, not communicated
 * by color alone, and each error item is keyboard-focusable.
 */

interface ValidationSummaryPanelProps {
  errors: ValidationError[];
}

export default function ValidationSummaryPanel({ errors }: ValidationSummaryPanelProps) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <section
      className="validation-panel"
      aria-label="Validation errors"
      role="status"
      aria-live="polite"
    >
      <h3 className="validation-panel__title">
        <span className="validation-panel__title-icon" aria-hidden="true">
          &#9888;
        </span>
        Validation Issues ({errors.length})
        <button 
          className="info-btn" 
          data-tooltip="Lists any errors in the current circuit design, such as invalid gate placements or unmet constraints."
          data-tooltip-pos="left"
          aria-label="Info"
        >
          !
        </button>
      </h3>
      <ul className="validation-panel__list">
        {errors.map((error, index) => (
          <li
            key={error.operationId ? `${error.operationId}-${index}` : index}
            className="validation-panel__item"
            tabIndex={0}
          >
            <span className="validation-panel__icon" aria-hidden="true">
              &#9888;
            </span>
            <span className="validation-panel__message">{error.message}</span>
            {error.time !== undefined && (
              <span className="validation-panel__location">
                (time {error.time})
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
