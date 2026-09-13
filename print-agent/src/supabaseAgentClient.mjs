import { createClient } from '@supabase/supabase-js'

// Authenticates as a real, RLS-scoped restaurant_members row — the SAME
// staff-login mechanism src/pages/StaffLogin.jsx already uses
// (signInWithPassword), not a new auth system. This is the answer to
// "design secure authentication without a service-role key in a browser
// bundle": this agent isn't a browser at all, and it never holds anything
// more privileged than an ordinary staff account already can — RLS
// (has_restaurant_access/member_has_branch_access, unchanged) is the same
// real boundary a human staff member is already held to. autoRefreshToken
// is left on so a long-running agent process keeps a valid session without
// re-authenticating on every call.
export async function createAgentClient(config) {
  const client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: true },
  })
  const { error } = await client.auth.signInWithPassword({ email: config.agentEmail, password: config.agentPassword })
  if (error) throw new Error(`Print Agent sign-in failed: ${error.message}`)
  return client
}

export async function claimNextPrintJob(client, config) {
  const { data, error } = await client.rpc('claim_next_print_job', {
    p_restaurant_id: config.restaurantId,
    p_branch_id: config.branchId,
    p_stale_after_seconds: config.staleAfterSeconds,
    p_max_attempts: config.maxAttempts,
  })
  if (error) throw error
  return data || null
}

export async function getPrintJobDocument(client, jobId, token) {
  const { data, error } = await client.rpc('get_print_job_document', { p_print_job_id: jobId, p_token: token })
  if (error) throw error
  return data
}

export async function setPrintJobStatus(client, jobId, token, status, errorMessage) {
  const { data, error } = await client.rpc('set_print_job_status', {
    p_print_job_id: jobId, p_token: token, p_status: status, p_error: errorMessage ?? null,
  })
  if (error) throw error
  return data
}
