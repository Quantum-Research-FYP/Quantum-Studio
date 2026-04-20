import { useRef, useEffect, useState, useCallback } from 'react';
import type { Visibility } from '../api/sharing';
import {
  updateVisibility,
  getShareLink,
  rotateShareToken,
  revokeShareToken,
} from '../api/sharing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShareSettingsDialogProps {
  open: boolean;
  experimentId: string;
  experimentName: string;
  onClose: () => void;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ShareSettingsDialog({
  open,
  experimentId,
  experimentName,
  onClose,
}: ShareSettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [visibility, setVisibility] = useState<Visibility>('private');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [publicDisabled, setPublicDisabled] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      setVisibility('private');
      setShareUrl(null);
      setHasToken(false);
      setStatus('idle');
      setStatusMessage(null);
      setCopied(false);
      dialog.showModal();

      // Load current visibility
      loadVisibility();
    } else {
      dialog.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, experimentId]);

  // Handle native dialog cancel (Escape key)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };

    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  // Clear "Copied!" after a delay
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const loadVisibility = useCallback(async () => {
    // We don't have a dedicated "get visibility" endpoint, but we can
    // attempt to get the share link to discover current state. For simplicity,
    // we'll set visibility to private initially and let the user change it.
    // The getShareLink endpoint returns an error if not unlisted, so we rely
    // on the visibility PATCH response to reflect truth.
    setStatus('idle');
  }, []);

  // ── Share link ────────────────────────────────────────────────────────

  const fetchShareLink = useCallback(async () => {
    setStatus('loading');
    try {
      const result = await getShareLink(experimentId);
      setHasToken(result.hasToken);
      if (result.shareUrl) {
        setShareUrl(result.shareUrl);
      }
      setStatus('idle');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to get share link.');
      setStatus('error');
    }
  }, [experimentId]);

  // ── Visibility change ─────────────────────────────────────────────────

  const handleVisibilityChange = useCallback(
    async (newVisibility: Visibility) => {
      const previousVisibility = visibility;
      setVisibility(newVisibility);
      setStatus('loading');
      setStatusMessage(null);
      setCopied(false);

      try {
        await updateVisibility(experimentId, newVisibility);

        // Clear share URL when moving away from unlisted
        if (previousVisibility === 'unlisted' && newVisibility !== 'unlisted') {
          setShareUrl(null);
          setHasToken(false);
          setStatusMessage('Visibility updated. Previous share link has been invalidated.');
        } else {
          setStatusMessage('Visibility updated.');
        }

        setStatus('success');

        // Auto-fetch share link when switching to unlisted
        if (newVisibility === 'unlisted') {
          await fetchShareLink();
        }
      } catch (err) {
        const apiErr = err as Error & { errorCode?: string };
        if (apiErr.errorCode === 'PUBLIC_SHARING_DISABLED') {
          setPublicDisabled(true);
          setVisibility(previousVisibility);
          setStatusMessage('Public sharing is not enabled on this server.');
        } else {
          setVisibility(previousVisibility);
          setStatusMessage(apiErr.message || 'Failed to update visibility.');
        }
        setStatus('error');
      }
    },
    [experimentId, visibility, fetchShareLink],
  );

  // ── Rotate ────────────────────────────────────────────────────────────

  const handleRotate = useCallback(async () => {
    setStatus('loading');
    setStatusMessage(null);
    setCopied(false);
    try {
      const result = await rotateShareToken(experimentId);
      setShareUrl(result.shareUrl);
      setHasToken(true);
      setStatusMessage('Share link rotated. The previous link no longer works.');
      setStatus('success');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to rotate token.');
      setStatus('error');
    }
  }, [experimentId]);

  // ── Revoke ────────────────────────────────────────────────────────────

  const handleRevoke = useCallback(async () => {
    setStatus('loading');
    setStatusMessage(null);
    setCopied(false);
    try {
      await revokeShareToken(experimentId);
      setShareUrl(null);
      setHasToken(false);
      setStatusMessage('Share link revoked.');
      setStatus('success');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to revoke token.');
      setStatus('error');
    }
  }, [experimentId]);

  // ── Copy to clipboard ─────────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // Fallback for non-HTTPS / older browsers
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
    }
  }, [shareUrl]);

  // ── Render ────────────────────────────────────────────────────────────

  const isLoading = status === 'loading';

  return (
    <dialog ref={dialogRef} className="dialog" aria-labelledby="share-dialog-title">
      <div className="dialog__content share-settings">
        <h2 id="share-dialog-title" className="dialog__title">
          Share: {experimentName}
        </h2>

        {/* Visibility selector */}
        <fieldset className="share-settings__fieldset" disabled={isLoading}>
          <legend className="share-settings__legend">Visibility</legend>

          <label className="share-settings__option">
            <input
              type="radio"
              name="visibility"
              value="private"
              checked={visibility === 'private'}
              onChange={() => handleVisibilityChange('private')}
            />
            <span className="share-settings__option-content">
              <strong>Private</strong>
              <span className="share-settings__option-desc">Only you can access this experiment</span>
            </span>
          </label>

          <label className="share-settings__option">
            <input
              type="radio"
              name="visibility"
              value="unlisted"
              checked={visibility === 'unlisted'}
              onChange={() => handleVisibilityChange('unlisted')}
            />
            <span className="share-settings__option-content">
              <strong>Unlisted</strong>
              <span className="share-settings__option-desc">
                Anyone with the link can view (read-only)
              </span>
            </span>
          </label>

          <label
            className={`share-settings__option${publicDisabled ? ' share-settings__option--disabled' : ''}`}
          >
            <input
              type="radio"
              name="visibility"
              value="public"
              checked={visibility === 'public'}
              onChange={() => handleVisibilityChange('public')}
              disabled={publicDisabled}
            />
            <span className="share-settings__option-content">
              <strong>Public</strong>
              <span className="share-settings__option-desc">
                Anyone can discover and view this experiment
              </span>
              {publicDisabled && (
                <span className="share-settings__option-note">
                  Public sharing is not enabled on this server
                </span>
              )}
            </span>
          </label>
        </fieldset>

        {/* Share link section (unlisted only) */}
        {visibility === 'unlisted' && (
          <div className="share-settings__link-section">
            <h3 className="share-settings__subtitle">Share Link</h3>

            {shareUrl ? (
              <div className="share-settings__url-row">
                <input
                  type="text"
                  className="form-field__input share-settings__url-input"
                  value={shareUrl}
                  readOnly
                  aria-label="Share URL"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={handleCopy}
                  disabled={isLoading}
                  aria-live="polite"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ) : hasToken ? (
              <p className="share-settings__note">
                A share link exists. Click Rotate to generate a new link you can copy.
              </p>
            ) : (
              <p className="share-settings__note">
                Generating share link...
              </p>
            )}

            <div className="share-settings__token-actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={handleRotate}
                disabled={isLoading}
              >
                {hasToken ? 'Rotate Link' : 'Generate Link'}
              </button>
              {hasToken && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm btn--danger-text"
                  onClick={handleRevoke}
                  disabled={isLoading}
                >
                  Revoke Link
                </button>
              )}
            </div>
          </div>
        )}

        {/* Status message */}
        {statusMessage && (
          <p
            className={`share-settings__status share-settings__status--${status}`}
            role="status"
            aria-live="polite"
          >
            {statusMessage}
          </p>
        )}

        {/* Close button */}
        <div className="dialog__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onClose}
            disabled={isLoading}
          >
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
