import React, { useEffect, useState } from 'react';
import { Calendar, Package, Rocket, X, Zap } from 'lucide-react';
import { Product } from '../types/business';
import { formatCurrency } from '../utils/calculations';
import { getOptimizedMediaUrl } from '../utils/cloudinary';
import {
  clampBoostPercentage,
  getEffectiveBoostPercentage,
  isProductBoostActive,
} from '../utils/smartDiscovery';
import { BoostPowerControl } from './BoostPowerControl';

interface ProductBoostModalProps {
  product: Product | null;
  currencySymbol: string;
  onClose: () => void;
  onSaveBoost: (
    productId: string,
    payload: {
      boosted: boolean;
      boostPercentage?: number;
      boostExpiresAt?: string;
      boostSource?: 'admin' | 'seller';
    }
  ) => Promise<void>;
}

const ADMIN_DURATION_PRESETS = [
  { label: 'No Expiry', days: 0 },
  { label: '1 Day', days: 1 },
  { label: '3 Days', days: 3 },
  { label: '7 Days', days: 7 },
  { label: '14 Days', days: 14 },
  { label: '30 Days', days: 30 },
] as const;

export const ProductBoostModal: React.FC<ProductBoostModalProps> = ({
  product,
  currencySymbol,
  onClose,
  onSaveBoost,
}) => {
  const [boostActive, setBoostActive] = useState(true);
  const [percentage, setPercentage] = useState(50);
  const [durationDays, setDurationDays] = useState<number>(0);
  const [keepExistingExpiry, setKeepExistingExpiry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!product) return;
    const active = isProductBoostActive(product);
    const effectivePct = getEffectiveBoostPercentage(product);
    setBoostActive(active || true);
    setPercentage(effectivePct > 0 ? effectivePct : 50);
    if (active && product.boostExpiresAt) {
      setKeepExistingExpiry(true);
      setDurationDays(0);
    } else {
      setKeepExistingExpiry(false);
      setDurationDays(0);
    }
    setErrorMsg('');
  }, [product]);

  if (!product) return null;

  const isCurrentlyActive = isProductBoostActive(product);
  const img =
    (Array.isArray(product.imageDataUrls) && product.imageDataUrls[0]) ||
    product.imageDataUrl ||
    '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSaving(true);
    try {
      const clampedPct = clampBoostPercentage(percentage, 50);
      let expiresAt: string | undefined;
      if (boostActive) {
        if (keepExistingExpiry && product.boostExpiresAt) {
          expiresAt = product.boostExpiresAt;
        } else if (durationDays > 0) {
          expiresAt = new Date(
            Date.now() + Math.min(365, durationDays) * 86_400_000
          ).toISOString();
        }
      }

      await onSaveBoost(product.id, {
        boosted: boostActive,
        boostPercentage: boostActive ? clampedPct : 0,
        boostExpiresAt: boostActive ? expiresAt : undefined,
        boostSource: product.boostSource || 'admin',
      });
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not update product boost.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl border border-[#EFE2F5] bg-white p-5 sm:p-6 space-y-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#F4ECF8] pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl border border-[#EFE2F5] bg-[#FDF9FC] overflow-hidden shrink-0 flex items-center justify-center">
              {img ? (
                <img
                  src={getOptimizedMediaUrl(img, 'image')}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="w-5 h-5 text-[#C084FC]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#DB2777]">
                <Rocket className="w-3.5 h-3.5" />
                <span>Product Boost Control</span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-[#1F122B] truncate">
                {product.name}
              </h3>
              <div className="text-[11px] text-[#6B5B7B] font-mono-num">
                {product.category} · {formatCurrency(product.sellingPrice, currencySymbol)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
            {errorMsg}
          </div>
        )}

        {/* Active / Inactive Switch */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#EFE2F5] bg-[#FDFBFE] p-3.5">
          <div>
            <div className="text-xs font-bold text-[#1F122B]">
              Boost Status
            </div>
            <div className="text-[11px] text-[#6B5B7B]">
              {isCurrentlyActive
                ? `Currently active at ${getEffectiveBoostPercentage(product)}%`
                : 'Currently on standard storefront rotation'}
            </div>
          </div>

          <div className="inline-flex items-center rounded-xl border border-[#E6D9EE] bg-white p-1">
            <button
              type="button"
              onClick={() => setBoostActive(true)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                boostActive
                  ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                  : 'text-[#6B5B7B]'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setBoostActive(false)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                !boostActive
                  ? 'bg-[#FFF1F2] text-[#BE123C]'
                  : 'text-[#6B5B7B]'
              }`}
            >
              Off
            </button>
          </div>
        </div>

        {/* Percentage Control (1% to 100%) */}
        <BoostPowerControl
          value={percentage}
          onChange={setPercentage}
          disabled={!boostActive || saving}
        />

        {/* Duration / Expiry */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4A3B59]">
              <Calendar className="w-3.5 h-3.5 text-[#7E22CE]" />
              <span>Boost Duration / Expiry</span>
            </label>
            {isCurrentlyActive && product.boostExpiresAt && (
              <span className="text-[11px] font-mono-num text-[#9D174D] font-semibold">
                Current till {product.boostExpiresAt.slice(0, 10)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {isCurrentlyActive && product.boostExpiresAt && (
              <button
                type="button"
                disabled={!boostActive || saving}
                onClick={() => {
                  setKeepExistingExpiry(true);
                  setDurationDays(0);
                }}
                className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer disabled:opacity-50 ${
                  keepExistingExpiry
                    ? 'border-[#DB2777] bg-[#FDF2F8] text-[#9D174D]'
                    : 'border-[#E6D9EE] bg-white text-[#5B4B6B]'
                }`}
              >
                Keep Current Expiry
              </button>
            )}
            {ADMIN_DURATION_PRESETS.map((opt) => {
              const selected = !keepExistingExpiry && durationDays === opt.days;
              return (
                <button
                  key={opt.days}
                  type="button"
                  disabled={!boostActive || saving}
                  onClick={() => {
                    setKeepExistingExpiry(false);
                    setDurationDays(opt.days);
                  }}
                  className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer disabled:opacity-50 ${
                    selected
                      ? 'border-[#7E22CE] bg-[#FAF5FF] text-[#6D28D9]'
                      : 'border-[#E6D9EE] bg-white text-[#5B4B6B]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-[#6B5B7B]">Or custom days:</span>
            <input
              type="number"
              min={0}
              max={365}
              disabled={!boostActive || saving}
              value={keepExistingExpiry ? 0 : durationDays}
              onChange={(e) => {
                setKeepExistingExpiry(false);
                const val = Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0)));
                setDurationDays(val);
              }}
              className="w-20 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-2.5 py-1 text-xs font-mono-num font-bold text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
            />
            <span className="text-[11px] text-[#6B5B7B]">(0 = No Expiry)</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F4ECF8]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#E6D9EE] px-4 py-2 text-xs font-semibold text-[#5B4B6B] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>
              {saving
                ? 'Saving...'
                : boostActive
                  ? `Save Boost (${clampBoostPercentage(percentage, 50)}%)`
                  : 'Turn Off Boost'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};
