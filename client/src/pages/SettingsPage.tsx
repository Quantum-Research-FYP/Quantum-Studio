import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import {
  getIbmSettings,
  saveIbmSettings,
  deleteIbmSettings,
  type IbmSettingsResponse,
} from '../api/integrations';

type ViewState = 'loading' | 'no-settings' | 'has-settings' | 'error';

const STATUS_CONFIG = {
  valid: { label: 'Connected', className: 'settings-status--valid' },
  invalid: { label: 'Invalid token', className: 'settings-status--invalid' },
  error: { label: 'Validation error', className: 'settings-status--error' },
  pending: { label: 'Pending validation', className: 'settings-status--pending' },
} as const;

export default function SettingsPage() {
  const { user } = useAuth();

  const [viewState, setViewState] = useState<ViewState>('loading');
  const [settings, setSettings] = useState<IbmSettingsResponse | null>(null);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await getIbmSettings();
      setSettings(data);
      setViewState('has-settings');
    } catch (err: unknown) {
      const apiErr = err as { status?: number; errorCode?: string };
      if (apiErr.status === 404) {
        setViewState('no-settings');
      } else if (apiErr.errorCode === 'IBM_QUANTUM_DISABLED') {
        setFeatureDisabled(true);
        setViewState('no-settings');
      } else {
        setViewState('error');
      }
    }
  }, []);

  useEffect(() => {
    if (user) loadSettings();
  }, [user, loadSettings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;

    setSaving(true);
    setMessage(null);

    try {
      const data = await saveIbmSettings(token.trim());
      setSettings(data);
      setToken('');
      setShowToken(false);
      setViewState('has-settings');

      if (data.validationStatus === 'valid') {
        setMessage({ type: 'success', text: 'Token saved and validated successfully.' });
      } else if (data.validationMessage) {
        setMessage({ type: 'error', text: data.validationMessage });
      } else {
        setMessage({ type: 'success', text: 'Token saved. Validation is pending.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings.';
      setMessage({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Remove your IBM Quantum credentials? This cannot be undone.')) return;

    setDeleting(true);
    setMessage(null);

    try {
      await deleteIbmSettings();
      setSettings(null);
      setViewState('no-settings');
      setMessage({ type: 'success', text: 'Credentials removed successfully.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete settings.';
      setMessage({ type: 'error', text: msg });
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const statusKey = (settings?.validationStatus ?? 'pending') as keyof typeof STATUS_CONFIG;
  const statusCfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.pending;

  if (!user) {
    return (
      <div className="settings-page">
        <div className="alert alert--error" role="alert">
          You must be logged in to access settings.
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <h1 className="settings-page__title">Settings</h1>
        <p className="settings-page__subtitle">Manage your account integrations and preferences.</p>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings navigation">
          <button className="settings-nav__item settings-nav__item--active" type="button">
            <span className="settings-nav__icon" aria-hidden="true">⚛</span>
            IBM Quantum
          </button>
        </nav>

        <div className="settings-content">
          {message && (
            <div className={`alert alert--${message.type}`} role="alert">
              {message.text}
            </div>
          )}

          <div className="settings-panel">
            <div className="settings-panel__header">
              <div className="settings-panel__title-row">
                <h2 className="settings-panel__title">IBM Quantum Integration</h2>
                {featureDisabled && (
                  <span className="settings-badge settings-badge--disabled">Server disabled</span>
                )}
              </div>
              <p className="settings-panel__desc">
                Connect your IBM Quantum account to run experiments on real quantum hardware backends.
              </p>
            </div>

            {featureDisabled && (
              <div className="settings-panel__body">
                <div className="alert alert--warning" role="alert">
                  IBM Quantum integration is not currently enabled on this server.
                </div>
              </div>
            )}

            {viewState === 'loading' && (
              <div className="settings-panel__loading">
                <span className="settings-spinner" aria-hidden="true" />
                Loading integration settings…
              </div>
            )}

            {viewState === 'error' && (
              <div className="settings-panel__body">
                <div className="alert alert--error" role="alert">
                  Failed to load integration settings. Please refresh to try again.
                </div>
              </div>
            )}

            {viewState === 'has-settings' && settings && (
              <div className="settings-connection-card">
                <div className="settings-connection-card__status-row">
                  <span
                    className={`settings-status-dot ${statusCfg.className}`}
                    aria-hidden="true"
                  />
                  <span className="settings-connection-card__status-label">{statusCfg.label}</span>
                  {settings.validationErrorCode && (
                    <span className="settings-connection-card__error-code">
                      {settings.validationErrorCode}
                    </span>
                  )}
                </div>
                <div className="settings-meta-grid">
                  <span className="settings-meta-grid__label">Last validated</span>
                  <span className="settings-meta-grid__value">{formatDate(settings.lastValidatedAt)}</span>
                  <span className="settings-meta-grid__label">Credentials saved</span>
                  <span className="settings-meta-grid__value">{formatDate(settings.updatedAt)}</span>
                </div>
              </div>
            )}

            {!featureDisabled && (
              <form
                className="settings-token-form"
                onSubmit={handleSave}
                aria-label="Save IBM Quantum token"
              >
                <div className="settings-token-form__header">
                  <h3 className="settings-token-form__title">
                    {viewState === 'has-settings' ? 'Update API Token' : 'Connect Your Account'}
                  </h3>
                  <p className="settings-token-form__desc">
                    {viewState === 'has-settings'
                      ? 'Paste a new token below to replace your existing credentials.'
                      : 'Enter your IBM Quantum API token to enable hardware execution.'}
                  </p>
                </div>

                <div className="form-field">
                  <label className="form-field__label" htmlFor="ibm-token-input">
                    API Token
                  </label>
                  <div className="form-field__input-wrap">
                    <input
                      id="ibm-token-input"
                      className="form-field__input form-field__input--with-addon"
                      type={showToken ? 'text' : 'password'}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="Paste your IBM Quantum API token"
                      autoComplete="off"
                      required
                      minLength={10}
                    />
                    <button
                      type="button"
                      className="form-field__eye-btn"
                      onClick={() => setShowToken((v) => !v)}
                      aria-label={showToken ? 'Hide token' : 'Show token'}
                    >
                      {showToken ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <p className="form-field__hint">
                    Find your token at{' '}
                    <a
                      href="https://quantum.ibm.com/account"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      quantum.ibm.com/account
                    </a>
                  </p>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={saving || token.trim().length < 10}
                >
                  {saving
                    ? 'Saving…'
                    : viewState === 'has-settings'
                      ? 'Update Token'
                      : 'Connect Account'}
                </Button>
              </form>
            )}

            {viewState === 'has-settings' && (
              <div className="settings-danger-zone">
                <p className="settings-danger-zone__label">Danger Zone</p>
                <div className="settings-danger-zone__row">
                  <div className="settings-danger-zone__text">
                    <p className="settings-danger-zone__name">Remove credentials</p>
                    <p className="settings-danger-zone__desc">
                      Permanently removes your IBM Quantum API token. You won't be able to run
                      experiments on IBM hardware until you reconnect.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? 'Removing…' : 'Remove'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
