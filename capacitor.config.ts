import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.calsci.calculator',
  appName: 'CalSci',
  webDir: 'dist',
  android: { backgroundColor: '#F2EDE4' },
  plugins: {
    StatusBar: { overlaysWebView: false },
  },
};

export default config;
