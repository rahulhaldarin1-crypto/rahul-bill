import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Image as ImageIcon,
  Mail,
  Phone,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Truck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { DeliverySubscription, SubscriptionStatus } from '../types/business';
import {
  formatCurrency,
  getSubscriptionRemainingDays,
  resolveSubscriptionEffectiveStatus,
  resolveSubscriptionExpiresAtMs,
  SUBSCRIPTION_DURATION_DAYS,
  SUBSCRIPTION_PLAN_PRICE,
} from '../utils/calculations';
import { getOptimizedMediaUrl } from '../utils/cloudinary';
import { ConfirmModal } from './ConfirmModal';

interface SubscriptionsAdminViewProps {
  subscriptions: DeliverySubscription[];
  currencySymbol: string;
  onBack: () => void;
  onUpdateStatus: (
    subscriptionId: string,
    action: 'approve' | 'reject' | 'cancel' | 'extend',
    adminRemarks?: string
  ) => Promise<void>;
  onDelete: (subscriptionId: string) => Promise<void>;
}

export const SubscriptionsAdminView: React.FC<SubscriptionsAdminViewProps> = ({
  subscriptions,
  currencySymbol,
  onBack,
  onUpdateStatus,
  onDelete,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | SubscriptionStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeliverySubscription | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const [previewProof, setPreviewProof] = useState<{
    userName: string;
    url: string;
    txId?: string;
  } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const enriched = useMemo(
    () =>
      subscriptions.map((sub) => {
        const effectiveStatus =
          resolveSubscriptionEffectiveStatus(sub, nowMs) || sub.status;
        const remainingDays = getSubscriptionRemainingDays(sub, nowMs);
        const expiresAtMs = resolveSubscriptionExpiresAtMs(sub);
        return {
          sub,
          effectiveStatus,
          remainingDays,
          expiresAtMs,
        };
      }),
    [subscriptions, nowMs]
  );

  const stats = useMemo(() => {
    let pending = 0;
    let active = 0;
    let expired = 0;
    let rejected = 0;
    let revenue = 0;
    for (const item of enriched) {
      if (item.effectiveStatus === 'pending') pending += 1;
      else if (item.effectiveStatus === 'active') active += 1;
      else if (item.effectiveStatus === 'expired') expired += 1;
      else if (item.effectiveStatus === 'rejected') rejected += 1;

      if (item.sub.approvedAt) {
        revenue += Number(item.sub.planPrice) || SUBSCRIPTION_PLAN_PRICE;
      }
    }
    return {
      all: enriched.length,
      pending,
      active,
      expired,
      rejected,
      revenue,
    };
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enriched.filter(({ sub, effectiveStatus }) => {
      if (statusFilter !== 'ALL' && effectiveStatus !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        String(sub.userName || '').toLowerCase().includes(q) ||
        String(sub.userPhone || '').toLowerCase().includes(q) ||
        String(sub.userEmail || '').toLowerCase().includes(q) ||
        String(sub.paymentDetails?.transactionId || '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [enriched, statusFilter, searchQuery]);

  const handleAction = async (
    subscriptionId: string,
    action: 'approve' | 'reject' | 'cancel' | 'extend'
  ) => {
    setError('');
    setBusyId(subscriptionId);
    try {
      await onUpdateStatus(subscriptionId, action);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update subscription status.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete subscription.'
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
      {/* Header */}
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
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B]">
              ₹{SUBSCRIPTION_PLAN_PRICE} Free Delivery Subscriptions
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Verify online payment screenshots &amp; manage {SUBSCRIPTION_DURATION_DAYS}-day Free Delivery Passes.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
          {error}
        </div>
      )}

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
          <div className="text-xs font-semibold text-[#92400E]">
            Pending Verification
          </div>
          <div className="font-mono-num text-2xl font-bold text-[#B45309] mt-1">
            {stats.pending}
          </div>
        </div>
        <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-4">
          <div className="text-xs font-semibold text-[#166534]">
            Active Subscribers
          </div>
          <div className="font-mono-num text-2xl font-bold text-[#15803D] mt-1">
            {stats.active}
          </div>
        </div>
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4">
          <div className="text-xs font-semibold text-[#6B5B7B]">
            Expired / Rejected
          </div>
          <div className="font-mono-num text-2xl font-bold text-[#4A3B59] mt-1">
            {stats.expired + stats.rejected}
          </div>
        </div>
        <div className="rounded-2xl border border-[#E9D5FF] bg-[#FAF5FF] p-4">
          <div className="text-xs font-semibold text-[#6D28D9]">
            Subscription Revenue
          </div>
          <div className="font-mono-num text-2xl font-bold text-[#7E22CE] mt-1">
            {formatCurrency(stats.revenue, currencySymbol)}
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="rounded-2xl border border-[#EFE2F5] bg-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: `All (${stats.all})` },
              { id: 'pending', label: `Pending (${stats.pending})` },
              { id: 'active', label: `Active (${stats.active})` },
              { id: 'expired', label: `Expired (${stats.expired})` },
              { id: 'rejected', label: `Rejected (${stats.rejected})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border cursor-pointer transition-colors ${
                statusFilter === tab.id
                  ? 'border-[#7E22CE] bg-[#7E22CE] text-white'
                  : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#5B4B6B] hover:border-[#9333EA]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[#8E7C9E] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, phone, email, UTR..."
            className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-9 pr-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Subscription Cards List */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-[#EFE2F5] bg-white p-12 text-center space-y-2">
          <Truck className="w-10 h-10 text-[#C084FC] mx-auto" />
          <div className="text-sm font-bold text-[#1F122B]">
            No subscription requests found
          </div>
          <p className="text-xs text-[#6B5B7B]">
            Customer ₹{SUBSCRIPTION_PLAN_PRICE} Free Delivery Pass purchases will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(({ sub, effectiveStatus, remainingDays, expiresAtMs }) => {
            const isBusy = busyId === sub.id;
            const proofUrl = sub.paymentDetails?.paymentScreenshotUrl || '';
            const txId = sub.paymentDetails?.transactionId || '';

            const statusBadge =
              effectiveStatus === 'active'
                ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]'
                : effectiveStatus === 'pending'
                  ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]'
                  : effectiveStatus === 'rejected'
                    ? 'border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C]'
                    : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]';

            return (
              <div
                key={sub.id}
                className="rounded-2xl border border-[#EFE2F5] bg-white p-4 sm:p-5 space-y-4 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#1F122B]">
                        <User className="w-3.5 h-3.5 text-[#7E22CE]" />
                        <span>{sub.userName}</span>
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadge}`}
                      >
                        {effectiveStatus}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5B4B6B]">
                      <span className="inline-flex items-center gap-1 font-mono-num">
                        <Phone className="w-3 h-3 text-[#DB2777]" />
                        {sub.userPhone}
                      </span>
                      {sub.userEmail && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3 text-[#7E22CE]" />
                          {sub.userEmail}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono-num text-base font-bold text-[#7E22CE]">
                      {formatCurrency(
                        sub.planPrice || SUBSCRIPTION_PLAN_PRICE,
                        currencySymbol
                      )}
                    </div>
                    <div className="text-[10px] font-semibold text-[#6B5B7B]">
                      {sub.durationDays || SUBSCRIPTION_DURATION_DAYS} Days · Online
                    </div>
                  </div>
                </div>

                {/* Countdown & Dates */}
                <div className="rounded-xl border border-[#F4ECF8] bg-[#FDF9FC] p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="text-[#5B4B6B] flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#7E22CE]" />
                      <span>
                        Requested:{' '}
                        <strong className="font-mono-num text-[#1F122B]">
                          {sub.createdAt.slice(0, 10)}
                        </strong>
                      </span>
                    </div>
                    {expiresAtMs && (
                      <div className="text-[#5B4B6B] flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#DB2777]" />
                        <span>
                          Expires:{' '}
                          <strong className="font-mono-num text-[#1F122B]">
                            {new Date(expiresAtMs).toISOString().slice(0, 10)}
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {effectiveStatus === 'active' && (
                    <div className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 py-1 text-xs font-bold text-[#15803D] font-mono-num">
                      {remainingDays} দিন বাকি ({remainingDays}d left)
                    </div>
                  )}
                </div>

                {/* Payment Proof & Transaction ID */}
                <div className="flex items-center gap-3 rounded-xl border border-[#EFE2F5] bg-[#FDFBFE] p-3">
                  {proofUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewProof({
                          userName: sub.userName,
                          url: proofUrl,
                          txId,
                        })
                      }
                      className="w-16 h-16 max-w-full rounded-xl border border-[#D8B4FE] overflow-hidden shrink-0 cursor-pointer hover:opacity-90 relative group"
                      title="Click to zoom payment screenshot"
                    >
                      <img
                        src={getOptimizedMediaUrl(proofUrl, 'image')}
                        alt={`${sub.userName} payment proof`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full max-w-full object-cover block"
                      />
                    </button>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border border-dashed border-[#D8B4FE] flex items-center justify-center shrink-0 text-[#C084FC]">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1 text-xs">
                    <div className="font-bold text-[#1F122B] flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-[#7E22CE]" />
                      <span>Online Payment Proof</span>
                    </div>
                    {txId ? (
                      <div className="font-mono-num text-[11px] text-[#4A3B59] truncate">
                        UTR / Ref: <strong>{txId}</strong>
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#6B5B7B]">
                        No UTR entered — verify screenshot
                      </div>
                    )}
                    {proofUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewProof({
                            userName: sub.userName,
                            url: proofUrl,
                            txId,
                          })
                        }
                        className="text-[11px] font-bold text-[#7E22CE] hover:underline cursor-pointer"
                      >
                        View Full Screenshot
                      </button>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#F4ECF8]">
                  <div className="flex flex-wrap items-center gap-2">
                    {effectiveStatus === 'pending' && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAction(sub.id, 'approve')}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#15803D] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#166534] cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {isBusy ? 'Updating...' : 'Approve (Start 28 Days)'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAction(sub.id, 'reject')}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-bold text-[#BE123C] hover:bg-[#FFE4E6] cursor-pointer disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </>
                    )}

                    {effectiveStatus === 'active' && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAction(sub.id, 'extend')}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#7E22CE] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#6D28D9] cursor-pointer disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Extend (+28 Days)</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAction(sub.id, 'cancel')}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs font-bold text-[#B45309] hover:bg-[#FEF3C7] cursor-pointer disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancel Pass</span>
                        </button>
                      </>
                    )}

                    {(effectiveStatus === 'expired' ||
                      effectiveStatus === 'rejected') && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleAction(sub.id, 'extend')}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3.5 py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Activate / Extend (+28 Days)</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setDeleteTarget(sub)}
                    title="Delete subscription record"
                    className="inline-flex items-center gap-1 rounded-xl border border-[#E6D9EE] bg-white px-2.5 py-2 text-xs font-semibold text-[#6B5B7B] hover:border-[#FECDD3] hover:text-[#BE123C] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payment Screenshot Lightbox Modal */}
      {previewProof && (
        <div
          className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewProof(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white border border-[#EFE2F5] overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-[#F4ECF8] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#1F122B] truncate">
                  Payment Proof · {previewProof.userName}
                </div>
                {previewProof.txId && (
                  <div className="text-[11px] font-mono-num text-[#6D28D9]">
                    UTR: {previewProof.txId}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewProof(null)}
                className="p-1.5 rounded-full text-[#6B5B7B] hover:bg-[#FAF5FF] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-[#0F0A14] flex items-center justify-center max-h-[75vh]">
              <img
                src={getOptimizedMediaUrl(previewProof.url, 'image')}
                alt={`Payment proof for ${previewProof.userName}`}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Subscription Record"
        message={
          deleteTarget
            ? `Delete the ₹${deleteTarget.planPrice} subscription record for "${deleteTarget.userName}"?`
            : ''
        }
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
};
