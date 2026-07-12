import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../src/cloudConfig.ts'

const response = await fetch(`${SUPABASE_URL}/rest/v1/app_state?select=user_id&limit=1`, {
  headers: {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
  },
})

if (!response.ok) {
  throw new Error(`Anonymous RLS check failed with HTTP ${response.status}.`)
}

const rows = await response.json()
if (!Array.isArray(rows)) {
  throw new Error('Anonymous RLS check returned an invalid response.')
}
if (rows.length !== 0) {
  throw new Error('SECURITY FAILURE: anonymous clients can read app_state rows.')
}

console.log('Supabase RLS check passed: anonymous clients can read zero app_state rows.')
