import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTemplates, type TemplateDefinition } from '../templates';

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



  if (error || templates.length === 0) {
    return (
      <div className="page" role="alert">
        <h1 className="page__title">Starter Templates</h1>
        <p className="page__subtitle">{error || 'No templates available at this time.'}</p>
        <button className="btn btn--primary" onClick={handleRetry}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      className="page"
      style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'left', padding: '40px 24px' }}
    >
      <style>{`
        .templates-gallery-premium {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
          margin-top: 32px;
        }
        
        .template-card-premium {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s, background 0.2s;
          display: flex;
          flex-direction: column;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        
        .template-card-premium:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-lg), 0 0 0 1px var(--color-primary-glow);
          border-color: var(--color-primary-dim);
          background: var(--color-surface-2);
        }

        .template-card-premium__image {
          width: 100%;
          height: 160px;
          object-fit: cover;
          border-bottom: 1px solid var(--color-border);
        }

        .template-card-premium__body {
          padding: 20px;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .template-card-premium__name {
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--color-text);
          margin-bottom: 8px;
        }

        .template-card-premium__description {
          font-size: 0.875rem;
          color: var(--color-text-muted);
          line-height: 1.5;
          margin-bottom: 16px;
          flex: 1;
        }

        .template-card-premium__tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 20px;
        }

        .template-card-premium__tag {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 4px 8px;
          border-radius: 4px;
          background: rgba(34, 211, 238, 0.1);
          color: var(--color-primary);
          border: 1px solid rgba(34, 211, 238, 0.2);
        }

        .template-card-premium__actions {
          display: flex;
          gap: 12px;
        }


      `}</style>

      <div>
        <h1 className="page__title" style={{ textAlign: 'left', marginBottom: '8px' }}>
          Starter Templates
        </h1>
        <p
          className="page__subtitle"
          style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: '1.1rem' }}
        >
          Explore pre-built quantum algorithms. Load them into the visual builder or read about how
          they work.
        </p>
      </div>

      <div className="templates-gallery-premium" role="list" aria-label="Starter templates">
        {templates.map((template) => (
          <div key={template.templateId} className="template-card-premium" role="listitem">
            {template.learnMore && (
              <img
                src={template.learnMore.headerImageSrc}
                alt={template.name}
                className="template-card-premium__image"
              />
            )}
            <div className="template-card-premium__body">
              <h2 className="template-card-premium__name">{template.name}</h2>
              <p className="template-card-premium__description">{template.description}</p>

              <div className="template-card-premium__tags">
                {template.tags.map((tag) => (
                  <span key={tag} className="template-card-premium__tag">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="template-card-premium__actions">
                <button
                  className="btn btn--primary"
                  style={{ flex: 1 }}
                  onClick={() => handleLoad(template)}
                  aria-label={`Load ${template.name}`}
                >
                  Load
                </button>
                {template.learnMore && (
                  <button
                    className="btn btn--ghost"
                    style={{ flex: 1, backgroundColor: 'var(--color-surface-3)' }}
                    onClick={() => navigate(`/templates/${template.templateId}`)}
                    aria-label={`Learn more about ${template.name}`}
                  >
                    Learn More
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>


    </div>
  );
}
