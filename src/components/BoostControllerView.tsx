import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Flame,
  Package,
  Rocket,
  Save,
  Search,
  Sparkles,
  Store,
  Trash2,
  TrendingUp,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  BoostRequest,
  BoostRequestStatus,
  Product,
} from '../types/business';
import { formatCurrency, PRODUCT_CATEGORIES } from '../utils/calculations';
import { getOptimizedMediaUrl } from '../utils/cloudinary';
import { sanitizeNumericInput } from '../utils/numberInput';
import {
  clampBoostPercentage,
  getEffectiveBoostPercentage,
  isProductBoostActive,
  scoreProductSearchMatch,
} from '../utils/smartDiscovery';
import { BoostPowerControl } from './BoostPowerControl';
import { ConfirmModal } from './ConfirmModal';

interface BoostControllerViewProps {
  products: Product[];
  boostRequests?: BoostRequest[];
  currencySymbol: string;
  onBack: () => void;
  onUpdateProductBoost: (
    productId: string,
    payload: {
      boosted: boolean;
      boostPercentage?: number;
      boostExpiresAt?: string;
      boostSource?: 'admin' | 'seller';
    }
  ) => Promise<void>;
  onUpdateBoostRequestStatus?: (
    requestId: string,
    status: BoostRequestStatus,
    adminRemarks?: string
  ) => Promise<void>;
  onDeleteBoostRequest?: (requestId: string) => Promise<void>;
}

type BoostStatusFilter = 'all' | 'boosted' | 'admin' | 'seller' | 'unboosted';
type RequestStatusFilter = 'all' | 'pending_approval' | 'approved' | 'rejected';

const DURATION_OPTIONS = [
  { id: '0', label: 'No Expiry', days: 0 },
  { id: '1', label: '1 Day', days: 1 },
  { id: '3', label: '3 Days', days: 3 },
  { id: '7', label: '7 Days', days: 7 },
  { id: '14', label: '14 Days', days: 14 },
  { id: '30', label: '30 Days', days: 30 },
] as const;

function computeExpiryIso(days: number, baseMs = Date.now()): string | undefined {
  if (!days || days <= 0) return undefined;
  return new Date(baseMs + days * 86_400_000).toISOString();
}

function getRemainingDaysLabel(expiresAt?: string, nowMs = Date.now()): string {
  if (!expiresAt) return 'No Expiry (Always On)';
  const expMs = Date.parse(expiresAt);
  if (!Number.isFinite(expMs)) return `Until ${expiresAt.slice(0, 10)}`;
  const diffMs = expMs - nowMs;
  if (diffMs <= 0) return 'Expired';
  const daysLeft = Math.ceil(diffMs / 86_400_000);
  return `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left · Until ${expiresAt.slice(0, 10)}`;
}

export const BoostControllerView: React.FC<BoostControllerViewProps> = ({
  products,
  boostRequests = [],
  currencySymbol,
  onBack,
  onUpdateProductBoost,
  onUpdateBoostRequestStatus,
  onDeleteBoostRequest,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<BoostStatusFilter>('all');
  const [requestFilter, setRequestFilter] = useState<RequestStatusFilter>('all');
  const [draftPercentages, setDraftPercentages] = useState<Record<string, number>>({});
  const [draftDurations, setDraftDurations] = useState<Record<string, string>>({});
  const [draftCustomDays, setDraftCustomDays] = useState<Record<string, string>>({});
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});
  const [previewScreenshotUrl, setPreviewScreenshotUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BoostRequest | null>(null);
  const [deletingRequest, setDeletingRequest] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const nowMs = Date.now();

  const stats = useMemo(() => {
    const activeBoosted = products.filter((p) =>
      isProductBoostActive(p, nowMs)
    ).length;
    const sellerBoosted = products.filter(
      (p) => isProductBoostActive(p, nowMs) && p.boostSource === 'seller'
    ).length;
    const scheduledExpiry = products.filter(
      (p) => isProductBoostActive(p, nowMs) && Boolean(p.boostExpiresAt)
    ).length;
    const pendingRequests = boostRequests.filter(
      (r) => r.status === 'pending_approval'
    ).length;
    return {
      total: products.length,
      activeBoosted,
      sellerBoosted,
      scheduledExpiry,
      pendingRequests,
    };
  }, [products, boostRequests, nowMs]);

  const requestCounts = useMemo(
    () => ({
      all: boostRequests.length,
      pending_approval: boostRequests.filter(
        (r) => r.status === 'pending_approval'
      ).length,
      approved: boostRequests.filter((r) => r.status === 'approved').length,
      rejected: boostRequests.filter((r) => r.status === 'rejected').length,
    }),
    [boostRequests]
  );

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...boostRequests]
      .filter((req) => {
        if (requestFilter !== 'all' && req.status !== requestFilter) {
          return false;
        }
        if (!q) return true;
        return (
          req.productName.toLowerCase().includes(q) ||
          req.sellerName.toLowerCase().includes(q) ||
          (req.sellerCode || '').toLowerCase().includes(q) ||
          (req.sellerPhone || '').toLowerCase().includes(q) ||
          (req.transactionRef || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const rank = (s: BoostRequestStatus) =>
          s === 'pending_approval' ? 0 : s === 'approved' ? 1 : 2;
        const rDiff = rank(a.status) - rank(b.status);
        if (rDiff !== 0) return rDiff;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [boostRequests, requestFilter, searchQuery]);

  const categories = useMemo(() => {
    const set = new Set<string>(PRODUCT_CATEGORIES);
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim();
    return products
      .filter((p) => {
        if (categoryFilter !== 'ALL' && p.category !== categoryFilter) {
          return false;
        }
        const active = isProductBoostActive(p, nowMs);
        if (statusFilter === 'boosted' && !active) return false;
        if (statusFilter === 'admin' && (!active || p.boostSource === 'seller')) {
          return false;
        }
        if (statusFilter === 'seller' && (!active || p.boostSource !== 'seller')) {
          return false;
        }
        if (statusFilter === 'unboosted' && active) return false;
        if (q) {
          const match = scoreProductSearchMatch(
            {
              id: p.id,
              productNumber: p.productNumber,
              name: p.name,
              category: p.category,
              price: p.sellingPrice,
              size: p.size,
              color: p.color,
              description: p.description,
              sellerName: p.sellerName,
            },
            q
          );
          return match.matched;
        }
        return true;
      })
      .sort((a, b) => {
        const pctB = getEffectiveBoostPercentage(b, nowMs);
        const pctA = getEffectiveBoostPercentage(a, nowMs);
        if (pctB !== pctA) return pctB - pctA;
        return (b.updatedAt || b.createdAt || '').localeCompare(
          a.updatedAt || a.createdAt || ''
        );
      });
  }, [products, searchQuery, categoryFilter, statusFilter, nowMs]);

  const resolveDraftExpiry = (prod: Product): string | undefined => {
    const mode = draftDurations[prod.id];
    if (!mode || mode === 'keep') {
      return prod.boostExpiresAt;
    }
    if (mode === 'custom') {
      const days = Math.min(
        365,
        Math.max(1, Number(draftCustomDays[prod.id]) || 7)
      );
      return computeExpiryIso(days);
    }
    const days = Number(mode) || 0;
    return days > 0 ? computeExpiryIso(days) : undefined;
  };

  const handleToggleOrSaveBoost = async (
    prod: Product,
    nextBoosted: boolean
  ) => {
    setErrorMsg('');
    setBusyProductId(prod.id);
    try {
      const active = isProductBoostActive(prod, nowMs);
      const currentPct = active ? getEffectiveBoostPercentage(prod, nowMs) : 50;
      const targetPct = clampBoostPercentage(
        draftPercentages[prod.id] ?? currentPct,
        50
      );
      const expiresAt = nextBoosted ? resolveDraftExpiry(prod) : undefined;

      await onUpdateProductBoost(prod.id, {
        boosted: nextBoosted,
        boostPercentage: nextBoosted ? targetPct : 0,
        boostExpiresAt: expiresAt,
        boostSource: nextBoosted
          ? prod.boostSource === 'seller' && active
            ? 'seller'
            : 'admin'
          : undefined,
      });

      setDraftDurations((prev) => {
        const next = { ...prev };
        delete next[prod.id];
        return next;
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to update product boost.'
      );
    } finally {
      setBusyProductId(null);
    }
  };

  const handleExtendBoostDays = async (prod: Product, extraDays: number) => {
    setErrorMsg('');
    setBusyProductId(prod.id);
    try {
      const currentPct = clampBoostPercentage(
        draftPercentages[prod.id] ?? getEffectiveBoostPercentage(prod, nowMs),
        50
      );
      const existingExpMs = prod.boostExpiresAt
        ? Date.parse(prod.boostExpiresAt)
        : NaN;
      const baseMs =
        Number.isFinite(existingExpMs) && existingExpMs > nowMs
          ? existingExpMs
          : nowMs;
      const nextExpiry = computeExpiryIso(extraDays, baseMs);
      await onUpdateProductBoost(prod.id, {
        boosted: true,
        boostPercentage: currentPct,
        boostExpiresAt: nextExpiry,
        boostSource: prod.boostSource || 'admin',
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to extend boost duration.'
      );
    } finally {
      setBusyProductId(null);
    }
  };

  const handleRequestAction = async (
    req: BoostRequest,
    status: BoostRequestStatus
  ) => {
    if (!onUpdateBoostRequestStatus) return;
    setErrorMsg('');
    setBusyRequestId(req.id);
    try {
      const remark =
        remarksMap[req.id] !== undefined
          ? remarksMap[req.id]
          : req.adminRemarks || '';
      await onUpdateBoostRequestStatus(req.id, status, remark);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to update boost request.'
      );
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleConfirmDeleteRequest = async () => {
    if (!deleteTarget || !onDeleteBoostRequest) return;
    setDeletingRequest(true);
    setErrorMsg('');
    try {
      await onDeleteBoostRequest(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to delete boost request.'
      );
    } finally {
      setDeletingRequest(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-[#DB2777] shrink-0" />
              <h1 className="font-display-serif text-xl sm:text-2xl font-bold text-[#1F122B] truncate">
                Boost Controller
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[#6B5B7B]">
              Control manual 1%–100% product boost power, review seller boost payment proofs, and manage storefront promotion durations.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-[#FBCFE8] bg-gradient-to-br from-[#FFF5FA] to-white p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[#9D174D]">
              Active Boosted
            </div>
            <div className="font-mono-num text-2xl font-bold text-[#1F122B] mt-1">
              {stats.activeBoosted}
            </div>
            <div className="text-[11px] text-[#6B5B7B] mt-0.5">
              {stats.sellerBoosted} seller paid · {stats.activeBoosted - stats.sellerBoosted} admin
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#DB2777] to-[#7E22CE] text-white flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5" />
          </div>
        </div>

        <div
          className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${
            stats.pendingRequests > 0
              ? 'border-[#FDE68A] bg-gradient-to-br from-[#FFFBEB] to-white'
              : 'border-[#EFE2F5] bg-white'
          }`}
        >
          <div>
            <div className="text-xs font-semibold text-[#6B5B7B]">
              Seller Requests
            </div>
            <div
              className={`font-mono-num text-2xl font-bold mt-1 ${
                stats.pendingRequests > 0 ? 'text-[#B45309]' : 'text-[#1F122B]'
              }`}
            >
              {stats.pendingRequests}
            </div>
            <div className="text-[11px] text-[#6B5B7B] mt-0.5">
              {stats.pendingRequests > 0 ? 'Pending approval' : 'All reviewed'}
            </div>
          </div>
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              stats.pendingRequests > 0
                ? 'bg-[#FEF3C7] text-[#B45309]'
                : 'bg-[#FAF5FF] text-[#7E22CE]'
            }`}
          >
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[#6B5B7B]">
              Timed Boosts
            </div>
            <div className="font-mono-num text-2xl font-bold text-[#1F122B] mt-1">
              {stats.scheduledExpiry}
            </div>
            <div className="text-[11px] text-[#6B5B7B] mt-0.5">
              Auto-expire scheduled
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FDF2F8] text-[#DB2777] flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[#6B5B7B]">
              Total Catalog
            </div>
            <div className="font-mono-num text-2xl font-bold text-[#1F122B] mt-1">
              {stats.total}
            </div>
            <div className="text-[11px] text-[#6B5B7B] mt-0.5">
              Products listed
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FAF5FF] text-[#7E22CE] flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-2xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs sm:text-sm font-medium text-[#BE123C]">
          {errorMsg}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-5 relative">
            <Search className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products, sellers, categories, or UTR..."
              className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="lg:col-span-3">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2.5 text-xs sm:text-sm font-medium text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-4 flex flex-wrap items-center gap-1 bg-[#FAF5FF] p-1 rounded-xl border border-[#EFE2F5]">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'boosted', label: 'Boosted' },
                { id: 'admin', label: 'Admin' },
                { id: 'seller', label: 'Seller' },
                { id: 'unboosted', label: 'Standard' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`flex-1 min-w-[58px] rounded-lg py-1.5 px-2 text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-white text-[#7E22CE] shadow-xs'
                    : 'text-[#6B5B7B] hover:text-[#1F122B]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Seller Boost Payment Requests Queue */}
      <section className="rounded-2xl border border-[#EFE2F5] bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#1F122B] flex items-center gap-2">
              <Store className="w-4 h-4 text-[#DB2777]" />
              <span>Seller Paid Boost Requests ({boostRequests.length})</span>
            </h2>
            <p className="text-xs text-[#6B5B7B]">
              Verify seller online payment screenshots (baseline ₹20 for 10% · 1 day) and approve to activate timed boost automatically.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `All (${requestCounts.all})` },
                {
                  id: 'pending_approval',
                  label: `Pending (${requestCounts.pending_approval})`,
                },
                { id: 'approved', label: `Approved (${requestCounts.approved})` },
                { id: 'rejected', label: `Rejected (${requestCounts.rejected})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRequestFilter(tab.id)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                  requestFilter === tab.id
                    ? 'border-[#7E22CE] bg-[#7E22CE] text-white'
                    : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#4A3B59] hover:border-[#9333EA]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#E6D9EE] bg-[#FDFBFE] py-8 px-4 text-center space-y-1.5">
            <Rocket className="w-7 h-7 text-[#D8B4FE] mx-auto" />
            <div className="text-sm font-bold text-[#1F122B]">
              No seller boost requests matching this view
            </div>
            <p className="text-xs text-[#6B5B7B]">
              When sellers request a paid 1%–100% product boost from Seller Hub, their payment proof appears here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {filteredRequests.map((req) => {
              const isBusy = busyRequestId === req.id;
              const remarkVal =
                remarksMap[req.id] !== undefined
                  ? remarksMap[req.id]
                  : req.adminRemarks || '';

              return (
                <div
                  key={req.id}
                  className={`rounded-2xl border p-4 space-y-3 ${
                    req.status === 'pending_approval'
                      ? 'border-[#FDE68A] bg-gradient-to-br from-[#FFFDF5] to-white'
                      : 'border-[#EFE2F5] bg-[#FDFBFE]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl border border-[#EFE2F5] bg-white overflow-hidden shrink-0 flex items-center justify-center">
                        {req.productImageDataUrl ? (
                          <img
                            src={getOptimizedMediaUrl(req.productImageDataUrl, 'image')}
                            alt={req.productName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-5 h-5 text-[#9333EA]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#1F122B] truncate">
                          {req.productName}
                        </div>
                        <div className="text-xs text-[#6B5B7B]">
                          Seller: <strong>{req.sellerName}</strong>{' '}
                          {req.sellerCode ? `(${req.sellerCode})` : ''} ·{' '}
                          <span className="font-mono-num">{req.sellerPhone}</span>
                        </div>
                        <div className="text-xs font-mono-num font-bold text-[#7E22CE] mt-0.5">
                          {req.boostPercentage}% Power · {req.durationDays}{' '}
                          {req.durationDays === 1 ? 'Day' : 'Days'} ·{' '}
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
                      {onDeleteBoostRequest && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(req)}
                          title="Delete boost request"
                          className="p-1.5 rounded-lg border border-[#E6D9EE] bg-white text-[#6B5B7B] hover:text-[#BE123C] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Payment Proof */}
                  <div className="rounded-xl border border-[#EFE2F5] bg-white p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 font-mono-num">
                      <div className="text-[#5B4B6B]">
                        UPI: <strong>{req.upiIdUsed}</strong>
                      </div>
                      {req.transactionRef && (
                        <div className="text-[#1F122B]">
                          UTR / Ref:{' '}
                          <strong className="select-all">{req.transactionRef}</strong>
                        </div>
                      )}
                      {req.status === 'approved' && req.expiresAt && (
                        <div className="text-[#15803D] font-semibold">
                          {getRemainingDaysLabel(req.expiresAt, nowMs)}
                        </div>
                      )}
                    </div>

                    {req.paymentScreenshotDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewScreenshotUrl(req.paymentScreenshotDataUrl || null)
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-[#FAF5FF] px-3 py-1.5 text-xs font-semibold text-[#7E22CE] hover:border-[#9333EA] cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Screenshot</span>
                      </button>
                    )}
                  </div>

                  {/* Remarks & Approve/Reject Controls */}
                  {onUpdateBoostRequestStatus && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        type="text"
                        value={remarkVal}
                        onChange={(e) =>
                          setRemarksMap((prev) => ({
                            ...prev,
                            [req.id]: e.target.value,
                          }))
                        }
                        placeholder="Optional admin remarks..."
                        className="flex-1 rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        {req.status !== 'approved' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleRequestAction(req, 'approved')
                            }
                            className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-[#15803D] to-[#16A34A] px-3 py-2 text-xs font-bold text-white hover:opacity-95 disabled:opacity-50 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {isBusy ? 'Saving...' : 'Approve & Activate'}
                            </span>
                          </button>
                        )}
                        {req.status !== 'rejected' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleRequestAction(req, 'rejected')
                            }
                            className="inline-flex items-center gap-1 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-bold text-[#BE123C] hover:bg-[#FFE4E6] disabled:opacity-50 cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Product Boost Cards */}
      {filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-8 text-center space-y-2">
          <Sparkles className="w-8 h-8 text-[#C084FC] mx-auto" />
          <div className="text-sm font-bold text-[#1F122B]">
            No matching products found
          </div>
          <p className="text-xs text-[#6B5B7B]">
            Try clearing your search query or selecting another category or boost filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProducts.map((prod) => {
            const active = isProductBoostActive(prod, nowMs);
            const effectivePct = active
              ? getEffectiveBoostPercentage(prod, nowMs)
              : 0;
            const selectedPct =
              draftPercentages[prod.id] ?? (active ? effectivePct : 50);
            const selectedMode =
              draftDurations[prod.id] ??
              (prod.boostExpiresAt ? 'keep' : '0');
            const isBusy = busyProductId === prod.id;
            const hasPendingEdit =
              active &&
              (selectedPct !== effectivePct ||
                (draftDurations[prod.id] !== undefined &&
                  draftDurations[prod.id] !== 'keep'));
            const img =
              (Array.isArray(prod.imageDataUrls) && prod.imageDataUrls[0]) ||
              prod.imageDataUrl ||
              '';

            return (
              <div
                key={prod.id}
                className={`rounded-2xl border p-4 transition-all space-y-3 ${
                  active
                    ? 'border-[#F472B6] bg-gradient-to-r from-[#FFF5FA] via-white to-[#FAF5FF] shadow-xs'
                    : 'border-[#EFE2F5] bg-white'
                }`}
              >
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  {/* Product Info */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="w-16 h-16 rounded-xl border border-[#EFE2F5] bg-[#FDF9FC] overflow-hidden shrink-0 flex items-center justify-center">
                      {img ? (
                        <img
                          src={getOptimizedMediaUrl(img, 'image')}
                          alt={prod.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-6 h-6 text-[#C084FC]" />
                      )}
                    </div>

                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm sm:text-base font-bold text-[#1F122B] truncate max-w-full">
                          {prod.name}
                        </h2>
                        {active ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-2 py-0.5 text-[11px] font-bold text-white">
                            <Zap className="w-3 h-3" />
                            <span>Boosted · {effectivePct}%</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-lg border border-[#E6D9EE] bg-[#FAF5FF] px-2 py-0.5 text-[11px] font-semibold text-[#6B5B7B]">
                            Standard Rotation
                          </span>
                        )}
                        {active && (
                          <span
                            className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${
                              prod.boostSource === 'seller'
                                ? 'border-[#DDD6FE] bg-[#F5F3FF] text-[#6D28D9]'
                                : 'border-[#FBCFE8] bg-[#FDF2F8] text-[#9D174D]'
                            }`}
                          >
                            {prod.boostSource === 'seller'
                              ? 'Seller Paid Boost'
                              : 'Admin Boost'}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6B5B7B]">
                        <span className="font-semibold text-[#7E22CE]">
                          {prod.category}
                        </span>
                        <span className="font-mono-num font-bold text-[#1F122B]">
                          {formatCurrency(prod.sellingPrice, currencySymbol)}
                        </span>
                        {prod.productNumber && (
                          <span className="font-mono-num">
                            #{prod.productNumber}
                          </span>
                        )}
                        <span className="font-mono-num">
                          Stock: {prod.stockQty}
                        </span>
                        {prod.sellerName && (
                          <span>Seller: {prod.sellerName}</span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6B5B7B]">
                        <span className="inline-flex items-center gap-1 font-mono-num">
                          <TrendingUp className="w-3 h-3 text-[#9333EA]" />
                          Orders: {prod.orderCount || 0} · Wishlists:{' '}
                          {prod.wishlistCount || 0} · Views: {prod.viewCount || 0}
                        </span>
                        {active && (
                          <span
                            className={`font-medium ${
                              prod.boostExpiresAt
                                ? 'text-[#9D174D]'
                                : 'text-[#15803D]'
                            }`}
                          >
                            {getRemainingDaysLabel(prod.boostExpiresAt, nowMs)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Manual 1%-100% + Duration + Action Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-end gap-3 shrink-0 xl:max-w-[600px] w-full xl:w-auto">
                    <div className="flex-1 min-w-[230px]">
                      <BoostPowerControl
                        compact
                        value={selectedPct}
                        disabled={isBusy}
                        onChange={(nextPct) =>
                          setDraftPercentages((prev) => ({
                            ...prev,
                            [prod.id]: nextPct,
                          }))
                        }
                      />
                    </div>

                    <div className="flex flex-wrap items-end gap-2 shrink-0">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5B7B]">
                          Duration
                        </label>
                        <select
                          value={selectedMode}
                          disabled={isBusy}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDraftDurations((prev) => ({
                              ...prev,
                              [prod.id]: val,
                            }));
                            if (val === 'custom' && !draftCustomDays[prod.id]) {
                              setDraftCustomDays((prev) => ({
                                ...prev,
                                [prod.id]: '7',
                              }));
                            }
                          }}
                          className="rounded-xl border border-[#E6D9EE] bg-white px-2.5 py-2 text-xs font-semibold text-[#1F122B] focus:border-[#9333EA] focus:outline-none cursor-pointer"
                        >
                          {prod.boostExpiresAt && (
                            <option value="keep">
                              Keep ({prod.boostExpiresAt.slice(0, 10)})
                            </option>
                          )}
                          {DURATION_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                          <option value="custom">Custom Days</option>
                        </select>
                      </div>

                      {selectedMode === 'custom' && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5B7B]">
                            Days
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={draftCustomDays[prod.id] ?? '7'}
                            disabled={isBusy}
                            onChange={(e) =>
                              setDraftCustomDays((prev) => ({
                                ...prev,
                                [prod.id]: sanitizeNumericInput(e.target.value, {
                                  allowDecimal: false,
                                }),
                              }))
                            }
                            className="w-16 rounded-xl border border-[#E6D9EE] bg-white px-2.5 py-2 text-xs font-mono-num font-bold text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                          />
                        </div>
                      )}

                      {active ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleToggleOrSaveBoost(prod, true)
                            }
                            className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer disabled:opacity-60 ${
                              hasPendingEdit
                                ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white shadow-xs'
                                : 'border border-[#D8B4FE] bg-[#FAF5FF] text-[#7E22CE] hover:bg-[#F3E8FF]'
                            }`}
                          >
                            <Save className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {isBusy ? 'Saving...' : `Save ${selectedPct}%`}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleExtendBoostDays(prod, 7)}
                            title="Extend expiry by +7 days"
                            className="inline-flex items-center justify-center rounded-xl border border-[#E6D9EE] bg-white px-2.5 py-2 text-xs font-bold text-[#5B4B6B] hover:border-[#9333EA] hover:text-[#7E22CE] cursor-pointer disabled:opacity-60"
                          >
                            +7d
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleToggleOrSaveBoost(prod, false)
                            }
                            className="inline-flex items-center justify-center gap-1 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-bold text-[#BE123C] hover:bg-[#FFE4E6] cursor-pointer disabled:opacity-60"
                          >
                            <span>Turn Off</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleToggleOrSaveBoost(prod, true)
                          }
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-bold text-white hover:opacity-95 shadow-xs cursor-pointer disabled:opacity-60 min-w-[144px]"
                        >
                          <Rocket className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {isBusy
                              ? 'Saving...'
                              : `Boost ${selectedPct}%`}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payment Screenshot Lightbox */}
      {previewScreenshotUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F122B]/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewScreenshotUrl(null)}
        >
          <div
            className="relative max-w-2xl w-full rounded-2xl border border-[#EFE2F5] bg-white p-3 shadow-2xl space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-[#1F122B]">
                Seller Payment Screenshot Proof
              </span>
              <button
                type="button"
                onClick={() => setPreviewScreenshotUrl(null)}
                className="p-1 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FF] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-xl bg-[#FAF5FF] flex items-center justify-center">
              <img
                src={getOptimizedMediaUrl(previewScreenshotUrl, 'image')}
                alt="Seller boost payment proof"
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[72vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Seller Boost Request"
        message={
          deleteTarget
            ? `Remove boost payment record for "${deleteTarget.productName}" by ${deleteTarget.sellerName}?`
            : ''
        }
        confirmLabel="Delete Request"
        busy={deletingRequest}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDeleteRequest()}
      />
    </div>
  );
};
