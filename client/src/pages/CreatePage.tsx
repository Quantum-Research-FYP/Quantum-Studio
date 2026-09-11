import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useUserGuide } from '../components/UserGuide/UserGuideProvider';
function IconPlus() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}

function IconGrid() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7"></rect>
      <rect x="14" y="3" width="7" height="7"></rect>
      <rect x="14" y="14" width="7" height="7"></rect>
      <rect x="3" y="14" width="7" height="7"></rect>
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12"></line>
      <polyline points="12 5 19 12 12 19"></polyline>
    </svg>
  );
}

export default function CreatePage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { startTour } = useUserGuide();

  useEffect(() => {
    if (location.state?.isNewSignup) {
      startTour();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, startTour]);

  return (
    <div className="page" style={{ padding: 0, position: 'relative' }}>
      <button
        className="btn btn--ghost btn--sm"
        style={{ position: 'absolute', top: 24, right: 24, display: 'flex', gap: 8, alignItems: 'center', zIndex: 10 }}
        onClick={startTour}
        title="Start User Guide Tour"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
        User Guide
      </button>
      <div className="home-hero">
        <div className="home-hero__content">
          <h1 className="home-hero__title">Quantum Experiment Studio</h1>
          <p className="home-hero__subtitle">
            Design, simulate, and analyse quantum circuits in an interactive workbench.
          </p>
        </div>

        <div className="cta-group">
          <Link to="/builder" className="cta-card">
            <span className="cta-card__icon" aria-hidden="true">
              <IconPlus />
            </span>
            <div className="cta-card__content">
              <span className="cta-card__label">Start a new circuit</span>
              <span className="cta-card__desc">
                Jump into the visual builder and start dropping gates.
              </span>
            </div>
          </Link>

          <Link to="/templates" className="cta-card">
            <span className="cta-card__icon" aria-hidden="true">
              <IconGrid />
            </span>
            <div className="cta-card__content">
              <span className="cta-card__label">Browse templates</span>
              <span className="cta-card__desc">
                Explore pre-built quantum algorithms and examples.
              </span>
            </div>
          </Link>

          {!user && (
            <Link to="/login" className="cta-card">
              <span className="cta-card__icon" aria-hidden="true">
                <IconArrowRight />
              </span>
              <div className="cta-card__content">
                <span className="cta-card__label">Log in / Sign up</span>
                <span className="cta-card__desc">
                  Create an account to save your experiments to the cloud.
                </span>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
