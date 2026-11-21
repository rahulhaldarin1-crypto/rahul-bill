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

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });
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
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(res.token);
    return res;
  },

  async login(payload: { email: string; password: string }) {
    const res = await request<{
      token: string;
      user: UserAccount;
      workspace: WorkspaceData;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(res.token);
    return res;
  },

  async fetchSession() {
    return request<{ user: UserAccount; workspace: WorkspaceData }>('/api/auth/me');
  },

  async changePassword(payload: { currentPassword: string; newPassword: string }) {
    return request<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async fetchWorkspace() {
    return request<WorkspaceData>('/api/workspace');
  },

  async updateSettings(settings: BusinessSettings) {
    return request<BusinessSettings>('/api/workspace/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async createClient(payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>) {
    return request<Client>('/api/workspace/clients', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateClient(
    id: string,
    payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
  ) {
    return request<Client>(`/api/workspace/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteClient(id: string) {
    return request<{ ok: boolean }>(`/api/workspace/clients/${id}`, {
      method: 'DELETE',
    });
  },

  async createProduct(payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) {
    return request<Product>('/api/workspace/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateProduct(
    id: string,
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ) {
    return request<Product>(`/api/workspace/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteProduct(id: string) {
    return request<{ ok: boolean }>(`/api/workspace/products/${id}`, {
      method: 'DELETE',
    });
  },

  async createInvoice(payload: Partial<Invoice>) {
    return request<{
      invoice: Invoice;
      payment: PaymentRecord | null;
      products: Product[];
    }>('/api/workspace/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateInvoice(id: string, payload: Partial<Invoice>) {
    return request<{
      invoice: Invoice;
      products: Product[];
      payments: PaymentRecord[];
    }>(`/api/workspace/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteInvoice(id: string) {
    return request<{ ok: boolean; products: Product[] }>(
      `/api/workspace/invoices/${id}`,
      { method: 'DELETE' }
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
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async deletePayment(id: string) {
    return request<{ ok: boolean; invoice?: Invoice }>(
      `/api/workspace/payments/${id}`,
      { method: 'DELETE' }
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
    return request<Invoice>(`/api/workspace/deliveries/${invoiceId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async createExpense(payload: Omit<ExpenseRecord, 'id' | 'createdAt'>) {
    return request<ExpenseRecord>('/api/workspace/expenses', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteExpense(id: string) {
    return request<{ ok: boolean }>(`/api/workspace/expenses/${id}`, {
      method: 'DELETE',
    });
  },

  async restoreBackup(workspace: WorkspaceData) {
    return request<WorkspaceData>('/api/workspace/restore', {
      method: 'POST',
      body: JSON.stringify(workspace),
    });
  },

  async searchPublicBills(query: string) {
    return request<{
      results: Array<{ invoice: Invoice; settings: BusinessSettings }>;
    }>(`/api/public/bills?q=${encodeURIComponent(query.trim())}`);
  },
};
