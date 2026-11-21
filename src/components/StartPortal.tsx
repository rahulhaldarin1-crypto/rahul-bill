import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  Lock,
  MapPin,
  Minus,
  Phone,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Tag,
  Truck,
  Upload,
  User,
  X,
} from 'lucide-react';
import {
  BusinessSettings,
  CustomerOrder,
  CustomerOrderPaymentMethod,
  Invoice,
  Product,
  PublicCustomerLookupResult,
  ViewPanelConfig,
} from '../types/business';
import { verifyAdminPasscode } from '../utils/adminAuth';
import { api, formatApiError } from '../utils/api';
import {
  CHECKOUT_UPI_ID,
  DEFAULT_VIEW_PANEL_CONFIG,
  exportInvoiceElementToPdf,
  formatCurrency,
  normalizePhoneDigits,
  resizeImageFileToDataUrl,
} from '../utils/calculations';
import { sanitizeNumericInput } from '../utils/numberInput';
import { AppBackground } from './AppBackground';
import { BrandLogo } from './BrandLogo';
import { ScaledInvoicePreview } from './ScaledInvoicePreview';

interface StartPortalProps {
  settings?: BusinessSettings;
  products?: Product[];
  isAdminUnlocked?: boolean;
  onOpenAdminPanel: () => void;
}

interface BillMatch {
  invoice: Invoice;
  settings: BusinessSettings;
}

interface PublicShopProduct {
  id: string;
  catalogProductId?: string;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  size?: string;
  color?: string;
  stockQty?: number;
  imageDataUrl?: string;
  imageDataUrls: string[];
  description?: string;
}

function isSafeHttpUrl(url?: string): boolean {
  const trimmed = (url || '').trim();
  return /^https?:\/\//i.test(trimmed);
}

function buildProductWhatsAppUrl(
  item: PublicShopProduct,
  settings?: BusinessSettings
): string {
  const sym = settings?.currencySymbol || '₹';
  const businessName = settings?.businessName || 'Glamour Galleria';
  const details = [
    item.category,
    item.size ? `Size: ${item.size}` : '',
    item.color ? `Color: ${item.color}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const message = [
    `Hello ${businessName}!`,
    `I would like to inquire about:`,
    `*${item.name}*`,
    details ? details : '',
    `Price: ${formatCurrency(item.price, sym)}`,
  ]
    .filter(Boolean)
    .join('\n');

  const rawPhone = (settings?.whatsapp || settings?.mobile || '').replace(
    /[^\d]/g,
    ''
  );
  const phoneWithCountry =
    rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;

  return phoneWithCountry
    ? `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export const StartPortal: React.FC<StartPortalProps> = ({
  settings,
  products = [],
  isAdminUnlocked = false,
  onOpenAdminPanel,
}) => {
  // Top Lookup state ('bill' | 'phone')
  const [lookupMode, setLookupMode] = useState<'bill' | 'phone'>('bill');
  const [query, setQuery] = useState('');
  const [phoneQuery, setPhoneQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<BillMatch[]>([]);
  const [phoneLookupResult, setPhoneLookupResult] =
    useState<PublicCustomerLookupResult | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<BillMatch | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  // View Panel section filter ('all' | 'discount' | 'shopping')
  const [sectionTab, setSectionTab] = useState<'all' | 'discount' | 'shopping'>(
    'all'
  );
  const [shoppingCategory, setShoppingCategory] = useState<string>('ALL');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [failedAdImage, setFailedAdImage] = useState(false);

  // Product Detail & Order Modal
  const [selectedProduct, setSelectedProduct] =
    useState<PublicShopProduct | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [modalStep, setModalStep] = useState<'detail' | 'checkout' | 'success'>(
    'detail'
  );
  const [orderQty, setOrderQty] = useState('1');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerState, setCustomerState] = useState('');
  const [customerPinCode, setCustomerPinCode] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<CustomerOrderPaymentMethod>('COD');
  const [upiScreenshotDataUrl, setUpiScreenshotDataUrl] = useState('');
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [upiCopied, setUpiCopied] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [placedOrder, setPlacedOrder] = useState<CustomerOrder | null>(null);

  // Admin Panel Password Lock Modal
  const [showAdminLockModal, setShowAdminLockModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const sheetRef = useRef<HTMLDivElement | null>(null);

  const sym = settings?.currencySymbol || '₹';
  const viewPanel: ViewPanelConfig = useMemo(() => {
    const vp = settings?.viewPanel;
    return {
      advertisement: {
        ...DEFAULT_VIEW_PANEL_CONFIG.advertisement,
        ...(vp?.advertisement || {}),
      },
      discount: {
        ...DEFAULT_VIEW_PANEL_CONFIG.discount,
        ...(vp?.discount || {}),
        offers: Array.isArray(vp?.discount?.offers) ? vp.discount.offers : [],
      },
      shopping: {
        ...DEFAULT_VIEW_PANEL_CONFIG.shopping,
        ...(vp?.shopping || {}),
        items: Array.isArray(vp?.shopping?.items) ? vp.shopping.items : [],
      },
      updatedAt: vp?.updatedAt || '',
    };
  }, [settings?.viewPanel]);

  const showAdvertisement =
    viewPanel.advertisement.enabled &&
    Boolean(
      (viewPanel.advertisement.imageDataUrl && !failedAdImage) ||
        viewPanel.advertisement.title.trim()
    );

  const shoppingItems: PublicShopProduct[] = useMemo(() => {
    const customItems: PublicShopProduct[] = viewPanel.shopping.items.map(
      (item) => {
        const gallery =
          Array.isArray(item.imageDataUrls) && item.imageDataUrls.length > 0
            ? item.imageDataUrls.filter(Boolean)
            : item.imageDataUrl
              ? [item.imageDataUrl]
              : [];
        return {
          id: item.id,
          name: item.name,
          category: item.category || 'Featured',
          price: item.price,
          originalPrice: item.originalPrice,
          size: item.size,
          color: item.color,
          imageDataUrl: gallery[0] || '',
          imageDataUrls: gallery,
          description: item.description,
        };
      }
    );

    if (!viewPanel.shopping.includeCatalogProducts) {
      return customItems;
    }

    const catalogItems: PublicShopProduct[] = products.map((prod) => {
      const gallery =
        Array.isArray(prod.imageDataUrls) && prod.imageDataUrls.length > 0
          ? prod.imageDataUrls.filter(Boolean)
          : prod.imageDataUrl
            ? [prod.imageDataUrl]
            : [];
      return {
        id: `cat-${prod.id}`,
        catalogProductId: prod.id,
        name: prod.name,
        category: prod.category || 'Collection',
        price: prod.sellingPrice,
        size: prod.size,
        color: prod.color,
        stockQty: prod.stockQty,
        imageDataUrl: gallery[0] || '',
        imageDataUrls: gallery,
        description: prod.description,
      };
    });

    return [...catalogItems, ...customItems];
  }, [
    viewPanel.shopping.items,
    viewPanel.shopping.includeCatalogProducts,
    products,
  ]);

  const shoppingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const item of shoppingItems) {
      const c = (item.category || '').trim();
      if (c) set.add(c);
    }
    return Array.from(set);
  }, [shoppingItems]);

  const filteredShoppingItems = useMemo(() => {
    if (shoppingCategory === 'ALL') return shoppingItems;
    return shoppingItems.filter((item) => item.category === shoppingCategory);
  }, [shoppingItems, shoppingCategory]);

  const hasDiscountContent =
    viewPanel.discount.enabled &&
    (viewPanel.discount.offers.length > 0 ||
      Boolean(viewPanel.discount.headline.trim()));

  const hasShoppingContent = viewPanel.shopping.enabled;

  // --- Admin Lock Modal ---
  const openPasswordPrompt = () => {
    if (isAdminUnlocked) {
      onOpenAdminPanel();
      return;
    }
    setAdminPassword('');
    setPasswordError('');
    setShowPassword(false);
    setShowAdminLockModal(true);
  };

  const closePasswordPrompt = () => {
    setShowAdminLockModal(false);
    setAdminPassword('');
    setPasswordError('');
  };

  const handleUnlockAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword.trim()) {
      setPasswordError('Please enter the admin password.');
      return;
    }

    setVerifyingPassword(true);
    setPasswordError('');
    try {
      const valid = await verifyAdminPasscode(adminPassword);
      if (!valid) {
        setPasswordError('Incorrect password. Please try again.');
        return;
      }
      setShowAdminLockModal(false);
      setAdminPassword('');
      onOpenAdminPanel();
    } finally {
      setVerifyingPassword(false);
    }
  };

  // --- Top Bill Search & Phone Lookup ---
  const handleBillSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchError(
        'Please enter at least 2 characters (Order / Invoice Number or Client Name).'
      );
      return;
    }

    setSearching(true);
    setSearchError('');
    setSelectedMatch(null);
    setPhoneLookupResult(null);
    try {
      const data = await api.searchPublicBills(trimmed);
      setResults(data.results);
      setHasSearched(true);
      if (data.results.length === 1) {
        setSelectedMatch(data.results[0]);
      }
    } catch (err) {
      setSearchError(formatApiError(err, 'Failed to search bills.'));
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const runPhoneLookup = async (rawPhone: string) => {
    const cleanDigits = normalizePhoneDigits(rawPhone);
    if (cleanDigits.length < 6) {
      setSearchError('Please enter at least 6 digits of your phone number.');
      return;
    }

    setSearching(true);
    setSearchError('');
    setSelectedMatch(null);
    setResults([]);
    setPhoneLookupResult(null);
    try {
      const data = await api.lookupCustomerByPhone(rawPhone);
      setPhoneLookupResult(data);
      setHasSearched(true);
    } catch (err) {
      setSearchError(formatApiError(err, 'Failed to look up phone number.'));
    } finally {
      setSearching(false);
    }
  };

  const handlePhoneLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runPhoneLookup(phoneQuery);
  };

  const clearLookup = () => {
    setQuery('');
    setPhoneQuery('');
    setSearchError('');
    setHasSearched(false);
    setResults([]);
    setPhoneLookupResult(null);
    setSelectedMatch(null);
  };

  const handleCopyCode = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeId(id);
      setTimeout(() => {
        setCopiedCodeId((curr) => (curr === id ? null : curr));
      }, 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(CHECKOUT_UPI_ID);
      setUpiCopied(true);
      setTimeout(() => setUpiCopied(false), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadPdf = async () => {
    if (!sheetRef.current || !selectedMatch) return;
    setExportingPdf(true);
    try {
      const safeName = (selectedMatch.invoice.customerName || 'Customer').replace(
        /[^a-zA-Z0-9_-]+/g,
        '_'
      );
      await exportInvoiceElementToPdf(
        sheetRef.current,
        `${selectedMatch.invoice.invoiceNumber}_${safeName}.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  // --- Product Detail & Checkout Modal ---
  const openProductDetail = (item: PublicShopProduct) => {
    setSelectedProduct(item);
    setActiveImageIndex(0);
    setModalStep('detail');
    setOrderQty('1');
    setOrderError('');
    setPlacedOrder(null);
  };

  const closeProductModal = () => {
    setSelectedProduct(null);
    setOrderError('');
    setPlacedOrder(null);
  };

  const openCheckoutStep = () => {
    setOrderError('');
    setPaymentMethod('COD');
    setUpiScreenshotDataUrl('');
    setModalStep('checkout');
  };

  const handleUploadUpiScreenshot = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOrderError('');
    setUploadingScreenshot(true);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 640, {
        quality: 0.72,
        preserveTransparency: false,
        maxDataUrlLength: 140_000,
      });
      setUpiScreenshotDataUrl(dataUrl);
    } catch (err) {
      setOrderError(
        err instanceof Error
          ? err.message
          : 'Invalid screenshot image. Please choose a JPG or PNG.'
      );
    } finally {
      setUploadingScreenshot(false);
    }
  };

  const parsedQty = Math.max(1, Math.floor(Number(orderQty) || 1));
  const checkoutTotal = selectedProduct
    ? Number((parsedQty * selectedProduct.price).toFixed(2))
    : 0;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setOrderError('');

    if (!customerName.trim()) {
      setOrderError('Please enter your full name.');
      return;
    }
    if (normalizePhoneDigits(customerPhone).length < 8) {
      setOrderError('Please enter a valid 10-digit phone number.');
      return;
    }
    if (!customerAddress.trim()) {
      setOrderError('Please enter your full delivery address.');
      return;
    }
    if (paymentMethod === 'UPI' && !upiScreenshotDataUrl) {
      setOrderError(
        `Please upload your UPI payment screenshot after paying to ${CHECKOUT_UPI_ID}.`
      );
      return;
    }

    setOrderSubmitting(true);
    try {
      const res = await api.createCustomerOrder({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerWhatsapp: customerWhatsapp.trim() || customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        customerCity: customerCity.trim(),
        customerState: customerState.trim(),
        customerPinCode: customerPinCode.trim(),
        productId: selectedProduct.catalogProductId,
        productName: selectedProduct.name,
        productCategory: selectedProduct.category,
        productSize: selectedProduct.size,
        productColor: selectedProduct.color,
        quantity: parsedQty,
        unitPrice: selectedProduct.price,
        paymentMethod,
        paymentScreenshotDataUrl:
          paymentMethod === 'UPI' ? upiScreenshotDataUrl : '',
        customerNote: customerNote.trim(),
      });
      setPlacedOrder(res.order);
      setModalStep('success');
    } catch (err) {
      setOrderError(formatApiError(err, 'Could not submit order. Please try again.'));
    } finally {
      setOrderSubmitting(false);
    }
  };

  const adBannerCard = (
    <div className="rounded-2xl overflow-hidden border border-[#EFE2F5] bg-white/95 backdrop-blur-md shadow-sm relative">
      {viewPanel.advertisement.imageDataUrl && !failedAdImage ? (
        <div className="relative">
          <img
            src={viewPanel.advertisement.imageDataUrl}
            alt={viewPanel.advertisement.title || 'Featured Advertisement'}
            referrerPolicy="no-referrer"
            onError={() => setFailedAdImage(true)}
            className="w-full max-h-[240px] sm:max-h-[320px] object-cover"
          />
          {(viewPanel.advertisement.title || viewPanel.advertisement.subtitle) && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-5 py-4 text-white">
              {viewPanel.advertisement.title && (
                <div className="font-display-serif text-lg sm:text-xl font-bold leading-snug">
                  {viewPanel.advertisement.title}
                </div>
              )}
              {viewPanel.advertisement.subtitle && (
                <p className="text-xs sm:text-sm text-white/90 mt-0.5">
                  {viewPanel.advertisement.subtitle}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gradient-to-r from-[#FDF2F8] via-white to-[#F3E8FF] px-5 py-4">
          <div className="font-display-serif text-lg font-bold text-[#1F122B]">
            {viewPanel.advertisement.title}
          </div>
          {viewPanel.advertisement.subtitle && (
            <p className="text-xs sm:text-sm text-[#5B4B6B] mt-0.5">
              {viewPanel.advertisement.subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const upiDeepLink = `upi://pay?pa=${encodeURIComponent(
    CHECKOUT_UPI_ID
  )}&pn=${encodeURIComponent(
    settings?.businessName || 'Glamour Galleria'
  )}&am=${checkoutTotal.toFixed(2)}&cu=INR`;

  return (
    <div className="relative min-h-screen text-[#1F122B] flex flex-col">
      <AppBackground backgroundImageDataUrl={settings?.backgroundImageDataUrl} />

      {/* Top Portal Header with View Panel / Admin Panel Switcher */}
      <header className="no-print sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[#EFE2F5]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandLogo
              logoDataUrl={settings?.logoDataUrl}
              businessName={settings?.businessName}
              size={38}
            />
            <div className="min-w-0">
              <div className="font-display-serif text-base sm:text-lg font-bold text-[#6D28D9] truncate">
                {settings?.businessName || 'Glamour Galleria'}
              </div>
              <div className="text-[11px] font-medium text-[#9D174D] truncate hidden sm:block">
                {settings?.tagline || 'Your Style, Our Priority'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex rounded-xl bg-[#F8F3FB] p-1 border border-[#EFE2F5]">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>View Panel</span>
              </button>

              <button
                type="button"
                onClick={openPasswordPrompt}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-[#5B4B6B] hover:text-[#1F122B] hover:bg-white transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-[#7E22CE]" />
                <span>Admin Panel</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-7 space-y-5">
        {/* 1. TOP ADVERTISEMENT BANNER (ABOVE SEARCH BILL & ORDER SECTION) */}
        {showAdvertisement && (
          <section className="no-print" aria-label="Featured Advertisement">
            {isSafeHttpUrl(viewPanel.advertisement.linkUrl) ? (
              <a
                href={viewPanel.advertisement.linkUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:opacity-95 transition-opacity"
              >
                {adBannerCard}
              </a>
            ) : (
              adBannerCard
            )}
          </section>
        )}

        {/* 2. COMPACT SEARCH BILL & PHONE NUMBER LOOKUP BAR */}
        <section className="no-print rounded-2xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md px-4 py-3 shadow-xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F8F3FB] border border-[#EFE2F5]">
              <button
                type="button"
                onClick={() => {
                  setLookupMode('bill');
                  setSearchError('');
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  lookupMode === 'bill'
                    ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                    : 'text-[#5B4B6B] hover:text-[#1F122B]'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Search Bill</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLookupMode('phone');
                  setSearchError('');
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  lookupMode === 'phone'
                    ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                    : 'text-[#5B4B6B] hover:text-[#1F122B]'
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                <span>My Orders &amp; Bills (Phone)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={openPasswordPrompt}
              className="hidden lg:inline-flex items-center gap-1 rounded-xl border border-[#E6D9EE] bg-white px-3 py-1.5 text-xs font-semibold text-[#7E22CE] hover:border-[#9333EA] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="w-3 h-3" />
              <span>Open Admin Panel</span>
            </button>
          </div>

          {lookupMode === 'bill' ? (
            <form
              onSubmit={handleBillSearch}
              className="flex flex-col sm:flex-row sm:items-center gap-2.5"
            >
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-[#9333EA] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Order / Invoice No (GG-001) or Client Name..."
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-9 pr-8 py-2 text-xs sm:text-sm text-[#1F122B] placeholder:text-[#A493B5] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                />
                {(query || hasSearched || selectedMatch) && (
                  <button
                    type="button"
                    onClick={clearLookup}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8E7C9E] hover:text-[#1F122B] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={searching}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{searching ? 'Searching...' : 'Search Bill'}</span>
              </button>
            </form>
          ) : (
            <form
              onSubmit={handlePhoneLookupSubmit}
              className="flex flex-col sm:flex-row sm:items-center gap-2.5"
            >
              <div className="relative flex-1 min-w-0">
                <Phone className="w-3.5 h-3.5 text-[#9333EA] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="tel"
                  inputMode="tel"
                  value={phoneQuery}
                  onChange={(e) => setPhoneQuery(e.target.value)}
                  placeholder="Enter your Phone Number to check Orders & Bills..."
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-9 pr-8 py-2 text-xs sm:text-sm font-mono-num text-[#1F122B] placeholder:text-[#A493B5] placeholder:font-sans focus:border-[#9333EA] focus:bg-white focus:outline-none"
                />
                {(phoneQuery || hasSearched || phoneLookupResult) && (
                  <button
                    type="button"
                    onClick={clearLookup}
                    aria-label="Clear phone lookup"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8E7C9E] hover:text-[#1F122B] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={searching}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <User className="w-3.5 h-3.5" />
                <span>{searching ? 'Checking...' : 'Check Account'}</span>
              </button>
            </form>
          )}

          {searchError && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2 text-xs font-medium text-[#BE123C]">
              {searchError}
            </div>
          )}
        </section>

        {/* 3A. PHONE LOOKUP RESULTS (CUSTOMER PROFILE + ORDERS + GENERATED BILLS) */}
        {hasSearched && phoneLookupResult && !selectedMatch && (
          <section className="no-print rounded-2xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-5 space-y-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F4ECF8] pb-3">
              <div>
                <h2 className="text-base font-bold text-[#1F122B] flex items-center gap-2">
                  <User className="w-4 h-4 text-[#7E22CE]" />
                  <span>
                    {phoneLookupResult.client?.name ||
                      phoneLookupResult.orders[0]?.customerName ||
                      phoneLookupResult.bills[0]?.invoice.customerName ||
                      'Customer Account'}
                  </span>
                </h2>
                <div className="text-xs text-[#6B5B7B] mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="font-mono-num font-semibold">
                    {phoneLookupResult.client?.mobile || phoneQuery.trim()}
                  </span>
                  {phoneLookupResult.client?.address && (
                    <>
                      <span>·</span>
                      <span>
                        {[
                          phoneLookupResult.client.address,
                          phoneLookupResult.client.city,
                          phoneLookupResult.client.pinCode,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={clearLookup}
                className="text-xs font-semibold text-[#7E22CE] hover:underline cursor-pointer"
              >
                Close
              </button>
            </div>

            {!phoneLookupResult.client &&
            phoneLookupResult.orders.length === 0 &&
            phoneLookupResult.bills.length === 0 ? (
              <div className="py-6 text-center space-y-1">
                <div className="text-sm font-bold text-[#1F122B]">
                  No account, orders, or bills found for &ldquo;{phoneQuery.trim()}&rdquo;
                </div>
                <p className="text-xs text-[#6B5B7B]">
                  Place an order from our Shopping section below to automatically create your phone account.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Customer Placed Orders */}
                {phoneLookupResult.orders.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-[#4A3B59]">
                      Your Orders ({phoneLookupResult.orders.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {phoneLookupResult.orders.map((ord) => {
                        const matchedBill = ord.invoiceId
                          ? phoneLookupResult.bills.find(
                              (b) => b.invoice.id === ord.invoiceId
                            )
                          : undefined;
                        return (
                          <div
                            key={ord.id}
                            className="rounded-xl border border-[#EFE2F5] bg-[#FDF9FC] p-3.5 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
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
                                  · {ord.status === 'Pending' ? 'Pending Confirmation' : ord.status}
                                </span>
                              </div>
                              <div className="text-sm font-bold text-[#1F122B] truncate">
                                {ord.productName} × {ord.quantity}
                              </div>
                              <div className="text-xs text-[#6B5B7B] font-mono-num">
                                {formatCurrency(ord.totalAmount, sym)} ·{' '}
                                {ord.paymentMethod === 'UPI' ? 'Paid via UPI' : 'Cash on Delivery'}
                                {ord.invoiceNumber ? ` · Bill ${ord.invoiceNumber}` : ''}
                              </div>
                            </div>

                            {matchedBill && (
                              <button
                                type="button"
                                onClick={() => setSelectedMatch(matchedBill)}
                                className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3 py-2 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>View Bill</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Customer Generated Bills */}
                {phoneLookupResult.bills.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-[#4A3B59]">
                      Generated Bills ({phoneLookupResult.bills.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {phoneLookupResult.bills.map((match) => {
                        const inv = match.invoice;
                        const invSym = match.settings.currencySymbol || sym;
                        return (
                          <div
                            key={inv.id}
                            className="rounded-xl border border-[#EFE2F5] bg-white p-3.5 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-mono-num font-bold text-[#6D28D9]">
                                  {inv.invoiceNumber}
                                </span>
                                <span className="text-[#9D8BAE]">·</span>
                                <span className="font-mono-num text-[#6B5B7B]">
                                  {inv.invoiceDate}
                                </span>
                                <span className="text-[#9D8BAE]">·</span>
                                <span className="inline-flex items-center gap-1 font-semibold text-[#7E22CE]">
                                  <Truck className="w-3 h-3" />
                                  {inv.deliveryStatus}
                                </span>
                              </div>
                              <div className="text-xs font-mono-num font-bold text-[#1F122B]">
                                Total: {formatCurrency(inv.totalAmount, invSym)}
                                {inv.dueAmount > 0 ? (
                                  <span className="ml-2 text-[#BE123C]">
                                    (Due: {formatCurrency(inv.dueAmount, invSym)})
                                  </span>
                                ) : (
                                  <span className="ml-2 text-[#15803D]">(Paid)</span>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedMatch(match)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>View Bill</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 3B. BILL SEARCH RESULTS & FULL A4 INVOICE PREVIEW */}
        {hasSearched && !phoneLookupResult && !selectedMatch && (
          <section className="space-y-3">
            {results.length === 0 ? (
              <div className="rounded-2xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-8 text-center space-y-2">
                <FileText className="w-7 h-7 text-[#C4B5D9] mx-auto" />
                <div className="text-sm font-bold text-[#1F122B]">
                  No matching bill found for &ldquo;{query.trim()}&rdquo;
                </div>
                <p className="text-xs text-[#6B5B7B]">
                  Please check your Order / Invoice Number or Client Name and try again.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-[#1F122B] bg-white/85 backdrop-blur-xs inline-block rounded-lg px-2.5 py-1">
                    Found {results.length} matching{' '}
                    {results.length === 1 ? 'bill' : 'bills'} — select to view
                  </div>
                  <button
                    type="button"
                    onClick={clearLookup}
                    className="text-xs font-semibold text-[#7E22CE] bg-white/85 rounded-lg px-2.5 py-1 hover:underline cursor-pointer"
                  >
                    Clear results
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {results.map((match) => {
                    const inv = match.invoice;
                    const invSym = match.settings.currencySymbol || sym;
                    return (
                      <div
                        key={inv.id}
                        className="rounded-2xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md p-4 flex items-center justify-between gap-4 hover:border-[#9333EA] transition-colors"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono-num text-sm font-bold text-[#6D28D9]">
                              {inv.invoiceNumber}
                            </span>
                            <span className="text-[#9D8BAE]">·</span>
                            <span className="font-mono-num text-[#6B5B7B]">
                              {inv.invoiceDate}
                            </span>
                            <span className="text-[#9D8BAE]">·</span>
                            <span className="inline-flex items-center gap-1 font-semibold text-[#7E22CE]">
                              <Truck className="w-3 h-3" />
                              {inv.deliveryStatus}
                            </span>
                          </div>
                          <div className="text-sm font-bold text-[#1F122B] truncate">
                            {inv.customerName}
                          </div>
                          <div className="text-xs text-[#6B5B7B] truncate">
                            {inv.items.length}{' '}
                            {inv.items.length === 1 ? 'item' : 'items'}
                            {inv.customerCityStatePin
                              ? ` · ${inv.customerCityStatePin}`
                              : ''}
                          </div>
                          <div className="text-xs font-mono-num font-bold text-[#1F122B]">
                            Total: {formatCurrency(inv.totalAmount, invSym)}
                            {inv.dueAmount > 0 && (
                              <span className="ml-2 text-[#BE123C]">
                                (Due: {formatCurrency(inv.dueAmount, invSym)})
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedMatch(match)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>View Bill</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {selectedMatch && (
          <section className="space-y-4">
            <div className="no-print max-w-[794px] mx-auto flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(results.length > 1 || phoneLookupResult) && (
                  <button
                    type="button"
                    onClick={() => setSelectedMatch(null)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] whitespace-nowrap cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>
                      {phoneLookupResult ? 'Back to Account' : `All Results (${results.length})`}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearLookup}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-semibold text-[#5B4B6B] hover:border-[#9333EA] whitespace-nowrap cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close Bill</span>
                </button>
                <span className="text-xs font-semibold text-[#1F122B] bg-white/85 backdrop-blur-xs rounded-lg px-2.5 py-1">
                  Invoice{' '}
                  <strong className="font-mono-num text-[#6D28D9]">
                    {selectedMatch.invoice.invoiceNumber}
                  </strong>{' '}
                  · {selectedMatch.invoice.customerName}
                </span>
              </div>

              <button
                type="button"
                disabled={exportingPdf}
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap cursor-pointer disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                <span>{exportingPdf ? 'Creating PDF...' : 'Download PDF Bill'}</span>
              </button>
            </div>

            <div className="pb-4 max-w-[794px] mx-auto">
              <ScaledInvoicePreview
                invoice={selectedMatch.invoice}
                settings={selectedMatch.settings}
                sheetRef={sheetRef}
              />
            </div>
          </section>
        )}

        {/* 4. DISCOUNT & COMPACT E-COMMERCE SHOPPING GRID */}
        {(hasDiscountContent || hasShoppingContent) && (
          <div className="no-print space-y-5 pt-1">
            {hasDiscountContent && hasShoppingContent && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/90 backdrop-blur-md border border-[#EFE2F5]">
                  <button
                    type="button"
                    onClick={() => setSectionTab('all')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      sectionTab === 'all'
                        ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                        : 'text-[#5B4B6B] hover:text-[#1F122B]'
                    }`}
                  >
                    All Offers &amp; Shop
                  </button>
                  <button
                    type="button"
                    onClick={() => setSectionTab('discount')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      sectionTab === 'discount'
                        ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                        : 'text-[#5B4B6B] hover:text-[#1F122B]'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>Discount</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSectionTab('shopping')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      sectionTab === 'shopping'
                        ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                        : 'text-[#5B4B6B] hover:text-[#1F122B]'
                    }`}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Shopping</span>
                  </button>
                </div>
              </div>
            )}

            {/* DISCOUNT SECTION */}
            {hasDiscountContent &&
              (sectionTab === 'all' || sectionTab === 'discount') && (
                <section
                  aria-label="Discount Offers"
                  className="rounded-3xl border border-[#EFE2F5] bg-white/92 backdrop-blur-md p-5 sm:p-6 space-y-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#F4ECF8] pb-3">
                    <div>
                      <h2 className="font-display-serif text-xl font-bold text-[#1F122B] flex items-center gap-2">
                        <Tag className="w-4 h-4 text-[#DB2777] shrink-0" />
                        <span>
                          {viewPanel.discount.sectionTitle ||
                            'Special Discounts & Offers'}
                        </span>
                      </h2>
                      {viewPanel.discount.headline && (
                        <p className="text-xs sm:text-sm text-[#6B5B7B] mt-0.5">
                          {viewPanel.discount.headline}
                        </p>
                      )}
                    </div>
                  </div>

                  {viewPanel.discount.offers.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {viewPanel.discount.offers.map((offer) => (
                        <div
                          key={offer.id}
                          className="rounded-2xl border border-[#F2E6F7] bg-[#FDF9FE] p-4 flex flex-col justify-between gap-3"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-baseline justify-between gap-2">
                              <h3 className="text-sm font-bold text-[#1F122B]">
                                {offer.title}
                              </h3>
                              <span className="font-mono-num text-sm font-bold text-[#DB2777] shrink-0">
                                {offer.discountLabel}
                              </span>
                            </div>
                            {offer.description && (
                              <p className="text-xs text-[#5B4B6B] leading-relaxed">
                                {offer.description}
                              </p>
                            )}
                          </div>

                          {(offer.promoCode || offer.validTill) && (
                            <div className="pt-2.5 border-t border-[#EFE2F5] flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="text-[#6B5B7B]">
                                {offer.validTill || 'Limited time offer'}
                              </span>
                              {offer.promoCode && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyCode(offer.id, offer.promoCode!)
                                  }
                                  className="inline-flex items-center gap-1 font-mono-num font-bold text-[#7E22CE] hover:text-[#DB2777] cursor-pointer whitespace-nowrap"
                                >
                                  {copiedCodeId === offer.id ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-[#15803D]" />
                                      <span className="text-[#15803D]">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>{offer.promoCode}</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

            {/* COMPACT FLIPKART/AMAZON STYLE SHOPPING GRID */}
            {hasShoppingContent &&
              (sectionTab === 'all' || sectionTab === 'shopping') && (
                <section
                  aria-label="Shopping Collection"
                  className="rounded-3xl border border-[#EFE2F5] bg-white/92 backdrop-blur-md p-4 sm:p-6 space-y-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#F4ECF8] pb-3">
                    <div>
                      <h2 className="font-display-serif text-xl font-bold text-[#1F122B] flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-[#7E22CE] shrink-0" />
                        <span>
                          {viewPanel.shopping.sectionTitle || 'Shop Our Collection'}
                        </span>
                      </h2>
                      {viewPanel.shopping.subtitle && (
                        <p className="text-xs sm:text-sm text-[#6B5B7B] mt-0.5">
                          {viewPanel.shopping.subtitle}
                        </p>
                      )}
                    </div>
                    <span className="font-mono-num text-xs font-semibold text-[#6B5B7B]">
                      {filteredShoppingItems.length}{' '}
                      {filteredShoppingItems.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  {/* Clean Category Filter Bar */}
                  {shoppingCategories.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShoppingCategory('ALL')}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          shoppingCategory === 'ALL'
                            ? 'border-[#7E22CE] bg-[#7E22CE] text-white'
                            : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#4A3B59] hover:border-[#9333EA]'
                        }`}
                      >
                        All ({shoppingItems.length})
                      </button>
                      {shoppingCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setShoppingCategory(cat)}
                          className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            shoppingCategory === cat
                              ? 'border-[#7E22CE] bg-[#7E22CE] text-white'
                              : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#4A3B59] hover:border-[#9333EA]'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}

                  {filteredShoppingItems.length === 0 ? (
                    <div className="py-10 text-center text-xs text-[#6B5B7B]">
                      No shopping items found in this category.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {filteredShoppingItems.map((item) => {
                        const discountPercent =
                          item.originalPrice && item.originalPrice > item.price
                            ? Math.round(
                                ((item.originalPrice - item.price) /
                                  item.originalPrice) *
                                  100
                              )
                            : 0;
                        const mainImg =
                          item.imageDataUrls[0] || item.imageDataUrl || '';

                        return (
                          <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openProductDetail(item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openProductDetail(item);
                              }
                            }}
                            className="group rounded-2xl border border-[#EFE2F5] bg-white overflow-hidden flex flex-col justify-between hover:border-[#9333EA] hover:shadow-md transition-all cursor-pointer text-left"
                          >
                            <div>
                              <div className="aspect-square bg-gradient-to-br from-[#FDF2F8] to-[#F5F3FF] relative overflow-hidden border-b border-[#F4ECF8] flex items-center justify-center">
                                {mainImg ? (
                                  <img
                                    src={mainImg}
                                    alt={item.name}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                ) : (
                                  <ShoppingBag className="w-8 h-8 text-[#C084FC]" />
                                )}
                                {discountPercent > 0 && (
                                  <span className="absolute top-2 left-2 rounded-md bg-[#15803D] px-1.5 py-0.5 text-[10px] font-bold text-white font-mono-num">
                                    {discountPercent}% OFF
                                  </span>
                                )}
                                {item.imageDataUrls.length > 1 && (
                                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white font-mono-num">
                                    {item.imageDataUrls.length} photos
                                  </span>
                                )}
                              </div>

                              <div className="p-2.5 sm:p-3 space-y-1">
                                <div className="text-[10px] font-semibold text-[#7E22CE] truncate">
                                  {item.category}
                                </div>
                                <h3 className="text-xs sm:text-sm font-bold text-[#1F122B] leading-snug line-clamp-2 min-h-[2.25rem]">
                                  {item.name}
                                </h3>
                                {(item.size || item.color) && (
                                  <div className="text-[10px] text-[#6B5B7B] truncate">
                                    {[
                                      item.size ? `Size ${item.size}` : '',
                                      item.color,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 pt-1 space-y-2">
                              <div className="font-mono-num flex items-baseline gap-1.5 flex-wrap">
                                <span className="text-sm sm:text-base font-bold text-[#1F122B]">
                                  {formatCurrency(item.price, sym)}
                                </span>
                                {item.originalPrice &&
                                  item.originalPrice > item.price && (
                                    <span className="text-[11px] text-[#8E7C9E] line-through">
                                      {formatCurrency(item.originalPrice, sym)}
                                    </span>
                                  )}
                              </div>

                              <div className="w-full rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-1.5 px-2 text-center text-[11px] font-semibold text-white group-hover:opacity-95">
                                View &amp; Order
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
          </div>
        )}
      </main>

      {/* PRODUCT DETAIL + ORDER CHECKOUT MODAL */}
      {selectedProduct && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-[#EFE2F5] bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-[#F4ECF8] px-5 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {modalStep === 'checkout' && (
                  <button
                    type="button"
                    onClick={() => {
                      setModalStep('detail');
                      setOrderError('');
                    }}
                    className="p-1.5 rounded-lg border border-[#E6D9EE] text-[#4A3B59] hover:border-[#9333EA] cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div className="text-sm font-bold text-[#1F122B] truncate">
                  {modalStep === 'detail'
                    ? 'Product Details'
                    : modalStep === 'checkout'
                      ? 'Complete Your Order'
                      : 'Order Placed Successfully'}
                </div>
              </div>
              <button
                type="button"
                onClick={closeProductModal}
                aria-label="Close"
                className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* STEP 1: PRODUCT DETAIL VIEW WITH MULTI-IMAGE GALLERY */}
            {modalStep === 'detail' && (
              <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="space-y-2.5">
                  <div className="aspect-square rounded-2xl border border-[#EFE2F5] bg-gradient-to-br from-[#FDF2F8] to-[#F5F3FF] relative overflow-hidden flex items-center justify-center">
                    {selectedProduct.imageDataUrls.length > 0 ? (
                      <>
                        <img
                          src={
                            selectedProduct.imageDataUrls[activeImageIndex] ||
                            selectedProduct.imageDataUrls[0]
                          }
                          alt={`${selectedProduct.name} photo ${activeImageIndex + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        {selectedProduct.imageDataUrls.length > 1 && (
                          <>
                            <button
                              type="button"
                              aria-label="Previous photo"
                              onClick={() =>
                                setActiveImageIndex((prev) =>
                                  prev === 0
                                    ? selectedProduct.imageDataUrls.length - 1
                                    : prev - 1
                                )
                              }
                              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 border border-[#E6D9EE] p-1.5 text-[#1F122B] hover:bg-white shadow-sm cursor-pointer"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="Next photo"
                              onClick={() =>
                                setActiveImageIndex((prev) =>
                                  (prev + 1) %
                                  selectedProduct.imageDataUrls.length
                                )
                              }
                              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 border border-[#E6D9EE] p-1.5 text-[#1F122B] hover:bg-white shadow-sm cursor-pointer"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                            <span className="absolute bottom-2 right-2 rounded-lg bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white font-mono-num">
                              {activeImageIndex + 1} /{' '}
                              {selectedProduct.imageDataUrls.length}
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <ShoppingBag className="w-14 h-14 text-[#C084FC]" />
                    )}
                  </div>

                  {selectedProduct.imageDataUrls.length > 1 && (
                    <div className="grid grid-cols-5 gap-2">
                      {selectedProduct.imageDataUrls.map((thumb, idx) => (
                        <button
                          key={`${idx}-${thumb.slice(0, 20)}`}
                          type="button"
                          onClick={() => setActiveImageIndex(idx)}
                          className={`aspect-square rounded-xl border overflow-hidden cursor-pointer transition-all ${
                            activeImageIndex === idx
                              ? 'border-[#DB2777] ring-2 ring-[#DB2777]/30'
                              : 'border-[#E6D9EE] opacity-75 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={thumb}
                            alt={`Thumbnail ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-[#7E22CE]">
                      {selectedProduct.category}
                    </div>
                    <h2 className="font-display-serif text-2xl font-bold text-[#1F122B] leading-snug">
                      {selectedProduct.name}
                    </h2>
                  </div>

                  <div className="flex items-baseline gap-2.5 flex-wrap font-mono-num">
                    <span className="text-2xl font-bold text-[#1F122B]">
                      {formatCurrency(selectedProduct.price, sym)}
                    </span>
                    {selectedProduct.originalPrice &&
                      selectedProduct.originalPrice > selectedProduct.price && (
                        <>
                          <span className="text-sm text-[#8E7C9E] line-through">
                            {formatCurrency(selectedProduct.originalPrice, sym)}
                          </span>
                          <span className="text-xs font-bold text-[#15803D]">
                            {Math.round(
                              ((selectedProduct.originalPrice -
                                selectedProduct.price) /
                                selectedProduct.originalPrice) *
                                100
                            )}
                            % OFF
                          </span>
                        </>
                      )}
                  </div>

                  {(selectedProduct.size ||
                    selectedProduct.color ||
                    selectedProduct.stockQty !== undefined) && (
                    <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-3 space-y-1 text-xs text-[#4A3B59]">
                      {selectedProduct.size && (
                        <div>
                          Size: <strong>{selectedProduct.size}</strong>
                        </div>
                      )}
                      {selectedProduct.color && (
                        <div>
                          Color: <strong>{selectedProduct.color}</strong>
                        </div>
                      )}
                      {selectedProduct.stockQty !== undefined && (
                        <div
                          className={
                            selectedProduct.stockQty > 0
                              ? 'text-[#15803D] font-semibold'
                              : 'text-[#B45309] font-semibold'
                          }
                        >
                          {selectedProduct.stockQty > 0
                            ? `In Stock (${selectedProduct.stockQty} available)`
                            : 'Made to order / Limited stock'}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedProduct.description && (
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-[#4A3B59]">
                        Product Information
                      </div>
                      <p className="text-xs sm:text-sm text-[#5B4B6B] leading-relaxed whitespace-pre-line">
                        {selectedProduct.description}
                      </p>
                    </div>
                  )}

                  {/* Quantity Selector */}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-xs font-semibold text-[#4A3B59]">
                      Quantity:
                    </span>
                    <div className="inline-flex items-center rounded-xl border border-[#E6D9EE] bg-[#FDFBFE]">
                      <button
                        type="button"
                        onClick={() =>
                          setOrderQty(String(Math.max(1, parsedQty - 1)))
                        }
                        className="p-2 text-[#5B4B6B] hover:text-[#1F122B] cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={orderQty}
                        onChange={(e) =>
                          setOrderQty(
                            sanitizeNumericInput(e.target.value, {
                              allowDecimal: false,
                            })
                          )
                        }
                        className="w-10 text-center text-sm font-mono-num font-bold text-[#1F122B] bg-transparent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setOrderQty(String(parsedQty + 1))}
                        className="p-2 text-[#5B4B6B] hover:text-[#1F122B] cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 space-y-2.5">
                    <button
                      type="button"
                      onClick={openCheckoutStep}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] py-3 px-5 text-sm font-bold text-white hover:opacity-95 cursor-pointer"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>
                        Order Now · {formatCurrency(checkoutTotal, sym)}
                      </span>
                    </button>

                    <a
                      href={buildProductWhatsAppUrl(selectedProduct, settings)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white py-2.5 px-4 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA]"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-[#7E22CE]" />
                      <span>Ask Question on WhatsApp</span>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: CUSTOMER CHECKOUT & PAYMENT */}
            {modalStep === 'checkout' && (
              <form onSubmit={handlePlaceOrder} className="p-5 sm:p-6 space-y-5">
                {/* Item & Total Summary */}
                <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl border border-[#EFE2F5] bg-white overflow-hidden shrink-0 flex items-center justify-center">
                      {selectedProduct.imageDataUrl ? (
                        <img
                          src={selectedProduct.imageDataUrl}
                          alt={selectedProduct.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ShoppingBag className="w-5 h-5 text-[#C084FC]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#1F122B] truncate">
                        {selectedProduct.name}
                      </div>
                      <div className="text-xs text-[#6B5B7B] font-mono-num">
                        Qty: {parsedQty} × {formatCurrency(selectedProduct.price, sym)}
                      </div>
                    </div>
                  </div>
                  <div className="font-mono-num text-base font-bold text-[#7E22CE] shrink-0">
                    {formatCurrency(checkoutTotal, sym)}
                  </div>
                </div>

                {orderError && (
                  <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
                    {orderError}
                  </div>
                )}

                {/* Customer Info (Linked by Phone Number) */}
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-[#4A3B59]">
                    Customer &amp; Delivery Details
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        Full Name <span className="text-[#DB2777]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Your full name"
                        className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        Phone Number <span className="text-[#DB2777]">*</span>
                      </label>
                      <input
                        type="tel"
                        inputMode="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="10-digit mobile number"
                        className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
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
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="House/Flat No, Street, Landmark, Area..."
                      className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        value={customerCity}
                        onChange={(e) => setCustomerCity(e.target.value)}
                        placeholder="City"
                        className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        State
                      </label>
                      <input
                        type="text"
                        value={customerState}
                        onChange={(e) => setCustomerState(e.target.value)}
                        placeholder="State"
                        className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        PIN Code
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={customerPinCode}
                        onChange={(e) =>
                          setCustomerPinCode(
                            sanitizeNumericInput(e.target.value, {
                              allowDecimal: false,
                            })
                          )
                        }
                        placeholder="700001"
                        className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        WhatsApp Number (if different)
                      </label>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={customerWhatsapp}
                        onChange={(e) => setCustomerWhatsapp(e.target.value)}
                        placeholder="Optional (defaults to Phone)"
                        className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                        Order Note / Size Note (optional)
                      </label>
                      <input
                        type="text"
                        value={customerNote}
                        onChange={(e) => setCustomerNote(e.target.value)}
                        placeholder="e.g. Size M preferred"
                        className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Payment Method Selection */}
                <div className="space-y-3 pt-2 border-t border-[#F4ECF8]">
                  <div className="text-xs font-bold uppercase tracking-wide text-[#4A3B59]">
                    Select Payment Method
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod('COD');
                        setOrderError('');
                      }}
                      className={`rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
                        paymentMethod === 'COD'
                          ? 'border-[#7E22CE] bg-[#FAF5FF] ring-1 ring-[#7E22CE]'
                          : 'border-[#E6D9EE] bg-white hover:border-[#C084FC]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#1F122B]">
                          Cash on Delivery (COD)
                        </span>
                        <Truck className="w-4 h-4 text-[#7E22CE]" />
                      </div>
                      <p className="text-xs text-[#6B5B7B] mt-1">
                        Pay when your order arrives at your doorstep.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod('UPI');
                        setOrderError('');
                      }}
                      className={`rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
                        paymentMethod === 'UPI'
                          ? 'border-[#7E22CE] bg-[#FAF5FF] ring-1 ring-[#7E22CE]'
                          : 'border-[#E6D9EE] bg-white hover:border-[#C084FC]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#1F122B]">
                          Online Payment (UPI)
                        </span>
                        <CreditCard className="w-4 h-4 text-[#DB2777]" />
                      </div>
                      <p className="text-xs text-[#6B5B7B] mt-1">
                        Pay via UPI &amp; upload payment screenshot.
                      </p>
                    </button>
                  </div>

                  {paymentMethod === 'UPI' && (
                    <div className="rounded-2xl border border-[#E9D5FF] bg-[#FDF9FF] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-semibold text-[#6B5B7B]">
                            Pay {formatCurrency(checkoutTotal, sym)} to UPI ID:
                          </div>
                          <div className="font-mono-num text-base font-bold text-[#6D28D9] select-all">
                            {CHECKOUT_UPI_ID}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleCopyUpi}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3 py-1.5 text-xs font-semibold text-[#7E22CE] hover:bg-[#FAF5FF] cursor-pointer whitespace-nowrap"
                          >
                            {upiCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-[#15803D]" />
                                <span className="text-[#15803D]">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy UPI ID</span>
                              </>
                            )}
                          </button>

                          <a
                            href={upiDeepLink}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#7E22CE] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap"
                          >
                            <span>Pay App</span>
                          </a>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#EFE2F5] space-y-2">
                        <div className="text-xs font-semibold text-[#4A3B59]">
                          Upload Payment Screenshot <span className="text-[#DB2777]">*</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3.5 py-2 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer whitespace-nowrap">
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {uploadingScreenshot
                                ? 'Compressing...'
                                : upiScreenshotDataUrl
                                  ? 'Change Screenshot'
                                  : 'Upload Screenshot'}
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
                            <div className="flex items-center gap-2">
                              <img
                                src={upiScreenshotDataUrl}
                                alt="Uploaded UPI payment screenshot"
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 rounded-lg object-cover border border-[#D8B4FE]"
                              />
                              <span className="text-xs font-semibold text-[#15803D] inline-flex items-center gap-1">
                                <ImageIcon className="w-3.5 h-3.5" />
                                Attached
                              </span>
                              <button
                                type="button"
                                onClick={() => setUpiScreenshotDataUrl('')}
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
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#F4ECF8]">
                  <button
                    type="button"
                    onClick={() => setModalStep('detail')}
                    className="rounded-xl border border-[#E6D9EE] px-4 py-2.5 text-xs font-semibold text-[#5B4B6B] cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={orderSubmitting || uploadingScreenshot}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-6 py-2.5 text-xs sm:text-sm font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {orderSubmitting
                        ? 'Placing Order...'
                        : `Place Order (${formatCurrency(checkoutTotal, sym)})`}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: ORDER PLACED CONFIRMATION */}
            {modalStep === 'success' && placedOrder && (
              <div className="p-6 sm:p-8 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] text-[#15803D] flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                  <h3 className="font-display-serif text-2xl font-bold text-[#1F122B]">
                    Order Placed!
                  </h3>
                  <p className="text-xs sm:text-sm text-[#6B5B7B]">
                    Order{' '}
                    <strong className="font-mono-num text-[#6D28D9]">
                      {placedOrder.orderNumber}
                    </strong>{' '}
                    has been saved and linked to your phone number{' '}
                    <strong className="font-mono-num text-[#1F122B]">
                      {placedOrder.customerPhone}
                    </strong>
                    .
                  </p>
                </div>

                <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] p-4 text-left text-xs space-y-1.5 max-w-md mx-auto">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6B5B7B]">Item</span>
                    <span className="font-bold text-[#1F122B]">
                      {placedOrder.productName} × {placedOrder.quantity}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6B5B7B]">Amount</span>
                    <span className="font-mono-num font-bold text-[#7E22CE]">
                      {formatCurrency(placedOrder.totalAmount, sym)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6B5B7B]">Payment</span>
                    <span className="font-semibold text-[#1F122B]">
                      {placedOrder.paymentMethod === 'UPI'
                        ? 'Online Payment (UPI)'
                        : 'Cash on Delivery (COD)'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2 pt-1 border-t border-[#F4ECF8]">
                    <span className="text-[#6B5B7B] inline-flex items-center gap-1 shrink-0">
                      <MapPin className="w-3 h-3" />
                      Address
                    </span>
                    <span className="text-right text-[#1F122B]">
                      {[
                        placedOrder.customerAddress,
                        placedOrder.customerCity,
                        placedOrder.customerPinCode,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#6B5B7B] max-w-md mx-auto">
                  Once our team confirms your order, your official bill/invoice will automatically appear when you search your phone number in View Panel.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const phoneToCheck = placedOrder.customerPhone;
                      closeProductModal();
                      setLookupMode('phone');
                      setPhoneQuery(phoneToCheck);
                      void runPhoneLookup(phoneToCheck);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>View My Order &amp; Account</span>
                  </button>
                  <button
                    type="button"
                    onClick={closeProductModal}
                    className="rounded-xl border border-[#E6D9EE] bg-white px-5 py-2.5 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] cursor-pointer"
                  >
                    Continue Shopping
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Panel Password Lock Modal */}
      {showAdminLockModal && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-lock-title"
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#EFE2F5] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FDF2F8] to-[#F3E8FF] border border-[#FBCFE8] flex items-center justify-center text-[#7E22CE] shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    id="admin-lock-title"
                    className="text-base font-bold text-[#1F122B]"
                  >
                    Admin Panel Locked
                  </h2>
                  <p className="text-xs text-[#6B5B7B] mt-0.5">
                    Enter admin password to access dashboard.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closePasswordPrompt}
                aria-label="Close"
                className="rounded-lg p-1.5 text-[#6B5B7B] hover:bg-[#F8F3FB] hover:text-[#1F122B] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {passwordError && (
              <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
                {passwordError}
              </div>
            )}

            <form onSubmit={handleUnlockAdmin} noValidate className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1.5">
                  Admin Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoFocus
                    autoComplete="current-password"
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      if (passwordError) setPasswordError('');
                    }}
                    placeholder="Enter admin password"
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

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closePasswordPrompt}
                  className="rounded-xl border border-[#E6D9EE] px-4 py-2 text-xs font-semibold text-[#4A3B59] hover:bg-[#F8F3FB] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifyingPassword}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap cursor-pointer disabled:opacity-60"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{verifyingPassword ? 'Checking...' : 'Unlock Admin Panel'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
