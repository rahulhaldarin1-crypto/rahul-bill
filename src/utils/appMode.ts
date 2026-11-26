import { Capacitor } from '@capacitor/core';

export type AppMode = 'admin' | 'customer';

const ADMIN_API_ORIGIN = 'https://ggadminpanel-jade.vercel.app';

function normalizeAppMode(raw?: string): AppMode {
  const clean = String(raw || '').trim().toLowerCase();
  if (clean === 'admin') return 'admin';
  return 'customer';
}

export function isNativeCapacitorApp(): boolean {
  try {
    return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getAppMode(): AppMode {
  if (isNativeCapacitorApp()) {
    return 'admin';
  }
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

export function resolveApiUrl(path: string): string {
  if (!path.startsWith('/')) return path;
  if (isNativeCapacitorApp()) {
    return `${ADMIN_API_ORIGIN}${path}`;
  }
  return path;
}

