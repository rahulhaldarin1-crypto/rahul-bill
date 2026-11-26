import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

const FIREBASE_PROJECT_ID = 'rahul-bill';
const AUTHORIZED_ADMIN_EMAILS = new Set([
  'rahulhaldar.in1@gmail.com',
  'rahulhaldar.in@gmail.com',
  'mohontopuja27@gmail.com',
]);

const DEFAULT_WELCOME_SUBJECT =
  "Welcome to Glamour Galleria — You're Invited to Shop!";
const DEFAULT_WELCOME_MESSAGE =
  'You are warmly invited to shop our latest collections at Glamour Galleria! Explore exclusive fashion, cosmetics, and winter wear.';
const CUSTOMER_PANEL_URL = 'https://glamour-galleria.vercel.app';

let cachedGoogleCerts: { certs: Record<string, string>; expiresAtMs: number } | null =
  null;

function escapeHtml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  if (cachedGoogleCerts && cachedGoogleCerts.expiresAtMs > Date.now()) {
    return cachedGoogleCerts.certs;
  }
  const response = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!response.ok) {
    throw new Error('Failed to fetch Firebase public verification certificates.');
  }
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = (await response.json()) as Record<string, string>;
  cachedGoogleCerts = {
    certs,
    expiresAtMs: Date.now() + Math.max(60, maxAgeSec) * 1000,
  };
  return certs;
}

async function verifyAuthorizedAdminToken(
  authHeader?: string
): Promise<{ ok: true; email: string } | { ok: false; status: number; error: string }> {
  const raw = String(authHeader || '').trim();
  if (!raw.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing Admin Google authentication token.' };
  }
  const token = raw.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, status: 401, error: 'Invalid authentication token format.' };
  }
  try {
    const [headerB64, payloadB64, sigB64] = parts;
    const header = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString('utf8')
    ) as {
      alg?: string;
      kid?: string;
    };
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as {
      aud?: string;
      iss?: string;
      sub?: string;
      exp?: number;
      email?: string;
      email_verified?: boolean;
    };

    if (header.alg !== 'RS256' || !header.kid) {
      return { ok: false, status: 401, error: 'Unsupported token algorithm.' };
    }
    const certs = await getGooglePublicCerts();
    const certPem = certs[header.kid];
    if (!certPem) {
      return { ok: false, status: 401, error: 'Unrecognized signing certificate.' };
    }
    const signatureValid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${headerB64}.${payloadB64}`, 'utf8'),
      certPem,
      Buffer.from(sigB64, 'base64url')
    );
    if (!signatureValid) {
      return { ok: false, status: 401, error: 'Invalid authentication token signature.' };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (
      payload.aud !== FIREBASE_PROJECT_ID ||
      payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` ||
      !payload.sub ||
      typeof payload.exp !== 'number' ||
      payload.exp <= nowSec
    ) {
      return { ok: false, status: 401, error: 'Authentication session expired or invalid.' };
    }
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email || payload.email_verified !== true || !AUTHORIZED_ADMIN_EMAILS.has(email)) {
      return {
        ok: false,
        status: 403,
        error: 'Access Denied: Unauthorized Admin Account',
      };
    }
    return { ok: true, email };
  } catch {
    return { ok: false, status: 401, error: 'Failed to verify Admin session token.' };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const authHeader =
      typeof req.headers.authorization === 'string'
        ? req.headers.authorization
        : Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : undefined;

    const authCheck = await verifyAuthorizedAdminToken(authHeader);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }

    let parsedBody: Record<string, unknown> = {};
    if (typeof req.body === 'string') {
      try {
        parsedBody = JSON.parse(req.body) as Record<string, unknown>;
      } catch {
        parsedBody = {};
      }
    } else if (req.body && typeof req.body === 'object') {
      parsedBody = req.body as Record<string, unknown>;
    }

    const rawMessage = String(parsedBody.message || '').trim();
    const rawHtml = String(parsedBody.html || '').trim();
    const fallbackPlainFromHtml = rawHtml
      ? rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    const subject = String(parsedBody.subject || '').trim() || DEFAULT_WELCOME_SUBJECT;
    const message = rawMessage || fallbackPlainFromHtml || DEFAULT_WELCOME_MESSAGE;
    const category = String(parsedBody.category || '').trim() || 'All Categories';

    if (subject.length > 200) {
      res.status(400).json({ error: 'Email subject cannot exceed 200 characters.' });
      return;
    }
    if (message.length > 6000) {
      res
        .status(400)
        .json({ error: 'Offer or notice message cannot exceed 6000 characters.' });
      return;
    }

    const uniqueRecipients = new Map<string, { email: string; name: string }>();
    const addNormalizedRecipient = (rawEmail: unknown, rawName?: unknown) => {
      const email = String(rawEmail || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
      if (!uniqueRecipients.has(email)) {
        uniqueRecipients.set(email, {
          email,
          name: String(rawName || 'Valued Customer').trim() || 'Valued Customer',
        });
      }
    };

    if (Array.isArray(parsedBody.recipients)) {
      for (const item of parsedBody.recipients) {
        if (typeof item === 'string') {
          addNormalizedRecipient(item);
        } else if (item && typeof item === 'object') {
          const recObj = item as { email?: unknown; name?: unknown };
          addNormalizedRecipient(recObj.email, recObj.name);
        }
      }
    }

    if (typeof parsedBody.to === 'string') {
      for (const part of parsedBody.to.split(/[\s,;]+/)) {
        addNormalizedRecipient(part);
      }
    } else if (Array.isArray(parsedBody.to)) {
      for (const item of parsedBody.to) {
        if (typeof item === 'string') {
          addNormalizedRecipient(item);
        } else if (item && typeof item === 'object') {
          const toObj = item as { email?: unknown; name?: unknown };
          addNormalizedRecipient(toObj.email, toObj.name);
        }
      }
    }

    const recipientList = Array.from(uniqueRecipients.values()).slice(0, 100);
    if (recipientList.length === 0) {
      res.status(400).json({ error: 'No valid recipient email address was provided.' });
      return;
    }

    const smtpHost = String(process.env.SMTP_HOST || '').trim();
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = String(process.env.SMTP_USER || '').trim();
    const smtpPass = String(process.env.SMTP_PASS || '').trim();
    const fromEmail = String(process.env.OTP_FROM_EMAIL || smtpUser).trim();

    if (!smtpHost || !smtpUser || !smtpPass || !fromEmail || !Number.isFinite(smtpPort)) {
      res.status(503).json({
        error:
          'SMTP email service is not configured yet. Please configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and OTP_FROM_EMAIL environment variables.',
      });
      return;
    }

    const senderDisplay = `"Glamour Galleria" <${fromEmail}>`;
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const formattedParagraphs = rawMessage
      ? rawMessage
          .split(/\r?\n/)
          .map((line) =>
            line.trim()
              ? `<p style="margin:0 0 12px;line-height:1.6;">${escapeHtml(line)}</p>`
              : '<div style="height:8px;"></div>'
          )
          .join('')
      : rawHtml ||
        message
          .split(/\r?\n/)
          .map((line) =>
            line.trim()
              ? `<p style="margin:0 0 12px;line-height:1.6;">${escapeHtml(line)}</p>`
              : '<div style="height:8px;"></div>'
          )
          .join('');

    const logs: Array<{
      email: string;
      name: string;
      status: 'sent' | 'failed';
      error?: string;
    }> = [];
    let sentCount = 0;
    let failedCount = 0;

    const sendSingleRecipient = async (recipient: { email: string; name: string }) => {
      try {
        const personalizedHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #EFE2F5; border-radius: 16px; background: #FDF9FC; color: #1F122B;">
            <div style="border-bottom: 1px solid #EDE1F4; padding-bottom: 14px; margin-bottom: 18px;">
              <h2 style="margin: 0; color: #6D28D9; font-size: 22px;">Glamour Galleria</h2>
              ${category ? `<p style="margin: 4px 0 0; font-size: 12px; color: #7E22CE; font-weight: bold;">${escapeHtml(category)}</p>` : ''}
            </div>
            <p style="margin: 0 0 14px; font-size: 14px;">Hello <strong>${escapeHtml(recipient.name)}</strong>,</p>
            <div style="font-size: 14px; color: #2E1F3D; background: #FFFFFF; border: 1px solid #EFE2F5; border-radius: 12px; padding: 18px;">
              ${formattedParagraphs}
            </div>
            <div style="margin: 20px 0 8px; text-align: center;">
              <a href="${CUSTOMER_PANEL_URL}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 24px; border-radius: 10px; background-color: #7E22CE; background: linear-gradient(135deg, #DB2777, #7E22CE); color: #FFFFFF; text-decoration: none; font-weight: bold; font-size: 14px;">Visit Glamour Galleria</a>
              <div style="margin-top: 8px; font-size: 11px; color: #6B5B7B;">
                Shop now: <a href="${CUSTOMER_PANEL_URL}" target="_blank" rel="noopener noreferrer" style="color: #7E22CE; text-decoration: underline;">${CUSTOMER_PANEL_URL}</a>
              </div>
            </div>
            <p style="margin: 18px 0 0; font-size: 12px; color: #6B5B7B;">Warm regards,<br/><strong>Glamour Galleria</strong></p>
          </div>
        `;
        const personalizedText = `Hello ${recipient.name},\n\n${message}\n\nVisit Glamour Galleria: ${CUSTOMER_PANEL_URL}\n\nWarm regards,\nGlamour Galleria`;

        await transporter.sendMail({
          from: senderDisplay,
          to: recipient.email,
          subject,
          text: personalizedText,
          html: personalizedHtml,
        });
        sentCount += 1;
        return { email: recipient.email, name: recipient.name, status: 'sent' as const };
      } catch (sendErr) {
        failedCount += 1;
        return {
          email: recipient.email,
          name: recipient.name,
          status: 'failed' as const,
          error: sendErr instanceof Error ? sendErr.message : 'Delivery failed',
        };
      }
    };

    const CHUNK_SIZE = 5;
    for (let i = 0; i < recipientList.length; i += CHUNK_SIZE) {
      const chunk = recipientList.slice(i, i + CHUNK_SIZE);
      const chunkLogs = await Promise.all(chunk.map((r) => sendSingleRecipient(r)));
      logs.push(...chunkLogs);
    }

    res.status(200).json({
      totalRequested: recipientList.length,
      sentCount,
      failedCount,
      senderDisplay,
      logs,
    });
  } catch (err) {
    console.error('Smart offers mail error:', err);
    const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
    res.status(500).json({
      error: `Could not send Smart Offers Mail. Please verify your SMTP configuration and try again.${detail}`,
    });
  }
}
