import type { VercelRequest, VercelResponse } from '@vercel/node';
import dns from 'node:dns';
import net from 'node:net';
import type { ApiReqLike, ApiResLike } from './fetch-product.ts';

const MAX_WEBHOOK_URL_LENGTH = 1500;
const WEBHOOK_TIMEOUT_MS = 9000;

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

const SENSITIVE_KEY_PATTERN =
  /(password|passcode|secret|salt|privatekey|runningpassword)/i;

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

function isPrivateOrReservedIpv4(ip: string): boolean {
  const num = ipv4ToInt(ip);
  if (num === null) return true;
  const inRange = (cidrBase: string, prefix: number): boolean => {
    const base = ipv4ToInt(cidrBase);
    if (base === null) return false;
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (num & mask) === (base & mask);
  };
  return (
    inRange('0.0.0.0', 8) ||
    inRange('10.0.0.0', 8) ||
    inRange('100.64.0.0', 10) ||
    inRange('127.0.0.0', 8) ||
    inRange('169.254.0.0', 16) ||
    inRange('172.16.0.0', 12) ||
    inRange('192.0.0.0', 24) ||
    inRange('192.0.2.0', 24) ||
    inRange('192.168.0.0', 16) ||
    inRange('198.18.0.0', 15) ||
    inRange('198.51.100.0', 24) ||
    inRange('203.0.113.0', 24) ||
    inRange('224.0.0.0', 4) ||
    inRange('240.0.0.0', 4)
  );
}

function isPrivateOrReservedIp(ip: string): boolean {
  const cleaned = ip.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  if (cleaned.startsWith('::ffff:')) {
    return isPrivateOrReservedIpv4(cleaned.slice(7));
  }
  const ipVer = net.isIP(cleaned);
  if (ipVer === 4) return isPrivateOrReservedIpv4(cleaned);
  if (ipVer === 6) {
    return (
      cleaned === '::' ||
      cleaned === '::1' ||
      cleaned.startsWith('fc') ||
      cleaned.startsWith('fd') ||
      cleaned.startsWith('fe80:') ||
      cleaned.startsWith('ff')
    );
  }
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (BLOCKED_EXACT_HOSTS.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (net.isIP(host)) return isPrivateOrReservedIp(host);
  return false;
}

async function assertPublicWebhookTarget(rawUrl: string): Promise<URL> {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || trimmed.length > MAX_WEBHOOK_URL_LENGTH) {
    throw new Error('Invalid Google Sheets Webhook URL.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Please enter a valid Google Sheets Webhook URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Google Sheets Webhook URL must start with https://');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Webhook URL must not include embedded credentials.');
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error('Private or local webhook hosts are not allowed.');
  }
  try {
    const records = await dns.promises.lookup(parsed.hostname, {
      all: true,
      verbatim: true,
    });
    if (
      records.length > 0 &&
      records.some((r) => isPrivateOrReservedIp(r.address))
    ) {
      throw new Error('Resolved webhook address is private.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('private')) {
      throw err;
    }
  }
  return parsed;
}

function sanitizeWebhookPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeWebhookPayload(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) continue;
      if (val !== undefined) {
        out[key] = sanitizeWebhookPayload(val);
      }
    }
    return out as T;
  }
  return value;
}

export async function handleSheetsSync(
  req: ApiReqLike,
  res: ApiResLike
): Promise<unknown> {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  let body: { webhookUrl?: unknown; payload?: unknown } = {};
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body) as { webhookUrl?: unknown; payload?: unknown };
    } catch {
      return res.status(400).json({ ok: false, error: 'Invalid JSON body.' });
    }
  } else if (req.body && typeof req.body === 'object') {
    body = req.body as { webhookUrl?: unknown; payload?: unknown };
  }

  const rawUrl = String(body.webhookUrl || '').trim();
  if (!rawUrl) {
    return res
      .status(400)
      .json({ ok: false, error: 'Missing Google Sheets Webhook URL.' });
  }

  if (!body.payload || typeof body.payload !== 'object') {
    return res.status(400).json({ ok: false, error: 'Missing sync payload.' });
  }

  let targetUrl: URL;
  try {
    targetUrl = await assertPublicWebhookTarget(rawUrl);
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid webhook URL.',
    });
  }

  const cleanPayload = sanitizeWebhookPayload(
    body.payload as Record<string, unknown>
  );

  try {
    const response = await fetch(targetUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cleanPayload),
      redirect: 'follow',
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    return res.status(200).json({
      ok: response.ok,
      status: response.status,
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Webhook delivery failed.',
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleSheetsSync(req, res);
}
