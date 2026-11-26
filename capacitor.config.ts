import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.glamourgalleria.admin',
  appName: 'GG Admin Panel',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      'ggadminpanel-jade.vercel.app',
      'rahul-bill.firebaseapp.com',
      '*.firebaseapp.com',
      'accounts.google.com',
      '*.googleapis.com',
      '*.google.com',
    ],
  },
  android: {
    allowMixedContent: true,
    overrideUserAgent:
      'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  },
};

export default config;
