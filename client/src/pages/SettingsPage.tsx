import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getIbmSettings,
  saveIbmSettings,
  deleteIbmSettings,
  getSpinqSettings,
  saveSpinqSettings,
  type IbmSettingsResponse,
  type SpinqSettingsResponse,
} from '../api/integrations';
import { getGitHubStatus, disconnectGitHub, type GitHubStatus } from '../api/github';

type ViewState = 'loading' | 'no-settings' | 'has-settings' | 'error';
type SettingsTab = 'ibm' | 'spinq' | 'github';

const STATUS_CONFIG = {
  valid: { label: 'Connected', className: 'settings-status--valid' },
  invalid: { label: 'Invalid token', className: 'settings-status--invalid' },
  error: { label: 'Validation error', className: 'settings-status--error' },
  pending: { label: 'Pending validation', className: 'settings-status--pending' },
} as const;

export default function SettingsPage() {
  const { user } = useAuth();

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<SettingsTab>('ibm');

  // --- IBM state ---
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [settings, setSettings] = useState<IbmSettingsResponse | null>(null);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  // --- SpinQ state ---
  const [spinqViewState, setSpinqViewState] = useState<ViewState>('loading');
  const [spinqSettings, setSpinqSettings] = useState<SpinqSettingsResponse['settings'] | null>(
    null,
  );
  const [spinqIp, setSpinqIp] = useState('');
  const [spinqPort, setSpinqPort] = useState('');
  const [spinqUsername, setSpinqUsername] = useState('');
  const [spinqPassword, setSpinqPassword] = useState('');
  const [spinqShowPassword, setSpinqShowPassword] = useState(false);
  const [spinqSaving, setSpinqSaving] = useState(false);
  const [spinqMessage, setSpinqMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // --- GitHub state ---
  const [ghStatus, setGhStatus] = useState<GitHubStatus | null>(null);
  const [ghLoading, setGhLoading] = useState(true);
  const [ghDisconnecting, setGhDisconnecting] = useState(false);
  const [ghMessage, setGhMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  // --- Check URL params for GitHub callback result ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const githubResult = params.get('github');
    if (githubResult === 'connected') {
      setActiveTab('github');
      setGhMessage({ type: 'success', text: 'GitHub account connected successfully!' });
      // Clean the URL
      window.history.replaceState({}, '', '/settings');
    } else if (githubResult === 'error') {
      setActiveTab('github');
      const reason = params.get('reason') || 'unknown';
      setGhMessage({
        type: 'error',
        text: `GitHub connection failed: ${reason.replace(/_/g, ' ')}`,
      });
      window.history.replaceState({}, '', '/settings');
    }
  }, []);

  // --- IBM Quantum loader ---
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

  // --- SpinQ loader ---
  const loadSpinqSettings = useCallback(async () => {
    try {
      const data = await getSpinqSettings();
      if (data && data.settings) {
        setSpinqSettings(data.settings);
        setSpinqIp(data.settings.ip);
        setSpinqPort(data.settings.port.toString());
        setSpinqUsername(data.settings.username);
        setSpinqViewState('has-settings');
      } else {
        setSpinqViewState('no-settings');
      }
    } catch (err: unknown) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 404) {
        setSpinqViewState('no-settings');
      } else {
        setSpinqViewState('error');
      }
    }
  }, []);

  // --- GitHub loader ---
  const loadGitHubStatus = useCallback(async () => {
    setGhLoading(true);
    try {
      const data = await getGitHubStatus();
      setGhStatus(data);
    } catch {
      setGhStatus({ enabled: false, connected: false });
    } finally {
      setGhLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadSettings();
      loadSpinqSettings();
      loadGitHubStatus();
    }
  }, [user, loadSettings, loadSpinqSettings, loadGitHubStatus]);

  // --- IBM handlers ---
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

  // --- SpinQ handlers ---
  async function handleSpinqSave(e: React.FormEvent) {
    e.preventDefault();
    if (!spinqIp || !spinqPort || !spinqUsername) return;

    setSpinqSaving(true);
    setSpinqMessage(null);

    try {
      const data = await saveSpinqSettings(
        spinqIp.trim(),
        parseInt(spinqPort, 10),
        spinqUsername.trim(),
        spinqPassword || undefined,
      );
      setSpinqSettings(data.settings);
      setSpinqPassword('');
      setSpinqShowPassword(false);
      setSpinqViewState('has-settings');
      setSpinqMessage({ type: 'success', text: 'SpinQ settings saved successfully.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save SpinQ settings.';
      setSpinqMessage({ type: 'error', text: msg });
    } finally {
      setSpinqSaving(false);
    }
  }

  // --- GitHub handlers ---
  function handleConnectGitHub() {
    window.location.href = '/api/integrations/github/connect';
  }

  async function handleDisconnectGitHub() {
    if (!confirm('Disconnect your GitHub account? You will need to reconnect to push code.'))
      return;

    setGhDisconnecting(true);
    setGhMessage(null);

    try {
      await disconnectGitHub();
      setGhStatus({ enabled: true, connected: false });
      setGhMessage({ type: 'success', text: 'GitHub account disconnected.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to disconnect.';
      setGhMessage({ type: 'error', text: msg });
    } finally {
      setGhDisconnecting(false);
    }
  }

  // --- Helpers ---
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
          <button
            className={`settings-nav__item ${activeTab === 'ibm' ? 'settings-nav__item--active' : ''}`}
            type="button"
            onClick={() => setActiveTab('ibm')}
          >
            <span className="settings-nav__icon" aria-hidden="true">
              ⚛
            </span>
            IBM Quantum
          </button>
          <button
            className={`settings-nav__item ${activeTab === 'spinq' ? 'settings-nav__item--active' : ''}`}
            type="button"
            onClick={() => setActiveTab('spinq')}
          >
            <span className="settings-nav__icon" aria-hidden="true">
              ⚛
            </span>
            SpinQ Quantum
          </button>
          <button
            className={`settings-nav__item ${activeTab === 'github' ? 'settings-nav__item--active' : ''}`}
            type="button"
            onClick={() => setActiveTab('github')}
          >
            <span className="settings-nav__icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </span>
            GitHub
          </button>
        </nav>

        <div className="settings-content">
          {/* ======================== IBM QUANTUM TAB ======================== */}
          {activeTab === 'ibm' && (
            <>
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
                      <span className="settings-badge settings-badge--disabled">
                        Server disabled
                      </span>
                    )}
                  </div>
                  <p className="settings-panel__desc">
                    Connect your IBM Quantum account to run experiments on real quantum hardware
                    backends.
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
                      <span className="settings-connection-card__status-label">
                        {statusCfg.label}
                      </span>
                      {settings.validationErrorCode && (
                        <span className="settings-connection-card__error-code">
                          {settings.validationErrorCode}
                        </span>
                      )}
                    </div>
                    <div className="settings-meta-grid">
                      <span className="settings-meta-grid__label">Last validated</span>
                      <span className="settings-meta-grid__value">
                        {formatDate(settings.lastValidatedAt)}
                      </span>
                      <span className="settings-meta-grid__label">Credentials saved</span>
                      <span className="settings-meta-grid__value">
                        {formatDate(settings.updatedAt)}
                      </span>
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
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          ) : (
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <p className="form-field__hint">
                        Find your token at{' '}
                        <a
                          href="https://quantum.cloud.ibm.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          quantum.cloud.ibm.com
                        </a>
                      </p>
                    </div>

                    <button
                      type="submit"
                      className="btn btn--primary"
                      disabled={saving || token.trim().length < 10}
                    >
                      {saving
                        ? 'Saving…'
                        : viewState === 'has-settings'
                          ? 'Update Token'
                          : 'Connect Account'}
                    </button>
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
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={handleDelete}
                        disabled={deleting}
                      >
                        {deleting ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ======================== SPINQ QUANTUM TAB ======================== */}
          {activeTab === 'spinq' && (
            <>
              {spinqMessage && (
                <div className={`alert alert--${spinqMessage.type}`} role="alert">
                  {spinqMessage.text}
                </div>
              )}

              <div className="settings-panel">
                <div className="settings-panel__header">
                  <div className="settings-panel__title-row">
                    <h2 className="settings-panel__title">SpinQ Hardware Integration</h2>
                  </div>
                  <p className="settings-panel__desc">
                    Configure your SpinQ Gemini Mini Pro quantum computer's network and account
                    details.
                  </p>
                </div>

                {spinqViewState === 'loading' && (
                  <div className="settings-panel__loading">
                    <span className="settings-spinner" aria-hidden="true" />
                    Loading integration settings…
                  </div>
                )}

                {spinqViewState === 'error' && (
                  <div className="settings-panel__body">
                    <div className="alert alert--error" role="alert">
                      Failed to load integration settings. Please refresh to try again.
                    </div>
                  </div>
                )}

                {spinqViewState === 'has-settings' && spinqSettings && (
                  <div className="settings-connection-card">
                    <div className="settings-connection-card__status-row">
                      <span
                        className="settings-status-dot settings-status--valid"
                        aria-hidden="true"
                      />
                      <span className="settings-connection-card__status-label">
                        Configuration Saved
                      </span>
                    </div>
                    <div className="settings-meta-grid">
                      <span className="settings-meta-grid__label">Target IP</span>
                      <span className="settings-meta-grid__value">
                        {spinqSettings.ip}:{spinqSettings.port}
                      </span>
                      <span className="settings-meta-grid__label">Username</span>
                      <span className="settings-meta-grid__value">{spinqSettings.username}</span>
                      <span className="settings-meta-grid__label">Last updated</span>
                      <span className="settings-meta-grid__value">
                        {formatDate(spinqSettings.updatedAt)}
                      </span>
                    </div>
                  </div>
                )}

                <form
                  className="settings-token-form"
                  onSubmit={handleSpinqSave}
                  aria-label="Save SpinQ Settings"
                >
                  <div className="settings-token-form__header">
                    <h3 className="settings-token-form__title">
                      {spinqViewState === 'has-settings'
                        ? 'Update Configuration'
                        : 'Configure Connection'}
                    </h3>
                  </div>

                  <div className="form-field">
                    <label className="form-field__label" htmlFor="spinq-ip-input">
                      IP Address
                    </label>
                    <input
                      id="spinq-ip-input"
                      className="form-field__input"
                      type="text"
                      value={spinqIp}
                      onChange={(e) => setSpinqIp(e.target.value)}
                      placeholder="e.g. 172.31.80.238"
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-field__label" htmlFor="spinq-port-input">
                      Port
                    </label>
                    <input
                      id="spinq-port-input"
                      className="form-field__input"
                      type="number"
                      value={spinqPort}
                      onChange={(e) => setSpinqPort(e.target.value)}
                      placeholder="e.g. 8989"
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-field__label" htmlFor="spinq-username-input">
                      Username
                    </label>
                    <input
                      id="spinq-username-input"
                      className="form-field__input"
                      type="text"
                      value={spinqUsername}
                      onChange={(e) => setSpinqUsername(e.target.value)}
                      placeholder="e.g. GamithChanuka"
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-field__label" htmlFor="spinq-password-input">
                      Password{' '}
                      {spinqViewState === 'has-settings' && '(Leave blank to keep existing)'}
                    </label>
                    <div className="form-field__input-wrap">
                      <input
                        id="spinq-password-input"
                        className="form-field__input form-field__input--with-addon"
                        type={spinqShowPassword ? 'text' : 'password'}
                        value={spinqPassword}
                        onChange={(e) => setSpinqPassword(e.target.value)}
                        placeholder="Enter password"
                        autoComplete="off"
                        required={spinqViewState !== 'has-settings'}
                      />
                      <button
                        type="button"
                        className="form-field__eye-btn"
                        onClick={() => setSpinqShowPassword((v) => !v)}
                        aria-label={spinqShowPassword ? 'Hide password' : 'Show password'}
                      >
                        {spinqShowPassword ? (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={spinqSaving || !spinqIp || !spinqPort || !spinqUsername}
                  >
                    {spinqSaving ? 'Saving…' : 'Save Configuration'}
                  </button>
                </form>
              </div>
            </>
          )}

          {/* ======================== GITHUB TAB ======================== */}
          {activeTab === 'github' && (
            <>
              {ghMessage && (
                <div className={`alert alert--${ghMessage.type}`} role="alert">
                  {ghMessage.text}
                </div>
              )}

              <div className="settings-panel">
                <div className="settings-panel__header">
                  <div className="settings-panel__title-row">
                    <h2 className="settings-panel__title">GitHub Integration</h2>
                    {ghStatus && !ghStatus.enabled && (
                      <span className="settings-badge settings-badge--disabled">
                        Server disabled
                      </span>
                    )}
                  </div>
                  <p className="settings-panel__desc">
                    Connect your GitHub account to push circuits to repositories and import code
                    from your projects.
                  </p>
                </div>

                {ghLoading && (
                  <div className="settings-panel__loading">
                    <span className="settings-spinner" aria-hidden="true" />
                    Loading GitHub status…
                  </div>
                )}

                {!ghLoading && ghStatus && !ghStatus.enabled && (
                  <div className="settings-panel__body">
                    <div className="alert alert--warning" role="alert">
                      GitHub integration is not currently enabled on this server.
                    </div>
                  </div>
                )}

                {!ghLoading && ghStatus?.connected && (
                  <div className="settings-connection-card">
                    <div className="github-profile">
                      {ghStatus.avatarUrl && (
                        <img
                          className="github-profile__avatar"
                          src={ghStatus.avatarUrl}
                          alt={`${ghStatus.username}'s GitHub avatar`}
                          width={48}
                          height={48}
                        />
                      )}
                      <div className="github-profile__info">
                        <div className="github-profile__name-row">
                          <span
                            className="settings-status-dot settings-status--valid"
                            aria-hidden="true"
                          />
                          <strong className="github-profile__username">
                            {ghStatus.name || ghStatus.username}
                          </strong>
                        </div>
                        {ghStatus.username && ghStatus.name && (
                          <span className="github-profile__handle">@{ghStatus.username}</span>
                        )}
                        <a
                          className="github-profile__link"
                          href={ghStatus.profileUrl || `https://github.com/${ghStatus.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View GitHub Profile ↗
                        </a>
                      </div>
                    </div>
                    <div className="settings-meta-grid" style={{ marginTop: 16 }}>
                      <span className="settings-meta-grid__label">Connected since</span>
                      <span className="settings-meta-grid__value">
                        {formatDate(ghStatus.linkedAt || null)}
                      </span>
                    </div>
                  </div>
                )}

                {!ghLoading && ghStatus?.enabled && !ghStatus.connected && (
                  <div className="github-connect-section">
                    <div className="github-connect-section__body">
                      <div className="github-connect-section__icon" aria-hidden="true">
                        <svg width="40" height="40" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                        </svg>
                      </div>
                      <h3 className="github-connect-section__title">Connect Your GitHub Account</h3>
                      <p className="github-connect-section__desc">
                        Authorize Quantum Studio to access your repositories. This lets you push
                        circuit code (.py, .qasm) directly from the IDE and import files from your
                        projects.
                      </p>
                      <ul className="github-connect-section__features">
                        <li>Push Qiskit & OpenQASM code to any repository</li>
                        <li>Import circuit files directly into the IDE</li>
                        <li>Version control your quantum experiments</li>
                      </ul>
                      <button
                        type="button"
                        className="btn btn--github"
                        onClick={handleConnectGitHub}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          style={{ marginRight: 8 }}
                        >
                          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                        </svg>
                        Connect with GitHub
                      </button>
                    </div>
                  </div>
                )}

                {!ghLoading && ghStatus?.connected && (
                  <div className="settings-danger-zone">
                    <p className="settings-danger-zone__label">Danger Zone</p>
                    <div className="settings-danger-zone__row">
                      <div className="settings-danger-zone__text">
                        <p className="settings-danger-zone__name">Disconnect GitHub</p>
                        <p className="settings-danger-zone__desc">
                          Removes the connection to your GitHub account. You won't be able to push
                          code or import files until you reconnect.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={handleDisconnectGitHub}
                        disabled={ghDisconnecting}
                      >
                        {ghDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
