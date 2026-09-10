// ============================================================
// Route Handler: POST /api/customer/verify-otp — Phase 3B
// ============================================================
// The first, and so far only, server-side mediation point this app has ever
// had (menu-next previously had zero Route Handlers — every other customer
// interaction is a direct browser→PostgREST call with the anon key). Exists
// specifically because HttpOnly cookies cannot be set by a direct browser→
// PostgREST call — see SIMSIM_PHASE3_CUSTOMER_SESSION_DESIGN_REPORT.md §5.
//
// Calls the EXISTING, UNMODIFIED verify_phone_otp (Phase 1) and
// create_customer_session (Phase 3A) RPCs via a service_role client — never
// modifies either. All request/response logic lives in handler.js (testable
// with Vitest, no Next.js runtime needed); this file is intentionally thin.
// ============================================================
// Required env var (server-only — NOT prefixed NEXT_PUBLIC_, so Next.js
// never includes it in the client bundle):
//   SUPABASE_SERVICE_ROLE_KEY
// Status as of Phase 3B implementation: NOT confirmed configured on Vercel
// for this project — see the execution report. If unset, this endpoint
// fails closed with a generic 500, exactly as it would for any other
// database error — it does not invent a fallback key.
// ============================================================

import { supabaseServiceRole } from '@/lib/supabase/serviceRole'
import { buildVerifyOtpHandler } from './handler.js'

const db = supabaseServiceRole()
const handle = buildVerifyOtpHandler({ db })

export async function POST(req: Request) {
  return handle(req)
}
