// ============================================================
// Supabase Edge Function: dashboard-login-guard
// Migration 5.0 — F-01 remediation (SIMSIM_DASHBOARD_LOGIN_SECURITY_AUDIT_
// REPORT.md / SIMSIM_DASHBOARD_LOGIN_HARDENING_PREFLIGHT_REPORT.md).
// ============================================================
// Scope: Dashboard Owner (src/pages/Login.jsx) + Staff (src/pages/
// StaffLogin.jsx) Email+Password login ONLY, both via src/store/
// authStore.js's signIn(). Does NOT touch, call, or depend on the Customer
// OTP/Customer Session system in any way.
//
// Flow: Browser (authStore.signIn) → this Edge Function → atomic rate-limit/
// lockout check (check_dashboard_login_allowed) → if allowed, forward
// credentials to Supabase Auth's own /auth/v1/token?grant_type=password
// (the exact call the browser used to make directly) → record the outcome
// (record_dashboard_login_outcome) → return {access_token, refresh_token}
// on success, or a generic rejection otherwise. The browser then calls
// supabase.auth.setSession({access_token, refresh_token}) to hydrate the
// existing supabase-js client — session/refresh/signOut/onAuthStateChange
// are all untouched by this change.
//
// Required Edge Function secrets — all THREE are set automatically by
// Supabase for every Edge Function in this project (confirmed by this
// repo's own existing supabase/functions/create-platform-admin/index.ts,
// which already relies on all three):
//   SUPABASE_URL               — automatic
//   SUPABASE_ANON_KEY          — automatic
//   SUPABASE_SERVICE_ROLE_KEY  — automatic (secret — never logged, never
//                                 reaches the browser; same pattern as every
//                                 other Edge Function in this repo)
// Optional secret:
//   DASHBOARD_LOGIN_ALLOWED_ORIGINS — comma-separated list of allowed CORS
//                                 origins. Defaults to
//                                 "https://simsimmenu.com" (the real,
//                                 confirmed production origin the Dashboard
//                                 SPA is served from) if not set.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildHandler } from './handler.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGINS = (Deno.env.get('DASHBOARD_LOGIN_ALLOWED_ORIGINS') ?? 'https://simsimmenu.com')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

// service_role client — used ONLY to call the two rate-limit/lockout RPCs
// below (check_dashboard_login_allowed / record_dashboard_login_outcome),
// never for anything else. Never exposed to the browser, never included in
// any response (same pattern as every other service_role client in this
// repo, e.g. payment-webhook/index.ts, send-phone-otp/index.ts).
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const handle = buildHandler({
  db,
  authUrl: SUPABASE_URL,
  anonKey: ANON_KEY,
  allowedOrigins: ALLOWED_ORIGINS,
})

Deno.serve(handle)
