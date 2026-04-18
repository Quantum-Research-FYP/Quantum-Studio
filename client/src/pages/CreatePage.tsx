import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function CreatePage() {
  const { user } = useAuth();

  return (
    <div className="page">
      <h1 className="page__title">Create a Quantum Circuit</h1>
      <p className="page__subtitle">
        Design, simulate, and analyse quantum circuits in an interactive workbench.
      </p>

      <div className="cta-group">
        <Link to="/create" className="cta-card">
          <span className="cta-card__icon" aria-hidden="true">
            +
          </span>
          <span className="cta-card__label">Start a new circuit</span>
        </Link>

        <Link to="/templates" className="cta-card">
          <span className="cta-card__icon" aria-hidden="true">
            &#9638;
          </span>
          <span className="cta-card__label">Browse templates</span>
        </Link>

        {!user && (
          <Link to="/login" className="cta-card">
            <span className="cta-card__icon" aria-hidden="true">
              &#8594;
            </span>
            <span className="cta-card__label">Log in / Sign up</span>
          </Link>
        )}
      </div>
    </div>
  );
}
