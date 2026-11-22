import React, { useEffect, useState } from 'react';
import {
  Camera,
  Eye,
  EyeOff,
  Lock,
  MessageCircle,
  Phone,
  UserPlus,
  X,
} from 'lucide-react';
import { Client } from '../types/business';
import { api, formatApiError } from '../utils/api';
import {
  buildForgotPasswordWhatsAppUrl,
  normalizeIndianPhone,
  resizeImageFileToDataUrl,
} from '../utils/calculations';
import { sanitizeNumericInput } from '../utils/numberInput';
import { CustomerAvatar } from './CustomerAvatar';

interface CustomerAuthModalProps {
  open: boolean;
  initialMode?: 'login' | 'register';
  noticeBanner?: string;
  onClose: () => void;
  onSuccess: (client: Client) => void;
}

export const CustomerAuthModal: React.FC<CustomerAuthModalProps> = ({
  open,
  initialMode = 'login',
  noticeBanner = '',
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Login state
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Registration state
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regCity, setRegCity] = useState('');
  const [regState, setRegState] = useState('');
  const [regPinCode, setRegPinCode] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regPhoto, setRegPhoto] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError('');
    }
  }, [open, initialMode]);

  if (!open) return null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploadingPhoto(true);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 240, {
        quality: 0.78,
        preserveTransparency: false,
        maxDataUrlLength: 48_000,
      });
      setRegPhoto(dataUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not process profile photo. Please pick a JPG or PNG.'
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const phoneCheck = normalizeIndianPhone(loginPhone);
    if (!phoneCheck.valid) {
      setError(phoneCheck.error || 'Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!loginPassword.trim()) {
      setError('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.loginCustomerAccount(
        phoneCheck.formatted,
        loginPassword
      );
      onSuccess(res.client);
    } catch (err) {
      setError(formatApiError(err, 'Invalid phone number or password.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!regName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    const phoneCheck = normalizeIndianPhone(regPhone);
    if (!phoneCheck.valid) {
      setError(phoneCheck.error || 'Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!regAddress.trim()) {
      setError('Please enter your full delivery address.');
      return;
    }
    if (regPassword.trim().length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.registerCustomerAccount({
        name: regName.trim(),
        phone: phoneCheck.formatted,
        address: regAddress.trim(),
        city: regCity.trim(),
        state: regState.trim(),
        pinCode: regPinCode.trim(),
        password: regPassword.trim(),
        profilePhotoDataUrl: regPhoto,
      });
      onSuccess(res.client);
    } catch (err) {
      setError(
        formatApiError(err, 'Could not create your customer account.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const forgotPasswordUrl = buildForgotPasswordWhatsAppUrl(loginPhone);

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
              {mode === 'login' ? 'Customer Sign In' : 'Create Customer Account'}
            </h2>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              {mode === 'login'
                ? 'Access your cart, track orders, and download bills.'
                : 'Register once for faster checkout and order tracking.'}
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

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F8F3FB] border border-[#EFE2F5]">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`rounded-lg py-2 text-xs font-bold transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                  : 'text-[#5B4B6B] hover:text-[#1F122B]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`rounded-lg py-2 text-xs font-bold transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                  : 'text-[#5B4B6B] hover:text-[#1F122B]'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
              {error}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} noValidate className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Phone Number <span className="text-[#DB2777]">*</span>
                </label>
                <div className="flex items-stretch rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] overflow-hidden focus-within:border-[#9333EA] focus-within:bg-white">
                  <span className="inline-flex items-center gap-1 px-3 bg-[#F6EFFA] border-r border-[#E6D9EE] text-xs font-mono-num font-bold text-[#6D28D9] select-none shrink-0">
                    <Phone className="w-3.5 h-3.5 text-[#9333EA]" />
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoFocus
                    required
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full bg-transparent px-3 py-2.5 text-sm font-mono-num text-[#1F122B] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-semibold text-[#4A3B59]">
                    Password <span className="text-[#DB2777]">*</span>
                  </label>
                  <a
                    href={forgotPasswordUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7E22CE] hover:text-[#DB2777] hover:underline"
                  >
                    <MessageCircle className="w-3 h-3" />
                    <span>Forgot Password?</span>
                  </a>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your account password"
                    className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-10 pr-10 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    aria-label={
                      showLoginPassword ? 'Hide password' : 'Show password'
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B5B7B] hover:text-[#7E22CE] cursor-pointer"
                  >
                    {showLoginPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-2.5 px-4 text-xs sm:text-sm font-bold text-white hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Signing In...' : 'Sign In'}
              </button>

              <div className="rounded-xl border border-[#F4ECF8] bg-[#FDF9FC] p-3 text-[11px] text-[#5B4B6B] flex items-center justify-between gap-2">
                <span>Need help resetting your password?</span>
                <a
                  href={forgotPasswordUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[#15803D] hover:underline whitespace-nowrap shrink-0"
                >
                  WhatsApp Support
                </a>
              </div>
            </form>
          ) : (
            <form
              onSubmit={handleRegisterSubmit}
              noValidate
              className="space-y-3.5"
            >
              {/* Optional Profile Picture */}
              <div className="flex items-center gap-3.5 rounded-2xl border border-[#F4ECF8] bg-[#FDF9FC] p-3">
                <CustomerAvatar
                  photoDataUrl={regPhoto}
                  name={regName}
                  size={52}
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs font-semibold text-[#1F122B]">
                    Profile Photo (Optional)
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8B4FE] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer">
                      <Camera className="w-3 h-3" />
                      <span>
                        {uploadingPhoto
                          ? 'Compressing...'
                          : regPhoto
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
                    {regPhoto && (
                      <button
                        type="button"
                        onClick={() => setRegPhoto('')}
                        className="text-[11px] font-semibold text-[#BE123C] hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Full Name <span className="text-[#DB2777]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Phone Number <span className="text-[#DB2777]">*</span>
                </label>
                <div className="flex items-stretch rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] overflow-hidden focus-within:border-[#9333EA] focus-within:bg-white">
                  <span className="inline-flex items-center px-3 bg-[#F6EFFA] border-r border-[#E6D9EE] text-xs font-mono-num font-bold text-[#6D28D9] select-none shrink-0">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full bg-transparent px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Full Delivery Address <span className="text-[#DB2777]">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={regAddress}
                  onChange={(e) => setRegAddress(e.target.value)}
                  placeholder="House/Flat No, Street, Area, Landmark..."
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[#4A3B59] mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={regCity}
                    onChange={(e) => setRegCity(e.target.value)}
                    placeholder="City"
                    className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-2.5 py-1.5 text-xs text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#4A3B59] mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    value={regState}
                    onChange={(e) => setRegState(e.target.value)}
                    placeholder="State"
                    className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-2.5 py-1.5 text-xs text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#4A3B59] mb-1">
                    PIN Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={regPinCode}
                    onChange={(e) =>
                      setRegPinCode(
                        sanitizeNumericInput(e.target.value, {
                          allowDecimal: false,
                        })
                      )
                    }
                    placeholder="PIN"
                    className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-2.5 py-1.5 text-xs font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Create Password <span className="text-[#DB2777]">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    minLength={4}
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Minimum 4 characters"
                    className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-10 pr-10 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword((prev) => !prev)}
                    aria-label={
                      showRegPassword ? 'Hide password' : 'Show password'
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B5B7B] hover:text-[#7E22CE] cursor-pointer"
                  >
                    {showRegPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || uploadingPhoto}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-2.5 px-4 text-xs sm:text-sm font-bold text-white hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-60"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {submitting ? 'Creating Account...' : 'Create Account & Continue'}
                </span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
