
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ordertracker.pro',
  appName: 'Order Tracker Pro',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
