import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import {
  BusinessSettings,
  Invoice,
  InvoiceLineItem,
  WorkspaceData,
} from '../types/business';

export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: 'Glamour Galleria',
  tagline: 'Your Style, Our Priority',
  logoDataUrl: '',
  address: '',
  mobile: '',
  whatsapp: '',
  gstin: '',
  currencySymbol: '₹',
  currencyCode: 'INR',
  invoicePrefix: 'GG-',
  upiId: '',
  upiNumber: '',
  bankAccountName: '',
  bankAccountNo: '',
  bankIfscBranch: '',
  invoiceFooterNote:
    'Every piece is chosen with love to make you feel confident and beautiful. We truly appreciate your trust and support. If you have any question about your order, just message us anytime.',
  socialTagLine: 'Loved your order? Tag us @glamour.galleria.in and share your look with us!',
  lowStockThreshold: 5,
};

export function createEmptyWorkspace(): WorkspaceData {
  return {
    settings: { ...DEFAULT_SETTINGS },
    clients: [],
    products: [],
    invoices: [],
    payments: [],
    expenses: [],
  };
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatCurrency(amount: number, symbol = '₹'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safe);
  return `${symbol} ${formatted}`;
}

export function generateNextInvoiceNumber(invoices: Invoice[], prefix = 'GG-'): string {
  let maxNum = 0;
  for (const inv of invoices) {
    const match = inv.invoiceNumber.match(/(\d+)\s*$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

export function computeLineItem(
  item: Omit<InvoiceLineItem, 'lineTotal' | 'lineCost' | 'lineProfit'>
): InvoiceLineItem {
  const qty = Math.max(1, Number(item.quantity) || 1);
  const purchase = Math.max(0, Number(item.purchasePrice) || 0);
  const selling = Math.max(0, Number(item.sellingPrice) || 0);
  const original = item.originalPrice !== undefined ? Math.max(0, Number(item.originalPrice) || 0) : undefined;
  const lineTotal = Number((qty * selling).toFixed(2));
  const lineCost = Number((qty * purchase).toFixed(2));
  return {
    ...item,
    quantity: qty,
    originalPrice: original,
    purchasePrice: purchase,
    sellingPrice: selling,
    lineTotal,
    lineCost,
    lineProfit: Number((lineTotal - lineCost).toFixed(2)),
  };
}

export function computeInvoiceTotals(params: {
  items: InvoiceLineItem[];
  discount: number;
  gstPercent?: number;
  deliveryCharge: number;
  paidAmount: number;
}) {
  const subtotal = Number(
    params.items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2)
  );
  const totalPurchaseCost = Number(
    params.items.reduce((s, i) => s + i.lineCost, 0).toFixed(2)
  );
  const discount = Math.max(0, Number(params.discount) || 0);
  const gstPercent = Math.max(0, Number(params.gstPercent) || 0);
  const taxable = Math.max(0, subtotal - discount);
  const gstAmount = Number(((taxable * gstPercent) / 100).toFixed(2));
  const deliveryCharge = Math.max(0, Number(params.deliveryCharge) || 0);
  const totalAmount = Number((taxable + gstAmount + deliveryCharge).toFixed(2));
  const paidAmount = Number(
    Math.min(totalAmount, Math.max(0, Number(params.paidAmount) || 0)).toFixed(2)
  );
  const dueAmount = Number(Math.max(0, totalAmount - paidAmount).toFixed(2));
  const profitAmount = Number((taxable - totalPurchaseCost).toFixed(2));
  return {
    subtotal,
    totalPurchaseCost,
    discount,
    gstPercent,
    gstAmount,
    deliveryCharge,
    totalAmount,
    paidAmount,
    dueAmount,
    profitAmount,
  };
}

export function suggestTrackingUrl(courierName: string): string {
  const c = (courierName || '').toLowerCase();
  if (c.includes('xpress')) return 'https://www.xpressbees.com/shipment/tracking';
  if (c.includes('delhivery')) return 'https://www.delhivery.com/tracking';
  if (c.includes('blue')) return 'https://www.bluedart.com/tracking';
  if (c.includes('dtdc')) return 'https://www.dtdc.in/tracking.asp';
  if (c.includes('ekart')) return 'https://ekartlogistics.com/track';
  if (c.includes('india post') || c.includes('speed post'))
    return 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx';
  if (c.includes('shadowfax')) return 'https://tracker.shadowfax.in/';
  return '';
}

export function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  return `${match[3]} / ${match[2]} / ${match[1].slice(2)}`;
}

export function buildWhatsAppInvoiceUrl(
  invoice: Invoice,
  settings: BusinessSettings
): { url: string; message: string } {
  const sym = settings.currencySymbol || '₹';
  const itemLines = invoice.items
    .map(
      (i, idx) =>
        `${idx + 1}. ${i.productName}${i.size ? ` (${i.size})` : ''} x ${i.quantity} = ${formatCurrency(i.lineTotal, sym)}`
    )
    .join('\n');

  const message = [
    `*${settings.businessName || 'Glamour Galleria'}*`,
    settings.tagline ? `_${settings.tagline}_` : '',
    `Invoice No: *${invoice.invoiceNumber}*`,
    `Order Date: ${invoice.invoiceDate}`,
    invoice.deliveryDate ? `Delivery Date: ${invoice.deliveryDate}` : '',
    `Customer: ${invoice.customerName}`,
    '',
    '*Order Items:*',
    itemLines,
    '',
    `Subtotal: ${formatCurrency(invoice.subtotal, sym)}`,
    invoice.discount > 0 ? `Discount: -${formatCurrency(invoice.discount, sym)}` : '',
    invoice.gstAmount && invoice.gstAmount > 0
      ? `GST (${invoice.gstPercent || 0}%): ${formatCurrency(invoice.gstAmount, sym)}`
      : '',
    invoice.deliveryCharge > 0
      ? `Delivery Charge: ${formatCurrency(invoice.deliveryCharge, sym)}`
      : '',
    `*Grand Total: ${formatCurrency(invoice.totalAmount, sym)}*`,
    `Paid: ${formatCurrency(invoice.paidAmount, sym)}`,
    invoice.dueAmount > 0 ? `*Due Amount: ${formatCurrency(invoice.dueAmount, sym)}*` : 'Status: Paid in Full',
    invoice.courierName || invoice.trackingNumber
      ? `\nDelivery: ${invoice.courierName || 'Courier'}${invoice.trackingNumber ? ` (AWB: ${invoice.trackingNumber})` : ''} · ${invoice.deliveryStatus}`
      : '',
    invoice.trackingUrl ? `Track: ${invoice.trackingUrl}` : '',
    '',
    settings.invoiceFooterNote || 'Thank you for shopping with us!',
  ]
    .filter(Boolean)
    .join('\n');

  const rawPhone = (invoice.customerWhatsapp || invoice.customerMobile || '').replace(/[^\d]/g, '');
  const phoneWithCountry =
    rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;

  const url = phoneWithCountry
    ? `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return { url, message };
}

export async function exportInvoiceElementToPdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#12100E',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png', 1.0);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgProps = pdf.getImageProperties(imgData);
  const renderHeight = (imgProps.height * pageWidth) / imgProps.width;

  if (renderHeight <= pageHeight + 2) {
    const targetH = Math.min(renderHeight, pageHeight);
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, targetH, undefined, 'FAST');
  } else {
    let remaining = renderHeight;
    let position = 0;
    while (remaining > 0) {
      pdf.addImage(imgData, 'PNG', 0, position, pageWidth, renderHeight, undefined, 'FAST');
      remaining -= pageHeight;
      if (remaining > 1.5) {
        pdf.addPage();
        position -= pageHeight;
      } else {
        break;
      }
    }
  }

  pdf.save(filename);
}

export function resizeImageFileToDataUrl(file: File, maxSize = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          } else {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
