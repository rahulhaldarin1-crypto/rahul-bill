import type { VercelRequest, VercelResponse } from '@vercel/node';

const FIREBASE_PROJECT_ID =
  (
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    'rahul-bill'
  ).trim() || 'rahul-bill';
const DEFAULT_SITE_URL = 'https://glamour-galleria.vercel.app';
const DEFAULT_IMAGE_PATH = '/pwa-512x512.png';
const VIDEO_URL_REGEX = /\.(mp4|webm|mov|m4v|ogg|ogv|avi|mkv)(\?.*)?$/i;

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
    const rawProto =
      String(firstProto).split(',')[0].trim().toLowerCase() ||
      (isLocalHost ? 'http' : 'https');
    const proto = !isLocalHost ? 'https' : rawProto === 'http' ? 'http' : 'https';
    return `${proto}://${host}`;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function isVideoMediaUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.startsWith('data:video/') ||
    lower.includes('/video/upload/') ||
    VIDEO_URL_REGEX.test(lower)
  );
}

function formatSocialCloudinaryUrl(url: string): string {
  const marker = '/image/upload/';
  if (!url.includes('res.cloudinary.com/') || !url.includes(marker)) {
    return url;
  }
  const idx = url.indexOf(marker);
  if (idx === -1) return url;

  const prefix = url.slice(0, idx + marker.length);
  const rest = url.slice(idx + marker.length);
  const socialTransform = 'f_jpg,q_auto:good,w_1200,h_1200,c_pad,b_white';

  const firstSlash = rest.indexOf('/');
  if (firstSlash === -1) {
    return `${prefix}${socialTransform}/${rest}`;
  }

  const firstSeg = rest.slice(0, firstSlash);
  const afterFirst = rest.slice(firstSlash + 1);
  if (
    !/^v\d+$/.test(firstSeg) &&
    /(^|,)(?:f_|q_|w_|h_|c_|b_|dpr_|ar_)[a-z0-9_.:-]+/i.test(firstSeg)
  ) {
    return `${prefix}${socialTransform}/${afterFirst}`;
  }

  return `${prefix}${socialTransform}/${rest}`;
}

function extractCandidateStrings(record: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const pushString = (val: string) => {
    const t = val.trim();
    if (!t || seen.has(t)) return;
    if (isVideoMediaUrl(t) || t.startsWith('blob:')) return;
    const isHttpLike =
      t.startsWith('//') || t.startsWith('/') || /^https?:\/\//i.test(t);
    const isBase64Img = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,[A-Za-z0-9+/=]+$/i.test(
      t
    );
    if (!isHttpLike && !isBase64Img) return;
    seen.add(t);
    out.push(t);
  };
  const pushItem = (entry: unknown) => {
    if (typeof entry === 'string') {
      pushString(entry);
      return;
    }
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const rType = String(obj.resourceType || obj.type || '').toLowerCase();
      if (rType === 'video') return;
      for (const key of ['secureUrl', 'secure_url', 'url', 'src', 'imageUrl', 'image']) {
        if (typeof obj[key] === 'string' && String(obj[key]).trim()) {
          pushString(String(obj[key]));
          break;
        }
      }
    }
  };

  for (const arrayKey of ['imageDataUrls', 'images', 'photos', 'mediaRecords']) {
    const arr = record[arrayKey];
    if (Array.isArray(arr)) {
      for (const item of arr) pushItem(item);
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
    if (record[singleKey]) pushItem(record[singleKey]);
  }
  return out;
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

async function findProductRecord(
  rawKey: string
): Promise<Record<string, unknown> | null> {
  const cleanKey = String(rawKey || '').trim();
  if (!cleanKey) return null;

  const strippedCatId = cleanKey.startsWith('cat-')
    ? cleanKey.slice(4).trim()
    : cleanKey;

  if (/^[a-zA-Z0-9_-]{1,128}$/.test(strippedCatId)) {
    const direct = decodeFirestoreDocument(
      await fetchFirestoreJson(`products/${encodeURIComponent(strippedCatId)}`)
    );
    if (direct) return direct;
  }

  const normalizedTarget = cleanKey.toLowerCase();
  const normalizedStripped = strippedCatId.toLowerCase();
  const normalizedSlug = slugifyProductName(cleanKey);

  const settingsDecoded = decodeFirestoreDocument(
    await fetchFirestoreJson('settings/business')
  );
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
      const itemSlug = String(item.slug || '').trim();
      if (
        itemId.toLowerCase() === normalizedTarget ||
        itemId.toLowerCase() === normalizedStripped ||
        (Boolean(itemSlug) && itemSlug.toLowerCase() === normalizedTarget) ||
        (Boolean(normalizedSlug) && slugifyProductName(itemName) === normalizedSlug)
      ) {
        return item;
      }
    }
  }

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
      if (
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
            docSlug.toLowerCase() === normalizedStripped)) ||
        (Boolean(normalizedSlug) && slugifyProductName(docName) === normalizedSlug)
      ) {
        return decoded;
      }
    }
    if (!typedResp.nextPageToken) break;
    pageToken = typedResp.nextPageToken;
  }

  return null;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const origin = getRequestOrigin(req);
  const httpsOrigin = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')
    ? origin
    : origin.replace(/^http:\/\//i, 'https://');
  const fallbackLogo = `${httpsOrigin}${DEFAULT_IMAGE_PATH}`;

  try {
    const rawId = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
    const key = String(rawId || '').trim();
    if (!key) {
      res.redirect(302, fallbackLogo);
      return;
    }

    const rawIdx = Array.isArray(req.query?.idx) ? req.query.idx[0] : req.query?.idx;
    const parsedIdx = Number.parseInt(String(rawIdx ?? '0'), 10);
    const requestedIdx = Number.isFinite(parsedIdx) && parsedIdx >= 0 ? parsedIdx : 0;

    const record = await findProductRecord(key);
    if (!record) {
      res.redirect(302, fallbackLogo);
      return;
    }

    const candidates = extractCandidateStrings(record);
    if (candidates.length === 0) {
      res.redirect(302, fallbackLogo);
      return;
    }

    const selected = candidates[requestedIdx] || candidates[0];
    if (selected.startsWith('//')) {
      res.redirect(302, formatSocialCloudinaryUrl(`https:${selected}`));
      return;
    }
    if (selected.startsWith('/')) {
      res.redirect(302, `${httpsOrigin}${selected}`);
      return;
    }
    if (/^https?:\/\//i.test(selected)) {
      const httpsUrl = selected.toLowerCase().startsWith('http://')
        ? `https://${selected.slice('http://'.length)}`
        : selected;
      res.redirect(302, formatSocialCloudinaryUrl(httpsUrl));
      return;
    }

    const match = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i.exec(
      selected
    );
    if (match) {
      const mime =
        match[1].toLowerCase() === 'image/jpg'
          ? 'image/jpeg'
          : match[1].toLowerCase();
      const buf = Buffer.from(match[2], 'base64');
      if (buf.byteLength > 0) {
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Length', String(buf.byteLength));
        res.setHeader(
          'Cache-Control',
          'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
        );
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (String(req.method || 'GET').toUpperCase() === 'HEAD') {
          res.status(200).end();
          return;
        }
        res.status(200).send(buf);
        return;
      }
    }

    res.redirect(302, fallbackLogo);
  } catch (err) {
    console.error('[api/product-image] fallback error:', err);
    res.redirect(302, fallbackLogo);
  }
}
