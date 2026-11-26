import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import {
  AdminPaymentSettings,
  BangladeshConfig,
  BusinessSettings,
  HighlightConfig,
  Invoice,
  InvoiceLineItem,
  Product,
  SellerPublicPaymentProfile,
  ViewPanelConfig,
  WorkspaceData,
} from '../types/business';

export const DEFAULT_ADMIN_UPI_ID = 'rahulhaldar189941@axl';
export const CHECKOUT_UPI_ID = DEFAULT_ADMIN_UPI_ID;
export const HIGHLIGHT_UPI_ID = DEFAULT_ADMIN_UPI_ID;
export const WHATSAPP_SUPPORT_PHONE = '919332578394';
export const COD_DELIVERY_CHARGE_PER_ITEM = 50;

export const ALLOWED_ADMIN_EMAILS = [
  'rahulhaldar.in1@gmail.com',
  'rahulhaldar.in@gmail.com',
] as const;

export function isAuthorizedAdminEmail(email?: string | null): boolean {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;
  return (ALLOWED_ADMIN_EMAILS as readonly string[]).includes(normalized);
}

export function computeCategoryScore(
  searches = 0,
  views = 0,
  orders = 0
): number {
  return Math.max(0, searches * 1 + views * 2 + orders * 5);
}

export const ADMIN_OTP_EMAIL = 'rahulhaldar.in@gmail.com';
export const ADMIN_OTP_WINDOW_MS = 24 * 60 * 60 * 1000;
export const OTP_EXPIRY_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_SEC = 30;
export const OTP_MAX_ATTEMPTS = 5;

export function validateGmailAddress(raw?: string): {
  valid: boolean;
  email: string;
  error?: string;
} {
  const cleaned = String(raw || '').trim().toLowerCase();
  if (!cleaned) {
    return {
      valid: false,
      email: '',
      error: 'Please enter your @gmail.com email address for OTP verification.',
    };
  }
  if (!/^[a-z0-9._%+-]+@gmail\.com$/i.test(cleaned)) {
    return {
      valid: false,
      email: cleaned,
      error: 'Please enter a valid Gmail address ending with @gmail.com.',
    };
  }
  return { valid: true, email: cleaned };
}

export function isAdminOtpWindowValid(lastVerifiedAt?: string): boolean {
  if (!lastVerifiedAt || !String(lastVerifiedAt).trim()) return false;
  const ts = Date.parse(lastVerifiedAt);
  if (Number.isNaN(ts)) return false;
  const elapsed = Date.now() - ts;
  return elapsed >= 0 && elapsed < ADMIN_OTP_WINDOW_MS;
}

export const PRODUCT_CATEGORIES = [
  "Women's Clothing",
  'Winter Collection',
  "Women's Jewellery",
  'Cosmetics & Beauty Products',
  'Perfumes & Fragrances',
  "Women's Innerwear",
  'Fashion Accessories',
] as const;

export const DEFAULT_PRODUCT_CATEGORY = PRODUCT_CATEGORIES[0];

export const MAX_COMPRESSED_IMAGE_BYTES = 100 * 1024; // Strictly under 100KB (102,400 bytes)
export const TARGET_COMPRESSED_IMAGE_BYTES = 95 * 1024; // ~80KB-95KB target binary size

export function validateImageFileType(file: File): string | null {
  const mime = (file.type || '').toLowerCase();
  const hasImageExtension = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(
    file.name || ''
  );
  if (!mime.startsWith('image/') && !hasImageExtension) {
    return 'Please select a valid image file (JPG, PNG, or WEBP).';
  }
  return null;
}

export function estimateDataUrlBinaryBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return dataUrl.length;
  const b64 = dataUrl.slice(commaIdx + 1);
  let padding = 0;
  if (b64.endsWith('==')) padding = 2;
  else if (b64.endsWith('=')) padding = 1;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function validateEnglishName(
  rawName?: string,
  fieldLabel = 'Customer Name'
): { valid: boolean; cleaned: string; error?: string } {
  const cleaned = String(rawName || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (cleaned.length < 2) {
    return {
      valid: false,
      cleaned,
      error: `${fieldLabel} must be at least 2 characters in English.`,
    };
  }
  if (!/^[A-Za-z .'-]+$/.test(cleaned) || !/[A-Za-z]{2,}/.test(cleaned)) {
    return {
      valid: false,
      cleaned,
      error: `${fieldLabel} must be written in English letters only (A-Z, a-z).`,
    };
  }
  return { valid: true, cleaned };
}

export function getMaxAdultDobIso(): string {
  const now = new Date();
  const y = now.getFullYear() - 18;
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function validateAdultDateOfBirth(dobRaw?: string): {
  valid: boolean;
  dob: string;
  age: number;
  error?: string;
} {
  const dob = String(dobRaw || '').trim();
  const match = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return {
      valid: false,
      dob: '',
      age: 0,
      error: 'Please enter a valid Date of Birth.',
    };
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const birth = new Date(year, month - 1, day);
  if (
    Number.isNaN(birth.getTime()) ||
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return {
      valid: false,
      dob: '',
      age: 0,
      error: 'Please enter a valid Date of Birth.',
    };
  }

  const today = new Date();
  if (birth > today) {
    return {
      valid: false,
      dob,
      age: 0,
      error: 'Date of Birth cannot be in the future.',
    };
  }

  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
    age -= 1;
  }

  if (age < 18) {
    return {
      valid: false,
      dob,
      age,
      error:
        'Applicant must be at least 18 years old to register as a Seller.',
    };
  }

  return { valid: true, dob, age };
}

export function isProductHighlightActive(prod: {
  highlighted?: boolean;
  highlightExpiresAt?: string;
}): boolean {
  if (!prod.highlighted) return false;
  if (!prod.highlightExpiresAt) return true;
  const exp = new Date(prod.highlightExpiresAt).getTime();
  if (Number.isNaN(exp)) return true;
  return exp > Date.now();
}

export function normalizeSupportName(name?: string): string {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export interface AsianCountryCode {
  name: string;
  dialCode: string;
  iso: string;
}

export const ASIAN_COUNTRY_CODES: readonly AsianCountryCode[] = [
  { name: 'India', dialCode: '+91', iso: 'IN' },
  { name: 'Bangladesh', dialCode: '+880', iso: 'BD' },
  { name: 'Afghanistan', dialCode: '+93', iso: 'AF' },
  { name: 'Armenia', dialCode: '+374', iso: 'AM' },
  { name: 'Azerbaijan', dialCode: '+994', iso: 'AZ' },
  { name: 'Bahrain', dialCode: '+973', iso: 'BH' },
  { name: 'Bhutan', dialCode: '+975', iso: 'BT' },
  { name: 'Brunei', dialCode: '+673', iso: 'BN' },
  { name: 'Cambodia', dialCode: '+855', iso: 'KH' },
  { name: 'China', dialCode: '+86', iso: 'CN' },
  { name: 'Cyprus', dialCode: '+357', iso: 'CY' },
  { name: 'Georgia', dialCode: '+995', iso: 'GE' },
  { name: 'Hong Kong', dialCode: '+852', iso: 'HK' },
  { name: 'Indonesia', dialCode: '+62', iso: 'ID' },
  { name: 'Iran', dialCode: '+98', iso: 'IR' },
  { name: 'Iraq', dialCode: '+964', iso: 'IQ' },
  { name: 'Israel', dialCode: '+972', iso: 'IL' },
  { name: 'Japan', dialCode: '+81', iso: 'JP' },
  { name: 'Jordan', dialCode: '+962', iso: 'JO' },
  { name: 'Kazakhstan', dialCode: '+7', iso: 'KZ' },
  { name: 'Kuwait', dialCode: '+965', iso: 'KW' },
  { name: 'Kyrgyzstan', dialCode: '+996', iso: 'KG' },
  { name: 'Laos', dialCode: '+856', iso: 'LA' },
  { name: 'Lebanon', dialCode: '+961', iso: 'LB' },
  { name: 'Macau', dialCode: '+853', iso: 'MO' },
  { name: 'Malaysia', dialCode: '+60', iso: 'MY' },
  { name: 'Maldives', dialCode: '+960', iso: 'MV' },
  { name: 'Mongolia', dialCode: '+976', iso: 'MN' },
  { name: 'Myanmar', dialCode: '+95', iso: 'MM' },
  { name: 'Nepal', dialCode: '+977', iso: 'NP' },
  { name: 'North Korea', dialCode: '+850', iso: 'KP' },
  { name: 'Oman', dialCode: '+968', iso: 'OM' },
  { name: 'Pakistan', dialCode: '+92', iso: 'PK' },
  { name: 'Palestine', dialCode: '+970', iso: 'PS' },
  { name: 'Philippines', dialCode: '+63', iso: 'PH' },
  { name: 'Qatar', dialCode: '+974', iso: 'QA' },
  { name: 'Saudi Arabia', dialCode: '+966', iso: 'SA' },
  { name: 'Singapore', dialCode: '+65', iso: 'SG' },
  { name: 'South Korea', dialCode: '+82', iso: 'KR' },
  { name: 'Sri Lanka', dialCode: '+94', iso: 'LK' },
  { name: 'Syria', dialCode: '+963', iso: 'SY' },
  { name: 'Taiwan', dialCode: '+886', iso: 'TW' },
  { name: 'Tajikistan', dialCode: '+992', iso: 'TJ' },
  { name: 'Thailand', dialCode: '+66', iso: 'TH' },
  { name: 'Timor-Leste', dialCode: '+670', iso: 'TL' },
  { name: 'Turkey', dialCode: '+90', iso: 'TR' },
  { name: 'Turkmenistan', dialCode: '+993', iso: 'TM' },
  { name: 'United Arab Emirates', dialCode: '+971', iso: 'AE' },
  { name: 'Uzbekistan', dialCode: '+998', iso: 'UZ' },
  { name: 'Vietnam', dialCode: '+84', iso: 'VN' },
  { name: 'Yemen', dialCode: '+967', iso: 'YE' },
] as const;

const ASIAN_DIAL_CODES_BY_LENGTH = [...ASIAN_COUNTRY_CODES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length
);

export function parseAsianPhoneParts(raw?: string): {
  dialCode: string;
  nationalNumber: string;
} {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return { dialCode: '+91', nationalNumber: '' };
  }
  if (trimmed.startsWith('+')) {
    const compact = `+${trimmed.slice(1).replace(/[^\d]/g, '')}`;
    const matched = ASIAN_DIAL_CODES_BY_LENGTH.find((c) =>
      compact.startsWith(c.dialCode)
    );
    if (matched) {
      return {
        dialCode: matched.dialCode,
        nationalNumber: compact.slice(matched.dialCode.length),
      };
    }
  }
  return {
    dialCode: '+91',
    nationalNumber: stripPlus91Prefix(trimmed),
  };
}

export function normalizeAsianPhone(
  raw?: string,
  preferredDialCode = '+91'
): {
  valid: boolean;
  formatted: string;
  dialCode: string;
  nationalDigits: string;
  error?: string;
} {
  const trimmed = String(raw || '').trim();
  const baseDialCode =
    ASIAN_COUNTRY_CODES.find((c) => c.dialCode === preferredDialCode)?.dialCode ||
    '+91';

  if (!trimmed) {
    return {
      valid: false,
      formatted: '',
      dialCode: baseDialCode,
      nationalDigits: '',
      error:
        baseDialCode === '+91'
          ? 'Please enter a valid 10-digit Indian mobile number.'
          : 'Please enter a valid mobile number.',
    };
  }

  let activeDialCode = baseDialCode;
  let localPart = trimmed;

  if (trimmed.startsWith('+')) {
    const parsed = parseAsianPhoneParts(trimmed);
    const compactDigits = trimmed.slice(1).replace(/[^\d]/g, '');
    if (`+${compactDigits}`.startsWith(parsed.dialCode)) {
      activeDialCode = parsed.dialCode;
      localPart = parsed.nationalNumber;
    }
  }

  if (activeDialCode === '+91') {
    const indCheck = normalizeIndianPhone(localPart);
    return {
      valid: indCheck.valid,
      formatted: indCheck.formatted,
      dialCode: '+91',
      nationalDigits: indCheck.digits10,
      error: indCheck.error,
    };
  }

  const dialDigits = activeDialCode.replace(/[^\d]/g, '');
  let digits = localPart.replace(/[^\d]/g, '');

  if (
    digits.startsWith(dialDigits) &&
    digits.length >= dialDigits.length + 6
  ) {
    digits = digits.slice(dialDigits.length);
  }
  if (digits.startsWith('0') && digits.length >= 7) {
    digits = digits.slice(1);
  }

  if (digits.length < 6 || digits.length > 13) {
    return {
      valid: false,
      formatted: '',
      dialCode: activeDialCode,
      nationalDigits: digits,
      error: `Please enter a valid mobile number for ${activeDialCode} (6 to 13 digits).`,
    };
  }

  return {
    valid: true,
    formatted: `${activeDialCode}${digits}`,
    dialCode: activeDialCode,
    nationalDigits: digits,
  };
}

export function normalizeIndianPhone(raw?: string): {
  valid: boolean;
  formatted: string;
  digits10: string;
  error?: string;
} {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      formatted: '',
      digits10: '',
      error: 'Please enter a 10-digit Indian mobile number.',
    };
  }

  let digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
    return {
      valid: false,
      formatted: '',
      digits10: digits,
      error:
        'Please enter a valid 10-digit Indian mobile number (with or without +91).',
    };
  }

  return {
    valid: true,
    formatted: `+91${digits}`,
    digits10: digits,
  };
}

export function formatPhoneWithPlus91(raw?: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+') && !trimmed.startsWith('+91')) {
    const asian = normalizeAsianPhone(trimmed);
    if (asian.valid) return asian.formatted;
    return trimmed;
  }
  const parsed = normalizeIndianPhone(trimmed);
  if (parsed.valid) return parsed.formatted;
  return trimmed;
}

export function stripPlus91Prefix(raw?: string): string {
  const trimmed = String(raw || '').trim();
  if (trimmed.startsWith('+91')) {
    return trimmed.slice(3).trim();
  }
  return trimmed;
}

export async function downloadImageAsset(
  src: string,
  filenameBase: string
): Promise<void> {
  if (!src) return;
  const safeBase =
    filenameBase.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') ||
    'product_image';

  const triggerDownload = (href: string, ext: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = `${safeBase}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (src.startsWith('data:')) {
    const mimeMatch = src.match(/^data:image\/([a-zA-Z0-9+.-]+);/i);
    const rawExt = (mimeMatch?.[1] || 'jpg').toLowerCase();
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt.replace('+xml', '');
    triggerDownload(src, ext);
    return;
  }

  const res = await fetch(src);
  if (!res.ok) throw new Error('Could not download product image.');
  const blob = await res.blob();
  const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const objectUrl = URL.createObjectURL(blob);
  try {
    triggerDownload(objectUrl, ext);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }
}

export function buildForgotPasswordWhatsAppUrl(
  phone?: string,
  name?: string
): string {
  const cleanPhone = formatPhoneWithPlus91(phone);
  const cleanName = String(name || '').trim();
  const message = [
    'Hello Glamour Galleria Support,',
    'I forgot my customer account password and would like to request a password reset.',
    cleanPhone ? `Registered Phone: ${cleanPhone}` : 'Registered Phone: (Please enter your phone number)',
    cleanName ? `Name: ${cleanName}` : '',
    'Please update my password and share it with me. Thank you!',
  ]
    .filter(Boolean)
    .join('\n');
  return `https://wa.me/${WHATSAPP_SUPPORT_PHONE}?text=${encodeURIComponent(message)}`;
}

export function normalizePhoneDigits(phone?: string): string {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

export function phoneNumbersMatch(a?: string, b?: string): boolean {
  const ta = String(a || '').trim();
  const tb = String(b || '').trim();
  if (ta.startsWith('+') && tb.startsWith('+')) {
    const fa = ta.replace(/[^\d]/g, '');
    const fb = tb.replace(/[^\d]/g, '');
    if (fa.length >= 6 && fb.length >= 6) {
      return fa === fb;
    }
  }
  const na = normalizePhoneDigits(ta);
  const nb = normalizePhoneDigits(tb);
  if (na.length < 6 || nb.length < 6) return false;
  return na === nb;
}

export const DEFAULT_VIEW_PANEL_CONFIG: ViewPanelConfig = {
  advertisement: {
    enabled: true,
    imageDataUrl: '',
    title: '',
    subtitle: '',
    linkUrl: '',
  },
  discount: {
    enabled: true,
    sectionTitle: 'Special Discounts & Offers',
    headline: '',
    offers: [],
  },
  shopping: {
    enabled: true,
    sectionTitle: 'Shop Our Collection',
    subtitle: 'Handpicked styles & cosmetics available for quick WhatsApp order',
    includeCatalogProducts: true,
    items: [],
  },
  updatedAt: '',
};

export const DEFAULT_HIGHLIGHT_CONFIG: HighlightConfig = {
  upiId: HIGHLIGHT_UPI_ID,
  placementRule: 'top_featured',
  plans: [
    { id: 'hl-3d', label: '3 Days Spotlight', durationDays: 3, price: 49, enabled: true },
    { id: 'hl-7d', label: '7 Days Featured Boost', durationDays: 7, price: 99, enabled: true },
    { id: 'hl-15d', label: '15 Days Top Choice', durationDays: 15, price: 179, enabled: true },
    { id: 'hl-30d', label: '30 Days Monthly Star', durationDays: 30, price: 299, enabled: true },
  ],
  offerSeats: [
    {
      id: 'seat-festive-7d',
      title: 'Special Offer Seat · 7 Days Top Showcase',
      durationDays: 7,
      price: 59,
      originalPrice: 99,
      totalSeats: 10,
      badgeText: 'Limited Offer Seat',
      enabled: true,
    },
    {
      id: 'seat-prime-14d',
      title: 'VIP Offer Seat · 14 Days Storefront Pin',
      durationDays: 14,
      price: 119,
      originalPrice: 199,
      totalSeats: 5,
      badgeText: 'VIP Offer',
      enabled: true,
    },
  ],
  updatedAt: '',
};

export const DEFAULT_ADMIN_PAYMENT_SETTINGS: AdminPaymentSettings = {
  upiId: DEFAULT_ADMIN_UPI_ID,
  upiNumber: '',
  bankAccountName: '',
  bankName: '',
  bankAccountNo: '',
  bankIfscBranch: '',
  qrDataUrl: '',
  updatedAt: '',
};

export const DEFAULT_INR_TO_BDT_RATE = 1.45;

export const DEFAULT_BANGLADESH_CONFIG: BangladeshConfig = {
  enabled: true,
  inrToBdtRate: DEFAULT_INR_TO_BDT_RATE,
  whatsappNumber: WHATSAPP_SUPPORT_PHONE,
  updatedAt: '',
};

export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: 'Glamour Galleria',
  tagline: 'Your Style, Our Priority',
  logoDataUrl: '',
  backgroundImageDataUrl: '',
  address: '',
  mobile: '',
  whatsapp: '',
  gstin: '',
  currencySymbol: '₹',
  currencyCode: 'INR',
  invoicePrefix: 'GG-',
  upiId: DEFAULT_ADMIN_UPI_ID,
  upiNumber: '',
  bankAccountName: '',
  bankName: '',
  bankAccountNo: '',
  bankIfscBranch: '',
  paymentQrDataUrl: '',
  invoiceFooterNote:
    'Every piece is chosen with love to make you feel confident and beautiful. We truly appreciate your trust and support. If you have any question about your order, just message us anytime.',
  socialTagLine: 'Loved your order? Tag us @glamour.galleria.in and share your look with us!',
  lowStockThreshold: 5,
  viewPanel: DEFAULT_VIEW_PANEL_CONFIG,
  highlightConfig: DEFAULT_HIGHLIGHT_CONFIG,
  bangladeshConfig: DEFAULT_BANGLADESH_CONFIG,
  googleSheetsWebhookUrl: '',
};

export function mergeAdminPaymentSettings(
  raw?: Partial<AdminPaymentSettings> | null,
  fallbackSettings?: Partial<BusinessSettings> | null
): AdminPaymentSettings {
  const upi =
    String(
      raw?.upiId ||
        fallbackSettings?.upiId ||
        fallbackSettings?.highlightConfig?.upiId ||
        DEFAULT_ADMIN_UPI_ID
    ).trim() || DEFAULT_ADMIN_UPI_ID;

  return {
    upiId: upi,
    upiNumber: String(raw?.upiNumber ?? fallbackSettings?.upiNumber ?? '').trim(),
    bankAccountName: String(
      raw?.bankAccountName ?? fallbackSettings?.bankAccountName ?? ''
    ).trim(),
    bankName: String(raw?.bankName ?? fallbackSettings?.bankName ?? '').trim(),
    bankAccountNo: String(
      raw?.bankAccountNo ?? fallbackSettings?.bankAccountNo ?? ''
    ).trim(),
    bankIfscBranch: String(
      raw?.bankIfscBranch ?? fallbackSettings?.bankIfscBranch ?? ''
    ).trim(),
    qrDataUrl: String(
      raw?.qrDataUrl ?? fallbackSettings?.paymentQrDataUrl ?? ''
    ).trim(),
    updatedAt: String(raw?.updatedAt || ''),
  };
}

export interface EffectivePaymentDetails {
  source: 'product' | 'seller' | 'admin';
  recipientType: 'admin' | 'seller';
  recipientName: string;
  sellerId?: string;
  upiId: string;
  upiNumber: string;
  bankAccountName: string;
  bankName: string;
  bankAccountNo: string;
  bankIfscBranch: string;
  qrDataUrl: string;
}

export function buildUpiDeepLink(
  upiId: string,
  payeeName: string,
  amount: number
): string {
  const cleanUpi = String(upiId || '').trim();
  if (!cleanUpi) return '';
  const pn = encodeURIComponent(payeeName || 'Glamour Galleria');
  const am = Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : '0.00';
  return `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${pn}&am=${am}&cu=INR`;
}

export function resolveEffectivePaymentDetails(params: {
  product?: Partial<Product> | null;
  sellerProfile?: SellerPublicPaymentProfile | null;
  adminPaymentSettings?: Partial<AdminPaymentSettings> | null;
  settings?: Partial<BusinessSettings> | null;
}): EffectivePaymentDetails {
  const adminMerged = mergeAdminPaymentSettings(
    params.adminPaymentSettings,
    params.settings
  );

  const prod = params.product;
  const pUpi = String(prod?.sellerPaymentUpiId || '').trim();
  const pHolder = String(prod?.sellerPaymentBankAccountName || '').trim();
  const pBank = String(prod?.sellerPaymentBankName || '').trim();
  const pAcc = String(prod?.sellerPaymentBankAccountNo || '').trim();
  const pIfsc = String(prod?.sellerPaymentBankIfscBranch || '').trim();
  const pQr = String(prod?.sellerPaymentQrDataUrl || '').trim();

  if (pUpi || pHolder || pBank || pAcc || pIfsc || pQr) {
    return {
      source: 'product',
      recipientType: 'seller',
      recipientName: prod?.sellerName || 'Seller Product Payment',
      sellerId: prod?.sellerId,
      upiId: pUpi,
      upiNumber: '',
      bankAccountName: pHolder,
      bankName: pBank,
      bankAccountNo: pAcc,
      bankIfscBranch: pIfsc,
      qrDataUrl: pQr,
    };
  }

  const sp = params.sellerProfile;
  if (sp) {
    const sUpi = String(sp.upiId || '').trim();
    const sHolder = String(sp.bankAccountName || '').trim();
    const sBank = String(sp.bankName || '').trim();
    const sAcc = String(sp.bankAccountNo || '').trim();
    const sIfsc = String(sp.bankIfscBranch || '').trim();
    const sQr = String(sp.qrDataUrl || '').trim();
    if (sUpi || sHolder || sBank || sAcc || sIfsc || sQr) {
      return {
        source: 'seller',
        recipientType: 'seller',
        recipientName: sp.sellerName || prod?.sellerName || 'Seller Account',
        sellerId: sp.sellerId || prod?.sellerId,
        upiId: sUpi,
        upiNumber: '',
        bankAccountName: sHolder,
        bankName: sBank,
        bankAccountNo: sAcc,
        bankIfscBranch: sIfsc,
        qrDataUrl: sQr,
      };
    }
  }

  return {
    source: 'admin',
    recipientType: 'admin',
    recipientName:
      String(params.settings?.businessName || 'Glamour Galleria').trim() ||
      'Glamour Galleria',
    upiId: adminMerged.upiId || DEFAULT_ADMIN_UPI_ID,
    upiNumber: adminMerged.upiNumber || '',
    bankAccountName: adminMerged.bankAccountName || '',
    bankName: adminMerged.bankName || '',
    bankAccountNo: adminMerged.bankAccountNo || '',
    bankIfscBranch: adminMerged.bankIfscBranch || '',
    qrDataUrl: adminMerged.qrDataUrl || '',
  };
}

export function mergeBusinessSettings(
  raw?: Partial<BusinessSettings> | null
): BusinessSettings {
  const rawVp = raw?.viewPanel;
  const rawHc = raw?.highlightConfig;
  const resolvedUpi =
    String(raw?.upiId || DEFAULT_ADMIN_UPI_ID).trim() || DEFAULT_ADMIN_UPI_ID;
  const resolvedHighlightUpi =
    String(rawHc?.upiId || raw?.upiId || DEFAULT_HIGHLIGHT_CONFIG.upiId).trim() ||
    DEFAULT_ADMIN_UPI_ID;

  return {
    ...DEFAULT_SETTINGS,
    ...(raw || {}),
    upiId: resolvedUpi,
    viewPanel: {
      advertisement: {
        ...DEFAULT_VIEW_PANEL_CONFIG.advertisement,
        ...(rawVp?.advertisement || {}),
      },
      discount: {
        ...DEFAULT_VIEW_PANEL_CONFIG.discount,
        ...(rawVp?.discount || {}),
        offers: Array.isArray(rawVp?.discount?.offers)
          ? rawVp.discount.offers
          : DEFAULT_VIEW_PANEL_CONFIG.discount.offers,
      },
      shopping: {
        ...DEFAULT_VIEW_PANEL_CONFIG.shopping,
        ...(rawVp?.shopping || {}),
        items: Array.isArray(rawVp?.shopping?.items)
          ? rawVp.shopping.items
          : DEFAULT_VIEW_PANEL_CONFIG.shopping.items,
      },
      updatedAt: rawVp?.updatedAt || '',
    },
    highlightConfig: {
      upiId: resolvedHighlightUpi,
      placementRule:
        rawHc?.placementRule === 'priority_category' ||
        rawHc?.placementRule === 'featured_badge_only'
          ? rawHc.placementRule
          : 'top_featured',
      plans: Array.isArray(rawHc?.plans)
        ? rawHc.plans
        : DEFAULT_HIGHLIGHT_CONFIG.plans,
      offerSeats: Array.isArray(rawHc?.offerSeats)
        ? rawHc.offerSeats
        : DEFAULT_HIGHLIGHT_CONFIG.offerSeats,
      updatedAt: rawHc?.updatedAt || '',
    },
    bangladeshConfig: {
      enabled: raw?.bangladeshConfig?.enabled !== false,
      inrToBdtRate:
        Number.isFinite(Number(raw?.bangladeshConfig?.inrToBdtRate)) &&
        Number(raw?.bangladeshConfig?.inrToBdtRate) > 0
          ? Number(Number(raw?.bangladeshConfig?.inrToBdtRate).toFixed(4))
          : DEFAULT_BANGLADESH_CONFIG.inrToBdtRate,
      whatsappNumber:
        String(
          raw?.bangladeshConfig?.whatsappNumber ||
            raw?.whatsapp ||
            DEFAULT_BANGLADESH_CONFIG.whatsappNumber
        )
          .replace(/[^\d]/g, '') || DEFAULT_BANGLADESH_CONFIG.whatsappNumber,
      updatedAt: String(raw?.bangladeshConfig?.updatedAt || ''),
    },
    googleSheetsWebhookUrl: String(raw?.googleSheetsWebhookUrl || '').trim(),
  };
}

export function createEmptyWorkspace(): WorkspaceData {
  return {
    settings: { ...DEFAULT_SETTINGS },
    paymentSettings: { ...DEFAULT_ADMIN_PAYMENT_SETTINGS },
    clients: [],
    products: [],
    invoices: [],
    payments: [],
    expenses: [],
    orders: [],
    sellerApplications: [],
    supportChats: [],
    highlightRequests: [],
  };
}

export function getCustomerReferralCode(client: {
  id: string;
  mobile?: string;
  referralCode?: string;
}): string {
  if (client.referralCode && client.referralCode.trim()) {
    return client.referralCode.trim().toUpperCase();
  }
  const phoneDigits = normalizePhoneDigits(client.mobile);
  const phoneTail = phoneDigits ? phoneDigits.slice(-4) : '0000';
  const idClean = client.id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const idTail = idClean.slice(-4) || 'GLAM';
  return `GG${phoneTail}${idTail}`;
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIsoDate(baseIsoDate: string, days: number): string {
  const parsed = baseIsoDate ? new Date(`${baseIsoDate}T00:00:00`) : new Date();
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatCurrency(amount: number, symbol = '₹'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safe);
  return `${symbol} ${formatted}`;
}

export function generateNextInvoiceNumber(invoices: Invoice[], prefix = 'GG-'): string {
  let maxNum = 0;
  for (const inv of invoices) {
    const match = inv.invoiceNumber.match(/(\d+)\s*$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

function getRandomInt(maxExclusive: number): number {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

export function generateProductNumber(
  existingNumbers?: Iterable<string | undefined>
): string {
  const used = new Set<string>();
  if (existingNumbers) {
    for (const num of existingNumbers) {
      const clean = String(num || '').trim().toUpperCase();
      if (clean) used.add(clean);
    }
  }

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 25; attempt += 1) {
    let prefixDigits = '';
    for (let i = 0; i < 4; i += 1) {
      prefixDigits += String(getRandomInt(10));
    }
    const letter = letters[getRandomInt(letters.length)];
    let suffixDigits = '';
    for (let i = 0; i < 7; i += 1) {
      suffixDigits += String(getRandomInt(10));
    }
    const candidate = `SPDA${prefixDigits}${letter}${suffixDigits}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  const fallbackTail = String(Date.now()).slice(-7).padStart(7, '0');
  return `SPDA${String(getRandomInt(10000)).padStart(4, '0')}${letters[getRandomInt(letters.length)]}${fallbackTail}`;
}

export function computeLineItem(
  item: Omit<InvoiceLineItem, 'lineTotal' | 'lineCost' | 'lineProfit'>
): InvoiceLineItem {
  const qty = Math.max(1, Number(item.quantity) || 1);
  const purchase = Math.max(0, Number(item.purchasePrice) || 0);
  const selling = Math.max(0, Number(item.sellingPrice) || 0);
  const original = item.originalPrice !== undefined ? Math.max(0, Number(item.originalPrice) || 0) : undefined;
  const lineTotal = Number((qty * selling).toFixed(2));
  const lineCost = Number((qty * purchase).toFixed(2));
  return {
    ...item,
    quantity: qty,
    originalPrice: original,
    purchasePrice: purchase,
    sellingPrice: selling,
    lineTotal,
    lineCost,
    lineProfit: Number((lineTotal - lineCost).toFixed(2)),
  };
}

export function computeInvoiceTotals(params: {
  items: InvoiceLineItem[];
  discount: number;
  gstPercent?: number;
  deliveryCharge: number;
  paidAmount: number;
}) {
  const subtotal = Number(
    params.items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2)
  );
  const totalPurchaseCost = Number(
    params.items.reduce((s, i) => s + i.lineCost, 0).toFixed(2)
  );
  const discount = Math.max(0, Number(params.discount) || 0);
  const gstPercent = Math.max(0, Number(params.gstPercent) || 0);
  const taxable = Math.max(0, subtotal - discount);
  const gstAmount = Number(((taxable * gstPercent) / 100).toFixed(2));
  const deliveryCharge = Math.max(0, Number(params.deliveryCharge) || 0);
  const totalAmount = Number((taxable + gstAmount + deliveryCharge).toFixed(2));
  const paidAmount = Number(
    Math.min(totalAmount, Math.max(0, Number(params.paidAmount) || 0)).toFixed(2)
  );
  const dueAmount = Number(Math.max(0, totalAmount - paidAmount).toFixed(2));
  const profitAmount = Number((taxable - totalPurchaseCost).toFixed(2));
  return {
    subtotal,
    totalPurchaseCost,
    discount,
    gstPercent,
    gstAmount,
    deliveryCharge,
    totalAmount,
    paidAmount,
    dueAmount,
    profitAmount,
  };
}

export function suggestTrackingUrl(courierName: string): string {
  const c = (courierName || '').toLowerCase();
  if (c.includes('xpress')) return 'https://www.xpressbees.com/shipment/tracking';
  if (c.includes('delhivery')) return 'https://www.delhivery.com/tracking';
  if (c.includes('blue')) return 'https://www.bluedart.com/tracking';
  if (c.includes('dtdc')) return 'https://www.dtdc.in/tracking.asp';
  if (c.includes('ekart')) return 'https://ekartlogistics.com/track';
  if (c.includes('india post') || c.includes('speed post'))
    return 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx';
  if (c.includes('shadowfax')) return 'https://tracker.shadowfax.in/';
  return '';
}

export function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  return `${match[3]} / ${match[2]} / ${match[1].slice(2)}`;
}

export function buildWhatsAppInvoiceUrl(
  invoice: Invoice,
  settings: BusinessSettings
): { url: string; message: string } {
  const sym = settings.currencySymbol || '₹';
  const itemLines = invoice.items
    .map(
      (i, idx) =>
        `${idx + 1}. ${i.productName}${i.size ? ` (${i.size})` : ''} x ${i.quantity} = ${formatCurrency(i.lineTotal, sym)}`
    )
    .join('\n');

  const message = [
    `*${settings.businessName || 'Glamour Galleria'}*`,
    settings.tagline ? `_${settings.tagline}_` : '',
    `Invoice No: *${invoice.invoiceNumber}*`,
    `Order Date: ${invoice.invoiceDate}`,
    invoice.deliveryDate ? `Delivery Date: ${invoice.deliveryDate}` : '',
    `Customer: ${invoice.customerName}`,
    '',
    '*Order Items:*',
    itemLines,
    '',
    `Subtotal: ${formatCurrency(invoice.subtotal, sym)}`,
    invoice.discount > 0 ? `Discount: -${formatCurrency(invoice.discount, sym)}` : '',
    invoice.gstAmount && invoice.gstAmount > 0
      ? `GST (${invoice.gstPercent || 0}%): ${formatCurrency(invoice.gstAmount, sym)}`
      : '',
    invoice.deliveryCharge > 0
      ? `Delivery Charge: ${formatCurrency(invoice.deliveryCharge, sym)}`
      : '',
    `*Grand Total: ${formatCurrency(invoice.totalAmount, sym)}*`,
    `Paid: ${formatCurrency(invoice.paidAmount, sym)}`,
    invoice.dueAmount > 0 ? `*Due Amount: ${formatCurrency(invoice.dueAmount, sym)}*` : 'Status: Paid in Full',
    invoice.courierName || invoice.trackingNumber
      ? `\nDelivery: ${invoice.courierName || 'Courier'}${invoice.trackingNumber ? ` (AWB: ${invoice.trackingNumber})` : ''} · ${invoice.deliveryStatus}`
      : '',
    invoice.trackingUrl ? `Track: ${invoice.trackingUrl}` : '',
    '',
    settings.invoiceFooterNote || 'Thank you for shopping with us!',
  ]
    .filter(Boolean)
    .join('\n');

  const rawPhone = (invoice.customerWhatsapp || invoice.customerMobile || '').replace(/[^\d]/g, '');
  const phoneWithCountry =
    rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;

  const url = phoneWithCountry
    ? `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return { url, message };
}

export async function exportInvoiceElementToPdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#12100E',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png', 1.0);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgProps = pdf.getImageProperties(imgData);
  const renderHeight = (imgProps.height * pageWidth) / imgProps.width;

  if (renderHeight <= pageHeight + 2) {
    const targetH = Math.min(renderHeight, pageHeight);
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, targetH, undefined, 'FAST');
  } else {
    let remaining = renderHeight;
    let position = 0;
    while (remaining > 0) {
      pdf.addImage(imgData, 'PNG', 0, position, pageWidth, renderHeight, undefined, 'FAST');
      remaining -= pageHeight;
      if (remaining > 1.5) {
        pdf.addPage();
        position -= pageHeight;
      } else {
        break;
      }
    }
  }

  pdf.save(filename);
}

export function resizeImageFileToDataUrl(
  file: File,
  maxSize = 1000,
  options: {
    quality?: number;
    preserveTransparency?: boolean;
    maxDataUrlLength?: number;
    maxCompressedBytes?: number;
    maxFileBytes?: number | false;
  } = {}
): Promise<string> {
  const {
    quality = 0.86,
    preserveTransparency = false,
    maxDataUrlLength = 132_000, // ~98KB binary base64 envelope
    maxCompressedBytes = TARGET_COMPRESSED_IMAGE_BYTES,
  } = options;

  return new Promise((resolve, reject) => {
    const typeErr = validateImageFileType(file);
    if (typeErr) {
      reject(new Error(typeErr));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const renderAt = (targetMax: number, q: number, mime: string): string => {
          const canvas = document.createElement('canvas');
          let w = img.width || targetMax;
          let h = img.height || targetMax;
          if (w > targetMax || h > targetMax) {
            if (w > h) {
              h = Math.max(1, Math.round((h * targetMax) / w));
              w = targetMax;
            } else {
              w = Math.max(1, Math.round((w * targetMax) / h));
              h = targetMax;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return String(reader.result);
          if (mime === 'image/jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
          }
          ctx.drawImage(img, 0, 0, w, h);
          return canvas.toDataURL(mime, q);
        };

        const prefersAlpha =
          preserveTransparency &&
          (file.type === 'image/png' ||
            file.type === 'image/webp' ||
            file.type === 'image/svg+xml');
        const primaryMime = prefersAlpha ? 'image/webp' : 'image/jpeg';

        // Clamp effective limits strictly under 100KB (102,400 bytes)
        const effectiveByteLimit = Math.min(
          maxCompressedBytes,
          MAX_COMPRESSED_IMAGE_BYTES - 1024
        );
        const effectiveCharLimit = Math.min(
          maxDataUrlLength,
          Math.floor((effectiveByteLimit * 4) / 3) + 64
        );

        const fitsBudget = (url: string) =>
          estimateDataUrlBinaryBytes(url) <= effectiveByteLimit &&
          url.length <= effectiveCharLimit;

        let currentMax = Math.max(240, maxSize);
        let currentQuality = Math.min(0.9, Math.max(0.5, quality));
        let activeMime = primaryMime;
        let output = renderAt(currentMax, currentQuality, activeMime);

        // Fallback if browser does not support WebP encoding
        if (prefersAlpha && !output.startsWith('data:image/webp')) {
          activeMime = 'image/jpeg';
          output = renderAt(currentMax, currentQuality, activeMime);
        }

        // First step down quality smoothly to preserve crisp dimensions
        const qualitySteps = [0.78, 0.68, 0.58, 0.48, 0.38];
        for (const qStep of qualitySteps) {
          if (fitsBudget(output)) break;
          if (qStep < currentQuality) {
            currentQuality = qStep;
            output = renderAt(currentMax, currentQuality, activeMime);
          }
        }

        // If still over budget (or alpha WebP is heavy), scale down dimensions step by step
        let dimAttempts = 0;
        while (!fitsBudget(output) && dimAttempts < 6) {
          dimAttempts += 1;
          currentMax = Math.max(280, Math.round(currentMax * 0.78));
          if (activeMime !== 'image/jpeg' && dimAttempts >= 2) {
            activeMime = 'image/jpeg';
          }
          currentQuality = Math.max(0.32, currentQuality - 0.05);
          output = renderAt(currentMax, currentQuality, activeMime);
        }

        resolve(output);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
