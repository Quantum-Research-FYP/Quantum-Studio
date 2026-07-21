import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { GoogleIcon, GitHubIcon } from '../components/ui/Icons';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 12;

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

function getPasswordStrength(pwd: string): 0 | 1 | 2 | 3 | 4 {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= MIN_PASSWORD_LENGTH) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score as 0 | 1 | 2 | 3 | 4;
}

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLORS = [
  '',
  'var(--color-error)',
  'var(--color-warning)',
  'var(--color-info)',
  'var(--color-success)',
];

export default function SignupPage() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || '/create';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={from} replace />;

  const emailValid = EMAIL_RE.test(email);
  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH;
  const passwordsMatch = password === confirmPassword;
  const canSubmit =
    emailValid && passwordLongEnough && passwordsMatch && confirmPassword.length > 0 && !submitting;

  const strength = getPasswordStrength(password);

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
            <h1 className="auth-form__title">Create account</h1>
            <p className="auth-form__subtitle">Join Quantum Studio and start experimenting.</p>
          </div>

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
          <label htmlFor="signup-password" className="form-field__label">
            Password
          </label>
          <div className="form-field__input-wrap">
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              className="form-field__input form-field__input--with-addon"
              autoComplete="new-password"
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              required
              minLength={MIN_PASSWORD_LENGTH}
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
          {password.length > 0 && (
            <div className="password-strength">
              <div className="password-strength__bars">
                {([1, 2, 3, 4] as const).map((level) => (
                  <div
                    key={level}
                    className="password-strength__bar"
                    style={{ background: strength >= level ? STRENGTH_COLORS[strength] : undefined }}
                  />
                ))}
              </div>
              <span
                className="password-strength__label"
                style={{ color: STRENGTH_COLORS[strength] }}
              >
                {STRENGTH_LABELS[strength]}
              </span>
            </div>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="signup-confirm" className="form-field__label">
            Confirm password
          </label>
          <div className="form-field__input-wrap">
            <input
              id="signup-confirm"
              type={showConfirm ? 'text' : 'password'}
              className={`form-field__input form-field__input--with-addon${confirmPassword.length > 0 && !passwordsMatch ? ' form-field__input--error' : ''}`}
              autoComplete="new-password"
              placeholder="Repeat your password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button
              type="button"
              className="form-field__eye-btn"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              <EyeIcon visible={showConfirm} />
            </button>
          </div>
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="form-field__error">Passwords do not match.</p>
          )}
        </div>

        <ul className="password-reqs">
          <li
            className={`password-reqs__item${passwordLongEnough ? ' password-reqs__item--met' : ''}`}
          >
            {passwordLongEnough ? '✓' : '○'} At least {MIN_PASSWORD_LENGTH} characters
          </li>
          <li
            className={`password-reqs__item${passwordsMatch && confirmPassword.length > 0 ? ' password-reqs__item--met' : ''}`}
          >
            {passwordsMatch && confirmPassword.length > 0 ? '✓' : '○'} Passwords match
          </li>
        </ul>

        <Button
          type="submit"
          variant="primary"
          size="full"
          className="auth-submit-btn"
          disabled={!canSubmit}
          isLoading={submitting}
        >
          {submitting ? 'Creating account…' : 'Create account'}
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
          Already have an account?{' '}
          <Link to="/login" state={{ from }}>
            Log in
          </Link>
        </p>
      </form>
      </div>
    </div>
  );
}
