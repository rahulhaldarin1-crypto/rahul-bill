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
  | 'settings';

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

export interface BusinessSettings {
  businessName: string;
  tagline: string;
  logoDataUrl: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  imageDataUrl: string;
  category: string;
  purchasePrice: number;
  sellingPrice: number;
  stockQty: number;
  lowStockAlert: number;
  size: string;
  color: string;
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

export interface WorkspaceData {
  settings: BusinessSettings;
  clients: Client[];
  products: Product[];
  invoices: Invoice[];
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
}
