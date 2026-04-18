import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || '/create';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already authenticated — redirect away
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
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <h1 className="auth-form__title">Log in</h1>
        <p className="auth-form__subtitle">Sign in to your Quantum Studio account.</p>

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
            className="form-field__input"
            autoComplete="email"
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
          <input
            id="login-password"
            type="password"
            className="form-field__input"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn--primary btn--full" disabled={!canSubmit}>
          {submitting ? 'Signing in\u2026' : 'Log in'}
        </button>

        <p className="auth-form__footer">
          {"Don't have an account? "}
          <Link to="/signup" state={{ from }}>
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
