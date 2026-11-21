import { CatalogPreset, InvoiceData, StoreSettings } from '../types/invoice';

export const COURIER_PRESETS: Record<string, string> = {
  Xpressbees: 'https://www.xpressbees.com/shipment/tracking',
  Delhivery: 'https://www.delhivery.com/tracking',
  BlueDart: 'https://www.bluedart.com/tracking',
  DTDC: 'https://www.dtdc.in/tracking.asp',
  'India Post': 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx',
  Shadowfax: 'https://tracker.shadowfax.in/',
};

export const SIZE_CHOICES = ['XS', 'S', 'M', 'L', 'XL', 'Free'] as const;

export const ORDER_VIA_CHOICES = ['WhatsApp', 'Instagram', 'Website', 'Phone', 'Store'] as const;

export const DEFAULT_CATALOG_PRESETS: CatalogPreset[] = [
  {
    id: 'preset-1',
    productName: 'Partywear Grey Fur Collar Neck Sweaters For Womens & Girls.',
    defaultSize: 'M',
    originalPrice: '',
    discountedPrice: 570,
  },
  {
    id: 'preset-2',
    productName: 'Pretty Retro Women Sweaters',
    defaultSize: 'M',
    originalPrice: '',
    discountedPrice: 575,
  },
  {
    id: 'preset-3',
    productName: 'Designer Embroidered Cotton Kurti Set',
    defaultSize: 'L',
    originalPrice: 1299,
    discountedPrice: 899,
  },
  {
    id: 'preset-4',
    productName: 'Velvet Matte Lipstick & Lip Care Combo',
    defaultSize: 'Free',
    originalPrice: 650,
    discountedPrice: 449,
  },
];

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: 'GLAMOUR GALLERIA',
  tagline: "Women's Fashion & Cosmetics",
  location: 'Kolkata, West Bengal, India',
  customLogoDataUrl: '',
  sizeOptionsNote: 'Size options: XS / S / M / L',
  minTableRows: 6,
  upiId: '[yourname@upi]',
  upiNumber: '[Phone number]',
  customQrDataUrl: '',
  bankAccountName: '[Holder name]',
  bankAccountNo: '[Account number]',
  bankIfscBranch: '[IFSC, Bank & branch]',
  defaultCourier: 'Xpressbees',
  defaultTrackingUrl: 'https://www.xpressbees.com/shipment/tracking',
  offerColumns: [
    {
      title: "Women's Clothing",
      items: [
        'Kurtis & Kurti Sets',
        'Sarees & Ethnic Wear',
        'Dresses, Tops & Co-ord Sets',
        'Available sizes: XS, S, M, L',
      ],
    },
    {
      title: 'Cosmetics & Beauty',
      items: [
        'Lipsticks, Lip Care & Makeup',
        'Skincare & Face Care',
        'Hair Care & Accessories',
        'Makeup Tools & Gift Sets',
      ],
    },
  ],
  noteTitle: 'A NOTE FROM GLAMOUR GALLERIA',
  noteHeadline: 'Thank you for shopping with Glamour Galleria!',
  noteBody:
    'Every piece is chosen with love to make you feel confident and beautiful. We truly appreciate your trust and support. If you have any question about your order, just message us anytime.',
  socialTagLine: 'Loved your order? Tag us @glamour.galleria.in and share your look with us!',
};

export const INITIAL_SAMPLE_INVOICE: InvoiceData = {
  id: 'inv-initial-blank',
  customer: {
    name: '',
    phone: '',
    address: '',
    cityPin: '',
  },
  meta: {
    invoiceNo: '',
    orderDate: '',
    deliveryDate: '',
    orderVia: '',
    paymentLabel: '',
  },
  items: [
    {
      id: 'item-initial-1',
      productName: '',
      size: 'M',
      qty: 1,
      originalPrice: '',
      discountedPrice: '',
    },
  ],
  shipment: {
    courier: 'Xpressbees',
    trackingId: '',
    trackingUrl: 'https://www.xpressbees.com/shipment/tracking',
  },
  deliveryCharge: '',
  gstPercent: '',
  paymentMethod: 'COD',
  codAmountOverride: '',
  updatedAt: new Date().toISOString(),
};

export function createBlankInvoice(nextInvoiceNo: string, settings: StoreSettings): InvoiceData {
  return {
    id: `inv-${Date.now()}`,
    customer: {
      name: '',
      phone: '',
      address: '',
      cityPin: '',
    },
    meta: {
      invoiceNo: nextInvoiceNo,
      orderDate: '',
      deliveryDate: '',
      orderVia: '',
      paymentLabel: '',
    },
    items: [
      {
        id: `item-${Date.now()}`,
        productName: '',
        size: 'M',
        qty: 1,
        originalPrice: '',
        discountedPrice: '',
      },
    ],
    shipment: {
      courier: settings.defaultCourier || 'Xpressbees',
      trackingId: '',
      trackingUrl: settings.defaultTrackingUrl || 'https://www.xpressbees.com/shipment/tracking',
    },
    deliveryCharge: '',
    gstPercent: '',
    paymentMethod: 'COD',
    codAmountOverride: '',
    updatedAt: new Date().toISOString(),
  };
}
