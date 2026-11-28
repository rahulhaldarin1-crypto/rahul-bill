import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  MessageCircle,
  Package,
  Phone,
  RefreshCw,
  Search,
  Store,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  CustomerOrder,
  OrderExchangeRequest,
  OrderExchangeRequestStatus,
} from '../types/business';
import { formatCurrency } from '../utils/calculations';
import { getOptimizedMediaUrl } from '../utils/cloudinary';
import { ConfirmModal } from './ConfirmModal';

interface OrderExchangesAdminViewProps {
  requests: OrderExchangeRequest[];
  orders: CustomerOrder[];
  currencySymbol: string;
  onBack: () => void;
  onUpdateStatus: (
    requestId: string,
    status: OrderExchangeRequestStatus,
    resolutionNote?: string
  ) => Promise<void>;
  onDelete: (requestId: string) => Promise<void>;
}

type FilterTab =
  | 'all'
  | 'admin'
  | 'seller'
  | 'exchange'
  | 'help'
  | 'pending';

function toWhatsappDigits(raw: string): string {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export const OrderExchangesAdminView: React.FC<OrderExchangesAdminViewProps> = ({
  requests,
  orders,
  currencySymbol,
  onBack,
  onUpdateStatus,
  onDelete,
}) => {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrderExchangeRequest | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [error, setError] = useState('');

  const counts = useMemo(() => {
    return {
      all: requests.length,
      admin: requests.filter((r) => r.routeTarget === 'admin').length,
      seller: requests.filter((r) => r.routeTarget === 'seller').length,
      exchange: requests.filter((r) => r.type === 'exchange').length,
      help: requests.filter((r) => r.type === 'help').length,
      pending: requests.filter(
        (r) => r.status === 'pending' || r.status === 'in_review'
      ).length,
    };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests.filter((r) => {
      if (filterTab === 'admin' && r.routeTarget !== 'admin') return false;
      if (filterTab === 'seller' && r.routeTarget !== 'seller') return false;
      if (filterTab === 'exchange' && r.type !== 'exchange') return false;
      if (filterTab === 'help' && r.type !== 'help') return false;
      if (
        filterTab === 'pending' &&
        r.status !== 'pending' &&
        r.status !== 'in_review'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        r.orderNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.customerWhatsapp.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        (r.sellerName && r.sellerName.toLowerCase().includes(q)) ||
        r.reason.toLowerCase().includes(q)
      );
    });
  }, [requests, filterTab, searchQuery]);

  const handleCopy = async (key: string, text: string) => {
    const clean = String(text || '').trim();
    if (!clean) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(clean);
      }
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleStatusChange = async (
    req: OrderExchangeRequest,
    status: OrderExchangeRequestStatus
  ) => {
    setError('');
    setBusyId(req.id);
    try {
      const draft = noteDrafts[req.id];
      await onUpdateStatus(
        req.id,
        status,
        draft !== undefined ? draft : req.resolutionNote
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update request status.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const getStatusStyle = (status: OrderExchangeRequestStatus) => {
    if (status === 'approved' || status === 'resolved') {
      return 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]';
    }
    if (status === 'rejected') {
      return 'border-[#FECDD3] bg-[#FFF1F2] text-[#BE123C]';
    }
    if (status === 'in_review') {
      return 'border-[#DDD6FE] bg-[#FAF5FF] text-[#6D28D9]';
    }
    return 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
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
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B]">
              Order Exchange &amp; Help ({requests.length})
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Review 8-day exchange photos, customer WhatsApp numbers &amp; seller/store help tickets.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-1.5 text-[#B45309] font-mono-num">
            {counts.pending} Open
          </span>
          <span className="rounded-xl border border-[#D8B4FE] bg-[#FAF5FF] px-3 py-1.5 text-[#6D28D9] font-mono-num">
            {counts.exchange} Exchanges
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
          {error}
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white border border-[#EFE2F5] w-fit">
          {(
            [
              { id: 'all', label: `All (${counts.all})` },
              { id: 'pending', label: `Open (${counts.pending})` },
              { id: 'admin', label: `Admin Direct (${counts.admin})` },
              { id: 'seller', label: `Seller Routed (${counts.seller})` },
              { id: 'exchange', label: `Exchange (${counts.exchange})` },
              { id: 'help', label: `Help (${counts.help})` },
            ] as const
          ).map((tab) => {
            const active = filterTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                    : 'text-[#5B4B6B] hover:text-[#1F122B]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-[#8E7C9E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order #, WhatsApp, product..."
            className="w-full rounded-xl border border-[#E6D9EE] bg-white pl-10 pr-4 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
          />
        </div>
      </div>

      {/* Request Cards */}
      {filteredRequests.length === 0 ? (
        <div className="rounded-2xl border border-[#EFE2F5] bg-white py-16 px-6 text-center space-y-2">
          <RefreshCw className="w-8 h-8 text-[#C4B5D9] mx-auto" />
          <h3 className="text-base font-bold text-[#1F122B]">
            {requests.length === 0
              ? 'No exchange or help requests submitted yet'
              : 'No matching requests found'}
          </h3>
          <p className="text-xs text-[#6B5B7B] max-w-md mx-auto">
            Customer 8-day exchange submissions and WhatsApp help requests from My Orders will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((req) => {
            const linkedOrder = orders.find((o) => o.id === req.orderId);
            const waDigits = toWhatsappDigits(req.customerWhatsapp);
            const waHref = waDigits
              ? `https://wa.me/${waDigits}?text=${encodeURIComponent(
                  `Hello ${req.customerName}, regarding your order ${req.orderNumber} (${req.type === 'exchange' ? 'Exchange Request' : 'Help Request'}): `
                )}`
              : null;
            const thumb =
              req.selectedImageUrl ||
              linkedOrder?.selectedImageUrl ||
              linkedOrder?.imageDataUrl ||
              '';
            const noteVal =
              noteDrafts[req.id] !== undefined
                ? noteDrafts[req.id]
                : req.resolutionNote || '';
            const isBusy = busyId === req.id;
            const waCopied = copiedKey === `wa-${req.id}`;

            return (
              <div
                key={req.id}
                className="rounded-2xl border border-[#EFE2F5] bg-white p-5 space-y-4 shadow-xs"
              >
                {/* Header strip */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F4ECF8] pb-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${
                        req.type === 'exchange'
                          ? 'border-[#FBCFE8] bg-[#FDF2F8] text-[#9D174D]'
                          : 'border-[#DDD6FE] bg-[#FAF5FF] text-[#6D28D9]'
                      }`}
                    >
                      {req.type === 'exchange' ? (
                        <RefreshCw className="w-3 h-3" />
                      ) : (
                        <MessageCircle className="w-3 h-3" />
                      )}
                      <span>
                        {req.type === 'exchange' ? 'Exchange' : 'Help Request'}
                      </span>
                    </span>

                    <span className="font-mono-num font-bold text-[#6D28D9]">
                      {req.orderNumber}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                        req.routeTarget === 'seller'
                          ? 'border-[#C7D2FE] bg-[#EEF2FF] text-[#4338CA]'
                          : 'border-[#E6D9EE] bg-[#FDFBFE] text-[#4A3B59]'
                      }`}
                    >
                      <Store className="w-3 h-3" />
                      <span>
                        {req.routeTarget === 'seller'
                          ? `Seller: ${req.sellerName || req.sellerId || 'Partner'}`
                          : 'Admin Direct'}
                      </span>
                    </span>

                    <span className="text-[11px] text-[#8E7C9E] font-mono-num">
                      {req.createdAt.slice(0, 10)}
                    </span>
                  </div>

                  <span
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold capitalize ${getStatusStyle(
                      req.status
                    )}`}
                  >
                    {req.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Body Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {/* Product Info */}
                  <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-3.5 flex items-start gap-3">
                    <div className="w-14 h-14 rounded-lg border border-[#E6D9EE] bg-white overflow-hidden shrink-0 flex items-center justify-center">
                      {thumb ? (
                        <img
                          src={getOptimizedMediaUrl(thumb, 'image')}
                          alt={req.productName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-5 h-5 text-[#C084FC]" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-[#8E7C9E]">
                        Ordered Product
                      </div>
                      <div className="font-bold text-[#1F122B] leading-snug">
                        {req.productName}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#5B4B6B]">
                        {req.productSize && (
                          <span className="rounded border border-[#D8B4FE] bg-[#FAF5FF] px-1.5 py-0.5 font-mono-num font-bold text-[#6D28D9]">
                            Size: {req.productSize}
                          </span>
                        )}
                        {linkedOrder && (
                          <span className="font-mono-num font-semibold text-[#1F122B]">
                            {formatCurrency(linkedOrder.totalAmount, currencySymbol)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Customer & WhatsApp Highlight */}
                  <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-3.5 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[#8E7C9E]">
                      Customer &amp; WhatsApp
                    </div>
                    <div className="text-sm font-bold text-[#1F122B]">
                      {req.customerName}
                    </div>
                    <div className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] p-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-mono-num text-xs font-bold text-[#15803D]">
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span>{req.customerWhatsapp}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(`wa-${req.id}`, req.customerWhatsapp)
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-[#BBF7D0] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#15803D] cursor-pointer"
                        >
                          {waCopied ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        {waHref && (
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-[#16A34A] px-2 py-0.5 text-[10px] font-bold text-white hover:opacity-95"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </div>
                    </div>
                    {req.customerPhone &&
                      req.customerPhone !== req.customerWhatsapp && (
                        <div className="text-[11px] font-mono-num text-[#6B5B7B]">
                          Phone: {req.customerPhone}
                        </div>
                      )}
                  </div>

                  {/* Issue & Proof Photos */}
                  <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-3.5 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[#8E7C9E]">
                      {req.type === 'exchange' ? 'Exchange Reason & Photos' : 'Help Issue'}
                    </div>
                    <p className="text-[#1F122B] leading-relaxed whitespace-pre-wrap">
                      {req.reason}
                    </p>
                    {Array.isArray(req.photoUrls) && req.photoUrls.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {req.photoUrls.map((pUrl, idx) => (
                          <button
                            key={`${req.id}-p-${idx}`}
                            type="button"
                            onClick={() =>
                              setPreviewPhoto({
                                title: `${req.orderNumber} · Photo ${idx + 1}`,
                                url: pUrl,
                              })
                            }
                            className="w-12 h-12 rounded-lg border border-[#D8B4FE] bg-white overflow-hidden cursor-pointer hover:ring-2 hover:ring-[#9333EA]"
                            title="View full proof photo"
                          >
                            <img
                              src={getOptimizedMediaUrl(pUrl, 'image')}
                              alt={`Proof ${idx + 1}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Reply & Status Actions */}
                <div className="pt-2 border-t border-[#F4ECF8] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <input
                    type="text"
                    value={noteVal}
                    onChange={(e) =>
                      setNoteDrafts((prev) => ({ ...prev, [req.id]: e.target.value }))
                    }
                    placeholder="Add reply / resolution note shown to customer..."
                    className="flex-1 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                  />

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleStatusChange(req, 'in_review')}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#DDD6FE] bg-[#FAF5FF] px-3 py-1.5 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer disabled:opacity-55"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>In Review</span>
                    </button>
                    {req.type === 'exchange' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleStatusChange(req, 'approved')}
                        className="inline-flex items-center gap-1 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-1.5 text-xs font-semibold text-[#15803D] hover:border-[#16A34A] cursor-pointer disabled:opacity-55"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleStatusChange(req, 'resolved')}
                      className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-[#15803D] to-[#16A34A] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-55"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Resolve</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleStatusChange(req, 'rejected')}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#FECDD3] bg-white px-3 py-1.5 text-xs font-semibold text-[#BE123C] hover:bg-[#FFF1F2] cursor-pointer disabled:opacity-55"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setDeleteTarget(req)}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#E6D9EE] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#6B5B7B] hover:text-[#BE123C] hover:border-[#FECDD3] cursor-pointer"
                      title="Delete request"
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

      {/* Full-size Photo Viewer Modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[#EFE2F5] bg-white p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-[#F4ECF8] pb-2.5">
              <div className="text-sm font-bold text-[#1F122B]">
                {previewPhoto.title}
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-xl border border-[#EFE2F5] bg-[#FDFBFE] flex items-center justify-center p-2">
              <img
                src={getOptimizedMediaUrl(previewPhoto.url, 'image')}
                alt={previewPhoto.title}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[68vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Request"
        message={`Remove ${deleteTarget?.type === 'exchange' ? 'exchange' : 'help'} request for order ${deleteTarget?.orderNumber}?`}
        confirmLabel="Delete Request"
        busy={deleting}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          try {
            await onDelete(deleteTarget.id);
            setDeleteTarget(null);
          } finally {
            setDeleting(false);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
