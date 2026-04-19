import { Link } from 'react-router-dom';

export default function ExperimentsPage() {
  return (
    <div className="page">
      <h1 className="page__title">My Experiments</h1>
      <p className="page__subtitle">You don't have any saved experiments yet.</p>

      <div className="cta-group">
        <Link to="/create" className="cta-card">
          <span className="cta-card__icon" aria-hidden="true">
            +
          </span>
          <span className="cta-card__label">Create a new circuit</span>
        </Link>

        <Link to="/templates" className="cta-card">
          <span className="cta-card__icon" aria-hidden="true">
            &#9638;
          </span>
          <span className="cta-card__label">View templates</span>
        </Link>
      </div>
    </div>
  );
}
