// ============================================================
// Route Handler: GET /api/customer/loyalty — Phase 6 Migration 4
// ============================================================
// The server-side, session-authenticated loyalty-lookup boundary (RPC-002
// closure). Reads the EXISTING simsim_customer_session cookie (Phase 3B),
// validates it via the EXISTING validate_customer_session RPC (Phase 3A),
// and calls the EXISTING get_customer_loyalty RPC (unchanged business
// logic) with the session's own verified phone — never a client-supplied
// one. All request/response logic lives in handler.js (testable with
// Vitest, no Next.js runtime needed); this file is intentionally thin, same
// shape as checkout/route.ts and verify-otp/route.ts.
// ============================================================

import { supabaseServiceRole } from '@/lib/supabase/serviceRole'
import { buildLoyaltyHandler } from './handler.js'

const db = supabaseServiceRole()
const handle = buildLoyaltyHandler({ db })

export async function GET(req: Request) {
  return handle(req)
}
