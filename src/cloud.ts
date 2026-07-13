import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isCloudConfigured } from './cloudConfig'
import type { RecoverySnapshot } from './recovery'

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

export async function loadCloudRecoverySnapshots(userId: string): Promise<unknown[]> {
  const { data, error } = await requireClient()
    .from('app_recovery_snapshots')
    .select('id, created_at, reason, data_hash, data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: Date.parse(row.created_at),
    reason: row.reason,
    hash: row.data_hash,
    data: row.data,
  }))
}

export async function saveCloudRecoverySnapshots(userId: string, copies: RecoverySnapshot[]) {
  if (copies.length === 0) return
  const rows = copies.map((copy) => ({
    user_id: userId,
    id: copy.id,
    created_at: new Date(copy.createdAt).toISOString(),
    reason: copy.reason,
    data_hash: copy.hash,
    data: copy.data,
  }))
  const { error } = await requireClient()
    .from('app_recovery_snapshots')
    .upsert(rows, { onConflict: 'user_id,id' })
  if (error) throw new Error(error.message)
}

export async function deleteCloudRecoverySnapshots(userId: string, ids: string[]) {
  if (ids.length === 0) return
  const { error } = await requireClient()
    .from('app_recovery_snapshots')
    .delete()
    .eq('user_id', userId)
    .in('id', ids)
  if (error) throw new Error(error.message)
}

export async function loadCloudRecoveryDeletedIds(userId: string): Promise<string[]> {
  const { data, error } = await requireClient()
    .from('app_recovery_deletions')
    .select('id')
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
  return (data ?? []).flatMap((row) => (typeof row.id === 'string' ? [row.id] : []))
}

export async function saveCloudRecoveryDeletedIds(userId: string, ids: string[]) {
  if (ids.length === 0) return
  const deletedAt = new Date().toISOString()
  const { error } = await requireClient()
    .from('app_recovery_deletions')
    .upsert(
      ids.map((id) => ({ user_id: userId, id, deleted_at: deletedAt })),
      { onConflict: 'user_id,id' },
    )
  if (error) throw new Error(error.message)
}
