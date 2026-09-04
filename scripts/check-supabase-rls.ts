import { readFile } from 'node:fs/promises'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../src/cloudConfig.ts'

const tables = ['app_state', 'app_recovery_snapshots', 'app_recovery_deletions']
const schemaSql = `${await readFile('supabase/app_state.sql', 'utf8')}\n${await readFile('supabase/recovery_snapshots.sql', 'utf8')}`
  .replace(/\s+/g, ' ')
  .toLowerCase()

function requireSchemaRule(rule: string) {
  if (!schemaSql.includes(rule.replace(/\s+/g, ' ').toLowerCase())) {
    throw new Error(`Checked-in Supabase security rule is missing: ${rule}`)
  }
}

for (const table of tables) {
  requireSchemaRule(`alter table public.${table} enable row level security;`)
  requireSchemaRule(`revoke all on public.${table} from anon;`)
}

for (const table of tables) {
  requireSchemaRule(`on public.${table} for select using (auth.uid() = user_id);`)
  requireSchemaRule(`on public.${table} for insert with check (auth.uid() = user_id);`)
  requireSchemaRule(`on public.${table} for update using (auth.uid() = user_id) with check (auth.uid() = user_id);`)
}

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

console.log('Supabase RLS check passed: live anonymous reads return zero rows and checked-in writes are owner-only.')
