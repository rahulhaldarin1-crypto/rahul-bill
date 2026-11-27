import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  CreditCard,
  ExternalLink,
  Eye,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Phone,
  Plus,
  Save,
  Search,
  ShoppingBag,
  Store,
  Truck,
  Users,
  X,
} from 'lucide-react';
import {
  BangladeshConfig,
  BusinessSettings,
  Client,
  Product,
  ViewPanelConfig,
} from '../types/business';
import { formatApiError } from '../utils/api';
import {
  DEFAULT_VIEW_PANEL_CONFIG,
  PRODUCT_CATEGORIES,
  formatCurrency,
  isProductHighlightActive,
} from '../utils/calculations';
import { getOptimizedMediaUrl } from '../utils/cloudinary';
import { sanitizeNumericInput } from '../utils/numberInput';
import {
  BANGLADESH_CHARGE_NOTICE,
  DEFAULT_INR_TO_BDT_RATE,
  buildBangladeshWhatsAppOrderUrl,
  convertInrToBdt,
  displayCustomerPhone,
  formatBdt,
  isBangladeshClient,
  normalizeWhatsappDigits,
  parseProductVariantOptions,
  resolveBangladeshConfig,
} from '../utils/region';
import { CustomerAvatar } from './CustomerAvatar';

interface BangladeshControlViewProps {
  settings: BusinessSettings;
  clients: Client[];
  products: Product[];
  approvedSellerIds: string[];
  onBack: () => void;
  onSaveBangladeshConfig: (config: BangladeshConfig) => Promise<void>;
  onMailCustomer: (client: Client) => void;
}

interface PreviewProduct {
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
  sellerId?: string;
  sellerName?: string;
  highlighted?: boolean;
}

export const BangladeshControlView: React.FC<BangladeshControlViewProps> = ({
  settings,
  clients,
  products,
  approvedSellerIds,
  onBack,
  onSaveBangladeshConfig,
  onMailCustomer,
}) => {
  const initialConfig = resolveBangladeshConfig(settings);
  const [bdEnabled, setBdEnabled] = useState<boolean>(
    initialConfig.enabled !== false
  );
  const [togglingMode, setTogglingMode] = useState(false);
  const [rateInput, setRateInput] = useState(String(initialConfig.inrToBdtRate));
  const [whatsappInput, setWhatsappInput] = useState(
    initialConfig.whatsappNumber
  );
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configSaved, setConfigSaved] = useState(false);

  useEffect(() => {
    setBdEnabled(settings.bangladeshConfig?.enabled !== false);
  }, [settings.bangladeshConfig?.enabled]);

  const [activeTab, setActiveTab] = useState<'customers' | 'bangladesh-view'>(
    'customers'
  );

  // Customer Contact Details state
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Bangladesh View preview state
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewCategory, setPreviewCategory] = useState('ALL');
  const [previewProduct, setPreviewProduct] = useState<PreviewProduct | null>(
    null
  );
  const [previewVariant, setPreviewVariant] = useState('');
  const [previewQty, setPreviewQty] = useState(1);
  const [previewIndiaNotice, setPreviewIndiaNotice] = useState('');

  const sym = settings.currencySymbol || '₹';

  const parsedDraftRate = Number(rateInput);
  const effectiveRate =
    Number.isFinite(parsedDraftRate) && parsedDraftRate > 0
      ? parsedDraftRate
      : initialConfig.inrToBdtRate || DEFAULT_INR_TO_BDT_RATE;

  const effectiveWhatsapp =
    normalizeWhatsappDigits(whatsappInput) || initialConfig.whatsappNumber;

  const bangladeshClients = useMemo(() => {
    return clients
      .filter((c) => isBangladeshClient(c))
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      );
  }, [clients]);

  const filteredClients = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return bangladeshClients;
    return bangladeshClients.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        displayCustomerPhone(c.mobile).toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q)
    );
  }, [bangladeshClients, customerSearch]);

  const selectedClient = useMemo(
    () =>
      filteredClients.find((c) => c.id === selectedClientId) ||
      bangladeshClients.find((c) => c.id === selectedClientId) ||
      filteredClients[0] ||
      null,
    [filteredClients, bangladeshClients, selectedClientId]
  );

  const approvedSellerIdsSet = useMemo(
    () => new Set(approvedSellerIds),
    [approvedSellerIds]
  );

  const previewItems: PreviewProduct[] = useMemo(() => {
    const vp: ViewPanelConfig = {
      ...DEFAULT_VIEW_PANEL_CONFIG,
      ...(settings.viewPanel || {}),
      shopping: {
        ...DEFAULT_VIEW_PANEL_CONFIG.shopping,
        ...(settings.viewPanel?.shopping || {}),
        items: Array.isArray(settings.viewPanel?.shopping?.items)
          ? settings.viewPanel!.shopping.items
          : [],
      },
    };

    const customItems: PreviewProduct[] = vp.shopping.items.map((item) => {
      const gallery =
        Array.isArray(item.imageDataUrls) && item.imageDataUrls.length > 0
          ? item.imageDataUrls.filter(Boolean)
          : item.imageDataUrl
            ? [item.imageDataUrl]
            : [];
      return {
        id: item.id,
        name: item.name,
        category: item.category || PRODUCT_CATEGORIES[0],
        price: item.price,
        originalPrice: item.originalPrice,
        size: item.size,
        color: item.color,
        imageDataUrl: gallery[0] || '',
        imageDataUrls: gallery,
        description: item.description,
        sellerId: item.sellerId,
        sellerName: item.sellerName,
        highlighted: Boolean(item.highlighted),
      };
    });

    const eligibleCatalog = products.filter((prod) => {
      const sid = String(prod.sellerId || '').trim();
      if (!sid || sid.toLowerCase() === 'admin') return true;
      if (
        prod.sellerApprovalStatus === 'pending' ||
        prod.sellerApprovalStatus === 'rejected'
      ) {
        return false;
      }
      if (prod.sellerApprovalStatus && prod.sellerApprovalStatus !== 'approved') {
        return false;
      }
      if (approvedSellerIdsSet.size > 0) {
        return approvedSellerIdsSet.has(sid) || !prod.sellerApprovalStatus;
      }
      return true;
    });

    const catalogItems: PreviewProduct[] = vp.shopping.includeCatalogProducts
      ? eligibleCatalog.map((prod) => {
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
            category: prod.category || PRODUCT_CATEGORIES[0],
            price: prod.sellingPrice,
            originalPrice: prod.originalPrice,
            size: prod.size,
            color: prod.color,
            stockQty: prod.stockQty,
            imageDataUrl: gallery[0] || '',
            imageDataUrls: gallery,
            description: prod.description,
            sellerId: prod.sellerId,
            sellerName: prod.sellerName,
            highlighted: isProductHighlightActive(prod),
          };
        })
      : [];

    return [...catalogItems, ...customItems];
  }, [settings.viewPanel, products, approvedSellerIdsSet]);

  const filteredPreviewItems = useMemo(() => {
    const q = previewSearch.trim().toLowerCase();
    return previewItems.filter((item) => {
      if (previewCategory !== 'ALL' && item.category !== previewCategory) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.sellerName || '').toLowerCase().includes(q)
      );
    });
  }, [previewItems, previewCategory, previewSearch]);

  const handleSaveConverter = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigError('');
    setConfigSaved(false);
    const numRate = Number(rateInput);
    if (!Number.isFinite(numRate) || numRate <= 0) {
      setConfigError('Please enter a valid positive INR → BDT rate (e.g. 1.45).');
      return;
    }
    const cleanWa = normalizeWhatsappDigits(whatsappInput);
    if (!cleanWa || cleanWa.length < 10) {
      setConfigError(
        'Please enter a valid Admin WhatsApp number with country code.'
      );
      return;
    }

    setSavingConfig(true);
    try {
      await onSaveBangladeshConfig({
        enabled: bdEnabled,
        inrToBdtRate: Number(numRate.toFixed(4)),
        whatsappNumber: cleanWa,
        updatedAt: new Date().toISOString(),
      });
      setWhatsappInput(cleanWa);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (err) {
      setConfigError(
        formatApiError(err, 'Failed to save Bangladesh converter settings.')
      );
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          <div>
            <h1 className="font-display-serif text-2xl sm:text-3xl font-bold text-[#1F122B] flex items-center gap-2">
              <Globe className="w-6 h-6 text-[#0F766E]" />
              <span>Bangladesh Control Panel</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#6B5B7B]">
              Manage INR → BDT converter rate, Admin WhatsApp ordering number, Bangladesh customer contacts &amp; live BD customer storefront view.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[#99F6E4] bg-[#F0FDFA] px-3.5 py-2 text-xs font-semibold text-[#0F766E] font-mono-num">
          {bdEnabled ? 'BD Mode ON' : 'BD Mode OFF'} · 1 INR = {effectiveRate} BDT · {bangladeshClients.length} BD Customers
        </div>
      </div>

      {/* Bangladesh Mode ON/OFF Toggle Card */}
      <div
        className={`rounded-3xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-xs transition-colors ${
          bdEnabled
            ? 'border-[#99F6E4] bg-gradient-to-r from-[#F0FDFA] to-[#ECFDF5]'
            : 'border-[#E6D9EE] bg-white'
        }`}
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display-serif text-base sm:text-lg font-bold text-[#1F122B]">
              Bangladesh Customer Mode
            </h2>
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                bdEnabled
                  ? 'bg-[#0F766E] text-white'
                  : 'bg-[#F3E8FF] text-[#6B5B7B]'
              }`}
            >
              {bdEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
          <p className="text-xs text-[#4A3B59]">
            {bdEnabled
              ? 'Active: Detected Bangladesh visitors see BDT converted prices, delivery & custom charge notice, and direct Admin WhatsApp ordering.'
              : 'Disabled: Even visitors and customers from Bangladesh see the standard Indian Customer App experience (normal INR pricing & checkout).'}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`text-xs font-bold ${
              bdEnabled ? 'text-[#0F766E]' : 'text-[#6B5B7B]'
            }`}
          >
            {bdEnabled ? 'Enabled' : 'Disabled'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={bdEnabled}
            aria-label="Toggle Bangladesh Customer Mode"
            disabled={togglingMode || savingConfig}
            onClick={async () => {
              const nextEnabled = !bdEnabled;
              setConfigError('');
              setBdEnabled(nextEnabled);
              setTogglingMode(true);
              try {
                await onSaveBangladeshConfig({
                  enabled: nextEnabled,
                  inrToBdtRate: Number(effectiveRate.toFixed(4)),
                  whatsappNumber: effectiveWhatsapp,
                  updatedAt: new Date().toISOString(),
                });
              } catch (err) {
                setBdEnabled(!nextEnabled);
                setConfigError(
                  formatApiError(
                    err,
                    'Failed to update Bangladesh mode toggle.'
                  )
                );
              } finally {
                setTogglingMode(false);
              }
            }}
            className={`relative inline-flex h-8 w-14 items-center rounded-full p-1 transition-colors cursor-pointer disabled:opacity-60 ${
              bdEnabled ? 'bg-[#0F766E]' : 'bg-[#CBD5E1]'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                bdEnabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Converter & WhatsApp Settings Card */}
      <form
        onSubmit={handleSaveConverter}
        className="rounded-3xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-4 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F4ECF8] pb-3">
          <div>
            <h2 className="font-display-serif text-lg font-bold text-[#1F122B] flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-[#0F766E]" />
              <span>Converter (INR → BDT) &amp; WhatsApp Order Target</span>
            </h2>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Base INR catalog prices remain untouched. Every eligible product automatically calculates its BDT price using this rate.
            </p>
          </div>
          <div className="rounded-xl bg-[#F0FDFA] border border-[#99F6E4] px-3 py-1.5 text-xs font-mono-num font-bold text-[#0F766E]">
            Sample: ₹1,000 → {formatBdt(convertInrToBdt(1000, effectiveRate))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-[#4A3B59] mb-1">
              INR to BDT Rate *
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={rateInput}
              onChange={(e) =>
                setRateInput(
                  sanitizeNumericInput(e.target.value, { allowDecimal: true })
                )
              }
              placeholder="e.g. 1.45"
              className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2.5 text-sm font-mono-num font-bold text-[#1F122B] focus:border-[#0F766E] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#4A3B59] mb-1">
              Admin WhatsApp Number (for BD Orders) *
            </label>
            <input
              type="tel"
              value={whatsappInput}
              onChange={(e) => setWhatsappInput(e.target.value)}
              placeholder="e.g. 918335834532"
              className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2.5 text-sm font-mono-num font-semibold text-[#1F122B] focus:border-[#0F766E] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={savingConfig}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0F766E] to-[#15803D] px-5 py-2.5 text-sm font-bold text-white hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              {configSaved ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Saved &amp; Synced</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{savingConfig ? 'Saving...' : 'Save Converter'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {configError && (
          <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2 text-xs font-medium text-[#BE123C]">
            {configError}
          </div>
        )}
      </form>

      {/* Two Side-by-Side Primary Control Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setActiveTab('customers')}
          className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all cursor-pointer ${
            activeTab === 'customers'
              ? 'border-[#DB2777] bg-gradient-to-r from-[#FFF5FA] to-[#FAF5FF] shadow-sm'
              : 'border-[#EFE2F5] bg-white hover:border-[#C084FC]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                activeTab === 'customers'
                  ? 'bg-gradient-to-br from-[#DB2777] to-[#7E22CE] text-white'
                  : 'bg-[#FAF5FF] text-[#7E22CE]'
              }`}
            >
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#1F122B]">
                Customer Contact Details
              </div>
              <div className="text-xs text-[#6B5B7B]">
                View Bangladesh customer profiles, emails &amp; phones
              </div>
            </div>
          </div>
          <span className="rounded-lg bg-white border border-[#EFE2F5] px-2.5 py-1 text-xs font-mono-num font-bold text-[#9D174D]">
            {bangladeshClients.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bangladesh-view')}
          className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all cursor-pointer ${
            activeTab === 'bangladesh-view'
              ? 'border-[#0F766E] bg-gradient-to-r from-[#F0FDFA] to-[#ECFDF5] shadow-sm'
              : 'border-[#EFE2F5] bg-white hover:border-[#0F766E]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                activeTab === 'bangladesh-view'
                  ? 'bg-gradient-to-br from-[#0F766E] to-[#15803D] text-white'
                  : 'bg-[#F0FDFA] text-[#0F766E]'
              }`}
            >
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#1F122B]">
                Bangladesh View
              </div>
              <div className="text-xs text-[#6B5B7B]">
                {bdEnabled
                  ? 'Live: BDT prices, charge notice & WhatsApp order'
                  : 'Live: Standard India INR & normal checkout (BD OFF)'}
              </div>
            </div>
          </div>
          <span
            className={`rounded-lg bg-white border px-2.5 py-1 text-xs font-mono-num font-bold ${
              bdEnabled
                ? 'border-[#99F6E4] text-[#0F766E]'
                : 'border-[#E6D9EE] text-[#7E22CE]'
            }`}
          >
            {previewItems.length} Items
          </span>
        </button>
      </div>

      {/* SECTION 1: CUSTOMER CONTACT DETAILS */}
      {activeTab === 'customers' ? (
        <section className="rounded-3xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display-serif text-lg font-bold text-[#1F122B]">
              Bangladesh Customer Contact Details
            </h2>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#7E22CE] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search BD customer name, email, phone..."
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-9 pr-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {filteredClients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E6D9EE] bg-[#FDFBFE] py-12 px-4 text-center space-y-1.5">
              <Users className="w-8 h-8 text-[#C084FC] mx-auto" />
              <div className="text-sm font-bold text-[#1F122B]">
                No Bangladesh customer contacts yet
              </div>
              <p className="text-xs text-[#6B5B7B] max-w-md mx-auto">
                When visitors from Bangladesh sign in via Google on the Customer App, their profile, email, and optional phone number appear here automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Customer List */}
              <div className="lg:col-span-5 space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {filteredClients.map((client) => {
                  const active = selectedClient?.id === client.id;
                  const cleanPhone = displayCustomerPhone(client.mobile);
                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => setSelectedClientId(client.id)}
                      className={`w-full rounded-2xl border p-3.5 flex items-center gap-3 text-left transition-all cursor-pointer ${
                        active
                          ? 'border-[#DB2777] bg-[#FFF5FA]'
                          : 'border-[#EFE2F5] bg-[#FDFBFE] hover:border-[#9333EA]'
                      }`}
                    >
                      <CustomerAvatar
                        photoDataUrl={client.profilePhotoDataUrl}
                        name={client.name}
                        size={42}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-[#1F122B] truncate">
                          {client.name}
                        </div>
                        <div className="text-xs text-[#6B5B7B] truncate">
                          {client.email || 'No email recorded'}
                        </div>
                        <div className="text-[11px] font-mono-num text-[#0F766E] font-semibold mt-0.5">
                          {cleanPhone || 'Phone: Optional (not provided)'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Customer Detail Card */}
              <div className="lg:col-span-7">
                {selectedClient && (
                  <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FE] p-5 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#EFE2F5] pb-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <CustomerAvatar
                          photoDataUrl={selectedClient.profilePhotoDataUrl}
                          name={selectedClient.name}
                          size={56}
                        />
                        <div className="min-w-0">
                          <span className="inline-block rounded-md bg-[#F0FDFA] border border-[#99F6E4] px-2 py-0.5 text-[10px] font-bold text-[#0F766E]">
                            BANGLADESH CUSTOMER
                          </span>
                          <h3 className="text-lg font-bold text-[#1F122B] truncate mt-1">
                            {selectedClient.name}
                          </h3>
                          <div className="text-xs text-[#6B5B7B]">
                            Joined{' '}
                            {selectedClient.createdAt
                              ? new Date(
                                  selectedClient.createdAt
                                ).toLocaleDateString()
                              : 'Recently'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {selectedClient.email && (
                          <button
                            type="button"
                            onClick={() => onMailCustomer(selectedClient)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3.5 py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer whitespace-nowrap"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Mail</span>
                          </button>
                        )}
                        {displayCustomerPhone(
                          selectedClient.whatsapp || selectedClient.mobile
                        ) && (
                          <a
                            href={`https://wa.me/${normalizeWhatsappDigits(
                              displayCustomerPhone(
                                selectedClient.whatsapp || selectedClient.mobile
                              )
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#15803D] px-3.5 py-2 text-xs font-bold text-white hover:opacity-95 whitespace-nowrap"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-xl bg-white border border-[#EFE2F5] p-3 space-y-1">
                        <div className="font-bold text-[#6B5B7B] flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-[#DB2777]" />
                          <span>Email Address</span>
                        </div>
                        <div className="font-semibold text-[#1F122B] break-all">
                          {selectedClient.email || 'Not available'}
                        </div>
                      </div>

                      <div className="rounded-xl bg-white border border-[#EFE2F5] p-3 space-y-1">
                        <div className="font-bold text-[#6B5B7B] flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-[#0F766E]" />
                          <span>Mobile / WhatsApp</span>
                        </div>
                        <div className="font-mono-num font-semibold text-[#1F122B]">
                          {displayCustomerPhone(selectedClient.mobile) ||
                            'Not provided (Optional for BD)'}
                        </div>
                      </div>

                      <div className="sm:col-span-2 rounded-xl bg-white border border-[#EFE2F5] p-3 space-y-1">
                        <div className="font-bold text-[#6B5B7B] flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#7E22CE]" />
                          <span>Location / Address</span>
                        </div>
                        <div className="text-[#1F122B]">
                          {[
                            selectedClient.address,
                            selectedClient.city,
                            selectedClient.state,
                            selectedClient.pinCode,
                          ]
                            .filter(Boolean)
                            .join(', ') || 'Bangladesh (No address saved yet)'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      ) : (
        /* SECTION 2: BANGLADESH VIEW (LIVE STOREFRONT PREVIEW — REFLECTS ON/OFF TOGGLE IN REAL TIME) */
        <section
          className={`rounded-3xl border bg-white p-5 sm:p-6 space-y-4 transition-colors ${
            bdEnabled ? 'border-[#99F6E4]' : 'border-[#E6D9EE]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F4ECF8] pb-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display-serif text-lg font-bold text-[#1F122B]">
                  {bdEnabled
                    ? 'Live Bangladesh Customer Storefront Preview'
                    : 'Live Storefront Preview for Bangladesh Visitors (Standard India View)'}
                </h2>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    bdEnabled
                      ? 'bg-[#0F766E] text-white'
                      : 'bg-[#F3E8FF] text-[#7E22CE]'
                  }`}
                >
                  {bdEnabled ? 'BD Mode ON' : 'BD Mode OFF'}
                </span>
              </div>
              <p className="text-xs text-[#6B5B7B] mt-0.5">
                {bdEnabled
                  ? `Bangladesh Mode ON: Shows INR + auto-converted BDT pricing (1 INR = ${effectiveRate} BDT), delivery & custom charge notice, and direct Admin WhatsApp ordering.`
                  : 'Bangladesh Mode OFF: Bangladesh visitors see the standard Indian Customer App (INR pricing only, normal Cart & COD / UPI checkout, no BDT conversion or WhatsApp-only redirect).'}
              </p>
            </div>
            {bdEnabled ? (
              <div className="rounded-xl border border-[#99F6E4] bg-[#F0FDFA] px-3 py-1.5 text-xs font-bold text-[#0F766E]">
                {BANGLADESH_CHARGE_NOTICE}
              </div>
            ) : (
              <div className="rounded-xl border border-[#E6D9EE] bg-[#FAF5FF] px-3 py-1.5 text-xs font-bold text-[#7E22CE]">
                Standard India INR &amp; Normal Checkout
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                  bdEnabled ? 'text-[#0F766E]' : 'text-[#7E22CE]'
                }`}
              />
              <input
                type="search"
                value={previewSearch}
                onChange={(e) => setPreviewSearch(e.target.value)}
                placeholder={
                  bdEnabled
                    ? 'Search products or seller in Bangladesh View...'
                    : 'Search products or seller in India View...'
                }
                className={`w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-9 pr-3 py-2 text-xs text-[#1F122B] focus:bg-white focus:outline-none ${
                  bdEnabled ? 'focus:border-[#0F766E]' : 'focus:border-[#9333EA]'
                }`}
              />
            </div>

            <select
              value={previewCategory}
              onChange={(e) => setPreviewCategory(e.target.value)}
              className={`rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-semibold text-[#1F122B] focus:outline-none ${
                bdEnabled ? 'focus:border-[#0F766E]' : 'focus:border-[#9333EA]'
              }`}
            >
              <option value="ALL">All Categories ({previewItems.length})</option>
              {PRODUCT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {filteredPreviewItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E6D9EE] py-12 text-center text-xs text-[#6B5B7B]">
              No products match the current filter.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredPreviewItems.map((item) => {
                const mainImg = item.imageDataUrls[0] || item.imageDataUrl || '';
                const bdtPrice = convertInrToBdt(item.price, effectiveRate);
                const openItemPreview = () => {
                  setPreviewProduct(item);
                  setPreviewVariant(
                    parseProductVariantOptions(item.size)[0] || ''
                  );
                  setPreviewQty(1);
                  setPreviewIndiaNotice('');
                };
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border border-[#EFE2F5] bg-white overflow-hidden flex flex-col justify-between transition-colors ${
                      bdEnabled
                        ? 'hover:border-[#0F766E]'
                        : 'hover:border-[#9333EA]'
                    }`}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={openItemPreview}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openItemPreview();
                        }
                      }}
                      className="cursor-pointer"
                    >
                      <div className="aspect-square w-full max-w-full bg-[#FDF9FC] relative overflow-hidden border-b border-[#F4ECF8] flex items-center justify-center">
                        {mainImg ? (
                          <img
                            src={getOptimizedMediaUrl(mainImg, 'image')}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full max-w-full object-cover block"
                          />
                        ) : (
                          <Package className="w-8 h-8 text-[#C084FC]" />
                        )}
                        {item.sellerName && (
                          <span className="absolute top-1.5 left-1.5 rounded-md bg-white/95 border border-[#E6D9EE] px-1.5 py-0.5 text-[10px] font-bold text-[#7E22CE] truncate max-w-[85%]">
                            {item.sellerName}
                          </span>
                        )}
                      </div>
                      <div className="p-2.5 space-y-1">
                        <div className="text-[10px] font-semibold text-[#7E22CE] truncate">
                          {item.category}
                        </div>
                        <h3 className="text-xs font-bold text-[#1F122B] line-clamp-2 min-h-[2rem]">
                          {item.name}
                        </h3>
                      </div>
                    </div>

                    <div className="px-2.5 pb-2.5 space-y-2">
                      <div className="font-mono-num flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-[#1F122B]">
                          {formatCurrency(item.price, sym)}
                        </span>
                        {bdEnabled ? (
                          <span className="text-xs font-bold text-[#0F766E]">
                            · {formatBdt(bdtPrice)}
                          </span>
                        ) : (
                          item.originalPrice &&
                          item.originalPrice > item.price && (
                            <span className="text-[11px] text-[#94A3B8] line-through">
                              {formatCurrency(item.originalPrice, sym)}
                            </span>
                          )
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={openItemPreview}
                        className={`w-full rounded-xl py-1.5 px-2 text-center text-[11px] font-bold text-white hover:opacity-95 cursor-pointer ${
                          bdEnabled
                            ? 'bg-gradient-to-r from-[#0F766E] to-[#15803D]'
                            : 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE]'
                        }`}
                      >
                        {bdEnabled
                          ? 'Preview BD Product'
                          : 'Preview Standard View'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Live Storefront Product Preview Modal (Dynamically reflects BD Mode ON / OFF) */}
      {previewProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label={previewProduct.name}
          onClick={() => {
            setPreviewProduct(null);
            setPreviewIndiaNotice('');
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl border border-[#EFE2F5] bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#EFE2F5]">
              <div className="flex items-center gap-2 min-w-0">
                {bdEnabled ? (
                  <Globe className="w-4 h-4 text-[#0F766E] shrink-0" />
                ) : (
                  <ShoppingBag className="w-4 h-4 text-[#DB2777] shrink-0" />
                )}
                <span
                  className={`text-xs font-bold truncate ${
                    bdEnabled ? 'text-[#0F766E]' : 'text-[#7E22CE]'
                  }`}
                >
                  {bdEnabled
                    ? 'Bangladesh Customer View Preview'
                    : 'Standard Indian Customer View Preview (BD Mode OFF)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewProduct(null);
                  setPreviewIndiaNotice('');
                }}
                aria-label="Close preview"
                className="p-1.5 rounded-full text-[#6B5B7B] hover:bg-[#FAF5FF] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="flex gap-4 items-start">
                <div className="w-24 h-24 max-w-full rounded-2xl border border-[#EFE2F5] bg-[#FDF9FC] overflow-hidden shrink-0 flex items-center justify-center">
                  {previewProduct.imageDataUrls[0] || previewProduct.imageDataUrl ? (
                    <img
                      src={getOptimizedMediaUrl(
                        previewProduct.imageDataUrls[0] ||
                          previewProduct.imageDataUrl ||
                          '',
                        'image'
                      )}
                      alt={previewProduct.name}
                      width={96}
                      height={96}
                      referrerPolicy="no-referrer"
                      className="w-full h-full max-w-full object-cover block"
                    />
                  ) : (
                    <ShoppingBag className="w-7 h-7 text-[#C084FC]" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-[11px] font-bold text-[#7E22CE]">
                    {previewProduct.category}
                  </div>
                  <h3 className="font-display-serif text-lg font-bold text-[#1F122B]">
                    {previewProduct.name}
                  </h3>
                  <div className="font-mono-num flex items-baseline gap-2 flex-wrap">
                    <span className="text-lg font-bold text-[#1F122B]">
                      {formatCurrency(previewProduct.price, sym)}
                    </span>
                    {bdEnabled ? (
                      <span className="text-lg font-bold text-[#0F766E]">
                        · {formatBdt(convertInrToBdt(previewProduct.price, effectiveRate))}
                      </span>
                    ) : (
                      previewProduct.originalPrice &&
                      previewProduct.originalPrice > previewProduct.price && (
                        <span className="text-sm text-[#94A3B8] line-through">
                          {formatCurrency(previewProduct.originalPrice, sym)}
                        </span>
                      )
                    )}
                  </div>
                  {previewProduct.sellerName && (
                    <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6B5B7B]">
                      <Store className="w-3.5 h-3.5 text-[#DB2777]" />
                      <span>
                        Seller: {previewProduct.sellerName}
                        {previewProduct.sellerId ? ` (${previewProduct.sellerId})` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {parseProductVariantOptions(previewProduct.size).length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-[#4A3B59]">
                    Size / Variant:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {parseProductVariantOptions(previewProduct.size).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setPreviewVariant(opt)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-bold cursor-pointer ${
                          (previewVariant ||
                            parseProductVariantOptions(previewProduct.size)[0]) ===
                          opt
                            ? 'border-[#DB2777] bg-[#FDF2F8] text-[#9D174D]'
                            : 'border-[#E6D9EE] bg-white text-[#4A3B59]'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-2xl border border-[#EFE2F5] bg-[#FDFBFE] px-4 py-2.5">
                <span className="text-xs font-bold text-[#4A3B59]">
                  Quantity
                </span>
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewQty((q) => Math.max(1, q - 1))}
                    className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-8 text-center font-mono-num text-sm font-bold">
                    {previewQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewQty((q) => q + 1)}
                    className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {bdEnabled ? (
                <>
                  <div className="rounded-2xl border border-[#99F6E4] bg-[#F0FDFA] px-4 py-3 text-xs font-bold text-[#0F766E]">
                    {BANGLADESH_CHARGE_NOTICE}
                  </div>

                  <a
                    href={buildBangladeshWhatsAppOrderUrl({
                      whatsappNumber: effectiveWhatsapp,
                      inrToBdtRate: effectiveRate,
                      items: [
                        {
                          id: previewProduct.id,
                          productId:
                            previewProduct.catalogProductId || previewProduct.id,
                          name: previewProduct.name,
                          priceInr: previewProduct.price,
                          quantity: previewQty,
                          selectedVariant: previewVariant || previewProduct.size,
                          color: previewProduct.color,
                          sellerId: previewProduct.sellerId,
                          sellerName: previewProduct.sellerName,
                        },
                      ],
                      productUrl: `https://glamour-galleria.vercel.app/?product=${encodeURIComponent(
                        previewProduct.id
                      )}`,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0F766E] to-[#15803D] px-4 py-3 text-sm font-bold text-white hover:opacity-95"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Test Direct Admin WhatsApp Order</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[#E6D9EE] bg-[#FAF5FF] px-4 py-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#7E22CE]">
                      <CreditCard className="w-4 h-4 shrink-0" />
                      <span>Normal Indian Checkout Flow Active</span>
                    </div>
                    <p className="text-[11px] text-[#4A3B59]">
                      Standard INR total:{' '}
                      <span className="font-mono-num font-bold text-[#1F122B]">
                        {formatCurrency(previewProduct.price * previewQty, sym)}
                      </span>{' '}
                      · Supports Cart, Cash on Delivery (COD) &amp; Direct UPI / QR checkout. No BDT conversion or WhatsApp-only redirect.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewIndiaNotice(
                          `Added ${previewQty} × ${previewProduct.name} (${formatCurrency(previewProduct.price * previewQty, sym)}) using Standard Cart flow.`
                        )
                      }
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3 py-2.5 text-xs font-bold text-[#7E22CE] hover:bg-[#FAF5FF] cursor-pointer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Add to Cart</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewIndiaNotice(
                          `Normal COD / UPI Checkout opened for ${formatCurrency(previewProduct.price * previewQty, sym)} (No WhatsApp redirect).`
                        )
                      }
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3 py-2.5 text-xs font-bold text-white hover:opacity-95 cursor-pointer"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>Buy Now (COD / UPI)</span>
                    </button>
                  </div>

                  {previewIndiaNotice && (
                    <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2 text-[11px] font-semibold text-[#15803D]">
                      {previewIndiaNotice}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
