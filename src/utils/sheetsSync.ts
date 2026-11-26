import { Client, CustomerOrder, Invoice } from '../types/business';

export function isValidSheetsWebhookUrl(raw?: string | null): boolean {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function postToGoogleSheetsWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>
): void {
  if (!isValidSheetsWebhookUrl(webhookUrl)) return;
  try {
    void fetch('/api/sheets-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhookUrl: webhookUrl.trim(),
        payload,
      }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Non-blocking background sync must never throw
  }
}

export function buildClientSheetPayload(
  client: Client,
  invoices: Invoice[]
): Record<string, unknown> {
  const linkedInvoices = invoices.filter(
    (inv) =>
      inv.clientId === client.id ||
      (inv.customerMobile &&
        client.mobile &&
        inv.customerMobile === client.mobile)
  );
  const orderCount = linkedInvoices.length;
  const totalBilled = Number(
    linkedInvoices
      .reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0)
      .toFixed(2)
  );
  const pendingDue = Number(
    linkedInvoices
      .reduce((sum, inv) => sum + (Number(inv.dueAmount) || 0), 0)
      .toFixed(2)
  );
  const cityAndState = [client.city, client.state].filter(Boolean).join(', ');

  // Explicitly exclude any password / auth secret fields
  return {
    eventType: 'client_upsert',
    recordType: 'client',
    syncedAt: new Date().toISOString(),
    clientId: client.id,
    name: client.name || '',
    accountEmail: client.email || '',
    mobileNumber: client.mobile || '',
    whatsappNumber: client.whatsapp || client.mobile || '',
    fullAddress: client.address || '',
    city: client.city || '',
    state: client.state || '',
    cityAndState,
    pinCode: client.pinCode || '',
    detectedCountry: client.detectedCountry || '',
    orders: orderCount,
    totalBilled,
    pendingDue,
    createdAt: client.createdAt || '',
    updatedAt: client.updatedAt || '',
  };
}

export function buildOrderSheetPayload(
  order: CustomerOrder,
  accountEmail?: string
): Record<string, unknown> {
  const cityAndState = [order.customerCity, order.customerState]
    .filter(Boolean)
    .join(', ');
  const itemsList = Array.isArray(order.items) ? order.items : [];
  const itemsSummary = itemsList
    .map(
      (it) =>
        `${it.productName}${it.productSize ? ` (${it.productSize})` : ''} × ${
          it.quantity
        }`
    )
    .join('; ');

  return {
    eventType: 'order_upsert',
    recordType: 'order',
    syncedAt: new Date().toISOString(),
    orderId: order.id,
    orderNumber: order.orderNumber || '',
    orderDate: order.orderDate || '',
    estimatedDeliveryDate: order.estimatedDeliveryDate || '',
    status: order.status || 'Pending',
    clientId: order.clientId || '',
    customerName: order.customerName || '',
    accountEmail: accountEmail || '',
    mobileNumber: order.customerPhone || '',
    whatsappNumber: order.customerWhatsapp || order.customerPhone || '',
    fullAddress: order.customerAddress || '',
    city: order.customerCity || '',
    state: order.customerState || '',
    cityAndState,
    pinCode: order.customerPinCode || '',
    productName: order.productName || '',
    quantity: order.quantity || 1,
    subtotal: Number(order.subtotal) || 0,
    deliveryCharge: Number(order.deliveryCharge) || 0,
    totalAmount: Number(order.totalAmount) || 0,
    paymentMethod: order.paymentMethod || '',
    invoiceId: order.invoiceId || '',
    invoiceNumber: order.invoiceNumber || '',
    itemsSummary: itemsSummary || order.productName || '',
    items: itemsList.map((it) => ({
      productId: it.productId || '',
      productName: it.productName || '',
      size: it.productSize || '',
      color: it.productColor || '',
      quantity: it.quantity || 1,
      unitPrice: Number(it.unitPrice) || 0,
      lineTotal: Number(it.lineTotal) || 0,
    })),
    customerNote: order.customerNote || '',
    createdAt: order.createdAt || '',
    updatedAt: order.updatedAt || '',
  };
}

export function buildInvoiceSheetPayload(
  invoice: Invoice,
  accountEmail?: string
): Record<string, unknown> {
  const itemsList = Array.isArray(invoice.items) ? invoice.items : [];
  const itemsSummary = itemsList
    .map(
      (it) =>
        `${it.productName}${it.size ? ` (${it.size})` : ''} × ${it.quantity}`
    )
    .join('; ');

  return {
    eventType: 'invoice_upsert',
    recordType: 'invoice',
    syncedAt: new Date().toISOString(),
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber || '',
    invoiceDate: invoice.invoiceDate || '',
    deliveryDate: invoice.deliveryDate || '',
    orderVia: invoice.orderVia || '',
    clientId: invoice.clientId || '',
    customerName: invoice.customerName || '',
    accountEmail: accountEmail || '',
    mobileNumber: invoice.customerMobile || '',
    whatsappNumber: invoice.customerWhatsapp || invoice.customerMobile || '',
    fullAddress: invoice.customerAddress || '',
    cityAndStatePin: invoice.customerCityStatePin || '',
    subtotal: Number(invoice.subtotal) || 0,
    discount: Number(invoice.discount) || 0,
    gstAmount: Number(invoice.gstAmount) || 0,
    deliveryCharge: Number(invoice.deliveryCharge) || 0,
    totalAmount: Number(invoice.totalAmount) || 0,
    paidAmount: Number(invoice.paidAmount) || 0,
    dueAmount: Number(invoice.dueAmount) || 0,
    paymentMethod: invoice.paymentMethod || '',
    deliveryStatus: invoice.deliveryStatus || '',
    courierName: invoice.courierName || '',
    trackingNumber: invoice.trackingNumber || '',
    itemsSummary,
    items: itemsList.map((it) => ({
      productId: it.productId || '',
      productName: it.productName || '',
      size: it.size || '',
      color: it.color || '',
      quantity: it.quantity || 1,
      sellingPrice: Number(it.sellingPrice) || 0,
      lineTotal: Number(it.lineTotal) || 0,
    })),
    notes: invoice.notes || '',
    createdAt: invoice.createdAt || '',
    updatedAt: invoice.updatedAt || '',
  };
}
