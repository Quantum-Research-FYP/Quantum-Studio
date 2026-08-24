import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * SsoCallbackPage
 *
 * Handles the final step of the cross-domain SSO handoff:
 *   1. Google / GitHub redirects the browser to /auth/callback?token=<one-time-token>
 *   2. This page POSTs (GET) the token to /api/auth/session/exchange via the Vercel proxy.
 *   3. The server validates the token and sets the `sid` session cookie
 *      — this works because the request goes through the Vercel proxy, so the
 *      cookie domain matches what future API calls will use.
 *   4. We refresh the auth context and navigate to the app.
 */
export default function SsoCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const token = searchParams.get('token');
    if (!token) {
      navigate('/login?error=sso_missing_token', { replace: true });
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/auth/session/exchange?token=${encodeURIComponent(token)}`, {
          credentials: 'include',
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error || 'Session exchange failed');
        }

        // Refresh the auth context so the rest of the app knows we are logged in
        await refreshUser();
        navigate('/', { replace: true });
      } catch (err) {
        console.error('SSO session exchange error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    })();
  }, [searchParams, navigate, refreshUser]);

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 16,
          background: 'var(--color-bg-primary, #0a0a0f)',
          color: 'var(--color-text-primary, #fff)',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <p style={{ color: '#f87171', fontSize: 16 }}>⚠ {error}</p>
        <button
          onClick={() => navigate('/login', { replace: true })}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: 'none',
            background: '#8b5cf6',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 16,
        background: 'var(--color-bg-primary, #0a0a0f)',
        color: 'var(--color-text-secondary, #a0a0b0)',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: '3px solid rgba(139, 92, 246, 0.2)',
          borderTopColor: '#8b5cf6',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ fontSize: 14 }}>Completing sign-in…</p>
    </div>
  );
}
