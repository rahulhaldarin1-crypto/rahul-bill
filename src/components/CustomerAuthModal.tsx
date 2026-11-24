import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Phone, UserCheck, X } from 'lucide-react';
import { signInWithGoogleWithFallback } from '../firebase';
import { Client } from '../types/business';
import { api, formatApiError } from '../utils/api';
import {
  normalizeIndianPhone,
  stripPlus91Prefix,
  validateEnglishName,
} from '../utils/calculations';
import { uploadMediaToCloudinary } from '../utils/cloudinary';
import { CustomerAvatar } from './CustomerAvatar';

export interface GoogleOnboardingSeed {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  existingMobile?: string;
}

interface CustomerAuthModalProps {
  open: boolean;
  noticeBanner?: string;
  initialOnboardingUser?: GoogleOnboardingSeed | null;
  onClose: () => void;
  onSuccess: (client: Client) => void;
}

export const CustomerAuthModal: React.FC<CustomerAuthModalProps> = ({
  open,
  noticeBanner = '',
  initialOnboardingUser = null,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<'signin' | 'onboarding'>('signin');
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [submittingProfile, setSubmittingProfile] = useState(false);

  // Google user pending onboarding
  const [googleUid, setGoogleUid] = useState('');
  const [googleEmail, setGoogleEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (initialOnboardingUser) {
      setGoogleUid(initialOnboardingUser.uid);
      setGoogleEmail(initialOnboardingUser.email);
      setFullName(
        initialOnboardingUser.displayName
          .replace(/[^A-Za-z .'-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );
      setMobile(stripPlus91Prefix(initialOnboardingUser.existingMobile || ''));
      setProfilePhoto(initialOnboardingUser.photoURL || '');
      setStep('onboarding');
    } else {
      setStep('signin');
    }
  }, [open, initialOnboardingUser]);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    setError('');
    setSigningIn(true);
    try {
      try {
        sessionStorage.setItem('gg_google_auth_intent', 'customer');
      } catch {
        // ignore storage errors
      }
      const result = await signInWithGoogleWithFallback();
      if (result.redirected || !result.user) {
        return;
      }
      try {
        sessionStorage.removeItem('gg_google_auth_intent');
      } catch {
        // ignore storage errors
      }
      const user = result.user;
      const resolved = await api.resolveGoogleCustomerAccount({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      });

      if (!resolved.needsOnboarding && resolved.client) {
        onSuccess(resolved.client);
        return;
      }

      const rawDisplayName = String(
        resolved.client?.name || user.displayName || ''
      )
        .replace(/[^A-Za-z .'-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      setGoogleUid(user.uid);
      setGoogleEmail(String(user.email || '').trim().toLowerCase());
      setFullName(rawDisplayName);
      setMobile(stripPlus91Prefix(resolved.client?.mobile || ''));
      setProfilePhoto(
        resolved.client?.profilePhotoDataUrl || user.photoURL || ''
      );
      setStep('onboarding');
    } catch (err: unknown) {
      try {
        sessionStorage.removeItem('gg_google_auth_intent');
      } catch {
        // ignore storage errors
      }
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
          formatApiError(err, 'Could not complete Google Sign-In. Please try again.')
        );
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploadingPhoto(true);
    setUploadProgress(1);
    try {
      const record = await uploadMediaToCloudinary(file, {
        role: 'customer',
        appSource: 'glamour-galleria',
        folder: 'glamour-galleria/customer/avatars',
        relatedEntityType: 'customer_avatar',
        allowedTypes: ['image'],
        onProgress: (pct) => setUploadProgress(pct),
      });
      setProfilePhoto(record.secureUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not upload profile photo. Please pick a valid JPG, PNG, or WEBP file.'
      );
    } finally {
      setUploadingPhoto(false);
      setUploadProgress(null);
    }
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const nameCheck = validateEnglishName(fullName, 'Full Name');
    if (!nameCheck.valid) {
      setError(nameCheck.error || 'Please enter your full name in English.');
      return;
    }

    const phoneCheck = normalizeIndianPhone(mobile);
    if (!phoneCheck.valid) {
      setError(
        phoneCheck.error || 'Please enter a valid 10-digit Indian mobile number.'
      );
      return;
    }

    setSubmittingProfile(true);
    try {
      let referredBy = '';
      try {
        const urlRef = new URLSearchParams(window.location.search).get('ref') || '';
        const storedRef = localStorage.getItem('gg_referred_by_v1') || '';
        referredBy = (urlRef || storedRef).trim();
      } catch {
        // ignore storage errors
      }

      const client = await api.completeGoogleCustomerOnboarding({
        uid: googleUid,
        email: googleEmail,
        name: nameCheck.cleaned,
        mobile: phoneCheck.formatted,
        profilePhotoDataUrl: profilePhoto,
        referredBy,
      });
      onSuccess(client);
    } catch (err) {
      setError(formatApiError(err, 'Could not save your profile details.'));
    } finally {
      setSubmittingProfile(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-auth-title"
    >
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl border border-[#EFE2F5] bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-[#F4ECF8] px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <h2
              id="customer-auth-title"
              className="font-display-serif text-lg font-bold text-[#1F122B]"
            >
              {step === 'signin' ? 'Sign In to Glamour Galleria' : 'Complete Your Profile'}
            </h2>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              {step === 'signin'
                ? 'Continue seamlessly with your Google account.'
                : 'Quick one-time setup — confirm your name, mobile number, and optional photo.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {noticeBanner && (
            <div className="rounded-xl border border-[#E9D5FF] bg-[#FAF5FF] px-3.5 py-2.5 text-xs font-semibold text-[#6D28D9]">
              {noticeBanner}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
              {error}
            </div>
          )}

          {step === 'signin' ? (
            <div className="space-y-4 py-2">
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
                <span>
                  {signingIn ? 'Signing in with Google...' : 'Sign in with Google'}
                </span>
              </button>

              <p className="text-[11px] text-center text-[#6B5B7B] leading-relaxed">
                New customers complete a 10-second profile setup with just Name, Mobile Number, and an optional Profile Photo. Returning customers go straight into their account.
              </p>
            </div>
          ) : (
            <form onSubmit={handleCompleteOnboarding} noValidate className="space-y-4">
              {googleEmail && (
                <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3.5 py-2 text-xs font-semibold text-[#15803D] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">Google verified: {googleEmail}</span>
                </div>
              )}

              {/* 1. Optional Profile Photo Upload (pre-filled with Google photo) */}
              <div className="flex items-center gap-3.5 rounded-2xl border border-[#F4ECF8] bg-[#FDF9FC] p-3">
                <CustomerAvatar
                  photoDataUrl={profilePhoto}
                  name={fullName}
                  size={56}
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs font-semibold text-[#1F122B]">
                    Profile Photo
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8B4FE] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer">
                      <Camera className="w-3 h-3" />
                      <span>
                        {uploadingPhoto
                          ? `Uploading${uploadProgress !== null ? ` ${uploadProgress}%` : ''}...`
                          : profilePhoto
                            ? 'Change Photo'
                            : 'Upload Photo'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingPhoto}
                        onChange={handlePhotoUpload}
                        className="sr-only"
                      />
                    </label>
                    {profilePhoto && (
                      <button
                        type="button"
                        onClick={() => setProfilePhoto('')}
                        className="text-[11px] font-semibold text-[#BE123C] hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Full Name */}
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Full Name (in English) <span className="text-[#DB2777]">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name in English (e.g. Priya Sharma)"
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                />
              </div>

              {/* 3. Mobile Number */}
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Mobile Number <span className="text-[#DB2777]">*</span>
                </label>
                <div className="flex items-stretch rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] overflow-hidden focus-within:border-[#9333EA] focus-within:bg-white">
                  <span className="inline-flex items-center gap-1 px-3 bg-[#F6EFFA] border-r border-[#E6D9EE] text-xs font-mono-num font-bold text-[#6D28D9] select-none shrink-0">
                    <Phone className="w-3.5 h-3.5 text-[#9333EA]" />
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="9876543210"
                    className="w-full bg-transparent px-3 py-2.5 text-sm font-mono-num text-[#1F122B] focus:outline-none"
                  />
                </div>
              </div>

              <p className="text-[11px] text-[#6B5B7B]">
                No address needed right now — you can save your delivery address later in your Account or during checkout.
              </p>

              <button
                type="submit"
                disabled={submittingProfile || uploadingPhoto}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-2.5 px-4 text-xs sm:text-sm font-bold text-white hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-60"
              >
                <UserCheck className="w-4 h-4" />
                <span>
                  {submittingProfile
                    ? 'Saving Profile...'
                    : 'Save Profile & Continue'}
                </span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
