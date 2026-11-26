import type { VercelRequest, VercelResponse } from '@vercel/node';
import dns from 'node:dns';
import net from 'node:net';
import type { ProductSourcePlatform } from '../src/types/business.ts';

export interface ApiReqLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResLike {
  setHeader(name: string, value: string): unknown;
  status(code: number): {
    json(body: unknown): unknown;
    send(body: unknown): unknown;
    end(): unknown;
  };
}

export interface ExtractedProductData {
  title: string;
  description: string;
  price: number | null;
  originalPrice: number | null;
  sizes: string;
  imageUrls: string[];
  sourceUrl: string;
  sourcePlatform: ProductSourcePlatform;
}

const MAX_URL_LENGTH = 2000;
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 12000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.home.arpa',
];

const BLOCKED_EXACT_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  return num >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true;

  const ranges: Array<[number, number]> = [
    [0x00000000, 0x00ffffff], // 0.0.0.0/8 ("this network")
    [0x0a000000, 0x0affffff], // 10.0.0.0/8 (RFC1918)
    [0x64400000, 0x647fffff], // 100.64.0.0/10 (CGNAT)
    [0x7f000000, 0x7fffffff], // 127.0.0.0/8 (loopback)
    [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16 (link-local / cloud metadata)
    [0xac100000, 0xac1fffff], // 172.16.0.0/12 (RFC1918)
    [0xc0000000, 0xc00000ff], // 192.0.0.0/24
    [0xc0000200, 0xc00002ff], // 192.0.2.0/24
    [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16 (RFC1918)
    [0xc6120000, 0xc613ffff], // 198.18.0.0/15
    [0xc6336400, 0xc63364ff], // 198.51.100.0/24
    [0xcb007100, 0xcb0071ff], // 203.0.113.0/24
    [0xe0000000, 0xffffffff], // 224.0.0.0/4 multicast + 240/4 reserved + 255.255.255.255
  ];

  return ranges.some(([start, end]) => n >= start && n <= end);
}

function isBlockedIp(rawIp: string): boolean {
  const clean = rawIp.trim().replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  const ipVer = net.isIP(clean);
  if (ipVer === 4) {
    return isBlockedIpv4(clean);
  }
  if (ipVer === 6) {
    if (clean === '::' || clean === '::1') return true;
    // IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (clean.startsWith('::ffff:')) {
      const rest = clean.slice('::ffff:'.length);
      if (net.isIP(rest) === 4) {
        return isBlockedIpv4(rest);
      }
      const hexMatch = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
      if (hexMatch) {
        const hi = parseInt(hexMatch[1], 16);
        const lo = parseInt(hexMatch[2], 16);
        const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
        return isBlockedIpv4(v4);
      }
      return true;
    }
    // Unique local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8)
    const firstWordHex = clean.split(':')[0] || '';
    const firstWord = parseInt(firstWordHex, 16);
    if (!Number.isFinite(firstWord)) return true;
    if ((firstWord & 0xfe00) === 0xfc00) return true;
    if ((firstWord & 0xffc0) === 0xfe80) return true;
    if ((firstWord & 0xff00) === 0xff00) return true;
    // NAT64 well-known prefix 64:ff9b::/96
    if (clean.startsWith('64:ff9b:')) return true;
    return false;
  }
  return true;
}

export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) {
    throw new Error('Please enter a valid product URL.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL format. Please paste the full https:// product link.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// or https:// product links are supported.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs with embedded credentials are not allowed.');
  }
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    throw new Error('Non-standard URL ports are not allowed.');
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || BLOCKED_EXACT_HOSTS.has(host)) {
    throw new Error('This hostname is not allowed.');
  }
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new Error('Private or internal hostnames are not allowed.');
  }

  const cleanHost = host.replace(/^\[|\]$/g, '');
  if (net.isIP(cleanHost)) {
    if (isBlockedIp(cleanHost)) {
      throw new Error('Private or local IP addresses are not allowed.');
    }
    return parsed;
  }

  if (!host.includes('.')) {
    throw new Error('Please enter a full public website URL.');
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error('Could not resolve that website address. Please verify the link.');
  }

  if (!Array.isArray(resolved) || resolved.length === 0) {
    throw new Error('Could not resolve that website address.');
  }
  for (const entry of resolved) {
    if (isBlockedIp(entry.address)) {
      throw new Error('Target website resolved to a restricted network address.');
    }
  }

  return parsed;
}

export function detectProductPlatform(rawUrl: string): ProductSourcePlatform {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host === 'meesho.com' || host.endsWith('.meesho.com')) {
      return 'meesho';
    }
    if (
      host === 'flipkart.com' ||
      host.endsWith('.flipkart.com') ||
      host === 'fkrt.it' ||
      host === 'fkrt.co'
    ) {
      return 'flipkart';
    }
  } catch {
    // fallback below
  }
  return 'other';
}

async function fetchWithSafeRedirects(
  initialUrl: string,
  acceptHeader: string
): Promise<{ response: globalThis.Response; finalUrl: string }> {
  let currentUrl = (await assertSafePublicUrl(initialUrl)).toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const res = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: acceptHeader,
        'Accept-Language': 'en-IN,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) {
        return { response: res, finalUrl: currentUrl };
      }
      const nextParsed = new URL(loc, currentUrl);
      currentUrl = (await assertSafePublicUrl(nextParsed.toString())).toString();
      continue;
    }

    return { response: res, finalUrl: currentUrl };
  }

  throw new Error('Too many redirects while loading product URL.');
}

async function readResponseBufferWithLimit(
  res: globalThis.Response,
  maxBytes: number
): Promise<Buffer> {
  const contentLength = Number(res.headers.get('content-length') || '0');
  if (contentLength > maxBytes) {
    throw new Error('Remote response exceeds maximum allowed size.');
  }

  if (!res.body) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      throw new Error('Remote response exceeds maximum allowed size.');
    }
    return Buffer.from(ab);
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        throw new Error('Remote response exceeds maximum allowed size.');
      }
      chunks.push(value);
    }
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(input: string): string {
  return decodeHtmlEntities(String(input || '').replace(/<[^>]+>/g, ' '));
}

function parseMetaAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(tag)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[key] = decodeHtmlEntities(val);
  }
  return attrs;
}

function parsePositivePrice(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isFinite(val) && val > 0 ? Math.round(val) : null;
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/[₹$,\s]/g, '').match(/\d+(?:\.\d+)?/);
    if (!cleaned) return null;
    const n = Number(cleaned[0]);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  return null;
}

function normalizeImageCandidate(raw: string, baseUrl: string): string | null {
  const trimmed = decodeHtmlEntities(String(raw || '').trim());
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return null;
  }
  let resolved: URL;
  try {
    resolved = new URL(trimmed, baseUrl);
  } catch {
    return null;
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    return null;
  }
  const lower = resolved.toString().toLowerCase();
  if (
    lower.endsWith('.svg') ||
    lower.includes('.svg?') ||
    /\/(favicon|sprite|pixel|spacer|badge|play_icon)\b/i.test(lower) ||
    /(logo|meesho-logo|flipkart-plus|fk-p-lin|1x1)/i.test(lower)
  ) {
    return null;
  }
  return resolved.toString();
}

function addUniqueImage(list: string[], raw: unknown, baseUrl: string): void {
  if (!raw) return;
  if (typeof raw === 'string') {
    const norm = normalizeImageCandidate(raw, baseUrl);
    if (norm && !list.includes(norm)) {
      list.push(norm);
    }
    return;
  }
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      addUniqueImage(list, entry, baseUrl);
    }
    return;
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.url === 'string') addUniqueImage(list, obj.url, baseUrl);
    if (typeof obj.contentUrl === 'string') addUniqueImage(list, obj.contentUrl, baseUrl);
    if (typeof obj.imageUrl === 'string') addUniqueImage(list, obj.imageUrl, baseUrl);
  }
}

function collectProductNodesFromJsonLd(node: unknown, out: Record<string, unknown>[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) {
      collectProductNodesFromJsonLd(item, out);
    }
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const typeVal = obj['@type'];
  const types = Array.isArray(typeVal) ? typeVal : [typeVal];
  const isProduct = types.some(
    (t) => typeof t === 'string' && t.toLowerCase().includes('product')
  );
  if (isProduct) {
    out.push(obj);
  }
  if (Array.isArray(obj['@graph'])) {
    collectProductNodesFromJsonLd(obj['@graph'], out);
  }
}

function extractProductFromHtml(
  html: string,
  finalUrl: string,
  sourcePlatform: ProductSourcePlatform
): { data: ExtractedProductData; blockedHint: boolean } {
  const metaMap = new Map<string, string[]>();
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const attrs = parseMetaAttributes(tag);
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    const content = attrs.content || '';
    if (key && content) {
      const existing = metaMap.get(key) || [];
      existing.push(content);
      metaMap.set(key, existing);
    }
  }

  let title = '';
  let description = '';
  let price: number | null = null;
  let originalPrice: number | null = null;
  const sizeSet = new Set<string>();
  const imageUrls: string[] = [];

  // 1) Parse JSON-LD Product schemas
  const jsonLdRe = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch: RegExpExecArray | null;
  while ((ldMatch = jsonLdRe.exec(html)) !== null) {
    const rawJson = (ldMatch[1] || '').trim();
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson);
      const productNodes: Record<string, unknown>[] = [];
      collectProductNodesFromJsonLd(parsed, productNodes);
      for (const prod of productNodes) {
        if (!title && typeof prod.name === 'string') {
          title = decodeHtmlEntities(prod.name);
        }
        if (!description && typeof prod.description === 'string') {
          description = decodeHtmlEntities(prod.description);
        }
        addUniqueImage(imageUrls, prod.image, finalUrl);

        const rawOffers = Array.isArray(prod.offers) ? prod.offers : prod.offers ? [prod.offers] : [];
        for (const offer of rawOffers) {
          if (!offer || typeof offer !== 'object') continue;
          const o = offer as Record<string, unknown>;
          const p =
            parsePositivePrice(o.price) ??
            parsePositivePrice(o.lowPrice);
          const hp = parsePositivePrice(o.highPrice);
          if (p !== null && price === null) price = p;
          if (hp !== null && hp > (price || 0) && originalPrice === null) {
            originalPrice = hp;
          }
        }

        if (typeof prod.size === 'string' && prod.size.trim()) {
          sizeSet.add(prod.size.trim());
        } else if (Array.isArray(prod.size)) {
          for (const s of prod.size) {
            if (typeof s === 'string' && s.trim()) sizeSet.add(s.trim());
          }
        }
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }

  // 2) Parse embedded __NEXT_DATA__ JSON (common on Meesho & modern storefronts)
  const nextDataMatch = /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (nextDataMatch?.[1]) {
    try {
      const nextJson = JSON.parse(nextDataMatch[1]) as unknown;
      const walkNext = (node: unknown, depth: number) => {
        if (!node || depth > 14) return;
        if (Array.isArray(node)) {
          for (const item of node.slice(0, 40)) {
            walkNext(item, depth + 1);
          }
          return;
        }
        if (typeof node !== 'object') return;
        const obj = node as Record<string, unknown>;

        if (!title && typeof obj.name === 'string' && obj.name.length > 3 && ('min_catalog_price' in obj || 'discounted_price' in obj || 'product_id' in obj || 'catalog_id' in obj)) {
          title = decodeHtmlEntities(obj.name);
        }
        if (!description && typeof obj.description === 'string' && obj.description.length > 10 && ('product_id' in obj || 'catalog_id' in obj || 'min_catalog_price' in obj)) {
          description = decodeHtmlEntities(obj.description);
        }
        const candidateSell =
          parsePositivePrice(obj.discounted_price) ??
          parsePositivePrice(obj.selling_price) ??
          parsePositivePrice(obj.min_product_price) ??
          parsePositivePrice(obj.min_catalog_price) ??
          parsePositivePrice(obj.final_price);
        if (candidateSell !== null && price === null) {
          price = candidateSell;
        }
        const candidateMrp =
          parsePositivePrice(obj.mrp) ??
          parsePositivePrice(obj.original_price) ??
          parsePositivePrice(obj.max_retail_price);
        if (candidateMrp !== null && originalPrice === null) {
          originalPrice = candidateMrp;
        }
        if (Array.isArray(obj.images)) {
          addUniqueImage(imageUrls, obj.images, finalUrl);
        }
        if (Array.isArray(obj.product_images)) {
          addUniqueImage(imageUrls, obj.product_images, finalUrl);
        }
        if (Array.isArray(obj.variations)) {
          for (const v of obj.variations) {
            if (typeof v === 'string' && v.trim() && v.length <= 20) {
              sizeSet.add(v.trim());
            } else if (v && typeof v === 'object') {
              const vo = v as Record<string, unknown>;
              if (typeof vo.name === 'string' && vo.name.trim() && vo.name.length <= 20) {
                sizeSet.add(vo.name.trim());
              } else if (typeof vo.size === 'string' && vo.size.trim()) {
                sizeSet.add(vo.size.trim());
              }
            }
          }
        }
        if (Array.isArray(obj.sizes)) {
          for (const s of obj.sizes) {
            if (typeof s === 'string' && s.trim() && s.length <= 20) {
              sizeSet.add(s.trim());
            }
          }
        }

        for (const val of Object.values(obj)) {
          if (val && typeof val === 'object') {
            walkNext(val, depth + 1);
          }
        }
      };
      walkNext(nextJson, 0);
    } catch {
      // ignore invalid __NEXT_DATA__
    }
  }

  // 3) OpenGraph & standard meta fallbacks
  if (!title) {
    title =
      metaMap.get('og:title')?.[0] ||
      metaMap.get('twitter:title')?.[0] ||
      '';
  }
  if (!description) {
    description =
      metaMap.get('og:description')?.[0] ||
      metaMap.get('twitter:description')?.[0] ||
      metaMap.get('description')?.[0] ||
      '';
  }
  if (price === null) {
    price =
      parsePositivePrice(metaMap.get('product:price:amount')?.[0]) ??
      parsePositivePrice(metaMap.get('og:price:amount')?.[0]) ??
      parsePositivePrice(metaMap.get('twitter:data1')?.[0]);
  }
  if (originalPrice === null) {
    originalPrice = parsePositivePrice(metaMap.get('product:original_price:amount')?.[0]);
  }

  addUniqueImage(imageUrls, metaMap.get('og:image:secure_url') || [], finalUrl);
  addUniqueImage(imageUrls, metaMap.get('og:image') || [], finalUrl);
  addUniqueImage(imageUrls, metaMap.get('twitter:image') || [], finalUrl);

  // 4) HTML tag fallbacks (<title>, <h1>, inline Flipkart/Meesho regexes)
  if (!title) {
    const h1Match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    const titleTagMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    title = stripTags(h1Match?.[1] || titleTagMatch?.[1] || '');
  }

  // Clean common storefront suffixes from scraped title
  title = title
    .replace(/\s*[-|:]\s*(Buy Online|Online Shopping|Meesho|Flipkart).*$/i, '')
    .replace(/\s*@\s*Best Price.*$/i, '')
    .trim();

  // Regex fallback for rupee prices if JSON/meta did not return price
  if (price === null) {
    const jsonPriceMatch =
      /"(?:finalPrice|sellingPrice|discounted_price|min_catalog_price|price)"\s*:\s*(\d{2,7})/i.exec(html);
    if (jsonPriceMatch?.[1]) {
      price = parsePositivePrice(jsonPriceMatch[1]);
    } else {
      const rupeeMatch = /₹\s*([1-9]\d{1,5}(?:,\d{2,3})*)/.exec(stripTags(html));
      if (rupeeMatch?.[1]) {
        price = parsePositivePrice(rupeeMatch[1]);
      }
    }
  }
  if (originalPrice === null) {
    const jsonMrpMatch = /"(?:mrp|originalPrice|original_price)"\s*:\s*(\d{2,7})/i.exec(html);
    if (jsonMrpMatch?.[1]) {
      originalPrice = parsePositivePrice(jsonMrpMatch[1]);
    }
  }

  // Additional image URL fallback from inline Meesho/Flipkart CDN URLs if fewer than 3 images found
  if (imageUrls.length < 5) {
    const cdnMatches = html.match(
      /https?:\/\/(?:images\.meesho\.com|rukminim\d?\.flixcart\.com)\/[^"'\s<>\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>\\]*)?/gi
    ) || [];
    for (const candidate of cdnMatches) {
      if (imageUrls.length >= 8) break;
      // Avoid tiny swatch thumbnails (e.g. /128/128/ on flipkart)
      if (/\/(?:64|100|128)\/(?:64|100|128)\//.test(candidate)) continue;
      addUniqueImage(imageUrls, candidate, finalUrl);
    }
  }

  if (originalPrice !== null && price !== null && originalPrice <= price) {
    originalPrice = null;
  }

  const lowerHtml = html.toLowerCase();
  const looksLikeCaptchaOrBlock =
    (!title && imageUrls.length === 0) ||
    /access denied|robot check|are you a human|verify you are human|captcha|cloudflare|attention required/i.test(
      `${title} ${lowerHtml.slice(0, 3000)}`
    );

  return {
    data: {
      title: title.slice(0, 160),
      description: description.slice(0, 1200),
      price,
      originalPrice,
      sizes: Array.from(sizeSet).slice(0, 10).join(', '),
      imageUrls: imageUrls.slice(0, 8),
      sourceUrl: finalUrl,
      sourcePlatform,
    },
    blockedHint: looksLikeCaptchaOrBlock && !title && price === null && imageUrls.length === 0,
  };
}

export async function handleFetchProduct(
  req: ApiReqLike,
  res: ApiResLike
): Promise<unknown> {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  // Mode 1: CORS-safe SSRF-guarded image proxy for the Crop/Edit canvas modal
  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'GET') {
    const rawProxy = req.query?.proxyImage;
    const proxyUrl = Array.isArray(rawProxy) ? rawProxy[0] : rawProxy;
    if (!proxyUrl) {
      return res.status(400).json({ ok: false, error: 'Missing proxyImage parameter.' });
    }

    try {
      const { response } = await fetchWithSafeRedirects(
        proxyUrl,
        'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8'
      );
      if (!response.ok) {
        return res.status(502).json({ ok: false, error: 'Unable to fetch remote image.' });
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
      if (!contentType.startsWith('image/') || contentType === 'image/svg+xml') {
        return res.status(415).json({ ok: false, error: 'URL did not return a raster image.' });
      }

      const buf = await readResponseBufferWithLimit(response, MAX_IMAGE_BYTES);
      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(buf);
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to proxy image.',
      });
    }
  }

  // Mode 2: POST /api/fetch-product to scrape metadata & images
  if (method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let bodyObj: Record<string, unknown> = {};
  if (typeof req.body === 'string') {
    try {
      bodyObj = JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      bodyObj = {};
    }
  } else if (req.body && typeof req.body === 'object') {
    bodyObj = req.body as Record<string, unknown>;
  }

  const rawUrl = String(bodyObj.url || '').trim();
  if (!rawUrl) {
    return res.status(400).json({ ok: false, error: 'Please paste a Meesho, Flipkart, or product URL.' });
  }

  let validatedUrl: URL;
  try {
    validatedUrl = await assertSafePublicUrl(rawUrl);
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid product URL.',
    });
  }

  const normalizedInputUrl = validatedUrl.toString();
  const initialPlatform = detectProductPlatform(normalizedInputUrl);

  try {
    const { response, finalUrl } = await fetchWithSafeRedirects(
      normalizedInputUrl,
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    );
    const platform = detectProductPlatform(finalUrl) !== 'other'
      ? detectProductPlatform(finalUrl)
      : initialPlatform;

    if (!response.ok) {
      return res.status(200).json({
        ok: false,
        partial: false,
        warning: `The target site returned HTTP ${response.status} or blocked automated reading. Your product link is saved—please fill in any missing fields and upload photos below.`,
        data: {
          title: '',
          description: '',
          price: null,
          originalPrice: null,
          sizes: '',
          imageUrls: [],
          sourceUrl: finalUrl,
          sourcePlatform: platform,
        },
      });
    }

    const buf = await readResponseBufferWithLimit(response, MAX_HTML_BYTES);
    const html = buf.toString('utf8');
    const { data, blockedHint } = extractProductFromHtml(html, finalUrl, platform);

    const hasTitle = Boolean(data.title);
    const hasPrice = data.price !== null;
    const hasImages = data.imageUrls.length > 0;

    if (blockedHint || (!hasTitle && !hasPrice && !hasImages && !data.description)) {
      return res.status(200).json({
        ok: false,
        partial: false,
        warning:
          'This website restricts automated product reading. The URL has been linked—please upload photos and enter product details manually.',
        data,
      });
    }

    const isPartial = !hasTitle || !hasPrice || !hasImages;
    return res.status(200).json({
      ok: true,
      partial: isPartial,
      warning: isPartial
        ? 'Partial product info fetched (some sites hide price or images). Please review and fill any missing fields.'
        : '',
      data,
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      partial: false,
      warning:
        err instanceof Error
          ? `${err.message} Your product link is still saved—please enter details manually.`
          : 'Could not reach this website right now. Your product link is saved—please enter details manually.',
      data: {
        title: '',
        description: '',
        price: null,
        originalPrice: null,
        sizes: '',
        imageUrls: [],
        sourceUrl: normalizedInputUrl,
        sourcePlatform: initialPlatform,
      },
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleFetchProduct(req, res);
}
