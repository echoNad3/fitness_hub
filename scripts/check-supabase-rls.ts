import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../src/cloudConfig.ts'

const tables = ['app_state', 'app_recovery_snapshots', 'app_recovery_deletions']

for (const table of tables) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=user_id&limit=1`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
  })

  // Tables with anon privileges revoked return 401/403 before RLS runs. That is an equally valid
  // (and stricter) result: an anonymous client still cannot read a row.
  if (response.status === 401 || response.status === 403) {
    continue
  }
  if (!response.ok) {
    throw new Error(`Anonymous RLS check for ${table} failed with HTTP ${response.status}.`)
  }

  const rows = await response.json()
  if (!Array.isArray(rows)) {
    throw new Error(`Anonymous RLS check for ${table} returned an invalid response.`)
  }
  if (rows.length !== 0) {
    throw new Error(`SECURITY FAILURE: anonymous clients can read ${table} rows.`)
  }
}

console.log('Supabase RLS check passed: anonymous clients can read zero app data or recovery rows.')
