import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Pencil, Search, Truck, X } from 'lucide-react';
import { DeliveryStatus, Invoice } from '../types/business';

interface DeliveryTrackingViewProps {
  invoices: Invoice[];
  onBack: () => void;
  onUpdateDelivery: (
    invoiceId: string,
    payload: {
      courierName: string;
      trackingNumber: string;
      deliveryStatus: DeliveryStatus;
    }
  ) => Promise<void>;
}

const STATUSES: DeliveryStatus[] = [
  'Pending',
  'Processing',
  'Shipped',
  'Delivered',
  'Returned',
];

function getStatusColor(status: DeliveryStatus): string {
  switch (status) {
    case 'Delivered':
      return 'text-[#15803D] bg-[#F0FDF4] border-[#BBF7D0]';
    case 'Shipped':
      return 'text-[#6D28D9] bg-[#F5F3FF] border-[#DDD6FE]';
    case 'Processing':
      return 'text-[#B45309] bg-[#FFFBEB] border-[#FDE68A]';
    case 'Returned':
      return 'text-[#BE123C] bg-[#FFF1F2] border-[#FECDD3]';
    default:
      return 'text-[#4A3B59] bg-[#FDF8FC] border-[#E6D9EE]';
  }
}

export const DeliveryTrackingView: React.FC<DeliveryTrackingViewProps> = ({
  invoices,
  onBack,
  onUpdateDelivery,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | DeliveryStatus>('ALL');
  const [editingOrder, setEditingOrder] = useState<Invoice | null>(null);
  const [courierName, setCourierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>('Pending');
  const [saving, setSaving] = useState(false);

  const counts = useMemo(() => {
    const map: Record<DeliveryStatus, number> = {
      Pending: 0,
      Processing: 0,
      Shipped: 0,
      Delivered: 0,
      Returned: 0,
    };
    for (const inv of invoices) {
      map[inv.deliveryStatus] = (map[inv.deliveryStatus] || 0) + 1;
    }
    return map;
  }, [invoices]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== 'ALL' && inv.deliveryStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.courierName.toLowerCase().includes(q) ||
        inv.trackingNumber.toLowerCase().includes(q)
      );
    });
  }, [invoices, searchQuery, statusFilter]);

  const openEdit = (inv: Invoice) => {
    setEditingOrder(inv);
    setCourierName(inv.courierName || '');
    setTrackingNumber(inv.trackingNumber || '');
    setDeliveryStatus(inv.deliveryStatus || 'Pending');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    setSaving(true);
    try {
      await onUpdateDelivery(editingOrder.id, {
        courierName: courierName.trim(),
        trackingNumber: trackingNumber.trim(),
        deliveryStatus,
      });
      setEditingOrder(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
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
              Delivery Tracking
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Update courier names, AWB tracking numbers, and delivery statuses across all orders.
            </p>
          </div>
        </div>
      </div>

      {/* Status Filter Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
            statusFilter === 'ALL'
              ? 'border-[#7E22CE] bg-[#F5F3FF]'
              : 'border-[#EFE2F5] bg-white'
          }`}
        >
          <div className="text-[11px] font-semibold text-[#6B5B7B]">All Orders</div>
          <div className="font-mono-num text-lg font-bold text-[#1F122B]">
            {invoices.length}
          </div>
        </button>

        {STATUSES.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
              statusFilter === st
                ? 'border-[#DB2777] bg-[#FDF2F8]'
                : 'border-[#EFE2F5] bg-white'
            }`}
          >
            <div className="text-[11px] font-semibold text-[#6B5B7B]">{st}</div>
            <div className="font-mono-num text-lg font-bold text-[#1F122B]">
              {counts[st]}
            </div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-[#8E7C9E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search order ID, customer, courier, or tracking #..."
          className="w-full rounded-xl border border-[#E6D9EE] bg-white pl-10 pr-4 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
        />
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl border border-[#EFE2F5] bg-white overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="py-14 px-6 text-center text-sm text-[#6B5B7B]">
            No orders match the current delivery filter.
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#EFE2F5] bg-[#FDF8FC] font-semibold text-[#5B4B6B]">
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Courier Name</th>
                <th className="py-3 px-4">Tracking Number</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4ECF8]">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#FDF9FC]">
                  <td className="py-3 px-4">
                    <div className="font-mono-num font-bold text-[#6D28D9]">
                      {inv.invoiceNumber}
                    </div>
                    <div className="font-mono-num text-[11px] text-[#6B5B7B]">
                      {inv.invoiceDate}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-[#1F122B]">{inv.customerName}</div>
                    <div className="text-[11px] text-[#6B5B7B]">
                      {inv.customerCityStatePin || inv.customerMobile}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[#1F122B]">
                    {inv.courierName || 'Not assigned'}
                  </td>
                  <td className="py-3 px-4 font-mono-num text-[#4A3B59]">
                    {inv.trackingNumber || '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block rounded-md border px-2.5 py-1 text-[11px] font-semibold ${getStatusColor(
                        inv.deliveryStatus
                      )}`}
                    >
                      {inv.deliveryStatus}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(inv)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E6D9EE] bg-white px-3 py-1.5 text-xs font-semibold text-[#7E22CE] hover:border-[#9333EA] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Update Status</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Update Delivery Modal */}
      {editingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F122B]/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSave}
            className="w-full max-w-md rounded-2xl border border-[#EFE2F5] bg-white p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#F4ECF8] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#EC4899] to-[#7E22CE] text-white flex items-center justify-center">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1F122B]">
                    Update Delivery · {editingOrder.invoiceNumber}
                  </h3>
                  <p className="text-xs text-[#6B5B7B]">{editingOrder.customerName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Courier Name
              </label>
              <input
                type="text"
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                placeholder="e.g. Delhivery, Xpressbees, Blue Dart"
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Tracking Number
              </label>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Enter AWB / tracking ID"
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1.5">
                Order Status
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setDeliveryStatus(st)}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      deliveryStatus === st
                        ? 'border-[#7E22CE] bg-[#F5F3FF] text-[#6D28D9]'
                        : 'border-[#E6D9EE] bg-white text-[#5B4B6B]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="px-4 py-2 rounded-xl border border-[#E6D9EE] text-xs font-semibold text-[#5B4B6B] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{saving ? 'Updating...' : 'Save Delivery Update'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
