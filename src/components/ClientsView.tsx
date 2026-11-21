import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ClipboardPaste,
  Copy,
  Download,
  FileEdit,
  FilePlus2,
  Hash,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
  UserCheck,
  UserCog,
  UserPlus,
} from 'lucide-react';
import { Translations } from '../i18n/translations';
import {
  ClientRecord,
  CustomerDetails,
  Language,
  SavedInvoice,
} from '../types/invoice';
import { formatMoney, parseCustomerText } from '../utils/invoiceHelpers';

interface ClientsViewProps {
  clients: ClientRecord[];
  savedInvoices: SavedInvoice[];
  selectedClientId: string | null;
  onSelectClient: (id: string | null) => void;
  onBack: () => void;
  focusMode?: 'create' | 'list';
  onChangeFocusMode?: (mode: 'create' | 'list') => void;
  lang: Language;
  onChangeLang: (lang: Language) => void;
  onSaveClient: (client: ClientRecord) => void;
  onDeleteClient: (id: string) => void;
  onCreateBillForClient: (client: ClientRecord) => void;
  onLoadOrderForClient: (inv: SavedInvoice) => void;
  onRepeatOrderForClient: (inv: SavedInvoice, client: ClientRecord) => void;
  onDeleteOrder: (id: string) => void;
  onDownloadOrderPdf: (inv: SavedInvoice) => void;
  onOpenBlankBill: () => void;
  t: Translations;
}

const EMPTY_FORM: CustomerDetails = {
  name: '',
  phone: '',
  address: '',
  cityPin: '',
};

function getNextClientCode(clients: ClientRecord[]): string {
  const nextNum = clients.length + 1;
  return `CL-${String(nextNum).padStart(3, '0')}`;
}

export function doesInvoiceBelongToClient(inv: SavedInvoice, client: ClientRecord): boolean {
  if (inv.clientId) {
    return inv.clientId === client.id;
  }
  const sameName =
    inv.customer.name.trim().toLowerCase() === client.name.trim().toLowerCase();
  if (!sameName) return false;
  if (client.phone.trim() && inv.customer.phone.trim()) {
    return inv.customer.phone.trim() === client.phone.trim();
  }
  return true;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  clients,
  savedInvoices,
  selectedClientId,
  onSelectClient,
  onBack,
  focusMode = 'list',
  onChangeFocusMode,
  lang,
  onChangeLang,
  onSaveClient,
  onDeleteClient,
  onCreateBillForClient,
  onLoadOrderForClient,
  onRepeatOrderForClient,
  onDeleteOrder,
  onDownloadOrderPdf,
  onOpenBlankBill,
  t,
}) => {
  const [clientCode, setClientCode] = useState(() => getNextClientCode(clients));
  const [form, setForm] = useState<CustomerDetails>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [rawPasteText, setRawPasteText] = useState('');
  const [detailEditOpen, setDetailEditOpen] = useState(false);

  const selectedClient = useMemo(
    () => (selectedClientId ? clients.find((c) => c.id === selectedClientId) || null : null),
    [clients, selectedClientId]
  );

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.cityPin.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        (c.clientCode && c.clientCode.toLowerCase().includes(q))
    );
  }, [clients, searchQuery]);

  const clientStats = useMemo(() => {
    const stats: Record<string, { count: number; total: number; lastDate: string }> = {};
    for (const client of clients) {
      const orders = savedInvoices.filter((inv) => doesInvoiceBelongToClient(inv, client));
      const total = orders.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
      const lastDate = orders[0]?.meta.orderDate || '';
      stats[client.id] = { count: orders.length, total, lastDate };
    }
    return stats;
  }, [clients, savedInvoices]);

  const selectedClientOrders = useMemo(() => {
    if (!selectedClient) return [];
    return savedInvoices.filter((inv) => doesInvoiceBelongToClient(inv, selectedClient));
  }, [savedInvoices, selectedClient]);

  const buildClientRecord = (): ClientRecord => {
    const now = new Date().toISOString();
    const existing = editingId ? clients.find((c) => c.id === editingId) : undefined;
    return {
      id: existing ? existing.id : `cli-${Date.now()}`,
      clientCode: clientCode.trim() || existing?.clientCode || getNextClientCode(clients),
      name: form.name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      cityPin: form.cityPin.trim(),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
  };

  const resetForm = (nextOffset = 0) => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setClientCode(`CL-${String(clients.length + 1 + nextOffset).padStart(3, '0')}`);
  };

  const handleSaveAndCreateBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const record = buildClientRecord();
    onSaveClient(record);
    resetForm(1);
    onCreateBillForClient(record);
  };

  const handleSaveOnly = () => {
    if (!form.name.trim()) return;
    const record = buildClientRecord();
    onSaveClient(record);
    resetForm(1);
    if (detailEditOpen) {
      setDetailEditOpen(false);
    } else {
      onSelectClient(record.id);
    }
  };

  const handleEditClient = (client: ClientRecord, inDetail = false) => {
    setEditingId(client.id);
    setClientCode(client.clientCode || getNextClientCode(clients));
    setForm({
      name: client.name,
      phone: client.phone,
      address: client.address,
      cityPin: client.cityPin,
    });
    if (inDetail) {
      setDetailEditOpen(true);
    } else if (onChangeFocusMode) {
      onChangeFocusMode('create');
    }
  };

  const handleApplyPaste = () => {
    const parsed = parseCustomerText(rawPasteText);
    setForm((prev) => ({
      name: parsed.name ?? prev.name,
      phone: parsed.phone ?? prev.phone,
      address: parsed.address ?? prev.address,
      cityPin: parsed.cityPin ?? prev.cityPin,
    }));
    setRawPasteText('');
    setPasteOpen(false);
  };

  const inputClass =
    'w-full rounded-md border border-[#DDD7CB] bg-white px-3 py-2 text-sm text-[#181613] placeholder:text-[#9A9284] focus:border-[#A8822E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A449]/35 transition-colors';
  const labelClass = 'block text-xs font-medium text-[#5A5347] mb-1.5';

  // 1. MASTER CLIENT PROFILE & ORDER HISTORY VIEW
  if (selectedClient) {
    const stat = clientStats[selectedClient.id] || { count: 0, total: 0, lastDate: '' };

    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 space-y-6">
        {/* Top Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setDetailEditOpen(false);
                resetForm();
                onBack();
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#DDD7CB] bg-white px-3 py-1.5 text-xs font-medium text-[#181613] hover:bg-[#F3EFE6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#7D6635]" />
              <span>{t.backBtn}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDetailEditOpen(false);
                resetForm();
                onSelectClient(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5A5347] hover:text-[#181613] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{t.backToClients}</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (detailEditOpen) {
                  setDetailEditOpen(false);
                  resetForm();
                } else {
                  handleEditClient(selectedClient, true);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#DDD7CB] bg-white px-3.5 py-2 text-xs font-medium text-[#181613] hover:bg-[#F3EFE6] cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 text-[#7D6635]" />
              <span>{t.editClientTitle}</span>
            </button>

            <button
              type="button"
              onClick={() => onCreateBillForClient(selectedClient)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#181613] px-4 py-2 text-xs font-semibold text-[#F5EFE4] hover:bg-[#2E2923] transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#D5AE52]" />
              <span>{t.newOrderForClient}</span>
            </button>
          </div>
        </div>

        {/* Client Profile Master Card (Shows ALL saved client data) */}
        <div className="rounded-lg border border-[#E2DDD2] bg-white p-5 sm:p-6">
          {detailEditOpen ? (
            <div className="space-y-4">
              <div className="text-sm font-semibold text-[#181613]">{t.editClientTitle}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className={labelClass}>{t.clientIdLabel}</label>
                  <input
                    type="text"
                    value={clientCode}
                    onChange={(e) => setClientCode(e.target.value)}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t.customerName}</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t.customerPhone}</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t.customerCityPin}</label>
                  <input
                    type="text"
                    value={form.cityPin}
                    onChange={(e) => setForm({ ...form, cityPin: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>{t.customerAddress}</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDetailEditOpen(false);
                    resetForm();
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-[#5A5347] hover:text-[#181613] cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleSaveOnly}
                  disabled={!form.name.trim()}
                  className="px-4 py-2 rounded-md bg-[#181613] text-xs font-semibold text-[#F5EFE4] hover:bg-[#2E2923] cursor-pointer"
                >
                  {t.updateClient}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {selectedClient.clientCode && (
                      <span className="font-mono-num text-xs font-semibold px-2.5 py-1 rounded-md bg-[#FAF4E4] border border-[#D4C7AE] text-[#6B5422]">
                        {selectedClient.clientCode}
                      </span>
                    )}
                    <h1 className="font-display-serif text-2xl font-bold text-[#181613]">
                      {selectedClient.name}
                    </h1>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6 sm:gap-8 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-[#EFECE4] md:pl-8 shrink-0">
                  <div>
                    <div className="text-xs text-[#6B6356]">{t.totalOrdersLabel}</div>
                    <div className="font-mono-num text-xl font-bold text-[#181613] mt-0.5">
                      {stat.count}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#6B6356]">{t.totalSpentLabel}</div>
                    <div className="font-mono-num text-xl font-bold text-[#181613] mt-0.5">
                      ₹ {formatMoney(stat.total)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#6B6356]">{t.lastOrderLabel}</div>
                    <div className="font-mono-num text-sm font-semibold text-[#181613] mt-1.5">
                      {stat.lastDate || '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* All Stored Client Data Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-[#EFECE4] text-xs">
                <div>
                  <div className="text-[#7D7466] mb-1">{t.customerPhone}</div>
                  <div className="font-mono-num font-medium text-[#181613]">
                    {selectedClient.phone || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[#7D7466] mb-1">{t.customerCityPin}</div>
                  <div className="font-medium text-[#181613]">
                    {selectedClient.cityPin || '—'}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-[#7D7466] mb-1">{t.customerAddress}</div>
                  <div className="font-medium text-[#181613]">
                    {selectedClient.address || '—'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Order History Ledger */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#181613]">
            {t.clientOrdersTitle} ({selectedClientOrders.length})
          </h2>

          {selectedClientOrders.length === 0 ? (
            <div className="rounded-lg border border-[#E2DDD2] bg-white py-14 px-6 text-center">
              <h3 className="text-base font-semibold text-[#181613] mb-1.5">
                {t.noClientOrdersTitle}
              </h3>
              <p className="text-sm text-[#6B6356] max-w-md mx-auto mb-5">
                {t.noClientOrdersDesc}
              </p>
              <button
                type="button"
                onClick={() => onCreateBillForClient(selectedClient)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#181613] text-sm font-medium text-[#F5EFE4] hover:bg-[#2E2923] cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#D5AE52]" />
                <span>{t.newOrderForClient}</span>
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-[#E2DDD2] bg-white overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E0D5] bg-[#FAF8F4] text-xs font-semibold text-[#5A5347]">
                    <th className="py-3 px-4">{t.colOrderDate}</th>
                    <th className="py-3 px-4">{t.colInvoice}</th>
                    <th className="py-3 px-4">{t.colItems}</th>
                    <th className="py-3 px-4">{t.colPayment}</th>
                    <th className="py-3 px-4 text-right">{t.colTotal}</th>
                    <th className="py-3 px-4 text-right">{t.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE4] text-sm">
                  {selectedClientOrders.map((inv) => {
                    const activeItems = inv.items.filter((i) => i.productName.trim() !== '');
                    const itemSummary =
                      activeItems.length > 0
                        ? activeItems
                            .map(
                              (i) =>
                                `${i.productName}${i.size ? ` (${i.size})` : ''} × ${i.qty || 1}`
                            )
                            .join(', ')
                        : `${inv.items.length} item(s)`;

                    return (
                      <tr key={inv.id} className="hover:bg-[#FCFBF8] transition-colors">
                        <td className="py-3 px-4 align-middle">
                          <div className="font-mono-num text-xs font-medium text-[#181613]">
                            {inv.meta.orderDate || '—'}
                          </div>
                          {inv.meta.deliveryDate && (
                            <div className="font-mono-num text-[11px] text-[#7D7466]">
                              Del: {inv.meta.deliveryDate}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 align-middle font-mono-num font-semibold text-[#181613]">
                          {inv.meta.invoiceNo || '—'}
                        </td>
                        <td className="py-3 px-4 align-middle text-xs text-[#4A4338] max-w-xs truncate">
                          {itemSummary}
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
                              onClick={() => onLoadOrderForClient(inv)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#DDD7CB] text-xs font-medium text-[#181613] hover:bg-[#F5F2EB] whitespace-nowrap cursor-pointer"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                              <span>{t.loadEditor}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onRepeatOrderForClient(inv, selectedClient)}
                              title={t.repeatOrder}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#DDD7CB] text-xs font-medium text-[#5A5347] hover:text-[#181613] hover:bg-[#F5F2EB] whitespace-nowrap cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>{t.repeatOrder}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDownloadOrderPdf(inv)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#181613] text-xs font-medium text-[#F5EFE4] hover:bg-[#2E2923] whitespace-nowrap cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>PDF</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteOrder(inv.id)}
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
      </div>
    );
  }

  // 2. MASTER USER — CREATE / EDIT CLIENT VIEW (Focused registration screen)
  if (focusMode === 'create' || editingId) {
    const darkInputWrap =
      'flex items-center gap-3 rounded-xl bg-[#27211B] border border-[#3B3123] px-3.5 py-2.5 focus-within:border-[#D5AE52] transition-colors';
    const darkInput =
      'w-full bg-transparent text-sm text-[#F5EFE4] placeholder:text-[#7E7363] focus:outline-none';
    const microLabel =
      'block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#D5AE52] mb-1.5';

    return (
      <div className="min-h-[calc(100vh-56px)] bg-[#14110E] text-[#F5EFE4] py-7 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          {/* Top Navigation Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <button
              type="button"
              onClick={() => {
                resetForm();
                onBack();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#443825] bg-[#1F1A15] px-3.5 py-2 text-xs font-medium text-[#F5EFE4] hover:border-[#D5AE52] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#D5AE52]" />
              <span>{t.backBtn}</span>
            </button>

            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#1F1A15] border border-[#3B3123]">
                <button
                  type="button"
                  onClick={() => onChangeLang('en')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    lang === 'en' ? 'bg-[#D5AE52] text-[#14110E]' : 'text-[#BFB4A0]'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => onChangeLang('bn')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    lang === 'bn' ? 'bg-[#D5AE52] text-[#14110E]' : 'text-[#BFB4A0]'
                  }`}
                >
                  বাংলা
                </button>
              </div>

              {onChangeFocusMode && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    onChangeFocusMode('list');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#5B4926] bg-[#1F1A15] px-3.5 py-2 text-xs font-medium text-[#F5EFE4] hover:border-[#D5AE52] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>
                    {t.homeClientList} ({clients.length})
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Master User Registration Card */}
          <div className="rounded-2xl border border-[#352C1F] bg-[#1C1713] p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-5 mb-5 border-b border-[#2E261C]">
              <div className="flex items-center gap-3">
                <div
                  style={{
                    background: 'linear-gradient(180deg, #D9B65C 0%, #B78E35 100%)',
                  }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-[#14110E] shrink-0"
                >
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-[#F5EFE4]">
                    {editingId ? t.editClientTitle : t.createClientTitle}
                  </h1>
                  <p className="text-xs text-[#A59882]">{t.clientsSubtitle}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-xl border border-[#443825] bg-[#251F19] px-3 py-2 shrink-0">
                <div className="w-8 h-8 rounded-full bg-[#352C20] flex items-center justify-center text-[#D5AE52]">
                  <UserCog className="w-4 h-4" />
                </div>
                <div className="text-left leading-tight">
                  <div className="text-xs font-semibold text-[#F5EFE4]">Master User</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#D5AE52]">
                    BILLING OPERATOR
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveAndCreateBill} className="space-y-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setPasteOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#443825] bg-[#251F19] px-3 py-1.5 text-xs font-medium text-[#D5AE52] hover:border-[#D5AE52] transition-colors cursor-pointer"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>{t.quickPasteBtn}</span>
                </button>
              </div>

              {pasteOpen && (
                <div className="rounded-xl border border-[#443825] bg-[#251F19] p-3.5 space-y-2.5">
                  <div className="text-xs font-semibold text-[#F5EFE4]">{t.quickPasteTitle}</div>
                  <p className="text-xs text-[#A59882]">{t.quickPasteDesc}</p>
                  <textarea
                    rows={3}
                    value={rawPasteText}
                    onChange={(e) => setRawPasteText(e.target.value)}
                    placeholder={t.quickPastePlaceholder}
                    className="w-full rounded-lg bg-[#1A1511] border border-[#3B3123] p-2.5 text-xs text-[#F5EFE4] placeholder:text-[#7E7363] focus:border-[#D5AE52] focus:outline-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPasteOpen(false)}
                      className="px-3 py-1 text-xs text-[#A59882] hover:text-[#F5EFE4] cursor-pointer"
                    >
                      {t.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyPaste}
                      disabled={!rawPasteText.trim()}
                      className="px-3 py-1.5 rounded-lg bg-[#D5AE52] text-xs font-bold text-[#14110E] disabled:opacity-40 cursor-pointer"
                    >
                      {t.applyParsed}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={microLabel}>{t.clientIdLabel}</label>
                  <div className={darkInputWrap}>
                    <Hash className="w-4 h-4 text-[#D5AE52] shrink-0" />
                    <input
                      type="text"
                      value={clientCode}
                      onChange={(e) => setClientCode(e.target.value)}
                      placeholder="CL-001"
                      className={`${darkInput} font-mono-num`}
                    />
                  </div>
                </div>

                <div>
                  <label className={microLabel}>{t.customerPhone}</label>
                  <div className={darkInputWrap}>
                    <Phone className="w-4 h-4 text-[#D5AE52] shrink-0" />
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="+91..."
                      className={`${darkInput} font-mono-num`}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className={microLabel}>
                  {t.customerName} <span className="text-[#E06C6C]">*</span>
                </label>
                <div className={darkInputWrap}>
                  <User className="w-4 h-4 text-[#D5AE52] shrink-0" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter customer full name"
                    className={darkInput}
                  />
                </div>
              </div>

              <div>
                <label className={microLabel}>{t.customerAddress}</label>
                <div className={`${darkInputWrap} items-start`}>
                  <MapPin className="w-4 h-4 text-[#D5AE52] shrink-0 mt-0.5" />
                  <textarea
                    rows={3}
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="House / Street / Landmark"
                    className={`${darkInput} resize-none`}
                  />
                </div>
              </div>

              <div>
                <label className={microLabel}>{t.customerCityPin}</label>
                <div className={darkInputWrap}>
                  <Building2 className="w-4 h-4 text-[#D5AE52] shrink-0" />
                  <input
                    type="text"
                    value={form.cityPin}
                    onChange={(e) => setForm({ ...form, cityPin: e.target.value })}
                    placeholder="City / State - PIN"
                    className={darkInput}
                  />
                </div>
              </div>

              <div className="pt-2 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                <button
                  type="submit"
                  disabled={!form.name.trim()}
                  style={{
                    background: 'linear-gradient(180deg, #D9B65C 0%, #B78E35 100%)',
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-[#14110E] hover:brightness-105 disabled:opacity-40 transition-all cursor-pointer"
                >
                  <span>{t.saveAndCreateBill}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleSaveOnly}
                  disabled={!form.name.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#5B4926] bg-[#251F19] px-4 py-3 text-xs font-semibold text-[#F5EFE4] hover:border-[#D5AE52] disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-[#D5AE52]" />
                  <span>{editingId ? t.updateClient : t.saveClientOnly}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // 3. CLIENT LIST / PROFILES DIRECTORY VIEW
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-7 border-b border-[#E5E0D5]">
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
            <h1 className="font-display-serif text-2xl font-bold text-[#181613]">
              {t.homeClientList} ({clients.length})
            </h1>
            <p className="text-sm text-[#6B6356] mt-1">{t.homeClientListDesc}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-[#EAE5DA]">
            <button
              type="button"
              onClick={() => onChangeLang('en')}
              className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap cursor-pointer ${
                lang === 'en' ? 'bg-white text-[#181613] shadow-xs' : 'text-[#5A5347]'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => onChangeLang('bn')}
              className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap cursor-pointer ${
                lang === 'bn' ? 'bg-white text-[#181613] shadow-xs' : 'text-[#5A5347]'
              }`}
            >
              বাংলা
            </button>
          </div>

          {onChangeFocusMode && (
            <button
              type="button"
              onClick={() => {
                resetForm();
                onChangeFocusMode('create');
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#181613] px-3.5 py-2 text-xs font-semibold text-[#F5EFE4] hover:bg-[#2E2923] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#D5AE52]" />
              <span>{t.homeCreateClient}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenBlankBill}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#DDD7CB] bg-white px-3.5 py-2 text-xs font-medium text-[#181613] hover:bg-[#F3EFE6] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FilePlus2 className="w-3.5 h-3.5 text-[#7D6635]" />
            <span>{t.openBlankBill}</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <p className="text-xs text-[#6B6356]">{t.viewOrdersHint}</p>
        <div className="relative">
          <Search className="w-4 h-4 text-[#8C8374] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.clientSearchPlaceholder}
            className="w-full sm:w-80 rounded-md border border-[#DDD7CB] bg-white pl-9 pr-3 py-2 text-sm text-[#181613] placeholder:text-[#9A9284] focus:border-[#A8822E] focus:outline-none"
          />
        </div>
      </div>

      {/* Client Profile Cards Showing Every Stored Data Field */}
      {filteredClients.length === 0 ? (
        <div className="rounded-lg border border-[#E2DDD2] bg-white py-16 px-6 text-center">
          <h3 className="text-base font-semibold text-[#181613] mb-1.5">{t.emptyClientsTitle}</h3>
          <p className="text-sm text-[#6B6356] max-w-md mx-auto mb-5">{t.emptyClientsDesc}</p>
          {onChangeFocusMode && (
            <button
              type="button"
              onClick={() => onChangeFocusMode('create')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#181613] text-sm font-medium text-[#F5EFE4] hover:bg-[#2E2923] cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-[#D5AE52]" />
              <span>{t.homeCreateClient}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredClients.map((client) => {
            const stat = clientStats[client.id] || { count: 0, total: 0, lastDate: '' };

            return (
              <div
                key={client.id}
                className="rounded-lg border border-[#E2DDD2] bg-white p-5 flex flex-col justify-between gap-4 hover:border-[#C9A449] transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {client.clientCode && (
                        <span className="inline-block font-mono-num text-[11px] font-semibold px-2 py-0.5 rounded-sm bg-[#FAF4E4] border border-[#D4C7AE] text-[#6B5422] mb-1.5">
                          {client.clientCode}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectClient(client.id)}
                        className="text-left font-display-serif text-lg font-bold text-[#181613] hover:text-[#8E6A1E] hover:underline underline-offset-4 block cursor-pointer"
                      >
                        {client.name}
                      </button>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono-num text-sm font-bold text-[#181613]">
                        ₹ {formatMoney(stat.total)}
                      </div>
                      <div className="font-mono-num text-xs text-[#6B6356]">
                        {stat.count} {t.billsCountLabel}
                      </div>
                    </div>
                  </div>

                  {/* All Stored Profile Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-[#EFECE4] text-xs">
                    <div>
                      <span className="text-[#7D7466] block">{t.customerPhone}</span>
                      <span className="font-mono-num font-medium text-[#181613]">
                        {client.phone || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#7D7466] block">{t.customerCityPin}</span>
                      <span className="font-medium text-[#181613]">
                        {client.cityPin || '—'}
                      </span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-[#7D7466] block">{t.customerAddress}</span>
                      <span className="font-medium text-[#181613] break-words">
                        {client.address || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#EFECE4]">
                  <button
                    type="button"
                    onClick={() => onSelectClient(client.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#DDD7CB] bg-[#FAF8F4] px-3 py-1.5 text-xs font-medium text-[#181613] hover:bg-[#F2ECE0] whitespace-nowrap cursor-pointer"
                  >
                    <span>
                      {t.clientProfileLabel} ({stat.count})
                    </span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onCreateBillForClient(client)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#181613] px-3 py-1.5 text-xs font-semibold text-[#F5EFE4] hover:bg-[#2E2923] whitespace-nowrap cursor-pointer"
                    >
                      <span>{t.createBillForClient}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#D5AE52]" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleEditClient(client)}
                      title={t.editClientTitle}
                      className="p-1.5 rounded-md border border-[#DDD7CB] text-[#5A5347] hover:text-[#181613] hover:bg-[#F5F2EB] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteClient(client.id)}
                      title={t.delete}
                      className="p-1.5 rounded-md border border-[#DDD7CB] text-[#7D7466] hover:text-[#B91C1C] hover:border-[#FCA5A5] cursor-pointer"
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
  );
};
