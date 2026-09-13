import 'dotenv/config'

// All real values come from the environment (.env locally, or real process
// env vars however this agent is actually run) — nothing here is a secret
// or a hard-coded credential. See .env.example for what each one means.
function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name} (see .env.example)`)
  return value
}

export function loadConfig() {
  return {
    supabaseUrl: required('SUPABASE_URL'),
    supabasePublishableKey: required('SUPABASE_PUBLISHABLE_KEY'),
    agentEmail: required('PRINT_AGENT_EMAIL'),
    agentPassword: required('PRINT_AGENT_PASSWORD'),
    restaurantId: required('RESTAURANT_ID'),
    branchId: required('BRANCH_ID'),
    menuBaseUrl: process.env.MENU_BASE_URL || 'https://simsimmenu.com',
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 5000,
    staleAfterSeconds: Number(process.env.STALE_AFTER_SECONDS) || 120,
    maxAttempts: Number(process.env.MAX_ATTEMPTS) || 5,
    // Empty PRINTER_HOST is a deliberate, valid configuration — it selects
    // the mock adapter (see printerAdapter.mjs) rather than failing to
    // start, so the agent can run end-to-end without real hardware.
    printerHost: process.env.PRINTER_HOST || null,
    printerPort: Number(process.env.PRINTER_PORT) || 9100,
  }
}
