import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'x-vercel-ip-country');

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawHeader = req.headers['x-vercel-ip-country'];
  const headerStr = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const countryCode = String(headerStr || '').trim().toUpperCase();

  return res.status(200).json({
    countryCode: countryCode || null,
    isBangladesh: countryCode === 'BD',
    source: countryCode ? 'vercel-ip-country' : 'none',
  });
}
