import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Gift,
  Share2,
  UserCheck,
  Users,
} from 'lucide-react';
import { BusinessSettings, Client } from '../types/business';
import { getCustomerReferralCode } from '../utils/calculations';

interface ReferEarnViewProps {
  loggedInCustomer: Client | null;
  settings?: BusinessSettings;
  onBackToShop: () => void;
  onRequestSignIn: () => void;
}

export const ReferEarnView: React.FC<ReferEarnViewProps> = ({
  loggedInCustomer,
  settings,
  onBackToShop,
  onRequestSignIn,
}) => {
  const [copied, setCopied] = useState(false);
  const [shareNote, setShareNote] = useState('');

  const businessName = settings?.businessName || 'Glamour Galleria';

  const referralCode = useMemo(() => {
    if (!loggedInCustomer) return '';
    return getCustomerReferralCode(loggedInCustomer);
  }, [loggedInCustomer]);

  const referralUrl = useMemo(() => {
    if (!referralCode || typeof window === 'undefined') return '';
    return `${window.location.origin}${window.location.pathname}?ref=${encodeURIComponent(
      referralCode
    )}`;
  }, [referralCode]);

  const whatsappShareUrl = useMemo(() => {
    if (!referralUrl) return '';
    const message = [
      `Hey! Shop boutique styles, cosmetics & perfumes at *${businessName}*!`,
      `Use my personal referral link to join & shop:`,
      referralUrl,
      `Referral Code: *${referralCode}*`,
    ].join('\n');
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [businessName, referralCode, referralUrl]);

  const handleCopyLink = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setShareNote('Referral link copied to clipboard!');
      setTimeout(() => {
        setCopied(false);
        setShareNote('');
      }, 2400);
    } catch {
      setShareNote('Please copy the referral link manually.');
    }
  };

  const handleSocialShare = async () => {
    if (!referralUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join ${businessName}`,
          text: `Shop at ${businessName} with my referral code ${referralCode}!`,
          url: referralUrl,
        });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
    await handleCopyLink();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToShop}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Shop</span>
        </button>
      </div>

      <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-b border-[#F4ECF8] pb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#DB2777] to-[#7E22CE] flex items-center justify-center text-white shrink-0">
            <Gift className="w-7 h-7" />
          </div>
          <div>
            <h1 className="font-display-serif text-2xl sm:text-3xl font-bold text-[#1F122B]">
              Refer &amp; Earn
            </h1>
            <p className="text-xs sm:text-sm text-[#6B5B7B] mt-0.5">
              Invite friends and family to {businessName} using your unique referral link.
            </p>
          </div>
        </div>

        {!loggedInCustomer ? (
          <div className="rounded-2xl border border-[#F2E6F7] bg-[#FDF9FE] p-6 text-center space-y-4">
            <Users className="w-10 h-10 text-[#9333EA] mx-auto" />
            <div className="space-y-1">
              <h2 className="text-base font-bold text-[#1F122B]">
                Sign In to Unlock Your Unique Referral Link
              </h2>
              <p className="text-xs text-[#6B5B7B] max-w-md mx-auto">
                Sign in or create your customer account to generate your personal referral link and share it directly on WhatsApp or social media.
              </p>
            </div>
            <button
              type="button"
              onClick={onRequestSignIn}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-95 cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>Sign In / Create Account</span>
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl border border-[#E9D5FF] bg-gradient-to-br from-[#FDF2F8] via-white to-[#F5F3FF] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-[#5B4B6B]">
                  Your Personal Referral Code
                </div>
                <span className="font-mono-num text-sm font-bold text-[#7E22CE] tracking-wider">
                  {referralCode}
                </span>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#4A3B59]">
                  Your Unique Referral Link
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={referralUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2.5 text-xs sm:text-sm font-mono-num text-[#1F122B] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:opacity-95 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Copied Link</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {shareNote && (
                <div className="text-xs font-semibold text-[#15803D]">{shareNote}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <a
                  href={whatsappShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-2.5 text-xs sm:text-sm font-bold text-[#15803D] hover:bg-[#DCFCE7] transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share on WhatsApp</span>
                </a>

                <button
                  type="button"
                  onClick={handleSocialShare}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D8B4FE] bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-[#6D28D9] hover:border-[#9333EA] transition-colors cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share via Social / Apps</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDFBFE] p-4 space-y-1">
                <div className="font-bold text-[#1F122B]">01. Copy Your Link</div>
                <p className="text-[#6B5B7B]">
                  Tap Copy Link or Share on WhatsApp to send your personal invite.
                </p>
              </div>
              <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDFBFE] p-4 space-y-1">
                <div className="font-bold text-[#1F122B]">02. Friends Shop</div>
                <p className="text-[#6B5B7B]">
                  Your friends browse collections and sign in using your link.
                </p>
              </div>
              <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDFBFE] p-4 space-y-1">
                <div className="font-bold text-[#1F122B]">03. Earn Rewards</div>
                <p className="text-[#6B5B7B]">
                  Get exclusive referral perks and priority offers on future orders.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
