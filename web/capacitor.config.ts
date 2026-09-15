import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kahabox.app',
  appName: 'Kahabox Caja',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
}

export default config