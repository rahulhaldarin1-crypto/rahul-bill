import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Package,
  Pencil,
  Plus,
  QrCode,
  Search,
  Star,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { CloudinaryMediaRecord, Product } from '../types/business';
import {
  DEFAULT_PRODUCT_CATEGORY,
  formatCurrency,
  isProductHighlightActive,
  PRODUCT_CATEGORIES,
} from '../utils/calculations';
import {
  getOptimizedMediaUrl,
  uploadMediaToCloudinary,
} from '../utils/cloudinary';
import { formatNumericFieldValue, sanitizeNumericInput } from '../utils/numberInput';
import { ConfirmModal } from './ConfirmModal';

export interface SellerProductContext {
  sellerId: string;
  sellerName: string;
  sellerPhone: string;
}

interface ProductsViewProps {
  products: Product[];
  currencySymbol: string;
  defaultLowStock: number;
  sellerContext?: SellerProductContext;
  hideBackButton?: boolean;
  pendingHighlightProductIds?: Set<string>;
  onRequestHighlight?: (prod: Product) => void;
  onBack: () => void;
  onSaveProduct: (
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
}

const MAX_PRODUCT_IMAGES = 5;
const ALLOWED_CATEGORIES_SET = new Set<string>(PRODUCT_CATEGORIES);

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  currencySymbol,
  defaultLowStock,
  sellerContext,
  hideBackButton = false,
  pendingHighlightProductIds,
  onRequestHighlight,
  onBack,
  onSaveProduct,
  onDeleteProduct,
}) => {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [imageDataUrls, setImageDataUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [mediaRecords, setMediaRecords] = useState<CloudinaryMediaRecord[]>([]);
  const [category, setCategory] = useState<string>(DEFAULT_PRODUCT_CATEGORY);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [highlighted, setHighlighted] = useState(false);
  const [stockQty, setStockQty] = useState('');
  const [lowStockAlert, setLowStockAlert] = useState(String(defaultLowStock || 5));
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [description, setDescription] = useState('');
  const [uploadingImgProgress, setUploadingImgProgress] = useState<number | null>(null);
  const [uploadingVideoProgress, setUploadingVideoProgress] = useState<number | null>(null);
  const [togglingHighlightId, setTogglingHighlightId] = useState<string | null>(null);

  // Per-Product Custom Payment Details (overrides Seller Account / Admin Payment System)
  const [paymentSectionOpen, setPaymentSectionOpen] = useState(false);
  const [sellerPaymentUpiId, setSellerPaymentUpiId] = useState('');
  const [sellerPaymentBankAccountName, setSellerPaymentBankAccountName] =
    useState('');
  const [sellerPaymentBankName, setSellerPaymentBankName] = useState('');
  const [sellerPaymentBankAccountNo, setSellerPaymentBankAccountNo] =
    useState('');
  const [sellerPaymentBankIfscBranch, setSellerPaymentBankIfscBranch] =
    useState('');
  const [sellerPaymentQrDataUrl, setSellerPaymentQrDataUrl] = useState('');
  const [uploadingQrProgress, setUploadingQrProgress] = useState<number | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setImageDataUrls([]);
    setVideoUrl('');
    setMediaRecords([]);
    setCategory(DEFAULT_PRODUCT_CATEGORY);
    setPurchasePrice('');
    setSellingPrice('');
    setOriginalPrice('');
    setHighlighted(false);
    setStockQty('');
    setLowStockAlert(String(defaultLowStock || 5));
    setSize('');
    setColor('');
    setDescription('');
    setPaymentSectionOpen(false);
    setSellerPaymentUpiId('');
    setSellerPaymentBankAccountName('');
    setSellerPaymentBankName('');
    setSellerPaymentBankAccountNo('');
    setSellerPaymentBankIfscBranch('');
    setSellerPaymentQrDataUrl('');
    setError('');
    setFormOpen(true);
  };

  const openEdit = (prod: Product) => {
    setEditing(prod);
    setName(prod.name);
    const existingImages =
      Array.isArray(prod.imageDataUrls) && prod.imageDataUrls.length > 0
        ? prod.imageDataUrls.slice(0, MAX_PRODUCT_IMAGES)
        : prod.imageDataUrl
          ? [prod.imageDataUrl]
          : [];
    setImageDataUrls(existingImages);
    setVideoUrl(prod.videoUrl || '');
    setMediaRecords(Array.isArray(prod.mediaRecords) ? prod.mediaRecords : []);
    const cat = (prod.category || '').trim();
    setCategory(
      ALLOWED_CATEGORIES_SET.has(cat) ? cat : DEFAULT_PRODUCT_CATEGORY
    );
    setPurchasePrice(formatNumericFieldValue(prod.purchasePrice));
    setSellingPrice(formatNumericFieldValue(prod.sellingPrice));
    setOriginalPrice(formatNumericFieldValue(prod.originalPrice));
    setHighlighted(Boolean(prod.highlighted));
    setStockQty(formatNumericFieldValue(prod.stockQty));
    setLowStockAlert(formatNumericFieldValue(prod.lowStockAlert || defaultLowStock || 5));
    setSize(prod.size || '');
    setColor(prod.color || '');
    setDescription(prod.description || '');
    const hasCustomPayment = Boolean(
      prod.sellerPaymentUpiId ||
        prod.sellerPaymentBankAccountName ||
        prod.sellerPaymentBankName ||
        prod.sellerPaymentBankAccountNo ||
        prod.sellerPaymentBankIfscBranch ||
        prod.sellerPaymentQrDataUrl
    );
    setPaymentSectionOpen(hasCustomPayment);
    setSellerPaymentUpiId(prod.sellerPaymentUpiId || '');
    setSellerPaymentBankAccountName(prod.sellerPaymentBankAccountName || '');
    setSellerPaymentBankName(prod.sellerPaymentBankName || '');
    setSellerPaymentBankAccountNo(prod.sellerPaymentBankAccountNo || '');
    setSellerPaymentBankIfscBranch(prod.sellerPaymentBankIfscBranch || '');
    setSellerPaymentQrDataUrl(prod.sellerPaymentQrDataUrl || '');
    setError('');
    setFormOpen(true);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    e.target.value = '';
    if (fileList.length === 0) return;

    const remainingSlots = MAX_PRODUCT_IMAGES - imageDataUrls.length;
    if (remainingSlots <= 0) {
      setError(`Maximum ${MAX_PRODUCT_IMAGES} photos allowed per product.`);
      return;
    }

    const filesToProcess = fileList.slice(0, remainingSlots);
    setError('');
    setUploadingImgProgress(1);
    try {
      const uploadedUrls: string[] = [];
      const newRecords: CloudinaryMediaRecord[] = [];
      const role = sellerContext ? 'seller' : 'admin';
      const appSource = sellerContext ? 'glamour-galleria' : 'ggadminpanel';
      const folder = sellerContext
        ? 'glamour-galleria/seller/products'
        : 'ggadminpanel/admin/products';

      for (let i = 0; i < filesToProcess.length; i += 1) {
        const file = filesToProcess[i];
        const record = await uploadMediaToCloudinary(file, {
          role,
          appSource,
          folder,
          relatedEntityType: 'product',
          relatedEntityId: editing?.id,
          uploadedByUid: sellerContext?.sellerId || 'admin',
          allowedTypes: ['image'],
          onProgress: (pct) => {
            const overall = Math.round(
              ((i + pct / 100) / filesToProcess.length) * 100
            );
            setUploadingImgProgress(overall);
          },
        });
        uploadedUrls.push(record.secureUrl);
        newRecords.push(record);
      }

      setImageDataUrls((prev) =>
        [...prev, ...uploadedUrls].slice(0, MAX_PRODUCT_IMAGES)
      );
      setMediaRecords((prev) => [...prev, ...newRecords]);
      if (fileList.length > remainingSlots) {
        setError(
          `Only ${remainingSlots} photo${remainingSlots === 1 ? '' : 's'} uploaded (max ${MAX_PRODUCT_IMAGES} photos per product).`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not upload selected images to Cloudinary. Please try again.'
      );
    } finally {
      setUploadingImgProgress(null);
    }
  };

  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploadingVideoProgress(1);
    try {
      const record = await uploadMediaToCloudinary(file, {
        role: sellerContext ? 'seller' : 'admin',
        appSource: sellerContext ? 'glamour-galleria' : 'ggadminpanel',
        folder: sellerContext
          ? 'glamour-galleria/seller/products'
          : 'ggadminpanel/admin/products',
        relatedEntityType: 'product',
        relatedEntityId: editing?.id,
        uploadedByUid: sellerContext?.sellerId || 'admin',
        allowedTypes: ['video'],
        onProgress: (pct) => setUploadingVideoProgress(pct),
      });
      setVideoUrl(record.secureUrl);
      setMediaRecords((prev) => [...prev, record]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not upload product video. Please choose a valid MP4/WebM/MOV file.'
      );
    } finally {
      setUploadingVideoProgress(null);
    }
  };

  const setAsMainImage = (idx: number) => {
    if (idx <= 0 || idx >= imageDataUrls.length) return;
    setImageDataUrls((prev) => {
      const target = prev[idx];
      return [target, ...prev.filter((_, i) => i !== idx)];
    });
  };

  const removeImageAt = (idx: number) => {
    setImageDataUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePaymentQrChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploadingQrProgress(1);
    try {
      const record = await uploadMediaToCloudinary(file, {
        role: sellerContext ? 'seller' : 'admin',
        appSource: sellerContext ? 'glamour-galleria' : 'ggadminpanel',
        folder: sellerContext
          ? 'glamour-galleria/seller/product-qr'
          : 'ggadminpanel/admin/product-qr',
        relatedEntityType: 'payment_qr',
        relatedEntityId: editing?.id,
        uploadedByUid: sellerContext?.sellerId || 'admin',
        allowedTypes: ['image'],
        onProgress: (pct) => setUploadingQrProgress(pct),
      });
      setSellerPaymentQrDataUrl(record.secureUrl);
      setMediaRecords((prev) => [...prev, record]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid QR image. Please upload a valid JPG, PNG, or WEBP file.'
      );
    } finally {
      setUploadingQrProgress(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Product name is required.');
      return;
    }
    const finalCategory = category.trim() || DEFAULT_PRODUCT_CATEGORY;
    const buy = Number(purchasePrice) || 0;
    const sell = Number(sellingPrice) || 0;
    const oldMrp =
      originalPrice.trim() !== '' ? Number(originalPrice) || 0 : undefined;

    if (sell <= 0) {
      setError('Selling price must be greater than zero.');
      return;
    }

    const cleanPayUpi = sellerPaymentUpiId.trim();
    if (cleanPayUpi && !cleanPayUpi.includes('@')) {
      setError('Please enter a valid Product Payment UPI ID (e.g. name@axl).');
      return;
    }

    setBusy(true);
    try {
      const nextSellerApprovalStatus = sellerContext
        ? editing?.sellerApprovalStatus === 'approved'
          ? 'approved'
          : 'pending'
        : editing?.sellerId
          ? editing.sellerApprovalStatus || 'approved'
          : undefined;

      await onSaveProduct(
        {
          name: name.trim(),
          imageDataUrl: imageDataUrls[0] || '',
          imageDataUrls,
          videoUrl: videoUrl.trim(),
          mediaRecords,
          category: finalCategory,
          purchasePrice: Math.max(0, buy),
          sellingPrice: Math.max(0, sell),
          originalPrice:
            oldMrp && oldMrp > sell ? Math.max(0, oldMrp) : undefined,
          highlighted: sellerContext ? Boolean(editing?.highlighted) : highlighted,
          highlightExpiresAt: editing?.highlightExpiresAt,
          highlightPlacement: editing?.highlightPlacement,
          highlightPlanTitle: editing?.highlightPlanTitle,
          stockQty: Math.max(0, Math.floor(Number(stockQty) || 0)),
          lowStockAlert: Math.max(1, Math.floor(Number(lowStockAlert) || 5)),
          size: size.trim(),
          color: color.trim(),
          description: description.trim(),
          sellerId: sellerContext ? sellerContext.sellerId : editing?.sellerId,
          sellerName: sellerContext ? sellerContext.sellerName : editing?.sellerName,
          sellerPhone: sellerContext ? sellerContext.sellerPhone : editing?.sellerPhone,
          sellerApprovalStatus: nextSellerApprovalStatus,
          sellerPaymentUpiId: cleanPayUpi,
          sellerPaymentBankAccountName: sellerPaymentBankAccountName.trim(),
          sellerPaymentBankName: sellerPaymentBankName.trim(),
          sellerPaymentBankAccountNo: sellerPaymentBankAccountNo.trim(),
          sellerPaymentBankIfscBranch: sellerPaymentBankIfscBranch.trim(),
          sellerPaymentQrDataUrl: sellerPaymentQrDataUrl.trim(),
        },
        editing?.id
      );
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleHighlight = async (prod: Product) => {
    setError('');
    setTogglingHighlightId(prod.id);
    try {
      const { id, createdAt: _c, updatedAt: _u, ...rest } = prod;
      await onSaveProduct(
        {
          ...rest,
          highlighted: !prod.highlighted,
        },
        id
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update highlight status.'
      );
    } finally {
      setTogglingHighlightId(null);
    }
  };

  const lowStockItems = useMemo(
    () =>
      products.filter(
        (p) => p.stockQty <= (p.lowStockAlert || defaultLowStock || 5)
      ),
    [products, defaultLowStock]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products
      .filter((p) => {
        if (categoryFilter !== 'ALL' && p.category !== categoryFilter) {
          return false;
        }
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.color.toLowerCase().includes(q) ||
          p.size.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          Number(isProductHighlightActive(b)) - Number(isProductHighlightActive(a))
      );
  }, [products, searchQuery, categoryFilter]);

  const inputClass =
    'w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {!hideBackButton && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          )}
          <div>
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B]">
              {sellerContext ? `My Seller Products (${products.length})` : `Product Listing (${products.length})`}
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              {sellerContext
                ? 'Add, edit & manage your seller catalog with up to 5 compressed photos. Approved items appear on the storefront.'
                : 'Add, edit & manage women\'s products, perfumes & categories with up to 5 compressed photos synced to Firestore.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <div className="rounded-2xl border border-[#FBCFE8] bg-[#FFF1F6] p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#BE185D]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Low Stock Alert ({lowStockItems.length} items)</span>
          </div>
          <p className="text-xs text-[#9D174D]">
            {lowStockItems
              .map((p) => `${p.name} (${p.stockQty} left)`)
              .join(' · ')}
          </p>
        </div>
      )}

      {/* Add / Edit Product Drawer Card */}
      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[#D8B4FE] bg-white p-5 sm:p-6 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-[#F4ECF8] pb-3">
            <h2 className="text-base font-bold text-[#1F122B]">
              {editing ? 'Edit Product' : 'Add New Product'}
            </h2>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
              {error}
            </div>
          )}

          {/* Multi-photo + Video Upload Gallery */}
          <div className="space-y-3 rounded-2xl border border-[#F2E6F7] bg-[#FDF9FE] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-[#1F122B]">
                  Product Photos ({imageDataUrls.length}/{MAX_PRODUCT_IMAGES})
                </div>
                <div className="text-[11px] text-[#6B5B7B]">
                  Upload up to {MAX_PRODUCT_IMAGES} high-clarity photos via Cloudinary. First photo is shown as Main Photo on product cards.
                </div>
              </div>

              {imageDataUrls.length < MAX_PRODUCT_IMAGES && (
                <label className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95 cursor-pointer whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {uploadingImgProgress !== null
                      ? `Uploading ${uploadingImgProgress}%...`
                      : imageDataUrls.length === 0
                        ? 'Upload Photos (up to 5)'
                        : 'Add More Photos'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={uploadingImgProgress !== null}
                    onChange={handleImageChange}
                    className="sr-only"
                  />
                </label>
              )}
            </div>

            {imageDataUrls.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D8B4FE] bg-white py-5 px-4 text-center flex flex-col items-center gap-1.5">
                <Package className="w-6 h-6 text-[#C084FC]" />
                <span className="text-xs text-[#6B5B7B]">
                  No photos added yet. You can select up to 5 photos at once.
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {imageDataUrls.map((src, idx) => (
                  <div
                    key={`${idx}-${src.slice(0, 24)}`}
                    className={`rounded-xl border bg-white overflow-hidden flex flex-col ${
                      idx === 0
                        ? 'border-[#DB2777] ring-1 ring-[#DB2777]/30'
                        : 'border-[#E6D9EE]'
                    }`}
                  >
                    <div className="aspect-square relative bg-[#FDF8FC] overflow-hidden">
                      <img
                        src={getOptimizedMediaUrl(src, 'image')}
                        alt={`${name || 'Product'} photo ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      {idx === 0 && (
                        <span className="absolute top-1.5 left-1.5 rounded bg-[#DB2777] px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">
                          Main Photo
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImageAt(idx)}
                        aria-label={`Remove photo ${idx + 1}`}
                        className="absolute top-1.5 right-1.5 rounded-full bg-black/65 p-1 text-white hover:bg-[#BE123C] cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    {idx > 0 ? (
                      <button
                        type="button"
                        onClick={() => setAsMainImage(idx)}
                        className="py-1.5 text-[11px] font-semibold text-[#7E22CE] hover:bg-[#FAF5FF] border-t border-[#F4ECF8] cursor-pointer"
                      >
                        Set as Main
                      </button>
                    ) : (
                      <div className="py-1.5 text-center text-[11px] font-semibold text-[#15803D] bg-[#F0FDF4] border-t border-[#DCFCE7]">
                        Primary Card Photo
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Optional Product Video Uploader */}
            <div className="pt-3 border-t border-[#EFE2F5] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-[#1F122B] inline-flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-[#7E22CE]" />
                    <span>Product Video (Optional)</span>
                  </div>
                  <div className="text-[11px] text-[#6B5B7B]">
                    Upload a short showcase video (MP4 / WebM / MOV, max 80MB).
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-white px-3 py-1.5 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer whitespace-nowrap">
                    <Video className="w-3.5 h-3.5" />
                    <span>
                      {uploadingVideoProgress !== null
                        ? `Uploading Video ${uploadingVideoProgress}%...`
                        : videoUrl
                          ? 'Replace Video'
                          : 'Upload Video'}
                    </span>
                    <input
                      type="file"
                      accept="video/*"
                      disabled={uploadingVideoProgress !== null}
                      onChange={handleVideoChange}
                      className="sr-only"
                    />
                  </label>
                  {videoUrl && (
                    <button
                      type="button"
                      onClick={() => setVideoUrl('')}
                      className="text-xs font-semibold text-[#BE123C] hover:underline cursor-pointer"
                    >
                      Remove Video
                    </button>
                  )}
                </div>
              </div>
              {videoUrl && (
                <div className="rounded-xl border border-[#E6D9EE] bg-black overflow-hidden max-w-sm">
                  <video
                    src={getOptimizedMediaUrl(videoUrl, 'video')}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full max-h-48 object-contain"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Product Name <span className="text-[#DB2777]">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Banarasi Silk Kurti Set / Rose Oud Perfume"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Category <span className="text-[#DB2777]">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
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
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Purchase Price ({currencySymbol})
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(sanitizeNumericInput(e.target.value))}
                placeholder="0"
                className={`${inputClass} font-mono-num`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Selling / Offer Price ({currencySymbol}) <span className="text-[#DB2777]">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={sellingPrice}
                onChange={(e) => setSellingPrice(sanitizeNumericInput(e.target.value))}
                placeholder="0"
                className={`${inputClass} font-mono-num`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Old Price / MRP ({currencySymbol}, optional)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(sanitizeNumericInput(e.target.value))}
                placeholder="Strike-through MRP"
                className={`${inputClass} font-mono-num`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Stock Quantity
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={stockQty}
                onChange={(e) =>
                  setStockQty(sanitizeNumericInput(e.target.value, { allowDecimal: false }))
                }
                placeholder="0"
                className={`${inputClass} font-mono-num`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Size
              </label>
              <input
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="M, L, XL or Free Size"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Color
              </label>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Rose Pink"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Low Stock Alert At
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={lowStockAlert}
                onChange={(e) =>
                  setLowStockAlert(
                    sanitizeNumericInput(e.target.value, { allowDecimal: false })
                  )
                }
                placeholder="5"
                className={`${inputClass} font-mono-num`}
              />
            </div>

            {!sellerContext && (
              <div className="flex items-end pb-1">
                <label className="w-full inline-flex items-center gap-2.5 rounded-xl border border-[#E6D9EE] bg-[#FDF9FE] px-3.5 py-2.5 text-xs font-semibold text-[#1F122B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={highlighted}
                    onChange={(e) => setHighlighted(e.target.checked)}
                    className="w-4 h-4 accent-[#DB2777] rounded cursor-pointer"
                  />
                  <span>Highlight / Pin to Top of Storefront</span>
                </label>
              </div>
            )}

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Product Description (optional — shown in View Panel detail view)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Fabric details, highlights, care instructions, delivery info..."
                className={inputClass}
              />
            </div>
          </div>

          {/* Collapsible Product-Level Custom Payment Details */}
          <div className="rounded-2xl border border-[#EFE2F5] bg-[#FDF9FE] overflow-hidden">
            <button
              type="button"
              onClick={() => setPaymentSectionOpen((prev) => !prev)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-[#FAF3FC]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CreditCard className="w-4 h-4 text-[#7E22CE] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[#1F122B]">
                    Product Custom Payment Details (Optional — Overrides Seller / Store Payment)
                  </div>
                  <div className="text-[11px] text-[#6B5B7B]">
                    Leave blank to use Seller Account Payment System or Store Admin Payment Settings automatically.
                  </div>
                </div>
              </div>
              {paymentSectionOpen ? (
                <ChevronUp className="w-4 h-4 text-[#6B5B7B] shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#6B5B7B] shrink-0" />
              )}
            </button>

            {paymentSectionOpen && (
              <div className="p-4 pt-2 border-t border-[#EFE2F5] grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-4 items-start">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      Product UPI ID
                    </label>
                    <input
                      type="text"
                      value={sellerPaymentUpiId}
                      onChange={(e) => setSellerPaymentUpiId(e.target.value)}
                      placeholder="e.g. sellername@axl"
                      className={`${inputClass} bg-white font-mono-num`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={sellerPaymentBankAccountName}
                      onChange={(e) =>
                        setSellerPaymentBankAccountName(e.target.value)
                      }
                      placeholder="Payee / Holder Name"
                      className={`${inputClass} bg-white`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={sellerPaymentBankName}
                      onChange={(e) => setSellerPaymentBankName(e.target.value)}
                      placeholder="e.g. SBI / HDFC Bank"
                      className={`${inputClass} bg-white`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      Bank Account Number
                    </label>
                    <input
                      type="text"
                      value={sellerPaymentBankAccountNo}
                      onChange={(e) =>
                        setSellerPaymentBankAccountNo(e.target.value)
                      }
                      placeholder="Account number"
                      className={`${inputClass} bg-white font-mono-num`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                      IFSC Code / Branch
                    </label>
                    <input
                      type="text"
                      value={sellerPaymentBankIfscBranch}
                      onChange={(e) =>
                        setSellerPaymentBankIfscBranch(e.target.value)
                      }
                      placeholder="e.g. SBIN0001234, Kolkata"
                      className={`${inputClass} bg-white`}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-[#E6D9EE] bg-white p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#1F122B]">
                    <span className="inline-flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-[#DB2777]" />
                      Product Payment QR
                    </span>
                    <span className="text-[10px] font-medium text-[#6B5B7B]">
                      Cloudinary CDN
                    </span>
                  </div>

                  {sellerPaymentQrDataUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={getOptimizedMediaUrl(sellerPaymentQrDataUrl, 'image')}
                        alt="Product payment QR"
                        referrerPolicy="no-referrer"
                        className="w-20 h-20 rounded-lg border border-[#E6D9EE] object-contain bg-[#FDFBFE] p-1"
                      />
                      <div className="space-y-1.5">
                        <label className="inline-flex items-center gap-1 rounded-lg border border-[#D8B4FE] bg-[#FAF5FF] px-2.5 py-1 text-xs font-semibold text-[#6D28D9] cursor-pointer">
                          <Upload className="w-3 h-3" />
                          <span>
                            {uploadingQrProgress !== null
                              ? `Uploading ${uploadingQrProgress}%...`
                              : 'Change QR'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploadingQrProgress !== null}
                            onChange={handlePaymentQrChange}
                            className="sr-only"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setSellerPaymentQrDataUrl('')}
                          className="block text-xs font-semibold text-[#BE123C] hover:underline cursor-pointer"
                        >
                          Remove QR
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="rounded-xl border border-dashed border-[#D8B4FE] bg-[#FDFBFE] py-4 px-3 text-center flex flex-col items-center gap-1 hover:border-[#9333EA] cursor-pointer">
                      <QrCode className="w-5 h-5 text-[#9333EA]" />
                      <span className="text-xs font-semibold text-[#6D28D9]">
                        {uploadingQrProgress !== null
                          ? `Uploading ${uploadingQrProgress}%...`
                          : 'Upload Product QR'}
                      </span>
                      <span className="text-[10px] text-[#6B5B7B]">
                        JPG / PNG / WEBP · Saved to Cloudinary
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingQrProgress !== null}
                        onChange={handlePaymentQrChange}
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#F4ECF8]">
            <div className="text-xs text-[#6B5B7B] font-mono-num">
              Unit Profit:{' '}
              <strong className="text-[#15803D]">
                {formatCurrency(
                  Math.max(0, (Number(sellingPrice) || 0) - (Number(purchasePrice) || 0)),
                  currencySymbol
                )}
              </strong>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#E6D9EE] text-xs font-semibold text-[#5B4B6B] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  busy ||
                  uploadingImgProgress !== null ||
                  uploadingVideoProgress !== null ||
                  uploadingQrProgress !== null
                }
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
              >
                {busy ? 'Saving...' : editing ? 'Update Product' : 'Save Product'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Search & Category Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#8E7C9E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products, size, or color..."
            className="w-full rounded-xl border border-[#E6D9EE] bg-white pl-10 pr-4 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none cursor-pointer"
        >
          <option value="ALL">All Categories</option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Product Grid */}
      {filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-[#EFE2F5] bg-white py-16 px-6 text-center">
          <h3 className="text-base font-bold text-[#1F122B] mb-1">
            {products.length === 0 ? 'No products in catalog yet' : 'No matching products'}
          </h3>
          <p className="text-sm text-[#6B5B7B] mb-5">
            Add your boutique products with purchase &amp; selling prices to track profit and stock automatically.
          </p>
          {products.length === 0 && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs font-semibold text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Product</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((prod) => {
            const isLow = prod.stockQty <= (prod.lowStockAlert || defaultLowStock || 5);
            const profitPerUnit = prod.sellingPrice - prod.purchasePrice;
            const gallery =
              Array.isArray(prod.imageDataUrls) && prod.imageDataUrls.length > 0
                ? prod.imageDataUrls
                : prod.imageDataUrl
                  ? [prod.imageDataUrl]
                  : [];
            const mainImg = gallery[0] || '';
            const activeHighlight = isProductHighlightActive(prod);
            const hasPendingHighlight = Boolean(
              pendingHighlightProductIds?.has(prod.id)
            );

            return (
              <div
                key={prod.id}
                className={`rounded-2xl border bg-white overflow-hidden flex flex-col justify-between ${
                  activeHighlight
                    ? 'border-[#DB2777] ring-1 ring-[#DB2777]/25'
                    : 'border-[#EFE2F5]'
                }`}
              >
                <div>
                  <div className="h-44 bg-gradient-to-br from-[#FDF2F8] to-[#F5F3FF] relative flex items-center justify-center overflow-hidden border-b border-[#F4ECF8]">
                    {mainImg ? (
                      <img
                        src={getOptimizedMediaUrl(mainImg, 'image')}
                        alt={prod.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-10 h-10 text-[#C084FC]" />
                    )}
                    {activeHighlight && (
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-[#DB2777] px-2 py-0.5 text-[10px] font-bold text-white">
                        <Star className="w-3 h-3 fill-current" />
                        <span>
                          Highlighted
                          {prod.highlightExpiresAt
                            ? ` · till ${prod.highlightExpiresAt.slice(0, 10)}`
                            : ''}
                        </span>
                      </span>
                    )}
                    {!activeHighlight && hasPendingHighlight && (
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-[#B45309] px-2 py-0.5 text-[10px] font-bold text-white">
                        <Star className="w-3 h-3" />
                        <span>Highlight Pending</span>
                      </span>
                    )}
                    {(gallery.length > 1 || prod.videoUrl) && (
                      <div className="absolute bottom-2 right-2 flex items-center gap-1">
                        {prod.videoUrl && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-[#7E22CE]/90 px-2 py-0.5 text-[10px] font-bold text-white">
                            <Video className="w-3 h-3" />
                            <span>Video</span>
                          </span>
                        )}
                        {gallery.length > 1 && (
                          <span className="rounded-lg bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white font-mono-num">
                            {gallery.length} photos
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-2.5">
                    <div className="text-[11px] font-medium text-[#7E22CE]">
                      {prod.category}
                      {prod.size ? ` · Size ${prod.size}` : ''}
                      {prod.color ? ` · ${prod.color}` : ''}
                    </div>
                    <h3 className="text-base font-bold text-[#1F122B] leading-snug">
                      {prod.name}
                    </h3>
                    {prod.sellerId && (
                      <div className="text-[11px] font-medium flex flex-wrap items-center gap-1.5">
                        {!sellerContext && prod.sellerName && (
                          <span className="text-[#5B4B6B]">
                            Seller: <strong>{prod.sellerName}</strong> ·
                          </span>
                        )}
                        <span
                          className={
                            prod.sellerApprovalStatus === 'approved'
                              ? 'text-[#15803D] font-semibold'
                              : prod.sellerApprovalStatus === 'rejected'
                                ? 'text-[#BE123C] font-semibold'
                                : 'text-[#B45309] font-semibold'
                          }
                        >
                          {prod.sellerApprovalStatus === 'approved'
                            ? 'Approved (Live)'
                            : prod.sellerApprovalStatus === 'rejected'
                              ? 'Rejected by Admin'
                              : 'Pending Admin Approval'}
                        </span>
                      </div>
                    )}

                    {(prod.sellerPaymentUpiId ||
                      prod.sellerPaymentBankAccountNo ||
                      prod.sellerPaymentQrDataUrl) && (
                      <div className="inline-flex items-center gap-1 rounded-md border border-[#D8B4FE] bg-[#FAF5FF] px-2 py-0.5 text-[10px] font-bold text-[#6D28D9]">
                        <CreditCard className="w-3 h-3" />
                        <span>
                          Custom Payment
                          {prod.sellerPaymentUpiId
                            ? `: ${prod.sellerPaymentUpiId}`
                            : ' (Bank/QR)'}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#F4ECF8] text-xs">
                      <div>
                        <div className="text-[#6B5B7B]">Buy</div>
                        <div className="font-mono-num font-semibold text-[#4A3B59]">
                          {formatCurrency(prod.purchasePrice, currencySymbol)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#6B5B7B]">Sell</div>
                        <div className="font-mono-num font-bold text-[#7E22CE] flex flex-wrap items-baseline gap-1">
                          <span>
                            {formatCurrency(prod.sellingPrice, currencySymbol)}
                          </span>
                          {prod.originalPrice &&
                            prod.originalPrice > prod.sellingPrice && (
                              <span className="text-[11px] text-[#8E7C9E] line-through font-normal">
                                {formatCurrency(
                                  prod.originalPrice,
                                  currencySymbol
                                )}
                              </span>
                            )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#6B5B7B]">Profit</div>
                        <div className="font-mono-num font-semibold text-[#15803D]">
                          {formatCurrency(profitPerUnit, currencySymbol)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 bg-[#FDFBFE] border-t border-[#F4ECF8] flex items-center justify-between gap-2">
                  <div
                    className={`font-mono-num text-xs font-bold ${
                      isLow ? 'text-[#BE123C]' : 'text-[#1F122B]'
                    }`}
                  >
                    Stock: {prod.stockQty}
                    {isLow ? ' (Low)' : ''}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {sellerContext ? (
                      onRequestHighlight && (
                        <button
                          type="button"
                          onClick={() => onRequestHighlight(prod)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                            activeHighlight
                              ? 'border-[#FBCFE8] bg-[#FDF2F8] text-[#DB2777]'
                              : hasPendingHighlight
                                ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]'
                                : 'border-[#D8B4FE] bg-[#FAF5FF] text-[#7E22CE] hover:border-[#DB2777] hover:text-[#DB2777]'
                          }`}
                          title="Pay & request Highlight for this product"
                        >
                          <Star
                            className={`w-3.5 h-3.5 ${
                              activeHighlight ? 'fill-current' : ''
                            }`}
                          />
                          <span>
                            {activeHighlight
                              ? 'Highlighted'
                              : hasPendingHighlight
                                ? 'Pending'
                                : 'Highlight'}
                          </span>
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        disabled={togglingHighlightId === prod.id}
                        onClick={() => handleToggleHighlight(prod)}
                        className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors disabled:opacity-60 ${
                          prod.highlighted
                            ? 'border-[#FBCFE8] bg-[#FDF2F8] text-[#DB2777]'
                            : 'border-[#E6D9EE] bg-white text-[#5B4B6B] hover:text-[#DB2777]'
                        }`}
                        title={
                          prod.highlighted
                            ? 'Remove highlight priority'
                            : 'Highlight & show first in storefront'
                        }
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            prod.highlighted ? 'fill-current' : ''
                          }`}
                        />
                        <span>{prod.highlighted ? 'Highlighted' : 'Highlight'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(prod)}
                      className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white text-[#5B4B6B] hover:text-[#7E22CE] cursor-pointer"
                      title="Edit product"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(prod)}
                      className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white text-[#6B5B7B] hover:text-[#BE123C] cursor-pointer"
                      title="Delete product"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.name}" from your catalog?`}
        confirmLabel="Delete Product"
        busy={busy}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setBusy(true);
          try {
            await onDeleteProduct(deleteTarget.id);
            setDeleteTarget(null);
          } finally {
            setBusy(false);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
