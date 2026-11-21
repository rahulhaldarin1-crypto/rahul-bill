import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { CustomerDetails, InvoiceData, OrderItem } from '../types/invoice';

export function getItemUnitPrice(item: OrderItem): number {
  if (item.discountedPrice !== '' && !Number.isNaN(Number(item.discountedPrice))) {
    return Number(item.discountedPrice);
  }
  if (item.originalPrice !== '' && !Number.isNaN(Number(item.originalPrice))) {
    return Number(item.originalPrice);
  }
  return 0;
}

export function getItemAmount(item: OrderItem): number {
  const qty = item.qty === '' ? 0 : Math.max(0, Number(item.qty) || 0);
  const price = getItemUnitPrice(item);
  if (qty === 0 && price > 0) return 0;
  return Math.round(qty * price * 100) / 100;
}

export interface InvoiceTotals {
  subtotal: number;
  deliveryCharge: number;
  gstAmount: number;
  grandTotal: number;
}

export function calculateTotals(invoice: InvoiceData): InvoiceTotals {
  const subtotal = invoice.items.reduce((sum, item) => sum + getItemAmount(item), 0);
  const deliveryCharge = Math.max(0, Number(invoice.deliveryCharge) || 0);
  const gstPercent = Math.max(0, Number(invoice.gstPercent) || 0);
  const gstAmount = Math.round(((subtotal * gstPercent) / 100) * 100) / 100;
  const grandTotal = Math.round((subtotal + deliveryCharge + gstAmount) * 100) / 100;

  return {
    subtotal,
    deliveryCharge,
    gstAmount,
    grandTotal,
  };
}

export function formatMoney(val: number): string {
  if (Number.isInteger(val)) {
    return String(val);
  }
  return val.toFixed(2);
}

export function incrementInvoiceNumber(current: string): string {
  if (!current || !current.trim()) {
    return 'GG-001';
  }
  // Matches trailing numbers like GG-875/GG-876 -> GG-877/GG-878 or GG-876 -> GG-877
  const slashMatch = current.match(/^(.*?)(\d+)\s*\/\s*(.*?)(\d+)$/);
  if (slashMatch) {
    const [, p1, n1, p2, n2] = slashMatch;
    const width1 = n1.length;
    const width2 = n2.length;
    const num1 = parseInt(n1, 10) + 2;
    const num2 = parseInt(n2, 10) + 2;
    return `${p1}${String(num1).padStart(width1, '0')}/${p2}${String(num2).padStart(width2, '0')}`;
  }

  const singleMatch = current.match(/^(.*?)(\d+)([^\d]*)$/);
  if (singleMatch) {
    const [, prefix, numStr, suffix] = singleMatch;
    const nextNum = parseInt(numStr, 10) + 1;
    return `${prefix}${String(nextNum).padStart(numStr.length, '0')}${suffix}`;
  }

  return `${current}-1`;
}

/**
 * Deterministic regex & line-based parser for WhatsApp customer address blocks.
 * No external API or AI calls required.
 */
export function parseCustomerText(raw: string): Partial<CustomerDetails> {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let name = '';
  let phone = '';
  let cityPin = '';
  const addressLines: string[] = [];

  const phoneRegex = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}|\+?\d{10,13}/;
  const pinRegex = /\b\d{6}\b/;

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (/^(name|customer|to|bill to)\s*[:\-–]/i.test(line)) {
      name = line.replace(/^(name|customer|to|bill to)\s*[:\-–]\s*/i, '').trim();
      continue;
    }

    if (/^(phone|ph|mob|mobile|whatsapp|contact|no)\s*[:\-–]/i.test(line)) {
      const cleaned = line
        .replace(/^(phone|ph|mob|mobile|whatsapp|contact|no)\s*[:\-–]\s*/i, '')
        .trim();
      phone = cleaned;
      continue;
    }

    if (/^(city\s*\/\s*pin|city|state|pin\s*code|pincode|pin|zip)\s*[:\-–]/i.test(line)) {
      cityPin = line
        .replace(/^(city\s*\/\s*pin|city|state|pin\s*code|pincode|pin|zip)\s*[:\-–]\s*/i, '')
        .trim();
      continue;
    }

    if (/^(address|addr|delivery address|shipping address)\s*[:\-–]/i.test(line)) {
      const addrVal = line
        .replace(/^(address|addr|delivery address|shipping address)\s*[:\-–]\s*/i, '')
        .trim();
      if (addrVal) addressLines.push(addrVal);
      continue;
    }

    // Heuristic matching for unlabeled lines
    const phoneMatch = line.match(phoneRegex);
    if (!phone && phoneMatch && line.replace(/\D/g, '').length <= 14) {
      phone = phoneMatch[0].replace(/\s+/g, '');
      const remaining = line.replace(phoneMatch[0], '').replace(/[,|-]+/g, '').trim();
      if (remaining && !name) {
        name = remaining;
      }
      continue;
    }

    if (!name && !lower.includes('road') && !lower.includes('near') && !pinRegex.test(line) && line.length < 45) {
      name = line;
      continue;
    }

    if (pinRegex.test(line) && !cityPin && line.length < 40) {
      cityPin = line;
      continue;
    }

    addressLines.push(line);
  }

  let address = addressLines.join(', ');
  if (!cityPin && address) {
    const pinInAddr = address.match(/([A-Za-z\s]+[-,\s]+\d{6})\s*$/);
    if (pinInAddr) {
      cityPin = pinInAddr[1].trim();
      address = address.slice(0, pinInAddr.index).replace(/[,\s]+$/, '');
    } else {
      const barePin = address.match(/\b\d{6}\b/);
      if (barePin) {
        cityPin = barePin[0];
      }
    }
  }

  const result: Partial<CustomerDetails> = {};
  if (name) result.name = name;
  if (phone) result.phone = phone;
  if (address) result.address = address;
  if (cityPin) result.cityPin = cityPin;
  return result;
}

export function buildPdfFilename(invoice: InvoiceData): string {
  const rawName = (invoice.customer.name || 'Customer').trim().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '_');
  const rawInv = (invoice.meta.invoiceNo || 'Invoice').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
  return `${rawName}_${rawInv}.pdf`;
}

export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  // Wait for fonts so Playfair Display / Plus Jakarta Sans / JetBrains Mono render cleanly
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  // Clone into an offscreen unscaled container at exact A4 pixel width (794px at 96dpi)
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-10000px';
  wrapper.style.top = '0';
  wrapper.style.width = '794px';
  wrapper.style.background = '#141210';
  wrapper.style.zIndex = '-1';

  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.transform = 'none';
  clone.style.width = '794px';
  clone.style.minHeight = '1123px';
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#141210',
      logging: false,
      width: 794,
      windowWidth: 794,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.96);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm

    // Paint page background dark obsidian so zero white hairlines appear at edges
    pdf.setFillColor(20, 18, 16);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');

    const imgProps = pdf.getImageProperties(imgData);
    const renderedHeight = (imgProps.height * pageWidth) / imgProps.width;

    if (renderedHeight <= pageHeight + 1) {
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, renderedHeight, undefined, 'FAST');
    } else {
      // Scale cleanly to fit single A4 sheet if slightly taller due to many items, or multi-page if very long
      if (renderedHeight <= pageHeight * 1.15) {
        const fitWidth = (pageHeight * imgProps.width) / imgProps.height;
        const xOffset = (pageWidth - fitWidth) / 2;
        pdf.addImage(imgData, 'JPEG', xOffset, 0, fitWidth, pageHeight, undefined, 'FAST');
      } else {
        let heightLeft = renderedHeight;
        let position = 0;
        pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, renderedHeight, undefined, 'FAST');
        heightLeft -= pageHeight;
        while (heightLeft > 2) {
          position -= pageHeight;
          pdf.addPage();
          pdf.setFillColor(20, 18, 16);
          pdf.rect(0, 0, pageWidth, pageHeight, 'F');
          pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, renderedHeight, undefined, 'FAST');
          heightLeft -= pageHeight;
        }
      }
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(wrapper);
  }
}
