import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isCloudConfigured } from './cloudConfig'

// Null when cloud is not configured, so the app degrades to offline-only.
export const supabase: SupabaseClient | null = isCloudConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null

export type CloudState = {
  data: unknown
  updatedAt: string
}

function requireClient() {
  if (!supabase) {
    throw new Error('Cloud sync is unavailable.')
  }

  return supabase
}

export async function loadCloudState(userId: string): Promise<CloudState | null> {
  const { data, error } = await requireClient()
    .from('app_state')
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ? { data: data.data, updatedAt: data.updated_at } : null
}

export async function saveCloudState(userId: string, data: unknown, updatedAt: number) {
  const timestamp = new Date(updatedAt).toISOString()
  const { error } = await requireClient()
    .from('app_state')
    .upsert({ user_id: userId, data, updated_at: timestamp }, { onConflict: 'user_id' })

  if (error) {
    throw new Error(error.message)
  }
}
