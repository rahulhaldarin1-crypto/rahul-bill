export type AppMode = 'admin' | 'customer';

function normalizeAppMode(raw?: string): AppMode {
  const clean = String(raw || '').trim().toLowerCase();
  if (clean === 'admin') return 'admin';
  return 'customer';
}

export function getAppMode(): AppMode {
  if (typeof window !== 'undefined' && window.__APP_MODE__) {
    return normalizeAppMode(window.__APP_MODE__);
  }
  const viteDefined =
    (import.meta.env?.APP_MODE as string | undefined) ||
    (import.meta.env?.VITE_APP_MODE as string | undefined);
  return normalizeAppMode(viteDefined);
}

export function isAdminOnlyAppMode(): boolean {
  return getAppMode() === 'admin';
}
