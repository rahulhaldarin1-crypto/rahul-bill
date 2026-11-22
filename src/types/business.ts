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
  | 'seller-hub-manage';

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
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  size?: string;
  color?: string;
  imageDataUrl?: string;
  imageDataUrls?: string[];
  description?: string;
  highlighted?: boolean;
}

export interface ViewPanelConfig {
  advertisement: {
    enabled: boolean;
    imageDataUrl: string;
    title: string;
    subtitle: string;
    linkUrl: string;
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
  bankAccountNo?: string;
  bankIfscBranch?: string;
  invoiceFooterNote: string;
  socialTagLine?: string;
  lowStockThreshold: number;
  viewPanel?: ViewPanelConfig;
}

export interface CustomerCartItem {
  id: string;
  productId?: string;
  name: string;
  category?: string;
  size?: string;
  color?: string;
  price: number;
  originalPrice?: number;
  quantity: number;
  imageDataUrl?: string;
}

export interface Client {
  id: string;
  name: string;
  mobile: string;
  whatsapp: string;
  address: string;
  state: string;
  city: string;
  pinCode: string;
  profilePhotoDataUrl?: string;
  passwordHash?: string;
  passwordSalt?: string;
  runningPasswordEnc?: string;
  passwordUpdatedAt?: string;
  cart?: CustomerCartItem[];
  referralCode?: string;
  referredBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type SellerApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Product {
  id: string;
  name: string;
  imageDataUrl: string;
  imageDataUrls?: string[];
  category: string;
  purchasePrice: number;
  sellingPrice: number;
  originalPrice?: number;
  highlighted?: boolean;
  stockQty: number;
  lowStockAlert: number;
  size: string;
  color: string;
  description?: string;
  sellerId?: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerApprovalStatus?: SellerApprovalStatus;
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
  productName: string;
  productCategory?: string;
  productSize?: string;
  productColor?: string;
  quantity: number;
  unitPrice: number;
  originalPrice?: number;
  lineTotal: number;
  imageDataUrl?: string;
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
  productName: string;
  productCategory?: string;
  productSize?: string;
  productColor?: string;
  quantity: number;
  unitPrice: number;
  subtotal?: number;
  deliveryCharge?: number;
  totalAmount: number;
  paymentMethod: CustomerOrderPaymentMethod;
  upiIdUsed?: string;
  paymentScreenshotDataUrl?: string;
  customerNote?: string;
  status: CustomerOrderStatus;
  invoiceId?: string;
  invoiceNumber?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type SellerAccountStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface SellerApplication {
  id: string;
  clientId?: string;
  name: string;
  fullAddress: string;
  phone: string;
  normalizedPhone: string;
  panNumber: string;
  aadhaarNumber: string;
  gstNumber?: string;
  sellerPhotoDataUrl: string;
  panDocDataUrl: string;
  aadhaarDocDataUrl: string;
  gstDocDataUrl?: string;
  bankDocDataUrl: string;
  bankAccountDetails?: string;
  status: SellerAccountStatus;
  adminRemarks?: string;
  reviewedAt?: string;
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

export interface WorkspaceData {
  settings: BusinessSettings;
  clients: Client[];
  products: Product[];
  invoices: Invoice[];
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
  orders: CustomerOrder[];
  sellerApplications: SellerApplication[];
  supportChats: SupportChatThread[];
}
