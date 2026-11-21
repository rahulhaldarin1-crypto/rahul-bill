import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { BusinessSettings, Invoice } from '../types/business';
import { formatShortDate, suggestTrackingUrl } from '../utils/calculations';
import { BrandLogo } from './BrandLogo';

interface InvoiceSheetProps {
  invoice: Invoice;
  settings: BusinessSettings;
  sheetRef?: React.RefObject<HTMLDivElement | null>;
}

function formatNum(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

const CheckBoxMark: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span className="inline-flex items-center gap-1 align-middle">
    <span
      className="inline-flex items-center justify-center w-3.5 h-3.5 border border-[#D5AE52] bg-[#12100E] shrink-0"
      aria-checked={checked}
    />
    {checked && (
      <svg
        width="16"
        height="14"
        viewBox="0 0 18 15"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 -ml-0.5"
      >
        <path
          d="M2 8.5L6.5 13L16 2"
          stroke="#D5AE52"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )}
  </span>
);

export const InvoiceSheet: React.FC<InvoiceSheetProps> = ({
  invoice,
  settings,
  sheetRef,
}) => {
  const sym = settings.currencySymbol || '₹';
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const upiId = (settings.upiId || '').trim();
  const payableForUpi =
    invoice.dueAmount > 0 ? invoice.dueAmount : invoice.totalAmount;

  useEffect(() => {
    let active = true;
    if (!upiId) {
      setQrDataUrl('');
      return;
    }
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
      settings.businessName || 'Glamour Galleria'
    )}&am=${encodeURIComponent(payableForUpi > 0 ? String(payableForUpi) : '')}&cu=INR&tn=${encodeURIComponent(
      `Invoice ${invoice.invoiceNumber || ''}`
    )}`;

    QRCode.toDataURL(upiUri, {
      width: 140,
      margin: 1,
      color: { dark: '#12100E', light: '#FFFFFF' },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [upiId, settings.businessName, payableForUpi, invoice.invoiceNumber]);

  const brandName = (settings.businessName || 'Glamour Galleria').toUpperCase();
  const invoiceSubtitle =
    settings.tagline && settings.tagline !== 'Your Style, Our Priority'
      ? settings.tagline
      : "Women's Fashion & Cosmetics";
  const businessLocation = settings.address?.trim() || 'Kolkata, West Bengal, India';
  const resolvedTrackingUrl =
    (invoice.trackingUrl || '').trim() || suggestTrackingUrl(invoice.courierName);

  const minRows = 6;
  const totalRowCount = Math.max(minRows, invoice.items.length);
  const displayRows = Array.from({ length: totalRowCount }, (_, i) => invoice.items[i] || null);

  const isUpi = invoice.paymentMethod === 'UPI';
  const isBank = invoice.paymentMethod === 'Bank Transfer';
  const isCod = invoice.paymentMethod === 'Cash';

  const codDisplayAmount =
    isCod && (invoice.dueAmount > 0 || invoice.totalAmount > 0)
      ? formatNum(invoice.dueAmount > 0 ? invoice.dueAmount : invoice.totalAmount)
      : '';

  return (
    <div
      ref={sheetRef}
      style={{ width: '794px', minHeight: '1123px', backgroundColor: '#12100E' }}
      className="text-[#F5EFE4] flex flex-col justify-between px-9 py-6 select-text"
    >
      <div>
        {/* HEADER */}
        <div className="relative flex items-center justify-center min-h-[104px] pb-3">
          <div className="absolute left-0 top-0">
            <BrandLogo
              logoDataUrl={settings.logoDataUrl}
              businessName={settings.businessName}
              size={98}
            />
          </div>

          <div className="text-center px-28 pt-2">
            <h1 className="font-display-serif text-[27px] font-bold tracking-[0.06em] text-[#D5AE52] leading-tight">
              {brandName}
            </h1>
            <p className="text-[12.5px] italic text-[#E2DBD0] mt-0.5">
              {invoiceSubtitle}
            </p>
            <p className="text-[11px] text-[#D6CEBF] mt-0.5">{businessLocation}</p>
            {(settings.mobile || settings.gstin) && (
              <p className="text-[10px] text-[#BEB4A2] font-mono-num mt-0.5">
                {[
                  settings.mobile ? `Ph: ${settings.mobile}` : '',
                  settings.gstin ? `GSTIN: ${settings.gstin}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* GOLD HEADER DIVIDER & INVOICE TITLE */}
        <div className="border-t-[1.5px] border-[#C9A449]" />
        <div className="text-center py-2">
          <span className="font-display-serif text-[18px] font-bold tracking-[0.08em] text-[#D5AE52]">
            INVOICE
          </span>
        </div>

        {/* BILL TO & INVOICE DETAILS 2-COLUMN BOX */}
        <div className="grid grid-cols-2 border border-[#8C7030] bg-[#161310] text-[11.5px] leading-[1.45]">
          <div className="p-3 border-r border-[#8C7030] space-y-0.5">
            <div className="font-display-serif text-[11.5px] font-bold tracking-wide text-[#D5AE52] uppercase mb-1">
              BILL TO
            </div>
            <div>
              <span className="font-bold text-[#F5EFE4]">Name: </span>
              <span className="text-[#F5EFE4]">{invoice.customerName || '—'}</span>
            </div>
            <div>
              <span className="font-bold text-[#F5EFE4]">Phone: </span>
              <span className="font-mono-num text-[#F5EFE4]">
                {invoice.customerMobile || '—'}
              </span>
            </div>
            <div>
              <span className="font-bold text-[#F5EFE4]">Address: </span>
              <span className="text-[#F5EFE4]">{invoice.customerAddress || '—'}</span>
            </div>
            <div>
              <span className="font-bold text-[#F5EFE4]">City / PIN: </span>
              <span className="text-[#F5EFE4]">
                {invoice.customerCityStatePin || '—'}
              </span>
            </div>
          </div>

          <div className="p-3 space-y-0.5">
            <div className="font-display-serif text-[11.5px] font-bold tracking-wide text-[#D5AE52] uppercase mb-1">
              INVOICE DETAILS
            </div>
            <div>
              <span className="font-bold text-[#D5AE52]">Invoice No: </span>
              <span className="font-mono-num text-[#E2BE68]">
                {invoice.invoiceNumber || 'GG-001'}
              </span>
            </div>
            <div>
              <span className="font-bold text-[#D5AE52]">Order Date: </span>
              <span className="font-mono-num text-[#E2BE68]">
                [{formatShortDate(invoice.invoiceDate) || '—'}]
              </span>
            </div>
            <div>
              <span className="font-bold text-[#D5AE52]">Delivery Date: </span>
              <span className="font-mono-num text-[#E2BE68]">
                [{invoice.deliveryDate ? formatShortDate(invoice.deliveryDate) : 'Pending'}]
              </span>
            </div>
            <div>
              <span className="font-bold text-[#D5AE52]">Order via: </span>
              <span className="text-[#E2BE68]">[{invoice.orderVia || 'WhatsApp'}]</span>
            </div>
            <div>
              <span className="font-bold text-[#D5AE52]">Payment: </span>
              <span className="text-[#E2BE68]">
                [{isCod ? 'COD' : invoice.paymentMethod}]
              </span>
            </div>
          </div>
        </div>

        {/* ORDER DETAILS TABLE */}
        <div className="mt-3.5">
          <div className="font-display-serif text-[13px] font-bold tracking-wide text-[#D5AE52] uppercase mb-1.5">
            ORDER DETAILS
          </div>

          <table className="w-full border-collapse border border-[#8C7030] text-[11px]">
            <thead>
              <tr
                style={{
                  background: 'linear-gradient(180deg, #DFBE66 0%, #C69C3E 100%)',
                }}
                className="text-[#12100E] font-bold"
              >
                <th className="border border-[#7D6125] py-1.5 px-2 text-center w-8">#</th>
                <th className="border border-[#7D6125] py-1.5 px-2.5 text-left">
                  Product Name
                </th>
                <th className="border border-[#7D6125] py-1.5 px-2 text-center w-14">
                  Size
                </th>
                <th className="border border-[#7D6125] py-1.5 px-2 text-center w-11">
                  Qty
                </th>
                <th className="border border-[#7D6125] py-1.5 px-2 text-right w-28">
                  Original Price ({sym})
                </th>
                <th className="border border-[#7D6125] py-1.5 px-2 text-right w-32">
                  Discounted Price ({sym})
                </th>
                <th className="border border-[#7D6125] py-1.5 px-2 text-right w-24">
                  Amount ({sym})
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((item, idx) => (
                <tr key={item ? item.id : `empty-${idx}`} className="bg-[#15120F]">
                  <td className="border border-[#6E5726] py-1.5 px-2 text-center font-mono-num text-[#E2DBD0] h-[27px]">
                    {idx + 1}
                  </td>
                  <td className="border border-[#6E5726] py-1.5 px-2.5 text-[#F5EFE4] font-medium">
                    {item
                      ? `${item.productName}${item.color ? ` (${item.color})` : ''}`
                      : ''}
                  </td>
                  <td className="border border-[#6E5726] py-1.5 px-2 text-center text-[#F5EFE4]">
                    {item?.size || ''}
                  </td>
                  <td className="border border-[#6E5726] py-1.5 px-2 text-center font-mono-num text-[#F5EFE4]">
                    {item ? item.quantity : ''}
                  </td>
                  <td className="border border-[#6E5726] py-1.5 px-2 text-right font-mono-num text-[#D6CEBF]">
                    {item && item.originalPrice && item.originalPrice > 0
                      ? formatNum(item.originalPrice)
                      : ''}
                  </td>
                  <td className="border border-[#6E5726] py-1.5 px-2 text-right font-mono-num text-[#F5EFE4]">
                    {item ? formatNum(item.sellingPrice) : ''}
                  </td>
                  <td className="border border-[#6E5726] py-1.5 px-2 text-right font-mono-num font-semibold text-[#F5EFE4]">
                    {item ? formatNum(item.lineTotal) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="text-[10.5px] italic text-[#C9A449] mt-1">
            Size options: XS / S / M / L
          </div>
        </div>

        {/* SHIPMENT TRACKING & SUMMARY TOTALS */}
        <div className="mt-3 grid grid-cols-[1fr_325px] gap-4 items-start">
          {/* Shipment Tracking Box */}
          <div className="border border-[#8C7030] bg-[#15120F] p-3 text-[11px] leading-[1.5]">
            <div className="font-display-serif text-[11.5px] font-bold tracking-wide text-[#D5AE52] uppercase mb-1">
              SHIPMENT TRACKING
            </div>
            <div>
              <span className="font-bold text-[#F5EFE4]">Courier: </span>
              <span className="text-[#D5AE52]">
                {invoice.courierName || 'Standard Dispatch'}
              </span>
            </div>
            <div>
              <span className="font-bold text-[#F5EFE4]">Tracking ID / AWB No: </span>
              <span className="font-mono-num text-[#D5AE52]">
                {invoice.trackingNumber || '[Enter tracking number]'}
              </span>
            </div>
            <div className="mt-1">
              {/^https?:\/\//i.test(resolvedTrackingUrl) ? (
                <a
                  href={resolvedTrackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#D5AE52] underline font-semibold"
                >
                  Click here to track your order
                </a>
              ) : (
                <span className="text-[#D5AE52] underline font-semibold">
                  Click here to track your order
                </span>
              )}
              {resolvedTrackingUrl && (
                <div className="text-[10px] text-[#C4B9A6] break-all mt-0.5">
                  {resolvedTrackingUrl}
                </div>
              )}
            </div>
          </div>

          {/* Right Summary Totals Table */}
          <table className="w-full border-collapse border border-[#8C7030] text-[11.5px]">
            <tbody>
              <tr className="bg-[#15120F]">
                <td className="border border-[#6E5726] py-1.5 px-3 text-[#F5EFE4]">
                  Subtotal
                </td>
                <td className="border border-[#6E5726] py-1.5 px-3 text-right font-mono-num text-[#F5EFE4] w-28">
                  {sym} {formatNum(invoice.subtotal)}
                </td>
              </tr>
              {invoice.discount > 0 && (
                <tr className="bg-[#15120F]">
                  <td className="border border-[#6E5726] py-1.5 px-3 text-[#E2BE68]">
                    Discount
                  </td>
                  <td className="border border-[#6E5726] py-1.5 px-3 text-right font-mono-num text-[#E2BE68]">
                    - {sym} {formatNum(invoice.discount)}
                  </td>
                </tr>
              )}
              <tr className="bg-[#15120F]">
                <td className="border border-[#6E5726] py-1.5 px-3 text-[#F5EFE4]">
                  Delivery Charge
                </td>
                <td className="border border-[#6E5726] py-1.5 px-3 text-right font-mono-num text-[#F5EFE4]">
                  {invoice.deliveryCharge > 0
                    ? `${sym} ${formatNum(invoice.deliveryCharge)}`
                    : `${sym} 0`}
                </td>
              </tr>
              <tr className="bg-[#15120F]">
                <td className="border border-[#6E5726] py-1.5 px-3 text-[#F5EFE4]">
                  GST (if applicable){' '}
                  <span className="font-mono-num text-[#E2BE68]">
                    [{invoice.gstPercent ? invoice.gstPercent : ' '}]%
                  </span>
                </td>
                <td className="border border-[#6E5726] py-1.5 px-3 text-right font-mono-num text-[#F5EFE4]">
                  {sym} {formatNum(invoice.gstAmount || 0)}
                </td>
              </tr>
              <tr
                style={{
                  background: 'linear-gradient(180deg, #DFBE66 0%, #C69C3E 100%)',
                }}
                className="text-[#12100E] font-bold"
              >
                <td className="border border-[#7D6125] py-1.5 px-3">GRAND TOTAL</td>
                <td className="border border-[#7D6125] py-1.5 px-3 text-right font-mono-num">
                  {sym} {formatNum(invoice.totalAmount)}
                </td>
              </tr>
              {(invoice.paidAmount > 0 || invoice.dueAmount > 0) &&
                invoice.paidAmount !== invoice.totalAmount && (
                  <tr className="bg-[#181410] text-[10.5px]">
                    <td className="border border-[#6E5726] py-1 px-3 text-[#D6CEBF]">
                      Paid: <span className="font-mono-num text-[#E2BE68]">{sym} {formatNum(invoice.paidAmount)}</span>
                    </td>
                    <td className="border border-[#6E5726] py-1 px-3 text-right font-mono-num text-[#F5EFE4]">
                      Due: {sym} {formatNum(invoice.dueAmount)}
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>

        {/* PAYMENT INFORMATION */}
        <div className="mt-3.5">
          <div className="font-display-serif text-[13px] font-bold tracking-wide text-[#D5AE52] uppercase">
            PAYMENT INFORMATION
          </div>
          <div className="text-[11px] mb-1.5 mt-0.5">
            <span className="font-semibold text-[#F5EFE4]">Payment method used: </span>
            <span className="italic text-[#C4B9A6]">(ticked automatically)</span>
          </div>

          <div className="grid grid-cols-3 border border-[#8C7030] bg-[#15120F] text-[10.5px] leading-[1.45]">
            {/* Col 1: UPI */}
            <div className="p-2.5 border-r border-[#8C7030] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[#D5AE52] mb-1">
                <CheckBoxMark checked={isUpi} />
                <span>UPI</span>
              </div>
              <div>
                <span className="font-bold text-[#F5EFE4]">UPI ID: </span>
                <span className="text-[#D5AE52] font-mono-num break-all">
                  {settings.upiId || '[yourname@upi]'}
                </span>
              </div>
              <div>
                <span className="font-bold text-[#F5EFE4]">UPI Number: </span>
                <span className="text-[#D5AE52] font-mono-num">
                  {settings.upiNumber || settings.mobile || '[Phone number]'}
                </span>
              </div>
              <div className="flex items-start gap-2 pt-0.5">
                <span className="font-bold text-[#F5EFE4] shrink-0">QR code:</span>
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="UPI QR Code"
                    className="w-12 h-12 rounded-xs bg-white p-0.5 border border-[#8C7030]"
                  />
                ) : (
                  <span className="text-[#D5AE52]">[Add UPI ID in Settings]</span>
                )}
              </div>
            </div>

            {/* Col 2: BANK TRANSFER */}
            <div className="p-2.5 border-r border-[#8C7030] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[#D5AE52] mb-1">
                <CheckBoxMark checked={isBank} />
                <span>BANK TRANSFER</span>
              </div>
              <div>
                <span className="font-bold text-[#F5EFE4]">Account Name: </span>
                <span className="text-[#D5AE52]">
                  {settings.bankAccountName || '[Holder name]'}
                </span>
              </div>
              <div>
                <span className="font-bold text-[#F5EFE4]">Account No: </span>
                <span className="text-[#D5AE52] font-mono-num">
                  {settings.bankAccountNo || '[Account number]'}
                </span>
              </div>
              <div>
                <span className="font-bold text-[#F5EFE4]">IFSC / Bank: </span>
                <span className="text-[#D5AE52]">
                  {settings.bankIfscBranch || '[IFSC, Bank & branch]'}
                </span>
              </div>
            </div>

            {/* Col 3: CASH ON DELIVERY (COD) */}
            <div className="p-2.5 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[#D5AE52] mb-1">
                <CheckBoxMark checked={isCod} />
                <span>CASH ON DELIVERY (COD)</span>
              </div>
              <p className="text-[#F5EFE4]">Pay in cash when your order arrives.</p>
              <div>
                <span className="font-bold text-[#F5EFE4]">COD amount: </span>
                <span className="text-[#D5AE52] font-mono-num font-semibold">
                  {sym} [{codDisplayAmount || '      '}]
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* WHAT WE OFFER */}
        <div className="mt-3.5">
          <div className="font-display-serif text-[13px] font-bold tracking-wide text-[#D5AE52] uppercase pb-1 border-b border-[#8C7030]">
            WHAT WE OFFER
          </div>
          <div className="grid grid-cols-2 gap-6 pt-2 text-[10.5px] leading-[1.5]">
            <div>
              <div className="font-bold text-[#D5AE52] mb-0.5">
                Women&apos;s Clothing
              </div>
              <ul className="space-y-0.5 text-[#F5EFE4]">
                <li>
                  <span className="text-[#D5AE52] mr-1.5">◆</span>Kurtis &amp; Kurti Sets
                </li>
                <li>
                  <span className="text-[#D5AE52] mr-1.5">◆</span>Sarees &amp; Ethnic Wear
                </li>
                <li>
                  <span className="text-[#D5AE52] mr-1.5">◆</span>Dresses, Tops &amp; Co-ord Sets
                </li>
                <li>
                  <span className="text-[#D5AE52] mr-1.5">◆</span>Available sizes: XS, S, M, L
                </li>
              </ul>
            </div>
            <div>
              <div className="font-bold text-[#D5AE52] mb-0.5">
                Cosmetics &amp; Beauty
              </div>
              <ul className="space-y-0.5 text-[#F5EFE4]">
                <li>
                  <span className="text-[#D5AE52] mr-1.5">◆</span>Lipsticks, Lip Care &amp; Makeup
                </li>
                <li>
                  <span className="text-[#D5AE52] mr-1.5">◆</span>Skincare &amp; Face Care
                </li>
                <li>
                  <span className="text-[#D5AE52] mr-1.5">◆</span>Hair Care &amp; Accessories
                </li>
                <li>
                  <span className="text-[#D5AE52] mr-1.5">◆</span>Makeup Tools &amp; Gift Sets
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* A NOTE FROM GLAMOUR GALLERIA */}
      <div className="mt-3">
        <div className="font-display-serif text-[13px] font-bold tracking-wide text-[#D5AE52] uppercase pb-1 border-b border-[#8C7030]">
          A NOTE FROM {brandName}
        </div>
        <div className="text-center pt-2.5 space-y-1">
          <div className="font-display-serif text-[14.5px] font-bold text-[#D5AE52]">
            Thank you for shopping with {settings.businessName || 'Glamour Galleria'}!
          </div>
          <p className="text-[10.5px] italic text-[#F5EFE4] max-w-[660px] mx-auto leading-snug">
            {settings.invoiceFooterNote ||
              'Every piece is chosen with love to make you feel confident and beautiful. We truly appreciate your trust and support. If you have any question about your order, just message us anytime.'}
          </p>
          <p className="text-[10px] text-[#D6CBB8] pt-0.5">
            {settings.socialTagLine ||
              'Loved your order? Tag us @glamour.galleria.in and share your look with us!'}
          </p>
        </div>
      </div>
    </div>
  );
};
