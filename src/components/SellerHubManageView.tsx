import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  HighlightConfig,
  HighlightOfferSeat,
  HighlightPlacementRule,
  HighlightPlan,
  HighlightRequest,
  HighlightRequestStatus,
  Product,
  SellerAccountStatus,
  SellerApplication,
  SellerApprovalStatus,
} from '../types/business';
import {
  DEFAULT_HIGHLIGHT_CONFIG,
  DEFAULT_PRODUCT_CATEGORY,
  HIGHLIGHT_UPI_ID,
  PRODUCT_CATEGORIES,
  downloadImageAsset,
  formatCurrency,
  validateAdultDateOfBirth,
} from '../utils/calculations';
import { decryptRunningPassword } from '../utils/adminAuth';
import { formatNumericFieldValue, sanitizeNumericInput } from '../utils/numberInput';
import { ConfirmModal } from './ConfirmModal';

interface SellerHubManageViewProps {
  sellerApplications: SellerApplication[];
  products: Product[];
  highlightRequests: HighlightRequest[];
  highlightConfig?: HighlightConfig;
  currencySymbol: string;
  defaultLowStock: number;
  onBack: () => void;
  onUpdateSellerStatus: (
    applicationId: string,
    status: SellerAccountStatus,
    adminRemarks?: string,
    credentials?: {
      sellerCode?: string;
      email?: string;
      password?: string;
    }
  ) => Promise<void>;
  onSetSellerPassword: (
    applicationId: string,
    newPassword: string
  ) => Promise<void>;
  onDeleteSellerApplication: (applicationId: string) => Promise<void>;
  onUpdateProductApproval: (
    productId: string,
    status: SellerApprovalStatus
  ) => Promise<void>;
  onSaveProduct: (
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onSaveHighlightConfig: (config: HighlightConfig) => Promise<void>;
  onUpdateHighlightRequestStatus: (
    requestId: string,
    status: HighlightRequestStatus,
    adminRemarks?: string
  ) => Promise<void>;
  onDeleteHighlightRequest: (requestId: string) => Promise<void>;
}

const ALLOWED_CATEGORIES_SET = new Set<string>(PRODUCT_CATEGORIES);

function getSellerStatusBadge(status: SellerAccountStatus) {
  switch (status) {
    case 'approved':
      return {
        label: 'Approved',
        cls: 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        cls: 'border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C]',
      };
    case 'suspended':
      return {
        label: 'Suspended',
        cls: 'border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]',
      };
    default:
      return {
        label: 'Pending',
        cls: 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]',
      };
  }
}

function getProductApprovalBadge(status?: SellerApprovalStatus) {
  if (status === 'approved') {
    return {
      label: 'Approved (Live)',
      cls: 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]',
    };
  }
  if (status === 'rejected') {
    return {
      label: 'Rejected',
      cls: 'border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C]',
    };
  }
  return {
    label: 'Pending Approval',
    cls: 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]',
  };
}

export const SellerHubManageView: React.FC<SellerHubManageViewProps> = ({
  sellerApplications,
  products,
  highlightRequests,
  highlightConfig,
  currencySymbol,
  defaultLowStock,
  onBack,
  onUpdateSellerStatus,
  onSetSellerPassword,
  onDeleteSellerApplication,
  onUpdateProductApproval,
  onSaveProduct,
  onDeleteProduct,
  onSaveHighlightConfig,
  onUpdateHighlightRequestStatus,
  onDeleteHighlightRequest,
}) => {
  const [activeTab, setActiveTab] = useState<
    'applications' | 'products' | 'highlights'
  >('applications');
  const [appStatusFilter, setAppStatusFilter] = useState<
    'ALL' | SellerAccountStatus
  >('ALL');
  const [prodStatusFilter, setProdStatusFilter] = useState<
    'ALL' | SellerApprovalStatus
  >('ALL');
  const [highlightFilter, setHighlightFilter] = useState<
    'ALL' | HighlightRequestStatus
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>(
    {}
  );
  const [revealedPasswords, setRevealedPasswords] = useState<
    Record<string, boolean>
  >({});
  const [savingPasswordAppId, setSavingPasswordAppId] = useState<string | null>(
    null
  );
  const [busyAppId, setBusyAppId] = useState<string | null>(null);
  const [busyProdId, setBusyProdId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Document Lightbox Preview
  const [docPreview, setDocPreview] = useState<{
    title: string;
    subtitle: string;
    src: string;
    filename: string;
  } | null>(null);

  // Delete Modals
  const [deleteAppTarget, setDeleteAppTarget] =
    useState<SellerApplication | null>(null);
  const [deletingApp, setDeletingApp] = useState(false);
  const [deleteProdTarget, setDeleteProdTarget] = useState<Product | null>(null);
  const [deletingProd, setDeletingProd] = useState(false);

  // Edit Seller Product Modal
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<string>(
    DEFAULT_PRODUCT_CATEGORY
  );
  const [editPurchasePrice, setEditPurchasePrice] = useState('');
  const [editSellingPrice, setEditSellingPrice] = useState('');
  const [editOriginalPrice, setEditOriginalPrice] = useState('');
  const [editStockQty, setEditStockQty] = useState('');
  const [editSize, setEditSize] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editApprovalStatus, setEditApprovalStatus] =
    useState<SellerApprovalStatus>('pending');
  const [savingProduct, setSavingProduct] = useState(false);

  // Highlight & Offer Seats Admin Draft State
  const [draftUpiId, setDraftUpiId] = useState(
    () => highlightConfig?.upiId || HIGHLIGHT_UPI_ID
  );
  const [draftPlacementRule, setDraftPlacementRule] =
    useState<HighlightPlacementRule>(
      () => highlightConfig?.placementRule || 'top_featured'
    );
  const [draftPlans, setDraftPlans] = useState<HighlightPlan[]>(
    () => highlightConfig?.plans || DEFAULT_HIGHLIGHT_CONFIG.plans
  );
  const [draftOfferSeats, setDraftOfferSeats] = useState<HighlightOfferSeat[]>(
    () => highlightConfig?.offerSeats || DEFAULT_HIGHLIGHT_CONFIG.offerSeats
  );
  const [savingHighlightConfig, setSavingHighlightConfig] = useState(false);
  const [highlightRemarksMap, setHighlightRemarksMap] = useState<
    Record<string, string>
  >({});
  const [busyHighlightId, setBusyHighlightId] = useState<string | null>(null);
  const [deleteHighlightTarget, setDeleteHighlightTarget] =
    useState<HighlightRequest | null>(null);
  const [deletingHighlight, setDeletingHighlight] = useState(false);

  React.useEffect(() => {
    if (!highlightConfig) return;
    setDraftUpiId(highlightConfig.upiId || HIGHLIGHT_UPI_ID);
    setDraftPlacementRule(highlightConfig.placementRule || 'top_featured');
    setDraftPlans(highlightConfig.plans || DEFAULT_HIGHLIGHT_CONFIG.plans);
    setDraftOfferSeats(
      highlightConfig.offerSeats || DEFAULT_HIGHLIGHT_CONFIG.offerSeats
    );
  }, [highlightConfig]);

  const sellerProducts = useMemo(
    () => products.filter((p) => Boolean(p.sellerId)),
    [products]
  );

  const sellerAppById = useMemo(() => {
    const map = new Map<string, SellerApplication>();
    for (const app of sellerApplications) {
      map.set(app.id, app);
    }
    return map;
  }, [sellerApplications]);

  const appCounts = useMemo(
    () => ({
      all: sellerApplications.length,
      pending: sellerApplications.filter((a) => a.status === 'pending').length,
      approved: sellerApplications.filter((a) => a.status === 'approved').length,
      rejected: sellerApplications.filter((a) => a.status === 'rejected').length,
      suspended: sellerApplications.filter((a) => a.status === 'suspended')
        .length,
    }),
    [sellerApplications]
  );

  const prodCounts = useMemo(
    () => ({
      all: sellerProducts.length,
      pending: sellerProducts.filter(
        (p) =>
          p.sellerApprovalStatus !== 'approved' &&
          p.sellerApprovalStatus !== 'rejected'
      ).length,
      approved: sellerProducts.filter((p) => p.sellerApprovalStatus === 'approved')
        .length,
      rejected: sellerProducts.filter((p) => p.sellerApprovalStatus === 'rejected')
        .length,
    }),
    [sellerProducts]
  );

  const highlightCounts = useMemo(
    () => ({
      all: highlightRequests.length,
      pending_approval: highlightRequests.filter(
        (r) => r.status === 'pending_approval'
      ).length,
      approved: highlightRequests.filter((r) => r.status === 'approved').length,
      rejected: highlightRequests.filter((r) => r.status === 'rejected').length,
    }),
    [highlightRequests]
  );

  const filteredHighlightRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return highlightRequests.filter((req) => {
      if (highlightFilter !== 'ALL' && req.status !== highlightFilter) {
        return false;
      }
      if (!q) return true;
      return (
        req.productName.toLowerCase().includes(q) ||
        req.sellerName.toLowerCase().includes(q) ||
        req.sellerPhone.toLowerCase().includes(q) ||
        (req.sellerCode && req.sellerCode.toLowerCase().includes(q)) ||
        req.planTitle.toLowerCase().includes(q) ||
        (req.transactionRef && req.transactionRef.toLowerCase().includes(q))
      );
    });
  }, [highlightRequests, highlightFilter, searchQuery]);

  const filteredApps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sellerApplications.filter((app) => {
      if (appStatusFilter !== 'ALL' && app.status !== appStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        app.name.toLowerCase().includes(q) ||
        (app.sellerCode && app.sellerCode.toLowerCase().includes(q)) ||
        (app.email && app.email.toLowerCase().includes(q)) ||
        app.phone.toLowerCase().includes(q) ||
        app.panNumber.toLowerCase().includes(q) ||
        app.aadhaarNumber.toLowerCase().includes(q) ||
        (app.gstNumber && app.gstNumber.toLowerCase().includes(q)) ||
        app.fullAddress.toLowerCase().includes(q)
      );
    });
  }, [sellerApplications, appStatusFilter, searchQuery]);

  const filteredSellerProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sellerProducts.filter((prod) => {
      const normalizedStatus: SellerApprovalStatus =
        prod.sellerApprovalStatus === 'approved'
          ? 'approved'
          : prod.sellerApprovalStatus === 'rejected'
            ? 'rejected'
            : 'pending';
      if (prodStatusFilter !== 'ALL' && normalizedStatus !== prodStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        prod.name.toLowerCase().includes(q) ||
        prod.category.toLowerCase().includes(q) ||
        (prod.sellerName && prod.sellerName.toLowerCase().includes(q)) ||
        (prod.sellerPhone && prod.sellerPhone.toLowerCase().includes(q))
      );
    });
  }, [sellerProducts, prodStatusFilter, searchQuery]);

  const handleSellerAction = async (
    app: SellerApplication,
    nextStatus: SellerAccountStatus
  ) => {
    setError('');
    setBusyAppId(app.id);
    try {
      const remarks =
        remarksMap[app.id] !== undefined
          ? remarksMap[app.id]
          : app.adminRemarks || '';
      const draftPwd = (passwordDrafts[app.id] || '').trim();
      await onUpdateSellerStatus(
        app.id,
        nextStatus,
        remarks,
        nextStatus === 'approved' && draftPwd ? { password: draftPwd } : undefined
      );
      if (nextStatus === 'approved' && draftPwd) {
        setPasswordDrafts((prev) => ({ ...prev, [app.id]: '' }));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update seller application status.'
      );
    } finally {
      setBusyAppId(null);
    }
  };

  const handleSaveSellerPassword = async (app: SellerApplication) => {
    const nextPwd = (passwordDrafts[app.id] || '').trim();
    if (nextPwd.length < 4) {
      setError('Seller login password must be at least 4 characters.');
      return;
    }
    setError('');
    setSavingPasswordAppId(app.id);
    try {
      await onSetSellerPassword(app.id, nextPwd);
      setPasswordDrafts((prev) => ({ ...prev, [app.id]: '' }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update seller password.'
      );
    } finally {
      setSavingPasswordAppId(null);
    }
  };

  const handleProductApprovalAction = async (
    productId: string,
    nextStatus: SellerApprovalStatus
  ) => {
    setError('');
    setBusyProdId(productId);
    try {
      await onUpdateProductApproval(productId, nextStatus);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update product approval status.'
      );
    } finally {
      setBusyProdId(null);
    }
  };

  const openEditProductModal = (prod: Product) => {
    setEditingProduct(prod);
    setEditName(prod.name);
    const cat = (prod.category || '').trim();
    setEditCategory(
      ALLOWED_CATEGORIES_SET.has(cat) ? cat : DEFAULT_PRODUCT_CATEGORY
    );
    setEditPurchasePrice(formatNumericFieldValue(prod.purchasePrice));
    setEditSellingPrice(formatNumericFieldValue(prod.sellingPrice));
    setEditOriginalPrice(formatNumericFieldValue(prod.originalPrice));
    setEditStockQty(formatNumericFieldValue(prod.stockQty));
    setEditSize(prod.size || '');
    setEditColor(prod.color || '');
    setEditDescription(prod.description || '');
    setEditApprovalStatus(
      prod.sellerApprovalStatus === 'approved'
        ? 'approved'
        : prod.sellerApprovalStatus === 'rejected'
          ? 'rejected'
          : 'pending'
    );
    setError('');
  };

  const handleSaveEditedProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setError('');
    if (!editName.trim()) {
      setError('Product name is required.');
      return;
    }
    const selling = Number(editSellingPrice);
    if (!Number.isFinite(selling) || selling < 0) {
      setError('Please enter a valid selling price.');
      return;
    }

    setSavingProduct(true);
    try {
      const existingGallery =
        Array.isArray(editingProduct.imageDataUrls) &&
        editingProduct.imageDataUrls.length > 0
          ? editingProduct.imageDataUrls
          : editingProduct.imageDataUrl
            ? [editingProduct.imageDataUrl]
            : [];

      await onSaveProduct(
        {
          name: editName.trim(),
          imageDataUrl: existingGallery[0] || editingProduct.imageDataUrl || '',
          imageDataUrls: existingGallery,
          category: editCategory,
          purchasePrice: Number(editPurchasePrice) || 0,
          sellingPrice: selling,
          originalPrice: Number(editOriginalPrice) || 0,
          highlighted: Boolean(editingProduct.highlighted),
          stockQty: Math.max(0, Math.floor(Number(editStockQty) || 0)),
          lowStockAlert: editingProduct.lowStockAlert || defaultLowStock || 5,
          size: editSize.trim(),
          color: editColor.trim(),
          description: editDescription.trim(),
          sellerId: editingProduct.sellerId,
          sellerName: editingProduct.sellerName,
          sellerPhone: editingProduct.sellerPhone,
          sellerApprovalStatus: editApprovalStatus,
        },
        editingProduct.id
      );
      setEditingProduct(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleConfirmDeleteApp = async () => {
    if (!deleteAppTarget) return;
    setDeletingApp(true);
    try {
      await onDeleteSellerApplication(deleteAppTarget.id);
      setDeleteAppTarget(null);
    } finally {
      setDeletingApp(false);
    }
  };

  const handleConfirmDeleteProd = async () => {
    if (!deleteProdTarget) return;
    setDeletingProd(true);
    try {
      await onDeleteProduct(deleteProdTarget.id);
      setDeleteProdTarget(null);
    } finally {
      setDeletingProd(false);
    }
  };

  const handleSaveHighlightSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSavingHighlightConfig(true);
    try {
      await onSaveHighlightConfig({
        upiId: draftUpiId.trim() || HIGHLIGHT_UPI_ID,
        placementRule: draftPlacementRule,
        plans: draftPlans.map((p) => ({
          ...p,
          label: p.label.trim() || `${Math.max(1, Number(p.durationDays) || 1)} Days`,
          durationDays: Math.max(1, Math.floor(Number(p.durationDays) || 1)),
          price: Math.max(0, Number(p.price) || 0),
        })),
        offerSeats: draftOfferSeats.map((s) => ({
          ...s,
          title: s.title.trim() || 'Special Highlight Seat',
          durationDays: Math.max(1, Math.floor(Number(s.durationDays) || 1)),
          price: Math.max(0, Number(s.price) || 0),
          originalPrice:
            s.originalPrice && s.originalPrice > 0
              ? Number(s.originalPrice)
              : undefined,
          totalSeats: Math.max(1, Math.floor(Number(s.totalSeats) || 1)),
          badgeText: (s.badgeText || '').trim(),
        })),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save highlight settings.'
      );
    } finally {
      setSavingHighlightConfig(false);
    }
  };

  const handleHighlightAction = async (
    req: HighlightRequest,
    status: HighlightRequestStatus
  ) => {
    setError('');
    setBusyHighlightId(req.id);
    try {
      const remark =
        highlightRemarksMap[req.id] !== undefined
          ? highlightRemarksMap[req.id]
          : req.adminRemarks || '';
      await onUpdateHighlightRequestStatus(req.id, status, remark);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update highlight request status.'
      );
    } finally {
      setBusyHighlightId(null);
    }
  };

  const handleConfirmDeleteHighlight = async () => {
    if (!deleteHighlightTarget) return;
    setDeletingHighlight(true);
    try {
      await onDeleteHighlightRequest(deleteHighlightTarget.id);
      setDeleteHighlightTarget(null);
    } finally {
      setDeletingHighlight(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B] flex items-center gap-2">
              <Store className="w-6 h-6 text-[#DB2777]" />
              <span>Seller Hub Manage (সেলার হাব ম্যানেজ)</span>
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Inspect KYC &amp; bank payout documents, approve or suspend seller accounts, and approve seller-listed products.
            </p>
          </div>
        </div>

        {/* Main Section Switcher */}
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white border border-[#EFE2F5] shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('applications')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'applications'
                ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                : 'text-[#5B4B6B] hover:text-[#1F122B]'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>
              Seller Applications ({appCounts.pending} pending / {appCounts.all})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'products'
                ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                : 'text-[#5B4B6B] hover:text-[#1F122B]'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>
              Seller Products ({prodCounts.pending} pending / {prodCounts.all})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('highlights')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'highlights'
                ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                : 'text-[#5B4B6B] hover:text-[#1F122B]'
            }`}
          >
            <Star className="w-3.5 h-3.5" />
            <span>
              Highlight &amp; Offer Seats ({highlightCounts.pending_approval} pending /{' '}
              {highlightCounts.all})
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-semibold text-[#BE123C]">
          {error}
        </div>
      )}

      {/* Search & Status Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative w-full md:max-w-md">
          <Search className="w-4 h-4 text-[#8E7C9E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'applications'
                ? 'Search sellers by name, phone, PAN, Aadhaar, GST...'
                : activeTab === 'products'
                  ? 'Search seller products by product name, category, or seller...'
                  : 'Search highlight requests by product, seller, or UTR...'
            }
            className="w-full rounded-xl border border-[#E6D9EE] bg-white pl-10 pr-4 py-2.5 text-sm text-[#1F122B] placeholder:text-[#A493B5] focus:border-[#9333EA] focus:outline-none"
          />
        </div>

        {activeTab === 'applications' ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `All (${appCounts.all})` },
                { id: 'pending', label: `Pending (${appCounts.pending})` },
                { id: 'approved', label: `Approved (${appCounts.approved})` },
                { id: 'rejected', label: `Rejected (${appCounts.rejected})` },
                { id: 'suspended', label: `Suspended (${appCounts.suspended})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setAppStatusFilter(f.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold border transition-colors whitespace-nowrap cursor-pointer ${
                  appStatusFilter === f.id
                    ? 'border-[#7E22CE] bg-[#7E22CE] text-white'
                    : 'border-[#E6D9EE] bg-white text-[#4A3B59] hover:border-[#9333EA]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : activeTab === 'products' ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `All (${prodCounts.all})` },
                { id: 'pending', label: `Pending (${prodCounts.pending})` },
                { id: 'approved', label: `Approved (${prodCounts.approved})` },
                { id: 'rejected', label: `Rejected (${prodCounts.rejected})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setProdStatusFilter(f.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold border transition-colors whitespace-nowrap cursor-pointer ${
                  prodStatusFilter === f.id
                    ? 'border-[#DB2777] bg-[#DB2777] text-white'
                    : 'border-[#E6D9EE] bg-white text-[#4A3B59] hover:border-[#DB2777]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `All (${highlightCounts.all})` },
                {
                  id: 'pending_approval',
                  label: `Pending (${highlightCounts.pending_approval})`,
                },
                { id: 'approved', label: `Approved (${highlightCounts.approved})` },
                { id: 'rejected', label: `Rejected (${highlightCounts.rejected})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setHighlightFilter(f.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold border transition-colors whitespace-nowrap cursor-pointer ${
                  highlightFilter === f.id
                    ? 'border-[#DB2777] bg-[#DB2777] text-white'
                    : 'border-[#E6D9EE] bg-white text-[#4A3B59] hover:border-[#DB2777]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TAB 1: SELLER APPLICATIONS */}
      {activeTab === 'applications' && (
        <div className="space-y-4">
          {filteredApps.length === 0 ? (
            <div className="rounded-2xl border border-[#EFE2F5] bg-white py-14 px-6 text-center space-y-2">
              <Store className="w-10 h-10 text-[#D8B4FE] mx-auto" />
              <h3 className="text-base font-bold text-[#1F122B]">
                No seller applications found
              </h3>
              <p className="text-xs text-[#6B5B7B]">
                Seller KYC applications submitted from the Customer Panel Seller Hub will appear here in real time.
              </p>
            </div>
          ) : (
            filteredApps.map((app) => {
              const badge = getSellerStatusBadge(app.status);
              const isBusy = busyAppId === app.id;
              const remarksValue =
                remarksMap[app.id] !== undefined
                  ? remarksMap[app.id]
                  : app.adminRemarks || '';

              const docCards = [
                {
                  label: 'Seller Photo',
                  src: app.sellerPhotoDataUrl,
                  filename: `${app.name}_seller_photo`,
                },
                {
                  label: 'PAN Card',
                  src: app.panDocDataUrl,
                  filename: `${app.name}_pan_card`,
                },
                {
                  label: 'Aadhaar Card',
                  src: app.aadhaarDocDataUrl,
                  filename: `${app.name}_aadhaar_card`,
                },
                {
                  label: 'GST Certificate',
                  src: app.gstDocDataUrl || '',
                  filename: `${app.name}_gst_certificate`,
                },
                {
                  label: 'Bank / Cheque / Passbook',
                  src: app.bankDocDataUrl,
                  filename: `${app.name}_bank_document`,
                },
              ].filter((d) => Boolean(d.src));

              return (
                <div
                  key={app.id}
                  className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-5 shadow-xs"
                >
                  {/* Top Info Row */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#F4ECF8] pb-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <button
                        type="button"
                        onClick={() =>
                          app.sellerPhotoDataUrl &&
                          setDocPreview({
                            title: 'Seller Photo',
                            subtitle: `${app.name} (${app.phone})`,
                            src: app.sellerPhotoDataUrl,
                            filename: `${app.name}_seller_photo`,
                          })
                        }
                        className="w-16 h-16 rounded-2xl border border-[#E6D9EE] bg-[#FDF9FE] overflow-hidden shrink-0 flex items-center justify-center cursor-pointer"
                      >
                        {app.sellerPhotoDataUrl ? (
                          <img
                            src={app.sellerPhotoDataUrl}
                            alt={app.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Store className="w-7 h-7 text-[#9333EA]" />
                        )}
                      </button>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display-serif text-xl font-bold text-[#1F122B]">
                            {app.name}
                          </h2>
                          <span
                            className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-bold ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                          {app.sellerCode && (
                            <span className="rounded-lg border border-[#E9D5FF] bg-[#FAF5FF] px-2.5 py-0.5 text-[11px] font-mono-num font-bold text-[#6D28D9]">
                              ID: {app.sellerCode}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5B4B6B]">
                          <span className="inline-flex items-center gap-1 font-mono-num font-semibold text-[#1F122B]">
                            <Phone className="w-3.5 h-3.5 text-[#DB2777]" />
                            {app.phone}
                          </span>
                          {app.email && (
                            <span className="inline-flex items-center gap-1 font-medium text-[#1F122B]">
                              <Mail className="w-3.5 h-3.5 text-[#7E22CE]" />
                              {app.email}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 font-mono-num">
                            <Clock className="w-3.5 h-3.5 text-[#7E22CE]" />
                            Applied {app.createdAt.slice(0, 10)}
                          </span>
                          {app.dateOfBirth && (
                            <span className="inline-flex items-center gap-1 font-mono-num text-[#15803D] font-semibold">
                              <Calendar className="w-3.5 h-3.5" />
                              DOB {app.dateOfBirth} (
                              {validateAdultDateOfBirth(app.dateOfBirth).age} yrs)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#6B5B7B] flex items-start gap-1.5 pt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-[#7E22CE] shrink-0 mt-0.5" />
                          <span>{app.fullAddress}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDeleteAppTarget(app)}
                      title="Delete application"
                      className="self-start p-2 rounded-lg border border-[#E6D9EE] text-[#6B5B7B] hover:text-[#BE123C] hover:border-[#FDA4AF] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* KYC Numbers & Bank Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-3">
                      <div className="text-[#6B5B7B]">PAN Number</div>
                      <div className="font-mono-num font-bold text-[#1F122B] mt-0.5 select-all">
                        {app.panNumber}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-3">
                      <div className="text-[#6B5B7B]">Aadhaar Number</div>
                      <div className="font-mono-num font-bold text-[#1F122B] mt-0.5 select-all">
                        {app.aadhaarNumber}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-3">
                      <div className="text-[#6B5B7B]">GST Number</div>
                      <div className="font-mono-num font-bold text-[#1F122B] mt-0.5 select-all">
                        {app.gstNumber || 'Not provided'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-3">
                      <div className="text-[#6B5B7B]">Bank / Payout Details</div>
                      <div className="font-medium text-[#1F122B] mt-0.5 whitespace-pre-wrap break-words">
                        {app.bankAccountDetails || 'See uploaded bank doc'}
                      </div>
                    </div>
                  </div>

                  {/* Uploaded KYC & Payment Documents */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-[#4A3B59] flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#7E22CE]" />
                      <span>Uploaded Photos, KYC &amp; Bank Documents</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {docCards.map((docItem) => (
                        <div
                          key={docItem.label}
                          className="rounded-xl border border-[#EFE2F5] bg-[#FDF9FE] overflow-hidden flex flex-col justify-between"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setDocPreview({
                                title: docItem.label,
                                subtitle: `${app.name} (${app.phone})`,
                                src: docItem.src,
                                filename: docItem.filename,
                              })
                            }
                            className="aspect-[4/3] bg-white overflow-hidden relative group cursor-pointer"
                          >
                            <img
                              src={docItem.src}
                              alt={`${app.name} ${docItem.label}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white inline-flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </span>
                          </button>
                          <div className="px-2.5 py-2 flex items-center justify-between gap-1.5">
                            <span className="text-[11px] font-semibold text-[#4A3B59] truncate">
                              {docItem.label}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                void downloadImageAsset(
                                  docItem.src,
                                  docItem.filename
                                )
                              }
                              title={`Download ${docItem.label}`}
                              className="p-1 rounded-md border border-[#E6D9EE] bg-white text-[#6D28D9] hover:border-[#9333EA] cursor-pointer shrink-0"
                            >
                              <Download className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Seller Login Credentials & Activation */}
                  {(() => {
                    const runningPassword = decryptRunningPassword(
                      app.runningPasswordEnc,
                      app.passwordSalt
                    );
                    const isRevealed = Boolean(revealedPasswords[app.id]);
                    const isAccountActive =
                      app.status === 'approved' &&
                      (app.accountActivated ?? true);
                    const pwdDraft = passwordDrafts[app.id] || '';
                    const isSavingPwd = savingPasswordAppId === app.id;

                    return (
                      <div className="rounded-xl border border-[#EFE2F5] bg-[#FDF9FE] p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[#1F122B]">
                            <ShieldCheck className="w-4 h-4 text-[#7E22CE]" />
                            <span>Seller Login Credentials &amp; Account Activation</span>
                          </div>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                              isAccountActive
                                ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]'
                                : 'border-[#E6D9EE] bg-white text-[#6B5B7B]'
                            }`}
                          >
                            {isAccountActive
                              ? 'Account Activated (Login Enabled)'
                              : 'Inactive until Admin Approves'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                          <div className="rounded-lg border border-[#E6D9EE] bg-white px-3 py-2">
                            <div className="text-[11px] text-[#6B5B7B]">Seller ID</div>
                            <div className="font-mono-num font-bold text-[#6D28D9] mt-0.5 select-all">
                              {app.sellerCode || 'Assigned on Approval'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-[#E6D9EE] bg-white px-3 py-2">
                            <div className="text-[11px] text-[#6B5B7B]">
                              Login Email / Phone
                            </div>
                            <div className="font-medium text-[#1F122B] mt-0.5 truncate">
                              {app.email || app.phone}
                            </div>
                          </div>
                          <div className="rounded-lg border border-[#E6D9EE] bg-white px-3 py-2 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] text-[#6B5B7B]">
                                রানিং পাসওয়ার্ড
                              </div>
                              <div className="font-mono-num font-bold text-[#1F122B] mt-0.5 truncate">
                                {runningPassword
                                  ? isRevealed
                                    ? runningPassword
                                    : '••••••••'
                                  : app.passwordHash
                                    ? 'Set (Hidden)'
                                    : 'Auto-assigned on Approval'}
                              </div>
                            </div>
                            {runningPassword && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRevealedPasswords((prev) => ({
                                    ...prev,
                                    [app.id]: !prev[app.id],
                                  }))
                                }
                                title={
                                  isRevealed ? 'Hide password' : 'Show password'
                                }
                                className="p-1.5 rounded-md border border-[#EFE2F5] text-[#6B5B7B] hover:text-[#7E22CE] cursor-pointer shrink-0"
                              >
                                {isRevealed ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <div className="relative flex-1">
                            <KeyRound className="w-3.5 h-3.5 text-[#8E7C9E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              value={pwdDraft}
                              onChange={(e) =>
                                setPasswordDrafts((prev) => ({
                                  ...prev,
                                  [app.id]: e.target.value,
                                }))
                              }
                              placeholder="Set or reset seller login password (min 4 chars)..."
                              className="w-full rounded-lg border border-[#E6D9EE] bg-white pl-8 pr-3 py-1.5 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={isSavingPwd || pwdDraft.trim().length < 4}
                            onClick={() => handleSaveSellerPassword(app)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#D8B4FE] bg-white px-3 py-1.5 text-xs font-semibold text-[#6D28D9] hover:bg-[#FAF5FF] cursor-pointer disabled:opacity-45 whitespace-nowrap shrink-0"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>
                              {isSavingPwd ? 'Saving...' : 'Save Password'}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Admin Remarks & Actions */}
                  <div className="pt-3 border-t border-[#F4ECF8] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <input
                      type="text"
                      value={remarksValue}
                      onChange={(e) =>
                        setRemarksMap((prev) => ({
                          ...prev,
                          [app.id]: e.target.value,
                        }))
                      }
                      placeholder="Optional admin remark / reason (visible to seller if rejected or suspended)..."
                      className="flex-1 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                    />

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy || app.status === 'approved'}
                        onClick={() => handleSellerAction(app, 'approved')}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#15803D] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-45 whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {app.status === 'suspended' || app.status === 'rejected'
                            ? 'Re-activate / Approve'
                            : 'Approve Seller'}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy || app.status === 'rejected'}
                        onClick={() => handleSellerAction(app, 'rejected')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2 text-xs font-semibold text-[#BE123C] hover:bg-[#FFE4E6] cursor-pointer disabled:opacity-45 whitespace-nowrap"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy || app.status === 'suspended'}
                        onClick={() => handleSellerAction(app, 'suspended')}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-3.5 py-2 text-xs font-semibold text-[#C2410C] hover:bg-[#FFEDD5] cursor-pointer disabled:opacity-45 whitespace-nowrap"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Suspend / Disable</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: SELLER-LISTED PRODUCTS */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {filteredSellerProducts.length === 0 ? (
            <div className="rounded-2xl border border-[#EFE2F5] bg-white py-14 px-6 text-center space-y-2">
              <Package className="w-10 h-10 text-[#D8B4FE] mx-auto" />
              <h3 className="text-base font-bold text-[#1F122B]">
                No seller-listed products found
              </h3>
              <p className="text-xs text-[#6B5B7B]">
                Products uploaded by approved sellers from Seller Hub will appear here for Admin review and approval before going live on the storefront.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSellerProducts.map((prod) => {
                const sellerApp = prod.sellerId
                  ? sellerAppById.get(prod.sellerId)
                  : undefined;
                const prodBadge = getProductApprovalBadge(
                  prod.sellerApprovalStatus
                );
                const gallery =
                  Array.isArray(prod.imageDataUrls) &&
                  prod.imageDataUrls.length > 0
                    ? prod.imageDataUrls
                    : prod.imageDataUrl
                      ? [prod.imageDataUrl]
                      : [];
                const mainImg = gallery[0] || '';
                const isBusy = busyProdId === prod.id;

                return (
                  <div
                    key={prod.id}
                    className="rounded-2xl border border-[#EFE2F5] bg-white overflow-hidden flex flex-col justify-between shadow-xs"
                  >
                    <div>
                      <div className="aspect-[4/3] bg-gradient-to-br from-[#FDF2F8] to-[#F5F3FF] relative overflow-hidden border-b border-[#F4ECF8] flex items-center justify-center">
                        {mainImg ? (
                          <img
                            src={mainImg}
                            alt={prod.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-10 h-10 text-[#C084FC]" />
                        )}
                        <span
                          className={`absolute top-2.5 left-2.5 rounded-lg border px-2 py-0.5 text-[11px] font-bold ${prodBadge.cls}`}
                        >
                          {prodBadge.label}
                        </span>
                        {gallery.length > 1 && (
                          <span className="absolute bottom-2 right-2 rounded-md bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white font-mono-num">
                            {gallery.length} photos
                          </span>
                        )}
                      </div>

                      <div className="p-4 space-y-2.5">
                        <div>
                          <div className="text-[11px] font-semibold text-[#7E22CE]">
                            {prod.category}
                          </div>
                          <h3 className="text-base font-bold text-[#1F122B] leading-snug">
                            {prod.name}
                          </h3>
                        </div>

                        <div className="flex items-baseline justify-between gap-2 font-mono-num">
                          <div className="flex items-baseline gap-2">
                            <span className="text-base font-bold text-[#1F122B]">
                              {formatCurrency(prod.sellingPrice, currencySymbol)}
                            </span>
                            {prod.originalPrice &&
                              prod.originalPrice > prod.sellingPrice && (
                                <span className="text-xs text-[#8E7C9E] line-through">
                                  {formatCurrency(
                                    prod.originalPrice,
                                    currencySymbol
                                  )}
                                </span>
                              )}
                          </div>
                          <span className="text-xs text-[#5B4B6B]">
                            Stock: <strong>{prod.stockQty}</strong>
                          </span>
                        </div>

                        {(prod.size || prod.color) && (
                          <div className="text-xs text-[#6B5B7B]">
                            {[
                              prod.size ? `Size: ${prod.size}` : '',
                              prod.color ? `Color: ${prod.color}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}

                        {prod.description && (
                          <p className="text-xs text-[#5B4B6B] line-clamp-2">
                            {prod.description}
                          </p>
                        )}

                        <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-2.5 text-xs space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#1F122B] inline-flex items-center gap-1 truncate">
                              <BadgeCheck className="w-3.5 h-3.5 text-[#7E22CE] shrink-0" />
                              <span className="truncate">
                                {sellerApp?.name || prod.sellerName || 'Seller'}
                              </span>
                            </span>
                            {sellerApp && (
                              <span className="text-[10px] font-semibold text-[#6B5B7B] uppercase shrink-0">
                                {sellerApp.status}
                              </span>
                            )}
                          </div>
                          {(sellerApp?.phone || prod.sellerPhone) && (
                            <div className="font-mono-num text-[11px] text-[#6B5B7B]">
                              {sellerApp?.phone || prod.sellerPhone}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="px-4 pb-4 pt-2 border-t border-[#F4ECF8] flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy || prod.sellerApprovalStatus === 'approved'}
                          onClick={() =>
                            handleProductApprovalAction(prod.id, 'approved')
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-[#15803D] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-45"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy || prod.sellerApprovalStatus === 'rejected'}
                          onClick={() =>
                            handleProductApprovalAction(prod.id, 'rejected')
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-[#FECDD3] bg-[#FFF1F2] px-2.5 py-1.5 text-[11px] font-semibold text-[#BE123C] hover:bg-[#FFE4E6] cursor-pointer disabled:opacity-45"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditProductModal(prod)}
                          title="Edit seller product"
                          className="p-1.5 rounded-lg border border-[#E6D9EE] text-[#5B4B6B] hover:text-[#7E22CE] hover:border-[#C084FC] cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteProdTarget(prod)}
                          title="Delete seller product"
                          className="p-1.5 rounded-lg border border-[#E6D9EE] text-[#6B5B7B] hover:text-[#BE123C] hover:border-[#FDA4AF] cursor-pointer"
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
        </div>
      )}

      {/* TAB 3: HIGHLIGHT & OFFER SEATS MANAGEMENT */}
      {activeTab === 'highlights' && (
        <div className="space-y-6">
          {/* Admin Highlight Plans, Offer Seats & Placement Rules Editor */}
          <form
            onSubmit={handleSaveHighlightSettings}
            className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-5 shadow-xs"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F4ECF8] pb-3.5">
              <div>
                <h2 className="font-display-serif text-lg font-bold text-[#1F122B] flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#DB2777]" />
                  <span>Highlight Settings, UPI &amp; Offer Seats (অফার সিট)</span>
                </h2>
                <p className="text-xs text-[#6B5B7B] mt-0.5">
                  Configure Admin UPI ID for highlight payments, placement rule on Storefront, standard plans, and limited Offer Seats.
                </p>
              </div>
              <button
                type="submit"
                disabled={savingHighlightConfig}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-60 shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {savingHighlightConfig
                    ? 'Saving...'
                    : 'Save Highlight Config'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Admin UPI ID for Highlight Payments
                </label>
                <input
                  type="text"
                  value={draftUpiId}
                  onChange={(e) => setDraftUpiId(e.target.value)}
                  placeholder={HIGHLIGHT_UPI_ID}
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Storefront Highlight Placement Rule
                </label>
                <select
                  value={draftPlacementRule}
                  onChange={(e) =>
                    setDraftPlacementRule(
                      e.target.value as HighlightPlacementRule
                    )
                  }
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                >
                  <option value="top_featured">
                    Top Featured (Pin highlighted products at top everywhere)
                  </option>
                  <option value="priority_category">
                    Priority in Category (Pin to top inside selected category)
                  </option>
                  <option value="featured_badge_only">
                    Featured Badge Only (Keep regular sort, show Featured badge)
                  </option>
                </select>
              </div>
            </div>

            {/* Highlight Offer Seats (Custom Days + Price + Total Seats) */}
            <div className="space-y-3 pt-2 border-t border-[#F4ECF8]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-[#1F122B]">
                    Highlight Offer Seats (দিন ও টাকা সেট করা অফার সিট)
                  </div>
                  <div className="text-[11px] text-[#6B5B7B]">
                    Create discounted highlight slots with limited seat counts visible in Seller Hub.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDraftOfferSeats((prev) => [
                      ...prev,
                      {
                        id: `seat-${Date.now()}`,
                        title: 'Festive Offer Seat (7 Days)',
                        durationDays: 7,
                        price: 129,
                        originalPrice: 199,
                        totalSeats: 10,
                        badgeText: 'LIMITED OFFER',
                        enabled: true,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-[#D8B4FE] bg-[#FAF5FF] px-3 py-1.5 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Offer Seat</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {draftOfferSeats.map((seat, idx) => (
                  <div
                    key={seat.id}
                    className="rounded-xl border border-[#EFE2F5] bg-[#FDF9FE] p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                  >
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-semibold text-[#6B5B7B] mb-1">
                        Offer Title
                      </label>
                      <input
                        type="text"
                        value={seat.title}
                        onChange={(e) =>
                          setDraftOfferSeats((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, title: e.target.value } : s
                            )
                          )
                        }
                        className="w-full rounded-lg border border-[#E6D9EE] bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-semibold text-[#6B5B7B] mb-1">
                        Days
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={String(seat.durationDays)}
                        onChange={(e) => {
                          const val = sanitizeNumericInput(e.target.value, {
                            allowDecimal: false,
                          });
                          setDraftOfferSeats((prev) =>
                            prev.map((s, i) =>
                              i === idx
                                ? { ...s, durationDays: Number(val) || 1 }
                                : s
                            )
                          );
                        }}
                        className="w-full rounded-lg border border-[#E6D9EE] bg-white px-2.5 py-1.5 text-xs font-mono-num"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-semibold text-[#6B5B7B] mb-1">
                        Offer Price ({currencySymbol})
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={String(seat.price)}
                        onChange={(e) => {
                          const val = sanitizeNumericInput(e.target.value);
                          setDraftOfferSeats((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, price: Number(val) || 0 } : s
                            )
                          );
                        }}
                        className="w-full rounded-lg border border-[#E6D9EE] bg-white px-2.5 py-1.5 text-xs font-mono-num"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-semibold text-[#6B5B7B] mb-1">
                        Total Seats
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={String(seat.totalSeats)}
                        onChange={(e) => {
                          const val = sanitizeNumericInput(e.target.value, {
                            allowDecimal: false,
                          });
                          setDraftOfferSeats((prev) =>
                            prev.map((s, i) =>
                              i === idx
                                ? { ...s, totalSeats: Number(val) || 1 }
                                : s
                            )
                          );
                        }}
                        className="w-full rounded-lg border border-[#E6D9EE] bg-white px-2.5 py-1.5 text-xs font-mono-num"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-semibold text-[#6B5B7B] mb-1">
                        Badge Label
                      </label>
                      <input
                        type="text"
                        value={seat.badgeText || ''}
                        onChange={(e) =>
                          setDraftOfferSeats((prev) =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, badgeText: e.target.value } : s
                            )
                          )
                        }
                        placeholder="OFFER SEAT"
                        className="w-full rounded-lg border border-[#E6D9EE] bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-1 flex items-center justify-end gap-1.5 pb-1">
                      <input
                        type="checkbox"
                        checked={seat.enabled}
                        onChange={(e) =>
                          setDraftOfferSeats((prev) =>
                            prev.map((s, i) =>
                              i === idx
                                ? { ...s, enabled: e.target.checked }
                                : s
                            )
                          )
                        }
                        title="Enable offer seat"
                        className="w-4 h-4 accent-[#DB2777] cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraftOfferSeats((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        title="Remove offer seat"
                        className="p-1 rounded text-[#6B5B7B] hover:text-[#BE123C] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Standard Highlight Plans */}
            <div className="space-y-3 pt-2 border-t border-[#F4ECF8]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-[#1F122B]">
                  Standard Highlight Plans
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDraftPlans((prev) => [
                      ...prev,
                      {
                        id: `plan-${Date.now()}`,
                        label: '10 Days Featured',
                        durationDays: 10,
                        price: 249,
                        enabled: true,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-[#E6D9EE] bg-white px-3 py-1.5 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Plan</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {draftPlans.map((plan, idx) => (
                  <div
                    key={plan.id}
                    className="rounded-xl border border-[#EFE2F5] bg-[#FDFBFE] p-3 grid grid-cols-12 gap-2 items-end"
                  >
                    <div className="col-span-5">
                      <label className="block text-[10px] font-semibold text-[#6B5B7B] mb-1">
                        Plan Label
                      </label>
                      <input
                        type="text"
                        value={plan.label}
                        onChange={(e) =>
                          setDraftPlans((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, label: e.target.value } : p
                            )
                          )
                        }
                        className="w-full rounded-lg border border-[#E6D9EE] bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[10px] font-semibold text-[#6B5B7B] mb-1">
                        Days
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={String(plan.durationDays)}
                        onChange={(e) => {
                          const val = sanitizeNumericInput(e.target.value, {
                            allowDecimal: false,
                          });
                          setDraftPlans((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? { ...p, durationDays: Number(val) || 1 }
                                : p
                            )
                          );
                        }}
                        className="w-full rounded-lg border border-[#E6D9EE] bg-white px-2.5 py-1.5 text-xs font-mono-num"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[10px] font-semibold text-[#6B5B7B] mb-1">
                        Price ({currencySymbol})
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={String(plan.price)}
                        onChange={(e) => {
                          const val = sanitizeNumericInput(e.target.value);
                          setDraftPlans((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, price: Number(val) || 0 } : p
                            )
                          );
                        }}
                        className="w-full rounded-lg border border-[#E6D9EE] bg-white px-2.5 py-1.5 text-xs font-mono-num"
                      />
                    </div>
                    <div className="col-span-1 flex items-center justify-end gap-1 pb-1">
                      <input
                        type="checkbox"
                        checked={plan.enabled}
                        onChange={(e) =>
                          setDraftPlans((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? { ...p, enabled: e.target.checked }
                                : p
                            )
                          )
                        }
                        title="Enable plan"
                        className="w-3.5 h-3.5 accent-[#7E22CE] cursor-pointer"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </form>

          {/* Highlight Payment Approval Requests Queue */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#1F122B]">
              Seller Highlight Payment Requests ({filteredHighlightRequests.length})
            </h3>
            {filteredHighlightRequests.length === 0 ? (
              <div className="rounded-2xl border border-[#EFE2F5] bg-white py-12 px-6 text-center space-y-2">
                <Star className="w-9 h-9 text-[#D8B4FE] mx-auto" />
                <div className="text-sm font-bold text-[#1F122B]">
                  No highlight requests yet
                </div>
                <p className="text-xs text-[#6B5B7B]">
                  Paid product highlight requests submitted by sellers from Seller Hub will appear here for UPI verification and approval.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredHighlightRequests.map((req) => {
                  const isBusy = busyHighlightId === req.id;
                  const remarkVal =
                    highlightRemarksMap[req.id] !== undefined
                      ? highlightRemarksMap[req.id]
                      : req.adminRemarks || '';
                  return (
                    <div
                      key={req.id}
                      className="rounded-2xl border border-[#EFE2F5] bg-white p-4 sm:p-5 space-y-4 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-14 h-14 rounded-xl border border-[#EFE2F5] bg-[#FDF9FE] overflow-hidden shrink-0 flex items-center justify-center">
                            {req.productImageDataUrl ? (
                              <img
                                src={req.productImageDataUrl}
                                alt={req.productName}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="w-6 h-6 text-[#9333EA]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-[#1F122B] truncate">
                              {req.productName}
                            </div>
                            <div className="text-xs text-[#6B5B7B] mt-0.5">
                              Seller: <strong>{req.sellerName}</strong>{' '}
                              {req.sellerCode ? `(${req.sellerCode})` : ''} ·{' '}
                              <span className="font-mono-num">{req.sellerPhone}</span>
                            </div>
                            <div className="text-xs font-mono-num text-[#7E22CE] font-bold mt-1">
                              {req.planTitle} ({req.durationDays}d) ·{' '}
                              {formatCurrency(req.amount, currencySymbol)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${
                              req.status === 'approved'
                                ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]'
                                : req.status === 'rejected'
                                  ? 'border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C]'
                                  : 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]'
                            }`}
                          >
                            {req.status === 'approved'
                              ? 'Approved'
                              : req.status === 'rejected'
                                ? 'Rejected'
                                : 'Pending'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setDeleteHighlightTarget(req)}
                            title="Delete highlight request"
                            className="p-1.5 rounded-lg border border-[#E6D9EE] text-[#6B5B7B] hover:text-[#BE123C] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5 font-mono-num">
                          <div className="text-[#5B4B6B]">
                            UPI: <strong>{req.upiIdUsed}</strong>
                          </div>
                          {req.transactionRef && (
                            <div className="text-[#1F122B]">
                              UTR / Ref: <strong className="select-all">{req.transactionRef}</strong>
                            </div>
                          )}
                          {req.expiresAt && req.status === 'approved' && (
                            <div className="text-[#15803D] font-semibold">
                              Active until {req.expiresAt.slice(0, 10)}
                            </div>
                          )}
                        </div>

                        {req.paymentScreenshotDataUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setDocPreview({
                                title: 'Highlight Payment Screenshot',
                                subtitle: `${req.sellerName} · ${req.productName}`,
                                src: req.paymentScreenshotDataUrl!,
                                filename: `${req.productName}_highlight_upi`,
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8B4FE] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Payment Screenshot</span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-[#F4ECF8]">
                        <input
                          type="text"
                          value={remarkVal}
                          onChange={(e) =>
                            setHighlightRemarksMap((prev) => ({
                              ...prev,
                              [req.id]: e.target.value,
                            }))
                          }
                          placeholder="Optional remark for seller..."
                          className="flex-1 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-1.5 text-xs focus:border-[#9333EA] focus:bg-white focus:outline-none"
                        />
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={isBusy || req.status === 'approved'}
                            onClick={() => handleHighlightAction(req, 'approved')}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#15803D] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-45"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve &amp; Highlight</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy || req.status === 'rejected'}
                            onClick={() => handleHighlightAction(req, 'rejected')}
                            className="inline-flex items-center gap-1 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-1.5 text-xs font-semibold text-[#BE123C] hover:bg-[#FFE4E6] cursor-pointer disabled:opacity-45"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document Zoom Preview Modal */}
      {docPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white border border-[#EFE2F5] overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-[#F4ECF8] flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-[#1F122B]">
                  {docPreview.title}
                </div>
                <div className="text-xs text-[#6B5B7B]">
                  {docPreview.subtitle}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void downloadImageAsset(docPreview.src, docPreview.filename)
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-1.5 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDocPreview(null)}
                  className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-[#FDFBFE] flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={docPreview.src}
                alt={docPreview.title}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[65vh] rounded-xl border border-[#E6D9EE] object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Seller Product Modal */}
      {editingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveEditedProduct}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#F4ECF8] pb-3">
              <div>
                <h3 className="font-display-serif text-lg font-bold text-[#1F122B]">
                  Edit Seller Product
                </h3>
                <p className="text-xs text-[#6B5B7B]">
                  Seller: {editingProduct.sellerName || 'Seller'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Product Name <span className="text-[#DB2777]">*</span>
              </label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Category
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                >
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Approval Status
                </label>
                <select
                  value={editApprovalStatus}
                  onChange={(e) =>
                    setEditApprovalStatus(e.target.value as SellerApprovalStatus)
                  }
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                >
                  <option value="pending">Pending Approval</option>
                  <option value="approved">Approved (Live)</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Selling Price
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={editSellingPrice}
                  onChange={(e) =>
                    setEditSellingPrice(sanitizeNumericInput(e.target.value))
                  }
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  MRP / Original
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editOriginalPrice}
                  onChange={(e) =>
                    setEditOriginalPrice(sanitizeNumericInput(e.target.value))
                  }
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Purchase Cost
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editPurchasePrice}
                  onChange={(e) =>
                    setEditPurchasePrice(sanitizeNumericInput(e.target.value))
                  }
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Stock Qty
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editStockQty}
                  onChange={(e) =>
                    setEditStockQty(
                      sanitizeNumericInput(e.target.value, {
                        allowDecimal: false,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Size
                </label>
                <input
                  type="text"
                  value={editSize}
                  onChange={(e) => setEditSize(e.target.value)}
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Color
                </label>
                <input
                  type="text"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3.5 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F4ECF8]">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="rounded-xl border border-[#E6D9EE] bg-white px-4 py-2 text-xs font-semibold text-[#5B4B6B] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingProduct}
                className="rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2 text-xs font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
              >
                {savingProduct ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteAppTarget)}
        title="Delete Seller Application"
        message={`Are you sure you want to delete seller application for "${deleteAppTarget?.name}"?`}
        confirmLabel="Delete Application"
        busy={deletingApp}
        onConfirm={handleConfirmDeleteApp}
        onCancel={() => setDeleteAppTarget(null)}
      />

      <ConfirmModal
        open={Boolean(deleteProdTarget)}
        title="Delete Seller Product"
        message={`Are you sure you want to delete "${deleteProdTarget?.name}"?`}
        confirmLabel="Delete Product"
        busy={deletingProd}
        onConfirm={handleConfirmDeleteProd}
        onCancel={() => setDeleteProdTarget(null)}
      />

      <ConfirmModal
        open={Boolean(deleteHighlightTarget)}
        title="Delete Highlight Request"
        message={`Are you sure you want to delete this highlight request for "${deleteHighlightTarget?.productName}"?`}
        confirmLabel="Delete Request"
        busy={deletingHighlight}
        onConfirm={handleConfirmDeleteHighlight}
        onCancel={() => setDeleteHighlightTarget(null)}
      />
    </div>
  );
};
