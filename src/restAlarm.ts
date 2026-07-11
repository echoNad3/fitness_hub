import { registerPlugin } from '@capacitor/core'

export interface RestAlarmPlugin {
  // Schedule the strong one-shot locked-screen rest pattern at the given epoch-ms time.
  schedule(options: { at: number }): Promise<{ scheduled: boolean; exact: boolean }>
  cancel(): Promise<void>
  preview(): Promise<{ performed: boolean }>
}

export const RestAlarm = registerPlugin<RestAlarmPlugin>('RestAlarm')
