import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const FIREBASE_PROJECT_ID =
  (
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    'rahul-bill'
  ).trim() || 'rahul-bill';
const DEFAULT_SITE_URL = 'https://glamour-galleria.vercel.app';
const DEFAULT_TITLE = 'Glamour Galleria - Online Shopping';
const DEFAULT_DESCRIPTION =
  'Glamour Galleria - Online Shopping. Your Style, Our Priority.';
const DEFAULT_IMAGE_PATH = '/pwa-512x512.png';
const VIDEO_URL_REGEX = /\.(mp4|webm|mov|m4v|ogg|ogv|avi|mkv)(\?.*)?$/i;

let cachedHtmlTemplate: { html: string; origin: string; fetchedAt: number } | null =
  null;

interface ResolvedProductMeta {
  id: string;
  name: string;
  description: string;
  price?: number;
  imageUrl: string;
  imageType?: string;
  imageWidth?: number;
  imageHeight?: number;
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
  if (typeof obj.name === 'string') {
    const seg = obj.name.split('/').pop();
    if (seg) {
      parsed._docId = seg;
      if (!parsed.id) parsed.id = seg;
    }
  }
  return parsed;
}

function isVideoMediaUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.startsWith('data:video/') ||
    lower.includes('/video/upload/') ||
    VIDEO_URL_REGEX.test(lower)
  );
}

function ensureHttpsOrigin(origin: string): string {
  const trimmed = String(origin || '').trim();
  if (!trimmed) return DEFAULT_SITE_URL;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed.replace(/^http:\/\//i, 'https://');
}

function extractRawUrlFromCandidate(candidate: unknown): string {
  if (typeof candidate === 'string') return candidate.trim();
  if (candidate && typeof candidate === 'object') {
    const obj = candidate as Record<string, unknown>;
    const rType = String(obj.resourceType || obj.type || '').toLowerCase();
    if (rType === 'video') return '';
    for (const key of ['secureUrl', 'secure_url', 'url', 'src', 'imageUrl', 'image']) {
      if (typeof obj[key] === 'string' && String(obj[key]).trim()) {
        return String(obj[key]).trim();
      }
    }
  }
  return '';
}

function normalizeImageCandidateUrl(
  rawUrl: unknown,
  fallbackOrigin: string
): string {
  let trimmed = extractRawUrlFromCandidate(rawUrl);
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return '';
  }
  if (isVideoMediaUrl(trimmed)) return '';

  const httpsOrigin = ensureHttpsOrigin(fallbackOrigin);
  if (trimmed.startsWith('//')) {
    trimmed = `https:${trimmed}`;
  } else if (trimmed.startsWith('/')) {
    trimmed = `${httpsOrigin}${trimmed}`;
  } else if (
    !/^https?:\/\//i.test(trimmed) &&
    /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/|$)/.test(trimmed)
  ) {
    trimmed = `https://${trimmed}`;
  }

  if (!/^https?:\/\//i.test(trimmed)) return '';
  if (trimmed.toLowerCase().startsWith('http://')) {
    trimmed = `https://${trimmed.slice('http://'.length)}`;
  }

  return formatSocialOgImageUrl(trimmed);
}

function formatSocialOgImageUrl(url: string): string {
  const marker = '/image/upload/';
  if (!url.includes('res.cloudinary.com/') || !url.includes(marker)) {
    return url;
  }
  const idx = url.indexOf(marker);
  if (idx === -1) return url;

  const prefix = url.slice(0, idx + marker.length);
  const rest = url.slice(idx + marker.length);
  const socialTransform = 'f_jpg,q_auto:good,w_800,h_800,c_pad,b_white';

  const firstSlash = rest.indexOf('/');
  if (firstSlash === -1) {
    return `${prefix}${socialTransform}/${rest}`;
  }

  const firstSeg = rest.slice(0, firstSlash);
  const afterFirst = rest.slice(firstSlash + 1);
  // If first segment is a transformation list (e.g. f_auto,q_auto or c_fill,w_800), replace format/size cleanly
  if (
    !/^v\d+$/.test(firstSeg) &&
    /(^|,)(?:f_|q_|w_|h_|c_|b_|dpr_|ar_)[a-z0-9_.:-]+/i.test(firstSeg)
  ) {
    return `${prefix}${socialTransform}/${afterFirst}`;
  }

  return `${prefix}${socialTransform}/${rest}`;
}

function detectImageMimeType(url: string): string | undefined {
  const lower = url.toLowerCase();
  if (lower.includes('/f_jpg') || lower.includes(',f_jpg')) {
    return 'image/jpeg';
  }
  const cleanPath = lower.split('?')[0];
  if (cleanPath.endsWith('.jpg') || cleanPath.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (cleanPath.endsWith('.png')) return 'image/png';
  if (cleanPath.endsWith('.gif')) return 'image/gif';
  if (cleanPath.endsWith('.webp')) return 'image/webp';
  return undefined;
}

function detectImageDimensions(url: string): { width?: number; height?: number } {
  const lower = url.toLowerCase();
  if (
    lower.includes('res.cloudinary.com/') &&
    lower.includes('w_800,h_800,c_pad')
  ) {
    return { width: 800, height: 800 };
  }
  if (lower.endsWith('/pwa-512x512.png')) {
    return { width: 512, height: 512 };
  }
  return {};
}

function collectProductImageCandidates(record: Record<string, unknown>): unknown[] {
  const rawCandidates: unknown[] = [];
  for (const arrayKey of ['imageDataUrls', 'images', 'photos', 'mediaRecords']) {
    const arr = record[arrayKey];
    if (Array.isArray(arr)) {
      rawCandidates.push(...arr);
    }
  }
  for (const singleKey of [
    'imageDataUrl',
    'imageUrl',
    'image',
    'thumbnail',
    'coverImage',
    'photo',
  ]) {
    if (record[singleKey] !== undefined && record[singleKey] !== null) {
      rawCandidates.push(record[singleKey]);
    }
  }
  return rawCandidates;
}

function pickHttpImageUrl(
  record: Record<string, unknown>,
  fallbackOrigin: string,
  fallbackStoreImage: string,
  resolvedId?: string
): { imageUrl: string; imageType?: string } {
  const rawCandidates = collectProductImageCandidates(record);

  for (const candidate of rawCandidates) {
    const normalized = normalizeImageCandidateUrl(candidate, fallbackOrigin);
    if (normalized) {
      return {
        imageUrl: normalized,
        imageType: detectImageMimeType(normalized),
      };
    }
  }

  // Fallback for legacy base64-only products: serve decoded image over HTTPS via /api/product-image
  const productId = String(resolvedId || record.id || '').trim();
  if (productId) {
    for (const candidate of rawCandidates) {
      const raw = extractRawUrlFromCandidate(candidate);
      const dataMatch = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,[A-Za-z0-9+/=]+$/i.exec(
        raw
      );
      if (dataMatch) {
        const mime =
          dataMatch[1].toLowerCase() === 'image/jpg'
            ? 'image/jpeg'
            : dataMatch[1].toLowerCase();
        const httpsOrigin = ensureHttpsOrigin(fallbackOrigin);
        return {
          imageUrl: `${httpsOrigin}/api/product-image?id=${encodeURIComponent(productId)}`,
          imageType: mime,
        };
      }
    }
  }

  return {
    imageUrl: fallbackStoreImage,
    imageType: detectImageMimeType(fallbackStoreImage),
  };
}

function buildProductDescription(
  name: string,
  rawDesc: unknown,
  priceValue: unknown
): string {
  const cleanedDesc = String(rawDesc || '')
    .replace(/\s+/g, ' ')
    .trim();
  const numericPrice = Number(priceValue);
  const hasValidPrice = Number.isFinite(numericPrice) && numericPrice > 0;
  const formattedPrice = hasValidPrice
    ? `₹${new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: numericPrice % 1 === 0 ? 0 : 2,
      }).format(numericPrice)}`
    : '';

  if (formattedPrice && cleanedDesc) {
    const combined = `${formattedPrice} — ${cleanedDesc}`;
    return combined.length > 180
      ? `${combined.slice(0, 177).trim()}...`
      : combined;
  }
  if (cleanedDesc) {
    return cleanedDesc.length > 180
      ? `${cleanedDesc.slice(0, 177).trim()}...`
      : cleanedDesc;
  }
  if (formattedPrice) {
    return `${formattedPrice} — Shop ${name} on Glamour Galleria.`;
  }
  return `${name} on Glamour Galleria.`;
}

function toResolvedProductMeta(
  record: Record<string, unknown>,
  fallbackOrigin: string,
  fallbackStoreImage: string,
  overrideId?: string
): ResolvedProductMeta | null {
  const name = String(record.name || '').trim();
  if (!name) return null;

  const sellerId = String(record.sellerId || '').trim();
  const sellerStatus = String(record.sellerApprovalStatus || '')
    .trim()
    .toLowerCase();
  if (
    sellerId &&
    sellerId.toLowerCase() !== 'admin' &&
    sellerStatus &&
    sellerStatus !== 'approved'
  ) {
    return null;
  }

  const priceRaw = record.sellingPrice ?? record.price;
  const priceNum = Number(priceRaw);
  const resolvedId = overrideId || String(record.id || '').trim();
  const { imageUrl, imageType } = pickHttpImageUrl(
    record,
    fallbackOrigin,
    fallbackStoreImage,
    resolvedId
  );
  const dims = detectImageDimensions(imageUrl);

  return {
    id: resolvedId,
    name,
    description: buildProductDescription(name, record.description, priceNum),
    price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : undefined,
    imageUrl,
    imageType,
    imageWidth: dims.width,
    imageHeight: dims.height,
  };
}

async function fetchFirestoreJson(urlPath: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
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

async function resolveStoreLogoFallback(
  fallbackOrigin: string,
  preFetchedSettingsJson?: unknown
): Promise<string> {
  const defaultLogo = `${fallbackOrigin}${DEFAULT_IMAGE_PATH}`;
  const settingsJson =
    preFetchedSettingsJson !== undefined
      ? preFetchedSettingsJson
      : await fetchFirestoreJson('settings/business');
  const decoded = decodeFirestoreDocument(settingsJson);
  if (!decoded) return defaultLogo;
  const normalizedLogo = normalizeImageCandidateUrl(
    decoded.logoDataUrl,
    fallbackOrigin
  );
  return normalizedLogo || defaultLogo;
}

async function resolveProductByKey(
  rawKey: string,
  fallbackOrigin: string
): Promise<{ product: ResolvedProductMeta | null; fallbackLogoUrl: string }> {
  const defaultLogo = `${fallbackOrigin}${DEFAULT_IMAGE_PATH}`;
  try {
    const cleanKey = String(rawKey || '').trim();
    if (!cleanKey) {
      return { product: null, fallbackLogoUrl: defaultLogo };
    }

    const strippedCatId = cleanKey.startsWith('cat-')
      ? cleanKey.slice(4).trim()
      : cleanKey;

    // Fetch settings/business in parallel with direct product lookup when ID looks like a Firestore document ID
    const directLookupPromise = /^[a-zA-Z0-9_-]{1,128}$/.test(strippedCatId)
      ? fetchFirestoreJson(`products/${encodeURIComponent(strippedCatId)}`)
      : Promise.resolve(null);
    const settingsPromise = fetchFirestoreJson('settings/business');

    const [directDocJson, settingsJson] = await Promise.all([
      directLookupPromise,
      settingsPromise,
    ]);
    const fallbackLogoUrl = await resolveStoreLogoFallback(
      fallbackOrigin,
      settingsJson
    );

    const decodedDirect = decodeFirestoreDocument(directDocJson);
    if (decodedDirect) {
      const meta = toResolvedProductMeta(
        decodedDirect,
        fallbackOrigin,
        fallbackLogoUrl,
        cleanKey
      );
      if (meta) return { product: meta, fallbackLogoUrl };
    }

    // 2. Check custom shopping items in settings/business
    const normalizedTarget = cleanKey.toLowerCase();
    const normalizedStripped = strippedCatId.toLowerCase();
    const normalizedSlug = slugifyProductName(cleanKey);

    const settingsDecoded = decodeFirestoreDocument(settingsJson);
    if (
      settingsDecoded &&
      typeof settingsDecoded.viewPanel === 'object' &&
      settingsDecoded.viewPanel
    ) {
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
          itemId.toLowerCase() === normalizedStripped;
        const matchesSlug =
          Boolean(normalizedSlug) && slugifyProductName(itemName) === normalizedSlug;
        if (matchesId || matchesSlug) {
          const meta = toResolvedProductMeta(
            item,
            fallbackOrigin,
            fallbackLogoUrl,
            cleanKey
          );
          if (meta) return { product: meta, fallbackLogoUrl };
        }
      }
    }

    // 3. Paginated scan across products collection (supports slugs, productNumber, and >200 catalog products)
    let pageToken = '';
    for (let page = 0; page < 5; page += 1) {
      const queryPath = pageToken
        ? `products?pageSize=300&pageToken=${encodeURIComponent(pageToken)}`
        : 'products?pageSize=300';
      const productsJson = await fetchFirestoreJson(queryPath);
      if (!productsJson || typeof productsJson !== 'object') break;

      const typedResp = productsJson as {
        documents?: unknown[];
        nextPageToken?: string;
      };
      const docs = Array.isArray(typedResp.documents) ? typedResp.documents : [];
      for (const d of docs) {
        const decoded = decodeFirestoreDocument(d);
        if (!decoded) continue;
        const fieldId = String(decoded.id || '').trim();
        const firestoreDocId = String(decoded._docId || fieldId).trim();
        const docNumber = String(decoded.productNumber || '').trim();
        const docSlug = String(decoded.slug || '').trim();
        const docName = String(decoded.name || '').trim();
        const matchesId =
          fieldId.toLowerCase() === normalizedTarget ||
          `cat-${fieldId}`.toLowerCase() === normalizedTarget ||
          fieldId.toLowerCase() === normalizedStripped ||
          firestoreDocId.toLowerCase() === normalizedTarget ||
          `cat-${firestoreDocId}`.toLowerCase() === normalizedTarget ||
          firestoreDocId.toLowerCase() === normalizedStripped ||
          (Boolean(docNumber) &&
            (docNumber.toLowerCase() === normalizedTarget ||
              docNumber.toLowerCase() === normalizedStripped)) ||
          (Boolean(docSlug) &&
            (docSlug.toLowerCase() === normalizedTarget ||
              docSlug.toLowerCase() === normalizedStripped));
        const matchesSlug =
          Boolean(normalizedSlug) && slugifyProductName(docName) === normalizedSlug;
        if (matchesId || matchesSlug) {
          const meta = toResolvedProductMeta(
            decoded,
            fallbackOrigin,
            fallbackLogoUrl,
            cleanKey
          );
          if (meta) return { product: meta, fallbackLogoUrl };
        }
      }

      if (!typedResp.nextPageToken) break;
      pageToken = typedResp.nextPageToken;
    }

    return { product: null, fallbackLogoUrl };
  } catch (err) {
    console.error('[api/product-page] resolveProductByKey fallback:', err);
    return { product: null, fallbackLogoUrl: defaultLogo };
  }
}

function getMinimalFallbackHtml(): string {
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

function getModuleDirectory(): string {
  try {
    if (typeof import.meta?.url === 'string' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // ignore in non-file environments
  }
  return '';
}

async function getHtmlTemplate(origin: string): Promise<string> {
  const moduleDir = getModuleDirectory();
  const candidates = [
    path.join(process.cwd(), 'dist', 'index.html'),
    ...(moduleDir ? [path.resolve(moduleDir, '..', 'dist', 'index.html')] : []),
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

  return getMinimalFallbackHtml();
}

function stripExistingSeoMetaTags(html: string): string {
  return html
    .replace(/<title[^>]*>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<meta[^>]+name=["']description["'][^>]*>\s*/gi, '')
    .replace(/<link[^>]+rel=["']canonical["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]+property=["']og:[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]+property=["']product:[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<meta[^>]+name=["']twitter:[^"']+["'][^>]*>\s*/gi, '')
    .replace(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi,
      ''
    );
}

function injectMetaTags(
  baseHtml: string,
  meta: ResolvedProductMeta | null,
  canonicalUrl: string,
  fallbackLogoUrl: string
): string {
  const cleaned = stripExistingSeoMetaTags(baseHtml);

  const pageTitle = meta ? `${meta.name} | Glamour Galleria` : DEFAULT_TITLE;
  const ogTitle = meta ? meta.name : DEFAULT_TITLE;
  const description = meta ? meta.description : DEFAULT_DESCRIPTION;
  const imageUrl = meta ? meta.imageUrl : fallbackLogoUrl;
  const imageType = meta ? meta.imageType : detectImageMimeType(fallbackLogoUrl);
  const fallbackDims = detectImageDimensions(fallbackLogoUrl);
  const imageWidth = meta ? meta.imageWidth : fallbackDims.width;
  const imageHeight = meta ? meta.imageHeight : fallbackDims.height;
  const ogType = meta ? 'product' : 'website';

  const priceMetaLines =
    meta && meta.price !== undefined
      ? [
          `    <meta property="product:price:amount" content="${escapeHtmlAttr(meta.price.toFixed(2))}" />`,
          `    <meta property="product:price:currency" content="INR" />`,
        ].join('\n')
      : '';

  let structuredDataLine = '';
  if (meta) {
    try {
      structuredDataLine = `    <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: meta.name,
        image: [imageUrl],
        description,
        ...(meta.price !== undefined
          ? {
              offers: {
                '@type': 'Offer',
                url: canonicalUrl,
                priceCurrency: 'INR',
                price: meta.price.toFixed(2),
                availability: 'https://schema.org/InStock',
              },
            }
          : {}),
      }).replace(/</g, '\\u003c')}</script>`;
    } catch {
      structuredDataLine = '';
    }
  }

  const tags = [
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
    ...(imageType
      ? [`    <meta property="og:image:type" content="${escapeHtmlAttr(imageType)}" />`]
      : []),
    ...(imageWidth && imageHeight
      ? [
          `    <meta property="og:image:width" content="${imageWidth}" />`,
          `    <meta property="og:image:height" content="${imageHeight}" />`,
        ]
      : []),
    `    <meta property="og:image:alt" content="${escapeHtmlAttr(ogTitle)}" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <meta name="twitter:url" content="${escapeHtmlAttr(canonicalUrl)}" />`,
    `    <meta name="twitter:title" content="${escapeHtmlAttr(ogTitle)}" />`,
    `    <meta name="twitter:description" content="${escapeHtmlAttr(description)}" />`,
    `    <meta name="twitter:image" content="${escapeHtmlAttr(imageUrl)}" />`,
    `    <meta name="twitter:image:alt" content="${escapeHtmlAttr(ogTitle)}" />`,
  ];

  if (priceMetaLines) tags.push(priceMetaLines);
  if (structuredDataLine) tags.push(structuredDataLine);

  const fullBlock = tags.join('\n');

  if (/<meta[^>]+charset=[^>]*>/i.test(cleaned)) {
    return cleaned.replace(
      /<meta[^>]+charset=[^>]*>/i,
      (match) => `${match}\n${fullBlock}`
    );
  }
  if (/<head[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<head[^>]*>/i, (match) => `${match}\n${fullBlock}`);
  }
  if (cleaned.includes('</head>')) {
    return cleaned.replace('</head>', `${fullBlock}\n  </head>`);
  }
  return `${fullBlock}\n${cleaned}`;
}

function getRequestOrigin(req: VercelRequest): string {
  try {
    const rawHostHeader = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
    const firstHost = (Array.isArray(rawHostHeader) ? rawHostHeader[0] : rawHostHeader) || '';
    const host = String(firstHost).split(',')[0].trim();
    if (!host || !/^[a-zA-Z0-9.-]+(:\d+)?$/.test(host)) {
      return DEFAULT_SITE_URL;
    }
    const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
    const rawProtoHeader = req?.headers?.['x-forwarded-proto'];
    const firstProto = (Array.isArray(rawProtoHeader) ? rawProtoHeader[0] : rawProtoHeader) || '';
    const rawProto = String(firstProto).split(',')[0].trim().toLowerCase() || (isLocalHost ? 'http' : 'https');
    const proto = !isLocalHost ? 'https' : rawProto === 'http' ? 'http' : 'https';
    return `${proto}://${host}`;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeParseRequestUrl(rawUrl: string | undefined, origin: string): URL | null {
  try {
    return new URL(rawUrl || '/', origin);
  } catch {
    try {
      return new URL('/', DEFAULT_SITE_URL);
    } catch {
      return null;
    }
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const origin = getRequestOrigin(req);
  try {
    const parsedUrl = safeParseRequestUrl(req?.url, origin);

    const queryObj = (req?.query && typeof req.query === 'object' ? req.query : {}) as Record<
      string,
      string | string[] | undefined
    >;
    const queryProduct = Array.isArray(queryObj.product)
      ? queryObj.product[0]
      : queryObj.product;
    const querySlug = Array.isArray(queryObj.slug)
      ? queryObj.slug[0]
      : queryObj.slug;

    const urlProduct = parsedUrl?.searchParams.get('product') || '';
    const pathMatch = (parsedUrl?.pathname || '').match(/^\/product\/([^/?#]+)/i);
    const pathSlug = pathMatch ? safeDecodeURIComponent(pathMatch[1]) : '';

    const productKey = String(
      queryProduct || urlProduct || querySlug || pathSlug || ''
    ).trim();

    const canonicalUrl = productKey
      ? pathSlug || querySlug
        ? `${origin}/product/${encodeURIComponent(productKey)}`
        : `${origin}/?product=${encodeURIComponent(productKey)}`
      : `${origin}/`;

    const [baseHtml, resolved] = await Promise.all([
      getHtmlTemplate(origin),
      productKey
        ? resolveProductByKey(productKey, origin)
        : Promise.resolve({
            product: null,
            fallbackLogoUrl: `${origin}${DEFAULT_IMAGE_PATH}`,
          }),
    ]);

    const html = injectMetaTags(
      baseHtml,
      resolved.product,
      canonicalUrl,
      resolved.fallbackLogoUrl
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
    );
    res.status(200).send(html);
  } catch (err) {
    console.error('[api/product-page] handler error, serving default fallback:', err);
    try {
      const baseHtml = await getHtmlTemplate(origin).catch(() => getMinimalFallbackHtml());
      const fallbackHtml = injectMetaTags(
        baseHtml,
        null,
        `${origin}/`,
        `${origin}${DEFAULT_IMAGE_PATH}`
      );
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(fallbackHtml);
    } catch {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(getMinimalFallbackHtml());
    }
  }
}
