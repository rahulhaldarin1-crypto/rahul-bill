import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, Sparkles, User } from 'lucide-react';
import { UserAccount, WorkspaceData } from '../types/business';
import { api } from '../utils/api';
import { BrandLogo } from './BrandLogo';

interface AuthViewProps {
  onAuthenticated: (user: UserAccount, workspace: WorkspaceData) => void;
  embedded?: boolean;
}

export const AuthView: React.FC<AuthViewProps> = ({
  onAuthenticated,
  embedded = false,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountExistsError, setAccountExistsError] = useState(false);

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setError('');
    setAccountExistsError(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAccountExistsError(false);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    if (mode === 'register' && trimmedName.length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    if (mode === 'register') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await api.login({ email: trimmedEmail, password })
          : await api.register({ name: trimmedName, email: trimmedEmail, password });
      onAuthenticated(res.user, res.workspace);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Authentication failed. Please try again.';
      setError(message);
      if (mode === 'register' && message.toLowerCase().includes('already exists')) {
        setAccountExistsError(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const formCard = (
    <div className="w-full max-w-md rounded-3xl border border-[#EFE2F5] bg-white/90 backdrop-blur-md shadow-xl shadow-[#7E22CE]/10 p-6 sm:p-8 space-y-6">
      <div className="flex flex-col items-center text-center gap-2">
        <BrandLogo size={embedded ? 60 : 72} />
        <div>
          <h1 className="font-display-serif text-2xl sm:text-3xl font-bold text-[#1F122B]">
            Glamour Galleria
          </h1>
          <p className="text-xs font-medium text-[#9D174D] mt-0.5">
            Your Style, Our Priority
          </p>
        </div>
      </div>

      {/* Mode Switch Tabs */}
      <div className="grid grid-cols-2 rounded-2xl bg-[#F8F3FB] p-1 border border-[#EFE2F5]">
        <button
          type="button"
          onClick={() => switchMode('login')}
          className={`rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            mode === 'login'
              ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white shadow-xs'
              : 'text-[#6B5B7B] hover:text-[#1F122B]'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => switchMode('register')}
          className={`rounded-xl py-2.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            mode === 'register'
              ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white shadow-xs'
              : 'text-[#6B5B7B] hover:text-[#1F122B]'
          }`}
        >
          Create Account
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C] space-y-2">
          <div>{error}</div>
          {accountExistsError && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="inline-flex items-center rounded-lg bg-[#BE123C] px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-90 cursor-pointer"
            >
              Switch to Sign In now
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {mode === 'register' && (
          <div>
            <label className="block text-xs font-semibold text-[#4A3B59] mb-1.5">
              Full Name / Owner Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-10 pr-3.5 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-[#4A3B59] mb-1.5">
            Email Address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-10 pr-3.5 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#4A3B59] mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                mode === 'register' ? 'Minimum 6 characters' : 'Enter your password'
              }
              className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-10 pr-10 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B5B7B] hover:text-[#7E22CE] cursor-pointer"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {mode === 'register' && (
          <div>
            <label className="block text-xs font-semibold text-[#4A3B59] mb-1.5">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-10 pr-3.5 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-3 text-sm font-bold text-white hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-60"
        >
          <Sparkles className="w-4 h-4" />
          <span>
            {loading
              ? mode === 'login'
                ? 'Signing In...'
                : 'Creating Account...'
              : mode === 'login'
              ? 'Sign In to Workspace'
              : 'Create Business Account'}
          </span>
        </button>
      </form>
    </div>
  );

  if (embedded) {
    return <div className="flex justify-center py-2">{formCard}</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF5FA] via-[#FDF9FC] to-[#F4ECFF] flex items-center justify-center p-4">
      {formCard}
    </div>
  );
};
