import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { BusinessSettings } from '../types/business';
import { verifyAdminPasscode } from '../utils/adminAuth';
import { api, formatApiError } from '../utils/api';
import { ADMIN_OTP_EMAIL, isAdminOtpWindowValid } from '../utils/calculations';
import { AppBackground } from './AppBackground';
import { BrandLogo } from './BrandLogo';
import { EmailOtpBox } from './EmailOtpBox';

interface AdminLockViewProps {
  settings: BusinessSettings;
  onUnlock: () => void;
  onAdminOtpRecorded?: (verifiedAt: string) => void;
}

export const AdminLockView: React.FC<AdminLockViewProps> = ({
  settings,
  onUnlock,
  onAdminOtpRecorded,
}) => {
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpStepRequired, setOtpStepRequired] = useState(false);
  const [verifiedOtpId, setVerifiedOtpId] = useState('');
  const [finalizingOtp, setFinalizingOtp] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setError('Please enter the admin password.');
      return;
    }

    setVerifying(true);
    setError('');
    try {
      const valid = await verifyAdminPasscode(passcode);
      if (!valid) {
        setError('Incorrect password. Please try again.');
        return;
      }
      setPasscode('');

      if (isAdminOtpWindowValid(settings.lastAdminOtpVerifiedAt)) {
        onUnlock();
      } else {
        setVerifiedOtpId('');
        setOtpStepRequired(true);
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleOtpVerified = async (result: { otpId: string; email: string }) => {
    setVerifiedOtpId(result.otpId);
    setFinalizingOtp(true);
    setError('');
    try {
      const res = await api.recordAdminOtpVerified(result.otpId);
      onAdminOtpRecorded?.(res.verifiedAt);
      setOtpStepRequired(false);
      onUnlock();
    } catch (err) {
      setVerifiedOtpId('');
      setError(
        formatApiError(err, 'Could not complete Admin OTP verification.')
      );
    } finally {
      setFinalizingOtp(false);
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
              {otpStepRequired
                ? '24-hour security check: verify the 6-digit OTP sent to your admin Gmail.'
                : 'Enter your admin password to access billing, orders, inventory, and client records.'}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
            {error}
          </div>
        )}

        {otpStepRequired ? (
          <div className="space-y-4">
            <EmailOtpBox
              purpose="admin_login"
              email={ADMIN_OTP_EMAIL}
              lockedEmail={ADMIN_OTP_EMAIL}
              label="Admin Verification Gmail (24-Hour Security Check)"
              helperText={`6-digit OTP will ALWAYS be sent to ${ADMIN_OTP_EMAIL}. Once verified, password-only sign-in works for 24 hours.`}
              verifiedOtpId={verifiedOtpId}
              onVerified={handleOtpVerified}
              onResetVerification={() => setVerifiedOtpId('')}
              disabled={finalizingOtp}
            />

            <button
              type="button"
              disabled={finalizingOtp}
              onClick={() => {
                setOtpStepRequired(false);
                setVerifiedOtpId('');
                setError('');
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6D28D9] hover:underline cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Admin Password</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1.5">
                Admin Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPasscode ? 'text' : 'password'}
                  autoFocus
                  autoComplete="current-password"
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Enter admin password"
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-10 pr-10 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((prev) => !prev)}
                  aria-label={showPasscode ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B5B7B] hover:text-[#7E22CE] cursor-pointer"
                >
                  {showPasscode ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={verifying}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-2.5 px-5 text-sm font-semibold text-white hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-60"
            >
              <Lock className="w-4 h-4" />
              <span>{verifying ? 'Verifying...' : 'Unlock Admin Panel'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
