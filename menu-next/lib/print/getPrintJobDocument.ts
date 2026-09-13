import { supabaseServer } from '@/lib/supabase/server'
import type { PrintJobDocument } from './types'

// Server-side fetch of a single Print Job's full render data via the
// token-gated get_print_job_document RPC (sql/print_jobs_phase1.sql) — the
// SAME anon-key server client and RPC-based access pattern already used by
// getRestaurantBySlug()/get_orders_status_secure() elsewhere in this app.
// No staff session exists in menu-next; the RPC's own view_token check is
// the entire access boundary here, exactly like orders.order_access_token
// already is for the customer order-status page.
//
// Called from a Server Component (app/print/[jobId]/page.tsx) so the
// document is part of the page's own server-rendered HTML — a plain HTTP
// GET to this route (no client JS) already returns the full, printable
// content. This is deliberate: it is what lets a future Print Agent fetch
// the same URL directly (F.1).
export async function getPrintJobDocument(jobId: string, token: string): Promise<PrintJobDocument | null> {
  const supabase = supabaseServer()
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_print_job_document', {
    p_print_job_id: jobId,
    p_token: token,
  } as never)
  if (error || !data) return null
  return data as PrintJobDocument
}
