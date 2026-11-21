import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { InvoiceData, StoreSettings } from '../types/invoice';
import { calculateTotals, formatMoney, getItemAmount } from '../utils/invoiceHelpers';
import { GoldCrestLogo } from './GoldCrestLogo';

interface InvoicePreviewProps {
  invoice: InvoiceData;
  settings: StoreSettings;
  previewRef?: React.RefObject<HTMLDivElement | null>;
}

export const InvoicePreview: React.FC<InvoicePreviewProps> = ({
  invoice,
  settings,
  previewRef,
}) => {
  const totals = calculateTotals(invoice);
  const [generatedQrUrl, setGeneratedQrUrl] = useState<string>('');

  const hasRealUpiId =
    settings.upiId &&
    !settings.upiId.includes('[') &&
    settings.upiId.includes('@') &&
    totals.grandTotal > 0;

  useEffect(() => {
    let active = true;
    if (!settings.customQrDataUrl && hasRealUpiId) {
      const upiUri = `upi://pay?pa=${encodeURIComponent(settings.upiId.trim())}&pn=${encodeURIComponent(
        settings.storeName
      )}&am=${totals.grandTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(
        `Invoice ${invoice.meta.invoiceNo}`
      )}`;
      QRCode.toDataURL(upiUri, {
        width: 120,
        margin: 1,
        color: {
          dark: '#141210',
          light: '#F5EFE4',
        },
      })
        .then((url) => {
          if (active) setGeneratedQrUrl(url);
        })
        .catch(() => {
          if (active) setGeneratedQrUrl('');
        });
    } else {
      setGeneratedQrUrl('');
    }
    return () => {
      active = false;
    };
  }, [settings.customQrDataUrl, settings.upiId, settings.storeName, hasRealUpiId, totals.grandTotal, invoice.meta.invoiceNo]);

  const minRows = Math.max(1, settings.minTableRows || 6);
  const totalRowCount = Math.max(minRows, invoice.items.length);
  const emptyRowCount = Math.max(0, totalRowCount - invoice.items.length);

  const codDisplayAmount =
    invoice.paymentMethod === 'COD'
      ? invoice.codAmountOverride !== ''
        ? invoice.codAmountOverride
        : totals.grandTotal > 0
          ? formatMoney(totals.grandTotal)
          : ''
      : '';

  const qrToDisplay = settings.customQrDataUrl || generatedQrUrl;

  return (
    <div
      ref={previewRef}
      className="print-only-sheet"
      style={{
        width: '794px',
        minHeight: '1123px',
        backgroundColor: '#141210',
        color: '#EFE7D8',
        padding: '32px 42px 28px 42px',
        boxSizing: 'border-box',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div>
        {/* TOP BRAND HEADER */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '96px',
            marginBottom: '12px',
          }}
        >
          <div style={{ position: 'absolute', left: '0px', top: '0px' }}>
            <GoldCrestLogo customLogoDataUrl={settings.customLogoDataUrl} storeName={settings.storeName} size={92} />
          </div>

          <div style={{ textAlign: 'center', paddingLeft: '72px', paddingRight: '72px' }}>
            <h1
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                color: '#D5AE52',
                fontSize: '27px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              {settings.storeName || 'GLAMOUR GALLERIA'}
            </h1>
            <p
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontStyle: 'italic',
                color: '#E7DEC9',
                fontSize: '12.5px',
                margin: '4px 0 2px 0',
              }}
            >
              {settings.tagline}
            </p>
            <p
              style={{
                color: '#DCD2BF',
                fontSize: '11px',
                margin: 0,
              }}
            >
              {settings.location}
            </p>
          </div>
        </div>

        {/* GOLD DIVIDER + INVOICE TITLE */}
        <div style={{ height: '1.5px', backgroundColor: '#B8913D', marginBottom: '8px' }} />
        <div
          style={{
            textAlign: 'center',
            fontFamily: "'Playfair Display', Georgia, serif",
            color: '#CFA74B',
            fontSize: '17px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            marginBottom: '10px',
          }}
        >
          INVOICE
        </div>

        {/* BILL TO & INVOICE DETAILS GRID */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            border: '1px solid #6E582B',
            marginBottom: '16px',
          }}
        >
          {/* Left: BILL TO */}
          <div
            style={{
              padding: '10px 14px',
              borderRight: '1px solid #6E582B',
              fontSize: '11.5px',
              lineHeight: 1.5,
            }}
          >
            <div
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                color: '#CFA74B',
                fontSize: '11.5px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                marginBottom: '4px',
              }}
            >
              BILL TO
            </div>
            <div style={{ marginBottom: '3px' }}>
              <span style={{ fontWeight: 700, color: '#F5EFE4' }}>Name: </span>
              <span style={{ color: '#F5EFE4' }}>{invoice.customer.name}</span>
            </div>
            <div style={{ marginBottom: '3px' }}>
              <span style={{ fontWeight: 700, color: '#F5EFE4' }}>Phone: </span>
              <span className="font-mono-num" style={{ color: '#F5EFE4', fontSize: '11px' }}>
                {invoice.customer.phone}
              </span>
            </div>
            <div style={{ marginBottom: '3px' }}>
              <span style={{ fontWeight: 700, color: '#F5EFE4' }}>Address: </span>
              <span style={{ color: '#E8DFCF', wordBreak: 'break-word' }}>
                {invoice.customer.address}
              </span>
            </div>
            <div>
              <span style={{ fontWeight: 700, color: '#F5EFE4' }}>City / PIN: </span>
              <span style={{ color: '#F5EFE4' }}>{invoice.customer.cityPin}</span>
            </div>
          </div>

          {/* Right: INVOICE DETAILS */}
          <div
            style={{
              padding: '10px 14px',
              fontSize: '11.5px',
              lineHeight: 1.55,
            }}
          >
            <div
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                color: '#CFA74B',
                fontSize: '11.5px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                marginBottom: '4px',
              }}
            >
              INVOICE DETAILS
            </div>
            <div style={{ marginBottom: '2px' }}>
              <span style={{ fontWeight: 700, color: '#F5EFE4' }}>Invoice No: </span>
              <span className="font-mono-num" style={{ color: '#D4AF56' }}>
                {invoice.meta.invoiceNo}
              </span>
            </div>
            <div style={{ marginBottom: '2px' }}>
              <span style={{ fontWeight: 700, color: '#F5EFE4' }}>Order Date: </span>
              <span className="font-mono-num" style={{ color: '#D4AF56' }}>
                {invoice.meta.orderDate}
              </span>
            </div>
            <div style={{ marginBottom: '2px' }}>
              <span style={{ fontWeight: 700, color: '#F5EFE4' }}>Delivery Date: </span>
              <span className="font-mono-num" style={{ color: '#D4AF56' }}>
                {invoice.meta.deliveryDate}
              </span>
            </div>
            <div style={{ marginBottom: '2px' }}>
              <span style={{ fontWeight: 700, color: '#F5EFE4' }}>Order via: </span>
              <span style={{ color: '#D4AF56' }}>{invoice.meta.orderVia}</span>
            </div>
            <div>
              <span style={{ fontWeight: 700, color: '#F5EFE4' }}>Payment: </span>
              <span style={{ color: '#D4AF56' }}>
                {invoice.meta.paymentLabel || invoice.paymentMethod}
              </span>
            </div>
          </div>
        </div>

        {/* ORDER DETAILS TABLE */}
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              color: '#CFA74B',
              fontSize: '13.5px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              marginBottom: '6px',
            }}
          >
            ORDER DETAILS
          </div>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              border: '1px solid #6E582B',
              fontSize: '11.5px',
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'linear-gradient(180deg, #D5AF52 0%, #B78E35 100%)',
                  color: '#141210',
                }}
              >
                <th
                  style={{
                    border: '1px solid #6E582B',
                    padding: '6px 6px',
                    textAlign: 'center',
                    fontWeight: 700,
                    width: '32px',
                  }}
                >
                  #
                </th>
                <th
                  style={{
                    border: '1px solid #6E582B',
                    padding: '6px 10px',
                    textAlign: 'left',
                    fontWeight: 700,
                  }}
                >
                  Product Name
                </th>
                <th
                  style={{
                    border: '1px solid #6E582B',
                    padding: '6px 8px',
                    textAlign: 'center',
                    fontWeight: 700,
                    width: '50px',
                  }}
                >
                  Size
                </th>
                <th
                  style={{
                    border: '1px solid #6E582B',
                    padding: '6px 8px',
                    textAlign: 'center',
                    fontWeight: 700,
                    width: '44px',
                  }}
                >
                  Qty
                </th>
                <th
                  style={{
                    border: '1px solid #6E582B',
                    padding: '6px 10px',
                    textAlign: 'right',
                    fontWeight: 700,
                    width: '108px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Original Price (₹)
                </th>
                <th
                  style={{
                    border: '1px solid #6E582B',
                    padding: '6px 10px',
                    textAlign: 'right',
                    fontWeight: 700,
                    width: '122px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Discounted Price (₹)
                </th>
                <th
                  style={{
                    border: '1px solid #6E582B',
                    padding: '6px 10px',
                    textAlign: 'right',
                    fontWeight: 700,
                    width: '86px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Amount (₹)
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => {
                const amt = getItemAmount(item);
                const hasContent =
                  item.productName.trim() !== '' ||
                  item.originalPrice !== '' ||
                  item.discountedPrice !== '';

                return (
                  <tr key={item.id} style={{ height: '30px' }}>
                    <td
                      className="font-mono-num"
                      style={{
                        border: '1px solid #6E582B',
                        padding: '5px 6px',
                        textAlign: 'center',
                        color: '#E7DEC9',
                      }}
                    >
                      {idx + 1}
                    </td>
                    <td
                      style={{
                        border: '1px solid #6E582B',
                        padding: '5px 10px',
                        textAlign: 'left',
                        color: '#F3E3C3',
                        fontWeight: 500,
                      }}
                    >
                      {item.productName}
                    </td>
                    <td
                      style={{
                        border: '1px solid #6E582B',
                        padding: '5px 8px',
                        textAlign: 'center',
                        color: '#F5EFE4',
                      }}
                    >
                      {hasContent ? item.size : ''}
                    </td>
                    <td
                      className="font-mono-num"
                      style={{
                        border: '1px solid #6E582B',
                        padding: '5px 8px',
                        textAlign: 'center',
                        color: '#F5EFE4',
                      }}
                    >
                      {hasContent && item.qty ? item.qty : ''}
                    </td>
                    <td
                      className="font-mono-num"
                      style={{
                        border: '1px solid #6E582B',
                        padding: '5px 10px',
                        textAlign: 'right',
                        color: '#C7BDA9',
                      }}
                    >
                      {item.originalPrice !== '' ? item.originalPrice : ''}
                    </td>
                    <td
                      className="font-mono-num"
                      style={{
                        border: '1px solid #6E582B',
                        padding: '5px 10px',
                        textAlign: 'right',
                        color: '#F5EFE4',
                      }}
                    >
                      {item.discountedPrice !== '' ? item.discountedPrice : ''}
                    </td>
                    <td
                      className="font-mono-num"
                      style={{
                        border: '1px solid #6E582B',
                        padding: '5px 10px',
                        textAlign: 'right',
                        color: '#F5EFE4',
                        fontWeight: 600,
                      }}
                    >
                      {hasContent && amt > 0 ? formatMoney(amt) : ''}
                    </td>
                  </tr>
                );
              })}

              {Array.from({ length: emptyRowCount }).map((_, idx) => (
                <tr key={`empty-${idx}`} style={{ height: '28px' }}>
                  <td
                    className="font-mono-num"
                    style={{
                      border: '1px solid #6E582B',
                      padding: '4px 6px',
                      textAlign: 'center',
                      color: '#E7DEC9',
                    }}
                  >
                    {invoice.items.length + idx + 1}
                  </td>
                  <td style={{ border: '1px solid #6E582B', padding: '4px 10px' }} />
                  <td style={{ border: '1px solid #6E582B', padding: '4px 8px' }} />
                  <td style={{ border: '1px solid #6E582B', padding: '4px 8px' }} />
                  <td style={{ border: '1px solid #6E582B', padding: '4px 10px' }} />
                  <td style={{ border: '1px solid #6E582B', padding: '4px 10px' }} />
                  <td style={{ border: '1px solid #6E582B', padding: '4px 10px' }} />
                </tr>
              ))}
            </tbody>
          </table>

          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontSize: '10.5px',
              color: '#C3AB76',
              marginTop: '5px',
            }}
          >
            {settings.sizeOptionsNote}
          </div>
        </div>

        {/* SHIPMENT TRACKING & TOTALS SPLIT */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 0.85fr',
            gap: '18px',
            alignItems: 'stretch',
            marginBottom: '18px',
          }}
        >
          {/* Left: SHIPMENT TRACKING */}
          <div
            style={{
              border: '1px solid #6E582B',
              padding: '12px 14px',
              fontSize: '11.5px',
              lineHeight: 1.55,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                color: '#CFA74B',
                fontSize: '11.5px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                marginBottom: '5px',
              }}
            >
              SHIPMENT TRACKING
            </div>
            <div>
              <span style={{ fontWeight: 700, color: '#F5EFE4' }}>Courier: </span>
              <span style={{ color: '#D4AF56' }}>{invoice.shipment.courier || '—'}</span>
            </div>
            <div>
              <span style={{ fontWeight: 700, color: '#F5EFE4' }}>Tracking ID / AWB No: </span>
              <span className="font-mono-num" style={{ color: '#D4AF56' }}>
                {invoice.shipment.trackingId}
              </span>
            </div>
            <div style={{ marginTop: '4px' }}>
              <a
                href={invoice.shipment.trackingUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#D4AF56',
                  textDecoration: 'underline',
                  fontWeight: 600,
                }}
              >
                Click here to track your order
              </a>
            </div>
            <div
              style={{
                color: '#A99C86',
                fontSize: '9.5px',
                wordBreak: 'break-all',
                marginTop: '2px',
              }}
            >
              {invoice.shipment.trackingUrl}
            </div>
          </div>

          {/* Right: TOTALS TABLE */}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              border: '1px solid #6E582B',
              fontSize: '11.5px',
            }}
          >
            <tbody>
              <tr>
                <td
                  style={{
                    border: '1px solid #6E582B',
                    padding: '7px 12px',
                    color: '#E7DEC9',
                  }}
                >
                  Subtotal
                </td>
                <td
                  className="font-mono-num"
                  style={{
                    border: '1px solid #6E582B',
                    padding: '7px 12px',
                    textAlign: 'right',
                    color: '#F5EFE4',
                    width: '115px',
                  }}
                >
                  ₹ {formatMoney(totals.subtotal)}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    border: '1px solid #6E582B',
                    padding: '7px 12px',
                    color: '#E7DEC9',
                  }}
                >
                  Delivery Charge
                </td>
                <td
                  className="font-mono-num"
                  style={{
                    border: '1px solid #6E582B',
                    padding: '7px 12px',
                    textAlign: 'right',
                    color: '#F5EFE4',
                  }}
                >
                  {totals.deliveryCharge > 0 ? `₹ ${formatMoney(totals.deliveryCharge)}` : '₹ 0'}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    border: '1px solid #6E582B',
                    padding: '7px 12px',
                    color: '#E7DEC9',
                  }}
                >
                  GST (if applicable){' '}
                  <span className="font-mono-num" style={{ color: '#D4AF56' }}>
                    [{Number(invoice.gstPercent || 0) > 0 ? `${invoice.gstPercent}` : ' '}]%
                  </span>
                </td>
                <td
                  className="font-mono-num"
                  style={{
                    border: '1px solid #6E582B',
                    padding: '7px 12px',
                    textAlign: 'right',
                    color: '#F5EFE4',
                  }}
                >
                  ₹ {formatMoney(totals.gstAmount)}
                </td>
              </tr>
              <tr
                style={{
                  background: 'linear-gradient(180deg, #D5AF52 0%, #B78E35 100%)',
                  color: '#141210',
                }}
              >
                <td
                  style={{
                    border: '1px solid #6E582B',
                    padding: '8px 12px',
                    fontWeight: 700,
                    letterSpacing: '0.03em',
                  }}
                >
                  GRAND TOTAL
                </td>
                <td
                  className="font-mono-num"
                  style={{
                    border: '1px solid #6E582B',
                    padding: '8px 12px',
                    textAlign: 'right',
                    fontWeight: 700,
                    fontSize: '13px',
                  }}
                >
                  ₹ {formatMoney(totals.grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* PAYMENT INFORMATION */}
        <div style={{ marginBottom: '18px' }}>
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              color: '#CFA74B',
              fontSize: '13.5px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              paddingBottom: '4px',
              borderBottom: '1px solid #B8913D',
              marginBottom: '6px',
            }}
          >
            PAYMENT INFORMATION
          </div>
          <div style={{ fontSize: '11px', color: '#E7DEC9', marginBottom: '7px' }}>
            <span style={{ fontWeight: 700 }}>Payment method used: </span>
            <span style={{ fontStyle: 'italic', color: '#BFB39D' }}>(selected option ticked)</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              border: '1px solid #6E582B',
              fontSize: '11px',
              lineHeight: 1.5,
            }}
          >
            {/* UPI */}
            <div style={{ borderRight: '1px solid #6E582B', padding: '9px 11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                <span
                  style={{
                    width: '13px',
                    height: '13px',
                    border: '1.2px solid #D4AF56',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#F5DFA0',
                    flexShrink: 0,
                  }}
                >
                  {invoice.paymentMethod === 'UPI' ? '✓' : ''}
                </span>
                <span style={{ fontWeight: 700, color: '#CFA74B' }}>UPI</span>
              </div>
              <div style={{ wordBreak: 'break-all' }}>
                <span style={{ fontWeight: 700, color: '#F5EFE4' }}>UPI ID: </span>
                <span style={{ color: '#D4AF56' }}>{settings.upiId}</span>
              </div>
              <div>
                <span style={{ fontWeight: 700, color: '#F5EFE4' }}>UPI Number: </span>
                <span className="font-mono-num" style={{ color: '#D4AF56' }}>
                  {settings.upiNumber}
                </span>
              </div>
              <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700, color: '#F5EFE4' }}>QR code: </span>
                {qrToDisplay ? (
                  <img
                    src={qrToDisplay}
                    alt="UPI Payment QR"
                    referrerPolicy="no-referrer"
                    style={{
                      width: '44px',
                      height: '44px',
                      backgroundColor: '#F5EFE4',
                      padding: '2px',
                      borderRadius: '2px',
                    }}
                  />
                ) : (
                  <span style={{ color: '#D4AF56' }}>[Scan / Set in Store Settings]</span>
                )}
              </div>
            </div>

            {/* BANK TRANSFER */}
            <div style={{ borderRight: '1px solid #6E582B', padding: '9px 11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                <span
                  style={{
                    width: '13px',
                    height: '13px',
                    border: '1.2px solid #D4AF56',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#F5DFA0',
                    flexShrink: 0,
                  }}
                >
                  {invoice.paymentMethod === 'BANK_TRANSFER' ? '✓' : ''}
                </span>
                <span style={{ fontWeight: 700, color: '#CFA74B' }}>BANK TRANSFER</span>
              </div>
              <div>
                <span style={{ fontWeight: 700, color: '#F5EFE4' }}>Account Name: </span>
                <span style={{ color: '#D4AF56' }}>{settings.bankAccountName}</span>
              </div>
              <div>
                <span style={{ fontWeight: 700, color: '#F5EFE4' }}>Account No: </span>
                <span className="font-mono-num" style={{ color: '#D4AF56' }}>
                  {settings.bankAccountNo}
                </span>
              </div>
              <div>
                <span style={{ fontWeight: 700, color: '#F5EFE4' }}>IFSC / Bank: </span>
                <span style={{ color: '#D4AF56' }}>{settings.bankIfscBranch}</span>
              </div>
            </div>

            {/* CASH ON DELIVERY */}
            <div style={{ padding: '9px 11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                <span
                  style={{
                    width: '13px',
                    height: '13px',
                    border: '1.2px solid #D4AF56',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#F5DFA0',
                    flexShrink: 0,
                  }}
                >
                  {invoice.paymentMethod === 'COD' ? '✓' : ''}
                </span>
                <span style={{ fontWeight: 700, color: '#CFA74B' }}>CASH ON DELIVERY (COD)</span>
              </div>
              <div style={{ color: '#E7DEC9', marginBottom: '3px' }}>
                Pay in cash when your order arrives.
              </div>
              <div>
                <span style={{ fontWeight: 700, color: '#F5EFE4' }}>COD amount: </span>
                <span className="font-mono-num" style={{ color: '#D4AF56', fontWeight: 600 }}>
                  ₹ [ {codDisplayAmount || '   '} ]
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* WHAT WE OFFER */}
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              color: '#CFA74B',
              fontSize: '13.5px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              paddingBottom: '4px',
              borderBottom: '1px solid #B8913D',
              marginBottom: '8px',
            }}
          >
            WHAT WE OFFER
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px',
              fontSize: '11px',
              paddingLeft: '6px',
            }}
          >
            {settings.offerColumns.map((col, colIdx) => (
              <div key={colIdx}>
                <div style={{ fontWeight: 700, color: '#D4AF56', marginBottom: '4px' }}>
                  {col.title}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, lineHeight: 1.65 }}>
                  {col.items.map((entry, idx) => (
                    <li key={idx} style={{ color: '#E7DEC9', display: 'flex', gap: '7px' }}>
                      <span style={{ color: '#CFA74B', fontSize: '9px', marginTop: '1px' }}>◆</span>
                      <span>{entry}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER NOTE */}
      <div>
        <div
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            color: '#CFA74B',
            fontSize: '13.5px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            paddingBottom: '4px',
            borderBottom: '1px solid #B8913D',
            marginBottom: '10px',
          }}
        >
          {settings.noteTitle}
        </div>
        <div style={{ textAlign: 'center', paddingLeft: '18px', paddingRight: '18px' }}>
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              color: '#D5AE52',
              fontSize: '14.5px',
              fontWeight: 700,
              marginBottom: '4px',
            }}
          >
            {settings.noteHeadline}
          </div>
          <p
            style={{
              fontStyle: 'italic',
              color: '#E5DCC9',
              fontSize: '11px',
              lineHeight: 1.5,
              margin: '0 0 6px 0',
            }}
          >
            {settings.noteBody}
          </p>
          <p
            style={{
              color: '#B8AC96',
              fontSize: '10px',
              margin: 0,
            }}
          >
            {settings.socialTagLine}
          </p>
        </div>
      </div>
    </div>
  );
};
