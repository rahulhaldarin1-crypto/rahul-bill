import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  Megaphone,
  Package,
  Pencil,
  Plus,
  Save,
  ShoppingBag,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Product,
  ViewPanelConfig,
  ViewPanelDiscountOffer,
  ViewPanelShoppingItem,
} from '../types/business';
import {
  DEFAULT_PRODUCT_CATEGORY,
  DEFAULT_VIEW_PANEL_CONFIG,
  formatCurrency,
  PRODUCT_CATEGORIES,
  resizeImageFileToDataUrl,
} from '../utils/calculations';
import { formatNumericFieldValue, sanitizeNumericInput } from '../utils/numberInput';
import { ConfirmModal } from './ConfirmModal';

interface ViewPanelControlViewProps {
  viewPanel: ViewPanelConfig;
  products: Product[];
  currencySymbol: string;
  onBack: () => void;
  onOpenViewPanel?: () => void;
  onSaveViewPanel: (next: ViewPanelConfig) => Promise<void>;
}

type ControlTab = 'advertisement' | 'discount' | 'shopping';

function isSafeHttpUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  return /^https?:\/\//i.test(trimmed);
}

export const ViewPanelControlView: React.FC<ViewPanelControlViewProps> = ({
  viewPanel,
  products,
  currencySymbol,
  onBack,
  onOpenViewPanel,
  onSaveViewPanel,
}) => {
  const [activeTab, setActiveTab] = useState<ControlTab>('advertisement');
  const [draft, setDraft] = useState<ViewPanelConfig>(
    viewPanel || DEFAULT_VIEW_PANEL_CONFIG
  );
  const [busy, setBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<'ad' | 'item' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Discount offer editor state
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [offerTitle, setOfferTitle] = useState('');
  const [offerBadge, setOfferBadge] = useState('');
  const [offerCode, setOfferCode] = useState('');
  const [offerValidTill, setOfferValidTill] = useState('');
  const [offerDescription, setOfferDescription] = useState('');
  const [deleteOfferTarget, setDeleteOfferTarget] =
    useState<ViewPanelDiscountOffer | null>(null);

  // Shopping item editor state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState<string>(DEFAULT_PRODUCT_CATEGORY);
  const [itemPrice, setItemPrice] = useState('');
  const [itemOriginalPrice, setItemOriginalPrice] = useState('');
  const [itemSize, setItemSize] = useState('');
  const [itemColor, setItemColor] = useState('');
  const [itemImage, setItemImage] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemHighlighted, setItemHighlighted] = useState(false);
  const [deleteItemTarget, setDeleteItemTarget] =
    useState<ViewPanelShoppingItem | null>(null);

  useEffect(() => {
    setDraft(viewPanel || DEFAULT_VIEW_PANEL_CONFIG);
  }, [viewPanel]);

  const showTempNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((curr) => (curr === msg ? '' : curr)), 2800);
  };

  const persistConfig = async (next: ViewPanelConfig, msg: string) => {
    setError('');
    setBusy(true);
    try {
      const withTime: ViewPanelConfig = {
        ...next,
        updatedAt: new Date().toISOString(),
      };
      setDraft(withTime);
      await onSaveViewPanel(withTime);
      showTempNotice(msg);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update View Panel settings.'
      );
    } finally {
      setBusy(false);
    }
  };

  // --- Advertisement handlers ---
  const handleAdImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploadingImage('ad');
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 1200, {
        quality: 0.78,
        preserveTransparency: false,
        maxDataUrlLength: 240_000,
      });
      const next: ViewPanelConfig = {
        ...draft,
        advertisement: {
          ...draft.advertisement,
          enabled: true,
          imageDataUrl: dataUrl,
        },
      };
      await persistConfig(next, 'Advertisement banner uploaded & synced.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid advertisement image.');
    } finally {
      setUploadingImage(null);
    }
  };

  const handleRemoveAdImage = async () => {
    const next: ViewPanelConfig = {
      ...draft,
      advertisement: {
        ...draft.advertisement,
        imageDataUrl: '',
      },
    };
    await persistConfig(next, 'Advertisement image removed.');
  };

  const handleToggleAdEnabled = async () => {
    const nextEnabled = !draft.advertisement.enabled;
    const next: ViewPanelConfig = {
      ...draft,
      advertisement: {
        ...draft.advertisement,
        enabled: nextEnabled,
      },
    };
    await persistConfig(
      next,
      nextEnabled ? 'Advertisement enabled in View Panel.' : 'Advertisement hidden.'
    );
  };

  const handleSaveAdDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawLink = draft.advertisement.linkUrl.trim();
    if (rawLink && !isSafeHttpUrl(rawLink)) {
      setError('Link URL must start with https:// or http://');
      return;
    }
    await persistConfig(
      {
        ...draft,
        advertisement: {
          ...draft.advertisement,
          title: draft.advertisement.title.trim(),
          subtitle: draft.advertisement.subtitle.trim(),
          linkUrl: rawLink,
        },
      },
      'Advertisement settings saved & synced.'
    );
  };

  // --- Discount handlers ---
  const resetOfferForm = () => {
    setEditingOfferId(null);
    setOfferTitle('');
    setOfferBadge('');
    setOfferCode('');
    setOfferValidTill('');
    setOfferDescription('');
  };

  const handleSaveOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!offerTitle.trim() || !offerBadge.trim()) {
      setError('Offer title and discount label (e.g. 20% OFF) are required.');
      return;
    }
    const offer: ViewPanelDiscountOffer = {
      id: editingOfferId || `off-${Date.now()}`,
      title: offerTitle.trim(),
      discountLabel: offerBadge.trim(),
      promoCode: offerCode.trim().toUpperCase(),
      validTill: offerValidTill.trim(),
      description: offerDescription.trim(),
    };
    const nextOffers = editingOfferId
      ? draft.discount.offers.map((o) => (o.id === editingOfferId ? offer : o))
      : [offer, ...draft.discount.offers];

    await persistConfig(
      {
        ...draft,
        discount: {
          ...draft.discount,
          enabled: true,
          offers: nextOffers,
        },
      },
      editingOfferId ? 'Discount offer updated.' : 'Discount offer added to View Panel.'
    );
    resetOfferForm();
  };

  const startEditOffer = (offer: ViewPanelDiscountOffer) => {
    setEditingOfferId(offer.id);
    setOfferTitle(offer.title);
    setOfferBadge(offer.discountLabel);
    setOfferCode(offer.promoCode || '');
    setOfferValidTill(offer.validTill || '');
    setOfferDescription(offer.description || '');
    setError('');
  };

  const confirmDeleteOffer = async () => {
    if (!deleteOfferTarget) return;
    const nextOffers = draft.discount.offers.filter(
      (o) => o.id !== deleteOfferTarget.id
    );
    await persistConfig(
      {
        ...draft,
        discount: {
          ...draft.discount,
          offers: nextOffers,
        },
      },
      'Discount offer removed.'
    );
    if (editingOfferId === deleteOfferTarget.id) resetOfferForm();
    setDeleteOfferTarget(null);
  };

  // --- Shopping handlers ---
  const resetItemForm = () => {
    setEditingItemId(null);
    setItemName('');
    setItemCategory(DEFAULT_PRODUCT_CATEGORY);
    setItemPrice('');
    setItemOriginalPrice('');
    setItemSize('');
    setItemColor('');
    setItemImage('');
    setItemDescription('');
    setItemHighlighted(false);
  };

  const handleShoppingImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploadingImage('item');
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 400, {
        quality: 0.76,
        preserveTransparency: false,
        maxDataUrlLength: 48_000,
      });
      setItemImage(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid product image.');
    } finally {
      setUploadingImage(null);
    }
  };

  const handleSaveShoppingItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const price = Number(itemPrice) || 0;
    const original =
      itemOriginalPrice.trim() !== '' ? Number(itemOriginalPrice) || 0 : undefined;

    if (!itemName.trim() || price <= 0) {
      setError('Item name and a positive selling price are required.');
      return;
    }

    const item: ViewPanelShoppingItem = {
      id: editingItemId || `shop-${Date.now()}`,
      name: itemName.trim(),
      category: itemCategory.trim() || DEFAULT_PRODUCT_CATEGORY,
      price,
      originalPrice: original && original > price ? original : undefined,
      size: itemSize.trim(),
      color: itemColor.trim(),
      imageDataUrl: itemImage,
      description: itemDescription.trim(),
      highlighted: itemHighlighted,
    };

    const nextItems = editingItemId
      ? draft.shopping.items.map((it) => (it.id === editingItemId ? item : it))
      : [item, ...draft.shopping.items];

    await persistConfig(
      {
        ...draft,
        shopping: {
          ...draft.shopping,
          enabled: true,
          items: nextItems,
        },
      },
      editingItemId ? 'Shopping item updated.' : 'Shopping item added to View Panel.'
    );
    resetItemForm();
  };

  const startEditItem = (item: ViewPanelShoppingItem) => {
    setEditingItemId(item.id);
    setItemName(item.name);
    const cat = (item.category || '').trim();
    setItemCategory(
      (PRODUCT_CATEGORIES as readonly string[]).includes(cat)
        ? cat
        : DEFAULT_PRODUCT_CATEGORY
    );
    setItemPrice(formatNumericFieldValue(item.price));
    setItemOriginalPrice(formatNumericFieldValue(item.originalPrice));
    setItemSize(item.size || '');
    setItemColor(item.color || '');
    setItemImage(item.imageDataUrl || '');
    setItemDescription(item.description || '');
    setItemHighlighted(Boolean(item.highlighted));
    setError('');
  };

  const confirmDeleteItem = async () => {
    if (!deleteItemTarget) return;
    const nextItems = draft.shopping.items.filter(
      (it) => it.id !== deleteItemTarget.id
    );
    await persistConfig(
      {
        ...draft,
        shopping: {
          ...draft.shopping,
          items: nextItems,
        },
      },
      'Shopping item removed.'
    );
    if (editingItemId === deleteItemTarget.id) resetItemForm();
    setDeleteItemTarget(null);
  };

  const inputClass =
    'w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none';
  const labelClass = 'block text-xs font-semibold text-[#4A3B59] mb-1';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          <div>
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B]">
              View Panel Control
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Manage Advertisement banner, Discount offers, and Shopping showcase synced in real time.
            </p>
          </div>
        </div>

        {onOpenViewPanel && (
          <button
            type="button"
            onClick={onOpenViewPanel}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-4 py-2 text-xs font-semibold text-[#7E22CE] hover:border-[#9333EA] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Preview View Panel</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-xs font-medium text-[#15803D]">
          {notice}
        </div>
      )}

      {/* Segmented Control Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-[#F4ECF8] border border-[#E6D9EE] w-fit">
        {(
          [
            {
              id: 'advertisement',
              label: 'Advertisement',
              icon: Megaphone,
              activeFlag: draft.advertisement.enabled && Boolean(draft.advertisement.imageDataUrl || draft.advertisement.title),
            },
            {
              id: 'discount',
              label: `Discount (${draft.discount.offers.length})`,
              icon: Tag,
              activeFlag: draft.discount.enabled,
            },
            {
              id: 'shopping',
              label: `Shopping (${draft.shopping.items.length})`,
              icon: ShoppingBag,
              activeFlag: draft.shopping.enabled,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setError('');
              }}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white shadow-xs'
                  : 'text-[#5B4B6B] hover:text-[#1F122B] hover:bg-white/70'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ADVERTISEMENT */}
      {activeTab === 'advertisement' && (
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#F4ECF8]">
            <div>
              <h2 className="text-base font-bold text-[#1F122B]">
                Top Advertisement Banner
              </h2>
              <p className="text-xs text-[#6B5B7B] mt-0.5">
                Displayed at the very top of View Panel above the bill search &amp; order area.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleToggleAdEnabled}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                draft.advertisement.enabled
                  ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]'
                  : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#6B5B7B]'
              }`}
            >
              <span>
                {draft.advertisement.enabled ? 'Visible on View Panel' : 'Hidden on View Panel'}
              </span>
            </button>
          </div>

          {/* Banner Upload & Preview */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {uploadingImage === 'ad'
                    ? 'Compressing & Uploading...'
                    : draft.advertisement.imageDataUrl
                      ? 'Replace Banner Image'
                      : 'Upload Advertisement Image'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingImage !== null || busy}
                  onChange={handleAdImageUpload}
                  className="sr-only"
                />
              </label>

              {draft.advertisement.imageDataUrl && (
                <button
                  type="button"
                  disabled={busy || uploadingImage !== null}
                  onClick={handleRemoveAdImage}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-semibold text-[#BE123C] hover:bg-[#FFE4E6] cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Image</span>
                </button>
              )}
            </div>

            {draft.advertisement.imageDataUrl ? (
              <div className="rounded-2xl overflow-hidden border border-[#E6D9EE] bg-[#FDF8FC] relative">
                <img
                  src={draft.advertisement.imageDataUrl}
                  alt={draft.advertisement.title || 'Advertisement banner preview'}
                  referrerPolicy="no-referrer"
                  className="w-full max-h-[280px] object-cover"
                />
                {(draft.advertisement.title || draft.advertisement.subtitle) && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent p-4 text-white">
                    {draft.advertisement.title && (
                      <div className="text-base font-bold">
                        {draft.advertisement.title}
                      </div>
                    )}
                    {draft.advertisement.subtitle && (
                      <div className="text-xs text-white/90 mt-0.5">
                        {draft.advertisement.subtitle}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#D8B4FE] bg-[#FDF9FE] py-10 px-4 text-center space-y-2">
                <ImageIcon className="w-8 h-8 text-[#C084FC] mx-auto" />
                <div className="text-xs font-semibold text-[#4A3B59]">
                  No advertisement banner image uploaded yet
                </div>
                <p className="text-[11px] text-[#6B5B7B] max-w-md mx-auto">
                  Upload a wide promotional banner (16:9 or 3:1 works best). Images are automatically compressed so Firestore syncs quickly across all devices.
                </p>
              </div>
            )}
          </div>

          {/* Optional Caption & Link */}
          <form onSubmit={handleSaveAdDetails} className="space-y-4 pt-3 border-t border-[#F4ECF8]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Banner Headline (optional)</label>
                <input
                  type="text"
                  value={draft.advertisement.title}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      advertisement: { ...prev.advertisement, title: e.target.value },
                    }))
                  }
                  placeholder="e.g. Festive Saree & Cosmetics Sale"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Click Link URL (optional)</label>
                <input
                  type="url"
                  value={draft.advertisement.linkUrl}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      advertisement: { ...prev.advertisement, linkUrl: e.target.value },
                    }))
                  }
                  placeholder="https://instagram.com/glamour.galleria.in"
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Banner Subtext (optional)</label>
                <input
                  type="text"
                  value={draft.advertisement.subtitle}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      advertisement: { ...prev.advertisement, subtitle: e.target.value },
                    }))
                  }
                  placeholder="e.g. Flat 20% off on new arrivals this week"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span>{busy ? 'Saving...' : 'Save Advertisement'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: DISCOUNT */}
      {activeTab === 'discount' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#F4ECF8]">
              <div>
                <h2 className="text-base font-bold text-[#1F122B]">
                  Discount Section Settings
                </h2>
                <p className="text-xs text-[#6B5B7B] mt-0.5">
                  Control visibility, heading, and promotional offers shown in View Panel.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  persistConfig(
                    {
                      ...draft,
                      discount: {
                        ...draft.discount,
                        enabled: !draft.discount.enabled,
                      },
                    },
                    !draft.discount.enabled
                      ? 'Discount section enabled in View Panel.'
                      : 'Discount section hidden from View Panel.'
                  )
                }
                className={`rounded-xl px-4 py-2 text-xs font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
                  draft.discount.enabled
                    ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]'
                    : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#6B5B7B]'
                }`}
              >
                {draft.discount.enabled ? 'Visible on View Panel' : 'Hidden on View Panel'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Section Title</label>
                <input
                  type="text"
                  value={draft.discount.sectionTitle}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      discount: { ...prev.discount, sectionTitle: e.target.value },
                    }))
                  }
                  placeholder="Special Discounts & Offers"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Announcement / Subheading</label>
                <input
                  type="text"
                  value={draft.discount.headline}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      discount: { ...prev.discount, headline: e.target.value },
                    }))
                  }
                  placeholder="e.g. Use these codes when ordering on WhatsApp"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  persistConfig(
                    {
                      ...draft,
                      discount: {
                        ...draft.discount,
                        sectionTitle:
                          draft.discount.sectionTitle.trim() ||
                          'Special Discounts & Offers',
                        headline: draft.discount.headline.trim(),
                      },
                    },
                    'Discount section header saved.'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#7E22CE] bg-white px-4 py-2 text-xs font-semibold text-[#7E22CE] hover:bg-[#F5F3FF] cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Section Heading</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start">
            <form
              onSubmit={handleSaveOffer}
              className="rounded-2xl border border-[#EFE2F5] bg-white p-5 space-y-3.5"
            >
              <h3 className="text-sm font-bold text-[#1F122B]">
                {editingOfferId ? 'Edit Discount Offer' : 'Add Discount Offer'}
              </h3>
              <div>
                <label className={labelClass}>Offer Title *</label>
                <input
                  type="text"
                  required
                  value={offerTitle}
                  onChange={(e) => setOfferTitle(e.target.value)}
                  placeholder="e.g. Festive Saree Offer"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Discount Text *</label>
                  <input
                    type="text"
                    required
                    value={offerBadge}
                    onChange={(e) => setOfferBadge(e.target.value)}
                    placeholder="e.g. 20% OFF"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Promo Code</label>
                  <input
                    type="text"
                    value={offerCode}
                    onChange={(e) => setOfferCode(e.target.value.toUpperCase())}
                    placeholder="GLAM20"
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Valid Till / Condition (optional)</label>
                <input
                  type="text"
                  value={offerValidTill}
                  onChange={(e) => setOfferValidTill(e.target.value)}
                  placeholder="e.g. Valid on orders above ₹999"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  rows={2}
                  value={offerDescription}
                  onChange={(e) => setOfferDescription(e.target.value)}
                  placeholder="Short details about this offer..."
                  className={inputClass}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                {editingOfferId && (
                  <button
                    type="button"
                    onClick={resetOfferForm}
                    className="rounded-xl border border-[#E6D9EE] px-3.5 py-2 text-xs font-semibold text-[#5B4B6B] cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{editingOfferId ? 'Update Offer' : 'Add Offer'}</span>
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 space-y-3">
              <div className="text-sm font-bold text-[#1F122B]">
                Active Discount Offers ({draft.discount.offers.length})
              </div>
              {draft.discount.offers.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#6B5B7B]">
                  No discount offers added yet. Use the form to add offers for your customers.
                </div>
              ) : (
                <div className="space-y-3">
                  {draft.discount.offers.map((offer) => (
                    <div
                      key={offer.id}
                      className="rounded-xl border border-[#EFE2F5] bg-[#FDF9FC] p-4 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-[#1F122B]">
                            {offer.title}
                          </span>
                          <span className="font-mono-num text-xs font-bold text-[#DB2777]">
                            {offer.discountLabel}
                          </span>
                        </div>
                        {(offer.promoCode || offer.validTill) && (
                          <div className="text-xs text-[#6B5B7B] flex flex-wrap items-center gap-2">
                            {offer.promoCode && (
                              <span className="font-mono-num font-semibold text-[#6D28D9]">
                                Code: {offer.promoCode}
                              </span>
                            )}
                            {offer.promoCode && offer.validTill && <span>·</span>}
                            {offer.validTill && <span>{offer.validTill}</span>}
                          </div>
                        )}
                        {offer.description && (
                          <p className="text-xs text-[#5B4B6B]">{offer.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditOffer(offer)}
                          className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white text-[#5B4B6B] hover:text-[#7E22CE] cursor-pointer"
                          title="Edit offer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteOfferTarget(offer)}
                          className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white text-[#6B5B7B] hover:text-[#BE123C] cursor-pointer"
                          title="Delete offer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SHOPPING */}
      {activeTab === 'shopping' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#F4ECF8]">
              <div>
                <h2 className="text-base font-bold text-[#1F122B]">
                  Shopping Section Settings
                </h2>
                <p className="text-xs text-[#6B5B7B] mt-0.5">
                  Showcase products &amp; allow customers to inquire or order via WhatsApp directly from View Panel.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  persistConfig(
                    {
                      ...draft,
                      shopping: {
                        ...draft.shopping,
                        enabled: !draft.shopping.enabled,
                      },
                    },
                    !draft.shopping.enabled
                      ? 'Shopping section enabled in View Panel.'
                      : 'Shopping section hidden from View Panel.'
                  )
                }
                className={`rounded-xl px-4 py-2 text-xs font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
                  draft.shopping.enabled
                    ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]'
                    : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#6B5B7B]'
                }`}
              >
                {draft.shopping.enabled ? 'Visible on View Panel' : 'Hidden on View Panel'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Section Title</label>
                <input
                  type="text"
                  value={draft.shopping.sectionTitle}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      shopping: { ...prev.shopping, sectionTitle: e.target.value },
                    }))
                  }
                  placeholder="Shop Our Collection"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Section Subtitle</label>
                <input
                  type="text"
                  value={draft.shopping.subtitle}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      shopping: { ...prev.shopping, subtitle: e.target.value },
                    }))
                  }
                  placeholder="Handpicked styles available for quick WhatsApp order"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-[#1F122B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.shopping.includeCatalogProducts}
                  onChange={(e) =>
                    persistConfig(
                      {
                        ...draft,
                        shopping: {
                          ...draft.shopping,
                          includeCatalogProducts: e.target.checked,
                        },
                      },
                      e.target.checked
                        ? 'Catalog products included in View Panel Shopping.'
                        : 'Catalog products excluded from View Panel Shopping.'
                    )
                  }
                  className="w-4 h-4 accent-[#7E22CE] rounded cursor-pointer"
                />
                <span>
                  Also show products from Product Listing ({products.length} items)
                </span>
              </label>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  persistConfig(
                    {
                      ...draft,
                      shopping: {
                        ...draft.shopping,
                        sectionTitle:
                          draft.shopping.sectionTitle.trim() || 'Shop Our Collection',
                        subtitle: draft.shopping.subtitle.trim(),
                      },
                    },
                    'Shopping section settings saved.'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#7E22CE] bg-white px-4 py-2 text-xs font-semibold text-[#7E22CE] hover:bg-[#F5F3FF] cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Section Settings</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-5 items-start">
            <form
              onSubmit={handleSaveShoppingItem}
              className="rounded-2xl border border-[#EFE2F5] bg-white p-5 space-y-3.5"
            >
              <h3 className="text-sm font-bold text-[#1F122B]">
                {editingItemId ? 'Edit Featured Shopping Item' : 'Add Featured Shopping Item'}
              </h3>

              <div className="flex items-center gap-3.5">
                <div className="w-16 h-16 rounded-xl border border-[#EFE2F5] bg-[#FDF8FC] flex items-center justify-center overflow-hidden shrink-0">
                  {itemImage ? (
                    <img
                      src={itemImage}
                      alt={itemName || 'Shopping item'}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-6 h-6 text-[#C084FC]" />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-1.5 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer whitespace-nowrap">
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {uploadingImage === 'item' ? 'Loading...' : 'Upload Photo'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingImage !== null}
                      onChange={handleShoppingImageUpload}
                      className="sr-only"
                    />
                  </label>
                  {itemImage && (
                    <button
                      type="button"
                      onClick={() => setItemImage('')}
                      className="text-xs font-semibold text-[#BE123C] cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className={labelClass}>Item Name *</label>
                <input
                  type="text"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="e.g. Banarasi Silk Kurti Set"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Selling Price ({currencySymbol}) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={itemPrice}
                    onChange={(e) => setItemPrice(sanitizeNumericInput(e.target.value))}
                    placeholder="0"
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelClass}>Original MRP ({currencySymbol})</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={itemOriginalPrice}
                    onChange={(e) =>
                      setItemOriginalPrice(sanitizeNumericInput(e.target.value))
                    }
                    placeholder="Optional"
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-3">
                  <label className={labelClass}>Category</label>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                    className={inputClass}
                  >
                    {PRODUCT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Size</label>
                  <input
                    type="text"
                    value={itemSize}
                    onChange={(e) => setItemSize(e.target.value)}
                    placeholder="M / L"
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Color</label>
                  <input
                    type="text"
                    value={itemColor}
                    onChange={(e) => setItemColor(e.target.value)}
                    placeholder="Pink"
                    className={inputClass}
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#1F122B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={itemHighlighted}
                  onChange={(e) => setItemHighlighted(e.target.checked)}
                  className="w-4 h-4 accent-[#DB2777] rounded cursor-pointer"
                />
                <span>Highlight / Pin to Top</span>
              </label>

              <div>
                <label className={labelClass}>Short Description (optional)</label>
                <textarea
                  rows={2}
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="Fabric, shade, or delivery highlight..."
                  className={inputClass}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                {editingItemId && (
                  <button
                    type="button"
                    onClick={resetItemForm}
                    className="rounded-xl border border-[#E6D9EE] px-3.5 py-2 text-xs font-semibold text-[#5B4B6B] cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={busy || uploadingImage !== null}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{editingItemId ? 'Update Item' : 'Add Shopping Item'}</span>
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-[#1F122B]">
                  Custom Featured Items ({draft.shopping.items.length})
                </div>
                {draft.shopping.includeCatalogProducts && (
                  <span className="text-xs text-[#6B5B7B]">
                    + {products.length} Catalog Products shown
                  </span>
                )}
              </div>

              {draft.shopping.items.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#6B5B7B]">
                  {draft.shopping.includeCatalogProducts && products.length > 0
                    ? 'Your store catalog products are currently shown in View Panel. You can also add custom featured shopping items here.'
                    : 'No custom shopping items added yet. Add items using the form or enable Catalog Products.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {draft.shopping.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[#EFE2F5] bg-[#FDF9FC] p-3.5 flex items-start gap-3"
                    >
                      <div className="w-14 h-14 rounded-lg border border-[#E6D9EE] bg-white overflow-hidden flex items-center justify-center shrink-0">
                        {item.imageDataUrl ? (
                          <img
                            src={item.imageDataUrl}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ShoppingBag className="w-5 h-5 text-[#C084FC]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="text-xs font-bold text-[#1F122B] truncate">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-[#6B5B7B] truncate">
                          {[item.category, item.size, item.color].filter(Boolean).join(' · ')}
                        </div>
                        <div className="font-mono-num text-xs font-bold text-[#7E22CE]">
                          {formatCurrency(item.price, currencySymbol)}
                          {item.originalPrice && item.originalPrice > item.price && (
                            <span className="ml-1.5 text-[#8E7C9E] line-through font-normal">
                              {formatCurrency(item.originalPrice, currencySymbol)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditItem(item)}
                          className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white text-[#5B4B6B] hover:text-[#7E22CE] cursor-pointer"
                          title="Edit item"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteItemTarget(item)}
                          className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white text-[#6B5B7B] hover:text-[#BE123C] cursor-pointer"
                          title="Delete item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Helpful link to View Panel */}
      {draft.advertisement.linkUrl && isSafeHttpUrl(draft.advertisement.linkUrl) && (
        <div className="text-xs text-[#6B5B7B] flex items-center gap-1.5">
          <ExternalLink className="w-3.5 h-3.5 text-[#7E22CE]" />
          <span>
            Active banner link:{' '}
            <a
              href={draft.advertisement.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#7E22CE] hover:underline"
            >
              {draft.advertisement.linkUrl}
            </a>
          </span>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteOfferTarget)}
        title="Delete Discount Offer"
        message={`Remove discount offer "${deleteOfferTarget?.title}" from View Panel?`}
        confirmLabel="Delete Offer"
        busy={busy}
        onConfirm={confirmDeleteOffer}
        onCancel={() => setDeleteOfferTarget(null)}
      />

      <ConfirmModal
        open={Boolean(deleteItemTarget)}
        title="Delete Shopping Item"
        message={`Remove "${deleteItemTarget?.name}" from View Panel Shopping?`}
        confirmLabel="Delete Item"
        busy={busy}
        onConfirm={confirmDeleteItem}
        onCancel={() => setDeleteItemTarget(null)}
      />
    </div>
  );
};
