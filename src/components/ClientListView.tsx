import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Eye,
  FilePlus2,
  MapPin,
  Pencil,
  Phone,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { Client, Invoice } from '../types/business';
import { formatCurrency } from '../utils/calculations';
import { ConfirmModal } from './ConfirmModal';

interface ClientListViewProps {
  clients: Client[];
  invoices: Invoice[];
  currencySymbol: string;
  selectedClientId: string | null;
  onSelectClient: (id: string | null) => void;
  onBack: () => void;
  onAddNew: () => void;
  onEditClient: (client: Client) => void;
  onDeleteClient: (id: string) => Promise<void>;
  onCreateBillForClient: (client: Client) => void;
  onOpenInvoice: (invoice: Invoice) => void;
}

export const ClientListView: React.FC<ClientListViewProps> = ({
  clients,
  invoices,
  currencySymbol,
  selectedClientId,
  onSelectClient,
  onBack,
  onAddNew,
  onEditClient,
  onDeleteClient,
  onCreateBillForClient,
  onOpenInvoice,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

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
              Client List ({clients.length})
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Search customers, inspect order history, edit details, or generate bills.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onAddNew}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>New Client</span>
        </button>
      </div>

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
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onSelectClient(client.id)}
                      className="text-left font-display-serif text-lg font-bold text-[#1F122B] hover:text-[#7E22CE] hover:underline underline-offset-4 cursor-pointer"
                    >
                      {client.name}
                    </button>
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
