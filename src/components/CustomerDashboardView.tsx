import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  FileText,
  Image as ImageIcon,
  LogOut,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Phone,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import {
  AdminPaymentSettings,
  BusinessSettings,
  Client,
  CustomerCartItem,
  CustomerOrder,
  CustomerOrderItem,
  CustomerOrderPaymentMethod,
  DeliverySubscription,
  Invoice,
  OrderExchangeRequest,
  OrderExchangeRequestType,
  Product,
  SellerPublicPaymentProfile,
} from '../types/business';
import { api, formatApiError } from '../utils/api';
import {
  buildUpiDeepLink,
  COD_DELIVERY_CHARGE_PER_ITEM,
  DEFAULT_ADMIN_UPI_ID,
  DEFAULT_SETTINGS,
  EffectivePaymentDetails,
  exportInvoiceElementToPdf,
  formatCurrency,
  getSubscriptionRemainingDays,
  hasActiveDeliverySubscription,
  isOrderWithinExchangeWindow,
  normalizeAsianPhone,
  pickPrimaryCustomerSubscription,
  resolveEffectivePaymentDetails,
  resolveSubscriptionEffectiveStatus,
  resolveSubscriptionExpiresAtMs,
  stripPlus91Prefix,
  SUBSCRIPTION_DURATION_DAYS,
  SUBSCRIPTION_PLAN_PRICE,
  validateEnglishName,
} from '../utils/calculations';
import { getOptimizedMediaUrl, uploadMediaToCloudinary } from '../utils/cloudinary';
import { sanitizeNumericInput } from '../utils/numberInput';
import {
  getCartAwareRecommendations,
  getSmartRotationSeed,
  mergeSmartProfiles,
  ProductPopularitySignals,
  readLocalSmartProfile,
  recordSmartInteraction,
  SmartDiscoverableItem,
} from '../utils/smartDiscovery';
import {
  BANGLADESH_CHARGE_NOTICE,
  buildBangladeshWhatsAppOrderUrl,
  convertInrToBdt,
  displayCustomerPhone,
  formatBdt,
  isBangladeshClient,
  resolveBangladeshConfig,
  useBangladeshDetection,
} from '../utils/region';
import { CustomerAvatar } from './CustomerAvatar';
import { ScaledInvoicePreview } from './ScaledInvoicePreview';
import { SubscriptionPurchaseModal } from './SubscriptionPurchaseModal';

export type CustomerDashboardTab = 'cart' | 'orders' | 'bills';

export interface CartRecommendationItem extends SmartDiscoverableItem {
  imageDataUrl?: string;
  imageDataUrls?: string[];
  sourceUrl?: string;
  sourcePlatform?: Product['sourcePlatform'];
}

interface CustomerDashboardViewProps {
  client: Client;
  orders: CustomerOrder[];
  bills: Invoice[];
  settings?: BusinessSettings;
  products?: Product[];
  eligibleCatalogItems?: CartRecommendationItem[];
  popularityByProductId?: Map<string, ProductPopularitySignals>;
  paymentSettings?: AdminPaymentSettings;
  sellerPaymentProfiles?: Record<string, SellerPublicPaymentProfile>;
  subscriptions?: DeliverySubscription[];
  initialTab?: CustomerDashboardTab;
  onBackToShop: () => void;
  onLogout: () => void;
  onClientUpdated: (client: Client) => void;
  onSubscriptionCreated?: (subscription: DeliverySubscription) => void;
  onOpenProductFromOrder?: (productId?: string, productName?: string) => void;
}

export const CustomerDashboardView: React.FC<CustomerDashboardViewProps> = ({
  client,
  orders,
  bills,
  settings,
  products = [],
  eligibleCatalogItems,
  popularityByProductId,
  paymentSettings,
  sellerPaymentProfiles,
  subscriptions = [],
  initialTab = 'cart',
  onBackToShop,
  onLogout,
  onClientUpdated,
  onSubscriptionCreated,
  onOpenProductFromOrder,
}) => {
  const { isBangladesh: geoBangladesh } = useBangladeshDetection();
  const bdConfig = resolveBangladeshConfig(settings);
  const bdFeatureEnabled = bdConfig.enabled !== false;
  const isBangladesh =
    bdFeatureEnabled && (geoBangladesh || isBangladeshClient(client));
  const bdtRate = bdConfig.inrToBdtRate;

  const [activeTab, setActiveTab] = useState<CustomerDashboardTab>(initialTab);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Editable Saved Delivery Address in Account
  const [editingAddress, setEditingAddress] = useState(false);
  const [savedAddress, setSavedAddress] = useState(client.address || '');
  const [savedCity, setSavedCity] = useState(client.city || '');
  const [savedState, setSavedState] = useState(client.state || '');
  const [savedPin, setSavedPin] = useState(client.pinCode || '');
  const [savedWhatsapp, setSavedWhatsapp] = useState(() =>
    stripPlus91Prefix(displayCustomerPhone(client.whatsapp || client.mobile))
  );
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [addressSuccess, setAddressSuccess] = useState('');

  // Cart & Checkout states
  const [cartBusy, setCartBusy] = useState(false);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [checkoutName, setCheckoutName] = useState(client.name);
  const [checkoutPhone, setCheckoutPhone] = useState(() =>
    stripPlus91Prefix(displayCustomerPhone(client.mobile))
  );
  const [checkoutWhatsapp, setCheckoutWhatsapp] = useState(() =>
    stripPlus91Prefix(displayCustomerPhone(client.whatsapp || client.mobile))
  );
  const [checkoutAddress, setCheckoutAddress] = useState(client.address);
  const [checkoutCity, setCheckoutCity] = useState(client.city);
  const [checkoutState, setCheckoutState] = useState(client.state);
  const [checkoutPin, setCheckoutPin] = useState(client.pinCode);
  const [checkoutNote, setCheckoutNote] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<CustomerOrderPaymentMethod>('COD');
  const [upiScreenshotDataUrl, setUpiScreenshotDataUrl] = useState('');
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [screenshotProgress, setScreenshotProgress] = useState<number | null>(null);
  const [copiedUpiValue, setCopiedUpiValue] = useState<string | null>(null);
  const [copiedProductNumberKey, setCopiedProductNumberKey] = useState<string | null>(
    null
  );
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [orderNotice, setOrderNotice] = useState('');

  // Bill Viewer & Subscription Modal
  const [viewingBill, setViewingBill] = useState<Invoice | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Order Exchange (8-day window, up to 5 Cloudinary photos) & Help Request
  const [orderExchanges, setOrderExchanges] = useState<OrderExchangeRequest[]>([]);
  const [activeRequestForm, setActiveRequestForm] = useState<{
    orderId: string;
    type: OrderExchangeRequestType;
  } | null>(null);
  const [reqWhatsapp, setReqWhatsapp] = useState(() =>
    stripPlus91Prefix(displayCustomerPhone(client.whatsapp || client.mobile))
  );
  const [reqReason, setReqReason] = useState('');
  const [reqPhotoUrls, setReqPhotoUrls] = useState<string[]>([]);
  const [uploadingReqPhoto, setUploadingReqPhoto] = useState(false);
  const [reqPhotoProgress, setReqPhotoProgress] = useState<number | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [reqError, setReqError] = useState('');
  const [reqSuccess, setReqSuccess] = useState('');

  useEffect(() => {
    if (!client?.id) return;
    const unsub = api.subscribeCustomerOrderExchanges(
      client.id,
      (list) => setOrderExchanges(list),
      () => {
        // non-blocking fallback
      }
    );
    return () => unsub();
  }, [client?.id]);

  useEffect(() => {
    const refresh = () => setNowMs(Date.now());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setCheckoutName((prev) => prev || client.name);
    setCheckoutPhone(
      (prev) => prev || stripPlus91Prefix(displayCustomerPhone(client.mobile))
    );
    setCheckoutWhatsapp(
      (prev) =>
        prev ||
        stripPlus91Prefix(displayCustomerPhone(client.whatsapp || client.mobile))
    );
    setCheckoutAddress((prev) => prev || client.address);
    setCheckoutCity((prev) => prev || client.city);
    setCheckoutState((prev) => prev || client.state);
    setCheckoutPin((prev) => prev || client.pinCode);
    setSavedAddress(client.address || '');
    setSavedCity(client.city || '');
    setSavedState(client.state || '');
    setSavedPin(client.pinCode || '');
    setSavedWhatsapp(
      stripPlus91Prefix(displayCustomerPhone(client.whatsapp || client.mobile))
    );
  }, [client]);

  const sym = settings?.currencySymbol || '₹';
  const mergedSettings: BusinessSettings = settings || DEFAULT_SETTINGS;
  const cart: CustomerCartItem[] = useMemo(
    () => (Array.isArray(client.cart) ? client.cart : []),
    [client.cart]
  );

  const cartSubtotal = useMemo(
    () =>
      Number(
        cart
          .reduce(
            (sum, item) =>
              sum +
              Math.max(0, Number(item.price) || 0) *
                Math.max(1, Number(item.quantity) || 1),
            0
          )
          .toFixed(2)
      ),
    [cart]
  );

  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + Math.max(1, item.quantity || 1), 0),
    [cart]
  );

  const primarySubscription = useMemo(
    () => pickPrimaryCustomerSubscription(subscriptions, nowMs),
    [subscriptions, nowMs]
  );
  const subscriptionStatus = useMemo(
    () => resolveSubscriptionEffectiveStatus(primarySubscription, nowMs),
    [primarySubscription, nowMs]
  );
  const subscriptionRemainingDays = useMemo(
    () => getSubscriptionRemainingDays(primarySubscription, nowMs),
    [primarySubscription, nowMs]
  );
  const subscriptionExpiresAtMs = useMemo(
    () => resolveSubscriptionExpiresAtMs(primarySubscription),
    [primarySubscription]
  );
  const hasActiveSubscription = useMemo(
    () => hasActiveDeliverySubscription(subscriptions, client.id, nowMs),
    [subscriptions, client.id, nowMs]
  );

  const [cartSmartSeed] = useState(() => getSmartRotationSeed());
  const cartAwareSuggestions = useMemo(() => {
    if (cart.length === 0) return [];
    const catalogPool: CartRecommendationItem[] =
      eligibleCatalogItems && eligibleCatalogItems.length > 0
        ? eligibleCatalogItems
        : products
            .filter(
              (prod) =>
                !prod.sellerApprovalStatus ||
                prod.sellerApprovalStatus === 'approved'
            )
            .map((prod) => ({
              id: `cat-${prod.id}`,
              catalogProductId: prod.id,
              productNumber: prod.productNumber,
              name: prod.name,
              category: prod.category,
              price: prod.sellingPrice,
              originalPrice: prod.originalPrice,
              highlighted: Boolean(prod.highlighted),
              highlightPlacement: prod.highlightPlacement,
              boosted: Boolean(prod.boosted),
              boostPercentage: prod.boostPercentage,
              boostLevel: prod.boostLevel,
              boostExpiresAt: prod.boostExpiresAt,
              size: prod.size,
              color: prod.color,
              stockQty: prod.stockQty,
              imageDataUrl: prod.imageDataUrls?.[0] || prod.imageDataUrl || '',
              imageDataUrls: prod.imageDataUrls,
              description: prod.description,
              sellerId: prod.sellerId,
              sellerName: prod.sellerName,
              sourceUrl: prod.sourceUrl,
              sourcePlatform: prod.sourcePlatform,
              viewCount: prod.viewCount,
              wishlistCount: prod.wishlistCount,
              orderCount: prod.orderCount,
              createdAt: prod.createdAt,
            }));

    const localProfile = readLocalSmartProfile();
    const mergedProfile = mergeSmartProfiles(localProfile, client);
    return getCartAwareRecommendations(
      cart,
      catalogPool,
      mergedProfile,
      popularityByProductId || new Map(),
      cartSmartSeed,
      4
    );
  }, [
    cart,
    eligibleCatalogItems,
    products,
    client,
    popularityByProductId,
    cartSmartSeed,
  ]);

  const codDeliveryCharge =
    paymentMethod === 'COD' && !hasActiveSubscription
      ? COD_DELIVERY_CHARGE_PER_ITEM * cartItemCount
      : 0;
  const checkoutGrandTotal = Number(
    (cartSubtotal + codDeliveryCharge).toFixed(2)
  );

  // Resolve Product -> Seller -> Admin payment details per cart item & group by payee
  const payeeGroups = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        key: string;
        details: EffectivePaymentDetails;
        amount: number;
        itemNames: string[];
      }
    >();

    for (const item of cart) {
      const matchedProduct = item.productId
        ? products.find((p) => p.id === item.productId)
        : products.find(
            (p) =>
              p.name.trim().toLowerCase() === item.name.trim().toLowerCase()
          );
      const sellerId = matchedProduct?.sellerId || item.sellerId;
      const sellerProfile = sellerId
        ? sellerPaymentProfiles?.[sellerId]
        : undefined;
      const details = resolveEffectivePaymentDetails({
        product:
          matchedProduct ||
          (item.sellerId
            ? { sellerId: item.sellerId, sellerName: item.sellerName }
            : undefined),
        sellerProfile,
        adminPaymentSettings: paymentSettings,
        settings,
      });

      const qty = Math.max(1, Number(item.quantity) || 1);
      const lineTotal = Number(
        (qty * Math.max(0, Number(item.price) || 0)).toFixed(2)
      );
      const sig = [
        details.recipientType,
        details.sellerId || '',
        details.upiId,
        details.bankAccountNo,
        details.bankIfscBranch,
        details.qrDataUrl ? 'qr' : 'noqr',
      ].join('|');

      const existing = groupsMap.get(sig);
      if (existing) {
        existing.amount = Number((existing.amount + lineTotal).toFixed(2));
        existing.itemNames.push(item.name);
      } else {
        groupsMap.set(sig, {
          key: sig,
          details,
          amount: lineTotal,
          itemNames: [item.name],
        });
      }
    }

    if (groupsMap.size === 0) {
      const fallbackDetails = resolveEffectivePaymentDetails({
        adminPaymentSettings: paymentSettings,
        settings,
      });
      groupsMap.set('default-admin', {
        key: 'default-admin',
        details: fallbackDetails,
        amount: cartSubtotal,
        itemNames: [],
      });
    }

    return Array.from(groupsMap.values());
  }, [cart, products, sellerPaymentProfiles, paymentSettings, settings, cartSubtotal]);

  const handleProfilePhotoChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProfileError('');
    setPhotoUploading(true);
    try {
      const record = await uploadMediaToCloudinary(file, {
        role: 'customer',
        appSource: 'glamour-galleria',
        folder: 'glamour-galleria/customer/avatars',
        relatedEntityType: 'customer_avatar',
        relatedEntityId: client.id,
        uploadedByUid: client.id,
        allowedTypes: ['image'],
      });
      const updated = await api.updateCustomerProfilePhoto(client.id, record.secureUrl);
      onClientUpdated(updated);
    } catch (err) {
      setProfileError(
        formatApiError(err, 'Could not update your profile picture.')
      );
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleRemoveProfilePhoto = async () => {
    setProfileError('');
    setPhotoUploading(true);
    try {
      const updated = await api.updateCustomerProfilePhoto(client.id, '');
      onClientUpdated(updated);
    } catch (err) {
      setProfileError(
        formatApiError(err, 'Could not remove profile picture.')
      );
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleSaveDeliveryAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddressError('');
    setAddressSuccess('');
    setSavingAddress(true);
    try {
      const updated = await api.updateCustomerDeliveryAddress(client.id, {
        address: savedAddress,
        city: savedCity,
        state: savedState,
        pinCode: savedPin,
        whatsapp: savedWhatsapp,
      });
      onClientUpdated(updated);
      setCheckoutAddress(updated.address);
      setCheckoutCity(updated.city);
      setCheckoutState(updated.state);
      setCheckoutPin(updated.pinCode);
      setCheckoutWhatsapp(stripPlus91Prefix(updated.whatsapp || updated.mobile));
      setEditingAddress(false);
      setAddressSuccess('Delivery address saved to your account.');
    } catch (err) {
      setAddressError(formatApiError(err, 'Could not save delivery address.'));
    } finally {
      setSavingAddress(false);
    }
  };

  const syncCart = async (nextCart: CustomerCartItem[]) => {
    setCartBusy(true);
    setCheckoutError('');
    try {
      const updated = await api.updateCustomerCart(client.id, nextCart);
      onClientUpdated(updated);
    } catch (err) {
      setCheckoutError(formatApiError(err, 'Could not update cart.'));
    } finally {
      setCartBusy(false);
    }
  };

  const handleStepQty = async (itemId: string, delta: number) => {
    const nextCart = cart
      .map((item) => {
        if (item.id !== itemId) return item;
        const nextQty = Math.max(0, Math.floor((item.quantity || 1) + delta));
        return { ...item, quantity: nextQty };
      })
      .filter((item) => item.quantity > 0);
    setQtyDrafts((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
    await syncCart(nextCart);
  };

  const handleQtyTextChange = (itemId: string, raw: string) => {
    const clean = sanitizeNumericInput(raw, { allowDecimal: false });
    setQtyDrafts((prev) => ({ ...prev, [itemId]: clean }));
  };

  const handleQtyTextCommit = async (itemId: string) => {
    const draft = qtyDrafts[itemId];
    if (draft === undefined) return;
    const parsed = Math.max(1, Math.floor(Number(draft) || 1));
    setQtyDrafts((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
    const nextCart = cart.map((item) =>
      item.id === itemId ? { ...item, quantity: parsed } : item
    );
    await syncCart(nextCart);
  };

  const handleRemoveCartItem = async (itemId: string) => {
    const nextCart = cart.filter((item) => item.id !== itemId);
    await syncCart(nextCart);
  };

  const handleClearCart = async () => {
    await syncCart([]);
  };

  const handleAddRecommendedToCart = async (rec: CartRecommendationItem) => {
    const nextCart: CustomerCartItem[] = [...cart];
    const idx = nextCart.findIndex(
      (c) =>
        c.id === rec.id ||
        (rec.catalogProductId && c.productId === rec.catalogProductId)
    );
    if (idx >= 0) {
      nextCart[idx] = {
        ...nextCart[idx],
        quantity: Math.max(1, (nextCart[idx].quantity || 1) + 1),
      };
    } else {
      nextCart.push({
        id: rec.id,
        productId: rec.catalogProductId,
        productNumber: rec.productNumber,
        name: rec.name,
        category: rec.category,
        size: rec.size,
        color: rec.color,
        price: rec.price,
        originalPrice: rec.originalPrice,
        quantity: 1,
        imageDataUrl:
          rec.imageDataUrl ||
          (Array.isArray(rec.imageDataUrls) ? rec.imageDataUrls[0] : '') ||
          '',
        sellerId: rec.sellerId,
        sellerName: rec.sellerName,
        sourceUrl: rec.sourceUrl,
        sourcePlatform: rec.sourcePlatform,
      });
    }
    await syncCart(nextCart);
    const nextProfile = recordSmartInteraction({
      productId: (rec.catalogProductId || rec.id).replace(/^cat-/, ''),
      category: rec.category,
      price: rec.price,
      type: 'cart',
      quantity: 1,
    });
    void api.syncCustomerEngagementProfile(client.id, nextProfile);
  };

  const handleCopyUpi = async (upiValue: string) => {
    try {
      await navigator.clipboard.writeText(upiValue);
      setCopiedUpiValue(upiValue);
      setTimeout(() => {
        setCopiedUpiValue((curr) => (curr === upiValue ? null : curr));
      }, 2200);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleCopyProductNumber = async (key: string, value: string) => {
    const text = String(value || '').trim();
    if (!text) return;
    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.className = 'fixed -top-96 left-0 opacity-0 pointer-events-none';
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      setCopiedProductNumberKey(key);
      setTimeout(() => {
        setCopiedProductNumberKey((curr) => (curr === key ? null : curr));
      }, 2000);
    }
  };

  const handleUploadUpiScreenshot = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCheckoutError('');
    setUploadingScreenshot(true);
    setScreenshotProgress(1);
    try {
      const record = await uploadMediaToCloudinary(file, {
        role: 'customer',
        appSource: 'glamour-galleria',
        folder: 'glamour-galleria/customer/order-payments',
        relatedEntityType: 'order_payment',
        relatedEntityId: client.id,
        uploadedByUid: client.id,
        allowedTypes: ['image'],
        onProgress: (pct) => setScreenshotProgress(pct),
      });
      setUpiScreenshotDataUrl(record.secureUrl);
    } catch (err) {
      setCheckoutError(
        err instanceof Error
          ? err.message
          : 'Invalid screenshot image. Please upload a valid JPG, PNG, or WEBP file.'
      );
    } finally {
      setUploadingScreenshot(false);
      setScreenshotProgress(null);
    }
  };

  const handlePlaceCartOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    setCheckoutError('');
    setOrderNotice('');

    const nameCheck = validateEnglishName(checkoutName, 'Full Name');
    if (!nameCheck.valid) {
      setCheckoutError(
        nameCheck.error || 'Please enter your full name in English.'
      );
      return;
    }
    const phoneCheck = normalizeAsianPhone(checkoutPhone);
    if (!phoneCheck.valid) {
      setCheckoutError(
        phoneCheck.error || 'Please enter a valid mobile number.'
      );
      return;
    }

    let formattedWhatsapp = phoneCheck.formatted;
    if (checkoutWhatsapp.trim()) {
      const waCheck = normalizeAsianPhone(checkoutWhatsapp);
      if (!waCheck.valid) {
        setCheckoutError(
          `WhatsApp Number: ${waCheck.error || 'Please enter a valid mobile number.'}`
        );
        return;
      }
      formattedWhatsapp = waCheck.formatted;
    }

    if (!checkoutAddress.trim()) {
      setCheckoutError('Please enter your full delivery address.');
      return;
    }
    if (paymentMethod === 'UPI' && !upiScreenshotDataUrl) {
      const upiList = payeeGroups
        .map((g) => g.details.upiId)
        .filter(Boolean)
        .join(', ');
      setCheckoutError(
        `Please upload your UPI payment screenshot after paying${upiList ? ` to ${upiList}` : ' using the displayed Bank / QR details'}.`
      );
      return;
    }

    const orderItems: CustomerOrderItem[] = cart.map((item) => {
      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const unitPrice = Math.max(0, Number(item.price) || 0);
      const matchedProduct = item.productId
        ? products.find((p) => p.id === item.productId)
        : products.find(
            (p) =>
              p.name.trim().toLowerCase() === item.name.trim().toLowerCase()
          );
      const chosenImg = String(
        item.selectedImageUrl ||
          item.imageDataUrl ||
          matchedProduct?.imageDataUrls?.[0] ||
          matchedProduct?.imageDataUrl ||
          ''
      ).trim();
      return {
        id: item.id,
        productId: item.productId,
        productNumber: item.productNumber || matchedProduct?.productNumber,
        productName: item.name,
        productCategory: item.category,
        productSize: item.size,
        productColor: item.color,
        quantity: qty,
        unitPrice,
        originalPrice:
          item.originalPrice !== undefined
            ? Math.max(0, Number(item.originalPrice) || 0)
            : undefined,
        lineTotal: Number((qty * unitPrice).toFixed(2)),
        imageDataUrl: chosenImg,
        selectedImageUrl: chosenImg || undefined,
        sellerId: matchedProduct?.sellerId || item.sellerId,
        sellerName: matchedProduct?.sellerName || item.sellerName,
        sourceUrl: matchedProduct?.sourceUrl || item.sourceUrl,
        sourcePlatform: matchedProduct?.sourcePlatform || item.sourcePlatform,
      };
    });

    const totalUnits = orderItems.reduce((s, i) => s + i.quantity, 0);
    const first = orderItems[0];
    const firstWithSource = orderItems.find((it) => Boolean(it.sourceUrl));
    const singleGroup = payeeGroups.length === 1 ? payeeGroups[0].details : null;
    const upiIdUsed = singleGroup
      ? singleGroup.upiId || (singleGroup.bankAccountNo || singleGroup.qrDataUrl ? 'Bank/QR' : DEFAULT_ADMIN_UPI_ID)
      : payeeGroups
          .map((g) => g.details.upiId)
          .filter(Boolean)
          .join(', ') || 'Multiple';
    const paymentRecipientType: 'admin' | 'seller' | 'mixed' = singleGroup
      ? singleGroup.recipientType
      : 'mixed';
    const paymentRecipientName = singleGroup
      ? singleGroup.recipientName
      : payeeGroups
          .map((g) => g.details.recipientName)
          .filter(Boolean)
          .join(' + ')
          .slice(0, 140);

    setPlacingOrder(true);
    try {
      const res = await api.createCustomerOrder({
        clientId: client.id,
        clearCart: true,
        customerName: nameCheck.cleaned,
        customerPhone: phoneCheck.formatted,
        customerWhatsapp: formattedWhatsapp,
        customerEmail: client.email || undefined,
        customerAddress: checkoutAddress.trim(),
        customerCity: checkoutCity.trim(),
        customerState: checkoutState.trim(),
        customerPinCode: checkoutPin.trim(),
        items: orderItems,
        productId: first?.productId,
        productNumber:
          first?.productNumber ||
          orderItems.find((i) => i.productNumber)?.productNumber,
        productName:
          orderItems.length === 1
            ? first.productName
            : `${first.productName} + ${orderItems.length - 1} more`,
        productCategory: first?.productCategory,
        productSize: first?.productSize,
        productColor: first?.productColor,
        imageDataUrl: first?.selectedImageUrl || first?.imageDataUrl || undefined,
        selectedImageUrl:
          first?.selectedImageUrl || first?.imageDataUrl || undefined,
        sourceUrl: firstWithSource?.sourceUrl,
        sourcePlatform: firstWithSource?.sourcePlatform,
        quantity: totalUnits,
        unitPrice: first?.unitPrice || 0,
        paymentMethod,
        upiIdUsed,
        sellerId: singleGroup?.sellerId,
        paymentRecipientType,
        paymentRecipientName,
        paymentScreenshotDataUrl:
          paymentMethod === 'UPI' ? upiScreenshotDataUrl : '',
        customerNote: checkoutNote.trim(),
      });
      let latestProfile = undefined;
      for (const ordItem of orderItems) {
        latestProfile = recordSmartInteraction({
          productId: ordItem.productId || ordItem.id,
          category: ordItem.productCategory,
          price: ordItem.unitPrice,
          type: 'order',
          quantity: ordItem.quantity,
        });
      }
      if (latestProfile) {
        void api.syncCustomerEngagementProfile(client.id, latestProfile);
      }
      onClientUpdated({ ...res.client, cart: [] });
      setUpiScreenshotDataUrl('');
      setCheckoutNote('');
      setOrderNotice(
        `Order ${res.order.orderNumber} placed! Estimated delivery: ${res.order.estimatedDeliveryDate || '5 days'}.`
      );
      setActiveTab('orders');
    } catch (err) {
      setCheckoutError(
        formatApiError(err, 'Could not place your order. Please try again.')
      );
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleDownloadPdf = async (invoice: Invoice) => {
    if (!sheetRef.current) return;
    setExportingPdf(true);
    try {
      const safeName = (invoice.customerName || 'Customer').replace(
        /[^a-zA-Z0-9_-]+/g,
        '_'
      );
      await exportInvoiceElementToPdf(
        sheetRef.current,
        `${invoice.invoiceNumber}_${safeName}.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  // Full Bill Preview Modal/View
  if (viewingBill) {
    return (
      <div className="space-y-4">
        <div className="no-print max-w-[794px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setViewingBill(null)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Account</span>
            </button>
            <span className="text-xs font-semibold text-[#1F122B] bg-white/90 rounded-lg px-2.5 py-1">
              Invoice{' '}
              <strong className="font-mono-num text-[#6D28D9]">
                {viewingBill.invoiceNumber}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Bill</span>
            </button>
            <button
              type="button"
              disabled={exportingPdf}
              onClick={() => handleDownloadPdf(viewingBill)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              <span>{exportingPdf ? 'Creating PDF...' : 'Download PDF'}</span>
            </button>
          </div>
        </div>

        <div className="pb-6 max-w-[794px] mx-auto">
          <ScaledInvoicePreview
            invoice={viewingBill}
            settings={mergedSettings}
            sheetRef={sheetRef}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="no-print w-full max-w-full overflow-x-clip space-y-5">
      {/* Customer Profile Card */}
      <section className="w-full max-w-full overflow-hidden rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <CustomerAvatar
              photoDataUrl={client.profilePhotoDataUrl}
              name={client.name}
              size={64}
            />
            <div className="min-w-0 space-y-1">
              <h1 className="font-display-serif text-xl sm:text-2xl font-bold text-[#1F122B] truncate">
                {client.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5B4B6B]">
                {displayCustomerPhone(client.mobile) && (
                  <span className="inline-flex items-center gap-1 font-mono-num font-semibold">
                    <Phone className="w-3.5 h-3.5 text-[#7E22CE]" />
                    {displayCustomerPhone(client.mobile)}
                  </span>
                )}
                {client.email && (
                  <span className="text-xs text-[#6B5B7B]">
                    {client.email}
                  </span>
                )}
                {client.address && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#DB2777]" />
                    {[
                      client.address,
                      client.city,
                      client.state,
                      client.pinCode,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <label className="inline-flex items-center gap-1 rounded-lg border border-[#E6D9EE] bg-[#FDFBFE] px-2.5 py-1 text-[11px] font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer">
                  <Camera className="w-3 h-3" />
                  <span>
                    {photoUploading
                      ? 'Saving...'
                      : client.profilePhotoDataUrl
                        ? 'Change Photo'
                        : 'Upload Photo'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={photoUploading}
                    onChange={handleProfilePhotoChange}
                    className="sr-only"
                  />
                </label>
                {client.profilePhotoDataUrl && (
                  <button
                    type="button"
                    disabled={photoUploading}
                    onClick={handleRemoveProfilePhoto}
                    className="text-[11px] font-semibold text-[#BE123C] hover:underline cursor-pointer"
                  >
                    Remove Photo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingAddress((prev) => !prev);
                    setAddressError('');
                    setAddressSuccess('');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#E6D9EE] bg-[#FDFBFE] px-2.5 py-1 text-[11px] font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
                >
                  <MapPin className="w-3 h-3" />
                  <span>
                    {editingAddress
                      ? 'Cancel Address Edit'
                      : client.address
                        ? 'Edit Delivery Address'
                        : 'Add Delivery Address'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onBackToShop}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Continue Shopping</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2 text-xs font-semibold text-[#BE123C] hover:bg-[#FFE4E6] cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {addressSuccess && (
          <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3.5 py-2 text-xs font-semibold text-[#15803D] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{addressSuccess}</span>
          </div>
        )}

        {editingAddress && (
          <form
            onSubmit={handleSaveDeliveryAddress}
            className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] p-4 space-y-3"
          >
            <div className="text-xs font-bold text-[#1F122B]">
              Saved Delivery Address (for Faster Checkout)
            </div>
            {addressError && (
              <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-medium text-[#BE123C]">
                {addressError}
              </div>
            )}
            <div>
              <label className="block text-[11px] font-semibold text-[#4A3B59] mb-1">
                Full Delivery Address <span className="text-[#DB2777]">*</span>
              </label>
              <textarea
                rows={2}
                required
                value={savedAddress}
                onChange={(e) => setSavedAddress(e.target.value)}
                placeholder="House/Flat No, Street, Area, Landmark..."
                className="w-full rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={savedCity}
                onChange={(e) => setSavedCity(e.target.value)}
                placeholder="City"
                className="rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
              <input
                type="text"
                value={savedState}
                onChange={(e) => setSavedState(e.target.value)}
                placeholder="State"
                className="rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
              <input
                type="text"
                inputMode="numeric"
                value={savedPin}
                onChange={(e) =>
                  setSavedPin(
                    sanitizeNumericInput(e.target.value, { allowDecimal: false })
                  )
                }
                placeholder="PIN Code"
                className="rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
              <input
                type="tel"
                inputMode="tel"
                value={savedWhatsapp}
                onChange={(e) => setSavedWhatsapp(e.target.value)}
                placeholder="WhatsApp (10 digits)"
                className="rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={savingAddress}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{savingAddress ? 'Saving...' : 'Save Address'}</span>
              </button>
            </div>
          </form>
        )}

        {profileError && (
          <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2 text-xs font-medium text-[#BE123C]">
            {profileError}
          </div>
        )}

        {orderNotice && (
          <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-xs font-semibold text-[#15803D] flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{orderNotice}</span>
            </span>
            <button
              type="button"
              onClick={() => setOrderNotice('')}
              className="text-[#15803D] hover:opacity-75 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Account Navigation Tabs */}
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#F8F3FB] border border-[#EFE2F5]">
          <button
            type="button"
            onClick={() => setActiveTab('cart')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'cart'
                ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                : 'text-[#5B4B6B] hover:text-[#1F122B]'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Cart ({cartItemCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'orders'
                ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                : 'text-[#5B4B6B] hover:text-[#1F122B]'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Orders ({orders.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bills')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'bills'
                ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                : 'text-[#5B4B6B] hover:text-[#1F122B]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Bills ({bills.length})</span>
          </button>
        </div>
      </section>

      {/* ₹99 FREE DELIVERY SUBSCRIPTION CARD (ATM CARD DESIGN — CUSTOMER ACCOUNT) */}
      <section className="relative w-full max-w-full overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-[#1E0B3B] via-[#5B21B6] to-[#BE185D] p-5 sm:p-6 space-y-5 text-white shadow-xl">
        {/* Subtle metallic ATM card sheen */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-16 w-60 h-60 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-16 w-60 h-60 rounded-full bg-[#F472B6]/20 blur-2xl"
        />

        {/* ATM Card Top Row: GG PASS + EMV Chip & Contactless Icon + Pass Status Badges */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-3.5">
          <div className="flex items-center gap-3">
            {/* Metallic EMV Chip */}
            <div
              aria-hidden="true"
              className="w-10 h-7 rounded-md border border-[#FDE68A]/70 bg-gradient-to-br from-[#FEF08A] via-[#F59E0B] to-[#B45309] shadow-inner relative overflow-hidden shrink-0"
            >
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-[#78350F]/45" />
              <div className="absolute inset-y-0 left-1/3 w-px bg-[#78350F]/45" />
              <div className="absolute inset-y-0 right-1/3 w-px bg-[#78350F]/45" />
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono-num text-base sm:text-lg font-extrabold tracking-[0.22em] uppercase text-white drop-shadow-xs">
                GG PASS
              </span>
              {/* Contactless NFC waves */}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="w-4 h-4 text-white/80 shrink-0"
              >
                <path d="M8.5 16.5a5 5 0 0 1 0-9" />
                <path d="M12 19a8.5 8.5 0 0 1 0-14" />
                <path d="M15.5 21.5a12 12 0 0 1 0-19" />
              </svg>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/15 backdrop-blur-xs px-2.5 py-1 text-[11px] font-bold text-white">
              <Sparkles className="w-3.5 h-3.5 text-[#FDE68A]" />
              <span>₹{SUBSCRIPTION_PLAN_PRICE} Free Delivery Pass</span>
            </span>
            {subscriptionStatus === 'active' && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 py-1 text-[11px] font-bold text-[#15803D]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Active Pass</span>
              </span>
            )}
            {subscriptionStatus === 'pending' && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-2.5 py-1 text-[11px] font-bold text-[#B45309]">
                <Clock className="w-3.5 h-3.5" />
                <span>Verification Pending</span>
              </span>
            )}
            {subscriptionStatus === 'expired' && (
              <span className="rounded-lg border border-white/30 bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white">
                Expired
              </span>
            )}
            {subscriptionStatus === 'rejected' && (
              <span className="rounded-lg border border-[#FECDD3] bg-[#FFF1F2] px-2.5 py-1 text-[11px] font-bold text-[#BE123C]">
                Rejected — Re-apply
              </span>
            )}
          </div>
        </div>

        {/* ATM Card Middle Body: Existing Text + Countdown / Proof / CTA */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            {subscriptionStatus === 'active' ? (
              <div className="space-y-1">
                <h2 className="font-display-serif text-lg sm:text-xl font-bold text-white">
                  Free Delivery Pass Active!
                </h2>
                <p className="text-xs text-white/90">
                  Enjoy ₹0 delivery fee on all eligible orders.
                  {subscriptionExpiresAtMs && (
                    <span className="ml-1 font-mono-num text-[#FDE68A] font-semibold">
                      (Valid till {new Date(subscriptionExpiresAtMs).toISOString().slice(0, 10)})
                    </span>
                  )}
                </p>
              </div>
            ) : subscriptionStatus === 'pending' ? (
              <div className="space-y-1">
                <h2 className="font-display-serif text-lg sm:text-xl font-bold text-white">
                  Payment Verification Pending
                </h2>
                <p className="text-xs text-white/90">
                  Your ₹{SUBSCRIPTION_PLAN_PRICE} payment screenshot has been submitted for Admin verification. Once approved, your {SUBSCRIPTION_DURATION_DAYS}-day free delivery will begin.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <h2 className="font-display-serif text-lg sm:text-xl font-bold text-white">
                  {formatCurrency(SUBSCRIPTION_PLAN_PRICE, sym)} /{' '}
                  {SUBSCRIPTION_DURATION_DAYS} Days Free Delivery Pass
                </h2>
                <p className="text-xs text-white/90">
                  Enjoy unlimited free delivery for 28 days at just ₹{SUBSCRIPTION_PLAN_PRICE}!
                </p>
              </div>
            )}
          </div>

          {subscriptionStatus === 'active' ? (
            <div className="rounded-2xl border border-white/25 bg-white/15 backdrop-blur-md px-4 py-3 text-center shrink-0">
              <div className="font-mono-num text-2xl font-bold text-[#FDE68A]">
                {subscriptionRemainingDays}{' '}
                {subscriptionRemainingDays === 1 ? 'Day' : 'Days'} Left
              </div>
              <div className="text-[11px] font-semibold text-white/90">
                {subscriptionRemainingDays}{' '}
                {subscriptionRemainingDays === 1 ? 'day' : 'days'} remaining
              </div>
            </div>
          ) : subscriptionStatus === 'pending' ? (
            <div className="flex items-center gap-3 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-2.5 shrink-0">
              {primarySubscription?.paymentDetails?.paymentScreenshotUrl && (
                <img
                  src={getOptimizedMediaUrl(
                    primarySubscription.paymentDetails.paymentScreenshotUrl,
                    'image'
                  )}
                  alt="Uploaded subscription proof"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 max-w-full rounded-xl object-cover border border-[#FDE68A] shrink-0"
                />
              )}
              <div className="text-xs space-y-0.5">
                <div className="font-bold text-[#B45309]">
                  Screenshot Uploaded
                </div>
                <div className="text-[11px] text-[#92400E]">
                  Awaiting Admin Approval
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSubModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-xs sm:text-sm font-bold text-[#5B21B6] shadow-md hover:bg-[#FAF5FF] cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4 text-[#DB2777] shrink-0" />
              <span>
                ₹{SUBSCRIPTION_PLAN_PRICE} / {SUBSCRIPTION_DURATION_DAYS} Days Free Delivery Pass
              </span>
            </button>
          )}
        </div>

        {/* ATM Card Bottom Strip: Cardholder & Validity */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/15 text-[11px] font-mono-num uppercase tracking-wider text-white/80">
          <div className="truncate">
            <span className="text-white/60 mr-1.5">Cardholder</span>
            <span className="font-bold text-white">{client.name}</span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <span>
              <span className="text-white/60 mr-1">Plan</span>
              <strong className="text-white">₹{SUBSCRIPTION_PLAN_PRICE}</strong>
            </span>
            <span>
              <span className="text-white/60 mr-1">Validity</span>
              <strong className="text-white">
                {SUBSCRIPTION_DURATION_DAYS} Days
              </strong>
            </span>
          </div>
        </div>

        {subscriptionStatus !== 'active' && subscriptionStatus !== 'pending' && (
          <div className="relative z-10 rounded-2xl border border-white/25 bg-white/95 p-3.5 space-y-1.5 text-[11px] text-[#5B4B6B]">
            <div className="font-bold text-[#1F122B] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#7E22CE]" />
              <span>Terms &amp; Rules</span>
            </div>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                Validity: <strong>28 days</strong> from Admin activation/approval.
              </li>
              <li>
                Free delivery (<strong>₹0 delivery fee</strong>) on eligible orders during the active pass period.
              </li>
              <li>
                <strong>Online payment + screenshot proof required</strong>; Cash on Delivery (COD) is disabled.
              </li>
              <li>
                Non-refundable ₹{SUBSCRIPTION_PLAN_PRICE} pass; expires automatically after 28 days.
              </li>
            </ul>
          </div>
        )}
      </section>

      {/* TAB 1: CART & MULTI-ITEM CHECKOUT */}
      {activeTab === 'cart' && (
        <section className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-5 sm:p-6 space-y-5">
          {cart.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <ShoppingCart className="w-10 h-10 text-[#C4B5D9] mx-auto" />
              <h2 className="text-base font-bold text-[#1F122B]">
                Your shopping cart is empty
              </h2>
              <p className="text-xs text-[#6B5B7B] max-w-md mx-auto">
                Browse our Beauty, Perfume &amp; Boutique collection and tap &ldquo;Add to Cart&rdquo; on any product to save it to your account.
              </p>
              <button
                type="button"
                onClick={onBackToShop}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Browse Products</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6 items-start">
              {/* Cart Items List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-[#1F122B]">
                    Cart Items ({cart.length})
                  </h2>
                  <button
                    type="button"
                    disabled={cartBusy}
                    onClick={handleClearCart}
                    className="text-xs font-semibold text-[#BE123C] hover:underline cursor-pointer"
                  >
                    Clear Cart
                  </button>
                </div>

                <div className="space-y-3">
                  {cart.map((item) => {
                    const qtyVal =
                      qtyDrafts[item.id] !== undefined
                        ? qtyDrafts[item.id]
                        : String(item.quantity || 1);
                    const lineTotal =
                      Math.max(1, item.quantity || 1) * (item.price || 0);
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] p-3.5 flex items-center gap-3.5"
                      >
                        <div className="w-16 h-16 max-w-full rounded-xl border border-[#EFE2F5] bg-white overflow-hidden shrink-0 flex items-center justify-center">
                          {item.imageDataUrl ? (
                            <img
                              src={getOptimizedMediaUrl(item.imageDataUrl, 'image')}
                              alt={item.name}
                              width={64}
                              height={64}
                              referrerPolicy="no-referrer"
                              className="w-full h-full max-w-full object-cover block"
                            />
                          ) : (
                            <ShoppingBag className="w-5 h-5 text-[#C084FC]" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="text-sm font-bold text-[#1F122B] truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-[#6B5B7B] truncate">
                            {[
                              item.category,
                              item.size ? `Size ${item.size}` : '',
                              item.color,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Standard'}
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="inline-flex items-center rounded-lg border border-[#E6D9EE] bg-white">
                              <button
                                type="button"
                                disabled={cartBusy}
                                onClick={() => handleStepQty(item.id, -1)}
                                className="p-1.5 text-[#5B4B6B] hover:text-[#1F122B] cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={qtyVal}
                                onChange={(e) =>
                                  handleQtyTextChange(item.id, e.target.value)
                                }
                                onBlur={() => handleQtyTextCommit(item.id)}
                                className="w-9 text-center text-xs font-mono-num font-bold text-[#1F122B] bg-transparent focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={cartBusy}
                                onClick={() => handleStepQty(item.id, 1)}
                                className="p-1.5 text-[#5B4B6B] hover:text-[#1F122B] cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="flex items-center gap-2.5">
                              <div className="text-right font-mono-num">
                                <div className="flex items-baseline justify-end gap-1.5 flex-wrap">
                                  <span className="text-sm font-bold text-[#7E22CE]">
                                    {formatCurrency(lineTotal, sym)}
                                  </span>
                                  {isBangladesh && (
                                    <span className="text-xs font-bold text-[#0F766E]">
                                      · {formatBdt(convertInrToBdt(lineTotal, bdtRate))}
                                    </span>
                                  )}
                                  {item.originalPrice &&
                                    item.originalPrice > item.price && (
                                      <span className="text-[11px] text-[#8E7C9E] line-through">
                                        {formatCurrency(
                                          item.originalPrice *
                                            Math.max(1, item.quantity || 1),
                                          sym
                                        )}
                                      </span>
                                    )}
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={cartBusy}
                                onClick={() => handleRemoveCartItem(item.id)}
                                title="Remove from cart"
                                className="p-1 rounded-lg text-[#6B5B7B] hover:text-[#BE123C] cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[#4A3B59]">
                    Cart Total ({cartItemCount} units)
                  </span>
                  <div className="text-right font-mono-num">
                    <div className="text-lg font-bold text-[#7E22CE]">
                      {formatCurrency(cartSubtotal, sym)}
                    </div>
                    {isBangladesh && (
                      <div className="text-sm font-bold text-[#0F766E]">
                        {formatBdt(convertInrToBdt(cartSubtotal, bdtRate))}
                      </div>
                    )}
                  </div>
                </div>

                {cartAwareSuggestions.length > 0 && (
                  <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#1F122B]">
                        <Sparkles className="w-3.5 h-3.5 text-[#DB2777]" />
                        <span>Recommended Add-Ons for Your Cart</span>
                      </div>
                      {hasActiveSubscription && (
                        <span className="text-[10px] font-bold text-[#047857]">
                          Free Delivery Eligible
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {cartAwareSuggestions.map((rec) => {
                        const thumb =
                          rec.imageDataUrl ||
                          (Array.isArray(rec.imageDataUrls)
                            ? rec.imageDataUrls[0]
                            : '') ||
                          '';
                        return (
                          <div
                            key={rec.id}
                            className="rounded-xl border border-[#EFE2F5] bg-white p-2.5 flex items-center gap-2.5"
                          >
                            <div className="w-12 h-12 rounded-lg border border-[#EFE2F5] bg-[#FDF9FC] overflow-hidden shrink-0 flex items-center justify-center">
                              {thumb ? (
                                <img
                                  src={getOptimizedMediaUrl(thumb, 'image')}
                                  alt={rec.name}
                                  width={48}
                                  height={48}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover block"
                                />
                              ) : (
                                <ShoppingBag className="w-4 h-4 text-[#C084FC]" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-[#1F122B] truncate">
                                {rec.name}
                              </div>
                              <div className="text-[10px] text-[#6B5B7B] truncate">
                                {rec.category}
                              </div>
                              <div className="flex items-baseline gap-1.5 font-mono-num mt-0.5">
                                <span className="text-xs font-bold text-[#7E22CE]">
                                  {formatCurrency(rec.price, sym)}
                                </span>
                                {rec.originalPrice &&
                                  rec.originalPrice > rec.price && (
                                    <span className="text-[10px] text-[#8E7C9E] line-through">
                                      {formatCurrency(rec.originalPrice, sym)}
                                    </span>
                                  )}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={cartBusy}
                              onClick={() => handleAddRecommendedToCart(rec)}
                              className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-[#FDF2F8] border border-[#FBCFE8] px-2.5 py-1.5 text-[11px] font-bold text-[#BE185D] hover:bg-[#FCE7F3] cursor-pointer disabled:opacity-50"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Cart Checkout Form (Bangladesh WhatsApp Order vs India COD/UPI) */}
              {isBangladesh ? (
                <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDFBFE] p-4 sm:p-5 space-y-4">
                  <div className="text-sm font-bold text-[#1F122B]">
                    Order from Bangladesh via WhatsApp
                  </div>

                  <div className="rounded-xl border border-[#EFE2F5] bg-white p-3.5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[#5B4B6B]">
                      <span>Items Subtotal ({cartItemCount} units)</span>
                      <span className="font-mono-num font-bold text-[#1F122B]">
                        {formatCurrency(cartSubtotal, sym)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[#0F766E]">
                      <span>Bangladesh Price (BDT)</span>
                      <span className="font-mono-num text-sm font-bold">
                        {formatBdt(convertInrToBdt(cartSubtotal, bdtRate))}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-2.5 text-xs font-semibold text-[#92400E]">
                    {BANGLADESH_CHARGE_NOTICE}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4A3B59] mb-1">
                      Order Note / Size Note (optional)
                    </label>
                    <input
                      type="text"
                      value={checkoutNote}
                      onChange={(e) => setCheckoutNote(e.target.value)}
                      placeholder="Size, delivery area in Bangladesh, or note"
                      className="w-full rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                    />
                  </div>

                  <a
                    href={buildBangladeshWhatsAppOrderUrl({
                      whatsappNumber: bdConfig.whatsappNumber,
                      inrToBdtRate: bdtRate,
                      items: cart.map((item) => ({
                        id: item.id,
                        productId: item.productId,
                        name: item.name,
                        priceInr: item.price,
                        quantity: Math.max(1, item.quantity || 1),
                        selectedVariant: item.size,
                        color: item.color,
                        sellerId: item.sellerId,
                        sellerName: item.sellerName,
                      })),
                      customer: client,
                      note: checkoutNote,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full min-w-0 max-w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#15803D] to-[#0F766E] py-3 px-4 text-xs sm:text-sm font-bold text-white hover:opacity-95 transition-opacity text-center"
                  >
                    <Phone className="w-4 h-4 shrink-0" />
                    <span className="truncate">Order Cart on WhatsApp</span>
                  </a>
                </div>
              ) : (
                <form
                  onSubmit={handlePlaceCartOrder}
                  className="rounded-2xl border border-[#EFE2F5] bg-[#FDFBFE] p-4 sm:p-5 space-y-4"
                >
                  <div className="text-sm font-bold text-[#1F122B]">
                    Delivery &amp; Payment Checkout
                  </div>

                {checkoutError && (
                  <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
                    {checkoutError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#4A3B59] mb-1">
                      Full Name (in English) <span className="text-[#DB2777]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={checkoutName}
                      onChange={(e) => setCheckoutName(e.target.value)}
                      placeholder="Full name in English"
                      className="w-full rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs sm:text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#4A3B59] mb-1">
                      Phone Number <span className="text-[#DB2777]">*</span>
                    </label>
                    <div className="flex items-stretch rounded-xl border border-[#E6D9EE] bg-white overflow-hidden focus-within:border-[#9333EA]">
                      <span className="inline-flex items-center px-2.5 bg-[#F6EFFA] border-r border-[#E6D9EE] text-xs font-mono-num font-bold text-[#6D28D9] select-none shrink-0">
                        +91
                      </span>
                      <input
                        type="tel"
                        inputMode="tel"
                        required
                        value={checkoutPhone}
                        onChange={(e) => setCheckoutPhone(e.target.value)}
                        placeholder="9876543210"
                        className="w-full bg-transparent px-2.5 py-2 text-xs sm:text-sm font-mono-num text-[#1F122B] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#4A3B59] mb-1">
                    Delivery Address <span className="text-[#DB2777]">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={checkoutAddress}
                    onChange={(e) => setCheckoutAddress(e.target.value)}
                    className="w-full rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs sm:text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={checkoutCity}
                    onChange={(e) => setCheckoutCity(e.target.value)}
                    placeholder="City"
                    className="w-full rounded-xl border border-[#E6D9EE] bg-white px-2.5 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                  />
                  <input
                    type="text"
                    value={checkoutState}
                    onChange={(e) => setCheckoutState(e.target.value)}
                    placeholder="State"
                    className="w-full rounded-xl border border-[#E6D9EE] bg-white px-2.5 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={checkoutPin}
                    onChange={(e) =>
                      setCheckoutPin(
                        sanitizeNumericInput(e.target.value, {
                          allowDecimal: false,
                        })
                      )
                    }
                    placeholder="PIN"
                    className="w-full rounded-xl border border-[#E6D9EE] bg-white px-2.5 py-2 text-xs font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-stretch rounded-xl border border-[#E6D9EE] bg-white overflow-hidden focus-within:border-[#9333EA]">
                    <span className="inline-flex items-center px-2.5 bg-[#F6EFFA] border-r border-[#E6D9EE] text-xs font-mono-num font-bold text-[#6D28D9] select-none shrink-0">
                      +91
                    </span>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={checkoutWhatsapp}
                      onChange={(e) => setCheckoutWhatsapp(e.target.value)}
                      placeholder="WhatsApp (optional)"
                      className="w-full bg-transparent px-2.5 py-2 text-xs font-mono-num text-[#1F122B] focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    value={checkoutNote}
                    onChange={(e) => setCheckoutNote(e.target.value)}
                    placeholder="Order note (optional)"
                    className="w-full rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                  />
                </div>

                {/* Free Delivery Subscription Banner inside Cart Checkout */}
                {hasActiveSubscription ? (
                  <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-bold text-[#15803D]">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        ₹{SUBSCRIPTION_PLAN_PRICE} Free Delivery Pass Active ({subscriptionRemainingDays} {subscriptionRemainingDays === 1 ? 'day' : 'days'} left)
                      </span>
                    </span>
                    <span className="font-mono-num font-bold text-[#166534] shrink-0">
                      ₹0 Delivery
                    </span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#E9D5FF] bg-gradient-to-r from-[#FAF5FF] to-[#FDF2F8] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-bold text-[#6D28D9] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#DB2777] shrink-0" />
                        <span>
                          {subscriptionStatus === 'pending'
                            ? '₹99 Free Delivery Pass — Verification Pending'
                            : `Save delivery fees with ₹${SUBSCRIPTION_PLAN_PRICE} / ${SUBSCRIPTION_DURATION_DAYS} Days Free Delivery Pass!`}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#5B4B6B]">
                        {subscriptionStatus === 'pending'
                          ? 'Admin approval pending on your uploaded screenshot.'
                          : 'Online payment + screenshot only (COD disabled for pass).'}
                      </div>
                    </div>
                    {subscriptionStatus !== 'pending' && (
                      <button
                        type="button"
                        onClick={() => setSubModalOpen(true)}
                        className="rounded-lg bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-95 cursor-pointer shrink-0"
                      >
                        Buy ₹{SUBSCRIPTION_PLAN_PRICE} Pass
                      </button>
                    )}
                  </div>
                )}

                {/* Payment Methods */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('COD');
                      setCheckoutError('');
                    }}
                    className={`rounded-xl border p-3 text-left cursor-pointer ${
                      paymentMethod === 'COD'
                        ? 'border-[#7E22CE] bg-[#FAF5FF] ring-1 ring-[#7E22CE]'
                        : 'border-[#E6D9EE] bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-[#1F122B]">
                      <span>Cash on Delivery</span>
                      <Truck className="w-3.5 h-3.5 text-[#7E22CE]" />
                    </div>
                    <div
                      className={`text-[10px] font-semibold mt-1 ${
                        hasActiveSubscription ? 'text-[#15803D]' : 'text-[#B45309]'
                      }`}
                    >
                      {hasActiveSubscription
                        ? '₹0 Free Delivery Subscription Applied'
                        : `+ ₹${COD_DELIVERY_CHARGE_PER_ITEM}/item COD delivery fee`}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('UPI');
                      setCheckoutError('');
                    }}
                    className={`rounded-xl border p-3 text-left cursor-pointer ${
                      paymentMethod === 'UPI'
                        ? 'border-[#7E22CE] bg-[#FAF5FF] ring-1 ring-[#7E22CE]'
                        : 'border-[#E6D9EE] bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-[#1F122B]">
                      <span>Online (UPI)</span>
                      <CreditCard className="w-3.5 h-3.5 text-[#DB2777]" />
                    </div>
                    <div className="text-[10px] font-semibold text-[#15803D] mt-1">
                      ₹0 Delivery Fee (Free)
                    </div>
                  </button>
                </div>

                {/* Order Total Breakdown */}
                <div className="rounded-xl border border-[#EFE2F5] bg-white p-3 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-[#5B4B6B]">
                    <span>Items Subtotal ({cartItemCount} units)</span>
                    <span className="font-mono-num font-semibold text-[#1F122B]">
                      {formatCurrency(cartSubtotal, sym)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#5B4B6B]">
                    <span>
                      Delivery Charge{' '}
                      {hasActiveSubscription
                        ? '(Free Delivery Pass)'
                        : paymentMethod === 'COD'
                          ? `(COD ₹${COD_DELIVERY_CHARGE_PER_ITEM} × ${cartItemCount})`
                          : '(UPI Free)'}
                    </span>
                    <span
                      className={`font-mono-num font-semibold ${
                        codDeliveryCharge > 0 ? 'text-[#B45309]' : 'text-[#15803D]'
                      }`}
                    >
                      {codDeliveryCharge > 0
                        ? `+ ${formatCurrency(codDeliveryCharge, sym)}`
                        : hasActiveSubscription
                          ? '₹0 - Free Delivery Subscription Applied'
                          : 'FREE'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-[#F4ECF8] font-bold text-[#1F122B]">
                    <span>Total Payable</span>
                    <span className="font-mono-num text-sm text-[#7E22CE]">
                      {formatCurrency(checkoutGrandTotal, sym)}
                    </span>
                  </div>
                </div>

                {paymentMethod === 'UPI' && (
                  <div className="rounded-xl border border-[#E9D5FF] bg-white p-3.5 space-y-3">
                    {payeeGroups.map((group) => {
                      const d = group.details;
                      const groupUpiLink = d.upiId
                        ? buildUpiDeepLink(d.upiId, d.recipientName, group.amount)
                        : '';
                      const isCopied = copiedUpiValue === d.upiId;
                      return (
                        <div
                          key={group.key}
                          className="rounded-xl border border-[#F2E6F7] bg-[#FDF9FE] p-3 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md border border-[#D8B4FE] bg-white px-2 py-0.5 text-[10px] font-bold text-[#6D28D9]">
                              <QrCode className="w-3 h-3" />
                              <span>
                                {d.source === 'product'
                                  ? `Product Payment · ${d.recipientName}`
                                  : d.source === 'seller'
                                    ? `Seller Payment · ${d.recipientName}`
                                    : `Store Payment · ${d.recipientName}`}
                              </span>
                            </span>
                            <span className="font-mono-num text-xs font-bold text-[#1F122B]">
                              Pay {formatCurrency(group.amount, sym)}
                            </span>
                          </div>

                          {payeeGroups.length > 1 && group.itemNames.length > 0 && (
                            <div className="text-[11px] text-[#6B5B7B] truncate">
                              Items: {group.itemNames.join(', ')}
                            </div>
                          )}

                          {d.upiId && (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-[11px] text-[#6B5B7B]">
                                  UPI ID:
                                </div>
                                <div className="font-mono-num text-sm font-bold text-[#6D28D9] select-all">
                                  {d.upiId}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleCopyUpi(d.upiId)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[#D8B4FE] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#7E22CE] cursor-pointer"
                                >
                                  {isCopied ? (
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
                                <a
                                  href={groupUpiLink}
                                  className="rounded-lg bg-[#7E22CE] px-2.5 py-1 text-[11px] font-semibold text-white"
                                >
                                  Pay App
                                </a>
                              </div>
                            </div>
                          )}

                          {(d.upiNumber ||
                            d.bankAccountName ||
                            d.bankName ||
                            d.bankAccountNo ||
                            d.bankIfscBranch ||
                            d.qrDataUrl) && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#EFE2F5]">
                              <div className="text-[11px] text-[#4A3B59] space-y-0.5">
                                {d.upiNumber && (
                                  <div className="font-mono-num">
                                    UPI Number: <strong>{d.upiNumber}</strong>
                                  </div>
                                )}
                                {d.bankAccountName && (
                                  <div>
                                    A/C Holder: <strong>{d.bankAccountName}</strong>
                                  </div>
                                )}
                                {d.bankName && (
                                  <div>
                                    Bank: <strong>{d.bankName}</strong>
                                  </div>
                                )}
                                {d.bankAccountNo && (
                                  <div className="font-mono-num">
                                    Account No: <strong>{d.bankAccountNo}</strong>
                                  </div>
                                )}
                                {d.bankIfscBranch && (
                                  <div>
                                    IFSC / Branch: <strong>{d.bankIfscBranch}</strong>
                                  </div>
                                )}
                              </div>
                              {d.qrDataUrl && (
                                <div className="flex flex-col items-center shrink-0 max-w-full overflow-hidden">
                                  <img
                                    src={getOptimizedMediaUrl(d.qrDataUrl, 'image')}
                                    alt={`${d.recipientName} Payment QR`}
                                    width={96}
                                    height={96}
                                    referrerPolicy="no-referrer"
                                    className="w-24 h-24 max-w-full rounded-lg border border-[#D8B4FE] bg-white p-1 object-contain block"
                                  />
                                  <span className="text-[10px] font-semibold text-[#6D28D9] mt-0.5">
                                    Scan QR
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-[#F4ECF8]">
                      <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8B4FE] bg-[#FDF9FF] px-3 py-1.5 text-[11px] font-semibold text-[#6D28D9] cursor-pointer">
                        <Upload className="w-3 h-3" />
                        <span>
                          {uploadingScreenshot
                            ? `Uploading${screenshotProgress !== null ? ` ${screenshotProgress}%` : ''}...`
                            : upiScreenshotDataUrl
                              ? 'Change Screenshot'
                              : 'Upload Screenshot *'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingScreenshot}
                          onChange={handleUploadUpiScreenshot}
                          className="sr-only"
                        />
                      </label>
                      {upiScreenshotDataUrl && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#15803D]">
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>Attached</span>
                        </span>
                      )}
                      <span className="text-[10px] text-[#6B5B7B]">
                        Saved to Cloudinary
                      </span>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={placingOrder || uploadingScreenshot}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-3 px-4 text-xs sm:text-sm font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {placingOrder
                      ? 'Placing Order...'
                      : `Checkout & Place Order (${formatCurrency(checkoutGrandTotal, sym)})`}
                  </span>
                </button>
              </form>
              )}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: ORDERS WITH ORDER DATE & ESTIMATED DELIVERY DATE */}
      {activeTab === 'orders' && (
        <section className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[#1F122B]">
              My Orders ({orders.length})
            </h2>
          </div>

          {reqSuccess && (
            <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-2.5 text-xs font-semibold text-[#15803D]">
              {reqSuccess}
            </div>
          )}

          {orders.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Package className="w-9 h-9 text-[#C4B5D9] mx-auto" />
              <div className="text-sm font-bold text-[#1F122B]">
                No orders placed yet
              </div>
              <p className="text-xs text-[#6B5B7B]">
                Your placed orders and estimated delivery dates will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {orders.map((ord) => {
                const matchedBill = ord.invoiceId
                  ? bills.find((b) => b.id === ord.invoiceId)
                  : ord.invoiceNumber
                    ? bills.find((b) => b.invoiceNumber === ord.invoiceNumber)
                    : undefined;
                const displayOrderDate =
                  ord.orderDate ||
                  (ord.createdAt ? ord.createdAt.slice(0, 10) : '—');
                const itemsList: Array<{
                  id: string;
                  productId?: string;
                  productNumber?: string;
                  productName: string;
                  productSize?: string;
                  imageDataUrl?: string;
                  selectedImageUrl?: string;
                  sellerId?: string;
                  sellerName?: string;
                  quantity: number;
                  unitPrice: number;
                  lineTotal: number;
                }> =
                  Array.isArray(ord.items) && ord.items.length > 0
                    ? ord.items
                    : [
                        {
                          id: ord.id,
                          productId: ord.productId,
                          productNumber: ord.productNumber,
                          productName: ord.productName,
                          productSize: ord.productSize,
                          imageDataUrl: ord.imageDataUrl,
                          selectedImageUrl: ord.selectedImageUrl,
                          sellerId: ord.sellerId,
                          quantity: ord.quantity,
                          unitPrice: ord.unitPrice,
                          lineTotal: ord.totalAmount,
                        },
                      ];

                const canExchange = isOrderWithinExchangeWindow(
                  ord.createdAt,
                  ord.orderDate,
                  ord.status
                );
                const ordRequests = orderExchanges.filter(
                  (r) => r.orderId === ord.id
                );
                const isFormOpen = activeRequestForm?.orderId === ord.id;
                const firstOrderedItem = itemsList[0];
                const firstCatalogProd = products.find(
                  (p) =>
                    (firstOrderedItem?.productId &&
                      p.id === firstOrderedItem.productId) ||
                    p.name.trim().toLowerCase() ===
                      String(firstOrderedItem?.productName || '')
                        .trim()
                        .toLowerCase()
                );
                const resolvedOrderSellerId = String(
                  ord.sellerId ||
                    firstOrderedItem?.sellerId ||
                    firstCatalogProd?.sellerId ||
                    ''
                ).trim();
                const resolvedOrderSellerName = String(
                  firstOrderedItem?.sellerName ||
                    firstCatalogProd?.sellerName ||
                    ''
                ).trim();

                const openOrderActionForm = (type: OrderExchangeRequestType) => {
                  setReqError('');
                  setReqSuccess('');
                  setReqReason('');
                  setReqPhotoUrls([]);
                  setReqWhatsapp(
                    stripPlus91Prefix(
                      displayCustomerPhone(
                        ord.customerWhatsapp || client.whatsapp || client.mobile
                      )
                    )
                  );
                  setActiveRequestForm({ orderId: ord.id, type });
                };

                const handleUploadExchangePhotos = async (
                  e: React.ChangeEvent<HTMLInputElement>
                ) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = '';
                  if (files.length === 0) return;
                  const remaining = 5 - reqPhotoUrls.length;
                  if (remaining <= 0) {
                    setReqError('Maximum 5 exchange photos allowed.');
                    return;
                  }
                  const toUpload = files.slice(0, remaining);
                  setReqError('');
                  setUploadingReqPhoto(true);
                  setReqPhotoProgress(1);
                  try {
                    const urls: string[] = [];
                    for (let i = 0; i < toUpload.length; i += 1) {
                      const record = await uploadMediaToCloudinary(toUpload[i], {
                        role: 'customer',
                        appSource: 'glamour-galleria',
                        folder: 'glamour-galleria/customer/order-exchanges',
                        relatedEntityType: 'order_exchange',
                        relatedEntityId: ord.id,
                        uploadedByUid: client.id,
                        allowedTypes: ['image'],
                        onProgress: (pct) => {
                          setReqPhotoProgress(
                            Math.round(((i + pct / 100) / toUpload.length) * 100)
                          );
                        },
                      });
                      urls.push(record.secureUrl);
                    }
                    setReqPhotoUrls((prev) => [...prev, ...urls].slice(0, 5));
                  } catch (err) {
                    setReqError(
                      err instanceof Error
                        ? err.message
                        : 'Could not upload photo. Please choose JPG, PNG, or WEBP.'
                    );
                  } finally {
                    setUploadingReqPhoto(false);
                    setReqPhotoProgress(null);
                  }
                };

                const handleSubmitOrderAction = async (e: React.FormEvent) => {
                  e.preventDefault();
                  if (!activeRequestForm || activeRequestForm.orderId !== ord.id)
                    return;
                  setReqError('');
                  setReqSuccess('');
                  setSubmittingRequest(true);
                  try {
                    const primaryThumb =
                      firstOrderedItem?.selectedImageUrl ||
                      firstOrderedItem?.imageDataUrl ||
                      ord.selectedImageUrl ||
                      ord.imageDataUrl ||
                      firstCatalogProd?.imageDataUrls?.[0] ||
                      firstCatalogProd?.imageDataUrl ||
                      '';
                    await api.createOrderExchangeRequest({
                      type: activeRequestForm.type,
                      orderId: ord.id,
                      orderNumber: ord.orderNumber,
                      clientId: client.id,
                      customerName: ord.customerName || client.name,
                      customerPhone: ord.customerPhone || client.mobile,
                      customerWhatsapp: reqWhatsapp,
                      customerEmail: ord.customerEmail || client.email,
                      productId:
                        firstOrderedItem?.productId || ord.productId,
                      productName:
                        firstOrderedItem?.productName || ord.productName,
                      productSize:
                        firstOrderedItem?.productSize || ord.productSize,
                      selectedImageUrl: primaryThumb || undefined,
                      sellerId: resolvedOrderSellerId || undefined,
                      sellerName: resolvedOrderSellerName || undefined,
                      reason: reqReason,
                      photoUrls:
                        activeRequestForm.type === 'exchange'
                          ? reqPhotoUrls
                          : [],
                    });
                    setActiveRequestForm(null);
                    setReqReason('');
                    setReqPhotoUrls([]);
                    setReqSuccess(
                      activeRequestForm.type === 'exchange'
                        ? `Exchange request submitted for ${ord.orderNumber}.`
                        : `Help request sent for ${ord.orderNumber}.`
                    );
                  } catch (err) {
                    setReqError(
                      formatApiError(err, 'Could not submit request. Please try again.')
                    );
                  } finally {
                    setSubmittingRequest(false);
                  }
                };

                return (
                  <div
                    key={ord.id}
                    className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F4ECF8] pb-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono-num font-bold text-[#6D28D9]">
                            {ord.orderNumber}
                          </span>
                          <span
                            className={`font-bold ${
                              ord.status === 'Confirmed'
                                ? 'text-[#15803D]'
                                : ord.status === 'Cancelled'
                                  ? 'text-[#BE123C]'
                                  : 'text-[#B45309]'
                            }`}
                          >
                            ·{' '}
                            {ord.status === 'Pending'
                              ? 'Pending Confirmation'
                              : ord.status}
                          </span>
                        </div>
                        <span className="font-mono-num text-sm font-bold text-[#1F122B]">
                          {formatCurrency(ord.totalAmount, sym)}
                        </span>
                      </div>

                      {/* Clickable Product Image + Name above Order Details */}
                      <div className="space-y-1.5 text-xs">
                        {itemsList.map((it) => {
                          const matchedCatalogProd = products.find(
                            (p) =>
                              (it.productId && p.id === it.productId) ||
                              p.name.trim().toLowerCase() ===
                                it.productName.trim().toLowerCase()
                          );
                          const itemThumb =
                            it.selectedImageUrl ||
                            it.imageDataUrl ||
                            (itemsList.length === 1
                              ? ord.selectedImageUrl || ord.imageDataUrl
                              : '') ||
                            matchedCatalogProd?.imageDataUrls?.[0] ||
                            matchedCatalogProd?.imageDataUrl ||
                            '';
                          const resolvedProductNumber =
                            it.productNumber ||
                            (itemsList.length === 1 ? ord.productNumber : undefined) ||
                            matchedCatalogProd?.productNumber;
                          const copyKey = `${ord.id}-${it.id}`;
                          const isCopied = copiedProductNumberKey === copyKey;
                          const resolvedSize =
                            it.productSize ||
                            (itemsList.length === 1 ? ord.productSize : '');

                          return (
                            <div
                              key={it.id}
                              className="rounded-xl bg-white border border-[#F4ECF8] p-2.5 space-y-1.5"
                            >
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenProductFromOrder?.(
                                      it.productId || matchedCatalogProd?.id,
                                      it.productName
                                    )
                                  }
                                  className="w-12 h-12 rounded-lg border border-[#EFE2F5] bg-[#FDF9FC] overflow-hidden shrink-0 flex items-center justify-center cursor-pointer hover:border-[#9333EA]"
                                  title="View product details"
                                >
                                  {itemThumb ? (
                                    <img
                                      src={getOptimizedMediaUrl(
                                        itemThumb,
                                        'image'
                                      )}
                                      alt={it.productName}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover block"
                                    />
                                  ) : (
                                    <ShoppingBag className="w-5 h-5 text-[#C084FC]" />
                                  )}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenProductFromOrder?.(
                                        it.productId || matchedCatalogProd?.id,
                                        it.productName
                                      )
                                    }
                                    className="text-left font-bold text-[#1F122B] hover:text-[#7E22CE] line-clamp-2 cursor-pointer"
                                  >
                                    {it.productName}
                                  </button>
                                  <div className="text-[11px] text-[#5B4B6B] font-mono-num mt-0.5 flex flex-wrap items-center gap-x-2">
                                    <span>Qty: {it.quantity}</span>
                                    {resolvedSize && (
                                      <span className="font-semibold text-[#7E22CE]">
                                        · Size: {resolvedSize}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className="font-mono-num font-bold text-[#1F122B] shrink-0">
                                  {formatCurrency(it.lineTotal, sym)}
                                </span>
                              </div>
                              {resolvedProductNumber && (
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#5B4B6B]">
                                  <span className="font-mono-num font-semibold text-[#6D28D9]">
                                    Product No: {resolvedProductNumber}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleCopyProductNumber(
                                        copyKey,
                                        resolvedProductNumber
                                      )
                                    }
                                    className="inline-flex items-center gap-1 rounded-md border border-[#E6D9EE] bg-[#FDFBFE] px-1.5 py-0.5 text-[10px] font-semibold text-[#5B4B6B] hover:border-[#9333EA] hover:text-[#7E22CE] cursor-pointer"
                                    title="Copy Product Number"
                                  >
                                    {isCopied ? (
                                      <>
                                        <Check className="w-3 h-3 text-[#15803D]" />
                                        <span className="text-[#15803D]">
                                          Copied!
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        <span>Copy</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-white border border-[#F4ECF8] px-3 py-2">
                          <div className="text-[10px] text-[#6B5B7B] flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-[#7E22CE]" />
                            <span>Order Date</span>
                          </div>
                          <div className="font-mono-num font-bold text-[#1F122B] mt-0.5">
                            {displayOrderDate}
                          </div>
                        </div>
                        <div className="rounded-xl bg-white border border-[#F4ECF8] px-3 py-2">
                          <div className="text-[10px] text-[#6B5B7B] flex items-center gap-1">
                            <Truck className="w-3 h-3 text-[#DB2777]" />
                            <span>Estimated Delivery</span>
                          </div>
                          <div className="font-mono-num font-bold text-[#1F122B] mt-0.5">
                            {ord.status === 'Cancelled'
                              ? 'Cancelled'
                              : ord.estimatedDeliveryDate || '—'}
                          </div>
                        </div>
                      </div>

                      {(ord.deliveryCharge || 0) > 0 && (
                        <div className="flex items-center justify-between gap-2 text-xs text-[#B45309] font-medium pt-0.5">
                          <span>COD Delivery Charge</span>
                          <span className="font-mono-num shrink-0">
                            + {formatCurrency(ord.deliveryCharge || 0, sym)}
                          </span>
                        </div>
                      )}

                      {/* Submitted Exchange & Help Requests for this Order */}
                      {ordRequests.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {ordRequests.map((reqItem) => (
                            <div
                              key={reqItem.id}
                              className="rounded-xl border border-[#E6D9EE] bg-white p-2.5 text-[11px] space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-[#6D28D9] uppercase">
                                  {reqItem.type === 'exchange'
                                    ? 'Exchange Request'
                                    : 'Help Request'}
                                </span>
                                <span className="rounded-md border border-[#E6D9EE] bg-[#FAF5FF] px-1.5 py-0.5 text-[10px] font-bold capitalize text-[#4A3B59]">
                                  {reqItem.status.replace('_', ' ')}
                                </span>
                              </div>
                              <div className="text-[#4A3B59]">{reqItem.reason}</div>
                              <div className="text-[10px] text-[#6B5B7B] font-mono-num">
                                WhatsApp: {reqItem.customerWhatsapp}
                              </div>
                              {Array.isArray(reqItem.photoUrls) &&
                                reqItem.photoUrls.length > 0 && (
                                  <div className="flex flex-wrap gap-1 pt-0.5">
                                    {reqItem.photoUrls.map((pUrl, pIdx) => (
                                      <img
                                        key={`${reqItem.id}-img-${pIdx}`}
                                        src={getOptimizedMediaUrl(pUrl, 'image')}
                                        alt={`Proof ${pIdx + 1}`}
                                        referrerPolicy="no-referrer"
                                        className="w-10 h-10 rounded-md object-cover border border-[#E6D9EE]"
                                      />
                                    ))}
                                  </div>
                                )}
                              {reqItem.resolutionNote && (
                                <div className="text-[10px] font-semibold text-[#15803D]">
                                  Reply: {reqItem.resolutionNote}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Exchange & Help Request Buttons + Inline Form */}
                      {ord.status !== 'Cancelled' && (
                        <div className="space-y-2 pt-1">
                          <div className="flex flex-col gap-1.5">
                            {canExchange ? (
                              <button
                                type="button"
                                onClick={() =>
                                  isFormOpen &&
                                  activeRequestForm?.type === 'exchange'
                                    ? setActiveRequestForm(null)
                                    : openOrderActionForm('exchange')
                                }
                                className={`w-full inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                                  isFormOpen &&
                                  activeRequestForm?.type === 'exchange'
                                    ? 'border-[#DB2777] bg-[#FDF2F8] text-[#9D174D]'
                                    : 'border-[#E6D9EE] bg-white text-[#6D28D9] hover:border-[#9333EA]'
                                }`}
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Exchange (Within 8 Days)</span>
                              </button>
                            ) : (
                              <div className="text-[11px] text-[#8E7C9E] font-medium px-1">
                                8-day exchange window ended
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                isFormOpen && activeRequestForm?.type === 'help'
                                  ? setActiveRequestForm(null)
                                  : openOrderActionForm('help')
                              }
                              className={`w-full inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                                isFormOpen && activeRequestForm?.type === 'help'
                                  ? 'border-[#7E22CE] bg-[#FAF5FF] text-[#6D28D9]'
                                  : 'border-[#E6D9EE] bg-white text-[#4A3B59] hover:border-[#9333EA]'
                              }`}
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-[#DB2777]" />
                              <span>Help Request</span>
                            </button>
                          </div>

                          {isFormOpen && activeRequestForm && (
                            <form
                              onSubmit={handleSubmitOrderAction}
                              className="rounded-xl border border-[#DFC7EE] bg-white p-3 space-y-2.5 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-[#1F122B]">
                                  {activeRequestForm.type === 'exchange'
                                    ? 'Request Product Exchange'
                                    : 'Send Order Help Request'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setActiveRequestForm(null)}
                                  className="text-[#6B5B7B] hover:text-[#1F122B] cursor-pointer"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>

                              {reqError && (
                                <div className="rounded-lg border border-[#FECDD3] bg-[#FFF1F2] px-2.5 py-1.5 text-[11px] text-[#BE123C]">
                                  {reqError}
                                </div>
                              )}

                              <div>
                                <label className="block text-[11px] font-semibold text-[#4A3B59] mb-1">
                                  Your WhatsApp Number{' '}
                                  <span className="text-[#DB2777]">*</span>
                                </label>
                                <div className="flex items-stretch rounded-lg border border-[#E6D9EE] bg-[#FDFBFE] overflow-hidden">
                                  <span className="inline-flex items-center px-2.5 bg-[#F6EFFA] border-r border-[#E6D9EE] text-[11px] font-mono-num font-bold text-[#6D28D9]">
                                    +91
                                  </span>
                                  <input
                                    type="tel"
                                    required
                                    value={reqWhatsapp}
                                    onChange={(e) =>
                                      setReqWhatsapp(e.target.value)
                                    }
                                    placeholder="WhatsApp number"
                                    className="w-full bg-transparent px-2.5 py-1.5 text-xs font-mono-num text-[#1F122B] focus:outline-none"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-[#4A3B59] mb-1">
                                  {activeRequestForm.type === 'exchange'
                                    ? 'Exchange Reason / Issue'
                                    : 'Describe Your Help Issue'}{' '}
                                  <span className="text-[#DB2777]">*</span>
                                </label>
                                <textarea
                                  rows={2}
                                  required
                                  value={reqReason}
                                  onChange={(e) => setReqReason(e.target.value)}
                                  placeholder={
                                    activeRequestForm.type === 'exchange'
                                      ? 'Size mismatch, damaged item, wrong color...'
                                      : 'Describe your question or issue with this order...'
                                  }
                                  className="w-full rounded-lg border border-[#E6D9EE] bg-[#FDFBFE] px-2.5 py-1.5 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                                />
                              </div>

                              {activeRequestForm.type === 'exchange' && (
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-semibold text-[#4A3B59]">
                                      Upload Photos (Up to 5)
                                    </span>
                                    <span className="font-mono-num text-[#6B5B7B]">
                                      {reqPhotoUrls.length} / 5
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {reqPhotoUrls.map((url, pIdx) => (
                                      <div
                                        key={`${url}-${pIdx}`}
                                        className="relative w-12 h-12 rounded-lg border border-[#E6D9EE] overflow-hidden"
                                      >
                                        <img
                                          src={getOptimizedMediaUrl(
                                            url,
                                            'image'
                                          )}
                                          alt={`Exchange photo ${pIdx + 1}`}
                                          referrerPolicy="no-referrer"
                                          className="w-full h-full object-cover"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setReqPhotoUrls((prev) =>
                                              prev.filter((_, i) => i !== pIdx)
                                            )
                                          }
                                          className="absolute top-0 right-0 bg-black/70 text-white p-0.5 rounded-bl-md cursor-pointer"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                    {reqPhotoUrls.length < 5 && (
                                      <label className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#C084FC] bg-[#FAF5FF] px-2.5 py-2 text-[11px] font-semibold text-[#6D28D9] cursor-pointer hover:border-[#9333EA]">
                                        <Camera className="w-3.5 h-3.5" />
                                        <span>
                                          {uploadingReqPhoto
                                            ? `Uploading${reqPhotoProgress !== null ? ` ${reqPhotoProgress}%` : ''}...`
                                            : 'Add Photo'}
                                        </span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          disabled={uploadingReqPhoto}
                                          onChange={handleUploadExchangePhotos}
                                          className="sr-only"
                                        />
                                      </label>
                                    )}
                                  </div>
                                </div>
                              )}

                              <button
                                type="submit"
                                disabled={
                                  submittingRequest || uploadingReqPhoto
                                }
                                className="w-full rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
                              >
                                {submittingRequest
                                  ? 'Submitting...'
                                  : activeRequestForm.type === 'exchange'
                                    ? 'Submit Exchange Request'
                                    : 'Submit Help Request'}
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F4ECF8] text-xs">
                      <span className="text-[#6B5B7B]">
                        {ord.paymentMethod === 'UPI'
                          ? 'Paid via UPI'
                          : 'Cash on Delivery (COD)'}
                        {ord.invoiceNumber ? ` · Bill ${ord.invoiceNumber}` : ''}
                      </span>

                      {matchedBill && (
                        <button
                          type="button"
                          onClick={() => setViewingBill(matchedBill)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>View Bill</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: GENERATED CUSTOMER BILLS & INVOICES */}
      {activeTab === 'bills' && (
        <section className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[#1F122B]">
              My Bills &amp; Invoices ({bills.length})
            </h2>
          </div>

          {bills.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <FileText className="w-9 h-9 text-[#C4B5D9] mx-auto" />
              <div className="text-sm font-bold text-[#1F122B]">
                No bills generated yet
              </div>
              <p className="text-xs text-[#6B5B7B]">
                Once your order is confirmed, your official bill will automatically appear here for viewing or PDF download.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {bills.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono-num text-sm font-bold text-[#6D28D9]">
                        {inv.invoiceNumber}
                      </span>
                      <span className="font-mono-num text-[#6B5B7B]">
                        · {inv.invoiceDate}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#7E22CE]">
                        · <Truck className="w-3 h-3" /> {inv.deliveryStatus}
                      </span>
                    </div>
                    <div className="text-xs text-[#5B4B6B] truncate">
                      {inv.items.map((i) => `${i.productName} ×${i.quantity}`).join(', ')}
                    </div>
                    <div className="text-xs font-mono-num font-bold text-[#1F122B]">
                      Total: {formatCurrency(inv.totalAmount, sym)}
                      {inv.dueAmount > 0 ? (
                        <span className="ml-2 text-[#BE123C]">
                          (Due: {formatCurrency(inv.dueAmount, sym)})
                        </span>
                      ) : (
                        <span className="ml-2 text-[#15803D]">(Paid)</span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setViewingBill(inv)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>View / PDF</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <SubscriptionPurchaseModal
        open={subModalOpen}
        client={client}
        settings={settings}
        paymentSettings={paymentSettings}
        onClose={() => setSubModalOpen(false)}
        onSuccess={(created) => {
          setSubModalOpen(false);
          onSubscriptionCreated?.(created);
          setOrderNotice(
            '₹99 Subscription request submitted! Your Free Delivery Pass will activate once Admin approves your payment screenshot.'
          );
        }}
      />
    </div>
  );
};
