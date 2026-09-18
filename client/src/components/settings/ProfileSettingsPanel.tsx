import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword, deleteAccount, updateProfile } from '../../api/auth';
import { useAuth } from '../../hooks/useAuth';

type Message = { type: 'success' | 'error'; text: string } | null;

export default function ProfileSettingsPanel() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [profileMessage, setProfileMessage] = useState<Message>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<Message>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteMessage, setDeleteMessage] = useState<Message>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => setName(user?.name ?? ''), [user?.name]);

  if (!user) return null;

  const initials = (user.name || user.email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Not available';
  const signInMethod = user.providers.length
    ? user.providers.join(', ')
    : user.hasPassword
      ? 'Email and password'
      : 'Single sign-on';

  async function handleProfileSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileMessage(null);
    try {
      await updateProfile(name.trim());
      await refreshUser();
      setProfileMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch (error) {
      setProfileMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to update profile.',
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPasswordMessage(null);
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage({ type: 'success', text: 'Password changed successfully.' });
    } catch (error) {
      setPasswordMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to change password.',
      });
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm('Permanently delete your account and all of its data?')) return;
    setDeletingAccount(true);
    setDeleteMessage(null);
    try {
      await deleteAccount(deletePassword, deleteConfirmation);
      try {
        await logout();
      } catch {
        // The server already removed the session during account deletion.
      }
      navigate('/login', { replace: true });
    } catch (error) {
      setDeleteMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to delete account.',
      });
      setDeletingAccount(false);
    }
  }

  return (
    <div className="settings-profile-stack">
      <div className="settings-panel">
        <div className="settings-panel__header settings-profile-header">
          <div className="settings-profile-avatar" aria-hidden="true">{initials}</div>
          <div>
            <h2 className="settings-panel__title">Personal information</h2>
            <p className="settings-panel__desc">Manage the details associated with your account.</p>
          </div>
        </div>

        {profileMessage && <div className={`alert alert--${profileMessage.type}`} role="alert">{profileMessage.text}</div>}

        <form className="settings-token-form" onSubmit={handleProfileSubmit}>
          <div className="form-field">
            <label className="form-field__label" htmlFor="profile-name">Name</label>
            <input
              id="profile-name"
              className="form-field__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              placeholder="Enter your name"
              autoComplete="name"
              required
            />
          </div>
          <div className="form-field">
            <label className="form-field__label" htmlFor="profile-email">Email address</label>
            <input id="profile-email" className="form-field__input" value={user.email} readOnly />
            <p className="form-field__hint">Your sign-in email cannot currently be changed.</p>
          </div>
          <button className="btn btn--primary" type="submit" disabled={savingProfile || !name.trim() || name.trim() === user.name}>
            {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        <div className="settings-panel__body settings-account-details">
          <div><span>Member since</span><strong>{memberSince}</strong></div>
          <div><span>Sign-in method</span><strong>{signInMethod}</strong></div>
        </div>
      </div>

      <details className="settings-panel settings-collapsible">
        <summary className="settings-panel__header settings-collapsible__summary">
          <span>
            <span className="settings-panel__title">Change password</span>
            <span className="settings-panel__desc">Use a strong password with at least 12 characters.</span>
          </span>
          <span className="settings-collapsible__chevron" aria-hidden="true">⌄</span>
        </summary>
        {passwordMessage && <div className={`alert alert--${passwordMessage.type}`} role="alert">{passwordMessage.text}</div>}
        {user.hasPassword ? (
          <form className="settings-token-form settings-password-grid" onSubmit={handlePasswordSubmit}>
            <div className="form-field settings-password-current">
              <label className="form-field__label" htmlFor="current-password">Current password</label>
              <input id="current-password" className="form-field__input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="new-password">New password</label>
              <input id="new-password" className="form-field__input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={12} required />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="confirm-password">Confirm new password</label>
              <input id="confirm-password" className="form-field__input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} required />
            </div>
            <button className="btn btn--primary settings-password-submit" type="submit" disabled={changingPassword || !currentPassword || newPassword.length < 12 || newPassword !== confirmPassword}>
              {changingPassword ? 'Updating…' : 'Update password'}
            </button>
          </form>
        ) : (
          <div className="settings-panel__body">
            <div className="alert alert--warning">Your password is managed by {signInMethod}.</div>
          </div>
        )}
      </details>

      <details className="settings-panel settings-collapsible settings-collapsible--danger">
        <summary className="settings-danger-zone settings-collapsible__summary">
          <span>
            <span className="settings-danger-zone__label">Danger Zone</span>
            <span className="settings-danger-zone__name">Delete account</span>
            <span className="settings-danger-zone__desc">Permanently deletes your profile and all account data.</span>
          </span>
          <span className="settings-collapsible__chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="settings-danger-zone settings-delete-content">
          <p className="settings-danger-zone__desc">This deletes your experiments, runs, integrations, and saved results. This action cannot be undone.</p>
          {deleteMessage && <div className={`alert alert--${deleteMessage.type}`} role="alert">{deleteMessage.text}</div>}
          <div className="settings-delete-fields">
            {user.hasPassword && (
              <div className="form-field">
                <label className="form-field__label" htmlFor="delete-password">Current password</label>
                <input id="delete-password" className="form-field__input" type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} autoComplete="current-password" />
              </div>
            )}
            <div className="form-field">
              <label className="form-field__label" htmlFor="delete-confirmation">Type DELETE to confirm</label>
              <input id="delete-confirmation" className="form-field__input" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" />
            </div>
            <button type="button" className="btn btn--danger" onClick={handleDeleteAccount} disabled={deletingAccount || deleteConfirmation !== 'DELETE' || (user.hasPassword && !deletePassword)}>
              {deletingAccount ? 'Deleting…' : 'Delete account'}
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
