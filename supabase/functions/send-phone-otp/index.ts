// ============================================================
// Supabase Edge Function: send-phone-otp
// Phase 2 — SMS delivery layer for SimSim's Customer Identity OTP foundation
// (Phase 1: sql/customer_identity_phase1.sql + customer_identity_phase2_otp_
// delivery.sql). Delivery ONLY — SimSim's own database remains the sole
// source of truth for OTP generation/hash/expiry/attempts/rate-limits/
// verification state. Authentica is used purely as the SMS transport.
// ============================================================
// Flow:
//   POST (future frontend, anon key) → validate phone → call
//   request_phone_otp_for_delivery (service_role RPC, Phase 2) → obtain
//   plaintext code inside this trusted execution only → send via Authentica →
//   safe ack to caller. The OTP is never logged, never returned in any HTTP
//   response, never stored in plaintext anywhere.
// ============================================================
// Required Edge Function secrets (Supabase project → Edge Functions → Secrets,
// or `supabase secrets set --project-ref <ref> KEY=value`):
//   SUPABASE_URL               — set automatically by Supabase
//   SUPABASE_SERVICE_ROLE_KEY  — set automatically by Supabase (secret — never
//                                 logged, never reaches the browser; same
//                                 pattern as payment-webhook/index.ts)
//   AUTHENTICA_API_KEY         — NOT set by this code. Must be configured by
//                                 the project owner. See
//                                 AUTHENTICA_SMS_PROVIDER_PHASE2_EXECUTION_REPORT.md
//                                 §11 for the exact command.
// ============================================================
// Custom-OTP support confirmed by owner-provided Authentica documentation
// screenshots (Phase 2.1 final go-live) — see authenticaAdapter.js's
// file-level comment and AUTHENTICA_SMS_PROVIDER_PHASE2_1_FINAL_GO_LIVE_
// REPORT.md §3 for the evidence trail.
// ============================================================
// Phase 2.1 abuse protection (IP-scoped, service_role-only RPC
// check_and_log_otp_ip_request) runs inside handler.js before this function
// ever reaches request_phone_otp_for_delivery or Authentica — see
// sql/customer_identity_phase2_1_ip_abuse_protection.sql.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildHandler } from './handler.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const AUTHENTICA_API_KEY = Deno.env.get('AUTHENTICA_API_KEY') ?? undefined

// service_role client — the only credential permitted to call
// request_phone_otp_for_delivery (Phase 2 grants). Never exposed to the
// browser, never included in any response (same pattern as payment-webhook.ts
// and payment-first-checkout/index.ts, both already in this repo).
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const handle = buildHandler({ db, apiKey: AUTHENTICA_API_KEY })

Deno.serve(handle)
