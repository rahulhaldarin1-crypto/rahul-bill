import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Image as ImageIcon,
  QrCode,
  ShieldCheck,
  Sparkles,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import {
  AdminPaymentSettings,
  BusinessSettings,
  Client,
  DeliverySubscription,
} from '../types/business';
import { api, formatApiError } from '../utils/api';
import {
  buildUpiDeepLink,
  formatCurrency,
  resolveEffectivePaymentDetails,
  SUBSCRIPTION_DURATION_DAYS,
  SUBSCRIPTION_PLAN_PRICE,
} from '../utils/calculations';
import { getOptimizedMediaUrl, uploadMediaToCloudinary } from '../utils/cloudinary';

interface SubscriptionPurchaseModalProps {
  open: boolean;
  client: Client | null;
  settings?: BusinessSettings;
  paymentSettings?: AdminPaymentSettings;
  onClose: () => void;
  onSuccess: (subscription: DeliverySubscription) => void;
}

export const SubscriptionPurchaseModal: React.FC<SubscriptionPurchaseModalProps> = ({
  open,
  client,
  settings,
  paymentSettings,
  onClose,
  onSuccess,
}) => {
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [upiCopied, setUpiCopied] = useState(false);
  const [error, setError] = useState('');

  const payDetails = useMemo(
    () =>
      resolveEffectivePaymentDetails({
        adminPaymentSettings: paymentSettings,
        settings,
      }),
    [paymentSettings, settings]
  );

  const upiLink = useMemo(() => {
    if (!payDetails.upiId) return '';
    return buildUpiDeepLink(
      payDetails.upiId,
      payDetails.recipientName || 'Glamour Galleria',
      SUBSCRIPTION_PLAN_PRICE
    );
  }, [payDetails]);

  if (!open || !client) return null;

  const sym = settings?.currencySymbol || '₹';

  const handleCopyUpi = async () => {
    if (!payDetails.upiId) return;
    try {
      await navigator.clipboard.writeText(payDetails.upiId);
      setUpiCopied(true);
      setTimeout(() => setUpiCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleUploadScreenshot = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploading(true);
    setUploadProgress(1);
    try {
      const record = await uploadMediaToCloudinary(file, {
        role: 'customer',
        appSource: 'glamour-galleria',
        folder: 'glamour-galleria/customer/subscription-payments',
        relatedEntityType: 'subscription_payment',
        relatedEntityId: client.id,
        uploadedByUid: client.id,
        allowedTypes: ['image'],
        onProgress: (pct) => setUploadProgress(pct),
      });
      setScreenshotUrl(record.secureUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to upload payment screenshot. Please choose a valid image.'
      );
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!screenshotUrl) {
      setError(
        'Please complete the ₹99 online payment and upload your payment screenshot before submitting.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.createDeliverySubscription({
        userId: client.id,
        userName: client.name,
        userPhone: client.mobile || client.whatsapp || '',
        userEmail: client.email,
        paymentScreenshotUrl: screenshotUrl,
        transactionId: transactionId.trim() || undefined,
        upiIdUsed: payDetails.upiId || undefined,
      });
      setScreenshotUrl('');
      setTransactionId('');
      onSuccess(created);
    } catch (err) {
      setError(
        formatApiError(
          err,
          'Could not submit subscription request. Please try again.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-[75] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="₹99 Free Delivery Subscription Checkout"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl border border-[#EFE2F5] bg-white shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
      >
        <div className="bg-gradient-to-r from-[#7E22CE] via-[#9333EA] to-[#DB2777] px-5 py-4 text-white flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              <Sparkles className="w-3 h-3" />
              <span>Online Payment Only · COD Disabled</span>
            </div>
            <h2 className="font-display-serif text-lg sm:text-xl font-bold leading-snug">
              {formatCurrency(SUBSCRIPTION_PLAN_PRICE, sym)} /{' '}
              {SUBSCRIPTION_DURATION_DAYS} Days Free Delivery Pass
            </h2>
            <p className="text-xs text-white/90">
              ফ্রি ডেলিভারি পাস — ২8 দিনের জন্য সকল যোগ্য অর্ডারে ₹0 ডেলিভারি চার্জ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close subscription modal"
            className="p-1.5 rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-5 space-y-4 overflow-y-auto flex-1"
        >
          {error && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-[#92400E]">
            <CreditCard className="w-4 h-4 shrink-0 mt-0.5 text-[#B45309]" />
            <div>
              <strong>Cash on Delivery (COD) is disabled</strong> for subscriptions. Pay{' '}
              <strong className="font-mono-num">
                {formatCurrency(SUBSCRIPTION_PLAN_PRICE, sym)}
              </strong>{' '}
              online below and upload your screenshot proof.
            </div>
          </div>

          {/* Admin Online Payment Details */}
          <div className="rounded-2xl border border-[#E9D5FF] bg-[#FDF9FF] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#6D28D9]">
                <QrCode className="w-3.5 h-3.5" />
                <span>Pay {formatCurrency(SUBSCRIPTION_PLAN_PRICE, sym)} Online</span>
              </span>
              <span className="text-[11px] font-semibold text-[#5B4B6B]">
                {payDetails.recipientName || 'Glamour Galleria'}
              </span>
            </div>

            {payDetails.upiId && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#EFE2F5] bg-white px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-[#6B5B7B] uppercase">
                    Official UPI ID
                  </div>
                  <div className="font-mono-num text-xs sm:text-sm font-bold text-[#1F122B] truncate">
                    {payDetails.upiId}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E6D9EE] bg-[#FDFBFE] px-2.5 py-1.5 text-[11px] font-semibold text-[#5B4B6B] hover:border-[#9333EA] cursor-pointer"
                  >
                    {upiCopied ? (
                      <>
                        <Check className="w-3 h-3 text-[#15803D]" />
                        <span className="text-[#15803D]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  {upiLink && (
                    <a
                      href={upiLink}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#7E22CE] px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-95"
                    >
                      <span>Pay ₹{SUBSCRIPTION_PLAN_PRICE}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {payDetails.qrDataUrl && (
              <div className="flex flex-col items-center gap-1.5 rounded-xl border border-[#EFE2F5] bg-white p-3">
                <img
                  src={getOptimizedMediaUrl(payDetails.qrDataUrl, 'image')}
                  alt="Online Payment QR Code"
                  referrerPolicy="no-referrer"
                  className="w-36 h-36 max-w-full object-contain rounded-lg border border-[#F4ECF8]"
                />
                <span className="text-[11px] text-[#6B5B7B]">
                  Scan QR using GPay / PhonePe / Paytm &amp; pay ₹{SUBSCRIPTION_PLAN_PRICE}
                </span>
              </div>
            )}

            {payDetails.bankAccountNo && (
              <div className="rounded-xl border border-[#EFE2F5] bg-white p-3 text-[11px] text-[#4A3B59] space-y-0.5">
                <div className="font-bold text-[#1F122B]">Bank Transfer Details</div>
                {payDetails.bankAccountName && (
                  <div>Account Name: {payDetails.bankAccountName}</div>
                )}
                {payDetails.bankName && <div>Bank: {payDetails.bankName}</div>}
                <div className="font-mono-num">
                  Account No: {payDetails.bankAccountNo}
                </div>
                {payDetails.bankIfscBranch && (
                  <div className="font-mono-num">
                    IFSC / Branch: {payDetails.bankIfscBranch}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mandatory Screenshot Upload */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#1F122B]">
              Upload Payment Screenshot Proof <span className="text-[#DB2777]">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2.5 text-xs font-bold text-white hover:opacity-95 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {uploading
                    ? `Uploading${uploadProgress !== null ? ` ${uploadProgress}%` : ''}...`
                    : screenshotUrl
                      ? 'Replace Screenshot'
                      : 'Upload Payment Screenshot'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading || submitting}
                  onChange={handleUploadScreenshot}
                  className="sr-only"
                />
              </label>
              {screenshotUrl && (
                <button
                  type="button"
                  onClick={() => setScreenshotUrl('')}
                  className="text-xs font-semibold text-[#BE123C] hover:underline cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>

            {screenshotUrl ? (
              <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-2.5 flex items-center gap-3">
                <img
                  src={getOptimizedMediaUrl(screenshotUrl, 'image')}
                  alt="Uploaded subscription payment proof"
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 max-w-full rounded-lg object-cover border border-[#EFE2F5] shrink-0"
                />
                <div className="text-xs text-[#15803D] font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Screenshot uploaded successfully! Ready to submit.</span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#D8B4FE] bg-[#FDF9FE] px-3.5 py-2.5 text-[11px] text-[#6B5B7B] flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#9333EA] shrink-0" />
                <span>
                  Payment screenshot is required for Admin verification.
                </span>
              </div>
            )}
          </div>

          {/* Optional Transaction / UTR ID */}
          <div>
            <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
              Transaction / UTR ID (Optional)
            </label>
            <input
              type="text"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="e.g. 432910582910 or UPI Ref No"
              className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-xs font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
            />
          </div>

          {/* Terms & Rules */}
          <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] p-3.5 space-y-1.5 text-[11px] text-[#5B4B6B]">
            <div className="font-bold text-[#1F122B] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#7E22CE]" />
              <span>Subscription Terms &amp; Rules (নিয়মাবলী)</span>
            </div>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                Valid for <strong>28 days</strong> from Admin activation/approval (অ্যাপ্রুভালের দিন থেকে ২৮ দিন মেয়াদ)।
              </li>
              <li>
                Enjoy <strong>₹0 delivery fee</strong> on all eligible orders during the active period।
              </li>
              <li>
                Only Online Payment + Payment Screenshot Proof is accepted (ক্যাশ অন ডেলিভারি প্রযোজ্য নয়)।
              </li>
              <li>
                Subscription fee (₹99) is non-refundable and expires automatically after 28 days।
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#E6D9EE] bg-white px-4 py-2.5 text-xs font-semibold text-[#5B4B6B] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploading || !screenshotUrl}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-50"
            >
              <Truck className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Submitting...'
                  : `Submit ₹${SUBSCRIPTION_PLAN_PRICE} Subscription`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
