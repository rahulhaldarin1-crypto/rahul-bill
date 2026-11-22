import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  LifeBuoy,
  LogIn,
  LogOut,
  Mail,
  Package,
  Phone,
  ShieldAlert,
  Store,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { Client, Product, SellerApplication } from '../types/business';
import { getSellerSessionId, setSellerSessionId } from '../utils/adminAuth';
import { api, formatApiError } from '../utils/api';
import {
  resizeImageFileToDataUrl,
  stripPlus91Prefix,
  validateImageFileUnder200KB,
} from '../utils/calculations';
import { ProductsView } from './ProductsView';

const SELLER_APP_STORAGE_KEY = 'gg_seller_app_id_v1';

interface SellerHubViewProps {
  loggedInCustomer: Client | null;
  products: Product[];
  currencySymbol: string;
  defaultLowStock: number;
  onBackToShop: () => void;
  onOpenHelpCenter: () => void;
  onRequestSignIn: () => void;
  onSaveProduct: (
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string,
    expectedSellerId?: string
  ) => Promise<void>;
  onDeleteProduct: (id: string, expectedSellerId?: string) => Promise<void>;
  onApplicationSubmitted?: (app: SellerApplication) => void;
}

type DocFieldKey =
  | 'sellerPhoto'
  | 'panDoc'
  | 'aadhaarDoc'
  | 'gstDoc'
  | 'bankDoc';

export const SellerHubView: React.FC<SellerHubViewProps> = ({
  loggedInCustomer,
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
  const [sellerSessionId, setSellerSessionIdState] = useState<string | null>(
    () => getSellerSessionId()
  );
  const [storedAppId, setStoredAppId] = useState<string>(() => {
    try {
      return localStorage.getItem(SELLER_APP_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [hubTab, setHubTab] = useState<'login' | 'apply' | 'status'>(() => {
    try {
      return localStorage.getItem(SELLER_APP_STORAGE_KEY) ? 'status' : 'apply';
    } catch {
      return 'apply';
    }
  });

  // Seller Login State
  const [loginIdent, setLoginIdent] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Isolated active Seller & own tracked application
  const [loggedInSeller, setLoggedInSeller] =
    useState<SellerApplication | null>(null);
  const [sellerLoading, setSellerLoading] = useState<boolean>(() =>
    Boolean(getSellerSessionId())
  );
  const [trackedApplication, setTrackedApplication] =
    useState<SellerApplication | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState('');

  // Status Lookup State (requires Phone + PAN verification)
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupPan, setLookupPan] = useState('');
  const [editingRejected, setEditingRejected] = useState(false);

  // Registration Form State
  const [name, setName] = useState(() => loggedInCustomer?.name || '');
  const [email, setEmail] = useState('');
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
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [bankAccountDetails, setBankAccountDetails] = useState('');

  const [sellerPhotoDataUrl, setSellerPhotoDataUrl] = useState('');
  const [panDocDataUrl, setPanDocDataUrl] = useState('');
  const [aadhaarDocDataUrl, setAadhaarDocDataUrl] = useState('');
  const [gstDocDataUrl, setGstDocDataUrl] = useState('');
  const [bankDocDataUrl, setBankDocDataUrl] = useState('');

  const [uploadingField, setUploadingField] = useState<DocFieldKey | null>(
    null
  );
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

  // Real-time subscription restricted strictly to ONLY this seller's own record
  useEffect(() => {
    if (!sellerSessionId) {
      setLoggedInSeller(null);
      setSellerLoading(false);
      return;
    }
    setSellerLoading(true);
    const unsub = api.subscribeSingleSellerApplication(
      sellerSessionId,
      (seller) => {
        setSellerLoading(false);
        if (
          !seller ||
          seller.status !== 'approved' ||
          seller.accountActivated === false
        ) {
          setLoggedInSeller(null);
          setSellerSessionId(null);
          setSellerSessionIdState(null);
          return;
        }
        setLoggedInSeller(seller);
      },
      () => {
        setSellerLoading(false);
      }
    );
    return () => unsub();
  }, [sellerSessionId]);

  // Fetch ONLY the user's own submitted application status when viewing Status tab
  useEffect(() => {
    if (loggedInSeller) return;
    if (!storedAppId && !loggedInCustomer?.id) return;
    let active = true;
    setStatusLoading(true);
    api
      .fetchSellerApplicationStatus({
        applicationId: storedAppId || undefined,
        clientId: loggedInCustomer?.id,
      })
      .then((app) => {
        if (active && app) {
          setTrackedApplication(app);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loggedInSeller, storedAppId, loggedInCustomer?.id]);

  const sellerProducts = useMemo(() => {
    if (!loggedInSeller) return [];
    return products.filter((p) => p.sellerId === loggedInSeller.id);
  }, [products, loggedInSeller]);

  const handleSellerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginBusy(true);
    try {
      const res = await api.loginSellerAccount(loginIdent, loginPassword);
      setLoggedInSeller(res.seller);
      setSellerSessionId(res.seller.id);
      setSellerSessionIdState(res.seller.id);
      setLoginPassword('');
    } catch (err) {
      setLoginError(
        formatApiError(err, 'Could not sign in to your Seller account.')
      );
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSellerLogout = () => {
    setSellerSessionId(null);
    setSellerSessionIdState(null);
    setLoggedInSeller(null);
    setHubTab('login');
  };

  const handleUploadDoc = async (
    field: DocFieldKey,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    const sizeErr = validateImageFileUnder200KB(file);
    if (sizeErr) {
      setError(sizeErr);
      return;
    }
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
          : 'Could not process selected document image. Please upload an image under 200KB.'
      );
    } finally {
      setUploadingField(null);
    }
  };

  const handleStartReapply = () => {
    if (!trackedApplication) return;
    setName(trackedApplication.name);
    setEmail(trackedApplication.email || '');
    setFullAddress(trackedApplication.fullAddress);
    setPhone(stripPlus91Prefix(trackedApplication.phone));
    setPanNumber(trackedApplication.panNumber);
    setAadhaarNumber(trackedApplication.aadhaarNumber);
    setGstNumber(trackedApplication.gstNumber || '');
    setBankAccountDetails(trackedApplication.bankAccountDetails || '');
    setSellerPhotoDataUrl(trackedApplication.sellerPhotoDataUrl);
    setPanDocDataUrl(trackedApplication.panDocDataUrl);
    setAadhaarDocDataUrl(trackedApplication.aadhaarDocDataUrl);
    setGstDocDataUrl(trackedApplication.gstDocDataUrl || '');
    setBankDocDataUrl(trackedApplication.bankDocDataUrl);
    setRegPassword('');
    setError('');
    setSuccessMsg('');
    setEditingRejected(true);
    setHubTab('apply');
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!editingRejected && regPassword.trim().length < 4) {
      setError(
        'Please create a Seller Login Password (minimum 4 characters). It will activate after Admin approval.'
      );
      return;
    }
    setSubmitting(true);
    try {
      const saved = await api.submitSellerApplication({
        existingId: editingRejected ? trackedApplication?.id : undefined,
        clientId: loggedInCustomer?.id,
        name,
        email,
        fullAddress,
        phone,
        panNumber,
        aadhaarNumber,
        gstNumber,
        password: regPassword,
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
      setTrackedApplication(saved);
      setEditingRejected(false);
      setHubTab('status');
      setSuccessMsg(
        'Seller application submitted with status "Pending"! Your seller login will activate once Admin approves.'
      );
      onApplicationSubmitted?.(saved);
    } catch (err) {
      setError(
        formatApiError(
          err,
          'Could not submit seller application. Please check your details.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckPhoneStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusError('');
    const trimmedPhone = lookupPhone.trim();
    const trimmedPan = lookupPan.trim().toUpperCase();
    if (!trimmedPhone || !trimmedPan) {
      setStatusError(
        'Please enter both your registered Phone Number and 10-character PAN Number.'
      );
      return;
    }
    setStatusLoading(true);
    try {
      const matched = await api.fetchSellerApplicationStatus({
        phone: trimmedPhone,
        panNumber: trimmedPan,
      });
      setTrackedApplication(matched);
      if (matched) {
        try {
          localStorage.setItem(SELLER_APP_STORAGE_KEY, matched.id);
        } catch {
          // ignore
        }
        setStoredAppId(matched.id);
      }
      setHubTab('status');
    } catch (err) {
      setTrackedApplication(null);
      setStatusError(
        formatApiError(
          err,
          'No seller application found matching that Phone Number and PAN Number.'
        )
      );
    } finally {
      setStatusLoading(false);
    }
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
          <span className="text-[10px] font-medium text-[#6B5B7B]">
            JPG / PNG · Max 200KB (সর্বোচ্চ 200KB)
          </span>
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

  if (sellerLoading) {
    return (
      <div className="max-w-3xl mx-auto rounded-3xl border border-[#EFE2F5] bg-white/95 p-10 text-center text-xs font-semibold text-[#7E22CE]">
        Loading your Seller Dashboard...
      </div>
    );
  }

  // ============================================================================
  // 1. LOGGED-IN APPROVED SELLER DASHBOARD
  // ============================================================================
  if (loggedInSeller) {
    const approvedLiveCount = sellerProducts.filter(
      (p) => p.sellerApprovalStatus === 'approved'
    ).length;
    const pendingReviewCount = sellerProducts.filter(
      (p) =>
        p.sellerApprovalStatus !== 'approved' &&
        p.sellerApprovalStatus !== 'rejected'
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

          <button
            type="button"
            onClick={handleSellerLogout}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2 text-xs font-semibold text-[#BE123C] hover:bg-[#FFE4E6] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Seller Logout</span>
          </button>
        </div>

        {/* Approved Seller Profile Banner */}
        <div className="rounded-3xl border border-[#DCFCE7] bg-white/95 backdrop-blur-md p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] overflow-hidden shrink-0 flex items-center justify-center">
              {loggedInSeller.sellerPhotoDataUrl ? (
                <img
                  src={loggedInSeller.sellerPhotoDataUrl}
                  alt={loggedInSeller.name}
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
                {loggedInSeller.name}
              </h1>
              <div className="text-xs text-[#5B4B6B] font-mono-num mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                {loggedInSeller.sellerCode && (
                  <span className="font-bold text-[#6D28D9]">
                    ID: {loggedInSeller.sellerCode}
                  </span>
                )}
                <span>{loggedInSeller.phone}</span>
                {loggedInSeller.email && <span>{loggedInSeller.email}</span>}
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

        {/* Seller Product Management (same workflow as Admin Product Listing) */}
        <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md">
          <ProductsView
            products={sellerProducts}
            currencySymbol={currencySymbol}
            defaultLowStock={defaultLowStock}
            hideBackButton
            sellerContext={{
              sellerId: loggedInSeller.id,
              sellerName: loggedInSeller.name,
              sellerPhone: loggedInSeller.phone,
            }}
            onBack={onBackToShop}
            onSaveProduct={(payload, existingId) =>
              onSaveProduct(payload, existingId, loggedInSeller.id)
            }
            onDeleteProduct={(id) => onDeleteProduct(id, loggedInSeller.id)}
          />
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. SELLER HUB PORTAL (APPLY / SELLER LOGIN / APPLICATION STATUS)
  // ============================================================================
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-[#EFE2F5]">
            <button
              type="button"
              onClick={() => {
                setEditingRejected(false);
                setHubTab('login');
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                hubTab === 'login'
                  ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                  : 'text-[#5B4B6B] hover:text-[#1F122B]'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Seller Login</span>
            </button>
            <button
              type="button"
              onClick={() => setHubTab('apply')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                hubTab === 'apply'
                  ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                  : 'text-[#5B4B6B] hover:text-[#1F122B]'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Apply as Seller</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingRejected(false);
                setHubTab('status');
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                hubTab === 'status'
                  ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                  : 'text-[#5B4B6B] hover:text-[#1F122B]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Application Status</span>
            </button>
          </div>

          {!loggedInCustomer && (
            <button
              type="button"
              onClick={onRequestSignIn}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3 py-2 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Customer Sign In</span>
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-xs font-semibold text-[#15803D] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* TAB A: SELLER LOGIN */}
      {hubTab === 'login' && (
        <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-8 max-w-lg mx-auto space-y-5 shadow-sm">
          <div className="space-y-1 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#DB2777] to-[#7E22CE] text-white flex items-center justify-center mx-auto">
              <KeyRound className="w-6 h-6" />
            </div>
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B] pt-1">
              Approved Seller Login
            </h1>
            <p className="text-xs text-[#6B5B7B]">
              Sign in with your Seller ID, Email, or Phone Number and Password activated by Admin.
            </p>
          </div>

          {loginError && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
              {loginError}
            </div>
          )}

          <form onSubmit={handleSellerLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Seller ID / Email / Phone Number{' '}
                <span className="text-[#DB2777]">*</span>
              </label>
              <input
                type="text"
                required
                value={loginIdent}
                onChange={(e) => setLoginIdent(e.target.value)}
                placeholder="e.g. GGS-432112, seller@email.com, or 9876543210"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Seller Password <span className="text-[#DB2777]">*</span>
              </label>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your seller password"
                  className={`${inputClass} pr-10`}
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
              disabled={loginBusy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-3 px-4 text-sm font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {loginBusy ? 'Signing In...' : 'Sign In to Seller Dashboard'}
              </span>
            </button>
          </form>

          <div className="pt-3 border-t border-[#F4ECF8] flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B5B7B]">
            <span>New to Seller Hub?</span>
            <button
              type="button"
              onClick={() => setHubTab('apply')}
              className="font-bold text-[#7E22CE] hover:underline cursor-pointer"
            >
              Submit Seller Application
            </button>
          </div>
        </div>
      )}

      {/* TAB C: APPLICATION STATUS VIEW */}
      {hubTab === 'status' && (
        <div className="space-y-4">
          <form
            onSubmit={handleCheckPhoneStatus}
            className="rounded-2xl border border-[#EFE2F5] bg-white/95 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
          >
            <div className="text-xs text-[#5B4B6B]">
              Verify your registered Phone Number &amp; PAN Number to view your private Seller Application status:
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-stretch rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] overflow-hidden focus-within:border-[#9333EA]">
                <span className="inline-flex items-center px-2.5 bg-[#F6EFFA] border-r border-[#E6D9EE] text-xs font-mono-num font-bold text-[#6D28D9]">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={lookupPhone}
                  onChange={(e) => setLookupPhone(e.target.value)}
                  placeholder="9876543210"
                  className="w-32 bg-transparent px-2.5 py-2 text-xs font-mono-num text-[#1F122B] focus:outline-none"
                />
              </div>
              <input
                type="text"
                maxLength={10}
                value={lookupPan}
                onChange={(e) => setLookupPan(e.target.value.toUpperCase())}
                placeholder="PAN (ABCDE1234F)"
                className="w-36 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-2.5 py-2 text-xs font-mono-num uppercase text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
              <button
                type="submit"
                disabled={statusLoading}
                className="rounded-xl bg-[#7E22CE] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {statusLoading ? 'Checking...' : 'Check Status'}
              </button>
            </div>
          </form>

          {statusError && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
              {statusError}
            </div>
          )}

          {!trackedApplication ? (
            <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 p-8 text-center space-y-3">
              <Store className="w-10 h-10 text-[#D8B4FE] mx-auto" />
              <h2 className="text-base font-bold text-[#1F122B]">
                No Seller Application Found Yet
              </h2>
              <p className="text-xs text-[#6B5B7B] max-w-md mx-auto">
                Enter your registered Phone Number and PAN Number above to check an existing application, or apply now to become a seller on Glamour Galleria.
              </p>
              <button
                type="button"
                onClick={() => setHubTab('apply')}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                <Store className="w-4 h-4" />
                <span>Apply as Seller</span>
              </button>
            </div>
          ) : (
            (() => {
              const isApproved = trackedApplication.status === 'approved';
              const isPending = trackedApplication.status === 'pending';
              const isRejected = trackedApplication.status === 'rejected';
              const isSuspended = trackedApplication.status === 'suspended';

              return (
                <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-7 space-y-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#F4ECF8] pb-5">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl border border-[#E6D9EE] bg-[#FDF9FE] overflow-hidden shrink-0 flex items-center justify-center">
                        {trackedApplication.sellerPhotoDataUrl ? (
                          <img
                            src={trackedApplication.sellerPhotoDataUrl}
                            alt={trackedApplication.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Store className="w-7 h-7 text-[#9333EA]" />
                        )}
                      </div>
                      <div>
                        <h2 className="font-display-serif text-2xl font-bold text-[#1F122B]">
                          {trackedApplication.name}
                        </h2>
                        <div className="text-xs text-[#6B5B7B] font-mono-num mt-0.5">
                          {trackedApplication.phone}
                          {trackedApplication.email
                            ? ` · ${trackedApplication.email}`
                            : ''}
                          {' · '}Submitted{' '}
                          {trackedApplication.createdAt.slice(0, 10)}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold shrink-0 ${
                        isApproved
                          ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]'
                          : isPending
                            ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]'
                            : isRejected
                              ? 'border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C]'
                              : 'border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]'
                      }`}
                    >
                      {isApproved && <BadgeCheck className="w-4 h-4" />}
                      {isPending && <Clock className="w-4 h-4" />}
                      {isRejected && <AlertTriangle className="w-4 h-4" />}
                      {isSuspended && <ShieldAlert className="w-4 h-4" />}
                      <span>
                        {isApproved
                          ? 'Approved & Activated'
                          : isPending
                            ? 'Pending Admin Approval'
                            : isRejected
                              ? 'Application Rejected'
                              : 'Account Suspended / Disabled'}
                      </span>
                    </div>
                  </div>

                  {isApproved && (
                    <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1 text-xs">
                        <div className="font-bold text-[#15803D] text-sm">
                          Your Seller Account is Approved &amp; Active!
                        </div>
                        <div className="text-[#166534] font-mono-num">
                          Seller ID:{' '}
                          <strong className="select-all">
                            {trackedApplication.sellerCode || 'Active'}
                          </strong>{' '}
                          · Phone: <strong>{trackedApplication.phone}</strong>
                          {trackedApplication.email
                            ? ` · Email: ${trackedApplication.email}`
                            : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setLoginIdent(
                            trackedApplication.sellerCode ||
                              trackedApplication.email ||
                              trackedApplication.phone
                          );
                          setHubTab('login');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#15803D] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer shrink-0"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Log In to Seller Dashboard</span>
                      </button>
                    </div>
                  )}

                  {trackedApplication.adminRemarks && (
                    <div className="rounded-2xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs text-[#9F1239]">
                      <strong>Admin Note:</strong>{' '}
                      {trackedApplication.adminRemarks}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    <div>
                      <div className="text-[#6B5B7B]">PAN Number</div>
                      <div className="font-mono-num font-bold text-[#1F122B] mt-0.5">
                        {trackedApplication.panNumber}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#6B5B7B]">Aadhaar Number</div>
                      <div className="font-mono-num font-bold text-[#1F122B] mt-0.5">
                        {trackedApplication.aadhaarNumber}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#6B5B7B]">GST Number</div>
                      <div className="font-mono-num font-bold text-[#1F122B] mt-0.5">
                        {trackedApplication.gstNumber || 'Not provided'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#6B5B7B]">Full Address</div>
                      <div className="font-medium text-[#1F122B] mt-0.5">
                        {trackedApplication.fullAddress}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#F4ECF8]">
                    <p className="text-xs text-[#6B5B7B]">
                      {isPending
                        ? 'Your application is saved with status "pending". No seller account is active until Admin approves and activates your credentials.'
                        : isSuspended
                          ? 'Your seller account is currently suspended/disabled. Contact our team in Help Center.'
                          : isApproved
                            ? 'Use Seller Login with your Seller ID, Email, or Phone + Password to list and manage products.'
                            : 'You can edit your KYC or bank documents and re-submit for Admin review.'}
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
              );
            })()
          )}
        </div>
      )}

      {/* TAB B: SELLER APPLICATION FORM */}
      {hubTab === 'apply' && (
        <>
          <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-7 space-y-2 shadow-sm">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7E22CE]">
              <Store className="w-4 h-4 text-[#DB2777]" />
              <span>Seller Hub (সেলার হাব) · Seller Registration</span>
            </div>
            <h1 className="font-display-serif text-2xl sm:text-3xl font-bold text-[#1F122B]">
              Apply for a Verified Seller Account
            </h1>
            <p className="text-xs sm:text-sm text-[#6B5B7B]">
              Submit your KYC and payout bank document. Applications remain in{' '}
              <strong>pending</strong> status until Admin approves and activates your Seller Login credentials.
            </p>
          </div>

          <form
            onSubmit={handleSubmitApplication}
            className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-7 space-y-6 shadow-sm"
          >
            {error && (
              <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
                {error}
              </div>
            )}

            {/* Section 1: Business / Personal Details + Login Credentials */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1F122B] border-b border-[#F4ECF8] pb-2.5">
                <Building2 className="w-4 h-4 text-[#7E22CE]" />
                <span>1. Seller, KYC &amp; Login Details</span>
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

                <div>
                  <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                    Email Address (for Seller Login)
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seller@example.com"
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                    Create Seller Login Password{' '}
                    {!editingRejected && (
                      <span className="text-[#DB2777]">*</span>
                    )}
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required={!editingRejected}
                      minLength={4}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder={
                        editingRejected
                          ? 'Leave blank to keep previous password'
                          : 'Minimum 4 characters'
                      }
                      className={`${inputClass} pl-10 pr-10`}
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
                      setAadhaarNumber(
                        e.target.value.replace(/[^\d]/g, '').slice(0, 12)
                      )
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
                Saved as pending until Admin approves &amp; activates your seller account.
              </span>

              <div className="flex items-center gap-2.5">
                {editingRejected && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRejected(false);
                      setHubTab('status');
                    }}
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
                    {submitting
                      ? 'Submitting Application...'
                      : 'Submit Seller Application'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
};
