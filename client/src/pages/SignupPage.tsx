import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 12;

export default function SignupPage() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || '/create';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already authenticated — redirect away
  if (user) return <Navigate to={from} replace />;

  const emailValid = EMAIL_RE.test(email);
  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH;
  const passwordsMatch = password === confirmPassword;
  const canSubmit =
    emailValid && passwordLongEnough && passwordsMatch && confirmPassword.length > 0 && !submitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setSubmitting(true);
    try {
      await signup(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred.';
      const action = (err as { action?: string })?.action;
      if (action === 'login') {
        setError(message + ' Please log in instead.');
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <h1 className="auth-form__title">Sign up</h1>
        <p className="auth-form__subtitle">Create your Quantum Studio account.</p>

        {error && (
          <div className="alert alert--error" role="alert">
            {error}
            {error.includes('log in instead') && (
              <>
                {' '}
                <Link to="/login" state={{ from }}>
                  Go to Log in
                </Link>
              </>
            )}
          </div>
        )}

        <div className="form-field">
          <label htmlFor="signup-email" className="form-field__label">
            Email
          </label>
          <input
            id="signup-email"
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
          <label htmlFor="signup-password" className="form-field__label">
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            className="form-field__input"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p
            className={`form-field__hint${password.length > 0 && !passwordLongEnough ? ' form-field__hint--warn' : ''}`}
          >
            Must be at least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>

        <div className="form-field">
          <label htmlFor="signup-confirm" className="form-field__label">
            Confirm password
          </label>
          <input
            id="signup-confirm"
            type="password"
            className="form-field__input"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="form-field__error">Passwords do not match.</p>
          )}
        </div>

        <button type="submit" className="btn btn--primary btn--full" disabled={!canSubmit}>
          {submitting ? 'Creating account\u2026' : 'Sign up'}
        </button>

        <p className="auth-form__footer">
          Already have an account?{' '}
          <Link to="/login" state={{ from }}>
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
