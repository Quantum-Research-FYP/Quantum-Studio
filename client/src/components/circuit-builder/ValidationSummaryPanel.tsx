import type { CircuitModel } from '../../circuit';

/**
 * ValidationSummaryPanel displays a list of circuit validation errors.
 * Accessible: messages are available to screen readers and not color-only.
 */

interface ValidationSummaryPanelProps {
  circuit: CircuitModel;
}

export default function ValidationSummaryPanel({ circuit: _circuit }: ValidationSummaryPanelProps) {
  // Validation logic will be added in a later step
  const errors: string[] = [];

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
      <h3 className="validation-panel__title">Validation Issues ({errors.length})</h3>
      <ul className="validation-panel__list">
        {errors.map((message, index) => (
          <li key={index} className="validation-panel__item">
            <span className="validation-panel__icon" aria-hidden="true">
              &#9888;
            </span>
            {message}
          </li>
        ))}
      </ul>
    </section>
  );
}
