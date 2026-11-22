import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  LifeBuoy,
  Package,
  Phone,
  ShieldAlert,
  Store,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import {
  Client,
  Product,
  SellerApplication,
} from '../types/business';
import { api, formatApiError } from '../utils/api';
import {
  phoneNumbersMatch,
  resizeImageFileToDataUrl,
  stripPlus91Prefix,
} from '../utils/calculations';
import { ProductsView } from './ProductsView';

const SELLER_APP_STORAGE_KEY = 'gg_seller_app_id_v1';

interface SellerHubViewProps {
  loggedInCustomer: Client | null;
  sellerApplications: SellerApplication[];
  products: Product[];
  currencySymbol: string;
  defaultLowStock: number;
  onBackToShop: () => void;
  onOpenHelpCenter: () => void;
  onRequestSignIn: () => void;
  onSaveProduct: (
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onApplicationSubmitted?: (app: SellerApplication) => void;
}

type DocFieldKey = 'sellerPhoto' | 'panDoc' | 'aadhaarDoc' | 'gstDoc' | 'bankDoc';

export const SellerHubView: React.FC<SellerHubViewProps> = ({
  loggedInCustomer,
  sellerApplications,
  products,
  currencySymbol,
  defaultLowStock,
  onBackToShop,
  onOpenHelpCenter,
  onRequestSignIn,
  onSaveProduct,
  onDeleteProduct,
  onApplicationSubmitted,
}) => {
  const [storedAppId, setStoredAppId] = useState<string>(() => {
    try {
      return localStorage.getItem(SELLER_APP_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupActivePhone, setLookupActivePhone] = useState('');
  const [editingRejected, setEditingRejected] = useState(false);

  // Registration Form State
  const [name, setName] = useState(() => loggedInCustomer?.name || '');
  const [fullAddress, setFullAddress] = useState(() => {
    if (!loggedInCustomer) return '';
    return [
      loggedInCustomer.address,
      loggedInCustomer.city,
      loggedInCustomer.state,
      loggedInCustomer.pinCode,
    ]
      .filter(Boolean)
      .join(', ');
  });
  const [phone, setPhone] = useState(() =>
    loggedInCustomer ? stripPlus91Prefix(loggedInCustomer.mobile) : ''
  );
  const [panNumber, setPanNumber] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [bankAccountDetails, setBankAccountDetails] = useState('');

  const [sellerPhotoDataUrl, setSellerPhotoDataUrl] = useState('');
  const [panDocDataUrl, setPanDocDataUrl] = useState('');
  const [aadhaarDocDataUrl, setAadhaarDocDataUrl] = useState('');
  const [gstDocDataUrl, setGstDocDataUrl] = useState('');
  const [bankDocDataUrl, setBankDocDataUrl] = useState('');

  const [uploadingField, setUploadingField] = useState<DocFieldKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!loggedInCustomer) return;
    setName((prev) => prev || loggedInCustomer.name);
    setPhone((prev) => prev || stripPlus91Prefix(loggedInCustomer.mobile));
    setFullAddress((prev) => {
      if (prev) return prev;
      return [
        loggedInCustomer.address,
        loggedInCustomer.city,
        loggedInCustomer.state,
        loggedInCustomer.pinCode,
      ]
        .filter(Boolean)
        .join(', ');
    });
  }, [loggedInCustomer]);

  const currentApplication = useMemo(() => {
    if (loggedInCustomer) {
      const byClient = sellerApplications.find(
        (app) =>
          app.clientId === loggedInCustomer.id ||
          phoneNumbersMatch(app.phone, loggedInCustomer.mobile)
      );
      if (byClient) return byClient;
    }
    if (lookupActivePhone) {
      const byLookup = sellerApplications.find((app) =>
        phoneNumbersMatch(app.phone, lookupActivePhone)
      );
      if (byLookup) return byLookup;
    }
    if (storedAppId) {
      const byStored = sellerApplications.find((app) => app.id === storedAppId);
      if (byStored) return byStored;
    }
    return null;
  }, [sellerApplications, loggedInCustomer, lookupActivePhone, storedAppId]);

  const sellerProducts = useMemo(() => {
    if (!currentApplication) return [];
    return products.filter((p) => p.sellerId === currentApplication.id);
  }, [products, currentApplication]);

  const handleUploadDoc = async (
    field: DocFieldKey,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploadingField(field);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 420, {
        quality: 0.72,
        preserveTransparency: false,
        maxDataUrlLength: 65_000,
      });
      if (field === 'sellerPhoto') setSellerPhotoDataUrl(dataUrl);
      if (field === 'panDoc') setPanDocDataUrl(dataUrl);
      if (field === 'aadhaarDoc') setAadhaarDocDataUrl(dataUrl);
      if (field === 'gstDoc') setGstDocDataUrl(dataUrl);
      if (field === 'bankDoc') setBankDocDataUrl(dataUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not process selected document image. Please use JPG or PNG.'
      );
    } finally {
      setUploadingField(null);
    }
  };

  const handleStartReapply = () => {
    if (!currentApplication) return;
    setName(currentApplication.name);
    setFullAddress(currentApplication.fullAddress);
    setPhone(stripPlus91Prefix(currentApplication.phone));
    setPanNumber(currentApplication.panNumber);
    setAadhaarNumber(currentApplication.aadhaarNumber);
    setGstNumber(currentApplication.gstNumber || '');
    setBankAccountDetails(currentApplication.bankAccountDetails || '');
    setSellerPhotoDataUrl(currentApplication.sellerPhotoDataUrl);
    setPanDocDataUrl(currentApplication.panDocDataUrl);
    setAadhaarDocDataUrl(currentApplication.aadhaarDocDataUrl);
    setGstDocDataUrl(currentApplication.gstDocDataUrl || '');
    setBankDocDataUrl(currentApplication.bankDocDataUrl);
    setError('');
    setSuccessMsg('');
    setEditingRejected(true);
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      const saved = await api.submitSellerApplication({
        existingId: editingRejected ? currentApplication?.id : undefined,
        clientId: loggedInCustomer?.id,
        name,
        fullAddress,
        phone,
        panNumber,
        aadhaarNumber,
        gstNumber,
        sellerPhotoDataUrl,
        panDocDataUrl,
        aadhaarDocDataUrl,
        gstDocDataUrl,
        bankDocDataUrl,
        bankAccountDetails,
      });
      try {
        localStorage.setItem(SELLER_APP_STORAGE_KEY, saved.id);
      } catch {
        // ignore storage errors
      }
      setStoredAppId(saved.id);
      setEditingRejected(false);
      setSuccessMsg(
        'Seller application submitted! Our Admin team is reviewing your documents.'
      );
      onApplicationSubmitted?.(saved);
    } catch (err) {
      setError(
        formatApiError(err, 'Could not submit seller application. Please check your details.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckPhoneStatus = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = lookupPhone.trim();
    if (!trimmed) return;
    setLookupActivePhone(trimmed);
  };

  const inputClass =
    'w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none';

  const renderDocUploader = (
    field: DocFieldKey,
    label: string,
    hint: string,
    value: string,
    onClear: () => void,
    required = true
  ) => (
    <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FE] p-3.5 space-y-2.5 flex flex-col justify-between">
      <div>
        <div className="text-xs font-bold text-[#1F122B]">
          {label} {required && <span className="text-[#DB2777]">*</span>}
        </div>
        <div className="text-[11px] text-[#6B5B7B] mt-0.5">{hint}</div>
      </div>

      {value ? (
        <div className="relative rounded-xl border border-[#E6D9EE] bg-white overflow-hidden h-32 flex items-center justify-center">
          <img
            src={value}
            alt={label}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={onClear}
            aria-label={`Remove ${label}`}
            className="absolute top-1.5 right-1.5 rounded-full bg-black/70 p-1 text-white hover:bg-[#BE123C] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <label className="rounded-xl border border-dashed border-[#D8B4FE] bg-white py-5 px-3 text-center flex flex-col items-center gap-1.5 hover:border-[#9333EA] transition-colors cursor-pointer">
          <Upload className="w-5 h-5 text-[#9333EA]" />
          <span className="text-xs font-semibold text-[#6D28D9]">
            {uploadingField === field ? 'Compressing...' : 'Upload Image'}
          </span>
          <span className="text-[10px] text-[#6B5B7B]">JPG / PNG photo</span>
          <input
            type="file"
            accept="image/*"
            disabled={uploadingField !== null}
            onChange={(e) => handleUploadDoc(field, e)}
            className="sr-only"
          />
        </label>
      )}
    </div>
  );

  // APPROVED SELLER DASHBOARD
  if (currentApplication && currentApplication.status === 'approved' && !editingRejected) {
    const approvedLiveCount = sellerProducts.filter(
      (p) => p.sellerApprovalStatus === 'approved'
    ).length;
    const pendingReviewCount = sellerProducts.filter(
      (p) => p.sellerApprovalStatus !== 'approved' && p.sellerApprovalStatus !== 'rejected'
    ).length;

    return (
      <div className="space-y-6">
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

        {/* Approved Seller Profile Banner */}
        <div className="rounded-3xl border border-[#DCFCE7] bg-white/95 backdrop-blur-md p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] overflow-hidden shrink-0 flex items-center justify-center">
              {currentApplication.sellerPhotoDataUrl ? (
                <img
                  src={currentApplication.sellerPhotoDataUrl}
                  alt={currentApplication.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Store className="w-7 h-7 text-[#15803D]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#15803D]">
                <BadgeCheck className="w-4 h-4 shrink-0" />
                <span>Approved Seller Account · Seller Hub (সেলার হাব)</span>
              </div>
              <h1 className="font-display-serif text-xl sm:text-2xl font-bold text-[#1F122B] truncate mt-0.5">
                {currentApplication.name}
              </h1>
              <div className="text-xs text-[#5B4B6B] font-mono-num mt-0.5">
                {currentApplication.phone} · PAN: {currentApplication.panNumber}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-5 border-t md:border-t-0 md:border-l border-[#EFE2F5] pt-3 md:pt-0 md:pl-5 shrink-0">
            <div>
              <div className="text-[11px] text-[#6B5B7B]">My Products</div>
              <div className="font-mono-num text-lg font-bold text-[#1F122B]">
                {sellerProducts.length}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#6B5B7B]">Live Approved</div>
              <div className="font-mono-num text-lg font-bold text-[#15803D]">
                {approvedLiveCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#6B5B7B]">Pending Review</div>
              <div className="font-mono-num text-lg font-bold text-[#B45309]">
                {pendingReviewCount}
              </div>
            </div>
          </div>
        </div>

        {/* Seller Product Management (reusing exact Admin Product Listing form & features) */}
        <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md">
          <ProductsView
            products={sellerProducts}
            currencySymbol={currencySymbol}
            defaultLowStock={defaultLowStock}
            hideBackButton
            sellerContext={{
              sellerId: currentApplication.id,
              sellerName: currentApplication.name,
              sellerPhone: currentApplication.phone,
            }}
            onBack={onBackToShop}
            onSaveProduct={onSaveProduct}
            onDeleteProduct={onDeleteProduct}
          />
        </div>
      </div>
    );
  }

  // PENDING / REJECTED / SUSPENDED APPLICATION STATUS VIEW
  if (currentApplication && !editingRejected) {
    const isPending = currentApplication.status === 'pending';
    const isRejected = currentApplication.status === 'rejected';
    const isSuspended = currentApplication.status === 'suspended';

    return (
      <div className="space-y-5 max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToShop}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Shop</span>
          </button>
          <span className="text-xs font-semibold text-[#7E22CE]">
            Seller Hub (সেলার হাব)
          </span>
        </div>

        {successMsg && (
          <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-xs font-semibold text-[#15803D] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-7 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#F4ECF8] pb-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl border border-[#E6D9EE] bg-[#FDF9FE] overflow-hidden shrink-0 flex items-center justify-center">
                {currentApplication.sellerPhotoDataUrl ? (
                  <img
                    src={currentApplication.sellerPhotoDataUrl}
                    alt={currentApplication.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Store className="w-7 h-7 text-[#9333EA]" />
                )}
              </div>
              <div>
                <h1 className="font-display-serif text-2xl font-bold text-[#1F122B]">
                  {currentApplication.name}
                </h1>
                <div className="text-xs text-[#6B5B7B] font-mono-num mt-0.5">
                  {currentApplication.phone} · Submitted {currentApplication.createdAt.slice(0, 10)}
                </div>
              </div>
            </div>

            <div
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold shrink-0 ${
                isPending
                  ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]'
                  : isRejected
                    ? 'border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C]'
                    : 'border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]'
              }`}
            >
              {isPending && <Clock className="w-4 h-4" />}
              {isRejected && <AlertTriangle className="w-4 h-4" />}
              {isSuspended && <ShieldAlert className="w-4 h-4" />}
              <span>
                {isPending
                  ? 'Application Pending Approval'
                  : isRejected
                    ? 'Application Rejected'
                    : 'Seller Account Suspended'}
              </span>
            </div>
          </div>

          {currentApplication.adminRemarks && (
            <div className="rounded-2xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs text-[#9F1239]">
              <strong>Admin Note:</strong> {currentApplication.adminRemarks}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <div className="text-[#6B5B7B]">PAN Number</div>
              <div className="font-mono-num font-bold text-[#1F122B] mt-0.5">
                {currentApplication.panNumber}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B]">Aadhaar Number</div>
              <div className="font-mono-num font-bold text-[#1F122B] mt-0.5">
                {currentApplication.aadhaarNumber}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B]">GST Number</div>
              <div className="font-mono-num font-bold text-[#1F122B] mt-0.5">
                {currentApplication.gstNumber || 'Not provided'}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B]">Full Address</div>
              <div className="font-medium text-[#1F122B] mt-0.5">
                {currentApplication.fullAddress}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {[
              { label: 'PAN Card', src: currentApplication.panDocDataUrl },
              { label: 'Aadhaar Card', src: currentApplication.aadhaarDocDataUrl },
              { label: 'GST Certificate', src: currentApplication.gstDocDataUrl },
              { label: 'Bank / Cheque Doc', src: currentApplication.bankDocDataUrl },
            ]
              .filter((d) => Boolean(d.src))
              .map((docItem) => (
                <div
                  key={docItem.label}
                  className="rounded-xl border border-[#EFE2F5] bg-[#FDF9FE] overflow-hidden"
                >
                  <div className="aspect-[4/3] bg-white overflow-hidden">
                    <img
                      src={docItem.src}
                      alt={docItem.label}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="px-2.5 py-1.5 text-[11px] font-semibold text-[#4A3B59] text-center">
                    {docItem.label}
                  </div>
                </div>
              ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#F4ECF8]">
            <p className="text-xs text-[#6B5B7B]">
              {isPending
                ? 'Once Admin approves your Seller Account, this page automatically unlocks your Seller Product Dashboard.'
                : isSuspended
                  ? 'Please contact our support team in Help Center if you need assistance.'
                  : 'You can update your KYC or bank documents and re-submit for review.'}
            </p>
            <div className="flex items-center gap-2.5">
              {isRejected && (
                <button
                  type="button"
                  onClick={handleStartReapply}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Edit &amp; Re-submit</span>
                </button>
              )}
              <button
                type="button"
                onClick={onOpenHelpCenter}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-4 py-2 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
              >
                <LifeBuoy className="w-3.5 h-3.5" />
                <span>Help Center Support</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SELLER REGISTRATION FORM
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToShop}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Shop</span>
        </button>

        {!loggedInCustomer && (
          <button
            type="button"
            onClick={onRequestSignIn}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3.5 py-2 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Sign In to Link Seller Account</span>
          </button>
        )}
      </div>

      {/* Hero Intro + Quick Status Check by Phone */}
      <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-7 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7E22CE]">
              <Store className="w-4 h-4 text-[#DB2777]" />
              <span>Seller Hub (সেলার হাব)</span>
            </div>
            <h1 className="font-display-serif text-2xl sm:text-3xl font-bold text-[#1F122B]">
              Become a Verified Seller on Glamour Galleria
            </h1>
            <p className="text-xs sm:text-sm text-[#6B5B7B]">
              Complete your KYC registration and bank verification to list and sell your products directly on our storefront.
            </p>
          </div>

          {!loggedInCustomer && (
            <form
              onSubmit={handleCheckPhoneStatus}
              className="flex items-center gap-2 shrink-0"
            >
              <div className="flex items-stretch rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] overflow-hidden focus-within:border-[#9333EA]">
                <span className="inline-flex items-center px-2.5 bg-[#F6EFFA] border-r border-[#E6D9EE] text-xs font-mono-num font-bold text-[#6D28D9]">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={lookupPhone}
                  onChange={(e) => setLookupPhone(e.target.value)}
                  placeholder="Already applied? Phone"
                  className="w-40 bg-transparent px-2.5 py-2 text-xs font-mono-num text-[#1F122B] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer whitespace-nowrap"
              >
                Check Status
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Registration Form */}
      <form
        onSubmit={handleSubmitApplication}
        className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-7 space-y-6 shadow-sm"
      >
        {error && (
          <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
            {error}
          </div>
        )}

        {/* Section 1: Business / Personal Details */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#1F122B] border-b border-[#F4ECF8] pb-2.5">
            <Building2 className="w-4 h-4 text-[#7E22CE]" />
            <span>1. Seller &amp; KYC Details</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Full Name <span className="text-[#DB2777]">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seller / Business Owner Full Name"
                className={inputClass}
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
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  className="w-full bg-transparent px-3 py-2.5 text-sm font-mono-num text-[#1F122B] focus:outline-none"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Full Address <span className="text-[#DB2777]">*</span>
              </label>
              <textarea
                rows={2}
                required
                value={fullAddress}
                onChange={(e) => setFullAddress(e.target.value)}
                placeholder="Shop / Building, Street, City, State, PIN Code"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                PAN Number <span className="text-[#DB2777]">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={10}
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                placeholder="ABCDE1234F"
                className={`${inputClass} font-mono-num uppercase`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Aadhaar Number <span className="text-[#DB2777]">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                maxLength={12}
                value={aadhaarNumber}
                onChange={(e) =>
                  setAadhaarNumber(e.target.value.replace(/[^\d]/g, '').slice(0, 12))
                }
                placeholder="12-digit Aadhaar Number"
                className={`${inputClass} font-mono-num`}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                GST Number (optional)
              </label>
              <input
                type="text"
                maxLength={15}
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                placeholder="15-character GSTIN (if registered)"
                className={`${inputClass} font-mono-num uppercase`}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Identity & KYC Document Uploads */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#1F122B] border-b border-[#F4ECF8] pb-2.5">
            <FileText className="w-4 h-4 text-[#DB2777]" />
            <span>2. Photo &amp; KYC Document Uploads</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {renderDocUploader(
              'sellerPhoto',
              'Seller Photo',
              'Clear passport/profile photo',
              sellerPhotoDataUrl,
              () => setSellerPhotoDataUrl(''),
              true
            )}
            {renderDocUploader(
              'panDoc',
              'PAN Card Document',
              'Clear front photo of PAN card',
              panDocDataUrl,
              () => setPanDocDataUrl(''),
              true
            )}
            {renderDocUploader(
              'aadhaarDoc',
              'Aadhaar Card Document',
              'Clear Aadhaar card photo',
              aadhaarDocDataUrl,
              () => setAadhaarDocDataUrl(''),
              true
            )}
            {renderDocUploader(
              'gstDoc',
              'GST Certificate',
              'Upload if GST registered',
              gstDocDataUrl,
              () => setGstDocDataUrl(''),
              false
            )}
          </div>
        </div>

        {/* Section 3: Payment Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#1F122B] border-b border-[#F4ECF8] pb-2.5">
            <CreditCard className="w-4 h-4 text-[#15803D]" />
            <span>3. Payment Section (Bank Payout Verification)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {renderDocUploader(
              'bankDoc',
              'Bank Document / Cancelled Cheque / Passbook',
              'Upload front page of Passbook, Cancelled Cheque, or Bank Statement for payouts',
              bankDocDataUrl,
              () => setBankDocDataUrl(''),
              true
            )}

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#4A3B59]">
                Bank Account / IFSC / Payout Note (optional)
              </label>
              <textarea
                rows={4}
                value={bankAccountDetails}
                onChange={(e) => setBankAccountDetails(e.target.value)}
                placeholder="Account Holder Name, Bank Name, Account Number, IFSC Code, or UPI ID for seller payouts..."
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-[#F4ECF8] flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-[#6B5B7B] inline-flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-[#7E22CE]" />
            Applications are reviewed by Admin and updated live.
          </span>

          <div className="flex items-center gap-2.5">
            {editingRejected && (
              <button
                type="button"
                onClick={() => setEditingRejected(false)}
                className="rounded-xl border border-[#E6D9EE] bg-white px-4 py-2.5 text-xs font-semibold text-[#4A3B59] cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || uploadingField !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
            >
              <Package className="w-4 h-4" />
              <span>
                {submitting ? 'Submitting Application...' : 'Submit Seller Application'}
              </span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
