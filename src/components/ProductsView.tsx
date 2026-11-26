import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Crop,
  Download,
  Link2,
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
import {
  CloudinaryMediaRecord,
  Product,
  ProductSourcePlatform,
} from '../types/business';
import {
  DEFAULT_PRODUCT_CATEGORY,
  downloadImageAsset,
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
import { ImageCropModal } from './ImageCropModal';

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
const CUSTOM_CATEGORY_VALUE = '__CUSTOM__';
const SHARE_DRAFT_STORAGE_PREFIX = 'gg_product_share_draft_v1_';

interface ExtractedShareLink {
  url: string | null;
  platform: ProductSourcePlatform | undefined;
}

function detectClientPlatform(rawUrl: string): ProductSourcePlatform {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host === 'meesho.com' || host.endsWith('.meesho.com')) return 'meesho';
    if (
      host === 'flipkart.com' ||
      host.endsWith('.flipkart.com') ||
      host === 'fkrt.it' ||
      host === 'fkrt.co'
    ) {
      return 'flipkart';
    }
  } catch {
    // ignore invalid url
  }
  return 'other';
}

function getSafeHttpUrl(raw?: string | null): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // ignore invalid url
  }
  return null;
}

function extractShareUrlAndPlatform(rawInput: string): ExtractedShareLink {
  const input = String(rawInput || '').trim();
  if (!input) {
    return { url: null, platform: undefined };
  }

  let normalizedUrl: string | null = null;
  const httpMatch = /https?:\/\/[^\s<>"'`]+/i.exec(input);
  if (httpMatch?.[0]) {
    const stripped = httpMatch[0].replace(/[.,!?;:)\]}"']+$/g, '');
    normalizedUrl = getSafeHttpUrl(stripped);
  } else {
    const bareMatch =
      /\b(?:www\.)?(?:meesho\.com|flipkart\.com|dl\.flipkart\.com|fkrt\.it|fkrt\.co)\/[^\s<>"'`]+/i.exec(
        input
      );
    if (bareMatch?.[0]) {
      const stripped = bareMatch[0].replace(/[.,!?;:)\]}"']+$/g, '');
      normalizedUrl = getSafeHttpUrl(`https://${stripped}`);
    }
  }

  const platform = normalizedUrl
    ? detectClientPlatform(normalizedUrl)
    : undefined;

  return {
    url: normalizedUrl,
    platform,
  };
}

function clearShareDraft(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore storage errors on private browsing / quota limits
  }
}

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
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [detailImageIndex, setDetailImageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // History & scroll position refs for mobile hardware Back button + zero annoying scroll jumps
  const subDepthRef = useRef(0);
  const listScrollYRef = useRef(0);
  const viewingProductIdRef = useRef<string | null>(null);

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
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importNotice, setImportNotice] = useState<{
    kind: 'success' | 'warning';
    text: string;
  } | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourcePlatform, setSourcePlatform] = useState<
    ProductSourcePlatform | undefined
  >(undefined);
  const [cropModalIndex, setCropModalIndex] = useState<number | null>(null);
  const [uploadingImgProgress, setUploadingImgProgress] = useState<number | null>(null);
  const [uploadingVideoProgress, setUploadingVideoProgress] = useState<number | null>(null);
  const [togglingHighlightId, setTogglingHighlightId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const shareDraftStorageKey = `${SHARE_DRAFT_STORAGE_PREFIX}${
    sellerContext?.sellerId || 'admin'
  }`;

  const resetImportLinkState = useCallback(() => {
    setImportUrl('');
    setSourceUrl('');
    setSourcePlatform(undefined);
    setImportNotice(null);
    clearShareDraft(shareDraftStorageKey);
  }, [shareDraftStorageKey]);

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

  useEffect(() => {
    viewingProductIdRef.current = viewingProduct?.id || null;
  }, [viewingProduct?.id]);

  const restoreListScroll = useCallback(() => {
    const targetY = listScrollYRef.current;
    requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: 'auto' });
    });
  }, []);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (subDepthRef.current <= 0) return;
      subDepthRef.current = Math.max(0, subDepthRef.current - 1);
      const state = e.state as { ggType?: string; sub?: string; productId?: string } | null;

      if (state?.ggType === 'products-sub' && state.sub === 'detail') {
        setFormOpen(false);
        setEditing(null);
        resetImportLinkState();
        setError('');
        if (state.productId && !viewingProductIdRef.current) {
          const found = products.find((p) => p.id === state.productId) || null;
          setViewingProduct(found);
        }
        return;
      }

      setFormOpen(false);
      setEditing(null);
      resetImportLinkState();
      setViewingProduct(null);
      setDeleteTarget(null);
      setError('');
      restoreListScroll();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [products, restoreListScroll, resetImportLinkState]);

  const pushSubState = (sub: 'detail' | 'form', extra: Record<string, unknown>) => {
    try {
      window.history.pushState({ ggType: 'products-sub', sub, ...extra }, '');
      subDepthRef.current += 1;
    } catch {
      // ignore history errors
    }
  };

  const leaveCurrentSubView = useCallback(() => {
    if (formOpen) {
      resetImportLinkState();
    }
    if (subDepthRef.current > 0) {
      window.history.back();
      return;
    }
    if (formOpen) {
      setFormOpen(false);
      setEditing(null);
      setError('');
      if (!viewingProduct) {
        restoreListScroll();
      }
      return;
    }
    if (viewingProduct) {
      setViewingProduct(null);
      restoreListScroll();
    }
  }, [formOpen, viewingProduct, restoreListScroll, resetImportLinkState]);

  const openDetail = (prod: Product) => {
    if (!viewingProduct && !formOpen) {
      listScrollYRef.current = window.scrollY;
    }
    setViewingProduct(prod);
    setDetailImageIndex(0);
    setFormOpen(false);
    setError('');
    pushSubState('detail', { productId: prod.id });
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  const openCreate = () => {
    if (!viewingProduct && !formOpen) {
      listScrollYRef.current = window.scrollY;
    }
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
    setIsCustomCategory(false);
    resetImportLinkState();
    setCropModalIndex(null);
    setPaymentSectionOpen(false);
    setSellerPaymentUpiId('');
    setSellerPaymentBankAccountName('');
    setSellerPaymentBankName('');
    setSellerPaymentBankAccountNo('');
    setSellerPaymentBankIfscBranch('');
    setSellerPaymentQrDataUrl('');
    setError('');
    setFormOpen(true);
    pushSubState('form', { editingId: null });
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  const openEdit = (prod: Product) => {
    if (!viewingProduct && !formOpen) {
      listScrollYRef.current = window.scrollY;
    }
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
    const isPresetCategory = ALLOWED_CATEGORIES_SET.has(cat);
    if (cat && !isPresetCategory) {
      setIsCustomCategory(true);
      setCategory(cat);
    } else {
      setIsCustomCategory(false);
      setCategory(isPresetCategory ? cat : DEFAULT_PRODUCT_CATEGORY);
    }
    setPurchasePrice(formatNumericFieldValue(prod.purchasePrice));
    setSellingPrice(formatNumericFieldValue(prod.sellingPrice));
    setOriginalPrice(formatNumericFieldValue(prod.originalPrice));
    setHighlighted(Boolean(prod.highlighted));
    setStockQty(formatNumericFieldValue(prod.stockQty));
    setLowStockAlert(formatNumericFieldValue(prod.lowStockAlert || defaultLowStock || 5));
    setSize(prod.size || '');
    setColor(prod.color || '');
    setDescription(prod.description || '');
    setImportUrl(prod.sourceUrl || '');
    setImportNotice(null);
    setSourceUrl(prod.sourceUrl || '');
    setSourcePlatform(prod.sourcePlatform);
    setCropModalIndex(null);
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
    pushSubState('form', { editingId: prod.id });
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  const downloadProductDetailsFile = (prod: Product) => {
    const safeBase =
      prod.name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') ||
      'product_details';
    const profit = prod.sellingPrice - prod.purchasePrice;
    const lines = [
      `Product: ${prod.name}`,
      `Category: ${prod.category}`,
      prod.size ? `Size: ${prod.size}` : '',
      prod.color ? `Color: ${prod.color}` : '',
      `Purchase Price: ${formatCurrency(prod.purchasePrice, currencySymbol)}`,
      `Selling Price: ${formatCurrency(prod.sellingPrice, currencySymbol)}`,
      prod.originalPrice && prod.originalPrice > prod.sellingPrice
        ? `MRP: ${formatCurrency(prod.originalPrice, currencySymbol)}`
        : '',
      `Profit Per Unit: ${formatCurrency(profit, currencySymbol)}`,
      `Stock Quantity: ${prod.stockQty}`,
      prod.sellerName ? `Seller: ${prod.sellerName}` : '',
      prod.description ? `\nDescription:\n${prod.description}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeBase}_details.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handleDownloadProductCard = async (
    prod: Product,
    imageOverride?: string
  ) => {
    const gallery =
      Array.isArray(prod.imageDataUrls) && prod.imageDataUrls.length > 0
        ? prod.imageDataUrls
        : prod.imageDataUrl
          ? [prod.imageDataUrl]
          : [];
    const targetImage = imageOverride || gallery[0] || '';
    setDownloadingId(prod.id);
    setError('');
    try {
      if (targetImage) {
        await downloadImageAsset(targetImage, prod.name);
      } else {
        downloadProductDetailsFile(prod);
      }
    } catch {
      downloadProductDetailsFile(prod);
    } finally {
      setDownloadingId(null);
    }
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

  const handleImportBoxChange = (nextVal: string) => {
    setImportUrl(nextVal);
    setImportNotice(null);
    const extracted = extractShareUrlAndPlatform(nextVal);
    if (extracted.url) {
      setSourceUrl(extracted.url);
      setSourcePlatform(extracted.platform);
    } else {
      setSourceUrl('');
      setSourcePlatform(undefined);
    }
  };

  const handleSaveLinkClick = () => {
    const rawBox = importUrl.trim();
    if (!rawBox) {
      setImportNotice({
        kind: 'warning',
        text: 'Please paste a Meesho, Flipkart, or product link first.',
      });
      return;
    }

    const extracted = extractShareUrlAndPlatform(rawBox);
    if (!extracted.url) {
      setImportNotice({
        kind: 'warning',
        text: 'No valid https:// product link found. Please paste a product URL.',
      });
      return;
    }

    const platform =
      extracted.platform || detectClientPlatform(extracted.url);
    setSourceUrl(extracted.url);
    setSourcePlatform(platform);
    setImportNotice({
      kind: 'success',
      text: `Link saved (${platform})! Now enter product details below and save product.`,
    });
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
    if (isCustomCategory && !category.trim()) {
      setError('Please enter your custom category name.');
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

      const parsedFallback = importUrl.trim()
        ? extractShareUrlAndPlatform(importUrl)
        : null;
      const finalSourceUrl =
        getSafeHttpUrl(sourceUrl) || parsedFallback?.url || '';
      const finalSourcePlatform = finalSourceUrl
        ? sourcePlatform ||
          parsedFallback?.platform ||
          detectClientPlatform(finalSourceUrl)
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
          ...(finalSourceUrl ? { sourceUrl: finalSourceUrl } : {}),
          ...(finalSourceUrl && finalSourcePlatform
            ? { sourcePlatform: finalSourcePlatform }
            : {}),
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
      resetImportLinkState();
      leaveCurrentSubView();
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

  const activeDetailProduct = useMemo(() => {
    if (!viewingProduct) return null;
    return products.find((p) => p.id === viewingProduct.id) || viewingProduct;
  }, [products, viewingProduct]);

  const filterCategoryOptions = useMemo(() => {
    const customCats: string[] = [];
    for (const p of products) {
      const cat = (p.category || '').trim();
      if (cat && !ALLOWED_CATEGORIES_SET.has(cat) && !customCats.includes(cat)) {
        customCats.push(cat);
      }
    }
    return [...PRODUCT_CATEGORIES, ...customCats];
  }, [products]);

  const inputClass =
    'w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none';

  // Suppress unused prop warning while keeping interface backwards-compatible
  void hideBackButton;
  void onBack;

  if (formOpen) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-5 pb-24 md:pb-10">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={leaveCurrentSubView}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          <h2 className="font-display-serif text-lg sm:text-xl font-bold text-[#1F122B]">
            {editing ? 'Edit Product' : 'Add New Product'}
          </h2>
          <button
            type="button"
            onClick={leaveCurrentSubView}
            aria-label="Close form"
            className="p-2 rounded-xl border border-[#E6D9EE] bg-white text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[#D8B4FE] bg-white p-4 sm:p-6 space-y-4 shadow-sm"
        >
          {/* Product Source URL Box (Single Save Link Button + Auto-Reset) */}
          {(() => {
            const activeSourceHref =
              getSafeHttpUrl(sourceUrl) ||
              extractShareUrlAndPlatform(importUrl).url;
            return (
              <div className="rounded-2xl border border-[#E6D9EE] bg-[#FDF9FE] p-3.5 sm:p-4 space-y-2.5">
                <label
                  htmlFor="product-url-autofill"
                  className="flex items-center gap-1.5 text-xs font-bold text-[#1F122B]"
                >
                  <Link2 className="w-3.5 h-3.5 text-[#DB2777]" />
                  <span>Import from Product URL (Meesho / Flipkart)</span>
                </label>

                <textarea
                  id="product-url-autofill"
                  rows={2}
                  value={importUrl}
                  onChange={(e) => handleImportBoxChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveLinkClick();
                    }
                  }}
                  placeholder="Paste Meesho / Flipkart product URL or share message..."
                  className={inputClass}
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveLinkClick}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Save Link</span>
                  </button>
                </div>

                {importNotice && (
                  <div
                    className={`rounded-xl border px-3 py-2 text-[11px] font-medium ${
                      importNotice.kind === 'success'
                        ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]'
                        : 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]'
                    }`}
                  >
                    {importNotice.text}
                  </div>
                )}

                {activeSourceHref && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6B5B7B]">
                    <span className="truncate max-w-full">
                      Resell Source ({sourcePlatform || detectClientPlatform(activeSourceHref)}):{' '}
                      {activeSourceHref}
                    </span>
                    <button
                      type="button"
                      onClick={resetImportLinkState}
                      className="text-[#BE123C] font-semibold hover:underline shrink-0 cursor-pointer"
                    >
                      Unlink URL
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

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
                    <div className="flex items-center border-t border-[#F4ECF8] divide-x divide-[#F4ECF8]">
                      {idx > 0 ? (
                        <button
                          type="button"
                          onClick={() => setAsMainImage(idx)}
                          className="flex-1 py-1.5 px-1 text-[10px] font-semibold text-[#7E22CE] hover:bg-[#FAF5FF] cursor-pointer truncate"
                        >
                          Set Main
                        </button>
                      ) : (
                        <div className="flex-1 py-1.5 px-1 text-center text-[10px] font-semibold text-[#15803D] bg-[#F0FDF4] truncate">
                          Main
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setCropModalIndex(idx)}
                        className="inline-flex items-center justify-center gap-1 py-1.5 px-2 text-[10px] font-semibold text-[#DB2777] hover:bg-[#FDF2F8] cursor-pointer shrink-0"
                        title="Crop or edit photo before upload"
                      >
                        <Crop className="w-3 h-3" />
                        <span>Crop / Edit</span>
                      </button>
                    </div>
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
                value={isCustomCategory ? CUSTOM_CATEGORY_VALUE : category}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === CUSTOM_CATEGORY_VALUE) {
                    setIsCustomCategory(true);
                    setCategory('');
                  } else {
                    setIsCustomCategory(false);
                    setCategory(val);
                  }
                }}
                className={inputClass}
              >
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={CUSTOM_CATEGORY_VALUE}>
                  Custom Category (Type Manually)
                </option>
              </select>
              {isCustomCategory && (
                <input
                  type="text"
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Type custom category name..."
                  className={`${inputClass} mt-2`}
                />
              )}
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
                onClick={leaveCurrentSubView}
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

        {cropModalIndex !== null && imageDataUrls[cropModalIndex] && (
          <ImageCropModal
            open={true}
            imageSrc={imageDataUrls[cropModalIndex]}
            imageIndex={cropModalIndex}
            uploadRole={sellerContext ? 'seller' : 'admin'}
            uploadAppSource={sellerContext ? 'glamour-galleria' : 'ggadminpanel'}
            uploadFolder={
              sellerContext
                ? 'glamour-galleria/seller/products'
                : 'ggadminpanel/admin/products'
            }
            uploadedByUid={sellerContext?.sellerId || 'admin'}
            relatedEntityId={editing?.id}
            onClose={() => setCropModalIndex(null)}
            onSaved={(record, targetIdx) => {
              setImageDataUrls((prev) =>
                prev.map((item, i) => (i === targetIdx ? record.secureUrl : item))
              );
              setMediaRecords((prev) => [...prev, record]);
            }}
          />
        )}
      </div>
    );
  }

  if (activeDetailProduct) {
    const detailGallery =
      Array.isArray(activeDetailProduct.imageDataUrls) &&
      activeDetailProduct.imageDataUrls.length > 0
        ? activeDetailProduct.imageDataUrls
        : activeDetailProduct.imageDataUrl
          ? [activeDetailProduct.imageDataUrl]
          : [];
    const safeIdx =
      detailImageIndex >= 0 && detailImageIndex < detailGallery.length
        ? detailImageIndex
        : 0;
    const currentPhoto = detailGallery[safeIdx] || '';
    const detailIsLow =
      activeDetailProduct.stockQty <=
      (activeDetailProduct.lowStockAlert || defaultLowStock || 5);
    const detailProfit =
      activeDetailProduct.sellingPrice - activeDetailProduct.purchasePrice;
    const detailHighlighted = isProductHighlightActive(activeDetailProduct);
    const detailPendingHighlight = Boolean(
      pendingHighlightProductIds?.has(activeDetailProduct.id)
    );

    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-5 pb-24 md:pb-10">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={leaveCurrentSubView}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Products</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {currentPhoto && (
              <button
                type="button"
                disabled={downloadingId === activeDetailProduct.id}
                onClick={() =>
                  void handleDownloadProductCard(activeDetailProduct, currentPhoto)
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] cursor-pointer disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Image</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => downloadProductDetailsFile(activeDetailProduct)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Details</span>
            </button>
            <button
              type="button"
              onClick={() => openEdit(activeDetailProduct)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Product</span>
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(activeDetailProduct)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-semibold text-[#BE123C] hover:bg-[#FFE4E6] cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-[#EFE2F5] bg-white overflow-hidden shadow-sm grid grid-cols-1 lg:grid-cols-2">
          {/* Left: Full Multi-Photo & Video Gallery */}
          <div className="bg-[#FDF9FE] border-b lg:border-b-0 lg:border-r border-[#F4ECF8] p-4 sm:p-5 space-y-3">
            <div className="aspect-square rounded-2xl border border-[#EFE2F5] bg-white relative flex items-center justify-center overflow-hidden">
              {currentPhoto ? (
                <img
                  src={getOptimizedMediaUrl(currentPhoto, 'image')}
                  alt={`${activeDetailProduct.name} photo ${safeIdx + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              ) : (
                <Package className="w-16 h-16 text-[#C084FC]" />
              )}
              {detailHighlighted && (
                <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-md bg-[#DB2777] px-2.5 py-1 text-[11px] font-bold text-white">
                  <Star className="w-3 h-3 fill-current" />
                  <span>
                    Highlighted
                    {activeDetailProduct.highlightExpiresAt
                      ? ` · till ${activeDetailProduct.highlightExpiresAt.slice(0, 10)}`
                      : ''}
                  </span>
                </span>
              )}
              {!detailHighlighted && detailPendingHighlight && (
                <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-md bg-[#B45309] px-2.5 py-1 text-[11px] font-bold text-white">
                  <Star className="w-3 h-3" />
                  <span>Highlight Pending</span>
                </span>
              )}
              {detailGallery.length > 0 && (
                <span className="absolute bottom-3 right-3 rounded-lg bg-black/65 px-2.5 py-1 text-xs font-bold text-white font-mono-num">
                  {safeIdx + 1} / {detailGallery.length}
                </span>
              )}
            </div>

            {detailGallery.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {detailGallery.map((imgSrc, idx) => (
                  <button
                    key={`${idx}-${imgSrc.slice(0, 20)}`}
                    type="button"
                    onClick={() => setDetailImageIndex(idx)}
                    className={`aspect-square rounded-xl overflow-hidden border-2 bg-white cursor-pointer ${
                      idx === safeIdx
                        ? 'border-[#DB2777] ring-2 ring-[#DB2777]/25'
                        : 'border-[#E6D9EE] opacity-80 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={getOptimizedMediaUrl(imgSrc, 'image')}
                      alt={`Thumbnail ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {activeDetailProduct.videoUrl && (
              <div className="pt-2 space-y-1.5">
                <div className="text-xs font-bold text-[#6D28D9] inline-flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5" />
                  <span>Product Video</span>
                </div>
                <div className="rounded-xl border border-[#E6D9EE] bg-black overflow-hidden">
                  <video
                    src={getOptimizedMediaUrl(activeDetailProduct.videoUrl, 'video')}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full max-h-64 object-contain"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right: Complete Product Info */}
          <div className="p-5 sm:p-6 space-y-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#7E22CE]">
                <span>{activeDetailProduct.category}</span>
                {activeDetailProduct.size && (
                  <span>· Size {activeDetailProduct.size}</span>
                )}
                {activeDetailProduct.color && (
                  <span>· {activeDetailProduct.color}</span>
                )}
              </div>
              <h1 className="font-display-serif text-2xl font-bold text-[#1F122B]">
                {activeDetailProduct.name}
              </h1>

              {activeDetailProduct.sellerId && (
                <div className="text-xs font-medium flex flex-wrap items-center gap-2 pt-1">
                  {!sellerContext && activeDetailProduct.sellerName && (
                    <span className="text-[#5B4B6B]">
                      Seller: <strong>{activeDetailProduct.sellerName}</strong> ·
                    </span>
                  )}
                  <span
                    className={
                      activeDetailProduct.sellerApprovalStatus === 'approved'
                        ? 'text-[#15803D] font-semibold'
                        : activeDetailProduct.sellerApprovalStatus === 'rejected'
                          ? 'text-[#BE123C] font-semibold'
                          : 'text-[#B45309] font-semibold'
                    }
                  >
                    {activeDetailProduct.sellerApprovalStatus === 'approved'
                      ? 'Approved (Live)'
                      : activeDetailProduct.sellerApprovalStatus === 'rejected'
                        ? 'Rejected by Admin'
                        : 'Pending Admin Approval'}
                  </span>
                </div>
              )}
            </div>

            {/* Pricing Grid */}
            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-[#EFE2F5] bg-[#FDF9FE] p-4">
              <div>
                <div className="text-[11px] text-[#6B5B7B]">Buy Price</div>
                <div className="font-mono-num text-sm sm:text-base font-semibold text-[#4A3B59] mt-0.5">
                  {formatCurrency(activeDetailProduct.purchasePrice, currencySymbol)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#6B5B7B]">Sell Price</div>
                <div className="font-mono-num text-sm sm:text-base font-bold text-[#7E22CE] mt-0.5 flex flex-wrap items-baseline gap-1">
                  <span>
                    {formatCurrency(activeDetailProduct.sellingPrice, currencySymbol)}
                  </span>
                  {activeDetailProduct.originalPrice &&
                    activeDetailProduct.originalPrice >
                      activeDetailProduct.sellingPrice && (
                      <span className="text-xs text-[#8E7C9E] line-through font-normal">
                        {formatCurrency(
                          activeDetailProduct.originalPrice,
                          currencySymbol
                        )}
                      </span>
                    )}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#6B5B7B]">Unit Profit</div>
                <div className="font-mono-num text-sm sm:text-base font-bold text-[#15803D] mt-0.5">
                  {formatCurrency(detailProfit, currencySymbol)}
                </div>
              </div>
            </div>

            {/* Stock & Highlight Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EFE2F5] bg-white p-4">
              <div>
                <div className="text-[11px] text-[#6B5B7B]">Inventory Stock</div>
                <div
                  className={`font-mono-num text-sm font-bold mt-0.5 ${
                    detailIsLow ? 'text-[#BE123C]' : 'text-[#1F122B]'
                  }`}
                >
                  Stock: {activeDetailProduct.stockQty}
                  {detailIsLow ? ' (Low Stock)' : ''}
                </div>
              </div>

              {sellerContext ? (
                onRequestHighlight && (
                  <button
                    type="button"
                    onClick={() => onRequestHighlight(activeDetailProduct)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                      detailHighlighted
                        ? 'border-[#FBCFE8] bg-[#FDF2F8] text-[#DB2777]'
                        : detailPendingHighlight
                          ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]'
                          : 'border-[#D8B4FE] bg-[#FAF5FF] text-[#7E22CE]'
                    }`}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        detailHighlighted ? 'fill-current' : ''
                      }`}
                    />
                    <span>
                      {detailHighlighted
                        ? 'Highlighted'
                        : detailPendingHighlight
                          ? 'Highlight Pending'
                          : 'Request Highlight'}
                    </span>
                  </button>
                )
              ) : (
                <button
                  type="button"
                  disabled={togglingHighlightId === activeDetailProduct.id}
                  onClick={() => void handleToggleHighlight(activeDetailProduct)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer disabled:opacity-60 ${
                    activeDetailProduct.highlighted
                      ? 'border-[#FBCFE8] bg-[#FDF2F8] text-[#DB2777]'
                      : 'border-[#E6D9EE] bg-white text-[#5B4B6B] hover:text-[#DB2777]'
                  }`}
                >
                  <Star
                    className={`w-3.5 h-3.5 ${
                      activeDetailProduct.highlighted ? 'fill-current' : ''
                    }`}
                  />
                  <span>
                    {activeDetailProduct.highlighted
                      ? 'Highlighted'
                      : 'Highlight on Storefront'}
                  </span>
                </button>
              )}
            </div>

            {activeDetailProduct.description && (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[#4A3B59]">Description</div>
                <p className="text-sm text-[#4A3B59] whitespace-pre-line leading-relaxed rounded-2xl border border-[#F4ECF8] bg-[#FDFBFE] p-3.5">
                  {activeDetailProduct.description}
                </p>
              </div>
            )}

            {(activeDetailProduct.sellerPaymentUpiId ||
              activeDetailProduct.sellerPaymentBankAccountNo ||
              activeDetailProduct.sellerPaymentQrDataUrl) && (
              <div className="rounded-2xl border border-[#D8B4FE] bg-[#FAF5FF] p-4 space-y-2">
                <div className="text-xs font-bold text-[#6D28D9] inline-flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Custom Payment Details</span>
                </div>
                <div className="text-xs text-[#4A3B59] space-y-1 font-mono-num">
                  {activeDetailProduct.sellerPaymentUpiId && (
                    <div>UPI ID: {activeDetailProduct.sellerPaymentUpiId}</div>
                  )}
                  {activeDetailProduct.sellerPaymentBankName && (
                    <div>Bank: {activeDetailProduct.sellerPaymentBankName}</div>
                  )}
                  {activeDetailProduct.sellerPaymentBankAccountName && (
                    <div>
                      Holder: {activeDetailProduct.sellerPaymentBankAccountName}
                    </div>
                  )}
                  {activeDetailProduct.sellerPaymentBankAccountNo && (
                    <div>
                      Account: {activeDetailProduct.sellerPaymentBankAccountNo}
                    </div>
                  )}
                  {activeDetailProduct.sellerPaymentBankIfscBranch && (
                    <div>
                      IFSC: {activeDetailProduct.sellerPaymentBankIfscBranch}
                    </div>
                  )}
                </div>
                {activeDetailProduct.sellerPaymentQrDataUrl && (
                  <img
                    src={getOptimizedMediaUrl(
                      activeDetailProduct.sellerPaymentQrDataUrl,
                      'image'
                    )}
                    alt="Product Payment QR"
                    referrerPolicy="no-referrer"
                    className="w-24 h-24 rounded-lg border border-[#E6D9EE] bg-white p-1 object-contain"
                  />
                )}
              </div>
            )}
          </div>
        </div>

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
              const targetId = deleteTarget.id;
              await onDeleteProduct(targetId);
              setDeleteTarget(null);
              if (viewingProduct?.id === targetId) {
                leaveCurrentSubView();
              }
            } finally {
              setBusy(false);
            }
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5 pb-24 md:pb-10">
      {/* Full-width Add Product Gradient CTA at Top */}
      <div>
        <button
          type="button"
          onClick={openCreate}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-3 text-sm font-semibold text-white hover:opacity-95 shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

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
          {filterCategoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Product Grid (Compact 2-Column Mobile Grid) */}
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
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
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
                role="button"
                tabIndex={0}
                onClick={() => openDetail(prod)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openDetail(prod);
                  }
                }}
                className={`rounded-2xl border bg-white overflow-hidden flex flex-col justify-between cursor-pointer hover:border-[#9333EA] hover:shadow-sm transition-all text-left ${
                  activeHighlight
                    ? 'border-[#DB2777] ring-1 ring-[#DB2777]/25'
                    : 'border-[#EFE2F5]'
                }`}
              >
                <div>
                  <div className="h-32 sm:h-44 bg-gradient-to-br from-[#FDF2F8] to-[#F5F3FF] relative flex items-center justify-center overflow-hidden border-b border-[#F4ECF8]">
                    {mainImg ? (
                      <img
                        src={getOptimizedMediaUrl(mainImg, 'image')}
                        alt={prod.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-8 h-8 sm:w-10 sm:h-10 text-[#C084FC]" />
                    )}
                    {activeHighlight && (
                      <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-[#DB2777] px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-white max-w-[calc(100%-12px)] truncate">
                        <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current shrink-0" />
                        <span className="truncate">
                          Highlighted
                          {prod.highlightExpiresAt
                            ? ` · till ${prod.highlightExpiresAt.slice(0, 10)}`
                            : ''}
                        </span>
                      </span>
                    )}
                    {!activeHighlight && hasPendingHighlight && (
                      <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-[#B45309] px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-white">
                        <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
                        <span>Pending</span>
                      </span>
                    )}
                    {(gallery.length > 0 || prod.videoUrl) && (
                      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
                        {prod.videoUrl && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-[#7E22CE]/90 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-white">
                            <Video className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            <span className="hidden sm:inline">Video</span>
                          </span>
                        )}
                        {gallery.length > 0 && (
                          <span className="rounded-md bg-black/65 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-white font-mono-num">
                            {gallery.length} {gallery.length === 1 ? 'photo' : 'photos'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 sm:p-4 space-y-1.5 sm:space-y-2">
                    <div className="text-[10px] sm:text-[11px] font-medium text-[#7E22CE] line-clamp-1">
                      {prod.category}
                      {prod.size ? ` · Size ${prod.size}` : ''}
                      {prod.color ? ` · ${prod.color}` : ''}
                    </div>
                    <h3 className="text-xs sm:text-base font-bold text-[#1F122B] leading-snug line-clamp-2 min-h-[2rem] sm:min-h-0">
                      {prod.name}
                    </h3>
                    {prod.sellerId && (
                      <div className="text-[10px] sm:text-[11px] font-medium flex flex-wrap items-center gap-1">
                        {!sellerContext && prod.sellerName && (
                          <span className="text-[#5B4B6B] truncate max-w-full">
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
                            ? 'Approved'
                            : prod.sellerApprovalStatus === 'rejected'
                              ? 'Rejected'
                              : 'Pending'}
                        </span>
                      </div>
                    )}

                    {(prod.sellerPaymentUpiId ||
                      prod.sellerPaymentBankAccountNo ||
                      prod.sellerPaymentQrDataUrl) && (
                      <div className="inline-flex items-center gap-1 rounded-md border border-[#D8B4FE] bg-[#FAF5FF] px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-[#6D28D9] max-w-full truncate">
                        <CreditCard className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
                        <span className="truncate">
                          {prod.sellerPaymentUpiId
                            ? `UPI: ${prod.sellerPaymentUpiId}`
                            : 'Custom Pay'}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-1 sm:gap-2 pt-1.5 sm:pt-2 border-t border-[#F4ECF8] text-[10px] sm:text-xs">
                      <div className="min-w-0">
                        <div className="text-[#6B5B7B]">Buy</div>
                        <div className="font-mono-num font-semibold text-[#4A3B59] truncate">
                          {formatCurrency(prod.purchasePrice, currencySymbol)}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[#6B5B7B]">Sell</div>
                        <div className="font-mono-num font-bold text-[#7E22CE] flex flex-wrap items-baseline gap-0.5">
                          <span className="truncate">
                            {formatCurrency(prod.sellingPrice, currencySymbol)}
                          </span>
                          {prod.originalPrice &&
                            prod.originalPrice > prod.sellingPrice && (
                              <span className="text-[9px] sm:text-[11px] text-[#8E7C9E] line-through font-normal hidden sm:inline">
                                {formatCurrency(
                                  prod.originalPrice,
                                  currencySymbol
                                )}
                              </span>
                            )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[#6B5B7B]">Profit</div>
                        <div className="font-mono-num font-semibold text-[#15803D] truncate">
                          {formatCurrency(profitPerUnit, currencySymbol)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-2.5 py-2 sm:px-4 sm:py-3 bg-[#FDFBFE] border-t border-[#F4ECF8] space-y-1.5 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-2">
                  <div
                    className={`font-mono-num text-[10px] sm:text-xs font-bold ${
                      isLow ? 'text-[#BE123C]' : 'text-[#1F122B]'
                    }`}
                  >
                    Stock: {prod.stockQty}
                    {isLow ? ' (Low)' : ''}
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-1">
                    {sellerContext ? (
                      onRequestHighlight && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRequestHighlight(prod);
                          }}
                          className={`inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border text-[10px] sm:text-[11px] font-semibold cursor-pointer transition-colors ${
                            activeHighlight
                              ? 'border-[#FBCFE8] bg-[#FDF2F8] text-[#DB2777]'
                              : hasPendingHighlight
                                ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]'
                                : 'border-[#D8B4FE] bg-[#FAF5FF] text-[#7E22CE] hover:border-[#DB2777] hover:text-[#DB2777]'
                          }`}
                          title="Pay & request Highlight for this product"
                        >
                          <Star
                            className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${
                              activeHighlight ? 'fill-current' : ''
                            }`}
                          />
                          <span className="hidden sm:inline">
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
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleHighlight(prod);
                        }}
                        className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg border text-[10px] sm:text-[11px] font-semibold cursor-pointer transition-colors disabled:opacity-60 ${
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
                          className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${
                            prod.highlighted ? 'fill-current' : ''
                          }`}
                        />
                        <span className="hidden sm:inline">
                          {prod.highlighted ? 'Highlighted' : 'Highlight'}
                        </span>
                      </button>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={downloadingId === prod.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDownloadProductCard(prod);
                        }}
                        className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white text-[#5B4B6B] hover:text-[#7E22CE] cursor-pointer disabled:opacity-60"
                        title="Download product image & details"
                      >
                        <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(prod);
                        }}
                        className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white text-[#5B4B6B] hover:text-[#7E22CE] cursor-pointer"
                        title="Edit product"
                      >
                        <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(prod);
                        }}
                        className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white text-[#6B5B7B] hover:text-[#BE123C] cursor-pointer"
                        title="Delete product"
                      >
                        <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                    </div>
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
