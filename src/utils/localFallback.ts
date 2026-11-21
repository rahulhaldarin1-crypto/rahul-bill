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
  UserAccount,
  WorkspaceData,
} from '../types/business';
import { createEmptyWorkspace, DEFAULT_SETTINGS } from './calculations';

const LOCAL_DB_KEY = 'gg_local_db_v1';

interface LocalStoredUser extends UserAccount {
  passwordHash: string;
  salt: string;
}

interface LocalDatabase {
  users: LocalStoredUser[];
  workspaces: Record<string, WorkspaceData>;
}

function loadDb(): LocalDatabase {
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (!raw) return { users: [], workspaces: {} };
    const parsed = JSON.parse(raw) as Partial<LocalDatabase>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      workspaces:
        parsed.workspaces && typeof parsed.workspaces === 'object'
          ? parsed.workspaces
          : {},
    };
  } catch {
    return { users: [], workspaces: {} };
  }
}

function saveDb(db: LocalDatabase): void {
  try {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
  } catch {
    // ignore quota errors
  }
}

function getOrCreateWorkspace(db: LocalDatabase, userId: string): WorkspaceData {
  if (!db.workspaces[userId]) {
    db.workspaces[userId] = createEmptyWorkspace();
  }
  return db.workspaces[userId];
}

function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashWithSalt(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i];
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return `${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

function makeLocalToken(userId: string): string {
  return `local.${btoa(JSON.stringify({ uid: userId, iat: Date.now() }))}`;
}

function requireLocalUser(db: LocalDatabase, token: string | null): LocalStoredUser {
  if (!token || !token.startsWith('local.')) {
    throw new Error('Authentication required. Please sign in.');
  }
  try {
    const decoded = JSON.parse(atob(token.slice(6))) as { uid?: string };
    const user = db.users.find((u) => u.id === decoded.uid);
    if (!user) throw new Error('Account not found. Please sign in again.');
    return user;
  } catch {
    throw new Error('Session expired or invalid. Please sign in again.');
  }
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
  async register(payload: { name: string; email: string; password: string }) {
    const name = payload.name.trim();
    const email = payload.email.trim().toLowerCase();
    const password = payload.password;

    if (name.length < 2) {
      throw new Error('Please enter your full name (at least 2 characters).');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Please enter a valid email address.');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const db = loadDb();
    if (db.users.some((u) => u.email === email)) {
      throw new Error('An account with this email already exists. Please sign in.');
    }

    const salt = randomHex(16);
    const passwordHash = await hashWithSalt(password, salt);
    const user: LocalStoredUser = {
      id: `usr-${crypto.randomUUID()}`,
      name,
      email,
      passwordHash,
      salt,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    const workspace = getOrCreateWorkspace(db, user.id);
    saveDb(db);

    return {
      token: makeLocalToken(user.id),
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
      workspace,
    };
  },

  async login(payload: { email: string; password: string }) {
    const email = payload.email.trim().toLowerCase();
    const password = payload.password;
    if (!email || !password) {
      throw new Error('Email and password are required.');
    }
    const db = loadDb();
    const user = db.users.find((u) => u.email === email);
    if (!user) {
      throw new Error('Invalid email or password.');
    }
    const hash = await hashWithSalt(password, user.salt);
    if (hash !== user.passwordHash) {
      throw new Error('Invalid email or password.');
    }
    const workspace = getOrCreateWorkspace(db, user.id);
    saveDb(db);
    return {
      token: makeLocalToken(user.id),
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
      workspace,
    };
  },

  fetchSession(token: string | null) {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const workspace = getOrCreateWorkspace(db, user.id);
    return {
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
      workspace,
    };
  },

  async changePassword(
    token: string | null,
    payload: { currentPassword: string; newPassword: string }
  ) {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const currentHash = await hashWithSalt(payload.currentPassword, user.salt);
    if (currentHash !== user.passwordHash) {
      throw new Error('Current password is incorrect.');
    }
    if (payload.newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }
    const salt = randomHex(16);
    user.salt = salt;
    user.passwordHash = await hashWithSalt(payload.newPassword, salt);
    saveDb(db);
    return { ok: true };
  },

  fetchWorkspace(token: string | null): WorkspaceData {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    return getOrCreateWorkspace(db, user.id);
  },

  updateSettings(token: string | null, next: BusinessSettings): BusinessSettings {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
    ws.settings = { ...DEFAULT_SETTINGS, ...next };
    saveDb(db);
    return ws.settings;
  },

  createClient(
    token: string | null,
    payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
  ): Client {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
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
    token: string | null,
    id: string,
    payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
  ): Client {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
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

  deleteClient(token: string | null, id: string) {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
    ws.clients = ws.clients.filter((c) => c.id !== id);
    saveDb(db);
    return { ok: true };
  },

  createProduct(
    token: string | null,
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ): Product {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
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
    token: string | null,
    id: string,
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ): Product {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
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

  deleteProduct(token: string | null, id: string) {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
    ws.products = ws.products.filter((p) => p.id !== id);
    saveDb(db);
    return { ok: true };
  },

  createInvoice(token: string | null, payload: Partial<Invoice>) {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
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

  updateInvoice(token: string | null, id: string, payload: Partial<Invoice>) {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
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

  deleteInvoice(token: string | null, id: string) {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
    const existing = ws.invoices.find((i) => i.id === id);
    if (existing) adjustStock(ws, existing.items, 1);
    ws.invoices = ws.invoices.filter((i) => i.id !== id);
    ws.payments = ws.payments.filter((p) => p.invoiceId !== id);
    saveDb(db);
    return { ok: true, products: ws.products };
  },

  createPayment(
    token: string | null,
    payload: {
      invoiceId: string;
      amountPaid: number;
      paymentDate: string;
      paymentMethod: PaymentMethod;
      note: string;
    }
  ) {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
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

  deletePayment(token: string | null, id: string) {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
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
    token: string | null,
    invoiceId: string,
    payload: {
      courierName: string;
      trackingNumber: string;
      deliveryStatus: DeliveryStatus;
    }
  ): Invoice {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
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
    token: string | null,
    payload: Omit<ExpenseRecord, 'id' | 'createdAt'>
  ): ExpenseRecord {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
    const expense: ExpenseRecord = {
      ...payload,
      id: `exp-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    };
    ws.expenses.unshift(expense);
    saveDb(db);
    return expense;
  },

  deleteExpense(token: string | null, id: string) {
    const db = loadDb();
    const user = requireLocalUser(db, token);
    const ws = getOrCreateWorkspace(db, user.id);
    ws.expenses = ws.expenses.filter((e) => e.id !== id);
    saveDb(db);
    return { ok: true };
  },

  restoreBackup(token: string | null, workspace: WorkspaceData): WorkspaceData {
    const db = loadDb();
    const user = requireLocalUser(db, token);
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
    db.workspaces[user.id] = restored;
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
