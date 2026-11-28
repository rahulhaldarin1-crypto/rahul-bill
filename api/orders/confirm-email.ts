import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

const FIREBASE_PROJECT_ID = 'rahul-bill';
const CUSTOMER_PANEL_URL = 'https://glamour-galleria.vercel.app';

const ALLOWED_CORS_ORIGINS = new Set([
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'https://ggadminpanel-jade.vercel.app',
  'https://glamour-galleria.vercel.app',
]);

function applyCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const originHeader = req.headers.origin;
  const origin = typeof originHeader === 'string' ? originHeader.trim() : '';
  if (origin && ALLOWED_CORS_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function escapeHtml(val: string): string {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHttpsImageUrl(raw?: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return u.toString();
    }
  } catch {
    // ignore invalid image URL
  }
  return '';
}

interface FirestoreRestValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  arrayValue?: { values?: FirestoreRestValue[] };
  mapValue?: { fields?: Record<string, FirestoreRestValue> };
}

function decodeRestValue(val?: FirestoreRestValue): unknown {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('arrayValue' in val) {
    return (val.arrayValue?.values || []).map((v) => decodeRestValue(v));
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    const fields = val.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeRestValue(v);
    }
    return out;
  }
  return undefined;
}

async function fetchFirestoreDoc(
  collectionName: string,
  docId: string
): Promise<Record<string, unknown> | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${encodeURIComponent(
    collectionName
  )}/${encodeURIComponent(docId)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as { fields?: Record<string, FirestoreRestValue> };
  if (!json.fields) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(json.fields)) {
    out[k] = decodeRestValue(v);
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = (req.body || {}) as { orderId?: unknown; eventType?: unknown };
    const orderId = String(body.orderId || '').trim();
    const eventType = body.eventType === 'confirmed' ? 'confirmed' : 'placed';

    if (!/^[a-zA-Z0-9_-]{4,128}$/.test(orderId)) {
      res.status(400).json({ error: 'Valid orderId is required.' });
      return;
    }

    const smtpHost = String(process.env.SMTP_HOST || '').trim();
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = String(process.env.SMTP_USER || '').trim();
    const smtpPass = String(process.env.SMTP_PASS || '').trim();
    const fromEmail = String(process.env.OTP_FROM_EMAIL || smtpUser).trim();

    if (!smtpHost || !smtpUser || !smtpPass || !fromEmail || !Number.isFinite(smtpPort)) {
      res.json({ ok: true, skipped: true, reason: 'SMTP not configured' });
      return;
    }

    const order = await fetchFirestoreDoc('orders', orderId);
    if (!order) {
      res.status(404).json({ error: 'Order record not found.' });
      return;
    }

    let recipientEmail = String(order.customerEmail || '').trim().toLowerCase();
    const clientId = String(order.clientId || '').trim();
    if (!recipientEmail && /^[a-zA-Z0-9_-]{4,128}$/.test(clientId)) {
      const client = await fetchFirestoreDoc('clients', clientId);
      if (client) {
        recipientEmail = String(client.email || '').trim().toLowerCase();
      }
    }

    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      res.json({ ok: true, skipped: true, reason: 'Customer email unavailable' });
      return;
    }

    const orderNumber = String(order.orderNumber || orderId);
    const customerName = String(order.customerName || 'Valued Customer');
    const orderDate = String(
      order.orderDate ||
        (typeof order.createdAt === 'string' ? order.createdAt.slice(0, 10) : '')
    );
    const estDelivery = String(order.estimatedDeliveryDate || 'Within 5 days');
    const paymentMethod =
      order.paymentMethod === 'UPI' ? 'Online Payment (UPI)' : 'Cash on Delivery (COD)';
    const totalAmount = Number(order.totalAmount || 0);
    const deliveryCharge = Number(order.deliveryCharge || 0);

    const rawItems = Array.isArray(order.items)
      ? (order.items as Array<Record<string, unknown>>)
      : [
          {
            productName: order.productName,
            productSize: order.productSize,
            quantity: order.quantity,
            unitPrice: order.unitPrice,
            lineTotal: order.subtotal ?? order.totalAmount,
            selectedImageUrl: order.selectedImageUrl || order.imageDataUrl,
            imageDataUrl: order.imageDataUrl,
          },
        ];

    const addressParts = [
      String(order.customerAddress || '').trim(),
      String(order.customerCity || '').trim(),
      String(order.customerState || '').trim(),
      String(order.customerPinCode || '').trim(),
    ].filter(Boolean);

    const itemsHtml = rawItems
      .map((it) => {
        const title = escapeHtml(String(it.productName || 'Product'));
        const sizeText = it.productSize
          ? `Size: ${escapeHtml(String(it.productSize))}`
          : '';
        const qty = Math.max(1, Number(it.quantity || 1));
        const lineTotal = Number(it.lineTotal || Number(it.unitPrice || 0) * qty);
        const imgUrl = safeHttpsImageUrl(
          String(it.selectedImageUrl || it.imageDataUrl || '')
        );
        return `
          <tr>
            <td style="padding:10px 8px;border-bottom:1px solid #F4ECF8;vertical-align:top;width:64px;">
              ${
                imgUrl
                  ? `<img src="${escapeHtml(imgUrl)}" alt="${title}" width="56" height="56" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #E6D9EE;display:block;" />`
                  : `<div style="width:56px;height:56px;border-radius:8px;background:#FAF5FF;border:1px solid #E6D9EE;"></div>`
              }
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid #F4ECF8;vertical-align:top;font-size:13px;color:#1F122B;">
              <div style="font-weight:bold;">${title}</div>
              <div style="font-size:12px;color:#6B5B7B;margin-top:2px;">
                ${[sizeText, `Qty: ${qty}`].filter(Boolean).join(' &middot; ')}
              </div>
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid #F4ECF8;vertical-align:top;text-align:right;font-size:13px;font-weight:bold;color:#7E22CE;white-space:nowrap;">
              ₹${lineTotal.toLocaleString('en-IN')}
            </td>
          </tr>
        `;
      })
      .join('');

    const isConfirmedEvent = eventType === 'confirmed';
    const subject = isConfirmedEvent
      ? `Order Confirmed: ${orderNumber} — Glamour Galleria`
      : `Order Confirmation: ${orderNumber} Received — Glamour Galleria`;
    const headline = isConfirmedEvent
      ? `Great news! Your order ${orderNumber} is confirmed.`
      : `Thank you for your order! (${orderNumber})`;
    const statusNote = isConfirmedEvent
      ? 'Your order has been confirmed by Glamour Galleria and your official bill is now ready in your customer account.'
      : 'We have received your order and our team is reviewing it now. Your official bill will appear in your account once confirmed.';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #EFE2F5; border-radius: 16px; background: #FDF9FC; color: #1F122B;">
        <div style="border-bottom: 1px solid #EDE1F4; padding-bottom: 14px; margin-bottom: 16px;">
          <h2 style="margin: 0; color: #6D28D9; font-size: 22px;">Glamour Galleria</h2>
          <p style="margin: 6px 0 0; font-size: 13px; font-weight: bold; color: #DB2777;">${escapeHtml(headline)}</p>
        </div>

        <p style="margin: 0 0 12px; font-size: 14px;">Hello <strong>${escapeHtml(customerName)}</strong>,</p>
        <p style="margin: 0 0 16px; font-size: 13px; color: #4A3B59; line-height: 1.5;">${escapeHtml(statusNote)}</p>

        <div style="background: #FFFFFF; border: 1px solid #EFE2F5; border-radius: 12px; padding: 14px; margin-bottom: 16px;">
          <div style="font-size: 12px; color: #6B5B7B; margin-bottom: 8px;">
            <strong>Order #:</strong> ${escapeHtml(orderNumber)} &middot; <strong>Date:</strong> ${escapeHtml(orderDate)} &middot; <strong>Est. Delivery:</strong> ${escapeHtml(estDelivery)}
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            ${itemsHtml}
          </table>
          ${
            deliveryCharge > 0
              ? `<div style="text-align:right;font-size:12px;color:#B45309;padding-top:8px;">COD Delivery Fee: + ₹${deliveryCharge.toLocaleString('en-IN')}</div>`
              : ''
          }
          <div style="text-align:right;font-size:15px;font-weight:bold;color:#1F122B;padding-top:10px;border-top:1px solid #F4ECF8;margin-top:8px;">
            Total Amount: ₹${totalAmount.toLocaleString('en-IN')}
          </div>
        </div>

        <div style="background: #FFFFFF; border: 1px solid #EFE2F5; border-radius: 12px; padding: 14px; font-size: 12px; color: #4A3B59; line-height: 1.5;">
          <div><strong>Payment Method:</strong> ${escapeHtml(paymentMethod)}</div>
          <div><strong>Delivery Address:</strong> ${escapeHtml(addressParts.join(', '))}</div>
        </div>

        <div style="margin: 20px 0 6px; text-align: center;">
          <a href="${CUSTOMER_PANEL_URL}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 24px; border-radius: 10px; background-color: #7E22CE; color: #FFFFFF; text-decoration: none; font-weight: bold; font-size: 14px;">View My Order</a>
        </div>
        <p style="margin: 16px 0 0; font-size: 12px; color: #6B5B7B;">Warm regards,<br/><strong>Glamour Galleria</strong></p>
      </div>
    `;

    const textLines = [
      `Hello ${customerName},`,
      '',
      headline,
      statusNote,
      '',
      `Order #: ${orderNumber}`,
      `Date: ${orderDate}`,
      `Estimated Delivery: ${estDelivery}`,
      `Payment Method: ${paymentMethod}`,
      ...rawItems.map((it) => {
        const sizeLabel = it.productSize ? ` (Size: ${it.productSize})` : '';
        const qty = Math.max(1, Number(it.quantity || 1));
        const lineTotal = Number(it.lineTotal || Number(it.unitPrice || 0) * qty);
        return `- ${it.productName}${sizeLabel} x ${qty}: ₹${lineTotal}`;
      }),
      ...(deliveryCharge > 0 ? [`COD Delivery Fee: ₹${deliveryCharge}`] : []),
      `Total Amount: ₹${totalAmount}`,
      `Delivery Address: ${addressParts.join(', ')}`,
      '',
      `Track your order at: ${CUSTOMER_PANEL_URL}`,
    ];

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: `"Glamour Galleria" <${fromEmail}>`,
      to: recipientEmail,
      subject,
      text: textLines.join('\n'),
      html,
    });

    res.json({ ok: true, sentTo: recipientEmail, orderNumber });
  } catch (err) {
    console.error('Order confirmation email error:', err);
    res.json({
      ok: false,
      skipped: true,
      error: 'Could not dispatch order confirmation email.',
    });
  }
}
