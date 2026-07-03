import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTemplates, type TemplateDefinition } from '../templates';

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDefinition | null>(null);

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

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedTemplate(null);
    };
    if (selectedTemplate) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTemplate]);

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
    <div className="page" style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'left', padding: '40px 24px' }}>
      <style>{`
        .templates-gallery-premium {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
          margin-top: 32px;
        }
        
        .template-card-premium {
          background: rgba(13, 22, 39, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
          display: flex;
          flex-direction: column;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        
        .template-card-premium:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(34, 211, 238, 0.3);
          border-color: rgba(34, 211, 238, 0.3);
        }

        .template-card-premium__image {
          width: 100%;
          height: 160px;
          object-fit: cover;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
          color: #fff;
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

        /* Modal Styles */
        .learn-modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 24px;
          animation: fadeIn 0.2s ease-out;
        }

        .learn-modal-content {
          background: #0d1627;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          width: 100%;
          max-width: 800px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
          position: relative;
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .learn-modal-header-img {
          width: 100%;
          height: 280px;
          object-fit: cover;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .learn-modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255,255,255,0.2);
          color: #fff;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
          backdrop-filter: blur(4px);
        }

        .learn-modal-close:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .learn-modal-body {
          padding: 32px 40px;
        }

        .learn-modal-title {
          font-size: 2rem;
          font-weight: 800;
          color: #fff;
          margin-bottom: 16px;
        }

        .learn-modal-text {
          font-size: 1.05rem;
          line-height: 1.7;
          color: #e2e8f0;
          white-space: pre-wrap;
          margin-bottom: 32px;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div>
        <h1 className="page__title" style={{ textAlign: 'left', marginBottom: '8px' }}>Starter Templates</h1>
        <p className="page__subtitle" style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: '1.1rem' }}>
          Explore pre-built quantum algorithms. Load them into the visual builder or read about how they work.
        </p>
      </div>

      <div className="templates-gallery-premium" role="list" aria-label="Starter templates">
        {templates.map((template) => (
          <div key={template.templateId} className="template-card-premium" role="listitem">
            {template.learnMore && (
              <img src={template.learnMore.imageSrc} alt={template.name} className="template-card-premium__image" />
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
                    style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)' }}
                    onClick={() => setSelectedTemplate(template)}
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

      {/* Learn More Modal */}
      {selectedTemplate && selectedTemplate.learnMore && (
        <div className="learn-modal-overlay" onClick={() => setSelectedTemplate(null)}>
          <div className="learn-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="learn-modal-close" onClick={() => setSelectedTemplate(null)} aria-label="Close modal">
              ✕
            </button>
            <img src={selectedTemplate.learnMore.imageSrc} alt={selectedTemplate.name} className="learn-modal-header-img" />
            
            <div className="learn-modal-body">
              <h2 className="learn-modal-title">{selectedTemplate.name}</h2>
              <div className="learn-modal-text">
                {selectedTemplate.learnMore.longDescription}
              </div>
              <div style={{ display: 'flex', gap: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '24px' }}>
                <button
                  className="btn btn--primary"
                  onClick={() => handleLoad(selectedTemplate)}
                >
                  Load into Circuit Builder
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => setSelectedTemplate(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
