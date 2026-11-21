import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'glamour-galleria-db.json');
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
const DIST_DIR = path.resolve(__dirname, 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');

interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

interface StoredLineItem {
  id: string;
  productId?: string;
  productName: string;
  size?: string;
  color?: string;
  quantity: number;
  originalPrice?: number;
  purchasePrice: number;
  sellingPrice: number;
  lineTotal: number;
  lineCost: number;
  lineProfit: number;
}

interface StoredInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  deliveryDate?: string;
  orderVia?: string;
  clientId: string;
  customerName: string;
  customerMobile: string;
  customerWhatsapp: string;
  customerAddress: string;
  customerCityStatePin: string;
  items: StoredLineItem[];
  subtotal: number;
  discount: number;
  gstPercent?: number;
  gstAmount?: number;
  deliveryCharge: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  totalPurchaseCost: number;
  profitAmount: number;
  paymentMethod: 'Cash' | 'UPI' | 'Bank Transfer';
  courierName: string;
  trackingNumber: string;
  trackingUrl?: string;
  deliveryStatus: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Returned';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredWorkspace {
  settings: {
    businessName: string;
    tagline: string;
    logoDataUrl: string;
    address: string;
    mobile: string;
    whatsapp: string;
    gstin: string;
    currencySymbol: string;
    currencyCode: string;
    invoicePrefix: string;
    upiId: string;
    upiNumber?: string;
    bankAccountName?: string;
    bankAccountNo?: string;
    bankIfscBranch?: string;
    invoiceFooterNote: string;
    socialTagLine?: string;
    lowStockThreshold: number;
  };
  clients: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown> & { id: string; stockQty?: number }>;
  invoices: StoredInvoice[];
  payments: Array<Record<string, unknown> & { id: string; invoiceId: string; amountPaid: number }>;
  expenses: Array<Record<string, unknown> & { id: string }>;
}

interface DatabaseSchema {
  users: StoredUser[];
  workspaces: Record<string, StoredWorkspace>;
}

interface AuthenticatedRequest extends Request {
  authUser?: StoredUser;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  try {
    ensureDataDir();
    if (fs.existsSync(SECRET_FILE)) {
      return fs.readFileSync(SECRET_FILE, 'utf8').trim();
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, generated, { encoding: 'utf8', mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

const SESSION_SECRET = getSessionSecret();

function createDefaultWorkspace(): StoredWorkspace {
  return {
    settings: {
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
    },
    clients: [],
    products: [],
    invoices: [],
    payments: [],
    expenses: [],
  };
}

function loadDatabase(): DatabaseSchema {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    const initial: DatabaseSchema = { users: [], workspaces: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      workspaces: parsed.workspaces && typeof parsed.workspaces === 'object' ? parsed.workspaces : {},
    };
  } catch {
    return { users: [], workspaces: {} };
  }
}

let dbState: DatabaseSchema = loadDatabase();
let writeChain: Promise<void> = Promise.resolve();

function persistDatabase(): Promise<void> {
  const snapshot = JSON.stringify(dbState, null, 2);
  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      try {
        ensureDataDir();
        const tmp = `${DB_FILE}.${Date.now()}.tmp`;
        await fs.promises.writeFile(tmp, snapshot, 'utf8');
        await fs.promises.rename(tmp, DB_FILE);
      } catch (err) {
        console.error('Database write warning:', err);
      }
    });
  return writeChain;
}

function getOrCreateWorkspace(userId: string): StoredWorkspace {
  if (!dbState.workspaces[userId]) {
    dbState.workspaces[userId] = createDefaultWorkspace();
  }
  return dbState.workspaces[userId];
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, usedSalt, 64).toString('hex');
  return { hash: derived, salt: usedSalt };
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createAuthToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, iat: Date.now(), exp: Date.now() + 1000 * 60 * 60 * 24 * 30 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAuthToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
      exp?: number;
    };
    if (!decoded.uid || !decoded.exp || decoded.exp < Date.now()) return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const userId = verifyAuthToken(token);
  if (!userId) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }
  const user = dbState.users.find((u) => u.id === userId);
  if (!user) {
    res.status(401).json({ error: 'Account not found. Please sign in again.' });
    return;
  }
  req.authUser = user;
  next();
}

function safeNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeInvoicePayload(raw: Partial<StoredInvoice>, existing?: StoredInvoice): StoredInvoice {
  const now = new Date().toISOString();
  const items: StoredLineItem[] = Array.isArray(raw.items)
    ? raw.items.map((item, idx) => {
        const qty = Math.max(1, safeNumber(item.quantity, 1));
        const purchasePrice = Math.max(0, safeNumber(item.purchasePrice, 0));
        const sellingPrice = Math.max(0, safeNumber(item.sellingPrice, 0));
        const originalPrice =
          item.originalPrice !== undefined ? Math.max(0, safeNumber(item.originalPrice, 0)) : undefined;
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
  const discount = Math.max(0, safeNumber(raw.discount, 0));
  const gstPercent = Math.max(0, safeNumber(raw.gstPercent, 0));
  const taxable = Math.max(0, subtotal - discount);
  const gstAmount = Number(((taxable * gstPercent) / 100).toFixed(2));
  const deliveryCharge = Math.max(0, safeNumber(raw.deliveryCharge, 0));
  const totalAmount = Number((taxable + gstAmount + deliveryCharge).toFixed(2));
  const paidAmount = Number(Math.min(totalAmount, Math.max(0, safeNumber(raw.paidAmount, 0))).toFixed(2));
  const dueAmount = Number(Math.max(0, totalAmount - paidAmount).toFixed(2));
  const profitAmount = Number((taxable - totalPurchaseCost).toFixed(2));

  const validMethod: StoredInvoice['paymentMethod'] =
    raw.paymentMethod === 'UPI' || raw.paymentMethod === 'Bank Transfer' ? raw.paymentMethod : 'Cash';
  const validStatus: StoredInvoice['deliveryStatus'] =
    raw.deliveryStatus === 'Processing' ||
    raw.deliveryStatus === 'Shipped' ||
    raw.deliveryStatus === 'Delivered' ||
    raw.deliveryStatus === 'Returned'
      ? raw.deliveryStatus
      : 'Pending';

  return {
    id: existing ? existing.id : String(raw.id || `inv-${Date.now()}`),
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

function adjustProductStock(
  workspace: StoredWorkspace,
  items: StoredLineItem[],
  direction: -1 | 1
): void {
  for (const item of items) {
    if (!item.productId) continue;
    const prod = workspace.products.find((p) => p.id === item.productId);
    if (prod) {
      const current = safeNumber(prod.stockQty, 0);
      prod.stockQty = Math.max(0, current + direction * item.quantity);
      prod.updatedAt = new Date().toISOString();
    }
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Health route
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', app: 'Glamour Galleria' });
  });

  // AUTH ROUTES (Sign In & Create Account)
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!name || name.length < 2) {
      res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const exists = dbState.users.find((u) => u.email === email);
    if (exists) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      return;
    }

    const { hash, salt } = hashPassword(password);
    const user: StoredUser = {
      id: `usr-${crypto.randomUUID()}`,
      name,
      email,
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString(),
    };

    dbState.users.push(user);
    const workspace = getOrCreateWorkspace(user.id);
    await persistDatabase();

    const token = createAuthToken(user.id);
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
      workspace,
    });
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const envEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const envPassword = process.env.ADMIN_PASSWORD || '';

    let user = dbState.users.find((u) => u.email === email);

    if (envEmail && envPassword && email === envEmail) {
      const a = Buffer.from(password);
      const b = Buffer.from(envPassword);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }
      if (!user) {
        const { hash, salt } = hashPassword(envPassword);
        user = {
          id: `usr-${crypto.randomUUID()}`,
          name: 'Owner',
          email: envEmail,
          passwordHash: hash,
          salt,
          createdAt: new Date().toISOString(),
        };
        dbState.users.push(user);
        getOrCreateWorkspace(user.id);
        await persistDatabase();
      }
    } else if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = createAuthToken(user.id);
    const workspace = getOrCreateWorkspace(user.id);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
      workspace,
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const workspace = getOrCreateWorkspace(user.id);
    res.json({
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
      workspace,
    });
  });

  app.post('/api/auth/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (!verifyPassword(currentPassword, user.salt, user.passwordHash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters long.' });
      return;
    }

    const { hash, salt } = hashPassword(newPassword);
    user.passwordHash = hash;
    user.salt = salt;
    await persistDatabase();
    res.json({ ok: true });
  });

  // AUTHENTICATED WORKSPACE ROUTES
  app.get('/api/workspace', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    res.json(workspace);
  });

  app.put('/api/workspace/settings', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    const body = req.body || {};
    workspace.settings = {
      ...workspace.settings,
      businessName: String(body.businessName || 'Glamour Galleria').trim(),
      tagline: String(body.tagline || 'Your Style, Our Priority').trim(),
      logoDataUrl: String(body.logoDataUrl || ''),
      address: String(body.address || '').trim(),
      mobile: String(body.mobile || '').trim(),
      whatsapp: String(body.whatsapp || '').trim(),
      gstin: String(body.gstin || '').trim(),
      currencySymbol: String(body.currencySymbol || '₹').trim() || '₹',
      currencyCode: String(body.currencyCode || 'INR').trim() || 'INR',
      invoicePrefix: String(body.invoicePrefix || 'GG-').trim() || 'GG-',
      upiId: String(body.upiId || '').trim(),
      upiNumber: String(body.upiNumber || '').trim(),
      bankAccountName: String(body.bankAccountName || '').trim(),
      bankAccountNo: String(body.bankAccountNo || '').trim(),
      bankIfscBranch: String(body.bankIfscBranch || '').trim(),
      invoiceFooterNote: String(body.invoiceFooterNote || '').trim(),
      socialTagLine: String(body.socialTagLine || '').trim(),
      lowStockThreshold: Math.max(1, safeNumber(body.lowStockThreshold, 5)),
    };
    await persistDatabase();
    res.json(workspace.settings);
  });

  // CLIENTS CRUD
  app.post('/api/workspace/clients', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const mobile = String(body.mobile || '').trim();
    if (!name || !mobile) {
      res.status(400).json({ error: 'Customer name and mobile number are required.' });
      return;
    }
    const now = new Date().toISOString();
    const client = {
      id: `cli-${crypto.randomUUID()}`,
      name,
      mobile,
      whatsapp: String(body.whatsapp || mobile).trim(),
      address: String(body.address || '').trim(),
      state: String(body.state || '').trim(),
      city: String(body.city || '').trim(),
      pinCode: String(body.pinCode || '').trim(),
      createdAt: now,
      updatedAt: now,
    };
    workspace.clients.unshift(client);
    await persistDatabase();
    res.status(201).json(client);
  });

  app.put('/api/workspace/clients/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    const idx = workspace.clients.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const mobile = String(body.mobile || '').trim();
    if (!name || !mobile) {
      res.status(400).json({ error: 'Customer name and mobile number are required.' });
      return;
    }
    const updated = {
      ...workspace.clients[idx],
      name,
      mobile,
      whatsapp: String(body.whatsapp || mobile).trim(),
      address: String(body.address || '').trim(),
      state: String(body.state || '').trim(),
      city: String(body.city || '').trim(),
      pinCode: String(body.pinCode || '').trim(),
      updatedAt: new Date().toISOString(),
    };
    workspace.clients[idx] = updated;
    await persistDatabase();
    res.json(updated);
  });

  app.delete('/api/workspace/clients/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    workspace.clients = workspace.clients.filter((c) => c.id !== req.params.id);
    await persistDatabase();
    res.json({ ok: true });
  });

  // PRODUCTS CRUD
  app.post('/api/workspace/products', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Product name is required.' });
      return;
    }
    const now = new Date().toISOString();
    const product = {
      id: `prd-${crypto.randomUUID()}`,
      name,
      imageDataUrl: String(body.imageDataUrl || ''),
      category: String(body.category || 'Fashion').trim(),
      purchasePrice: Math.max(0, safeNumber(body.purchasePrice, 0)),
      sellingPrice: Math.max(0, safeNumber(body.sellingPrice, 0)),
      stockQty: Math.max(0, Math.floor(safeNumber(body.stockQty, 0))),
      lowStockAlert: Math.max(1, Math.floor(safeNumber(body.lowStockAlert, 5))),
      size: String(body.size || '').trim(),
      color: String(body.color || '').trim(),
      createdAt: now,
      updatedAt: now,
    };
    workspace.products.unshift(product);
    await persistDatabase();
    res.status(201).json(product);
  });

  app.put('/api/workspace/products/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    const idx = workspace.products.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Product name is required.' });
      return;
    }
    const updated = {
      ...workspace.products[idx],
      name,
      imageDataUrl: String(body.imageDataUrl ?? workspace.products[idx].imageDataUrl ?? ''),
      category: String(body.category || 'Fashion').trim(),
      purchasePrice: Math.max(0, safeNumber(body.purchasePrice, 0)),
      sellingPrice: Math.max(0, safeNumber(body.sellingPrice, 0)),
      stockQty: Math.max(0, Math.floor(safeNumber(body.stockQty, 0))),
      lowStockAlert: Math.max(1, Math.floor(safeNumber(body.lowStockAlert, 5))),
      size: String(body.size || '').trim(),
      color: String(body.color || '').trim(),
      updatedAt: new Date().toISOString(),
    };
    workspace.products[idx] = updated;
    await persistDatabase();
    res.json(updated);
  });

  app.delete('/api/workspace/products/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    workspace.products = workspace.products.filter((p) => p.id !== req.params.id);
    await persistDatabase();
    res.json({ ok: true });
  });

  // INVOICES CRUD (with stock & payment sync)
  app.post('/api/workspace/invoices', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    const raw = req.body || {};
    if (!String(raw.customerName || '').trim()) {
      res.status(400).json({ error: 'Please select or enter a customer.' });
      return;
    }
    if (!Array.isArray(raw.items) || raw.items.length === 0) {
      res.status(400).json({ error: 'Please add at least one product to the invoice.' });
      return;
    }

    const invoice = normalizeInvoicePayload({
      ...raw,
      id: `inv-${crypto.randomUUID()}`,
    });

    adjustProductStock(workspace, invoice.items, -1);
    workspace.invoices.unshift(invoice);

    let createdPayment = null;
    if (invoice.paidAmount > 0) {
      createdPayment = {
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
      workspace.payments.unshift(createdPayment);
    }

    await persistDatabase();
    res.status(201).json({
      invoice,
      payment: createdPayment,
      products: workspace.products,
    });
  });

  app.put('/api/workspace/invoices/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    const idx = workspace.invoices.findIndex((i) => i.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }
    const existing = workspace.invoices[idx];
    adjustProductStock(workspace, existing.items, 1);

    const updated = normalizeInvoicePayload(req.body || {}, existing);
    adjustProductStock(workspace, updated.items, -1);
    workspace.invoices[idx] = updated;

    // Keep linked payments consistent with updated customer/invoice info
    workspace.payments = workspace.payments.map((p) =>
      p.invoiceId === updated.id
        ? {
            ...p,
            invoiceNumber: updated.invoiceNumber,
            customerName: updated.customerName,
            totalBill: updated.totalAmount,
          }
        : p
    );

    await persistDatabase();
    res.json({
      invoice: updated,
      products: workspace.products,
      payments: workspace.payments,
    });
  });

  app.delete('/api/workspace/invoices/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    const existing = workspace.invoices.find((i) => i.id === req.params.id);
    if (existing) {
      adjustProductStock(workspace, existing.items, 1);
    }
    workspace.invoices = workspace.invoices.filter((i) => i.id !== req.params.id);
    workspace.payments = workspace.payments.filter((p) => p.invoiceId !== req.params.id);
    await persistDatabase();
    res.json({ ok: true, products: workspace.products });
  });

  // PAYMENTS CRUD
  app.post('/api/workspace/payments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    const body = req.body || {};
    const invoice = workspace.invoices.find((i) => i.id === body.invoiceId);
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found for this payment.' });
      return;
    }

    const amountPaid = Number(safeNumber(body.amountPaid, 0).toFixed(2));
    if (amountPaid <= 0) {
      res.status(400).json({ error: 'Payment amount must be greater than zero.' });
      return;
    }

    const nextPaid = Number(Math.min(invoice.totalAmount, invoice.paidAmount + amountPaid).toFixed(2));
    const nextDue = Number(Math.max(0, invoice.totalAmount - nextPaid).toFixed(2));
    invoice.paidAmount = nextPaid;
    invoice.dueAmount = nextDue;
    invoice.updatedAt = new Date().toISOString();

    const validMethod: 'Cash' | 'UPI' | 'Bank Transfer' =
      body.paymentMethod === 'UPI' || body.paymentMethod === 'Bank Transfer'
        ? body.paymentMethod
        : 'Cash';

    const payment = {
      id: `pay-${crypto.randomUUID()}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      customerName: invoice.customerName,
      totalBill: invoice.totalAmount,
      amountPaid,
      remainingDueAfter: nextDue,
      paymentDate: String(body.paymentDate || new Date().toISOString().slice(0, 10)),
      paymentMethod: validMethod,
      note: String(body.note || '').trim(),
      createdAt: new Date().toISOString(),
    };
    workspace.payments.unshift(payment);
    await persistDatabase();
    res.status(201).json({ payment, invoice });
  });

  app.delete('/api/workspace/payments/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    const payment = workspace.payments.find((p) => p.id === req.params.id);
    if (!payment) {
      res.status(404).json({ error: 'Payment record not found.' });
      return;
    }
    workspace.payments = workspace.payments.filter((p) => p.id !== req.params.id);
    const invoice = workspace.invoices.find((i) => i.id === payment.invoiceId);
    if (invoice) {
      const nextPaid = Number(Math.max(0, invoice.paidAmount - safeNumber(payment.amountPaid, 0)).toFixed(2));
      invoice.paidAmount = nextPaid;
      invoice.dueAmount = Number(Math.max(0, invoice.totalAmount - nextPaid).toFixed(2));
      invoice.updatedAt = new Date().toISOString();
    }
    await persistDatabase();
    res.json({ ok: true, invoice });
  });

  // DELIVERY TRACKING UPDATE
  app.put('/api/workspace/deliveries/:invoiceId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    const invoice = workspace.invoices.find((i) => i.id === req.params.invoiceId);
    if (!invoice) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const body = req.body || {};
    const validStatus: StoredInvoice['deliveryStatus'] =
      body.deliveryStatus === 'Processing' ||
      body.deliveryStatus === 'Shipped' ||
      body.deliveryStatus === 'Delivered' ||
      body.deliveryStatus === 'Returned'
        ? body.deliveryStatus
        : 'Pending';

    invoice.courierName = String(body.courierName ?? invoice.courierName).trim();
    invoice.trackingNumber = String(body.trackingNumber ?? invoice.trackingNumber).trim();
    invoice.deliveryStatus = validStatus;
    invoice.updatedAt = new Date().toISOString();

    await persistDatabase();
    res.json(invoice);
  });

  // EXPENSES CRUD (for Profit & Loss)
  app.post('/api/workspace/expenses', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    const body = req.body || {};
    const title = String(body.title || '').trim();
    const amount = Number(safeNumber(body.amount, 0).toFixed(2));
    if (!title || amount <= 0) {
      res.status(400).json({ error: 'Expense title and positive amount are required.' });
      return;
    }
    const expense = {
      id: `exp-${crypto.randomUUID()}`,
      title,
      category: String(body.category || 'Other'),
      amount,
      expenseDate: String(body.expenseDate || new Date().toISOString().slice(0, 10)),
      note: String(body.note || '').trim(),
      createdAt: new Date().toISOString(),
    };
    workspace.expenses.unshift(expense);
    await persistDatabase();
    res.status(201).json(expense);
  });

  app.delete('/api/workspace/expenses/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const workspace = getOrCreateWorkspace(req.authUser!.id);
    workspace.expenses = workspace.expenses.filter((e) => e.id !== req.params.id);
    await persistDatabase();
    res.json({ ok: true });
  });

  // BACKUP RESTORE
  app.post('/api/workspace/restore', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    if (!body || typeof body !== 'object' || !Array.isArray(body.clients) || !Array.isArray(body.invoices)) {
      res.status(400).json({ error: 'Invalid backup file format.' });
      return;
    }
    const defaults = createDefaultWorkspace();
    const restored: StoredWorkspace = {
      settings: {
        ...defaults.settings,
        ...(body.settings && typeof body.settings === 'object' ? body.settings : {}),
      },
      clients: Array.isArray(body.clients) ? body.clients : [],
      products: Array.isArray(body.products) ? body.products : [],
      invoices: Array.isArray(body.invoices)
        ? body.invoices.map((inv: Partial<StoredInvoice>) => normalizeInvoicePayload(inv))
        : [],
      payments: Array.isArray(body.payments) ? body.payments : [],
      expenses: Array.isArray(body.expenses) ? body.expenses : [],
    };
    dbState.workspaces[req.authUser!.id] = restored;
    await persistDatabase();
    res.json(restored);
  });

  // PUBLIC VIEW PANEL ROUTE (Order Number / Client Name Lookup - sanitized, no internal cost/profit data)
  app.get('/api/public/bills', (req: Request, res: Response) => {
    const rawQuery = String(req.query.q || '').trim();
    if (rawQuery.length < 2) {
      res.status(400).json({
        error: 'Please enter at least 2 characters (Order / Invoice Number or Client Name).',
      });
      return;
    }

    const qLower = rawQuery.toLowerCase();
    const qDigits = rawQuery.replace(/[^\d]/g, '');

    interface PublicBillResult {
      invoice: StoredInvoice;
      settings: StoredWorkspace['settings'];
    }

    const matches: PublicBillResult[] = [];

    for (const workspace of Object.values(dbState.workspaces)) {
      if (!workspace || !Array.isArray(workspace.invoices)) continue;
      const clients = Array.isArray(workspace.clients) ? workspace.clients : [];

      for (const inv of workspace.invoices) {
        const linkedClient = clients.find((c) => c.id === inv.clientId);
        const clientName = linkedClient ? String(linkedClient.name || '') : '';
        const invNum = String(inv.invoiceNumber || '').toLowerCase();
        const custName = String(inv.customerName || '').toLowerCase();
        const trackingNum = String(inv.trackingNumber || '').toLowerCase();
        const mobileDigits = String(inv.customerMobile || '').replace(/[^\d]/g, '');

        const isMatch =
          invNum.includes(qLower) ||
          custName.includes(qLower) ||
          clientName.toLowerCase().includes(qLower) ||
          (trackingNum && trackingNum.includes(qLower)) ||
          (qDigits.length >= 4 && mobileDigits.includes(qDigits));

        if (!isMatch) continue;

        const sanitizedInvoice: StoredInvoice = {
          ...inv,
          totalPurchaseCost: 0,
          profitAmount: 0,
          notes: '',
          items: Array.isArray(inv.items)
            ? inv.items.map((item) => ({
                ...item,
                purchasePrice: 0,
                lineCost: 0,
                lineProfit: 0,
              }))
            : [],
        };

        const publicSettings: StoredWorkspace['settings'] = {
          ...createDefaultWorkspace().settings,
          ...(workspace.settings || {}),
          lowStockThreshold: 5,
        };

        matches.push({ invoice: sanitizedInvoice, settings: publicSettings });
      }
    }

    matches.sort((a, b) =>
      String(b.invoice.invoiceDate || b.invoice.createdAt).localeCompare(
        String(a.invoice.invoiceDate || a.invoice.createdAt)
      )
    );

    res.json({ results: matches.slice(0, 20) });
  });

  const isDev = process.env.NODE_ENV === 'development' || !fs.existsSync(DIST_INDEX);
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DIST_DIR));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(DIST_INDEX);
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Glamour Galleria server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
