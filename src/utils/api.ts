import {
  BusinessSettings,
  Client,
  CustomerCartItem,
  CustomerOrder,
  CustomerOrderItem,
  CustomerOrderPaymentMethod,
  DeliveryStatus,
  ExpenseRecord,
  HighlightRequest,
  HighlightRequestStatus,
  Invoice,
  PaymentMethod,
  Product,
  SellerAccountStatus,
  SellerApplication,
  SellerApprovalStatus,
  SupportChatThread,
  SupportSenderRole,
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
    referredBy?: string;
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
    payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    expectedSellerId?: string
  ) {
    return firestoreService.updateProduct(id, payload, expectedSellerId);
  },

  deleteProduct(id: string, expectedSellerId?: string) {
    return firestoreService.deleteProduct(id, expectedSellerId);
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

  submitSellerApplication(payload: {
    existingId?: string;
    clientId?: string;
    name: string;
    email?: string;
    dateOfBirth: string;
    fullAddress: string;
    phone: string;
    panNumber: string;
    aadhaarNumber: string;
    gstNumber?: string;
    password?: string;
    sellerPhotoDataUrl: string;
    panDocDataUrl: string;
    aadhaarDocDataUrl: string;
    gstDocDataUrl?: string;
    bankDocDataUrl: string;
    bankAccountDetails?: string;
  }) {
    return firestoreService.submitSellerApplication(payload);
  },

  updateSellerApplicationStatus(
    applicationId: string,
    status: SellerAccountStatus,
    adminRemarks?: string,
    credentials?: {
      sellerCode?: string;
      email?: string;
      password?: string;
    }
  ) {
    return firestoreService.updateSellerApplicationStatus(
      applicationId,
      status,
      adminRemarks,
      credentials
    );
  },

  setSellerPassword(applicationId: string, newPassword: string) {
    return firestoreService.setSellerPassword(applicationId, newPassword);
  },

  loginSellerAccount(identifier: string, password: string) {
    return firestoreService.loginSellerAccount(identifier, password);
  },

  deleteSellerApplication(applicationId: string) {
    return firestoreService.deleteSellerApplication(applicationId);
  },

  updateProductApproval(
    productId: string,
    sellerApprovalStatus: SellerApprovalStatus
  ) {
    return firestoreService.updateProductApproval(productId, sellerApprovalStatus);
  },

  sendSupportMessage(payload: {
    chatId?: string;
    clientId?: string;
    customerName: string;
    customerPhone: string;
    senderRole: SupportSenderRole;
    senderName: string;
    text: string;
  }) {
    return firestoreService.sendSupportMessage(payload);
  },

  markSupportChatRead(chatId: string, readerRole: SupportSenderRole) {
    return firestoreService.markSupportChatRead(chatId, readerRole);
  },

  submitHighlightRequest(payload: {
    sellerId: string;
    productId: string;
    requestType: 'plan' | 'offer_seat';
    planOrSeatId: string;
    transactionRef?: string;
    paymentScreenshotDataUrl?: string;
  }) {
    return firestoreService.submitHighlightRequest(payload);
  },

  updateHighlightRequestStatus(
    requestId: string,
    status: HighlightRequestStatus,
    adminRemarks?: string
  ) {
    return firestoreService.updateHighlightRequestStatus(
      requestId,
      status,
      adminRemarks
    );
  },

  deleteHighlightRequest(requestId: string) {
    return firestoreService.deleteHighlightRequest(requestId);
  },

  subscribeSellerHighlightRequests(
    sellerId: string,
    onList: (requests: HighlightRequest[]) => void,
    onError: (err: Error) => void
  ) {
    return firestoreService.subscribeSellerHighlightRequests(
      sellerId,
      onList,
      onError
    );
  },

  fetchCustomerStorefront() {
    return firestoreService.fetchCustomerStorefront();
  },

  subscribeCustomerStorefront(
    onSettings: (settings: BusinessSettings) => void,
    onProducts: (products: Product[]) => void,
    onApprovedSellerIds: (sellerIds: string[]) => void,
    onHighlightSeatUsage: (usage: Record<string, number>) => void,
    onError: (err: Error) => void
  ) {
    return firestoreService.subscribeCustomerStorefront(
      onSettings,
      onProducts,
      onApprovedSellerIds,
      onHighlightSeatUsage,
      onError
    );
  },

  subscribeCustomerAccount(
    clientId: string,
    onClient: (client: Client | null) => void,
    onOrders: (orders: CustomerOrder[]) => void,
    onInvoices: (invoices: Invoice[]) => void,
    onError: (err: Error) => void
  ) {
    return firestoreService.subscribeCustomerAccount(
      clientId,
      onClient,
      onOrders,
      onInvoices,
      onError
    );
  },

  subscribeSingleSellerApplication(
    sellerId: string,
    onSeller: (seller: SellerApplication | null) => void,
    onError: (err: Error) => void
  ) {
    return firestoreService.subscribeSingleSellerApplication(
      sellerId,
      onSeller,
      onError
    );
  },

  fetchSupportThreadForClient(clientId: string, phone?: string) {
    return firestoreService.fetchSupportThreadForClient(clientId, phone);
  },

  resolveGuestSupportThread(name: string, phone: string) {
    return firestoreService.resolveGuestSupportThread(name, phone);
  },

  subscribeSingleSupportThread(
    chatId: string,
    onThread: (thread: SupportChatThread | null) => void,
    onError: (err: Error) => void
  ) {
    return firestoreService.subscribeSingleSupportThread(
      chatId,
      onThread,
      onError
    );
  },
};
