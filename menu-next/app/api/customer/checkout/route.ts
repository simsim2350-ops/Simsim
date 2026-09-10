// ============================================================
// Route Handler: POST /api/customer/checkout — Phase 3C.2
// ============================================================
// The server-side, session-authenticated order-creation boundary. Reads the
// EXISTING simsim_customer_session cookie (Phase 3B), validates it via the
// EXISTING validate_customer_session RPC (Phase 3A), and calls the
// EXISTING create_order / create_order_from_table_qr RPCs (Phase 1 /
// Phase 3C.1) with a server-derived customer_id — never modifies any of
// those. All request/response logic lives in handler.js (testable with
// Vitest, no Next.js runtime needed); this file is intentionally thin,
// same shape as verify-otp/route.ts.
//
// NOT wired into the live checkout UI yet — CheckoutForm.tsx still calls
// create_order/create_order_from_table_qr directly with the anon key,
// unchanged. That migration is Phase 3C.3, not this phase. This endpoint
// exists, and can be tested, without affecting any live customer today.
// ============================================================

import { supabaseServiceRole } from '@/lib/supabase/serviceRole'
import { buildCheckoutHandler } from './handler.js'

const db = supabaseServiceRole()
const handle = buildCheckoutHandler({ db })

export async function POST(req: Request) {
  return handle(req)
}
