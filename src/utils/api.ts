import {
  BusinessSettings,
  Client,
  DeliveryStatus,
  ExpenseRecord,
  Invoice,
  PaymentMethod,
  PaymentRecord,
  Product,
  UserAccount,
  WorkspaceData,
} from '../types/business';
import { localFallback } from './localFallback';

const TOKEN_KEY = 'gg_auth_token_v1';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

let backendAvailablePromise: Promise<boolean> | null = null;

async function hasBackendServer(): Promise<boolean> {
  if (!backendAvailablePromise) {
    backendAvailablePromise = fetch('/api/health', { method: 'GET' })
      .then(async (res) => {
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.includes('application/json')) return false;
        const data = (await res.json().catch(() => null)) as {
          status?: string;
          app?: string;
        } | null;
        return Boolean(data && data.status === 'ok' && data.app === 'Glamour Galleria');
      })
      .catch(() => false);
  }
  return backendAvailablePromise;
}

async function request<T>(
  path: string,
  options: RequestInit,
  fallbackFn: () => T | Promise<T>
): Promise<T> {
  const token = getStoredToken();
  const hasBackend = await hasBackendServer();
  if (!hasBackend) {
    return fallbackFn();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json') && res.status === 404) {
    backendAvailablePromise = Promise.resolve(false);
    return fallbackFn();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  async register(payload: { name: string; email: string; password: string }) {
    const res = await request<{
      token: string;
      user: UserAccount;
      workspace: WorkspaceData;
    }>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify(payload) },
      () => localFallback.register(payload)
    );
    setStoredToken(res.token);
    return res;
  },

  async login(payload: { email: string; password: string }) {
    const res = await request<{
      token: string;
      user: UserAccount;
      workspace: WorkspaceData;
    }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify(payload) },
      () => localFallback.login(payload)
    );
    setStoredToken(res.token);
    return res;
  },

  async fetchSession() {
    return request<{ user: UserAccount; workspace: WorkspaceData }>(
      '/api/auth/me',
      {},
      () => localFallback.fetchSession(getStoredToken())
    );
  },

  async changePassword(payload: { currentPassword: string; newPassword: string }) {
    return request<{ ok: boolean }>(
      '/api/auth/change-password',
      { method: 'POST', body: JSON.stringify(payload) },
      () => localFallback.changePassword(getStoredToken(), payload)
    );
  },

  async fetchWorkspace() {
    return request<WorkspaceData>('/api/workspace', {}, () =>
      localFallback.fetchWorkspace(getStoredToken())
    );
  },

  async updateSettings(settings: BusinessSettings) {
    return request<BusinessSettings>(
      '/api/workspace/settings',
      { method: 'PUT', body: JSON.stringify(settings) },
      () => localFallback.updateSettings(getStoredToken(), settings)
    );
  },

  async createClient(payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>) {
    return request<Client>(
      '/api/workspace/clients',
      { method: 'POST', body: JSON.stringify(payload) },
      () => localFallback.createClient(getStoredToken(), payload)
    );
  },

  async updateClient(
    id: string,
    payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
  ) {
    return request<Client>(
      `/api/workspace/clients/${id}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      () => localFallback.updateClient(getStoredToken(), id, payload)
    );
  },

  async deleteClient(id: string) {
    return request<{ ok: boolean }>(
      `/api/workspace/clients/${id}`,
      { method: 'DELETE' },
      () => localFallback.deleteClient(getStoredToken(), id)
    );
  },

  async createProduct(payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) {
    return request<Product>(
      '/api/workspace/products',
      { method: 'POST', body: JSON.stringify(payload) },
      () => localFallback.createProduct(getStoredToken(), payload)
    );
  },

  async updateProduct(
    id: string,
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ) {
    return request<Product>(
      `/api/workspace/products/${id}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      () => localFallback.updateProduct(getStoredToken(), id, payload)
    );
  },

  async deleteProduct(id: string) {
    return request<{ ok: boolean }>(
      `/api/workspace/products/${id}`,
      { method: 'DELETE' },
      () => localFallback.deleteProduct(getStoredToken(), id)
    );
  },

  async createInvoice(payload: Partial<Invoice>) {
    return request<{
      invoice: Invoice;
      payment: PaymentRecord | null;
      products: Product[];
    }>(
      '/api/workspace/invoices',
      { method: 'POST', body: JSON.stringify(payload) },
      () => localFallback.createInvoice(getStoredToken(), payload)
    );
  },

  async updateInvoice(id: string, payload: Partial<Invoice>) {
    return request<{
      invoice: Invoice;
      products: Product[];
      payments: PaymentRecord[];
    }>(
      `/api/workspace/invoices/${id}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      () => localFallback.updateInvoice(getStoredToken(), id, payload)
    );
  },

  async deleteInvoice(id: string) {
    return request<{ ok: boolean; products: Product[] }>(
      `/api/workspace/invoices/${id}`,
      { method: 'DELETE' },
      () => localFallback.deleteInvoice(getStoredToken(), id)
    );
  },

  async createPayment(payload: {
    invoiceId: string;
    amountPaid: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    note: string;
  }) {
    return request<{ payment: PaymentRecord; invoice: Invoice }>(
      '/api/workspace/payments',
      { method: 'POST', body: JSON.stringify(payload) },
      () => localFallback.createPayment(getStoredToken(), payload)
    );
  },

  async deletePayment(id: string) {
    return request<{ ok: boolean; invoice?: Invoice }>(
      `/api/workspace/payments/${id}`,
      { method: 'DELETE' },
      () => localFallback.deletePayment(getStoredToken(), id)
    );
  },

  async updateDelivery(
    invoiceId: string,
    payload: {
      courierName: string;
      trackingNumber: string;
      deliveryStatus: DeliveryStatus;
    }
  ) {
    return request<Invoice>(
      `/api/workspace/deliveries/${invoiceId}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      () => localFallback.updateDelivery(getStoredToken(), invoiceId, payload)
    );
  },

  async createExpense(payload: Omit<ExpenseRecord, 'id' | 'createdAt'>) {
    return request<ExpenseRecord>(
      '/api/workspace/expenses',
      { method: 'POST', body: JSON.stringify(payload) },
      () => localFallback.createExpense(getStoredToken(), payload)
    );
  },

  async deleteExpense(id: string) {
    return request<{ ok: boolean }>(
      `/api/workspace/expenses/${id}`,
      { method: 'DELETE' },
      () => localFallback.deleteExpense(getStoredToken(), id)
    );
  },

  async restoreBackup(workspace: WorkspaceData) {
    return request<WorkspaceData>(
      '/api/workspace/restore',
      { method: 'POST', body: JSON.stringify(workspace) },
      () => localFallback.restoreBackup(getStoredToken(), workspace)
    );
  },

  async searchPublicBills(query: string) {
    return request<{
      results: Array<{ invoice: Invoice; settings: BusinessSettings }>;
    }>(`/api/public/bills?q=${encodeURIComponent(query.trim())}`, {}, () =>
      localFallback.searchPublicBills(query)
    );
  },
};
