// Supabase connection for cloud sync.
// These values are safe to ship publicly: the publishable key only grants the
// access allowed by the table's Row Level Security policies (each user can read
// and write only their own row). No secret keys live in the client.
export const SUPABASE_URL = 'https://jrsowjbxenkrmzzknnab.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Gc5rYVcaimTXhAcy4tSwdg_Kk0SlyHJ'

export function isCloudConfigured(): boolean {
  return SUPABASE_URL.startsWith('https://') && SUPABASE_PUBLISHABLE_KEY.length > 0
}
