import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  FilePlus2,
  KeyRound,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { Client, Invoice, SupportChatThread } from '../types/business';
import { decryptRunningPassword } from '../utils/adminAuth';
import { api, formatApiError } from '../utils/api';
import { formatCurrency } from '../utils/calculations';
import { ConfirmModal } from './ConfirmModal';
import { CustomerAvatar } from './CustomerAvatar';

interface ClientListViewProps {
  clients: Client[];
  invoices: Invoice[];
  supportChats?: SupportChatThread[];
  currencySymbol: string;
  selectedClientId: string | null;
  onSelectClient: (id: string | null) => void;
  onBack: () => void;
  onAddNew: () => void;
  onEditClient: (client: Client) => void;
  onDeleteClient: (id: string) => Promise<void>;
  onCreateBillForClient: (client: Client) => void;
  onOpenInvoice: (invoice: Invoice) => void;
  onSaveClientPassword: (clientId: string, newPassword: string) => Promise<void>;
}

function formatChatTime(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ClientListView: React.FC<ClientListViewProps> = ({
  clients,
  invoices,
  supportChats = [],
  currencySymbol,
  selectedClientId,
  onSelectClient,
  onBack,
  onAddNew,
  onEditClient,
  onDeleteClient,
  onCreateBillForClient,
  onOpenInvoice,
  onSaveClientPassword,
}) => {
  const [activeTab, setActiveTab] = useState<'customers' | 'support'>('customers');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatSearch, setChatSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [passwordInputs, setPasswordInputs] = useState<Record<string, string>>({});
  const [passwordVisible, setPasswordVisible] = useState<Record<string, boolean>>({});
  const [runningPasswordVisible, setRunningPasswordVisible] = useState<
    Record<string, boolean>
  >({});
  const [savingPasswordId, setSavingPasswordId] = useState<string | null>(null);
  const [savedPasswordId, setSavedPasswordId] = useState<string | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  const unreadSupportCount = useMemo(
    () =>
      supportChats.reduce(
        (sum, t) => sum + Math.max(0, Number(t.unreadForAdmin) || 0),
        0
      ),
    [supportChats]
  );

  const filteredSupportChats = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    const sorted = [...supportChats].sort((a, b) =>
      String(b.updatedAt || b.createdAt).localeCompare(
        String(a.updatedAt || a.createdAt)
      )
    );
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.customerName.toLowerCase().includes(q) ||
        t.customerPhone.toLowerCase().includes(q) ||
        t.lastMessage.toLowerCase().includes(q)
    );
  }, [supportChats, chatSearch]);

  const activeChatThread = useMemo(() => {
    if (selectedChatId) {
      const exact = supportChats.find((c) => c.id === selectedChatId);
      if (exact) return exact;
    }
    return filteredSupportChats[0] || null;
  }, [selectedChatId, supportChats, filteredSupportChats]);

  useEffect(() => {
    if (activeTab === 'support') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTab, activeChatThread?.messages?.length]);

  useEffect(() => {
    if (
      activeTab === 'support' &&
      activeChatThread &&
      activeChatThread.unreadForAdmin > 0
    ) {
      void api
        .markSupportChatRead(activeChatThread.id, 'admin')
        .catch(() => undefined);
    }
  }, [activeTab, activeChatThread?.id, activeChatThread?.unreadForAdmin]);

  const handleSendSupportReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChatThread) return;
    const text = replyText.trim();
    if (!text) return;
    setChatError('');
    setSendingReply(true);
    try {
      await api.sendSupportMessage({
        chatId: activeChatThread.id,
        clientId: activeChatThread.clientId,
        customerName: activeChatThread.customerName,
        customerPhone: activeChatThread.customerPhone,
        senderRole: 'admin',
        senderName: 'Glamour Galleria Support',
        text,
      });
      setReplyText('');
    } catch (err) {
      setChatError(formatApiError(err, 'Failed to send support reply.'));
    } finally {
      setSendingReply(false);
    }
  };

  const handleSavePassword = async (clientId: string) => {
    const val = (passwordInputs[clientId] || '').trim();
    if (val.length < 4) {
      setPasswordErrors((prev) => ({
        ...prev,
        [clientId]: 'Password must be at least 4 characters.',
      }));
      return;
    }

    setPasswordErrors((prev) => {
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
    setSavingPasswordId(clientId);
    try {
      await onSaveClientPassword(clientId, val);
      setPasswordInputs((prev) => ({ ...prev, [clientId]: '' }));
      setSavedPasswordId(clientId);
      setTimeout(() => {
        setSavedPasswordId((curr) => (curr === clientId ? null : curr));
      }, 2400);
    } catch (err) {
      setPasswordErrors((prev) => ({
        ...prev,
        [clientId]:
          err instanceof Error ? err.message : 'Failed to save password.',
      }));
    } finally {
      setSavingPasswordId(null);
    }
  };

  const selectedClient = useMemo(
    () => (selectedClientId ? clients.find((c) => c.id === selectedClientId) || null : null),
    [clients, selectedClientId]
  );

  const clientMetrics = useMemo(() => {
    const map: Record<
      string,
      { orderCount: number; totalSpent: number; totalDue: number; orders: Invoice[] }
    > = {};
    for (const c of clients) {
      const orders = invoices.filter(
        (inv) =>
          inv.clientId === c.id ||
          (inv.customerMobile && c.mobile && inv.customerMobile === c.mobile)
      );
      map[c.id] = {
        orderCount: orders.length,
        totalSpent: orders.reduce((s, o) => s + o.totalAmount, 0),
        totalDue: orders.reduce((s, o) => s + o.dueAmount, 0),
        orders,
      };
    }
    return map;
  }, [clients, invoices]);

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.mobile.toLowerCase().includes(q) ||
        c.whatsapp.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.pinCode.toLowerCase().includes(q)
    );
  }, [clients, searchQuery]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDeleteClient(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  // DETAIL VIEW: Customer Details & Order History
  if (selectedClient) {
    const stats = clientMetrics[selectedClient.id] || {
      orderCount: 0,
      totalSpent: 0,
      totalDue: 0,
      orders: [],
    };

    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectClient(null)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>All Clients</span>
            </button>
            <CustomerAvatar
              photoDataUrl={selectedClient.profilePhotoDataUrl}
              name={selectedClient.name}
              size={42}
            />
            <h1 className="font-display-serif text-2xl font-bold text-[#1F122B]">
              {selectedClient.name}
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onEditClient(selectedClient)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F122B] hover:border-[#9333EA] cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 text-[#7E22CE]" />
              <span>Edit Profile</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateBillForClient(selectedClient)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white hover:opacity-95 cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>Create Bill</span>
            </button>
          </div>
        </div>

        {/* Customer Info Card */}
        <div className="rounded-2xl border border-[#EFE2F5] bg-white p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-[#6B5B7B] mb-1">Mobile Number</div>
              <div className="font-mono-num font-semibold text-sm text-[#1F122B]">
                {selectedClient.mobile}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B] mb-1">WhatsApp Number</div>
              <div className="font-mono-num font-semibold text-sm text-[#1F122B]">
                {selectedClient.whatsapp || selectedClient.mobile}
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-[#6B5B7B] mb-1">Full Address</div>
              <div className="text-sm text-[#1F122B]">
                {selectedClient.address || 'Not provided'}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B] mb-1">City &amp; State</div>
              <div className="text-sm font-medium text-[#1F122B]">
                {[selectedClient.city, selectedClient.state].filter(Boolean).join(', ') || '—'}
              </div>
            </div>
            <div>
              <div className="text-[#6B5B7B] mb-1">PIN Code</div>
              <div className="font-mono-num text-sm font-medium text-[#1F122B]">
                {selectedClient.pinCode || '—'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t lg:border-t-0 lg:border-l border-[#F4ECF8] pt-4 lg:pt-0 lg:pl-6 items-center">
            <div>
              <div className="text-xs text-[#6B5B7B]">Orders</div>
              <div className="font-mono-num text-xl font-bold text-[#1F122B] mt-1">
                {stats.orderCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#6B5B7B]">Total Billed</div>
              <div className="font-mono-num text-xl font-bold text-[#7E22CE] mt-1">
                {formatCurrency(stats.totalSpent, currencySymbol)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#6B5B7B]">Pending Due</div>
              <div
                className={`font-mono-num text-xl font-bold mt-1 ${
                  stats.totalDue > 0 ? 'text-[#BE123C]' : 'text-[#15803D]'
                }`}
              >
                {formatCurrency(stats.totalDue, currencySymbol)}
              </div>
            </div>
          </div>

          {/* Detail View Customer Login Password Manager */}
          {(() => {
            const activeRunningPassword = decryptRunningPassword(
              selectedClient.runningPasswordEnc,
              selectedClient.passwordSalt
            );
            const showRunning = runningPasswordVisible[selectedClient.id] !== false;
            return (
              <div className="lg:col-span-2 pt-4 border-t border-[#F4ECF8] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-[#1F122B] flex flex-wrap items-center gap-2">
                    <KeyRound className="w-3.5 h-3.5 text-[#7E22CE]" />
                    <span>রানিং পাসওয়ার্ড (Running Password):</span>
                    {activeRunningPassword ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E9D5FF] bg-[#FAF5FF] px-2.5 py-0.5 font-mono-num text-xs font-bold text-[#6D28D9]">
                        <span className="select-all">
                          {showRunning ? activeRunningPassword : '••••••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setRunningPasswordVisible((prev) => ({
                              ...prev,
                              [selectedClient.id]: !showRunning,
                            }))
                          }
                          aria-label={
                            showRunning
                              ? 'Hide running password'
                              : 'Show running password'
                          }
                          className="text-[#7E22CE] hover:text-[#DB2777] cursor-pointer"
                        >
                          {showRunning ? (
                            <EyeOff className="w-3 h-3" />
                          ) : (
                            <Eye className="w-3 h-3" />
                          )}
                        </button>
                      </span>
                    ) : (
                      <span className="font-normal text-[#6B5B7B]">
                        {selectedClient.passwordHash
                          ? 'Active (save new password to view)'
                          : 'Not set yet'}
                      </span>
                    )}
                  </div>
                  {selectedClient.passwordUpdatedAt && (
                    <div className="text-[11px] text-[#6B5B7B]">
                      Last updated: {selectedClient.passwordUpdatedAt.slice(0, 10)}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <input
                        type={passwordVisible[selectedClient.id] ? 'text' : 'password'}
                        value={passwordInputs[selectedClient.id] || ''}
                        onChange={(e) =>
                          setPasswordInputs((prev) => ({
                            ...prev,
                            [selectedClient.id]: e.target.value,
                          }))
                        }
                        placeholder="Enter new password"
                        className="w-48 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-3 pr-8 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPasswordVisible((prev) => ({
                            ...prev,
                            [selectedClient.id]: !prev[selectedClient.id],
                          }))
                        }
                        aria-label="Toggle password visibility"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B5B7B] hover:text-[#7E22CE] cursor-pointer"
                      >
                        {passwordVisible[selectedClient.id] ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={savingPasswordId === selectedClient.id}
                      onClick={() => handleSavePassword(selectedClient.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
                    >
                      {savedPasswordId === selectedClient.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Saved</span>
                        </>
                      ) : (
                        <span>
                          {savingPasswordId === selectedClient.id
                            ? 'Saving...'
                            : 'Save Password'}
                        </span>
                      )}
                    </button>
                  </div>
                  {passwordErrors[selectedClient.id] && (
                    <div className="text-xs font-medium text-[#BE123C]">
                      {passwordErrors[selectedClient.id]}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Order History Table */}
        <div className="space-y-3">
          <h2 className="text-base font-bold text-[#1F122B]">
            Customer Order History ({stats.orders.length})
          </h2>

          {stats.orders.length === 0 ? (
            <div className="rounded-2xl border border-[#EFE2F5] bg-white py-12 px-6 text-center">
              <p className="text-sm text-[#6B5B7B] mb-4">
                No orders recorded for this customer yet.
              </p>
              <button
                type="button"
                onClick={() => onCreateBillForClient(selectedClient)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>Create First Bill</span>
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#EFE2F5] bg-white overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#EFE2F5] bg-[#FDF8FC] text-xs font-semibold text-[#5B4B6B]">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Items</th>
                    <th className="py-3 px-4">Delivery</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Due</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4ECF8] text-xs">
                  {stats.orders.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#FDF9FC]">
                      <td className="py-3 px-4 font-mono-num font-bold text-[#6D28D9]">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-[#5B4B6B]">
                        {inv.invoiceDate}
                      </td>
                      <td className="py-3 px-4 text-[#1F122B] max-w-xs truncate">
                        {inv.items.map((i) => `${i.productName} x${i.quantity}`).join(', ')}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#4A3B59]">
                        {inv.deliveryStatus}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num font-semibold">
                        {formatCurrency(inv.totalAmount, currencySymbol)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono-num font-semibold ${
                          inv.dueAmount > 0 ? 'text-[#BE123C]' : 'text-[#15803D]'
                        }`}
                      >
                        {formatCurrency(inv.dueAmount, currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenInvoice(inv)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#E6D9EE] px-2.5 py-1 text-xs font-semibold text-[#6D28D9] hover:bg-[#F5F3FF] cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Open Bill</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // DIRECTORY VIEW
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
              Customer Manage ({clients.length})
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Search customers, manage passwords &amp; orders, or reply live to Help Center chats.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-[#EFE2F5]">
            <button
              type="button"
              onClick={() => setActiveTab('customers')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'customers'
                  ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                  : 'text-[#5B4B6B] hover:text-[#1F122B]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Customers ({clients.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('support')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'support'
                  ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white'
                  : 'text-[#5B4B6B] hover:text-[#1F122B]'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>
                Support Chat Reply
                {unreadSupportCount > 0
                  ? ` (${unreadSupportCount} new)`
                  : ` (${supportChats.length})`}
              </span>
            </button>
          </div>

          {activeTab === 'customers' && (
            <button
              type="button"
              onClick={onAddNew}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>New Client</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'support' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-stretch">
          {/* Conversation List */}
          <div className="rounded-2xl border border-[#EFE2F5] bg-white overflow-hidden flex flex-col max-h-[600px]">
            <div className="p-3 border-b border-[#F4ECF8]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#8E7C9E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder="Search support chats..."
                  className="w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] pl-8 pr-3 py-2 text-xs text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#F4ECF8]">
              {filteredSupportChats.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#6B5B7B]">
                  No Help Center support chats yet. Customer messages will appear here live.
                </div>
              ) : (
                filteredSupportChats.map((thread) => {
                  const selected = activeChatThread?.id === thread.id;
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => setSelectedChatId(thread.id)}
                      className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                        selected ? 'bg-[#FAF5FF]' : 'hover:bg-[#FDFBFE]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#1F122B] truncate">
                          {thread.customerName}
                        </span>
                        {thread.unreadForAdmin > 0 && (
                          <span className="rounded-md bg-[#DB2777] px-1.5 py-0.5 text-[10px] font-bold text-white font-mono-num shrink-0">
                            {thread.unreadForAdmin} new
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono-num text-[#7E22CE] mt-0.5">
                        {thread.customerPhone}
                      </div>
                      <p className="text-xs text-[#5B4B6B] truncate mt-1">
                        {thread.lastSenderRole === 'admin' ? 'You: ' : ''}
                        {thread.lastMessage}
                      </p>
                      <div className="text-[10px] text-[#8E7C9E] font-mono-num mt-1">
                        {formatChatTime(thread.updatedAt)}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Chat Thread & Reply Composer */}
          <div className="rounded-2xl border border-[#EFE2F5] bg-white overflow-hidden flex flex-col min-h-[520px] max-h-[600px]">
            {!activeChatThread ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2">
                <MessageCircle className="w-10 h-10 text-[#D8B4FE]" />
                <div className="text-sm font-bold text-[#1F122B]">
                  Select a Customer Chat to Reply
                </div>
                <p className="text-xs text-[#6B5B7B] max-w-sm">
                  Messages sent by customers from the Help Center appear here in real time.
                </p>
              </div>
            ) : (
              <>
                <div className="px-5 py-3.5 border-b border-[#F4ECF8] bg-[#FDF9FC] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-[#1F122B]">
                      {activeChatThread.customerName}
                    </div>
                    <div className="text-xs font-mono-num text-[#6B5B7B]">
                      {activeChatThread.customerPhone}
                    </div>
                  </div>
                  {activeChatThread.clientId &&
                    clients.some((c) => c.id === activeChatThread.clientId) && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('customers');
                          onSelectClient(activeChatThread.clientId || null);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#E6D9EE] bg-white px-3 py-1.5 text-xs font-semibold text-[#6D28D9] hover:border-[#9333EA] cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Customer Profile</span>
                      </button>
                    )}
                </div>

                {chatError && (
                  <div className="mx-4 mt-3 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2 text-xs font-medium text-[#BE123C]">
                    {chatError}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#FDFBFE]">
                  {activeChatThread.messages.map((msg) => {
                    const isAdmin = msg.senderRole === 'admin';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          isAdmin ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs ${
                            isAdmin
                              ? 'bg-gradient-to-r from-[#DB2777] to-[#7E22CE] text-white rounded-br-sm'
                              : 'bg-white border border-[#EFE2F5] text-[#1F122B] rounded-bl-sm'
                          }`}
                        >
                          {!isAdmin && (
                            <div className="text-[10px] font-bold text-[#7E22CE] mb-0.5">
                              {msg.senderName || activeChatThread.customerName}
                            </div>
                          )}
                          <div className="whitespace-pre-wrap break-words">
                            {msg.text}
                          </div>
                        </div>
                        <span className="text-[10px] text-[#8E7C9E] mt-1 px-1 font-mono-num">
                          {formatChatTime(msg.createdAt)}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                <form
                  onSubmit={handleSendSupportReply}
                  className="p-3.5 border-t border-[#F4ECF8] bg-white flex items-center gap-2.5"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply to ${activeChatThread.customerName}...`}
                    className="flex-1 rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-4 py-2.5 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={sendingReply || !replyText.trim()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    <span>{sendingReply ? 'Sending...' : 'Send Reply'}</span>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-[#8E7C9E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customers by name, mobile, city, or PIN..."
              className="w-full rounded-xl border border-[#E6D9EE] bg-white pl-10 pr-4 py-2.5 text-sm text-[#1F122B] placeholder:text-[#A493B5] focus:border-[#9333EA] focus:outline-none"
            />
          </div>

          {filteredClients.length === 0 ? (
        <div className="rounded-2xl border border-[#EFE2F5] bg-white py-16 px-6 text-center">
          <h3 className="text-base font-bold text-[#1F122B] mb-1">
            {clients.length === 0 ? 'No customers added yet' : 'No matching customers found'}
          </h3>
          <p className="text-sm text-[#6B5B7B] mb-5">
            {clients.length === 0
              ? 'Add your first customer to start creating invoices and tracking orders.'
              : 'Try searching with a different customer name or mobile number.'}
          </p>
          {clients.length === 0 && (
            <button
              type="button"
              onClick={onAddNew}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-5 py-2.5 text-xs font-semibold text-white cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add First Client</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredClients.map((client) => {
            const stats = clientMetrics[client.id] || {
              orderCount: 0,
              totalSpent: 0,
              totalDue: 0,
              orders: [],
            };

            return (
              <div
                key={client.id}
                className="rounded-2xl border border-[#EFE2F5] bg-white p-5 flex flex-col justify-between gap-4 hover:border-[#C084FC] transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <CustomerAvatar
                        photoDataUrl={client.profilePhotoDataUrl}
                        name={client.name}
                        size={44}
                      />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onSelectClient(client.id)}
                          className="text-left font-display-serif text-lg font-bold text-[#1F122B] hover:text-[#7E22CE] hover:underline underline-offset-4 cursor-pointer truncate block max-w-full"
                        >
                          {client.name}
                        </button>
                        <div className="text-[11px] font-medium text-[#6B5B7B]">
                          {client.passwordHash
                            ? 'Account password active'
                            : 'No login password set'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono-num text-sm font-bold text-[#7E22CE]">
                        {formatCurrency(stats.totalSpent, currencySymbol)}
                      </div>
                      <div className="font-mono-num text-[11px] text-[#6B5B7B]">
                        {stats.orderCount} orders
                        {stats.totalDue > 0
                          ? ` · ${formatCurrency(stats.totalDue, currencySymbol)} due`
                          : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5B4B6B]">
                    <span className="inline-flex items-center gap-1 font-mono-num">
                      <Phone className="w-3.5 h-3.5 text-[#DB2777]" />
                      {client.mobile}
                    </span>
                    {(client.city || client.state || client.pinCode) && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#7E22CE]" />
                        {[client.city, client.state, client.pinCode].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>

                  {client.address && (
                    <p className="text-xs text-[#6B5B7B] line-clamp-2">{client.address}</p>
                  )}

                  {/* Inline Running Password + Reset / Save Control */}
                  {(() => {
                    const activeRunningPassword = decryptRunningPassword(
                      client.runningPasswordEnc,
                      client.passwordSalt
                    );
                    const showRunning = runningPasswordVisible[client.id] !== false;
                    return (
                      <div className="rounded-xl border border-[#F4ECF8] bg-[#FDFBFE] p-2.5 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[#4A3B59] inline-flex items-center gap-1">
                            <KeyRound className="w-3 h-3 text-[#7E22CE]" />
                            <span>রানিং পাসওয়ার্ড:</span>
                          </span>
                          {activeRunningPassword ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E9D5FF] bg-white px-2.5 py-0.5 font-mono-num text-xs font-bold text-[#6D28D9]">
                              <span className="select-all">
                                {showRunning ? activeRunningPassword : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setRunningPasswordVisible((prev) => ({
                                    ...prev,
                                    [client.id]: !showRunning,
                                  }))
                                }
                                aria-label={
                                  showRunning
                                    ? 'Hide running password'
                                    : 'Show running password'
                                }
                                className="text-[#7E22CE] hover:text-[#DB2777] cursor-pointer"
                              >
                                {showRunning ? (
                                  <EyeOff className="w-3 h-3" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                              </button>
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#6B5B7B]">
                              {client.passwordHash
                                ? 'Active (save new password to view)'
                                : 'Not set yet'}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative flex-1 min-w-0">
                            <KeyRound className="w-3.5 h-3.5 text-[#9333EA] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type={passwordVisible[client.id] ? 'text' : 'password'}
                              value={passwordInputs[client.id] || ''}
                              onChange={(e) =>
                                setPasswordInputs((prev) => ({
                                  ...prev,
                                  [client.id]: e.target.value,
                                }))
                              }
                              placeholder={
                                client.passwordHash
                                  ? 'Update customer password...'
                                  : 'Set login password (min 4 chars)...'
                              }
                              className="w-full rounded-lg border border-[#E6D9EE] bg-white pl-8 pr-8 py-1.5 text-xs text-[#1F122B] focus:border-[#9333EA] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setPasswordVisible((prev) => ({
                                  ...prev,
                                  [client.id]: !prev[client.id],
                                }))
                              }
                              aria-label="Toggle password visibility"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B5B7B] hover:text-[#7E22CE] cursor-pointer"
                            >
                              {passwordVisible[client.id] ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <button
                            type="button"
                            disabled={savingPasswordId === client.id}
                            onClick={() => handleSavePassword(client.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#7E22CE] px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                          >
                            {savedPasswordId === client.id ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Saved</span>
                              </>
                            ) : (
                              <span>
                                {savingPasswordId === client.id
                                  ? 'Saving...'
                                  : 'Save Password'}
                              </span>
                            )}
                          </button>
                        </div>
                        {passwordErrors[client.id] && (
                          <div className="text-[11px] font-medium text-[#BE123C]">
                            {passwordErrors[client.id]}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#F4ECF8]">
                  <button
                    type="button"
                    onClick={() => onSelectClient(client.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-1.5 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] hover:text-[#7E22CE] cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Details &amp; Orders</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onCreateBillForClient(client)}
                      className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer"
                    >
                      <FilePlus2 className="w-3.5 h-3.5" />
                      <span>Bill</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditClient(client)}
                      title="Edit customer"
                      className="p-2 rounded-lg border border-[#E6D9EE] text-[#5B4B6B] hover:text-[#7E22CE] hover:border-[#C084FC] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(client)}
                      title="Delete customer"
                      className="p-2 rounded-lg border border-[#E6D9EE] text-[#6B5B7B] hover:text-[#BE123C] hover:border-[#FDA4AF] cursor-pointer"
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
        </>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Customer"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? Existing invoices will remain in your records, but this customer profile will be removed.`}
        confirmLabel="Delete Customer"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
