/// <reference types="@capacitor/local-notifications" />

import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.echonad3.fitnesshub',
  appName: 'Fitness Hub',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_fitness',
      iconColor: '#6074f3',
    },
  },
}

export default config
