import React, { useMemo, useState } from 'react';
import { ArrowLeft, Copy, Download, FileEdit, Plus, Search, Trash2 } from 'lucide-react';
import { Translations } from '../i18n/translations';
import { ClientRecord, PaymentMethod, SavedInvoice } from '../types/invoice';
import { formatMoney } from '../utils/invoiceHelpers';
import { doesInvoiceBelongToClient } from './ClientsView';

interface SavedBillsViewProps {
  savedInvoices: SavedInvoice[];
  clients: ClientRecord[];
  onBack: () => void;
  onOpenClientDetail: (clientId: string) => void;
  onLoadInvoice: (inv: SavedInvoice) => void;
  onDuplicateInvoice: (inv: SavedInvoice) => void;
  onDeleteInvoice: (id: string) => void;
  onDownloadSavedPdf: (inv: SavedInvoice) => void;
  onCreateNew: () => void;
  t: Translations;
}

export const SavedBillsView: React.FC<SavedBillsViewProps> = ({
  savedInvoices,
  clients,
  onBack,
  onOpenClientDetail,
  onLoadInvoice,
  onDuplicateInvoice,
  onDeleteInvoice,
  onDownloadSavedPdf,
  onCreateNew,
  t,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | PaymentMethod>('ALL');
  const [clientFilterId, setClientFilterId] = useState<string>('ALL');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const selectedClient =
      clientFilterId !== 'ALL' ? clients.find((c) => c.id === clientFilterId) : undefined;

    return savedInvoices.filter((inv) => {
      if (selectedClient && !doesInvoiceBelongToClient(inv, selectedClient)) {
        return false;
      }
      const matchesMethod = paymentFilter === 'ALL' || inv.paymentMethod === paymentFilter;
      if (!matchesMethod) return false;
      if (!q) return true;
      return (
        inv.customer.name.toLowerCase().includes(q) ||
        inv.customer.phone.toLowerCase().includes(q) ||
        inv.meta.invoiceNo.toLowerCase().includes(q) ||
        inv.customer.cityPin.toLowerCase().includes(q)
      );
    });
  }, [savedInvoices, clients, clientFilterId, searchQuery, paymentFilter]);

  const filteredTotal = useMemo(
    () => filtered.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0),
    [filtered]
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 inline-flex items-center gap-1.5 rounded-md border border-[#DDD7CB] bg-white px-3 py-1.5 text-xs font-medium text-[#181613] hover:bg-[#F3EFE6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#7D6635]" />
            <span>{t.backBtn}</span>
          </button>
          <div>
            <h1 className="font-display-serif text-2xl font-bold text-[#181613]">{t.savedTitle}</h1>
            <p className="text-sm text-[#6B6356] mt-1">{t.savedSubtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="rounded-md border border-[#E2DDD2] bg-white px-3.5 py-2 text-xs">
            <span className="text-[#6B6356] mr-1.5">{t.totalBilledLabel}:</span>
            <span className="font-mono-num font-bold text-[#181613]">
              ₹ {formatMoney(filteredTotal)}
            </span>
          </div>

          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#181613] px-3.5 py-2 text-xs font-semibold text-[#F5EFE4] hover:bg-[#2E2923] whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#D5AE52]" />
            <span>{t.newBill}</span>
          </button>
        </div>
      </div>

      {/* Filters Row: Search + Client Filter + Payment Method */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#8C8374] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-64 sm:w-72 rounded-md border border-[#DDD7CB] bg-white pl-9 pr-3 py-2 text-sm text-[#181613] placeholder:text-[#9A9284] focus:border-[#A8822E] focus:outline-none"
            />
          </div>

          {clients.length > 0 && (
            <select
              value={clientFilterId}
              onChange={(e) => setClientFilterId(e.target.value)}
              className="rounded-md border border-[#DDD7CB] bg-white px-3 py-2 text-sm text-[#181613] focus:border-[#A8822E] focus:outline-none cursor-pointer"
            >
              <option value="ALL">
                {t.allClientsFilter} ({clients.length})
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.clientCode ? `${c.clientCode} · ` : ''}
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#EAE5DA]">
          {(
            [
              { id: 'ALL', label: t.filterAll },
              { id: 'COD', label: 'COD' },
              { id: 'UPI', label: 'UPI' },
              { id: 'BANK_TRANSFER', label: 'Bank' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPaymentFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                paymentFilter === tab.id
                  ? 'bg-white text-[#181613] shadow-xs'
                  : 'text-[#5A5347] hover:text-[#181613]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-[#E2DDD2] bg-white py-16 px-6 text-center">
          <h3 className="text-base font-semibold text-[#181613] mb-1.5">{t.emptySavedTitle}</h3>
          <p className="text-sm text-[#6B6356] max-w-md mx-auto mb-5">{t.emptySavedDesc}</p>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center px-4 py-2 rounded-md bg-[#181613] text-sm font-medium text-[#F5EFE4] hover:bg-[#2C2721] cursor-pointer"
          >
            {t.createFirstBill}
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-[#E2DDD2] bg-white overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5E0D5] bg-[#FAF8F4] text-xs font-semibold text-[#5A5347]">
                <th className="py-3 px-4">{t.colInvoice}</th>
                <th className="py-3 px-4">{t.colCustomer}</th>
                <th className="py-3 px-4">{t.colItems}</th>
                <th className="py-3 px-4">{t.colPayment}</th>
                <th className="py-3 px-4 text-right">{t.colTotal}</th>
                <th className="py-3 px-4 text-right">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFECE4] text-sm">
              {filtered.map((inv) => {
                const activeItems = inv.items.filter((i) => i.productName.trim() !== '');
                const itemCount = activeItems.length;
                const matchedClient = clients.find((c) => doesInvoiceBelongToClient(inv, c));

                return (
                  <tr key={inv.id} className="hover:bg-[#FCFBF8] transition-colors">
                    <td className="py-3 px-4 align-middle">
                      <div className="font-mono-num font-semibold text-[#181613]">
                        {inv.meta.invoiceNo || '—'}
                      </div>
                      <div className="font-mono-num text-xs text-[#7D7466]">
                        {inv.meta.orderDate || '—'}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-middle">
                      {matchedClient ? (
                        <button
                          type="button"
                          onClick={() => onOpenClientDetail(matchedClient.id)}
                          className="font-medium text-[#181613] hover:text-[#8E6A1E] hover:underline underline-offset-4 text-left cursor-pointer"
                        >
                          {matchedClient.clientCode ? `${matchedClient.clientCode} · ` : ''}
                          {inv.customer.name || 'Unnamed Customer'}
                        </button>
                      ) : (
                        <div className="font-medium text-[#181613]">
                          {inv.customer.name || 'Unnamed Customer'}
                        </div>
                      )}
                      <div className="text-xs text-[#6B6356] flex items-center gap-1.5">
                        <span className="font-mono-num">{inv.customer.phone}</span>
                        {inv.customer.cityPin && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{inv.customer.cityPin}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-middle text-xs text-[#5A5347] max-w-[220px] truncate">
                      {itemCount > 0
                        ? activeItems.map((i) => i.productName).join(', ')
                        : `${inv.items.length} item(s)`}
                    </td>
                    <td className="py-3 px-4 align-middle text-xs text-[#5A5347]">
                      <span>{inv.paymentMethod.replace('_', ' ')}</span>
                      {inv.meta.orderVia && (
                        <>
                          <span aria-hidden="true" className="mx-1.5">
                            ·
                          </span>
                          <span>{inv.meta.orderVia}</span>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-4 align-middle text-right font-mono-num font-semibold text-[#181613]">
                      ₹ {formatMoney(inv.grandTotal)}
                    </td>
                    <td className="py-3 px-4 align-middle">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onLoadInvoice(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#DDD7CB] text-xs font-medium text-[#181613] hover:bg-[#F5F2EB] whitespace-nowrap cursor-pointer"
                        >
                          <FileEdit className="w-3.5 h-3.5" />
                          <span>{t.loadEditor}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDownloadSavedPdf(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#181613] text-xs font-medium text-[#F5EFE4] hover:bg-[#2E2923] whitespace-nowrap cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateInvoice(inv)}
                          title={t.duplicate}
                          className="p-1.5 rounded-md border border-[#DDD7CB] text-[#5A5347] hover:text-[#181613] hover:bg-[#F5F2EB] cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteInvoice(inv.id)}
                          title={t.delete}
                          className="p-1.5 rounded-md border border-[#DDD7CB] text-[#7D7466] hover:text-[#B91C1C] hover:border-[#FCA5A5] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
