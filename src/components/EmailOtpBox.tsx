import React, { useEffect, useState } from 'react';
import { CheckCircle2, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { EmailOtpPurpose } from '../types/business';
import { api, formatApiError } from '../utils/api';
import { OTP_RESEND_COOLDOWN_SEC, validateGmailAddress } from '../utils/calculations';
import { sanitizeNumericInput } from '../utils/numberInput';

interface EmailOtpBoxProps {
  purpose: EmailOtpPurpose;
  email: string;
  onEmailChange?: (nextEmail: string) => void;
  lockedEmail?: string;
  label?: string;
  helperText?: string;
  verifiedOtpId: string;
  onVerified: (result: { otpId: string; email: string }) => void;
  onResetVerification: () => void;
  disabled?: boolean;
}

export const EmailOtpBox: React.FC<EmailOtpBoxProps> = ({
  purpose,
  email,
  onEmailChange,
  lockedEmail,
  label = 'Gmail Address for 6-Digit OTP Verification',
  helperText,
  verifiedOtpId,
  onVerified,
  onResetVerification,
  disabled = false,
}) => {
  const effectiveEmail = (lockedEmail ?? email).trim().toLowerCase();
  const isVerified = Boolean(verifiedOtpId);

  const [otpId, setOtpId] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [otpSentEmail, setOtpSentEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [localError, setLocalError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSec]);

  const handleEmailInputChange = (val: string) => {
    onEmailChange?.(val);
    setLocalError('');
    setStatusMessage('');
    if (isVerified || otpId) {
      setOtpId('');
      setChallengeToken('');
      setOtpSentEmail('');
      setOtpCode('');
      onResetVerification();
    }
  };

  const handleSendOtp = async () => {
    setLocalError('');
    setStatusMessage('');

    const targetEmail = lockedEmail
      ? lockedEmail.trim().toLowerCase()
      : effectiveEmail;

    if (!lockedEmail) {
      const check = validateGmailAddress(targetEmail);
      if (!check.valid) {
        setLocalError(
          check.error || 'Please enter a valid @gmail.com email address.'
        );
        return;
      }
    }

    setSending(true);
    try {
      const res = await api.sendEmailOtp(targetEmail, purpose);
      setOtpId(res.otpId);
      setChallengeToken(res.challengeToken);
      setOtpSentEmail(res.email);
      setOtpCode('');
      setCooldownSec(OTP_RESEND_COOLDOWN_SEC);
      setStatusMessage(
        `6-digit OTP sent to ${res.email}. Valid for 5 minutes.`
      );
      if (isVerified) {
        onResetVerification();
      }
    } catch (err) {
      const msg = formatApiError(err, 'Could not send Email OTP.');
      const waitMatch = msg.match(/Please wait (\d+)s/i);
      if (waitMatch) {
        const waitNum = parseInt(waitMatch[1], 10);
        if (Number.isFinite(waitNum) && waitNum > 0) {
          setCooldownSec(waitNum);
        }
      }
      setLocalError(msg);
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLocalError('');
    const targetEmail = lockedEmail
      ? lockedEmail.trim().toLowerCase()
      : otpSentEmail || effectiveEmail;

    if (!otpId || !challengeToken) {
      setLocalError('Please click Send OTP first.');
      return;
    }
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setLocalError('Please enter the 6-digit OTP sent to your Gmail.');
      return;
    }

    setVerifying(true);
    try {
      const res = await api.verifyEmailOtp({
        otpId,
        email: targetEmail,
        purpose,
        code: otpCode.trim(),
        challengeToken,
      });
      setStatusMessage(`Verified: ${res.email}`);
      onVerified({ otpId: res.otpId, email: res.email });
    } catch (err) {
      setLocalError(
        formatApiError(err, 'OTP verification failed. Please check the code.')
      );
    } finally {
      setVerifying(false);
    }
  };

  const hasPendingChallenge = Boolean(otpId && challengeToken);

  return (
    <div className="rounded-2xl border border-[#E6D9EE] bg-[#FAF5FC] p-3.5 space-y-3">
      <div>
        <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
          {label} <span className="text-[#DB2777]">*</span>
        </label>
        {helperText && (
          <p className="text-[11px] text-[#6B5B7B] mb-1.5">{helperText}</p>
        )}

        <div className="flex flex-col sm:flex-row items-stretch gap-2">
          <div className="relative flex-1 min-w-0">
            <Mail className="w-4 h-4 text-[#9333EA] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="email"
              required
              readOnly={Boolean(lockedEmail) || isVerified}
              disabled={disabled}
              value={lockedEmail ?? email}
              onChange={(e) => handleEmailInputChange(e.target.value)}
              placeholder="yourname@gmail.com"
              className={`w-full rounded-xl border border-[#E6D9EE] pl-9 pr-3 py-2 text-xs sm:text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none ${
                lockedEmail || isVerified
                  ? 'bg-[#F3EBF9] font-semibold text-[#4A3B59]'
                  : 'bg-white'
              }`}
            />
          </div>

          {!isVerified ? (
            !hasPendingChallenge ? (
              <button
                type="button"
                disabled={disabled || sending || cooldownSec > 0}
                onClick={handleSendOtp}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3.5 py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-55 whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {sending
                    ? 'Sending OTP...'
                    : cooldownSec > 0
                      ? `Send OTP (${cooldownSec}s)`
                      : 'Send OTP'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={disabled || sending || cooldownSec > 0}
                onClick={handleSendOtp}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3 py-2 text-xs font-bold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer disabled:opacity-55 whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  {sending
                    ? 'Sending...'
                    : cooldownSec > 0
                      ? `Resend OTP (${cooldownSec}s)`
                      : 'Resend OTP'}
                </span>
              </button>
            )
          ) : (
            <div className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2 text-xs font-bold text-[#15803D] whitespace-nowrap">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>OTP Verified</span>
            </div>
          )}
        </div>
      </div>

      {hasPendingChallenge && !isVerified && (
        <div className="space-y-2 pt-1 border-t border-[#EFE2F5]">
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              disabled={disabled || verifying}
              value={otpCode}
              onChange={(e) => {
                setLocalError('');
                setOtpCode(
                  sanitizeNumericInput(e.target.value, {
                    allowDecimal: false,
                  }).slice(0, 6)
                );
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleVerifyOtp();
                }
              }}
              placeholder="Enter 6-digit OTP"
              className="flex-1 rounded-xl border border-[#D8B4FE] bg-white px-3.5 py-2 text-sm font-mono-num tracking-[0.25em] text-[#1F122B] focus:border-[#7E22CE] focus:outline-none"
            />
            <button
              type="button"
              disabled={disabled || verifying || otpCode.trim().length !== 6}
              onClick={handleVerifyOtp}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#7E22CE] px-4 py-2 text-xs font-bold text-white hover:bg-[#6D28D9] cursor-pointer disabled:opacity-55 whitespace-nowrap"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{verifying ? 'Verifying...' : 'Verify OTP'}</span>
            </button>
          </div>
          {statusMessage && !localError && (
            <p className="text-[11px] font-medium text-[#6D28D9]">
              {statusMessage}
            </p>
          )}
        </div>
      )}

      {isVerified && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#15803D] font-medium">
          <span>
            Gmail verified ({otpSentEmail || effectiveEmail}).
          </span>
          {!lockedEmail && (
            <button
              type="button"
              onClick={() => {
                setOtpId('');
                setChallengeToken('');
                setOtpSentEmail('');
                setOtpCode('');
                setStatusMessage('');
                onResetVerification();
              }}
              className="font-bold text-[#6D28D9] hover:underline cursor-pointer"
            >
              Change Gmail
            </button>
          )}
        </div>
      )}

      {localError && (
        <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-[11px] font-medium text-[#BE123C]">
          {localError}
        </div>
      )}
    </div>
  );
};
