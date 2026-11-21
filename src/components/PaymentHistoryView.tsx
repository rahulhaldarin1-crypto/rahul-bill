import React, { useMemo, useState } from 'react';
import { ArrowLeft, Plus, Search, Trash2, X } from 'lucide-react';
import { Invoice, PaymentMethod, PaymentRecord } from '../types/business';
import { formatCurrency, todayIsoDate } from '../utils/calculations';
import { ConfirmModal } from './ConfirmModal';

interface PaymentHistoryViewProps {
  invoices: Invoice[];
  payments: PaymentRecord[];
  currencySymbol: string;
  onBack: () => void;
  onRecordPayment: (payload: {
    invoiceId: string;
    amountPaid: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    note: string;
  }) => Promise<void>;
  onDeletePayment: (id: string) => Promise<void>;
}

export const PaymentHistoryView: React.FC<PaymentHistoryViewProps> = ({
  invoices,
  payments,
  currencySymbol,
  onBack,
  onRecordPayment,
  onDeletePayment,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<'ALL' | PaymentMethod>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DUE' | 'PAID'>('ALL');
  const [modalInvoice, setModalInvoice] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayIsoDate);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('UPI');
  const [payNote, setPayNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaymentRecord | null>(null);

  const summary = useMemo(() => {
    const totalBilled = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0);
    const totalDue = invoices.reduce((s, i) => s + i.dueAmount, 0);
    return { totalBilled, totalPaid, totalDue };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter === 'DUE' && inv.dueAmount <= 0) return false;
      if (statusFilter === 'PAID' && inv.dueAmount > 0) return false;
      if (methodFilter !== 'ALL' && inv.paymentMethod !== methodFilter) return false;
      if (!q) return true;
      return (
        inv.customerName.toLowerCase().includes(q) ||
        inv.invoiceNumber.toLowerCase().includes(q)
      );
    });
  }, [invoices, searchQuery, methodFilter, statusFilter]);

  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return payments.filter((p) => {
      if (methodFilter !== 'ALL' && p.paymentMethod !== methodFilter) return false;
      if (!q) return true;
      return (
        p.customerName.toLowerCase().includes(q) ||
        p.invoiceNumber.toLowerCase().includes(q)
      );
    });
  }, [payments, searchQuery, methodFilter]);

  const openPaymentModal = (inv: Invoice) => {
    setModalInvoice(inv);
    setPayAmount(String(inv.dueAmount));
    setPayDate(todayIsoDate());
    setPayMethod(inv.paymentMethod);
    setPayNote('');
    setError('');
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalInvoice) return;
    const amt = Number(payAmount) || 0;
    if (amt <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }
    if (amt > modalInvoice.dueAmount + 0.01) {
      setError(
        `Amount cannot exceed remaining due (${formatCurrency(
          modalInvoice.dueAmount,
          currencySymbol
        )}).`
      );
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onRecordPayment({
        invoiceId: modalInvoice.id,
        amountPaid: amt,
        paymentDate: payDate,
        paymentMethod: payMethod,
        note: payNote.trim(),
      });
      setModalInvoice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setBusy(false);
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
              Payment History &amp; Dues
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Monitor invoice balances, Cash/UPI/Bank Transfer receipts, and settle due payments.
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5">
          <div className="text-xs font-medium text-[#6B5B7B]">Total Billed</div>
          <div className="font-mono-num text-2xl font-bold text-[#1F122B] mt-1">
            {formatCurrency(summary.totalBilled, currencySymbol)}
          </div>
        </div>
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5">
          <div className="text-xs font-medium text-[#6B5B7B]">Amount Collected</div>
          <div className="font-mono-num text-2xl font-bold text-[#15803D] mt-1">
            {formatCurrency(summary.totalPaid, currencySymbol)}
          </div>
        </div>
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5">
          <div className="text-xs font-medium text-[#6B5B7B]">Remaining Due</div>
          <div className="font-mono-num text-2xl font-bold text-[#BE123C] mt-1">
            {formatCurrency(summary.totalDue, currencySymbol)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#8E7C9E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customer or invoice #..."
            className="w-full rounded-xl border border-[#E6D9EE] bg-white pl-10 pr-4 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F4ECF8]">
            {(
              [
                { id: 'ALL', label: 'All Bills' },
                { id: 'DUE', label: 'Pending Due' },
                { id: 'PAID', label: 'Paid Full' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatusFilter(s.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg cursor-pointer ${
                  statusFilter === s.id ? 'bg-white text-[#7E22CE]' : 'text-[#5B4B6B]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <select
            value={methodFilter}
            onChange={(e) =>
              setMethodFilter(e.target.value as 'ALL' | PaymentMethod)
            }
            className="rounded-xl border border-[#E6D9EE] bg-white px-3 py-2 text-xs font-semibold text-[#1F122B] cursor-pointer"
          >
            <option value="ALL">All Methods</option>
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
            <option value="Bank Transfer">Bank Transfer</option>
          </select>
        </div>
      </div>

      {/* Invoice Balances Table */}
      <div className="rounded-2xl border border-[#EFE2F5] bg-white overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#EFE2F5] font-bold text-sm text-[#1F122B]">
          Customer Invoice Payment Status ({filteredInvoices.length})
        </div>
        {filteredInvoices.length === 0 ? (
          <div className="py-12 px-6 text-center text-sm text-[#6B5B7B]">
            No matching invoice payment records found.
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#EFE2F5] bg-[#FDF8FC] font-semibold text-[#5B4B6B]">
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4 text-right">Total Bill</th>
                <th className="py-3 px-4 text-right">Amount Paid</th>
                <th className="py-3 px-4 text-right">Remaining Due</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4ECF8]">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#FDF9FC]">
                  <td className="py-3 px-4 font-semibold text-[#1F122B]">
                    {inv.customerName}
                  </td>
                  <td className="py-3 px-4 font-mono-num font-bold text-[#6D28D9]">
                    {inv.invoiceNumber}
                  </td>
                  <td className="py-3 px-4 font-mono-num text-[#5B4B6B]">
                    {inv.invoiceDate}
                  </td>
                  <td className="py-3 px-4 text-[#4A3B59]">{inv.paymentMethod}</td>
                  <td className="py-3 px-4 text-right font-mono-num font-semibold">
                    {formatCurrency(inv.totalAmount, currencySymbol)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-num text-[#15803D] font-semibold">
                    {formatCurrency(inv.paidAmount, currencySymbol)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono-num font-bold ${
                      inv.dueAmount > 0 ? 'text-[#BE123C]' : 'text-[#15803D]'
                    }`}
                  >
                    {formatCurrency(inv.dueAmount, currencySymbol)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {inv.dueAmount > 0 ? (
                      <button
                        type="button"
                        onClick={() => openPaymentModal(inv)}
                        className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Record Payment</span>
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-[#15803D]">
                        Settled
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Individual Payment Transaction Log */}
      <div className="rounded-2xl border border-[#EFE2F5] bg-white overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#EFE2F5] font-bold text-sm text-[#1F122B]">
          Payment Transaction Records ({filteredPayments.length})
        </div>
        {filteredPayments.length === 0 ? (
          <div className="py-10 px-6 text-center text-sm text-[#6B5B7B]">
            No payment transactions recorded yet.
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#EFE2F5] bg-[#FDF8FC] font-semibold text-[#5B4B6B]">
                <th className="py-3 px-4">Payment Date</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4 text-right">Amount Paid</th>
                <th className="py-3 px-4 text-right">Due After</th>
                <th className="py-3 px-4 text-right">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4ECF8]">
              {filteredPayments.map((p) => (
                <tr key={p.id} className="hover:bg-[#FDF9FC]">
                  <td className="py-3 px-4 font-mono-num text-[#5B4B6B]">
                    {p.paymentDate}
                  </td>
                  <td className="py-3 px-4 font-semibold text-[#1F122B]">
                    {p.customerName}
                  </td>
                  <td className="py-3 px-4 font-mono-num text-[#6D28D9] font-semibold">
                    {p.invoiceNumber}
                  </td>
                  <td className="py-3 px-4">{p.paymentMethod}</td>
                  <td className="py-3 px-4 text-right font-mono-num font-bold text-[#15803D]">
                    {formatCurrency(p.amountPaid, currencySymbol)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-num text-[#5B4B6B]">
                    {formatCurrency(p.remainingDueAfter, currencySymbol)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(p)}
                      className="p-1.5 rounded-lg border border-[#E6D9EE] text-[#6B5B7B] hover:text-[#BE123C] cursor-pointer"
                      title="Delete payment entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Record Payment Modal */}
      {modalInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F122B]/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSavePayment}
            className="w-full max-w-md rounded-2xl border border-[#EFE2F5] bg-white p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#F4ECF8] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#1F122B]">Record Payment</h3>
                <p className="text-xs text-[#6B5B7B]">
                  {modalInvoice.invoiceNumber} · {modalInvoice.customerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalInvoice(null)}
                className="p-1.5 rounded-lg text-[#6B5B7B] hover:bg-[#FAF5FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3 py-2 text-xs font-medium text-[#BE123C]">
                {error}
              </div>
            )}

            <div className="rounded-xl bg-[#FDF8FC] border border-[#F3D9E7] px-3.5 py-2.5 text-xs flex justify-between">
              <span className="text-[#5B4B6B]">Current Remaining Due</span>
              <span className="font-mono-num font-bold text-[#BE123C]">
                {formatCurrency(modalInvoice.dueAmount, currencySymbol)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Amount Paid ({currencySymbol})
              </label>
              <input
                type="number"
                min={0.01}
                step="0.01"
                required
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Payment Date
                </label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm font-mono-num text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Method
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                Reference / Note (optional)
              </label>
              <input
                type="text"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="UPI Ref or Cash receipt note"
                className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setModalInvoice(null)}
                className="px-4 py-2 rounded-xl border border-[#E6D9EE] text-xs font-semibold text-[#5B4B6B] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
              >
                {busy ? 'Saving...' : 'Save Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove Payment Record"
        message={`Remove payment of ${
          deleteTarget
            ? formatCurrency(deleteTarget.amountPaid, currencySymbol)
            : ''
        } for invoice ${deleteTarget?.invoiceNumber}? The invoice due amount will be updated automatically.`}
        confirmLabel="Remove Payment"
        busy={busy}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setBusy(true);
          try {
            await onDeletePayment(deleteTarget.id);
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
