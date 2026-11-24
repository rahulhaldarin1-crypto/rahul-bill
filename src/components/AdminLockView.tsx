import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { auth, signInWithGoogleWithFallback, signOut } from '../firebase';
import { BusinessSettings } from '../types/business';
import { isAuthorizedAdminEmail } from '../utils/calculations';
import { AppBackground } from './AppBackground';
import { BrandLogo } from './BrandLogo';

interface AdminLockViewProps {
  settings: BusinessSettings;
  deniedMessage?: string;
  onClearDeniedMessage?: () => void;
  onUnlock: () => void;
}

export const AdminLockView: React.FC<AdminLockViewProps> = ({
  settings,
  deniedMessage = '',
  onClearDeniedMessage,
  onUnlock,
}) => {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (deniedMessage) {
      setError(deniedMessage);
    }
  }, [deniedMessage]);

  const handleGoogleSignIn = async () => {
    setError('');
    onClearDeniedMessage?.();
    setSigningIn(true);
    try {
      const result = await signInWithGoogleWithFallback();
      if (result.redirected || !result.user) {
        return;
      }

      if (!isAuthorizedAdminEmail(result.user.email)) {
        await signOut(auth).catch(() => undefined);
        setError('Access Denied: Unauthorized Admin Account');
        return;
      }

      onUnlock();
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        setError('Google sign-in was cancelled. Please try again.');
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not complete Google Sign-In. Please try again.'
        );
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 text-[#1F122B]">
      <AppBackground backgroundImageDataUrl={settings.backgroundImageDataUrl} />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <BrandLogo
            logoDataUrl={settings.logoDataUrl}
            businessName={settings.businessName}
            size={64}
          />
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#7E22CE] mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#DB2777]" />
              <span>Admin Portal</span>
            </div>
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B]">
              {settings.businessName || 'Glamour Galleria'}
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-1">
              Sign in with an authorized Admin Google account to access billing, orders, inventory, and Smart Offers Mail.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-3 text-xs font-semibold text-[#BE123C] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            disabled={signingIn}
            onClick={handleGoogleSignIn}
            className="w-full inline-flex items-center justify-center gap-3 rounded-xl border border-[#E6D9EE] bg-white hover:bg-[#FDF9FC] hover:border-[#9333EA] py-3 px-5 text-sm font-bold text-[#1F122B] shadow-xs transition-all cursor-pointer disabled:opacity-60"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>{signingIn ? 'Signing in with Google...' : 'Sign in with Google'}</span>
          </button>

          <p className="text-[11px] text-center text-[#6B5B7B] leading-relaxed">
            Restricted strictly to verified Admin Google accounts. Unauthorized accounts are signed out automatically.
          </p>
        </div>
      </div>
    </div>
  );
};
