import {
  BusinessSettings,
  Client,
  CustomerCartItem,
  CustomerOrderItem,
  CustomerOrderPaymentMethod,
  DeliveryStatus,
  ExpenseRecord,
  Invoice,
  PaymentMethod,
  Product,
  WorkspaceData,
} from '../types/business';
import { firestoreService } from './firestoreService';

export function formatApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message || fallback;
  if (msg.startsWith('{')) {
    try {
      const parsed = JSON.parse(msg) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      // keep raw message
    }
  }
  return msg;
}

export const api = {
  fetchWorkspace() {
    return firestoreService.fetchWorkspace();
  },

  subscribeWorkspace(
    onUpdate: (updater: (prev: WorkspaceData) => WorkspaceData) => void,
    onError: (err: Error) => void
  ) {
    return firestoreService.subscribeWorkspace(onUpdate, onError);
  },

  updateSettings(settings: BusinessSettings) {
    return firestoreService.updateSettings(settings);
  },

  createClient(payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>) {
    return firestoreService.createClient(payload);
  },

  updateClient(
    id: string,
    payload: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
  ) {
    return firestoreService.updateClient(id, payload);
  },

  deleteClient(id: string) {
    return firestoreService.deleteClient(id);
  },

  setClientPassword(clientId: string, newPassword: string) {
    return firestoreService.setClientPassword(clientId, newPassword);
  },

  registerCustomerAccount(payload: {
    name: string;
    phone: string;
    address: string;
    city?: string;
    state?: string;
    pinCode?: string;
    password: string;
    profilePhotoDataUrl?: string;
  }) {
    return firestoreService.registerCustomerAccount(payload);
  },

  loginCustomerAccount(phone: string, password: string) {
    return firestoreService.loginCustomerAccount(phone, password);
  },

  updateCustomerProfilePhoto(clientId: string, profilePhotoDataUrl: string) {
    return firestoreService.updateCustomerProfilePhoto(
      clientId,
      profilePhotoDataUrl
    );
  },

  updateCustomerCart(clientId: string, cart: CustomerCartItem[]) {
    return firestoreService.updateCustomerCart(clientId, cart);
  },

  createProduct(payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) {
    return firestoreService.createProduct(payload);
  },

  updateProduct(
    id: string,
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ) {
    return firestoreService.updateProduct(id, payload);
  },

  deleteProduct(id: string) {
    return firestoreService.deleteProduct(id);
  },

  createInvoice(payload: Partial<Invoice>) {
    return firestoreService.createInvoice(payload);
  },

  updateInvoice(id: string, payload: Partial<Invoice>) {
    return firestoreService.updateInvoice(id, payload);
  },

  deleteInvoice(id: string) {
    return firestoreService.deleteInvoice(id);
  },

  createPayment(payload: {
    invoiceId: string;
    amountPaid: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    note: string;
  }) {
    return firestoreService.createPayment(payload);
  },

  deletePayment(id: string) {
    return firestoreService.deletePayment(id);
  },

  updateDelivery(
    invoiceId: string,
    payload: {
      courierName: string;
      trackingNumber: string;
      deliveryStatus: DeliveryStatus;
    }
  ) {
    return firestoreService.updateDelivery(invoiceId, payload);
  },

  createExpense(payload: Omit<ExpenseRecord, 'id' | 'createdAt'>) {
    return firestoreService.createExpense(payload);
  },

  deleteExpense(id: string) {
    return firestoreService.deleteExpense(id);
  },

  restoreBackup(workspace: WorkspaceData) {
    return firestoreService.restoreBackup(workspace);
  },

  createCustomerOrder(payload: {
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
    paymentScreenshotDataUrl?: string;
    customerNote?: string;
  }) {
    return firestoreService.createCustomerOrder(payload);
  },

  confirmCustomerOrder(orderId: string) {
    return firestoreService.confirmCustomerOrder(orderId);
  },

  cancelCustomerOrder(orderId: string) {
    return firestoreService.cancelCustomerOrder(orderId);
  },

  deleteCustomerOrder(orderId: string) {
    return firestoreService.deleteCustomerOrder(orderId);
  },

  lookupCustomerByPhone(phone: string) {
    return firestoreService.lookupCustomerByPhone(phone);
  },
};
