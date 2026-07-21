import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { GoogleIcon, GitHubIcon } from '../components/ui/Icons';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EyeIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || '/create';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={from} replace />;

  const emailValid = EMAIL_RE.test(email);
  const canSubmit = emailValid && password.length > 0 && !submitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-split-visual" aria-hidden="true">
        <div className="auth-split-visual-content">
          <h2 className="auth-split-visual-title">Quantum Experiment Studio</h2>
          <p className="auth-split-visual-desc">
            Design, simulate, and execute quantum circuits in a modern, collaborative environment.
          </p>
        </div>
      </div>
      
      <div className="auth-split-form">
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-form__brand">
            <div className="auth-form__logo" aria-hidden="true">
              <img src="/favicon.png" alt="Quantum Studio Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <h1 className="auth-form__title">Welcome back</h1>
            <p className="auth-form__subtitle">Sign in to your Quantum Studio account.</p>
          </div>

        {error && (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        )}

        <div className="form-field">
          <label htmlFor="login-email" className="form-field__label">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            className={`form-field__input${email.length > 0 && !emailValid ? ' form-field__input--error' : ''}`}
            autoComplete="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {email.length > 0 && !emailValid && (
            <p className="form-field__error">Please enter a valid email address.</p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="login-password" className="form-field__label">
            Password
          </label>
          <div className="form-field__input-wrap">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              className="form-field__input form-field__input--with-addon"
              autoComplete="current-password"
              placeholder="Enter your password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="form-field__eye-btn"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              <EyeIcon visible={showPassword} />
            </button>
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="full"
          className="auth-submit-btn"
          disabled={!canSubmit}
          isLoading={submitting}
        >
          {submitting ? 'Signing in…' : 'Log in'}
        </Button>

        <div className="auth-divider">
          <span>or continue with</span>
        </div>
        
        <div className="auth-sso-buttons">
          <button
            type="button"
            className="auth-sso-btn"
            onClick={() => window.location.href = '/api/auth/google'}
          >
            <GoogleIcon />
            Google
          </button>
          <button
            type="button"
            className="auth-sso-btn"
            onClick={() => window.location.href = '/api/auth/github'}
          >
            <GitHubIcon />
            GitHub
          </button>
        </div>

        <p className="auth-form__footer">
          {"Don't have an account? "}
          <Link to="/signup" state={{ from }}>
            Sign up
          </Link>
        </p>
      </form>
      </div>
    </div>
  );
}
