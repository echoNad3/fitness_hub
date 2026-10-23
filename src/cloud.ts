import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isCloudConfigured } from './cloudConfig'
import { saveNewestCloudState } from './cloudWrite'
import { isProtectedRecoveryCopy, type RecoverySnapshot } from './recovery'
import { timedCloudFetch } from './cloudRequests'

const RECOVERY_PAGE_SIZE = 200
const RECOVERY_PAYLOAD_BATCH = 5

// Null when cloud is not configured, so the app degrades to offline-only.
export const supabase: SupabaseClient | null = isCloudConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { global: { fetch: timedCloudFetch } })
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
  const client = requireClient()

  await saveNewestCloudState(
    {
      updateIfOlder: async () => {
        const { data: updated, error } = await client
          .from('app_state')
          .update({ data, updated_at: timestamp })
          .eq('user_id', userId)
          .lt('updated_at', timestamp)
          .select('updated_at')
          .maybeSingle()
        if (error) throw new Error(error.message)
        return updated !== null
      },
      insert: async () => {
        const { error } = await client
          .from('app_state')
          .insert({ user_id: userId, data, updated_at: timestamp })
        if (!error) return 'inserted'
        if (error.code === '23505') return 'conflict'
        throw new Error(error.message)
      },
      readUpdatedAt: async () => {
        const { data: current, error } = await client
          .from('app_state')
          .select('updated_at')
          .eq('user_id', userId)
          .maybeSingle()
        if (error) throw new Error(error.message)
        if (!current) return null
        const parsed = Date.parse(current.updated_at)
        return Number.isFinite(parsed) ? parsed : null
      },
    },
    updatedAt,
  )
}

export type CloudRecoveryIndex = Pick<RecoverySnapshot, 'id' | 'createdAt' | 'reason' | 'hash' | 'retention'>

export async function loadCloudRecoveryIndex(userId: string): Promise<CloudRecoveryIndex[]> {
  const result: CloudRecoveryIndex[] = []
  let cursor = ''
  while (true) {
    let query = requireClient().from('app_recovery_snapshots')
      .select('id, created_at, reason, data_hash, retention')
      .eq('user_id', userId).order('id').limit(RECOVERY_PAGE_SIZE)
    if (cursor) query = query.gt('id', cursor)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const rows = data ?? []
    result.push(...rows.map(row => ({
      id: row.id, createdAt: Date.parse(row.created_at), reason: row.reason,
      hash: row.data_hash, retention: row.retention ?? undefined,
    })))
    if (rows.length < RECOVERY_PAGE_SIZE) return result
    cursor = rows.at(-1)!.id
  }
}

export async function loadCloudRecoverySnapshots(userId: string, ids: string[]): Promise<unknown[]> {
  const result: unknown[] = []
  for (let start = 0; start < ids.length; start += RECOVERY_PAYLOAD_BATCH) {
    const { data, error } = await requireClient()
      .from('app_recovery_snapshots')
      .select('id, created_at, reason, data_hash, data, retention')
      .eq('user_id', userId)
      .in('id', ids.slice(start, start + RECOVERY_PAYLOAD_BATCH))
    if (error) throw new Error(error.message)
    result.push(...(data ?? []).map((row) => ({
      id: row.id,
      createdAt: Date.parse(row.created_at),
      reason: row.reason,
      hash: row.data_hash,
      data: row.data,
      retention: row.retention ?? undefined,
    })))
  }
  return result
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
    retention: isProtectedRecoveryCopy(copy) ? 'protected' : 'rolling',
  }))
  for (let start = 0; start < rows.length; start += RECOVERY_PAYLOAD_BATCH) {
    const { error } = await requireClient()
      .from('app_recovery_snapshots')
      .upsert(rows.slice(start, start + RECOVERY_PAYLOAD_BATCH), { onConflict: 'user_id,id' })
    if (error) throw new Error(error.message)
  }
}

export async function deleteCloudRecoverySnapshots(userId: string, ids: string[]) {
  if (ids.length === 0) return
  for (let start = 0; start < ids.length; start += 100) {
    const { error } = await requireClient()
      .from('app_recovery_snapshots')
      .delete()
      .eq('user_id', userId)
      .in('id', ids.slice(start, start + 100))
    if (error) throw new Error(error.message)
  }
}

export async function loadCloudRecoveryDeletedIds(userId: string): Promise<string[]> {
  const result: string[] = []
  let cursor = ''
  while (true) {
    let query = requireClient()
      .from('app_recovery_deletions')
      .select('id')
      .eq('user_id', userId)
      .order('id').limit(RECOVERY_PAGE_SIZE)
    if (cursor) query = query.gt('id', cursor)
    const { data, error } = await query

    if (error) throw new Error(error.message)
    const rows = data ?? []
    result.push(...rows.flatMap((row) => (typeof row.id === 'string' ? [row.id] : [])))
    if (rows.length < RECOVERY_PAGE_SIZE) return result
    cursor = rows.at(-1)!.id
  }
}

export async function saveCloudRecoveryDeletedIds(userId: string, ids: string[]) {
  if (ids.length === 0) return
  const deletedAt = new Date().toISOString()
  for (let start = 0; start < ids.length; start += 100) {
    const { error } = await requireClient()
      .from('app_recovery_deletions')
      .upsert(
        ids.slice(start, start + 100).map((id) => ({ user_id: userId, id, deleted_at: deletedAt })),
        { onConflict: 'user_id,id' },
      )
    if (error) throw new Error(error.message)
  }
}
