export type PaymentMethod = 'UPI' | 'BANK_TRANSFER' | 'COD';

export type Language = 'en' | 'bn';

export interface OrderItem {
  id: string;
  productName: string;
  size: string;
  qty: number | '';
  originalPrice: number | '';
  discountedPrice: number | '';
}

export interface CustomerDetails {
  name: string;
  phone: string;
  address: string;
  cityPin: string;
}

export interface ClientRecord extends CustomerDetails {
  id: string;
  clientCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceMeta {
  invoiceNo: string;
  orderDate: string;
  deliveryDate: string;
  orderVia: string;
  paymentLabel: string;
}

export interface ShipmentDetails {
  courier: string;
  trackingId: string;
  trackingUrl: string;
}

export interface InvoiceData {
  id: string;
  clientId?: string;
  customer: CustomerDetails;
  meta: InvoiceMeta;
  items: OrderItem[];
  shipment: ShipmentDetails;
  deliveryCharge: number | '';
  gstPercent: number | '';
  paymentMethod: PaymentMethod;
  codAmountOverride: number | '';
  updatedAt: string;
}

export interface OfferColumn {
  title: string;
  items: string[];
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  location: string;
  customLogoDataUrl: string;
  sizeOptionsNote: string;
  minTableRows: number;
  upiId: string;
  upiNumber: string;
  customQrDataUrl: string;
  bankAccountName: string;
  bankAccountNo: string;
  bankIfscBranch: string;
  defaultCourier: string;
  defaultTrackingUrl: string;
  offerColumns: [OfferColumn, OfferColumn];
  noteTitle: string;
  noteHeadline: string;
  noteBody: string;
  socialTagLine: string;
}

export interface SavedInvoice extends InvoiceData {
  grandTotal: number;
}

export interface CatalogPreset {
  id: string;
  productName: string;
  defaultSize: string;
  originalPrice: number | '';
  discountedPrice: number;
}
