import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.apexicrypto.intelligence',
  appName: 'ApexiCrypto',
  webDir: 'dist',
  // IMPORTANT: no server.url, no AI Studio, no Cloud Run and no embedded API key.
  plugins: { CapacitorHttp: { enabled: true } },
};
export default config;
