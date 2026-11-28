import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  CustomerOrder,
  CustomerOrderStatus,
  Invoice,
  Product,
} from '../types/business';
import {
  DEFAULT_ADMIN_UPI_ID,
  downloadImageAsset,
  formatCurrency,
} from '../utils/calculations';
import { getOptimizedMediaUrl } from '../utils/cloudinary';
import { ConfirmModal } from './ConfirmModal';

interface OrdersViewProps {
  orders: CustomerOrder[];
  invoices: Invoice[];
  products?: Product[];
  currencySymbol: string;
  pendingExchangeHelpCount?: number;
  onOpenExchangeHelp?: () => void;
  onBack: () => void;
  onConfirmOrder: (orderId: string) => Promise<void>;
  onCancelOrder: (orderId: string) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
  onOpenInvoice: (invoice: Invoice) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  invoices,
  products = [],
  currencySymbol,
  pendingExchangeHelpCount = 0,
  onOpenExchangeHelp,
  onBack,
  onConfirmOrder,
  onCancelOrder,
  onDeleteOrder,
  onOpenInvoice,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | CustomerOrderStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerOrder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedFieldKey, setCopiedFieldKey] = useState<string | null>(null);
  const [previewScreenshot, setPreviewScreenshot] = useState<{
    orderNumber: string;
    customerName: string;
    dataUrl: string;
  } | null>(null);
  const [error, setError] = useState('');

  const handleCopyField = async (key: string, value: string) => {
    const clean = String(value || '').trim();
    if (!clean) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(clean);
      } else {
        const ta = document.createElement('textarea');
        ta.value = clean;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedFieldKey(key);
      window.setTimeout(() => {
        setCopiedFieldKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const counts = useMemo(() => {
    const pending = orders.filter((o) => o.status === 'Pending').length;
    const confirmed = orders.filter((o) => o.status === 'Confirmed').length;
    const cancelled = orders.filter((o) => o.status === 'Cancelled').length;
    return { all: orders.length, pending, confirmed, cancelled };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q) ||
        o.productName.toLowerCase().includes(q) ||
        (o.invoiceNumber && o.invoiceNumber.toLowerCase().includes(q))
      );
    });
  }, [orders, statusFilter, searchQuery]);

  const handleConfirm = async (orderId: string) => {
    setError('');
    setConfirmingId(orderId);
    try {
      await onConfirmOrder(orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm order.');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleCancel = async (orderId: string) => {
    setError('');
    setCancellingId(orderId);
    try {
      await onCancelOrder(orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel order.');
    } finally {
      setCancellingId(null);
    }
  };

  const resolveItemThumbnail = (
    productId?: string,
    productName?: string,
    embeddedUrl?: string
  ): string => {
    if (embeddedUrl) return embeddedUrl;
    const matched =
      (productId ? products.find((p) => p.id === productId) : undefined) ||
      (productName
        ? products.find(
            (p) =>
              p.name.trim().toLowerCase() === productName.trim().toLowerCase()
          )
        : undefined);
    if (!matched) return '';
    if (Array.isArray(matched.imageDataUrls) && matched.imageDataUrls.length > 0) {
      return matched.imageDataUrls[0] || '';
    }
    return matched.imageDataUrl || '';
  };

  const getSafeHttpHref = (raw?: string): string | null => {
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
  };

  const resolveOrderSourceUrl = (order: CustomerOrder): string | null => {
    const direct = getSafeHttpHref(order.sourceUrl);
    if (direct) return direct;

    if (Array.isArray(order.items)) {
      for (const item of order.items) {
        const itemHref = getSafeHttpHref(item.sourceUrl);
        if (itemHref) return itemHref;
        const matched =
          (item.productId
            ? products.find((p) => p.id === item.productId)
            : undefined) ||
          (item.productName
            ? products.find(
                (p) =>
                  p.name.trim().toLowerCase() ===
                  item.productName.trim().toLowerCase()
              )
            : undefined);
        const prodHref = getSafeHttpHref(matched?.sourceUrl);
        if (prodHref) return prodHref;
      }
    }

    const fallbackMatched =
      (order.productId
        ? products.find((p) => p.id === order.productId)
        : undefined) ||
      (order.productName
        ? products.find(
            (p) =>
              p.name.trim().toLowerCase() ===
              order.productName.trim().toLowerCase()
          )
        : undefined);
    return getSafeHttpHref(fallbackMatched?.sourceUrl);
  };

  const handleDownloadProductImage = async (
    src: string,
    orderNum: string,
    prodName: string
  ) => {
    setError('');
    try {
      await downloadImageAsset(src, `${orderNum}_${prodName}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to download product image.'
      );
    }
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
              Customer Orders ({orders.length})
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Review incoming COD &amp; UPI orders, inspect screenshots, and confirm to auto-generate bills.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-semibold">
          {onOpenExchangeHelp && (
            <button
              type="button"
              onClick={onOpenExchangeHelp}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-[#FAF5FF] px-3 py-1.5 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#DB2777]" />
              <span>Order Exchange &amp; Help</span>
              {pendingExchangeHelpCount > 0 && (
                <span className="rounded-md bg-[#DB2777] px-1.5 py-0.5 text-[10px] font-bold text-white font-mono-num leading-none">
                  {pendingExchangeHelpCount}
                </span>
              )}
            </button>
          )}
          <span className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-1.5 text-[#B45309] font-mono-num">
            {counts.pending} Pending
          </span>
          <span className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-1.5 text-[#15803D] font-mono-num">
            {counts.confirmed} Confirmed
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-4 py-3 text-xs font-medium text-[#BE123C]">
          {error}
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white border border-[#EFE2F5] w-fit">
          {(
            [
              { id: 'ALL', label: `All (${counts.all})` },
              { id: 'Pending', label: `Pending (${counts.pending})` },
              { id: 'Confirmed', label: `Confirmed (${counts.confirmed})` },
              { id: 'Cancelled', label: `Cancelled (${counts.cancelled})` },
            ] as const
          ).map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
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

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#8E7C9E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order #, phone, customer, product..."
            className="w-full rounded-xl border border-[#E6D9EE] bg-white pl-10 pr-4 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
          />
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="rounded-2xl border border-[#EFE2F5] bg-white py-16 px-6 text-center space-y-2">
          <ShoppingBag className="w-8 h-8 text-[#C4B5D9] mx-auto" />
          <h3 className="text-base font-bold text-[#1F122B]">
            {orders.length === 0
              ? 'No customer orders placed yet'
              : 'No matching orders found'}
          </h3>
          <p className="text-xs text-[#6B5B7B] max-w-md mx-auto">
            When customers browse your Shopping grid in View Panel and place an order, their details and UPI payment screenshots will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const linkedInvoice = order.invoiceId
              ? invoices.find((inv) => inv.id === order.invoiceId)
              : undefined;
            const isPending = order.status === 'Pending';
            const isConfirmed = order.status === 'Confirmed';
            const isCancelled = order.status === 'Cancelled';
            const resellHref = resolveOrderSourceUrl(order);

            const addressLine = [
              order.customerAddress,
              order.customerCity,
              order.customerState,
              order.customerPinCode,
            ]
              .filter(Boolean)
              .join(', ');

            return (
              <div
                key={order.id}
                className="rounded-2xl border border-[#EFE2F5] bg-white p-5 space-y-4 shadow-xs"
              >
                {/* Top Summary Line */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F4ECF8] pb-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono-num text-sm font-bold text-[#6D28D9]">
                      {order.orderNumber}
                    </span>
                    <span className="text-xs text-[#8E7C9E] font-mono-num">
                      Ordered: {order.orderDate || (order.createdAt ? order.createdAt.slice(0, 10) : '')}
                    </span>
                    {order.estimatedDeliveryDate && (
                      <span className="text-xs text-[#5B4B6B] font-mono-num">
                        · Est. Delivery: {order.estimatedDeliveryDate}
                      </span>
                    )}
                    <span
                      className={`text-xs font-bold ${
                        isConfirmed
                          ? 'text-[#15803D]'
                          : isCancelled
                            ? 'text-[#BE123C]'
                            : 'text-[#B45309]'
                      }`}
                    >
                      · {order.status}
                    </span>
                    {order.invoiceNumber && (
                      <span className="font-mono-num text-xs font-bold text-[#7E22CE]">
                        · Bill {order.invoiceNumber}
                      </span>
                    )}
                  </div>

                  <div className="font-mono-num text-base font-bold text-[#1F122B]">
                    {formatCurrency(order.totalAmount, currencySymbol)}
                  </div>
                </div>

                {/* Middle Grid: Customer + Product + Payment */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {/* Customer Details */}
                  <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-3.5 space-y-1.5">
                    <div className="font-bold text-[#4A3B59] uppercase tracking-wide text-[10px]">
                      Customer Account
                    </div>
                    <div className="text-sm font-bold text-[#1F122B]">
                      {order.customerName}
                    </div>
                    <div className="flex items-center gap-1.5 text-[#5B4B6B] font-mono-num">
                      <Phone className="w-3.5 h-3.5 text-[#7E22CE] shrink-0" />
                      <span>{order.customerPhone}</span>
                    </div>
                    {isPending ? (
                      <div className="space-y-1.5 pt-1 border-t border-[#F4ECF8]">
                        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#6D28D9]">
                          <MapPin className="w-3 h-3 text-[#DB2777]" />
                          <span>Delivery Address Parts</span>
                        </div>
                        {(
                          [
                            {
                              key: 'village',
                              label: 'Village / Area',
                              value: order.customerAddress || '',
                            },
                            {
                              key: 'city',
                              label: 'City',
                              value: order.customerCity || '',
                            },
                            {
                              key: 'state',
                              label: 'State',
                              value: order.customerState || '',
                            },
                            {
                              key: 'pin',
                              label: 'PIN Code',
                              value: order.customerPinCode || '',
                            },
                          ] as const
                        )
                          .filter((part) => Boolean(part.value.trim()))
                          .map((part) => {
                            const fieldKey = `${order.id}-${part.key}`;
                            const copied = copiedFieldKey === fieldKey;
                            return (
                              <div
                                key={fieldKey}
                                className="flex items-start justify-between gap-2 rounded-lg border border-[#EFE2F5] bg-white px-2.5 py-1.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-[10px] font-semibold text-[#8E7C9E] uppercase">
                                    {part.label}
                                  </div>
                                  <div
                                    className={`text-[11px] font-semibold text-[#1F122B] break-words ${
                                      part.key === 'pin' ? 'font-mono-num' : ''
                                    }`}
                                  >
                                    {part.value}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void handleCopyField(fieldKey, part.value)}
                                  className="inline-flex items-center gap-1 rounded-md border border-[#E6D9EE] bg-[#FDFBFE] px-2 py-1 text-[10px] font-semibold text-[#6D28D9] hover:border-[#9333EA] shrink-0 cursor-pointer"
                                  title={`Copy ${part.label}`}
                                >
                                  {copied ? (
                                    <>
                                      <Check className="w-3 h-3 text-[#15803D]" />
                                      <span className="text-[#15803D]">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="flex items-start gap-1.5 text-[#5B4B6B]">
                        <MapPin className="w-3.5 h-3.5 text-[#DB2777] shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{addressLine}</span>
                      </div>
                    )}
                    {order.customerNote && (
                      <div className="text-[#6B5B7B] pt-1 border-t border-[#F4ECF8]">
                        Note: {order.customerNote}
                      </div>
                    )}
                  </div>

                  {/* Product Details (Multi-item Cart or Single Item) with Thumbnail & Download */}
                  <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-3.5 space-y-2.5">
                    <div className="font-bold text-[#4A3B59] uppercase tracking-wide text-[10px]">
                      {order.items && order.items.length > 1
                        ? `Ordered Items (${order.items.length})`
                        : 'Ordered Item'}
                    </div>
                    {order.items && order.items.length > 0 ? (
                      <div className="space-y-2.5">
                        {order.items.map((it) => {
                          const thumb = resolveItemThumbnail(
                            it.productId,
                            it.productName,
                            it.selectedImageUrl ||
                              it.imageDataUrl ||
                              (order.items && order.items.length === 1
                                ? order.selectedImageUrl || order.imageDataUrl
                                : undefined)
                          );
                          const exactSize =
                            it.productSize ||
                            (order.items && order.items.length === 1
                              ? order.productSize
                              : '');
                          return (
                            <div
                              key={it.id}
                              className="border-b last:border-b-0 border-[#F4ECF8] pb-2 last:pb-0 flex items-start gap-2.5"
                            >
                              <div className="flex flex-col items-center gap-1 shrink-0">
                                <div className="w-14 h-14 rounded-lg border border-[#E6D9EE] bg-white overflow-hidden flex items-center justify-center">
                                  {thumb ? (
                                    <img
                                      src={getOptimizedMediaUrl(thumb, 'image')}
                                      alt={it.productName}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <ShoppingBag className="w-5 h-5 text-[#C084FC]" />
                                  )}
                                </div>
                                {thumb && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDownloadProductImage(
                                        thumb,
                                        order.orderNumber,
                                        it.productName
                                      )
                                    }
                                    className="inline-flex items-center gap-1 rounded-md border border-[#D8B4FE] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#6D28D9] hover:bg-[#FAF5FF] cursor-pointer whitespace-nowrap"
                                    title="Download product image"
                                  >
                                    <Download className="w-2.5 h-2.5" />
                                    <span>Download Image</span>
                                  </button>
                                )}
                              </div>

                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="font-bold text-[#1F122B] leading-snug">
                                  {it.productName}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#6B5B7B]">
                                  {it.productCategory && <span>{it.productCategory}</span>}
                                  {exactSize && (
                                    <span className="rounded border border-[#D8B4FE] bg-[#FAF5FF] px-1.5 py-0.5 font-mono-num font-bold text-[#6D28D9]">
                                      Size: {exactSize}
                                    </span>
                                  )}
                                  {it.productColor && <span>Color: {it.productColor}</span>}
                                  {!it.productCategory && !exactSize && !it.productColor && (
                                    <span>Standard</span>
                                  )}
                                </div>
                                <div className="font-mono-num text-[11px] font-semibold text-[#1F122B]">
                                  {it.quantity} × {formatCurrency(it.unitPrice, currencySymbol)} ={' '}
                                  <span className="text-[#7E22CE]">
                                    {formatCurrency(it.lineTotal, currencySymbol)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      (() => {
                        const thumb = resolveItemThumbnail(
                          order.productId,
                          order.productName,
                          order.selectedImageUrl || order.imageDataUrl
                        );
                        return (
                          <div className="flex items-start gap-2.5">
                            <div className="flex flex-col items-center gap-1 shrink-0">
                              <div className="w-14 h-14 rounded-lg border border-[#E6D9EE] bg-white overflow-hidden flex items-center justify-center">
                                {thumb ? (
                                  <img
                                    src={getOptimizedMediaUrl(thumb, 'image')}
                                    alt={order.productName}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <ShoppingBag className="w-5 h-5 text-[#C084FC]" />
                                )}
                              </div>
                              {thumb && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDownloadProductImage(
                                      thumb,
                                      order.orderNumber,
                                      order.productName
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border border-[#D8B4FE] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#6D28D9] hover:bg-[#FAF5FF] cursor-pointer whitespace-nowrap"
                                  title="Download product image"
                                >
                                  <Download className="w-2.5 h-2.5" />
                                  <span>Download Image</span>
                                </button>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="text-sm font-bold text-[#1F122B]">
                                {order.productName}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[#6B5B7B]">
                                {order.productCategory && <span>{order.productCategory}</span>}
                                {order.productSize && (
                                  <span className="rounded border border-[#D8B4FE] bg-[#FAF5FF] px-1.5 py-0.5 font-mono-num font-bold text-[#6D28D9]">
                                    Size: {order.productSize}
                                  </span>
                                )}
                                {order.productColor && <span>Color: {order.productColor}</span>}
                                {!order.productCategory && !order.productSize && !order.productColor && (
                                  <span>Standard Variant</span>
                                )}
                              </div>
                              <div className="font-mono-num text-[#1F122B] pt-0.5">
                                Qty: <strong>{order.quantity}</strong> ×{' '}
                                {formatCurrency(order.unitPrice, currencySymbol)} ={' '}
                                <strong className="text-[#7E22CE]">
                                  {formatCurrency(
                                    order.subtotal ?? order.totalAmount,
                                    currencySymbol
                                  )}
                                </strong>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>

                  {/* Payment & Screenshot */}
                  <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-3.5 space-y-2">
                    <div className="font-bold text-[#4A3B59] uppercase tracking-wide text-[10px]">
                      Payment Details
                    </div>
                    <div className="flex items-center gap-1.5 font-bold text-[#1F122B]">
                      <CreditCard className="w-3.5 h-3.5 text-[#7E22CE] shrink-0" />
                      <span>
                        {order.paymentMethod === 'UPI'
                          ? 'Online Payment (UPI)'
                          : 'Cash on Delivery (COD)'}
                      </span>
                    </div>
                    {order.deliveryCharge !== undefined && order.deliveryCharge > 0 && (
                      <div className="rounded-lg border border-[#EFE2F5] bg-white px-2.5 py-1.5 space-y-0.5 text-[11px] font-mono-num">
                        <div className="flex justify-between text-[#5B4B6B]">
                          <span>Items Subtotal:</span>
                          <span>
                            {formatCurrency(
                              order.subtotal ??
                                Math.max(0, order.totalAmount - order.deliveryCharge),
                              currencySymbol
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between text-[#B45309] font-semibold">
                          <span>COD Delivery Fee:</span>
                          <span>
                            + {formatCurrency(order.deliveryCharge, currencySymbol)}
                          </span>
                        </div>
                        <div className="flex justify-between font-bold text-[#1F122B] border-t border-[#F4ECF8] pt-0.5">
                          <span>Total Payable:</span>
                          <span>{formatCurrency(order.totalAmount, currencySymbol)}</span>
                        </div>
                      </div>
                    )}
                    {order.paymentMethod === 'UPI' && (
                      <div className="space-y-0.5 text-[#5B4B6B] font-mono-num">
                        <div>UPI: {order.upiIdUsed || DEFAULT_ADMIN_UPI_ID}</div>
                        {order.paymentRecipientName && (
                          <div className="text-[11px] font-sans text-[#6D28D9] font-semibold">
                            Paid To: {order.paymentRecipientName}
                          </div>
                        )}
                      </div>
                    )}
                    {order.paymentScreenshotDataUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewScreenshot({
                            orderNumber: order.orderNumber,
                            customerName: order.customerName,
                            dataUrl: order.paymentScreenshotDataUrl!,
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-[#E6D9EE] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
                      >
                        <img
                          src={getOptimizedMediaUrl(order.paymentScreenshotDataUrl, 'image')}
                          alt="Payment screenshot"
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded object-cover border border-[#E6D9EE]"
                        />
                        <span>View Payment Screenshot</span>
                      </button>
                    ) : (
                      order.paymentMethod === 'UPI' && (
                        <div className="text-[11px] text-[#B45309] flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>No screenshot uploaded</span>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Action Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F4ECF8]">
                  <div className="text-[11px] text-[#6B5B7B]">
                    {isConfirmed
                      ? `Confirmed & auto-billed (${order.invoiceNumber || 'Invoice Ready'})`
                      : isCancelled
                        ? 'Order cancelled'
                        : 'Confirming marks this order Confirmed and automatically generates a customer bill.'}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isPending && (
                      <>
                        <button
                          type="button"
                          disabled={confirmingId === order.id}
                          onClick={() => handleConfirm(order.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#15803D] to-[#16A34A] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {confirmingId === order.id
                              ? 'Confirming...'
                              : 'Confirm Order & Generate Bill'}
                          </span>
                        </button>
                        {resellHref && (
                          <a
                            href={resellHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
                            title="Open original supplier product page to place resell order"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Resell</span>
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={cancellingId === order.id}
                          onClick={() => handleCancel(order.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#FECDD3] bg-white px-3 py-2 text-xs font-semibold text-[#BE123C] hover:bg-[#FFF1F2] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      </>
                    )}

                    {!isPending && resellHref && (
                      <a
                        href={resellHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8B4FE] bg-[#FAF5FF] px-3.5 py-2 text-xs font-semibold text-[#7E22CE] hover:bg-[#F3E8FF] whitespace-nowrap shrink-0 cursor-pointer"
                        title="Open original supplier product page"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Resell</span>
                      </a>
                    )}

                    {linkedInvoice && (
                      <button
                        type="button"
                        onClick={() => onOpenInvoice(linkedInvoice)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>View Bill ({linkedInvoice.invoiceNumber})</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(order)}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-semibold text-[#6B5B7B] hover:text-[#BE123C] hover:border-[#FECDD3] whitespace-nowrap shrink-0 cursor-pointer"
                      title="Delete order"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-size UPI Screenshot Viewer Modal */}
      {previewScreenshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[#EFE2F5] bg-white p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-[#F4ECF8] pb-2.5">
              <div>
                <div className="text-sm font-bold text-[#1F122B]">
                  Payment Screenshot · {previewScreenshot.orderNumber}
                </div>
                <div className="text-xs text-[#6B5B7B]">
                  {previewScreenshot.customerName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewScreenshot(null)}
                className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-xl border border-[#EFE2F5] bg-[#FDFBFE] flex items-center justify-center p-2">
              <img
                src={getOptimizedMediaUrl(previewScreenshot.dataUrl, 'image')}
                alt="Customer UPI payment proof"
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[68vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Order"
        message={`Are you sure you want to delete order ${deleteTarget?.orderNumber}? Any invoice already generated will remain in Client Bills.`}
        confirmLabel="Delete Order"
        busy={deleting}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          try {
            await onDeleteOrder(deleteTarget.id);
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
