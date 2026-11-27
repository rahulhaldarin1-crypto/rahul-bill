import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  LifeBuoy,
  LogIn,
  LogOut,
  Mail,
  MessageSquare,
  Package,
  Phone,
  QrCode,
  Rocket,
  Save,
  ShieldAlert,
  Sparkles,
  Star,
  Store,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  AdminPaymentSettings,
  BoostRequest,
  BusinessSettings,
  Client,
  HighlightRequest,
  Product,
  ProductReview,
  SellerApplication,
  SellerFollowRecord,
} from '../types/business';
import { auth, getRedirectResult, signInWithGoogleWithFallback } from '../firebase';
import { getSellerSessionId, setSellerSessionId } from '../utils/adminAuth';
import { api, formatApiError } from '../utils/api';
import {
  buildUpiDeepLink,
  DEFAULT_HIGHLIGHT_CONFIG,
  HIGHLIGHT_UPI_ID,
  formatCurrency,
  getMaxAdultDobIso,
  isProductHighlightActive,
  mergeAdminPaymentSettings,
  stripPlus91Prefix,
  validateAdultDateOfBirth,
} from '../utils/calculations';
import {
  getOptimizedMediaUrl,
  uploadMediaToCloudinary,
} from '../utils/cloudinary';
import {
  calculateSellerBoostFee,
  clampBoostPercentage,
} from '../utils/smartDiscovery';
import { useBangladeshDetection } from '../utils/region';
import { BoostPowerControl } from './BoostPowerControl';
import { ProductsView } from './ProductsView';

interface SellerHubViewProps {
  loggedInCustomer: Client | null;
  products: Product[];
  settings?: BusinessSettings;
  paymentSettings?: AdminPaymentSettings;
  highlightSeatUsage?: Record<string, number>;
  sellerFollows?: SellerFollowRecord[];
  productReviews?: ProductReview[];
  currencySymbol: string;
  defaultLowStock: number;
  onBackToShop: () => void;
  onOpenHelpCenter: () => void;
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
  | 'sellerCoverPhoto'
  | 'panDoc'
  | 'aadhaarDoc'
  | 'gstDoc'
  | 'bankDoc';

export const SellerHubView: React.FC<SellerHubViewProps> = ({
  loggedInCustomer,
  products,
  settings,
  paymentSettings,
  highlightSeatUsage = {},
  sellerFollows = [],
  productReviews = [],
  currencySymbol,
  defaultLowStock,
  onBackToShop,
  onOpenHelpCenter,
  onSaveProduct,
  onDeleteProduct,
  onApplicationSubmitted,
}) => {
  const { isBangladesh } = useBangladeshDetection();
  const [sellerSessionId, setSellerSessionIdState] = useState<string | null>(
    () => getSellerSessionId()
  );
  // Strict Privacy: Unauthenticated visitors only see 'login' or 'apply' — never any status lookup tab.
  const [hubTab, setHubTab] = useState<'login' | 'apply'>('login');

  // Seller Google Auth & Legacy Login State
  const [googleSellerAuth, setGoogleSellerAuth] = useState<{
    uid: string;
    email: string;
    displayName: string;
    photoURL: string;
  } | null>(null);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [showLegacyPasswordLogin, setShowLegacyPasswordLogin] = useState(false);
  const [loginIdent, setLoginIdent] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginForgotMode, setLoginForgotMode] = useState(false);
  const [forgotSuccessMsg, setForgotSuccessMsg] = useState('');

  // Authenticated Seller (supports pending, rejected, suspended, approved privately)
  const [loggedInSeller, setLoggedInSeller] =
    useState<SellerApplication | null>(null);
  const [sellerLoading, setSellerLoading] = useState<boolean>(() =>
    Boolean(getSellerSessionId())
  );
  const [editingRejected, setEditingRejected] = useState(false);

  // Editable Seller Store Profile (Name, Profile Photo, Cover Photo)
  const [storeProfileOpen, setStoreProfileOpen] = useState(false);
  const [editSellerName, setEditSellerName] = useState('');
  const [editSellerPhoto, setEditSellerPhoto] = useState('');
  const [editSellerCover, setEditSellerCover] = useState('');
  const [uploadingStoreImg, setUploadingStoreImg] = useState<'photo' | 'cover' | null>(null);
  const [uploadStoreImgProgress, setUploadStoreImgProgress] = useState<number | null>(null);
  const [savingStoreProfile, setSavingStoreProfile] = useState(false);
  const [storeProfileError, setStoreProfileError] = useState('');
  const [storeProfileNotice, setStoreProfileNotice] = useState('');

  // Seller Account-Level Payment System (for approved seller payouts / direct customer orders)
  const [sellerPaymentOpen, setSellerPaymentOpen] = useState(false);
  const [sellerUpiId, setSellerUpiId] = useState('');
  const [sellerBankAccountName, setSellerBankAccountName] = useState('');
  const [sellerBankName, setSellerBankName] = useState('');
  const [sellerBankAccountNo, setSellerBankAccountNo] = useState('');
  const [sellerBankIfscBranch, setSellerBankIfscBranch] = useState('');
  const [sellerQrDataUrl, setSellerQrDataUrl] = useState('');
  const [uploadingSellerQr, setUploadingSellerQr] = useState(false);
  const [uploadSellerQrProgress, setUploadSellerQrProgress] = useState<number | null>(null);
  const [savingSellerPayment, setSavingSellerPayment] = useState(false);
  const [sellerPaymentError, setSellerPaymentError] = useState('');
  const [sellerPaymentNotice, setSellerPaymentNotice] = useState('');

  // Paid Highlight Requests (for logged-in approved seller)
  const [highlightRequests, setHighlightRequests] = useState<HighlightRequest[]>(
    []
  );
  const [highlightTargetProduct, setHighlightTargetProduct] =
    useState<Product | null>(null);
  const [selectedChoiceType, setSelectedChoiceType] = useState<
    'plan' | 'offer_seat'
  >('offer_seat');
  const [selectedChoiceId, setSelectedChoiceId] = useState('');
  const [highlightTxRef, setHighlightTxRef] = useState('');
  const [highlightScreenshot, setHighlightScreenshot] = useState('');
  const [uploadingHighlightShot, setUploadingHighlightShot] = useState(false);
  const [uploadHighlightShotProgress, setUploadHighlightShotProgress] = useState<number | null>(null);
  const [submittingHighlight, setSubmittingHighlight] = useState(false);
  const [highlightError, setHighlightError] = useState('');
  const [highlightNotice, setHighlightNotice] = useState('');
  const [upiCopied, setUpiCopied] = useState(false);

  // Paid Percentage Boost Requests (for logged-in approved seller)
  const [boostRequests, setBoostRequests] = useState<BoostRequest[]>([]);
  const [boostTargetProduct, setBoostTargetProduct] = useState<Product | null>(
    null
  );
  const [boostPct, setBoostPct] = useState<number>(20);
  const [boostDays, setBoostDays] = useState<number>(3);
  const [boostTxRef, setBoostTxRef] = useState('');
  const [boostScreenshot, setBoostScreenshot] = useState('');
  const [uploadingBoostShot, setUploadingBoostShot] = useState(false);
  const [uploadBoostShotProgress, setUploadBoostShotProgress] = useState<
    number | null
  >(null);
  const [submittingBoost, setSubmittingBoost] = useState(false);
  const [boostError, setBoostError] = useState('');
  const [boostNotice, setBoostNotice] = useState('');
  const [boostUpiCopied, setBoostUpiCopied] = useState(false);

  // Registration Form State
  const [name, setName] = useState(() => loggedInCustomer?.name || '');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
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
  const [sellerCoverPhotoDataUrl, setSellerCoverPhotoDataUrl] = useState('');
  const [panDocDataUrl, setPanDocDataUrl] = useState('');
  const [aadhaarDocDataUrl, setAadhaarDocDataUrl] = useState('');
  const [gstDocDataUrl, setGstDocDataUrl] = useState('');
  const [bankDocDataUrl, setBankDocDataUrl] = useState('');

  const [uploadingField, setUploadingField] = useState<DocFieldKey | null>(
    null
  );
  const [uploadDocProgress, setUploadDocProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  type SellerLayer =
    | 'base'
    | 'apply'
    | 'forgot'
    | 'editing-rejected'
    | 'store-profile'
    | 'seller-payment'
    | 'highlight'
    | 'boost';

  const currentSellerLayer: SellerLayer = boostTargetProduct
    ? 'boost'
    : highlightTargetProduct
      ? 'highlight'
      : editingRejected
        ? 'editing-rejected'
        : loggedInSeller && storeProfileOpen
          ? 'store-profile'
          : loggedInSeller && sellerPaymentOpen
            ? 'seller-payment'
            : !loggedInSeller && loginForgotMode
              ? 'forgot'
              : !loggedInSeller && hubTab === 'apply'
                ? 'apply'
                : 'base';

  const sellerLayerRef = useRef<SellerLayer>('base');
  const sellerSubDepthRef = useRef(0);
  const skipSellerPushRef = useRef(false);

  useEffect(() => {
    const prevLayer = sellerLayerRef.current;
    if (skipSellerPushRef.current) {
      skipSellerPushRef.current = false;
      sellerLayerRef.current = currentSellerLayer;
      return;
    }
    if (prevLayer !== currentSellerLayer) {
      if (currentSellerLayer !== 'base') {
        try {
          window.history.pushState(
            { ggType: 'seller-sub', layer: currentSellerLayer },
            ''
          );
          sellerSubDepthRef.current += 1;
        } catch {
          // ignore history errors
        }
      }
      sellerLayerRef.current = currentSellerLayer;
    }
  }, [currentSellerLayer]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as { ggType?: string; layer?: SellerLayer } | null;
      if (state?.ggType === 'products-sub') {
        return;
      }
      const activeLayer = sellerLayerRef.current;
      if (activeLayer === 'base' && sellerSubDepthRef.current === 0) {
        return;
      }
      if (state?.ggType === 'seller-sub' && state.layer === activeLayer) {
        // Popped back from child ProductsView onto the same SellerHubView layer
        return;
      }

      sellerSubDepthRef.current = Math.max(0, sellerSubDepthRef.current - 1);
      skipSellerPushRef.current = true;

      if (state?.ggType === 'seller-sub' && state.layer) {
        const nextLayer = state.layer;
        sellerLayerRef.current = nextLayer;
        if (nextLayer !== 'highlight') setHighlightTargetProduct(null);
        if (nextLayer !== 'boost') setBoostTargetProduct(null);
        setStoreProfileOpen(nextLayer === 'store-profile');
        setSellerPaymentOpen(nextLayer === 'seller-payment');
        setEditingRejected(nextLayer === 'editing-rejected');
        setLoginForgotMode(nextLayer === 'forgot');
        if (nextLayer === 'apply') setHubTab('apply');
        else if (nextLayer === 'base') setHubTab('login');
      } else {
        sellerLayerRef.current = 'base';
        setHighlightTargetProduct(null);
        setBoostTargetProduct(null);
        setStoreProfileOpen(false);
        setSellerPaymentOpen(false);
        setEditingRejected(false);
        setLoginForgotMode(false);
        setHubTab('login');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const closeSellerSubLayer = (fallback: () => void) => {
    if (sellerSubDepthRef.current > 0) {
      window.history.back();
      return;
    }
    fallback();
  };

  const maxAdultDob = useMemo(() => getMaxAdultDobIso(), []);

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

  // Real-time subscription restricted strictly to ONLY the authenticated seller's own record
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
        if (!seller) {
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

  // Subscribe to ONLY this authenticated approved seller's highlight & boost requests
  useEffect(() => {
    if (!loggedInSeller || loggedInSeller.status !== 'approved') {
      setHighlightRequests([]);
      setBoostRequests([]);
      return;
    }
    const unsubHighlight = api.subscribeSellerHighlightRequests(
      loggedInSeller.id,
      (list) => setHighlightRequests(list),
      () => undefined
    );
    const unsubBoost = api.subscribeSellerBoostRequests(
      loggedInSeller.id,
      (list) => setBoostRequests(list),
      () => undefined
    );
    return () => {
      unsubHighlight();
      unsubBoost();
    };
  }, [loggedInSeller?.id, loggedInSeller?.status]);

  // Sync Seller Account Payment System & Store Profile fields when seller record updates
  useEffect(() => {
    if (!loggedInSeller) return;
    setEditSellerName(loggedInSeller.name || '');
    setEditSellerPhoto(loggedInSeller.sellerPhotoDataUrl || '');
    setEditSellerCover(loggedInSeller.sellerCoverPhotoDataUrl || '');
    setSellerUpiId(loggedInSeller.sellerUpiId || '');
    setSellerBankAccountName(loggedInSeller.sellerBankAccountName || '');
    setSellerBankName(loggedInSeller.sellerBankName || '');
    setSellerBankAccountNo(loggedInSeller.sellerBankAccountNo || '');
    setSellerBankIfscBranch(loggedInSeller.sellerBankIfscBranch || '');
    setSellerQrDataUrl(loggedInSeller.sellerQrDataUrl || '');
  }, [
    loggedInSeller?.id,
    loggedInSeller?.name,
    loggedInSeller?.sellerPhotoDataUrl,
    loggedInSeller?.sellerCoverPhotoDataUrl,
    loggedInSeller?.sellerUpiId,
    loggedInSeller?.sellerBankAccountName,
    loggedInSeller?.sellerBankName,
    loggedInSeller?.sellerBankAccountNo,
    loggedInSeller?.sellerBankIfscBranch,
    loggedInSeller?.sellerQrDataUrl,
  ]);

  const sellerProducts = useMemo(() => {
    if (!loggedInSeller) return [];
    return products.filter((p) => p.sellerId === loggedInSeller.id);
  }, [products, loggedInSeller]);

  const liveFollowersCount = useMemo(() => {
    if (!loggedInSeller) return 0;
    const fromFollows = sellerFollows.filter(
      (f) => f.sellerId === loggedInSeller.id
    ).length;
    return Math.max(Number(loggedInSeller.followersCount) || 0, fromFollows);
  }, [loggedInSeller, sellerFollows]);

  const sellerProductReviews = useMemo(() => {
    if (!loggedInSeller) return [];
    const prodIdSet = new Set(sellerProducts.map((p) => p.id));
    return productReviews.filter(
      (r) =>
        (r.sellerId && r.sellerId === loggedInSeller.id) ||
        prodIdSet.has(r.productId)
    );
  }, [loggedInSeller, sellerProducts, productReviews]);

  const pendingHighlightProductIds = useMemo(() => {
    const set = new Set<string>();
    for (const req of highlightRequests) {
      if (req.status === 'pending_approval') {
        set.add(req.productId);
      }
    }
    return set;
  }, [highlightRequests]);

  const pendingBoostProductIds = useMemo(() => {
    const set = new Set<string>();
    for (const req of boostRequests) {
      if (req.status === 'pending_approval') {
        set.add(req.productId);
      }
    }
    return set;
  }, [boostRequests]);

  const highlightConfig = useMemo(
    () => settings?.highlightConfig || DEFAULT_HIGHLIGHT_CONFIG,
    [settings?.highlightConfig]
  );

  const enabledOfferSeats = useMemo(
    () => (highlightConfig.offerSeats || []).filter((s) => s.enabled),
    [highlightConfig.offerSeats]
  );

  const enabledPlans = useMemo(
    () => (highlightConfig.plans || []).filter((p) => p.enabled),
    [highlightConfig.plans]
  );

  const adminLivePayment = useMemo(
    () => mergeAdminPaymentSettings(paymentSettings, settings),
    [paymentSettings, settings]
  );

  const activeHighlightUpi =
    (paymentSettings?.upiId || highlightConfig.upiId || adminLivePayment.upiId || '').trim() ||
    HIGHLIGHT_UPI_ID;

  const selectedHighlightItem = useMemo(() => {
    if (selectedChoiceType === 'offer_seat') {
      return enabledOfferSeats.find((s) => s.id === selectedChoiceId) || null;
    }
    return enabledPlans.find((p) => p.id === selectedChoiceId) || null;
  }, [selectedChoiceType, selectedChoiceId, enabledOfferSeats, enabledPlans]);

  const applyResolvedGoogleSellerUser = async (user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
  }) => {
    const resolved = await api.resolveGoogleSellerAccount({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    });

    if (!resolved.needsKyc && resolved.seller) {
      setLoggedInSeller(resolved.seller);
      setSellerSessionId(resolved.seller.id);
      setSellerSessionIdState(resolved.seller.id);
      setGoogleSellerAuth(null);
      setEditingRejected(false);
      setLoginPassword('');
      return;
    }

    if (isBangladesh) {
      setGoogleSellerAuth(null);
      setEditingRejected(false);
      setHubTab('login');
      setLoginError(
        'Seller account registration is currently restricted to India only and is not available in Bangladesh.'
      );
      return;
    }

    const cleanEmail = String(user.email || '').trim().toLowerCase();
    const cleanName = String(user.displayName || '').trim();
    const cleanPhoto = String(user.photoURL || '').trim();
    setGoogleSellerAuth({
      uid: user.uid,
      email: cleanEmail,
      displayName: cleanName,
      photoURL: cleanPhoto,
    });
    if (cleanEmail) setEmail(cleanEmail);
    if (cleanName) {
      setName((prev) =>
        googleSellerAuth && googleSellerAuth.email !== cleanEmail
          ? cleanName
          : prev || cleanName
      );
    }
    setEditingRejected(false);
    setHubTab('apply');
    setError('');
    setLoginError('');
  };

  // Recover mobile browser Google Sign-In redirect result for Seller Hub
  useEffect(() => {
    let active = true;
    const intent = (() => {
      try {
        return sessionStorage.getItem('gg_google_auth_intent');
      } catch {
        return null;
      }
    })();
    if (intent !== 'seller') return;

    setGoogleSigningIn(true);
    getRedirectResult(auth)
      .then(async (result) => {
        try {
          sessionStorage.removeItem('gg_google_auth_intent');
        } catch {
          // ignore storage errors
        }
        if (!active || !result?.user) return;
        await applyResolvedGoogleSellerUser(result.user);
      })
      .catch((err) => {
        if (!active) return;
        setLoginError(
          formatApiError(err, 'Could not complete Google Sign-In for Seller Hub.')
        );
      })
      .finally(() => {
        if (active) setGoogleSigningIn(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSellerGoogleSignIn = async () => {
    setLoginError('');
    setError('');
    setForgotSuccessMsg('');
    setSuccessMsg('');
    setGoogleSigningIn(true);
    try {
      try {
        sessionStorage.setItem('gg_google_auth_intent', 'seller');
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
      await applyResolvedGoogleSellerUser(result.user);
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
      const msg =
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
          ? 'Google sign-in was cancelled. Please try again.'
          : formatApiError(
              err,
              'Could not complete Google Sign-In. Please try again.'
            );
      setLoginError(msg);
      setError(msg);
    } finally {
      setGoogleSigningIn(false);
    }
  };

  const handleSellerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setForgotSuccessMsg('');
    setSuccessMsg('');
    setLoginBusy(true);
    try {
      const res = await api.loginSellerAccount(loginIdent, loginPassword);
      setLoggedInSeller(res.seller);
      setSellerSessionId(res.seller.id);
      setSellerSessionIdState(res.seller.id);
      setLoginPassword('');
      setEditingRejected(false);
    } catch (err) {
      setLoginError(
        formatApiError(err, 'Could not sign in to your Seller account.')
      );
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSellerForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(
      'Email OTP reset is temporarily disabled. You can sign in directly with your linked Google account or contact Admin Support in Help Center.'
    );
  };

  const handleSellerLogout = () => {
    setSellerSessionId(null);
    setSellerSessionIdState(null);
    setLoggedInSeller(null);
    setGoogleSellerAuth(null);
    setEditingRejected(false);
    setHighlightTargetProduct(null);
    setBoostTargetProduct(null);
    setSuccessMsg('');
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
    setUploadingField(field);
    setUploadDocProgress(1);
    try {
      const isProfile = field === 'sellerPhoto' || field === 'sellerCoverPhoto';
      const record = await uploadMediaToCloudinary(file, {
        role: 'seller',
        appSource: 'glamour-galleria',
        folder: isProfile
          ? 'glamour-galleria/seller/profile'
          : 'glamour-galleria/seller/kyc',
        relatedEntityType: isProfile ? 'seller_profile' : 'seller_kyc',
        relatedEntityId: loggedInSeller?.id || loggedInCustomer?.id,
        uploadedByUid: loggedInSeller?.id || loggedInCustomer?.id,
        allowedTypes: ['image'],
        onProgress: (pct) => setUploadDocProgress(pct),
      });
      if (field === 'sellerPhoto') setSellerPhotoDataUrl(record.secureUrl);
      if (field === 'sellerCoverPhoto') setSellerCoverPhotoDataUrl(record.secureUrl);
      if (field === 'panDoc') setPanDocDataUrl(record.secureUrl);
      if (field === 'aadhaarDoc') setAadhaarDocDataUrl(record.secureUrl);
      if (field === 'gstDoc') setGstDocDataUrl(record.secureUrl);
      if (field === 'bankDoc') setBankDocDataUrl(record.secureUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not upload document image to Cloudinary. Please choose a valid image file.'
      );
    } finally {
      setUploadingField(null);
      setUploadDocProgress(null);
    }
  };

  const handleStartReapply = () => {
    if (!loggedInSeller) return;
    setName(loggedInSeller.name);
    setEmail(loggedInSeller.email || '');
    setDateOfBirth(loggedInSeller.dateOfBirth || '');
    setFullAddress(loggedInSeller.fullAddress);
    setPhone(stripPlus91Prefix(loggedInSeller.phone));
    setPanNumber(loggedInSeller.panNumber);
    setAadhaarNumber(loggedInSeller.aadhaarNumber);
    setGstNumber(loggedInSeller.gstNumber || '');
    setBankAccountDetails(loggedInSeller.bankAccountDetails || '');
    setSellerPhotoDataUrl(loggedInSeller.sellerPhotoDataUrl);
    setSellerCoverPhotoDataUrl(loggedInSeller.sellerCoverPhotoDataUrl || '');
    setPanDocDataUrl(loggedInSeller.panDocDataUrl);
    setAadhaarDocDataUrl(loggedInSeller.aadhaarDocDataUrl);
    setGstDocDataUrl(loggedInSeller.gstDocDataUrl || '');
    setBankDocDataUrl(loggedInSeller.bankDocDataUrl);
    setError('');
    setSuccessMsg('');
    setEditingRejected(true);
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (isBangladesh && !editingRejected) {
      setError(
        'Seller account registration is currently restricted to India only and is not available in Bangladesh.'
      );
      return;
    }

    const dobCheck = validateAdultDateOfBirth(dateOfBirth);
    if (!dobCheck.valid) {
      setError(
        dobCheck.error || 'Applicant must be at least 18 years old to register as a Seller.'
      );
      return;
    }

    // Email OTP verification is temporarily disabled during Seller Registration; Google Sign-In replaces separate password creation.
    if (!editingRejected && !googleSellerAuth) {
      setError('Please sign in with Google first to link your Seller account.');
      return;
    }

    setSubmitting(true);
    try {
      const saved = await api.submitSellerApplication({
        existingId: editingRejected ? loggedInSeller?.id : undefined,
        clientId: loggedInCustomer?.id,
        authUid: googleSellerAuth?.uid || loggedInSeller?.authUid,
        name,
        email: googleSellerAuth?.email || email,
        otpId: undefined,
        dateOfBirth: dobCheck.dob,
        fullAddress,
        phone,
        panNumber,
        aadhaarNumber,
        gstNumber,
        sellerPhotoDataUrl,
        sellerCoverPhotoDataUrl,
        panDocDataUrl,
        aadhaarDocDataUrl,
        gstDocDataUrl,
        bankDocDataUrl,
        bankAccountDetails,
      });

      // Privately sign in ONLY the submitting applicant so they can view their own Pending Seller ID & status
      setSellerSessionId(saved.id);
      setSellerSessionIdState(saved.id);
      setLoggedInSeller(saved);
      setGoogleSellerAuth(null);
      setEditingRejected(false);
      setSuccessMsg(
        `Application submitted! Your Seller ID is ${saved.sellerCode || 'Pending'} (Status: Pending Admin Approval).`
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

  const openHighlightModal = (
    prod: Product,
    presetType?: 'plan' | 'offer_seat',
    presetId?: string
  ) => {
    setHighlightTargetProduct(prod);
    setHighlightError('');
    setHighlightTxRef('');
    setHighlightScreenshot('');

    if (presetType && presetId) {
      setSelectedChoiceType(presetType);
      setSelectedChoiceId(presetId);
      return;
    }

    const firstAvailableSeat = enabledOfferSeats.find(
      (s) => Math.max(0, s.totalSeats - (highlightSeatUsage[s.id] || 0)) > 0
    );
    if (firstAvailableSeat) {
      setSelectedChoiceType('offer_seat');
      setSelectedChoiceId(firstAvailableSeat.id);
    } else if (enabledPlans.length > 0) {
      setSelectedChoiceType('plan');
      setSelectedChoiceId(enabledPlans[0].id);
    } else if (enabledOfferSeats.length > 0) {
      setSelectedChoiceType('offer_seat');
      setSelectedChoiceId(enabledOfferSeats[0].id);
    } else {
      setSelectedChoiceType('plan');
      setSelectedChoiceId('');
    }
  };

  const handleCopyHighlightUpi = async () => {
    try {
      await navigator.clipboard.writeText(activeHighlightUpi);
      setUpiCopied(true);
      setTimeout(() => setUpiCopied(false), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleUploadStoreProfileImage = async (
    target: 'photo' | 'cover',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStoreProfileError('');
    setStoreProfileNotice('');
    setUploadingStoreImg(target);
    setUploadStoreImgProgress(1);
    try {
      const record = await uploadMediaToCloudinary(file, {
        role: 'seller',
        appSource: 'glamour-galleria',
        folder: 'glamour-galleria/seller/profile',
        relatedEntityType: 'seller_profile',
        relatedEntityId: loggedInSeller?.id,
        uploadedByUid: loggedInSeller?.id,
        allowedTypes: ['image'],
        onProgress: (pct) => setUploadStoreImgProgress(pct),
      });
      if (target === 'photo') {
        setEditSellerPhoto(record.secureUrl);
      } else {
        setEditSellerCover(record.secureUrl);
      }
    } catch (err) {
      setStoreProfileError(
        err instanceof Error
          ? err.message
          : 'Could not upload selected image. Please try a different image file.'
      );
    } finally {
      setUploadingStoreImg(null);
      setUploadStoreImgProgress(null);
    }
  };

  const handleSaveStoreProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedInSeller) return;
    setStoreProfileError('');
    setStoreProfileNotice('');
    setSavingStoreProfile(true);
    try {
      const updated = await api.updateSellerStoreProfile(loggedInSeller.id, {
        name: editSellerName,
        sellerPhotoDataUrl: editSellerPhoto,
        sellerCoverPhotoDataUrl: editSellerCover,
      });
      setLoggedInSeller((prev) => (prev ? { ...prev, ...updated } : updated));
      setStoreProfileNotice(
        'Store profile (Seller Name, Profile Photo & Cover Photo) updated!'
      );
    } catch (err) {
      setStoreProfileError(
        formatApiError(err, 'Could not update your Seller Store Profile.')
      );
    } finally {
      setSavingStoreProfile(false);
    }
  };

  const handleSellerQrUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSellerPaymentError('');
    setSellerPaymentNotice('');
    setUploadingSellerQr(true);
    setUploadSellerQrProgress(1);
    try {
      const record = await uploadMediaToCloudinary(file, {
        role: 'seller',
        appSource: 'glamour-galleria',
        folder: 'glamour-galleria/seller/payment-qr',
        relatedEntityType: 'payment_qr',
        relatedEntityId: loggedInSeller?.id,
        uploadedByUid: loggedInSeller?.id,
        allowedTypes: ['image'],
        onProgress: (pct) => setUploadSellerQrProgress(pct),
      });
      setSellerQrDataUrl(record.secureUrl);
    } catch (err) {
      setSellerPaymentError(
        err instanceof Error
          ? err.message
          : 'Invalid QR code image. Please choose a valid JPG or PNG file.'
      );
    } finally {
      setUploadingSellerQr(false);
      setUploadSellerQrProgress(null);
    }
  };

  const handleSaveSellerPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedInSeller) return;
    setSellerPaymentError('');
    setSellerPaymentNotice('');

    const cleanUpi = sellerUpiId.trim();
    if (cleanUpi && !cleanUpi.includes('@')) {
      setSellerPaymentError(
        'Please enter a valid Seller UPI ID (e.g. sellername@axl).'
      );
      return;
    }

    setSavingSellerPayment(true);
    try {
      const updated = await api.updateSellerPaymentDetails(loggedInSeller.id, {
        sellerUpiId: cleanUpi,
        sellerBankAccountName: sellerBankAccountName.trim(),
        sellerBankName: sellerBankName.trim(),
        sellerBankAccountNo: sellerBankAccountNo.trim(),
        sellerBankIfscBranch: sellerBankIfscBranch.trim(),
        sellerQrDataUrl: sellerQrDataUrl.trim(),
      });
      setLoggedInSeller((prev) =>
        prev
          ? {
              ...prev,
              ...updated,
            }
          : updated
      );
      setSellerPaymentNotice(
        'Seller Payment System saved! Customers ordering your products (without product-level overrides) will see these payment details.'
      );
    } catch (err) {
      setSellerPaymentError(
        formatApiError(err, 'Could not save Seller Payment System.')
      );
    } finally {
      setSavingSellerPayment(false);
    }
  };

  const handleUploadHighlightScreenshot = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setHighlightError('');
    setUploadingHighlightShot(true);
    setUploadHighlightShotProgress(1);
    try {
      const record = await uploadMediaToCloudinary(file, {
        role: 'seller',
        appSource: 'glamour-galleria',
        folder: 'glamour-galleria/seller/highlight-payments',
        relatedEntityType: 'highlight_payment',
        relatedEntityId: highlightTargetProduct?.id || loggedInSeller?.id,
        uploadedByUid: loggedInSeller?.id,
        allowedTypes: ['image'],
        onProgress: (pct) => setUploadHighlightShotProgress(pct),
      });
      setHighlightScreenshot(record.secureUrl);
    } catch (err) {
      setHighlightError(
        err instanceof Error
          ? err.message
          : 'Invalid screenshot image. Please choose a valid JPG or PNG file.'
      );
    } finally {
      setUploadingHighlightShot(false);
      setUploadHighlightShotProgress(null);
    }
  };

  const handleSubmitHighlightRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedInSeller || !highlightTargetProduct || !selectedHighlightItem) {
      return;
    }
    setHighlightError('');

    if (selectedChoiceType === 'offer_seat') {
      const seat = enabledOfferSeats.find((s) => s.id === selectedChoiceId);
      const remaining = seat
        ? Math.max(0, seat.totalSeats - (highlightSeatUsage[seat.id] || 0))
        : 0;
      if (!seat || remaining <= 0) {
        setHighlightError('No remaining seats for this offer. Please pick another plan.');
        return;
      }
    }

    if (
      selectedHighlightItem.price > 0 &&
      !highlightTxRef.trim() &&
      !highlightScreenshot
    ) {
      setHighlightError(
        `Please pay ${formatCurrency(selectedHighlightItem.price, currencySymbol)} to ${activeHighlightUpi} and upload the screenshot or enter the UTR / Transaction ID.`
      );
      return;
    }

    setSubmittingHighlight(true);
    try {
      const created = await api.submitHighlightRequest({
        sellerId: loggedInSeller.id,
        productId: highlightTargetProduct.id,
        requestType: selectedChoiceType,
        planOrSeatId: selectedHighlightItem.id,
        transactionRef: highlightTxRef.trim(),
        paymentScreenshotDataUrl: highlightScreenshot,
      });
      setHighlightTargetProduct(null);
      setHighlightNotice(
        `Highlight request submitted for "${created.productName}" (${created.planTitle})! Pending Admin payment verification.`
      );
    } catch (err) {
      setHighlightError(
        formatApiError(err, 'Could not submit highlight request. Please try again.')
      );
    } finally {
      setSubmittingHighlight(false);
    }
  };

  const openBoostModal = (prod: Product) => {
    setBoostTargetProduct(prod);
    setBoostPct(
      prod.boostPercentage && prod.boostPercentage > 0
        ? clampBoostPercentage(prod.boostPercentage, 20)
        : 20
    );
    setBoostDays(3);
    setBoostTxRef('');
    setBoostScreenshot('');
    setBoostError('');
  };

  const handleCopyBoostUpi = async () => {
    try {
      await navigator.clipboard.writeText(activeHighlightUpi);
      setBoostUpiCopied(true);
      setTimeout(() => setBoostUpiCopied(false), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleUploadBoostScreenshot = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBoostError('');
    setUploadingBoostShot(true);
    setUploadBoostShotProgress(1);
    try {
      const record = await uploadMediaToCloudinary(file, {
        role: 'seller',
        appSource: 'glamour-galleria',
        folder: 'glamour-galleria/seller/boost-payments',
        relatedEntityType: 'boost_payment',
        relatedEntityId: boostTargetProduct?.id || loggedInSeller?.id,
        uploadedByUid: loggedInSeller?.id,
        allowedTypes: ['image'],
        onProgress: (pct) => setUploadBoostShotProgress(pct),
      });
      setBoostScreenshot(record.secureUrl);
    } catch (err) {
      setBoostError(
        err instanceof Error
          ? err.message
          : 'Invalid screenshot image. Please choose a valid JPG, PNG, or WEBP file.'
      );
    } finally {
      setUploadingBoostShot(false);
      setUploadBoostShotProgress(null);
    }
  };

  const handleSubmitBoostRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedInSeller || !boostTargetProduct) return;
    setBoostError('');

    const pct = clampBoostPercentage(boostPct, 20);
    const days = Math.min(365, Math.max(1, Math.round(Number(boostDays) || 1)));
    const expectedFee = calculateSellerBoostFee(pct, days);

    if (!boostScreenshot && !boostTxRef.trim()) {
      setBoostError(
        `Please pay ${formatCurrency(expectedFee, currencySymbol)} via online payment to ${activeHighlightUpi} and upload the payment screenshot (or enter Transaction / UTR ID).`
      );
      return;
    }

    setSubmittingBoost(true);
    try {
      const created = await api.submitBoostRequest({
        sellerId: loggedInSeller.id,
        productId: boostTargetProduct.id,
        boostPercentage: pct,
        durationDays: days,
        transactionRef: boostTxRef.trim(),
        paymentScreenshotDataUrl: boostScreenshot,
      });
      setBoostTargetProduct(null);
      setBoostNotice(
        `Boost request submitted for "${created.productName}" (${created.boostPercentage}% for ${created.durationDays} days · ${formatCurrency(created.amount, currencySymbol)})! Pending Admin payment approval.`
      );
    } catch (err) {
      setBoostError(
        formatApiError(err, 'Could not submit boost request. Please try again.')
      );
    } finally {
      setSubmittingBoost(false);
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
            src={getOptimizedMediaUrl(value, 'image')}
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
            {uploadingField === field
              ? `Uploading${uploadDocProgress !== null ? ` ${uploadDocProgress}%` : ''}...`
              : 'Upload Image'}
          </span>
          <span className="text-[10px] font-medium text-[#6B5B7B]">
            JPG / PNG / WEBP · Saved to Cloudinary
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
        Loading your Seller Hub...
      </div>
    );
  }

  // ============================================================================
  // 1. LOGGED-IN SELLER VIEW (PRIVATE TO AUTHENTICATED SELLER ONLY)
  // ============================================================================
  if (loggedInSeller && !editingRejected) {
    const isApproved =
      loggedInSeller.status === 'approved' &&
      loggedInSeller.accountActivated !== false;
    const isPending = loggedInSeller.status === 'pending';
    const isRejected = loggedInSeller.status === 'rejected';
    const isSuspended =
      loggedInSeller.status === 'suspended' ||
      (loggedInSeller.status === 'approved' &&
        loggedInSeller.accountActivated === false);

    // 1A. Authenticated Seller awaiting approval / rejected / suspended
    if (!isApproved) {
      return (
        <div className="space-y-5 max-w-3xl mx-auto">
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
              <span>Sign Out</span>
            </button>
          </div>

          {successMsg && (
            <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-xs font-semibold text-[#15803D] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-7 space-y-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#F4ECF8] pb-5">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-16 h-16 rounded-2xl border border-[#E6D9EE] bg-[#FDF9FE] overflow-hidden shrink-0 flex items-center justify-center">
                  {loggedInSeller.sellerPhotoDataUrl ? (
                    <img
                      src={loggedInSeller.sellerPhotoDataUrl}
                      alt={loggedInSeller.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Store className="w-7 h-7 text-[#9333EA]" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="font-display-serif text-2xl font-bold text-[#1F122B] truncate">
                    {loggedInSeller.name}
                  </h2>
                  <div className="text-xs text-[#6B5B7B] font-mono-num mt-0.5 flex flex-wrap items-center gap-x-2.5">
                    <span>{loggedInSeller.phone}</span>
                    {loggedInSeller.email && <span>· {loggedInSeller.email}</span>}
                    <span>· Submitted {loggedInSeller.createdAt.slice(0, 10)}</span>
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
                    ? 'Pending Admin Approval'
                    : isRejected
                      ? 'Application Rejected'
                      : 'Account Suspended / Disabled'}
                </span>
              </div>
            </div>

            {/* Generated Seller ID Box (Visible ONLY to this authenticated seller) */}
            <div className="rounded-2xl border border-[#E9D5FF] bg-[#FAF5FF] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold text-[#6D28D9]">
                  Your Private Seller ID (Save for Sign-In)
                </div>
                <div className="font-mono-num text-lg font-bold text-[#1F122B] select-all mt-0.5">
                  {loggedInSeller.sellerCode || 'Pending Assignment'}
                </div>
              </div>
              <div className="text-xs text-[#5B4B6B] max-w-sm">
                {isPending
                  ? 'You can sign back in anytime using this Seller ID or your registered Phone Number & Password to check approval status.'
                  : isRejected
                    ? 'Please review the note below, update your KYC/Bank details, and re-submit for approval.'
                    : 'Your seller account is currently suspended. Contact our support team via Help Center.'}
              </div>
            </div>

            {loggedInSeller.adminRemarks && (
              <div className="rounded-2xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs text-[#9F1239]">
                <strong>Admin Note:</strong> {loggedInSeller.adminRemarks}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <div className="text-[#6B5B7B]">Date of Birth</div>
                <div className="font-mono-num font-bold text-[#1F122B] mt-0.5">
                  {loggedInSeller.dateOfBirth || 'Provided'}
                </div>
              </div>
              <div>
                <div className="text-[#6B5B7B]">PAN Number</div>
                <div className="font-mono-num font-bold text-[#1F122B] mt-0.5">
                  {loggedInSeller.panNumber}
                </div>
              </div>
              <div>
                <div className="text-[#6B5B7B]">Aadhaar Number</div>
                <div className="font-mono-num font-bold text-[#1F122B] mt-0.5">
                  {loggedInSeller.aadhaarNumber}
                </div>
              </div>
              <div>
                <div className="text-[#6B5B7B]">GST Number</div>
                <div className="font-mono-num font-bold text-[#1F122B] mt-0.5">
                  {loggedInSeller.gstNumber || 'Not provided'}
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <div className="text-[#6B5B7B]">Full Address</div>
                <div className="font-medium text-[#1F122B] mt-0.5">
                  {loggedInSeller.fullAddress}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#F4ECF8]">
              <p className="text-xs text-[#6B5B7B]">
                {isPending
                  ? 'Product listing unlocks automatically as soon as Admin approves your application.'
                  : isRejected
                    ? 'Edit and re-submit your documents for Admin review.'
                    : 'Reach out to Admin support if you have questions about your account.'}
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

    // 1B. Authenticated Approved Seller Dashboard
    const approvedLiveCount = sellerProducts.filter(
      (p) => p.sellerApprovalStatus === 'approved'
    ).length;
    const pendingReviewCount = sellerProducts.filter(
      (p) =>
        p.sellerApprovalStatus !== 'approved' &&
        p.sellerApprovalStatus !== 'rejected'
    ).length;
    const activeHighlightedCount = sellerProducts.filter((p) =>
      isProductHighlightActive(p)
    ).length;

    const modalPayAmount = selectedHighlightItem?.price || 0;
    const highlightUpiDeepLink = buildUpiDeepLink(
      activeHighlightUpi,
      settings?.businessName || 'Glamour Galleria',
      modalPayAmount
    );
    const boostFeeAmount = calculateSellerBoostFee(boostPct, boostDays);
    const boostUpiDeepLink = buildUpiDeepLink(
      activeHighlightUpi,
      settings?.businessName || 'Glamour Galleria',
      boostFeeAmount
    );
    const hasSellerCustomPaymentConfigured = Boolean(
      loggedInSeller.sellerUpiId ||
        loggedInSeller.sellerBankAccountNo ||
        loggedInSeller.sellerQrDataUrl
    );

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
            <span>Seller Sign Out</span>
          </button>
        </div>

        {/* Approved Seller Profile Banner */}
        <div className="rounded-3xl border border-[#DCFCE7] bg-white/95 backdrop-blur-md overflow-hidden shadow-sm">
          {loggedInSeller.sellerCoverPhotoDataUrl && (
            <div className="h-28 sm:h-36 w-full overflow-hidden border-b border-[#EFE2F5] bg-gradient-to-r from-[#FDF2F8] to-[#F3E8FF]">
              <img
                src={loggedInSeller.sellerCoverPhotoDataUrl}
                alt={`${loggedInSeller.name} cover`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
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
                  <span>Approved Seller Account · Seller Hub</span>
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5 border-t md:border-t-0 md:border-l border-[#EFE2F5] pt-3 md:pt-0 md:pl-5 shrink-0">
              <div>
                <div className="text-[11px] text-[#6B5B7B]">Followers</div>
                <div className="font-mono-num text-lg font-bold text-[#7E22CE]">
                  {liveFollowersCount}
                </div>
              </div>
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
                <div className="text-[11px] text-[#6B5B7B]">Highlighted</div>
                <div className="font-mono-num text-lg font-bold text-[#DB2777]">
                  {activeHighlightedCount}
                  {pendingReviewCount > 0 ? (
                    <span className="text-[10px] text-[#B45309] ml-1">
                      ({pendingReviewCount} rev.)
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Editable Store Profile (Seller Name, Profile Photo & Cover Photo) */}
        <section className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7E22CE]">
                <Camera className="w-4 h-4 text-[#DB2777]" />
                <span>Store Profile (Name, Avatar &amp; Cover Photo)</span>
              </div>
              <p className="text-xs text-[#5B4B6B] mt-0.5">
                Customize how customers see your store page, profile picture, and cover banner. All uploads auto-compress to ~80–100KB.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (storeProfileOpen) {
                  closeSellerSubLayer(() => setStoreProfileOpen(false));
                } else {
                  setStoreProfileOpen(true);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-[#FAF5FF] px-3.5 py-2 text-xs font-bold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
            >
              <Store className="w-3.5 h-3.5" />
              <span>
                {storeProfileOpen ? 'Hide Store Profile' : 'Edit Store Profile'}
              </span>
            </button>
          </div>

          {storeProfileOpen && (
            <form
              onSubmit={handleSaveStoreProfile}
              className="pt-4 border-t border-[#F4ECF8] space-y-4"
            >
              {storeProfileError && (
                <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
                  {storeProfileError}
                </div>
              )}
              {storeProfileNotice && (
                <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3.5 py-2.5 text-xs font-semibold text-[#15803D] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{storeProfileNotice}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Seller / Store Name (English) <span className="text-[#DB2777]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editSellerName}
                  onChange={(e) => setEditSellerName(e.target.value)}
                  placeholder="Enter your Seller / Store Name in English"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FE] p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-[#1F122B]">
                    <span>Profile Photo</span>
                    <span className="text-[10px] font-medium text-[#6B5B7B]">
                      Saved to Cloudinary
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-2xl border border-[#D8B4FE] bg-white overflow-hidden shrink-0 flex items-center justify-center">
                      {editSellerPhoto ? (
                        <img
                          src={getOptimizedMediaUrl(editSellerPhoto, 'image')}
                          alt="Store profile"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Store className="w-6 h-6 text-[#9333EA]" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3 py-1.5 text-xs font-semibold text-[#6D28D9] cursor-pointer hover:border-[#9333EA]">
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {uploadingStoreImg === 'photo'
                            ? `Uploading${uploadStoreImgProgress !== null ? ` ${uploadStoreImgProgress}%` : ''}...`
                            : 'Upload Photo'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingStoreImg !== null}
                          onChange={(e) => handleUploadStoreProfileImage('photo', e)}
                          className="sr-only"
                        />
                      </label>
                      {editSellerPhoto && (
                        <button
                          type="button"
                          onClick={() => setEditSellerPhoto('')}
                          className="text-xs font-semibold text-[#BE123C] cursor-pointer hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FE] p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-[#1F122B]">
                    <span>Cover Photo</span>
                    <span className="text-[10px] font-medium text-[#6B5B7B]">
                      Cloudinary CDN
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-28 h-16 rounded-xl border border-[#D8B4FE] bg-white overflow-hidden shrink-0 flex items-center justify-center">
                      {editSellerCover ? (
                        <img
                          src={getOptimizedMediaUrl(editSellerCover, 'image')}
                          alt="Store cover"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-[#C084FC]" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3 py-1.5 text-xs font-semibold text-[#6D28D9] cursor-pointer hover:border-[#9333EA]">
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {uploadingStoreImg === 'cover'
                            ? `Uploading${uploadStoreImgProgress !== null ? ` ${uploadStoreImgProgress}%` : ''}...`
                            : 'Upload Cover'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingStoreImg !== null}
                          onChange={(e) => handleUploadStoreProfileImage('cover', e)}
                          className="sr-only"
                        />
                      </label>
                      {editSellerCover && (
                        <button
                          type="button"
                          onClick={() => setEditSellerCover('')}
                          className="text-xs font-semibold text-[#BE123C] cursor-pointer hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-[#F4ECF8]">
                <button
                  type="submit"
                  disabled={savingStoreProfile || uploadingStoreImg !== null}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {savingStoreProfile
                      ? 'Saving Store Profile...'
                      : 'Save Store Profile'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Approved Seller Payment System Card */}
        <section className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7E22CE]">
                <CreditCard className="w-4 h-4 text-[#DB2777]" />
                <span>My Seller Payment System (UPI / Bank / QR)</span>
                {hasSellerCustomPaymentConfigured && (
                  <span className="rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-2 py-0.5 text-[10px] font-bold text-[#15803D]">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-[#5B4B6B] mt-0.5">
                Configure your seller-wide UPI ID, Bank Details &amp; QR Code (saved to Cloudinary). Checkout priority:{' '}
                <strong>Product Custom Payment</strong> &rarr; <strong>Seller Payment System</strong> &rarr; Store Admin Payment.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (sellerPaymentOpen) {
                  closeSellerSubLayer(() => setSellerPaymentOpen(false));
                } else {
                  setSellerPaymentOpen(true);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-[#FAF5FF] px-3.5 py-2 text-xs font-bold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>
                {sellerPaymentOpen
                  ? 'Hide Payment Settings'
                  : hasSellerCustomPaymentConfigured
                    ? 'Edit My Payment Settings'
                    : 'Configure My Payment Details'}
              </span>
            </button>
          </div>

          {sellerPaymentOpen && (
            <form
              onSubmit={handleSaveSellerPayment}
              className="pt-4 border-t border-[#F4ECF8] space-y-4"
            >
              {sellerPaymentError && (
                <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
                  {sellerPaymentError}
                </div>
              )}
              {sellerPaymentNotice && (
                <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3.5 py-2.5 text-xs font-semibold text-[#15803D] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{sellerPaymentNotice}</span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-4 items-start">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      Seller UPI ID
                    </label>
                    <input
                      type="text"
                      value={sellerUpiId}
                      onChange={(e) => setSellerUpiId(e.target.value)}
                      placeholder="e.g. yourname@axl"
                      className={`${inputClass} font-mono-num`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={sellerBankAccountName}
                      onChange={(e) => setSellerBankAccountName(e.target.value)}
                      placeholder="Bank Account Holder"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={sellerBankName}
                      onChange={(e) => setSellerBankName(e.target.value)}
                      placeholder="e.g. SBI / HDFC Bank"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      Bank Account Number
                    </label>
                    <input
                      type="text"
                      value={sellerBankAccountNo}
                      onChange={(e) => setSellerBankAccountNo(e.target.value)}
                      placeholder="Account Number"
                      className={`${inputClass} font-mono-num`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      IFSC Code / Branch
                    </label>
                    <input
                      type="text"
                      value={sellerBankIfscBranch}
                      onChange={(e) => setSellerBankIfscBranch(e.target.value)}
                      placeholder="e.g. SBIN0001234, Branch Name"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FE] p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#1F122B]">
                    <span className="inline-flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-[#7E22CE]" />
                      Seller Payment QR
                    </span>
                    <span className="text-[10px] font-medium text-[#6B5B7B]">
                      Cloudinary
                    </span>
                  </div>

                  {sellerQrDataUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={getOptimizedMediaUrl(sellerQrDataUrl, 'image')}
                        alt="Seller payment QR"
                        referrerPolicy="no-referrer"
                        className="w-20 h-20 rounded-xl border border-[#D8B4FE] bg-white p-1 object-contain"
                      />
                      <div className="space-y-1.5">
                        <label className="inline-flex items-center gap-1 rounded-lg border border-[#D8B4FE] bg-white px-2.5 py-1 text-xs font-semibold text-[#6D28D9] cursor-pointer">
                          <Upload className="w-3 h-3" />
                          <span>
                            {uploadingSellerQr
                              ? `Uploading${uploadSellerQrProgress !== null ? ` ${uploadSellerQrProgress}%` : ''}...`
                              : 'Change QR'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploadingSellerQr}
                            onChange={handleSellerQrUpload}
                            className="sr-only"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setSellerQrDataUrl('')}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#BE123C] hover:underline cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Remove QR</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="rounded-xl border border-dashed border-[#D8B4FE] bg-white py-4 px-3 text-center flex flex-col items-center gap-1 hover:border-[#9333EA] cursor-pointer">
                      <QrCode className="w-5 h-5 text-[#9333EA]" />
                      <span className="text-xs font-semibold text-[#6D28D9]">
                        {uploadingSellerQr
                          ? `Uploading QR${uploadSellerQrProgress !== null ? ` ${uploadSellerQrProgress}%` : ''}...`
                          : 'Upload Seller Payment QR'}
                      </span>
                      <span className="text-[10px] text-[#6B5B7B]">
                        JPG / PNG · Saved to Cloudinary
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingSellerQr}
                        onChange={handleSellerQrUpload}
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F4ECF8]">
                <span className="text-[11px] text-[#6B5B7B]">
                  Leave fields empty to fall back to Store Admin Payment System automatically.
                </span>
                <button
                  type="submit"
                  disabled={savingSellerPayment || uploadingSellerQr}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {savingSellerPayment
                      ? 'Saving Payment Details...'
                      : 'Save My Payment Settings'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </section>

        {highlightNotice && (
          <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-xs font-semibold text-[#15803D] flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{highlightNotice}</span>
            </span>
            <button
              type="button"
              onClick={() => setHighlightNotice('')}
              className="text-[#15803D] hover:opacity-75 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {boostNotice && (
          <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-xs font-semibold text-[#15803D] flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Rocket className="w-4 h-4 shrink-0" />
              <span>{boostNotice}</span>
            </span>
            <button
              type="button"
              onClick={() => setBoostNotice('')}
              className="text-[#15803D] hover:opacity-75 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Admin Highlight Offer Seats Banner for Approved Sellers */}
        {(enabledOfferSeats.length > 0 || enabledPlans.length > 0) && (
          <section className="rounded-3xl border border-[#FBCFE8] bg-gradient-to-br from-[#FFF5FA] via-white to-[#FAF5FF] p-5 sm:p-6 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#DB2777]">
                  <Sparkles className="w-4 h-4" />
                  <span>Boost Your Products · Paid Highlight &amp; Offer Seats</span>
                </div>
                <h2 className="font-display-serif text-lg font-bold text-[#1F122B] mt-0.5">
                  Feature Your Products at the Top of Storefront
                </h2>
                <p className="text-xs text-[#5B4B6B]">
                  Click <strong>&ldquo;Highlight&rdquo;</strong> on any of your products below, pick a plan or limited Offer Seat, pay via UPI (<span className="font-mono-num font-bold text-[#6D28D9]">{activeHighlightUpi}</span>), and submit proof for instant Admin activation.
                </p>
              </div>
            </div>

            {enabledOfferSeats.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {enabledOfferSeats.map((seat) => {
                  const used = highlightSeatUsage[seat.id] || 0;
                  const remaining = Math.max(0, seat.totalSeats - used);
                  const soldOut = remaining <= 0;
                  return (
                    <div
                      key={seat.id}
                      className={`rounded-2xl border p-4 bg-white flex flex-col justify-between gap-3 ${
                        soldOut
                          ? 'border-[#E6D9EE] opacity-70'
                          : 'border-[#F9A8D4] shadow-xs'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-md bg-[#FDF2F8] border border-[#FBCFE8] px-2 py-0.5 text-[10px] font-bold text-[#DB2777]">
                            {seat.badgeText || 'OFFER SEAT'}
                          </span>
                          <span
                            className={`text-[11px] font-mono-num font-bold ${
                              soldOut ? 'text-[#BE123C]' : 'text-[#15803D]'
                            }`}
                          >
                            {soldOut
                              ? 'All Seats Claimed'
                              : `${remaining}/${seat.totalSeats} seats left`}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-[#1F122B]">
                          {seat.title}
                        </div>
                        <div className="flex items-baseline gap-2 font-mono-num">
                          <span className="text-base font-bold text-[#7E22CE]">
                            {formatCurrency(seat.price, currencySymbol)}
                          </span>
                          {seat.originalPrice && seat.originalPrice > seat.price && (
                            <span className="text-xs text-[#8E7C9E] line-through">
                              {formatCurrency(seat.originalPrice, currencySymbol)}
                            </span>
                          )}
                          <span className="text-xs text-[#5B4B6B]">
                            · {seat.durationDays} Days
                          </span>
                        </div>
                      </div>

                      {sellerProducts.length > 0 && !soldOut && (
                        <button
                          type="button"
                          onClick={() =>
                            openHighlightModal(
                              sellerProducts[0],
                              'offer_seat',
                              seat.id
                            )
                          }
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-2 px-3 text-xs font-semibold text-white hover:opacity-95 cursor-pointer"
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <span>Claim Offer Seat</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Seller Product Management (same workflow as Admin Product Listing) */}
        <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md">
          <ProductsView
            products={sellerProducts}
            currencySymbol={currencySymbol}
            defaultLowStock={defaultLowStock}
            hideBackButton
            pendingHighlightProductIds={pendingHighlightProductIds}
            pendingBoostProductIds={pendingBoostProductIds}
            onRequestHighlight={(prod) => openHighlightModal(prod)}
            onRequestBoost={(prod) => openBoostModal(prod)}
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

        {/* My Paid Highlight Requests Tracker */}
        {highlightRequests.length > 0 && (
          <section className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-[#F4ECF8] pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1F122B]">
                <Star className="w-4 h-4 text-[#DB2777]" />
                <span>My Product Highlight Requests ({highlightRequests.length})</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {highlightRequests.map((req) => (
                <div
                  key={req.id}
                  className="rounded-2xl border border-[#EFE2F5] bg-[#FDFBFE] p-4 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-[#1F122B] truncate">
                        {req.productName}
                      </div>
                      <div className="text-[#5B4B6B] font-mono-num mt-0.5">
                        {req.planTitle} · {req.durationDays} Days ·{' '}
                        <strong className="text-[#7E22CE]">
                          {formatCurrency(req.amount, currencySymbol)}
                        </strong>
                      </div>
                    </div>
                    <span
                      className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold shrink-0 ${
                        req.status === 'approved'
                          ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]'
                          : req.status === 'rejected'
                            ? 'border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C]'
                            : 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]'
                      }`}
                    >
                      {req.status === 'approved'
                        ? 'Approved & Active'
                        : req.status === 'rejected'
                          ? 'Rejected'
                          : 'Pending Approval'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6B5B7B] font-mono-num">
                    <span>
                      Submitted {req.createdAt.slice(0, 10)}
                      {req.transactionRef ? ` · UTR: ${req.transactionRef}` : ''}
                    </span>
                    {req.expiresAt && req.status === 'approved' && (
                      <span className="text-[#15803D] font-semibold">
                        Expires {req.expiresAt.slice(0, 10)}
                      </span>
                    )}
                  </div>
                  {req.adminRemarks && (
                    <div className="rounded-lg border border-[#FECDD3] bg-[#FFF1F2] px-2.5 py-1.5 text-[11px] text-[#9F1239]">
                      Admin Note: {req.adminRemarks}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* My Paid Boost Requests Tracker */}
        {boostRequests.length > 0 && (
          <section className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-[#F4ECF8] pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1F122B]">
                <Rocket className="w-4 h-4 text-[#7E22CE]" />
                <span>My Product Boost Requests ({boostRequests.length})</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {boostRequests.map((req) => (
                <div
                  key={req.id}
                  className="rounded-2xl border border-[#EFE2F5] bg-[#FDFBFE] p-4 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-[#1F122B] truncate">
                        {req.productName}
                      </div>
                      <div className="text-[#5B4B6B] font-mono-num mt-0.5">
                        Boost {req.boostPercentage}% · {req.durationDays}{' '}
                        {req.durationDays === 1 ? 'Day' : 'Days'} ·{' '}
                        <strong className="text-[#7E22CE]">
                          {formatCurrency(req.amount, currencySymbol)}
                        </strong>
                      </div>
                    </div>
                    <span
                      className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold shrink-0 ${
                        req.status === 'approved'
                          ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]'
                          : req.status === 'rejected'
                            ? 'border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C]'
                            : 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]'
                      }`}
                    >
                      {req.status === 'approved'
                        ? 'Approved & Active'
                        : req.status === 'rejected'
                          ? 'Rejected'
                          : 'Pending Approval'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6B5B7B] font-mono-num">
                    <span>
                      Submitted {req.createdAt.slice(0, 10)}
                      {req.transactionRef ? ` · UTR: ${req.transactionRef}` : ''}
                    </span>
                    {req.expiresAt && req.status === 'approved' && (
                      <span className="text-[#15803D] font-semibold">
                        Expires {req.expiresAt.slice(0, 10)}
                      </span>
                    )}
                  </div>
                  {req.adminRemarks && (
                    <div className="rounded-lg border border-[#FECDD3] bg-[#FFF1F2] px-2.5 py-1.5 text-[11px] text-[#9F1239]">
                      Admin Note: {req.adminRemarks}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Customer Ratings & Reviews on Seller's Products */}
        <section className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F4ECF8] pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#1F122B]">
              <MessageSquare className="w-4 h-4 text-[#7E22CE]" />
              <span>
                Customer Ratings &amp; Reviews ({sellerProductReviews.length})
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-[#5B4B6B] font-mono-num">
              <Users className="w-3.5 h-3.5 text-[#7E22CE]" />
              <span>{liveFollowersCount} Followers</span>
              {sellerProductReviews.length > 0 && (
                <span>
                  · ★{' '}
                  {(
                    sellerProductReviews.reduce((s, r) => s + r.rating, 0) /
                    sellerProductReviews.length
                  ).toFixed(1)}{' '}
                  Avg Rating
                </span>
              )}
            </div>
          </div>

          {sellerProductReviews.length === 0 ? (
            <p className="text-xs text-[#6B5B7B]">
              No customer ratings or reviews on your products yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sellerProductReviews.slice(0, 12).map((rev) => {
                const revProduct = sellerProducts.find(
                  (p) => p.id === rev.productId
                );
                return (
                  <div
                    key={rev.id}
                    className="rounded-2xl border border-[#EFE2F5] bg-[#FDFBFE] p-3.5 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#1F122B] truncate">
                        {rev.customerName}
                      </span>
                      <span className="text-[#D97706] font-mono-num font-bold shrink-0">
                        {'★'.repeat(rev.rating)}
                        <span className="text-[#D6C9E0]">
                          {'★'.repeat(Math.max(0, 5 - rev.rating))}
                        </span>
                      </span>
                    </div>
                    {revProduct && (
                      <div className="text-[11px] font-semibold text-[#7E22CE] truncate">
                        {revProduct.name}
                      </div>
                    )}
                    <p className="text-[#4A3B59] leading-relaxed">
                      {rev.comment}
                    </p>
                    <div className="text-[10px] text-[#8E7C9E] font-mono-num">
                      {rev.createdAt.slice(0, 10)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Paid Product Highlight Request Modal */}
        {highlightTargetProduct && (
          <div
            className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5"
            role="dialog"
            aria-modal="true"
          >
            <form
              onSubmit={handleSubmitHighlightRequest}
              className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-[#F4ECF8] pb-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#DB2777]">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>Highlight Product on Storefront</span>
                  </div>
                  <h3 className="font-display-serif text-lg font-bold text-[#1F122B] mt-0.5">
                    {highlightTargetProduct.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => closeSellerSubLayer(() => setHighlightTargetProduct(null))}
                  className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Allow switching which seller product to highlight */}
              {sellerProducts.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                    Select Product to Highlight
                  </label>
                  <select
                    value={highlightTargetProduct.id}
                    onChange={(e) => {
                      const found = sellerProducts.find(
                        (p) => p.id === e.target.value
                      );
                      if (found) setHighlightTargetProduct(found);
                    }}
                    className={inputClass}
                  >
                    {sellerProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatCurrency(p.sellingPrice, currencySymbol)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {highlightError && (
                <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
                  {highlightError}
                </div>
              )}

              {/* Offer Seats Selection */}
              {enabledOfferSeats.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-[#1F122B]">
                    Special Highlight Offer Seats
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {enabledOfferSeats.map((seat) => {
                      const used = highlightSeatUsage[seat.id] || 0;
                      const remaining = Math.max(0, seat.totalSeats - used);
                      const soldOut = remaining <= 0;
                      const isSelected =
                        selectedChoiceType === 'offer_seat' &&
                        selectedChoiceId === seat.id;
                      return (
                        <button
                          key={seat.id}
                          type="button"
                          disabled={soldOut}
                          onClick={() => {
                            setSelectedChoiceType('offer_seat');
                            setSelectedChoiceId(seat.id);
                          }}
                          className={`rounded-xl border p-3 text-left flex items-center justify-between gap-3 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            isSelected
                              ? 'border-[#DB2777] bg-[#FDF2F8] ring-1 ring-[#DB2777]'
                              : 'border-[#E6D9EE] bg-[#FDFBFE] hover:border-[#C084FC]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[#1F122B]">
                                {seat.title}
                              </span>
                              {seat.badgeText && (
                                <span className="rounded bg-[#DB2777] px-1.5 py-0.5 text-[9px] font-bold text-white">
                                  {seat.badgeText}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#6B5B7B] mt-0.5">
                              {seat.durationDays} Days ·{' '}
                              <span
                                className={
                                  soldOut
                                    ? 'text-[#BE123C] font-bold'
                                    : 'text-[#15803D] font-semibold'
                                }
                              >
                                {soldOut
                                  ? 'Sold Out'
                                  : `${remaining} of ${seat.totalSeats} seats available`}
                              </span>
                            </div>
                          </div>
                          <div className="text-right font-mono-num shrink-0">
                            <div className="text-sm font-bold text-[#7E22CE]">
                              {formatCurrency(seat.price, currencySymbol)}
                            </div>
                            {seat.originalPrice && seat.originalPrice > seat.price && (
                              <div className="text-[10px] text-[#8E7C9E] line-through">
                                {formatCurrency(seat.originalPrice, currencySymbol)}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Standard Highlight Plans Selection */}
              {enabledPlans.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-[#1F122B]">
                    Standard Highlight Plans
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {enabledPlans.map((plan) => {
                      const isSelected =
                        selectedChoiceType === 'plan' &&
                        selectedChoiceId === plan.id;
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => {
                            setSelectedChoiceType('plan');
                            setSelectedChoiceId(plan.id);
                          }}
                          className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-[#7E22CE] bg-[#FAF5FF] ring-1 ring-[#7E22CE]'
                              : 'border-[#E6D9EE] bg-[#FDFBFE] hover:border-[#C084FC]'
                          }`}
                        >
                          <div className="text-xs font-bold text-[#1F122B]">
                            {plan.label}
                          </div>
                          <div className="text-[11px] text-[#6B5B7B] font-mono-num mt-0.5">
                            {plan.durationDays} Days ·{' '}
                            <strong className="text-[#7E22CE]">
                              {formatCurrency(plan.price, currencySymbol)}
                            </strong>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Admin UPI Payment Box */}
              {selectedHighlightItem && (
                <div className="rounded-2xl border border-[#E9D5FF] bg-[#FAF5FF] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold text-[#6B5B7B]">
                        Pay {formatCurrency(modalPayAmount, currencySymbol)} to Admin UPI ID:
                      </div>
                      <div className="font-mono-num text-sm sm:text-base font-bold text-[#6D28D9] select-all">
                        {activeHighlightUpi}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyHighlightUpi}
                        className="inline-flex items-center gap-1 rounded-xl border border-[#D8B4FE] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#7E22CE] hover:bg-[#FAF5FF] cursor-pointer"
                      >
                        {upiCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#15803D]" />
                            <span className="text-[#15803D]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      <a
                        href={highlightUpiDeepLink}
                        className="rounded-xl bg-[#7E22CE] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
                      >
                        Pay App
                      </a>
                    </div>
                  </div>

                  {(adminLivePayment.upiNumber ||
                    adminLivePayment.bankAccountNo ||
                    adminLivePayment.bankName ||
                    adminLivePayment.qrDataUrl) && (
                    <div className="rounded-xl border border-[#EFE2F5] bg-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-[11px] text-[#4A3B59] space-y-0.5">
                        {adminLivePayment.upiNumber && (
                          <div className="font-mono-num">
                            UPI Number: <strong>{adminLivePayment.upiNumber}</strong>
                          </div>
                        )}
                        {adminLivePayment.bankAccountName && (
                          <div>
                            Account Holder: <strong>{adminLivePayment.bankAccountName}</strong>
                          </div>
                        )}
                        {adminLivePayment.bankName && (
                          <div>
                            Bank: <strong>{adminLivePayment.bankName}</strong>
                          </div>
                        )}
                        {adminLivePayment.bankAccountNo && (
                          <div className="font-mono-num">
                            A/C No: <strong>{adminLivePayment.bankAccountNo}</strong>
                          </div>
                        )}
                        {adminLivePayment.bankIfscBranch && (
                          <div>
                            IFSC / Branch: <strong>{adminLivePayment.bankIfscBranch}</strong>
                          </div>
                        )}
                      </div>
                      {adminLivePayment.qrDataUrl && (
                        <div className="flex flex-col items-center shrink-0">
                          <img
                            src={adminLivePayment.qrDataUrl}
                            alt="Admin Highlight Payment QR"
                            referrerPolicy="no-referrer"
                            className="w-24 h-24 rounded-lg border border-[#D8B4FE] object-contain bg-white p-1"
                          />
                          <span className="text-[10px] font-semibold text-[#6D28D9] mt-0.5">
                            Scan QR to Pay
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      Transaction / UTR ID (optional if uploading screenshot)
                    </label>
                    <input
                      type="text"
                      value={highlightTxRef}
                      onChange={(e) => setHighlightTxRef(e.target.value)}
                      placeholder="e.g. 412345678901"
                      className="w-full rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-[#4A3B59]">
                      Upload Payment Screenshot (Saved to Cloudinary)
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3 py-2 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {uploadingHighlightShot
                            ? `Uploading${uploadHighlightShotProgress !== null ? ` ${uploadHighlightShotProgress}%` : ''}...`
                            : highlightScreenshot
                              ? 'Change Screenshot'
                              : 'Upload Screenshot'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingHighlightShot}
                          onChange={handleUploadHighlightScreenshot}
                          className="sr-only"
                        />
                      </label>
                      {highlightScreenshot && (
                        <div className="flex items-center gap-2">
                          <img
                            src={getOptimizedMediaUrl(highlightScreenshot, 'image')}
                            alt="Highlight payment screenshot"
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-lg object-cover border border-[#D8B4FE]"
                          />
                          <span className="text-xs font-semibold text-[#15803D] inline-flex items-center gap-1">
                            <ImageIcon className="w-3.5 h-3.5" />
                            Attached
                          </span>
                          <button
                            type="button"
                            onClick={() => setHighlightScreenshot('')}
                            className="text-xs font-semibold text-[#BE123C] cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#F4ECF8]">
                <button
                  type="button"
                  onClick={() => closeSellerSubLayer(() => setHighlightTargetProduct(null))}
                  className="rounded-xl border border-[#E6D9EE] px-4 py-2 text-xs font-semibold text-[#5B4B6B] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    submittingHighlight ||
                    uploadingHighlightShot ||
                    !selectedHighlightItem
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-55"
                >
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {submittingHighlight
                      ? 'Submitting...'
                      : 'Submit Highlight Request'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Paid Percentage Boost Request Modal */}
        {boostTargetProduct && (
          <div
            className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5"
            role="dialog"
            aria-modal="true"
          >
            <form
              onSubmit={handleSubmitBoostRequest}
              className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-[#F4ECF8] pb-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7E22CE]">
                    <Rocket className="w-3.5 h-3.5" />
                    <span>Boost Product Ranking (1% – 100%)</span>
                  </div>
                  <h3 className="font-display-serif text-lg font-bold text-[#1F122B] mt-0.5">
                    {boostTargetProduct.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    closeSellerSubLayer(() => setBoostTargetProduct(null))
                  }
                  className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {sellerProducts.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                    Select Product to Boost
                  </label>
                  <select
                    value={boostTargetProduct.id}
                    onChange={(e) => {
                      const found = sellerProducts.find(
                        (p) => p.id === e.target.value
                      );
                      if (found) setBoostTargetProduct(found);
                    }}
                    className={inputClass}
                  >
                    {sellerProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatCurrency(p.sellingPrice, currencySymbol)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {boostError && (
                <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
                  {boostError}
                </div>
              )}

              {/* Manual Boost Power 1%–100% */}
              <BoostPowerControl
                value={boostPct}
                onChange={setBoostPct}
                disabled={submittingBoost}
                label="Choose Boost Power (1% – 100%)"
              />

              {/* Boost Duration (Days) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[#4A3B59]">
                    Boost Duration (Days)
                  </label>
                  <span className="text-[11px] text-[#6B5B7B] font-mono-num">
                    Rate: 10% for 1 Day = {formatCurrency(20, currencySymbol)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[1, 3, 7, 14, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={submittingBoost}
                      onClick={() => setBoostDays(d)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                        boostDays === d
                          ? 'border-[#7E22CE] bg-[#FAF5FF] text-[#6D28D9]'
                          : 'border-[#E6D9EE] bg-white text-[#5B4B6B]'
                      }`}
                    >
                      {d} {d === 1 ? 'Day' : 'Days'}
                    </button>
                  ))}
                  <div className="inline-flex items-center gap-1.5 ml-auto">
                    <span className="text-[11px] text-[#6B5B7B]">Days:</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      disabled={submittingBoost}
                      value={boostDays}
                      onChange={(e) =>
                        setBoostDays(
                          Math.min(
                            365,
                            Math.max(1, Math.round(Number(e.target.value) || 1))
                          )
                        )
                      }
                      className="w-16 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-2.5 py-1.5 text-xs font-mono-num font-bold text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Calculated Fee Summary */}
              <div className="rounded-2xl border border-[#FBCFE8] bg-gradient-to-r from-[#FFF5FA] to-[#FAF5FF] p-3.5 flex items-center justify-between gap-3">
                <div className="text-xs text-[#4A3B59] space-y-0.5">
                  <div className="font-bold text-[#1F122B]">
                    Total Boost Fee ({clampBoostPercentage(boostPct, 20)}% ×{' '}
                    {boostDays} {boostDays === 1 ? 'Day' : 'Days'})
                  </div>
                  <div className="text-[11px] font-mono-num text-[#6B5B7B]">
                    ({clampBoostPercentage(boostPct, 20)} ÷ 10) × {boostDays} ×{' '}
                    {formatCurrency(20, currencySymbol)}
                  </div>
                </div>
                <div className="font-mono-num text-xl font-bold text-[#7E22CE] shrink-0">
                  {formatCurrency(boostFeeAmount, currencySymbol)}
                </div>
              </div>

              {/* Online Payment Verification Box */}
              <div className="rounded-2xl border border-[#E9D5FF] bg-[#FAF5FF] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold text-[#6B5B7B]">
                      Pay {formatCurrency(boostFeeAmount, currencySymbol)} Online to Admin UPI ID:
                    </div>
                    <div className="font-mono-num text-sm sm:text-base font-bold text-[#6D28D9] select-all">
                      {activeHighlightUpi}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCopyBoostUpi}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#D8B4FE] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#7E22CE] hover:bg-[#FAF5FF] cursor-pointer"
                    >
                      {boostUpiCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#15803D]" />
                          <span className="text-[#15803D]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <a
                      href={boostUpiDeepLink}
                      className="rounded-xl bg-[#7E22CE] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
                    >
                      Pay App
                    </a>
                  </div>
                </div>

                {(adminLivePayment.upiNumber ||
                  adminLivePayment.bankAccountNo ||
                  adminLivePayment.bankName ||
                  adminLivePayment.qrDataUrl) && (
                  <div className="rounded-xl border border-[#EFE2F5] bg-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-[11px] text-[#4A3B59] space-y-0.5">
                      {adminLivePayment.upiNumber && (
                        <div className="font-mono-num">
                          UPI Number: <strong>{adminLivePayment.upiNumber}</strong>
                        </div>
                      )}
                      {adminLivePayment.bankAccountName && (
                        <div>
                          Account Holder: <strong>{adminLivePayment.bankAccountName}</strong>
                        </div>
                      )}
                      {adminLivePayment.bankName && (
                        <div>
                          Bank: <strong>{adminLivePayment.bankName}</strong>
                        </div>
                      )}
                      {adminLivePayment.bankAccountNo && (
                        <div className="font-mono-num">
                          A/C No: <strong>{adminLivePayment.bankAccountNo}</strong>
                        </div>
                      )}
                      {adminLivePayment.bankIfscBranch && (
                        <div>
                          IFSC / Branch: <strong>{adminLivePayment.bankIfscBranch}</strong>
                        </div>
                      )}
                    </div>
                    {adminLivePayment.qrDataUrl && (
                      <div className="flex flex-col items-center shrink-0">
                        <img
                          src={adminLivePayment.qrDataUrl}
                          alt="Admin Boost Payment QR"
                          referrerPolicy="no-referrer"
                          className="w-24 h-24 rounded-lg border border-[#D8B4FE] object-contain bg-white p-1"
                        />
                        <span className="text-[10px] font-semibold text-[#6D28D9] mt-0.5">
                          Scan QR to Pay
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                    Transaction / UTR ID (optional if uploading screenshot)
                  </label>
                  <input
                    type="text"
                    value={boostTxRef}
                    onChange={(e) => setBoostTxRef(e.target.value)}
                    placeholder="e.g. 412345678901"
                    className="w-full rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-[#4A3B59]">
                    Upload Payment Screenshot (Saved to Cloudinary)
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3 py-2 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {uploadingBoostShot
                          ? `Uploading${uploadBoostShotProgress !== null ? ` ${uploadBoostShotProgress}%` : ''}...`
                          : boostScreenshot
                            ? 'Change Screenshot'
                            : 'Upload Screenshot'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingBoostShot}
                        onChange={handleUploadBoostScreenshot}
                        className="sr-only"
                      />
                    </label>
                    {boostScreenshot && (
                      <div className="flex items-center gap-2">
                        <img
                          src={getOptimizedMediaUrl(boostScreenshot, 'image')}
                          alt="Boost payment screenshot"
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-cover border border-[#D8B4FE]"
                        />
                        <span className="text-xs font-semibold text-[#15803D] inline-flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5" />
                          Attached
                        </span>
                        <button
                          type="button"
                          onClick={() => setBoostScreenshot('')}
                          className="text-xs font-semibold text-[#BE123C] cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#F4ECF8]">
                <button
                  type="button"
                  onClick={() =>
                    closeSellerSubLayer(() => setBoostTargetProduct(null))
                  }
                  className="rounded-xl border border-[#E6D9EE] px-4 py-2 text-xs font-semibold text-[#5B4B6B] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBoost || uploadingBoostShot}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-55"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  <span>
                    {submittingBoost
                      ? 'Submitting...'
                      : `Submit Boost (${formatCurrency(boostFeeAmount, currencySymbol)})`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 2. SELLER HUB PORTAL (APPLY OR SIGN IN — ZERO PUBLIC STATUS EXPOSURE)
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
                hubTab === 'login' && !editingRejected
                  ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                  : 'text-[#5B4B6B] hover:text-[#1F122B]'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Seller Login</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingRejected(false);
                setHubTab('apply');
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                hubTab === 'apply' || editingRejected
                  ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                  : 'text-[#5B4B6B] hover:text-[#1F122B]'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Apply as Seller</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB A: SELLER SIGN IN WITH GOOGLE (WITH OPTIONAL LEGACY PASSWORD SIGN-IN) */}
      {hubTab === 'login' && !editingRejected && (
        <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-8 max-w-lg mx-auto space-y-5 shadow-sm">
          <div className="space-y-1 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#DB2777] to-[#7E22CE] text-white flex items-center justify-center mx-auto">
              <Store className="w-6 h-6" />
            </div>
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B] pt-1">
              Seller Hub Sign In
            </h1>
            <p className="text-xs text-[#6B5B7B]">
              Sign in with Google to open a Seller account, continue KYC onboarding, or access your private Seller Dashboard.
            </p>
          </div>

          {forgotSuccessMsg && (
            <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-xs font-semibold text-[#15803D] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{forgotSuccessMsg}</span>
            </div>
          )}

          {loginError && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
              {loginError}
            </div>
          )}

          <button
            type="button"
            disabled={googleSigningIn}
            onClick={handleSellerGoogleSignIn}
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
              {googleSigningIn ? 'Signing in with Google...' : 'Sign in with Google'}
            </span>
          </button>

          <div className="pt-2 border-t border-[#F4ECF8] space-y-3">
            <button
              type="button"
              onClick={() => {
                setShowLegacyPasswordLogin((prev) => !prev);
                setLoginForgotMode(false);
                setLoginError('');
              }}
              className="w-full text-center text-xs font-semibold text-[#6D28D9] hover:underline cursor-pointer"
            >
              {showLegacyPasswordLogin
                ? 'Hide Seller ID / Password Sign-In'
                : 'Existing Seller? Sign in with Seller ID & Password'}
            </button>

            {showLegacyPasswordLogin && (
              loginForgotMode ? (
                <form onSubmit={handleSellerForgotSubmit} className="space-y-4 pt-1">
                  <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] p-4 text-xs text-[#4A3B59] leading-relaxed">
                    <p className="font-bold text-[#1F122B] mb-1">
                      Password Reset Assistance
                    </p>
                    <p>
                      Email OTP verification is temporarily unavailable. You can sign in directly with your Google account above, or message the store administrator through <strong>Help Center</strong> with your Seller ID or registered phone number.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      closeSellerSubLayer(() => {
                        setLoginForgotMode(false);
                        setLoginError('');
                      })
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6D28D9] hover:underline cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Seller Login</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSellerLogin} className="space-y-4 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      Seller ID / Email / Phone (without +91){' '}
                      <span className="text-[#DB2777]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={loginIdent}
                      onChange={(e) => setLoginIdent(e.target.value)}
                      placeholder="e.g. GGS-54321045, seller@gmail.com, or 9876543210"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-semibold text-[#4A3B59]">
                        Seller Password <span className="text-[#DB2777]">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setLoginForgotMode(true);
                          setLoginError('');
                          setForgotSuccessMsg('');
                        }}
                        className="text-[11px] font-semibold text-[#7E22CE] hover:text-[#DB2777] hover:underline cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    </div>
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
                      {loginBusy ? 'Signing In...' : 'Sign In to Seller Hub'}
                    </span>
                  </button>
                </form>
              )
            )}
          </div>

          {!isBangladesh && (
            <div className="pt-3 border-t border-[#F4ECF8] flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B5B7B]">
              <span>New to Seller Hub?</span>
              <button
                type="button"
                onClick={() => {
                  setLoginForgotMode(false);
                  setHubTab('apply');
                }}
                className="font-bold text-[#7E22CE] hover:underline cursor-pointer"
              >
                Open Seller Account
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB B: SELLER GOOGLE SIGN-IN GATE + KYC APPLICATION FORM */}
      {(hubTab === 'apply' || editingRejected) && (
        <>
          <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-7 space-y-2 shadow-sm">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7E22CE]">
              <Store className="w-4 h-4 text-[#DB2777]" />
              <span>Seller Hub · Seller Onboarding &amp; KYC</span>
            </div>
            <h1 className="font-display-serif text-2xl sm:text-3xl font-bold text-[#1F122B]">
              {editingRejected
                ? 'Update & Re-submit Seller Application'
                : 'Open a Verified Seller Account'}
            </h1>
            <p className="text-xs sm:text-sm text-[#6B5B7B]">
              {isBangladesh && !editingRejected
                ? 'Seller registration is restricted to India only.'
                : !editingRejected && !googleSellerAuth
                  ? 'Connect with Google first — no separate password or Email OTP required. Then complete your Seller KYC details.'
                  : 'Must be at least 18 years old. Once submitted, you will receive your private Pending Seller ID and can sign in anytime with Google.'}
            </p>
          </div>

          {isBangladesh && !editingRejected ? (
            <div className="rounded-3xl border border-[#FBCFE8] bg-[#FFF5FA] p-6 sm:p-8 max-w-lg mx-auto space-y-4 shadow-sm text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#FFF1F2] border border-[#FECDD3] text-[#BE123C] flex items-center justify-center mx-auto">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h2 className="font-display-serif text-lg font-bold text-[#1F122B]">
                  Seller Registration Restricted to India Only
                </h2>
                <p className="text-xs sm:text-sm text-[#5B4B6B] leading-relaxed">
                  Opening a new Seller account is currently only available in India and is disabled for Bangladesh visitors. You can still browse all products and order directly via WhatsApp.
                </p>
              </div>
              <button
                type="button"
                onClick={onBackToShop}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs font-bold text-white hover:opacity-95 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Shopping</span>
              </button>
            </div>
          ) : !editingRejected && !googleSellerAuth ? (
            <div className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-8 max-w-lg mx-auto space-y-4 shadow-sm text-center">
              {error && (
                <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C] text-left">
                  {error}
                </div>
              )}

              <div className="w-12 h-12 rounded-2xl bg-[#FAF5FF] border border-[#E9D5FF] text-[#7E22CE] flex items-center justify-center mx-auto">
                <UserCheck className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="font-display-serif text-lg font-bold text-[#1F122B]">
                  Step 1: Sign in with Google
                </h2>
                <p className="text-xs text-[#6B5B7B] leading-relaxed">
                  Sign in with your Google account to automatically verify your email and proceed to the Seller KYC form. If you already applied earlier, you will go straight to your Seller account.
                </p>
              </div>

              <button
                type="button"
                disabled={googleSigningIn}
                onClick={handleSellerGoogleSignIn}
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
                  {googleSigningIn
                    ? 'Connecting Google Account...'
                    : 'Sign in with Google'}
                </span>
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmitApplication}
              className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-6 sm:p-7 space-y-6 shadow-sm"
            >
              {error && (
                <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
                  {error}
                </div>
              )}

              {googleSellerAuth && (
                <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#15803D]">
                  <div className="inline-flex items-center gap-2 font-semibold min-w-0">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      Google verified: <strong>{googleSellerAuth.email}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={googleSigningIn}
                    onClick={handleSellerGoogleSignIn}
                    className="font-bold text-[#6D28D9] hover:underline cursor-pointer shrink-0"
                  >
                    Switch Google Account
                  </button>
                </div>
              )}

              {/* Section 1: Business / Personal KYC Details */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[#1F122B] border-b border-[#F4ECF8] pb-2.5">
                  <Building2 className="w-4 h-4 text-[#7E22CE]" />
                  <span>1. Seller Personal &amp; KYC Details</span>
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
                      Phone Number (type 10 digits without +91){' '}
                      <span className="text-[#DB2777]">*</span>
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
                      Date of Birth (18+ Mandatory){' '}
                      <span className="text-[#DB2777]">*</span>
                    </label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="date"
                        required
                        max={maxAdultDob}
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className={`${inputClass} pl-10 font-mono-num`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      Email Address{' '}
                      {googleSellerAuth?.email && (
                        <span className="text-[11px] font-semibold text-[#15803D]">
                          (Pre-filled from Google)
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        readOnly={Boolean(googleSellerAuth?.email)}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seller@gmail.com"
                        className={`${inputClass} pl-10 ${
                          googleSellerAuth?.email
                            ? 'bg-[#F3F4F6] text-[#4A3B59] cursor-not-allowed'
                            : ''
                        }`}
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
                      maxLength={40}
                      value={panNumber}
                      onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                      placeholder="Enter PAN Number"
                      className={`${inputClass} font-mono-num uppercase`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      Aadhaar Number <span className="text-[#DB2777]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={40}
                      value={aadhaarNumber}
                      onChange={(e) => setAadhaarNumber(e.target.value)}
                      placeholder="Enter 12-digit or any Aadhaar Number"
                      className={`${inputClass} font-mono-num`}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      GST Number (optional)
                    </label>
                    <input
                      type="text"
                      maxLength={30}
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
                <span>2. Photo &amp; KYC Document Uploads (Cloudinary Secure Media)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                {renderDocUploader(
                  'sellerPhoto',
                  'Seller Photo',
                  'Clear passport/profile photo',
                  sellerPhotoDataUrl,
                  () => setSellerPhotoDataUrl(''),
                  true
                )}
                {renderDocUploader(
                  'sellerCoverPhoto',
                  'Seller Cover Photo',
                  'Store banner photo (optional)',
                  sellerCoverPhotoDataUrl,
                  () => setSellerCoverPhotoDataUrl(''),
                  false
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
                Saved privately as Pending until Admin approves &amp; activates your account.
              </span>

              <div className="flex items-center gap-2.5">
                {editingRejected && (
                  <button
                    type="button"
                    onClick={() => closeSellerSubLayer(() => setEditingRejected(false))}
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
                      : editingRejected
                        ? 'Re-submit Application'
                        : 'Submit Seller Application'}
                  </span>
                </button>
              </div>
            </div>
          </form>
          )}
        </>
      )}
    </div>
  );
};
