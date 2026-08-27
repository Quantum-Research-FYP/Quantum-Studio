import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTemplates, type TemplateDefinition } from '../templates';

export default function TemplateDetailsPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const template = useMemo(() => {
    try {
      const templates = getTemplates();
      return templates.find((t) => t.templateId === templateId) || null;
    } catch {
      return null;
    }
  }, [templateId]);

  if (!template) {
    return (
      <div className="page" style={{ padding: '60px 24px', textAlign: 'center' }}>
        <h1 className="page__title">Algorithm Not Found</h1>
        <p className="page__subtitle" style={{ marginTop: '16px' }}>
          The algorithm template you are looking for does not exist.
        </p>
        <button className="btn btn--primary" style={{ marginTop: '24px' }} onClick={() => navigate('/templates')}>
          Back to Templates
        </button>
      </div>
    );
  }

  const handleLoad = () => {
    navigate(`/builder?templateId=${encodeURIComponent(template.templateId)}`);
  };

  const learnMore = template.learnMore;

  return (
    <div className="page" style={{ textAlign: 'left' }}>
      <style>{`
        .algorithm-hero {
          position: relative;
          height: 320px;
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 48px;
          display: flex;
          align-items: flex-end;
          padding: 40px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
        }

        .algorithm-hero__bg {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          z-index: 1;
        }

        .algorithm-hero__bg img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.4;
        }

        .algorithm-hero__gradient {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: linear-gradient(to top, var(--color-bg) 0%, transparent 100%);
          z-index: 2;
        }

        .algorithm-hero__content {
          position: relative;
          z-index: 3;
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        .algorithm-title {
          font-size: 2.25rem;
          font-weight: 800;
          color: var(--color-text);
          margin-bottom: 8px;
          text-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        
        .algorithm-description {
          font-size: 1rem;
          color: var(--color-text-muted);
          max-width: 600px;
          line-height: 1.5;
        }

        .algorithm-tags {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .algorithm-tag {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 6px 12px;
          border-radius: 6px;
          background: var(--color-accent-dim);
          color: var(--color-accent);
          border: 1px solid var(--color-border);
        }

        .algorithm-sections {
          display: flex;
          flex-direction: column;
          gap: 40px;
          max-width: 1000px;
          margin: 0 auto;
        }

        .algorithm-section {
          background: var(--color-surface-2);
          border: 1px solid var(--color-border);
          border-radius: 16px;
          padding: 40px;
          transition: border-color 0.3s;
        }
        
        .algorithm-section:hover {
          border-color: var(--color-border-strong);
        }

        .section-title {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--color-text);
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .section-title::before {
          content: '';
          display: block;
          width: 4px;
          height: 24px;
          background: var(--color-primary);
          border-radius: 2px;
        }

        .section-content {
          font-size: 0.95rem;
          line-height: 1.7;
          color: var(--color-text);
          white-space: pre-wrap;
        }

        .section-image {
          margin-top: 24px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--color-border);
          max-width: 100%;
        }

        .back-nav {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--color-text-muted);
          text-decoration: none;
          font-weight: 600;
          margin-bottom: 24px;
          transition: color 0.2s;
          cursor: pointer;
        }

        .back-nav:hover {
          color: var(--color-text);
        }
      `}</style>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 60px', marginTop: '40px' }}>
        <div className="back-nav" onClick={() => navigate('/templates')}>
          ← Back to Templates
        </div>

        <div className="algorithm-hero">
          {learnMore?.headerImageSrc && (
            <>
              <div className="algorithm-hero__bg">
                <img src={learnMore.headerImageSrc} alt="" />
              </div>
              <div className="algorithm-hero__gradient" />
            </>
          )}
          <div className="algorithm-hero__content">
            <div>
              <div className="algorithm-tags">
                {template.tags.map((tag) => (
                  <span key={tag} className="algorithm-tag">{tag}</span>
                ))}
              </div>
              <h1 className="algorithm-title">{template.name}</h1>
              {learnMore?.description && (
                <p className="algorithm-description">{learnMore.description}</p>
              )}
            </div>
            <div>
              <button 
                className="btn btn--primary" 
                style={{ padding: '16px 32px', fontSize: '1.1rem', fontWeight: 600 }}
                onClick={handleLoad}
              >
                Load into Builder
              </button>
            </div>
          </div>
        </div>

        <div className="algorithm-sections">
          {learnMore?.sections?.map((section, idx) => (
            <div key={idx} className="algorithm-section">
              <h2 className="section-title">{section.title}</h2>
              {section.content && <div className="section-content">{section.content}</div>}
              {section.imageSrc && (
                <img src={section.imageSrc} alt={section.title} className="section-image" />
              )}
            </div>
          ))}
          
          {(!learnMore?.sections || learnMore.sections.length === 0) && (
            <div className="algorithm-section" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No detailed sections available for this algorithm yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
