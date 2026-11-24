import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import nodemailer from 'nodemailer';
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

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

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

function getActiveWorkspaceKey(): string {
  const existingKeys = Object.keys(dbState.workspaces || {});
  if (existingKeys.length > 0) {
    return existingKeys[0];
  }
  return 'default-workspace';
}

function getActiveWorkspace(): StoredWorkspace {
  return getOrCreateWorkspace(getActiveWorkspaceKey());
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

  // 6-DIGIT EMAIL OTP DELIVERY & VERIFICATION (SMTP)
  const ADMIN_OTP_EMAIL = 'rahulhaldar.in@gmail.com';
  const OTP_EXPIRY_MS = 5 * 60 * 1000;
  const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
  const ALLOWED_OTP_PURPOSES = new Set([
    'customer_register',
    'seller_register',
    'customer_forgot_password',
    'seller_forgot_password',
    'admin_login',
  ]);
  const OTP_SIGNING_SECRET: Buffer = process.env.OTP_SECRET
    ? crypto.createHash('sha256').update(process.env.OTP_SECRET).digest()
    : crypto.randomBytes(32);
  const otpCooldownMap = new Map<string, number>();

  const escapeHtml = (val: string): string =>
    val
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const signOtpChallenge = (payload: Record<string, unknown>): string => {
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', OTP_SIGNING_SECRET)
      .update(encoded)
      .digest('hex');
    return `${encoded}.${sig}`;
  };

  const verifyOtpChallenge = (
    token: string
  ): {
    otpId: string;
    email: string;
    purpose: string;
    salt: string;
    otpHash: string;
    expiresAtMs: number;
  } | null => {
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [encoded, sigHex] = parts;
    const expectedHex = crypto
      .createHmac('sha256', OTP_SIGNING_SECRET)
      .update(encoded)
      .digest('hex');
    const sigBuf = Buffer.from(sigHex, 'utf8');
    const expectedBuf = Buffer.from(expectedHex, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
        otpId?: string;
        email?: string;
        purpose?: string;
        salt?: string;
        otpHash?: string;
        expiresAtMs?: number;
      };
      if (
        !parsed.otpId ||
        !parsed.email ||
        !parsed.purpose ||
        !parsed.salt ||
        !parsed.otpHash ||
        typeof parsed.expiresAtMs !== 'number'
      ) {
        return null;
      }
      return {
        otpId: parsed.otpId,
        email: parsed.email,
        purpose: parsed.purpose,
        salt: parsed.salt,
        otpHash: parsed.otpHash,
        expiresAtMs: parsed.expiresAtMs,
      };
    } catch {
      return null;
    }
  };

  app.post('/api/otp/send', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { email?: unknown; purpose?: unknown };
      const purpose = String(body.purpose || '').trim();
      if (!ALLOWED_OTP_PURPOSES.has(purpose)) {
        res.status(400).json({ error: 'Invalid OTP purpose.' });
        return;
      }

      const targetEmail =
        purpose === 'admin_login'
          ? ADMIN_OTP_EMAIL
          : String(body.email || '').trim().toLowerCase();

      if (!/^[a-z0-9._%+-]+@gmail\.com$/i.test(targetEmail)) {
        res.status(400).json({
          error: 'Please enter a valid @gmail.com email address for OTP verification.',
        });
        return;
      }

      const nowMs = Date.now();
      const cooldownKey = `${purpose}:${targetEmail}`;
      const nextAllowedMs = otpCooldownMap.get(cooldownKey) || 0;
      if (nextAllowedMs > nowMs) {
        const waitSec = Math.ceil((nextAllowedMs - nowMs) / 1000);
        res.status(429).json({
          error: `Please wait ${waitSec}s before requesting another OTP.`,
          retryAfterSec: waitSec,
        });
        return;
      }

      const smtpHost = String(process.env.SMTP_HOST || '').trim();
      const smtpPort = Number(process.env.SMTP_PORT || 587);
      const smtpUser = String(process.env.SMTP_USER || '').trim();
      const smtpPass = String(process.env.SMTP_PASS || '').trim();
      const fromEmail = String(process.env.OTP_FROM_EMAIL || smtpUser).trim();

      if (!smtpHost || !smtpUser || !smtpPass || !fromEmail || !Number.isFinite(smtpPort)) {
        res.status(503).json({
          error:
            'Email OTP service is not configured yet. Please configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and OTP_FROM_EMAIL environment variables.',
        });
        return;
      }

      const code = crypto.randomInt(100000, 1000000).toString();
      const otpId = `otp-${crypto.randomUUID()}`;
      const salt = crypto.randomBytes(16).toString('hex');
      const otpHash = crypto
        .createHash('sha256')
        .update(`${salt}:${targetEmail}:${purpose}:${code}`)
        .digest('hex');
      const expiresAtMs = nowMs + OTP_EXPIRY_MS;
      const resendAvailableAtMs = nowMs + OTP_RESEND_COOLDOWN_MS;

      const purposeLabelMap: Record<string, string> = {
        customer_register: 'New Customer Account Registration',
        seller_register: 'New Seller Account Registration',
        customer_forgot_password: 'Customer Password Reset',
        seller_forgot_password: 'Seller Password Reset',
        admin_login: 'Admin Panel Sign-In Verification',
      };
      const purposeLabel = purposeLabelMap[purpose] || 'Verification';

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: `"Glamour Galleria" <${fromEmail}>`,
        to: targetEmail,
        subject: `Glamour Galleria - Your 6-Digit OTP (${purposeLabel})`,
        text: `Your Glamour Galleria 6-digit verification code for ${purposeLabel} is: ${code}\n\nThis code is valid for 5 minutes. Do not share this code with anyone.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #EFE2F5; border-radius: 16px; background: #FDF9FC; color: #1F122B;">
            <h2 style="margin: 0 0 8px; color: #6D28D9; font-size: 20px;">Glamour Galleria</h2>
            <p style="margin: 0 0 16px; font-size: 13px; color: #5B4B6B;">${escapeHtml(purposeLabel)}</p>
            <p style="margin: 0 0 12px; font-size: 14px;">Use the 6-digit OTP below to complete your verification:</p>
            <div style="margin: 16px 0; padding: 14px 20px; background: #FFFFFF; border: 1px solid #D8B4FE; border-radius: 12px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #7E22CE; font-family: monospace;">
              ${escapeHtml(code)}
            </div>
            <p style="margin: 0; font-size: 12px; color: #6B5B7B;">This code expires in <strong>5 minutes</strong>. If you did not request this code, you can safely ignore this email.</p>
          </div>
        `,
      });

      otpCooldownMap.set(cooldownKey, resendAvailableAtMs);

      const challengeToken = signOtpChallenge({
        otpId,
        email: targetEmail,
        purpose,
        salt,
        otpHash,
        expiresAtMs,
      });

      res.json({
        otpId,
        email: targetEmail,
        purpose,
        otpHash,
        expiresAt: new Date(expiresAtMs).toISOString(),
        resendAvailableAt: new Date(resendAvailableAtMs).toISOString(),
        challengeToken,
      });
    } catch (err) {
      console.error('OTP send error:', err);
      res.status(500).json({
        error: 'Could not send Email OTP. Please verify your SMTP configuration and try again.',
      });
    }
  });

  app.post('/api/otp/verify', (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      otpId?: unknown;
      email?: unknown;
      purpose?: unknown;
      code?: unknown;
      challengeToken?: unknown;
    };
    const otpId = String(body.otpId || '').trim();
    const purpose = String(body.purpose || '').trim();
    const code = String(body.code || '').trim();
    const challengeToken = String(body.challengeToken || '').trim();

    if (!ALLOWED_OTP_PURPOSES.has(purpose)) {
      res.status(400).json({ verified: false, error: 'Invalid OTP purpose.' });
      return;
    }

    const targetEmail =
      purpose === 'admin_login'
        ? ADMIN_OTP_EMAIL
        : String(body.email || '').trim().toLowerCase();

    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({
        verified: false,
        error: 'Please enter the exact 6-digit OTP code.',
      });
      return;
    }

    const challenge = verifyOtpChallenge(challengeToken);
    if (
      !challenge ||
      challenge.otpId !== otpId ||
      challenge.email !== targetEmail ||
      challenge.purpose !== purpose
    ) {
      res.status(400).json({
        verified: false,
        error: 'OTP session is invalid. Please request a new OTP.',
      });
      return;
    }

    if (Date.now() > challenge.expiresAtMs) {
      res.status(400).json({
        verified: false,
        expired: true,
        error: 'This OTP has expired (5-minute limit). Please resend a new OTP.',
      });
      return;
    }

    const candidateHash = crypto
      .createHash('sha256')
      .update(`${challenge.salt}:${targetEmail}:${purpose}:${code}`)
      .digest('hex');

    const candidateBuf = Buffer.from(candidateHash, 'utf8');
    const expectedBuf = Buffer.from(challenge.otpHash, 'utf8');
    if (
      candidateBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      res.status(400).json({
        verified: false,
        error: 'Incorrect 6-digit OTP code. Please check your email and try again.',
      });
      return;
    }

    res.json({ verified: true, otpId, email: targetEmail, purpose });
  });

  const FIREBASE_PROJECT_ID = 'rahul-bill';
  const AUTHORIZED_ADMIN_EMAILS = new Set([
    'rahulhaldar.in1@gmail.com',
    'rahulhaldar.in@gmail.com',
  ]);
  let cachedGoogleCerts: { certs: Record<string, string>; expiresAtMs: number } | null = null;

  const getGooglePublicCerts = async (): Promise<Record<string, string>> => {
    if (cachedGoogleCerts && cachedGoogleCerts.expiresAtMs > Date.now()) {
      return cachedGoogleCerts.certs;
    }
    const response = await fetch(
      'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
    );
    if (!response.ok) {
      throw new Error('Failed to fetch Firebase public verification certificates.');
    }
    const cacheControl = response.headers.get('cache-control') || '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
    const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
    const certs = (await response.json()) as Record<string, string>;
    cachedGoogleCerts = {
      certs,
      expiresAtMs: Date.now() + Math.max(60, maxAgeSec) * 1000,
    };
    return certs;
  };

  const verifyAuthorizedAdminToken = async (
    authHeader?: string
  ): Promise<{ ok: true; email: string } | { ok: false; status: number; error: string }> => {
    const raw = String(authHeader || '').trim();
    if (!raw.startsWith('Bearer ')) {
      return { ok: false, status: 401, error: 'Missing Admin Google authentication token.' };
    }
    const token = raw.slice(7).trim();
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { ok: false, status: 401, error: 'Invalid authentication token format.' };
    }
    try {
      const [headerB64, payloadB64, sigB64] = parts;
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
        alg?: string;
        kid?: string;
      };
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
        aud?: string;
        iss?: string;
        sub?: string;
        exp?: number;
        iat?: number;
        email?: string;
        email_verified?: boolean;
      };
      if (header.alg !== 'RS256' || !header.kid) {
        return { ok: false, status: 401, error: 'Unsupported token algorithm.' };
      }
      const certs = await getGooglePublicCerts();
      const certPem = certs[header.kid];
      if (!certPem) {
        return { ok: false, status: 401, error: 'Unrecognized signing certificate.' };
      }
      const signatureValid = crypto.verify(
        'RSA-SHA256',
        Buffer.from(`${headerB64}.${payloadB64}`, 'utf8'),
        certPem,
        Buffer.from(sigB64, 'base64url')
      );
      if (!signatureValid) {
        return { ok: false, status: 401, error: 'Invalid authentication token signature.' };
      }
      const nowSec = Math.floor(Date.now() / 1000);
      if (
        payload.aud !== FIREBASE_PROJECT_ID ||
        payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` ||
        !payload.sub ||
        typeof payload.exp !== 'number' ||
        payload.exp <= nowSec
      ) {
        return { ok: false, status: 401, error: 'Authentication session expired or invalid.' };
      }
      const email = String(payload.email || '').trim().toLowerCase();
      if (!email || payload.email_verified !== true || !AUTHORIZED_ADMIN_EMAILS.has(email)) {
        return {
          ok: false,
          status: 403,
          error: 'Access Denied: Unauthorized Admin Account',
        };
      }
      return { ok: true, email };
    } catch {
      return { ok: false, status: 401, error: 'Failed to verify Admin session token.' };
    }
  };

  app.post('/api/offers/send', async (req: Request, res: Response) => {
    try {
      const authCheck = await verifyAuthorizedAdminToken(req.headers.authorization);
      if (!authCheck.ok) {
        res.status(authCheck.status).json({ error: authCheck.error });
        return;
      }

      const body = (req.body || {}) as {
        subject?: unknown;
        message?: unknown;
        category?: unknown;
        recipients?: Array<{ email?: unknown; name?: unknown }>;
      };

      const subject = String(body.subject || '').trim();
      const message = String(body.message || '').trim();
      const category = String(body.category || '').trim();
      const rawRecipients = Array.isArray(body.recipients) ? body.recipients : [];

      if (!subject || subject.length > 200) {
        res.status(400).json({ error: 'Please enter a valid email subject (1-200 characters).' });
        return;
      }
      if (!message || message.length > 6000) {
        res.status(400).json({ error: 'Please enter a valid offer or notice message.' });
        return;
      }

      const uniqueRecipients = new Map<string, { email: string; name: string }>();
      for (const item of rawRecipients) {
        const email = String(item?.email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
        if (!uniqueRecipients.has(email)) {
          uniqueRecipients.set(email, {
            email,
            name: String(item?.name || 'Valued Customer').trim() || 'Valued Customer',
          });
        }
      }

      const recipientList = Array.from(uniqueRecipients.values()).slice(0, 50);
      if (recipientList.length === 0) {
        res.status(400).json({ error: 'Please select at least one valid customer email address.' });
        return;
      }

      const smtpHost = String(process.env.SMTP_HOST || '').trim();
      const smtpPort = Number(process.env.SMTP_PORT || 587);
      const smtpUser = String(process.env.SMTP_USER || '').trim();
      const smtpPass = String(process.env.SMTP_PASS || '').trim();
      const fromEmail = String(process.env.OTP_FROM_EMAIL || smtpUser).trim();

      if (!smtpHost || !smtpUser || !smtpPass || !fromEmail || !Number.isFinite(smtpPort)) {
        res.status(503).json({
          error:
            'SMTP email service is not configured yet. Please configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and OTP_FROM_EMAIL environment variables.',
        });
        return;
      }

      const senderDisplay = `"Glamour Galleria" <${fromEmail}>`;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const logs: Array<{
        email: string;
        name: string;
        status: 'sent' | 'failed';
        error?: string;
      }> = [];
      let sentCount = 0;
      let failedCount = 0;

      const formattedParagraphs = message
        .split(/\r?\n/)
        .map((line) => (line.trim() ? `<p style="margin:0 0 12px;line-height:1.6;">${escapeHtml(line)}</p>` : '<div style="height:8px;"></div>'))
        .join('');

      for (const recipient of recipientList) {
        try {
          const personalizedHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #EFE2F5; border-radius: 16px; background: #FDF9FC; color: #1F122B;">
              <div style="border-bottom: 1px solid #EDE1F4; padding-bottom: 14px; margin-bottom: 18px;">
                <h2 style="margin: 0; color: #6D28D9; font-size: 22px;">Glamour Galleria</h2>
                ${category ? `<p style="margin: 4px 0 0; font-size: 12px; color: #7E22CE; font-weight: bold;">${escapeHtml(category)}</p>` : ''}
              </div>
              <p style="margin: 0 0 14px; font-size: 14px;">Hello <strong>${escapeHtml(recipient.name)}</strong>,</p>
              <div style="font-size: 14px; color: #2E1F3D; background: #FFFFFF; border: 1px solid #EFE2F5; border-radius: 12px; padding: 18px;">
                ${formattedParagraphs}
              </div>
              <p style="margin: 18px 0 0; font-size: 12px; color: #6B5B7B;">Warm regards,<br/><strong>Glamour Galleria</strong></p>
            </div>
          `;
          const personalizedText = `Hello ${recipient.name},\n\n${message}\n\nWarm regards,\nGlamour Galleria`;

          await transporter.sendMail({
            from: senderDisplay,
            to: recipient.email,
            subject,
            text: personalizedText,
            html: personalizedHtml,
          });
          sentCount += 1;
          logs.push({ email: recipient.email, name: recipient.name, status: 'sent' });
        } catch (sendErr) {
          failedCount += 1;
          logs.push({
            email: recipient.email,
            name: recipient.name,
            status: 'failed',
            error: sendErr instanceof Error ? sendErr.message : 'Delivery failed',
          });
        }
      }

      res.json({
        totalRequested: recipientList.length,
        sentCount,
        failedCount,
        senderDisplay,
        logs,
      });
    } catch (err) {
      console.error('Smart offers mail error:', err);
      res.status(500).json({
        error: 'Could not send Smart Offers Mail. Please verify your SMTP configuration and try again.',
      });
    }
  });

  // OPEN ADMIN PANEL WORKSPACE ROUTES (No Login Gate)
  app.get('/api/workspace', (_req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
    res.json(workspace);
  });

  app.put('/api/workspace/settings', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
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
  app.post('/api/workspace/clients', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
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

  app.put('/api/workspace/clients/:id', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
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

  app.delete('/api/workspace/clients/:id', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
    workspace.clients = workspace.clients.filter((c) => c.id !== req.params.id);
    await persistDatabase();
    res.json({ ok: true });
  });

  // PRODUCTS CRUD
  app.post('/api/workspace/products', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
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

  app.put('/api/workspace/products/:id', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
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

  app.delete('/api/workspace/products/:id', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
    workspace.products = workspace.products.filter((p) => p.id !== req.params.id);
    await persistDatabase();
    res.json({ ok: true });
  });

  // INVOICES CRUD (with stock & payment sync)
  app.post('/api/workspace/invoices', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
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

  app.put('/api/workspace/invoices/:id', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
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

  app.delete('/api/workspace/invoices/:id', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
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
  app.post('/api/workspace/payments', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
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

  app.delete('/api/workspace/payments/:id', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
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
  app.put('/api/workspace/deliveries/:invoiceId', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
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
  app.post('/api/workspace/expenses', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
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

  app.delete('/api/workspace/expenses/:id', async (req: Request, res: Response) => {
    const workspace = getActiveWorkspace();
    workspace.expenses = workspace.expenses.filter((e) => e.id !== req.params.id);
    await persistDatabase();
    res.json({ ok: true });
  });

  // BACKUP RESTORE
  app.post('/api/workspace/restore', async (req: Request, res: Response) => {
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
    dbState.workspaces[getActiveWorkspaceKey()] = restored;
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
    app.use(express.static(DIST_DIR, { index: false }));
    app.get('*', (_req: Request, res: Response) => {
      const runtimeAppMode = (
        process.env.APP_MODE ||
        process.env.VITE_APP_MODE ||
        ''
      )
        .trim()
        .toLowerCase();
      if (runtimeAppMode === 'admin' || runtimeAppMode === 'customer') {
        const html = fs.readFileSync(DIST_INDEX, 'utf8');
        const injected = html.replace(
          '</head>',
          `<script>window.__APP_MODE__=${JSON.stringify(runtimeAppMode)};</script></head>`
        );
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(injected);
        return;
      }
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
