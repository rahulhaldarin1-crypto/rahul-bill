import { useEffect, useState } from 'react';
import { BangladeshConfig, BusinessSettings, Client } from '../types/business';
import { WHATSAPP_SUPPORT_PHONE } from './calculations';

export const DEFAULT_INR_TO_BDT_RATE = 1.45;
export const BANGLADESH_CHARGE_NOTICE =
  'ডেলিভারি চার্জ ও কাস্টম চার্জ প্রজোজো হবে';

export const DEFAULT_BANGLADESH_CONFIG: BangladeshConfig = {
  enabled: true,
  inrToBdtRate: DEFAULT_INR_TO_BDT_RATE,
  whatsappNumber: WHATSAPP_SUPPORT_PHONE,
  updatedAt: '',
};

export interface GeoRegionResult {
  countryCode: string | null;
  isBangladesh: boolean;
  source: 'vercel-ip-country' | 'client-fallback' | 'none';
}

export function detectClientBangladeshFallback(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const tz = String(
      Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    ).trim();
    if (tz === 'Asia/Dhaka' || tz === 'Asia/Dacca') {
      return true;
    }
  } catch {
    // ignore timezone errors
  }

  try {
    const langs = [
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
      navigator.language,
    ]
      .filter(Boolean)
      .map((l) => String(l).trim().toLowerCase());
    if (langs.some((l) => l === 'bn-bd' || l.startsWith('bn-bd-') || l.endsWith('-bd'))) {
      return true;
    }
  } catch {
    // ignore locale errors
  }

  return false;
}

let cachedGeoPromise: Promise<GeoRegionResult> | null = null;

export async function fetchGeoRegion(): Promise<GeoRegionResult> {
  if (!cachedGeoPromise) {
    cachedGeoPromise = (async () => {
      const clientFallback = detectClientBangladeshFallback();
      try {
        const res = await fetch('/api/geo', {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = (await res.json()) as {
            countryCode?: string | null;
            isBangladesh?: boolean;
          };
          const code = data?.countryCode
            ? String(data.countryCode).trim().toUpperCase()
            : null;
          if (code === 'BD' || clientFallback) {
            return {
              countryCode: code === 'BD' ? 'BD' : clientFallback ? 'BD' : code,
              isBangladesh: true,
              source: code === 'BD' ? 'vercel-ip-country' : 'client-fallback',
            };
          }
          if (code) {
            return {
              countryCode: code,
              isBangladesh: false,
              source: 'vercel-ip-country',
            };
          }
        }
      } catch {
        // network fallback below
      }

      return {
        countryCode: clientFallback ? 'BD' : null,
        isBangladesh: clientFallback,
        source: clientFallback ? 'client-fallback' : 'none',
      };
    })();
  }
  return cachedGeoPromise;
}

export function useBangladeshDetection(): {
  isBangladesh: boolean;
  countryCode: string | null;
  resolved: boolean;
} {
  const [state, setState] = useState<{
    isBangladesh: boolean;
    countryCode: string | null;
    resolved: boolean;
  }>(() => {
    const fallbackBd = detectClientBangladeshFallback();
    return {
      isBangladesh: fallbackBd,
      countryCode: fallbackBd ? 'BD' : null,
      resolved: false,
    };
  });

  useEffect(() => {
    let active = true;
    void fetchGeoRegion().then((geo) => {
      if (!active) return;
      setState({
        isBangladesh: geo.isBangladesh,
        countryCode: geo.countryCode,
        resolved: true,
      });
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

export function resolveBangladeshConfig(
  settings?: Partial<BusinessSettings> | null
): BangladeshConfig {
  const raw = settings?.bangladeshConfig;
  const parsedRate = Number(raw?.inrToBdtRate);
  const inrToBdtRate =
    Number.isFinite(parsedRate) && parsedRate > 0
      ? Number(parsedRate.toFixed(4))
      : DEFAULT_INR_TO_BDT_RATE;

  const normalizedPhone = normalizeWhatsappDigits(
    raw?.whatsappNumber || settings?.whatsapp || WHATSAPP_SUPPORT_PHONE
  );

  return {
    enabled: raw?.enabled !== false,
    inrToBdtRate,
    whatsappNumber: normalizedPhone || WHATSAPP_SUPPORT_PHONE,
    updatedAt: String(raw?.updatedAt || ''),
  };
}

export function convertInrToBdt(amountInr: number, rate: number): number {
  const validRate =
    Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_INR_TO_BDT_RATE;
  const safeAmount = Math.max(0, Number(amountInr) || 0);
  return Math.round(safeAmount * validRate);
}

export function formatBdt(amountBdt: number): string {
  const rounded = Math.round(Math.max(0, Number(amountBdt) || 0));
  return `৳${rounded.toLocaleString('en-IN')}`;
}

export function formatInrAndBdt(amountInr: number, rate: number): {
  inr: string;
  bdt: string;
  bdtValue: number;
} {
  const bdtValue = convertInrToBdt(amountInr, rate);
  return {
    inr: `₹${Math.max(0, Number(amountInr) || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
    })}`,
    bdt: formatBdt(bdtValue),
    bdtValue,
  };
}

export function normalizeWhatsappDigits(phone?: string): string {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

export function displayCustomerPhone(raw?: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'not provided') {
    return '';
  }
  return trimmed;
}

export function isBangladeshClient(
  client: Pick<Client, 'detectedCountry' | 'mobile' | 'whatsapp'>
): boolean {
  if (String(client.detectedCountry || '').trim().toUpperCase() === 'BD') {
    return true;
  }
  const mob = String(client.mobile || '').trim();
  const wa = String(client.whatsapp || '').trim();
  const mobDigits = mob.replace(/[^\d]/g, '');
  const waDigits = wa.replace(/[^\d]/g, '');
  return (
    mob.startsWith('+880') ||
    wa.startsWith('+880') ||
    mobDigits.startsWith('880') ||
    waDigits.startsWith('880')
  );
}

export function parseProductVariantOptions(size?: string): string[] {
  const raw = String(size || '').trim();
  if (!raw) return [];
  const parts = raw
    .split(/[,/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

export function openExternalLink(url: string): void {
  if (typeof document === 'undefined' || !url) return;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export interface WhatsAppOrderItemInput {
  id: string;
  productId?: string;
  name: string;
  priceInr: number;
  quantity: number;
  selectedVariant?: string;
  color?: string;
  sellerId?: string;
  sellerName?: string;
}

export function buildBangladeshWhatsAppOrderUrl(params: {
  whatsappNumber?: string;
  inrToBdtRate: number;
  items: WhatsAppOrderItemInput[];
  customer?: Client | null;
  productUrl?: string;
  note?: string;
}): string {
  const targetDigits =
    normalizeWhatsappDigits(params.whatsappNumber) || WHATSAPP_SUPPORT_PHONE;
  const rate =
    Number.isFinite(params.inrToBdtRate) && params.inrToBdtRate > 0
      ? params.inrToBdtRate
      : DEFAULT_INR_TO_BDT_RATE;

  const lines: string[] = [
    'Assalamu Alaikum / Hello Glamour Galleria,',
    'I would like to order from Bangladesh:',
    '',
  ];

  let totalInr = 0;
  let totalBdt = 0;

  params.items.forEach((item, index) => {
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const unitInr = Math.max(0, Number(item.priceInr) || 0);
    const unitBdt = convertInrToBdt(unitInr, rate);
    const lineInr = Number((unitInr * qty).toFixed(2));
    const lineBdt = unitBdt * qty;
    totalInr += lineInr;
    totalBdt += lineBdt;

    const prefix = params.items.length > 1 ? `${index + 1}. ` : '';
    lines.push(`${prefix}Product: ${item.name}`);
    if (item.selectedVariant) {
      lines.push(`Size / Variant: ${item.selectedVariant}`);
    }
    if (item.color) {
      lines.push(`Color: ${item.color}`);
    }
    lines.push(`Quantity: ${qty}`);
    lines.push(
      `Unit Price: ₹${unitInr.toLocaleString('en-IN')} / ${formatBdt(unitBdt)}`
    );
    if (qty > 1 || params.items.length > 1) {
      lines.push(
        `Subtotal: ₹${lineInr.toLocaleString('en-IN')} / ${formatBdt(lineBdt)}`
      );
    }
    if (item.sellerId || item.sellerName) {
      const sellerLabel = [
        item.sellerName ? item.sellerName : '',
        item.sellerId ? `(ID: ${item.sellerId})` : '',
      ]
        .filter(Boolean)
        .join(' ');
      lines.push(`Seller: ${sellerLabel}`);
    }
    if (params.items.length === 1 && params.productUrl) {
      lines.push(`Product Link: ${params.productUrl}`);
    }
    lines.push('');
  });

  lines.push(
    `Total Amount: ₹${Number(totalInr.toFixed(2)).toLocaleString('en-IN')} / ${formatBdt(totalBdt)}`
  );

  if (params.customer) {
    lines.push('');
    lines.push('Customer Details:');
    if (params.customer.name) lines.push(`Name: ${params.customer.name}`);
    if (params.customer.email) lines.push(`Email: ${params.customer.email}`);
    const cleanPhone = displayCustomerPhone(params.customer.mobile);
    if (cleanPhone) lines.push(`Phone: ${cleanPhone}`);
    if (params.customer.address) {
      lines.push(`Address: ${params.customer.address}`);
    }
  }

  if (params.note && params.note.trim()) {
    lines.push(`Note: ${params.note.trim()}`);
  }

  lines.push('');
  lines.push(`Note: ${BANGLADESH_CHARGE_NOTICE}`);

  return `https://wa.me/${targetDigits}?text=${encodeURIComponent(
    lines.join('\n')
  )}`;
}
