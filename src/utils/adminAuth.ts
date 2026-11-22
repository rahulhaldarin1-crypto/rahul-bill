const ADMIN_LOCK_SALT = 'gg-admin-lock';
const ADMIN_LOCK_HASH =
  '06396ba7f04071011891d9a3d464a6072568d0ae80200de267cf770d74a3c6dc';

function sha256Fallback(ascii: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);

      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

async function computeSha256(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return sha256Fallback(input);
}

async function computeSaltedSha256(passcode: string): Promise<string> {
  return computeSha256(`${ADMIN_LOCK_SALT}:${passcode}`);
}

const ADMIN_UNLOCKED_KEY = 'gg_admin_unlocked_persistent_v2';
const LEGACY_ADMIN_SESSION_KEY = 'gg_admin_unlocked_session_v1';
const LEGACY_ADMIN_KEY = 'gg_admin_unlocked_v1';
const CUSTOMER_SESSION_KEY = 'gg_customer_client_id_persistent_v2';
const LEGACY_CUSTOMER_KEY = 'gg_customer_client_id_v1';

export function isAdminUnlockedStored(): boolean {
  try {
    if (localStorage.getItem(ADMIN_UNLOCKED_KEY) === 'true') {
      return true;
    }
    // Migrate one-time from prior session/legacy keys if present
    if (
      sessionStorage.getItem(LEGACY_ADMIN_SESSION_KEY) === 'true' ||
      localStorage.getItem(LEGACY_ADMIN_KEY) === 'true'
    ) {
      localStorage.setItem(ADMIN_UNLOCKED_KEY, 'true');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function setAdminUnlockedStored(unlocked: boolean): void {
  try {
    localStorage.removeItem(LEGACY_ADMIN_KEY);
    sessionStorage.removeItem(LEGACY_ADMIN_SESSION_KEY);
    if (unlocked) {
      localStorage.setItem(ADMIN_UNLOCKED_KEY, 'true');
    } else {
      localStorage.removeItem(ADMIN_UNLOCKED_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export function getCustomerSessionId(): string | null {
  try {
    const id = localStorage.getItem(CUSTOMER_SESSION_KEY);
    if (id && id.trim()) return id.trim();
    const legacy =
      sessionStorage.getItem(LEGACY_CUSTOMER_KEY) ||
      localStorage.getItem(LEGACY_CUSTOMER_KEY);
    if (legacy && legacy.trim()) {
      const clean = legacy.trim();
      localStorage.setItem(CUSTOMER_SESSION_KEY, clean);
      return clean;
    }
    return null;
  } catch {
    return null;
  }
}

export function setCustomerSessionId(clientId: string | null): void {
  try {
    sessionStorage.removeItem(LEGACY_CUSTOMER_KEY);
    localStorage.removeItem(LEGACY_CUSTOMER_KEY);
    if (clientId && clientId.trim()) {
      localStorage.setItem(CUSTOMER_SESSION_KEY, clientId.trim());
    } else {
      localStorage.removeItem(CUSTOMER_SESSION_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export async function verifyAdminPasscode(passcode: string): Promise<boolean> {
  const trimmed = passcode.trim();
  if (!trimmed) return false;

  const envPasscode = (import.meta.env?.VITE_ADMIN_PASSCODE as string | undefined)?.trim();
  if (envPasscode) {
    return trimmed === envPasscode;
  }

  const hash = await computeSaltedSha256(trimmed);
  return hash === ADMIN_LOCK_HASH;
}

export async function hashCustomerPassword(
  password: string,
  providedSalt?: string
): Promise<{ salt: string; hash: string }> {
  const clean = password.trim();
  const salt =
    providedSalt ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
  const hash = await computeSha256(`gg-cust:${salt}:${clean}`);
  return { salt, hash };
}

export async function verifyCustomerPassword(
  password: string,
  salt: string | undefined,
  expectedHash: string | undefined
): Promise<boolean> {
  const clean = password.trim();
  if (!clean || !expectedHash) return false;
  const { hash } = await hashCustomerPassword(clean, salt || 'gg-default-salt');
  return hash === expectedHash;
}

function getKeystreamBytes(salt: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let offset = 0;
  let blockIndex = 0;
  while (offset < length) {
    const blockHex = sha256Fallback(`gg-rp:${salt}:${blockIndex}`);
    for (let i = 0; i < blockHex.length && offset < length; i += 2) {
      out[offset++] = parseInt(blockHex.slice(i, i + 2), 16) || 0;
    }
    blockIndex += 1;
  }
  return out;
}

export function encryptRunningPassword(password: string, salt: string): string {
  const clean = password.trim();
  if (!clean) return '';
  const bytes = new TextEncoder().encode(clean);
  const key = getKeystreamBytes(salt || 'gg-default-salt', bytes.length);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] ^ key[i]).toString(16).padStart(2, '0');
  }
  return `v1:${hex}`;
}

export function decryptRunningPassword(
  encoded: string | undefined,
  salt: string | undefined
): string {
  if (!encoded || !encoded.startsWith('v1:')) return '';
  const hex = encoded.slice(3);
  if (!hex || hex.length % 2 !== 0) return '';
  try {
    const len = hex.length / 2;
    const bytes = new Uint8Array(len);
    const key = getKeystreamBytes(salt || 'gg-default-salt', len);
    for (let i = 0; i < len; i++) {
      const byteVal = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      if (Number.isNaN(byteVal)) return '';
      bytes[i] = byteVal ^ key[i];
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}
