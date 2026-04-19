/**
 * ValidationSummaryPanel displays a list of circuit validation errors.
 * Accessible: messages are available to screen readers and not color-only.
 */
export default function ValidationSummaryPanel() {
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
      <h3 className="validation-panel__title">
        Validation Issues ({errors.length})
      </h3>
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
