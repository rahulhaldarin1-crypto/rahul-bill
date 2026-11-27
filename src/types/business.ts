export type AppRoute =
  | 'dashboard'
  | 'new-client'
  | 'client-list'
  | 'client-bill'
  | 'sales-report'
  | 'products'
  | 'payment-history'
  | 'delivery-tracking'
  | 'profit-loss'
  | 'settings'
  | 'view-panel-control'
  | 'orders'
  | 'seller-hub-manage'
  | 'seller-products'
  | 'customer-seller-contacts'
  | 'help-chat'
  | 'smart-offers-mail'
  | 'bangladesh-control'
  | 'subscriptions'
  | 'boost-controller';

export type PaymentMethod = 'Cash' | 'UPI' | 'Bank Transfer';

export type DeliveryStatus =
  | 'Pending'
  | 'Processing'
  | 'Shipped'
  | 'Delivered'
  | 'Returned';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export type MediaAppSource = 'glamour-galleria' | 'ggadminpanel';
export type MediaUploaderRole = 'customer' | 'seller' | 'admin';
export type MediaResourceType = 'image' | 'video';
export type MediaEntityType =
  | 'product'
  | 'advertisement'
  | 'featured_item'
  | 'review'
  | 'payment_qr'
  | 'order_payment'
  | 'highlight_payment'
  | 'boost_payment'
  | 'subscription_payment'
  | 'seller_kyc'
  | 'seller_profile'
  | 'customer_avatar'
  | 'branding';

export interface CloudinaryMediaRecord {
  id: string;
  appSource: MediaAppSource;
  uploadedByRole: MediaUploaderRole;
  uploadedByUid?: string;
  relatedEntityType: MediaEntityType;
  relatedEntityId?: string;
  folder: string;
  publicId: string;
  secureUrl: string;
  resourceType: MediaResourceType;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  duration?: number;
  createdAt: string;
}

export interface ViewPanelDiscountOffer {
  id: string;
  title: string;
  discountLabel: string;
  promoCode?: string;
  validTill?: string;
  description: string;
}

export interface ViewPanelShoppingItem {
  id: string;
  productNumber?: string;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  size?: string;
  color?: string;
  imageDataUrl?: string;
  imageDataUrls?: string[];
  videoUrl?: string;
  mediaRecords?: CloudinaryMediaRecord[];
  description?: string;
  highlighted?: boolean;
  sellerId?: string;
  sellerName?: string;
  highlightPlacement?: HighlightPlacementRule;
  sellerPaymentUpiId?: string;
  sellerPaymentBankAccountName?: string;
  sellerPaymentBankName?: string;
  sellerPaymentBankAccountNo?: string;
  sellerPaymentBankIfscBranch?: string;
  sellerPaymentQrDataUrl?: string;
}

export interface ViewPanelConfig {
  advertisement: {
    enabled: boolean;
    imageDataUrl: string;
    videoUrl?: string;
    mediaType?: MediaResourceType;
    mediaRecord?: CloudinaryMediaRecord;
    title: string;
    subtitle: string;
    linkUrl: string;
    subscriptionAdMode?: boolean;
    autoCycleSubscriptionAd?: boolean;
  };
  discount: {
    enabled: boolean;
    sectionTitle: string;
    headline: string;
    offers: ViewPanelDiscountOffer[];
  };
  shopping: {
    enabled: boolean;
    sectionTitle: string;
    subtitle: string;
    includeCatalogProducts: boolean;
    items: ViewPanelShoppingItem[];
  };
  updatedAt?: string;
}

export type HighlightPlacementRule =
  | 'top_featured'
  | 'priority_category'
  | 'featured_badge_only';

export interface HighlightPlan {
  id: string;
  label: string;
  durationDays: number;
  price: number;
  enabled: boolean;
}

export interface HighlightOfferSeat {
  id: string;
  title: string;
  durationDays: number;
  price: number;
  originalPrice?: number;
  totalSeats: number;
  badgeText?: string;
  enabled: boolean;
}

export interface HighlightConfig {
  upiId: string;
  placementRule: HighlightPlacementRule;
  plans: HighlightPlan[];
  offerSeats: HighlightOfferSeat[];
  updatedAt?: string;
}

export interface AdminPaymentSettings {
  upiId: string;
  upiNumber?: string;
  bankAccountName?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfscBranch?: string;
  qrDataUrl?: string;
  updatedAt?: string;
}

export interface SellerPublicPaymentProfile {
  sellerId: string;
  sellerName: string;
  sellerPhotoDataUrl?: string;
  sellerCoverPhotoDataUrl?: string;
  followersCount?: number;
  upiId?: string;
  bankAccountName?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfscBranch?: string;
  qrDataUrl?: string;
}

export type SellerPublicStoreProfile = SellerPublicPaymentProfile;

export interface BangladeshConfig {
  enabled?: boolean;
  inrToBdtRate: number;
  whatsappNumber: string;
  updatedAt?: string;
}

export interface BusinessSettings {
  businessName: string;
  tagline: string;
  logoDataUrl: string;
  backgroundImageDataUrl?: string;
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
  bankName?: string;
  bankAccountNo?: string;
  bankIfscBranch?: string;
  paymentQrDataUrl?: string;
  invoiceFooterNote: string;
  socialTagLine?: string;
  lowStockThreshold: number;
  viewPanel?: ViewPanelConfig;
  highlightConfig?: HighlightConfig;
  bangladeshConfig?: BangladeshConfig;
  googleSheetsWebhookUrl?: string;
  lastAdminOtpVerifiedAt?: string;
}

export interface CustomerCartItem {
  id: string;
  productId?: string;
  productNumber?: string;
  name: string;
  category?: string;
  size?: string;
  color?: string;
  price: number;
  originalPrice?: number;
  quantity: number;
  imageDataUrl?: string;
  sellerId?: string;
  sellerName?: string;
  sourceUrl?: string;
  sourcePlatform?: ProductSourcePlatform;
}

export interface CategoryInterestEntry {
  searches: number;
  views: number;
  orders: number;
  score: number;
  lastActivityAt: string;
}

export interface CustomerEngagementProfile {
  categoryScores: Record<string, number>;
  productScores: Record<string, number>;
  priceAvg: number;
  priceCount: number;
  updatedAt: string;
}

export interface Client {
  id: string;
  name: string;
  email?: string;
  authUid?: string;
  profileCompleted?: boolean;
  mobile: string;
  whatsapp: string;
  address: string;
  state: string;
  city: string;
  pinCode: string;
  detectedCountry?: string;
  profilePhotoDataUrl?: string;
  passwordHash?: string;
  passwordSalt?: string;
  runningPasswordEnc?: string;
  passwordUpdatedAt?: string;
  cart?: CustomerCartItem[];
  favoriteProductIds?: string[];
  referralCode?: string;
  referredBy?: string;
  categoryInterests?: Record<string, CategoryInterestEntry>;
  totalCategoryOrders?: number;
  engagementProfile?: CustomerEngagementProfile;
  createdAt: string;
  updatedAt: string;
}

export type SellerApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ProductSourcePlatform = 'meesho' | 'flipkart' | 'other';

export interface Product {
  id: string;
  productNumber?: string;
  name: string;
  imageDataUrl: string;
  imageDataUrls?: string[];
  videoUrl?: string;
  mediaRecords?: CloudinaryMediaRecord[];
  category: string;
  purchasePrice: number;
  sellingPrice: number;
  originalPrice?: number;
  highlighted?: boolean;
  highlightExpiresAt?: string;
  highlightPlacement?: HighlightPlacementRule;
  highlightPlanTitle?: string;
  boosted?: boolean;
  boostPercentage?: number;
  boostLevel?: number;
  boostExpiresAt?: string;
  boostUpdatedAt?: string;
  boostSource?: 'admin' | 'seller';
  activeBoostRequestId?: string;
  viewCount?: number;
  wishlistCount?: number;
  orderCount?: number;
  stockQty: number;
  lowStockAlert: number;
  size: string;
  color: string;
  description?: string;
  sourceUrl?: string;
  sourcePlatform?: ProductSourcePlatform;
  sellerId?: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerApprovalStatus?: SellerApprovalStatus;
  sellerPaymentUpiId?: string;
  sellerPaymentBankAccountName?: string;
  sellerPaymentBankName?: string;
  sellerPaymentBankAccountNo?: string;
  sellerPaymentBankIfscBranch?: string;
  sellerPaymentQrDataUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
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

export interface Invoice {
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
  items: InvoiceLineItem[];
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
  paymentMethod: PaymentMethod;
  courierName: string;
  trackingNumber: string;
  trackingUrl?: string;
  deliveryStatus: DeliveryStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  customerName: string;
  totalBill: number;
  amountPaid: number;
  remainingDueAfter: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  note: string;
  createdAt: string;
}

export type ExpenseCategory =
  | 'Delivery'
  | 'Packaging'
  | 'Marketing'
  | 'Rent & Utilities'
  | 'Staff'
  | 'Other';

export interface ExpenseRecord {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  note: string;
  createdAt: string;
}

export type CustomerOrderStatus = 'Pending' | 'Confirmed' | 'Cancelled';
export type CustomerOrderPaymentMethod = 'COD' | 'UPI';

export interface CustomerOrderItem {
  id: string;
  productId?: string;
  productNumber?: string;
  productName: string;
  productCategory?: string;
  productSize?: string;
  productColor?: string;
  quantity: number;
  unitPrice: number;
  originalPrice?: number;
  lineTotal: number;
  imageDataUrl?: string;
  sellerId?: string;
  sellerName?: string;
  sourceUrl?: string;
  sourcePlatform?: ProductSourcePlatform;
}

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  orderDate?: string;
  estimatedDeliveryDate?: string;
  clientId: string;
  customerName: string;
  customerPhone: string;
  normalizedPhone: string;
  customerWhatsapp: string;
  customerAddress: string;
  customerCity: string;
  customerState: string;
  customerPinCode: string;
  items?: CustomerOrderItem[];
  productId?: string;
  productNumber?: string;
  productName: string;
  productCategory?: string;
  productSize?: string;
  productColor?: string;
  sourceUrl?: string;
  sourcePlatform?: ProductSourcePlatform;
  quantity: number;
  unitPrice: number;
  subtotal?: number;
  deliveryCharge?: number;
  totalAmount: number;
  paymentMethod: CustomerOrderPaymentMethod;
  upiIdUsed?: string;
  sellerId?: string;
  paymentRecipientType?: 'admin' | 'seller' | 'mixed';
  paymentRecipientName?: string;
  paymentScreenshotDataUrl?: string;
  customerNote?: string;
  status: CustomerOrderStatus;
  invoiceId?: string;
  invoiceNumber?: string;
  confirmedAt?: string;
  categoryOrdersTracked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SellerAccountStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface SellerApplication {
  id: string;
  clientId?: string;
  authUid?: string;
  sellerCode?: string;
  name: string;
  email?: string;
  dateOfBirth?: string;
  fullAddress: string;
  phone: string;
  normalizedPhone: string;
  panNumber: string;
  aadhaarNumber: string;
  gstNumber?: string;
  sellerPhotoDataUrl: string;
  sellerCoverPhotoDataUrl?: string;
  followersCount?: number;
  panDocDataUrl: string;
  aadhaarDocDataUrl: string;
  gstDocDataUrl?: string;
  bankDocDataUrl: string;
  bankAccountDetails?: string;
  sellerUpiId?: string;
  sellerBankAccountName?: string;
  sellerBankName?: string;
  sellerBankAccountNo?: string;
  sellerBankIfscBranch?: string;
  sellerQrDataUrl?: string;
  passwordSalt?: string;
  passwordHash?: string;
  runningPasswordEnc?: string;
  passwordUpdatedAt?: string;
  accountActivated?: boolean;
  status: SellerAccountStatus;
  adminRemarks?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SellerFollowRecord {
  id: string;
  sellerId: string;
  clientId: string;
  customerName?: string;
  createdAt: string;
}

export interface ProductReview {
  id: string;
  productId: string;
  sellerId?: string;
  clientId: string;
  customerName: string;
  rating: number;
  comment: string;
  mediaUrl?: string;
  mediaType?: MediaResourceType;
  mediaRecord?: CloudinaryMediaRecord;
  createdAt: string;
  updatedAt: string;
}

export type HighlightRequestStatus = 'pending_approval' | 'approved' | 'rejected';

export interface HighlightRequest {
  id: string;
  productId: string;
  productName: string;
  productCategory?: string;
  productImageDataUrl?: string;
  sellerId: string;
  sellerCode?: string;
  sellerName: string;
  sellerPhone: string;
  requestType: 'plan' | 'offer_seat';
  planOrSeatId: string;
  planTitle: string;
  durationDays: number;
  amount: number;
  upiIdUsed: string;
  transactionRef?: string;
  paymentScreenshotDataUrl?: string;
  placementRule?: HighlightPlacementRule;
  status: HighlightRequestStatus;
  adminRemarks?: string;
  approvedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type BoostRequestStatus = 'pending_approval' | 'approved' | 'rejected';

export interface BoostRequest {
  id: string;
  productId: string;
  productName: string;
  productCategory?: string;
  productImageDataUrl?: string;
  sellerId: string;
  sellerCode?: string;
  sellerName: string;
  sellerPhone: string;
  boostPercentage: number;
  durationDays: number;
  amount: number;
  upiIdUsed: string;
  transactionRef?: string;
  paymentScreenshotDataUrl?: string;
  status: BoostRequestStatus;
  adminRemarks?: string;
  approvedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type SupportSenderRole = 'customer' | 'admin';

export interface SupportChatMessage {
  id: string;
  senderRole: SupportSenderRole;
  senderName: string;
  text: string;
  createdAt: string;
}

export interface SupportChatThread {
  id: string;
  clientId?: string;
  customerName: string;
  customerPhone: string;
  normalizedPhone: string;
  lastMessage: string;
  lastSenderRole: SupportSenderRole;
  unreadForAdmin: number;
  unreadForCustomer: number;
  messages: SupportChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicCustomerLookupResult {
  client: Client | null;
  orders: CustomerOrder[];
  bills: Array<{ invoice: Invoice; settings: BusinessSettings }>;
}

export type EmailOtpPurpose =
  | 'customer_register'
  | 'seller_register'
  | 'customer_forgot_password'
  | 'seller_forgot_password'
  | 'admin_login';

export interface EmailOtpRecord {
  id: string;
  email: string;
  purpose: EmailOtpPurpose;
  otpHash: string;
  expiresAt: string;
  attempts: number;
  maxAttempts: number;
  verified: boolean;
  verifiedAt?: string;
  resendAvailableAt: string;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionStatus = 'pending' | 'active' | 'expired' | 'rejected';

export interface DeliverySubscriptionPaymentDetails {
  paymentScreenshotUrl: string;
  transactionId?: string;
  upiIdUsed?: string;
}

export interface DeliverySubscription {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  userEmail?: string;
  planPrice: number;
  durationDays: number;
  paymentMethod: 'online';
  paymentDetails: DeliverySubscriptionPaymentDetails;
  status: SubscriptionStatus;
  adminRemarks?: string;
  createdAt: string;
  updatedAt?: string;
  approvedAt?: string;
  expiresAt?: string;
}

export interface WorkspaceData {
  settings: BusinessSettings;
  paymentSettings?: AdminPaymentSettings;
  clients: Client[];
  products: Product[];
  invoices: Invoice[];
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
  orders: CustomerOrder[];
  sellerApplications: SellerApplication[];
  supportChats: SupportChatThread[];
  highlightRequests: HighlightRequest[];
  boostRequests?: BoostRequest[];
  sellerFollows?: SellerFollowRecord[];
  productReviews?: ProductReview[];
  subscriptions?: DeliverySubscription[];
}

export type SentMailRecipientType =
  | 'Customer'
  | 'Direct Client'
  | 'Random / External';

export interface SmartOfferRecipient {
  email: string;
  name?: string;
  clientId?: string;
  orderCount?: number;
  interestScore?: number;
  recipientType?: SentMailRecipientType;
}

export interface SmartOffersSendDeliveryItem {
  email: string;
  name?: string;
  status: 'sent' | 'failed';
  error?: string;
}

export interface SmartOffersSendResult {
  totalRequested: number;
  sentCount: number;
  failedCount: number;
  senderDisplay: string;
  logs: SmartOffersSendDeliveryItem[];
}

export interface SentMailRecord {
  id: string;
  recipientEmail: string;
  recipientName: string;
  recipientType: SentMailRecipientType;
  subject: string;
  messagePreview: string;
  category?: string;
  status: 'sent' | 'failed';
  error?: string;
  sentAt: string;
}
