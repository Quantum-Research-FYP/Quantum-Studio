import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTemplates } from '../templates';

export default function TemplateDetailsPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const template = useMemo(() => {
    try {
      return getTemplates().find((item) => item.templateId === templateId) || null;
    } catch {
      return null;
    }
  }, [templateId]);

  if (!template) {
    return (
      <div className="workspace-page template-details-not-found">
        <h1 className="page__title">Template not found</h1>
        <p className="page__subtitle">The template you are looking for does not exist.</p>
        <button className="btn btn--primary" onClick={() => navigate('/templates')}>
          Back to Templates
        </button>
      </div>
    );
  }

  const learnMore = template.learnMore;
  const gateCount = template.circuit.operations.filter((operation) => operation.type !== 'MEASURE').length;
  const depth = template.circuit.operations.length
    ? Math.max(...template.circuit.operations.map((operation) => operation.time)) + 1
    : 0;

  const openInBuilder = () => {
    navigate(`/builder?templateId=${encodeURIComponent(template.templateId)}`);
  };

  return (
    <div className="template-details-page">
      <button className="template-details-back" type="button" onClick={() => navigate('/templates')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        All templates
      </button>

      <section className="template-details-hero">
        <div className="template-details-hero__media">
          {learnMore?.headerImageSrc ? (
            <img src={learnMore.headerImageSrc} alt={`${template.name} abstract visualization`} />
          ) : (
            <div className="template-details-hero__placeholder" />
          )}
          <span className="template-details-hero__eyebrow">Starter template</span>
        </div>

        <div className="template-details-hero__content">
          <div className="template-details-tags" aria-label="Template topics">
            {template.tags.map((tag) => (
              <span key={tag} className="template-details-tag">{tag}</span>
            ))}
          </div>

          <h1>{template.name}</h1>
          <p>{learnMore?.description || template.description}</p>

          <dl className="template-details-facts">
            <div><dt>Qubits</dt><dd>{template.circuit.qubits}</dd></div>
            <div><dt>Gates</dt><dd>{gateCount}</dd></div>
            <div><dt>Depth</dt><dd>{depth}</dd></div>
            <div><dt>Shots</dt><dd>{template.defaultExecutionConfig.shots.toLocaleString()}</dd></div>
          </dl>

          <button className="btn btn--primary template-details-load" onClick={openInBuilder}>
            Load into Builder
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </section>

      <div className="template-details-layout">
        <aside className="template-details-nav" aria-label="On this page">
          <p className="template-details-nav__label">On this page</p>
          {learnMore?.sections?.map((section, index) => (
            <a key={`${section.title}-${index}`} href={`#template-section-${index}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              {section.title}
            </a>
          ))}
        </aside>

        <main className="template-details-article">
          {learnMore?.sections?.map((section, index) => (
            <section key={`${section.title}-${index}`} id={`template-section-${index}`} className="template-details-section">
              <div className="template-details-section__number">{String(index + 1).padStart(2, '0')}</div>
              <div className="template-details-section__body">
                <h2>{section.title}</h2>
                {section.content && <div className="template-details-section__content">{section.content}</div>}
                {section.imageSrc && <img src={section.imageSrc} alt={section.title} className="template-details-section__image" />}
              </div>
            </section>
          ))}

          {(!learnMore?.sections || learnMore.sections.length === 0) && (
            <div className="template-details-empty">Detailed learning material is coming soon.</div>
          )}

          <section className="template-details-cta">
            <div>
              <h2>Ready to explore this circuit?</h2>
              <p>Open the template in Circuit Builder and inspect every step interactively.</p>
            </div>
            <button className="btn btn--primary" onClick={openInBuilder}>Open in Builder</button>
          </section>
        </main>
      </div>
    </div>
  );
}
