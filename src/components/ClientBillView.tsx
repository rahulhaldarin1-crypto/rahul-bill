import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileEdit,
  Plus,
  Save,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  BusinessSettings,
  Client,
  DeliveryStatus,
  Invoice,
  InvoiceLineItem,
  PaymentMethod,
  Product,
} from '../types/business';
import {
  buildWhatsAppInvoiceUrl,
  computeInvoiceTotals,
  computeLineItem,
  exportInvoiceElementToPdf,
  formatCurrency,
  generateNextInvoiceNumber,
  suggestTrackingUrl,
  todayIsoDate,
} from '../utils/calculations';
import { ConfirmModal } from './ConfirmModal';
import { ScaledInvoicePreview } from './ScaledInvoicePreview';

interface ClientBillViewProps {
  settings: BusinessSettings;
  clients: Client[];
  products: Product[];
  invoices: Invoice[];
  initialClientId?: string | null;
  editingInvoice?: Invoice | null;
  onBack: () => void;
  onAddNewClient: () => void;
  onSaveInvoice: (payload: Partial<Invoice>, existingId?: string) => Promise<Invoice>;
  onDeleteInvoice: (id: string) => Promise<void>;
}

function makeEmptyLine(index: number): InvoiceLineItem {
  return computeLineItem({
    id: `line-${Date.now()}-${index}`,
    productId: undefined,
    productName: '',
    size: '',
    color: '',
    quantity: 1,
    originalPrice: undefined,
    purchasePrice: 0,
    sellingPrice: 0,
  });
}

export const ClientBillView: React.FC<ClientBillViewProps> = ({
  settings,
  clients,
  products,
  invoices,
  initialClientId,
  editingInvoice,
  onBack,
  onAddNewClient,
  onSaveInvoice,
  onDeleteInvoice,
}) => {
  const sym = settings.currencySymbol || '₹';
  const [subView, setSubView] = useState<'editor' | 'saved'>('editor');

  const [activeEditId, setActiveEditId] = useState<string | undefined>(undefined);
  const [invoiceNumber, setInvoiceNumber] = useState(() =>
    generateNextInvoiceNumber(invoices, settings.invoicePrefix || 'GG-')
  );
  const [invoiceDate, setInvoiceDate] = useState(todayIsoDate);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [orderVia, setOrderVia] = useState('WhatsApp');
  const [selectedClientId, setSelectedClientId] = useState(initialClientId || '');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCityStatePin, setCustomerCityStatePin] = useState('');

  const [items, setItems] = useState<InvoiceLineItem[]>([makeEmptyLine(0)]);
  const [discount, setDiscount] = useState<string>('0');
  const [gstPercent, setGstPercent] = useState<string>('0');
  const [deliveryCharge, setDeliveryCharge] = useState<string>('0');
  const [paidAmount, setPaidAmount] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [courierName, setCourierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>('Pending');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);

  const sheetRef = useRef<HTMLDivElement | null>(null);

  const applyClientToForm = (client: Client) => {
    setSelectedClientId(client.id);
    setCustomerName(client.name);
    setCustomerMobile(client.mobile);
    setCustomerWhatsapp(client.whatsapp || client.mobile);
    setCustomerAddress(client.address);
    setCustomerCityStatePin(
      [client.city, client.state, client.pinCode].filter(Boolean).join(', ')
    );
  };

  useEffect(() => {
    if (editingInvoice) {
      setActiveEditId(editingInvoice.id);
      setInvoiceNumber(editingInvoice.invoiceNumber);
      setInvoiceDate(editingInvoice.invoiceDate);
      setDeliveryDate(editingInvoice.deliveryDate || '');
      setOrderVia(editingInvoice.orderVia || 'WhatsApp');
      setSelectedClientId(editingInvoice.clientId);
      setCustomerName(editingInvoice.customerName);
      setCustomerMobile(editingInvoice.customerMobile);
      setCustomerWhatsapp(editingInvoice.customerWhatsapp);
      setCustomerAddress(editingInvoice.customerAddress);
      setCustomerCityStatePin(editingInvoice.customerCityStatePin);
      setItems(
        editingInvoice.items.length > 0
          ? editingInvoice.items
          : [makeEmptyLine(0)]
      );
      setDiscount(String(editingInvoice.discount));
      setGstPercent(String(editingInvoice.gstPercent || 0));
      setDeliveryCharge(String(editingInvoice.deliveryCharge));
      setPaidAmount(String(editingInvoice.paidAmount));
      setPaymentMethod(editingInvoice.paymentMethod);
      setCourierName(editingInvoice.courierName);
      setTrackingNumber(editingInvoice.trackingNumber);
      setTrackingUrl(editingInvoice.trackingUrl || '');
      setDeliveryStatus(editingInvoice.deliveryStatus);
      setNotes(editingInvoice.notes);
      setSubView('editor');
      return;
    }

    if (initialClientId) {
      const found = clients.find((c) => c.id === initialClientId);
      if (found) applyClientToForm(found);
    }
  }, [editingInvoice, initialClientId, clients]);

  const startBlankBill = () => {
    setActiveEditId(undefined);
    setInvoiceNumber(generateNextInvoiceNumber(invoices, settings.invoicePrefix || 'GG-'));
    setInvoiceDate(todayIsoDate());
    setDeliveryDate('');
    setOrderVia('WhatsApp');
    setSelectedClientId('');
    setCustomerName('');
    setCustomerMobile('');
    setCustomerWhatsapp('');
    setCustomerAddress('');
    setCustomerCityStatePin('');
    setItems([makeEmptyLine(0)]);
    setDiscount('0');
    setGstPercent('0');
    setDeliveryCharge('0');
    setPaidAmount('0');
    setPaymentMethod('UPI');
    setCourierName('');
    setTrackingNumber('');
    setTrackingUrl('');
    setDeliveryStatus('Pending');
    setNotes('');
    setError('');
    setSubView('editor');
  };

  const totals = useMemo(
    () =>
      computeInvoiceTotals({
        items,
        discount: Number(discount) || 0,
        gstPercent: Number(gstPercent) || 0,
        deliveryCharge: Number(deliveryCharge) || 0,
        paidAmount: Number(paidAmount) || 0,
      }),
    [items, discount, gstPercent, deliveryCharge, paidAmount]
  );

  const previewInvoice: Invoice = useMemo(
    () => ({
      id: activeEditId || 'preview',
      invoiceNumber: invoiceNumber || 'GG-001',
      invoiceDate,
      deliveryDate,
      orderVia,
      clientId: selectedClientId,
      customerName,
      customerMobile,
      customerWhatsapp,
      customerAddress,
      customerCityStatePin,
      items,
      ...totals,
      paymentMethod,
      courierName,
      trackingNumber,
      trackingUrl,
      deliveryStatus,
      notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [
      activeEditId,
      invoiceNumber,
      invoiceDate,
      deliveryDate,
      orderVia,
      selectedClientId,
      customerName,
      customerMobile,
      customerWhatsapp,
      customerAddress,
      customerCityStatePin,
      items,
      totals,
      paymentMethod,
      courierName,
      trackingNumber,
      trackingUrl,
      deliveryStatus,
      notes,
    ]
  );

  const whatsappShare = useMemo(
    () => buildWhatsAppInvoiceUrl(previewInvoice, settings),
    [previewInvoice, settings]
  );

  const handleSelectProductOnRow = (rowIdx: number, productId: string) => {
    if (!productId) {
      setItems((prev) =>
        prev.map((row, i) =>
          i === rowIdx ? { ...row, productId: undefined } : row
        )
      );
      return;
    }
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    setItems((prev) =>
      prev.map((row, i) =>
        i === rowIdx
          ? computeLineItem({
              id: row.id,
              productId: prod.id,
              productName: prod.name,
              size: prod.size,
              color: prod.color,
              quantity: row.quantity || 1,
              purchasePrice: prod.purchasePrice,
              sellingPrice: prod.sellingPrice,
            })
          : row
      )
    );
  };

  const updateRowField = (
    rowIdx: number,
    patch: Partial<
      Pick<
        InvoiceLineItem,
        | 'productName'
        | 'size'
        | 'color'
        | 'quantity'
        | 'originalPrice'
        | 'purchasePrice'
        | 'sellingPrice'
      >
    >
  ) => {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== rowIdx) return row;
        return computeLineItem({
          ...row,
          ...patch,
        });
      })
    );
  };

  const persistCurrentInvoice = async (): Promise<Invoice | null> => {
    setError('');
    if (!customerName.trim()) {
      setError('Please select a customer or enter customer name.');
      return null;
    }
    const validItems = items.filter((i) => i.productName.trim() !== '');
    if (validItems.length === 0) {
      setError('Please add at least one product with a name.');
      return null;
    }
    setSaving(true);
    try {
      const saved = await onSaveInvoice(
        {
          ...previewInvoice,
          items: validItems,
        },
        activeEditId
      );
      setActiveEditId(saved.id);
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!sheetRef.current) return;
    const saved = await persistCurrentInvoice();
    if (!saved) return;
    setExportingPdf(true);
    try {
      const safeName = (saved.customerName || 'Customer')
        .replace(/[^a-zA-Z0-9_-]+/g, '_');
      await exportInvoiceElementToPdf(
        sheetRef.current,
        `${saved.invoiceNumber}_${safeName}.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handleCopyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(whatsappShare.message);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const inputClass =
    'w-full rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] px-3 py-2 text-sm text-[#1F122B] focus:border-[#9333EA] focus:bg-white focus:outline-none';

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24 md:pb-10">
      {/* Top Toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
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
              Client Bill &amp; Invoice Generator
            </h1>
            <p className="text-xs text-[#6B5B7B] mt-0.5">
              Automatic profit &amp; due calculation, PDF export, and WhatsApp sharing.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F4ECF8] border border-[#E6D9EE]">
            <button
              type="button"
              onClick={() => setSubView('editor')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                subView === 'editor'
                  ? 'bg-white text-[#7E22CE] shadow-xs'
                  : 'text-[#5B4B6B]'
              }`}
            >
              Invoice Builder
            </button>
            <button
              type="button"
              onClick={() => setSubView('saved')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                subView === 'saved'
                  ? 'bg-white text-[#7E22CE] shadow-xs'
                  : 'text-[#5B4B6B]'
              }`}
            >
              All Bills ({invoices.length})
            </button>
          </div>

          <button
            type="button"
            onClick={startBlankBill}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6D9EE] bg-white px-3.5 py-2 text-xs font-semibold text-[#1F122B] hover:border-[#9333EA] whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#DB2777]" />
            <span>New Bill</span>
          </button>
        </div>
      </div>

      {subView === 'saved' ? (
        <div className="rounded-2xl border border-[#EFE2F5] bg-white overflow-x-auto">
          {invoices.length === 0 ? (
            <div className="py-14 px-6 text-center">
              <p className="text-sm text-[#6B5B7B] mb-4">No saved invoices yet.</p>
              <button
                type="button"
                onClick={startBlankBill}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Invoice</span>
              </button>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EFE2F5] bg-[#FDF8FC] text-xs font-semibold text-[#5B4B6B]">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Due</th>
                  <th className="py-3 px-4 text-right">Profit</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4ECF8] text-xs">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[#FDF9FC]">
                    <td className="py-3 px-4 font-mono-num font-bold text-[#6D28D9]">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-[#5B4B6B]">
                      {inv.invoiceDate}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#1F122B]">{inv.customerName}</div>
                      <div className="font-mono-num text-[#6B5B7B]">{inv.customerMobile}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold">
                      {formatCurrency(inv.totalAmount, sym)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-[#15803D]">
                      {formatCurrency(inv.paidAmount, sym)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono-num font-semibold ${
                        inv.dueAmount > 0 ? 'text-[#BE123C]' : 'text-[#6B5B7B]'
                      }`}
                    >
                      {formatCurrency(inv.dueAmount, sym)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-[#7E22CE]">
                      {formatCurrency(inv.profitAmount, sym)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveEditId(inv.id);
                            setInvoiceNumber(inv.invoiceNumber);
                            setInvoiceDate(inv.invoiceDate);
                            setDeliveryDate(inv.deliveryDate || '');
                            setOrderVia(inv.orderVia || 'WhatsApp');
                            setSelectedClientId(inv.clientId);
                            setCustomerName(inv.customerName);
                            setCustomerMobile(inv.customerMobile);
                            setCustomerWhatsapp(inv.customerWhatsapp);
                            setCustomerAddress(inv.customerAddress);
                            setCustomerCityStatePin(inv.customerCityStatePin);
                            setItems(inv.items.length > 0 ? inv.items : [makeEmptyLine(0)]);
                            setDiscount(String(inv.discount));
                            setGstPercent(String(inv.gstPercent || 0));
                            setDeliveryCharge(String(inv.deliveryCharge));
                            setPaidAmount(String(inv.paidAmount));
                            setPaymentMethod(inv.paymentMethod);
                            setCourierName(inv.courierName);
                            setTrackingNumber(inv.trackingNumber);
                            setTrackingUrl(inv.trackingUrl || '');
                            setDeliveryStatus(inv.deliveryStatus);
                            setNotes(inv.notes);
                            setSubView('editor');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#E6D9EE] px-2.5 py-1 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] cursor-pointer"
                        >
                          <FileEdit className="w-3.5 h-3.5" />
                          <span>Edit / PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(inv)}
                          className="p-1.5 rounded-lg border border-[#E6D9EE] text-[#6B5B7B] hover:text-[#BE123C] cursor-pointer"
                          title="Delete invoice"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[540px_1fr] gap-6 items-start">
          {/* LEFT: INVOICE BUILDER FORM */}
          <div className="no-print rounded-2xl border border-[#EFE2F5] bg-white p-5 space-y-5">
            {error && (
              <div className="rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-medium text-[#BE123C]">
                {error}
              </div>
            )}

            {/* Invoice Number, Dates & Order Via */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className={`${inputClass} font-mono-num font-semibold`}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Order Via
                </label>
                <input
                  type="text"
                  value={orderVia}
                  onChange={(e) => setOrderVia(e.target.value)}
                  placeholder="WhatsApp / Instagram / Direct"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Order Date
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Delivery Date
                </label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className={`${inputClass} font-mono-num`}
                />
              </div>
            </div>

            {/* Customer Selection */}
            <div className="space-y-3 pt-3 border-t border-[#F4ECF8]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#7E22CE]">
                  Customer Details
                </span>
                <button
                  type="button"
                  onClick={onAddNewClient}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#DB2777] hover:underline cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add New Client</span>
                </button>
              </div>

              {clients.length > 0 && (
                <select
                  value={selectedClientId}
                  onChange={(e) => {
                    const c = clients.find((cl) => cl.id === e.target.value);
                    if (c) applyClientToForm(c);
                    else setSelectedClientId('');
                  }}
                  className={inputClass}
                >
                  <option value="">-- Select Saved Client or Type Below --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.mobile})
                    </option>
                  ))}
                </select>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer Name *"
                  className={inputClass}
                />
                <input
                  type="tel"
                  value={customerMobile}
                  onChange={(e) => {
                    setCustomerMobile(e.target.value);
                    if (!customerWhatsapp) setCustomerWhatsapp(e.target.value);
                  }}
                  placeholder="Mobile Number"
                  className={`${inputClass} font-mono-num`}
                />
                <input
                  type="tel"
                  value={customerWhatsapp}
                  onChange={(e) => setCustomerWhatsapp(e.target.value)}
                  placeholder="WhatsApp Number"
                  className={`${inputClass} font-mono-num`}
                />
                <input
                  type="text"
                  value={customerCityStatePin}
                  onChange={(e) => setCustomerCityStatePin(e.target.value)}
                  placeholder="City, State - PIN"
                  className={inputClass}
                />
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="Full Street Address"
                  className={`${inputClass} sm:col-span-2`}
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-3 pt-3 border-t border-[#F4ECF8]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#7E22CE]">
                  Products &amp; Pricing
                </span>
                <button
                  type="button"
                  onClick={() => setItems((prev) => [...prev, makeEmptyLine(prev.length)])}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#FDF2F8] border border-[#FBCFE8] px-2.5 py-1 text-xs font-semibold text-[#BE185D] hover:bg-[#FCE7F3] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Product</span>
                </button>
              </div>

              <div className="space-y-3">
                {items.map((row, idx) => (
                  <div
                    key={row.id}
                    className="rounded-xl border border-[#EFE2F5] bg-[#FDF9FC] p-3 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[#6B5B7B]">
                        Item #{idx + 1}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setItems((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-xs text-[#BE123C] hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {products.length > 0 && (
                      <select
                        value={row.productId || ''}
                        onChange={(e) => handleSelectProductOnRow(idx, e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Pick from Product Catalog (optional)</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {formatCurrency(p.sellingPrice, sym)} (Stock:{' '}
                            {p.stockQty})
                          </option>
                        ))}
                      </select>
                    )}

                    <input
                      type="text"
                      value={row.productName}
                      onChange={(e) =>
                        updateRowField(idx, { productName: e.target.value })
                      }
                      placeholder="Product Name *"
                      className={inputClass}
                    />

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-[#6B5B7B] mb-0.5">
                          Size
                        </label>
                        <input
                          type="text"
                          value={row.size || ''}
                          onChange={(e) =>
                            updateRowField(idx, { size: e.target.value })
                          }
                          placeholder="XS/S/M/L"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-[#6B5B7B] mb-0.5">
                          Qty
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={(e) =>
                            updateRowField(idx, {
                              quantity: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className={`${inputClass} font-mono-num`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-[#6B5B7B] mb-0.5">
                          Original ({sym})
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.originalPrice ?? ''}
                          onChange={(e) =>
                            updateRowField(idx, {
                              originalPrice:
                                e.target.value === ''
                                  ? undefined
                                  : Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          placeholder="MRP"
                          className={`${inputClass} font-mono-num`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-[#6B5B7B] mb-0.5">
                          Selling ({sym})
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.sellingPrice}
                          onChange={(e) =>
                            updateRowField(idx, {
                              sellingPrice: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className={`${inputClass} font-mono-num`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-[#6B5B7B] mb-0.5">
                          Cost ({sym})
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.purchasePrice}
                          onChange={(e) =>
                            updateRowField(idx, {
                              purchasePrice: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className={`${inputClass} font-mono-num`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono-num text-[#5B4B6B] pt-1">
                      <span>Line Profit: {formatCurrency(row.lineProfit, sym)}</span>
                      <span className="font-bold text-[#1F122B]">
                        Line Total: {formatCurrency(row.lineTotal, sym)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Discount, GST, Delivery, Payment & Courier */}
            <div className="space-y-3 pt-3 border-t border-[#F4ECF8]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                    Discount ({sym})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                    GST (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={gstPercent}
                    onChange={(e) => setGstPercent(e.target.value)}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                    Delivery ({sym})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={deliveryCharge}
                    onChange={(e) => setDeliveryCharge(e.target.value)}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-[#4A3B59]">
                      Paid ({sym})
                    </label>
                    <button
                      type="button"
                      onClick={() => setPaidAmount(String(totals.totalAmount))}
                      className="text-[10px] font-semibold text-[#7E22CE] hover:underline cursor-pointer"
                    >
                      Full
                    </button>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as PaymentMethod)
                    }
                    className={inputClass}
                  >
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash / COD</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                    Courier Name
                  </label>
                  <input
                    type="text"
                    value={courierName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCourierName(val);
                      const autoUrl = suggestTrackingUrl(val);
                      if (autoUrl && (!trackingUrl || trackingUrl === suggestTrackingUrl(courierName))) {
                        setTrackingUrl(autoUrl);
                      }
                    }}
                    placeholder="Xpressbees / Delhivery / DTDC"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                    Tracking # / AWB
                  </label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="AWB12345"
                    className={`${inputClass} font-mono-num`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A3B59] mb-1">
                  Tracking URL (optional)
                </label>
                <input
                  type="url"
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  placeholder="https://www.xpressbees.com/shipment/tracking"
                  className={`${inputClass} font-mono-num text-xs`}
                />
              </div>
            </div>

            {/* Automatic Summary Box */}
            <div className="rounded-xl border border-[#E5DAF8] bg-gradient-to-br from-[#FDF4FA] to-[#F6F0FF] p-4 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#5B4B6B]">Total Bill Amount</span>
                <span className="font-mono-num font-bold text-sm text-[#1F122B]">
                  {formatCurrency(totals.totalAmount, sym)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5B4B6B]">Due Amount</span>
                <span
                  className={`font-mono-num font-bold ${
                    totals.dueAmount > 0 ? 'text-[#BE123C]' : 'text-[#15803D]'
                  }`}
                >
                  {formatCurrency(totals.dueAmount, sym)}
                </span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-[#E5DAF8]">
                <span className="font-semibold text-[#6D28D9]">
                  Auto Calculated Profit
                </span>
                <span
                  className={`font-mono-num font-bold ${
                    totals.profitAmount >= 0 ? 'text-[#15803D]' : 'text-[#BE123C]'
                  }`}
                >
                  {formatCurrency(totals.profitAmount, sym)}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={saving}
                onClick={persistCurrentInvoice}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#7E22CE] bg-white px-4 py-2.5 text-xs font-semibold text-[#7E22CE] hover:bg-[#F5F3FF] cursor-pointer disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span>
                  {saving ? 'Saving...' : activeEditId ? 'Update Invoice' : 'Save Invoice'}
                </span>
              </button>

              <button
                type="button"
                disabled={saving || exportingPdf}
                onClick={handleDownloadPdf}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#7E22CE] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                <span>{exportingPdf ? 'Creating PDF...' : 'Save & Download PDF'}</span>
              </button>

              <a
                href={whatsappShare.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-2.5 text-xs font-semibold text-[#15803D] hover:bg-[#DCFCE7]"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Share via WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={handleCopyWhatsApp}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E6D9EE] bg-white px-4 py-2.5 text-xs font-semibold text-[#4A3B59] hover:border-[#9333EA] cursor-pointer"
              >
                {copiedMsg ? (
                  <>
                    <Check className="w-4 h-4 text-[#15803D]" />
                    <span>Copied Summary</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Bill Text</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* RIGHT: LIVE PRINTABLE A4 INVOICE PREVIEW */}
          <div className="bg-[#F4ECF8]/60 rounded-2xl border border-[#EFE2F5] p-3 sm:p-4 flex flex-col items-center">
            <div className="no-print w-full max-w-[794px] flex items-center justify-between text-xs text-[#6B5B7B] mb-2">
              <span>Live Invoice Preview</span>
              <span className="font-mono-num">A4 · PDF Ready</span>
            </div>
            <div className="w-full max-w-[794px]">
              <ScaledInvoicePreview
                invoice={previewInvoice}
                settings={settings}
                sheetRef={sheetRef}
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice "${deleteTarget?.invoiceNumber}" for ${deleteTarget?.customerName}? Product stock quantities will be restored.`}
        confirmLabel="Delete Invoice"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await onDeleteInvoice(deleteTarget.id);
          if (activeEditId === deleteTarget.id) {
            startBlankBill();
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
