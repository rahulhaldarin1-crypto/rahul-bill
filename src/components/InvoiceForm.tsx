import React, { useState } from 'react';
import { ClipboardPaste, Plus, Trash2, ArrowRight, UserPlus } from 'lucide-react';
import {
  COURIER_PRESETS,
  DEFAULT_CATALOG_PRESETS,
  ORDER_VIA_CHOICES,
  SIZE_CHOICES,
} from '../data/defaults';
import { Translations } from '../i18n/translations';
import { ClientRecord, InvoiceData, OrderItem, PaymentMethod } from '../types/invoice';
import {
  calculateTotals,
  formatMoney,
  getItemAmount,
  incrementInvoiceNumber,
  parseCustomerText,
} from '../utils/invoiceHelpers';

interface InvoiceFormProps {
  invoice: InvoiceData;
  clients: ClientRecord[];
  onSaveAsClient: (customer: InvoiceData['customer']) => void;
  onChange: (updated: InvoiceData) => void;
  t: Translations;
}

export const InvoiceForm: React.FC<InvoiceFormProps> = ({
  invoice,
  clients,
  onSaveAsClient,
  onChange,
  t,
}) => {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [rawPasteText, setRawPasteText] = useState('');

  const totals = calculateTotals(invoice);

  const updateCustomer = (field: keyof InvoiceData['customer'], value: string) => {
    onChange({
      ...invoice,
      customer: { ...invoice.customer, [field]: value },
      updatedAt: new Date().toISOString(),
    });
  };

  const updateMeta = (field: keyof InvoiceData['meta'], value: string) => {
    onChange({
      ...invoice,
      meta: { ...invoice.meta, [field]: value },
      updatedAt: new Date().toISOString(),
    });
  };

  const updateShipment = (field: keyof InvoiceData['shipment'], value: string) => {
    const nextShipment = { ...invoice.shipment, [field]: value };
    if (field === 'courier' && COURIER_PRESETS[value]) {
      nextShipment.trackingUrl = COURIER_PRESETS[value];
    }
    onChange({
      ...invoice,
      shipment: nextShipment,
      updatedAt: new Date().toISOString(),
    });
  };

  const updateItem = (id: string, patch: Partial<OrderItem>) => {
    onChange({
      ...invoice,
      items: invoice.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      updatedAt: new Date().toISOString(),
    });
  };

  const addEmptyItem = () => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      productName: '',
      size: 'M',
      qty: 1,
      originalPrice: '',
      discountedPrice: '',
    };
    onChange({
      ...invoice,
      items: [...invoice.items, newItem],
      updatedAt: new Date().toISOString(),
    });
  };

  const addPresetItem = (presetId: string) => {
    const preset = DEFAULT_CATALOG_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      productName: preset.productName,
      size: preset.defaultSize,
      qty: 1,
      originalPrice: preset.originalPrice,
      discountedPrice: preset.discountedPrice,
    };
    // Replace single blank item if untouched, otherwise append
    const hasOnlyOneBlank =
      invoice.items.length === 1 &&
      invoice.items[0].productName.trim() === '' &&
      invoice.items[0].discountedPrice === '' &&
      invoice.items[0].originalPrice === '';

    onChange({
      ...invoice,
      items: hasOnlyOneBlank ? [newItem] : [...invoice.items, newItem],
      updatedAt: new Date().toISOString(),
    });
  };

  const removeItem = (id: string) => {
    if (invoice.items.length <= 1) {
      onChange({
        ...invoice,
        items: [
          {
            id: `item-${Date.now()}`,
            productName: '',
            size: 'M',
            qty: 1,
            originalPrice: '',
            discountedPrice: '',
          },
        ],
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    onChange({
      ...invoice,
      items: invoice.items.filter((item) => item.id !== id),
      updatedAt: new Date().toISOString(),
    });
  };

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    const labelMap: Record<PaymentMethod, string> = {
      COD: 'COD',
      UPI: 'UPI',
      BANK_TRANSFER: 'Bank Transfer',
    };
    onChange({
      ...invoice,
      paymentMethod: method,
      meta: {
        ...invoice.meta,
        paymentLabel: labelMap[method],
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleApplyPaste = () => {
    const parsed = parseCustomerText(rawPasteText);
    onChange({
      ...invoice,
      customer: {
        name: parsed.name ?? invoice.customer.name,
        phone: parsed.phone ?? invoice.customer.phone,
        address: parsed.address ?? invoice.customer.address,
        cityPin: parsed.cityPin ?? invoice.customer.cityPin,
      },
      updatedAt: new Date().toISOString(),
    });
    setRawPasteText('');
    setPasteOpen(false);
  };

  const inputClass =
    'w-full rounded-md border border-[#DDD7CB] bg-white px-3 py-2 text-sm text-[#181613] placeholder:text-[#9A9284] focus:border-[#A8822E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A449]/35 transition-colors';
  const labelClass = 'block text-xs font-medium text-[#5A5347] mb-1.5';

  return (
    <div className="space-y-6">
      {/* 1. CUSTOMER DETAILS */}
      <section className="pb-6 border-b border-[#E5E0D5]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
          <h2 className="text-sm font-semibold text-[#181613] tracking-tight">
            01. {t.sectionCustomer}
          </h2>
          <div className="flex items-center gap-2">
            {invoice.customer.name.trim() && (
              <button
                type="button"
                onClick={() => onSaveAsClient(invoice.customer)}
                className="inline-flex items-center gap-1 rounded-md border border-[#DDD7CB] bg-white px-2.5 py-1.5 text-xs font-medium text-[#181613] hover:bg-[#F2ECE0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5 text-[#7D6635]" />
                <span>{t.saveToClients}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setPasteOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#D4C7AE] bg-[#FAF8F4] px-2.5 py-1.5 text-xs font-medium text-[#6B5422] hover:bg-[#F2ECE0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>{t.quickPasteBtn}</span>
            </button>
          </div>
        </div>

        {clients.length > 0 && (
          <div className="mb-3.5">
            <select
              defaultValue=""
              onChange={(e) => {
                const chosen = clients.find((c) => c.id === e.target.value);
                if (chosen) {
                  onChange({
                    ...invoice,
                    clientId: chosen.id,
                    customer: {
                      name: chosen.name,
                      phone: chosen.phone,
                      address: chosen.address,
                      cityPin: chosen.cityPin,
                    },
                    updatedAt: new Date().toISOString(),
                  });
                  e.target.value = '';
                }
              }}
              className="w-full rounded-md border border-[#D4C7AE] bg-[#FAF7F0] px-3 py-2 text-xs font-medium text-[#4A4338] focus:border-[#A8822E] focus:outline-none cursor-pointer"
            >
              <option value="" disabled>
                {t.selectSavedClient}
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''} {c.cityPin ? `· ${c.cityPin}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {pasteOpen && (
          <div className="mb-4 rounded-lg border border-[#D4C7AE] bg-[#FAF7F0] p-3.5">
            <div className="text-xs font-semibold text-[#181613] mb-1">{t.quickPasteTitle}</div>
            <p className="text-xs text-[#6B6356] mb-2.5">{t.quickPasteDesc}</p>
            <textarea
              rows={4}
              value={rawPasteText}
              onChange={(e) => setRawPasteText(e.target.value)}
              placeholder={t.quickPastePlaceholder}
              className={`${inputClass} text-xs mb-2.5`}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasteOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-[#6B6356] hover:text-[#181613] rounded-md cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleApplyPaste}
                disabled={!rawPasteText.trim()}
                className="px-3.5 py-1.5 text-xs font-semibold bg-[#181613] text-[#F5EFE4] rounded-md hover:bg-[#2C2721] disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                {t.applyParsed}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className={labelClass}>{t.customerName}</label>
            <input
              type="text"
              value={invoice.customer.name}
              onChange={(e) => updateCustomer('name', e.target.value)}
              placeholder="e.g. Anil Barman"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t.customerPhone}</label>
            <input
              type="text"
              value={invoice.customer.phone}
              onChange={(e) => updateCustomer('phone', e.target.value)}
              placeholder="+916000294107"
              className={`${inputClass} font-mono-num`}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{t.customerAddress}</label>
            <textarea
              rows={2}
              value={invoice.customer.address}
              onChange={(e) => updateCustomer('address', e.target.value)}
              placeholder="House / Street / Landmark"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{t.customerCityPin}</label>
            <input
              type="text"
              value={invoice.customer.cityPin}
              onChange={(e) => updateCustomer('cityPin', e.target.value)}
              placeholder="e.g. Assam-781028"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* 2. INVOICE METADATA */}
      <section className="pb-6 border-b border-[#E5E0D5]">
        <h2 className="text-sm font-semibold text-[#181613] tracking-tight mb-4">
          02. {t.sectionInvoiceMeta}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#5A5347]">{t.invoiceNo}</label>
              <button
                type="button"
                onClick={() => updateMeta('invoiceNo', incrementInvoiceNumber(invoice.meta.invoiceNo))}
                className="text-[11px] font-medium text-[#9A7422] hover:text-[#6E5114] inline-flex items-center gap-0.5 cursor-pointer"
              >
                <span>{t.autoNext}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <input
              type="text"
              value={invoice.meta.invoiceNo}
              onChange={(e) => updateMeta('invoiceNo', e.target.value)}
              className={`${inputClass} font-mono-num`}
            />
          </div>
          <div>
            <label className={labelClass}>{t.orderVia}</label>
            <select
              value={invoice.meta.orderVia}
              onChange={(e) => updateMeta('orderVia', e.target.value)}
              className={inputClass}
            >
              <option value="">Select...</option>
              {ORDER_VIA_CHOICES.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t.orderDate}</label>
            <input
              type="text"
              value={invoice.meta.orderDate}
              onChange={(e) => updateMeta('orderDate', e.target.value)}
              placeholder="DD / MM / YY"
              className={`${inputClass} font-mono-num`}
            />
          </div>
          <div>
            <label className={labelClass}>{t.deliveryDate}</label>
            <input
              type="text"
              value={invoice.meta.deliveryDate}
              onChange={(e) => updateMeta('deliveryDate', e.target.value)}
              placeholder="DD / MM / YY"
              className={`${inputClass} font-mono-num`}
            />
          </div>
        </div>
      </section>

      {/* 3. ORDER ITEMS */}
      <section className="pb-6 border-b border-[#E5E0D5]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-sm font-semibold text-[#181613] tracking-tight">
            03. {t.sectionItems}
          </h2>
          <div className="flex items-center gap-2">
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  addPresetItem(e.target.value);
                  e.target.value = '';
                }
              }}
              className="rounded-md border border-[#DDD7CB] bg-white px-2.5 py-1.5 text-xs text-[#4A4338] focus:border-[#A8822E] focus:outline-none cursor-pointer"
            >
              <option value="" disabled>
                {t.quickAddProduct}
              </option>
              {DEFAULT_CATALOG_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.productName.slice(0, 34)} (₹{preset.discountedPrice})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addEmptyItem}
              className="inline-flex items-center gap-1 rounded-md bg-[#181613] px-3 py-1.5 text-xs font-medium text-[#F5EFE4] hover:bg-[#2E2923] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.addItem}</span>
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {invoice.items.map((item, idx) => {
            const lineTotal = getItemAmount(item);
            return (
              <div
                key={item.id}
                className="rounded-lg border border-[#E2DDD2] bg-white p-3.5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="font-mono-num text-xs font-semibold text-[#8E7748] w-5 shrink-0">
                      #{idx + 1}
                    </span>
                    <input
                      type="text"
                      value={item.productName}
                      onChange={(e) => updateItem(item.id, { productName: e.target.value })}
                      placeholder={t.productName}
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label="Remove product"
                    className="p-2 text-[#8C8374] hover:text-[#B91C1C] transition-colors rounded-md cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-end">
                  <div>
                    <label className="block text-[11px] font-medium text-[#6B6356] mb-1">
                      {t.size}
                    </label>
                    <select
                      value={item.size}
                      onChange={(e) => updateItem(item.id, { size: e.target.value })}
                      className={inputClass}
                    >
                      {SIZE_CHOICES.map((sz) => (
                        <option key={sz} value={sz}>
                          {sz}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#6B6356] mb-1">
                      {t.qty}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={(e) =>
                        updateItem(item.id, {
                          qty: e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1),
                        })
                      }
                      onBlur={() => {
                        if (item.qty === '') updateItem(item.id, { qty: 1 });
                      }}
                      className={`${inputClass} font-mono-num`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#6B6356] mb-1">
                      {t.originalPrice}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={item.originalPrice}
                      onChange={(e) =>
                        updateItem(item.id, {
                          originalPrice: e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                      placeholder="Optional"
                      className={`${inputClass} font-mono-num`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#6B6356] mb-1">
                      {t.discountedPrice}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={item.discountedPrice}
                      onChange={(e) =>
                        updateItem(item.id, {
                          discountedPrice: e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                      placeholder="570"
                      className={`${inputClass} font-mono-num`}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end text-xs text-[#6B6356]">
                  <span>{t.amount}: </span>
                  <span className="font-mono-num font-semibold text-[#181613] ml-1.5">
                    ₹ {formatMoney(lineTotal)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. SHIPPING, DELIVERY & GST */}
      <section className="pb-6 border-b border-[#E5E0D5]">
        <h2 className="text-sm font-semibold text-[#181613] tracking-tight mb-4">
          04. {t.sectionShippingCharges}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className={labelClass}>{t.courier}</label>
            <select
              value={Object.keys(COURIER_PRESETS).includes(invoice.shipment.courier) ? invoice.shipment.courier : 'Custom'}
              onChange={(e) => {
                if (e.target.value !== 'Custom') {
                  updateShipment('courier', e.target.value);
                }
              }}
              className={inputClass}
            >
              {Object.keys(COURIER_PRESETS).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="Custom">Custom</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t.trackingId}</label>
            <input
              type="text"
              value={invoice.shipment.trackingId}
              onChange={(e) => updateShipment('trackingId', e.target.value)}
              placeholder="AWB / Tracking number"
              className={`${inputClass} font-mono-num`}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>{t.trackingUrl}</label>
            <input
              type="url"
              value={invoice.shipment.trackingUrl}
              onChange={(e) => updateShipment('trackingUrl', e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t.deliveryCharge}</label>
            <input
              type="number"
              min={0}
              value={invoice.deliveryCharge}
              onChange={(e) =>
                onChange({
                  ...invoice,
                  deliveryCharge:
                    e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0),
                  updatedAt: new Date().toISOString(),
                })
              }
              placeholder="0"
              className={`${inputClass} font-mono-num`}
            />
          </div>
          <div>
            <label className={labelClass}>{t.gstPercent}</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={invoice.gstPercent}
              onChange={(e) =>
                onChange({
                  ...invoice,
                  gstPercent:
                    e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0),
                  updatedAt: new Date().toISOString(),
                })
              }
              placeholder="0"
              className={`${inputClass} font-mono-num`}
            />
          </div>
        </div>
      </section>

      {/* 5. PAYMENT METHOD */}
      <section>
        <h2 className="text-sm font-semibold text-[#181613] tracking-tight mb-4">
          05. {t.sectionPayment}
        </h2>
        <div className="grid grid-cols-3 gap-2 p-1 rounded-lg bg-[#EBE6DC] mb-4">
          {(
            [
              { key: 'COD', label: 'COD' },
              { key: 'UPI', label: 'UPI' },
              { key: 'BANK_TRANSFER', label: 'Bank Transfer' },
            ] as const
          ).map((opt) => {
            const active = invoice.paymentMethod === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => handlePaymentMethodChange(opt.key)}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#181613] text-[#F5EFE4] shadow-xs'
                    : 'text-[#5A5347] hover:text-[#181613]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {invoice.paymentMethod === 'COD' && (
          <div>
            <label className={labelClass}>{t.codAmountHelper}</label>
            <input
              type="number"
              min={0}
              value={invoice.codAmountOverride}
              onChange={(e) =>
                onChange({
                  ...invoice,
                  codAmountOverride: e.target.value === '' ? '' : Number(e.target.value),
                  updatedAt: new Date().toISOString(),
                })
              }
              placeholder={`Auto: ₹ ${formatMoney(totals.grandTotal)}`}
              className={`${inputClass} font-mono-num`}
            />
          </div>
        )}

        <div className="mt-4 rounded-lg border border-[#DFD8C9] bg-[#FAF8F4] px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#5A5347]">
            <span>Subtotal</span>
            <span className="font-mono-num">₹ {formatMoney(totals.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#5A5347]">
            <span>Delivery Charge</span>
            <span className="font-mono-num">₹ {formatMoney(totals.deliveryCharge)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#5A5347]">
            <span>GST ({Number(invoice.gstPercent || 0)}%)</span>
            <span className="font-mono-num">₹ {formatMoney(totals.gstAmount)}</span>
          </div>
          <div className="pt-2 border-t border-[#E4DEC9] flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#6B5422]">
              Grand Total (Auto)
            </span>
            <span className="font-mono-num text-lg font-bold text-[#181613]">
              ₹ {formatMoney(totals.grandTotal)}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
