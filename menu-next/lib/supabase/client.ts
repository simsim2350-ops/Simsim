'use client'

import { createClient } from '@supabase/supabase-js'

// Browser client factory — same publishable (anon) key as supabaseServer(),
// the same class of key production's own client code (src/lib/supabase.js)
// already exposes to the browser to call create_order directly. Needed only
// now (Phase 4D) because order creation is a client-interactive action (a
// button press) that a Server Component cannot perform. Still never the
// service_role key, still RLS-enforced — create_order itself is SECURITY
// DEFINER (verified in Phase 4C), which is what makes an anon-key RPC call
// safe here, same as it already is in production.
let cached: ReturnType<typeof createClient> | null = null

export function supabaseBrowser() {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return cached
}
