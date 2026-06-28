import { registerPlugin } from '@capacitor/core'

export interface RestAlarmPlugin {
  // Schedule a strong locked-screen vibration at the given epoch-ms time.
  schedule(options: { at: number }): Promise<{ scheduled: boolean; exact: boolean }>
  cancel(): Promise<void>
}

export const RestAlarm = registerPlugin<RestAlarmPlugin>('RestAlarm')
