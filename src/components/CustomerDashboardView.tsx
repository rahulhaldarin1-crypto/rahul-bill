import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  FileText,
  Image as ImageIcon,
  LogOut,
  MapPin,
  Minus,
  Package,
  Phone,
  Plus,
  Printer,
  QrCode,
  ShoppingBag,
  ShoppingCart,
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
  Invoice,
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
  normalizeAsianPhone,
  resolveEffectivePaymentDetails,
  stripPlus91Prefix,
  validateEnglishName,
} from '../utils/calculations';
import { getOptimizedMediaUrl, uploadMediaToCloudinary } from '../utils/cloudinary';
import { sanitizeNumericInput } from '../utils/numberInput';
import {
  BANGLADESH_CHARGE_NOTICE,
  buildBangladeshWhatsAppOrderUrl,
  convertInrToBdt,
  displayCustomerPhone,
  formatBdt,
  resolveBangladeshConfig,
  useBangladeshDetection,
} from '../utils/region';
import { CustomerAvatar } from './CustomerAvatar';
import { ScaledInvoicePreview } from './ScaledInvoicePreview';

export type CustomerDashboardTab = 'cart' | 'orders' | 'bills';

interface CustomerDashboardViewProps {
  client: Client;
  orders: CustomerOrder[];
  bills: Invoice[];
  settings?: BusinessSettings;
  products?: Product[];
  paymentSettings?: AdminPaymentSettings;
  sellerPaymentProfiles?: Record<string, SellerPublicPaymentProfile>;
  initialTab?: CustomerDashboardTab;
  onBackToShop: () => void;
  onLogout: () => void;
  onClientUpdated: (client: Client) => void;
}

export const CustomerDashboardView: React.FC<CustomerDashboardViewProps> = ({
  client,
  orders,
  bills,
  settings,
  products = [],
  paymentSettings,
  sellerPaymentProfiles,
  initialTab = 'cart',
  onBackToShop,
  onLogout,
  onClientUpdated,
}) => {
  const { isBangladesh: geoBangladesh } = useBangladeshDetection();
  const bdConfig = resolveBangladeshConfig(settings);
  const bdFeatureEnabled = bdConfig.enabled !== false;
  const isBangladesh =
    bdFeatureEnabled &&
    (geoBangladesh ||
      String(client.detectedCountry || '').trim().toUpperCase() === 'BD');
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
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [orderNotice, setOrderNotice] = useState('');

  // Bill Viewer
  const [viewingBill, setViewingBill] = useState<Invoice | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

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

  const codDeliveryCharge =
    paymentMethod === 'COD' ? COD_DELIVERY_CHARGE_PER_ITEM * cartItemCount : 0;
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
      return {
        id: item.id,
        productId: item.productId,
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
        imageDataUrl: item.imageDataUrl,
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
        customerAddress: checkoutAddress.trim(),
        customerCity: checkoutCity.trim(),
        customerState: checkoutState.trim(),
        customerPinCode: checkoutPin.trim(),
        items: orderItems,
        productId: first?.productId,
        productName:
          orderItems.length === 1
            ? first.productName
            : `${first.productName} + ${orderItems.length - 1} more`,
        productCategory: first?.productCategory,
        productSize: first?.productSize,
        productColor: first?.productColor,
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
    <div className="no-print space-y-5">
      {/* Customer Profile Card */}
      <section className="rounded-3xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-5 sm:p-6 space-y-4">
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
                        <div className="w-16 h-16 rounded-xl border border-[#EFE2F5] bg-white overflow-hidden shrink-0 flex items-center justify-center">
                          {item.imageDataUrl ? (
                            <img
                              src={getOptimizedMediaUrl(item.imageDataUrl, 'image')}
                              alt={item.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
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
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#15803D] to-[#0F766E] py-3 px-4 text-xs sm:text-sm font-bold text-white hover:opacity-95 transition-opacity whitespace-nowrap"
                  >
                    <Phone className="w-4 h-4 shrink-0" />
                    <span>Order Cart on WhatsApp</span>
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
                    <div className="text-[10px] font-semibold text-[#B45309] mt-1">
                      + ₹{COD_DELIVERY_CHARGE_PER_ITEM}/item COD delivery fee
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
                      {paymentMethod === 'COD'
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
                                <div className="flex flex-col items-center shrink-0">
                                  <img
                                    src={getOptimizedMediaUrl(d.qrDataUrl, 'image')}
                                    alt={`${d.recipientName} Payment QR`}
                                    referrerPolicy="no-referrer"
                                    className="w-24 h-24 rounded-lg border border-[#D8B4FE] bg-white p-1 object-contain"
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
                const itemsList =
                  Array.isArray(ord.items) && ord.items.length > 0
                    ? ord.items
                    : [
                        {
                          id: ord.id,
                          productName: ord.productName,
                          quantity: ord.quantity,
                          unitPrice: ord.unitPrice,
                          lineTotal: ord.totalAmount,
                        },
                      ];

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

                      <div className="space-y-1 text-xs">
                        {itemsList.map((it) => (
                          <div
                            key={it.id}
                            className="flex items-center justify-between gap-2 text-[#1F122B]"
                          >
                            <span className="truncate font-medium">
                              {it.productName} × {it.quantity}
                            </span>
                            <span className="font-mono-num text-[#5B4B6B] shrink-0">
                              {formatCurrency(it.lineTotal, sym)}
                            </span>
                          </div>
                        ))}
                        {(ord.deliveryCharge || 0) > 0 && (
                          <div className="flex items-center justify-between gap-2 text-[#B45309] font-medium pt-0.5">
                            <span>COD Delivery Charge</span>
                            <span className="font-mono-num shrink-0">
                              + {formatCurrency(ord.deliveryCharge || 0, sym)}
                            </span>
                          </div>
                        )}
                      </div>
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
    </div>
  );
};
