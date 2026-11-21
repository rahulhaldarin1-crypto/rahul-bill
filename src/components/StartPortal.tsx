import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  LayoutDashboard,
  Lock,
  Receipt,
  Search,
  ShoppingBag,
  Tag,
  Truck,
  X,
} from 'lucide-react';
import {
  BusinessSettings,
  Invoice,
  Product,
  ViewPanelConfig,
} from '../types/business';
import { verifyAdminPasscode } from '../utils/adminAuth';
import { api, formatApiError } from '../utils/api';
import {
  DEFAULT_VIEW_PANEL_CONFIG,
  exportInvoiceElementToPdf,
  formatCurrency,
} from '../utils/calculations';
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
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  size?: string;
  color?: string;
  imageDataUrl?: string;
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
    `I would like to order / inquire about:`,
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
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<BillMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<BillMatch | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  // View Panel section filter ('all' | 'discount' | 'shopping')
  const [sectionTab, setSectionTab] = useState<'all' | 'discount' | 'shopping'>('all');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [failedAdImage, setFailedAdImage] = useState(false);

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
    const customItems: PublicShopProduct[] = viewPanel.shopping.items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category || 'Featured',
      price: item.price,
      originalPrice: item.originalPrice,
      size: item.size,
      color: item.color,
      imageDataUrl: item.imageDataUrl,
      description: item.description,
    }));

    if (!viewPanel.shopping.includeCatalogProducts) {
      return customItems;
    }

    const catalogItems: PublicShopProduct[] = products.map((prod) => ({
      id: `cat-${prod.id}`,
      name: prod.name,
      category: prod.category || 'Collection',
      price: prod.sellingPrice,
      size: prod.size,
      color: prod.color,
      imageDataUrl: prod.imageDataUrl,
    }));

    return [...customItems, ...catalogItems];
  }, [
    viewPanel.shopping.items,
    viewPanel.shopping.includeCatalogProducts,
    products,
  ]);

  const hasDiscountContent =
    viewPanel.discount.enabled &&
    (viewPanel.discount.offers.length > 0 ||
      Boolean(viewPanel.discount.headline.trim()));

  const hasShoppingContent = viewPanel.shopping.enabled;

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

  const handleSearch = async (e: React.FormEvent) => {
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

  const clearBillSearch = () => {
    setQuery('');
    setSearchError('');
    setHasSearched(false);
    setResults([]);
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

        {/* 2. COMPACT SEARCH BILL BAR NEAR THE TOP */}
        <section className="no-print rounded-2xl border border-[#EFE2F5] bg-white/95 backdrop-blur-md px-4 py-3 shadow-xs space-y-2.5">
          <form
            onSubmit={handleSearch}
            className="flex flex-col sm:flex-row sm:items-center gap-2.5"
          >
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-[#FDF2F8] border border-[#FBCFE8] flex items-center justify-center text-[#DB2777] shrink-0">
                <Receipt className="w-4 h-4" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-[#1F122B] whitespace-nowrap">
                Search Bill
              </span>
            </div>

            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-[#9333EA] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Order No (GG-001) or Client Name..."
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-9 pr-8 py-2 text-xs sm:text-sm text-[#1F122B] placeholder:text-[#A493B5] focus:border-[#9333EA] focus:bg-white focus:outline-none"
              />
              {(query || hasSearched || selectedMatch) && (
                <button
                  type="button"
                  onClick={clearBillSearch}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8E7C9E] hover:text-[#1F122B] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                disabled={searching}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{searching ? 'Searching...' : 'Search Bill'}</span>
              </button>

              <button
                type="button"
                onClick={openPasswordPrompt}
                className="hidden lg:inline-flex items-center gap-1 rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-semibold text-[#7E22CE] hover:border-[#9333EA] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Lock className="w-3 h-3" />
                <span>Open Admin Panel</span>
              </button>
            </div>
          </form>

          {searchError && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2 text-xs font-medium text-[#BE123C]">
              {searchError}
            </div>
          )}
        </section>

        {/* 3. BILL SEARCH RESULTS & FULL A4 INVOICE PREVIEW */}
        {hasSearched && !selectedMatch && (
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
                    onClick={clearBillSearch}
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
                {results.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSelectedMatch(null)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] whitespace-nowrap cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>All Results ({results.length})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearBillSearch}
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

        {/* 4. DISCOUNT & SHOPPING OPTIONS / SECTIONS */}
        {(hasDiscountContent || hasShoppingContent) && (
          <div className="no-print space-y-5 pt-1">
            {/* Section Switcher Bar */}
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

            {/* SHOPPING SECTION */}
            {hasShoppingContent &&
              (sectionTab === 'all' || sectionTab === 'shopping') && (
                <section
                  aria-label="Shopping Collection"
                  className="rounded-3xl border border-[#EFE2F5] bg-white/92 backdrop-blur-md p-5 sm:p-6 space-y-4"
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
                      {shoppingItems.length}{' '}
                      {shoppingItems.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  {shoppingItems.length === 0 ? (
                    <div className="py-10 text-center text-xs text-[#6B5B7B]">
                      No shopping items are currently listed. Check back soon!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {shoppingItems.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-[#EFE2F5] bg-white overflow-hidden flex flex-col justify-between hover:border-[#C084FC] transition-colors"
                        >
                          <div>
                            <div className="h-48 bg-gradient-to-br from-[#FDF2F8] to-[#F5F3FF] flex items-center justify-center overflow-hidden border-b border-[#F4ECF8]">
                              {item.imageDataUrl ? (
                                <img
                                  src={item.imageDataUrl}
                                  alt={item.name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ShoppingBag className="w-10 h-10 text-[#C084FC]" />
                              )}
                            </div>

                            <div className="p-4 space-y-2">
                              <div className="text-[11px] font-medium text-[#7E22CE] truncate">
                                {[
                                  item.category,
                                  item.size ? `Size ${item.size}` : '',
                                  item.color,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                              <h3 className="text-base font-bold text-[#1F122B] leading-snug">
                                {item.name}
                              </h3>
                              {item.description && (
                                <p className="text-xs text-[#6B5B7B] leading-relaxed">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="px-4 py-3 bg-[#FDFBFE] border-t border-[#F4ECF8] flex items-center justify-between gap-3">
                            <div className="font-mono-num">
                              <span className="text-base font-bold text-[#1F122B]">
                                {formatCurrency(item.price, sym)}
                              </span>
                              {item.originalPrice &&
                                item.originalPrice > item.price && (
                                  <span className="ml-2 text-xs text-[#8E7C9E] line-through">
                                    {formatCurrency(item.originalPrice, sym)}
                                  </span>
                                )}
                            </div>

                            <a
                              href={buildProductWhatsAppUrl(item, settings)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Order Now</span>
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
          </div>
        )}
      </main>

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
