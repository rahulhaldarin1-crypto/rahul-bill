import {
  AdminPaymentSettings,
  BusinessSettings,
  Client,
  CloudinaryMediaRecord,
  CustomerCartItem,
  CustomerOrder,
  CustomerOrderItem,
  CustomerOrderPaymentMethod,
  DeliveryStatus,
  EmailOtpPurpose,
  ExpenseRecord,
  HighlightRequest,
  HighlightRequestStatus,
  Invoice,
  MediaResourceType,
  PaymentMethod,
  Product,
  ProductReview,
  SellerAccountStatus,
  SellerApplication,
  SellerApprovalStatus,
  SellerFollowRecord,
  SellerPublicPaymentProfile,
  SmartOfferRecipient,
  SmartOffersSendResult,
  SupportChatThread,
  SupportSenderRole,
  WorkspaceData,
} from '../types/business';
import { auth } from '../firebase';
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
  saveMediaRecord(record: CloudinaryMediaRecord) {
    return firestoreService.saveMediaRecord(record);
  },

  fetchPublicSettingsOnly() {
    return firestoreService.fetchPublicSettingsOnly();
  },

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

  updatePaymentSettings(paymentSettings: AdminPaymentSettings) {
    return firestoreService.updatePaymentSettings(paymentSettings);
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

  resolveGoogleCustomerAccount(payload: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
  }) {
    return firestoreService.resolveGoogleCustomerAccount(payload);
  },

  completeGoogleCustomerOnboarding(payload: {
    uid: string;
    email?: string | null;
    name: string;
    mobile: string;
    profilePhotoDataUrl?: string;
    referredBy?: string;
  }) {
    return firestoreService.completeGoogleCustomerOnboarding(payload);
  },

  updateCustomerDeliveryAddress(
    clientId: string,
    payload: {
      address: string;
      city?: string;
      state?: string;
      pinCode?: string;
      whatsapp?: string;
    }
  ) {
    return firestoreService.updateCustomerDeliveryAddress(clientId, payload);
  },

  trackCustomerCategoryActivity(
    clientId: string,
    payload: {
      category: string;
      type: 'search' | 'view' | 'order';
      count?: number;
    }
  ) {
    return firestoreService.trackCustomerCategoryActivity(clientId, payload);
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
    upiIdUsed?: string;
    sellerId?: string;
    paymentRecipientType?: 'admin' | 'seller' | 'mixed';
    paymentRecipientName?: string;
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

  updateSellerPaymentDetails(
    sellerId: string,
    payload: {
      sellerUpiId?: string;
      sellerBankAccountName?: string;
      sellerBankName?: string;
      sellerBankAccountNo?: string;
      sellerBankIfscBranch?: string;
      sellerQrDataUrl?: string;
    }
  ) {
    return firestoreService.updateSellerPaymentDetails(sellerId, payload);
  },

  updateSellerStoreProfile(
    sellerId: string,
    payload: {
      name: string;
      sellerPhotoDataUrl?: string;
      sellerCoverPhotoDataUrl?: string;
    }
  ) {
    return firestoreService.updateSellerStoreProfile(sellerId, payload);
  },

  toggleSellerFollow(payload: {
    sellerId: string;
    clientId: string;
    customerName?: string;
  }) {
    return firestoreService.toggleSellerFollow(payload);
  },

  submitProductReview(payload: {
    productId: string;
    sellerId?: string;
    clientId: string;
    customerName: string;
    rating: number;
    comment: string;
    mediaUrl?: string;
    mediaType?: MediaResourceType;
    mediaRecord?: CloudinaryMediaRecord;
  }) {
    return firestoreService.submitProductReview(payload);
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
  ) {
    return firestoreService.subscribeCustomerStorefront(
      onSettings,
      onPaymentSettings,
      onProducts,
      onApprovedSellerIds,
      onSellerPaymentProfiles,
      onHighlightSeatUsage,
      onError,
      onSellerFollows,
      onProductReviews
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

  sendEmailOtp(email: string, purpose: EmailOtpPurpose) {
    return firestoreService.sendEmailOtp(email, purpose);
  },

  verifyEmailOtp(params: {
    otpId: string;
    email: string;
    purpose: EmailOtpPurpose;
    code: string;
    challengeToken: string;
  }) {
    return firestoreService.verifyEmailOtp(params);
  },

  resetCustomerPasswordWithOtp(payload: {
    email: string;
    otpId: string;
    newPassword: string;
  }) {
    return firestoreService.resetCustomerPasswordWithOtp(payload);
  },

  resetSellerPasswordWithOtp(payload: {
    email: string;
    otpId: string;
    newPassword: string;
  }) {
    return firestoreService.resetSellerPasswordWithOtp(payload);
  },

  recordAdminOtpVerified(otpId: string) {
    return firestoreService.recordAdminOtpVerified(otpId);
  },

  async sendSmartOffersMail(payload: {
    category: string;
    subject: string;
    message: string;
    recipients: SmartOfferRecipient[];
  }): Promise<SmartOffersSendResult> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Please sign in with an authorized Admin Google account first.');
    }
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/offers/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<SmartOffersSendResult> & {
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || 'Failed to send Smart Offers Mail.');
    }
    return {
      totalRequested: Number(data.totalRequested || 0),
      sentCount: Number(data.sentCount || 0),
      failedCount: Number(data.failedCount || 0),
      senderDisplay: String(data.senderDisplay || '"Glamour Galleria"'),
      logs: Array.isArray(data.logs) ? data.logs : [],
    };
  },
};
