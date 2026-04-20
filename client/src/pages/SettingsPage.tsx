import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getIbmSettings,
  saveIbmSettings,
  deleteIbmSettings,
  type IbmSettingsResponse,
} from '../api/integrations';

type ViewState = 'loading' | 'no-settings' | 'has-settings' | 'error';

export default function SettingsPage() {
  const { user } = useAuth();

  const [viewState, setViewState] = useState<ViewState>('loading');
  const [settings, setSettings] = useState<IbmSettingsResponse | null>(null);
  const [token, setToken] = useState('');
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
    if (user) {
      loadSettings();
    }
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
    if (!confirm('Are you sure you want to remove your IBM Quantum credentials?')) return;

    setDeleting(true);
    setMessage(null);

    try {
      await deleteIbmSettings();
      setSettings(null);
      setViewState('no-settings');
      setMessage({ type: 'success', text: 'Credentials removed.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete settings.';
      setMessage({ type: 'error', text: msg });
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleString();
  }

  function validationBadge(status: string): { label: string; className: string } {
    switch (status) {
      case 'valid':
        return { label: 'Valid', className: 'badge badge--success' };
      case 'invalid':
        return { label: 'Invalid', className: 'badge badge--error' };
      case 'error':
        return { label: 'Validation Error', className: 'badge badge--warning' };
      default:
        return { label: 'Pending', className: 'badge badge--neutral' };
    }
  }

  if (!user) {
    return (
      <div className="settings-page">
        <h1>Settings</h1>
        <div className="alert alert--error" role="alert">
          You must be logged in to access settings.
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <h1 className="settings-page__title">Settings</h1>

      <section className="settings-section" aria-labelledby="ibm-quantum-heading">
        <h2 id="ibm-quantum-heading" className="settings-section__heading">
          IBM Quantum Integration
        </h2>

        {featureDisabled && (
          <div className="alert alert--warning" role="alert">
            IBM Quantum integration is not currently enabled on this server.
          </div>
        )}

        {message && (
          <div className={`alert alert--${message.type}`} role="alert">
            {message.text}
          </div>
        )}

        {viewState === 'loading' && <p>Loading settings...</p>}

        {viewState === 'error' && (
          <div className="alert alert--error" role="alert">
            Failed to load integration settings. Please try again.
          </div>
        )}

        {viewState === 'has-settings' && settings && (
          <div className="settings-card">
            <div className="settings-card__row">
              <span className="settings-card__label">Token Status</span>
              <span className="settings-card__value">
                <span className={validationBadge(settings.validationStatus).className}>
                  {validationBadge(settings.validationStatus).label}
                </span>
              </span>
            </div>
            <div className="settings-card__row">
              <span className="settings-card__label">Last Validated</span>
              <span className="settings-card__value">
                {formatDate(settings.lastValidatedAt)}
              </span>
            </div>
            <div className="settings-card__row">
              <span className="settings-card__label">Saved</span>
              <span className="settings-card__value">
                {formatDate(settings.updatedAt)}
              </span>
            </div>

            {settings.validationErrorCode && (
              <div className="alert alert--error alert--compact" role="status">
                Error code: {settings.validationErrorCode}
              </div>
            )}

            <div className="settings-card__actions">
              <button
                type="button"
                className="btn btn--danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Removing...' : 'Remove Credentials'}
              </button>
            </div>
          </div>
        )}

        {!featureDisabled && (
          <form
            className="settings-form"
            onSubmit={handleSave}
            aria-label="Save IBM Quantum token"
          >
            <p className="settings-form__hint">
              {viewState === 'has-settings'
                ? 'Enter a new token to update your credentials.'
                : 'Enter your IBM Quantum API token to enable hardware execution.'}
            </p>
            <div className="form-field">
              <label className="form-field__label" htmlFor="ibm-token-input">
                API Token
              </label>
              <input
                id="ibm-token-input"
                className="form-field__input"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your IBM Quantum API token"
                autoComplete="off"
                required
                minLength={10}
              />
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
            <button
              type="submit"
              className="btn btn--primary"
              disabled={saving || token.trim().length < 10}
            >
              {saving ? 'Saving...' : viewState === 'has-settings' ? 'Update Token' : 'Save Token'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
