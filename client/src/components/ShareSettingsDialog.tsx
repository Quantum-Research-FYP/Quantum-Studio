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
  initialVisibility: Visibility;
  onClose: () => void;
}

type OpStatus = 'idle' | 'loading' | 'success' | 'error';

interface StatusMsg {
  type: 'success' | 'error' | 'info';
  text: string;
}

// ---------------------------------------------------------------------------
// Visibility option config
// ---------------------------------------------------------------------------

const VIS_OPTIONS: Array<{
  value: Visibility;
  icon: string;
  title: string;
  desc: string;
}> = [
  {
    value: 'private',
    icon: '🔒',
    title: 'Private',
    desc: 'Only you can view this experiment.',
  },
  {
    value: 'unlisted',
    icon: '🔗',
    title: 'Unlisted',
    desc: 'Anyone with the link can view (read-only).',
  },
  {
    value: 'public',
    icon: '🌐',
    title: 'Public',
    desc: 'Discoverable by anyone on the platform.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ShareSettingsDialog({
  open,
  experimentId,
  experimentName,
  initialVisibility,
  onClose,
}: ShareSettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [opStatus, setOpStatus] = useState<OpStatus>('idle');
  const [statusMsg, setStatusMsg] = useState<StatusMsg | null>(null);
  const [publicDisabled, setPublicDisabled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  // Clear "Copied!" after 2 s
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  // Dismiss confirm-rotate when visibility changes
  useEffect(() => {
    setConfirmRotate(false);
  }, [visibility]);

  // ── Fetch existing share link (called on open when unlisted) ──────────

  const fetchShareLink = useCallback(async () => {
    setOpStatus('loading');
    try {
      const result = await getShareLink(experimentId);
      setHasToken(result.hasToken);
      if (result.shareUrl) setShareUrl(result.shareUrl);
      setOpStatus('idle');
    } catch {
      setOpStatus('idle');
    }
  }, [experimentId]);

  // ── Open / close ──────────────────────────────────────────────────────

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      // Reset to known state
      setVisibility(initialVisibility);
      setShareUrl(null);
      setHasToken(false);
      setOpStatus('idle');
      setStatusMsg(null);
      setCopied(false);
      setConfirmRotate(false);
      dialog.showModal();

      // If already unlisted, load the existing token
      if (initialVisibility === 'unlisted') {
        fetchShareLink();
      }
    } else {
      dialog.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, experimentId]);

  // Escape key
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

  // ── Visibility change ─────────────────────────────────────────────────

  const handleVisibilityChange = useCallback(
    async (next: Visibility) => {
      if (next === visibility || opStatus === 'loading') return;

      const prev = visibility;
      setVisibility(next);
      setOpStatus('loading');
      setStatusMsg(null);
      setCopied(false);

      try {
        await updateVisibility(experimentId, next);

        if (prev === 'unlisted' && next !== 'unlisted') {
          setShareUrl(null);
          setHasToken(false);
          setStatusMsg({
            type: 'info',
            text: 'Visibility updated. The previous share link has been invalidated.',
          });
        } else {
          setStatusMsg({ type: 'success', text: 'Visibility updated.' });
        }

        setOpStatus('success');

        if (next === 'unlisted') {
          await fetchShareLink();
        }
      } catch (err) {
        const apiErr = err as Error & { errorCode?: string };
        if (apiErr.errorCode === 'PUBLIC_SHARING_DISABLED') {
          setPublicDisabled(true);
          setVisibility(prev);
          setStatusMsg({
            type: 'error',
            text: 'Public sharing is not enabled on this server.',
          });
        } else {
          setVisibility(prev);
          setStatusMsg({
            type: 'error',
            text: apiErr.message || 'Failed to update visibility.',
          });
        }
        setOpStatus('error');
      }
    },
    [experimentId, visibility, opStatus, fetchShareLink],
  );

  // ── Rotate ────────────────────────────────────────────────────────────

  const handleRotate = useCallback(async () => {
    if (!confirmRotate && hasToken) {
      setConfirmRotate(true);
      return;
    }
    setConfirmRotate(false);
    setOpStatus('loading');
    setStatusMsg(null);
    setCopied(false);
    try {
      const result = await rotateShareToken(experimentId);
      setShareUrl(result.shareUrl);
      setHasToken(true);
      setStatusMsg({
        type: 'info',
        text: 'Share link rotated. The old link no longer works.',
      });
      setOpStatus('success');
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to rotate token.',
      });
      setOpStatus('error');
    }
  }, [experimentId, confirmRotate, hasToken]);

  // ── Revoke ────────────────────────────────────────────────────────────

  const handleRevoke = useCallback(async () => {
    setOpStatus('loading');
    setStatusMsg(null);
    setCopied(false);
    setConfirmRotate(false);
    try {
      await revokeShareToken(experimentId);
      setShareUrl(null);
      setHasToken(false);
      setStatusMsg({ type: 'info', text: 'Share link revoked.' });
      setOpStatus('success');
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to revoke token.',
      });
      setOpStatus('error');
    }
  }, [experimentId]);

  // ── Copy ──────────────────────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
  }, [shareUrl]);

  // ── Render ────────────────────────────────────────────────────────────

  const isLoading = opStatus === 'loading';

  return (
    <dialog ref={dialogRef} className="dialog share-dialog" aria-labelledby="share-dialog-title">
      {/* Header */}
      <div className="share-dialog__header">
        <div>
          <h2 id="share-dialog-title" className="share-dialog__title">
            Share Experiment
          </h2>
          <p className="share-dialog__subtitle" title={experimentName}>
            {experimentName}
          </p>
        </div>
        <button
          type="button"
          className="share-dialog__close"
          onClick={onClose}
          aria-label="Close share settings"
          disabled={isLoading}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="share-dialog__body">
        {/* Status message */}
        {statusMsg && (
          <div className={`share-dialog__status share-dialog__status--${statusMsg.type}`} role="status" aria-live="polite">
            {statusMsg.text}
          </div>
        )}

        {/* Visibility cards */}
        <p className="share-dialog__section-label">Who can access this experiment?</p>
        <div className="vis-options" role="group" aria-label="Visibility">
          {VIS_OPTIONS.map((opt) => {
            const disabled = (opt.value === 'public' && publicDisabled) || isLoading;
            const selected = visibility === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={[
                  'vis-option',
                  selected ? 'vis-option--selected' : '',
                  disabled ? 'vis-option--disabled' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleVisibilityChange(opt.value)}
                disabled={disabled}
                aria-pressed={selected}
              >
                <span className="vis-option__icon" aria-hidden="true">{opt.icon}</span>
                <span className="vis-option__body">
                  <span className="vis-option__title">{opt.title}</span>
                  <span className="vis-option__desc">
                    {opt.value === 'public' && publicDisabled
                      ? 'Not enabled on this server.'
                      : opt.desc}
                  </span>
                </span>
                {selected && (
                  <span className="vis-option__check" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Share link section — only for unlisted */}
        {visibility === 'unlisted' && (
          <div className="share-link-section">
            <p className="share-dialog__section-label">Share link</p>

            {isLoading && !shareUrl ? (
              <div className="share-link-section__loading">
                <span className="settings-spinner" aria-hidden="true" />
                Generating share link…
              </div>
            ) : shareUrl ? (
              <>
                <div className="share-link-box">
                  <input
                    type="text"
                    className="share-link-box__input"
                    value={shareUrl}
                    readOnly
                    aria-label="Share URL"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    className={`share-link-box__copy ${copied ? 'share-link-box__copy--done' : ''}`}
                    onClick={handleCopy}
                    disabled={isLoading}
                    aria-label={copied ? 'Copied' : 'Copy link'}
                  >
                    {copied ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                {/* Token management */}
                <div className="share-link-actions">
                  {confirmRotate ? (
                    <div className="share-link-actions__confirm">
                      <span className="share-link-actions__confirm-text">
                        This will invalidate the current link. Continue?
                      </span>
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={handleRotate}
                        disabled={isLoading}
                      >
                        Rotate
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setConfirmRotate(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={handleRotate}
                        disabled={isLoading}
                      >
                        Rotate link
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm btn--danger-text"
                        onClick={handleRevoke}
                        disabled={isLoading}
                      >
                        Revoke link
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              /* hasToken but no shareUrl returned yet */
              <div className="share-link-section__no-url">
                <p className="share-link-section__note">
                  A share token exists but the link couldn't be loaded. Rotate to generate a fresh link.
                </p>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleRotate}
                  disabled={isLoading}
                >
                  Generate new link
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="share-dialog__footer">
        <button
          type="button"
          className="btn btn--primary"
          onClick={onClose}
          disabled={isLoading}
        >
          Done
        </button>
      </div>
    </dialog>
  );
}
