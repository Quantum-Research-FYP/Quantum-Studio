import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTemplates, type TemplateDefinition } from '../templates';
import Seo from '../components/Seo';

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return templates;

    return templates.filter((template) =>
      [template.name, template.description, ...template.tags]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [searchQuery, templates]);



  if (error || templates.length === 0) {
    return (
      <div className="workspace-page" role="alert">
        <div className="workspace-page__header">
          <div className="workspace-page__heading">
            <h1 className="page__title">Starter Templates</h1>
            <p className="page__subtitle">Explore pre-built quantum algorithms and examples.</p>
          </div>
        </div>
        <p>{error || 'No templates available at this time.'}</p>
        <button className="btn btn--primary" onClick={handleRetry}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <Seo
        title="Quantum Algorithm Templates — Quantum Experiment Studio"
        description="Explore interactive quantum circuit examples including Bell states, Grover search, quantum teleportation, QFT, GHZ states, and more."
        path="/templates"
      />
      <style>{`
        .templates-gallery-premium {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
          margin-top: 32px;
        }

        .templates-search-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 8px;
        }

        .templates-search {
          position: relative;
          width: min(100%, 440px);
        }

        .templates-search__icon {
          position: absolute;
          top: 50%;
          left: 13px;
          width: 17px;
          height: 17px;
          color: var(--color-text-subtle);
          pointer-events: none;
          transform: translateY(-50%);
        }

        .templates-search__input {
          width: 100%;
          height: 42px;
          padding: 0 38px 0 40px;
          border: 1px solid var(--color-border-strong);
          border-radius: 8px;
          outline: none;
          background: var(--color-surface);
          color: var(--color-text);
          font: inherit;
        }

        .templates-search__input:focus {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px var(--color-primary-dim);
        }

        .templates-search__input::-webkit-search-cancel-button { display: none; }

        .templates-search__clear {
          position: absolute;
          top: 50%;
          right: 8px;
          width: 26px;
          height: 26px;
          padding: 0;
          border: 0;
          border-radius: 5px;
          background: transparent;
          color: var(--color-text-muted);
          cursor: pointer;
          transform: translateY(-50%);
        }

        .templates-search__clear:hover { background: var(--color-surface-2); color: var(--color-text); }

        .templates-result-count {
          color: var(--color-text-muted);
          font-size: 0.8125rem;
          white-space: nowrap;
        }

        .templates-no-results {
          margin-top: 32px;
          padding: 56px 24px;
          border: 1px dashed var(--color-border-strong);
          border-radius: 12px;
          color: var(--color-text-muted);
          text-align: center;
        }

        @media (max-width: 560px) {
          .templates-search-row { align-items: stretch; flex-direction: column; }
          .templates-search { width: 100%; }
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

      <div className="workspace-page__header">
        <div className="workspace-page__heading">
          <h1 className="page__title">Starter Templates</h1>
          <p className="page__subtitle">
            Explore pre-built quantum algorithms. Load them into the visual builder or read about
            how they work.
          </p>
        </div>
      </div>

      <div className="templates-search-row">
        <div className="templates-search">
          <svg className="templates-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            className="templates-search__input"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search templates..."
            aria-label="Search starter templates"
          />
          {searchQuery && (
            <button className="templates-search__clear" type="button" onClick={() => setSearchQuery('')} aria-label="Clear template search">
              ×
            </button>
          )}
        </div>
        <span className="templates-result-count" aria-live="polite">
          {filteredTemplates.length} {filteredTemplates.length === 1 ? 'template' : 'templates'}
        </span>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="templates-no-results" role="status">
          No templates match “{searchQuery.trim()}”. Try another name or topic.
        </div>
      ) : (
      <div className="templates-gallery-premium" role="list" aria-label="Starter templates">
        {filteredTemplates.map((template) => (
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
      )}


    </div>
  );
}
