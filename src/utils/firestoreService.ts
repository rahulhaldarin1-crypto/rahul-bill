import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AdminPaymentSettings,
  BusinessSettings,
  CategoryInterestEntry,
  Client,
  CloudinaryMediaRecord,
  CustomerCartItem,
  CustomerOrder,
  CustomerOrderItem,
  CustomerOrderPaymentMethod,
  DeliveryStatus,
  EmailOtpPurpose,
  EmailOtpRecord,
  ExpenseRecord,
  HighlightRequest,
  HighlightRequestStatus,
  Invoice,
  InvoiceLineItem,
  MediaResourceType,
  PaymentMethod,
  PaymentRecord,
  Product,
  ProductReview,
  PublicCustomerLookupResult,
  SellerAccountStatus,
  SellerApplication,
  SellerApprovalStatus,
  SellerFollowRecord,
  SellerPublicPaymentProfile,
  SentMailRecord,
  SupportChatMessage,
  SupportChatThread,
  SupportSenderRole,
  WorkspaceData,
} from '../types/business';
import {
  encryptRunningPassword,
  hashCustomerPassword,
  verifyCustomerPassword,
} from './adminAuth';
import {
  addDaysIsoDate,
  ADMIN_OTP_EMAIL,
  COD_DELIVERY_CHARGE_PER_ITEM,
  computeCategoryScore,
  DEFAULT_ADMIN_PAYMENT_SETTINGS,
  DEFAULT_ADMIN_UPI_ID,
  DEFAULT_HIGHLIGHT_CONFIG,
  DEFAULT_SETTINGS,
  formatPhoneWithPlus91,
  generateNextInvoiceNumber,
  getCustomerReferralCode,
  HIGHLIGHT_UPI_ID,
  isProductHighlightActive,
  mergeAdminPaymentSettings,
  mergeBusinessSettings,
  normalizeAsianPhone,
  normalizeIndianPhone,
  normalizePhoneDigits,
  normalizeSupportName,
  OTP_MAX_ATTEMPTS,
  phoneNumbersMatch,
  todayIsoDate,
  validateAdultDateOfBirth,
  validateEnglishName,
  validateGmailAddress,
} from './calculations';
import {
  detectClientBangladeshFallback,
  fetchGeoRegion,
} from './region';

const SETTINGS_COL = 'settings';
const SETTINGS_DOC = 'business';
const PAYMENT_SETTINGS_COL = 'payment_settings';
const PAYMENT_SETTINGS_DOC = 'admin';
const CLIENTS_COL = 'clients';
const PRODUCTS_COL = 'products';
const INVOICES_COL = 'invoices';
const PAYMENTS_COL = 'payments';
const EXPENSES_COL = 'expenses';
const ORDERS_COL = 'orders';
const SELLER_APPLICATIONS_COL = 'seller_applications';
const SELLER_FOLLOWS_COL = 'seller_follows';
const PRODUCT_REVIEWS_COL = 'product_reviews';
const HIGHLIGHT_REQUESTS_COL = 'highlight_requests';
const SUPPORT_CHATS_COL = 'support_chats';
const EMAIL_OTPS_COL = 'email_otps';
const MEDIA_RECORDS_COL = 'media_records';
const SENT_MAIL_BOX_DOC = 'sent_mail_box';
const SENT_MAIL_LOCAL_KEY = 'gg_admin_sent_mail_box_v1';

function readLocalSentMails(): SentMailRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SENT_MAIL_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SentMailRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLocalSentMails(records: SentMailRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SENT_MAIL_LOCAL_KEY, JSON.stringify(records.slice(0, 150)));
  } catch {
    // ignore storage quota errors
  }
}

function mergeSentMailRecords(
  primary: SentMailRecord[],
  secondary: SentMailRecord[]
): SentMailRecord[] {
  const map = new Map<string, SentMailRecord>();
  for (const item of [...primary, ...secondary]) {
    if (!item || !item.id || !item.recipientEmail) continue;
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')))
    .slice(0, 150);
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function applyCategoryInterestDelta(
  existingInterests: Record<string, CategoryInterestEntry> | undefined,
  categoryRaw: string,
  activityType: 'search' | 'view' | 'order',
  delta = 1,
  nowIso = new Date().toISOString()
): {
  categoryInterests: Record<string, CategoryInterestEntry>;
  totalCategoryOrders: number;
} {
  const category = String(categoryRaw || '').trim();
  const baseMap: Record<string, CategoryInterestEntry> = {
    ...(existingInterests || {}),
  };
  if (!category) {
    const total = Object.values(baseMap).reduce(
      (sum, entry) => sum + Math.max(0, safeNum(entry?.orders, 0)),
      0
    );
    return { categoryInterests: baseMap, totalCategoryOrders: total };
  }

  const prev = baseMap[category] || {
    searches: 0,
    views: 0,
    orders: 0,
    score: 0,
    lastActivityAt: nowIso,
  };
  const step = Math.max(1, Math.floor(safeNum(delta, 1)));
  const searches =
    Math.max(0, safeNum(prev.searches, 0)) + (activityType === 'search' ? step : 0);
  const views =
    Math.max(0, safeNum(prev.views, 0)) + (activityType === 'view' ? step : 0);
  const orders =
    Math.max(0, safeNum(prev.orders, 0)) + (activityType === 'order' ? step : 0);

  baseMap[category] = {
    searches,
    views,
    orders,
    score: computeCategoryScore(searches, views, orders),
    lastActivityAt: nowIso,
  };

  const totalCategoryOrders = Object.values(baseMap).reduce(
    (sum, entry) => sum + Math.max(0, safeNum(entry?.orders, 0)),
    0
  );

  return {
    categoryInterests: baseMap,
    totalCategoryOrders,
  };
}

function isPermissionDeniedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return (
    msg.includes('permission-denied') ||
    msg.includes('Missing or insufficient permissions')
  );
}

function sortDescByCreated<T extends { createdAt?: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
}

function sortDescByUpdated<T extends { updatedAt?: string; createdAt?: string }>(
  arr: T[]
): T[] {
  return [...arr].sort((a, b) =>
    String(b.updatedAt || b.createdAt || '').localeCompare(
      String(a.updatedAt || a.createdAt || '')
    )
  );
}

function sanitizePublicClient(c: Client): Client {
  const {
    passwordHash: _ph,
    passwordSalt: _ps,
    runningPasswordEnc: _rp,
    ...safe
  } = c;
  return safe as Client;
}

function sanitizePublicSeller(app: SellerApplication): SellerApplication {
  const {
    passwordHash: _ph,
    passwordSalt: _ps,
    runningPasswordEnc: _rp,
    ...safe
  } = app;
  return safe as SellerApplication;
}

function extractPublicSellerPaymentProfile(
  app: SellerApplication
): SellerPublicPaymentProfile {
  return {
    sellerId: app.id,
    sellerName: app.name || 'Seller',
    sellerPhotoDataUrl: String(app.sellerPhotoDataUrl || '').trim(),
    sellerCoverPhotoDataUrl: String(app.sellerCoverPhotoDataUrl || '').trim(),
    followersCount: Math.max(0, Number(app.followersCount) || 0),
    upiId: String(app.sellerUpiId || '').trim(),
    bankAccountName: String(app.sellerBankAccountName || '').trim(),
    bankName: String(app.sellerBankName || '').trim(),
    bankAccountNo: String(app.sellerBankAccountNo || '').trim(),
    bankIfscBranch: String(app.sellerBankIfscBranch || '').trim(),
    qrDataUrl: String(app.sellerQrDataUrl || '').trim(),
  };
}

function sanitizePublicInvoice(inv: Invoice): Invoice {
  return {
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
}

function sanitizePublicSettings(settings: BusinessSettings): BusinessSettings {
  const { lastAdminOtpVerifiedAt: _admOtp, ...rest } = settings;
  return rest as BusinessSettings;
}

async function assertVerifiedEmailOtp(
  otpId: string | undefined,
  expectedEmail: string,
  expectedPurpose: EmailOtpPurpose
): Promise<void> {
  const cleanOtpId = String(otpId || '').trim();
  if (!cleanOtpId) {
    throw new Error('Please verify the 6-digit Email OTP sent to your Gmail address.');
  }
  let snap;
  try {
    snap = await getDoc(doc(db, EMAIL_OTPS_COL, cleanOtpId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${EMAIL_OTPS_COL}/${cleanOtpId}`);
  }
  if (!snap || !snap.exists()) {
    throw new Error('Email OTP verification record not found. Please request a new OTP.');
  }
  const record = snap.data() as EmailOtpRecord;
  if (!record.verified) {
    throw new Error('Email OTP is not verified yet. Please click Verify OTP first.');
  }
  if (
    record.purpose !== expectedPurpose ||
    String(record.email || '').trim().toLowerCase() !== expectedEmail.trim().toLowerCase()
  ) {
    throw new Error('Verified Email OTP does not match this Gmail address.');
  }
  const expMs = Date.parse(record.expiresAt);
  if (!Number.isNaN(expMs) && Date.now() > expMs + 15 * 60 * 1000) {
    throw new Error('Email OTP verification session has expired. Please request a new OTP.');
  }
}

function normalizeInvoice(raw: Partial<Invoice>, existing?: Invoice): Invoice {
  const now = new Date().toISOString();
  const items: InvoiceLineItem[] = Array.isArray(raw.items)
    ? raw.items.map((item, idx) => {
        const qty = Math.max(1, safeNum(item.quantity, 1));
        const purchasePrice = Math.max(0, safeNum(item.purchasePrice, 0));
        const sellingPrice = Math.max(0, safeNum(item.sellingPrice, 0));
        const lineTotal = Number((qty * sellingPrice).toFixed(2));
        const lineCost = Number((qty * purchasePrice).toFixed(2));
        const normalizedItem: InvoiceLineItem = {
          id: String(item.id || `item-${Date.now()}-${idx}`),
          productName: String(item.productName || '').trim(),
          size: item.size ? String(item.size).trim() : '',
          color: item.color ? String(item.color).trim() : '',
          quantity: qty,
          purchasePrice,
          sellingPrice,
          lineTotal,
          lineCost,
          lineProfit: Number((lineTotal - lineCost).toFixed(2)),
        };
        if (item.productId) {
          normalizedItem.productId = String(item.productId);
        }
        if (item.originalPrice !== undefined && item.originalPrice !== null) {
          normalizedItem.originalPrice = Math.max(0, safeNum(item.originalPrice, 0));
        }
        return normalizedItem;
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

  return stripUndefinedDeep({
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
  });
}

async function computeStockDeltaProducts(
  itemsDelta: Array<{ productId?: string; delta: number }>
): Promise<Product[]> {
  const path = PRODUCTS_COL;
  try {
    const snap = await getDocs(collection(db, path));
    const allProducts = snap.docs.map((d) => d.data() as Product);

    const deltaMap = new Map<string, number>();
    for (const entry of itemsDelta) {
      if (!entry.productId) continue;
      deltaMap.set(entry.productId, (deltaMap.get(entry.productId) || 0) + entry.delta);
    }

    const updatedProducts = allProducts.map((p) => {
      const change = deltaMap.get(p.id);
      if (!change) return p;
      return {
        ...p,
        stockQty: Math.max(0, safeNum(p.stockQty, 0) + change),
        updatedAt: new Date().toISOString(),
      };
    });

    return sortDescByCreated(updatedProducts);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export const firestoreService = {
  async saveMediaRecord(record: CloudinaryMediaRecord): Promise<CloudinaryMediaRecord> {
    const cleanRecord: CloudinaryMediaRecord = stripUndefinedDeep({
      ...record,
      id: record.id || `med-${crypto.randomUUID()}`,
      createdAt: record.createdAt || new Date().toISOString(),
    });
    try {
      await setDoc(doc(db, MEDIA_RECORDS_COL, cleanRecord.id), cleanRecord);
      return cleanRecord;
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `${MEDIA_RECORDS_COL}/${cleanRecord.id}`
      );
    }
  },

  async fetchWorkspace(): Promise<WorkspaceData> {
    let settings: BusinessSettings = mergeBusinessSettings();
    let paymentSettings: AdminPaymentSettings = { ...DEFAULT_ADMIN_PAYMENT_SETTINGS };
    try {
      const settingsSnap = await getDoc(doc(db, SETTINGS_COL, SETTINGS_DOC));
      if (settingsSnap.exists()) {
        settings = mergeBusinessSettings(settingsSnap.data() as Partial<BusinessSettings>);
      } else {
        await setDoc(doc(db, SETTINGS_COL, SETTINGS_DOC), stripUndefinedDeep(DEFAULT_SETTINGS));
      }
      try {
        const paymentSnap = await getDoc(
          doc(db, PAYMENT_SETTINGS_COL, PAYMENT_SETTINGS_DOC)
        );
        if (paymentSnap.exists()) {
          paymentSettings = mergeAdminPaymentSettings(
            paymentSnap.data() as Partial<AdminPaymentSettings>,
            settings
          );
        } else {
          paymentSettings = mergeAdminPaymentSettings(undefined, settings);
          await setDoc(
            doc(db, PAYMENT_SETTINGS_COL, PAYMENT_SETTINGS_DOC),
            stripUndefinedDeep(paymentSettings)
          );
        }
      } catch (payErr) {
        if (!isPermissionDeniedError(payErr)) {
          throw payErr;
        }
        paymentSettings = mergeAdminPaymentSettings(undefined, settings);
      }
      settings = mergeBusinessSettings({
        ...settings,
        upiId: paymentSettings.upiId,
        upiNumber: paymentSettings.upiNumber,
        bankAccountName: paymentSettings.bankAccountName,
        bankName: paymentSettings.bankName,
        bankAccountNo: paymentSettings.bankAccountNo,
        bankIfscBranch: paymentSettings.bankIfscBranch,
        paymentQrDataUrl: paymentSettings.qrDataUrl,
        highlightConfig: {
          ...(settings.highlightConfig || DEFAULT_HIGHLIGHT_CONFIG),
          upiId: paymentSettings.upiId,
        },
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${SETTINGS_COL}/${SETTINGS_DOC}`);
    }

    const fetchCol = async <T extends { createdAt?: string }>(colName: string): Promise<T[]> => {
      try {
        const snap = await getDocs(collection(db, colName));
        return sortDescByCreated(snap.docs.map((d) => d.data() as T));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, colName);
      }
    };

    const fetchColSafe = async <T extends { createdAt?: string }>(
      colName: string
    ): Promise<T[]> => {
      try {
        const snap = await getDocs(collection(db, colName));
        return sortDescByCreated(snap.docs.map((d) => d.data() as T));
      } catch (error) {
        if (isPermissionDeniedError(error)) return [];
        handleFirestoreError(error, OperationType.LIST, colName);
      }
    };

    const [
      clients,
      products,
      invoices,
      payments,
      expenses,
      orders,
      sellerApplications,
      supportChatsRaw,
      highlightRequests,
      sellerFollows,
      productReviews,
    ] = await Promise.all([
      fetchCol<Client>(CLIENTS_COL),
      fetchCol<Product>(PRODUCTS_COL),
      fetchCol<Invoice>(INVOICES_COL),
      fetchCol<PaymentRecord>(PAYMENTS_COL),
      fetchCol<ExpenseRecord>(EXPENSES_COL),
      fetchCol<CustomerOrder>(ORDERS_COL),
      fetchCol<SellerApplication>(SELLER_APPLICATIONS_COL),
      fetchCol<SupportChatThread>(SUPPORT_CHATS_COL),
      fetchCol<HighlightRequest>(HIGHLIGHT_REQUESTS_COL),
      fetchColSafe<SellerFollowRecord>(SELLER_FOLLOWS_COL),
      fetchColSafe<ProductReview>(PRODUCT_REVIEWS_COL),
    ]);

    return {
      settings,
      paymentSettings,
      clients,
      products,
      invoices,
      payments,
      expenses,
      orders,
      sellerApplications,
      supportChats: sortDescByUpdated(supportChatsRaw),
      highlightRequests,
      sellerFollows,
      productReviews,
    };
  },

  subscribeWorkspace(
    onUpdate: (updater: (prev: WorkspaceData) => WorkspaceData) => void,
    onError: (err: Error) => void
  ): () => void {
    const reportError = (op: OperationType, path: string, err: unknown) => {
      try {
        handleFirestoreError(err, op, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    };

    const unsubSettings = onSnapshot(
      doc(db, SETTINGS_COL, SETTINGS_DOC),
      (snap) => {
        if (snap.exists()) {
          const nextSettings = mergeBusinessSettings(
            snap.data() as Partial<BusinessSettings>
          );
          onUpdate((prev) => ({
            ...prev,
            settings: nextSettings,
            paymentSettings: mergeAdminPaymentSettings(
              prev.paymentSettings,
              nextSettings
            ),
          }));
        }
      },
      (err) => reportError(OperationType.GET, `${SETTINGS_COL}/${SETTINGS_DOC}`, err)
    );

    const unsubPaymentSettings = onSnapshot(
      doc(db, PAYMENT_SETTINGS_COL, PAYMENT_SETTINGS_DOC),
      (snap) => {
        if (snap.exists()) {
          const rawPay = snap.data() as Partial<AdminPaymentSettings>;
          onUpdate((prev) => {
            const nextPay = mergeAdminPaymentSettings(rawPay, prev.settings);
            return {
              ...prev,
              paymentSettings: nextPay,
              settings: mergeBusinessSettings({
                ...prev.settings,
                upiId: nextPay.upiId,
                upiNumber: nextPay.upiNumber,
                bankAccountName: nextPay.bankAccountName,
                bankName: nextPay.bankName,
                bankAccountNo: nextPay.bankAccountNo,
                bankIfscBranch: nextPay.bankIfscBranch,
                paymentQrDataUrl: nextPay.qrDataUrl,
                highlightConfig: {
                  ...(prev.settings.highlightConfig || DEFAULT_HIGHLIGHT_CONFIG),
                  upiId: nextPay.upiId,
                },
              }),
            };
          });
        }
      },
      (err) => {
        if (!isPermissionDeniedError(err)) {
          reportError(
            OperationType.GET,
            `${PAYMENT_SETTINGS_COL}/${PAYMENT_SETTINGS_DOC}`,
            err
          );
        }
      }
    );

    const unsubClients = onSnapshot(
      collection(db, CLIENTS_COL),
      (snap) => {
        const clients = sortDescByCreated(snap.docs.map((d) => d.data() as Client));
        onUpdate((prev) => ({ ...prev, clients }));
      },
      (err) => reportError(OperationType.LIST, CLIENTS_COL, err)
    );

    const unsubProducts = onSnapshot(
      collection(db, PRODUCTS_COL),
      (snap) => {
        const products = sortDescByCreated(snap.docs.map((d) => d.data() as Product));
        onUpdate((prev) => ({ ...prev, products }));
      },
      (err) => reportError(OperationType.LIST, PRODUCTS_COL, err)
    );

    const unsubInvoices = onSnapshot(
      collection(db, INVOICES_COL),
      (snap) => {
        const invoices = sortDescByCreated(snap.docs.map((d) => d.data() as Invoice));
        onUpdate((prev) => ({ ...prev, invoices }));
      },
      (err) => reportError(OperationType.LIST, INVOICES_COL, err)
    );

    const unsubPayments = onSnapshot(
      collection(db, PAYMENTS_COL),
      (snap) => {
        const payments = sortDescByCreated(snap.docs.map((d) => d.data() as PaymentRecord));
        onUpdate((prev) => ({ ...prev, payments }));
      },
      (err) => reportError(OperationType.LIST, PAYMENTS_COL, err)
    );

    const unsubExpenses = onSnapshot(
      collection(db, EXPENSES_COL),
      (snap) => {
        const expenses = sortDescByCreated(snap.docs.map((d) => d.data() as ExpenseRecord));
        onUpdate((prev) => ({ ...prev, expenses }));
      },
      (err) => reportError(OperationType.LIST, EXPENSES_COL, err)
    );

    const unsubOrders = onSnapshot(
      collection(db, ORDERS_COL),
      (snap) => {
        const orders = sortDescByCreated(snap.docs.map((d) => d.data() as CustomerOrder));
        onUpdate((prev) => ({ ...prev, orders }));
      },
      (err) => reportError(OperationType.LIST, ORDERS_COL, err)
    );

    const unsubSellerApps = onSnapshot(
      collection(db, SELLER_APPLICATIONS_COL),
      (snap) => {
        const sellerApplications = sortDescByCreated(
          snap.docs.map((d) => d.data() as SellerApplication)
        );
        onUpdate((prev) => ({ ...prev, sellerApplications }));
      },
      (err) => reportError(OperationType.LIST, SELLER_APPLICATIONS_COL, err)
    );

    const unsubSupportChats = onSnapshot(
      collection(db, SUPPORT_CHATS_COL),
      (snap) => {
        const supportChats = sortDescByUpdated(
          snap.docs.map((d) => d.data() as SupportChatThread)
        );
        onUpdate((prev) => ({ ...prev, supportChats }));
      },
      (err) => reportError(OperationType.LIST, SUPPORT_CHATS_COL, err)
    );

    const unsubHighlightRequests = onSnapshot(
      collection(db, HIGHLIGHT_REQUESTS_COL),
      (snap) => {
        const highlightRequests = sortDescByCreated(
          snap.docs.map((d) => d.data() as HighlightRequest)
        );
        onUpdate((prev) => ({ ...prev, highlightRequests }));
      },
      (err) => reportError(OperationType.LIST, HIGHLIGHT_REQUESTS_COL, err)
    );

    const unsubSellerFollows = onSnapshot(
      collection(db, SELLER_FOLLOWS_COL),
      (snap) => {
        const sellerFollows = sortDescByCreated(
          snap.docs.map((d) => d.data() as SellerFollowRecord)
        );
        onUpdate((prev) => ({ ...prev, sellerFollows }));
      },
      (err) => {
        if (!isPermissionDeniedError(err)) {
          reportError(OperationType.LIST, SELLER_FOLLOWS_COL, err);
        }
      }
    );

    const unsubProductReviews = onSnapshot(
      collection(db, PRODUCT_REVIEWS_COL),
      (snap) => {
        const productReviews = sortDescByCreated(
          snap.docs.map((d) => d.data() as ProductReview)
        );
        onUpdate((prev) => ({ ...prev, productReviews }));
      },
      (err) => {
        if (!isPermissionDeniedError(err)) {
          reportError(OperationType.LIST, PRODUCT_REVIEWS_COL, err);
        }
      }
    );

    return () => {
      unsubSettings();
      unsubPaymentSettings();
      unsubClients();
      unsubProducts();
      unsubInvoices();
      unsubPayments();
      unsubExpenses();
      unsubOrders();
      unsubSellerApps();
      unsubSupportChats();
      unsubHighlightRequests();
      unsubSellerFollows();
      unsubProductReviews();
    };
  },

  async updateSettings(next: BusinessSettings): Promise<BusinessSettings> {
    const clean = stripUndefinedDeep(mergeBusinessSettings(next));
    const settingsRef = doc(db, SETTINGS_COL, SETTINGS_DOC);
    const paymentRef = doc(db, PAYMENT_SETTINGS_COL, PAYMENT_SETTINGS_DOC);
    try {
      let syncedUpi =
        String(clean.upiId || DEFAULT_ADMIN_UPI_ID).trim() || DEFAULT_ADMIN_UPI_ID;
      const existingSnap = await getDoc(settingsRef);
      if (existingSnap.exists()) {
        const existing = mergeBusinessSettings(
          existingSnap.data() as Partial<BusinessSettings>
        );
        const hcUpi = String(clean.highlightConfig?.upiId || '').trim();
        const prevHcUpi = String(existing.highlightConfig?.upiId || '').trim();
        if (hcUpi && hcUpi !== prevHcUpi && clean.upiId === existing.upiId) {
          syncedUpi = hcUpi;
        }
      }
      const syncedSettings = stripUndefinedDeep(
        mergeBusinessSettings({
          ...clean,
          upiId: syncedUpi,
          highlightConfig: {
            ...(clean.highlightConfig || DEFAULT_HIGHLIGHT_CONFIG),
            upiId: syncedUpi,
          },
        })
      );
      const syncedPayment = stripUndefinedDeep({
        ...mergeAdminPaymentSettings(undefined, syncedSettings),
        upiId: syncedUpi,
        updatedAt: new Date().toISOString(),
      });
      try {
        const batch = writeBatch(db);
        batch.set(settingsRef, syncedSettings);
        batch.set(paymentRef, syncedPayment);
        await batch.commit();
      } catch (batchErr) {
        if (!isPermissionDeniedError(batchErr)) {
          throw batchErr;
        }
        await setDoc(settingsRef, syncedSettings);
      }
      return syncedSettings;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${SETTINGS_COL}/${SETTINGS_DOC}`);
    }
  },

  async updatePaymentSettings(
    next: AdminPaymentSettings
  ): Promise<{ paymentSettings: AdminPaymentSettings; settings: BusinessSettings }> {
    const cleanUpi = String(next.upiId || '').trim();
    if (cleanUpi.length < 3 || !cleanUpi.includes('@')) {
      throw new Error('Please enter a valid UPI ID (e.g., name@axl or name@ibl).');
    }
    const now = new Date().toISOString();
    const cleanPayment: AdminPaymentSettings = stripUndefinedDeep({
      upiId: cleanUpi,
      upiNumber: String(next.upiNumber || '').trim(),
      bankAccountName: String(next.bankAccountName || '').trim(),
      bankName: String(next.bankName || '').trim(),
      bankAccountNo: String(next.bankAccountNo || '').trim(),
      bankIfscBranch: String(next.bankIfscBranch || '').trim(),
      qrDataUrl: String(next.qrDataUrl || '').trim(),
      updatedAt: now,
    });

    const settingsRef = doc(db, SETTINGS_COL, SETTINGS_DOC);
    const paymentRef = doc(db, PAYMENT_SETTINGS_COL, PAYMENT_SETTINGS_DOC);
    try {
      const snap = await getDoc(settingsRef);
      const baseSettings = snap.exists()
        ? mergeBusinessSettings(snap.data() as Partial<BusinessSettings>)
        : mergeBusinessSettings();
      const updatedSettings: BusinessSettings = stripUndefinedDeep(
        mergeBusinessSettings({
          ...baseSettings,
          upiId: cleanPayment.upiId,
          upiNumber: cleanPayment.upiNumber,
          bankAccountName: cleanPayment.bankAccountName,
          bankName: cleanPayment.bankName,
          bankAccountNo: cleanPayment.bankAccountNo,
          bankIfscBranch: cleanPayment.bankIfscBranch,
          paymentQrDataUrl: cleanPayment.qrDataUrl,
          highlightConfig: {
            ...(baseSettings.highlightConfig || DEFAULT_HIGHLIGHT_CONFIG),
            upiId: cleanPayment.upiId,
            updatedAt: now,
          },
        })
      );
      try {
        const batch = writeBatch(db);
        batch.set(paymentRef, cleanPayment);
        batch.set(settingsRef, updatedSettings);
        await batch.commit();
      } catch (batchErr) {
        if (!isPermissionDeniedError(batchErr)) {
          throw batchErr;
        }
        await setDoc(settingsRef, updatedSettings);
      }
      return { paymentSettings: cleanPayment, settings: updatedSettings };
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `${PAYMENT_SETTINGS_COL}/${PAYMENT_SETTINGS_DOC}`
      );
    }
  },

  async updateSellerPaymentDetails(
    sellerId: string,
    payload: {
      sellerUpiId?: string;
      sellerBankAccountName?: string;
      sellerBankName?: string;
      sellerBankAccountNo?: string;
      sellerBankIfscBranch?: string;
      sellerQrDataUrl?: string;
    }
  ): Promise<SellerApplication> {
    const cleanUpi = String(payload.sellerUpiId || '').trim();
    if (cleanUpi && !cleanUpi.includes('@')) {
      throw new Error('Please enter a valid Seller UPI ID (e.g., seller@axl).');
    }
    const ref = doc(db, SELLER_APPLICATIONS_COL, sellerId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Seller account not found.');
      const existing = snap.data() as SellerApplication;
      const now = new Date().toISOString();
      const updated: SellerApplication = stripUndefinedDeep({
        ...existing,
        sellerUpiId: cleanUpi,
        sellerBankAccountName: String(payload.sellerBankAccountName || '').trim(),
        sellerBankName: String(payload.sellerBankName || '').trim(),
        sellerBankAccountNo: String(payload.sellerBankAccountNo || '').trim(),
        sellerBankIfscBranch: String(payload.sellerBankIfscBranch || '').trim(),
        sellerQrDataUrl: String(payload.sellerQrDataUrl || '').trim(),
        updatedAt: now,
      });
      await setDoc(ref, updated);
      return sanitizePublicSeller(updated);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Seller')) throw error;
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `${SELLER_APPLICATIONS_COL}/${sellerId}`
      );
    }
  },

  async updateSellerStoreProfile(
    sellerId: string,
    payload: {
      name: string;
      sellerPhotoDataUrl?: string;
      sellerCoverPhotoDataUrl?: string;
    }
  ): Promise<SellerApplication> {
    const nameCheck = validateEnglishName(payload.name, 'Seller Name');
    if (!nameCheck.valid) {
      throw new Error(nameCheck.error);
    }
    const ref = doc(db, SELLER_APPLICATIONS_COL, sellerId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Seller account not found.');
      const existing = snap.data() as SellerApplication;
      const now = new Date().toISOString();
      const updated: SellerApplication = stripUndefinedDeep({
        ...existing,
        name: nameCheck.cleaned,
        sellerPhotoDataUrl:
          payload.sellerPhotoDataUrl !== undefined
            ? String(payload.sellerPhotoDataUrl || '').trim()
            : existing.sellerPhotoDataUrl,
        sellerCoverPhotoDataUrl:
          payload.sellerCoverPhotoDataUrl !== undefined
            ? String(payload.sellerCoverPhotoDataUrl || '').trim()
            : String(existing.sellerCoverPhotoDataUrl || '').trim(),
        updatedAt: now,
      });
      await setDoc(ref, updated);

      if (existing.name !== nameCheck.cleaned) {
        try {
          const prodSnap = await getDocs(
            query(collection(db, PRODUCTS_COL), where('sellerId', '==', sellerId))
          );
          if (!prodSnap.empty) {
            const batch = writeBatch(db);
            for (const prodDoc of prodSnap.docs) {
              batch.update(prodDoc.ref, {
                sellerName: nameCheck.cleaned,
                updatedAt: now,
              });
            }
            await batch.commit();
          }
        } catch {
          // non-blocking secondary sync
        }
      }

      return sanitizePublicSeller(updated);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Seller') || error.message.includes('English'))
      ) {
        throw error;
      }
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `${SELLER_APPLICATIONS_COL}/${sellerId}`
      );
    }
  },

  async toggleSellerFollow(payload: {
    sellerId: string;
    clientId: string;
    customerName?: string;
  }): Promise<{
    following: boolean;
    followersCount: number;
    follow?: SellerFollowRecord;
  }> {
    const cleanSellerId = String(payload.sellerId || '').trim();
    const cleanClientId = String(payload.clientId || '').trim();
    if (!cleanSellerId || !cleanClientId) {
      throw new Error('Please sign in to follow this seller.');
    }
    const followId = `${cleanSellerId}__${cleanClientId}`.replace(
      /[^a-zA-Z0-9_-]/g,
      ''
    ).slice(0, 128);
    const followRef = doc(db, SELLER_FOLLOWS_COL, followId);
    const now = new Date().toISOString();

    try {
      const existingSnap = await getDoc(followRef);
      let following = false;
      let createdFollow: SellerFollowRecord | undefined;

      if (existingSnap.exists()) {
        await deleteDoc(followRef);
        following = false;
      } else {
        createdFollow = stripUndefinedDeep({
          id: followId,
          sellerId: cleanSellerId,
          clientId: cleanClientId,
          customerName: String(payload.customerName || 'Customer').trim(),
          createdAt: now,
        });
        await setDoc(followRef, createdFollow);
        following = true;
      }

      const countSnap = await getDocs(
        query(
          collection(db, SELLER_FOLLOWS_COL),
          where('sellerId', '==', cleanSellerId)
        )
      );
      const followersCount = countSnap.size;

      try {
        await updateDoc(doc(db, SELLER_APPLICATIONS_COL, cleanSellerId), {
          followersCount,
          updatedAt: now,
        });
      } catch {
        // non-blocking if seller document doesn't exist
      }

      return { following, followersCount, follow: createdFollow };
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `${SELLER_FOLLOWS_COL}/${followId}`
      );
    }
  },

  async submitProductReview(payload: {
    productId: string;
    sellerId?: string;
    clientId: string;
    customerName: string;
    rating: number;
    comment: string;
    mediaUrl?: string;
    mediaType?: MediaResourceType;
    mediaRecord?: CloudinaryMediaRecord;
  }): Promise<ProductReview> {
    const cleanProductId = String(payload.productId || '').trim();
    const cleanClientId = String(payload.clientId || '').trim();
    if (!cleanProductId) {
      throw new Error('Invalid product selected for review.');
    }
    if (!cleanClientId) {
      throw new Error('Please sign in to submit a rating and review.');
    }
    const cleanCustomerName =
      String(payload.customerName || '').trim() || 'Customer';
    const numericRating = Math.min(
      5,
      Math.max(1, Math.round(Number(payload.rating) || 0))
    );
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      throw new Error('Please select a rating between 1 and 5 stars.');
    }
    const cleanComment = String(payload.comment || '').trim().slice(0, 1000);
    if (cleanComment.length < 2) {
      throw new Error('Please write a review comment (minimum 2 characters).');
    }

    const cleanMediaUrl = payload.mediaUrl ? String(payload.mediaUrl).trim().slice(0, 1000) : '';
    const now = new Date().toISOString();
    const review: ProductReview = stripUndefinedDeep({
      id: `rev-${crypto.randomUUID()}`,
      productId: cleanProductId,
      sellerId: payload.sellerId ? String(payload.sellerId).trim() : '',
      clientId: cleanClientId,
      customerName: cleanCustomerName,
      rating: numericRating,
      comment: cleanComment,
      ...(cleanMediaUrl
        ? {
            mediaUrl: cleanMediaUrl,
            mediaType: payload.mediaType || 'image',
            ...(payload.mediaRecord ? { mediaRecord: payload.mediaRecord } : {}),
          }
        : {}),
      createdAt: now,
      updatedAt: now,
    });

    try {
      await setDoc(doc(db, PRODUCT_REVIEWS_COL, review.id), review);
      return review;
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `${PRODUCT_REVIEWS_COL}/${review.id}`
      );
    }
  },

  async createClient(
    payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Client> {
    const nameCheck = validateEnglishName(payload.name, 'Customer Name');
    if (!nameCheck.valid) {
      throw new Error(nameCheck.error);
    }
    const now = new Date().toISOString();
    const formattedMobile = formatPhoneWithPlus91(payload.mobile);
    const formattedWhatsapp = formatPhoneWithPlus91(
      payload.whatsapp || payload.mobile
    );
    const client: Client = stripUndefinedDeep({
      ...payload,
      name: nameCheck.cleaned,
      mobile: formattedMobile,
      whatsapp: formattedWhatsapp || formattedMobile,
      id: `cli-${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    });
    try {
      await setDoc(doc(db, CLIENTS_COL, client.id), client);
      return client;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${CLIENTS_COL}/${client.id}`);
    }
  },

  async updateClient(
    id: string,
    payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Client> {
    const nameCheck = validateEnglishName(payload.name, 'Customer Name');
    if (!nameCheck.valid) {
      throw new Error(nameCheck.error);
    }
    const ref = doc(db, CLIENTS_COL, id);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Customer not found.');
      const existing = snap.data() as Client;
      const formattedMobile = formatPhoneWithPlus91(payload.mobile);
      const formattedWhatsapp = formatPhoneWithPlus91(
        payload.whatsapp || payload.mobile
      );
      const updated: Client = stripUndefinedDeep({
        ...existing,
        ...payload,
        name: nameCheck.cleaned,
        mobile: formattedMobile,
        whatsapp: formattedWhatsapp || formattedMobile,
        id,
        updatedAt: new Date().toISOString(),
      });
      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === 'Customer not found.') throw error;
      handleFirestoreError(error, OperationType.UPDATE, `${CLIENTS_COL}/${id}`);
    }
  },

  async deleteClient(id: string): Promise<{ ok: boolean }> {
    try {
      await deleteDoc(doc(db, CLIENTS_COL, id));
      return { ok: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${CLIENTS_COL}/${id}`);
    }
  },

  async createProduct(
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Product> {
    const now = new Date().toISOString();
    const product: Product = stripUndefinedDeep({
      ...payload,
      id: `prd-${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    });
    try {
      await setDoc(doc(db, PRODUCTS_COL, product.id), product);
      return product;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${PRODUCTS_COL}/${product.id}`);
    }
  },

  async updateProduct(
    id: string,
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    expectedSellerId?: string
  ): Promise<Product> {
    const ref = doc(db, PRODUCTS_COL, id);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Product not found.');
      const existing = snap.data() as Product;
      if (expectedSellerId && existing.sellerId !== expectedSellerId) {
        throw new Error('You can only edit products belonging to your Seller account.');
      }
      const updated: Product = stripUndefinedDeep({
        ...existing,
        ...payload,
        sellerId: expectedSellerId ? existing.sellerId : payload.sellerId,
        id,
        updatedAt: new Date().toISOString(),
      });
      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === 'Product not found.' ||
          error.message.includes('only edit products'))
      ) {
        throw error;
      }
      handleFirestoreError(error, OperationType.UPDATE, `${PRODUCTS_COL}/${id}`);
    }
  },

  async deleteProduct(
    id: string,
    expectedSellerId?: string
  ): Promise<{ ok: boolean }> {
    const ref = doc(db, PRODUCTS_COL, id);
    try {
      if (expectedSellerId) {
        const snap = await getDoc(ref);
        if (!snap.exists()) return { ok: true };
        const existing = snap.data() as Product;
        if (existing.sellerId !== expectedSellerId) {
          throw new Error('You can only delete products belonging to your Seller account.');
        }
      }
      await deleteDoc(ref);
      return { ok: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes('only delete products')) {
        throw error;
      }
      handleFirestoreError(error, OperationType.DELETE, `${PRODUCTS_COL}/${id}`);
    }
  },

  async createInvoice(payload: Partial<Invoice>): Promise<{
    invoice: Invoice;
    payment: PaymentRecord | null;
    products: Product[];
  }> {
    if (!String(payload.customerName || '').trim()) {
      throw new Error('Please select or enter a customer.');
    }
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error('Please add at least one product to the invoice.');
    }

    const invoice = normalizeInvoice({ ...payload, id: `inv-${crypto.randomUUID()}` });
    const stockAdjustments = invoice.items
      .filter((i) => i.productId)
      .map((i) => ({ productId: i.productId, delta: -i.quantity }));

    const products = await computeStockDeltaProducts(stockAdjustments);

    let payment: PaymentRecord | null = null;
    if (invoice.paidAmount > 0) {
      payment = stripUndefinedDeep({
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
      });
    }

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, INVOICES_COL, invoice.id), invoice);
      if (payment) {
        batch.set(doc(db, PAYMENTS_COL, payment.id), payment);
      }
      const affectedIds = new Set(stockAdjustments.map((s) => s.productId));
      for (const prod of products) {
        if (affectedIds.has(prod.id)) {
          batch.update(doc(db, PRODUCTS_COL, prod.id), {
            stockQty: prod.stockQty,
            updatedAt: prod.updatedAt,
          });
        }
      }
      await batch.commit();
      return { invoice, payment, products };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${INVOICES_COL}/${invoice.id}`);
    }
  },

  async updateInvoice(
    id: string,
    payload: Partial<Invoice>
  ): Promise<{
    invoice: Invoice;
    products: Product[];
    payments: PaymentRecord[];
  }> {
    const invRef = doc(db, INVOICES_COL, id);
    let existing: Invoice;
    try {
      const snap = await getDoc(invRef);
      if (!snap.exists()) throw new Error('Invoice not found.');
      existing = snap.data() as Invoice;
    } catch (error) {
      if (error instanceof Error && error.message === 'Invoice not found.') throw error;
      handleFirestoreError(error, OperationType.GET, `${INVOICES_COL}/${id}`);
    }

    const updated = normalizeInvoice(payload, existing);

    const stockAdjustments = [
      ...existing.items
        .filter((i) => i.productId)
        .map((i) => ({ productId: i.productId, delta: i.quantity })),
      ...updated.items
        .filter((i) => i.productId)
        .map((i) => ({ productId: i.productId, delta: -i.quantity })),
    ];
    const products = await computeStockDeltaProducts(stockAdjustments);

    let allPayments: PaymentRecord[] = [];
    try {
      const paySnap = await getDocs(collection(db, PAYMENTS_COL));
      allPayments = paySnap.docs.map((d) => d.data() as PaymentRecord);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, PAYMENTS_COL);
    }

    const updatedPayments = allPayments.map((p) =>
      p.invoiceId === updated.id
        ? {
            ...p,
            invoiceNumber: updated.invoiceNumber,
            customerName: updated.customerName,
            totalBill: updated.totalAmount,
          }
        : p
    );

    try {
      const batch = writeBatch(db);
      batch.set(invRef, updated);

      const affectedIds = new Set(stockAdjustments.map((s) => s.productId));
      for (const prod of products) {
        if (affectedIds.has(prod.id)) {
          batch.update(doc(db, PRODUCTS_COL, prod.id), {
            stockQty: prod.stockQty,
            updatedAt: prod.updatedAt,
          });
        }
      }

      for (const p of updatedPayments) {
        if (p.invoiceId === updated.id) {
          batch.update(doc(db, PAYMENTS_COL, p.id), {
            invoiceNumber: p.invoiceNumber,
            customerName: p.customerName,
            totalBill: p.totalBill,
          });
        }
      }

      await batch.commit();
      return {
        invoice: updated,
        products,
        payments: sortDescByCreated(updatedPayments),
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${INVOICES_COL}/${id}`);
    }
  },

  async deleteInvoice(id: string): Promise<{ ok: boolean; products: Product[] }> {
    const invRef = doc(db, INVOICES_COL, id);
    let existing: Invoice | null = null;
    try {
      const snap = await getDoc(invRef);
      if (snap.exists()) existing = snap.data() as Invoice;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${INVOICES_COL}/${id}`);
    }

    const stockAdjustments = existing
      ? existing.items
          .filter((i) => i.productId)
          .map((i) => ({ productId: i.productId, delta: i.quantity }))
      : [];
    const products = await computeStockDeltaProducts(stockAdjustments);

    let linkedPaymentIds: string[] = [];
    try {
      const paySnap = await getDocs(collection(db, PAYMENTS_COL));
      linkedPaymentIds = paySnap.docs
        .map((d) => d.data() as PaymentRecord)
        .filter((p) => p.invoiceId === id)
        .map((p) => p.id);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, PAYMENTS_COL);
    }

    try {
      const batch = writeBatch(db);
      batch.delete(invRef);
      for (const payId of linkedPaymentIds) {
        batch.delete(doc(db, PAYMENTS_COL, payId));
      }
      const affectedIds = new Set(stockAdjustments.map((s) => s.productId));
      for (const prod of products) {
        if (affectedIds.has(prod.id)) {
          batch.update(doc(db, PRODUCTS_COL, prod.id), {
            stockQty: prod.stockQty,
            updatedAt: prod.updatedAt,
          });
        }
      }
      await batch.commit();
      return { ok: true, products };
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${INVOICES_COL}/${id}`);
    }
  },

  async createPayment(payload: {
    invoiceId: string;
    amountPaid: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    note: string;
  }): Promise<{ payment: PaymentRecord; invoice: Invoice }> {
    const invRef = doc(db, INVOICES_COL, payload.invoiceId);
    let invoice: Invoice;
    try {
      const snap = await getDoc(invRef);
      if (!snap.exists()) throw new Error('Invoice not found for this payment.');
      invoice = snap.data() as Invoice;
    } catch (error) {
      if (error instanceof Error && error.message === 'Invoice not found for this payment.') {
        throw error;
      }
      handleFirestoreError(error, OperationType.GET, `${INVOICES_COL}/${payload.invoiceId}`);
    }

    const amountPaid = Number(safeNum(payload.amountPaid, 0).toFixed(2));
    if (amountPaid <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const nextPaid = Number(
      Math.min(invoice.totalAmount, invoice.paidAmount + amountPaid).toFixed(2)
    );
    const nextDue = Number(Math.max(0, invoice.totalAmount - nextPaid).toFixed(2));
    const updatedInvoice: Invoice = stripUndefinedDeep({
      ...invoice,
      paidAmount: nextPaid,
      dueAmount: nextDue,
      updatedAt: new Date().toISOString(),
    });

    const payment: PaymentRecord = stripUndefinedDeep({
      id: `pay-${crypto.randomUUID()}`,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      customerName: invoice.customerName,
      totalBill: invoice.totalAmount,
      amountPaid,
      remainingDueAfter: nextDue,
      paymentDate: String(payload.paymentDate || new Date().toISOString().slice(0, 10)),
      paymentMethod: payload.paymentMethod,
      note: String(payload.note || '').trim(),
      createdAt: new Date().toISOString(),
    });

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, PAYMENTS_COL, payment.id), payment);
      batch.update(invRef, {
        paidAmount: updatedInvoice.paidAmount,
        dueAmount: updatedInvoice.dueAmount,
        updatedAt: updatedInvoice.updatedAt,
      });
      await batch.commit();
      return { payment, invoice: updatedInvoice };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${PAYMENTS_COL}/${payment.id}`);
    }
  },

  async deletePayment(id: string): Promise<{ ok: boolean; invoice?: Invoice }> {
    const payRef = doc(db, PAYMENTS_COL, id);
    let payment: PaymentRecord;
    try {
      const snap = await getDoc(payRef);
      if (!snap.exists()) throw new Error('Payment record not found.');
      payment = snap.data() as PaymentRecord;
    } catch (error) {
      if (error instanceof Error && error.message === 'Payment record not found.') {
        throw error;
      }
      handleFirestoreError(error, OperationType.GET, `${PAYMENTS_COL}/${id}`);
    }

    let updatedInvoice: Invoice | undefined;
    const invRef = doc(db, INVOICES_COL, payment.invoiceId);
    try {
      const invSnap = await getDoc(invRef);
      if (invSnap.exists()) {
        const inv = invSnap.data() as Invoice;
        const nextPaid = Number(
          Math.max(0, inv.paidAmount - safeNum(payment.amountPaid, 0)).toFixed(2)
        );
        updatedInvoice = {
          ...inv,
          paidAmount: nextPaid,
          dueAmount: Number(Math.max(0, inv.totalAmount - nextPaid).toFixed(2)),
          updatedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${INVOICES_COL}/${payment.invoiceId}`);
    }

    try {
      const batch = writeBatch(db);
      batch.delete(payRef);
      if (updatedInvoice) {
        batch.update(invRef, {
          paidAmount: updatedInvoice.paidAmount,
          dueAmount: updatedInvoice.dueAmount,
          updatedAt: updatedInvoice.updatedAt,
        });
      }
      await batch.commit();
      return { ok: true, invoice: updatedInvoice };
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${PAYMENTS_COL}/${id}`);
    }
  },

  async updateDelivery(
    invoiceId: string,
    payload: {
      courierName: string;
      trackingNumber: string;
      deliveryStatus: DeliveryStatus;
    }
  ): Promise<Invoice> {
    const invRef = doc(db, INVOICES_COL, invoiceId);
    try {
      const snap = await getDoc(invRef);
      if (!snap.exists()) throw new Error('Order not found.');
      const existing = snap.data() as Invoice;
      const updatedAt = new Date().toISOString();
      const updated: Invoice = {
        ...existing,
        courierName: payload.courierName.trim(),
        trackingNumber: payload.trackingNumber.trim(),
        deliveryStatus: payload.deliveryStatus,
        updatedAt,
      };
      await updateDoc(invRef, {
        courierName: updated.courierName,
        trackingNumber: updated.trackingNumber,
        deliveryStatus: updated.deliveryStatus,
        updatedAt,
      });
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === 'Order not found.') throw error;
      handleFirestoreError(error, OperationType.UPDATE, `${INVOICES_COL}/${invoiceId}`);
    }
  },

  async createExpense(
    payload: Omit<ExpenseRecord, 'id' | 'createdAt'>
  ): Promise<ExpenseRecord> {
    const expense: ExpenseRecord = stripUndefinedDeep({
      ...payload,
      id: `exp-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    });
    try {
      await setDoc(doc(db, EXPENSES_COL, expense.id), expense);
      return expense;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${EXPENSES_COL}/${expense.id}`);
    }
  },

  async deleteExpense(id: string): Promise<{ ok: boolean }> {
    try {
      await deleteDoc(doc(db, EXPENSES_COL, id));
      return { ok: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${EXPENSES_COL}/${id}`);
    }
  },

  async restoreBackup(workspace: WorkspaceData): Promise<WorkspaceData> {
    const restoredSettings = stripUndefinedDeep(mergeBusinessSettings(workspace.settings));
    const restoredPaymentSettings = stripUndefinedDeep(
      mergeAdminPaymentSettings(workspace.paymentSettings, restoredSettings)
    );
    const restored: WorkspaceData = {
      settings: restoredSettings,
      paymentSettings: restoredPaymentSettings,
      clients: Array.isArray(workspace.clients)
        ? workspace.clients.map((c) => stripUndefinedDeep(c))
        : [],
      products: Array.isArray(workspace.products)
        ? workspace.products.map((p) => stripUndefinedDeep(p))
        : [],
      invoices: Array.isArray(workspace.invoices)
        ? workspace.invoices.map((inv) => normalizeInvoice(inv))
        : [],
      payments: Array.isArray(workspace.payments)
        ? workspace.payments.map((p) => stripUndefinedDeep(p))
        : [],
      expenses: Array.isArray(workspace.expenses)
        ? workspace.expenses.map((e) => stripUndefinedDeep(e))
        : [],
      orders: Array.isArray(workspace.orders)
        ? workspace.orders.map((o) => stripUndefinedDeep(o))
        : [],
      sellerApplications: Array.isArray(workspace.sellerApplications)
        ? workspace.sellerApplications.map((s) => stripUndefinedDeep(s))
        : [],
      supportChats: Array.isArray(workspace.supportChats)
        ? workspace.supportChats.map((c) => stripUndefinedDeep(c))
        : [],
      highlightRequests: Array.isArray(workspace.highlightRequests)
        ? workspace.highlightRequests.map((h) => stripUndefinedDeep(h))
        : [],
    };

    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

    const existingCollections = [
      CLIENTS_COL,
      PRODUCTS_COL,
      INVOICES_COL,
      PAYMENTS_COL,
      EXPENSES_COL,
      ORDERS_COL,
    ];
    for (const colName of existingCollections) {
      try {
        const snap = await getDocs(collection(db, colName));
        for (const d of snap.docs) {
          ops.push((batch) => batch.delete(d.ref));
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, colName);
      }
    }

    ops.push((batch) =>
      batch.set(doc(db, SETTINGS_COL, SETTINGS_DOC), restored.settings)
    );
    if (restored.paymentSettings) {
      ops.push((batch) =>
        batch.set(
          doc(db, PAYMENT_SETTINGS_COL, PAYMENT_SETTINGS_DOC),
          restored.paymentSettings!
        )
      );
    }
    for (const c of restored.clients) {
      ops.push((batch) => batch.set(doc(db, CLIENTS_COL, c.id), c));
    }
    for (const p of restored.products) {
      ops.push((batch) => batch.set(doc(db, PRODUCTS_COL, p.id), p));
    }
    for (const inv of restored.invoices) {
      ops.push((batch) => batch.set(doc(db, INVOICES_COL, inv.id), inv));
    }
    for (const pay of restored.payments) {
      ops.push((batch) => batch.set(doc(db, PAYMENTS_COL, pay.id), pay));
    }
    for (const exp of restored.expenses) {
      ops.push((batch) => batch.set(doc(db, EXPENSES_COL, exp.id), exp));
    }
    for (const ord of restored.orders) {
      ops.push((batch) => batch.set(doc(db, ORDERS_COL, ord.id), ord));
    }

    try {
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = ops.slice(i, i + 400);
        for (const applyOp of chunk) {
          applyOp(batch);
        }
        await batch.commit();
      }
      return restored;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'workspace/restore');
    }
  },

  async searchPublicBills(query: string): Promise<{
    results: Array<{ invoice: Invoice; settings: BusinessSettings }>;
  }> {
    const rawQuery = query.trim();
    if (rawQuery.length < 2) {
      throw new Error(
        'Please enter at least 2 characters (Order / Invoice Number or Client Name).'
      );
    }

    const qLower = rawQuery.toLowerCase();
    const qDigits = rawQuery.replace(/[^\d]/g, '');

    let settings: BusinessSettings = mergeBusinessSettings();
    try {
      const settingsSnap = await getDoc(doc(db, SETTINGS_COL, SETTINGS_DOC));
      if (settingsSnap.exists()) {
        settings = mergeBusinessSettings(settingsSnap.data() as Partial<BusinessSettings>);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${SETTINGS_COL}/${SETTINGS_DOC}`);
    }

    let invoices: Invoice[] = [];
    let clients: Client[] = [];
    try {
      const [invSnap, cliSnap] = await Promise.all([
        getDocs(collection(db, INVOICES_COL)),
        getDocs(collection(db, CLIENTS_COL)),
      ]);
      invoices = invSnap.docs.map((d) => d.data() as Invoice);
      clients = cliSnap.docs.map((d) => d.data() as Client);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, INVOICES_COL);
    }

    const matches: Array<{ invoice: Invoice; settings: BusinessSettings }> = [];

    for (const inv of invoices) {
      const linkedClient = clients.find((c) => c.id === inv.clientId);
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
          items: Array.isArray(inv.items)
            ? inv.items.map((item) => ({
                ...item,
                purchasePrice: 0,
                lineCost: 0,
                lineProfit: 0,
              }))
            : [],
        },
        settings,
      });
    }

    matches.sort((a, b) =>
      String(b.invoice.invoiceDate || b.invoice.createdAt).localeCompare(
        String(a.invoice.invoiceDate || a.invoice.createdAt)
      )
    );

    return { results: matches.slice(0, 20) };
  },

  async registerCustomerAccount(payload: {
    name: string;
    email: string;
    otpId: string;
    phone: string;
    address: string;
    city?: string;
    state?: string;
    pinCode?: string;
    password: string;
    profilePhotoDataUrl?: string;
    referredBy?: string;
  }): Promise<{ client: Client }> {
    const nameCheck = validateEnglishName(payload.name, 'Full Name');
    const gmailCheck = validateGmailAddress(payload.email);
    const phoneCheck = normalizeIndianPhone(payload.phone);
    const cleanAddress = String(payload.address || '').trim();
    const cleanPassword = String(payload.password || '').trim();

    if (!nameCheck.valid) {
      throw new Error(nameCheck.error);
    }
    const cleanName = nameCheck.cleaned;
    if (!gmailCheck.valid) {
      throw new Error(gmailCheck.error);
    }
    if (!phoneCheck.valid) {
      throw new Error(
        phoneCheck.error || 'Please enter a valid 10-digit Indian mobile number.'
      );
    }
    if (!cleanAddress) {
      throw new Error('Please enter your full delivery address.');
    }
    if (cleanPassword.length < 4) {
      throw new Error('Password must be at least 4 characters long.');
    }

    await assertVerifiedEmailOtp(
      payload.otpId,
      gmailCheck.email,
      'customer_register'
    );

    const formattedPhone = phoneCheck.formatted;

    let existingClients: Client[] = [];
    try {
      const cliSnap = await getDocs(collection(db, CLIENTS_COL));
      existingClients = cliSnap.docs.map((d) => d.data() as Client);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, CLIENTS_COL);
    }

    const matchedClient = existingClients.find(
      (c) =>
        phoneNumbersMatch(c.mobile, formattedPhone) ||
        phoneNumbersMatch(c.whatsapp, formattedPhone)
    );

    if (matchedClient && matchedClient.passwordHash) {
      throw new Error(
        'An account with this phone number already exists. Please Sign In or click Forgot Password.'
      );
    }

    const emailConflict = existingClients.find(
      (c) =>
        c.id !== matchedClient?.id &&
        c.passwordHash &&
        String(c.email || '').trim().toLowerCase() === gmailCheck.email
    );
    if (emailConflict) {
      throw new Error(
        'An account with this Gmail address already exists. Please Sign In or click Forgot Password.'
      );
    }

    const { salt, hash } = await hashCustomerPassword(cleanPassword);
    const runningPasswordEnc = encryptRunningPassword(cleanPassword, salt);
    const now = new Date().toISOString();

    const cleanReferredBy = String(payload.referredBy || '').trim();
    const newClientId = matchedClient ? matchedClient.id : `cli-${crypto.randomUUID()}`;
    const referralCode =
      matchedClient?.referralCode ||
      getCustomerReferralCode({ id: newClientId, mobile: formattedPhone });

    const client: Client = matchedClient
      ? stripUndefinedDeep({
          ...matchedClient,
          name: cleanName,
          email: gmailCheck.email,
          mobile: formattedPhone,
          whatsapp: matchedClient.whatsapp
            ? formatPhoneWithPlus91(matchedClient.whatsapp)
            : formattedPhone,
          address: cleanAddress,
          city: String(payload.city || matchedClient.city || '').trim(),
          state: String(payload.state || matchedClient.state || '').trim(),
          pinCode: String(payload.pinCode || matchedClient.pinCode || '').trim(),
          profilePhotoDataUrl:
            payload.profilePhotoDataUrl !== undefined
              ? String(payload.profilePhotoDataUrl || '')
              : matchedClient.profilePhotoDataUrl || '',
          referralCode,
          referredBy: matchedClient.referredBy || cleanReferredBy || '',
          passwordSalt: salt,
          passwordHash: hash,
          runningPasswordEnc,
          passwordUpdatedAt: now,
          cart: Array.isArray(matchedClient.cart) ? matchedClient.cart : [],
          updatedAt: now,
        })
      : stripUndefinedDeep({
          id: newClientId,
          name: cleanName,
          email: gmailCheck.email,
          mobile: formattedPhone,
          whatsapp: formattedPhone,
          address: cleanAddress,
          city: String(payload.city || '').trim(),
          state: String(payload.state || '').trim(),
          pinCode: String(payload.pinCode || '').trim(),
          profilePhotoDataUrl: String(payload.profilePhotoDataUrl || ''),
          referralCode,
          referredBy: cleanReferredBy,
          passwordSalt: salt,
          passwordHash: hash,
          runningPasswordEnc,
          passwordUpdatedAt: now,
          cart: [],
          createdAt: now,
          updatedAt: now,
        });

    try {
      await setDoc(doc(db, CLIENTS_COL, client.id), client);
      return { client };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${CLIENTS_COL}/${client.id}`);
    }
  },

  async loginCustomerAccount(
    phone: string,
    password: string
  ): Promise<{ client: Client }> {
    const phoneCheck = normalizeIndianPhone(phone);
    const cleanPassword = String(password || '').trim();
    if (!phoneCheck.valid) {
      throw new Error(
        phoneCheck.error || 'Please enter a valid 10-digit Indian mobile number.'
      );
    }
    if (!cleanPassword) {
      throw new Error('Please enter your password.');
    }

    let existingClients: Client[] = [];
    try {
      const cliSnap = await getDocs(collection(db, CLIENTS_COL));
      existingClients = cliSnap.docs.map((d) => d.data() as Client);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, CLIENTS_COL);
    }

    const matched = existingClients.find(
      (c) =>
        phoneNumbersMatch(c.mobile, phoneCheck.formatted) ||
        phoneNumbersMatch(c.whatsapp, phoneCheck.formatted)
    );

    if (!matched) {
      throw new Error(
        'No customer account found with this phone number. Please Create Account first.'
      );
    }
    if (!matched.passwordHash) {
      throw new Error(
        'Password is not set for this account yet. Use Forgot Password on WhatsApp or ask admin to set your password.'
      );
    }

    const valid = await verifyCustomerPassword(
      cleanPassword,
      matched.passwordSalt,
      matched.passwordHash
    );
    if (!valid) {
      throw new Error('Incorrect password. Please try again or use Forgot Password.');
    }

    return { client: matched };
  },

  async setClientPassword(clientId: string, newPassword: string): Promise<Client> {
    const cleanPassword = String(newPassword || '').trim();
    if (cleanPassword.length < 4) {
      throw new Error('Password must be at least 4 characters long.');
    }

    const ref = doc(db, CLIENTS_COL, clientId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Customer not found.');
      const existing = snap.data() as Client;
      const { salt, hash } = await hashCustomerPassword(cleanPassword);
      const runningPasswordEnc = encryptRunningPassword(cleanPassword, salt);
      const now = new Date().toISOString();
      const updated: Client = stripUndefinedDeep({
        ...existing,
        passwordSalt: salt,
        passwordHash: hash,
        runningPasswordEnc,
        passwordUpdatedAt: now,
        updatedAt: now,
      });
      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === 'Customer not found.') throw error;
      handleFirestoreError(error, OperationType.UPDATE, `${CLIENTS_COL}/${clientId}`);
    }
  },

  async updateCustomerProfilePhoto(
    clientId: string,
    profilePhotoDataUrl: string
  ): Promise<Client> {
    const ref = doc(db, CLIENTS_COL, clientId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Customer account not found.');
      const existing = snap.data() as Client;
      const now = new Date().toISOString();
      const updated: Client = stripUndefinedDeep({
        ...existing,
        profilePhotoDataUrl: String(profilePhotoDataUrl || ''),
        updatedAt: now,
      });
      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === 'Customer account not found.') {
        throw error;
      }
      handleFirestoreError(error, OperationType.UPDATE, `${CLIENTS_COL}/${clientId}`);
    }
  },

  async updateCustomerCart(
    clientId: string,
    cart: CustomerCartItem[]
  ): Promise<Client> {
    const ref = doc(db, CLIENTS_COL, clientId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Customer account not found.');
      const existing = snap.data() as Client;
      const cleanCart: CustomerCartItem[] = (Array.isArray(cart) ? cart : []).map(
        (item) => ({
          id: String(item.id),
          productId: item.productId ? String(item.productId) : '',
          name: String(item.name || '').trim(),
          category: item.category ? String(item.category).trim() : '',
          size: item.size ? String(item.size).trim() : '',
          color: item.color ? String(item.color).trim() : '',
          price: Math.max(0, Number(safeNum(item.price, 0).toFixed(2))),
          originalPrice:
            item.originalPrice !== undefined
              ? Math.max(0, Number(safeNum(item.originalPrice, 0).toFixed(2)))
              : undefined,
          quantity: Math.max(1, Math.floor(safeNum(item.quantity, 1))),
          imageDataUrl: item.imageDataUrl ? String(item.imageDataUrl) : '',
          sellerId: item.sellerId ? String(item.sellerId) : '',
          sellerName: item.sellerName ? String(item.sellerName).trim() : '',
        })
      );
      const now = new Date().toISOString();
      const updated: Client = stripUndefinedDeep({
        ...existing,
        cart: cleanCart,
        updatedAt: now,
      });
      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === 'Customer account not found.') {
        throw error;
      }
      handleFirestoreError(error, OperationType.UPDATE, `${CLIENTS_COL}/${clientId}`);
    }
  },

  async fetchPublicSettingsOnly(): Promise<BusinessSettings> {
    try {
      const snap = await getDoc(doc(db, SETTINGS_COL, SETTINGS_DOC));
      if (snap.exists()) {
        return mergeBusinessSettings(snap.data() as Partial<BusinessSettings>);
      }
      return mergeBusinessSettings();
    } catch {
      return mergeBusinessSettings();
    }
  },

  async resolveGoogleCustomerAccount(payload: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    detectedCountry?: string;
    isBangladesh?: boolean;
  }): Promise<{ client: Client | null; needsOnboarding: boolean }> {
    const cleanUid = String(payload.uid || '').trim();
    const cleanEmail = String(payload.email || '').trim().toLowerCase();
    const cleanPhoto = String(payload.photoURL || '').trim();
    if (!cleanUid) {
      throw new Error('Google authentication account ID is missing.');
    }

    let matched: Client | undefined;
    try {
      const byUidSnap = await getDocs(
        query(collection(db, CLIENTS_COL), where('authUid', '==', cleanUid))
      );
      if (!byUidSnap.empty) {
        matched = byUidSnap.docs[0].data() as Client;
      }

      if (!matched && cleanEmail) {
        const allClientsSnap = await getDocs(collection(db, CLIENTS_COL));
        const allClients = allClientsSnap.docs.map((d) => d.data() as Client);
        matched = allClients.find(
          (c) => String(c.email || '').trim().toLowerCase() === cleanEmail
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, CLIENTS_COL);
    }

    if (!matched) {
      return { client: null, needsOnboarding: true };
    }

    const isBdAccount = Boolean(
      payload.isBangladesh ||
        String(payload.detectedCountry || '').toUpperCase() === 'BD' ||
        String(matched.detectedCountry || '').toUpperCase() === 'BD'
    );

    const phoneValid = normalizeAsianPhone(matched.mobile).valid;
    const hasName = Boolean(String(matched.name || '').trim());
    const hasPhoto = Boolean(String(matched.profilePhotoDataUrl || cleanPhoto).trim());
    const isComplete = isBdAccount
      ? hasName && hasPhoto && matched.profileCompleted !== false
      : phoneValid && matched.profileCompleted !== false;

    if (!isComplete) {
      return { client: matched, needsOnboarding: true };
    }

    const desiredCountry = isBdAccount ? 'BD' : matched.detectedCountry;
    const needsSync =
      matched.authUid !== cleanUid ||
      (cleanEmail && String(matched.email || '').trim().toLowerCase() !== cleanEmail) ||
      (!matched.profilePhotoDataUrl && cleanPhoto) ||
      (desiredCountry && matched.detectedCountry !== desiredCountry) ||
      matched.profileCompleted !== true;

    if (needsSync) {
      const now = new Date().toISOString();
      const updated: Client = stripUndefinedDeep({
        ...matched,
        authUid: cleanUid,
        email: cleanEmail || matched.email || '',
        profilePhotoDataUrl: matched.profilePhotoDataUrl || cleanPhoto || '',
        detectedCountry: desiredCountry,
        profileCompleted: true,
        referralCode:
          matched.referralCode ||
          getCustomerReferralCode({
            id: matched.id,
            mobile: matched.mobile,
            referralCode: matched.referralCode,
          }),
        updatedAt: now,
      });
      try {
        await setDoc(doc(db, CLIENTS_COL, matched.id), updated);
        return { client: updated, needsOnboarding: false };
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `${CLIENTS_COL}/${matched.id}`);
      }
    }

    return { client: matched, needsOnboarding: false };
  },

  async completeGoogleCustomerOnboarding(payload: {
    uid: string;
    email?: string | null;
    name: string;
    mobile?: string;
    profilePhotoDataUrl?: string;
    referredBy?: string;
    detectedCountry?: string;
    isBangladesh?: boolean;
  }): Promise<Client> {
    const cleanUid = String(payload.uid || '').trim();
    const cleanEmail = String(payload.email || '').trim().toLowerCase();
    const isBdFlow = Boolean(
      payload.isBangladesh ??
        (String(payload.detectedCountry || '').toUpperCase() === 'BD' ||
          detectClientBangladeshFallback())
    );
    const nameCheck = validateEnglishName(payload.name, 'Full Name');
    const rawMobile = String(payload.mobile || '').trim();
    const cleanPhotoInput = String(
      payload.profilePhotoDataUrl !== undefined ? payload.profilePhotoDataUrl : ''
    ).trim();

    if (!cleanUid) {
      throw new Error('Please sign in with Google first.');
    }
    if (!nameCheck.valid) {
      throw new Error(nameCheck.error);
    }

    let cleanPhone = '';
    if (rawMobile && rawMobile.toLowerCase() !== 'not provided') {
      const phoneCheck = normalizeAsianPhone(
        rawMobile,
        isBdFlow ? '+880' : '+91'
      );
      if (!phoneCheck.valid) {
        throw new Error(
          phoneCheck.error || 'Please enter a valid mobile number.'
        );
      }
      cleanPhone = phoneCheck.formatted;
    } else if (!isBdFlow) {
      throw new Error('Please enter a valid mobile number.');
    }

    const cleanName = nameCheck.cleaned;
    const cleanReferredBy = String(payload.referredBy || '').trim().toUpperCase();

    let allClients: Client[] = [];
    try {
      const snap = await getDocs(collection(db, CLIENTS_COL));
      allClients = snap.docs.map((d) => d.data() as Client);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, CLIENTS_COL);
    }

    const matched =
      allClients.find((c) => c.authUid === cleanUid) ||
      (cleanEmail
        ? allClients.find(
            (c) => String(c.email || '').trim().toLowerCase() === cleanEmail
          )
        : undefined) ||
      (cleanPhone
        ? allClients.find(
            (c) =>
              phoneNumbersMatch(c.mobile, cleanPhone) ||
              phoneNumbersMatch(c.whatsapp, cleanPhone)
          )
        : undefined);

    const finalPhotoUrl = cleanPhotoInput || String(matched?.profilePhotoDataUrl || '').trim();
    if (isBdFlow && !finalPhotoUrl) {
      throw new Error('Please upload a profile photo to complete your account.');
    }

    const now = new Date().toISOString();
    const id = matched ? matched.id : `cli-${crypto.randomUUID()}`;
    const resolvedReferralCode =
      matched?.referralCode && matched.referralCode.trim()
        ? matched.referralCode.trim()
        : getCustomerReferralCode({ id, mobile: cleanPhone });

    let finalReferredBy = matched?.referredBy || '';
    if (!finalReferredBy && cleanReferredBy && cleanReferredBy !== resolvedReferralCode) {
      const referrerExists = allClients.some(
        (c) =>
          c.id !== id &&
          getCustomerReferralCode({
            id: c.id,
            mobile: c.mobile,
            referralCode: c.referralCode,
          }) === cleanReferredBy
      );
      if (referrerExists) {
        finalReferredBy = cleanReferredBy;
      }
    }

    const resolvedCountry = isBdFlow
      ? 'BD'
      : payload.detectedCountry || matched?.detectedCountry;
    const existingCleanWhatsapp =
      matched?.whatsapp && matched.whatsapp.toLowerCase() !== 'not provided'
        ? formatPhoneWithPlus91(matched.whatsapp)
        : '';

    const client: Client = stripUndefinedDeep({
      ...(matched || {}),
      id,
      name: cleanName,
      email: cleanEmail || matched?.email || '',
      authUid: cleanUid,
      profileCompleted: true,
      detectedCountry: resolvedCountry,
      mobile: cleanPhone,
      whatsapp: existingCleanWhatsapp || cleanPhone,
      address: matched?.address || '',
      city: matched?.city || '',
      state: matched?.state || '',
      pinCode: matched?.pinCode || '',
      profilePhotoDataUrl: finalPhotoUrl,
      cart: Array.isArray(matched?.cart) ? matched.cart : [],
      favoriteProductIds: Array.isArray(matched?.favoriteProductIds)
        ? matched.favoriteProductIds
        : [],
      referralCode: resolvedReferralCode,
      referredBy: finalReferredBy,
      categoryInterests: matched?.categoryInterests || {},
      totalCategoryOrders: matched?.totalCategoryOrders || 0,
      createdAt: matched ? matched.createdAt : now,
      updatedAt: now,
    });

    try {
      await setDoc(doc(db, CLIENTS_COL, client.id), client);
      return client;
    } catch (error) {
      if (isBdFlow && !cleanPhone && isPermissionDeniedError(error)) {
        const fallbackClient: Client = stripUndefinedDeep({
          ...client,
          mobile: 'Not provided',
          whatsapp: client.whatsapp || 'Not provided',
        });
        try {
          await setDoc(doc(db, CLIENTS_COL, fallbackClient.id), fallbackClient);
          return fallbackClient;
        } catch (fallbackErr) {
          handleFirestoreError(
            fallbackErr,
            OperationType.WRITE,
            `${CLIENTS_COL}/${fallbackClient.id}`
          );
        }
      }
      handleFirestoreError(error, OperationType.WRITE, `${CLIENTS_COL}/${client.id}`);
    }
  },

  async updateCustomerFavorites(
    clientId: string,
    favoriteProductIds: string[]
  ): Promise<Client> {
    const ref = doc(db, CLIENTS_COL, clientId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Customer account not found.');
      const existing = snap.data() as Client;
      const cleanIds = Array.from(
        new Set(
          (Array.isArray(favoriteProductIds) ? favoriteProductIds : [])
            .map((id) => String(id || '').trim())
            .filter(Boolean)
        )
      ).slice(0, 200);
      const now = new Date().toISOString();
      const updated: Client = stripUndefinedDeep({
        ...existing,
        favoriteProductIds: cleanIds,
        updatedAt: now,
      });
      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === 'Customer account not found.') {
        throw error;
      }
      handleFirestoreError(error, OperationType.UPDATE, `${CLIENTS_COL}/${clientId}`);
    }
  },

  async updateCustomerDeliveryAddress(
    clientId: string,
    payload: {
      address: string;
      city?: string;
      state?: string;
      pinCode?: string;
      whatsapp?: string;
    }
  ): Promise<Client> {
    const cleanAddress = String(payload.address || '').trim();
    if (!cleanAddress) {
      throw new Error('Please enter your delivery address.');
    }

    let cleanWhatsapp: string | undefined;
    const rawWa = String(payload.whatsapp || '').trim();
    if (rawWa) {
      const waCheck = normalizeAsianPhone(rawWa);
      if (!waCheck.valid) {
        throw new Error('Please enter a valid WhatsApp number.');
      }
      cleanWhatsapp = waCheck.formatted;
    }

    const ref = doc(db, CLIENTS_COL, clientId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Customer account not found.');
      const existing = snap.data() as Client;
      const now = new Date().toISOString();
      const updated: Client = stripUndefinedDeep({
        ...existing,
        address: cleanAddress,
        city: String(payload.city || '').trim(),
        state: String(payload.state || '').trim(),
        pinCode: String(payload.pinCode || '').trim(),
        whatsapp: cleanWhatsapp || existing.whatsapp || existing.mobile,
        updatedAt: now,
      });
      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === 'Customer account not found.') {
        throw error;
      }
      handleFirestoreError(error, OperationType.UPDATE, `${CLIENTS_COL}/${clientId}`);
    }
  },

  async trackCustomerCategoryActivity(
    clientId: string,
    payload: {
      category: string;
      type: 'search' | 'view' | 'order';
      count?: number;
    }
  ): Promise<void> {
    const cleanClientId = String(clientId || '').trim();
    const cleanCategory = String(payload.category || '').trim();
    if (!cleanClientId || !cleanCategory) return;

    const ref = doc(db, CLIENTS_COL, cleanClientId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const existing = snap.data() as Client;
      const now = new Date().toISOString();
      const { categoryInterests, totalCategoryOrders } = applyCategoryInterestDelta(
        existing.categoryInterests,
        cleanCategory,
        payload.type,
        payload.count || 1,
        now
      );
      await updateDoc(ref, {
        categoryInterests,
        totalCategoryOrders,
        updatedAt: now,
      });
    } catch {
      // Non-blocking engagement analytics update
    }
  },

  async createCustomerOrder(payload: {
    clientId?: string;
    clearCart?: boolean;
    customerName: string;
    customerPhone: string;
    customerWhatsapp?: string;
    customerAddress: string;
    customerCity?: string;
    customerState?: string;
    customerPinCode?: string;
    items?: CustomerOrderItem[];
    productId?: string;
    productName: string;
    productCategory?: string;
    productSize?: string;
    productColor?: string;
    quantity: number;
    unitPrice: number;
    paymentMethod: CustomerOrderPaymentMethod;
    upiIdUsed?: string;
    sellerId?: string;
    paymentRecipientType?: 'admin' | 'seller' | 'mixed';
    paymentRecipientName?: string;
    paymentScreenshotDataUrl?: string;
    customerNote?: string;
  }): Promise<{ order: CustomerOrder; client: Client }> {
    const nameCheck = validateEnglishName(payload.customerName, 'Full Name');
    const phoneCheck = normalizeAsianPhone(payload.customerPhone);
    const cleanAddress = String(payload.customerAddress || '').trim();

    if (!nameCheck.valid) throw new Error(nameCheck.error);
    const cleanName = nameCheck.cleaned;
    if (!phoneCheck.valid) {
      throw new Error(
        phoneCheck.error || 'Please enter a valid mobile number.'
      );
    }
    if (!cleanAddress) throw new Error('Please enter your delivery address.');

    const cleanPhone = phoneCheck.formatted;
    const normalizedPhone = phoneCheck.nationalDigits;

    let cleanWhatsapp = cleanPhone;
    const rawWa = String(payload.customerWhatsapp || '').trim();
    if (rawWa) {
      const waCheck = normalizeAsianPhone(rawWa);
      if (!waCheck.valid) {
        throw new Error(
          waCheck.error || 'Please enter a valid WhatsApp number.'
        );
      }
      cleanWhatsapp = waCheck.formatted;
    }

    const normalizedItems: CustomerOrderItem[] =
      Array.isArray(payload.items) && payload.items.length > 0
        ? payload.items.map((it, idx) => {
            const qty = Math.max(1, Math.floor(safeNum(it.quantity, 1)));
            const unitPrice = Math.max(
              0,
              Number(safeNum(it.unitPrice, 0).toFixed(2))
            );
            const originalPrice =
              it.originalPrice !== undefined && it.originalPrice > unitPrice
                ? Math.max(0, Number(safeNum(it.originalPrice, 0).toFixed(2)))
                : undefined;
            return stripUndefinedDeep({
              id: String(it.id || `ord-item-${Date.now()}-${idx}`),
              productId: it.productId ? String(it.productId) : '',
              productName: String(it.productName || '').trim(),
              productCategory: String(it.productCategory || '').trim(),
              productSize: String(it.productSize || '').trim(),
              productColor: String(it.productColor || '').trim(),
              quantity: qty,
              unitPrice,
              originalPrice,
              lineTotal: Number((qty * unitPrice).toFixed(2)),
              imageDataUrl: it.imageDataUrl ? String(it.imageDataUrl) : '',
              sellerId: it.sellerId ? String(it.sellerId) : '',
              sellerName: it.sellerName ? String(it.sellerName).trim() : '',
            });
          })
        : [
            stripUndefinedDeep({
              id: `ord-item-${Date.now()}`,
              productId: payload.productId ? String(payload.productId) : '',
              productName: String(payload.productName || '').trim(),
              productCategory: String(payload.productCategory || '').trim(),
              productSize: String(payload.productSize || '').trim(),
              productColor: String(payload.productColor || '').trim(),
              quantity: Math.max(1, Math.floor(safeNum(payload.quantity, 1))),
              unitPrice: Math.max(
                0,
                Number(safeNum(payload.unitPrice, 0).toFixed(2))
              ),
              lineTotal: Number(
                (
                  Math.max(1, Math.floor(safeNum(payload.quantity, 1))) *
                  Math.max(0, safeNum(payload.unitPrice, 0))
                ).toFixed(2)
              ),
              sellerId: payload.sellerId ? String(payload.sellerId) : '',
            }),
          ];

    if (normalizedItems.length === 0 || !normalizedItems[0].productName) {
      throw new Error('Product information is missing.');
    }

    const paymentMethod: CustomerOrderPaymentMethod =
      payload.paymentMethod === 'UPI' ? 'UPI' : 'COD';
    const totalQty = Math.max(
      1,
      normalizedItems.reduce((s, it) => s + it.quantity, 0)
    );
    const subtotal = Number(
      normalizedItems.reduce((s, it) => s + it.lineTotal, 0).toFixed(2)
    );
    const deliveryCharge =
      paymentMethod === 'COD'
        ? Number((COD_DELIVERY_CHARGE_PER_ITEM * totalQty).toFixed(2))
        : 0;
    const totalAmount = Number((subtotal + deliveryCharge).toFixed(2));
    const summaryProductName = (
      normalizedItems.length === 1
        ? normalizedItems[0].productName
        : `${normalizedItems[0].productName} + ${normalizedItems.length - 1} more`
    ).slice(0, 195);

    const now = new Date().toISOString();
    const orderDate = todayIsoDate();
    const estimatedDeliveryDate = addDaysIsoDate(orderDate, 5);

    let existingClients: Client[] = [];
    let existingOrders: CustomerOrder[] = [];
    let resolvedAdminUpi = String(payload.upiIdUsed || '').trim();
    try {
      const [cliSnap, ordSnap, paySettingsSnap] = await Promise.all([
        getDocs(collection(db, CLIENTS_COL)),
        getDocs(collection(db, ORDERS_COL)),
        paymentMethod === 'UPI' && !resolvedAdminUpi
          ? getDoc(doc(db, PAYMENT_SETTINGS_COL, PAYMENT_SETTINGS_DOC))
          : Promise.resolve(null),
      ]);
      existingClients = cliSnap.docs.map((d) => d.data() as Client);
      existingOrders = ordSnap.docs.map((d) => d.data() as CustomerOrder);
      if (paySettingsSnap && paySettingsSnap.exists()) {
        const ps = paySettingsSnap.data() as Partial<AdminPaymentSettings>;
        if (ps.upiId && ps.upiId.trim()) {
          resolvedAdminUpi = ps.upiId.trim();
        }
      }
      if (paymentMethod === 'UPI' && !resolvedAdminUpi) {
        const setSnap = await getDoc(doc(db, SETTINGS_COL, SETTINGS_DOC));
        if (setSnap.exists()) {
          const s = setSnap.data() as Partial<BusinessSettings>;
          if (s.upiId && s.upiId.trim()) {
            resolvedAdminUpi = s.upiId.trim();
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, ORDERS_COL);
    }

    const matchedClient =
      (payload.clientId
        ? existingClients.find((c) => c.id === payload.clientId)
        : undefined) ||
      existingClients.find(
        (c) =>
          phoneNumbersMatch(c.mobile, cleanPhone) ||
          phoneNumbersMatch(c.whatsapp, cleanPhone)
      );

    const cleanCity = String(payload.customerCity || '').trim();
    const cleanState = String(payload.customerState || '').trim();
    const cleanPin = String(payload.customerPinCode || '').trim();

    let nextCategoryInterests: Record<string, CategoryInterestEntry> = {
      ...(matchedClient?.categoryInterests || {}),
    };
    let nextTotalCategoryOrders = safeNum(matchedClient?.totalCategoryOrders, 0);
    const orderedCategories = new Map<string, number>();
    for (const item of normalizedItems) {
      const cat = String(item.productCategory || payload.productCategory || '').trim();
      if (cat) {
        orderedCategories.set(cat, (orderedCategories.get(cat) || 0) + 1);
      }
    }
    if (orderedCategories.size > 0) {
      for (const [cat, occurrences] of orderedCategories.entries()) {
        const res = applyCategoryInterestDelta(
          nextCategoryInterests,
          cat,
          'order',
          occurrences,
          now
        );
        nextCategoryInterests = res.categoryInterests;
        nextTotalCategoryOrders = res.totalCategoryOrders;
      }
    }

    const client: Client = matchedClient
      ? stripUndefinedDeep({
          ...matchedClient,
          name: matchedClient.name || cleanName,
          mobile: matchedClient.mobile
            ? formatPhoneWithPlus91(matchedClient.mobile)
            : cleanPhone,
          whatsapp: matchedClient.whatsapp
            ? formatPhoneWithPlus91(matchedClient.whatsapp)
            : cleanWhatsapp,
          address: cleanAddress || matchedClient.address,
          city: cleanCity || matchedClient.city,
          state: cleanState || matchedClient.state,
          pinCode: cleanPin || matchedClient.pinCode,
          cart: payload.clearCart
            ? []
            : Array.isArray(matchedClient.cart)
              ? matchedClient.cart
              : [],
          categoryInterests: nextCategoryInterests,
          totalCategoryOrders: nextTotalCategoryOrders,
          updatedAt: now,
        })
      : stripUndefinedDeep({
          id: `cli-${crypto.randomUUID()}`,
          name: cleanName,
          mobile: cleanPhone,
          whatsapp: cleanWhatsapp,
          address: cleanAddress,
          city: cleanCity,
          state: cleanState,
          pinCode: cleanPin,
          cart: [],
          categoryInterests: nextCategoryInterests,
          totalCategoryOrders: nextTotalCategoryOrders,
          createdAt: now,
          updatedAt: now,
        });

    let maxOrdNum = 0;
    for (const o of existingOrders) {
      const m = String(o.orderNumber || '').match(/(\d+)\s*$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxOrdNum) maxOrdNum = n;
      }
    }
    const orderNumber = `ORD-${String(maxOrdNum + 1).padStart(3, '0')}`;

    const order: CustomerOrder = stripUndefinedDeep({
      id: `ord-${crypto.randomUUID()}`,
      orderNumber,
      orderDate,
      estimatedDeliveryDate,
      clientId: client.id,
      customerName: cleanName,
      customerPhone: cleanPhone,
      normalizedPhone,
      customerWhatsapp: cleanWhatsapp,
      customerAddress: cleanAddress,
      customerCity: cleanCity,
      customerState: cleanState,
      customerPinCode: cleanPin,
      items: normalizedItems,
      productId: normalizedItems[0].productId || '',
      productName: summaryProductName,
      productCategory: normalizedItems[0].productCategory || '',
      productSize: normalizedItems[0].productSize || '',
      productColor: normalizedItems[0].productColor || '',
      quantity: totalQty,
      unitPrice:
        normalizedItems.length === 1 ? normalizedItems[0].unitPrice : subtotal,
      subtotal,
      deliveryCharge,
      totalAmount,
      paymentMethod,
      upiIdUsed:
        paymentMethod === 'UPI' ? resolvedAdminUpi || DEFAULT_ADMIN_UPI_ID : '',
      sellerId: String(payload.sellerId || normalizedItems[0].sellerId || ''),
      paymentRecipientType: payload.paymentRecipientType,
      paymentRecipientName: String(payload.paymentRecipientName || '').trim(),
      paymentScreenshotDataUrl:
        paymentMethod === 'UPI' ? String(payload.paymentScreenshotDataUrl || '') : '',
      customerNote: String(payload.customerNote || '').trim(),
      status: 'Pending',
      invoiceId: '',
      invoiceNumber: '',
      confirmedAt: '',
      categoryOrdersTracked: orderedCategories.size > 0,
      createdAt: now,
      updatedAt: now,
    });

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, CLIENTS_COL, client.id), client);
      batch.set(doc(db, ORDERS_COL, order.id), order);
      await batch.commit();
      return { order, client };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${ORDERS_COL}/${order.id}`);
    }
  },

  async confirmCustomerOrder(orderId: string): Promise<{
    order: CustomerOrder;
    invoice: Invoice;
    client: Client;
    payment: PaymentRecord | null;
    products: Product[];
  }> {
    const orderRef = doc(db, ORDERS_COL, orderId);
    let order: CustomerOrder;
    try {
      const snap = await getDoc(orderRef);
      if (!snap.exists()) throw new Error('Order not found.');
      order = snap.data() as CustomerOrder;
    } catch (error) {
      if (error instanceof Error && error.message === 'Order not found.') throw error;
      handleFirestoreError(error, OperationType.GET, `${ORDERS_COL}/${orderId}`);
    }

    let settings: BusinessSettings = mergeBusinessSettings();
    let clients: Client[] = [];
    let products: Product[] = [];
    let invoices: Invoice[] = [];
    try {
      const [settingsSnap, cliSnap, prodSnap, invSnap] = await Promise.all([
        getDoc(doc(db, SETTINGS_COL, SETTINGS_DOC)),
        getDocs(collection(db, CLIENTS_COL)),
        getDocs(collection(db, PRODUCTS_COL)),
        getDocs(collection(db, INVOICES_COL)),
      ]);
      if (settingsSnap.exists()) {
        settings = mergeBusinessSettings(
          settingsSnap.data() as Partial<BusinessSettings>
        );
      }
      clients = cliSnap.docs.map((d) => d.data() as Client);
      products = prodSnap.docs.map((d) => d.data() as Product);
      invoices = invSnap.docs.map((d) => d.data() as Invoice);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, INVOICES_COL);
    }

    const now = new Date().toISOString();

    // Ensure customer account exists & is linked by phone number
    let client =
      clients.find((c) => c.id === order.clientId) ||
      clients.find(
        (c) =>
          phoneNumbersMatch(c.mobile, order.customerPhone) ||
          phoneNumbersMatch(c.whatsapp, order.customerPhone)
      );

    if (!client) {
      client = stripUndefinedDeep({
        id: `cli-${crypto.randomUUID()}`,
        name: order.customerName,
        mobile: order.customerPhone,
        whatsapp: order.customerWhatsapp || order.customerPhone,
        address: order.customerAddress,
        city: order.customerCity || '',
        state: order.customerState || '',
        pinCode: order.customerPinCode || '',
        createdAt: now,
        updatedAt: now,
      });
    }

    // Return existing invoice cleanly if already confirmed
    if (order.status === 'Confirmed' && order.invoiceId) {
      const existingInvoice = invoices.find((i) => i.id === order.invoiceId);
      if (existingInvoice) {
        return {
          order,
          invoice: existingInvoice,
          client,
          payment: null,
          products: sortDescByCreated(products),
        };
      }
    }

    const orderItems: CustomerOrderItem[] =
      Array.isArray(order.items) && order.items.length > 0
        ? order.items
        : [
            {
              id: `item-${Date.now()}`,
              productId: order.productId,
              productName: order.productName,
              productCategory: order.productCategory,
              productSize: order.productSize,
              productColor: order.productColor,
              quantity: Math.max(1, order.quantity),
              unitPrice: order.unitPrice,
              lineTotal: order.totalAmount,
            },
          ];

    const stockDeductionMap = new Map<string, number>();

    const invoiceItems: InvoiceLineItem[] = orderItems.map((it, idx) => {
      const catalogProduct = it.productId
        ? products.find((p) => p.id === it.productId)
        : products.find(
            (p) =>
              p.name.trim().toLowerCase() === it.productName.trim().toLowerCase()
          );
      const qty = Math.max(1, it.quantity);
      const purchasePrice = catalogProduct
        ? Math.max(0, catalogProduct.purchasePrice)
        : 0;
      const lineTotal = Number((qty * it.unitPrice).toFixed(2));
      const lineCost = Number((qty * purchasePrice).toFixed(2));
      if (catalogProduct) {
        stockDeductionMap.set(
          catalogProduct.id,
          (stockDeductionMap.get(catalogProduct.id) || 0) + qty
        );
      }
      return {
        id: `item-${Date.now()}-${idx}`,
        productId: catalogProduct?.id,
        productName: it.productName,
        size: it.productSize || '',
        color: it.productColor || '',
        quantity: qty,
        originalPrice:
          it.originalPrice !== undefined
            ? it.originalPrice
            : catalogProduct?.originalPrice,
        purchasePrice,
        sellingPrice: it.unitPrice,
        lineTotal,
        lineCost,
        lineProfit: Number((lineTotal - lineCost).toFixed(2)),
      };
    });

    const invoiceNumber = generateNextInvoiceNumber(
      invoices,
      settings.invoicePrefix || 'GG-'
    );
    const cityStatePin = [
      order.customerCity,
      order.customerState,
      order.customerPinCode,
    ]
      .filter(Boolean)
      .join(', ');

    const isPaidUpi = order.paymentMethod === 'UPI';
    const deliveryCharge = Math.max(0, safeNum(order.deliveryCharge, 0));
    const orderDate = order.orderDate || order.createdAt.slice(0, 10) || todayIsoDate();
    const deliveryDate =
      order.estimatedDeliveryDate || addDaysIsoDate(orderDate, 5);

    const baseInvoice = normalizeInvoice({
      id: `inv-${crypto.randomUUID()}`,
      invoiceNumber,
      invoiceDate: orderDate,
      deliveryDate,
      orderVia: isPaidUpi ? 'Online UPI' : 'Online COD',
      clientId: client.id,
      customerName: order.customerName,
      customerMobile: order.customerPhone,
      customerWhatsapp: order.customerWhatsapp || order.customerPhone,
      customerAddress: order.customerAddress,
      customerCityStatePin: cityStatePin,
      items: invoiceItems,
      discount: 0,
      gstPercent: 0,
      deliveryCharge,
      paidAmount: isPaidUpi ? order.totalAmount : 0,
      paymentMethod: isPaidUpi ? 'UPI' : 'Cash',
      courierName: '',
      trackingNumber: '',
      trackingUrl: '',
      deliveryStatus: 'Processing',
      notes: `Auto-generated from customer order ${order.orderNumber}${
        order.customerNote ? ` (${order.customerNote})` : ''
      }`,
    });
    const invoice = baseInvoice;

    let payment: PaymentRecord | null = null;
    if (invoice.paidAmount > 0) {
      payment = stripUndefinedDeep({
        id: `pay-${crypto.randomUUID()}`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: client.id,
        customerName: invoice.customerName,
        totalBill: invoice.totalAmount,
        amountPaid: invoice.paidAmount,
        remainingDueAfter: invoice.dueAmount,
        paymentDate: invoice.invoiceDate,
        paymentMethod: 'UPI',
        note: `Online UPI payment for ${order.orderNumber} (${order.upiIdUsed || DEFAULT_ADMIN_UPI_ID})`,
        createdAt: now,
      });
    }

    let nextClient = client;
    if (!order.categoryOrdersTracked) {
      let nextInterests: Record<string, CategoryInterestEntry> = {
        ...(client.categoryInterests || {}),
      };
      let nextTotalOrders = safeNum(client.totalCategoryOrders, 0);
      const trackedCats = new Map<string, number>();
      for (const it of orderItems) {
        const prodMatch = it.productId
          ? products.find((p) => p.id === it.productId)
          : products.find(
              (p) => p.name.trim().toLowerCase() === it.productName.trim().toLowerCase()
            );
        const cat = String(
          it.productCategory || order.productCategory || prodMatch?.category || ''
        ).trim();
        if (cat) {
          trackedCats.set(cat, (trackedCats.get(cat) || 0) + 1);
        }
      }
      for (const [cat, occurrences] of trackedCats.entries()) {
        const res = applyCategoryInterestDelta(
          nextInterests,
          cat,
          'order',
          occurrences,
          now
        );
        nextInterests = res.categoryInterests;
        nextTotalOrders = res.totalCategoryOrders;
      }
      nextClient = stripUndefinedDeep({
        ...client,
        categoryInterests: nextInterests,
        totalCategoryOrders: nextTotalOrders,
        updatedAt: now,
      });
    }

    const updatedOrder: CustomerOrder = stripUndefinedDeep({
      ...order,
      clientId: nextClient.id,
      orderDate,
      estimatedDeliveryDate: deliveryDate,
      status: 'Confirmed',
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      confirmedAt: now,
      categoryOrdersTracked: true,
      updatedAt: now,
    });

    const updatedProducts = products.map((p) => {
      const deduct = stockDeductionMap.get(p.id);
      if (!deduct) return p;
      return {
        ...p,
        stockQty: Math.max(0, safeNum(p.stockQty, 0) - deduct),
        updatedAt: now,
      };
    });

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, CLIENTS_COL, nextClient.id), nextClient);
      batch.set(doc(db, INVOICES_COL, invoice.id), invoice);
      batch.set(orderRef, updatedOrder);
      if (payment) {
        batch.set(doc(db, PAYMENTS_COL, payment.id), payment);
      }
      for (const [prodId] of stockDeductionMap.entries()) {
        const nextProd = updatedProducts.find((p) => p.id === prodId);
        if (nextProd) {
          batch.update(doc(db, PRODUCTS_COL, prodId), {
            stockQty: nextProd.stockQty,
            updatedAt: nextProd.updatedAt,
          });
        }
      }
      await batch.commit();
      return {
        order: updatedOrder,
        invoice,
        client: nextClient,
        payment,
        products: sortDescByCreated(updatedProducts),
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${ORDERS_COL}/${order.id}`);
    }
  },

  async cancelCustomerOrder(orderId: string): Promise<CustomerOrder> {
    const orderRef = doc(db, ORDERS_COL, orderId);
    try {
      const snap = await getDoc(orderRef);
      if (!snap.exists()) throw new Error('Order not found.');
      const existing = snap.data() as CustomerOrder;
      const updated: CustomerOrder = stripUndefinedDeep({
        ...existing,
        status: 'Cancelled',
        updatedAt: new Date().toISOString(),
      });
      await setDoc(orderRef, updated);
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === 'Order not found.') throw error;
      handleFirestoreError(error, OperationType.UPDATE, `${ORDERS_COL}/${orderId}`);
    }
  },

  async deleteCustomerOrder(orderId: string): Promise<{ ok: boolean }> {
    try {
      await deleteDoc(doc(db, ORDERS_COL, orderId));
      return { ok: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${ORDERS_COL}/${orderId}`);
    }
  },

  async lookupCustomerByPhone(phoneQuery: string): Promise<PublicCustomerLookupResult> {
    const cleanDigits = normalizePhoneDigits(phoneQuery);
    if (cleanDigits.length < 6) {
      throw new Error('Please enter a valid phone number (at least 6 digits).');
    }

    let settings: BusinessSettings = mergeBusinessSettings();
    let clients: Client[] = [];
    let orders: CustomerOrder[] = [];
    let invoices: Invoice[] = [];
    try {
      const [settingsSnap, cliSnap, ordSnap, invSnap] = await Promise.all([
        getDoc(doc(db, SETTINGS_COL, SETTINGS_DOC)),
        getDocs(collection(db, CLIENTS_COL)),
        getDocs(collection(db, ORDERS_COL)),
        getDocs(collection(db, INVOICES_COL)),
      ]);
      if (settingsSnap.exists()) {
        settings = mergeBusinessSettings(
          settingsSnap.data() as Partial<BusinessSettings>
        );
      }
      clients = cliSnap.docs.map((d) => d.data() as Client);
      orders = ordSnap.docs.map((d) => d.data() as CustomerOrder);
      invoices = invSnap.docs.map((d) => d.data() as Invoice);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, ORDERS_COL);
    }

    const matchedClient =
      clients.find(
        (c) =>
          phoneNumbersMatch(c.mobile, phoneQuery) ||
          phoneNumbersMatch(c.whatsapp, phoneQuery)
      ) || null;

    const matchedOrders = sortDescByCreated(
      orders.filter(
        (o) =>
          phoneNumbersMatch(o.customerPhone, phoneQuery) ||
          phoneNumbersMatch(o.customerWhatsapp, phoneQuery) ||
          (matchedClient && o.clientId === matchedClient.id)
      )
    );

    const matchedBills = invoices
      .filter(
        (inv) =>
          phoneNumbersMatch(inv.customerMobile, phoneQuery) ||
          phoneNumbersMatch(inv.customerWhatsapp, phoneQuery) ||
          (matchedClient && inv.clientId === matchedClient.id)
      )
      .map((inv) => ({
        invoice: {
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
        },
        settings,
      }))
      .sort((a, b) =>
        String(b.invoice.invoiceDate || b.invoice.createdAt).localeCompare(
          String(a.invoice.invoiceDate || a.invoice.createdAt)
        )
      );

    return {
      client: matchedClient,
      orders: matchedOrders,
      bills: matchedBills,
    };
  },

  async resolveGoogleSellerAccount(payload: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
  }): Promise<{ seller: SellerApplication | null; needsKyc: boolean }> {
    const cleanUid = String(payload.uid || '').trim();
    const cleanEmail = String(payload.email || '').trim().toLowerCase();
    if (!cleanUid) {
      throw new Error('Google authentication account ID is missing.');
    }

    let matched: SellerApplication | undefined;
    try {
      const byUidSnap = await getDocs(
        query(collection(db, SELLER_APPLICATIONS_COL), where('authUid', '==', cleanUid))
      );
      if (!byUidSnap.empty) {
        matched = byUidSnap.docs[0].data() as SellerApplication;
      }

      if (!matched && cleanEmail) {
        const allSnap = await getDocs(collection(db, SELLER_APPLICATIONS_COL));
        const allSellers = allSnap.docs.map((d) => d.data() as SellerApplication);
        matched = allSellers.find(
          (s) => String(s.email || '').trim().toLowerCase() === cleanEmail
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, SELLER_APPLICATIONS_COL);
    }

    if (!matched) {
      return { seller: null, needsKyc: true };
    }

    const needsSync =
      matched.authUid !== cleanUid ||
      (cleanEmail && String(matched.email || '').trim().toLowerCase() !== cleanEmail);

    if (needsSync) {
      const now = new Date().toISOString();
      const updated: SellerApplication = stripUndefinedDeep({
        ...matched,
        authUid: cleanUid,
        email: cleanEmail || matched.email || '',
        updatedAt: now,
      });
      try {
        await setDoc(doc(db, SELLER_APPLICATIONS_COL, matched.id), updated);
        return { seller: sanitizePublicSeller(updated), needsKyc: false };
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `${SELLER_APPLICATIONS_COL}/${matched.id}`
        );
      }
    }

    return { seller: sanitizePublicSeller(matched), needsKyc: false };
  },

  async submitSellerApplication(payload: {
    existingId?: string;
    clientId?: string;
    authUid?: string;
    name: string;
    email?: string;
    otpId?: string;
    dateOfBirth: string;
    fullAddress: string;
    phone: string;
    panNumber: string;
    aadhaarNumber: string;
    gstNumber?: string;
    password?: string;
    sellerPhotoDataUrl: string;
    sellerCoverPhotoDataUrl?: string;
    panDocDataUrl: string;
    aadhaarDocDataUrl: string;
    gstDocDataUrl?: string;
    bankDocDataUrl: string;
    bankAccountDetails?: string;
  }): Promise<SellerApplication> {
    if (!payload.existingId) {
      const geo = await fetchGeoRegion().catch(() => ({
        isBangladesh: detectClientBangladeshFallback(),
      }));
      if (geo.isBangladesh || detectClientBangladeshFallback()) {
        throw new Error(
          'Seller account registration is currently restricted to India only and is not available in Bangladesh.'
        );
      }
    }

    const cleanAuthUid = String(payload.authUid || '').trim();
    const cleanName = String(payload.name || '').trim();
    const cleanEmail = String(payload.email || '').trim().toLowerCase();
    const dobCheck = validateAdultDateOfBirth(payload.dateOfBirth);
    const cleanAddress = String(payload.fullAddress || '').trim();
    const phoneCheck = normalizeIndianPhone(payload.phone);
    // Flexible validation for PAN & Aadhaar: trim cleanly and accept any non-empty value without format/checksum rejection
    const cleanPan = String(payload.panNumber || '').trim().toUpperCase().slice(0, 40);
    const cleanAadhaar = String(payload.aadhaarNumber || '').trim().slice(0, 40);
    const cleanGst = String(payload.gstNumber || '').trim().toUpperCase().slice(0, 30);
    const cleanPassword = String(payload.password || '').trim();

    if (cleanName.length < 2) {
      throw new Error('Please enter your full name.');
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    if (!dobCheck.valid) {
      throw new Error(dobCheck.error);
    }
    if (!cleanAddress) {
      throw new Error('Please enter your full address.');
    }
    if (!phoneCheck.valid) {
      throw new Error(
        phoneCheck.error || 'Please enter a valid 10-digit Indian mobile number.'
      );
    }
    if (!cleanPan) {
      throw new Error('Please enter your PAN number.');
    }
    if (!cleanAadhaar) {
      throw new Error('Please enter your Aadhaar number.');
    }
    if (cleanPassword && cleanPassword.length < 4) {
      throw new Error('Seller login password must be at least 4 characters.');
    }
    if (!payload.sellerPhotoDataUrl) {
      throw new Error('Please upload your Seller Photo.');
    }
    if (!payload.panDocDataUrl) {
      throw new Error('Please upload your PAN Card document photo.');
    }
    if (!payload.aadhaarDocDataUrl) {
      throw new Error('Please upload your Aadhaar Card document photo.');
    }
    if (!payload.bankDocDataUrl) {
      throw new Error(
        'Please upload your Bank Document / Cancelled Cheque / Passbook in the Payment Section.'
      );
    }

    let matchedExisting: SellerApplication | undefined;
    try {
      if (payload.existingId) {
        const exactSnap = await getDoc(
          doc(db, SELLER_APPLICATIONS_COL, payload.existingId)
        );
        if (exactSnap.exists()) {
          matchedExisting = exactSnap.data() as SellerApplication;
        }
      }
      if (!matchedExisting && cleanAuthUid) {
        const authSnap = await getDocs(
          query(
            collection(db, SELLER_APPLICATIONS_COL),
            where('authUid', '==', cleanAuthUid)
          )
        );
        if (!authSnap.empty) {
          matchedExisting = authSnap.docs[0].data() as SellerApplication;
        }
      }
      if (!matchedExisting && payload.clientId) {
        const cliSnap = await getDocs(
          query(
            collection(db, SELLER_APPLICATIONS_COL),
            where('clientId', '==', payload.clientId)
          )
        );
        if (!cliSnap.empty) {
          matchedExisting = cliSnap.docs[0].data() as SellerApplication;
        }
      }
      if (!matchedExisting) {
        const phoneSnap = await getDocs(
          query(
            collection(db, SELLER_APPLICATIONS_COL),
            where('normalizedPhone', '==', phoneCheck.digits10)
          )
        );
        if (!phoneSnap.empty) {
          matchedExisting = phoneSnap.docs[0].data() as SellerApplication;
        }
      }
      if (!matchedExisting && cleanEmail) {
        const emailSnap = await getDocs(
          query(
            collection(db, SELLER_APPLICATIONS_COL),
            where('email', '==', cleanEmail)
          )
        );
        if (!emailSnap.empty) {
          matchedExisting = emailSnap.docs[0].data() as SellerApplication;
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, SELLER_APPLICATIONS_COL);
    }

    if (matchedExisting && matchedExisting.status === 'approved') {
      throw new Error('Your seller account is already approved. Please sign in to Seller Hub.');
    }

    // Email OTP verification is temporarily disabled on Seller Registration; Google Sign-In replaces separate password creation.
    if (!matchedExisting && !cleanAuthUid && !cleanPassword) {
      throw new Error('Please sign in with Google or create a Seller Login Password (minimum 4 characters).');
    }

    const now = new Date().toISOString();
    let passwordSalt = matchedExisting?.passwordSalt || '';
    let passwordHash = matchedExisting?.passwordHash || '';
    let runningPasswordEnc = matchedExisting?.runningPasswordEnc || '';
    let passwordUpdatedAt = matchedExisting?.passwordUpdatedAt || '';

    if (cleanPassword) {
      const hashed = await hashCustomerPassword(cleanPassword);
      passwordSalt = hashed.salt;
      passwordHash = hashed.hash;
      runningPasswordEnc = encryptRunningPassword(cleanPassword, hashed.salt);
      passwordUpdatedAt = now;
    }

    // Automatically generate unique Pending Seller ID incorporating numbers from the applicant's phone number
    const generatedSellerCode =
      matchedExisting?.sellerCode && matchedExisting.sellerCode.trim()
        ? matchedExisting.sellerCode.trim().toUpperCase()
        : `GGS-${phoneCheck.digits10.slice(-6)}${Math.floor(10 + Math.random() * 90)}`;

    const record: SellerApplication = stripUndefinedDeep({
      id: matchedExisting ? matchedExisting.id : `seller-${crypto.randomUUID()}`,
      clientId: payload.clientId || matchedExisting?.clientId || '',
      authUid: cleanAuthUid || matchedExisting?.authUid || '',
      sellerCode: generatedSellerCode,
      name: cleanName,
      email: cleanEmail || matchedExisting?.email || '',
      dateOfBirth: dobCheck.dob,
      fullAddress: cleanAddress,
      phone: phoneCheck.formatted,
      normalizedPhone: phoneCheck.digits10,
      panNumber: cleanPan,
      aadhaarNumber: cleanAadhaar,
      gstNumber: cleanGst,
      sellerPhotoDataUrl: payload.sellerPhotoDataUrl,
      sellerCoverPhotoDataUrl: String(
        payload.sellerCoverPhotoDataUrl ||
          matchedExisting?.sellerCoverPhotoDataUrl ||
          ''
      ),
      followersCount: Math.max(0, Number(matchedExisting?.followersCount) || 0),
      panDocDataUrl: payload.panDocDataUrl,
      aadhaarDocDataUrl: payload.aadhaarDocDataUrl,
      gstDocDataUrl: String(payload.gstDocDataUrl || ''),
      bankDocDataUrl: payload.bankDocDataUrl,
      bankAccountDetails: String(payload.bankAccountDetails || '').trim(),
      passwordSalt,
      passwordHash,
      runningPasswordEnc,
      passwordUpdatedAt,
      accountActivated: false,
      status: 'pending',
      adminRemarks: '',
      reviewedAt: '',
      createdAt: matchedExisting ? matchedExisting.createdAt : now,
      updatedAt: now,
    });

    try {
      await setDoc(doc(db, SELLER_APPLICATIONS_COL, record.id), record);
      return sanitizePublicSeller(record);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `${SELLER_APPLICATIONS_COL}/${record.id}`
      );
    }
  },

  async updateSellerApplicationStatus(
    applicationId: string,
    status: SellerAccountStatus,
    adminRemarks?: string,
    credentials?: {
      sellerCode?: string;
      email?: string;
      password?: string;
    }
  ): Promise<SellerApplication> {
    const ref = doc(db, SELLER_APPLICATIONS_COL, applicationId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Seller application not found.');
      const existing = snap.data() as SellerApplication;
      const now = new Date().toISOString();

      let nextSellerCode =
        credentials?.sellerCode?.trim().toUpperCase() || existing.sellerCode || '';
      const nextEmail =
        credentials?.email !== undefined
          ? credentials.email.trim().toLowerCase()
          : existing.email || '';
      let passwordSalt = existing.passwordSalt || '';
      let passwordHash = existing.passwordHash || '';
      let runningPasswordEnc = existing.runningPasswordEnc || '';
      let passwordUpdatedAt = existing.passwordUpdatedAt || '';

      if (status === 'approved') {
        if (!nextSellerCode) {
          const digitsSuffix =
            (existing.normalizedPhone || normalizePhoneDigits(existing.phone)).slice(
              -6
            ) || String(Math.floor(100000 + Math.random() * 900000));
          const randSuffix = Math.floor(10 + Math.random() * 90);
          nextSellerCode = `GGS-${digitsSuffix}${randSuffix}`;
        }

        const requestedPassword = String(credentials?.password || '').trim();
        if (requestedPassword) {
          if (requestedPassword.length < 4) {
            throw new Error('Seller password must be at least 4 characters.');
          }
          const hashed = await hashCustomerPassword(requestedPassword);
          passwordSalt = hashed.salt;
          passwordHash = hashed.hash;
          runningPasswordEnc = encryptRunningPassword(
            requestedPassword,
            hashed.salt
          );
          passwordUpdatedAt = now;
        } else if (!passwordHash) {
          const fallbackDigits = (
            existing.normalizedPhone ||
            normalizePhoneDigits(existing.phone) ||
            '7890'
          ).slice(-4);
          const autoPassword = `GG${fallbackDigits}`;
          const hashed = await hashCustomerPassword(autoPassword);
          passwordSalt = hashed.salt;
          passwordHash = hashed.hash;
          runningPasswordEnc = encryptRunningPassword(autoPassword, hashed.salt);
          passwordUpdatedAt = now;
        }
      }

      const updated: SellerApplication = stripUndefinedDeep({
        ...existing,
        sellerCode: nextSellerCode,
        email: nextEmail,
        passwordSalt,
        passwordHash,
        runningPasswordEnc,
        passwordUpdatedAt,
        accountActivated: status === 'approved',
        status,
        adminRemarks:
          adminRemarks !== undefined
            ? adminRemarks.trim()
            : existing.adminRemarks || '',
        reviewedAt: now,
        updatedAt: now,
      });
      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === 'Seller application not found.' ||
          error.message === 'Seller password must be at least 4 characters.')
      ) {
        throw error;
      }
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `${SELLER_APPLICATIONS_COL}/${applicationId}`
      );
    }
  },

  async setSellerPassword(
    applicationId: string,
    newPassword: string
  ): Promise<SellerApplication> {
    const cleanPassword = String(newPassword || '').trim();
    if (cleanPassword.length < 4) {
      throw new Error('Password must be at least 4 characters long.');
    }
    const ref = doc(db, SELLER_APPLICATIONS_COL, applicationId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Seller application not found.');
      const existing = snap.data() as SellerApplication;
      const now = new Date().toISOString();
      const { salt, hash } = await hashCustomerPassword(cleanPassword);
      const runningPasswordEnc = encryptRunningPassword(cleanPassword, salt);
      const updated: SellerApplication = stripUndefinedDeep({
        ...existing,
        passwordSalt: salt,
        passwordHash: hash,
        runningPasswordEnc,
        passwordUpdatedAt: now,
        updatedAt: now,
      });
      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === 'Seller application not found.') {
        throw error;
      }
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `${SELLER_APPLICATIONS_COL}/${applicationId}`
      );
    }
  },

  async loginSellerAccount(
    identifier: string,
    password: string
  ): Promise<{ seller: SellerApplication }> {
    const cleanIdentifier = String(identifier || '').trim();
    const cleanPassword = String(password || '').trim();
    if (!cleanIdentifier) {
      throw new Error('Please enter your Seller ID, Email, or Phone number.');
    }
    if (!cleanPassword) {
      throw new Error('Please enter your Seller password.');
    }

    const lowerIdent = cleanIdentifier.toLowerCase();
    const upperIdent = cleanIdentifier.toUpperCase();
    const digits10 = normalizePhoneDigits(cleanIdentifier);

    let matched: SellerApplication | undefined;
    try {
      const queriesToTry = [
        getDocs(
          query(
            collection(db, SELLER_APPLICATIONS_COL),
            where('sellerCode', '==', upperIdent)
          )
        ),
      ];
      if (lowerIdent.includes('@')) {
        queriesToTry.push(
          getDocs(
            query(
              collection(db, SELLER_APPLICATIONS_COL),
              where('email', '==', lowerIdent)
            )
          )
        );
      }
      if (digits10.length >= 10) {
        queriesToTry.push(
          getDocs(
            query(
              collection(db, SELLER_APPLICATIONS_COL),
              where('normalizedPhone', '==', digits10)
            )
          )
        );
      }
      const snaps = await Promise.all(queriesToTry);
      for (const s of snaps) {
        if (!s.empty) {
          matched = s.docs[0].data() as SellerApplication;
          break;
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, SELLER_APPLICATIONS_COL);
    }

    if (!matched) {
      throw new Error('No seller account found matching that Seller ID, Email, or Phone.');
    }

    const valid = await verifyCustomerPassword(
      cleanPassword,
      matched.passwordSalt,
      matched.passwordHash
    );
    if (!valid) {
      throw new Error('Incorrect password. Please try again or contact Admin.');
    }

    return { seller: sanitizePublicSeller(matched) };
  },

  async deleteSellerApplication(applicationId: string): Promise<{ ok: boolean }> {
    try {
      await deleteDoc(doc(db, SELLER_APPLICATIONS_COL, applicationId));
      return { ok: true };
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `${SELLER_APPLICATIONS_COL}/${applicationId}`
      );
    }
  },

  async updateProductApproval(
    productId: string,
    sellerApprovalStatus: SellerApprovalStatus
  ): Promise<Product> {
    const ref = doc(db, PRODUCTS_COL, productId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Product not found.');
      const existing = snap.data() as Product;
      const updated: Product = stripUndefinedDeep({
        ...existing,
        sellerApprovalStatus,
        updatedAt: new Date().toISOString(),
      });
      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === 'Product not found.') throw error;
      handleFirestoreError(error, OperationType.UPDATE, `${PRODUCTS_COL}/${productId}`);
    }
  },

  async submitHighlightRequest(payload: {
    sellerId: string;
    productId: string;
    requestType: 'plan' | 'offer_seat';
    planOrSeatId: string;
    transactionRef?: string;
    paymentScreenshotDataUrl?: string;
  }): Promise<HighlightRequest> {
    const sellerRef = doc(db, SELLER_APPLICATIONS_COL, payload.sellerId);
    const productRef = doc(db, PRODUCTS_COL, payload.productId);
    const settingsRef = doc(db, SETTINGS_COL, SETTINGS_DOC);
    const paymentSettingsRef = doc(db, PAYMENT_SETTINGS_COL, PAYMENT_SETTINGS_DOC);

    let seller: SellerApplication;
    let product: Product;
    let settings: BusinessSettings;
    let livePaymentUpi = '';

    try {
      const [sellerSnap, prodSnap, settingsSnap, paySnap] = await Promise.all([
        getDoc(sellerRef),
        getDoc(productRef),
        getDoc(settingsRef),
        getDoc(paymentSettingsRef),
      ]);
      if (!sellerSnap.exists()) throw new Error('Seller account not found.');
      seller = sellerSnap.data() as SellerApplication;
      if (seller.status !== 'approved' || seller.accountActivated === false) {
        throw new Error('Only approved sellers can request paid product highlights.');
      }
      if (!prodSnap.exists()) throw new Error('Selected product not found.');
      product = prodSnap.data() as Product;
      if (product.sellerId !== seller.id) {
        throw new Error('You can only highlight your own products.');
      }
      settings = settingsSnap.exists()
        ? mergeBusinessSettings(settingsSnap.data() as Partial<BusinessSettings>)
        : mergeBusinessSettings();
      if (paySnap.exists()) {
        livePaymentUpi = String(
          (paySnap.data() as Partial<AdminPaymentSettings>).upiId || ''
        ).trim();
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Seller account') ||
          error.message.includes('Only approved sellers') ||
          error.message.includes('Selected product') ||
          error.message.includes('own products'))
      ) {
        throw error;
      }
      handleFirestoreError(error, OperationType.GET, HIGHLIGHT_REQUESTS_COL);
    }

    const config = settings.highlightConfig || DEFAULT_HIGHLIGHT_CONFIG;
    let planTitle = '';
    let durationDays = 7;
    let amount = 0;

    if (payload.requestType === 'offer_seat') {
      const seat = (config.offerSeats || []).find(
        (s) => s.id === payload.planOrSeatId && s.enabled
      );
      if (!seat) {
        throw new Error('This Highlight Offer Seat is no longer active.');
      }
      try {
        const seatSnap = await getDocs(
          query(
            collection(db, HIGHLIGHT_REQUESTS_COL),
            where('planOrSeatId', '==', seat.id)
          )
        );
        const usedCount = seatSnap.docs
          .map((d) => d.data() as HighlightRequest)
          .filter(
            (r) =>
              r.requestType === 'offer_seat' &&
              (r.status === 'pending_approval' ||
                (r.status === 'approved' &&
                  (!r.expiresAt || new Date(r.expiresAt).getTime() > Date.now())))
          ).length;
        if (usedCount >= Math.max(1, seat.totalSeats)) {
          throw new Error(
            'Sorry, all seats for this Highlight Offer have already been claimed!'
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('all seats')) {
          throw error;
        }
        handleFirestoreError(error, OperationType.LIST, HIGHLIGHT_REQUESTS_COL);
      }
      planTitle = seat.title;
      durationDays = Math.max(1, Number(seat.durationDays) || 7);
      amount = Math.max(0, Number(seat.price) || 0);
    } else {
      const plan = (config.plans || []).find(
        (p) => p.id === payload.planOrSeatId && p.enabled
      );
      if (!plan) {
        throw new Error('This Highlight Plan is no longer available.');
      }
      planTitle = plan.label;
      durationDays = Math.max(1, Number(plan.durationDays) || 7);
      amount = Math.max(0, Number(plan.price) || 0);
    }

    const cleanTxRef = String(payload.transactionRef || '').trim();
    const cleanShot = String(payload.paymentScreenshotDataUrl || '');
    if (amount > 0 && !cleanTxRef && !cleanShot) {
      throw new Error(
        'Please upload your UPI payment screenshot or enter the Transaction / UTR ID.'
      );
    }

    const now = new Date().toISOString();
    const gallery =
      Array.isArray(product.imageDataUrls) && product.imageDataUrls.length > 0
        ? product.imageDataUrls
        : product.imageDataUrl
          ? [product.imageDataUrl]
          : [];

    const request: HighlightRequest = stripUndefinedDeep({
      id: `hlr-${crypto.randomUUID()}`,
      productId: product.id,
      productName: product.name,
      productCategory: product.category || '',
      productImageDataUrl: gallery[0] || '',
      sellerId: seller.id,
      sellerCode: seller.sellerCode || '',
      sellerName: seller.name,
      sellerPhone: seller.phone,
      requestType: payload.requestType,
      planOrSeatId: payload.planOrSeatId,
      planTitle,
      durationDays,
      amount,
      upiIdUsed: livePaymentUpi || config.upiId || HIGHLIGHT_UPI_ID,
      transactionRef: cleanTxRef,
      paymentScreenshotDataUrl: cleanShot,
      placementRule: config.placementRule || 'top_featured',
      status: 'pending_approval',
      adminRemarks: '',
      approvedAt: '',
      expiresAt: '',
      createdAt: now,
      updatedAt: now,
    });

    try {
      await setDoc(doc(db, HIGHLIGHT_REQUESTS_COL, request.id), request);
      return request;
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `${HIGHLIGHT_REQUESTS_COL}/${request.id}`
      );
    }
  },

  async updateHighlightRequestStatus(
    requestId: string,
    status: HighlightRequestStatus,
    adminRemarks?: string
  ): Promise<{ request: HighlightRequest; product: Product | null }> {
    const reqRef = doc(db, HIGHLIGHT_REQUESTS_COL, requestId);
    try {
      const snap = await getDoc(reqRef);
      if (!snap.exists()) throw new Error('Highlight request not found.');
      const existing = snap.data() as HighlightRequest;
      const now = new Date().toISOString();

      let approvedAt = existing.approvedAt || '';
      let expiresAt = existing.expiresAt || '';
      if (status === 'approved') {
        approvedAt = now;
        const ms = Math.max(1, existing.durationDays || 7) * 86_400_000;
        expiresAt = new Date(Date.now() + ms).toISOString();
      } else if (status === 'rejected') {
        expiresAt = '';
      }

      const settingsSnap = await getDoc(doc(db, SETTINGS_COL, SETTINGS_DOC));
      const activeConfig = settingsSnap.exists()
        ? mergeBusinessSettings(settingsSnap.data() as Partial<BusinessSettings>)
            .highlightConfig || DEFAULT_HIGHLIGHT_CONFIG
        : DEFAULT_HIGHLIGHT_CONFIG;

      const updatedRequest: HighlightRequest = stripUndefinedDeep({
        ...existing,
        status,
        adminRemarks:
          adminRemarks !== undefined
            ? adminRemarks.trim()
            : existing.adminRemarks || '',
        approvedAt,
        expiresAt,
        placementRule: activeConfig.placementRule || existing.placementRule || 'top_featured',
        updatedAt: now,
      });

      const prodRef = doc(db, PRODUCTS_COL, existing.productId);
      const prodSnap = await getDoc(prodRef);
      let updatedProduct: Product | null = null;

      const batch = writeBatch(db);
      batch.set(reqRef, updatedRequest);

      if (prodSnap.exists()) {
        const prod = prodSnap.data() as Product;
        if (status === 'approved') {
          updatedProduct = stripUndefinedDeep({
            ...prod,
            highlighted: true,
            highlightExpiresAt: expiresAt,
            highlightPlacement:
              activeConfig.placementRule || prod.highlightPlacement || 'top_featured',
            highlightPlanTitle: existing.planTitle,
            updatedAt: now,
          });
          batch.set(prodRef, updatedProduct);
        } else if (status === 'rejected') {
          updatedProduct = stripUndefinedDeep({
            ...prod,
            highlighted: false,
            highlightExpiresAt: '',
            highlightPlanTitle: '',
            updatedAt: now,
          });
          batch.set(prodRef, updatedProduct);
        }
      }

      await batch.commit();
      return { request: updatedRequest, product: updatedProduct };
    } catch (error) {
      if (error instanceof Error && error.message === 'Highlight request not found.') {
        throw error;
      }
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `${HIGHLIGHT_REQUESTS_COL}/${requestId}`
      );
    }
  },

  async deleteHighlightRequest(requestId: string): Promise<{ ok: boolean }> {
    try {
      await deleteDoc(doc(db, HIGHLIGHT_REQUESTS_COL, requestId));
      return { ok: true };
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `${HIGHLIGHT_REQUESTS_COL}/${requestId}`
      );
    }
  },

  subscribeSellerHighlightRequests(
    sellerId: string,
    onList: (requests: HighlightRequest[]) => void,
    onError: (err: Error) => void
  ): () => void {
    return onSnapshot(
      query(
        collection(db, HIGHLIGHT_REQUESTS_COL),
        where('sellerId', '==', sellerId)
      ),
      (snap) => {
        onList(
          sortDescByCreated(snap.docs.map((d) => d.data() as HighlightRequest))
        );
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, HIGHLIGHT_REQUESTS_COL);
        } catch (wrapped) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );
  },

  async fetchCustomerStorefront(): Promise<{
    settings: BusinessSettings;
    paymentSettings: AdminPaymentSettings;
    products: Product[];
    approvedSellerIds: string[];
    sellerPaymentProfiles: Record<string, SellerPublicPaymentProfile>;
    highlightSeatUsage: Record<string, number>;
    sellerFollows: SellerFollowRecord[];
    productReviews: ProductReview[];
  }> {
    let settings: BusinessSettings = mergeBusinessSettings();
    let paymentSettings: AdminPaymentSettings = { ...DEFAULT_ADMIN_PAYMENT_SETTINGS };
    try {
      const settingsSnap = await getDoc(doc(db, SETTINGS_COL, SETTINGS_DOC));
      if (settingsSnap.exists()) {
        settings = mergeBusinessSettings(
          settingsSnap.data() as Partial<BusinessSettings>
        );
      }
      try {
        const paymentSnap = await getDoc(
          doc(db, PAYMENT_SETTINGS_COL, PAYMENT_SETTINGS_DOC)
        );
        paymentSettings = mergeAdminPaymentSettings(
          paymentSnap.exists()
            ? (paymentSnap.data() as Partial<AdminPaymentSettings>)
            : undefined,
          settings
        );
      } catch (payErr) {
        if (!isPermissionDeniedError(payErr)) {
          throw payErr;
        }
        paymentSettings = mergeAdminPaymentSettings(undefined, settings);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${SETTINGS_COL}/${SETTINGS_DOC}`);
    }

    let products: Product[] = [];
    let approvedSellerIds: string[] = [];
    const sellerPaymentProfiles: Record<string, SellerPublicPaymentProfile> = {};
    const highlightSeatUsage: Record<string, number> = {};
    let sellerFollows: SellerFollowRecord[] = [];
    let productReviews: ProductReview[] = [];
    try {
      const [prodSnap, sellerSnap, seatsSnap, followsSnap, reviewsSnap] =
        await Promise.all([
          getDocs(collection(db, PRODUCTS_COL)),
          getDocs(
            query(
              collection(db, SELLER_APPLICATIONS_COL),
              where('status', '==', 'approved')
            )
          ),
          getDocs(
            query(
              collection(db, HIGHLIGHT_REQUESTS_COL),
              where('requestType', '==', 'offer_seat')
            )
          ),
          getDocs(collection(db, SELLER_FOLLOWS_COL)).catch(() => null),
          getDocs(collection(db, PRODUCT_REVIEWS_COL)).catch(() => null),
        ]);
      products = sortDescByCreated(prodSnap.docs.map((d) => d.data() as Product));
      if (followsSnap) {
        sellerFollows = sortDescByCreated(
          followsSnap.docs.map((d) => d.data() as SellerFollowRecord)
        );
      }
      if (reviewsSnap) {
        productReviews = sortDescByCreated(
          reviewsSnap.docs.map((d) => d.data() as ProductReview)
        );
      }
      const approvedSellers = sellerSnap.docs
        .map((d) => d.data() as SellerApplication)
        .filter((a) => a.status === 'approved' && a.accountActivated !== false);
      approvedSellerIds = approvedSellers.map((a) => a.id);
      for (const app of approvedSellers) {
        sellerPaymentProfiles[app.id] = extractPublicSellerPaymentProfile(app);
      }

      for (const d of seatsSnap.docs) {
        const req = d.data() as HighlightRequest;
        if (
          req.planOrSeatId &&
          (req.status === 'pending_approval' ||
            (req.status === 'approved' &&
              isProductHighlightActive({
                highlighted: true,
                highlightExpiresAt: req.expiresAt,
              })))
        ) {
          highlightSeatUsage[req.planOrSeatId] =
            (highlightSeatUsage[req.planOrSeatId] || 0) + 1;
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, PRODUCTS_COL);
    }

    return {
      settings: sanitizePublicSettings(settings),
      paymentSettings,
      products,
      approvedSellerIds,
      sellerPaymentProfiles,
      highlightSeatUsage,
      sellerFollows,
      productReviews,
    };
  },

  subscribeCustomerStorefront(
    onSettings: (settings: BusinessSettings) => void,
    onPaymentSettings: (paymentSettings: AdminPaymentSettings) => void,
    onProducts: (products: Product[]) => void,
    onApprovedSellerIds: (sellerIds: string[]) => void,
    onSellerPaymentProfiles: (
      profiles: Record<string, SellerPublicPaymentProfile>
    ) => void,
    onHighlightSeatUsage: (usage: Record<string, number>) => void,
    onError: (err: Error) => void,
    onSellerFollows?: (follows: SellerFollowRecord[]) => void,
    onProductReviews?: (reviews: ProductReview[]) => void
  ): () => void {
    const reportError = (op: OperationType, path: string, err: unknown) => {
      try {
        handleFirestoreError(err, op, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    };

    const unsubSettings = onSnapshot(
      doc(db, SETTINGS_COL, SETTINGS_DOC),
      (snap) => {
        if (snap.exists()) {
          const next = mergeBusinessSettings(
            snap.data() as Partial<BusinessSettings>
          );
          onSettings(sanitizePublicSettings(next));
          onPaymentSettings(mergeAdminPaymentSettings(undefined, next));
        }
      },
      (err) => reportError(OperationType.GET, `${SETTINGS_COL}/${SETTINGS_DOC}`, err)
    );

    const unsubPaymentSettings = onSnapshot(
      doc(db, PAYMENT_SETTINGS_COL, PAYMENT_SETTINGS_DOC),
      (snap) => {
        if (snap.exists()) {
          onPaymentSettings(
            mergeAdminPaymentSettings(snap.data() as Partial<AdminPaymentSettings>)
          );
        }
      },
      (err) => {
        if (!isPermissionDeniedError(err)) {
          reportError(
            OperationType.GET,
            `${PAYMENT_SETTINGS_COL}/${PAYMENT_SETTINGS_DOC}`,
            err
          );
        }
      }
    );

    const unsubProducts = onSnapshot(
      collection(db, PRODUCTS_COL),
      (snap) => {
        onProducts(sortDescByCreated(snap.docs.map((d) => d.data() as Product)));
      },
      (err) => reportError(OperationType.LIST, PRODUCTS_COL, err)
    );

    const unsubSellers = onSnapshot(
      query(
        collection(db, SELLER_APPLICATIONS_COL),
        where('status', '==', 'approved')
      ),
      (snap) => {
        const approvedSellers = snap.docs
          .map((d) => d.data() as SellerApplication)
          .filter((a) => a.status === 'approved' && a.accountActivated !== false);
        onApprovedSellerIds(approvedSellers.map((a) => a.id));
        const profiles: Record<string, SellerPublicPaymentProfile> = {};
        for (const app of approvedSellers) {
          profiles[app.id] = extractPublicSellerPaymentProfile(app);
        }
        onSellerPaymentProfiles(profiles);
      },
      (err) => reportError(OperationType.LIST, SELLER_APPLICATIONS_COL, err)
    );

    const unsubSeatUsage = onSnapshot(
      query(
        collection(db, HIGHLIGHT_REQUESTS_COL),
        where('requestType', '==', 'offer_seat')
      ),
      (snap) => {
        const usage: Record<string, number> = {};
        for (const d of snap.docs) {
          const req = d.data() as HighlightRequest;
          if (
            req.planOrSeatId &&
            (req.status === 'pending_approval' ||
              (req.status === 'approved' &&
                isProductHighlightActive({
                  highlighted: true,
                  highlightExpiresAt: req.expiresAt,
                })))
          ) {
            usage[req.planOrSeatId] = (usage[req.planOrSeatId] || 0) + 1;
          }
        }
        onHighlightSeatUsage(usage);
      },
      (err) => reportError(OperationType.LIST, HIGHLIGHT_REQUESTS_COL, err)
    );

    const unsubFollows = onSellerFollows
      ? onSnapshot(
          collection(db, SELLER_FOLLOWS_COL),
          (snap) => {
            onSellerFollows(
              sortDescByCreated(
                snap.docs.map((d) => d.data() as SellerFollowRecord)
              )
            );
          },
          (err) => {
            if (!isPermissionDeniedError(err)) {
              reportError(OperationType.LIST, SELLER_FOLLOWS_COL, err);
            }
          }
        )
      : () => undefined;

    const unsubReviews = onProductReviews
      ? onSnapshot(
          collection(db, PRODUCT_REVIEWS_COL),
          (snap) => {
            onProductReviews(
              sortDescByCreated(snap.docs.map((d) => d.data() as ProductReview))
            );
          },
          (err) => {
            if (!isPermissionDeniedError(err)) {
              reportError(OperationType.LIST, PRODUCT_REVIEWS_COL, err);
            }
          }
        )
      : () => undefined;

    return () => {
      unsubSettings();
      unsubPaymentSettings();
      unsubProducts();
      unsubSellers();
      unsubSeatUsage();
      unsubFollows();
      unsubReviews();
    };
  },

  subscribeCustomerAccount(
    clientId: string,
    onClient: (client: Client | null) => void,
    onOrders: (orders: CustomerOrder[]) => void,
    onInvoices: (invoices: Invoice[]) => void,
    onError: (err: Error) => void
  ): () => void {
    const reportError = (op: OperationType, path: string, err: unknown) => {
      try {
        handleFirestoreError(err, op, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    };

    let ordersByClient: CustomerOrder[] = [];
    let ordersByPhone: CustomerOrder[] = [];
    let unsubOrdersPhone: (() => void) | undefined;
    let activePhoneDigits = '';

    const emitOrders = () => {
      const merged = new Map<string, CustomerOrder>();
      for (const o of [...ordersByClient, ...ordersByPhone]) {
        merged.set(o.id, o);
      }
      onOrders(sortDescByCreated(Array.from(merged.values())));
    };

    const unsubClient = onSnapshot(
      doc(db, CLIENTS_COL, clientId),
      (snap) => {
        if (!snap.exists()) {
          onClient(null);
          return;
        }
        const safeClient = sanitizePublicClient(snap.data() as Client);
        onClient(safeClient);

        const nextDigits = normalizePhoneDigits(safeClient.mobile);
        if (nextDigits && nextDigits !== activePhoneDigits) {
          activePhoneDigits = nextDigits;
          if (unsubOrdersPhone) unsubOrdersPhone();
          unsubOrdersPhone = onSnapshot(
            query(
              collection(db, ORDERS_COL),
              where('normalizedPhone', '==', nextDigits)
            ),
            (ordSnap) => {
              ordersByPhone = ordSnap.docs.map((d) => d.data() as CustomerOrder);
              emitOrders();
            },
            (err) => reportError(OperationType.LIST, ORDERS_COL, err)
          );
        }
      },
      (err) => reportError(OperationType.GET, `${CLIENTS_COL}/${clientId}`, err)
    );

    const unsubOrdersClient = onSnapshot(
      query(collection(db, ORDERS_COL), where('clientId', '==', clientId)),
      (snap) => {
        ordersByClient = snap.docs.map((d) => d.data() as CustomerOrder);
        emitOrders();
      },
      (err) => reportError(OperationType.LIST, ORDERS_COL, err)
    );

    const unsubInvoices = onSnapshot(
      query(collection(db, INVOICES_COL), where('clientId', '==', clientId)),
      (snap) => {
        const list = sortDescByCreated(
          snap.docs.map((d) => sanitizePublicInvoice(d.data() as Invoice))
        );
        onInvoices(list);
      },
      (err) => reportError(OperationType.LIST, INVOICES_COL, err)
    );

    return () => {
      unsubClient();
      unsubOrdersClient();
      if (unsubOrdersPhone) unsubOrdersPhone();
      unsubInvoices();
    };
  },

  subscribeSingleSellerApplication(
    sellerId: string,
    onSeller: (seller: SellerApplication | null) => void,
    onError: (err: Error) => void
  ): () => void {
    return onSnapshot(
      doc(db, SELLER_APPLICATIONS_COL, sellerId),
      (snap) => {
        if (!snap.exists()) {
          onSeller(null);
          return;
        }
        onSeller(sanitizePublicSeller(snap.data() as SellerApplication));
      },
      (err) => {
        try {
          handleFirestoreError(
            err,
            OperationType.GET,
            `${SELLER_APPLICATIONS_COL}/${sellerId}`
          );
        } catch (wrapped) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );
  },

  async fetchSupportThreadForClient(
    clientId: string,
    phone?: string
  ): Promise<SupportChatThread | null> {
    try {
      const byClientSnap = await getDocs(
        query(collection(db, SUPPORT_CHATS_COL), where('clientId', '==', clientId))
      );
      if (!byClientSnap.empty) {
        const threads = sortDescByUpdated(
          byClientSnap.docs.map((d) => d.data() as SupportChatThread)
        );
        return threads[0];
      }

      const digits10 = normalizePhoneDigits(phone);
      if (digits10.length >= 10) {
        const byPhoneSnap = await getDocs(
          query(
            collection(db, SUPPORT_CHATS_COL),
            where('normalizedPhone', '==', digits10)
          )
        );
        const match = sortDescByUpdated(
          byPhoneSnap.docs.map((d) => d.data() as SupportChatThread)
        ).find((t) => !t.clientId || t.clientId === clientId);
        if (match) return match;
      }

      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, SUPPORT_CHATS_COL);
    }
  },

  async resolveGuestSupportThread(
    name: string,
    phone: string
  ): Promise<SupportChatThread | null> {
    const nameCheck = validateEnglishName(name, 'Your Name');
    if (!nameCheck.valid) {
      throw new Error(nameCheck.error);
    }
    const cleanName = nameCheck.cleaned;
    const phoneCheck = normalizeIndianPhone(phone);
    if (!phoneCheck.valid) {
      throw new Error(
        phoneCheck.error || 'Please enter a valid 10-digit Indian mobile number.'
      );
    }

    try {
      const snap = await getDocs(
        query(
          collection(db, SUPPORT_CHATS_COL),
          where('normalizedPhone', '==', phoneCheck.digits10)
        )
      );
      if (snap.empty) return null;

      const threads = sortDescByUpdated(
        snap.docs.map((d) => d.data() as SupportChatThread)
      );
      const exactMatch = threads.find(
        (t) => normalizeSupportName(t.customerName) === normalizeSupportName(cleanName)
      );
      if (exactMatch) {
        return exactMatch;
      }

      throw new Error(
        'A support chat for this mobile number exists under a different name. Please enter the exact Name & Phone Number used previously, or Sign In.'
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('different name') ||
          error.message.includes('valid 10-digit') ||
          error.message.includes('English'))
      ) {
        throw error;
      }
      handleFirestoreError(error, OperationType.LIST, SUPPORT_CHATS_COL);
    }
  },

  subscribeSingleSupportThread(
    chatId: string,
    onThread: (thread: SupportChatThread | null) => void,
    onError: (err: Error) => void
  ): () => void {
    return onSnapshot(
      doc(db, SUPPORT_CHATS_COL, chatId),
      (snap) => {
        if (!snap.exists()) {
          onThread(null);
          return;
        }
        onThread(snap.data() as SupportChatThread);
      },
      (err) => {
        try {
          handleFirestoreError(
            err,
            OperationType.GET,
            `${SUPPORT_CHATS_COL}/${chatId}`
          );
        } catch (wrapped) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );
  },

  async sendSupportMessage(payload: {
    chatId?: string;
    clientId?: string;
    customerName: string;
    customerPhone: string;
    senderRole: SupportSenderRole;
    senderName: string;
    text: string;
  }): Promise<SupportChatThread> {
    const cleanText = String(payload.text || '').trim();
    if (!cleanText) {
      throw new Error('Please type a message before sending.');
    }

    let cleanName = String(payload.customerName || '').trim() || 'Customer';
    if (payload.senderRole === 'customer') {
      const nameCheck = validateEnglishName(payload.customerName, 'Customer Name');
      if (!nameCheck.valid) {
        throw new Error(nameCheck.error);
      }
      cleanName = nameCheck.cleaned;
    }
    const phoneCheck = normalizeIndianPhone(payload.customerPhone);
    const formattedPhone = phoneCheck.valid
      ? phoneCheck.formatted
      : String(payload.customerPhone || '').trim();
    const digits10 = phoneCheck.valid
      ? phoneCheck.digits10
      : normalizePhoneDigits(payload.customerPhone);

    if (!payload.chatId && payload.senderRole === 'customer' && !phoneCheck.valid) {
      throw new Error(
        phoneCheck.error || 'Please enter a valid 10-digit mobile number to start chat.'
      );
    }

    let matched: SupportChatThread | undefined;
    try {
      if (payload.chatId) {
        const exactSnap = await getDoc(doc(db, SUPPORT_CHATS_COL, payload.chatId));
        if (exactSnap.exists()) {
          matched = exactSnap.data() as SupportChatThread;
        }
      }

      if (!matched && payload.clientId) {
        const cliSnap = await getDocs(
          query(
            collection(db, SUPPORT_CHATS_COL),
            where('clientId', '==', payload.clientId)
          )
        );
        if (!cliSnap.empty) {
          matched = sortDescByUpdated(
            cliSnap.docs.map((d) => d.data() as SupportChatThread)
          )[0];
        }
      }

      if (!matched && digits10.length >= 10) {
        const phoneSnap = await getDocs(
          query(
            collection(db, SUPPORT_CHATS_COL),
            where('normalizedPhone', '==', digits10)
          )
        );
        if (!phoneSnap.empty) {
          const threads = sortDescByUpdated(
            phoneSnap.docs.map((d) => d.data() as SupportChatThread)
          );
          if (payload.senderRole === 'customer' && !payload.clientId) {
            const nameMatch = threads.find(
              (t) =>
                normalizeSupportName(t.customerName) ===
                normalizeSupportName(cleanName)
            );
            if (!nameMatch) {
              throw new Error(
                'A support chat for this mobile number exists under a different name. Please enter the exact Name & Phone Number used previously, or Sign In.'
              );
            }
            matched = nameMatch;
          } else {
            matched = threads[0];
          }
        }
      }

      if (matched && payload.senderRole === 'customer') {
        if (payload.clientId) {
          if (matched.clientId && matched.clientId !== payload.clientId) {
            throw new Error('You can only send messages in your own support chat.');
          }
        } else if (
          normalizeSupportName(matched.customerName) !==
          normalizeSupportName(cleanName)
        ) {
          throw new Error(
            'Support chat identity mismatch. Please re-enter your exact Name & Phone Number.'
          );
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('different name') ||
          error.message.includes('own support chat') ||
          error.message.includes('identity mismatch'))
      ) {
        throw error;
      }
      handleFirestoreError(error, OperationType.LIST, SUPPORT_CHATS_COL);
    }

    const now = new Date().toISOString();
    const msg: SupportChatMessage = {
      id: `msg-${crypto.randomUUID()}`,
      senderRole: payload.senderRole,
      senderName:
        String(payload.senderName || '').trim() ||
        (payload.senderRole === 'admin' ? 'Glamour Galleria Support' : cleanName),
      text: cleanText.slice(0, 1500),
      createdAt: now,
    };

    const nextMessages = [
      ...(matched && Array.isArray(matched.messages) ? matched.messages : []),
      msg,
    ].slice(-150);

    const threadId = matched
      ? matched.id
      : payload.chatId ||
        (payload.clientId ? `chat-${payload.clientId}` : `chat-${crypto.randomUUID()}`);

    const thread: SupportChatThread = stripUndefinedDeep({
      id: threadId,
      clientId: payload.clientId || matched?.clientId || '',
      customerName:
        payload.senderRole === 'customer'
          ? cleanName
          : matched?.customerName || cleanName,
      customerPhone:
        payload.senderRole === 'customer'
          ? formattedPhone || matched?.customerPhone || ''
          : matched?.customerPhone || formattedPhone,
      normalizedPhone:
        digits10 || matched?.normalizedPhone || '',
      lastMessage: msg.text.slice(0, 180),
      lastSenderRole: payload.senderRole,
      unreadForAdmin:
        payload.senderRole === 'customer'
          ? (matched?.unreadForAdmin || 0) + 1
          : 0,
      unreadForCustomer:
        payload.senderRole === 'admin'
          ? (matched?.unreadForCustomer || 0) + 1
          : 0,
      messages: nextMessages,
      createdAt: matched ? matched.createdAt : now,
      updatedAt: now,
    });

    try {
      await setDoc(doc(db, SUPPORT_CHATS_COL, thread.id), thread);
      return thread;
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `${SUPPORT_CHATS_COL}/${thread.id}`
      );
    }
  },

  async markSupportChatRead(
    chatId: string,
    readerRole: SupportSenderRole
  ): Promise<void> {
    const ref = doc(db, SUPPORT_CHATS_COL, chatId);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const patch =
        readerRole === 'admin' ? { unreadForAdmin: 0 } : { unreadForCustomer: 0 };
      await updateDoc(ref, patch);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${SUPPORT_CHATS_COL}/${chatId}`);
    }
  },

  async sendEmailOtp(
    email: string,
    purpose: EmailOtpPurpose
  ): Promise<{
    otpId: string;
    email: string;
    expiresAt: string;
    resendAvailableAt: string;
    challengeToken: string;
  }> {
    let targetEmail = ADMIN_OTP_EMAIL;
    if (purpose !== 'admin_login') {
      const check = validateGmailAddress(email);
      if (!check.valid) {
        throw new Error(check.error);
      }
      targetEmail = check.email;
    }

    if (purpose === 'customer_register') {
      const snap = await getDocs(
        query(collection(db, CLIENTS_COL), where('email', '==', targetEmail))
      );
      const existing = snap.docs.map((d) => d.data() as Client).find((c) => Boolean(c.passwordHash));
      if (existing) {
        throw new Error(
          'A customer account with this Gmail already exists. Please Sign In or use Forgot Password.'
        );
      }
    } else if (purpose === 'seller_register') {
      const snap = await getDocs(
        query(
          collection(db, SELLER_APPLICATIONS_COL),
          where('email', '==', targetEmail)
        )
      );
      const approved = snap.docs
        .map((d) => d.data() as SellerApplication)
        .find((s) => s.status === 'approved');
      if (approved) {
        throw new Error(
          'A verified Seller account already uses this Gmail. Please use Seller Login.'
        );
      }
    } else if (purpose === 'customer_forgot_password') {
      const snap = await getDocs(
        query(collection(db, CLIENTS_COL), where('email', '==', targetEmail))
      );
      if (snap.empty) {
        throw new Error(
          'No customer account found with this Gmail address. Please check your Gmail or use WhatsApp Support.'
        );
      }
    } else if (purpose === 'seller_forgot_password') {
      const snap = await getDocs(
        query(
          collection(db, SELLER_APPLICATIONS_COL),
          where('email', '==', targetEmail)
        )
      );
      if (snap.empty) {
        throw new Error('No Seller account found registered with this Gmail address.');
      }
    }

    // Enforce 30-second cooldown across refreshes via Firestore
    try {
      const existingOtps = await getDocs(
        query(collection(db, EMAIL_OTPS_COL), where('email', '==', targetEmail))
      );
      const latestCooldownMs = existingOtps.docs
        .map((d) => d.data() as EmailOtpRecord)
        .filter((o) => o.purpose === purpose && !o.verified)
        .reduce((max, o) => {
          const ts = Date.parse(o.resendAvailableAt || '');
          return Number.isNaN(ts) ? max : Math.max(max, ts);
        }, 0);
      if (latestCooldownMs > Date.now()) {
        const waitSec = Math.ceil((latestCooldownMs - Date.now()) / 1000);
        throw new Error(`Please wait ${waitSec}s before requesting another OTP.`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Please wait ')) {
        throw err;
      }
      // ignore non-blocking cooldown read fallback; server also checks cooldown
    }

    const response = await fetch('/api/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, purpose }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      otpId?: string;
      email?: string;
      otpHash?: string;
      expiresAt?: string;
      resendAvailableAt?: string;
      challengeToken?: string;
      error?: string;
    };
    if (
      !response.ok ||
      !payload.otpId ||
      !payload.email ||
      !payload.otpHash ||
      !payload.expiresAt ||
      !payload.resendAvailableAt ||
      !payload.challengeToken
    ) {
      throw new Error(
        payload.error || 'Could not send 6-digit Email OTP. Please try again.'
      );
    }

    const now = new Date().toISOString();
    const record: EmailOtpRecord = stripUndefinedDeep({
      id: payload.otpId,
      email: payload.email,
      purpose,
      otpHash: payload.otpHash,
      expiresAt: payload.expiresAt,
      attempts: 0,
      maxAttempts: OTP_MAX_ATTEMPTS,
      verified: false,
      resendAvailableAt: payload.resendAvailableAt,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await setDoc(doc(db, EMAIL_OTPS_COL, record.id), record);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${EMAIL_OTPS_COL}/${record.id}`);
    }

    return {
      otpId: payload.otpId,
      email: payload.email,
      expiresAt: payload.expiresAt,
      resendAvailableAt: payload.resendAvailableAt,
      challengeToken: payload.challengeToken,
    };
  },

  async verifyEmailOtp(params: {
    otpId: string;
    email: string;
    purpose: EmailOtpPurpose;
    code: string;
    challengeToken: string;
  }): Promise<{ verified: true; otpId: string; email: string }> {
    const cleanOtpId = String(params.otpId || '').trim();
    const cleanCode = String(params.code || '').trim();
    const targetEmail =
      params.purpose === 'admin_login'
        ? ADMIN_OTP_EMAIL
        : String(params.email || '').trim().toLowerCase();

    if (!cleanOtpId || !params.challengeToken) {
      throw new Error('Please click Send OTP first before verifying.');
    }
    if (!/^\d{6}$/.test(cleanCode)) {
      throw new Error('Please enter the 6-digit OTP sent to your Gmail.');
    }

    const ref = doc(db, EMAIL_OTPS_COL, cleanOtpId);
    let record: EmailOtpRecord;
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        throw new Error('OTP session expired or not found. Please click Send OTP again.');
      }
      record = snap.data() as EmailOtpRecord;
    } catch (error) {
      if (error instanceof Error && error.message.includes('OTP session')) throw error;
      handleFirestoreError(error, OperationType.GET, `${EMAIL_OTPS_COL}/${cleanOtpId}`);
    }

    if (record.verified) {
      return { verified: true, otpId: cleanOtpId, email: targetEmail };
    }
    const expMs = Date.parse(record.expiresAt);
    if (!Number.isNaN(expMs) && Date.now() > expMs) {
      throw new Error('This OTP has expired (5-minute limit). Please click Resend OTP.');
    }
    if (record.attempts >= record.maxAttempts) {
      throw new Error(
        'Maximum verification attempts (5) exceeded. Please click Resend OTP for a new code.'
      );
    }

    const response = await fetch('/api/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        otpId: cleanOtpId,
        email: targetEmail,
        purpose: params.purpose,
        code: cleanCode,
        challengeToken: params.challengeToken,
      }),
    });
    const resData = (await response.json().catch(() => ({}))) as {
      verified?: boolean;
      error?: string;
    };

    const now = new Date().toISOString();
    if (!response.ok || !resData.verified) {
      const nextAttempts = record.attempts + 1;
      try {
        await updateDoc(ref, {
          attempts: nextAttempts,
          updatedAt: now,
        });
      } catch {
        // ignore secondary update error
      }
      const remaining = Math.max(0, record.maxAttempts - nextAttempts);
      const suffix =
        remaining > 0
          ? ` (${remaining} attempt${remaining === 1 ? '' : 's'} remaining)`
          : ' (Attempt limit reached — please Resend OTP)';
      throw new Error((resData.error || 'Incorrect 6-digit OTP code.') + suffix);
    }

    try {
      await updateDoc(ref, {
        verified: true,
        verifiedAt: now,
        updatedAt: now,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${EMAIL_OTPS_COL}/${cleanOtpId}`);
    }

    return { verified: true, otpId: cleanOtpId, email: targetEmail };
  },

  async resetCustomerPasswordWithOtp(payload: {
    email: string;
    otpId: string;
    newPassword: string;
  }): Promise<{ ok: boolean }> {
    const gmailCheck = validateGmailAddress(payload.email);
    if (!gmailCheck.valid) {
      throw new Error(gmailCheck.error);
    }
    const cleanPassword = String(payload.newPassword || '').trim();
    if (cleanPassword.length < 4) {
      throw new Error('New password must be at least 4 characters long.');
    }

    await assertVerifiedEmailOtp(
      payload.otpId,
      gmailCheck.email,
      'customer_forgot_password'
    );

    let matched: Client | undefined;
    try {
      const snap = await getDocs(
        query(collection(db, CLIENTS_COL), where('email', '==', gmailCheck.email))
      );
      if (!snap.empty) {
        matched = snap.docs[0].data() as Client;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, CLIENTS_COL);
    }

    if (!matched) {
      throw new Error('No customer account found with this Gmail address.');
    }

    const { salt, hash } = await hashCustomerPassword(cleanPassword);
    const runningPasswordEnc = encryptRunningPassword(cleanPassword, salt);
    const now = new Date().toISOString();

    const updated: Client = stripUndefinedDeep({
      ...matched,
      passwordSalt: salt,
      passwordHash: hash,
      runningPasswordEnc,
      passwordUpdatedAt: now,
      updatedAt: now,
    });

    try {
      await setDoc(doc(db, CLIENTS_COL, matched.id), updated);
      return { ok: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${CLIENTS_COL}/${matched.id}`);
    }
  },

  async resetSellerPasswordWithOtp(payload: {
    email: string;
    otpId: string;
    newPassword: string;
  }): Promise<{ ok: boolean }> {
    const gmailCheck = validateGmailAddress(payload.email);
    if (!gmailCheck.valid) {
      throw new Error(gmailCheck.error);
    }
    const cleanPassword = String(payload.newPassword || '').trim();
    if (cleanPassword.length < 4) {
      throw new Error('New password must be at least 4 characters long.');
    }

    await assertVerifiedEmailOtp(
      payload.otpId,
      gmailCheck.email,
      'seller_forgot_password'
    );

    let matched: SellerApplication | undefined;
    try {
      const snap = await getDocs(
        query(
          collection(db, SELLER_APPLICATIONS_COL),
          where('email', '==', gmailCheck.email)
        )
      );
      if (!snap.empty) {
        matched = snap.docs[0].data() as SellerApplication;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, SELLER_APPLICATIONS_COL);
    }

    if (!matched) {
      throw new Error('No Seller account found registered with this Gmail address.');
    }

    const { salt, hash } = await hashCustomerPassword(cleanPassword);
    const runningPasswordEnc = encryptRunningPassword(cleanPassword, salt);
    const now = new Date().toISOString();

    const updated: SellerApplication = stripUndefinedDeep({
      ...matched,
      passwordSalt: salt,
      passwordHash: hash,
      runningPasswordEnc,
      passwordUpdatedAt: now,
      updatedAt: now,
    });

    try {
      await setDoc(doc(db, SELLER_APPLICATIONS_COL, matched.id), updated);
      return { ok: true };
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `${SELLER_APPLICATIONS_COL}/${matched.id}`
      );
    }
  },

  async recordAdminOtpVerified(otpId: string): Promise<{ verifiedAt: string }> {
    await assertVerifiedEmailOtp(otpId, ADMIN_OTP_EMAIL, 'admin_login');

    const now = new Date().toISOString();
    const ref = doc(db, SETTINGS_COL, SETTINGS_DOC);
    try {
      const snap = await getDoc(ref);
      const current = snap.exists()
        ? mergeBusinessSettings(snap.data() as Partial<BusinessSettings>)
        : mergeBusinessSettings();
      const updated = stripUndefinedDeep({
        ...current,
        lastAdminOtpVerifiedAt: now,
      });
      await setDoc(ref, updated);
      return { verifiedAt: now };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${SETTINGS_COL}/${SETTINGS_DOC}`);
    }
  },

  async fetchSentMailHistory(): Promise<SentMailRecord[]> {
    const local = readLocalSentMails();
    try {
      const snap = await getDoc(doc(db, SETTINGS_COL, SENT_MAIL_BOX_DOC));
      const remoteRaw = snap.exists() ? (snap.data() as { items?: unknown }).items : [];
      const remote = Array.isArray(remoteRaw) ? (remoteRaw as SentMailRecord[]) : [];
      const merged = mergeSentMailRecords(remote, local);
      writeLocalSentMails(merged);
      return merged;
    } catch {
      return local;
    }
  },

  async appendSentMailHistory(entries: SentMailRecord[]): Promise<SentMailRecord[]> {
    const cleanEntries = entries.map((e) =>
      stripUndefinedDeep({
        ...e,
        messagePreview: String(e.messagePreview || '').slice(0, 400),
      })
    );
    const local = readLocalSentMails();
    const optimistic = mergeSentMailRecords(cleanEntries, local);
    writeLocalSentMails(optimistic);

    try {
      const ref = doc(db, SETTINGS_COL, SENT_MAIL_BOX_DOC);
      const snap = await getDoc(ref);
      const remoteRaw = snap.exists() ? (snap.data() as { items?: unknown }).items : [];
      const remote = Array.isArray(remoteRaw) ? (remoteRaw as SentMailRecord[]) : [];
      const merged = mergeSentMailRecords(optimistic, remote);
      writeLocalSentMails(merged);
      await setDoc(
        ref,
        stripUndefinedDeep({
          businessName: 'Glamour Galleria',
          currencySymbol: '₹',
          currencyCode: 'INR',
          invoicePrefix: 'GG-',
          items: merged,
          updatedAt: new Date().toISOString(),
        })
      );
      return merged;
    } catch {
      return optimistic;
    }
  },
};
