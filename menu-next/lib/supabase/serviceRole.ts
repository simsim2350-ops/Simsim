import { createClient } from '@supabase/supabase-js'

// Server-only, service_role client factory — Phase 3B (Customer Session
// issuance). Distinct from supabaseServer() (lib/supabase/server.ts), which
// deliberately stays on the anon/publishable key for read-only catalog data.
// This client is the ONLY thing in menu-next allowed to call
// create_customer_session/validate_customer_session/revoke_customer_session/
// revoke_all_customer_sessions (Phase 3A — all four service_role-only by
// grant) — never imported into any Client Component, never reachable from
// the browser bundle, because SUPABASE_SERVICE_ROLE_KEY is deliberately NOT
// prefixed NEXT_PUBLIC_ (same discipline already documented in
// .env.local.example for PAYMENT_MOYASAR_SECRET_KEY).
//
// Returns null if the secret isn't configured — callers must handle that
// explicitly (fail closed), never fall back to a weaker key.
export function supabaseServiceRole() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
