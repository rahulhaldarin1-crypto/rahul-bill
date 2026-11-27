import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Flame,
  Package,
  Rocket,
  Search,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Product } from '../types/business';
import { formatCurrency, PRODUCT_CATEGORIES } from '../utils/calculations';
import { getOptimizedMediaUrl } from '../utils/cloudinary';
import {
  getEffectiveBoostLevel,
  isProductBoostActive,
  scoreProductSearchMatch,
} from '../utils/smartDiscovery';

interface BoostControllerViewProps {
  products: Product[];
  currencySymbol: string;
  onBack: () => void;
  onUpdateProductBoost: (
    productId: string,
    payload: {
      boosted: boolean;
      boostLevel?: number;
      boostExpiresAt?: string;
    }
  ) => Promise<void>;
}

type BoostStatusFilter = 'all' | 'boosted' | 'unboosted';

const DURATION_OPTIONS = [
  { id: 'permanent', label: 'No Expiry', days: 0 },
  { id: '1d', label: '24 Hours', days: 1 },
  { id: '3d', label: '3 Days', days: 3 },
  { id: '7d', label: '7 Days', days: 7 },
  { id: '14d', label: '14 Days', days: 14 },
  { id: '30d', label: '30 Days', days: 30 },
] as const;

const LEVEL_LABELS: Record<number, string> = {
  1: '1 · Gentle',
  2: '2 · Steady',
  3: '3 · Strong',
  4: '4 · Priority',
  5: '5 · Top Hero',
};

function computeExpiryIso(days: number): string | undefined {
  if (!days || days <= 0) return undefined;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export const BoostControllerView: React.FC<BoostControllerViewProps> = ({
  products,
  currencySymbol,
  onBack,
  onUpdateProductBoost,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<BoostStatusFilter>('all');
  const [draftLevels, setDraftLevels] = useState<Record<string, number>>({});
  const [draftDurations, setDraftDurations] = useState<Record<string, number>>({});
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const nowMs = Date.now();

  const stats = useMemo(() => {
    const activeBoosted = products.filter((p) =>
      isProductBoostActive(p, nowMs)
    ).length;
    const scheduledExpiry = products.filter(
      (p) => isProductBoostActive(p, nowMs) && Boolean(p.boostExpiresAt)
    ).length;
    return {
      total: products.length,
      activeBoosted,
      scheduledExpiry,
    };
  }, [products, nowMs]);

  const categories = useMemo(() => {
    const set = new Set<string>(PRODUCT_CATEGORIES);
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim();
    const list = products
      .filter((p) => {
        if (categoryFilter !== 'ALL' && p.category !== categoryFilter) {
          return false;
        }
        const active = isProductBoostActive(p, nowMs);
        if (statusFilter === 'boosted' && !active) return false;
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
        const lvlB = getEffectiveBoostLevel(b, nowMs);
        const lvlA = getEffectiveBoostLevel(a, nowMs);
        if (lvlB !== lvlA) return lvlB - lvlA;
        return (b.updatedAt || b.createdAt || '').localeCompare(
          a.updatedAt || a.createdAt || ''
        );
      });
    return list;
  }, [products, searchQuery, categoryFilter, statusFilter, nowMs]);

  const handleToggleBoost = async (prod: Product, nextBoosted: boolean) => {
    setErrorMsg('');
    setBusyProductId(prod.id);
    try {
      const level = draftLevels[prod.id] ?? getEffectiveBoostLevel(prod, nowMs) ?? 3;
      const days = draftDurations[prod.id] ?? 0;
      const expiresAt = nextBoosted
        ? days > 0
          ? computeExpiryIso(days)
          : draftDurations[prod.id] === 0
            ? undefined
            : prod.boostExpiresAt
        : undefined;

      await onUpdateProductBoost(prod.id, {
        boosted: nextBoosted,
        boostLevel: nextBoosted ? Math.min(5, Math.max(1, level || 3)) : 0,
        boostExpiresAt: expiresAt,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to update product boost.'
      );
    } finally {
      setBusyProductId(null);
    }
  };

  const handleSaveSettingsOnly = async (prod: Product, nextLevel: number, nextDays?: number) => {
    if (!isProductBoostActive(prod, nowMs)) return;
    setErrorMsg('');
    setBusyProductId(prod.id);
    try {
      const expiresAt =
        nextDays !== undefined
          ? computeExpiryIso(nextDays)
          : prod.boostExpiresAt;
      await onUpdateProductBoost(prod.id, {
        boosted: true,
        boostLevel: Math.min(5, Math.max(1, nextLevel)),
        boostExpiresAt: expiresAt,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to update boost priority.'
      );
    } finally {
      setBusyProductId(null);
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
              Promote selected products in the Customer Storefront smart feed &amp; recommendations while keeping rotation natural.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-2xl border border-[#FBCFE8] bg-gradient-to-br from-[#FFF5FA] to-white p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[#9D174D]">
              Active Boosted Products
            </div>
            <div className="font-mono-num text-2xl font-bold text-[#1F122B] mt-1">
              {stats.activeBoosted}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#DB2777] to-[#7E22CE] text-white flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[#6B5B7B]">
              Total Catalog Items
            </div>
            <div className="font-mono-num text-2xl font-bold text-[#1F122B] mt-1">
              {stats.total}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FAF5FF] text-[#7E22CE] flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[#6B5B7B]">
              Timed Boosts Active
            </div>
            <div className="font-mono-num text-2xl font-bold text-[#1F122B] mt-1">
              {stats.scheduledExpiry}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FDF2F8] text-[#DB2777] flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
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
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6 relative">
            <Search className="w-4 h-4 text-[#9333EA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by name, ID, category, or seller..."
              className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="md:col-span-3">
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

          <div className="md:col-span-3 flex items-center gap-1.5 bg-[#FAF5FF] p-1 rounded-xl border border-[#EFE2F5]">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'boosted', label: 'Boosted' },
                { id: 'unboosted', label: 'Standard' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
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

      {/* Product Boost Cards */}
      {filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-8 text-center space-y-2">
          <Sparkles className="w-8 h-8 text-[#C084FC] mx-auto" />
          <div className="text-sm font-bold text-[#1F122B]">
            No matching products found
          </div>
          <p className="text-xs text-[#6B5B7B]">
            Try clearing your search query or selecting another category filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProducts.map((prod) => {
            const active = isProductBoostActive(prod, nowMs);
            const effectiveLevel = active ? getEffectiveBoostLevel(prod, nowMs) : 3;
            const selectedLevel = draftLevels[prod.id] ?? effectiveLevel;
            const selectedDays = draftDurations[prod.id];
            const isBusy = busyProductId === prod.id;
            const img =
              (Array.isArray(prod.imageDataUrls) && prod.imageDataUrls[0]) ||
              prod.imageDataUrl ||
              '';

            return (
              <div
                key={prod.id}
                className={`rounded-2xl border p-4 transition-all ${
                  active
                    ? 'border-[#F472B6] bg-gradient-to-r from-[#FFF5FA] via-white to-[#FAF5FF] shadow-xs'
                    : 'border-[#EFE2F5] bg-white'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Product Info */}
                  <div className="flex items-start gap-3.5 min-w-0">
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

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm sm:text-base font-bold text-[#1F122B] truncate max-w-full">
                          {prod.name}
                        </h2>
                        {active ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-2 py-0.5 text-[11px] font-bold text-white">
                            <Zap className="w-3 h-3" />
                            <span>Boosted · Level {effectiveLevel}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-lg border border-[#E6D9EE] bg-[#FAF5FF] px-2 py-0.5 text-[11px] font-semibold text-[#6B5B7B]">
                            Standard Rotation
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
                        {active && prod.boostExpiresAt && (
                          <span className="text-[#9D174D] font-medium">
                            Expires: {prod.boostExpiresAt.slice(0, 10)}
                          </span>
                        )}
                        {active && !prod.boostExpiresAt && (
                          <span className="text-[#15803D] font-medium">
                            No Expiry (Always On)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Boost Controls */}
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5B7B]">
                        Boost Power
                      </label>
                      <select
                        value={selectedLevel}
                        disabled={isBusy}
                        onChange={(e) => {
                          const lvl = Number(e.target.value) || 3;
                          setDraftLevels((prev) => ({ ...prev, [prod.id]: lvl }));
                          if (active) {
                            void handleSaveSettingsOnly(prod, lvl, selectedDays);
                          }
                        }}
                        className="rounded-xl border border-[#E6D9EE] bg-white px-2.5 py-2 text-xs font-semibold text-[#1F122B] focus:border-[#9333EA] focus:outline-none cursor-pointer"
                      >
                        {[1, 2, 3, 4, 5].map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {LEVEL_LABELS[lvl]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5B7B]">
                        Duration
                      </label>
                      <select
                        value={
                          selectedDays !== undefined
                            ? String(selectedDays)
                            : prod.boostExpiresAt
                              ? 'keep'
                              : '0'
                        }
                        disabled={isBusy}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === 'keep') return;
                          const days = Number(raw) || 0;
                          setDraftDurations((prev) => ({
                            ...prev,
                            [prod.id]: days,
                          }));
                          if (active) {
                            void handleSaveSettingsOnly(prod, selectedLevel, days);
                          }
                        }}
                        className="rounded-xl border border-[#E6D9EE] bg-white px-2.5 py-2 text-xs font-semibold text-[#1F122B] focus:border-[#9333EA] focus:outline-none cursor-pointer"
                      >
                        {prod.boostExpiresAt && selectedDays === undefined && (
                          <option value="keep">
                            Until {prod.boostExpiresAt.slice(0, 10)}
                          </option>
                        )}
                        {DURATION_OPTIONS.map((opt) => (
                          <option key={opt.id} value={String(opt.days)}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-transparent select-none">
                        Action
                      </span>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleBoost(prod, !active)}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer disabled:opacity-60 min-w-[132px] ${
                          active
                            ? 'border border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C] hover:bg-[#FFE4E6]'
                            : 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white hover:opacity-95 shadow-xs'
                        }`}
                      >
                        <Rocket className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {isBusy
                            ? 'Saving...'
                            : active
                              ? 'Turn Off Boost'
                              : 'Boost Product'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
