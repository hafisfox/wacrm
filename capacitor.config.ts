import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.salusalon.dashboard',
  appName: 'Salu Salon',
  webDir: 'mobile-shell',
  backgroundColor: '#17181d',
  loggingBehavior: 'debug',
  server: {
    // The dashboard needs its Next.js server routes, so the Android shell
    // opens the production deployment directly instead of copying a stale
    // static snapshot into the APK.
    url: process.env.CAPACITOR_SERVER_URL ?? 'https://salu-salon.vercel.app',
    androidScheme: 'https',
    cleartext: false,
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#17181d',
    webContentsDebuggingEnabled: false,
  },
};

export default config;
