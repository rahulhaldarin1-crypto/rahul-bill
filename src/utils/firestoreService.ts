import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
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
import {
  createEmptyWorkspace,
  DEFAULT_SETTINGS,
  mergeBusinessSettings,
} from './calculations';

const SETTINGS_COL = 'settings';
const SETTINGS_DOC = 'business';
const CLIENTS_COL = 'clients';
const PRODUCTS_COL = 'products';
const INVOICES_COL = 'invoices';
const PAYMENTS_COL = 'payments';
const EXPENSES_COL = 'expenses';

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

function sortDescByCreated<T extends { createdAt?: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
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
  async fetchWorkspace(): Promise<WorkspaceData> {
    let settings: BusinessSettings = mergeBusinessSettings();
    try {
      const settingsSnap = await getDoc(doc(db, SETTINGS_COL, SETTINGS_DOC));
      if (settingsSnap.exists()) {
        settings = mergeBusinessSettings(settingsSnap.data() as Partial<BusinessSettings>);
      } else {
        await setDoc(doc(db, SETTINGS_COL, SETTINGS_DOC), stripUndefinedDeep(DEFAULT_SETTINGS));
      }
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

    const [clients, products, invoices, payments, expenses] = await Promise.all([
      fetchCol<Client>(CLIENTS_COL),
      fetchCol<Product>(PRODUCTS_COL),
      fetchCol<Invoice>(INVOICES_COL),
      fetchCol<PaymentRecord>(PAYMENTS_COL),
      fetchCol<ExpenseRecord>(EXPENSES_COL),
    ]);

    return { settings, clients, products, invoices, payments, expenses };
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
          onUpdate((prev) => ({ ...prev, settings: nextSettings }));
        }
      },
      (err) => reportError(OperationType.GET, `${SETTINGS_COL}/${SETTINGS_DOC}`, err)
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

    return () => {
      unsubSettings();
      unsubClients();
      unsubProducts();
      unsubInvoices();
      unsubPayments();
      unsubExpenses();
    };
  },

  async updateSettings(next: BusinessSettings): Promise<BusinessSettings> {
    const clean = stripUndefinedDeep(mergeBusinessSettings(next));
    try {
      await setDoc(doc(db, SETTINGS_COL, SETTINGS_DOC), clean);
      return clean;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${SETTINGS_COL}/${SETTINGS_DOC}`);
    }
  },

  async createClient(
    payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Client> {
    const now = new Date().toISOString();
    const client: Client = stripUndefinedDeep({
      ...payload,
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
    const ref = doc(db, CLIENTS_COL, id);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Customer not found.');
      const existing = snap.data() as Client;
      const updated: Client = stripUndefinedDeep({
        ...existing,
        ...payload,
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
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Product> {
    const ref = doc(db, PRODUCTS_COL, id);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Product not found.');
      const existing = snap.data() as Product;
      const updated: Product = stripUndefinedDeep({
        ...existing,
        ...payload,
        id,
        updatedAt: new Date().toISOString(),
      });
      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === 'Product not found.') throw error;
      handleFirestoreError(error, OperationType.UPDATE, `${PRODUCTS_COL}/${id}`);
    }
  },

  async deleteProduct(id: string): Promise<{ ok: boolean }> {
    try {
      await deleteDoc(doc(db, PRODUCTS_COL, id));
      return { ok: true };
    } catch (error) {
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
    const restored: WorkspaceData = {
      settings: stripUndefinedDeep(mergeBusinessSettings(workspace.settings)),
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
    };

    const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

    const existingCollections = [
      CLIENTS_COL,
      PRODUCTS_COL,
      INVOICES_COL,
      PAYMENTS_COL,
      EXPENSES_COL,
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
};
