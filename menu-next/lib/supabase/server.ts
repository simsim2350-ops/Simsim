import { createClient } from '@supabase/supabase-js'

// Server-only client factory. Publishable (anon) key only — this key is safe by
// Supabase design (RLS-enforced, same class already used by marketing-ssr in this
// repo). A service_role key must never be used here or exposed to the client.
// Called fresh per request (Server Components) — no session persistence needed for
// anonymous, read-only catalog data.
export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
