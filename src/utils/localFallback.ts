import {
  BusinessSettings,
  Client,
  DeliveryStatus,
  ExpenseRecord,
  Invoice,
  InvoiceLineItem,
  PaymentMethod,
  PaymentRecord,
  Product,
  WorkspaceData,
} from '../types/business';
import { createEmptyWorkspace, DEFAULT_SETTINGS } from './calculations';

const LOCAL_DB_KEY = 'gg_local_db_v1';

interface LocalDatabase {
  workspaces: Record<string, WorkspaceData>;
}

function loadDb(): LocalDatabase {
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (!raw) return { workspaces: {} };
    const parsed = JSON.parse(raw) as Partial<LocalDatabase>;
    return {
      workspaces:
        parsed.workspaces && typeof parsed.workspaces === 'object'
          ? parsed.workspaces
          : {},
    };
  } catch {
    return { workspaces: {} };
  }
}

function saveDb(db: LocalDatabase): void {
  try {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
  } catch {
    // ignore quota errors
  }
}

function getActiveKey(db: LocalDatabase): string {
  const keys = Object.keys(db.workspaces || {});
  return keys.length > 0 ? keys[0] : 'default-workspace';
}

function getActiveWorkspace(db: LocalDatabase): WorkspaceData {
  const key = getActiveKey(db);
  if (!db.workspaces[key]) {
    db.workspaces[key] = createEmptyWorkspace();
  }
  return db.workspaces[key];
}

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeInvoice(raw: Partial<Invoice>, existing?: Invoice): Invoice {
  const now = new Date().toISOString();
  const items: InvoiceLineItem[] = Array.isArray(raw.items)
    ? raw.items.map((item, idx) => {
        const qty = Math.max(1, safeNum(item.quantity, 1));
        const purchasePrice = Math.max(0, safeNum(item.purchasePrice, 0));
        const sellingPrice = Math.max(0, safeNum(item.sellingPrice, 0));
        const originalPrice =
          item.originalPrice !== undefined
            ? Math.max(0, safeNum(item.originalPrice, 0))
            : undefined;
        const lineTotal = Number((qty * sellingPrice).toFixed(2));
        const lineCost = Number((qty * purchasePrice).toFixed(2));
        return {
          id: String(item.id || `item-${Date.now()}-${idx}`),
          productId: item.productId ? String(item.productId) : undefined,
          productName: String(item.productName || '').trim(),
          size: item.size ? String(item.size).trim() : '',
          color: item.color ? String(item.color).trim() : '',
          quantity: qty,
          originalPrice,
          purchasePrice,
          sellingPrice,
          lineTotal,
          lineCost,
          lineProfit: Number((lineTotal - lineCost).toFixed(2)),
        };
      })
    : [];

  const subtotal = Number(items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2));
  const totalPurchaseCost = Number(items.reduce((s, i) => s + i.lineCost, 0).toFixed(2));
  const discount = Math.max(0, safeNum(raw.discount, 0));
  const gstPercent = Math.max(0, safeNum(raw.gstPercent, 0));
  const taxable = Math.max(0, subtotal - discount);
  const gstAmount = Number(((taxable * gstPercent) / 100).toFixed(2));
  const deliveryCharge = Math.max(0, safeNum(raw.deliveryCharge, 0));
  const totalAmount = Number((taxable + gstAmount + deliveryCharge).toFixed(2));
  const paidAmount = Number(
    Math.min(totalAmount, Math.max(0, safeNum(raw.paidAmount, 0))).toFixed(2)
  );
  const dueAmount = Number(Math.max(0, totalAmount - paidAmount).toFixed(2));
  const profitAmount = Number((taxable - totalPurchaseCost).toFixed(2));

  const validMethod: PaymentMethod =
    raw.paymentMethod === 'UPI' || raw.paymentMethod === 'Bank Transfer'
      ? raw.paymentMethod
      : 'Cash';
  const validStatus: DeliveryStatus =
    raw.deliveryStatus === 'Processing' ||
    raw.deliveryStatus === 'Shipped' ||
    raw.deliveryStatus === 'Delivered' ||
    raw.deliveryStatus === 'Returned'
      ? raw.deliveryStatus
      : 'Pending';

  return {
    id: existing ? existing.id : String(raw.id || `inv-${crypto.randomUUID()}`),
    invoiceNumber: String(raw.invoiceNumber || '').trim(),
    invoiceDate: String(raw.invoiceDate || now.slice(0, 10)),
    deliveryDate: String(raw.deliveryDate || '').trim(),
    orderVia: String(raw.orderVia || 'WhatsApp').trim(),
    clientId: String(raw.clientId || ''),
    customerName: String(raw.customerName || '').trim(),
    customerMobile: String(raw.customerMobile || '').trim(),
    customerWhatsapp: String(raw.customerWhatsapp || '').trim(),
    customerAddress: String(raw.customerAddress || '').trim(),
    customerCityStatePin: String(raw.customerCityStatePin || '').trim(),
    items,
    subtotal,
    discount,
    gstPercent,
    gstAmount,
    deliveryCharge,
    totalAmount,
    paidAmount,
    dueAmount,
    totalPurchaseCost,
    profitAmount,
    paymentMethod: validMethod,
    courierName: String(raw.courierName || '').trim(),
    trackingNumber: String(raw.trackingNumber || '').trim(),
    trackingUrl: String(raw.trackingUrl || '').trim(),
    deliveryStatus: validStatus,
    notes: String(raw.notes || '').trim(),
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };
}

function adjustStock(
  workspace: WorkspaceData,
  items: InvoiceLineItem[],
  direction: -1 | 1
): void {
  for (const item of items) {
    if (!item.productId) continue;
    const prod = workspace.products.find((p) => p.id === item.productId);
    if (prod) {
      prod.stockQty = Math.max(0, safeNum(prod.stockQty, 0) + direction * item.quantity);
      prod.updatedAt = new Date().toISOString();
    }
  }
}

export const localFallback = {
  fetchWorkspace(): WorkspaceData {
    const db = loadDb();
    return getActiveWorkspace(db);
  },

  updateSettings(next: BusinessSettings): BusinessSettings {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    ws.settings = { ...DEFAULT_SETTINGS, ...next };
    saveDb(db);
    return ws.settings;
  },

  createClient(
    payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
  ): Client {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    const now = new Date().toISOString();
    const client: Client = {
      ...payload,
      id: `cli-${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    ws.clients.unshift(client);
    saveDb(db);
    return client;
  },

  updateClient(
    id: string,
    payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
  ): Client {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    const idx = ws.clients.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Customer not found.');
    const updated: Client = {
      ...ws.clients[idx],
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    ws.clients[idx] = updated;
    saveDb(db);
    return updated;
  },

  deleteClient(id: string) {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    ws.clients = ws.clients.filter((c) => c.id !== id);
    saveDb(db);
    return { ok: true };
  },

  createProduct(
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ): Product {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    const now = new Date().toISOString();
    const product: Product = {
      ...payload,
      id: `prd-${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    ws.products.unshift(product);
    saveDb(db);
    return product;
  },

  updateProduct(
    id: string,
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ): Product {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    const idx = ws.products.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('Product not found.');
    const updated: Product = {
      ...ws.products[idx],
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    ws.products[idx] = updated;
    saveDb(db);
    return updated;
  },

  deleteProduct(id: string) {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    ws.products = ws.products.filter((p) => p.id !== id);
    saveDb(db);
    return { ok: true };
  },

  createInvoice(payload: Partial<Invoice>) {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    const invoice = normalizeInvoice({ ...payload, id: `inv-${crypto.randomUUID()}` });
    adjustStock(ws, invoice.items, -1);
    ws.invoices.unshift(invoice);

    let payment: PaymentRecord | null = null;
    if (invoice.paidAmount > 0) {
      payment = {
        id: `pay-${crypto.randomUUID()}`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId,
        customerName: invoice.customerName,
        totalBill: invoice.totalAmount,
        amountPaid: invoice.paidAmount,
        remainingDueAfter: invoice.dueAmount,
        paymentDate: invoice.invoiceDate,
        paymentMethod: invoice.paymentMethod,
        note: 'Initial invoice payment',
        createdAt: new Date().toISOString(),
      };
      ws.payments.unshift(payment);
    }
    saveDb(db);
    return { invoice, payment, products: ws.products };
  },

  updateInvoice(id: string, payload: Partial<Invoice>) {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    const idx = ws.invoices.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error('Invoice not found.');
    const existing = ws.invoices[idx];
    adjustStock(ws, existing.items, 1);
    const updated = normalizeInvoice(payload, existing);
    adjustStock(ws, updated.items, -1);
    ws.invoices[idx] = updated;
    ws.payments = ws.payments.map((p) =>
      p.invoiceId === updated.id
        ? {
            ...p,
            invoiceNumber: updated.invoiceNumber,
            customerName: updated.customerName,
            totalBill: updated.totalAmount,
          }
        : p
    );
    saveDb(db);
    return { invoice: updated, products: ws.products, payments: ws.payments };
  },

  deleteInvoice(id: string) {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    const existing = ws.invoices.find((i) => i.id === id);
    if (existing) adjustStock(ws, existing.items, 1);
    ws.invoices = ws.invoices.filter((i) => i.id !== id);
    ws.payments = ws.payments.filter((p) => p.invoiceId !== id);
    saveDb(db);
    return { ok: true, products: ws.products };
  },

  createPayment(payload: {
    invoiceId: string;
    amountPaid: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    note: string;
  }) {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    const invoice = ws.invoices.find((i) => i.id === payload.invoiceId);
    if (!invoice) throw new Error('Invoice not found for this payment.');
    const amountPaid = Number(safeNum(payload.amountPaid, 0).toFixed(2));
    if (amountPaid <= 0) throw new Error('Payment amount must be greater than zero.');

    const nextPaid = Number(
      Math.min(invoice.totalAmount, invoice.paidAmount + amountPaid).toFixed(2)
    );
    const nextDue = Number(Math.max(0, invoice.totalAmount - nextPaid).toFixed(2));
    invoice.paidAmount = nextPaid;
    invoice.dueAmount = nextDue;
    invoice.updatedAt = new Date().toISOString();

    const payment: PaymentRecord = {
      id: `pay-${crypto.randomUUID()}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      customerName: invoice.customerName,
      totalBill: invoice.totalAmount,
      amountPaid,
      remainingDueAfter: nextDue,
      paymentDate: payload.paymentDate,
      paymentMethod: payload.paymentMethod,
      note: payload.note.trim(),
      createdAt: new Date().toISOString(),
    };
    ws.payments.unshift(payment);
    saveDb(db);
    return { payment, invoice };
  },

  deletePayment(id: string) {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    const payment = ws.payments.find((p) => p.id === id);
    if (!payment) throw new Error('Payment record not found.');
    ws.payments = ws.payments.filter((p) => p.id !== id);
    const invoice = ws.invoices.find((i) => i.id === payment.invoiceId);
    if (invoice) {
      const nextPaid = Number(
        Math.max(0, invoice.paidAmount - safeNum(payment.amountPaid, 0)).toFixed(2)
      );
      invoice.paidAmount = nextPaid;
      invoice.dueAmount = Number(Math.max(0, invoice.totalAmount - nextPaid).toFixed(2));
      invoice.updatedAt = new Date().toISOString();
    }
    saveDb(db);
    return { ok: true, invoice };
  },

  updateDelivery(
    invoiceId: string,
    payload: {
      courierName: string;
      trackingNumber: string;
      deliveryStatus: DeliveryStatus;
    }
  ): Invoice {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    const invoice = ws.invoices.find((i) => i.id === invoiceId);
    if (!invoice) throw new Error('Order not found.');
    invoice.courierName = payload.courierName.trim();
    invoice.trackingNumber = payload.trackingNumber.trim();
    invoice.deliveryStatus = payload.deliveryStatus;
    invoice.updatedAt = new Date().toISOString();
    saveDb(db);
    return invoice;
  },

  createExpense(
    payload: Omit<ExpenseRecord, 'id' | 'createdAt'>
  ): ExpenseRecord {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    const expense: ExpenseRecord = {
      ...payload,
      id: `exp-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    };
    ws.expenses.unshift(expense);
    saveDb(db);
    return expense;
  },

  deleteExpense(id: string) {
    const db = loadDb();
    const ws = getActiveWorkspace(db);
    ws.expenses = ws.expenses.filter((e) => e.id !== id);
    saveDb(db);
    return { ok: true };
  },

  restoreBackup(workspace: WorkspaceData): WorkspaceData {
    const db = loadDb();
    const defaults = createEmptyWorkspace();
    const restored: WorkspaceData = {
      settings: { ...defaults.settings, ...(workspace.settings || {}) },
      clients: Array.isArray(workspace.clients) ? workspace.clients : [],
      products: Array.isArray(workspace.products) ? workspace.products : [],
      invoices: Array.isArray(workspace.invoices)
        ? workspace.invoices.map((inv) => normalizeInvoice(inv))
        : [],
      payments: Array.isArray(workspace.payments) ? workspace.payments : [],
      expenses: Array.isArray(workspace.expenses) ? workspace.expenses : [],
    };
    db.workspaces[getActiveKey(db)] = restored;
    saveDb(db);
    return restored;
  },

  searchPublicBills(query: string) {
    const rawQuery = query.trim();
    if (rawQuery.length < 2) {
      throw new Error(
        'Please enter at least 2 characters (Order / Invoice Number or Client Name).'
      );
    }
    const qLower = rawQuery.toLowerCase();
    const qDigits = rawQuery.replace(/[^\d]/g, '');
    const db = loadDb();

    const matches: Array<{ invoice: Invoice; settings: BusinessSettings }> = [];

    for (const ws of Object.values(db.workspaces)) {
      if (!ws || !Array.isArray(ws.invoices)) continue;
      for (const inv of ws.invoices) {
        const linkedClient = (ws.clients || []).find((c) => c.id === inv.clientId);
        const clientName = linkedClient ? linkedClient.name.toLowerCase() : '';
        const invNum = String(inv.invoiceNumber || '').toLowerCase();
        const custName = String(inv.customerName || '').toLowerCase();
        const trackingNum = String(inv.trackingNumber || '').toLowerCase();
        const mobileDigits = String(inv.customerMobile || '').replace(/[^\d]/g, '');

        const isMatch =
          invNum.includes(qLower) ||
          custName.includes(qLower) ||
          clientName.includes(qLower) ||
          (trackingNum && trackingNum.includes(qLower)) ||
          (qDigits.length >= 4 && mobileDigits.includes(qDigits));

        if (!isMatch) continue;

        matches.push({
          invoice: {
            ...inv,
            totalPurchaseCost: 0,
            profitAmount: 0,
            notes: '',
            items: (inv.items || []).map((item) => ({
              ...item,
              purchasePrice: 0,
              lineCost: 0,
              lineProfit: 0,
            })),
          },
          settings: { ...DEFAULT_SETTINGS, ...(ws.settings || {}), lowStockThreshold: 5 },
        });
      }
    }

    matches.sort((a, b) =>
      String(b.invoice.invoiceDate || b.invoice.createdAt).localeCompare(
        String(a.invoice.invoiceDate || a.invoice.createdAt)
      )
    );

    return { results: matches.slice(0, 20) };
  },
};
