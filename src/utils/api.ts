import {
  AdminPaymentSettings,
  BoostRequest,
  BoostRequestStatus,
  BusinessSettings,
  Client,
  CloudinaryMediaRecord,
  CustomerCartItem,
  CustomerEngagementProfile,
  CustomerOrder,
  CustomerOrderItem,
  CustomerOrderPaymentMethod,
  DeliveryStatus,
  DeliverySubscription,
  EmailOtpPurpose,
  ExpenseRecord,
  HighlightRequest,
  HighlightRequestStatus,
  Invoice,
  MediaResourceType,
  OrderExchangeRequest,
  OrderExchangeRequestStatus,
  OrderExchangeRequestType,
  PaymentMethod,
  Product,
  ProductReview,
  SellerAccountStatus,
  SellerApplication,
  SellerApprovalStatus,
  SellerFollowRecord,
  SellerPublicPaymentProfile,
  SentMailRecord,
  SmartOfferRecipient,
  SmartOffersSendResult,
  SupportChatThread,
  SupportSenderRole,
  WorkspaceData,
} from '../types/business';
import { auth } from '../firebase';
import { resolveApiUrl } from './appMode';
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

  updateCustomerFavorites(clientId: string, favoriteProductIds: string[]) {
    return firestoreService.updateCustomerFavorites(clientId, favoriteProductIds);
  },

  resolveGoogleCustomerAccount(payload: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    detectedCountry?: string;
    isBangladesh?: boolean;
  }) {
    return firestoreService.resolveGoogleCustomerAccount(payload);
  },

  completeGoogleCustomerOnboarding(payload: {
    uid: string;
    email?: string | null;
    name: string;
    mobile?: string;
    profilePhotoDataUrl?: string;
    referredBy?: string;
    detectedCountry?: string;
    isBangladesh?: boolean;
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

  saveCustomerAddressBookEntry(
    clientId: string,
    payload: {
      label?: string;
      fullName: string;
      phone: string;
      whatsapp?: string;
      email?: string;
      address: string;
      city?: string;
      state?: string;
      pinCode?: string;
      setPrimary?: boolean;
    }
  ) {
    return firestoreService.saveCustomerAddressBookEntry(clientId, payload);
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
    saveAddressToAccount?: boolean;
    customerName: string;
    customerPhone: string;
    customerWhatsapp?: string;
    customerEmail?: string;
    customerAddress: string;
    customerCity?: string;
    customerState?: string;
    customerPinCode?: string;
    items?: CustomerOrderItem[];
    productId?: string;
    productNumber?: string;
    productName: string;
    productCategory?: string;
    productSize?: string;
    productColor?: string;
    imageDataUrl?: string;
    selectedImageUrl?: string;
    sourceUrl?: string;
    sourcePlatform?: Product['sourcePlatform'];
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

  resolveGoogleSellerAccount(payload: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
  }) {
    return firestoreService.resolveGoogleSellerAccount(payload);
  },

  submitSellerApplication(payload: {
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
    onProductReviews?: (reviews: ProductReview[]) => void,
    onSellerState?: (state: {
      approvedSellerIds: string[];
      blockedSellerIds: string[];
      sellerPaymentProfiles: Record<string, SellerPublicPaymentProfile>;
      loaded: boolean;
    }) => void
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
      onProductReviews,
      onSellerState
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
    category?: string;
    to?: string | string[] | Array<{ email?: string; name?: string }>;
    subject?: string;
    message?: string;
    html?: string;
    recipients?: SmartOfferRecipient[];
  }): Promise<SmartOffersSendResult> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Please sign in with an authorized Admin Google account first.');
    }

    const DEFAULT_WELCOME_SUBJECT =
      "Welcome to Glamour Galleria — You're Invited to Shop!";
    const DEFAULT_WELCOME_MESSAGE =
      'You are warmly invited to shop our latest collections at Glamour Galleria! Explore exclusive fashion, cosmetics, and winter wear.';

    const normalizedSubject =
      String(payload.subject || '').trim() || DEFAULT_WELCOME_SUBJECT;
    const normalizedMessage =
      String(payload.message || '').trim() || DEFAULT_WELCOME_MESSAGE;
    const normalizedCategory = String(payload.category || '').trim() || 'All Categories';

    const escapeHtml = (val: string) =>
      val
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const CUSTOMER_PANEL_URL = 'https://glamour-galleria.vercel.app';
    const normalizedHtml =
      String(payload.html || '').trim() ||
      `${normalizedMessage
        .split(/\r?\n/)
        .map((line) =>
          line.trim()
            ? `<p style="margin:0 0 12px;line-height:1.6;">${escapeHtml(line)}</p>`
            : '<div style="height:8px;"></div>'
        )
        .join('')}<div style="margin:18px 0 6px;text-align:center;"><a href="${CUSTOMER_PANEL_URL}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 20px;border-radius:10px;background-color:#7E22CE;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:13px;">Visit Glamour Galleria</a></div>`;

    const recipientMap = new Map<string, SmartOfferRecipient>();
    const addCandidate = (
      rawEmail: unknown,
      rawName?: unknown,
      meta?: Partial<SmartOfferRecipient>
    ) => {
      const email = String(rawEmail || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
      if (!recipientMap.has(email)) {
        recipientMap.set(email, {
          email,
          name: String(rawName || 'Valued Customer').trim() || 'Valued Customer',
          ...(meta?.clientId ? { clientId: meta.clientId } : {}),
          ...(typeof meta?.orderCount === 'number' ? { orderCount: meta.orderCount } : {}),
          ...(typeof meta?.interestScore === 'number'
            ? { interestScore: meta.interestScore }
            : {}),
        });
      }
    };

    if (Array.isArray(payload.recipients)) {
      for (const item of payload.recipients) {
        if (typeof item === 'string') {
          addCandidate(item);
        } else if (item && typeof item === 'object') {
          addCandidate(item.email, item.name, item);
        }
      }
    }

    if (typeof payload.to === 'string') {
      for (const part of payload.to.split(/[\s,;]+/)) {
        addCandidate(part);
      }
    } else if (Array.isArray(payload.to)) {
      for (const item of payload.to) {
        if (typeof item === 'string') {
          addCandidate(item);
        } else if (item && typeof item === 'object') {
          addCandidate(item.email, item.name);
        }
      }
    }

    const normalizedRecipients = Array.from(recipientMap.values()).slice(0, 100);
    const normalizedTo = normalizedRecipients.map((r) => r.email);

    const requestBody = JSON.stringify({
      category: normalizedCategory,
      to: normalizedTo,
      recipients: normalizedRecipients,
      subject: normalizedSubject,
      message: normalizedMessage,
      html: normalizedHtml,
    });

    const executeRequest = async (forceTokenRefresh: boolean) => {
      const idToken = await currentUser.getIdToken(forceTokenRefresh);
      const res = await fetch(resolveApiUrl('/api/offers/send'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: requestBody,
      });
      const rawText = await res.text().catch(() => '');
      let data: Partial<SmartOffersSendResult> & { error?: string } = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as Partial<SmartOffersSendResult> & {
            error?: string;
          };
        } catch {
          // non-JSON response (e.g. gateway/proxy HTML)
        }
      }
      return { res, rawText, data };
    };

    let responseBundle: Awaited<ReturnType<typeof executeRequest>>;
    try {
      responseBundle = await executeRequest(false);
      if (responseBundle.res.status === 401) {
        responseBundle = await executeRequest(true);
      }
    } catch (networkErr) {
      throw new Error(
        networkErr instanceof Error && networkErr.message
          ? `Network error while sending offers email: ${networkErr.message}`
          : 'Network error while reaching the email delivery server.'
      );
    }

    const { res, rawText, data } = responseBundle;
    if (!res.ok) {
      const detailedError =
        data.error ||
        (rawText && !rawText.trim().startsWith('<') ? rawText.trim().slice(0, 180) : '') ||
        `Email service returned HTTP ${res.status}. Please check server and SMTP configuration.`;
      throw new Error(detailedError);
    }

    return {
      totalRequested: Number(data.totalRequested || 0),
      sentCount: Number(data.sentCount || 0),
      failedCount: Number(data.failedCount || 0),
      senderDisplay: String(data.senderDisplay || '"Glamour Galleria"'),
      logs: Array.isArray(data.logs) ? data.logs : [],
    };
  },

  fetchSentMailHistory() {
    return firestoreService.fetchSentMailHistory();
  },

  appendSentMailHistory(entries: SentMailRecord[]) {
    return firestoreService.appendSentMailHistory(entries);
  },

  subscribeCustomerSubscriptions(
    userId: string,
    onList: (subs: DeliverySubscription[]) => void,
    onError: (err: Error) => void
  ) {
    return firestoreService.subscribeCustomerSubscriptions(userId, onList, onError);
  },

  createDeliverySubscription(payload: {
    userId: string;
    userName: string;
    userPhone: string;
    userEmail?: string;
    paymentScreenshotUrl: string;
    transactionId?: string;
    upiIdUsed?: string;
  }) {
    return firestoreService.createDeliverySubscription(payload);
  },

  updateDeliverySubscriptionStatus(
    subscriptionId: string,
    action: 'approve' | 'reject' | 'cancel' | 'extend',
    adminRemarks?: string
  ) {
    return firestoreService.updateDeliverySubscriptionStatus(
      subscriptionId,
      action,
      adminRemarks
    );
  },

  deleteDeliverySubscription(subscriptionId: string) {
    return firestoreService.deleteDeliverySubscription(subscriptionId);
  },

  updateProductBoost(
    productId: string,
    payload: {
      boosted: boolean;
      boostPercentage?: number;
      boostLevel?: number;
      boostExpiresAt?: string;
      boostSource?: 'admin' | 'seller';
    }
  ) {
    return firestoreService.updateProductBoost(productId, payload);
  },

  submitBoostRequest(payload: {
    sellerId: string;
    productId: string;
    boostPercentage: number;
    durationDays: number;
    transactionRef?: string;
    paymentScreenshotDataUrl?: string;
  }) {
    return firestoreService.submitBoostRequest(payload);
  },

  updateBoostRequestStatus(
    requestId: string,
    status: BoostRequestStatus,
    adminRemarks?: string
  ) {
    return firestoreService.updateBoostRequestStatus(
      requestId,
      status,
      adminRemarks
    );
  },

  deleteBoostRequest(requestId: string) {
    return firestoreService.deleteBoostRequest(requestId);
  },

  subscribeSellerBoostRequests(
    sellerId: string,
    onList: (requests: BoostRequest[]) => void,
    onError: (err: Error) => void
  ) {
    return firestoreService.subscribeSellerBoostRequests(
      sellerId,
      onList,
      onError
    );
  },

  incrementProductPopularity(
    productId: string,
    field: 'viewCount' | 'wishlistCount' | 'orderCount',
    delta = 1
  ) {
    return firestoreService.incrementProductPopularity(productId, field, delta);
  },

  syncCustomerEngagementProfile(
    clientId: string,
    profile: CustomerEngagementProfile
  ) {
    return firestoreService.syncCustomerEngagementProfile(clientId, profile);
  },

  createOrderExchangeRequest(payload: {
    type: OrderExchangeRequestType;
    orderId: string;
    orderNumber: string;
    clientId: string;
    customerName: string;
    customerPhone: string;
    customerWhatsapp: string;
    customerEmail?: string;
    productId?: string;
    productName?: string;
    productSize?: string;
    selectedImageUrl?: string;
    sellerId?: string;
    sellerName?: string;
    reason: string;
    photoUrls?: string[];
  }) {
    return firestoreService.createOrderExchangeRequest(payload);
  },

  updateOrderExchangeRequestStatus(
    requestId: string,
    status: OrderExchangeRequestStatus,
    resolutionNote?: string,
    handledBy?: string
  ) {
    return firestoreService.updateOrderExchangeRequestStatus(
      requestId,
      status,
      resolutionNote,
      handledBy
    );
  },

  deleteOrderExchangeRequest(requestId: string) {
    return firestoreService.deleteOrderExchangeRequest(requestId);
  },

  subscribeCustomerOrderExchanges(
    clientId: string,
    onList: (requests: OrderExchangeRequest[]) => void,
    onError: (err: Error) => void
  ) {
    return firestoreService.subscribeCustomerOrderExchanges(
      clientId,
      onList,
      onError
    );
  },

  subscribeSellerOrderExchanges(
    sellerId: string,
    onList: (requests: OrderExchangeRequest[]) => void,
    onError: (err: Error) => void
  ) {
    return firestoreService.subscribeSellerOrderExchanges(
      sellerId,
      onList,
      onError
    );
  },

  subscribeSellerOrders(
    sellerId: string,
    onList: (orders: CustomerOrder[]) => void,
    onError: (err: Error) => void
  ) {
    return firestoreService.subscribeSellerOrders(sellerId, onList, onError);
  },
};
