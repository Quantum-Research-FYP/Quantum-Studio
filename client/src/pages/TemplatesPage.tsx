import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTemplates, type TemplateDefinition } from '../templates';

/**
 * TemplatesPage displays a gallery of starter circuit templates.
 * Authenticated users can browse and load templates into the circuit builder.
 */
export default function TemplatesPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  let templates: readonly TemplateDefinition[] = [];
  try {
    templates = getTemplates();
  } catch {
    if (!error) setError('Failed to load templates.');
  }

  const handleRetry = useCallback(() => {
    setError(null);
  }, []);

  const handleLoad = useCallback(
    (template: TemplateDefinition) => {
      navigate(`/builder?templateId=${encodeURIComponent(template.templateId)}`);
    },
    [navigate],
  );

  // Error state
  if (error || templates.length === 0) {
    return (
      <div className="page" role="alert">
        <h1 className="page__title">Starter Templates</h1>
        <p className="page__subtitle">
          {error || 'No templates available at this time.'}
        </p>
        <button className="btn btn--primary" onClick={handleRetry}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title">Starter Templates</h1>
      <p className="page__subtitle">
        Start from a pre-built quantum circuit template.
      </p>

      <div className="templates-gallery" role="list" aria-label="Starter templates">
        {templates.map((template) => (
          <div
            key={template.templateId}
            className="template-card"
            role="listitem"
          >
            <div className="template-card__body">
              <h2 className="template-card__name">{template.name}</h2>
              <p className="template-card__description">{template.description}</p>
              <div className="template-card__tags">
                {template.tags.map((tag) => (
                  <span key={tag} className="template-card__tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <button
              className="btn btn--primary template-card__action"
              onClick={() => handleLoad(template)}
              aria-label={`Load ${template.name} template`}
            >
              Load
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
