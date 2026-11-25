import fs from 'fs';
import path from 'path';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const FIREBASE_PROJECT_ID = 'rahul-bill';
const DEFAULT_SITE_URL = 'https://glamour-galleria.vercel.app';
const DEFAULT_TITLE = 'Glamour Galleria - Online Shopping';
const DEFAULT_DESCRIPTION =
  'Glamour Galleria - Online Shopping. Your Style, Our Priority.';
const DEFAULT_IMAGE_PATH = '/pwa-512x512.png';

let cachedHtmlTemplate: { html: string; origin: string; fetchedAt: number } | null =
  null;

interface ResolvedProductMeta {
  id: string;
  name: string;
  description: string;
  price?: number;
  imageUrl: string;
}

function escapeHtmlAttr(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function slugifyProductName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function decodeFirestoreValue(val: unknown): unknown {
  if (!val || typeof val !== 'object') return undefined;
  const v = val as Record<string, unknown>;
  if ('stringValue' in v) return String(v.stringValue || '');
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return String(v.timestampValue || '');
  if ('arrayValue' in v) {
    const arr = (v.arrayValue as { values?: unknown[] } | undefined)?.values;
    return Array.isArray(arr) ? arr.map(decodeFirestoreValue) : [];
  }
  if ('mapValue' in v) {
    const fields =
      (v.mapValue as { fields?: Record<string, unknown> } | undefined)?.fields ||
      {};
    const out: Record<string, unknown> = {};
    for (const [k, fv] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(fv);
    }
    return out;
  }
  return undefined;
}

function decodeFirestoreDocument(
  docJson: unknown
): Record<string, unknown> | null {
  if (!docJson || typeof docJson !== 'object') return null;
  const obj = docJson as { fields?: Record<string, unknown>; name?: string };
  if (!obj.fields || typeof obj.fields !== 'object') return null;
  const parsed: Record<string, unknown> = {};
  for (const [k, fv] of Object.entries(obj.fields)) {
    parsed[k] = decodeFirestoreValue(fv);
  }
  if (!parsed.id && typeof obj.name === 'string') {
    const seg = obj.name.split('/').pop();
    if (seg) parsed.id = seg;
  }
  return parsed;
}

function pickHttpImageUrl(record: Record<string, unknown>, fallbackOrigin: string): string {
  const candidates: string[] = [];
  if (Array.isArray(record.imageDataUrls)) {
    for (const u of record.imageDataUrls) {
      if (typeof u === 'string' && u.trim()) candidates.push(u.trim());
    }
  }
  if (typeof record.imageDataUrl === 'string' && record.imageDataUrl.trim()) {
    candidates.push(record.imageDataUrl.trim());
  }
  const httpCandidate = candidates.find((u) => /^https?:\/\//i.test(u));
  if (httpCandidate) return httpCandidate;
  return `${fallbackOrigin}${DEFAULT_IMAGE_PATH}`;
}

function buildProductDescription(
  name: string,
  rawDesc: unknown,
  priceValue: unknown
): string {
  const cleanedDesc = String(rawDesc || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleanedDesc) {
    return cleanedDesc.length > 180
      ? `${cleanedDesc.slice(0, 177).trim()}...`
      : cleanedDesc;
  }
  const numericPrice = Number(priceValue);
  if (Number.isFinite(numericPrice) && numericPrice > 0) {
    const formattedPrice = new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: numericPrice % 1 === 0 ? 0 : 2,
    }).format(numericPrice);
    return `${name} — ₹${formattedPrice} on Glamour Galleria.`;
  }
  return `${name} on Glamour Galleria.`;
}

function toResolvedProductMeta(
  record: Record<string, unknown>,
  fallbackOrigin: string,
  overrideId?: string
): ResolvedProductMeta | null {
  const name = String(record.name || '').trim();
  if (!name) return null;
  const sellerId = String(record.sellerId || '').trim();
  const sellerStatus = String(record.sellerApprovalStatus || '').trim();
  if (sellerId && sellerStatus && sellerStatus !== 'approved') {
    return null;
  }
  const priceRaw = record.sellingPrice ?? record.price;
  const priceNum = Number(priceRaw);
  return {
    id: overrideId || String(record.id || '').trim(),
    name,
    description: buildProductDescription(name, record.description, priceNum),
    price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : undefined,
    imageUrl: pickHttpImageUrl(record, fallbackOrigin),
  };
}

async function fetchFirestoreJson(urlPath: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const resp = await fetch(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${urlPath}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }
    );
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveProductByKey(
  rawKey: string,
  fallbackOrigin: string
): Promise<ResolvedProductMeta | null> {
  const cleanKey = String(rawKey || '').trim();
  if (!cleanKey) return null;

  const strippedCatId = cleanKey.startsWith('cat-')
    ? cleanKey.slice(4).trim()
    : cleanKey;

  // 1. Direct lookup on products/{id} when key looks like a Firestore document ID
  if (/^[a-zA-Z0-9_-]{1,128}$/.test(strippedCatId)) {
    const docJson = await fetchFirestoreJson(
      `products/${encodeURIComponent(strippedCatId)}`
    );
    const decoded = decodeFirestoreDocument(docJson);
    if (decoded) {
      const meta = toResolvedProductMeta(decoded, fallbackOrigin, cleanKey);
      if (meta) return meta;
    }
  }

  // 2. Scan products collection & settings/business custom shopping items in parallel
  const normalizedTarget = cleanKey.toLowerCase();
  const normalizedSlug = slugifyProductName(cleanKey);

  const [productsJson, settingsJson] = await Promise.all([
    fetchFirestoreJson('products?pageSize=200'),
    fetchFirestoreJson('settings/business'),
  ]);

  if (
    productsJson &&
    typeof productsJson === 'object' &&
    Array.isArray((productsJson as { documents?: unknown[] }).documents)
  ) {
    for (const d of (productsJson as { documents: unknown[] }).documents) {
      const decoded = decodeFirestoreDocument(d);
      if (!decoded) continue;
      const docId = String(decoded.id || '').trim();
      const docName = String(decoded.name || '').trim();
      const matchesId =
        docId.toLowerCase() === normalizedTarget ||
        `cat-${docId}`.toLowerCase() === normalizedTarget ||
        docId.toLowerCase() === strippedCatId.toLowerCase();
      const matchesSlug =
        Boolean(normalizedSlug) && slugifyProductName(docName) === normalizedSlug;
      if (matchesId || matchesSlug) {
        const meta = toResolvedProductMeta(decoded, fallbackOrigin, cleanKey);
        if (meta) return meta;
      }
    }
  }

  const settingsDecoded = decodeFirestoreDocument(settingsJson);
  if (settingsDecoded && typeof settingsDecoded.viewPanel === 'object' && settingsDecoded.viewPanel) {
    const viewPanel = settingsDecoded.viewPanel as Record<string, unknown>;
    const shopping = viewPanel.shopping as Record<string, unknown> | undefined;
    const customItems = Array.isArray(shopping?.items) ? shopping.items : [];
    for (const rawItem of customItems) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const item = rawItem as Record<string, unknown>;
      const itemId = String(item.id || '').trim();
      const itemName = String(item.name || '').trim();
      const matchesId =
        itemId.toLowerCase() === normalizedTarget ||
        itemId.toLowerCase() === strippedCatId.toLowerCase();
      const matchesSlug =
        Boolean(normalizedSlug) && slugifyProductName(itemName) === normalizedSlug;
      if (matchesId || matchesSlug) {
        const meta = toResolvedProductMeta(item, fallbackOrigin, cleanKey);
        if (meta) return meta;
      }
    }
  }

  return null;
}

async function getHtmlTemplate(origin: string): Promise<string> {
  const candidates = [
    path.join(process.cwd(), 'dist', 'index.html'),
    path.join(process.cwd(), '.vercel', 'output', 'static', 'index.html'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
      }
    } catch {
      // continue to next candidate
    }
  }

  if (
    cachedHtmlTemplate &&
    cachedHtmlTemplate.origin === origin &&
    Date.now() - cachedHtmlTemplate.fetchedAt < 5 * 60 * 1000
  ) {
    return cachedHtmlTemplate.html;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const resp = await fetch(`${origin}/index.html`, {
        headers: { Accept: 'text/html' },
        signal: controller.signal,
      });
      if (resp.ok) {
        const html = await resp.text();
        if (html.includes('<head') && html.includes('</head>')) {
          cachedHtmlTemplate = { html, origin, fetchedAt: Date.now() };
          return html;
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // fallback below
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${DEFAULT_TITLE}</title>
    <meta name="description" content="${DEFAULT_DESCRIPTION}" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
}

function stripExistingSeoMetaTags(html: string): string {
  return html
    .replace(/<title[^>]*>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<meta[^>]+name=["']description["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]+property=["']og:[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]+property=["']product:[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]+name=["']twitter:[^"']+["'][^>]*>\s*/gi, '');
}

function injectMetaTags(
  baseHtml: string,
  meta: ResolvedProductMeta | null,
  canonicalUrl: string,
  origin: string
): string {
  const cleaned = stripExistingSeoMetaTags(baseHtml);

  const pageTitle = meta ? `${meta.name} | Glamour Galleria` : DEFAULT_TITLE;
  const ogTitle = meta ? meta.name : DEFAULT_TITLE;
  const description = meta ? meta.description : DEFAULT_DESCRIPTION;
  const imageUrl = meta ? meta.imageUrl : `${origin}${DEFAULT_IMAGE_PATH}`;
  const ogType = meta ? 'product' : 'website';

  const priceMetaLines =
    meta && meta.price !== undefined
      ? `    <meta property="product:price:amount" content="${escapeHtmlAttr(meta.price.toFixed(2))}" />\n    <meta property="product:price:currency" content="INR" />\n`
      : '';

  const tagsBlock = [
    `    <title>${escapeHtmlAttr(pageTitle)}</title>`,
    `    <meta name="description" content="${escapeHtmlAttr(description)}" />`,
    `    <link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />`,
    `    <meta property="og:site_name" content="Glamour Galleria" />`,
    `    <meta property="og:title" content="${escapeHtmlAttr(ogTitle)}" />`,
    `    <meta property="og:description" content="${escapeHtmlAttr(description)}" />`,
    `    <meta property="og:type" content="${ogType}" />`,
    `    <meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />`,
    `    <meta property="og:image" content="${escapeHtmlAttr(imageUrl)}" />`,
    `    <meta property="og:image:secure_url" content="${escapeHtmlAttr(imageUrl)}" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <meta name="twitter:title" content="${escapeHtmlAttr(ogTitle)}" />`,
    `    <meta name="twitter:description" content="${escapeHtmlAttr(description)}" />`,
    `    <meta name="twitter:image" content="${escapeHtmlAttr(imageUrl)}" />`,
  ].join('\n');

  const fullBlock = `${tagsBlock}\n${priceMetaLines}`;

  if (/<head[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<head[^>]*>/i, (match) => `${match}\n${fullBlock}`);
  }
  return cleaned.replace('</head>', `${fullBlock}\n  </head>`);
}

function getRequestOrigin(req: VercelRequest): string {
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader)
    ? protoHeader[0]
    : protoHeader || 'https';
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!host) return DEFAULT_SITE_URL;
  return `${proto}://${host}`;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const origin = getRequestOrigin(req);
  const parsedUrl = new URL(req.url || '/', origin);

  const queryProduct = Array.isArray(req.query.product)
    ? req.query.product[0]
    : req.query.product;
  const querySlug = Array.isArray(req.query.slug)
    ? req.query.slug[0]
    : req.query.slug;

  const urlProduct = parsedUrl.searchParams.get('product') || '';
  const pathMatch = parsedUrl.pathname.match(/^\/product\/([^/?#]+)/i);
  const pathSlug = pathMatch ? decodeURIComponent(pathMatch[1]) : '';

  const productKey = String(
    queryProduct || urlProduct || querySlug || pathSlug || ''
  ).trim();

  const canonicalUrl = productKey
    ? pathSlug || querySlug
      ? `${origin}/product/${encodeURIComponent(productKey)}`
      : `${origin}/?product=${encodeURIComponent(productKey)}`
    : `${origin}/`;

  const [baseHtml, productMeta] = await Promise.all([
    getHtmlTemplate(origin),
    productKey ? resolveProductByKey(productKey, origin) : Promise.resolve(null),
  ]);

  const html = injectMetaTags(baseHtml, productMeta, canonicalUrl, origin);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
  );
  res.status(200).send(html);
}
