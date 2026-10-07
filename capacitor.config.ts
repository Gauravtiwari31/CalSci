import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.calsci.calculator',
  appName: 'CalSci',
  webDir: 'dist',
  android: { backgroundColor: '#E8ECEF' },
  plugins: {
    StatusBar: { overlaysWebView: false },
  },
};

export default config;
